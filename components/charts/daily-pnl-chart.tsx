"use client";

import { Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { DayResult } from "@/lib/stats";
import { formatMoney } from "@/lib/trading";
import { ChartTooltipBox } from "./chart-tooltip";
import { compactMoney, longDate, niceTicks, shortDate } from "./format";

type BarShapeProps = { x?: number; y?: number; width?: number; height?: number; payload?: DayResult };

/** Balken wächst von der Nulllinie; nur das Ende weg von der Nulllinie ist abgerundet (4px). */
function PnlBar({ x = 0, y = 0, width = 0, height = 0, payload }: BarShapeProps) {
  const top = Math.min(y, y + height);
  const h = Math.abs(height);
  if (h < 0.5 || !payload) return null;
  const r = Math.min(4, h, width / 2);
  const positive = payload.pnl >= 0;
  const d = positive
    ? `M${x},${top + h} V${top + r} Q${x},${top} ${x + r},${top} H${x + width - r} Q${x + width},${top} ${x + width},${top + r} V${top + h} Z`
    : `M${x},${top} V${top + h - r} Q${x},${top + h} ${x + r},${top + h} H${x + width - r} Q${x + width},${top + h} ${x + width},${top + h - r} V${top} Z`;
  return <path d={d} fill={positive ? "var(--profit)" : "var(--loss)"} />;
}

export function DailyPnlChart({ days, currency, height = 220 }: { days: DayResult[]; currency: string; height?: number }) {
  if (!days.length) {
    return (
      <div className="flex items-center justify-center text-sm text-muted-foreground" style={{ height }}>
        Keine Handelstage im Zeitraum.
      </div>
    );
  }

  const ticks = niceTicks(Math.min(0, ...days.map((d) => d.pnl)), Math.max(0, ...days.map((d) => d.pnl)));

  return (
    <div style={{ height }} role="img" aria-label={`Tagesergebnisse für ${days.length} Handelstage`}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={days} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap={2}>
          <CartesianGrid vertical={false} stroke="var(--chart-grid)" strokeWidth={1} />
          <XAxis
            dataKey="date"
            tickFormatter={shortDate}
            tick={{ fill: "var(--chart-axis)", fontSize: 12 }}
            tickLine={false}
            axisLine={false}
            minTickGap={24}
          />
          <YAxis
            domain={[ticks[0], ticks.at(-1)!]}
            ticks={ticks}
            tickFormatter={(v: number) => compactMoney(v, currency)}
            tick={{ fill: "var(--chart-axis)", fontSize: 12 }}
            tickLine={false}
            axisLine={false}
            width={72}
          />
          <ReferenceLine y={0} stroke="var(--chart-axis)" strokeWidth={1} />
          <Tooltip
            cursor={{ fill: "var(--muted)", opacity: 0.5 }}
            content={({ active, payload }) => {
              const d = payload?.[0]?.payload as DayResult | undefined;
              if (!active || !d) return null;
              return (
                <ChartTooltipBox
                  value={formatMoney(d.pnl, currency, true)}
                  label={longDate(d.date)}
                  detail={`${d.count} ${d.count === 1 ? "Trade" : "Trades"}, ${d.wins} Gewinner`}
                />
              );
            }}
          />
          <Bar dataKey="pnl" maxBarSize={24} shape={<PnlBar />} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
