"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Image as ImageIcon, Loader2, ShieldAlert, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { SelectField } from "@/components/forms/field";
import { SETUP_QUALITIES, formatDateTime, formatMoney, formatNumber, formatR, pnlClass } from "@/lib/trading";
import { bulkUpdateTrades } from "./actions";

export type JournalRow = {
  id: string;
  symbol: string;
  direction: string;
  status: string;
  entry_time: string;
  quantity: number;
  net_pnl: number | null;
  r_multiple: number | null;
  setup_quality: string | null;
  mistakes: string[];
  accountName: string;
  currency: string;
  strategyName: string | null;
  screenshots: number;
  /** Verstöße gegen persönliche Regeln (Beschreibungen) */
  violations: string[];
};

const UNCHANGED = "__unchanged__";
const NONE = "__none__";

export function JournalTable({ rows, strategies }: { rows: JournalRow[]; strategies: { id: string; name: string }[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [strategy, setStrategy] = useState(UNCHANGED);
  const [quality, setQuality] = useState(UNCHANGED);
  const [pending, startTransition] = useTransition();

  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const apply = () =>
    startTransition(async () => {
      try {
        const { updated } = await bulkUpdateTrades({
          tradeIds: [...selected],
          strategyId: strategy === UNCHANGED ? undefined : strategy === NONE ? null : strategy,
          setupQuality: quality === UNCHANGED ? undefined : quality === NONE ? null : quality,
        });
        toast.success(`${updated} ${updated === 1 ? "Trade" : "Trades"} aktualisiert`);
        setSelected(new Set());
        setStrategy(UNCHANGED);
        setQuality(UNCHANGED);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Aktualisieren fehlgeschlagen");
      }
    });

  return (
    <>
      {selected.size > 0 && (
        <div className="sticky top-16 z-20 mb-3 flex flex-wrap items-center gap-2 rounded-lg border bg-popover p-3 shadow-md">
          <span className="text-sm font-medium">{selected.size} ausgewählt</span>
          <SelectField
            id="bulk_strategy"
            aria-label="Strategie zuweisen"
            options={[
              { value: UNCHANGED, label: "Strategie: nicht ändern" },
              { value: NONE, label: "Strategie entfernen" },
              ...strategies.map((s) => ({ value: s.id, label: `Strategie: ${s.name}` })),
            ]}
            value={strategy}
            onChange={(e) => setStrategy(e.target.value)}
            className="w-full sm:w-60"
          />
          <SelectField
            id="bulk_quality"
            aria-label="Setup-Qualität setzen"
            options={[
              { value: UNCHANGED, label: "Setup-Qualität: nicht ändern" },
              { value: NONE, label: "Setup-Qualität entfernen" },
              ...SETUP_QUALITIES.map((q) => ({ value: q, label: `Setup-Qualität: ${q}` })),
            ]}
            value={quality}
            onChange={(e) => setQuality(e.target.value)}
            className="w-full sm:w-56"
          />
          <Button onClick={apply} disabled={pending || (strategy === UNCHANGED && quality === UNCHANGED)}>
            {pending && <Loader2 className="size-4 animate-spin" />} Übernehmen
          </Button>
          <Button variant="ghost" size="icon" onClick={() => setSelected(new Set())} aria-label="Auswahl aufheben">
            <X className="size-4" />
          </Button>
        </div>
      )}

      <Card className="py-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8">
                  <input
                    type="checkbox"
                    aria-label="Alle auf dieser Seite auswählen"
                    checked={allSelected}
                    onChange={() => setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)))}
                    className="size-4 accent-foreground"
                  />
                </TableHead>
                <TableHead>Datum</TableHead>
                <TableHead>Symbol</TableHead>
                <TableHead>Richtung</TableHead>
                <TableHead className="hidden md:table-cell">Account</TableHead>
                <TableHead className="hidden xl:table-cell">Strategie</TableHead>
                <TableHead className="hidden text-right md:table-cell">Menge</TableHead>
                <TableHead className="text-right">Netto P&L</TableHead>
                <TableHead className="text-right">R</TableHead>
                <TableHead className="hidden lg:table-cell">Setup</TableHead>
                <TableHead className="hidden lg:table-cell">Fehler</TableHead>
                <TableHead className="w-12">
                  <span className="sr-only">Hinweise</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((t) => (
                <TableRow key={t.id} className="relative" data-state={selected.has(t.id) ? "selected" : undefined}>
                  <TableCell className="relative z-10">
                    <input
                      type="checkbox"
                      aria-label={`${t.symbol} vom ${formatDateTime(t.entry_time)} auswählen`}
                      checked={selected.has(t.id)}
                      onChange={() => toggle(t.id)}
                      className="size-4 accent-foreground"
                    />
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    <Link href={`/journal/${t.id}`} className="after:absolute after:inset-0">
                      {formatDateTime(t.entry_time)}
                    </Link>
                  </TableCell>
                  <TableCell className="font-medium">
                    {t.symbol}
                    {t.status === "open" && (
                      <Badge variant="outline" className="ml-2">
                        Offen
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className={t.direction === "long" ? "text-profit" : "text-loss"}>
                    {t.direction === "long" ? "Long" : "Short"}
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground md:table-cell">{t.accountName}</TableCell>
                  <TableCell className="hidden max-w-40 truncate text-muted-foreground xl:table-cell">{t.strategyName ?? "–"}</TableCell>
                  <TableCell className="hidden text-right tabular-nums md:table-cell">{formatNumber(t.quantity, 4)}</TableCell>
                  <TableCell className={`text-right font-medium tabular-nums ${pnlClass(t.net_pnl)}`}>
                    {t.status === "open" ? "–" : formatMoney(t.net_pnl, t.currency, true)}
                  </TableCell>
                  <TableCell className={`text-right tabular-nums ${pnlClass(t.r_multiple)}`}>{formatR(t.r_multiple)}</TableCell>
                  <TableCell className="hidden lg:table-cell">{t.setup_quality ?? "–"}</TableCell>
                  <TableCell className="hidden lg:table-cell">
                    {t.mistakes.length > 0 ? (
                      <Badge variant="outline" className="border-loss/50">
                        {t.mistakes.length}
                      </Badge>
                    ) : (
                      "–"
                    )}
                  </TableCell>
                  <TableCell>
                    <span className="flex items-center gap-1.5">
                      {t.violations.length > 0 && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span
                              tabIndex={0}
                              className="relative z-10 cursor-help rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            >
                              <ShieldAlert className="size-4 text-loss" aria-hidden />
                              <span className="sr-only">Regelverstoß: {t.violations.join("; ")}</span>
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>
                            {t.violations.map((v, i) => (
                              <p key={i}>{v}</p>
                            ))}
                          </TooltipContent>
                        </Tooltip>
                      )}
                      {t.screenshots > 0 && (
                        <ImageIcon className="size-4 text-muted-foreground" role="img" aria-label="Hat Screenshots" />
                      )}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>
    </>
  );
}
