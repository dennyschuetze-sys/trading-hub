import { describe, expect, it } from "vitest";
import { highlight, tradingInsights } from "./insights";
import type { BreakdownRow } from "./stats";

const row = (key: string, count: number, netPnl: number, label = key): BreakdownRow => ({
  key,
  label,
  count,
  winRate: 0.5,
  netPnl,
  expectancy: netPnl / count,
  avgR: null,
});

describe("tradingInsights", () => {
  it("nennt beste und schwächste Bedingungen aus echten Zeilen", () => {
    const insights = tradingInsights({
      session: [row("asia", 8, -192, "Asien"), row("overlap", 13, 570, "London/NY Overlap"), row("ny", 2, 900, "New York")],
      hour: [row("16", 8, 376, "16:00–17:00"), row("08", 5, -244, "08:00–09:00")],
      direction: [row("long", 23, 647, "Long"), row("short", 16, -31, "Short")],
      weekday: [row("1", 8, -230, "Montag"), row("3", 11, 432, "Mittwoch")],
      holdTime: [row("1", 9, -242, "5–15 Min."), row("3", 13, 524, "1–4 Std.")],
    });
    expect(insights.map((i) => [i.tone, i.title])).toEqual([
      ["good", "Beste Session: London/NY Overlap"],
      ["good", "Beste Einstiegszeit: 16:00–17:00"],
      ["good", "Long performt besser als Short"],
      ["good", "Stärkster Tag: Mittwoch"],
      ["warn", "Montag ist der schwächste Tag"],
      ["warn", "Haltedauer 5–15 Min. ist verlustreich"],
      ["warn", "Größtes Potenzial: 08:00–09:00"],
    ]);
  });

  it("ignoriert kleine Gruppen und behauptet nichts ohne Daten", () => {
    const insights = tradingInsights({
      session: [row("ny", 2, 900)],
      hour: [],
      direction: [row("long", 5, 100)],
      weekday: [row("1", 4, 50)],
      holdTime: [row("1", 4, 20)],
    });
    expect(insights.map((i) => i.title)).toEqual(["Stärkster Tag: 1"]);
  });
});

describe("highlight", () => {
  it("nennt die beste Gruppe nur im Vergleich mehrerer ausreichend großer Gruppen", () => {
    expect(highlight([row("long", 23, 647, "Long"), row("short", 16, -31, "Short")])).toEqual({
      state: "found",
      row: row("long", 23, 647, "Long"),
    });
    // Nur eine Gruppe mit genug Trades: keine Aussage
    expect(highlight([row("15", 1, 161), row("16", 5, 90)])).toEqual({ state: "insufficient" });
    expect(highlight([])).toEqual({ state: "insufficient" });
  });

  it("behauptet kein „Bestes“, wenn alle Gruppen im Minus sind", () => {
    expect(highlight([row("1", 4, -20), row("2", 6, -80)])).toEqual({ state: "none-positive" });
  });
});
