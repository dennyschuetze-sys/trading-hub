"use client";

import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatMoney } from "@/lib/trading";
import { ChartTooltipBox } from "./chart-tooltip";
import { compactMoney, longDate, niceTicks, shortDate } from "./format";

export type EquityChartPoint = { time: string; balance: number; pnl: number };

/** Kontostand-Verlauf: eine Linie (keine Legende nötig), Fadenkreuz-Tooltip, Startkapital als Bezugslinie. */
export function EquityChart({
  points,
  startingBalance,
  currency,
  height = 260,
}: {
  points: EquityChartPoint[];
  startingBalance: number;
  currency: string;
  height?: number;
}) {
  if (points.length < 2) {
    return (
      <div className="flex items-center justify-center text-sm text-muted-foreground" style={{ height }}>
        Noch zu wenige Trades für eine Kurve.
      </div>
    );
  }

  const data = points.map((p, i) => ({ ...p, index: i }));
  const balances = data.map((d) => d.balance);
  const ticks = niceTicks(Math.min(...balances, startingBalance), Math.max(...balances, startingBalance));

  // X-Achse: pro Datum höchstens eine Beschriftung, gleichmäßig auf max. 6 verteilt
  const dayStarts = data.filter((d, i) => i === 0 || shortDate(d.time) !== shortDate(data[i - 1].time)).map((d) => d.index);
  const every = Math.ceil(dayStarts.length / 6);
  const xTicks = dayStarts.filter((_, i) => i % every === 0);

  return (
    <div style={{ height }} role="img" aria-label={`Equity-Kurve von ${formatMoney(balances[0], currency)} auf ${formatMoney(balances.at(-1)!, currency)}`}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="equity-wash" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--chart-line)" stopOpacity={0.14} />
              <stop offset="100%" stopColor="var(--chart-line)" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="var(--chart-grid)" strokeWidth={1} />
          <XAxis
            dataKey="index"
            type="number"
            domain={[0, data.length - 1]}
            ticks={xTicks}
            tickFormatter={(i: number) => shortDate(data[Math.round(i)]?.time ?? data[0].time)}
            tick={{ fill: "var(--chart-axis)", fontSize: 12 }}
            tickLine={false}
            axisLine={{ stroke: "var(--chart-grid)" }}
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
          {/* Bezugslinie Startkapital; der Wert steht in der Kartenbeschreibung */}
          <ReferenceLine y={startingBalance} stroke="var(--chart-axis)" strokeWidth={1} />
          <Tooltip
            cursor={{ stroke: "var(--chart-axis)", strokeWidth: 1 }}
            content={({ active, payload }) => {
              const p = payload?.[0]?.payload as (typeof data)[number] | undefined;
              if (!active || !p) return null;
              return (
                <ChartTooltipBox
                  value={formatMoney(p.balance, currency)}
                  label={p.index === 0 ? "Startkapital" : longDate(p.time)}
                  detail={p.index === 0 ? undefined : `Trade: ${formatMoney(p.pnl, currency, true)}`}
                />
              );
            }}
          />
          <Area
            type="linear"
            dataKey="balance"
            stroke="var(--chart-line)"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
            fill="url(#equity-wash)"
            isAnimationActive={false}
            activeDot={{ r: 4, fill: "var(--chart-line)", stroke: "var(--card)", strokeWidth: 2 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
