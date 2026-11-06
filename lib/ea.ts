import type { Json, Tables } from "@/lib/database.types";

// EA-Monitor: Der Gunner-EA (Market-EA „Xauusd M1 Gunner Multi Preview“) läuft in den VT-Terminals 3 und 4 auf je
// einem Demokonto. Das Skript ea-monitor/scripts/melden.py liest Konto und Deals alle 15 Minuten über die
// MT5-Schnittstelle und meldet sie über ea_ingest(). Dazu kommt eine Vorhersage, an welchen Tagen der EA handelt,
// aus dem MT5-Wirtschaftskalender und dem Backtest 2025–2026.

export type EaAccount = Tables<"ea_accounts">;
export type EaPosition = Tables<"ea_positions">;
export type EaForecast = Tables<"ea_forecast">;
export type EaStatus = Tables<"ea_status">;

/** Das Skript läuft alle 15 Minuten; nach 45 Minuten ohne Meldung gilt der Stand als veraltet. */
export const EA_STALE_MINUTES = 45;

/** Risiko je Trade, das im Backtest geprüft wurde (1 % und 3 %). Darüber ist nichts getestet. */
export const TESTED_RISK = [1, 3];

export function isEaStale(runAt: string | null | undefined, now = new Date()) {
  if (!runAt) return true;
  return now.getTime() - new Date(runAt).getTime() > EA_STALE_MINUTES * 60_000;
}

const NY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** Serverzeit von VT Markets = New York + 7 Stunden. Liefert "YYYY-MM-DD HH:MM". */
export function serverTime(iso: string): string {
  const ny = new Date(iso);
  const parts = Object.fromEntries(NY.formatToParts(ny).map((p) => [p.type, p.value]));
  const local = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute) + 7 * 3_600_000;
  return new Date(local).toISOString().slice(0, 16).replace("T", " ");
}

/** Handelstag in Serverzeit, so wie MT5 und der Backtest ihn zählen. */
export function serverDay(iso: string): string {
  return serverTime(iso).slice(0, 10);
}

export type EaSettings = { RiskPercent?: number; MaxLots?: number; strategies?: string };

export function parseSettings(json: Json): EaSettings {
  if (!json || typeof json !== "object" || Array.isArray(json)) return {};
  const o = json as Record<string, Json>;
  return {
    RiskPercent: typeof o.RiskPercent === "number" ? o.RiskPercent : undefined,
    MaxLots: typeof o.MaxLots === "number" ? o.MaxLots : undefined,
    strategies: typeof o.strategies === "string" ? o.strategies : undefined,
  };
}

/** Warnung, wenn das eingestellte Risiko über dem geprüften liegt. */
export function riskWarning(settings: EaSettings): string | null {
  const r = settings.RiskPercent;
  if (r == null || !Number.isFinite(r)) return null;
  if (r > Math.max(...TESTED_RISK))
    return `Risiko ${formatPercent(r / 100)} ist nicht getestet. Mit 3 % fiel das Konto im Backtest Anfang 2025 auf rund 27 %.`;
  return null;
}

export type FamilyRate = { family: string; days: number; after: number; before: number | null; trades: number };

export function parseFamilies(json: Json): FamilyRate[] {
  if (!Array.isArray(json)) return [];
  return json.flatMap((x) => {
    if (!x || typeof x !== "object" || Array.isArray(x)) return [];
    const o = x as Record<string, Json>;
    if (typeof o.family !== "string" || typeof o.after !== "number") return [];
    return [
      {
        family: o.family,
        days: typeof o.days === "number" ? o.days : 0,
        after: o.after,
        before: typeof o.before === "number" ? o.before : null,
        trades: typeof o.trades === "number" ? o.trades : 0,
      },
    ];
  });
}

export type ForecastEvent = { time: string; name: string };

export function parseEvents(json: Json): ForecastEvent[] {
  if (!Array.isArray(json)) return [];
  return json.flatMap((x) => {
    if (!x || typeof x !== "object" || Array.isArray(x)) return [];
    const o = x as Record<string, Json>;
    return typeof o.time === "string" && typeof o.name === "string" ? [{ time: o.time, name: o.name }] : [];
  });
}

export type BacktestMonth = { month: string; trades: number; pips: number };
export type Backtest = {
  period: string;
  settings: string;
  stats: { end_balance?: number; profit_factor?: number; trades?: number; win_rate?: number; max_dd_equity?: number; median_hold_s?: number };
  months: BacktestMonth[];
};

export function parseBacktest(json: Json): Backtest {
  const o = json && typeof json === "object" && !Array.isArray(json) ? (json as Record<string, Json>) : {};
  const stats = o.stats && typeof o.stats === "object" && !Array.isArray(o.stats) ? (o.stats as Record<string, Json>) : {};
  const num = (v: Json | undefined) => (typeof v === "number" ? v : undefined);
  const months = Array.isArray(o.months)
    ? o.months.flatMap((m) => {
        if (!m || typeof m !== "object" || Array.isArray(m)) return [];
        const r = m as Record<string, Json>;
        return typeof r.month === "string" && typeof r.pips === "number"
          ? [{ month: r.month, pips: r.pips, trades: typeof r.trades === "number" ? r.trades : 0 }]
          : [];
      })
    : [];
  return {
    period: typeof o.period === "string" ? o.period : "",
    settings: typeof o.settings === "string" ? o.settings : "",
    stats: {
      end_balance: num(stats.end_balance),
      profit_factor: num(stats.profit_factor),
      trades: num(stats.trades),
      win_rate: num(stats.win_rate),
      max_dd_equity: num(stats.max_dd_equity),
      median_hold_s: num(stats.median_hold_s),
    },
    months,
  };
}

export type AccountSummary = {
  closed: number;
  open: number;
  wins: number;
  winRate: number | null;
  profit: number;
  meanPips: number | null;
  profitFactor: number | null;
  tradingDays: number;
};

export function summarize(positions: Pick<EaPosition, "status" | "profit" | "pips" | "opened_at">[]): AccountSummary {
  const closed = positions.filter((p) => p.status === "zu");
  const wins = closed.filter((p) => p.profit > 0).length;
  const gross = closed.filter((p) => p.profit > 0).reduce((s, p) => s + p.profit, 0);
  const loss = -closed.filter((p) => p.profit < 0).reduce((s, p) => s + p.profit, 0);
  const pips = closed.map((p) => p.pips).filter((v): v is number => v != null);
  return {
    closed: closed.length,
    open: positions.length - closed.length,
    wins,
    winRate: closed.length ? wins / closed.length : null,
    profit: Math.round(closed.reduce((s, p) => s + p.profit, 0) * 100) / 100,
    meanPips: pips.length ? pips.reduce((s, v) => s + v, 0) / pips.length : null,
    profitFactor: loss > 0 ? gross / loss : null,
    tradingDays: new Set(positions.map((p) => serverDay(p.opened_at))).size,
  };
}

/** Kontostand nach jedem geschlossenen Trade, beginnend beim Stand zum Live-Start. */
export function equityPoints(
  startBalance: number,
  liveSince: string,
  positions: Pick<EaPosition, "status" | "profit" | "closed_at">[],
) {
  const closed = positions
    .filter((p): p is typeof p & { closed_at: string } => p.status === "zu" && p.closed_at != null)
    .sort((a, b) => a.closed_at.localeCompare(b.closed_at));
  let balance = startBalance;
  const points = [{ time: liveSince, balance, pnl: 0 }];
  for (const p of closed) {
    balance = Math.round((balance + p.profit) * 100) / 100;
    points.push({ time: p.closed_at, balance, pnl: p.profit });
  }
  return points;
}

export type StrategyRow = { strategy: string; trades: number; profit: number; meanPips: number | null };

export function byStrategy(positions: Pick<EaPosition, "status" | "strategy" | "profit" | "pips">[]): StrategyRow[] {
  const map = new Map<string, { trades: number; profit: number; pips: number[] }>();
  for (const p of positions) {
    if (p.status !== "zu") continue;
    const key = p.strategy ?? "?";
    const row = map.get(key) ?? { trades: 0, profit: 0, pips: [] };
    row.trades += 1;
    row.profit += p.profit;
    if (p.pips != null) row.pips.push(p.pips);
    map.set(key, row);
  }
  return [...map.entries()]
    .map(([strategy, r]) => ({
      strategy,
      trades: r.trades,
      profit: Math.round(r.profit * 100) / 100,
      meanPips: r.pips.length ? r.pips.reduce((s, v) => s + v, 0) / r.pips.length : null,
    }))
    .sort((a, b) => a.strategy.localeCompare(b.strategy));
}

export type ForecastCheck = { day: string; family: string; probability: number; traded: Record<string, number> };

/**
 * Vergangene Vorhersage-Tage ab dem frühesten Live-Start: Wie viele Positionen eröffnete jedes Konto an dem Tag?
 * Ein Konto zählt erst ab seinem eigenen Live-Start; davor bleibt es leer.
 */
export function forecastChecks(
  forecast: Pick<EaForecast, "day" | "family" | "probability">[],
  accounts: Pick<EaAccount, "tag" | "live_since">[],
  positions: Pick<EaPosition, "tag" | "opened_at">[],
  today: string,
): ForecastCheck[] {
  const counts = new Map<string, number>();
  for (const p of positions) {
    const key = `${p.tag}|${serverDay(p.opened_at)}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const starts = accounts.map((a) => ({ tag: a.tag, day: serverDay(a.live_since) }));
  const first = starts.map((s) => s.day).sort()[0];
  return forecast
    .filter((f) => first != null && f.day >= first && f.day <= today)
    .sort((a, b) => b.day.localeCompare(a.day))
    .map((f) => ({
      day: f.day,
      family: f.family,
      probability: f.probability,
      traded: Object.fromEntries(
        starts.filter((s) => f.day >= s.day).map((s) => [s.tag, counts.get(`${s.tag}|${f.day}`) ?? 0]),
      ),
    }));
}

export function formatPercent(value: number | null | undefined, digits = 0) {
  if (value == null || !Number.isFinite(value)) return "–";
  return `${(value * 100).toLocaleString("de-DE", { maximumFractionDigits: digits })} %`;
}

export function formatPips(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "–";
  const s = value.toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return `${value > 0 ? "+" : ""}${s} Pips`;
}

/** Stärke der Hervorhebung eines Vorhersage-Tages: 0 beim Grundwert (~40 %), 1 ab 90 %. */
export function forecastIntensity(probability: number) {
  return Math.min(1, Math.max(0, (probability - 0.3) / 0.6));
}

export const NO_NEWS_FAMILY = "ohne hohe News";
