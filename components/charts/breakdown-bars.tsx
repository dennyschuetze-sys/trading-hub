import type { BreakdownRow } from "@/lib/stats";
import { formatMoney, formatR } from "@/lib/trading";
import { cn } from "@/lib/utils";

/**
 * Aufschlüsselung als horizontale Balken von der Nulllinie (links Verlust, rechts Gewinn).
 * Jede Zeile nennt Trades, Winrate, Netto und Ø R als Text – die Farbe ist nie die einzige Information.
 */
export function BreakdownBars({
  rows,
  currency,
  emptyText = "Noch keine Daten.",
}: {
  rows: BreakdownRow[];
  currency: string;
  emptyText?: string;
}) {
  if (!rows.length) return <p className="text-sm text-muted-foreground">{emptyText}</p>;
  const maxAbs = Math.max(1, ...rows.map((r) => Math.abs(r.netPnl)));

  return (
    <ul className="grid gap-1">
      {rows.map((row) => {
        const width = `${(Math.abs(row.netPnl) / maxAbs) * 50}%`;
        return (
          <li key={row.key} className="grid grid-cols-[minmax(0,7rem)_1fr_auto] items-center gap-3 py-1.5 sm:grid-cols-[minmax(0,9rem)_1fr_7rem]">
            <div className="min-w-0">
              <p className="truncate text-sm" title={row.label}>
                {row.label}
              </p>
              <p className="text-xs text-muted-foreground tabular-nums">
                {row.count} {row.count === 1 ? "Trade" : "Trades"} · {Math.round(row.winRate * 100)} %
              </p>
            </div>
            <div className="relative h-6" aria-hidden>
              <div className="absolute inset-y-0 left-1/2 w-px bg-border" />
              {row.netPnl !== 0 && (
                <div
                  className="absolute inset-y-1.5 rounded-[5px]"
                  style={{
                    width,
                    left: row.netPnl > 0 ? "calc(50% + 1px)" : undefined,
                    right: row.netPnl < 0 ? "calc(50% + 1px)" : undefined,
                    background: `color-mix(in oklch, var(${row.netPnl > 0 ? "--profit" : "--loss"}) 80%, transparent)`,
                  }}
                />
              )}
            </div>
            <div className="text-right tabular-nums">
              <p className={cn("text-sm font-semibold", row.netPnl > 0 ? "text-profit" : row.netPnl < 0 ? "text-loss" : "")}>
                {formatMoney(row.netPnl, currency, true)}
              </p>
              <p className="text-xs text-muted-foreground">{formatR(row.avgR)}</p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
