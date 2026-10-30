import type { Json, Tables } from "@/lib/database.types";
import { formatNumber } from "@/lib/trading";

// KI-Schattenbetrieb: Die Gold-KI aus dem Projekt gold-ki (scripts/schatten.py) sagt jede M15-Kerze von XAUUSD
// voraus, rechnet gedachte Trades ab und lernt wöchentlich neu. Sie handelt nicht; geschrieben wird über ki_ingest().

export type KiStatus = Tables<"ki_status">;
export type KiPrediction = Pick<Tables<"ki_predictions">, "bar_at" | "close" | "pred_long" | "pred_short" | "made_at">;
export type KiBar = Pick<Tables<"ki_bars">, "bar_at" | "open" | "high" | "low" | "close">;
export type KiTrade = Tables<"ki_trades">;
export type KiModel = Tables<"ki_models">;
export type KiSide = "long" | "short";

/** Der Schattenbetrieb meldet sich alle 15 Minuten, auch bei geschlossenem Markt. */
export const STALE_MINUTES = 45;

export function isStale(runAt: string | null | undefined, now = new Date()) {
  if (!runAt) return true;
  return now.getTime() - new Date(runAt).getTime() > STALE_MINUTES * 60_000;
}

/** Gold handelt von Sonntag 18:00 bis Freitag 17:00 New-York-Zeit, werktags mit einer Stunde Pause ab 17:00. */
export function goldMarketOpen(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "numeric",
    hourCycle: "h23",
  }).formatToParts(now);
  const weekday = parts.find((p) => p.type === "weekday")?.value;
  const hour = Number(parts.find((p) => p.type === "hour")?.value);
  if (weekday === "Sat") return false;
  if (weekday === "Sun") return hour >= 18;
  if (weekday === "Fri" && hour >= 17) return false;
  return hour !== 17;
}

/** Vorhersagen und ihre Beiträge sind oft nur Tausendstel R: mit drei Stellen statt „+0 R“. */
export function formatPred(value: number | null | undefined) {
  if (value == null) return "–";
  return `${value > 0 ? "+" : ""}${formatNumber(value, 3)} R`;
}

/** Ein gedachter Trade gilt als Signal, sobald die Vorhersage über null liegt (Regel A aus Stufe 1). */
export function isSignal(pred: number | null | undefined) {
  return pred != null && pred > 0;
}

// Merkmale -----------------------------------------------------------------------

const FEATURE_LABELS: Record<string, string> = {
  cost_r: "Spread im Verhältnis zum Stop",
  atr_bp: "Volatilität (ATR in Basispunkten)",
  atr_ratio: "Volatilität kurz gegen lang",
  sma_20: "Abstand zum SMA 20",
  sma_50: "Abstand zum SMA 50",
  sma_200: "Abstand zum SMA 200",
  pos_24: "Lage in der Spanne der letzten 6 Stunden",
  pos_96: "Lage in der Spanne der letzten 24 Stunden",
  rsi: "RSI 14",
  body: "Kerzenkörper",
  wick_up: "Docht oben",
  wick_dn: "Docht unten",
  vol_20: "Tickvolumen gegen den Schnitt",
  vol_trend: "Trend des Tickvolumens",
  hour: "Uhrzeit",
  dow: "Wochentag",
  d_open: "Abstand zur Tageseröffnung",
  d_hi: "Abstand zum Tageshoch",
  d_lo: "Abstand zum Tagestief",
  pd_hi: "Abstand zum Vortageshoch",
  pd_lo: "Abstand zum Vortagestief",
};

/** „15 Minuten“, „Stunde“, „32 Stunden“ – passend hinter „der letzten“ */
function duration(minutes: number) {
  if (minutes < 60) return `${minutes} Minuten`;
  const hours = minutes / 60;
  return hours === 1 ? "Stunde" : `${hours.toLocaleString("de-DE")} Stunden`;
}

/** Lesbarer Name eines Merkmals aus gk.features; ret_k ist die Kursänderung über k M15-Kerzen. */
export function featureLabel(name: string) {
  const ret = /^ret_(\d+)$/.exec(name);
  if (ret) return `Kursänderung der letzten ${duration(Number(ret[1]) * 15)}`;
  return FEATURE_LABELS[name] ?? name;
}

const WEEKDAYS = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"];

function decimal(value: number, digits: number, signed = false) {
  return value.toLocaleString("de-DE", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
    signDisplay: signed ? "exceptZero" : "auto",
  });
}

/** Wert eines Merkmals in seiner Einheit: Abstände in ATR, Spannenlage in Prozent, Uhrzeit in New York. */
export function featureValue(name: string, value: number | null) {
  if (value == null) return "–";
  if (/^(ret_\d+|sma_\d+|d_open|pd_hi|pd_lo)$/.test(name)) return `${decimal(value, 1, true)} ATR`;
  switch (name) {
    case "d_hi":
    case "d_lo":
      return `${decimal(value, 1)} ATR`;
    case "cost_r":
      return `${decimal(value, 3)} R`;
    case "atr_bp":
      return `${decimal(value, 0)} bp`;
    case "atr_ratio":
    case "vol_20":
    case "vol_trend":
      return `${decimal(value, 2)}-fach`;
    case "pos_24":
    case "pos_96":
    case "wick_up":
    case "wick_dn":
      return `${decimal(value * 100, 0)} %`;
    case "body":
      return `${decimal(value * 100, 0, true)} %`;
    case "rsi":
      return decimal(value, 0);
    case "hour": {
      const minutes = Math.round(value * 60);
      return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")} New York`;
    }
    case "dow":
      return WEEKDAYS[Math.round(value)] ?? decimal(value, 0);
    default:
      return decimal(value, 3);
  }
}

export type Importance = { name: string; share: number }[];

function isRecord(value: Json | undefined): value is { [key: string]: Json | undefined } {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

/** Anteile der wichtigsten Merkmale eines Modells je Richtung (ki_models.importance). */
export function parseImportance(json: Json, side: KiSide): Importance {
  if (!isRecord(json)) return [];
  const list = json[side];
  if (!Array.isArray(list)) return [];
  return list.flatMap((item) =>
    isRecord(item) && typeof item.name === "string" && typeof item.share === "number"
      ? [{ name: item.name, share: item.share }]
      : [],
  );
}

// Bilanz ---------------------------------------------------------------------------

export type BandPoint = { n: number; lo: number; mid: number; hi: number };

/** Band des kumulierten R zufälliger Trades (ki_status.random_band), nach Trade-Nummer sortiert. */
export function parseBand(json: Json): BandPoint[] {
  if (!Array.isArray(json)) return [];
  return json
    .flatMap((item) =>
      isRecord(item) &&
      typeof item.n === "number" &&
      typeof item.lo === "number" &&
      typeof item.mid === "number" &&
      typeof item.hi === "number"
        ? [{ n: item.n, lo: item.lo, mid: item.mid, hi: item.hi }]
        : [],
    )
    .sort((a, b) => a.n - b.n);
}

export type BalancePoint = { n: number; time: string; r: number; cumulative: number; band: [number, number] | null; mid: number | null };

/**
 * Kumuliertes R der abgeschlossenen Trades in der Reihenfolge ihrer Signale, dazu das Zufallsband
 * an derselben Trade-Nummer. Das Band kommt ausgedünnt an und wird dazwischen linear ergänzt.
 */
export function balanceSeries(trades: Pick<KiTrade, "signal_at" | "r_net">[], band: BandPoint[]): BalancePoint[] {
  const sorted = [...trades].filter((t) => t.r_net != null).sort((a, b) => a.signal_at.localeCompare(b.signal_at));
  let cumulative = 0;
  return sorted.map((t, i) => {
    const n = i + 1;
    cumulative += t.r_net!;
    const b = bandAt(band, n);
    return {
      n,
      time: t.signal_at,
      r: t.r_net!,
      cumulative: Math.round(cumulative * 1000) / 1000,
      band: b ? [b.lo, b.hi] : null,
      mid: b?.mid ?? null,
    };
  });
}

function bandAt(band: BandPoint[], n: number): Omit<BandPoint, "n"> | null {
  if (!band.length || n < band[0].n || n > band.at(-1)!.n) return null;
  const upper = band.findIndex((p) => p.n >= n);
  const b = band[upper];
  if (b.n === n || upper === 0) return { lo: b.lo, mid: b.mid, hi: b.hi };
  const a = band[upper - 1];
  const f = (n - a.n) / (b.n - a.n);
  const mix = (x: number, y: number) => Math.round((x + (y - x) * f) * 1000) / 1000;
  return { lo: mix(a.lo, b.lo), mid: mix(a.mid, b.mid), hi: mix(a.hi, b.hi) };
}

// Trade im Chart ---------------------------------------------------------------------

/** URL-Schlüssel eines gedachten Trades: Richtung und Signalzeit in Sekunden, z. B. „short-1793289600“. */
export function tradeKey(trade: Pick<KiTrade, "side" | "signal_at">) {
  return `${trade.side}-${Math.round(Date.parse(trade.signal_at) / 1000)}`;
}

export function parseTradeKey(key: string): { side: KiSide; signalAt: string } | null {
  const match = /^(long|short)-(\d{9,11})$/.exec(key);
  if (!match) return null;
  return { side: match[1] as KiSide, signalAt: new Date(Number(match[2]) * 1000).toISOString() };
}

const BAR_MS = 15 * 60_000;

/** Index der Kerze, in die ein Zeitpunkt fällt, oder null außerhalb der Kerzen. */
export function barIndexAt(bars: Pick<KiBar, "bar_at">[], iso: string) {
  const t = Date.parse(iso);
  if (!bars.length || t < Date.parse(bars[0].bar_at) || t >= Date.parse(bars.at(-1)!.bar_at) + BAR_MS) return null;
  let lo = 0;
  let hi = bars.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (Date.parse(bars[mid].bar_at) <= t) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

export type ChartTrade = Pick<
  KiTrade,
  "side" | "signal_at" | "status" | "entry_at" | "entry_price" | "stop_price" | "target_price" | "exit_at" | "exit_price" | "exit_reason" | "r_net"
>;

export type TradeSpan = {
  signal: number | null;
  entry: number | null;
  exit: number | null;
  /** Bereich der SL/TP-Linien: vom Einstieg bis zum Ausstieg, bei laufenden Trades bis zur letzten Kerze */
  lines: [number, number] | null;
};

/**
 * Wo ein Trade auf den Kerzen liegt. Nach Zeit endet ein Trade zum Schluss seiner letzten Kerze; dieser Zeitpunkt
 * ist schon der Beginn der nächsten und zählt deshalb noch zur letzten. Linien, die vor oder nach den Kerzen
 * beginnen bzw. enden, werden am Rand abgeschnitten.
 */
export function tradeSpan(bars: Pick<KiBar, "bar_at">[], trade: ChartTrade): TradeSpan {
  const signal = barIndexAt(bars, trade.signal_at);
  const entry = trade.entry_at ? barIndexAt(bars, trade.entry_at) : null;
  const exitIso =
    trade.exit_at && trade.exit_reason === "Zeit" ? new Date(Date.parse(trade.exit_at) - 1).toISOString() : trade.exit_at;
  const exit = exitIso ? barIndexAt(bars, exitIso) : null;
  if (!trade.entry_at || !bars.length) return { signal, entry, exit, lines: null };

  const first = Date.parse(bars[0].bar_at);
  const lastEnd = Date.parse(bars.at(-1)!.bar_at) + BAR_MS;
  const from = entry ?? (Date.parse(trade.entry_at) < first ? 0 : null);
  const to = exit ?? (!exitIso || Date.parse(exitIso) >= lastEnd ? bars.length - 1 : null);
  return { signal, entry, exit, lines: from != null && to != null && from <= to ? [from, to] : null };
}

export type Reasons = {
  base: number;
  rest: number;
  items: { name: string; value: number | null; contrib: number }[];
  /** nachträglich mit dem Modell von damals gerechnet */
  later: boolean;
};

/** Gründe eines Signals (ki_trades.reasons): Ausgangswert, größte Beiträge der Merkmale, Rest. */
export function parseReasons(json: Json): Reasons | null {
  if (!isRecord(json) || typeof json.base !== "number" || !Array.isArray(json.items)) return null;
  return {
    base: json.base,
    rest: typeof json.rest === "number" ? json.rest : 0,
    items: json.items.flatMap((item) =>
      isRecord(item) && typeof item.name === "string" && typeof item.contrib === "number"
        ? [{ name: item.name, value: typeof item.value === "number" ? item.value : null, contrib: item.contrib }]
        : [],
    ),
    later: json.later === true,
  };
}

/** Kurzbeschreibung des Stands eines gedachten Trades. */
export function tradeState(trade: Pick<KiTrade, "status" | "exit_reason">) {
  if (trade.status === "wartet") return "wartet auf den Einstieg";
  if (trade.status === "offen") return "läuft";
  return trade.exit_reason === "Ziel" ? "Ziel erreicht" : trade.exit_reason === "Stop" ? "Stop" : "nach 12 Stunden beendet";
}
