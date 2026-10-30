"use client";

import { useState } from "react";
import { ArrowDown } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatContracts, formatPctMove, formatUsd, formatUsdMove, type MarketCandle, type MoveBasis } from "@/lib/market";
import { cn } from "@/lib/utils";

export type TopRow = MarketCandle & { label: string; span: string };
export type TopLists = {
  long: Record<MoveBasis, TopRow[]>;
  short: Record<MoveBasis, TopRow[]>;
  volume: TopRow[];
};

type Tab = "long" | "short" | "volume";

const TABS: { value: Tab; label: string }[] = [
  { value: "long", label: "Long" },
  { value: "short", label: "Short" },
  { value: "volume", label: "Volumen" },
];

/** Top 10 nach Long- oder Short-Bewegung (in Dollar oder Prozent) oder nach Volumen. */
export function TopTable({ lists, unitOne, longRange }: { lists: TopLists; unitOne: string; longRange: boolean }) {
  const [tab, setTab] = useState<Tab>("long");
  const [basis, setBasis] = useState<MoveBasis>("usd");
  const rows = tab === "volume" ? lists.volume : lists[tab][basis];

  const sortHead = (key: MoveBasis | "volume", label: string) => {
    const active = tab === "volume" ? key === "volume" : key === basis;
    return (
      <TableHead className="text-right">
        <button
          type="button"
          onClick={() => {
            if (key === "volume") setTab("volume");
            else {
              setBasis(key);
              if (tab === "volume") setTab("long");
            }
          }}
          className={cn("inline-flex items-center gap-1 hover:text-foreground", active && "font-semibold text-chart-line")}
          aria-pressed={active}
        >
          {label}
          {active && <ArrowDown className="size-3" aria-hidden />}
        </button>
      </TableHead>
    );
  };

  const hint =
    tab === "volume"
      ? "Gehandelte Kontrakte der Gold-Futures an der COMEX (vorderster und nächster Kontrakt zusammen)."
      : basis === "usd"
        ? longRange
          ? "Nach Dollar: Bei heutigem Goldpreis sind Bewegungen in Dollar größer – alte Jahre kommen kaum vor. Nach Prozent vergleicht fair über die Jahre."
          : "Nach Dollar. Mit „Bewegung %“ nach Prozent sortieren."
        : "Nach Prozent: Bewegung im Verhältnis zum Eröffnungskurs, vergleichbar über alle Jahre.";

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-0.5 rounded-lg border bg-card p-0.5" role="group" aria-label="Rangliste">
          {TABS.map((t) => (
            <button
              key={t.value}
              type="button"
              aria-pressed={tab === t.value}
              onClick={() => setTab(t.value)}
              className={cn(
                "rounded-md px-2.5 py-1 text-sm transition-colors",
                tab === t.value
                  ? "bg-secondary font-medium text-foreground shadow-[inset_0_0_0_1px_var(--border)]"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">Bewertet je {unitOne}, Klick auf eine Spalte sortiert danach</p>
      </div>
      {rows.length ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10 pl-4">#</TableHead>
              <TableHead>{unitOne}</TableHead>
              {sortHead("usd", "Bewegung $")}
              {sortHead("pct", "Bewegung %")}
              <TableHead className="hidden text-right sm:table-cell">Spanne</TableHead>
              {sortHead("volume", "Volumen")}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r, i) => {
              const tone = r.move > 0 ? "text-profit" : r.move < 0 ? "text-loss" : "text-muted-foreground";
              return (
                <TableRow key={r.key}>
                  <TableCell className="pl-4 text-muted-foreground tabular-nums">{i + 1}</TableCell>
                  <TableCell>
                    <span className="font-medium">{r.label}</span>
                    {r.unit !== "tage" && <span className="ml-2 text-xs text-muted-foreground">{r.span}</span>}
                    {r.running && <span className="ml-2 text-xs text-warning">läuft</span>}
                  </TableCell>
                  <TableCell className={cn("text-right tabular-nums", tone)}>{formatUsdMove(r.move)}</TableCell>
                  <TableCell className={cn("text-right tabular-nums", tone)}>{formatPctMove(r.movePct)}</TableCell>
                  <TableCell className="hidden text-right tabular-nums sm:table-cell">{formatUsd(r.range)}</TableCell>
                  <TableCell className={cn("text-right tabular-nums", tab === "volume" && "font-medium text-chart-line")}>
                    {formatContracts(r.volume)}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      ) : (
        <p className="py-6 text-center text-sm text-muted-foreground">
          {tab === "volume" ? "Für diesen Zeitraum ist kein Volumen gemeldet." : "Keine Kerze in diese Richtung."}
        </p>
      )}
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}
