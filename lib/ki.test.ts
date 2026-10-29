import { describe, expect, it } from "vitest";
import { balanceSeries, featureLabel, goldMarketOpen, isSignal, isStale, parseBand, parseImportance, tradeState } from "./ki";

describe("featureLabel", () => {
  it("übersetzt die Kursänderungen in Zeiträume von M15-Kerzen", () => {
    expect(featureLabel("ret_1")).toBe("Kursänderung der letzten 15 Minuten");
    expect(featureLabel("ret_4")).toBe("Kursänderung der letzten Stunde");
    expect(featureLabel("ret_128")).toBe("Kursänderung der letzten 32 Stunden");
  });

  it("kennt die übrigen Merkmale und lässt unbekannte stehen", () => {
    expect(featureLabel("cost_r")).toBe("Spread im Verhältnis zum Stop");
    expect(featureLabel("pd_hi")).toBe("Abstand zum Vortageshoch");
    expect(featureLabel("neu_x")).toBe("neu_x");
  });
});

describe("goldMarketOpen", () => {
  it("schließt freitags um 17:00 New York und öffnet sonntags um 18:00", () => {
    expect(goldMarketOpen(new Date("2026-10-30T20:00:00Z"))).toBe(true); // Fr 16:00 New York (Sommerzeit)
    expect(goldMarketOpen(new Date("2026-10-30T21:30:00Z"))).toBe(false); // Fr 17:30
    expect(goldMarketOpen(new Date("2026-10-31T15:00:00Z"))).toBe(false); // Samstag
    expect(goldMarketOpen(new Date("2026-11-01T22:30:00Z"))).toBe(false); // So 17:30 (Winterzeit)
    expect(goldMarketOpen(new Date("2026-11-01T23:30:00Z"))).toBe(true); // So 18:30
  });

  it("macht werktags eine Stunde Pause", () => {
    expect(goldMarketOpen(new Date("2026-11-04T21:30:00Z"))).toBe(true); // Mi 16:30
    expect(goldMarketOpen(new Date("2026-11-04T22:15:00Z"))).toBe(false); // Mi 17:15
    expect(goldMarketOpen(new Date("2026-11-04T23:05:00Z"))).toBe(true); // Mi 18:05
  });
});

describe("isStale", () => {
  const now = new Date("2026-10-29T17:00:00Z");
  it("meldet Stille nach 45 Minuten", () => {
    expect(isStale("2026-10-29T16:30:00Z", now)).toBe(false);
    expect(isStale("2026-10-29T16:10:00Z", now)).toBe(true);
    expect(isStale(null, now)).toBe(true);
  });
});

describe("isSignal", () => {
  it("braucht eine Vorhersage über null", () => {
    expect(isSignal(0.01)).toBe(true);
    expect(isSignal(0)).toBe(false);
    expect(isSignal(-0.2)).toBe(false);
    expect(isSignal(null)).toBe(false);
  });
});

describe("parseImportance", () => {
  it("liest die Liste einer Richtung und überspringt Kaputtes", () => {
    const json = { long: [{ name: "cost_r", share: 0.14 }, { name: 3, share: 0.1 }, "x"], short: [] };
    expect(parseImportance(json, "long")).toEqual([{ name: "cost_r", share: 0.14 }]);
    expect(parseImportance(json, "short")).toEqual([]);
    expect(parseImportance(null, "long")).toEqual([]);
    expect(parseImportance([1, 2], "long")).toEqual([]);
  });
});

describe("parseBand", () => {
  it("sortiert nach Trade-Nummer und verwirft unvollständige Punkte", () => {
    const band = parseBand([
      { n: 10, lo: -3, mid: -1, hi: 2 },
      { n: 5, lo: -2, mid: -0.5, hi: 1 },
      { n: 7, lo: -2 },
    ]);
    expect(band.map((p) => p.n)).toEqual([5, 10]);
    expect(parseBand({ n: 1 })).toEqual([]);
  });
});

describe("balanceSeries", () => {
  const trades = [
    { signal_at: "2026-11-02T10:00:00Z", r_net: 1.5 },
    { signal_at: "2026-11-02T08:00:00Z", r_net: -1 },
    { signal_at: "2026-11-02T12:00:00Z", r_net: null },
    { signal_at: "2026-11-02T14:00:00Z", r_net: -1 },
  ];

  it("summiert in der Reihenfolge der Signale und lässt Trades ohne Ergebnis weg", () => {
    expect(balanceSeries(trades, []).map((p) => [p.n, p.cumulative])).toEqual([
      [1, -1],
      [2, 0.5],
      [3, -0.5],
    ]);
  });

  it("ergänzt das ausgedünnte Zufallsband linear", () => {
    const band = [
      { n: 1, lo: -1, mid: 0, hi: 1 },
      { n: 3, lo: -3, mid: -1, hi: 1 },
    ];
    const series = balanceSeries(trades, band);
    expect(series[1].band).toEqual([-2, 1]);
    expect(series[1].mid).toBe(-0.5);
    expect(series[2].band).toEqual([-3, 1]);
  });

  it("zeigt kein Band außerhalb seines Bereichs", () => {
    const series = balanceSeries(trades, [{ n: 2, lo: -1, mid: 0, hi: 1 }]);
    expect(series[0].band).toBeNull();
    expect(series[1].band).toEqual([-1, 1]);
  });
});

describe("tradeState", () => {
  it("beschreibt Warten, Laufen und den Ausstieg", () => {
    expect(tradeState({ status: "wartet", exit_reason: null })).toBe("wartet auf den Einstieg");
    expect(tradeState({ status: "offen", exit_reason: null })).toBe("läuft");
    expect(tradeState({ status: "zu", exit_reason: "Ziel" })).toBe("Ziel erreicht");
    expect(tradeState({ status: "zu", exit_reason: "Zeit" })).toBe("nach 12 Stunden beendet");
  });
});
