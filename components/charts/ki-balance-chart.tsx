"use client";

import { Area, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { BalancePoint } from "@/lib/ki";
import { formatDateTime, formatR } from "@/lib/trading";
import { ChartTooltipBox } from "./chart-tooltip";
import { niceTicks } from "./format";

/**
 * Kumuliertes Netto-R der gedachten Trades nach Trade-Nummer. Die graue Fläche ist der Bereich, in dem 90 % der
 * zufälligen Trade-Folgen mit gleich vielen Trades landen, die gestrichelte Linie deren Mitte.
 */
export function KiBalanceChart({ points, height = 280 }: { points: BalancePoint[]; height?: number }) {
  if (points.length < 2) {
    return (
      <div className="flex items-center justify-center text-center text-sm text-muted-foreground" style={{ height }}>
        Noch zu wenige abgeschlossene Trades für eine Kurve.
      </div>
    );
  }

  const values = points.flatMap((p) => [p.cumulative, ...(p.band ?? [])]);
  const ticks = niceTicks(Math.min(...values, 0), Math.max(...values, 0));
  const latest = points.at(-1)!;

  return (
    <div
      style={{ height }}
      role="img"
      aria-label={`Kumuliertes Netto-R nach ${points.length} gedachten Trades: ${formatR(latest.cumulative)}${
        latest.band ? `, Zufall zwischen ${formatR(latest.band[0])} und ${formatR(latest.band[1])}` : ""
      }`}
    >
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--chart-grid)" strokeWidth={1} />
          <XAxis
            dataKey="n"
            type="number"
            domain={[1, points.length]}
            allowDecimals={false}
            tick={{ fill: "var(--chart-axis)", fontSize: "0.75rem" }}
            tickLine={false}
            axisLine={{ stroke: "var(--chart-grid)" }}
            minTickGap={24}
          />
          <YAxis
            domain={[ticks[0], ticks.at(-1)!]}
            ticks={ticks}
            tickFormatter={(v: number) => `${v.toLocaleString("de-DE")} R`}
            tick={{ fill: "var(--chart-axis)", fontSize: "0.75rem" }}
            tickLine={false}
            axisLine={false}
            width={56}
          />
          <ReferenceLine y={0} stroke="var(--chart-axis)" strokeOpacity={0.6} strokeDasharray="3 4" strokeWidth={1} />
          <Tooltip
            cursor={{ stroke: "var(--chart-axis)", strokeWidth: 1, strokeOpacity: 0.6 }}
            content={({ active, payload }) => {
              const p = payload?.[0]?.payload as BalancePoint | undefined;
              if (!active || !p) return null;
              return (
                <ChartTooltipBox
                  value={`${formatR(p.cumulative)} nach ${p.n} ${p.n === 1 ? "Trade" : "Trades"}`}
                  label={`Trade ${formatR(p.r)} · Signal ${formatDateTime(p.time)}`}
                  detail={p.band ? `Zufall: ${formatR(p.band[0])} bis ${formatR(p.band[1])}` : undefined}
                />
              );
            }}
          />
          <Area
            type="linear"
            dataKey="band"
            stroke="none"
            fill="var(--chart-axis)"
            fillOpacity={0.16}
            isAnimationActive={false}
            activeDot={false}
          />
          <Line
            type="linear"
            dataKey="mid"
            stroke="var(--chart-axis)"
            strokeDasharray="4 4"
            strokeWidth={1}
            dot={false}
            isAnimationActive={false}
            activeDot={false}
          />
          <Line
            type="linear"
            dataKey="cumulative"
            stroke="var(--chart-line)"
            strokeWidth={2}
            strokeLinejoin="round"
            dot={false}
            isAnimationActive={false}
            activeDot={{ r: 4, fill: "var(--chart-line)", stroke: "var(--card)", strokeWidth: 2 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
