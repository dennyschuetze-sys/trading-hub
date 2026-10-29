import type { Json, Tables } from "@/lib/database.types";

// KI-Schattenbetrieb: Die Gold-KI aus dem Projekt gold-ki (scripts/schatten.py) sagt jede M15-Kerze von XAUUSD
// voraus, rechnet gedachte Trades ab und lernt wöchentlich neu. Sie handelt nicht; geschrieben wird über ki_ingest().

export type KiStatus = Tables<"ki_status">;
export type KiPrediction = Pick<Tables<"ki_predictions">, "bar_at" | "close" | "pred_long" | "pred_short" | "made_at">;
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

/** Kurzbeschreibung des Stands eines gedachten Trades. */
export function tradeState(trade: Pick<KiTrade, "status" | "exit_reason">) {
  if (trade.status === "wartet") return "wartet auf den Einstieg";
  if (trade.status === "offen") return "läuft";
  return trade.exit_reason === "Ziel" ? "Ziel erreicht" : trade.exit_reason === "Stop" ? "Stop" : "nach 12 Stunden beendet";
}
