import { describe, expect, it } from "vitest";
import {
  costsInR,
  estimateRisk,
  exitEfficiency,
  exitReason,
  maxAdverseR,
  maxFavorableR,
  pipSize,
  plannedRewardRisk,
  stopSize,
} from "./r-multiple";

describe("pipSize / stopSize", () => {
  it("erkennt Forex, JPY-Paare und Metalle", () => {
    expect(pipSize("EURUSD")).toBe(0.0001);
    expect(pipSize("usdjpy.r")).toBe(0.01);
    expect(pipSize("XAUUSD")).toBe(0.1);
    expect(pipSize("NQ")).toBeNull();
    expect(pipSize("US30")).toBeNull();
  });

  it("Pips bei Forex, Punkte bei Indizes", () => {
    expect(stopSize({ symbol: "EURUSD", direction: "long", entry_price: 1.1015, stop_loss: 1.1 })).toEqual({ value: 15, unit: "Pips" });
    expect(stopSize({ symbol: "GBPJPY", direction: "short", entry_price: 190.5, stop_loss: 190.75 })).toEqual({ value: 25, unit: "Pips" });
    expect(stopSize({ symbol: "NQ", direction: "short", entry_price: 20000, stop_loss: 20025.5 })).toEqual({ value: 25.5, unit: "Punkte" });
    expect(stopSize({ symbol: "NQ", direction: "long", entry_price: 20000, stop_loss: 20010 })).toBeNull();
  });
});

describe("MFE / MAE", () => {
  const long = { direction: "long", entry_price: 100, stop_loss: 95, take_profit: 110 };

  it("rechnet bester und schlechtester Kurs in R um", () => {
    expect(maxFavorableR({ ...long, best_price: 115 })).toBe(3);
    expect(maxAdverseR({ ...long, worst_price: 97 })).toBe(0.6);
    expect(maxFavorableR({ direction: "short", entry_price: 100, stop_loss: 102, best_price: 94 })).toBe(3);
  });

  it("Exit-Effizienz = erreichtes R ÷ mögliches R", () => {
    expect(exitEfficiency({ ...long, best_price: 120, exit_price: 110 })).toBe(0.5);
    expect(exitEfficiency({ ...long, best_price: 100, exit_price: 95 })).toBeNull();
  });

  it("null ohne Daten", () => {
    expect(maxFavorableR({ ...long, best_price: null })).toBeNull();
    expect(maxAdverseR({ ...long, stop_loss: null, worst_price: 90 })).toBeNull();
  });
});

describe("exitReason", () => {
  const long = { direction: "long", entry_price: 100, stop_loss: 90, take_profit: 120 };
  it("SL, TP oder manuell", () => {
    expect(exitReason({ ...long, exit_price: 89.8 })).toBe("sl");
    expect(exitReason({ ...long, exit_price: 120.3 })).toBe("tp");
    expect(exitReason({ ...long, exit_price: 100 })).toBe("manual");
    expect(exitReason({ ...long, exit_price: null })).toBeNull();
  });
});

describe("costsInR", () => {
  it("Kosten im Verhältnis zum Risiko", () => {
    expect(costsInR({ commission: -7, swap: -3, risk_amount: 100 })).toBe(-0.1);
    expect(costsInR({ commission: -7, swap: 0, risk_amount: null })).toBeNull();
  });
});

describe("estimateRisk", () => {
  it("rechnet den SL-Abstand mit dem Wert der Kursbewegung in Kontowährung um", () => {
    // Short 0.07 Lots Gold, am SL ausgestoppt: 7,93 Punkte = −48,06 €
    const risk = estimateRisk({ direction: "short", entry_price: 4389.94, exit_price: 4397.87, stop_loss: 4397.83, pnl: -48.06 });
    expect(risk).toBe(47.82);
  });

  it("funktioniert auch bei Gewinnern (Long)", () => {
    // 1 Punkt = 10 €, SL 5 Punkte entfernt
    expect(estimateRisk({ direction: "long", entry_price: 100, exit_price: 110, stop_loss: 95, pnl: 100 })).toBe(50);
  });

  it("gibt null, wenn der SL nachgezogen wurde oder Daten fehlen", () => {
    expect(estimateRisk({ direction: "long", entry_price: 100, exit_price: 110, stop_loss: 101, pnl: 100 })).toBeNull();
    expect(estimateRisk({ direction: "short", entry_price: 100, exit_price: 90, stop_loss: null, pnl: 100 })).toBeNull();
    expect(estimateRisk({ direction: "long", entry_price: 100, exit_price: 100, stop_loss: 95, pnl: 0 })).toBeNull();
  });

  it("verwirft widersprüchliche Daten (Ergebnis passt nicht zur Kursrichtung)", () => {
    expect(estimateRisk({ direction: "long", entry_price: 100, exit_price: 110, stop_loss: 95, pnl: -100 })).toBeNull();
  });
});

describe("plannedRewardRisk", () => {
  it("TP-Abstand durch SL-Abstand", () => {
    expect(plannedRewardRisk({ direction: "short", entry_price: 100, stop_loss: 104, take_profit: 90 })).toBe(2.5);
    expect(plannedRewardRisk({ direction: "long", entry_price: 100, stop_loss: 98, take_profit: 103 })).toBe(1.5);
  });

  it("null ohne gültigen SL oder TP", () => {
    expect(plannedRewardRisk({ direction: "long", entry_price: 100, stop_loss: 100, take_profit: 103 })).toBeNull();
    expect(plannedRewardRisk({ direction: "long", entry_price: 100, stop_loss: 98, take_profit: null })).toBeNull();
  });
});
