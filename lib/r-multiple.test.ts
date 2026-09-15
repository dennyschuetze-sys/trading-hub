import { describe, expect, it } from "vitest";
import { estimateRisk, plannedRewardRisk } from "./r-multiple";

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
