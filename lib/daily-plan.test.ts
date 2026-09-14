import { describe, expect, it } from "vitest";
import {
  DEFAULT_ROUTINE,
  checkDay,
  isValidDate,
  parseMarkets,
  parseRoutine,
  planStatus,
  readMarkets,
  routineTemplate,
  shiftDate,
  todayBerlin,
} from "./daily-plan";

function form(entries: [string, string][]) {
  const fd = new FormData();
  entries.forEach(([k, v]) => fd.append(k, v));
  return fd;
}

describe("Datum", () => {
  it("heute in Berliner Zeit", () => {
    // 23:30 UTC am 14.9. ist in Berlin schon der 15.9.
    expect(todayBerlin(new Date("2026-09-14T23:30:00Z"))).toBe("2026-09-15");
  });

  it("prüft und verschiebt Daten", () => {
    expect(isValidDate("2026-02-28")).toBe(true);
    expect(isValidDate("2026-02-30")).toBe(false);
    expect(isValidDate("14.09.2026")).toBe(false);
    expect(shiftDate("2026-03-01", -1)).toBe("2026-02-28");
    expect(shiftDate("2026-12-31", 1)).toBe("2027-01-01");
  });
});

describe("parseMarkets", () => {
  it("liest Zeilen, normalisiert und verwirft leere", () => {
    const fd = form([
      ["market_symbol", " xauusd "],
      ["market_bias", "bullish"],
      ["market_levels", "2350 / 2330"],
      ["market_scenario", "Long nach Retest"],
      ["market_symbol", ""],
      ["market_bias", "bearish"],
      ["market_levels", ""],
      ["market_scenario", ""],
      ["market_symbol", "NQ"],
      ["market_bias", "quatsch"],
      ["market_levels", ""],
      ["market_scenario", ""],
    ]);
    expect(parseMarkets(fd)).toEqual([
      { symbol: "XAUUSD", bias: "bullish", levels: "2350 / 2330", scenario: "Long nach Retest" },
      { symbol: "NQ", bias: null, levels: "", scenario: "" },
    ]);
  });
});

describe("Routine", () => {
  it("ordnet Häkchen über den Index zu", () => {
    const fd = form([
      ["routine_label", "Kalender"],
      ["routine_label", "HTF"],
      ["routine_label", "  "],
      ["routine_done", "1"],
    ]);
    expect(parseRoutine(fd)).toEqual([
      { label: "Kalender", done: false },
      { label: "HTF", done: true },
    ]);
  });

  it("übernimmt die Punkte des letzten Plans unabgehakt, sonst Standard", () => {
    expect(routineTemplate([{ label: "Eigener Punkt", done: true }])).toEqual([{ label: "Eigener Punkt", done: false }]);
    expect(routineTemplate(null).map((r) => r.label)).toEqual(DEFAULT_ROUTINE);
  });

  it("liest beschädigte JSON-Daten robust", () => {
    expect(readMarkets([{ symbol: "EURUSD", bias: "x" }, null, "kaputt"])).toEqual([
      { symbol: "EURUSD", bias: null, levels: "", scenario: "" },
    ]);
  });
});

describe("checkDay", () => {
  const trades = [
    { net_pnl: 100, status: "closed" },
    { net_pnl: -50, status: "closed" },
    { net_pnl: -20, status: "closed" },
    { net_pnl: null, status: "open" },
  ];

  it("vergleicht mit den Limits", () => {
    expect(checkDay({ max_trades: 3, max_losses: 2 }, trades)).toEqual({
      trades: 4,
      wins: 1,
      losses: 2,
      tradesOk: false,
      lossesOk: true,
    });
  });

  it("ohne Limits keine Bewertung", () => {
    expect(checkDay(null, trades)).toMatchObject({ tradesOk: null, lossesOk: null });
  });

  it("Status", () => {
    expect([planStatus(null), planStatus({ reviewed_at: null }), planStatus({ reviewed_at: "2026-09-14T20:00:00Z" })]).toEqual([
      "missing",
      "planned",
      "reviewed",
    ]);
  });
});
