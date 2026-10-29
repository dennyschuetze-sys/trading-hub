"use client";

import { CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { KiPrediction } from "@/lib/ki";
import { formatDateTime, formatNumber, formatR } from "@/lib/trading";
import { ChartTooltipBox } from "./chart-tooltip";
import { clockTime, niceTicks, shortDate } from "./format";

/**
 * Was die KI je Kerze erwartet: erwartetes Netto-R eines Long- und eines Short-Trades. Über der Nulllinie
 * entsteht ein Signal. Der Goldkurs läuft als dünne graue Linie auf eigener Achse mit.
 */
export function KiPredictionChart({ predictions, height = 280 }: { predictions: KiPrediction[]; height?: number }) {
  if (predictions.length < 2) {
    return (
      <div className="flex items-center justify-center text-center text-sm text-muted-foreground" style={{ height }}>
        Noch zu wenige Kerzen für einen Verlauf. Alle 15 Minuten kommt eine dazu.
      </div>
    );
  }

  const data = predictions.map((p, index) => ({ ...p, index }));
  const values = data.flatMap((d) => [d.pred_long, d.pred_short]);
  const ticks = niceTicks(Math.min(...values, 0), Math.max(...values, 0));

  // X-Achse: neuer Tag mit Datum, sonst Uhrzeit; höchstens acht Beschriftungen
  const every = Math.ceil(data.length / 8);
  const xTicks = data.filter((_, i) => i % every === 0).map((d) => d.index);
  const tickLabel = (i: number) => {
    const d = data[Math.round(i)] ?? data[0];
    const prev = data[Math.round(i) - every];
    return !prev || shortDate(prev.bar_at) !== shortDate(d.bar_at) ? `${shortDate(d.bar_at)} ${clockTime(d.bar_at)}` : clockTime(d.bar_at);
  };

  const latest = data.at(-1)!;

  return (
    <div
      style={{ height }}
      role="img"
      aria-label={`Erwartetes Netto-R je Kerze, zuletzt Long ${formatR(latest.pred_long)} und Short ${formatR(latest.pred_short)}`}
    >
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--chart-grid)" strokeWidth={1} />
          <XAxis
            dataKey="index"
            type="number"
            domain={[0, data.length - 1]}
            ticks={xTicks}
            tickFormatter={tickLabel}
            tick={{ fill: "var(--chart-axis)", fontSize: "0.75rem" }}
            tickLine={false}
            axisLine={{ stroke: "var(--chart-grid)" }}
            minTickGap={24}
          />
          <YAxis
            yAxisId="r"
            domain={[ticks[0], ticks.at(-1)!]}
            ticks={ticks}
            tickFormatter={(v: number) => `${v.toLocaleString("de-DE")} R`}
            tick={{ fill: "var(--chart-axis)", fontSize: "0.75rem" }}
            tickLine={false}
            axisLine={false}
            width={56}
          />
          <YAxis yAxisId="price" orientation="right" domain={["dataMin", "dataMax"]} hide />
          {/* Nulllinie: darüber erwartet die KI nach Kosten einen Gewinn */}
          <ReferenceLine yAxisId="r" y={0} stroke="var(--chart-axis)" strokeOpacity={0.6} strokeDasharray="3 4" strokeWidth={1} />
          <Tooltip
            cursor={{ stroke: "var(--chart-axis)", strokeWidth: 1, strokeOpacity: 0.6 }}
            content={({ active, payload }) => {
              const p = payload?.[0]?.payload as (typeof data)[number] | undefined;
              if (!active || !p) return null;
              return (
                <ChartTooltipBox
                  value={`Long ${formatR(p.pred_long)} · Short ${formatR(p.pred_short)}`}
                  label={formatDateTime(p.bar_at)}
                  detail={`Gold ${formatNumber(p.close, 2)}`}
                />
              );
            }}
          />
          <Line
            yAxisId="price"
            type="linear"
            dataKey="close"
            stroke="var(--chart-axis)"
            strokeOpacity={0.5}
            strokeWidth={1}
            dot={false}
            isAnimationActive={false}
          />
          <Line
            yAxisId="r"
            type="linear"
            dataKey="pred_long"
            stroke="var(--profit)"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
            activeDot={{ r: 4, fill: "var(--profit)", stroke: "var(--card)", strokeWidth: 2 }}
          />
          <Line
            yAxisId="r"
            type="linear"
            dataKey="pred_short"
            stroke="var(--loss)"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
            activeDot={{ r: 4, fill: "var(--loss)", stroke: "var(--card)", strokeWidth: 2 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
