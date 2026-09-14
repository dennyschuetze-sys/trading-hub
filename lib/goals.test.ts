import { describe, expect, it } from "vitest";
import { buildIndex, computeStreaks, isJournaled, runStreak, scoreDays, type DisciplineData } from "./discipline";
import { evaluateGoal, formatMetric, measureMetric, summarizePeriod, type PeriodContext } from "./goals";
import { isoWeek, periodDays, periodEnd, periodLabel, periodStart, shiftPeriod } from "./periods";
import type { Violation } from "./risk-rules";
import type { StatTrade } from "./stats";

let seq = 0;
/** Trade am Berliner Tag `day` um 10 Uhr (UTC+2 im September). */
function trade(day: string, net: number, extra: Partial<StatTrade> = {}): StatTrade {
  seq += 1;
  return {
    id: `t${seq}`,
    account_id: "a1",
    symbol: "EURUSD",
    direction: "long",
    status: "closed",
    entry_time: `${day}T08:00:00.000Z`,
    exit_time: `${day}T08:30:00.000Z`,
    net_pnl: net,
    r_multiple: null,
    session: null,
    setup_quality: null,
    emotion: null,
    mistakes: [],
    followed_plan: null,
    strategy_id: null,
    risk_amount: null,
    ...extra,
  };
}

const journaled = { strategy_id: "s1", setup_quality: "A" };
const plan = (plan_date: string, reviewed = true, extra = {}) => ({
  plan_date,
  reviewed_at: reviewed ? `${plan_date}T20:00:00Z` : null,
  max_trades: null,
  max_losses: null,
  ...extra,
});

function data(partial: Partial<DisciplineData>): DisciplineData {
  return { trades: [], plans: [], violations: new Map(), checklist: [], rulesActive: false, ...partial };
}

describe("periods", () => {
  it("Wochen beginnen montags, Monate am Ersten", () => {
    expect(periodStart("2026-09-16", "week")).toBe("2026-09-14");
    expect(periodStart("2026-09-20", "week")).toBe("2026-09-14");
    expect(periodEnd("2026-09-14", "week")).toBe("2026-09-20");
    expect(periodStart("2026-02-17", "month")).toBe("2026-02-01");
    expect(periodEnd("2026-02-01", "month")).toBe("2026-02-28");
    expect(shiftPeriod("2026-01-01", "month", -1)).toBe("2025-12-01");
    expect(shiftPeriod("2026-09-14", "week", 1)).toBe("2026-09-21");
    expect(periodDays("2026-09-14", "week")).toHaveLength(7);
  });

  it("Kalenderwoche und Beschriftung", () => {
    expect(isoWeek("2026-09-14")).toBe(38);
    expect(isoWeek("2027-01-01")).toBe(53);
    expect(periodLabel("2026-09-01", "month")).toBe("September 2026");
    expect(periodLabel("2026-09-14", "week")).toMatch(/^KW 38 · 14\. Sept?\. – 20\. Sept?\.$/);
  });
});

describe("Disziplin-Score", () => {
  it("gewichtet nur Teile mit Daten", () => {
    const a = trade("2026-09-14", 10, journaled);
    const b = trade("2026-09-14", -5);
    const index = buildIndex(
      data({
        trades: [a, b],
        plans: [plan("2026-09-14")],
        checklist: [
          { trade_id: a.id, item_id: "i1", checked: true },
          { trade_id: b.id, item_id: "i1", checked: false },
        ],
      }),
    );
    const s = scoreDays(index, periodDays("2026-09-14", "week"), "2026-09-16");
    // Checkliste 0,5 · 20 + Journal 0,5 · 20 + Plan 1 · 15 + Review 1 · 15 = 50 von 70
    expect(s.parts.map((p) => [p.key, p.value])).toEqual([
      ["rules", null],
      ["checklist", 0.5],
      ["journal", 0.5],
      ["plan", 1],
      ["review", 1],
    ]);
    expect(s.score).toBe(71);
    expect(s.tradingDays).toBe(1);
  });

  it("Regeln, überschrittene Plan-Limits und heutiges Review", () => {
    const t1 = trade("2026-09-16", 10, journaled);
    const t2 = trade("2026-09-16", 10, journaled);
    const violations = new Map<string, Violation[]>([[t2.id, [{ kind: "max_trades", message: "" }]]]);
    const index = buildIndex(data({ trades: [t1, t2], plans: [plan("2026-09-16", false, { max_trades: 1 })], violations, rulesActive: true }));
    const s = scoreDays(index, ["2026-09-16"], "2026-09-16");
    expect(s.parts.find((p) => p.key === "rules")!.value).toBe(0.5);
    expect(s.parts.find((p) => p.key === "plan")!.value).toBe(0.5);
    expect(s.parts.find((p) => p.key === "review")!.value).toBeNull();
    // (0,5·30 + 1·20 + 0,5·15) / 65
    expect(s.score).toBe(65);
  });

  it("ohne Trades kein Score", () => {
    expect(scoreDays(buildIndex(data({ plans: [plan("2026-09-14")] })), ["2026-09-14"], "2026-09-20").score).toBeNull();
  });

  it("isJournaled braucht Strategie und eine Bewertung", () => {
    expect(isJournaled(trade("2026-09-14", 1, { strategy_id: "s" }))).toBe(false);
    expect(isJournaled(trade("2026-09-14", 1, { strategy_id: "s", emotion: "Ruhig" }))).toBe(true);
    expect(isJournaled(trade("2026-09-14", 1, { setup_quality: "A" }))).toBe(false);
  });
});

describe("Streaks", () => {
  it("runStreak überspringt null", () => {
    expect(runStreak([true, true, false, true, null, true])).toEqual({ current: 2, best: 2 });
    expect(runStreak([true, true, true, false])).toEqual({ current: 0, best: 3 });
  });

  it("Plan-Streak über Werktage, Wochenende und heutiger fehlender Plan unterbrechen nicht", () => {
    // Do 10., Fr 11., (Wochenende), Mo 14. heute ohne Plan
    const index = buildIndex(data({ plans: [plan("2026-09-09"), plan("2026-09-10"), plan("2026-09-11")] }));
    expect(computeStreaks(index, "2026-09-14").plan).toEqual({ current: 3, best: 3 });
    // Di 15. ohne Plan → Montag hat gefehlt
    expect(computeStreaks(index, "2026-09-15").plan.current).toBe(0);
  });

  it("Journal-, Regel- und Review-Streak zählen Handelstage", () => {
    const d1 = trade("2026-09-10", 5, journaled);
    const d2 = trade("2026-09-11", 5, journaled);
    const today = trade("2026-09-14", 5);
    const violations = new Map<string, Violation[]>([[d1.id, [{ kind: "news_block", message: "" }]]]);
    const index = buildIndex(
      data({ trades: [d1, d2, today], plans: [plan("2026-09-10"), plan("2026-09-11")], violations, rulesActive: true }),
    );
    const s = computeStreaks(index, "2026-09-14");
    expect(s.journal).toEqual({ current: 2, best: 2 });
    expect(s.rules).toEqual({ current: 2, best: 2 });
    expect(s.review).toEqual({ current: 2, best: 2 });
  });
});

describe("Ziele", () => {
  const t1 = trade("2026-09-14", 120, { ...journaled, account_id: "a1" });
  const t2 = trade("2026-09-14", -40, { account_id: "a1" });
  const t3 = trade("2026-09-15", 60, { ...journaled, account_id: "a2" });
  const other = trade("2026-09-21", 999);
  const index = buildIndex(data({ trades: [t1, t2, t3, other], plans: [plan("2026-09-14"), plan("2026-09-15", false)] }));
  const ctx = (today: string): PeriodContext => ({ index, type: "week", start: "2026-09-14", today });

  it("misst Kennzahlen im Zeitraum", () => {
    const c = ctx("2026-09-16");
    expect(measureMetric("net_pnl", c, "a1")).toBe(80);
    expect(measureMetric("trade_count", c, null)).toBe(3);
    expect(measureMetric("max_trades_day", c, null)).toBe(2);
    expect(measureMetric("max_trades_day", c, "a2")).toBe(1);
    expect(measureMetric("win_rate", c, null)).toBe(66.7);
    expect(measureMetric("journal_rate", c, null)).toBe(66.7);
    expect(measureMetric("plan_days", c, null)).toBe(2);
    expect(measureMetric("review_days", c, null)).toBe(1);
    expect(measureMetric("checklist_rate", c, null)).toBeNull();
    expect(measureMetric("manual", c, null, 2)).toBe(2);
  });

  it("Status für mindestens- und höchstens-Ziele", () => {
    const base = { account_id: null, manual_value: null };
    expect(evaluateGoal({ ...base, metric: "plan_days", comparison: "at_least", target: 5 }, ctx("2026-09-16"))).toEqual({
      value: 2,
      progress: 0.4,
      status: "open",
    });
    expect(evaluateGoal({ ...base, metric: "plan_days", comparison: "at_least", target: 5 }, ctx("2026-09-21")).status).toBe("missed");
    expect(evaluateGoal({ ...base, metric: "plan_days", comparison: "at_least", target: 2 }, ctx("2026-09-16")).status).toBe("reached");
    expect(evaluateGoal({ ...base, metric: "max_trades_day", comparison: "at_most", target: 3 }, ctx("2026-09-16")).status).toBe("on_track");
    expect(evaluateGoal({ ...base, metric: "max_trades_day", comparison: "at_most", target: 3 }, ctx("2026-09-21")).status).toBe("reached");
    expect(evaluateGoal({ ...base, metric: "trade_count", comparison: "at_most", target: 2 }, ctx("2026-09-16")).status).toBe("failed");
    expect(evaluateGoal({ ...base, metric: "checklist_rate", comparison: "at_least", target: 80 }, ctx("2026-09-16"))).toMatchObject({
      value: null,
      status: "open",
    });
  });

  it("formatiert passend zur Einheit", () => {
    // Intl setzt ein geschütztes Leerzeichen vor das Währungszeichen
    expect(formatMetric("net_pnl", 80, "EUR").replace(/\s/g, " ")).toBe("80,00 €");
    expect(formatMetric("win_rate", 66.7)).toBe("66,7 %");
    expect(formatMetric("discipline_score", 71)).toBe("71 / 100");
    expect(formatMetric("avg_r", null)).toBe("–");
  });

  it("fasst einen Zeitraum für das Review zusammen", () => {
    const s = summarizePeriod(
      data({
        trades: [t1, t2, t3, other],
        plans: [plan("2026-09-14", true, { lesson: "Geduld zahlt sich aus" }), plan("2026-09-15", false)],
      }),
      "week",
      "2026-09-14",
      "2026-09-21",
      new Map([
        ["a1", "EUR"],
        ["a2", "USD"],
      ]),
      new Map([["s1", "Breakout"]]),
    );
    expect(s.trades).toBe(3);
    expect(s.tradingDays).toBe(2);
    expect(s.pnlByCurrency).toEqual([
      ["EUR", 80],
      ["USD", 60],
    ]);
    expect(s.strategies[0]).toEqual({ name: "Breakout", trades: 2, winRate: 1 });
    expect(s.lessons).toEqual(["Geduld zahlt sich aus"]);
  });
});
