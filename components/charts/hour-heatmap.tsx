"use client";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { BreakdownRow } from "@/lib/stats";
import { formatMoney, formatR } from "@/lib/trading";

/**
 * Netto P&L je Einstiegsstunde als Heatmap (Türkis = Gewinn, Rot = Verlust, Deckkraft nach Betrag).
 * Gezeigt wird der Bereich von der ersten bis zur letzten gehandelten Stunde; Details im Tooltip.
 */
export function HourHeatmap({ rows, currency }: { rows: BreakdownRow[]; currency: string }) {
  if (!rows.length) return <p className="text-sm text-muted-foreground">Noch keine Daten.</p>;
  const byHour = new Map(rows.map((r) => [Number(r.key), r]));
  const hours = [...byHour.keys()];
  const first = Math.min(...hours);
  const last = Math.max(...hours);
  const range = Array.from({ length: last - first + 1 }, (_, i) => first + i);
  const maxAbs = Math.max(1, ...rows.map((r) => Math.abs(r.netPnl)));

  return (
    <div className="grid gap-3">
      <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${range.length}, minmax(0, 1fr))` }}>
        {range.map((h) => {
          const row = byHour.get(h);
          const cell = (
            <div
              tabIndex={row ? 0 : -1}
              className="aspect-[1/1.2] rounded-md bg-foreground/[0.03] outline-none focus-visible:ring-2 focus-visible:ring-ring"
              style={
                row && row.netPnl !== 0
                  ? {
                      background: `color-mix(in oklch, var(${row.netPnl > 0 ? "--profit" : "--loss"}) ${Math.round(18 + 62 * Math.min(1, Math.abs(row.netPnl) / maxAbs))}%, transparent)`,
                    }
                  : undefined
              }
              aria-label={row ? `${row.label}: ${formatMoney(row.netPnl, currency, true)}` : undefined}
            />
          );
          return row ? (
            <Tooltip key={h}>
              <TooltipTrigger asChild>{cell}</TooltipTrigger>
              <TooltipContent>
                <p className="font-semibold tabular-nums">{formatMoney(row.netPnl, currency, true)}</p>
                <p className="opacity-80">
                  {row.label} · {row.count} {row.count === 1 ? "Trade" : "Trades"} · {Math.round(row.winRate * 100)} % · {formatR(row.avgR)}
                </p>
              </TooltipContent>
            </Tooltip>
          ) : (
            <div key={h}>{cell}</div>
          );
        })}
      </div>
      <div className="grid gap-1 text-center text-[0.625rem] text-muted-foreground tabular-nums" style={{ gridTemplateColumns: `repeat(${range.length}, minmax(0, 1fr))` }}>
        {range.map((h) => (
          <span key={h} className={range.length > 12 && h % 2 ? "invisible sm:visible" : undefined}>
            {h}
          </span>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2 text-[0.6875rem] text-muted-foreground">
        <span>Verlust</span>
        <span
          className="h-1.5 w-16 rounded-full"
          style={{ background: "linear-gradient(90deg, color-mix(in oklch, var(--loss) 80%, transparent), transparent, color-mix(in oklch, var(--profit) 80%, transparent))" }}
          aria-hidden
        />
        <span>Gewinn</span>
        <span className="ml-auto">Leeres Feld = keine Trades</span>
      </div>
    </div>
  );
}
