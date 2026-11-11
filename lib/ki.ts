import type { Json, Tables } from "@/lib/database.types";
import type { Timeframe } from "@/lib/ki-chart";
import { formatNumber } from "@/lib/trading";

// KI-Schattenbetrieb: Die Gold-KI aus dem Projekt gold-ki (scripts/schatten.py) sagt jede M15-Kerze von XAUUSD
// voraus, rechnet gedachte Trades ab und lernt wöchentlich neu. Sie handelt nicht; geschrieben wird über ki_ingest().
// Daneben läuft seit 03.11.2026 die Vorwärtsprobe NAS100 Long (scripts/schatten_nas100.py, eingefrorenes Modell)
// und seit 04.11.2026 Gold auf M5 (scripts/schatten_m5.py, lernt seit 11.11. wöchentlich, Trades höchstens 4 Stunden).
// Seit 11.11.2026 läuft NAS100 Long ein zweites Mal, lernend (scripts/schatten_nas100_lernt.py, market NAS100-L).

export type KiMarket = "XAUUSD" | "NAS100" | "NAS100-L" | "XAUUSD-M5";

export const KI_MARKETS: Record<
  KiMarket,
  { slug: string; label: string; symbol: string; sides: KiSide[]; timeframes: Timeframe[]; hold: string }
> = {
  XAUUSD: {
    slug: "gold",
    label: "Gold M15",
    symbol: "XAUUSD-VIP",
    sides: ["long", "short"],
    timeframes: ["M15", "H1", "H4"],
    hold: "12 Stunden",
  },
  "XAUUSD-M5": {
    slug: "gold-m5",
    label: "Gold M5",
    symbol: "XAUUSD-VIP",
    sides: ["long", "short"],
    timeframes: ["M5", "M15", "H1"],
    hold: "4 Stunden",
  },
  NAS100: {
    slug: "nas100",
    label: "NAS100",
    symbol: "NAS100.",
    sides: ["long"],
    timeframes: ["M15", "H1", "H4"],
    hold: "12 Stunden",
  },
  "NAS100-L": {
    slug: "nas100-lernt",
    label: "NAS100 lernend",
    symbol: "NAS100.",
    sides: ["long"],
    timeframes: ["M15", "H1", "H4"],
    hold: "12 Stunden",
  },
};

/** Markt aus ?markt=…; ohne oder unbekannt: Gold. */
export function parseMarket(value: string | string[] | undefined): KiMarket {
  return (Object.keys(KI_MARKETS) as KiMarket[]).find((m) => KI_MARKETS[m].slug === value) ?? "XAUUSD";
}

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

// Trade-Seite ---------------------------------------------------------------------------

/**
 * URL-Schlüssel eines gedachten Trades: Richtung und Signalzeit in Sekunden, z. B. „short-1793289600“; außer bei
 * Gold mit dem Markt davor, z. B. „nas100-long-1793289600“, „nas100-lernt-long-1793289600“ oder „gold-m5-short-1793289600“.
 */
export function tradeKey(trade: Pick<KiTrade, "side" | "signal_at"> & { market?: string }) {
  const market = KI_MARKETS[trade.market as KiMarket];
  const prefix = market && trade.market !== "XAUUSD" ? `${market.slug}-` : "";
  return `${prefix}${trade.side}-${Math.round(Date.parse(trade.signal_at) / 1000)}`;
}

export function parseTradeKey(key: string): { market: KiMarket; side: KiSide; signalAt: string } | null {
  const match = /^(?:(nas100-lernt|nas100|gold-m5)-)?(long|short)-(\d{9,11})$/.exec(key);
  if (!match) return null;
  return {
    market: match[1] ? parseMarket(match[1]) : "XAUUSD",
    side: match[2] as KiSide,
    signalAt: new Date(Number(match[3]) * 1000).toISOString(),
  };
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
export function tradeState(trade: Pick<KiTrade, "status" | "exit_reason"> & { market?: string }) {
  if (trade.status === "wartet") return "wartet auf den Einstieg";
  if (trade.status === "offen") return "läuft";
  const hold = KI_MARKETS[trade.market as KiMarket]?.hold ?? KI_MARKETS.XAUUSD.hold;
  return trade.exit_reason === "Ziel" ? "Ziel erreicht" : trade.exit_reason === "Stop" ? "Stop" : `nach ${hold} beendet`;
}
