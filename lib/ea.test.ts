import { describe, expect, it } from "vitest";
import {
  byStrategy,
  equityPoints,
  forecastChecks,
  forecastIntensity,
  formatPips,
  parseBacktest,
  parseFamilies,
  parseSettings,
  riskWarning,
  serverDay,
  serverTime,
  summarize,
} from "./ea";

describe("serverTime", () => {
  it("rechnet UTC in VT-Serverzeit (New York + 7 h) um, im Winter UTC+2", () => {
    expect(serverTime("2026-11-06T13:30:09Z")).toBe("2026-11-06 15:30");
  });
  it("im Sommer UTC+3", () => {
    expect(serverTime("2026-07-01T12:00:00Z")).toBe("2026-07-01 15:00");
  });
  it("Tagesgrenze liegt in Serverzeit", () => {
    expect(serverDay("2026-11-06T22:30:00Z")).toBe("2026-11-07");
  });
});

describe("Einstellungen", () => {
  it("liest Risiko und Strategien", () => {
    expect(parseSettings({ RiskPercent: 5, MaxLots: 0, strategies: "A–K" })).toEqual({ RiskPercent: 5, MaxLots: 0, strategies: "A–K" });
    expect(parseSettings(null)).toEqual({});
  });
  it("warnt nur über dem geprüften Risiko", () => {
    expect(riskWarning({ RiskPercent: 1 })).toBeNull();
    expect(riskWarning({ RiskPercent: 3 })).toBeNull();
    expect(riskWarning({ RiskPercent: 5 })).toMatch(/nicht getestet/);
  });
});

const pos = (o: Partial<{ status: string; profit: number; pips: number | null; opened_at: string; closed_at: string | null; strategy: string | null; tag: string }>) => ({
  status: "zu",
  profit: 0,
  pips: 0,
  opened_at: "2026-11-06T13:30:00Z",
  closed_at: "2026-11-06T13:31:00Z",
  strategy: "A",
  tag: "T3",
  ...o,
});

describe("summarize", () => {
  it("zählt nur geschlossene Positionen ins Ergebnis", () => {
    const s = summarize([pos({ profit: 4, pips: 40 }), pos({ profit: -2, pips: -20 }), pos({ status: "offen", profit: 9 })]);
    expect(s.closed).toBe(2);
    expect(s.open).toBe(1);
    expect(s.profit).toBe(2);
    expect(s.winRate).toBe(0.5);
    expect(s.profitFactor).toBe(2);
    expect(s.meanPips).toBe(10);
    expect(s.tradingDays).toBe(1);
  });
  it("ohne Trades", () => {
    expect(summarize([]).winRate).toBeNull();
  });
});

describe("equityPoints", () => {
  it("startet beim Live-Start und folgt den Schlusszeiten", () => {
    const pts = equityPoints(1000, "2026-11-04T19:32:00Z", [
      pos({ profit: -1, closed_at: "2026-11-06T14:00:00Z" }),
      pos({ profit: 3, closed_at: "2026-11-06T13:00:00Z" }),
      pos({ status: "offen", profit: 50, closed_at: null }),
    ]);
    expect(pts.map((p) => p.balance)).toEqual([1000, 1003, 1002]);
  });
});

describe("byStrategy", () => {
  it("gruppiert nach Strategie-Buchstabe", () => {
    const rows = byStrategy([pos({ strategy: "K", profit: 1, pips: 10 }), pos({ strategy: "A", profit: 2, pips: 20 }), pos({ strategy: "K", profit: -3, pips: -30 })]);
    expect(rows).toEqual([
      { strategy: "A", trades: 1, profit: 2, meanPips: 20 },
      { strategy: "K", trades: 2, profit: -2, meanPips: -10 },
    ]);
  });
});

describe("forecastChecks", () => {
  it("zählt Positionen je Konto und Tag, ein Konto erst ab seinem Start", () => {
    const rows = forecastChecks(
      [
        { day: "2026-11-05", family: "Erstanträge", probability: 0.42 },
        { day: "2026-11-06", family: "Arbeitsmarkt (NFP)", probability: 0.67 },
        { day: "2026-11-09", family: "ohne hohe News", probability: 0.41 },
      ],
      [
        { tag: "T3", live_since: "2026-11-04T19:32:00Z" },
        { tag: "T4", live_since: "2026-11-06T16:20:00Z" },
      ],
      [pos({ tag: "T3" }), pos({ tag: "T3" })],
      "2026-11-06",
    );
    expect(rows).toEqual([
      { day: "2026-11-06", family: "Arbeitsmarkt (NFP)", probability: 0.67, traded: { T3: 2, T4: 0 } },
      { day: "2026-11-05", family: "Erstanträge", probability: 0.42, traded: { T3: 0 } },
    ]);
  });
});

describe("Parser und Format", () => {
  it("verwirft unbrauchbare Einträge", () => {
    expect(parseFamilies([{ family: "Fed-Zinsentscheid", days: 9, after: 0.89, before: 0.5, trades: 15.9 }, { x: 1 }])).toHaveLength(1);
    expect(parseBacktest({ months: [{ month: "2025-01", pips: 17.5, trades: 10 }, { month: 3 }] }).months).toHaveLength(1);
  });
  it("Pips mit Vorzeichen", () => {
    expect(formatPips(48.5)).toBe("+48,5 Pips");
    expect(formatPips(-4.1)).toBe("-4,1 Pips");
  });
  it("Intensität bleibt zwischen 0 und 1", () => {
    expect(forecastIntensity(0.2)).toBe(0);
    expect(forecastIntensity(0.95)).toBe(1);
  });
});
