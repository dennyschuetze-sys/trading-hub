import { TIME_ZONE, labelFor, SESSIONS, type Trade } from "@/lib/trading";

/** Felder, die für Auswertungen gebraucht werden – für Live- und Backtest-Trades. */
export type CoreTrade = Pick<
  Trade,
  | "id"
  | "symbol"
  | "direction"
  | "status"
  | "entry_time"
  | "exit_time"
  | "net_pnl"
  | "r_multiple"
  | "session"
  | "setup_quality"
  | "emotion"
  | "mistakes"
  | "followed_plan"
  | "strategy_id"
  | "risk_amount"
>;

/** Live-Trade: gehört immer zu einem Account. */
export type StatTrade = CoreTrade & { account_id: string };

/** Kurse, Kosten und Setup-Kontext – für die erweiterten Auswertungen. */
export type TradeDetails = Pick<
  Trade,
  | "entry_price"
  | "exit_price"
  | "stop_loss"
  | "take_profit"
  | "best_price"
  | "worst_price"
  | "pnl"
  | "commission"
  | "swap"
  | "entry_timeframe"
  | "htf_bias"
  | "market_context"
  | "moved_to_breakeven"
  | "partial_close"
>;

/** Live-Trade mit Details. */
export type DetailTrade = StatTrade & TradeDetails;

// Zeit in Berliner Zeit -----------------------------------------------------------

const partsFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  hourCycle: "h23",
  weekday: "short",
});
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Datum (YYYY-MM-DD), Wochentag (1 = Montag) und Stunde in Berliner Zeit. */
export function berlinParts(iso: string) {
  const p = Object.fromEntries(partsFormatter.formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    weekday: WEEKDAYS.indexOf(p.weekday) + 1,
    hour: Number(p.hour),
  };
}

/** Zeitpunkt, an dem das Ergebnis realisiert wurde. */
export const closeTime = (t: Pick<CoreTrade, "exit_time" | "entry_time">) => t.exit_time ?? t.entry_time;

export function closedTrades<T extends CoreTrade>(trades: T[]): T[] {
  return trades
    .filter((t) => t.status === "closed" && t.net_pnl != null)
    .sort((a, b) => closeTime(a).localeCompare(closeTime(b)));
}

const round2 = (n: number) => Math.round(n * 100) / 100;

// Kennzahlen ---------------------------------------------------------------------

export type Summary = {
  count: number;
  wins: number;
  losses: number;
  breakeven: number;
  winRate: number | null;
  netPnl: number;
  grossProfit: number;
  grossLoss: number;
  profitFactor: number | null;
  avgWin: number | null;
  avgLoss: number | null;
  /** Durchschnittliches Ergebnis pro Trade */
  expectancy: number | null;
  avgR: number | null;
  rCount: number;
  largestWin: number | null;
  largestLoss: number | null;
  maxWinStreak: number;
  maxLossStreak: number;
  tradingDays: number;
  avgHoldMinutes: number | null;
};

export function summarize(input: CoreTrade[]): Summary {
  const trades = closedTrades(input);
  const pnls = trades.map((t) => t.net_pnl!);
  const winsList = pnls.filter((p) => p > 0);
  const lossList = pnls.filter((p) => p < 0);
  const grossProfit = round2(winsList.reduce((a, b) => a + b, 0));
  const grossLoss = round2(lossList.reduce((a, b) => a + b, 0));
  const rs = trades.map((t) => t.r_multiple).filter((r): r is number => r != null);

  let winStreak = 0;
  let lossStreak = 0;
  let maxWinStreak = 0;
  let maxLossStreak = 0;
  for (const p of pnls) {
    winStreak = p > 0 ? winStreak + 1 : 0;
    lossStreak = p < 0 ? lossStreak + 1 : 0;
    maxWinStreak = Math.max(maxWinStreak, winStreak);
    maxLossStreak = Math.max(maxLossStreak, lossStreak);
  }

  const holds = trades
    .filter((t) => t.exit_time)
    .map((t) => (Date.parse(t.exit_time!) - Date.parse(t.entry_time)) / 60000);

  return {
    count: trades.length,
    wins: winsList.length,
    losses: lossList.length,
    breakeven: trades.length - winsList.length - lossList.length,
    winRate: trades.length ? winsList.length / trades.length : null,
    netPnl: round2(grossProfit + grossLoss),
    grossProfit,
    grossLoss,
    profitFactor: grossLoss < 0 ? grossProfit / Math.abs(grossLoss) : null,
    avgWin: winsList.length ? round2(grossProfit / winsList.length) : null,
    avgLoss: lossList.length ? round2(grossLoss / lossList.length) : null,
    expectancy: trades.length ? round2((grossProfit + grossLoss) / trades.length) : null,
    avgR: rs.length ? Math.round((rs.reduce((a, b) => a + b, 0) / rs.length) * 100) / 100 : null,
    rCount: rs.length,
    largestWin: winsList.length ? Math.max(...winsList) : null,
    largestLoss: lossList.length ? Math.min(...lossList) : null,
    maxWinStreak,
    maxLossStreak,
    tradingDays: new Set(trades.map((t) => berlinParts(closeTime(t)).date)).size,
    avgHoldMinutes: holds.length ? Math.round(holds.reduce((a, b) => a + b, 0) / holds.length) : null,
  };
}

// Equity & Drawdown -------------------------------------------------------------

export type EquityPoint = { time: string; balance: number; pnl: number; tradeId: string | null };

export function equityCurve(input: CoreTrade[], startingBalance: number): EquityPoint[] {
  const trades = closedTrades(input);
  const points: EquityPoint[] = [];
  let balance = startingBalance;
  if (trades.length) points.push({ time: trades[0].entry_time, balance, pnl: 0, tradeId: null });
  for (const t of trades) {
    balance = round2(balance + t.net_pnl!);
    points.push({ time: closeTime(t), balance, pnl: t.net_pnl!, tradeId: t.id });
  }
  return points;
}

/** Größter Rückgang vom bisherigen Höchststand (Betrag und Prozent vom Höchststand). */
export function maxDrawdown(points: Pick<EquityPoint, "balance">[]) {
  let peak = -Infinity;
  let amount = 0;
  let percent = 0;
  for (const { balance } of points) {
    peak = Math.max(peak, balance);
    const dd = peak - balance;
    if (dd > amount) {
      amount = round2(dd);
      percent = peak > 0 ? dd / peak : 0;
    }
  }
  return { amount, percent };
}

// Tage --------------------------------------------------------------------------

export type DayResult = { date: string; pnl: number; count: number; wins: number };

export function dailyResults(input: CoreTrade[]): DayResult[] {
  const days = new Map<string, DayResult>();
  for (const t of closedTrades(input)) {
    const date = berlinParts(closeTime(t)).date;
    const day = days.get(date) ?? { date, pnl: 0, count: 0, wins: 0 };
    day.pnl = round2(day.pnl + t.net_pnl!);
    day.count += 1;
    if (t.net_pnl! > 0) day.wins += 1;
    days.set(date, day);
  }
  return [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
}

// Aufschlüsselung ---------------------------------------------------------------

export type BreakdownRow = {
  key: string;
  label: string;
  count: number;
  winRate: number;
  netPnl: number;
  expectancy: number;
  avgR: number | null;
};

export function breakdown<T extends CoreTrade>(
  input: T[],
  keyOf: (t: T) => string | string[] | null,
  labelOf: (key: string) => string = (k) => k,
  order?: string[],
): BreakdownRow[] {
  const groups = new Map<string, T[]>();
  for (const t of closedTrades(input)) {
    const raw = keyOf(t);
    const keys = raw == null ? [] : Array.isArray(raw) ? raw : [raw];
    for (const key of keys) groups.set(key, [...(groups.get(key) ?? []), t]);
  }

  const rows = [...groups.entries()].map(([key, trades]) => {
    const s = summarize(trades);
    return {
      key,
      label: labelOf(key),
      count: s.count,
      winRate: s.winRate ?? 0,
      netPnl: s.netPnl,
      expectancy: s.expectancy ?? 0,
      avgR: s.avgR,
    };
  });

  return order
    ? rows.sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key))
    : rows.sort((a, b) => b.netPnl - a.netPnl);
}

export type ChecklistResult = { trade_id: string; item_id: string; checked: boolean };

/**
 * Regeltreue je Trade: „Alle Punkte erfüllt“, „Nicht alle erfüllt“ oder „Ohne Checkliste“.
 * Außerdem je Checklistenpunkt, was passiert, wenn er NICHT erfüllt war.
 */
export function checklistBreakdowns(
  trades: CoreTrade[],
  items: { id: string; label: string }[],
  results: ChecklistResult[],
) {
  const byTrade = new Map<string, ChecklistResult[]>();
  results.forEach((r) => byTrade.set(r.trade_id, [...(byTrade.get(r.trade_id) ?? []), r]));
  const itemIds = new Set(items.map((i) => i.id));

  const compliance = breakdown(
    trades,
    (t) => {
      const rs = (byTrade.get(t.id) ?? []).filter((r) => itemIds.has(r.item_id));
      if (!rs.length) return "none";
      return rs.every((r) => r.checked) ? "all" : "partial";
    },
    (k) => ({ all: "Alle Punkte erfüllt", partial: "Nicht alle erfüllt", none: "Ohne Checkliste" })[k] ?? k,
    ["all", "partial", "none"],
  );

  const missed = breakdown(
    trades,
    (t) => (byTrade.get(t.id) ?? []).filter((r) => itemIds.has(r.item_id) && !r.checked).map((r) => r.item_id),
    (k) => items.find((i) => i.id === k)?.label ?? k,
    items.map((i) => i.id),
  );

  return { compliance, missed };
}

const WEEKDAY_LABELS =["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"];

/** Die Standard-Auswertungen für die Statistikseite. */
export function standardBreakdowns(trades: CoreTrade[], strategyNames: Map<string, string> = new Map()) {
  return {
    strategy: breakdown(
      trades,
      (t) => t.strategy_id ?? "none",
      (k) => (k === "none" ? "Ohne Strategie" : (strategyNames.get(k) ?? "Gelöschte Strategie")),
    ),
    symbol: breakdown(trades, (t) => t.symbol),
    direction: breakdown(trades, (t) => t.direction, (k) => (k === "long" ? "Long" : "Short"), ["long", "short"]),
    session: breakdown(
      trades,
      (t) => t.session,
      (k) => labelFor(SESSIONS, k),
      SESSIONS.map((s) => s.value),
    ),
    weekday: breakdown(
      trades,
      (t) => String(berlinParts(t.entry_time).weekday),
      (k) => WEEKDAY_LABELS[Number(k) - 1],
      ["1", "2", "3", "4", "5", "6", "7"],
    ),
    hour: breakdown(
      trades,
      (t) => String(berlinParts(t.entry_time).hour).padStart(2, "0"),
      (k) => `${k}:00–${String((Number(k) + 1) % 24).padStart(2, "0")}:00`,
      Array.from({ length: 24 }, (_, h) => String(h).padStart(2, "0")),
    ),
    setupQuality: breakdown(trades, (t) => t.setup_quality, (k) => k, ["A+", "A", "B", "C"]),
    emotion: breakdown(trades, (t) => t.emotion),
    mistakes: breakdown(trades, (t) => (t.mistakes.length ? t.mistakes : ["Keine Fehler"])),
    followedPlan: breakdown(
      trades,
      (t) => (t.followed_plan == null ? null : String(t.followed_plan)),
      (k) => (k === "true" ? "Plan eingehalten" : "Plan nicht eingehalten"),
      ["true", "false"],
    ),
  };
}
