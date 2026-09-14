import { describe, expect, it } from "vitest";
import { evaluateAccount, statusFor } from "./prop-rules";
import { breakdown, checklistBreakdowns, dailyResults, equityCurve, maxDrawdown, summarize, type StatTrade } from "./stats";

let seq = 0;
function trade(net: number, exit: string, extra: Partial<StatTrade> = {}): StatTrade {
  seq += 1;
  const exitDate = new Date(exit);
  return {
    id: `t${seq}`,
    account_id: "a1",
    symbol: "XAUUSD",
    direction: "long",
    status: "closed",
    entry_time: new Date(exitDate.getTime() - 30 * 60000).toISOString(),
    exit_time: exitDate.toISOString(),
    net_pnl: net,
    r_multiple: null,
    session: "london",
    setup_quality: null,
    emotion: null,
    mistakes: [],
    followed_plan: null,
    strategy_id: null,
    ...extra,
  };
}

describe("checklistBreakdowns", () => {
  it("unterscheidet volle, teilweise und fehlende Regeltreue", () => {
    const items = [
      { id: "i1", label: "Trend bestätigt" },
      { id: "i2", label: "Keine News" },
    ];
    const a = trade(100, "2026-09-01T09:00:00Z");
    const b = trade(-50, "2026-09-01T10:00:00Z");
    const c = trade(-20, "2026-09-01T11:00:00Z");
    const { compliance, missed } = checklistBreakdowns([a, b, c], items, [
      { trade_id: a.id, item_id: "i1", checked: true },
      { trade_id: a.id, item_id: "i2", checked: true },
      { trade_id: b.id, item_id: "i1", checked: true },
      { trade_id: b.id, item_id: "i2", checked: false },
      { trade_id: c.id, item_id: "gelöschter-punkt", checked: false },
    ]);
    expect(compliance.map((r) => [r.label, r.count, r.netPnl])).toEqual([
      ["Alle Punkte erfüllt", 1, 100],
      ["Nicht alle erfüllt", 1, -50],
      ["Ohne Checkliste", 1, -20],
    ]);
    expect(missed.map((r) => [r.label, r.count, r.netPnl])).toEqual([["Keine News", 1, -50]]);
  });
});

describe("summarize", () => {
  const trades = [
    trade(100, "2026-09-01T09:00:00Z", { r_multiple: 2 }),
    trade(-50, "2026-09-01T11:00:00Z", { r_multiple: -1 }),
    trade(-50, "2026-09-02T09:00:00Z", { r_multiple: -1 }),
    trade(200, "2026-09-03T09:00:00Z"),
    trade(0, "2026-09-03T10:00:00Z"),
    trade(999, "2026-09-03T11:00:00Z", { status: "open" }),
  ];
  const s = summarize(trades);

  it("zählt nur geschlossene Trades", () => {
    expect(s).toMatchObject({ count: 5, wins: 2, losses: 2, breakeven: 1 });
  });

  it("berechnet die Kernkennzahlen", () => {
    expect(s.netPnl).toBe(200);
    expect(s.winRate).toBeCloseTo(0.4);
    expect(s.profitFactor).toBe(3);
    expect(s.avgWin).toBe(150);
    expect(s.avgLoss).toBe(-50);
    expect(s.expectancy).toBe(40);
    expect(s.avgR).toBe(0);
    expect(s.rCount).toBe(3);
    expect(s.largestWin).toBe(200);
    expect(s.largestLoss).toBe(-50);
    expect(s.maxLossStreak).toBe(2);
    expect(s.tradingDays).toBe(3);
    expect(s.avgHoldMinutes).toBe(30);
  });

  it("ohne Verlierer gibt es keinen Profit Factor", () => {
    expect(summarize([trade(10, "2026-09-01T09:00:00Z")]).profitFactor).toBeNull();
  });

  it("leere Liste", () => {
    expect(summarize([])).toMatchObject({ count: 0, winRate: null, netPnl: 0 });
  });
});

describe("Equity & Drawdown", () => {
  it("baut die Kurve in Schließ-Reihenfolge und misst den Drawdown vom Hoch", () => {
    const points = equityCurve(
      [
        trade(-300, "2026-09-02T09:00:00Z"),
        trade(500, "2026-09-01T09:00:00Z"),
        trade(100, "2026-09-03T09:00:00Z"),
      ],
      10000,
    );
    expect(points.map((p) => p.balance)).toEqual([10000, 10500, 10200, 10300]);
    expect(maxDrawdown(points)).toEqual({ amount: 300, percent: 300 / 10500 });
  });
});

describe("dailyResults", () => {
  it("gruppiert nach Berliner Kalendertag", () => {
    // 23:30 UTC am 1.9. ist in Berlin schon der 2.9.
    const days = dailyResults([trade(50, "2026-09-01T21:00:00Z"), trade(-20, "2026-09-01T23:30:00Z")]);
    expect(days).toEqual([
      { date: "2026-09-01", pnl: 50, count: 1, wins: 1 },
      { date: "2026-09-02", pnl: -20, count: 1, wins: 0 },
    ]);
  });
});

describe("breakdown", () => {
  it("verteilt Mehrfachwerte (z. B. Fehler) auf mehrere Gruppen", () => {
    const rows = breakdown(
      [
        trade(-50, "2026-09-01T09:00:00Z", { mistakes: ["FOMO", "Overtrading"] }),
        trade(-30, "2026-09-01T10:00:00Z", { mistakes: ["FOMO"] }),
      ],
      (t) => t.mistakes,
    );
    expect(rows).toEqual([
      expect.objectContaining({ key: "Overtrading", count: 1, netPnl: -50 }),
      expect.objectContaining({ key: "FOMO", count: 2, netPnl: -80 }),
    ]);
  });
});

describe("Prop-Firm-Regeln", () => {
  const account = {
    starting_balance: 10000,
    max_daily_loss: 500,
    max_drawdown: 1000,
    drawdown_type: "static",
    profit_target: 1000,
    min_trading_days: 4,
  };
  const now = new Date("2026-09-03T15:00:00Z");
  const trades = [
    trade(600, "2026-09-01T09:00:00Z"),
    trade(-100, "2026-09-02T09:00:00Z"),
    trade(-250, "2026-09-03T08:00:00Z"),
    trade(-150, "2026-09-03T12:00:00Z"),
  ];

  it("Tagesverlust zählt nur heute (Berliner Zeit)", () => {
    const r = evaluateAccount(account, trades, now);
    expect(r.todayPnl).toBe(-400);
    expect(r.todayTrades).toBe(2);
    expect(r.dailyLoss).toMatchObject({ used: 400, remaining: 100, status: "danger" });
  });

  it("fester Drawdown misst vom Startkapital", () => {
    const r = evaluateAccount(account, trades, now);
    expect(r.balance).toBe(10100);
    expect(r.drawdown).toMatchObject({ used: 0, floor: 9000, status: "ok" });
    expect(r.target).toMatchObject({ remaining: 900, reached: false });
    expect(r.tradingDays).toEqual({ done: 3, required: 4 });
    expect(r.status).toBe("danger");
  });

  it("Trailing-Drawdown misst vom höchsten Kontostand", () => {
    const r = evaluateAccount({ ...account, drawdown_type: "trailing" }, trades, now);
    expect(r.drawdown).toMatchObject({ peak: 10600, used: 500, floor: 9600, status: "warning" });
  });

  it("End-of-Day-Trailing nutzt nur Tagesschlussstände", () => {
    const intraday = [trade(800, "2026-09-03T08:00:00Z"), trade(-700, "2026-09-03T12:00:00Z")];
    // Intraday-Hoch 10.800 zählt nicht, heute ist noch kein Tagesschluss
    const r = evaluateAccount({ ...account, drawdown_type: "eod_trailing" }, intraday, now);
    expect(r.drawdown).toMatchObject({ peak: 10000, used: 0 });
    // Am nächsten Tag ist 10.100 der Schlussstand des Vortags
    const next = evaluateAccount({ ...account, drawdown_type: "eod_trailing" }, intraday, new Date("2026-09-04T10:00:00Z"));
    expect(next.drawdown).toMatchObject({ peak: 10100, used: 0 });
  });

  it("Status-Schwellen", () => {
    expect([0.2, 0.5, 0.8, 1].map(statusFor)).toEqual(["ok", "warning", "danger", "breached"]);
  });

  it("ohne Regeln keine Limits", () => {
    const r = evaluateAccount(
      { starting_balance: 1000, max_daily_loss: null, max_drawdown: null, drawdown_type: "static", profit_target: null, min_trading_days: null },
      [],
      now,
    );
    expect(r).toMatchObject({ dailyLoss: null, drawdown: null, target: null, status: "ok", balance: 1000 });
  });
});
