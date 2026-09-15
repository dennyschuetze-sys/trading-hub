import type { Tables } from "@/lib/database.types";
import { closedTrades, type CoreTrade } from "@/lib/stats";

export type BacktestSession = Tables<"backtest_sessions">;

export const BACKTEST_STATUSES = [
  { value: "running", label: "Läuft" },
  { value: "done", label: "Abgeschlossen" },
];

/** Ab so vielen Trades ist ein Vergleich halbwegs aussagekräftig. */
export const MIN_SAMPLE = 20;

export type RStats = {
  count: number;
  winRate: number | null;
  /** Trades mit R-Multiple (Risiko eingetragen) */
  rCount: number;
  /** Ø R pro Trade = Erwartungswert in R */
  avgR: number | null;
  avgWinR: number | null;
  avgLossR: number | null;
  /** Summe Gewinn-R / Summe Verlust-R */
  profitFactorR: number | null;
};

const round2 = (n: number) => Math.round(n * 100) / 100;
const avg = (xs: number[]) => (xs.length ? round2(xs.reduce((a, b) => a + b, 0) / xs.length) : null);

/**
 * Kennzahlen in R statt in Geld: So lassen sich Backtests (virtuelles Konto) und
 * Live-Trades (verschiedene Accounts und Währungen) direkt vergleichen.
 */
export function rStats(input: CoreTrade[]): RStats {
  const trades = closedTrades(input);
  const wins = trades.filter((t) => t.net_pnl! > 0).length;
  const rs = trades.map((t) => t.r_multiple).filter((r): r is number => r != null);
  const winRs = rs.filter((r) => r > 0);
  const lossRs = rs.filter((r) => r < 0);
  const lossSum = lossRs.reduce((a, b) => a + b, 0);

  return {
    count: trades.length,
    winRate: trades.length ? wins / trades.length : null,
    rCount: rs.length,
    avgR: avg(rs),
    avgWinR: avg(winRs),
    avgLossR: avg(lossRs),
    profitFactorR: lossSum < 0 ? round2(winRs.reduce((a, b) => a + b, 0) / Math.abs(lossSum)) : null,
  };
}

export type Verdict = "too_few" | "on_track" | "weaker" | "stronger";

/**
 * Hält die Strategie live, was der Backtest verspricht?
 * Abweichung zählt ab 10 Prozentpunkten Winrate oder 0,3 R Erwartungswert.
 */
export function compareVerdict(backtest: RStats, live: RStats): Verdict {
  if (backtest.count < MIN_SAMPLE || live.count < MIN_SAMPLE) return "too_few";

  const winDiff = backtest.winRate != null && live.winRate != null ? live.winRate - backtest.winRate : 0;
  const rDiff = backtest.avgR != null && live.avgR != null ? live.avgR - backtest.avgR : 0;

  if (winDiff <= -0.1 || rDiff <= -0.3) return "weaker";
  if (winDiff >= 0.1 || rDiff >= 0.3) return "stronger";
  return "on_track";
}

export const VERDICT_LABELS: Record<Verdict, string> = {
  too_few: `Zu wenig Daten (mind. ${MIN_SAMPLE} Trades je Seite)`,
  on_track: "Live wie im Backtest",
  weaker: "Live schwächer als im Backtest",
  stronger: "Live besser als im Backtest",
};
