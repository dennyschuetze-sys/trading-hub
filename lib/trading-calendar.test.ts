import { describe, expect, it } from "vitest";
import type { CoreTrade } from "@/lib/stats";
import { calendarDays, monthBounds, monthWeeks, parseMonth, shiftMonth, summarizeMonth, tradesOfDay } from "./trading-calendar";

const trade = (over: Partial<CoreTrade> & Pick<CoreTrade, "entry_time">): CoreTrade => ({
  id: over.entry_time,
  symbol: "NQ",
  direction: "long",
  status: "closed",
  exit_time: over.entry_time,
  net_pnl: 0,
  r_multiple: null,
  session: null,
  setup_quality: null,
  emotion: null,
  mistakes: [],
  followed_plan: null,
  strategy_id: null,
  risk_amount: null,
  ...over,
});

describe("Monat", () => {
  it("nimmt gültige Monate, sonst den aktuellen", () => {
    expect(parseMonth("2026-03", "2026-09-30")).toBe("2026-03");
    expect(parseMonth("2026-13", "2026-09-30")).toBe("2026-09");
    expect(parseMonth("März", "2026-09-30")).toBe("2026-09");
    expect(parseMonth(undefined, "2026-09-30")).toBe("2026-09");
  });

  it("wechselt über Jahresgrenzen", () => {
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
  });

  it("kennt Anfang und Ende, auch im Schaltjahr", () => {
    expect(monthBounds("2026-09")).toEqual({ first: "2026-09-01", last: "2026-09-30" });
    expect(monthBounds("2028-02").last).toBe("2028-02-29");
  });

  it("legt die Wochen mit Montag zuerst aus", () => {
    const weeks = monthWeeks("2026-09"); // 1. September 2026 ist ein Dienstag
    expect(weeks[0]).toEqual([null, "2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04", "2026-09-05", "2026-09-06"]);
    expect(weeks.at(-1)!.filter(Boolean).at(-1)).toBe("2026-09-30");
    expect(weeks.every((w) => w.length === 7)).toBe(true);
  });
});

describe("Tage im Kalender", () => {
  const closed = [
    trade({ entry_time: "2026-09-14T08:00:00Z", exit_time: "2026-09-14T09:00:00Z", net_pnl: 120.5 }),
    trade({ entry_time: "2026-09-14T10:00:00Z", exit_time: "2026-09-14T11:00:00Z", net_pnl: -20.5 }),
    trade({ entry_time: "2026-09-15T08:00:00Z", exit_time: "2026-09-15T09:00:00Z", net_pnl: -50 }),
  ];

  it("fasst geschlossene Trades nach Tag zusammen", () => {
    const days = calendarDays({ month: "2026-09", closed, entered: closed, entries: closed, plans: [] });
    expect(days.get("2026-09-14")).toMatchObject({ pnl: 100, closed: 2, open: 0, noTrade: false });
    expect(days.get("2026-09-15")).toMatchObject({ pnl: -50, closed: 1 });
    expect(days.size).toBe(2);
  });

  it("zählt laufende Trades am Tag des Einstiegs", () => {
    const running = trade({ entry_time: "2026-09-16T08:00:00Z", status: "open", exit_time: null, net_pnl: null });
    const days = calendarDays({ month: "2026-09", closed: [], entered: [running], entries: [running], plans: [] });
    expect(days.get("2026-09-16")).toMatchObject({ pnl: null, closed: 0, open: 1 });
  });

  it("markiert Kein-Trade-Tage nur ohne Trades – auch aus anderen Accounts", () => {
    const otherAccount = trade({ entry_time: "2026-09-18T08:00:00Z" });
    const plans = [
      { plan_date: "2026-09-17", no_trade: true, no_trade_reason: "no_setup" },
      { plan_date: "2026-09-18", no_trade: true, no_trade_reason: null },
      { plan_date: "2026-09-19", no_trade: false, no_trade_reason: null },
    ];
    const days = calendarDays({ month: "2026-09", closed: [], entered: [], entries: [otherAccount], plans });
    expect(days.get("2026-09-17")).toMatchObject({ noTrade: true, noTradeReason: "no_setup" });
    expect(days.has("2026-09-18")).toBe(false);
    expect(days.has("2026-09-19")).toBe(false);
  });

  it("ordnet nach Berliner Tag zu, nicht nach UTC", () => {
    // 23:30 UTC am 14.09. ist in Berlin (Sommerzeit) schon der 15.09.
    const late = trade({ entry_time: "2026-09-14T22:00:00Z", exit_time: "2026-09-14T23:30:00Z", net_pnl: 10 });
    const days = calendarDays({ month: "2026-09", closed: [late], entered: [late], entries: [late], plans: [] });
    expect(days.has("2026-09-14")).toBe(false);
    expect(days.get("2026-09-15")?.pnl).toBe(10);
  });

  it("ignoriert Tage außerhalb des Monats", () => {
    const days = calendarDays({ month: "2026-10", closed, entered: closed, entries: closed, plans: [] });
    expect(days.size).toBe(0);
  });
});

describe("Trades eines Tages", () => {
  const overnight = trade({ id: "nacht", entry_time: "2026-09-14T20:00:00Z", exit_time: "2026-09-15T08:00:00Z", net_pnl: 30 });
  const morning = trade({ id: "frueh", entry_time: "2026-09-15T06:00:00Z", exit_time: "2026-09-15T07:00:00Z", net_pnl: -10 });
  const running = trade({ id: "offen", entry_time: "2026-09-15T09:00:00Z", status: "open", exit_time: null, net_pnl: null });
  const closed = [overnight, morning];

  it("nimmt geschlossene Trades nach Ausstieg, laufende nach Einstieg – nach Einstiegszeit sortiert", () => {
    const list = tradesOfDay("2026-09-15", closed, [overnight, morning, running]);
    expect(list.map((t) => t.id)).toEqual(["nacht", "frueh", "offen"]);
  });

  it("ein über Nacht gehaltener Trade gehört nicht zum Einstiegstag", () => {
    expect(tradesOfDay("2026-09-14", closed, [overnight, morning, running])).toEqual([]);
  });

  it("Tag ohne Trades", () => {
    expect(tradesOfDay("2026-09-16", closed, [running])).toEqual([]);
  });
});

describe("Monatsübersicht", () => {
  it("zählt Handels-, Gewinn-, Verlust- und Kein-Trade-Tage", () => {
    const closed = [
      trade({ entry_time: "2026-09-14T08:00:00Z", net_pnl: 100 }),
      trade({ entry_time: "2026-09-14T09:00:00Z", net_pnl: 20.25 }),
      trade({ entry_time: "2026-09-15T08:00:00Z", net_pnl: -50 }),
      trade({ entry_time: "2026-09-16T08:00:00Z", net_pnl: 0 }),
    ];
    const plans = [{ plan_date: "2026-09-17", no_trade: true, no_trade_reason: "market" }];
    const days = calendarDays({ month: "2026-09", closed, entered: closed, entries: closed, plans });
    expect(summarizeMonth(days.values())).toEqual({
      tradingDays: 3,
      trades: 4,
      pnl: 70.25,
      winDays: 1,
      lossDays: 1,
      noTradeDays: 1,
    });
  });

  it("leerer Monat", () => {
    expect(summarizeMonth([])).toEqual({ tradingDays: 0, trades: 0, pnl: 0, winDays: 0, lossDays: 0, noTradeDays: 0 });
  });
});
