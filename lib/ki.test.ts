import { describe, expect, it } from "vitest";
import {
  balanceSeries,
  featureLabel,
  featureValue,
  formatPred,
  goldMarketOpen,
  isSignal,
  isStale,
  parseBand,
  parseImportance,
  parseReasons,
  parseMarket,
  parseTradeKey,
  tradeKey,
  tradeState,
} from "./ki";

describe("tradeKey", () => {
  it("kodiert Richtung und Signalzeit und liest sie zurück", () => {
    const key = tradeKey({ side: "short", signal_at: "2026-10-29T16:00:00+00:00" });
    expect(key).toBe("short-1793289600");
    expect(parseTradeKey(key)).toEqual({ market: "XAUUSD", side: "short", signalAt: "2026-10-29T16:00:00.000Z" });
    expect(parseTradeKey("seitwärts-1793289600")).toBeNull();
    expect(parseTradeKey("long-abc")).toBeNull();
  });

  it("setzt den Markt NAS100 davor, Gold bleibt ohne", () => {
    const key = tradeKey({ market: "NAS100", side: "long", signal_at: "2026-11-03T10:00:00+00:00" });
    expect(key).toBe("nas100-long-1793700000");
    expect(parseTradeKey(key)).toEqual({ market: "NAS100", side: "long", signalAt: "2026-11-03T10:00:00.000Z" });
    expect(tradeKey({ market: "XAUUSD", side: "long", signal_at: "2026-11-03T10:00:00+00:00" })).toBe("long-1793700000");
    expect(parseTradeKey("gold-long-1793700000")).toBeNull();
  });

  it("kennt NAS100 lernend", () => {
    const key = tradeKey({ market: "NAS100-L", side: "long", signal_at: "2026-11-03T10:00:00+00:00" });
    expect(key).toBe("nas100-lernt-long-1793700000");
    expect(parseTradeKey(key)).toEqual({ market: "NAS100-L", side: "long", signalAt: "2026-11-03T10:00:00.000Z" });
    expect(parseMarket("nas100-lernt")).toBe("NAS100-L");
  });

  it("kennt Gold M5", () => {
    const key = tradeKey({ market: "XAUUSD-M5", side: "short", signal_at: "2026-11-04T08:05:00+00:00" });
    expect(key).toBe("gold-m5-short-1793779500");
    expect(parseTradeKey(key)).toEqual({ market: "XAUUSD-M5", side: "short", signalAt: "2026-11-04T08:05:00.000Z" });
  });
});

describe("parseMarket", () => {
  it("liest ?markt= und fällt auf Gold zurück", () => {
    expect(parseMarket("nas100")).toBe("NAS100");
    expect(parseMarket("gold")).toBe("XAUUSD");
    expect(parseMarket("gold-m5")).toBe("XAUUSD-M5");
    expect(parseMarket(undefined)).toBe("XAUUSD");
    expect(parseMarket(["nas100"])).toBe("XAUUSD");
  });
});

describe("featureValue", () => {
  it("zeigt jedes Merkmal in seiner Einheit", () => {
    expect(featureValue("sma_200", -4.106)).toBe("-4,1 ATR");
    expect(featureValue("ret_16", 1.25)).toBe("+1,3 ATR");
    expect(featureValue("d_lo", 0.593)).toBe("0,6 ATR");
    expect(featureValue("cost_r", 0.016948)).toBe("0,017 R");
    expect(featureValue("atr_bp", 22.04)).toBe("22 bp");
    expect(featureValue("vol_20", 1.5)).toBe("1,50-fach");
    expect(featureValue("pos_96", 0.78)).toBe("78 %");
    expect(featureValue("hour", 21.25)).toBe("21:15 New York");
    expect(featureValue("dow", 3)).toBe("Donnerstag");
    expect(featureValue("rsi", null)).toBe("–");
  });
});

describe("parseReasons", () => {
  it("liest Ausgangswert, Beiträge und Rest", () => {
    const r = parseReasons({
      base: -0.104,
      rest: 0.01,
      items: [{ name: "cost_r", value: 0.017, contrib: 0.089 }, { name: "rsi", value: null, contrib: -0.002 }, { name: 1 }],
      later: true,
    });
    expect(r).toEqual({
      base: -0.104,
      rest: 0.01,
      items: [
        { name: "cost_r", value: 0.017, contrib: 0.089 },
        { name: "rsi", value: null, contrib: -0.002 },
      ],
      later: true,
    });
  });

  it("gibt null ohne Gründe", () => {
    expect(parseReasons({})).toBeNull();
    expect(parseReasons(null)).toBeNull();
  });
});

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

describe("formatPred", () => {
  it("zeigt auch kleine Vorhersagen erkennbar", () => {
    expect(formatPred(0.003725)).toBe("+0,004 R");
    expect(formatPred(-0.104177)).toBe("-0,104 R");
    expect(formatPred(null)).toBe("–");
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
    expect(tradeState({ status: "zu", exit_reason: "Zeit", market: "XAUUSD-M5" })).toBe("nach 4 Stunden beendet");
  });
});
