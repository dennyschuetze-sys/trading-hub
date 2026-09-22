import { describe, expect, it } from "vitest";
import { buildSeries, classifyBias, cotIndex, cotMarketForSymbol, isExtreme, parseCotRows, releaseDate } from "./cot";

/** Eine Zeile so, wie die Socrata-API sie liefert: alle Zahlen als Zeichenkette. */
const raw = (code: string, date: string, long: number, short: number, oi = 100_000) => ({
  cftc_contract_market_code: code,
  report_date_as_yyyy_mm_dd: `${date}T00:00:00.000`,
  market_and_exchange_names: "TEST - EXCHANGE",
  open_interest_all: String(oi),
  noncomm_positions_long_all: String(long),
  noncomm_positions_short_all: String(short),
  comm_positions_long_all: "1",
  comm_positions_short_all: "2",
  nonrept_positions_long_all: "3",
  nonrept_positions_short_all: "4",
});

/** Genug Wochen für den COT-Index, mit steigender Netto-Position. */
function weeklyRows(code: string, nets: number[]) {
  return nets.map((net, i) => {
    const date = new Date(Date.UTC(2026, 0, 6 + i * 7)).toISOString().slice(0, 10);
    return net >= 0 ? raw(code, date, net, 0) : raw(code, date, 0, -net);
  });
}

describe("parseCotRows", () => {
  it("wandelt Zeichenketten in Zahlen und kürzt das Datum", () => {
    const [row] = parseCotRows([raw("088691", "2026-09-15", 258_059, 27_721, 409_899)]);
    expect(row.reportDate).toBe("2026-09-15");
    expect(row.noncommLong).toBe(258_059);
    expect(row.openInterest).toBe(409_899);
  });

  it("überspringt unbekannte Märkte und unvollständige Zeilen", () => {
    const unknown = raw("001602", "2026-09-15", 10, 5);
    const broken = { ...raw("088691", "2026-09-15", 10, 5), noncomm_positions_short_all: "" };
    expect(parseCotRows([unknown, broken, null, "nope"])).toEqual([]);
  });

  it("gibt bei einer Nicht-Liste eine leere Liste zurück", () => {
    expect(parseCotRows({ error: true })).toEqual([]);
  });
});

describe("cotIndex", () => {
  it("setzt den aktuellen Wert ins Verhältnis zu Hoch und Tief", () => {
    const nets = Array.from({ length: 30 }, (_, i) => i * 10); // 0 … 290, aktuell am Hoch
    expect(cotIndex(nets, 156)).toBe(100);
    expect(cotIndex([...nets.slice(0, 29), 145], 156)).toBeCloseTo(51.8, 1);
  });

  it("braucht mindestens 26 Wochen", () => {
    expect(cotIndex([1, 2, 3], 156)).toBeNull();
  });

  it("ist ohne Spannweite nicht berechenbar", () => {
    expect(cotIndex(Array(30).fill(5), 156)).toBeNull();
  });

  it("betrachtet nur das Rückblickfenster", () => {
    // Das alte Hoch von 1000 liegt außerhalb der letzten 26 Wochen
    const nets = [1000, ...Array.from({ length: 26 }, (_, i) => i)];
    expect(cotIndex(nets, 26)).toBe(100);
  });
});

describe("classifyBias", () => {
  it("staffelt nach dem COT-Index", () => {
    expect(classifyBias(92, 1).key).toBe("stark_bullisch");
    expect(classifyBias(65, 1).key).toBe("bullisch");
    expect(classifyBias(50, 1).key).toBe("neutral");
    expect(classifyBias(30, -1).key).toBe("baerisch");
    expect(classifyBias(8, -1).key).toBe("stark_baerisch");
  });

  it("fällt ohne Index auf das Vorzeichen zurück", () => {
    expect(classifyBias(null, 500).key).toBe("bullisch");
    expect(classifyBias(null, -500).key).toBe("baerisch");
    expect(classifyBias(null, 0).key).toBe("neutral");
  });

  it("färbt bullisch türkis und bärisch rot", () => {
    expect(classifyBias(92, 1).tone).toBe("profit");
    expect(classifyBias(8, -1).tone).toBe("loss");
    expect(classifyBias(50, 1).tone).toBeNull();
  });
});

describe("isExtreme", () => {
  it("meldet nur die Ränder", () => {
    expect(isExtreme(95)).toBe(true);
    expect(isExtreme(5)).toBe(true);
    expect(isExtreme(50)).toBe(false);
    expect(isExtreme(null)).toBe(false);
  });
});

describe("buildSeries", () => {
  it("rechnet Netto, Anteil am Open Interest und Wochenveränderung", () => {
    const rows = parseCotRows([raw("088691", "2026-09-08", 200, 50), raw("088691", "2026-09-15", 260, 20)]);
    const [gold] = buildSeries(rows, 156);
    expect(gold.market.symbols).toContain("XAUUSD");
    expect(gold.latest.net).toBe(240);
    expect(gold.latest.netPct).toBeCloseTo(0.0024, 6);
    expect(gold.latest.change).toBe(90);
    expect(gold.weeks[0].change).toBe(0);
  });

  it("sortiert unsortierte Zeilen nach Datum", () => {
    const rows = parseCotRows([raw("088691", "2026-09-15", 260, 20), raw("088691", "2026-09-08", 200, 50)]);
    const [gold] = buildSeries(rows, 156);
    expect(gold.weeks.map((w) => w.date)).toEqual(["2026-09-08", "2026-09-15"]);
  });

  it("spiegelt gedrehte Märkte: Netto-Long im Yen-Future ist bärisch für USDJPY", () => {
    const rows = parseCotRows([raw("097741", "2026-09-08", 100, 40), raw("097741", "2026-09-15", 150, 30)]);
    const [yen] = buildSeries(rows, 156);
    expect(yen.market.symbols).toEqual(["USDJPY"]);
    expect(yen.latest.net).toBe(-120); // Future netto +120, aus Sicht von USDJPY also −120
    expect(yen.latest.change).toBe(-60);
    expect(yen.latest.long).toBe(30); // long/short tauschen mit
    expect(yen.latest.short).toBe(150);
    expect(yen.bias.key).toBe("baerisch");
  });

  it("dreht auch den COT-Index: steigende Yen-Longs drücken USDJPY ans untere Ende", () => {
    const rising = Array.from({ length: 30 }, (_, i) => i * 100);
    const [yen] = buildSeries(parseCotRows(weeklyRows("097741", rising)), 156);
    const [euro] = buildSeries(parseCotRows(weeklyRows("099741", rising)), 156);
    expect(euro.index).toBe(100);
    expect(yen.index).toBe(0);
    expect(yen.bias.key).toBe("stark_baerisch");
  });

  it("überspringt Märkte ohne Daten", () => {
    expect(buildSeries([], 156)).toEqual([]);
  });
});

describe("cotMarketForSymbol", () => {
  it("findet den Markt über CFD- und Future-Symbol", () => {
    expect(cotMarketForSymbol("XAUUSD")?.code).toBe("088691");
    expect(cotMarketForSymbol("mnq")?.code).toBe("209742");
    expect(cotMarketForSymbol("GER40")).toBeNull();
  });
});

describe("releaseDate", () => {
  it("legt den Veröffentlichungstermin drei Tage nach den Stichtag", () => {
    expect(releaseDate("2026-09-15")).toBe("2026-09-18");
  });
});
