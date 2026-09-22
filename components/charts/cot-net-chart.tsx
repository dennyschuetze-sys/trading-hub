"use client";

import { Area, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { CotWeek } from "@/lib/cot";
import { formatNumber } from "@/lib/trading";
import { ChartTooltipBox } from "./chart-tooltip";
import { longDate, monthYear, niceTicks } from "./format";

const compact = (value: number) => new Intl.NumberFormat("de-DE", { notation: "compact", maximumFractionDigits: 1 }).format(value);

const signed = (value: number) => `${value > 0 ? "+" : ""}${formatNumber(value, 0)}`;

/**
 * Netto-Position der Non-Commercials im Zeitverlauf, als Fläche um die Nulllinie:
 * oberhalb heißt netto long, unterhalb netto short. Das Open Interest läuft als dünne
 * Linie mit, damit sichtbar wird, ob eine Position wächst oder der Markt nur größer wird.
 */
export function CotNetChart({ weeks, label, height = 280 }: { weeks: CotWeek[]; label: string; height?: number }) {
  if (weeks.length < 2) {
    return (
      <div className="flex items-center justify-center text-sm text-muted-foreground" style={{ height }}>
        Noch zu wenige Wochen für einen Verlauf.
      </div>
    );
  }

  const data = weeks.map((w, index) => ({ ...w, index }));
  const nets = data.map((d) => d.net);
  const ticks = niceTicks(Math.min(...nets, 0), Math.max(...nets, 0));
  const oiTicks = niceTicks(0, Math.max(...data.map((d) => d.openInterest)));

  // X-Achse: höchstens acht Beschriftungen, gleichmäßig verteilt
  const every = Math.ceil(data.length / 8);
  const xTicks = data.filter((_, i) => i % every === 0).map((d) => d.index);

  const latest = data[data.length - 1];

  return (
    <div style={{ height }} role="img" aria-label={`${label}: Netto-Position der großen Spekulanten, zuletzt ${signed(latest.net)} Kontrakte`}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="cot-wash" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--chart-line)" stopOpacity={0.24} />
              <stop offset="100%" stopColor="var(--chart-line)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="var(--chart-grid)" strokeWidth={1} />
          <XAxis
            dataKey="index"
            type="number"
            domain={[0, data.length - 1]}
            ticks={xTicks}
            tickFormatter={(i: number) => monthYear(data[Math.round(i)]?.date ?? data[0].date)}
            tick={{ fill: "var(--chart-axis)", fontSize: "0.75rem" }}
            tickLine={false}
            axisLine={{ stroke: "var(--chart-grid)" }}
            minTickGap={24}
          />
          <YAxis
            yAxisId="net"
            domain={[ticks[0], ticks.at(-1)!]}
            ticks={ticks}
            tickFormatter={compact}
            tick={{ fill: "var(--chart-axis)", fontSize: "0.75rem" }}
            tickLine={false}
            axisLine={false}
            width={56}
          />
          <YAxis yAxisId="oi" orientation="right" domain={[0, oiTicks.at(-1)!]} hide />
          {/* Nulllinie: darüber netto long, darunter netto short */}
          <ReferenceLine yAxisId="net" y={0} stroke="var(--chart-axis)" strokeOpacity={0.6} strokeDasharray="3 4" strokeWidth={1} />
          <Tooltip
            cursor={{ stroke: "var(--chart-axis)", strokeWidth: 1, strokeOpacity: 0.6 }}
            content={({ active, payload }) => {
              const p = payload?.[0]?.payload as (typeof data)[number] | undefined;
              if (!active || !p) return null;
              return (
                <ChartTooltipBox
                  value={`${signed(p.net)} Kontrakte`}
                  label={longDate(p.date)}
                  detail={`${formatNumber(p.netPct * 100, 1)} % des Open Interest · Woche ${signed(p.change)}`}
                />
              );
            }}
          />
          <Area
            yAxisId="net"
            type="linear"
            dataKey="net"
            baseValue={0}
            stroke="var(--chart-line)"
            strokeWidth={2}
            strokeLinejoin="round"
            fill="url(#cot-wash)"
            isAnimationActive={false}
            activeDot={{ r: 4, fill: "var(--chart-line)", stroke: "var(--card)", strokeWidth: 2 }}
          />
          <Line
            yAxisId="oi"
            type="linear"
            dataKey="openInterest"
            stroke="var(--chart-axis)"
            strokeWidth={1}
            dot={false}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
