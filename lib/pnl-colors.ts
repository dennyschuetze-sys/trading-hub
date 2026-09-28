/**
 * Farben für Gewinn und Verlust – Beträge, R-Werte, Long/Short, Kalender und Charts: feste Vorgaben oder zwei
 * eigene Farben. Eigene Farben werden je Modus nur so weit aufgehellt bzw. abgedunkelt, dass sie als Schrift
 * lesbar bleiben.
 */
import { WHITE, hexToOklch, hueDistance, readableOn, toCss, type Color } from "./color-theme";

export const PNL_COLORS_COOKIE = "pnl-colors";

type Pair = { profit: string; loss: string };
type Tones = { profit: Color; loss: Color };

/** `dark` dient zugleich als Vorschau. Die Töne von Standard stehen außerdem handverlesen in globals.css. */
export const PNL_PRESETS = [
  { id: "standard", label: "Grün / Rot", dark: { profit: "#4bcb71", loss: "#f53c41" }, light: { profit: "#07843d", loss: "#d40c1a" } },
  // das frühere Paar – bleibt auch bei Rot-Grün-Schwäche unterscheidbar
  { id: "tuerkis", label: "Türkis / Rot", dark: { profit: "#39c3ae", loss: "#db6c62" }, light: { profit: "#008478", loss: "#d01c29" } },
  { id: "blau-orange", label: "Blau / Orange", dark: { profit: "#4c99f8", loss: "#fc6b33" }, light: { profit: "#2876d2", loss: "#d14300" } },
] as const;

export type PnlPresetId = (typeof PNL_PRESETS)[number]["id"];
/** `profit`/`loss`: bei Vorgaben die dunklen Töne, bei „custom“ die eingegebenen Farben */
export type PnlColors = { id: PnlPresetId | "custom" } & Pair;

export const DEFAULT_PNL_COLORS: PnlColors = { id: "standard", ...PNL_PRESETS[0].dark };

const CUSTOM = /^custom-([0-9a-f]{6})-([0-9a-f]{6})$/;

/** Cookie-Wert → Farben. Nur Vorgaben-IDs und reine Hex-Werte kommen durch, sonst Standard. */
export function parsePnlColors(raw: string | undefined): PnlColors {
  const preset = PNL_PRESETS.find((p) => p.id === raw);
  if (preset) return { id: preset.id, ...preset.dark };
  const match = raw?.toLowerCase().match(CUSTOM);
  if (match) return { id: "custom", profit: `#${match[1]}`, loss: `#${match[2]}` };
  return DEFAULT_PNL_COLORS;
}

export function serializePnlColors(colors: PnlColors): string {
  if (colors.id !== "custom") return colors.id;
  return `custom-${colors.profit.slice(1)}-${colors.loss.slice(1)}`;
}

/** Kartenfläche im dunklen Standard-Schema – dort stehen die meisten Beträge. */
const DARK_CARD: Color = { l: 0.185, c: 0.004, h: 260 };

const tones = ({ profit, loss }: Pair): Tones => ({ profit: hexToOklch(profit), loss: hexToOklch(loss) });

/** Töne für Dunkel und Hell: Vorgaben wie festgelegt, eigene Farben auf mindestens 4,5 : 1 gebracht. */
export function pnlPalette(colors: PnlColors): { dark: Tones; light: Tones } {
  const preset = PNL_PRESETS.find((p) => p.id === colors.id);
  if (preset) return { dark: tones(preset.dark), light: tones(preset.light) };
  const own = tones(colors);
  return {
    dark: { profit: readableOn(own.profit, DARK_CARD), loss: readableOn(own.loss, DARK_CARD) },
    light: { profit: readableOn(own.profit, WHITE), loss: readableOn(own.loss, WHITE) },
  };
}

/** CSS, das --profit/--loss aus globals.css überschreibt; leer für Standard. */
export function pnlColorsCss(colors: PnlColors): string {
  if (colors.id === "standard") return "";
  const { dark, light } = pnlPalette(colors);
  const block = (t: Tones) => `--profit:${toCss(t.profit)};--loss:${toCss(t.loss)};`;
  // html.x schlägt .dark/:root aus globals.css, ohne !important
  return `html.dark{${block(dark)}}html:not(.dark){${block(light)}}`;
}

/** Sind Gewinn und Verlust so ähnlich, dass man sie auf einen Blick verwechselt? */
export function pnlTooSimilar({ profit, loss }: Pair): boolean {
  const [a, b] = [hexToOklch(profit), hexToOklch(loss)];
  if (a.c >= 0.06 && b.c >= 0.06 && hueDistance(a.h, b.h) < 30) return true;
  const lab = ({ l, c, h }: Color) => [l, c * Math.cos((h * Math.PI) / 180), c * Math.sin((h * Math.PI) / 180)];
  const [la, lb] = [lab(a), lab(b)];
  return Math.hypot(la[0] - lb[0], la[1] - lb[1], la[2] - lb[2]) < 0.1;
}
