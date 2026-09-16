"use client";

import { useState } from "react";
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatMoney, formatR } from "@/lib/trading";
import { cn } from "@/lib/utils";
import { ChartTooltipBox } from "./chart-tooltip";
import { compactMoney, longDate, niceTicks, shortDate } from "./format";

export type EquityChartPoint = { time: string; balance: number; pnl: number; r?: number | null };

export type EquityMode = "balance" | "r" | "drawdown";

/** Werte je Punkt: Kontostand, kumuliertes R (ohne Startpunkt) oder Abstand zum bisherigen Höchststand. */
function toSeries(points: EquityChartPoint[], mode: EquityMode) {
  const series: (EquityChartPoint & { index: number; value: number })[] = [];
  let cumulativeR = 0;
  let peak = -Infinity;
  points.forEach((p, i) => {
    if (i > 0) cumulativeR += p.r ?? 0;
    peak = Math.max(peak, p.balance);
    const value =
      mode === "r" ? Math.round(cumulativeR * 100) / 100 : mode === "drawdown" ? Math.round((p.balance - peak) * 100) / 100 : p.balance;
    series.push({ ...p, index: i, value });
  });
  return series;
}

/**
 * Kontostand-Verlauf: eine Linie (keine Legende nötig), Fadenkreuz-Tooltip, Startkapital als Bezugslinie.
 * Mit `mode` auch als kumulierte R-Kurve oder als Drawdown vom Höchststand.
 */
export function EquityChart({
  points,
  startingBalance,
  currency,
  height = 260,
  mode = "balance",
}: {
  points: EquityChartPoint[];
  startingBalance: number;
  currency: string;
  height?: number;
  mode?: EquityMode;
}) {
  if (points.length < 2) {
    return (
      <div className="flex items-center justify-center text-sm text-muted-foreground" style={{ height }}>
        Noch zu wenige Trades für eine Kurve.
      </div>
    );
  }

  const data = toSeries(points, mode);
  const values = data.map((d) => d.value);
  const baseline = mode === "balance" ? startingBalance : 0;
  const ticks = niceTicks(Math.min(...values, baseline), Math.max(...values, baseline));
  const color = mode === "drawdown" ? "var(--loss)" : "var(--chart-line)";
  const formatValue = (v: number) => (mode === "r" ? formatR(v) : formatMoney(v, currency, mode === "drawdown"));
  const formatTick = (v: number) => (mode === "r" ? `${v.toLocaleString("de-DE")} R` : compactMoney(v, currency));
  const gradientId = `equity-wash-${mode}`;

  // X-Achse: pro Datum höchstens eine Beschriftung, gleichmäßig auf max. 6 verteilt
  const dayStarts = data.filter((d, i) => i === 0 || shortDate(d.time) !== shortDate(data[i - 1].time)).map((d) => d.index);
  const every = Math.ceil(dayStarts.length / 6);
  const xTicks = dayStarts.filter((_, i) => i % every === 0);

  const label =
    mode === "r"
      ? `Kumulierte R-Kurve bis ${formatR(values.at(-1)!)}`
      : mode === "drawdown"
        ? `Drawdown-Verlauf, tiefster Wert ${formatMoney(Math.min(...values), currency)}`
        : `Equity-Kurve von ${formatMoney(values[0], currency)} auf ${formatMoney(values.at(-1)!, currency)}`;

  return (
    <div style={{ height }} role="img" aria-label={label}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={mode === "drawdown" ? 0.04 : 0.24} />
              <stop offset="100%" stopColor={color} stopOpacity={mode === "drawdown" ? 0.24 : 0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="var(--chart-grid)" strokeWidth={1} />
          <XAxis
            dataKey="index"
            type="number"
            domain={[0, data.length - 1]}
            ticks={xTicks}
            tickFormatter={(i: number) => shortDate(data[Math.round(i)]?.time ?? data[0].time)}
            tick={{ fill: "var(--chart-axis)", fontSize: "0.75rem" }}
            tickLine={false}
            axisLine={{ stroke: "var(--chart-grid)" }}
            minTickGap={24}
          />
          <YAxis
            domain={[ticks[0], ticks.at(-1)!]}
            ticks={ticks}
            tickFormatter={formatTick}
            tick={{ fill: "var(--chart-axis)", fontSize: "0.75rem" }}
            tickLine={false}
            axisLine={false}
            width={72}
          />
          {/* Bezugslinie: Startkapital bzw. Null */}
          <ReferenceLine y={baseline} stroke="var(--chart-axis)" strokeOpacity={0.6} strokeDasharray="3 4" strokeWidth={1} />
          <Tooltip
            cursor={{ stroke: "var(--chart-axis)", strokeWidth: 1, strokeOpacity: 0.6 }}
            content={({ active, payload }) => {
              const p = payload?.[0]?.payload as (typeof data)[number] | undefined;
              if (!active || !p) return null;
              return (
                <ChartTooltipBox
                  value={formatValue(p.value)}
                  label={p.index === 0 ? "Start" : longDate(p.time)}
                  detail={
                    p.index === 0
                      ? undefined
                      : `Trade: ${formatMoney(p.pnl, currency, true)}${p.r != null ? ` · ${formatR(p.r)}` : ""}`
                  }
                />
              );
            }}
          />
          <Area
            type="linear"
            dataKey="value"
            baseValue={mode === "drawdown" ? 0 : undefined}
            stroke={color}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
            fill={`url(#${gradientId})`}
            isAnimationActive={false}
            activeDot={{ r: 4, fill: color, stroke: "var(--card)", strokeWidth: 2 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

const MODES: { value: EquityMode; label: string }[] = [
  { value: "balance", label: "EUR" },
  { value: "r", label: "R" },
  { value: "drawdown", label: "Drawdown" },
];

/** Equity-Kurve mit Umschalter Betrag / R / Drawdown und Kennzahlen darüber. */
export function EquityPanel({
  points,
  startingBalance,
  currency,
  height = 320,
  summary,
}: {
  points: EquityChartPoint[];
  startingBalance: number;
  currency: string;
  height?: number;
  /** Eigener Kopfbereich links vom Umschalter statt Start / Aktuell / Höchststand */
  summary?: React.ReactNode;
}) {
  const [mode, setMode] = useState<EquityMode>("balance");
  const current = points.at(-1)?.balance ?? startingBalance;
  const peak = Math.max(startingBalance, ...points.map((p) => p.balance));
  const modeLabel = MODES.map((m) => (m.value === "balance" ? { ...m, label: currency } : m));

  return (
    <div className="grid gap-4">
      <div className={cn("flex flex-wrap justify-between gap-4", summary ? "items-start" : "items-end")}>
        {summary ?? (
        <dl className="flex flex-wrap gap-x-8 gap-y-2">
          {(
            [
              ["Start", formatMoney(startingBalance, currency), ""],
              ["Aktuell", formatMoney(current, currency), current > startingBalance ? "text-profit" : current < startingBalance ? "text-loss" : ""],
              ["Höchststand", formatMoney(peak, currency), ""],
            ] as const
          ).map(([label, value, className]) => (
            <div key={label}>
              <dt className="text-[0.6875rem] font-medium uppercase tracking-[0.08em] text-muted-foreground">{label}</dt>
              <dd className={cn("text-lg font-semibold tabular-nums sm:text-xl", className)}>{value}</dd>
            </div>
          ))}
        </dl>
        )}
        <div className="inline-flex rounded-lg border bg-background/60 p-0.5" role="group" aria-label="Darstellung der Kurve">
          {modeLabel.map((m) => (
            <button
              key={m.value}
              type="button"
              aria-pressed={mode === m.value}
              onClick={() => setMode(m.value)}
              className={cn(
                "rounded-md px-3 py-1 text-xs font-medium transition-colors",
                mode === m.value ? "bg-secondary text-foreground shadow-[inset_0_0_0_1px_var(--border)]" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>
      <EquityChart points={points} startingBalance={startingBalance} currency={currency} height={height} mode={mode} />
    </div>
  );
}
