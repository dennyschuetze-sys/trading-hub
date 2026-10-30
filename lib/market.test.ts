import { describe, expect, it } from "vitest";
import {
  addDays,
  addMonths,
  aggregate,
  axisLabel,
  candleLabel,
  candleSpan,
  chartCandles,
  containingIndex,
  currentTradeDay,
  formatPctMove,
  formatUsdMove,
  inRange,
  isoWeek,
  joinVolumes,
  marketSummary,
  parseMarketParams,
  periodOf,
  topMoves,
  topVolume,
  unitAllowed,
  weekdayStats,
  type MarketDay,
} from "./market";

/** Handelstage Mo–Fr ab `from`, Kurs steigt jeden Tag um `step`. */
function tradingDays(from: string, count: number, step = 1, volume: number | null = 100): MarketDay[] {
  const out: MarketDay[] = [];
  for (let t = Date.parse(`${from}T00:00:00Z`); out.length < count; t += 86_400_000) {
    const date = new Date(t);
    if (date.getUTCDay() === 0 || date.getUTCDay() === 6) continue;
    const open = 1000 + out.length * step;
    out.push({ day: date.toISOString().slice(0, 10), open, high: open + 5, low: open - 5, close: open + step, volume });
  }
  return out;
}

const day = (d: string, open: number, close: number, volume: number | null = 100): MarketDay => ({
  day: d,
  open,
  high: Math.max(open, close) + 1,
  low: Math.min(open, close) - 1,
  close,
  volume,
});

describe("parseMarketParams", () => {
  it("nimmt Tage und 3 Monate ohne Angaben", () => {
    expect(parseMarketParams({})).toEqual({ unit: "tage", range: "3m" });
  });

  it("verwirft Unbekanntes", () => {
    expect(parseMarketParams({ einheit: "stunden", zeitraum: "99j" })).toEqual({ unit: "tage", range: "3m" });
  });

  it("nimmt die nächstkleinere Einheit, wenn die gewünschte nicht zum Zeitraum passt", () => {
    expect(parseMarketParams({ einheit: "jahre", zeitraum: "12m" })).toEqual({ unit: "monate", range: "12m" });
    expect(parseMarketParams({ einheit: "monate", zeitraum: "7t" })).toEqual({ unit: "tage", range: "7t" });
    expect(parseMarketParams({ einheit: "wochen", zeitraum: "4w" })).toEqual({ unit: "wochen", range: "4w" });
  });

  it("erlaubt Jahre erst ab 5 Jahren", () => {
    expect(unitAllowed("jahre", "12m")).toBe(false);
    expect(unitAllowed("jahre", "5j")).toBe(true);
    expect(unitAllowed("tage", "alles")).toBe(true);
  });
});

describe("Kalender", () => {
  it("kappt Monate auf das Monatsende", () => {
    expect(addMonths("2026-03-31", -1)).toBe("2026-02-28");
    expect(addMonths("2026-10-29", -12)).toBe("2025-10-29");
    expect(addMonths("2024-02-29", -60)).toBe("2019-02-28");
  });

  it("zählt ISO-Kalenderwochen, auch über den Jahreswechsel", () => {
    expect(isoWeek("2026-10-29")).toEqual({ year: 2026, week: 44 });
    expect(isoWeek("2027-01-01")).toEqual({ year: 2026, week: 53 });
    expect(isoWeek("2024-12-30")).toEqual({ year: 2025, week: 1 });
  });

  it("ordnet Tage Wochen ab Montag, Monaten und Jahren zu", () => {
    expect(periodOf("2026-10-29", "wochen")).toEqual({ key: "2026-10-26", start: "2026-10-26" });
    expect(periodOf("2026-10-26", "wochen").start).toBe("2026-10-26");
    expect(periodOf("2026-10-29", "monate")).toEqual({ key: "2026-10", start: "2026-10-01" });
    expect(periodOf("2026-10-29", "jahre")).toEqual({ key: "2026", start: "2026-01-01" });
  });

  it("rechnet den Handelstag wie VT: ab 17:00 New York beginnt der nächste", () => {
    expect(currentTradeDay(new Date("2026-10-29T20:59:00Z"))).toBe("2026-10-29"); // 16:59 New York
    expect(currentTradeDay(new Date("2026-10-29T21:00:00Z"))).toBe("2026-10-30"); // 17:00 New York
    expect(currentTradeDay(new Date("2026-12-01T21:59:00Z"))).toBe("2026-12-01"); // Winterzeit: 16:59
    expect(currentTradeDay(new Date("2026-12-01T22:00:00Z"))).toBe("2026-12-02");
  });
});

describe("joinVolumes", () => {
  it("zählt beide Kontrakte zusammen und lässt fehlende Tage leer", () => {
    const days = [day("2026-01-28", 5000, 5100), day("2026-01-29", 5100, 5200)];
    const joined = joinVolumes(days, [{ day: "2026-01-28", contracts_front: 112054, contracts_next: 412873 }]);
    expect(joined.map((d) => d.volume)).toEqual([524927, null]);
    expect(joinVolumes(days, [{ day: "2026-01-29", contracts_front: 5, contracts_next: null }])[1].volume).toBe(5);
  });
});

describe("aggregate", () => {
  const days = tradingDays("2026-10-19", 9); // Mo 19.10. bis Do 29.10.

  it("fasst Tage zu Wochen zusammen", () => {
    const weeks = aggregate(days, "wochen");
    expect(weeks).toHaveLength(2);
    expect(weeks[0]).toMatchObject({ start: "2026-10-19", from: "2026-10-19", to: "2026-10-23", days: 5, volume: 500 });
    expect(weeks[0].open).toBe(days[0].open);
    expect(weeks[0].close).toBe(days[4].close);
    expect(weeks[0].high).toBe(Math.max(...days.slice(0, 5).map((d) => d.high)));
    expect(weeks[1]).toMatchObject({ from: "2026-10-26", to: "2026-10-29", days: 4 });
  });

  it("rechnet Bewegung und Spanne in Dollar und Prozent", () => {
    const [c] = aggregate([day("2026-09-28", 4272.2, 4114.14)], "tage");
    expect(c.move).toBeCloseTo(-158.06, 2);
    expect(c.movePct).toBeCloseTo(-3.7, 2);
    expect(c.range).toBeCloseTo(4272.2 + 1 - (4114.14 - 1), 6);
  });

  it("markiert die laufende Woche, am Wochenende nicht mehr", () => {
    expect(aggregate(days, "wochen", "2026-10-30").map((w) => w.running)).toEqual([false, true]);
    expect(aggregate(days, "wochen", "2026-10-31").map((w) => w.running)).toEqual([false, false]);
    expect(aggregate(days, "tage", "2026-10-29").some((d) => d.running)).toBe(false);
  });

  it("lässt das Volumen leer, wenn kein Tag eines hat, und zählt sonst die vorhandenen", () => {
    const mixed = [day("2026-10-26", 1, 2, null), day("2026-10-27", 2, 3, 40), day("2026-10-28", 3, 4, null)];
    expect(aggregate(mixed, "wochen")[0].volume).toBe(40);
    expect(aggregate(mixed.filter((d) => d.volume == null), "wochen")[0].volume).toBeNull();
  });
});

describe("inRange", () => {
  const days = tradingDays("2024-01-01", 730);

  it("zählt Tage über Kalendertage zurück", () => {
    const candles = inRange(aggregate(days, "tage"), "7t");
    expect(candles).toHaveLength(5);
    expect(candles[0].from > addDays(candles.at(-1)!.to, -7)).toBe(true);
  });

  it("liefert genau 4 Wochen, 3 Monate und 12 Monate", () => {
    expect(inRange(aggregate(days, "wochen"), "4w")).toHaveLength(4);
    expect(inRange(aggregate(days, "monate"), "3m")).toHaveLength(3);
    expect(inRange(aggregate(days, "monate"), "12m")).toHaveLength(12);
  });

  it("gibt bei „Alles“ alles zurück", () => {
    expect(inRange(aggregate(days, "monate"), "alles")).toHaveLength(aggregate(days, "monate").length);
  });
});

describe("Ranglisten", () => {
  const candles = aggregate(
    [
      day("2013-04-15", 1481, 1361.1, 721353), // −8,1 %
      day("2026-01-30", 5410, 4920.54, 541753), // −9,05 %, größerer Dollar-Betrag
      day("2026-02-03", 4691, 4965.57, 273444),
      day("2016-06-24", 1250, 1314.27, null),
      day("2026-10-29", 4067.69, 4067.69, 155508),
    ],
    "tage",
  );

  it("sortiert Long nach Dollar oder Prozent und lässt Gegenrichtung und Nullbewegung weg", () => {
    expect(topMoves(candles, "long", "usd").map((c) => c.from)).toEqual(["2026-02-03", "2016-06-24"]);
    expect(topMoves(candles, "long", "pct").map((c) => c.from)).toEqual(["2026-02-03", "2016-06-24"]);
  });

  it("sortiert Short vom stärksten Fall an", () => {
    expect(topMoves(candles, "short", "usd").map((c) => c.from)).toEqual(["2026-01-30", "2013-04-15"]);
    expect(topMoves(candles, "short", "pct").map((c) => c.from)).toEqual(["2026-01-30", "2013-04-15"]);
  });

  it("nimmt für das Volumen nur Kerzen mit Volumen", () => {
    expect(topVolume(candles, 2).map((c) => c.volume)).toEqual([721353, 541753]);
  });

  it("fasst Kennzahlen zusammen", () => {
    const s = marketSummary(candles);
    expect(s).toMatchObject({ count: 5, up: 2 });
    expect(s.biggest?.from).toBe("2026-01-30");
    expect(s.maxVolume?.from).toBe("2013-04-15");
    expect(s.avgVolume).toBeCloseTo((721353 + 541753 + 273444 + 155508) / 4, 6);
  });
});

describe("weekdayStats", () => {
  it("mittelt je Wochentag", () => {
    const stats = weekdayStats(aggregate(tradingDays("2026-10-19", 10), "tage"));
    expect(stats.map((s) => s.count)).toEqual([2, 2, 2, 2, 2]);
    expect(stats[0].avgRange).toBeCloseTo(10, 6);
    expect(stats[0].upShare).toBe(1);
  });
});

describe("chartCandles", () => {
  it("wird bei zu vielen Kerzen gröber", () => {
    const days = tradingDays("2010-01-04", 4300);
    expect(chartCandles(days, "tage", "12m").every((c) => c.unit === "tage")).toBe(true);
    expect(chartCandles(days, "tage", "5j")[0].unit).toBe("wochen");
    expect(chartCandles(days, "tage", "alles")[0].unit).toBe("monate");
  });

  it("findet die Chart-Kerze, in der ein Rekordtag liegt", () => {
    const days = tradingDays("2026-10-19", 9);
    const weeks = aggregate(days, "wochen");
    const [, record] = aggregate(days, "tage").slice(6);
    expect(containingIndex(weeks, record)).toBe(1);
    expect(containingIndex(weeks, null)).toBe(-1);
  });
});

describe("Beschriftung", () => {
  const days = tradingDays("2026-10-26", 4);

  it("benennt Kerzen je Einheit", () => {
    expect(candleLabel(aggregate(days, "tage")[3])).toBe("Do 29.10.2026");
    expect(candleLabel(aggregate(days, "wochen")[0])).toBe("KW 44/2026");
    expect(candleLabel(aggregate(days, "monate")[0])).toBe("Okt 2026");
    expect(candleLabel(aggregate(days, "jahre")[0])).toBe("2026");
    expect(axisLabel(aggregate(days, "monate")[0])).toBe("Okt 26");
    expect(candleSpan(aggregate(days, "wochen")[0])).toBe("26.10.–29.10.2026");
  });

  it("schreibt Bewegungen mit Vorzeichen und zwei Stellen", () => {
    expect(formatUsdMove(187.8)).toBe("+187,80 $");
    expect(formatPctMove(-3.7)).toBe("-3,70 %");
    expect(formatUsdMove(0)).toBe("0,00 $");
  });
});
