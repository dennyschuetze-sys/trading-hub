import { checkDay } from "@/lib/daily-plan";
import { addDays, weekday } from "@/lib/periods";
import type { Violation } from "@/lib/risk-rules";
import { berlinParts, type ChecklistResult, type StatTrade } from "@/lib/stats";

export type PlanFact = {
  plan_date: string;
  reviewed_at: string | null;
  max_trades: number | null;
  max_losses: number | null;
  lesson?: string | null;
};

export type DisciplineData = {
  trades: StatTrade[];
  plans: PlanFact[];
  violations: Map<string, Violation[]>;
  checklist: ChecklistResult[];
  /** Sind persönliche Regeln aktiv? Sonst zählt „Regeln“ nicht zum Score. */
  rulesActive: boolean;
};

/** Ein Trade gilt als gepflegt, wenn eine Strategie und mindestens eine Bewertung eingetragen sind. */
export const isJournaled = (t: StatTrade) =>
  t.strategy_id != null && (t.setup_quality != null || t.emotion != null || t.followed_plan != null);

export type PartKey = "rules" | "checklist" | "journal" | "plan" | "review";

export const PARTS: { key: PartKey; label: string; weight: number; hint: string }[] = [
  { key: "rules", label: "Regeln eingehalten", weight: 30, hint: "Anteil der Trades ohne Verstoß gegen deine Risikoregeln" },
  { key: "checklist", label: "Checkliste erfüllt", weight: 20, hint: "Anteil der Trades, bei denen alle Checklistenpunkte erfüllt waren" },
  { key: "journal", label: "Journal gepflegt", weight: 20, hint: "Anteil der Trades mit Strategie und Bewertung (Setup, Emotion oder Plan)" },
  { key: "plan", label: "Mit Tagesplan", weight: 15, hint: "Handelstage mit Plan – halb gezählt, wenn die Plan-Limits überschritten wurden" },
  { key: "review", label: "Mit Review", weight: 15, hint: "Handelstage, an denen du das Session-Review ausgefüllt hast" },
];

export type ScorePart = { key: PartKey; label: string; value: number | null; weight: number };
export type Score = { score: number | null; parts: ScorePart[]; tradingDays: number; trades: number };

/** Vorbereitete Nachschlagetabellen */
export type DisciplineIndex = {
  data: DisciplineData;
  tradesByDay: Map<string, StatTrade[]>;
  planByDate: Map<string, PlanFact>;
  checklistByTrade: Map<string, ChecklistResult[]>;
};

export function buildIndex(data: DisciplineData): DisciplineIndex {
  const tradesByDay = new Map<string, StatTrade[]>();
  for (const t of data.trades) {
    const day = berlinParts(t.entry_time).date;
    tradesByDay.set(day, [...(tradesByDay.get(day) ?? []), t]);
  }
  const checklistByTrade = new Map<string, ChecklistResult[]>();
  for (const r of data.checklist) checklistByTrade.set(r.trade_id, [...(checklistByTrade.get(r.trade_id) ?? []), r]);
  return { data, tradesByDay, planByDate: new Map(data.plans.map((p) => [p.plan_date, p])), checklistByTrade };
}

const share = (items: boolean[]) => (items.length ? items.filter(Boolean).length / items.length : null);

/** Checkliste eines Trades: true = alles erfüllt, false = nicht alles, null = keine Checkliste. */
export function checklistMet(index: DisciplineIndex, tradeId: string): boolean | null {
  const results = index.checklistByTrade.get(tradeId);
  if (!results?.length) return null;
  return results.every((r) => r.checked);
}

/**
 * Disziplin-Score (0–100) für eine Menge von Tagen. Handelsbezogene Teile zählen je Trade,
 * Plan und Review je Handelstag. Teile ohne Daten fallen heraus, die Gewichte werden neu verteilt.
 * Das Review des heutigen Tages ist noch nicht fällig und zählt deshalb nicht.
 */
export function scoreDays(index: DisciplineIndex, days: string[], today: string): Score {
  const tradingDays = days.filter((d) => index.tradesByDay.has(d));
  const trades = tradingDays.flatMap((d) => index.tradesByDay.get(d)!);

  const values: Record<PartKey, number | null> = {
    rules: index.data.rulesActive ? share(trades.map((t) => !index.data.violations.get(t.id)?.length)) : null,
    checklist: share(trades.map((t) => checklistMet(index, t.id)).filter((v): v is boolean => v != null)),
    journal: share(trades.map(isJournaled)),
    plan: tradingDays.length
      ? tradingDays.reduce((sum, d) => {
          const plan = index.planByDate.get(d);
          if (!plan) return sum;
          const check = checkDay(plan, index.tradesByDay.get(d)!);
          return sum + (check.tradesOk === false || check.lossesOk === false ? 0.5 : 1);
        }, 0) / tradingDays.length
      : null,
    review: share(tradingDays.filter((d) => d < today).map((d) => Boolean(index.planByDate.get(d)?.reviewed_at))),
  };

  const parts = PARTS.map((p) => ({ key: p.key, label: p.label, weight: p.weight, value: values[p.key] }));
  const counted = parts.filter((p) => p.value != null);
  const weight = counted.reduce((s, p) => s + p.weight, 0);
  const score = weight ? Math.round(counted.reduce((s, p) => s + p.value! * p.weight, 0) / weight * 100) : null;
  return { score, parts, tradingDays: tradingDays.length, trades: trades.length };
}

// Streaks ---------------------------------------------------------------------------

export type Streak = { current: number; best: number };

/** Serien aus Tagen mit Ergebnis true/false; null = Tag zählt nicht (weder Unterbrechung noch Fortsetzung). */
export function runStreak(days: (boolean | null)[]): Streak {
  let current = 0;
  let best = 0;
  for (const ok of days) {
    if (ok == null) continue;
    current = ok ? current + 1 : 0;
    best = Math.max(best, current);
  }
  return { current, best };
}

export type Streaks = { plan: Streak; journal: Streak; rules: Streak | null; review: Streak };

/**
 * - Plan: Werktage (Mo–Fr) mit Tagesplan; heute ohne Plan unterbricht noch nicht.
 * - Journal: Handelstage, an denen alle Trades gepflegt sind (heute zählt erst, wenn erledigt).
 * - Regeln: Handelstage ohne Regelverstoß.
 * - Review: Handelstage mit Review (heute zählt erst, wenn erledigt).
 */
export function computeStreaks(index: DisciplineIndex, today: string): Streaks {
  const tradingDays = [...index.tradesByDay.keys()].filter((d) => d <= today).sort();
  const firstPlan = index.data.plans.map((p) => p.plan_date).sort()[0];
  const start = [firstPlan, tradingDays[0]].filter(Boolean).sort()[0];

  const planDays: (boolean | null)[] = [];
  if (start) {
    for (let d = start; d <= today; d = addDays(d, 1)) {
      if (weekday(d) > 5) continue;
      const has = index.planByDate.has(d);
      planDays.push(d === today && !has ? null : has);
    }
  }

  const journal = tradingDays.map((d) => {
    const ok = index.tradesByDay.get(d)!.every(isJournaled);
    return d === today && !ok ? null : ok;
  });
  const rules = tradingDays.map((d) => index.tradesByDay.get(d)!.every((t) => !index.data.violations.get(t.id)?.length));
  const review = tradingDays.map((d) => {
    const ok = Boolean(index.planByDate.get(d)?.reviewed_at);
    return d === today && !ok ? null : ok;
  });

  return {
    plan: runStreak(planDays),
    journal: runStreak(journal),
    rules: index.data.rulesActive ? runStreak(rules) : null,
    review: runStreak(review),
  };
}
