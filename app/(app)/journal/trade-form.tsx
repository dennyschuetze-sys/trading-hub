"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowDownRight, ArrowUpRight, ChevronDown, Copy, Loader2, Save, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ChipSelect } from "@/components/forms/chip-select";
import { ChoiceChips } from "@/components/forms/choice-chips";
import { SelectField } from "@/components/forms/field";
import { LocalDateTimeInput } from "@/components/forms/local-datetime-input";
import { StarRating } from "@/components/forms/star-rating";
import { TagInput } from "@/components/forms/tag-input";
import { useFormAction } from "@/components/forms/use-form-action";
import { YesNoToggle, segmentClass } from "@/components/forms/yes-no-toggle";
import { formatStopSize } from "@/lib/r-multiple";
import { uploadScreenshots } from "@/lib/screenshot-upload";
import { createClient } from "@/lib/supabase/client";
import { documentation, previewTrade, readDraft, type TradeDraft } from "@/lib/trade-preview";
import {
  EMOTIONS,
  HTF_BIASES,
  MARKET_CONTEXTS,
  MISTAKES,
  SESSIONS,
  SETUP_QUALITIES,
  TIMEFRAMES,
  formatMoney,
  formatNumber,
  formatR,
  pnlClass,
  type Account,
  type Trade,
} from "@/lib/trading";
import { cn } from "@/lib/utils";
import { saveTrade } from "./actions";
import { FormSteps } from "./form-steps";
import { PendingScreenshots } from "./pending-screenshots";
import { StrategyChecklist, type StrategyOption } from "./strategy-checklist";
import { SummaryHeadline, TradeSummary, formatDuration } from "./trade-summary";

type AccountOption = Pick<Account, "id" | "name" | "market" | "currency">;
type BacktestSessionOption = { id: string; name: string; market: string; currency: string; strategy_id: string | null; symbols: string[] };

/** Werte, die ein früherer Trade als Vorlage liefert – nie Kurse, Zeiten oder Ergebnis. */
export type TradeTemplate = Pick<
  Trade,
  "account_id" | "symbol" | "strategy_id" | "entry_criterion" | "entry_timeframe" | "htf_bias" | "market_context" | "risk_amount" | "tags"
> & { label: string };

export type QuickActions = {
  lastTrade: { id: string; label: string } | null;
  /** letzter SL-Abstand je Symbol (Kurspunkte) */
  stopDistances: Record<string, number>;
};

type FieldErrors = Partial<Record<"account_id" | "symbol" | "quantity" | "entry_time", string>>;

const FORM_ID = "trade-form";
const SECTIONS = { trade: "bereich-trade", execution: "bereich-ausfuehrung", setup: "bereich-setup", result: "bereich-ergebnis", review: "bereich-bewertung", notes: "bereich-notizen" };

// Einheitliche Eingabefelder auf dieser Seite: gleiche Höhe, türkiser Fokus
const CONTROL_STYLES =
  "[&_[data-slot=input]]:h-10 [&_[data-slot=native-select]]:h-10 [&_[data-slot=input]:focus-visible]:border-profit [&_[data-slot=input]:focus-visible]:ring-profit/20 [&_[data-slot=native-select]:focus-visible]:border-profit [&_[data-slot=native-select]:focus-visible]:ring-profit/20 [&_[data-slot=textarea]:focus-visible]:border-profit [&_[data-slot=textarea]:focus-visible]:ring-profit/20";

function FormCard({ id, number, title, description, children, className }: { id: string; number: string; title: string; description: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <Card id={id} className={cn("scroll-mt-32 gap-0 px-5 py-5 sm:px-6 sm:py-6", className)}>
      <div className="mb-5 flex items-start gap-3">
        <span className="rounded-md bg-profit/12 px-1.5 py-1 text-xs leading-none font-semibold tracking-wider text-profit tabular-nums">{number}</span>
        <div>
          <h2 className="text-[0.8125rem] font-semibold tracking-[0.12em] uppercase">{title}</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
        </div>
      </div>
      {children}
    </Card>
  );
}

function F({
  label,
  htmlFor,
  required,
  hint,
  error,
  className,
  children,
}: {
  label: string;
  htmlFor: string;
  required?: boolean;
  hint?: React.ReactNode;
  error?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("grid min-w-0 content-start gap-1.5", className)}>
      <Label htmlFor={htmlFor} id={`${htmlFor}-label`}>
        {label}
        {required && (
          <span className="text-profit" aria-hidden>
            *
          </span>
        )}
      </Label>
      {children}
      {error ? (
        <p id={`${htmlFor}-error`} className="text-xs font-medium text-loss" role="alert">
          {error}
        </p>
      ) : (
        hint && <p className="text-xs text-muted-foreground">{hint}</p>
      )}
    </div>
  );
}

const Eyebrow = ({ children }: { children: React.ReactNode }) => (
  <p className="text-[0.6875rem] font-medium tracking-[0.08em] text-muted-foreground uppercase">{children}</p>
);

function Computed({ label, value, hint, className }: { label: string; value: string; hint: string; className?: string }) {
  return (
    <div className="grid content-start gap-1 bg-card px-4 py-3.5" style={{ backgroundImage: "linear-gradient(color-mix(in oklch, var(--profit) 5%, transparent), transparent)" }}>
      <p className="flex items-center gap-1.5 text-[0.6875rem] font-medium tracking-[0.08em] text-muted-foreground uppercase">
        {label}
        <span className="rounded bg-profit/12 px-1 py-px text-[0.625rem] tracking-wider text-profit">Auto</span>
      </p>
      <p className={cn("text-2xl font-semibold tabular-nums", value === "—" ? "text-muted-foreground" : className)}>{value}</p>
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

export function TradeForm({
  accounts,
  strategies,
  trade,
  checkedItems = [],
  defaultAccountId,
  backtestSession,
  userId,
  heading,
  template,
  quickActions,
  symbols = [],
}: {
  accounts: AccountOption[];
  strategies: StrategyOption[];
  trade?: Trade;
  checkedItems?: string[];
  defaultAccountId?: string;
  /** Gesetzt = Backtest-Trade dieser Session statt Live-Trade eines Accounts */
  backtestSession?: BacktestSessionOption;
  userId: string;
  heading: { eyebrow: string; title: string; description: string };
  template?: TradeTemplate | null;
  quickActions?: QuickActions;
  /** zuletzt gehandelte Symbole für die Autovervollständigung */
  symbols?: string[];
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [attempted, setAttempted] = useState(false);

  const t = trade;
  const v = trade ?? template ?? undefined;
  const [direction, setDirection] = useState(t?.direction ?? "long");
  const [status, setStatus] = useState(t?.status ?? "closed");
  const [accountId, setAccountId] = useState(t?.account_id ?? template?.account_id ?? defaultAccountId ?? accounts[0]?.id);
  const [now] = useState(() => new Date().toISOString());
  const account = accounts.find((a) => a.id === accountId);
  const isFutures = (backtestSession?.market ?? account?.market) === "futures";
  const currency = backtestSession?.currency ?? account?.currency ?? "USD";
  const num = (value: number | null | undefined) => (value == null ? "" : String(value));

  // Formularstand für Zusammenfassung, Berechnungen und Fortschritt
  const [draft, setDraft] = useState<TradeDraft>(() => readDraft(new FormData()));
  const [requiredOk, setRequiredOk] = useState(false);
  const validate = useCallback(
    (d: TradeDraft, fd: FormData): FieldErrors => {
      const next: FieldErrors = {};
      if (!backtestSession && !String(fd.get("account_id") ?? "")) next.account_id = "Account ist erforderlich.";
      if (!d.symbol) next.symbol = "Symbol ist erforderlich.";
      if (!String(fd.get("quantity") ?? "").trim()) next.quantity = `${isFutures ? "Kontrakte sind" : "Lots sind"} erforderlich.`;
      else if (d.quantity == null || d.quantity <= 0) next.quantity = "Bitte eine Zahl größer als 0 eingeben.";
      if (!d.entryTime) next.entry_time = "Einstiegszeit ist erforderlich.";
      return next;
    },
    [backtestSession, isFutures],
  );
  const refresh = useCallback(() => {
    requestAnimationFrame(() => {
      if (!formRef.current) return;
      const fd = new FormData(formRef.current);
      const d = readDraft(fd);
      const found = validate(d, fd);
      setDraft(d);
      setRequiredOk(Object.keys(found).length === 0);
      if (attempted) setErrors(found);
    });
  }, [attempted, validate]);
  // Nach dem ersten Rendern: Zeiten setzt LocalDateTimeInput erst im Browser
  useEffect(() => {
    refresh();
  }, [refresh, status, direction, files.length]);

  const { state, onSubmit, pending } = useFormAction(saveTrade.bind(null, trade?.id ?? null), (formData) => {
    const d = readDraft(formData);
    const found = validate(d, formData);
    setAttempted(true);
    setErrors(found);
    const first = Object.keys(found)[0];
    if (first) {
      document.getElementById(first)?.focus();
      document.getElementById(first)?.scrollIntoView({ behavior: "smooth", block: "center" });
      toast.error("Bitte die markierten Pflichtfelder ausfüllen.");
      return false;
    }
    // Zeiten aus dem Browser (lokale Zeitzone) als eindeutige UTC-Zeit an den Server schicken
    for (const key of ["entry_time", "exit_time"]) {
      const local = String(formData.get(key) ?? "");
      formData.set(key, local ? new Date(local).toISOString() : "");
    }
    if (files.length) formData.set("after_save", "upload");
  });

  // Gespeichert mit vorgemerkten Screenshots: jetzt hochladen, dann zur Detailseite
  useEffect(() => {
    const tradeId = state.id;
    if (!tradeId) return;
    let cancelled = false;
    (async () => {
      setUploading(true);
      try {
        await uploadScreenshots(createClient(), { userId, tradeId, files });
        toast.success(files.length === 1 ? "Screenshot hochgeladen" : `${files.length} Screenshots hochgeladen`);
      } catch (e) {
        toast.error(`Trade gespeichert, aber der Screenshot-Upload ist fehlgeschlagen: ${e instanceof Error ? e.message : "Unbekannter Fehler"}. Du kannst ihn auf der Detailseite erneut hinzufügen.`);
      } finally {
        if (!cancelled) router.push(`/journal/${tradeId}`);
      }
    })();
    return () => {
      cancelled = true;
    };
    // Nur einmal je gespeichertem Trade
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.id]);

  const busy = pending || uploading || Boolean(state.id);
  const preview = previewTrade(draft);
  const selectedStrategy = strategies.find((s) => s.id === draft.strategyId);
  const doc = documentation(draft, { criteriaAvailable: Boolean(selectedStrategy?.entryCriteria.length), screenshots: files.length });
  const missing = new Set(doc.missing);
  const stepDone = (labels: string[]) => labels.every((l) => !missing.has(l));
  const steps = [
    { label: "Trade", sections: [SECTIONS.trade, SECTIONS.execution], done: requiredOk && stepDone(["Einstiegskurs", "Ausstiegskurs", "Stop Loss", "Take Profit", "Bester Kurs", "Schlechtester Kurs", "Breakeven", "Teilgewinne"]) },
    { label: "Setup & Kontext", sections: [SECTIONS.setup], done: stepDone(["Timeframe", "HTF-Trend", "Marktkontext", "Strategie", "Einstiegskriterium"]) },
    { label: "Risiko & Ergebnis", sections: [SECTIONS.result], done: stepDone(["Ergebnis", "Risiko"]) },
    { label: "Psychologie", sections: [SECTIONS.review, SECTIONS.notes], done: stepDone(["Setup-Qualität", "Emotion", "Plan eingehalten", "Bewertung", "Notizen", "Lessons Learned"]) },
  ];

  const lastStop = draft.symbol ? quickActions?.stopDistances[draft.symbol] : undefined;
  const applyLastStop = () => {
    const form = formRef.current;
    if (!form || lastStop == null || draft.entryPrice == null) return;
    const stop = draft.direction === "long" ? draft.entryPrice - lastStop : draft.entryPrice + lastStop;
    const input = form.elements.namedItem("stop_loss") as HTMLInputElement | null;
    if (input) input.value = String(Math.round(stop * 100000) / 100000);
    refresh();
  };

  const cancelHref = t ? `/journal/${t.id}` : backtestSession ? `/backtesting/${backtestSession.id}` : "/journal";
  const errorProps = (key: keyof FieldErrors) =>
    errors[key] ? { "aria-invalid": true, "aria-describedby": `${key}-error` } : {};
  const saveLabel = uploading ? "Screenshots werden hochgeladen …" : pending || state.id ? "Speichern …" : "Speichern";

  return (
    <div className="grid gap-5">
      {/* Kopfbereich */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-semibold tracking-[0.14em] text-profit uppercase">{heading.eyebrow}</p>
          <h1 className="mt-0.5 text-2xl font-semibold tracking-tight sm:text-[1.75rem]">{heading.title}</h1>
          <p className="text-sm text-muted-foreground">{heading.description}</p>
        </div>
        <Button type="submit" form={FORM_ID} disabled={busy} className="bg-profit text-background hover:bg-profit/90">
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          {saveLabel}
        </Button>
      </div>

      {template && (
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-profit/30 bg-profit/5 px-3 py-2 text-sm">
          <Copy className="size-4 text-profit" aria-hidden />
          <span>
            Vorlage übernommen: <span className="font-medium">{template.label}</span> – Kurse, Zeiten und Ergebnis sind leer.
          </span>
          <Link href="/journal/new" className="ml-auto text-muted-foreground underline underline-offset-4 hover:text-foreground">
            Leeres Formular
          </Link>
        </p>
      )}

      <FormSteps steps={steps} percent={doc.percent} />

      {/* Mobile/Tablet: einklappbare Zusammenfassung oben */}
      <details className="group rounded-xl border bg-card xl:hidden">
        <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3">
          <div className="min-w-0 flex-1">
            <SummaryHeadline draft={draft} preview={preview} currency={currency} />
          </div>
          <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden />
          <span className="sr-only">Zusammenfassung anzeigen</span>
        </summary>
        <div className="border-t px-4 py-3">
          <TradeSummary draft={draft} preview={preview} currency={currency} quantityUnit={isFutures ? "Kontrakte" : "Lots"} />
        </div>
      </details>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_19rem]">
        <form
          id={FORM_ID}
          ref={formRef}
          onSubmit={onSubmit}
          onInput={refresh}
          onChange={refresh}
          noValidate
          className={cn("grid min-w-0 gap-4", CONTROL_STYLES)}
        >
          {/* 01 TRADE */}
          <FormCard id={SECTIONS.trade} number="01" title="Trade" description="Was hast du getradet?">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {backtestSession ? (
                <F label="Backtest-Session" htmlFor="backtest_session_name">
                  <input type="hidden" name="backtest_session_id" value={backtestSession.id} />
                  <Input id="backtest_session_name" value={backtestSession.name} readOnly aria-readonly />
                </F>
              ) : (
                <F label="Account" htmlFor="account_id" required error={errors.account_id}>
                  <SelectField
                    id="account_id"
                    options={accounts.map((a) => ({ value: a.id, label: a.name }))}
                    value={accountId}
                    onChange={(e) => setAccountId(e.target.value)}
                    {...errorProps("account_id")}
                  />
                </F>
              )}
              <F label="Symbol" htmlFor="symbol" required error={errors.symbol} hint={isFutures ? "z. B. NQ, ES, MNQ, GC" : "z. B. EURUSD, XAUUSD, US30"}>
                <Input
                  id="symbol"
                  name="symbol"
                  list="symbol-suggestions"
                  autoComplete="off"
                  defaultValue={v?.symbol ?? (backtestSession?.symbols.length === 1 ? backtestSession.symbols[0] : undefined)}
                  className="font-semibold tracking-wide uppercase"
                  {...errorProps("symbol")}
                />
                <datalist id="symbol-suggestions">
                  {[...new Set([...(backtestSession?.symbols ?? []), ...symbols])].map((s) => (
                    <option key={s} value={s} />
                  ))}
                </datalist>
              </F>
              <F label="Richtung" htmlFor="direction">
                <input type="hidden" name="direction" value={direction} />
                <div className="grid grid-cols-2 gap-2" id="direction" role="radiogroup" aria-labelledby="direction-label">
                  {(["long", "short"] as const).map((d) => {
                    const Arrow = d === "long" ? ArrowUpRight : ArrowDownRight;
                    return (
                      <button key={d} type="button" role="radio" aria-checked={direction === d} onClick={() => setDirection(d)} className={cn(segmentClass(direction === d), "h-10")}>
                        <Arrow className="size-4" aria-hidden />
                        {d === "long" ? "Long" : "Short"}
                      </button>
                    );
                  })}
                </div>
              </F>
              <F label="Status" htmlFor="status">
                <input type="hidden" name="status" value={status} />
                <div className="grid grid-cols-2 gap-2" id="status" role="radiogroup" aria-labelledby="status-label">
                  {[
                    { value: "closed", label: "Geschlossen" },
                    { value: "open", label: "Offen" },
                  ].map((s) => (
                    <button key={s.value} type="button" role="radio" aria-checked={status === s.value} onClick={() => setStatus(s.value)} className={cn(segmentClass(status === s.value), "h-10")}>
                      {s.label}
                    </button>
                  ))}
                </div>
              </F>
              <F label="Einstieg" htmlFor="entry_time" required error={errors.entry_time}>
                <LocalDateTimeInput id="entry_time" name="entry_time" iso={t?.entry_time ?? now} {...errorProps("entry_time")} />
              </F>
              {status === "closed" && (
                <F label="Ausstieg" htmlFor="exit_time" hint={formatDuration(preview.holdMinutes) ? `Haltedauer ${formatDuration(preview.holdMinutes)}` : undefined}>
                  <LocalDateTimeInput id="exit_time" name="exit_time" iso={t?.exit_time} />
                </F>
              )}
            </div>
          </FormCard>

          {/* 02 AUSFÜHRUNG */}
          <FormCard id={SECTIONS.execution} number="02" title="Ausführung" description="Wie hast du ihn ausgeführt? Ein- und Ausstieg, Stop und Ziel.">
            <div className="grid gap-4 lg:grid-cols-[11rem_minmax(0,1fr)]">
              <F label={isFutures ? "Kontrakte" : "Lots"} htmlFor="quantity" required error={errors.quantity}>
                <Input id="quantity" name="quantity" inputMode="decimal" defaultValue={num(t?.quantity)} {...errorProps("quantity")} />
              </F>
              <div className="grid gap-3 rounded-xl border bg-foreground/[0.02] p-3.5">
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  <F label="Entry" htmlFor="entry_price">
                    <Input id="entry_price" name="entry_price" inputMode="decimal" defaultValue={num(t?.entry_price)} />
                  </F>
                  {status === "closed" ? (
                    <F label="Exit" htmlFor="exit_price">
                      <Input id="exit_price" name="exit_price" inputMode="decimal" defaultValue={num(t?.exit_price)} />
                    </F>
                  ) : (
                    <div className="grid content-start gap-1.5">
                      <Label>Exit</Label>
                      <p className="flex h-10 items-center text-sm text-muted-foreground">Trade offen</p>
                    </div>
                  )}
                  <F label="Stop Loss" htmlFor="stop_loss">
                    <Input id="stop_loss" name="stop_loss" inputMode="decimal" defaultValue={num(t?.stop_loss)} />
                  </F>
                  <F label="Take Profit" htmlFor="take_profit">
                    <Input id="take_profit" name="take_profit" inputMode="decimal" defaultValue={num(t?.take_profit)} />
                  </F>
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span>
                    SL-Größe <span className="font-semibold text-foreground tabular-nums">{formatStopSize(preview.stop) ?? "—"}</span>
                  </span>
                  <span>
                    Geplantes CRV{" "}
                    <span className="font-semibold text-foreground tabular-nums">{preview.plannedRR == null ? "—" : `1 : ${formatNumber(preview.plannedRR, 2)}`}</span>
                  </span>
                  {!t && lastStop != null && draft.entryPrice != null && draft.stopLoss == null && (
                    <button type="button" onClick={applyLastStop} className="ml-auto inline-flex items-center gap-1 text-profit hover:underline">
                      <Sparkles className="size-3.5" aria-hidden /> Letzten SL-Abstand übernehmen ({formatNumber(lastStop)})
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="mt-6 mb-3 flex items-center gap-3">
              <Eyebrow>Trade Excursion</Eyebrow>
              <span className="h-px flex-1 bg-border" aria-hidden />
              <span className="hidden text-xs text-muted-foreground sm:inline">Wie weit lief der Kurs für und gegen dich?</span>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <F
                label="Bester Kurs im Trade"
                htmlFor="best_price"
                hint={
                  <>
                    {direction === "long" ? "Hoch" : "Tief"} im Trade · max. möglich{" "}
                    <span className="font-semibold text-profit tabular-nums">{preview.mfeR == null ? "—" : formatR(preview.mfeR)}</span>
                  </>
                }
              >
                <Input id="best_price" name="best_price" inputMode="decimal" defaultValue={num(t?.best_price)} />
              </F>
              <F
                label="Schlechtester Kurs im Trade"
                htmlFor="worst_price"
                hint={
                  <>
                    {direction === "long" ? "Tief" : "Hoch"} im Trade · Gegenlauf{" "}
                    <span className="font-semibold text-foreground tabular-nums">{preview.maeR == null ? "—" : `${formatNumber(-preview.maeR, 2)} R`}</span>
                  </>
                }
              >
                <Input id="worst_price" name="worst_price" inputMode="decimal" defaultValue={num(t?.worst_price)} />
              </F>
              {status === "closed" && (
                <>
                  <F label="SL auf Breakeven gezogen?" htmlFor="moved_to_breakeven">
                    <YesNoToggle name="moved_to_breakeven" defaultValue={t?.moved_to_breakeven} labelledBy="moved_to_breakeven-label" onChange={refresh} />
                  </F>
                  <F label="Teilgewinne genommen?" htmlFor="partial_close">
                    <YesNoToggle name="partial_close" defaultValue={t?.partial_close} labelledBy="partial_close-label" onChange={refresh} />
                  </F>
                </>
              )}
            </div>
          </FormCard>

          {/* 03 SETUP & KONTEXT */}
          <FormCard id={SECTIONS.setup} number="03" title="Setup & Kontext" description="Warum hast du ihn genommen – Timeframe, Marktumfeld und Setup.">
            <div className="grid gap-4 sm:grid-cols-3">
              <F label="Einstiegs-Timeframe" htmlFor="entry_timeframe">
                <SelectField id="entry_timeframe" options={TIMEFRAMES} placeholder="–" defaultValue={v?.entry_timeframe ?? ""} />
              </F>
              <F label="Übergeordneter Trend (HTF)" htmlFor="htf_bias">
                <SelectField id="htf_bias" options={HTF_BIASES} placeholder="–" defaultValue={v?.htf_bias ?? ""} />
              </F>
              <F label="Marktkontext" htmlFor="market_context">
                <SelectField id="market_context" options={MARKET_CONTEXTS} placeholder="–" defaultValue={v?.market_context ?? ""} />
              </F>
            </div>
            <div className="mt-5">
              <StrategyChecklist
                strategies={strategies}
                defaultStrategyId={t ? t.strategy_id : (template?.strategy_id ?? backtestSession?.strategy_id)}
                defaultCriterion={v?.entry_criterion}
                defaultChecked={checkedItems}
                isNew={!t && !template?.strategy_id}
                onChange={refresh}
              />
            </div>
          </FormCard>

          {/* 04 ERGEBNIS & RISIKO */}
          <FormCard id={SECTIONS.result} number="04" title="Ergebnis & Risiko" description="Was ist dabei herausgekommen? Kosten wie Kommission und Swap mit Minus eintragen.">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <F label="Gewinn/Verlust (brutto)" htmlFor="pnl" hint="Verlust mit Minus, z. B. -250">
                <Input id="pnl" name="pnl" inputMode="decimal" defaultValue={num(t?.pnl)} />
              </F>
              <F label="Kommission" htmlFor="commission">
                <Input id="commission" name="commission" inputMode="decimal" defaultValue={num(t?.commission || null)} />
              </F>
              <F label="Swap" htmlFor="swap">
                <Input id="swap" name="swap" inputMode="decimal" defaultValue={num(t?.swap || null)} />
              </F>
              <F label="Geplantes Risiko (Betrag)" htmlFor="risk_amount" hint="Leer = aus Einstieg, SL und P&L berechnet">
                <Input id="risk_amount" name="risk_amount" inputMode="decimal" defaultValue={num(v?.risk_amount)} />
              </F>
            </div>
            <div className="mt-5 grid gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-3">
              <Computed
                label="Netto P&L"
                value={preview.netPnl == null ? "—" : formatMoney(preview.netPnl, currency, true)}
                className={pnlClass(preview.netPnl)}
                hint={preview.netPnl == null ? "Brutto-Ergebnis eintragen" : preview.costs ? `Brutto ${formatMoney(draft.pnl, currency)} + Kosten ${formatMoney(preview.costs, currency)}` : "Keine Kosten eingetragen"}
              />
              <Computed
                label="R-Multiple"
                value={preview.rMultiple == null ? "—" : formatR(preview.rMultiple)}
                className={pnlClass(preview.rMultiple)}
                hint={
                  preview.rMultiple == null
                    ? "Risiko oder Einstieg, SL und Exit eintragen"
                    : `Netto ÷ ${preview.riskEstimated ? "berechnetes" : "geplantes"} Risiko ${formatMoney(preview.risk, currency)}`
                }
              />
              <Computed
                label="Kosten in R"
                value={preview.costsR == null ? "—" : `${formatNumber(preview.costsR, 2)} R`}
                hint="Kommission + Swap im Verhältnis zum Risiko"
              />
            </div>
          </FormCard>

          {/* 05 BEWERTUNG & PSYCHOLOGIE */}
          <FormCard
            id={SECTIONS.review}
            number="05"
            title="Bewertung & Psychologie"
            description={
              <>
                Wie gut war der Trade – <span className="font-medium text-foreground">unabhängig vom Ergebnis?</span>
              </>
            }
          >
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1fr)]">
              <F label="Setup-Qualität" htmlFor="setup_quality">
                <ChoiceChips name="setup_quality" options={SETUP_QUALITIES} defaultValue={t?.setup_quality} variant="segment" labelledBy="setup_quality-label" onChange={refresh} />
              </F>
              <F label="Plan eingehalten?" htmlFor="followed_plan">
                <YesNoToggle name="followed_plan" defaultValue={t?.followed_plan} labelledBy="followed_plan-label" size="lg" onChange={refresh} />
              </F>
              <F label="Bewertung" htmlFor="rating">
                <StarRating name="rating" defaultValue={t?.rating} labelledBy="rating-label" onChange={refresh} />
              </F>
            </div>
            <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
              <F label="Session" htmlFor="session" hint="Leer = automatisch aus der Einstiegszeit">
                <SelectField id="session" options={SESSIONS} placeholder="Automatisch" defaultValue={t?.session ?? ""} />
              </F>
              <F label="Emotion" htmlFor="emotion">
                <ChoiceChips name="emotion" options={EMOTIONS} defaultValue={t?.emotion} labelledBy="emotion-label" onChange={refresh} />
              </F>
            </div>
            <F label="Tags" htmlFor="tags" className="mt-5">
              <TagInput id="tags" name="tags" defaultValue={v?.tags} onChange={refresh} />
            </F>
            <div
              className={cn(
                "mt-5 grid gap-3 rounded-xl border p-4 transition-colors",
                draft.followedPlan === false ? "border-loss/40 bg-loss/[0.06]" : "border-loss/15 bg-loss/[0.025]",
              )}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <Label id="mistakes-label">Fehler</Label>
                <span className="text-xs text-muted-foreground">
                  {draft.followedPlan === false ? "Plan nicht eingehalten – was ist passiert?" : "Mehrfachauswahl"}
                </span>
              </div>
              <div role="group" aria-labelledby="mistakes-label">
                <ChipSelect name="mistakes" options={MISTAKES} defaultValue={t?.mistakes} onChange={refresh} />
              </div>
            </div>
          </FormCard>

          {/* 06 NOTIZEN & LERNEN */}
          <FormCard id={SECTIONS.notes} number="06" title="Notizen & Lernen" description="Was lernst du daraus?">
            <div className="grid gap-4 md:grid-cols-2">
              <F label="Notizen" htmlFor="notes" hint="Warum bin ich eingestiegen? Was ist passiert?">
                <Textarea id="notes" name="notes" rows={6} defaultValue={t?.notes ?? ""} />
              </F>
              <F label="Lessons Learned" htmlFor="lessons" hint="Was mache ich beim nächsten Mal anders?">
                <Textarea id="lessons" name="lessons" rows={6} defaultValue={t?.lessons ?? ""} />
              </F>
            </div>
          </FormCard>

          {/* Speichern bleibt beim Scrollen erreichbar */}
          <div className="sticky bottom-0 z-20 -mx-1 flex flex-wrap items-center justify-between gap-3 rounded-t-xl border-t bg-background/90 px-3 py-3 backdrop-blur">
            <p className={cn("text-xs", state.error ? "font-medium text-loss" : "text-muted-foreground")} role={state.error ? "alert" : undefined}>
              {state.error ??
                (requiredOk
                  ? `Pflichtfelder ausgefüllt${files.length ? ` · ${files.length} Screenshot${files.length === 1 ? "" : "s"} vorgemerkt` : ""}`
                  : `Pflichtfelder: ${backtestSession ? "" : "Account, "}Symbol, ${isFutures ? "Kontrakte" : "Lots"}, Einstieg`)}
            </p>
            <div className="flex gap-2">
              <Button variant="ghost" asChild>
                <Link href={cancelHref}>Abbrechen</Link>
              </Button>
              <Button type="submit" disabled={busy} className="bg-profit text-background hover:bg-profit/90">
                {busy ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                {saveLabel}
              </Button>
            </div>
          </div>
        </form>

        <aside className="grid content-start gap-4 xl:sticky xl:top-32" aria-label="Zusammenfassung und Extras">
          <Card className="hidden gap-0 p-4 xl:flex">
            <div className="mb-3 flex items-center justify-between">
              <Eyebrow>Trade-Zusammenfassung</Eyebrow>
              <span className="text-xs text-muted-foreground">live</span>
            </div>
            <TradeSummary draft={draft} preview={preview} currency={currency} quantityUnit={isFutures ? "Kontrakte" : "Lots"} />
          </Card>

          <Card className="gap-2 p-4">
            <div className="flex items-center justify-between">
              <Eyebrow>Dokumentation</Eyebrow>
              <span className="text-sm font-semibold tabular-nums">{doc.percent} %</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-foreground/[0.06]" aria-hidden>
              <div className="h-full rounded-full bg-profit transition-[width]" style={{ width: `${doc.percent}%` }} />
            </div>
            <p className="text-xs text-muted-foreground">
              {doc.missing.length ? `Offen: ${doc.missing.slice(0, 3).join(", ")}${doc.missing.length > 3 ? ` +${doc.missing.length - 3}` : ""}` : "Vollständig dokumentiert."}
            </p>
          </Card>

          <Card className="gap-3 p-4">
            <Eyebrow>Chart-Screenshot</Eyebrow>
            <PendingScreenshots files={files} onChange={setFiles} disabled={busy} />
          </Card>

          {quickActions && (quickActions.lastTrade || template) && (
            <Card className="gap-2 p-4">
              <Eyebrow>Schnell-Aktionen</Eyebrow>
              {quickActions.lastTrade && (
                <Link
                  href={`/journal/new?vorlage=${quickActions.lastTrade.id}`}
                  className="flex items-center gap-2.5 rounded-lg bg-foreground/[0.04] px-3 py-2.5 text-sm transition-colors hover:bg-foreground/[0.07]"
                >
                  <Copy className="size-4 shrink-0 text-profit" aria-hidden />
                  <span className="min-w-0">
                    <span className="block font-medium">Letzten Trade als Vorlage</span>
                    <span className="block truncate text-xs text-muted-foreground">{quickActions.lastTrade.label}</span>
                  </span>
                </Link>
              )}
              <p className="text-xs text-muted-foreground">Übernimmt Account, Symbol, Setup, Risiko und Tags – keine Kurse, Zeiten oder Ergebnisse.</p>
            </Card>
          )}
        </aside>
      </div>
    </div>
  );
}
