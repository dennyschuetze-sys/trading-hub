import { describe, expect, it } from "vitest";
import type { DetailTrade } from "./stats";
import { advancedStats, detailBreakdowns, revengeTrades, riskPercents, streakContext, tradeNumberOfDay } from "./trade-analysis";

let seq = 0;
function trade(entry: string, exit: string | null, net: number | null, extra: Partial<DetailTrade> = {}): DetailTrade {
  seq += 1;
  return {
    id: `t${seq}`,
    account_id: "a1",
    symbol: "EURUSD",
    direction: "long",
    status: exit ? "closed" : "open",
    entry_time: entry,
    exit_time: exit,
    net_pnl: net,
    r_multiple: null,
    session: null,
    setup_quality: null,
    emotion: null,
    mistakes: [],
    followed_plan: null,
    strategy_id: null,
    risk_amount: null,
    entry_price: null,
    exit_price: null,
    stop_loss: null,
    take_profit: null,
    best_price: null,
    worst_price: null,
    pnl: net,
    commission: 0,
    swap: 0,
    entry_timeframe: null,
    htf_bias: null,
    market_context: null,
    moved_to_breakeven: null,
    partial_close: null,
    ...extra,
  };
}

describe("tradeNumberOfDay", () => {
  it("zählt je Account und Berliner Tag", () => {
    const a = trade("2026-09-01T07:00:00Z", "2026-09-01T07:30:00Z", 10);
    const b = trade("2026-09-01T09:00:00Z", "2026-09-01T09:30:00Z", 10);
    const c = trade("2026-09-01T08:00:00Z", "2026-09-01T08:30:00Z", 10, { account_id: "a2" });
    const d = trade("2026-09-02T07:00:00Z", "2026-09-02T07:30:00Z", 10);
    const n = tradeNumberOfDay([b, a, c, d]);
    expect([n.get(a.id), n.get(b.id), n.get(c.id), n.get(d.id)]).toEqual([1, 2, 1, 1]);
  });
});

describe("revengeTrades", () => {
  it("markiert Einstiege kurz nach einem Verlust im selben Account", () => {
    const loss = trade("2026-09-01T07:00:00Z", "2026-09-01T07:30:00Z", -50);
    const quick = trade("2026-09-01T07:40:00Z", "2026-09-01T08:00:00Z", 20);
    const later = trade("2026-09-01T09:00:00Z", "2026-09-01T09:10:00Z", 20);
    const otherAccount = trade("2026-09-01T07:35:00Z", "2026-09-01T07:50:00Z", 20, { account_id: "a2" });
    const set = revengeTrades([loss, quick, later, otherAccount]);
    expect([...set]).toEqual([quick.id]);
  });
});

describe("streakContext", () => {
  it("erkennt Trades nach Verlust- und Gewinnserien", () => {
    const ts = [-1, -1, 5, 5, 5, -1].map((net, i) =>
      trade(`2026-09-01T0${i}:00:00Z`, `2026-09-01T0${i}:30:00Z`, net),
    );
    const ctx = streakContext(ts);
    expect(ts.map((t) => ctx.get(t.id))).toEqual(["other", "other", "after_losses", "other", "after_wins", "after_wins"]);
  });
});

describe("riskPercents", () => {
  it("bezieht das Risiko auf den Kontostand vor dem Trade", () => {
    const a = trade("2026-09-01T07:00:00Z", "2026-09-01T07:30:00Z", 1000, { risk_amount: 500 });
    const b = trade("2026-09-01T08:00:00Z", "2026-09-01T08:30:00Z", -100, { risk_amount: 1010 });
    const pct = riskPercents([a, b], new Map([["a1", 100000]]));
    expect(pct.get(a.id)).toBeCloseTo(0.005);
    expect(pct.get(b.id)).toBeCloseTo(0.01);
  });
});

describe("advancedStats", () => {
  it("MFE/MAE, Exits, SL-Größe, Kosten und R-Verteilung", () => {
    const base = { entry_price: 1.1, stop_loss: 1.099, take_profit: 1.102, risk_amount: 100 };
    // Gewinner am TP, vorher 3 R möglich, fast ausgestoppt
    const win = trade("2026-09-01T07:00:00Z", "2026-09-01T07:30:00Z", 190, {
      ...base, exit_price: 1.102, best_price: 1.103, worst_price: 1.0991, r_multiple: 1.9, commission: -10,
    });
    // Verlierer am SL, vorher 1 R im Plus
    const loss = trade("2026-09-01T08:00:00Z", "2026-09-01T08:30:00Z", -110, {
      ...base, exit_price: 1.099, best_price: 1.101, worst_price: 1.099, r_multiple: -1.1, commission: -10,
    });
    const s = advancedStats([win, loss]);
    expect(s.mfe.count).toBe(2);
    expect(s.mfe.avgMfeR).toBe(2);
    expect(s.mfe.winnersNearStop).toBe(1);
    expect(s.mfe.losersWithOneR).toBe(1);
    expect(s.mfe.givenBackR).toBe(3.2);
    expect(s.exits).toEqual({ sl: 1, tp: 1, manual: 0 });
    expect(s.stopBySymbol).toEqual([{ symbol: "EURUSD", avg: 10, unit: "Pips", count: 2 }]);
    expect(s.plan).toEqual({ count: 2, avgPlannedRR: 2, avgR: 0.4 });
    expect(s.costs.avgR).toBe(-0.1);
    expect(s.rBuckets.find((b) => b.label === "−2 bis −1 R")?.count).toBe(1);
    expect(s.rBuckets.find((b) => b.label === "1 bis 2 R")?.count).toBe(1);
  });

  it("kommt ohne Kursdaten aus", () => {
    const s = advancedStats([trade("2026-09-01T07:00:00Z", "2026-09-01T07:30:00Z", 10)]);
    expect(s.mfe.avgMfeR).toBeNull();
    expect(s.risk.avgPct).toBeNull();
    expect(s.stopBySymbol).toEqual([]);
  });
});

describe("detailBreakdowns", () => {
  it("gruppiert nach Haltedauer und Kontext", () => {
    const a = trade("2026-09-01T07:00:00Z", "2026-09-01T07:03:00Z", 10, { htf_bias: "with" });
    const b = trade("2026-09-01T08:00:00Z", "2026-09-01T10:00:00Z", -10, { htf_bias: "against" });
    const b2 = detailBreakdowns([a, b], { tradeNumbers: tradeNumberOfDay([a, b]), revenge: new Set(), streaks: new Map() });
    expect(b2.holdTime.map((r) => r.label)).toEqual(["< 5 Min.", "1–4 Std."]);
    expect(b2.htfBias.map((r) => [r.label, r.netPnl])).toEqual([["Mit dem Trend", 10], ["Gegen den Trend", -10]]);
    expect(b2.tradeOfDay.map((r) => r.label)).toEqual(["1. Trade des Tages", "2. Trade des Tages"]);
  });
});
