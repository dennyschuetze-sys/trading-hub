"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Field, SelectField } from "@/components/forms/field";
import {
  ACCEPTED_EXTENSIONS,
  ImportError,
  netOf,
  parseImportFile,
  toImportRows,
  type ParseResult,
} from "@/lib/importers";
import { BROKER_TIME_ZONE } from "@/lib/time";
import { ACCOUNT_TYPES, CURRENCIES, MARKETS, PHASES, formatDateTime, formatMoney, pnlClass, type Account } from "@/lib/trading";
import { cn } from "@/lib/utils";
import { createAccountFromForm } from "../accounts/actions";
import { createImportBatch, findExistingExternalIds, finishImport, importTradeChunk, undoImport } from "./actions";

type AccountOption = Pick<Account, "id" | "name" | "currency" | "platform">;

const TIME_ZONES = [
  { value: BROKER_TIME_ZONE, label: "Broker-Server (UTC+2, Sommer UTC+3) – Standard bei MT4/MT5" },
  { value: "Europe/Berlin", label: "Deutschland (Berlin)" },
  { value: "UTC", label: "UTC" },
  { value: "Europe/London", label: "London" },
  { value: "America/New_York", label: "New York" },
];

const SOURCE_LABEL = { mt5: "MetaTrader 5", mt4: "MetaTrader 4", tradingview: "TradingView" } as const;
const NEW_ACCOUNT = "__new__";
const CHUNK = 500;
const PREVIEW_LIMIT = 100;
const EMPTY = new Set<string>();

export function ImportWizard({ accounts }: { accounts: AccountOption[] }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [fileName, setFileName] = useState("");
  const [result, setResult] = useState<ParseResult | null>(null);
  const [timeZone, setTimeZone] = useState(BROKER_TIME_ZONE);
  const [accountId, setAccountId] = useState("");
  const [duplicateCheck, setDuplicateCheck] = useState<{
    accountId: string;
    result: ParseResult;
    ids: Set<string>;
  } | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [done, setDone] = useState<{ imported: number; skipped: number; completed: number; accountId: string } | null>(null);

  const reset = () => {
    setResult(null);
    setFileName("");
    setAccountId("");
    setDuplicateCheck(null);
    setDone(null);
    setProgress(null);
  };

  const readFile = async (file: File) => {
    reset();
    try {
      const parsed = parseImportFile(file.name, new Uint8Array(await file.arrayBuffer()));
      setResult(parsed);
      setFileName(file.name);
      setTimeZone(parsed.defaultTimeZone);
      // Passenden Account vorschlagen: gleicher Name wie in der Datei
      const match = accounts.find((a) => parsed.meta.accountName && a.name === parsed.meta.accountName);
      setAccountId(match?.id ?? (accounts.length ? "" : NEW_ACCOUNT));
    } catch (e) {
      toast.error(e instanceof ImportError ? e.message : "Die Datei konnte nicht gelesen werden.");
      console.error(e);
    }
  };

  // Duplikate prüfen, sobald ein bestehender Account gewählt ist
  const needsCheck = Boolean(result && accountId && accountId !== NEW_ACCOUNT);
  useEffect(() => {
    if (!result || !needsCheck) return;
    let cancelled = false;
    findExistingExternalIds(accountId, result.source, result.trades.map((t) => t.externalId))
      .then((ids) => !cancelled && setDuplicateCheck({ accountId, result, ids: new Set(ids) }))
      .catch(() => {
        if (cancelled) return;
        toast.error("Duplikatprüfung fehlgeschlagen");
        setDuplicateCheck({ accountId, result, ids: new Set() });
      });
    return () => {
      cancelled = true;
    };
  }, [accountId, result, needsCheck]);

  const checkIsCurrent = duplicateCheck?.accountId === accountId && duplicateCheck.result === result;
  const existing = needsCheck && checkIsCurrent ? duplicateCheck.ids : EMPTY;
  const checking = needsCheck && !checkIsCurrent;

  const rows = useMemo(() => (result ? toImportRows(result.trades, timeZone) : []), [result, timeZone]);
  const newTrades = result ? result.trades.filter((t) => !existing.has(t.externalId)) : [];
  // Vorhandene Trades, bei denen fehlende R-Werte ergänzt werden können
  const completable = rows.filter((r) => r.risk_amount != null && existing.has(r.external_id)).length;
  const stats = useMemo(() => {
    if (!result?.trades.length) return null;
    const times = rows.map((r) => r.entry_time).sort();
    return {
      net: Math.round(result.trades.reduce((s, t) => s + netOf(t), 0) * 100) / 100,
      from: times[0],
      to: times[times.length - 1],
      symbols: [...new Set(result.trades.map((t) => t.symbol))],
    };
  }, [result, rows]);

  const currency =
    accounts.find((a) => a.id === accountId)?.currency ??
    result?.meta.currency ??
    "USD";

  const runImport = async (targetAccountId: string) => {
    if (!result) return;
    setProgress(0);
    try {
      const { batchId } = await createImportBatch({
        accountId: targetAccountId,
        source: result.source,
        fileName,
        totalCount: rows.length,
      });
      let imported = 0;
      let skipped = 0;
      let completed = 0;
      for (let i = 0; i < rows.length; i += CHUNK) {
        const r = await importTradeChunk({ batchId, rows: rows.slice(i, i + CHUNK) });
        imported += r.imported;
        skipped += r.skipped;
        completed += r.completed;
        setProgress(Math.min(100, Math.round(((i + CHUNK) / rows.length) * 100)));
      }
      // Ohne neue Trades kein leerer Eintrag im Import-Verlauf
      if (imported === 0) await undoImport(batchId);
      else await finishImport();
      setDone({ imported, skipped, completed, accountId: targetAccountId });
      toast.success(
        imported === 0 && completed > 0 ? `R-Werte für ${completed} Trades ergänzt` : `${imported} Trades importiert`,
      );
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import fehlgeschlagen");
      setProgress(null);
    }
  };

  const onCreateAccountAndImport = async (formData: FormData) => {
    const res = await createAccountFromForm(formData);
    if (res.error || !res.id) {
      toast.error(res.error ?? "Account konnte nicht angelegt werden");
      return;
    }
    await runImport(res.id);
  };

  const importing = progress != null && !done;

  return (
    <div className="grid gap-6">
      {/* Schritt 1: Datei */}
      <Card>
        <CardHeader>
          <CardTitle>1. Datei auswählen</CardTitle>
          <CardDescription>
            MetaTrader 4/5: Bericht der Kontohistorie als XLSX oder HTML · TradingView: Handelsverlauf als CSV
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div
            role="button"
            tabIndex={0}
            onClick={() => !importing && inputRef.current?.click()}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && inputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              const file = e.dataTransfer.files[0];
              if (file && !importing) void readFile(file);
            }}
            className={cn(
              "flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground transition-colors hover:border-foreground/30",
              dragging && "border-foreground/50 bg-muted/50",
            )}
          >
            {result ? <FileSpreadsheet className="size-6" /> : <Upload className="size-6" />}
            <p className="font-medium text-foreground">{fileName || "Datei hierher ziehen oder klicken"}</p>
            <p>{ACCEPTED_EXTENSIONS.join(", ")}</p>
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPTED_EXTENSIONS.join(",")}
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void readFile(file);
                e.target.value = "";
              }}
            />
          </div>
        </CardContent>
      </Card>

      {result && stats && (
        <>
          {/* Schritt 2: Prüfen */}
          <Card>
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-2">
                2. Prüfen <Badge variant="secondary">{SOURCE_LABEL[result.source]}</Badge>
              </CardTitle>
              <CardDescription>
                {[result.meta.company, result.meta.accountName, result.meta.accountNumber && `Konto ${result.meta.accountNumber}`]
                  .filter(Boolean)
                  .join(" · ") || "Keine Kontodaten in der Datei"}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-5">
              <dl className="grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
                <div>
                  <dt className="text-muted-foreground">Trades</dt>
                  <dd className="text-lg font-semibold tabular-nums">{result.trades.length}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Netto P&L</dt>
                  <dd className={`text-lg font-semibold tabular-nums ${pnlClass(stats.net)}`}>
                    {formatMoney(stats.net, currency, true)}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Zeitraum</dt>
                  <dd className="tabular-nums">
                    {formatDateTime(stats.from).split(",")[0]} – {formatDateTime(stats.to).split(",")[0]}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Symbole</dt>
                  <dd className="truncate">{stats.symbols.join(", ")}</dd>
                </div>
              </dl>

              {result.warnings.length > 0 && (
                <div className="grid gap-1 rounded-md border border-warning/40 bg-warning/10 p-3 text-sm">
                  {result.warnings.map((w) => (
                    <p key={w} className="flex items-start gap-2">
                      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" /> {w}
                    </p>
                  ))}
                </div>
              )}

              <Field
                label="Zeitzone der Datei"
                htmlFor="time_zone"
                hint={
                  result.source === "tradingview"
                    ? "TradingView exportiert in der Zeitzone, die in deinem Chart eingestellt ist."
                    : "MetaTrader gibt Zeiten in Serverzeit an. Bei FTMO und den meisten Forex-Brokern passt der Standard."
                }
                className="max-w-lg"
              >
                <SelectField
                  id="time_zone"
                  options={TIME_ZONES}
                  value={timeZone}
                  onChange={(e) => setTimeZone(e.target.value)}
                  disabled={importing}
                />
              </Field>

              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Einstieg (deine Zeit)</TableHead>
                      <TableHead>Symbol</TableHead>
                      <TableHead>Richtung</TableHead>
                      <TableHead className="text-right">Menge</TableHead>
                      <TableHead className="text-right">Netto</TableHead>
                      {accountId && accountId !== NEW_ACCOUNT && <TableHead>Status</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {result.trades.slice(0, PREVIEW_LIMIT).map((t, i) => {
                      const duplicate = existing.has(t.externalId);
                      return (
                        <TableRow key={t.externalId} className={duplicate ? "opacity-50" : ""}>
                          <TableCell className="whitespace-nowrap tabular-nums">{formatDateTime(rows[i].entry_time)}</TableCell>
                          <TableCell className="font-medium">{t.symbol}</TableCell>
                          <TableCell className={t.direction === "long" ? "text-profit" : "text-loss"}>
                            {t.direction === "long" ? "Long" : "Short"}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{t.quantity}</TableCell>
                          <TableCell className={`text-right tabular-nums ${pnlClass(netOf(t))}`}>
                            {formatMoney(netOf(t), currency, true)}
                          </TableCell>
                          {accountId && accountId !== NEW_ACCOUNT && (
                            <TableCell>
                              {duplicate ? <Badge variant="outline">Schon vorhanden</Badge> : <Badge variant="secondary">Neu</Badge>}
                            </TableCell>
                          )}
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
              {result.trades.length > PREVIEW_LIMIT && (
                <p className="text-xs text-muted-foreground">
                  Vorschau zeigt die ersten {PREVIEW_LIMIT} von {result.trades.length} Trades.
                </p>
              )}
            </CardContent>
          </Card>

          {/* Schritt 3: Account & Import */}
          <Card>
            <CardHeader>
              <CardTitle>3. Account wählen & importieren</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-5">
              {done ? (
                <div className="flex flex-col items-start gap-3">
                  <p className="flex items-center gap-2 font-medium">
                    <CheckCircle2 className="size-5 text-profit" />
                    {done.imported} Trades importiert
                    {done.skipped > 0 && `, ${done.skipped} übersprungen (schon vorhanden)`}
                  </p>
                  {done.completed > 0 && (
                    <p className="text-sm text-muted-foreground">
                      Bei {done.completed} vorhandenen Trades wurden Risiko und ursprünglicher Stop Loss ergänzt.
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <Button asChild>
                      <Link href={`/journal?account=${done.accountId}`}>Im Journal ansehen</Link>
                    </Button>
                    <Button variant="outline" onClick={reset}>
                      Weitere Datei importieren
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <Field label="In welchen Account?" htmlFor="target_account" className="max-w-lg">
                    <SelectField
                      id="target_account"
                      options={[
                        ...accounts.map((a) => ({ value: a.id, label: a.name })),
                        { value: NEW_ACCOUNT, label: "+ Neuen Account aus dieser Datei anlegen" },
                      ]}
                      placeholder="Bitte wählen …"
                      value={accountId}
                      onChange={(e) => setAccountId(e.target.value)}
                      disabled={importing}
                    />
                  </Field>

                  {accountId === NEW_ACCOUNT ? (
                    <NewAccountForm result={result} disabled={importing} onSubmit={onCreateAccountAndImport} />
                  ) : (
                    accountId && (
                      <div className="flex flex-wrap items-center gap-3">
                        <Button
                          onClick={() => runImport(accountId)}
                          disabled={importing || checking || (newTrades.length === 0 && completable === 0)}
                        >
                          {importing || checking ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
                          {checking
                            ? "Prüfe Duplikate …"
                            : newTrades.length > 0
                              ? `${newTrades.length} Trades importieren`
                              : completable > 0
                                ? "Fehlende R-Werte ergänzen"
                                : "Alle Trades schon vorhanden"}
                        </Button>
                        {existing.size > 0 && (
                          <span className="text-sm text-muted-foreground">
                            {existing.size} schon vorhanden, werden übersprungen
                            {completable > 0 && " – fehlendes Risiko wird dort ergänzt"}
                          </span>
                        )}
                      </div>
                    )
                  )}

                  {importing && <Progress value={progress} className="max-w-lg" />}
                </>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function NewAccountForm({
  result,
  disabled,
  onSubmit,
}: {
  result: ParseResult;
  disabled: boolean;
  onSubmit: (formData: FormData) => Promise<void>;
}) {
  const isMt = result.source !== "tradingview";
  const [pending, setPending] = useState(false);

  return (
    <form
      className="grid gap-4 rounded-md border p-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setPending(true);
        try {
          await onSubmit(new FormData(e.currentTarget));
        } finally {
          setPending(false);
        }
      }}
    >
      <p className="text-sm text-muted-foreground">
        Vorausgefüllt aus der Datei. Regeln wie Tagesverlust und Drawdown kannst du danach unter Accounts ergänzen.
      </p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Name *" htmlFor="new_name">
          <Input
            id="new_name"
            name="name"
            required
            defaultValue={result.meta.accountName ?? (isMt ? "" : "TradingView Paper")}
          />
        </Field>
        <Field label="Prop Firm / Broker" htmlFor="new_firm">
          <Input
            id="new_firm"
            name="firm"
            defaultValue={result.meta.company?.replace(/\s+(Global Markets\s+)?Ltd\.?$/i, "") ?? (isMt ? "" : "TradingView")}
          />
        </Field>
        <Field label="Kontotyp" htmlFor="new_type">
          <SelectField
            id="new_type"
            name="account_type"
            options={ACCOUNT_TYPES}
            defaultValue={isMt ? "prop" : "demo"}
          />
        </Field>
        <Field label="Markt" htmlFor="new_market">
          <SelectField id="new_market" name="market" options={MARKETS} defaultValue={isMt ? "forex_cfd" : "futures"} />
        </Field>
        <Field label="Phase" htmlFor="new_phase">
          <SelectField id="new_phase" name="phase" options={PHASES} defaultValue={isMt ? "challenge" : "demo"} />
        </Field>
        <Field label="Währung" htmlFor="new_currency">
          <SelectField
            id="new_currency"
            name="currency"
            options={CURRENCIES}
            defaultValue={result.meta.currency && CURRENCIES.includes(result.meta.currency) ? result.meta.currency : "USD"}
          />
        </Field>
        <Field label="Startkapital *" htmlFor="new_balance">
          <Input
            id="new_balance"
            name="starting_balance"
            inputMode="decimal"
            required
            defaultValue={result.meta.startingBalance ?? ""}
          />
        </Field>
      </div>
      <input type="hidden" name="platform" value={result.source} />
      <input type="hidden" name="status" value="active" />
      <input type="hidden" name="drawdown_type" value="static" />
      <input type="hidden" name="notes" value={result.meta.accountNumber ? `Kontonummer ${result.meta.accountNumber}` : ""} />
      <div>
        <Button type="submit" disabled={disabled || pending}>
          {disabled || pending ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
          Account anlegen & {result.trades.length} Trades importieren
        </Button>
      </div>
    </form>
  );
}
