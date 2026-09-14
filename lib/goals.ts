import type { Tables } from "@/lib/database.types";
import { buildIndex, checklistMet, isJournaled, scoreDays, type DisciplineData, type DisciplineIndex } from "@/lib/discipline";
import { periodDays, periodEnd, type PeriodType } from "@/lib/periods";
import { VIOLATION_LABELS, type ViolationKind } from "@/lib/risk-rules";
import { berlinParts, closedTrades, summarize, type StatTrade } from "@/lib/stats";
import { formatMoney, formatNumber, formatR } from "@/lib/trading";

export type Goal = Tables<"goals">;

export type GoalMetric =
  | "net_pnl"
  | "trade_count"
  | "max_trades_day"
  | "win_rate"
  | "avg_r"
  | "rule_violations"
  | "checklist_rate"
  | "journal_rate"
  | "plan_days"
  | "review_days"
  | "discipline_score"
  | "manual";

type Unit = "money" | "count" | "percent" | "r" | "score";

export const GOAL_METRICS: {
  value: GoalMetric;
  label: string;
  unit: Unit;
  comparison: "at_least" | "at_most";
  example: string;
  /** Kann auf einen Account beschränkt werden */
  perAccount: boolean;
}[] = [
  { value: "discipline_score", label: "Disziplin-Score", unit: "score", comparison: "at_least", example: "Diszipliniert traden", perAccount: false },
  { value: "max_trades_day", label: "Trades pro Tag (höchster Tag)", unit: "count", comparison: "at_most", example: "Trades pro Tag begrenzen", perAccount: true },
  { value: "rule_violations", label: "Regelverstöße", unit: "count", comparison: "at_most", example: "Regeln einhalten", perAccount: true },
  { value: "journal_rate", label: "Journal gepflegt", unit: "percent", comparison: "at_least", example: "Jeden Trade im Journal bewerten", perAccount: true },
  { value: "checklist_rate", label: "Checkliste erfüllt", unit: "percent", comparison: "at_least", example: "Nur Trades mit voller Checkliste", perAccount: true },
  { value: "plan_days", label: "Tage mit Tagesplan", unit: "count", comparison: "at_least", example: "Jeden Handelstag planen", perAccount: false },
  { value: "review_days", label: "Tage mit Review", unit: "count", comparison: "at_least", example: "Jede Session reflektieren", perAccount: false },
  { value: "trade_count", label: "Anzahl Trades", unit: "count", comparison: "at_most", example: "Weniger, dafür bessere Trades", perAccount: true },
  { value: "win_rate", label: "Winrate", unit: "percent", comparison: "at_least", example: "Trefferquote verbessern", perAccount: true },
  { value: "avg_r", label: "Ø R-Multiple", unit: "r", comparison: "at_least", example: "Gewinner laufen lassen", perAccount: true },
  { value: "net_pnl", label: "Netto-Gewinn", unit: "money", comparison: "at_least", example: "Gewinnziel", perAccount: true },
  { value: "manual", label: "Eigenes Ziel (manuell)", unit: "count", comparison: "at_least", example: "Eigenes Ziel", perAccount: false },
];

export const metricInfo = (metric: string) => GOAL_METRICS.find((m) => m.value === metric) ?? GOAL_METRICS.at(-1)!;

export type GoalStatus = "reached" | "on_track" | "open" | "missed" | "failed";

export const GOAL_STATUS_LABELS: Record<GoalStatus, string> = {
  reached: "Erreicht",
  on_track: "Im Rahmen",
  open: "Offen",
  missed: "Verfehlt",
  failed: "Überschritten",
};

export type GoalProgress = { value: number | null; progress: number; status: GoalStatus };

export type PeriodContext = {
  index: DisciplineIndex;
  type: PeriodType;
  start: string;
  today: string;
};

const pct = (items: boolean[]) => (items.length ? (items.filter(Boolean).length / items.length) * 100 : null);

/** Aktueller Wert einer Kennzahl im Zeitraum (optional für einen Account). */
export function measureMetric(metric: GoalMetric, ctx: PeriodContext, accountId: string | null, manualValue: number | null = null): number | null {
  const days = periodDays(ctx.start, ctx.type);
  const trades = days
    .flatMap((d) => ctx.index.tradesByDay.get(d) ?? [])
    .filter((t) => !accountId || t.account_id === accountId);
  const plans = ctx.index.data.plans.filter((p) => p.plan_date >= ctx.start && p.plan_date <= periodEnd(ctx.start, ctx.type));

  switch (metric) {
    case "net_pnl":
      return Math.round(closedTrades(trades).reduce((s, t) => s + t.net_pnl!, 0) * 100) / 100;
    case "trade_count":
      return trades.length;
    case "max_trades_day": {
      const perDay = new Map<string, number>();
      trades.forEach((t) => perDay.set(berlinParts(t.entry_time).date, (perDay.get(berlinParts(t.entry_time).date) ?? 0) + 1));
      return Math.max(0, ...perDay.values());
    }
    case "win_rate": {
      const s = summarize(trades);
      return s.winRate == null ? null : Math.round(s.winRate * 1000) / 10;
    }
    case "avg_r":
      return summarize(trades).avgR;
    case "rule_violations":
      return trades.filter((t) => ctx.index.data.violations.get(t.id)?.length).length;
    case "checklist_rate": {
      const v = pct(trades.map((t) => checklistMet(ctx.index, t.id)).filter((x): x is boolean => x != null));
      return v == null ? null : Math.round(v * 10) / 10;
    }
    case "journal_rate": {
      const v = pct(trades.map(isJournaled));
      return v == null ? null : Math.round(v * 10) / 10;
    }
    case "plan_days":
      return plans.length;
    case "review_days":
      return plans.filter((p) => p.reviewed_at).length;
    case "discipline_score":
      return scoreDays(ctx.index, days, ctx.today).score;
    case "manual":
      return manualValue;
  }
}

/**
 * Fortschritt: „mindestens“-Ziele sind erreicht, sobald der Wert das Ziel trifft, und verfehlt, wenn der
 * Zeitraum ohne Erfolg endet. „Höchstens“-Ziele sind überschritten, sobald der Wert darüber liegt,
 * und erreicht, wenn der Zeitraum im Rahmen endet.
 */
export function evaluateGoal(
  goal: Pick<Goal, "metric" | "comparison" | "target" | "account_id" | "manual_value">,
  ctx: PeriodContext,
): GoalProgress {
  const value = measureMetric(goal.metric as GoalMetric, ctx, goal.account_id, goal.manual_value);
  const over = periodEnd(ctx.start, ctx.type) < ctx.today;
  const target = Number(goal.target);

  if (goal.comparison === "at_most") {
    const v = value ?? 0;
    const progress = target > 0 ? Math.min(1, v / target) : v > 0 ? 1 : 0;
    if (v > target) return { value, progress: 1, status: "failed" };
    return { value, progress, status: over ? "reached" : "on_track" };
  }

  if (value == null) return { value, progress: 0, status: over ? "missed" : "open" };
  const progress = target > 0 ? Math.max(0, Math.min(1, value / target)) : value >= target ? 1 : 0;
  if (value >= target) return { value, progress: 1, status: "reached" };
  return { value, progress, status: over ? "missed" : "open" };
}

/** Wert passend zur Einheit formatiert. */
export function formatMetric(metric: string, value: number | null, currency = "USD") {
  if (value == null) return "–";
  switch (metricInfo(metric).unit) {
    case "money":
      return formatMoney(value, currency);
    case "percent":
      return `${formatNumber(value, 1)} %`;
    case "r":
      return formatR(value);
    case "score":
      return `${formatNumber(value, 0)} / 100`;
    default:
      return formatNumber(value, 2);
  }
}

// Zusammenfassung für Reviews ----------------------------------------------------------

export type PeriodSummary = {
  trades: number;
  tradingDays: number;
  pnlByCurrency: [string, number][];
  winRate: number | null;
  avgR: number | null;
  discipline: number | null;
  planDays: number;
  reviewDays: number;
  violations: number;
  violationsByKind: [string, number][];
  topMistakes: [string, number][];
  strategies: { name: string; trades: number; winRate: number | null }[];
  lessons: string[];
};

export function summarizePeriod(
  data: DisciplineData,
  type: PeriodType,
  start: string,
  today: string,
  currencyOf: Map<string, string>,
  strategyNames: Map<string, string>,
): PeriodSummary {
  const index = buildIndex(data);
  const days = periodDays(start, type);
  const end = periodEnd(start, type);
  const trades: StatTrade[] = days.flatMap((d) => index.tradesByDay.get(d) ?? []);
  const s = summarize(trades);
  const plans = data.plans.filter((p) => p.plan_date >= start && p.plan_date <= end);

  const pnl = new Map<string, number>();
  closedTrades(trades).forEach((t) => {
    const cur = currencyOf.get(t.account_id) ?? "USD";
    pnl.set(cur, Math.round(((pnl.get(cur) ?? 0) + t.net_pnl!) * 100) / 100);
  });

  const count = <K extends string>(keys: K[]) => {
    const m = new Map<K, number>();
    keys.forEach((k) => m.set(k, (m.get(k) ?? 0) + 1));
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  };

  const kinds = trades.flatMap((t) => [...new Set((data.violations.get(t.id) ?? []).map((v) => v.kind))]);
  const byStrategy = new Map<string, StatTrade[]>();
  trades.forEach((t) => {
    const key = t.strategy_id ?? "none";
    byStrategy.set(key, [...(byStrategy.get(key) ?? []), t]);
  });

  return {
    trades: trades.length,
    tradingDays: new Set(trades.map((t) => berlinParts(t.entry_time).date)).size,
    pnlByCurrency: [...pnl.entries()],
    winRate: s.winRate,
    avgR: s.avgR,
    discipline: scoreDays(index, days, today).score,
    planDays: plans.length,
    reviewDays: plans.filter((p) => p.reviewed_at).length,
    violations: trades.filter((t) => data.violations.get(t.id)?.length).length,
    violationsByKind: count(kinds).map(([k, n]) => [VIOLATION_LABELS[k as ViolationKind] ?? k, n]),
    topMistakes: count(trades.flatMap((t) => t.mistakes)).slice(0, 3),
    strategies: [...byStrategy.entries()]
      .map(([key, list]) => ({
        name: key === "none" ? "Ohne Strategie" : (strategyNames.get(key) ?? "Gelöschte Strategie"),
        trades: list.length,
        winRate: summarize(list).winRate,
      }))
      .sort((a, b) => b.trades - a.trades)
      .slice(0, 3),
    lessons: plans.map((p) => p.lesson?.trim()).filter((l): l is string => Boolean(l)),
  };
}
