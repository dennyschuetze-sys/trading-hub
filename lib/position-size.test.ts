import { describe, expect, it } from "vitest";
import {
  calculatePositionSize,
  convertRate,
  distanceToPrice,
  floorToStep,
  resolveInstrument,
  targetPrice,
  type SizeResult,
} from "./position-size";

const fx = { date: "2026-09-14", rates: { USD: 1.25, JPY: 160, GBP: 0.8 } };

function ok(result: ReturnType<typeof calculatePositionSize>): SizeResult {
  if ("error" in result) throw new Error(result.error);
  return result;
}

describe("resolveInstrument", () => {
  it("erkennt Broker-Schreibweisen", () => {
    expect(resolveInstrument("EURUSD.pro")?.symbol).toBe("EURUSD");
    expect(resolveInstrument("nas100.cash")?.symbol).toBe("US100");
    expect(resolveInstrument("XAUUSDm")?.symbol).toBe("XAUUSD");
    expect(resolveInstrument("GER40")?.quote).toBe("EUR");
    expect(resolveInstrument("gbp/jpy")?.pipSize).toBe(0.01);
  });

  it("erkennt Futures mit Verfallsmonat", () => {
    expect(resolveInstrument("MNQZ6")?.symbol).toBe("MNQ");
    expect(resolveInstrument("NQZ2026")?.symbol).toBe("NQ");
    expect(resolveInstrument("6EZ6")?.symbol).toBe("6E");
    expect(resolveInstrument("ES")?.micro).toBe("MES");
  });

  it("erzeugt unbekannte Forex-Paare und lehnt Unsinn ab", () => {
    expect(resolveInstrument("USDSEK")).toMatchObject({ kind: "forex", quote: "SEK", pipSize: 0.0001 });
    expect(resolveInstrument("FOOBAR")).toBeNull();
    expect(resolveInstrument("")).toBeNull();
  });
});

describe("convertRate", () => {
  it("rechnet über den Euro", () => {
    expect(convertRate("USD", "USD", null)).toBe(1);
    expect(convertRate("USD", "EUR", fx)).toBeCloseTo(0.8);
    expect(convertRate("JPY", "USD", fx)).toBeCloseTo(1.25 / 160);
    expect(convertRate("USD", "CHF", fx)).toBeNull();
  });
});

describe("calculatePositionSize", () => {
  it("EURUSD auf USD-Konto: 1 % von 100k, 20 Pips → 5 Lots", () => {
    const ins = resolveInstrument("EURUSD")!;
    const r = ok(
      calculatePositionSize({
        instrument: ins,
        accountCurrency: "USD",
        riskAmount: 1000,
        stopDistance: distanceToPrice(ins, 20),
        step: 0.01,
        fx: null,
      }),
    );
    expect(r.unitValue).toBeCloseTo(10);
    expect(r.distanceUnits).toBe(20);
    expect(r.size).toBe(5);
    expect(r.actualRisk).toBe(1000);
  });

  it("EURUSD auf EUR-Konto nutzt den Einstiegskurs zur Umrechnung", () => {
    const ins = resolveInstrument("EURUSD")!;
    const r = ok(
      calculatePositionSize({
        instrument: ins,
        accountCurrency: "EUR",
        riskAmount: 100,
        stopDistance: distanceToPrice(ins, 15),
        entry: 1.25,
        step: 0.01,
        fx,
      }),
    );
    expect(r.rateSource).toBe("entry");
    // 1 Pip pro Lot = 10 USD = 8 EUR → 15 Pips = 120 EUR → 0,833 Lots → 0,83
    expect(r.lossPerUnit).toBeCloseTo(120);
    expect(r.size).toBe(0.83);
    expect(r.actualRisk).toBe(99.6);
  });

  it("GBPJPY auf EUR-Konto über EZB-Kurse", () => {
    const ins = resolveInstrument("GBPJPY")!;
    const r = ok(
      calculatePositionSize({
        instrument: ins,
        accountCurrency: "EUR",
        riskAmount: 100,
        stopDistance: distanceToPrice(ins, 25),
        step: 0.01,
        fx,
      }),
    );
    // 1 Pip = 1000 JPY = 6,25 EUR → 25 Pips = 156,25 EUR → 0,64 Lots
    expect(r.unitValue).toBeCloseTo(6.25);
    expect(r.size).toBe(0.64);
  });

  it("Gold-CFD: 5 $ Stop, 500 $ Risiko → 1 Lot", () => {
    const r = ok(
      calculatePositionSize({
        instrument: resolveInstrument("XAUUSD")!,
        accountCurrency: "USD",
        riskAmount: 500,
        stopDistance: 5,
        step: 0.01,
        fx: null,
      }),
    );
    expect(r.unit).toBe("Punkte");
    expect(r.size).toBe(1);
  });

  it("NQ-Future: 20 Punkte = 80 Ticks = 400 $ pro Kontrakt", () => {
    const r = ok(
      calculatePositionSize({
        instrument: resolveInstrument("NQ")!,
        accountCurrency: "USD",
        riskAmount: 1000,
        stopDistance: 20,
        step: 1,
        fx: null,
      }),
    );
    expect(r.distanceUnits).toBe(80);
    expect(r.lossPerUnit).toBe(400);
    expect(r.size).toBe(2);
    expect(r.actualRisk).toBe(800);
  });

  it("Futures: angefangene Ticks zählen voll, zu kleines Risiko ergibt 0 Kontrakte", () => {
    const r = ok(
      calculatePositionSize({
        instrument: resolveInstrument("ES")!,
        accountCurrency: "USD",
        riskAmount: 100,
        stopDistance: 2.1,
        step: 1,
        fx: null,
      }),
    );
    expect(r.distanceUnits).toBe(9);
    expect(r.lossPerUnit).toBe(112.5);
    expect(r.size).toBe(0);
  });

  it("meldet fehlende Kurse und ungültige Eingaben", () => {
    const ins = resolveInstrument("USDJPY")!;
    const base = { instrument: ins, accountCurrency: "CHF", riskAmount: 100, stopDistance: 0.2, step: 0.01, fx };
    expect(calculatePositionSize(base)).toHaveProperty("error");
    expect(ok(calculatePositionSize({ ...base, rateOverride: 0.0055 })).rateSource).toBe("override");
    expect(calculatePositionSize({ ...base, riskAmount: 0 })).toHaveProperty("error");
    expect(calculatePositionSize({ ...base, stopDistance: -1 })).toHaveProperty("error");
  });
});

describe("Hilfsfunktionen", () => {
  it("rundet gleitkommasicher ab", () => {
    expect(floorToStep(0.29, 0.01)).toBe(0.29);
    expect(floorToStep(1.999, 0.01)).toBe(1.99);
    expect(floorToStep(2.7, 1)).toBe(2);
  });

  it("berechnet Zielkurse für Long und Short", () => {
    expect(targetPrice(100, 90, 2)).toBe(120);
    expect(targetPrice(100, 105, 3)).toBe(85);
  });
});
