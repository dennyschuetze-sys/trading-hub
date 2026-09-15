"use client";

import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { RBucket } from "@/lib/trade-analysis";
import { ChartTooltipBox } from "./chart-tooltip";

export function RDistributionChart({ buckets, height = 220 }: { buckets: RBucket[]; height?: number }) {
  const total = buckets.reduce((s, b) => s + b.count, 0);
  if (!total) {
    return (
      <div className="flex items-center justify-center text-sm text-muted-foreground" style={{ height }}>
        Keine Trades mit R-Multiple im Zeitraum.
      </div>
    );
  }

  return (
    <div style={{ height }} role="img" aria-label={`Verteilung der R-Multiples über ${total} Trades`}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={buckets} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap={4}>
          <CartesianGrid vertical={false} stroke="var(--chart-grid)" strokeWidth={1} />
          <XAxis
            dataKey="label"
            tick={{ fill: "var(--chart-axis)", fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            interval={0}
          />
          <YAxis
            allowDecimals={false}
            tick={{ fill: "var(--chart-axis)", fontSize: 12 }}
            tickLine={false}
            axisLine={false}
            width={32}
          />
          <Tooltip
            cursor={{ fill: "var(--muted)", opacity: 0.5 }}
            content={({ active, payload }) => {
              const b = payload?.[0]?.payload as RBucket | undefined;
              if (!active || !b) return null;
              return (
                <ChartTooltipBox
                  value={`${b.count} ${b.count === 1 ? "Trade" : "Trades"}`}
                  label={b.label}
                  detail={`${Math.round((b.count / total) * 100)} % aller Trades mit R`}
                />
              );
            }}
          />
          <Bar dataKey="count" maxBarSize={48} radius={[4, 4, 0, 0]} isAnimationActive={false}>
            {buckets.map((b) => (
              <Cell key={b.label} fill={b.positive ? "var(--profit)" : "var(--loss)"} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
