import { describe, expect, it } from "vitest";
import {
  COLOR_PRESETS,
  colorThemeCss,
  contrastRatio,
  hexToOklch,
  normalizeHex,
  parseColorTheme,
  serializeColorTheme,
  signalConflict,
  themePalette,
} from "./color-theme";

describe("parseColorTheme / serializeColorTheme", () => {
  it("liest Vorgaben und eigene Farben aus dem Cookie", () => {
    expect(parseColorTheme("dragonfruit")).toMatchObject({ id: "dragonfruit", accent: "#ff4696", base: "#1e1033" });
    expect(parseColorTheme("custom-FF4696-1E1033")).toEqual({ id: "custom", accent: "#ff4696", base: "#1e1033" });
  });

  it("fällt bei fehlenden oder manipulierten Werten auf Standard zurück", () => {
    expect(parseColorTheme(undefined).id).toBe("standard");
    expect(parseColorTheme("neon").id).toBe("standard");
    expect(parseColorTheme("custom-ff4696-1e1033}body{display:none").id).toBe("standard");
    expect(parseColorTheme("custom-ff4696").id).toBe("standard");
  });

  it("übersteht den Weg ins Cookie und zurück", () => {
    const custom = { id: "custom" as const, accent: "#4c8dff", base: "#0b1628" };
    expect(parseColorTheme(serializeColorTheme(custom))).toEqual(custom);
    expect(serializeColorTheme(parseColorTheme("ozean"))).toBe("ozean");
  });
});

describe("normalizeHex", () => {
  it("akzeptiert kurze und lange Schreibweisen mit und ohne #", () => {
    expect(normalizeHex("#FF4696")).toBe("#ff4696");
    expect(normalizeHex(" ff4696 ")).toBe("#ff4696");
    expect(normalizeHex("#f49")).toBe("#ff4499");
  });

  it("lehnt alles andere ab", () => {
    expect(normalizeHex("#ff469")).toBeNull();
    expect(normalizeHex("pink")).toBeNull();
    expect(normalizeHex("")).toBeNull();
  });
});

describe("hexToOklch", () => {
  it("rechnet wie der Browser", () => {
    const pink = hexToOklch("#ff4696");
    expect(pink.l).toBeCloseTo(0.683, 3);
    expect(pink.c).toBeCloseTo(0.228, 3);
    expect(pink.h).toBeCloseTo(359, 0);
    expect(hexToOklch("#ffffff").l).toBeCloseTo(1, 3);
  });
});

describe("themePalette", () => {
  it("nimmt die Grundfarbe unverändert als dunklen Hintergrund, wenn sie dunkel genug ist", () => {
    const { dark } = themePalette("#ff4696", "#1e1033");
    const base = hexToOklch("#1e1033");
    expect(dark.background.l).toBeCloseTo(base.l, 3);
    expect(dark.background.c).toBeCloseTo(base.c, 3);
    expect(dark.primary.h).toBeCloseTo(359, 0);
  });

  it("dunkelt eine helle Grundfarbe ab und hellt einen dunklen Akzent auf", () => {
    const { dark, light } = themePalette("#000080", "#ffffff");
    expect(dark.background.l).toBeLessThanOrEqual(0.26);
    expect(dark.primary.l).toBeGreaterThanOrEqual(0.62);
    expect(light.foreground.l).toBeLessThanOrEqual(0.26);
  });

  it("hält Button-Beschriftung und Fließtext in allen Vorgaben lesbar", () => {
    for (const { accent, base } of COLOR_PRESETS) {
      const { dark, light } = themePalette(accent, base);
      expect(contrastRatio(dark.primary, dark["primary-foreground"])).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(light.primary, light["primary-foreground"])).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(dark.foreground, dark.card)).toBeGreaterThanOrEqual(7);
      expect(contrastRatio(dark["muted-foreground"], dark.card)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(light["muted-foreground"], light.background)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(light["sidebar-muted-foreground"], light.sidebar)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("hält die Auswahlfarbe als Schrift und als Fläche mit Hintergrund-Schrift lesbar", () => {
    const accents = [...COLOR_PRESETS.map((p) => p.accent), "#ffe066", "#000080", "#39ff14"];
    for (const accent of accents) {
      const { dark, light } = themePalette(accent, "#1e1033");
      expect(contrastRatio(dark.brand, dark.card)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(dark.brand, dark.background)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(light.brand, light.background)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(light.brand, light.card)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("wählt für Text auf dem Akzent die Grundfarbe, wenn Weiß zu schwach wäre", () => {
    // Weiß auf #FF4696 hat nur 3,2 : 1
    const { dark } = themePalette("#ff4696", "#1e1033");
    expect(dark["primary-foreground"]).toEqual(dark.background);
  });
});

describe("colorThemeCss", () => {
  it("überschreibt für Standard nichts", () => {
    expect(colorThemeCss(parseColorTheme("standard"))).toBe("");
  });

  it("setzt Variablen für Hell und Dunkel, aber nie Gewinn/Verlust", () => {
    const css = colorThemeCss(parseColorTheme("dragonfruit"));
    expect(css).toMatch(/^html\.dark\{.*\}html:not\(\.dark\)\{.*\}$/);
    expect(css).toContain("--background:oklch(0.214 0.067 299.1);");
    expect(css).not.toMatch(/--(profit|loss|warning):/);
  });
});

describe("signalConflict", () => {
  const greenRed = { profit: "#4bcb71", loss: "#ff0000" };

  it("warnt, wenn der Akzent wie Gewinn, Verlust oder Warnung aussieht", () => {
    expect(signalConflict("#ff0000", greenRed)?.label).toBe("der Verlustfarbe");
    expect(signalConflict("#3ddc84", greenRed)?.label).toBe("der Gewinnfarbe");
    expect(signalConflict("#f5b000", greenRed)?.label).toBe("der Warnfarbe");
  });

  it("richtet sich nach den gewählten Gewinn-/Verlustfarben", () => {
    expect(signalConflict("#4c8dff", greenRed)).toBeNull();
    expect(signalConflict("#4c8dff", { profit: "#4c99f8", loss: "#fc6b33" })?.label).toBe("der Gewinnfarbe");
    // graue eigene Gewinnfarbe: kein Farbton, der sich verwechseln ließe
    expect(signalConflict("#4c8dff", { profit: "#8a8f98", loss: "#ff0000" })).toBeNull();
  });

  it("lässt deutlich andere und graue Töne durch", () => {
    expect(signalConflict("#ff4696", greenRed)).toBeNull();
    expect(signalConflict("#a884ff", greenRed)).toBeNull();
    expect(signalConflict("#888888", greenRed)).toBeNull();
  });
});
