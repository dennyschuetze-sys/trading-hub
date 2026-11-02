"use client";

import type { KiBar } from "@/lib/ki";

export type CandleProps = {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  payload?: Pick<KiBar, "open" | "high" | "low" | "close">;
};

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
