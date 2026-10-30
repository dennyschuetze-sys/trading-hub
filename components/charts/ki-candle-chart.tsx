"use client";

import {
  Bar,
  CartesianGrid,
  ComposedChart,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { tradeSpan, type ChartTrade, type KiBar } from "@/lib/ki";
import { formatDateTime, formatNumber, formatR } from "@/lib/trading";
import { ChartTooltipBox } from "./chart-tooltip";
import { clockTime, niceTicks, shortDate } from "./format";

export type CandleTrade = ChartTrade & { href?: string };

type Datum = KiBar & { index: number; range: [number, number] };
export type CandleProps = {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  payload?: Pick<KiBar, "open" | "high" | "low" | "close">;
};
type DotProps = { cx?: number; cy?: number };

/** Kerze: recharts liefert das Rechteck von Hoch bis Tief, Körper und Docht werden darin gezeichnet. */
export function Candle({ x = 0, y = 0, width = 0, height = 0, payload }: CandleProps) {
  if (!payload) return null;
  const { open, high, low, close } = payload;
  const color = close >= open ? "var(--profit)" : "var(--loss)";
  const scale = high > low ? height / (high - low) : 0;
  const top = y + (high - Math.max(open, close)) * scale;
  const bottom = y + (high - Math.min(open, close)) * scale;
  const cx = x + width / 2;
  const body = Math.max(1, width * 0.7);
  return (
    <g opacity={0.85}>
      <line x1={cx} x2={cx} y1={y} y2={y + height} stroke={color} strokeWidth={1} />
      <rect x={cx - body / 2} y={top} width={body} height={Math.max(1, bottom - top)} fill={color} />
    </g>
  );
}

/** Einstieg als Dreieck in Trade-Richtung; mit href ein Link zur Trade-Seite. */
function EntryMarker({ cx = 0, cy = 0, side, href }: DotProps & { side: string; href?: string }) {
  const s = 6;
  const points =
    side === "long"
      ? `${cx},${cy - s} ${cx - s},${cy + s} ${cx + s},${cy + s}`
      : `${cx},${cy + s} ${cx - s},${cy - s} ${cx + s},${cy - s}`;
  const marker = <polygon points={points} fill="var(--chart-line)" stroke="var(--card)" strokeWidth={1.5} />;
  return href ? (
    <a href={href} aria-label={`${side === "long" ? "Long" : "Short"}-Trade öffnen`} className="cursor-pointer">
      {marker}
    </a>
  ) : (
    marker
  );
}

function ExitMarker({ cx = 0, cy = 0, r }: DotProps & { r: number | null }) {
  const fill = r == null || r === 0 ? "var(--foreground)" : r > 0 ? "var(--profit)" : "var(--loss)";
  return <circle cx={cx} cy={cy} r={4.5} fill={fill} stroke="var(--card)" strokeWidth={1.5} />;
}

/**
 * M15-Kerzen mit den gedachten Trades der KI: Dreieck = Einstieg in Trade-Richtung, Punkt = Ausstieg (grün mit
 * Gewinn, rot mit Verlust), rot gestrichelt der Stop, grün gestrichelt das Ziel, gepunktet der Einstiegskurs.
 * Mit `focus` (Signalzeit) werden die Linien dieses Trades beschriftet und die Signalkerze markiert.
 */
export function KiCandleChart({
  bars,
  trades,
  focus,
  height = 340,
}: {
  bars: KiBar[];
  trades: CandleTrade[];
  focus?: string;
  height?: number;
}) {
  if (bars.length < 2) {
    return (
      <div className="flex items-center justify-center text-center text-sm text-muted-foreground" style={{ height }}>
        Noch keine Kerzen. Der Schattenbetrieb meldet sie mit jedem Lauf.
      </div>
    );
  }

  const data: Datum[] = bars.map((b, index) => ({ ...b, index, range: [b.low, b.high] }));
  const shown = trades
    .map((trade) => ({ trade, span: tradeSpan(bars, trade) }))
    .filter(({ span }) => span.signal != null || span.lines != null);

  const prices = data.flatMap((d) => [d.low, d.high]);
  for (const { trade, span } of shown) {
    if (span.lines) prices.push(...[trade.stop_price, trade.target_price].filter((v): v is number => v != null));
  }
  const pad = (Math.max(...prices) - Math.min(...prices)) * 0.04 || 1;
  const ticks = niceTicks(Math.min(...prices) - pad, Math.max(...prices) + pad);

  // X-Achse: neuer Tag mit Datum, sonst Uhrzeit; höchstens acht Beschriftungen
  const every = Math.ceil(data.length / 8);
  const xTicks = data.filter((_, i) => i % every === 0).map((d) => d.index);
  const tickLabel = (i: number) => {
    const d = data[i] ?? data[0];
    const prev = data[i - every];
    return !prev || shortDate(prev.bar_at) !== shortDate(d.bar_at) ? `${shortDate(d.bar_at)} ${clockTime(d.bar_at)}` : clockTime(d.bar_at);
  };

  const overlays = shown.flatMap(({ trade: t, span }) => {
    const key = `${t.side}|${t.signal_at}`;
    const focused = focus === t.signal_at;
    const label = (text: string, fill: string) =>
      focused ? { value: text, position: "insideTopLeft" as const, fill, fontSize: 11 } : undefined;
    const items = [];
    if (focused && span.signal != null) {
      items.push(
        <ReferenceLine
          key={`${key}|signal`}
          x={span.signal}
          stroke="var(--chart-line)"
          strokeOpacity={0.7}
          strokeDasharray="2 3"
          label={{ value: "Signal", position: "insideTopRight", fill: "var(--chart-line)", fontSize: 11 }}
        />,
      );
    }
    if (span.lines) {
      const [from, to] = span.lines;
      const width = focused ? 1.5 : 1;
      if (t.stop_price != null) {
        items.push(
          <ReferenceLine
            key={`${key}|sl`}
            segment={[
              { x: from, y: t.stop_price },
              { x: to, y: t.stop_price },
            ]}
            stroke="var(--loss)"
            strokeDasharray="5 3"
            strokeWidth={width}
            label={label(`SL ${formatNumber(t.stop_price, 2)}`, "var(--loss)")}
          />,
        );
      }
      if (t.target_price != null) {
        items.push(
          <ReferenceLine
            key={`${key}|tp`}
            segment={[
              { x: from, y: t.target_price },
              { x: to, y: t.target_price },
            ]}
            stroke="var(--profit)"
            strokeDasharray="5 3"
            strokeWidth={width}
            label={label(`TP ${formatNumber(t.target_price, 2)}`, "var(--profit)")}
          />,
        );
      }
      if (t.entry_price != null) {
        items.push(
          <ReferenceLine
            key={`${key}|entry-line`}
            segment={[
              { x: from, y: t.entry_price },
              { x: to, y: t.entry_price },
            ]}
            stroke="var(--chart-line)"
            strokeDasharray="1 3"
            strokeWidth={width}
          />,
        );
      }
    }
    if (span.entry != null && t.entry_price != null) {
      items.push(
        <ReferenceDot
          key={`${key}|entry`}
          x={span.entry}
          y={t.entry_price}
          shape={(p: DotProps) => <EntryMarker {...p} side={t.side} href={t.href} />}
        />,
      );
    }
    if (span.exit != null && t.exit_price != null) {
      items.push(
        <ReferenceDot key={`${key}|exit`} x={span.exit} y={t.exit_price} shape={(p: DotProps) => <ExitMarker {...p} r={t.r_net} />} />,
      );
    }
    return items;
  });

  const tradesLabel = shown.length === 1 ? "einem gedachten Trade" : `${shown.length} gedachten Trades`;

  return (
    <div style={{ height }} role="img" aria-label={`Goldkurs M15 mit ${tradesLabel}, letzter Schluss ${formatNumber(data.at(-1)!.close, 2)}`}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap="15%">
          <CartesianGrid vertical={false} stroke="var(--chart-grid)" strokeWidth={1} />
          <XAxis
            dataKey="index"
            type="category"
            ticks={xTicks}
            interval={0}
            tickFormatter={tickLabel}
            tick={{ fill: "var(--chart-axis)", fontSize: "0.75rem" }}
            tickLine={false}
            axisLine={{ stroke: "var(--chart-grid)" }}
          />
          <YAxis
            domain={[ticks[0], ticks.at(-1)!]}
            ticks={ticks}
            tickFormatter={(v: number) => formatNumber(v, 0)}
            tick={{ fill: "var(--chart-axis)", fontSize: "0.75rem" }}
            tickLine={false}
            axisLine={false}
            width={56}
          />
          <Tooltip
            cursor={{ fill: "var(--foreground)", fillOpacity: 0.04 }}
            content={({ active, payload }) => {
              const p = payload?.[0]?.payload as Datum | undefined;
              if (!active || !p) return null;
              const here = shown.filter(({ span }) => span.entry === p.index || span.exit === p.index);
              return (
                <ChartTooltipBox
                  value={`Schluss ${formatNumber(p.close, 2)}`}
                  label={formatDateTime(p.bar_at)}
                  detail={[
                    `Eröffnung ${formatNumber(p.open, 2)} · Hoch ${formatNumber(p.high, 2)} · Tief ${formatNumber(p.low, 2)}`,
                    ...here.map(({ trade, span }) =>
                      span.entry === p.index
                        ? `Einstieg ${trade.side === "long" ? "Long" : "Short"} ${formatNumber(trade.entry_price, 2)}`
                        : `Ausstieg ${trade.exit_reason ?? ""} ${formatNumber(trade.exit_price, 2)} · ${formatR(trade.r_net)}`,
                    ),
                  ].join(" · ")}
                />
              );
            }}
          />
          <Bar dataKey="range" shape={(p: CandleProps) => <Candle {...p} />} isAnimationActive={false} />
          {overlays}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
