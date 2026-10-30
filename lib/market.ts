import type { Tables } from "@/lib/database.types";

// Markt-Statistik: Tageskerzen von XAUUSD (bis Februar 2024 Dukascopy, danach VT) und die gehandelten Kontrakte der
// Gold-Futures an der COMEX (TradingView GC1! + GC2!). Gemeldet vom Skript markt-statistik/scripts/melden.py über
// market_ingest(). Handelstag wie bei VT: Tagesgrenze 17:00 New York, Tage als „YYYY-MM-DD“.

export const MARKET_SYMBOL = "XAUUSD";

export type MarketDayRow = Pick<Tables<"market_days">, "day" | "open" | "high" | "low" | "close">;
export type MarketVolumeRow = Pick<Tables<"market_volumes">, "day" | "contracts_front" | "contracts_next">;
/** Tageskerze mit den Kontrakten beider Futures zusammen; null, wenn für den Tag kein Volumen gemeldet ist. */
export type MarketDay = MarketDayRow & { volume: number | null };

export type MarketUnit = "tage" | "wochen" | "monate" | "jahre";
export type MarketRange = "7t" | "4w" | "3m" | "12m" | "5j" | "alles";

export const MARKET_UNITS: { value: MarketUnit; label: string; one: string }[] = [
  { value: "tage", label: "Tage", one: "Tag" },
  { value: "wochen", label: "Wochen", one: "Woche" },
  { value: "monate", label: "Monate", one: "Monat" },
  { value: "jahre", label: "Jahre", one: "Jahr" },
];

export const MARKET_RANGES: { value: MarketRange; label: string; long: string }[] = [
  { value: "7t", label: "7 T", long: "letzte 7 Tage" },
  { value: "4w", label: "4 W", long: "letzte 4 Wochen" },
  { value: "3m", label: "3 M", long: "letzte 3 Monate" },
  { value: "12m", label: "12 M", long: "letzte 12 Monate" },
  { value: "5j", label: "5 J", long: "letzte 5 Jahre" },
  { value: "alles", label: "Alles", long: "alle Daten" },
];

const UNIT_ORDER = MARKET_UNITS.map((u) => u.value);
const RANGE_ORDER = MARKET_RANGES.map((r) => r.value);

/** Ab welchem Zeitraum eine Einheit sinnvoll ist – eine Wochen-Rangliste über 7 Tage hätte eine Zeile. */
const UNIT_MIN_RANGE: Record<MarketUnit, MarketRange> = { tage: "7t", wochen: "4w", monate: "3m", jahre: "5j" };

export function unitAllowed(unit: MarketUnit, range: MarketRange) {
  return RANGE_ORDER.indexOf(range) >= RANGE_ORDER.indexOf(UNIT_MIN_RANGE[unit]);
}

/** Einheit und Zeitraum aus der Adresse; passt die Einheit nicht zum Zeitraum, gilt die nächstkleinere. */
export function parseMarketParams(sp: { einheit?: string | string[]; zeitraum?: string | string[] }) {
  const range = MARKET_RANGES.find((r) => r.value === sp.zeitraum)?.value ?? "3m";
  const wanted = MARKET_UNITS.find((u) => u.value === sp.einheit)?.value ?? "tage";
  const unit =
    UNIT_ORDER.slice(0, UNIT_ORDER.indexOf(wanted) + 1)
      .reverse()
      .find((u) => unitAllowed(u, range)) ?? "tage";
  return { unit, range };
}

export function joinVolumes(days: MarketDayRow[], volumes: MarketVolumeRow[]): MarketDay[] {
  const byDay = new Map(volumes.map((v) => [v.day, v.contracts_front + (v.contracts_next ?? 0)]));
  return days.map((d) => ({ ...d, volume: byDay.get(d.day) ?? null }));
}

// Kalender ------------------------------------------------------------------------

const DAY_MS = 86_400_000;
const toMs = (day: string) => Date.parse(`${day}T00:00:00Z`);
const fromMs = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export function addDays(day: string, n: number) {
  return fromMs(toMs(day) + n * DAY_MS);
}

/** Monate addieren; der Tag bleibt, gekappt auf das Monatsende (31.03. − 1 Monat = 28./29.02.). */
export function addMonths(day: string, n: number) {
  const [y, m, d] = day.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1 + n, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  return fromMs(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), Math.min(d, last)));
}

/** 0 = Sonntag … 6 = Samstag */
export function weekday(day: string) {
  return new Date(toMs(day)).getUTCDay();
}

export function isoWeek(day: string) {
  const date = new Date(toMs(day));
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7) + 3); // Donnerstag derselben Woche
  const year = date.getUTCFullYear();
  return { year, week: 1 + Math.floor((date.getTime() - Date.UTC(year, 0, 1)) / (7 * DAY_MS)) };
}

/** Kalenderzeitraum, zu dem ein Handelstag gehört: Wochen beginnen montags. */
export function periodOf(day: string, unit: MarketUnit): { key: string; start: string } {
  switch (unit) {
    case "tage":
      return { key: day, start: day };
    case "wochen": {
      const start = addDays(day, -((weekday(day) + 6) % 7));
      return { key: start, start };
    }
    case "monate":
      return { key: day.slice(0, 7), start: `${day.slice(0, 7)}-01` };
    case "jahre":
      return { key: day.slice(0, 4), start: `${day.slice(0, 4)}-01-01` };
  }
}

/** Der laufende Handelstag: New-York-Zeit + 7 h, wie die VT-Serverzeit. */
export function currentTradeDay(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(now.getTime() + 7 * 3_600_000));
}

/** Nächster Tag mit Handel ab heute: am Wochenende der Montag. */
function nextSession(today: string) {
  const wd = weekday(today);
  return wd === 6 ? addDays(today, 2) : wd === 0 ? addDays(today, 1) : today;
}

// Kerzen ------------------------------------------------------------------------

export type MarketCandle = {
  key: string;
  unit: MarketUnit;
  /** Kalenderbeginn (Montag, Monatserster, 1. Januar) – danach richtet sich der Zeitraum-Filter */
  start: string;
  /** Erster und letzter Handelstag in der Kerze */
  from: string;
  to: string;
  days: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
  move: number;
  movePct: number;
  range: number;
  rangePct: number;
  /** Woche, Monat oder Jahr ist noch nicht vorbei */
  running: boolean;
};

/** Tage (aufsteigend sortiert) zu Kerzen der Einheit zusammenfassen. `today` = laufender Handelstag. */
export function aggregate(days: MarketDay[], unit: MarketUnit, today?: string): MarketCandle[] {
  const groups: { key: string; start: string; days: MarketDay[] }[] = [];
  for (const d of days) {
    const p = periodOf(d.day, unit);
    if (groups.at(-1)?.key !== p.key) groups.push({ ...p, days: [] });
    groups.at(-1)!.days.push(d);
  }
  const open = today ? periodOf(nextSession(today), unit).key : null;
  return groups.map(({ key, start, days: g }) => {
    const first = g[0];
    const last = g.at(-1)!;
    const high = Math.max(...g.map((d) => d.high));
    const low = Math.min(...g.map((d) => d.low));
    const volumes = g.map((d) => d.volume).filter((v): v is number => v != null);
    return {
      key,
      unit,
      start,
      from: first.day,
      to: last.day,
      days: g.length,
      open: first.open,
      high,
      low,
      close: last.close,
      volume: volumes.length ? volumes.reduce((a, b) => a + b, 0) : null,
      move: last.close - first.open,
      movePct: ((last.close - first.open) / first.open) * 100,
      range: high - low,
      rangePct: ((high - low) / first.open) * 100,
      running: unit !== "tage" && key === open,
    };
  });
}

/** Grenze des Zeitraums, vom letzten Handelstag zurückgezählt; null = alles. */
export function rangeBoundary(lastDay: string, range: MarketRange) {
  switch (range) {
    case "7t":
      return addDays(lastDay, -7);
    case "4w":
      return addDays(lastDay, -28);
    case "3m":
      return addMonths(lastDay, -3);
    case "12m":
      return addMonths(lastDay, -12);
    case "5j":
      return addMonths(lastDay, -60);
    case "alles":
      return null;
  }
}

/** Kerzen, die nach der Grenze beginnen – so sind „12 M“ in Monaten genau zwölf Monate, „4 W“ vier Wochen. */
export function inRange(candles: MarketCandle[], range: MarketRange) {
  const last = candles.at(-1);
  const boundary = last ? rangeBoundary(last.to, range) : null;
  return boundary ? candles.filter((c) => c.start > boundary) : candles;
}

// Auswertung ----------------------------------------------------------------------

export type MoveSide = "long" | "short";
export type MoveBasis = "usd" | "pct";

/** Größte Bewegungen einer Richtung, nach Dollar oder Prozent; nur Kerzen, die in diese Richtung geschlossen haben. */
export function topMoves(candles: MarketCandle[], side: MoveSide, basis: MoveBasis, n = 10) {
  const value = (c: MarketCandle) => (basis === "usd" ? c.move : c.movePct);
  const sign = side === "long" ? 1 : -1;
  return candles
    .filter((c) => sign * value(c) > 0)
    .sort((a, b) => sign * (value(b) - value(a)))
    .slice(0, n);
}

export function topVolume(candles: MarketCandle[], n = 10) {
  return candles
    .filter((c) => c.volume != null)
    .sort((a, b) => b.volume! - a.volume!)
    .slice(0, n);
}

const mean = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : null);

export function marketSummary(candles: MarketCandle[]) {
  const withVolume = candles.filter((c) => c.volume != null);
  return {
    count: candles.length,
    up: candles.filter((c) => c.move > 0).length,
    avgRange: mean(candles.map((c) => c.range)),
    avgRangePct: mean(candles.map((c) => c.rangePct)),
    avgVolume: mean(withVolume.map((c) => c.volume!)),
    biggest: candles.reduce<MarketCandle | null>((m, c) => (!m || Math.abs(c.movePct) > Math.abs(m.movePct) ? c : m), null),
    maxVolume: topVolume(withVolume, 1)[0] ?? null,
  };
}

export const WEEKDAY_LABELS = ["Mo", "Di", "Mi", "Do", "Fr"];

/** Durchschnitt je Wochentag aus Tageskerzen. */
export function weekdayStats(candles: MarketCandle[]) {
  return WEEKDAY_LABELS.map((label, i) => {
    const own = candles.filter((c) => weekday(c.from) === i + 1);
    const withVolume = own.filter((c) => c.volume != null);
    return {
      label,
      count: own.length,
      avgRangePct: mean(own.map((c) => c.rangePct)),
      avgRange: mean(own.map((c) => c.range)),
      avgVolume: mean(withVolume.map((c) => c.volume!)),
      upShare: own.length ? own.filter((c) => c.move > 0).length / own.length : null,
    };
  });
}

/** Mehr Kerzen werden im Chart zu dünnen Strichen – dann eine Einheit gröber. */
export const MAX_CHART_CANDLES = 280;

export function chartCandles(days: MarketDay[], unit: MarketUnit, range: MarketRange, today?: string) {
  let candles: MarketCandle[] = [];
  for (const u of UNIT_ORDER.slice(UNIT_ORDER.indexOf(unit))) {
    candles = inRange(aggregate(days, u, today), range);
    if (candles.length <= MAX_CHART_CANDLES) break;
  }
  return candles;
}

/** Index der Chart-Kerze, in der eine (gleich große oder kleinere) Kerze liegt. */
export function containingIndex(chart: MarketCandle[], candle: MarketCandle | null | undefined) {
  if (!candle) return -1;
  return chart.findIndex((c) => c.from <= candle.from && candle.to <= c.to);
}

// Beschriftung ------------------------------------------------------------------

const WEEKDAY_SHORT = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
const MONTH_SHORT = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];

/** „29.10.2026“ ohne Zeitzonen-Umweg */
export function dayLabel(day: string) {
  return `${day.slice(8, 10)}.${day.slice(5, 7)}.${day.slice(0, 4)}`;
}

export function candleLabel(c: MarketCandle) {
  switch (c.unit) {
    case "tage":
      return `${WEEKDAY_SHORT[weekday(c.from)]} ${dayLabel(c.from)}`;
    case "wochen": {
      const { year, week } = isoWeek(c.start);
      return `KW ${week}/${year}`;
    }
    case "monate":
      return `${MONTH_SHORT[Number(c.key.slice(5, 7)) - 1]} ${c.key.slice(0, 4)}`;
    case "jahre":
      return c.key;
  }
}

/** Kurze Beschriftung für die Zeitachse */
export function axisLabel(c: MarketCandle) {
  switch (c.unit) {
    case "tage":
    case "wochen":
      return `${c.start.slice(8, 10)}.${c.start.slice(5, 7)}.`;
    case "monate":
      return `${MONTH_SHORT[Number(c.key.slice(5, 7)) - 1]} ${c.key.slice(2, 4)}`;
    case "jahre":
      return c.key;
  }
}

/** Handelstage einer zusammengefassten Kerze: „26.10.–30.10.2026“ */
export function candleSpan(c: MarketCandle) {
  return c.from === c.to ? dayLabel(c.from) : `${dayLabel(c.from).slice(0, 6)}–${dayLabel(c.to)}`;
}

const fixed = (value: number, digits: number) =>
  new Intl.NumberFormat("de-DE", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);

/** „+187,87 $“ */
export function formatUsdMove(value: number) {
  return `${value > 0 ? "+" : ""}${fixed(value, 2)} $`;
}

/** „−3,70 %“ */
export function formatPctMove(value: number) {
  return `${value > 0 ? "+" : ""}${fixed(value, 2)} %`;
}

export function formatContracts(value: number | null | undefined) {
  return value == null ? "–" : fixed(Math.round(value), 0);
}

export function formatUsd(value: number | null | undefined) {
  return value == null ? "–" : `${fixed(value, 2)} $`;
}

export function formatPct(value: number | null | undefined) {
  return value == null ? "–" : `${fixed(value, 2)} %`;
}
