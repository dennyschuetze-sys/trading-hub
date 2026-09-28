import { describe, expect, it } from "vitest";
import { WHITE, contrastRatio, hexToOklch } from "./color-theme";
import { PNL_PRESETS, parsePnlColors, pnlColorsCss, pnlPalette, pnlTooSimilar, serializePnlColors } from "./pnl-colors";

const DARK_CARD = { l: 0.185, c: 0.004, h: 260 };

describe("parsePnlColors / serializePnlColors", () => {
  it("liest Vorgaben und eigene Farben aus dem Cookie", () => {
    expect(parsePnlColors("tuerkis")).toEqual({ id: "tuerkis", profit: "#39c3ae", loss: "#db6c62" });
    expect(parsePnlColors("custom-00C853-FF1744")).toEqual({ id: "custom", profit: "#00c853", loss: "#ff1744" });
  });

  it("fällt bei fehlenden oder manipulierten Werten auf Grün/Rot zurück", () => {
    expect(parsePnlColors(undefined)).toEqual({ id: "standard", profit: "#4bcb71", loss: "#f53c41" });
    expect(parsePnlColors("neon").id).toBe("standard");
    expect(parsePnlColors("custom-00c853-ff1744}body{display:none").id).toBe("standard");
    expect(parsePnlColors("custom-00c853").id).toBe("standard");
  });

  it("übersteht den Weg ins Cookie und zurück", () => {
    const custom = { id: "custom" as const, profit: "#00c853", loss: "#ff1744" };
    expect(parsePnlColors(serializePnlColors(custom))).toEqual(custom);
    expect(serializePnlColors(parsePnlColors("blau-orange"))).toBe("blau-orange");
  });
});

describe("pnlPalette", () => {
  it("hält alle Vorgaben als Schrift lesbar – hell auf Weiß, dunkel auf der Karte", () => {
    for (const preset of PNL_PRESETS) {
      const { dark, light } = pnlPalette(parsePnlColors(preset.id));
      for (const tone of [light.profit, light.loss]) expect(contrastRatio(tone, WHITE)).toBeGreaterThanOrEqual(4.5);
      for (const tone of [dark.profit, dark.loss]) expect(contrastRatio(tone, DARK_CARD)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("bringt eigene Farben in beiden Modi auf lesbaren Kontrast", () => {
    for (const [profit, loss] of [["#b6ff00", "#ffe066"], ["#003300", "#000080"], ["#00c853", "#ff1744"]]) {
      const { dark, light } = pnlPalette({ id: "custom", profit, loss });
      for (const tone of [light.profit, light.loss]) expect(contrastRatio(tone, WHITE)).toBeGreaterThanOrEqual(4.5);
      for (const tone of [dark.profit, dark.loss]) expect(contrastRatio(tone, DARK_CARD)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("lässt eigene Farben unverändert, wenn sie schon lesbar sind", () => {
    const { dark } = pnlPalette({ id: "custom", profit: "#4bcb71", loss: "#ff5a5f" });
    expect(dark.profit).toEqual(hexToOklch("#4bcb71"));
    expect(dark.loss).toEqual(hexToOklch("#ff5a5f"));
  });
});

describe("pnlColorsCss", () => {
  it("überschreibt für Standard nichts – die Töne stehen in globals.css", () => {
    expect(pnlColorsCss(parsePnlColors("standard"))).toBe("");
  });

  it("setzt nur Gewinn und Verlust, getrennt für Dunkel und Hell", () => {
    const css = pnlColorsCss(parsePnlColors("tuerkis"));
    expect(css).toMatch(/^html\.dark\{--profit:oklch\([^)]+\);--loss:oklch\([^)]+\);\}html:not\(\.dark\)\{--profit:oklch\([^)]+\);--loss:oklch\([^)]+\);\}$/);
  });
});

describe("pnlTooSimilar", () => {
  it("erkennt Paare, die man verwechselt", () => {
    expect(pnlTooSimilar({ profit: "#4bcb71", loss: "#39c3ae" })).toBe(true);
    expect(pnlTooSimilar({ profit: "#777777", loss: "#7a7a7a" })).toBe(true);
  });

  it("lässt alle Vorgaben durch", () => {
    for (const { dark, light } of PNL_PRESETS) {
      expect(pnlTooSimilar(dark)).toBe(false);
      expect(pnlTooSimilar(light)).toBe(false);
    }
  });
});
