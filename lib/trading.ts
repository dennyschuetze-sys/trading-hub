import type { Tables } from "@/lib/database.types";
import { wallTimeToIso } from "@/lib/time";

export type Account = Tables<"accounts">;
export type Trade = Tables<"trades">;
export type TradeScreenshot = Tables<"trade_screenshots">;

type Option = { value: string; label: string };

export const ACCOUNT_TYPES: Option[] = [
  { value: "prop", label: "Prop Firm" },
  { value: "personal", label: "Eigenes Konto" },
  { value: "demo", label: "Demo" },
];

export const PLATFORMS: Option[] = [
  { value: "mt5", label: "MetaTrader 5" },
  { value: "mt4", label: "MetaTrader 4" },
  { value: "tradingview", label: "TradingView" },
  { value: "ninjatrader", label: "NinjaTrader" },
  { value: "tradovate", label: "Tradovate" },
  { value: "ctrader", label: "cTrader" },
  { value: "other", label: "Andere" },
];

export const MARKETS: Option[] = [
  { value: "forex_cfd", label: "Forex / CFDs" },
  { value: "futures", label: "Futures" },
  { value: "mixed", label: "Gemischt" },
];

export const PHASES: Option[] = [
  { value: "challenge", label: "Challenge (Phase 1)" },
  { value: "verification", label: "Verifikation (Phase 2)" },
  { value: "funded", label: "Funded" },
  { value: "live", label: "Live" },
  { value: "demo", label: "Demo" },
];

export const ACCOUNT_STATUSES: Option[] = [
  { value: "active", label: "Aktiv" },
  { value: "passed", label: "Bestanden" },
  { value: "failed", label: "Nicht bestanden" },
  { value: "paused", label: "Pausiert" },
  { value: "closed", label: "Geschlossen" },
];

export const DRAWDOWN_TYPES: Option[] = [
  { value: "static", label: "Fest (vom Startkapital)" },
  { value: "trailing", label: "Trailing (vom Höchststand)" },
  { value: "eod_trailing", label: "Trailing End-of-Day" },
];

export const CURRENCIES = ["USD", "EUR", "GBP", "CHF"];

export const SESSIONS: Option[] = [
  { value: "asia", label: "Asien" },
  { value: "london", label: "London" },
  { value: "new_york", label: "New York" },
  { value: "london_ny_overlap", label: "London/NY Overlap" },
  { value: "other", label: "Andere" },
];

export const SETUP_QUALITIES = ["A+", "A", "B", "C"];

export const TIMEFRAMES = ["M1", "M5", "M15", "M30", "H1", "H4", "D1"];

export const HTF_BIASES: Option[] = [
  { value: "with", label: "Mit dem Trend" },
  { value: "against", label: "Gegen den Trend" },
  { value: "neutral", label: "Neutral" },
];

export const MARKET_CONTEXTS: Option[] = [
  { value: "trend", label: "Trend" },
  { value: "range", label: "Range" },
  { value: "volatile", label: "Volatil / News" },
];

export const EMOTIONS = [
  "Ruhig",
  "Selbstbewusst",
  "Geduldig",
  "Unsicher",
  "Ängstlich",
  "Gierig",
  "FOMO",
  "Frustriert",
  "Rache",
  "Gelangweilt",
];

export const MISTAKES = [
  "Zu früh eingestiegen",
  "Zu spät eingestiegen",
  "Kein Setup / Regel gebrochen",
  "Stop Loss verschoben",
  "Zu früh ausgestiegen",
  "Gewinner zu lange gehalten",
  "Zu großes Risiko",
  "Overtrading",
  "Revenge Trade",
  "News ignoriert",
  "Gegen den Trend",
];

export function labelFor(options: Option[], value: string | null | undefined) {
  return options.find((o) => o.value === value)?.label ?? value ?? "–";
}

// Formatierung ----------------------------------------------------------------

export const TIME_ZONE = "Europe/Berlin";

export function formatMoney(value: number | null | undefined, currency = "USD", signed = false) {
  if (value == null) return "–";
  const formatted = new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value);
  return signed && value > 0 ? `+${formatted}` : formatted;
}

export function formatNumber(value: number | null | undefined, maxDigits = 5) {
  if (value == null) return "–";
  return new Intl.NumberFormat("de-DE", { maximumFractionDigits: maxDigits }).format(value);
}

export function formatR(value: number | null | undefined) {
  if (value == null) return "–";
  return `${value > 0 ? "+" : ""}${formatNumber(value, 2)} R`;
}

export function formatDateTime(iso: string | null | undefined) {
  if (!iso) return "–";
  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: TIME_ZONE,
  }).format(new Date(iso));
}

export function formatDate(iso: string | null | undefined) {
  if (!iso) return "–";
  return new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeZone: TIME_ZONE }).format(
    new Date(iso),
  );
}

/** ISO-Zeit → Wert für <input type="datetime-local"> in der Zeitzone des Browsers. */
export function toDateTimeLocal(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Tagesgrenze (YYYY-MM-DD) in Berliner Zeit als ISO-Zeitpunkt, z. B. für Datumsfilter. */
export function dayBoundary(date: string, edge: "start" | "end") {
  const [year, month, day] = date.split("-").map(Number);
  const wall =
    edge === "start"
      ? { year, month, day, hour: 0, minute: 0, second: 0 }
      : { year, month, day, hour: 23, minute: 59, second: 59 };
  return wallTimeToIso(wall, TIME_ZONE, edge === "start" ? 0 : 999);
}

/** Ordnet einen Einstiegszeitpunkt grob einer Handelssession zu (Stunden in New-York-Zeit). */
export function guessSession(iso: string): string {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", { hour: "numeric", hourCycle: "h23", timeZone: "America/New_York" }).format(
      new Date(iso),
    ),
  );
  if (hour >= 19 || hour < 3) return "asia";
  if (hour < 8) return "london";
  if (hour < 12) return "london_ny_overlap";
  if (hour < 17) return "new_york";
  return "other";
}

/** „1 Trade“, „3 Trades“ */
export function plural(count: number, singular: string, pluralForm: string) {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

/** Tailwind-Klasse für Gewinn/Verlust. */
export function pnlClass(value: number | null | undefined) {
  if (value == null || value === 0) return "text-muted-foreground";
  return value > 0 ? "text-profit" : "text-loss";
}

// Kennzahlen je Account --------------------------------------------------------

export type AccountSummary = {
  netPnl: number;
  balance: number;
  tradeCount: number;
  targetProgress: number | null;
};

export function summarizeAccount(
  account: Account,
  trades: Pick<Trade, "net_pnl" | "status">[],
): AccountSummary {
  const closed = trades.filter((t) => t.status === "closed");
  const netPnl = closed.reduce((sum, t) => sum + (t.net_pnl ?? 0), 0);
  const targetProgress =
    account.profit_target && account.profit_target > 0
      ? Math.max(0, Math.min(1, netPnl / account.profit_target))
      : null;

  return {
    netPnl,
    balance: account.starting_balance + netPnl,
    tradeCount: closed.length,
    targetProgress,
  };
}
