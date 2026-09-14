import { describe, expect, it } from "vitest";
import { countStatus, evaluateToday, findViolations, newsLock, NO_RULES, ruleBreakdowns, type RiskRules } from "./risk-rules";
import type { StatTrade } from "./stats";

let seq = 0;
/** Trade mit Einstieg/Ausstieg in UTC (September: Berlin = UTC+2). */
function trade(entry: string, exit: string | null, net: number | null, extra: Partial<StatTrade> = {}): StatTrade {
  seq += 1;
  return {
    id: `t${seq}`,
    account_id: "a1",
    symbol: "EURUSD",
    direction: "long",
    status: exit ? "closed" : "open",
    entry_time: new Date(entry).toISOString(),
    exit_time: exit ? new Date(exit).toISOString() : null,
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

const account = { id: "a1", starting_balance: 10_000, currency: "EUR" };
const rules = (r: Partial<RiskRules>): RiskRules => ({ ...NO_RULES, ...r });
const kinds = (map: Map<string, { kind: string }[]>, id: string) => (map.get(id) ?? []).map((v) => v.kind);

describe("findViolations", () => {
  it("markiert Trades über dem Tagesmaximum – je Account und Berliner Tag", () => {
    const a = trade("2026-09-14T07:00:00Z", "2026-09-14T07:30:00Z", 10);
    const b = trade("2026-09-14T08:00:00Z", "2026-09-14T08:30:00Z", 10);
    const c = trade("2026-09-14T09:00:00Z", "2026-09-14T09:30:00Z", 10);
    const other = trade("2026-09-14T09:10:00Z", null, null, { account_id: "a2" });
    // 23:30 UTC = 01:30 Berlin am Folgetag → neuer Tag
    const nextDay = trade("2026-09-14T23:30:00Z", null, null);
    const v = findViolations([c, a, b, other, nextDay], [account, { ...account, id: "a2" }], rules({ maxTradesPerDay: 2 }));
    expect(kinds(v, a.id)).toEqual([]);
    expect(kinds(v, b.id)).toEqual([]);
    expect(kinds(v, c.id)).toEqual(["max_trades"]);
    expect(v.get(c.id)![0].message).toContain("3. Trade");
    expect(kinds(v, other.id)).toEqual([]);
    expect(kinds(v, nextDay.id)).toEqual([]);
  });

  it("Verlustserie zählt nur vor dem Einstieg geschlossene Trades, ein Gewinner setzt zurück", () => {
    const l1 = trade("2026-09-14T07:00:00Z", "2026-09-14T07:10:00Z", -50);
    const l2 = trade("2026-09-14T07:20:00Z", "2026-09-14T07:30:00Z", -50);
    const afterTwo = trade("2026-09-14T07:40:00Z", "2026-09-14T07:50:00Z", 80);
    const afterWin = trade("2026-09-14T08:00:00Z", "2026-09-14T08:10:00Z", -20);
    // parallel zu l2 eröffnet – l2 war da noch offen
    const parallel = trade("2026-09-14T07:25:00Z", "2026-09-14T09:00:00Z", 5);
    const v = findViolations([l1, l2, afterTwo, afterWin, parallel], [account], rules({ maxConsecutiveLosses: 2 }));
    expect(kinds(v, afterTwo.id)).toEqual(["loss_streak"]);
    expect(kinds(v, afterWin.id)).toEqual([]);
    expect(kinds(v, parallel.id)).toEqual([]);
  });

  it("Tageslimit in % vom Startkapital", () => {
    const loss = trade("2026-09-14T07:00:00Z", "2026-09-14T07:10:00Z", -200);
    const next = trade("2026-09-14T07:30:00Z", "2026-09-14T07:40:00Z", 30);
    const v = findViolations([loss, next], [account], rules({ dailyLossLimitPct: 2 }));
    expect(kinds(v, next.id)).toEqual(["daily_loss"]);
    expect(kinds(findViolations([loss, next], [account], rules({ dailyLossLimitPct: 2.5 })), next.id)).toEqual([]);
  });

  it("Risiko pro Trade mit 5 % Toleranz", () => {
    const fine = trade("2026-09-14T07:00:00Z", null, null, { risk_amount: 104 });
    const tooBig = trade("2026-09-14T08:00:00Z", null, null, { risk_amount: 106 });
    const unknown = trade("2026-09-14T09:00:00Z", null, null);
    const v = findViolations([fine, tooBig, unknown], [account], rules({ maxRiskPerTradePct: 1 }));
    expect(kinds(v, fine.id)).toEqual([]);
    expect(kinds(v, tooBig.id)).toEqual(["risk_per_trade"]);
    expect(kinds(v, unknown.id)).toEqual([]);
  });

  it("News-Sperrzeit nur für betroffene Währungen", () => {
    const events = [{ title: "Non-Farm Payrolls", currency: "USD", time: "2026-09-14T12:30:00.000Z" }];
    const before = trade("2026-09-14T12:20:00Z", null, null);
    const after = trade("2026-09-14T12:40:00Z", null, null, { symbol: "NAS100.cash" });
    const outside = trade("2026-09-14T12:50:00Z", null, null);
    const unaffected = trade("2026-09-14T12:30:00Z", null, null, { symbol: "GER40" });
    const v = findViolations([before, after, outside, unaffected], [account], rules({ newsBlockBeforeMin: 15, newsBlockAfterMin: 15 }), events);
    expect(v.get(before.id)![0].message).toBe("Eröffnet 10 Min. vor „Non-Farm Payrolls“ (USD)");
    expect(v.get(after.id)![0].message).toContain("10 Min. nach");
    expect(kinds(v, outside.id)).toEqual([]);
    expect(kinds(v, unaffected.id)).toEqual([]);
  });

  it("ohne Regeln keine Verstöße", () => {
    const t = trade("2026-09-14T07:00:00Z", "2026-09-14T07:10:00Z", -5000, { risk_amount: 5000 });
    expect(findViolations([t], [account], NO_RULES).size).toBe(0);
  });
});

describe("evaluateToday", () => {
  const now = new Date("2026-09-14T14:00:00Z");

  it("zählt heutige Trades, aktuelle Serie und Tagesverlust", () => {
    const yesterday = trade("2026-09-13T10:00:00Z", "2026-09-13T10:10:00Z", -500);
    const t1 = trade("2026-09-14T07:00:00Z", "2026-09-14T07:10:00Z", -100);
    const t2 = trade("2026-09-14T08:00:00Z", "2026-09-14T08:10:00Z", -60);
    const open = trade("2026-09-14T13:00:00Z", null, null);
    const r = evaluateToday(account, [yesterday, t1, t2, open], rules({ maxTradesPerDay: 3, maxConsecutiveLosses: 3, dailyLossLimitPct: 2 }), now);
    expect(r.trades).toEqual({ count: 3, max: 3, status: "danger" });
    expect(r.lossStreak).toEqual({ count: 2, max: 3, status: "warning" });
    expect(r.dailyLoss).toMatchObject({ used: 160, limit: 200, remaining: 40, pnl: -160, status: "danger" });
    expect(r.remainingDailyLoss).toBe(40);
  });

  it("countStatus", () => {
    expect([countStatus(1, 5), countStatus(4, 5), countStatus(5, 5), countStatus(6, 5)]).toEqual(["ok", "warning", "danger", "breached"]);
    expect([countStatus(1, 2), countStatus(0, 1)]).toEqual(["ok", "ok"]);
  });
});

describe("newsLock", () => {
  const events = [
    { title: "CPI", currency: "USD", time: "2026-09-14T12:30:00.000Z" },
    { title: "Retail Sales", currency: "USD", time: "2026-09-14T12:40:00.000Z" },
    { title: "ZEW", currency: "EUR", time: "2026-09-14T09:00:00.000Z" },
  ];
  const r = rules({ newsBlockBeforeMin: 10, newsBlockAfterMin: 10 });

  it("aktive Sperre bis zum Ende überlappender Termine", () => {
    const lock = newsLock(events, ["USD"], r, new Date("2026-09-14T12:35:00Z"));
    expect(lock).toMatchObject({ state: "active", until: "2026-09-14T12:50:00.000Z" });
  });

  it("kündigt eine Sperre innerhalb der nächsten Stunde an", () => {
    const lock = newsLock(events, ["USD"], r, new Date("2026-09-14T11:45:00Z"));
    expect(lock).toMatchObject({ state: "soon", startsAt: "2026-09-14T12:20:00.000Z" });
    expect(newsLock(events, ["USD"], r, new Date("2026-09-14T10:00:00Z"))).toBeNull();
    expect(newsLock(events, ["GBP"], r, new Date("2026-09-14T12:35:00Z"))).toBeNull();
    expect(newsLock(events, ["USD"], NO_RULES, new Date("2026-09-14T12:35:00Z"))).toBeNull();
  });
});

describe("ruleBreakdowns", () => {
  it("vergleicht Trades mit und ohne Verstoß", () => {
    const a = trade("2026-09-14T07:00:00Z", "2026-09-14T07:10:00Z", 100);
    const b = trade("2026-09-14T08:00:00Z", "2026-09-14T08:10:00Z", -40);
    const map = new Map([[b.id, [{ kind: "max_trades" as const, message: "" }, { kind: "max_trades" as const, message: "" }]]]);
    const { compliance, byRule } = ruleBreakdowns([a, b], map);
    expect(compliance.map((x) => [x.label, x.count, x.netPnl])).toEqual([
      ["Regeln eingehalten", 1, 100],
      ["Mindestens eine Regel gebrochen", 1, -40],
    ]);
    expect(byRule.map((x) => [x.key, x.count])).toEqual([["max_trades", 1]]);
  });
});
