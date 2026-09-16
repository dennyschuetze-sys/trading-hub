import { describe, expect, it } from "vitest";
import type { CalendarEvent } from "./calendar";
import { attentionItems, currentStreak, recentForm, tradingStatus, type StatusRow } from "./dashboard";
import type { AccountRules } from "./prop-rules";
import type { StatTrade } from "./stats";

let seq = 0;
function trade(minute: number, net: number | null, extra: Partial<StatTrade> = {}): StatTrade {
  seq += 1;
  const time = new Date(Date.UTC(2026, 8, 14, 8, minute)).toISOString();
  return {
    id: `t${seq}`,
    account_id: "a1",
    symbol: "XAUUSD",
    direction: "long",
    status: "closed",
    entry_time: time,
    exit_time: time,
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

const prop = (extra: Partial<AccountRules> = {}): AccountRules => ({
  balance: 10_000,
  netPnl: 0,
  todayPnl: 0,
  todayTrades: 0,
  dailyLoss: null,
  drawdown: null,
  target: null,
  tradingDays: { done: 0, required: null },
  status: "ok",
  ...extra,
});

const row = (extra: Partial<StatusRow> = {}): StatusRow => ({
  name: "FTMO",
  currency: "EUR",
  today: { trades: null, lossStreak: null, dailyLoss: null, remainingDailyLoss: null },
  prop: prop(),
  ...extra,
});

// Dienstag, 15.09.2026, 13:00 Uhr Berlin
const now = new Date("2026-09-15T13:00:00+02:00");
const event = (time: string, extra: Partial<CalendarEvent> = {}): CalendarEvent => ({
  id: time,
  title: "Federal Funds Rate",
  currency: "USD",
  time: new Date(time).toISOString(),
  impact: "high",
  forecast: "",
  previous: "",
  ...extra,
});

const base = {
  now,
  isWorkday: true,
  planExists: true,
  nextHighImpact: null,
  lock: null,
  focus: row(),
  others: [],
  streak: null,
  rulesConfigured: true,
};

describe("currentStreak", () => {
  it("zählt die laufende Serie am Ende und ignoriert offene Trades", () => {
    expect(currentStreak([trade(1, 50), trade(2, -10), trade(3, -20), trade(4, null, { status: "open" })])).toEqual({ kind: "loss", count: 2 });
    expect(currentStreak([trade(1, -5), trade(2, 30)])).toEqual({ kind: "win", count: 1 });
  });

  it("liefert nichts ohne Trades oder nach Breakeven", () => {
    expect(currentStreak([])).toBeNull();
    expect(currentStreak([trade(1, 40), trade(2, 0)])).toBeNull();
  });
});

describe("recentForm", () => {
  it("wertet nur die letzten Trades aus", () => {
    const trades = [trade(1, -100), ...Array.from({ length: 10 }, (_, i) => trade(10 + i, i % 2 ? 20 : -10))];
    const form = recentForm(trades);
    expect(form.results).toHaveLength(10);
    expect(form.summary.netPnl).toBe(50);
    expect(form.summary.winRate).toBe(0.5);
  });
});

describe("tradingStatus", () => {
  it("nimmt den schlechtesten Stand aus Tagesregeln, kritischen Prop-Limits und News-Sperre", () => {
    expect(tradingStatus(row(), null)).toBe("ok");
    expect(tradingStatus(row({ today: { ...row().today, trades: { count: 2, max: 2, status: "danger" } } }), null)).toBe("danger");
    // Prop-Limit erst ab kritisch
    const warn = { used: 60, limit: 100, ratio: 0.6, remaining: 40, status: "warning" as const };
    expect(tradingStatus(row({ prop: prop({ dailyLoss: warn }) }), null)).toBe("ok");
    const lock = { state: "soon" as const, event: { title: "CPI", currency: "USD", time: now.toISOString() }, startsAt: now.toISOString() };
    expect(tradingStatus(null, lock)).toBe("warning");
  });
});

describe("attentionItems", () => {
  it("meldet nur tatsächliche Zustände, Wichtigstes zuerst", () => {
    const items = attentionItems({
      ...base,
      planExists: false,
      nextHighImpact: event("2026-09-15T13:30:00+02:00"),
      streak: { kind: "loss", count: 2 },
      focus: row({
        today: {
          trades: { count: 2, max: 2, status: "danger" },
          lossStreak: null,
          dailyLoss: { used: 75, limit: 100, ratio: 0.75, remaining: 25, status: "warning", pnl: -75 },
          remainingDailyLoss: 25,
        },
      }),
    });
    expect(items.map((i) => [i.tone, i.title])).toEqual([
      ["danger", "Trade-Limit erreicht (2/2)"],
      ["warning", "High-Impact-News in 30 Min."],
      ["warning", "2 Verlusttrades in Folge"],
      ["warning", "Tagesverlust-Limit zu 75 % erreicht"],
      ["info", "Tagesplan noch nicht erstellt"],
    ]);
  });

  it("bestätigt eingehaltene Limits nur, wenn es welche gibt", () => {
    const withLimits = row({ today: { ...row().today, trades: { count: 0, max: 2, status: "ok" } } });
    expect(attentionItems({ ...base, focus: withLimits }).map((i) => i.title)).toEqual(["Alle Limits im Rahmen"]);
    expect(attentionItems(base)).toEqual([]);
  });

  it("erfindet keine Warnungen: späte News als Info, kein Planhinweis am Wochenende, einzelner Verlust ohne Serie", () => {
    const items = attentionItems({
      ...base,
      isWorkday: false,
      planExists: false,
      nextHighImpact: event("2026-09-15T20:00:00+02:00"),
      streak: { kind: "loss", count: 1 },
      rulesConfigured: false,
    });
    expect(items.map((i) => [i.tone, i.title])).toEqual([
      ["info", "High-Impact-News heute 20:00 Uhr"],
      ["info", "Noch keine persönlichen Regeln"],
    ]);
  });
});
