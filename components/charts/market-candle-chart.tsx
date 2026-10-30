"use client";

import { Bar, BarChart, CartesianGrid, Cell, ComposedChart, ReferenceDot, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  axisLabel,
  candleLabel,
  candleSpan,
  formatContracts,
  formatPctMove,
  formatUsdMove,
  type MarketCandle,
} from "@/lib/market";
import { formatNumber } from "@/lib/trading";
import { ChartTooltipBox } from "./chart-tooltip";
import { niceTicks } from "./format";
import { Candle, type CandleProps } from "./ki-candle-chart";

type Datum = MarketCandle & { index: number; span: [number, number] };
type DotProps = { cx?: number; cy?: number };

const Y_WIDTH = 64;
const MARGIN = { top: 8, right: 8, bottom: 0, left: 0 };

/** Rekordkerze: Dreieck über dem Hoch (Long) bzw. unter dem Tief (Short), daneben die Bewegung. */
function RecordMarker({ cx = 0, cy = 0, side, text }: DotProps & { side: "long" | "short"; text: string }) {
  const s = 5;
  const up = side === "long";
  const y = up ? cy - 6 : cy + 6;
  const points = up ? `${cx},${y - s} ${cx - s},${y + s} ${cx + s},${y + s}` : `${cx},${y + s} ${cx - s},${y - s} ${cx + s},${y - s}`;
  const fill = up ? "var(--profit)" : "var(--loss)";
  return (
    <g>
      <polygon points={points} fill={fill} stroke="var(--card)" strokeWidth={1} />
      <text x={cx - 9} y={up ? y - 1 : y + 4} textAnchor="end" fill={fill} fontSize={11} className="tabular-nums">
        {text}
      </text>
    </g>
  );
}

function tooltip(p: Datum) {
  return (
    <ChartTooltipBox
      value={`${formatUsdMove(p.move)} · ${formatPctMove(p.movePct)}`}
      label={`${candleLabel(p)}${p.unit === "tage" ? "" : ` · ${candleSpan(p)}`}${p.running ? " · läuft" : ""}`}
      detail={`Eröffnung ${formatNumber(p.open, 2)} · Hoch ${formatNumber(p.high, 2)} · Tief ${formatNumber(p.low, 2)} · Schluss ${formatNumber(p.close, 2)} · Volumen ${formatContracts(p.volume)}`}
    />
  );
}

/**
 * Kerzen des gewählten Zeitraums mit dem Futures-Volumen darunter. Türkis: die drei Kerzen mit dem meisten Volumen;
 * Dreiecke: die Kerzen mit dem größten Long- bzw. Short-Rekord der Rangliste.
 */
export function MarketCandleChart({
  candles,
  recordLong,
  recordShort,
  height = 320,
  volumeHeight = 96,
}: {
  candles: MarketCandle[];
  recordLong: { index: number; text: string } | null;
  recordShort: { index: number; text: string } | null;
  height?: number;
  volumeHeight?: number;
}) {
  if (candles.length < 2) {
    return (
      <div className="flex items-center justify-center text-sm text-muted-foreground" style={{ height }}>
        Zu wenige Kerzen für einen Chart.
      </div>
    );
  }

  const data: Datum[] = candles.map((c, index) => ({ ...c, index, span: [c.low, c.high] }));
  const lows = data.map((d) => d.low);
  const highs = data.map((d) => d.high);
  const pad = (Math.max(...highs) - Math.min(...lows)) * 0.06 || 1;
  const ticks = niceTicks(Math.min(...lows) - pad, Math.max(...highs) + pad);
  const topVolume = new Set(
    data
      .filter((d) => d.volume != null)
      .sort((a, b) => b.volume! - a.volume!)
      .slice(0, 3)
      .map((d) => d.index),
  );

  const every = Math.ceil(data.length / 8);
  const xTicks = data.filter((_, i) => i % every === 0).map((d) => d.index);
  const xAxis = (labels: boolean) => (
    <XAxis
      dataKey="index"
      type="category"
      ticks={xTicks}
      interval={0}
      tickFormatter={(i: number) => (labels ? axisLabel(data[i] ?? data[0]) : "")}
      tick={{ fill: "var(--chart-axis)", fontSize: "0.75rem" }}
      tickLine={false}
      axisLine={{ stroke: "var(--chart-grid)" }}
      height={labels ? 24 : 1}
    />
  );
  const cursor = { fill: "var(--foreground)", fillOpacity: 0.04 };
  const content = ({ active, payload }: { active?: boolean; payload?: readonly { payload?: Datum }[] }) => {
    const p = payload?.[0]?.payload;
    return active && p ? tooltip(p) : null;
  };
  const last = data.at(-1)!;

  return (
    <div role="img" aria-label={`XAUUSD, ${data.length} Kerzen, letzter Schluss ${formatNumber(last.close, 2)}`}>
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={MARGIN} barCategoryGap="15%" syncId="markt">
            <CartesianGrid vertical={false} stroke="var(--chart-grid)" strokeWidth={1} />
            {xAxis(false)}
            <YAxis
              domain={[ticks[0], ticks.at(-1)!]}
              ticks={ticks}
              interval={0}
              tickFormatter={(v: number) => formatNumber(v, 0)}
              tick={{ fill: "var(--chart-axis)", fontSize: "0.75rem" }}
              tickLine={false}
              axisLine={false}
              width={Y_WIDTH}
            />
            <Tooltip cursor={cursor} content={content} />
            <Bar dataKey="span" shape={(p: CandleProps) => <Candle {...p} />} isAnimationActive={false} />
            {recordLong && data[recordLong.index] && (
              <ReferenceDot
                x={recordLong.index}
                y={data[recordLong.index].high}
                shape={(p: DotProps) => <RecordMarker {...p} side="long" text={recordLong.text} />}
              />
            )}
            {recordShort && data[recordShort.index] && (
              <ReferenceDot
                x={recordShort.index}
                y={data[recordShort.index].low}
                shape={(p: DotProps) => <RecordMarker {...p} side="short" text={recordShort.text} />}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <div style={{ height: volumeHeight }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ ...MARGIN, top: 16 }} barCategoryGap="15%" syncId="markt">
            {xAxis(true)}
            <YAxis
              tickFormatter={(v: number) => new Intl.NumberFormat("de-DE", { notation: "compact" }).format(v)}
              tick={{ fill: "var(--chart-axis)", fontSize: "0.75rem" }}
              tickLine={false}
              axisLine={false}
              width={Y_WIDTH}
              tickCount={3}
            />
            <Tooltip cursor={cursor} content={content} />
            <Bar dataKey="volume" isAnimationActive={false} radius={[2, 2, 0, 0]}>
              {data.map((d) => (
                <Cell
                  key={d.key}
                  fill={topVolume.has(d.index) ? "var(--chart-line)" : "var(--muted-foreground)"}
                  fillOpacity={topVolume.has(d.index) ? 0.9 : 0.3}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
