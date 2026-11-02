import type { KiBar, KiTrade } from "@/lib/ki";
import { TIME_ZONE } from "@/lib/trading";

// Kerzenchart der gedachten Trades (components/charts/ki-trade-chart.tsx): Zeitrahmen, Uhrzeit Berlin und wo ein
// Trade auf den Kerzen liegt. Ohne die Chart-Bibliothek, damit es testbar bleibt.

export const TIMEFRAMES = { M15: 15, H1: 60, H4: 240 } as const;
export type Timeframe = keyof typeof TIMEFRAMES;

const MINUTE = 60_000;

/** Serverzeit von VT Markets: New York + 7 Stunden, also 0 Uhr zur Tagespause um 17 Uhr New York. */
const SERVER_ZONE = "America/New_York";
const SERVER_SHIFT_MINUTES = 7 * 60;

const offsetFormats = new Map<string, Intl.DateTimeFormat>();

/** Abstand einer Zeitzone zu UTC in Minuten zu einem Zeitpunkt, z. B. Berlin im Winter 60. */
export function zoneOffsetMinutes(ms: number, timeZone: string) {
  let format = offsetFormats.get(timeZone);
  if (!format) {
    format = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
    });
    offsetFormats.set(timeZone, format);
  }
  const p = Object.fromEntries(format.formatToParts(ms).map((part) => [part.type, part.value]));
  const wall = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute));
  return Math.round((wall - Math.floor(ms / MINUTE) * MINUTE) / MINUTE);
}

/**
 * Zeitstempel für die Chart-Bibliothek in Sekunden. Sie zeigt alles in UTC an; verschoben um den Abstand zu Berlin
 * stehen auf Achse und Fadenkreuz die Berliner Uhrzeiten.
 */
export function chartTime(ms: number) {
  return Math.floor(ms / 1000) + zoneOffsetMinutes(ms, TIME_ZONE) * 60;
}

export type ChartCandle = {
  /** Zeitstempel für die Chart-Bibliothek (Berliner Uhrzeit als UTC) */
  time: number;
  /** Beginn und Ende der Kerze in UTC-Millisekunden */
  start: number;
  end: number;
  open: number;
  high: number;
  low: number;
  close: number;
};

/** Beginn der Kerze im Zeitrahmen, in die ein Zeitpunkt fällt. H4 beginnt wie bei MT5 um 0, 4, 8 … Uhr Serverzeit. */
function candleStart(ms: number, timeframe: Timeframe) {
  const size = TIMEFRAMES[timeframe] * MINUTE;
  const shift = timeframe === "H4" ? (zoneOffsetMinutes(ms, SERVER_ZONE) + SERVER_SHIFT_MINUTES) * MINUTE : 0;
  return Math.floor((ms + shift) / size) * size - shift;
}

/** Fasst die M15-Kerzen (aufsteigend sortiert) zum Zeitrahmen zusammen. */
export function aggregateBars(bars: KiBar[], timeframe: Timeframe): ChartCandle[] {
  const size = TIMEFRAMES[timeframe] * MINUTE;
  const candles: ChartCandle[] = [];
  for (const bar of bars) {
    const start = candleStart(Date.parse(bar.bar_at), timeframe);
    const last = candles.at(-1);
    if (last?.start === start) {
      last.high = Math.max(last.high, bar.high);
      last.low = Math.min(last.low, bar.low);
      last.close = bar.close;
      continue;
    }
    const time = chartTime(start);
    // Bei der Zeitumstellung im Herbst gibt es eine Berliner Stunde zweimal; Gold ist dann geschlossen.
    if (last && time <= last.time) continue;
    candles.push({ time, start, end: start + size, open: bar.open, high: bar.high, low: bar.low, close: bar.close });
  }
  return candles;
}

/** Index der Kerze, in die ein Zeitpunkt fällt (in einer Pause die zuletzt begonnene), oder null außerhalb. */
export function candleIndexAt(candles: Pick<ChartCandle, "start" | "end">[], ms: number) {
  if (!candles.length || ms < candles[0].start || ms >= candles.at(-1)!.end) return null;
  let lo = 0;
  let hi = candles.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (candles[mid].start <= ms) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

export type ChartTrade = Pick<
  KiTrade,
  "side" | "signal_at" | "status" | "entry_at" | "entry_price" | "stop_price" | "target_price" | "exit_at" | "exit_price" | "exit_reason" | "r_net"
>;

export type TradePlacement = {
  signal: number | null;
  entry: number | null;
  exit: number | null;
  /** Kerzen der Box vom Einstieg bis zum Ausstieg, bei laufenden Trades bis zur letzten Kerze */
  box: [number, number] | null;
};

/**
 * Wo ein Trade auf den Kerzen liegt. Nach Zeit endet ein Trade zum Schluss seiner letzten Kerze; dieser Zeitpunkt
 * ist schon der Beginn der nächsten und zählt deshalb noch zur letzten. Boxen, die vor oder nach den Kerzen beginnen
 * bzw. enden, werden am Rand abgeschnitten.
 */
export function placeTrade(candles: Pick<ChartCandle, "start" | "end">[], trade: ChartTrade): TradePlacement {
  const at = (iso: string | null) => (iso ? candleIndexAt(candles, Date.parse(iso)) : null);
  const exitMs = trade.exit_at ? Date.parse(trade.exit_at) - (trade.exit_reason === "Zeit" ? 1 : 0) : null;
  const signal = at(trade.signal_at);
  const entry = at(trade.entry_at);
  const exit = exitMs == null ? null : candleIndexAt(candles, exitMs);
  if (!trade.entry_at || !candles.length) return { signal, entry, exit, box: null };

  const lastEnd = candles.at(-1)!.end;
  const from = entry ?? (Date.parse(trade.entry_at) < candles[0].start ? 0 : null);
  const to = exit ?? (exitMs == null || exitMs >= lastEnd ? candles.length - 1 : null);
  return { signal, entry, exit, box: from != null && to != null && from <= to ? [from, to] : null };
}

/** Kerzen-Indizes von `fromMs` bis `toMs`, am Rand der Kerzen begrenzt; null ohne Kerzen. */
export function visibleRange(candles: ChartCandle[], fromMs: number, toMs: number) {
  if (!candles.length) return null;
  const clamped = (ms: number) => candleIndexAt(candles, ms) ?? (ms < candles[0].start ? 0 : candles.length - 1);
  return { from: clamped(fromMs), to: clamped(toMs) };
}
