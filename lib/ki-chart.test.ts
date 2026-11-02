import { describe, expect, it } from "vitest";
import { aggregateBars, candleIndexAt, chartTime, placeTrade, visibleRange, zoneOffsetMinutes, type ChartTrade } from "./ki-chart";

/** M15-Kerzen ab 16:00 UTC, eine fehlt (Tagespause wie bei Gold). */
const bars = ["16:00", "16:15", "16:30", "16:45", "18:00", "18:15"].map((t, i) => ({
  bar_at: `2026-10-29T${t}:00+00:00`,
  open: 4000 + i,
  high: 4010 + i,
  low: 3990 + i,
  close: 4001 + i,
}));
const m15 = aggregateBars(bars, "M15");
const utc = (iso: string) => Date.parse(iso);

const trade = (over: Partial<ChartTrade>): ChartTrade => ({
  side: "short",
  signal_at: "2026-10-29T16:00:00+00:00",
  status: "zu",
  entry_at: "2026-10-29T16:15:00+00:00",
  entry_price: 4015,
  stop_price: 4033,
  target_price: 3988,
  exit_at: "2026-10-29T16:45:00+00:00",
  exit_price: 3988,
  exit_reason: "Ziel",
  r_net: 1.48,
  ...over,
});

describe("zoneOffsetMinutes", () => {
  it("kennt Sommer- und Winterzeit in Berlin und New York", () => {
    expect(zoneOffsetMinutes(utc("2026-11-02T18:45:00Z"), "Europe/Berlin")).toBe(60);
    expect(zoneOffsetMinutes(utc("2026-07-01T12:00:00Z"), "Europe/Berlin")).toBe(120);
    expect(zoneOffsetMinutes(utc("2026-10-29T16:00:00Z"), "America/New_York")).toBe(-240);
    expect(zoneOffsetMinutes(utc("2026-11-02T18:45:00Z"), "America/New_York")).toBe(-300);
  });
});

describe("chartTime", () => {
  it("verschiebt auf die Berliner Uhrzeit, damit der Chart sie anzeigt", () => {
    expect(chartTime(utc("2026-11-02T18:45:00Z"))).toBe(utc("2026-11-02T19:45:00Z") / 1000);
    expect(chartTime(utc("2026-07-01T12:00:00Z"))).toBe(utc("2026-07-01T14:00:00Z") / 1000);
  });
});

describe("aggregateBars", () => {
  it("übernimmt M15-Kerzen mit Beginn und Ende", () => {
    expect(m15).toHaveLength(6);
    expect(m15[0]).toEqual({
      time: utc("2026-10-29T17:00:00Z") / 1000,
      start: utc("2026-10-29T16:00:00Z"),
      end: utc("2026-10-29T16:15:00Z"),
      open: 4000,
      high: 4010,
      low: 3990,
      close: 4001,
    });
  });

  it("fasst zu Stunden zusammen: Eröffnung der ersten, Schluss der letzten, Hoch und Tief über alle", () => {
    const h1 = aggregateBars(bars, "H1");
    expect(h1.map((c) => [c.start, c.open, c.high, c.low, c.close])).toEqual([
      [utc("2026-10-29T16:00:00Z"), 4000, 4013, 3990, 4004],
      [utc("2026-10-29T18:00:00Z"), 4004, 4015, 3994, 4006],
    ]);
  });

  it("beginnt H4-Kerzen wie MT5 zu Serverzeit 0, 4, 8 … Uhr (New York + 7 h)", () => {
    // Ende Oktober ist New York noch in der Sommerzeit: Serverzeit = UTC + 3, H4 beginnt um 13 und 17 Uhr UTC
    expect(aggregateBars(bars, "H4").map((c) => c.start)).toEqual([utc("2026-10-29T13:00:00Z"), utc("2026-10-29T17:00:00Z")]);
    // ab dem 1. November Winterzeit: Serverzeit = UTC + 2, H4 beginnt um 18 Uhr UTC
    const november = [{ bar_at: "2026-11-02T18:45:00+00:00", open: 1, high: 1, low: 1, close: 1 }];
    expect(aggregateBars(november, "H4")[0].start).toBe(utc("2026-11-02T18:00:00Z"));
  });
});

describe("candleIndexAt", () => {
  it("findet die Kerze, in die ein Zeitpunkt fällt", () => {
    expect(candleIndexAt(m15, utc("2026-10-29T16:15:00Z"))).toBe(1);
    expect(candleIndexAt(m15, utc("2026-10-29T16:20:00Z"))).toBe(1);
    expect(candleIndexAt(m15, utc("2026-10-29T17:30:00Z"))).toBe(3); // in der Pause: zuletzt begonnene Kerze
    expect(candleIndexAt(m15, utc("2026-10-29T18:29:59Z"))).toBe(5);
  });

  it("liefert null außerhalb der Kerzen", () => {
    expect(candleIndexAt(m15, utc("2026-10-29T15:59:00Z"))).toBeNull();
    expect(candleIndexAt(m15, utc("2026-10-29T18:30:00Z"))).toBeNull();
    expect(candleIndexAt([], utc("2026-10-29T16:00:00Z"))).toBeNull();
  });
});

describe("placeTrade", () => {
  it("legt Signal, Einstieg, Ausstieg und Box auf die Kerzen", () => {
    expect(placeTrade(m15, trade({}))).toEqual({ signal: 0, entry: 1, exit: 3, box: [1, 3] });
  });

  it("zählt einen Ausstieg nach Zeit zur letzten Kerze des Trades", () => {
    expect(placeTrade(m15, trade({ exit_reason: "Zeit", exit_at: "2026-10-29T16:45:00+00:00" })).exit).toBe(2);
  });

  it("zieht laufende Trades bis zur letzten Kerze und kennt wartende ohne Box", () => {
    expect(placeTrade(m15, trade({ status: "offen", exit_at: null, exit_reason: null })).box).toEqual([1, 5]);
    expect(placeTrade(m15, trade({ status: "wartet", entry_at: null, exit_at: null, exit_reason: null }))).toEqual({
      signal: 0,
      entry: null,
      exit: null,
      box: null,
    });
  });

  it("schneidet am Rand ab, wenn der Trade vor den Kerzen begann", () => {
    const placed = placeTrade(m15, trade({ signal_at: "2026-10-29T15:00:00Z", entry_at: "2026-10-29T15:15:00Z" }));
    expect(placed).toEqual({ signal: null, entry: null, exit: 3, box: [0, 3] });
  });

  it("liegt auf größeren Zeitrahmen in den zusammengefassten Kerzen", () => {
    expect(placeTrade(aggregateBars(bars, "H1"), trade({}))).toEqual({ signal: 0, entry: 0, exit: 0, box: [0, 0] });
  });
});

describe("visibleRange", () => {
  it("liefert die Kerzen eines Zeitraums, am Rand begrenzt", () => {
    expect(visibleRange(m15, utc("2026-10-29T08:00:00Z"), utc("2026-10-29T16:20:00Z"))).toEqual({ from: 0, to: 1 });
    expect(visibleRange(m15, utc("2026-10-29T16:30:00Z"), utc("2026-10-30T08:00:00Z"))).toEqual({ from: 2, to: 5 });
    expect(visibleRange([], 0, 1)).toBeNull();
  });
});
