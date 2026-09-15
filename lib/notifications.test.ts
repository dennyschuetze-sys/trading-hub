import { describe, expect, it } from "vitest";
import type { CalendarEvent } from "./calendar";
import { DEFAULT_PREFS, berlinClock, planNotifications, timeToMinutes, type PlannerInput } from "./notifications";
import { evaluateAccount } from "./prop-rules";

// Dienstag, 15.09.2026 – Berlin ist UTC+2
const at = (berlin: string) => new Date(`2026-09-15T${berlin}:00+02:00`);

const event = (time: Date, extra: Partial<CalendarEvent> = {}): CalendarEvent => ({
  id: `e${time.getTime()}`,
  title: "Core CPI m/m",
  currency: "USD",
  time: time.toISOString(),
  impact: "high",
  forecast: "",
  previous: "",
  ...extra,
});

function input(extra: Partial<PlannerInput> = {}): PlannerInput {
  return {
    prefs: { ...DEFAULT_PREFS, plan_enabled: false, journal_enabled: false, drawdown_enabled: false },
    now: at("14:20"),
    events: [],
    currencies: ["USD", "EUR"],
    plan: { exists: false, reviewed: false },
    tradesToday: 0,
    accounts: [],
    ...extra,
  };
}

describe("Hilfsfunktionen", () => {
  it("liefert Berliner Datum, Wochentag und Minuten", () => {
    expect(berlinClock(at("08:45"))).toEqual({ date: "2026-09-15", weekday: 2, minutes: 525 });
    expect(timeToMinutes("22:00:00")).toBe(1320);
  });
});

describe("News-Erinnerung", () => {
  it("meldet High-Impact-Termine der eigenen Währungen im Vorlauf, gebündelt je Uhrzeit", () => {
    const soon = at("14:30");
    const messages = planNotifications(
      input({
        events: [
          event(soon),
          event(soon, { id: "x", title: "CPI y/y" }),
          event(soon, { id: "jpy", currency: "JPY" }),
          event(soon, { id: "low", impact: "medium" }),
          event(at("15:00"), { id: "later" }),
          event(at("14:10"), { id: "past" }),
        ],
      }),
    );
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({ kind: "news", ref: soon.toISOString() });
    expect(messages[0].text).toContain("in 10 Min.");
    expect(messages[0].text).toContain("CPI y/y");
    expect(messages[0].text).not.toContain("JPY");
  });

  it("maskiert HTML in Termintiteln", () => {
    const [m] = planNotifications(input({ events: [event(at("14:25"), { title: "S&P <Flash>" })] }));
    expect(m.text).toContain("S&amp;P &lt;Flash&gt;");
  });
});

describe("Tagesplan- und Journal-Erinnerung", () => {
  const prefs = { ...DEFAULT_PREFS, news_enabled: false, drawdown_enabled: false };

  it("erinnert an den Plan nur im Zeitfenster und nur ohne Plan", () => {
    expect(planNotifications(input({ prefs, now: at("08:29") }))).toHaveLength(0);
    expect(planNotifications(input({ prefs, now: at("08:30") }))[0]).toMatchObject({ kind: "plan", ref: "2026-09-15" });
    expect(planNotifications(input({ prefs, now: at("09:31") }))).toHaveLength(0);
    expect(planNotifications(input({ prefs, now: at("08:40"), plan: { exists: true, reviewed: false } }))).toHaveLength(0);
  });

  it("überspringt Wochenenden, wenn gewünscht", () => {
    const saturday = new Date("2026-09-19T08:35:00+02:00");
    expect(planNotifications(input({ prefs, now: saturday }))).toHaveLength(0);
    expect(planNotifications(input({ prefs: { ...prefs, weekdays_only: false }, now: saturday }))).toHaveLength(1);
  });

  it("erinnert abends ans Journal, wenn gehandelt oder geplant wurde und das Review fehlt", () => {
    const evening = at("22:05");
    expect(planNotifications(input({ prefs, now: evening, plan: { exists: true, reviewed: true } }))).toHaveLength(0);
    expect(planNotifications(input({ prefs, now: evening }))).toHaveLength(0);
    const [m] = planNotifications(input({ prefs, now: evening, tradesToday: 3, plan: { exists: true, reviewed: false } }));
    expect(m).toMatchObject({ kind: "journal", ref: "2026-09-15" });
    expect(m.text).toContain("3 Trades");
  });
});

describe("Drawdown-Warnung", () => {
  const prefs = { ...DEFAULT_PREFS, news_enabled: false, plan_enabled: false, journal_enabled: false };
  const account = { starting_balance: 100_000, max_daily_loss: 5_000, max_drawdown: 10_000, drawdown_type: "static", profit_target: null, min_trading_days: null };
  const loss = (net: number, time: string) => ({
    id: time,
    account_id: "a1",
    symbol: "NQ",
    direction: "long",
    status: "closed",
    entry_time: at(time).toISOString(),
    exit_time: at(time).toISOString(),
    net_pnl: net,
    r_multiple: null,
    session: null,
    setup_quality: null,
    emotion: null,
    mistakes: [],
    followed_plan: null,
    strategy_id: null,
    risk_amount: null,
  });

  it("warnt ab der Schwelle und meldet erreichte Limits", () => {
    const now = at("15:00");
    const warn = evaluateAccount(account, [loss(-4_200, "10:00")], now);
    const [m] = planNotifications(input({ prefs, now, accounts: [{ id: "a1", name: "FTMO 100k", currency: "USD", rules: warn }] }));
    expect(m).toMatchObject({ kind: "drawdown", ref: "2026-09-15:a1:daily" });
    expect(m.text).toContain("84 %");

    const breached = evaluateAccount(account, [loss(-5_000, "10:00")], now);
    const [b] = planNotifications(input({ prefs, now, accounts: [{ id: "a1", name: "FTMO 100k", currency: "USD", rules: breached }] }));
    expect(b.text).toContain("Limit erreicht");

    const fine = evaluateAccount(account, [loss(-1_000, "10:00")], now);
    expect(planNotifications(input({ prefs, now, accounts: [{ id: "a1", name: "x", currency: "USD", rules: fine }] }))).toHaveLength(0);
  });
});
