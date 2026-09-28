/**
 * Farbschema der Oberfläche: feste Vorgaben oder zwei eigene Farben.
 * Aus Akzent- und Grundfarbe werden alle Töne für Hell und Dunkel abgeleitet (in OKLCH, damit Helligkeit
 * und Buntheit getrennt steuerbar sind). Gewinn und Verlust wählt man getrennt (lib/pnl-colors.ts), die
 * Warnfarbe bleibt fest.
 */
export const COLOR_THEME_COOKIE = "color-theme";

/** `accent`/`base` der Standard-Vorgabe dienen nur der Vorschau – ihre Töne stehen handverlesen in globals.css. */
export const COLOR_PRESETS = [
  { id: "standard", label: "Standard", accent: "#39c3ae", base: "#090a0b" },
  { id: "dragonfruit", label: "Dragonfruit", accent: "#ff4696", base: "#1e1033" },
  { id: "ozean", label: "Ozean", accent: "#4c8dff", base: "#0b1628" },
  { id: "amethyst", label: "Amethyst", accent: "#a884ff", base: "#15112a" },
] as const;

export type PresetId = (typeof COLOR_PRESETS)[number]["id"];
export type ColorTheme = { id: PresetId | "custom"; accent: string; base: string };

export const DEFAULT_COLOR_THEME: ColorTheme = { ...COLOR_PRESETS[0] };

const CUSTOM = /^custom-([0-9a-f]{6})-([0-9a-f]{6})$/;

/** Cookie-Wert → Farbschema. Nur Vorgaben-IDs und reine Hex-Werte kommen durch, sonst Standard. */
export function parseColorTheme(raw: string | undefined): ColorTheme {
  const preset = COLOR_PRESETS.find((p) => p.id === raw);
  if (preset) return { ...preset };
  const match = raw?.toLowerCase().match(CUSTOM);
  if (match) return { id: "custom", accent: `#${match[1]}`, base: `#${match[2]}` };
  return DEFAULT_COLOR_THEME;
}

export function serializeColorTheme(theme: ColorTheme): string {
  if (theme.id !== "custom") return theme.id;
  return `custom-${theme.accent.slice(1)}-${theme.base.slice(1)}`;
}

/** „#F49“, „ff4696“ usw. → „#ff4696“; alles andere → null. */
export function normalizeHex(input: string): string | null {
  const hex = input.trim().replace(/^#/, "").toLowerCase();
  if (/^[0-9a-f]{6}$/.test(hex)) return `#${hex}`;
  if (/^[0-9a-f]{3}$/.test(hex)) return `#${[...hex].map((c) => c + c).join("")}`;
  return null;
}

// ---------- Farbmathematik (OKLCH ↔ sRGB nach Björn Ottosson) ----------

/** l 0–1, c ≥ 0, h in Grad; alpha in Prozent (weggelassen = deckend). */
export type Color = { l: number; c: number; h: number; alpha?: number };

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

export function hexToOklch(hex: string): Color {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const h = (Math.atan2(B, A) * 180) / Math.PI;
  return { l: L, c: Math.hypot(A, B), h: h < 0 ? h + 360 : h };
}

/** Lineare sRGB-Anteile, auf den darstellbaren Bereich begrenzt. */
function toLinearRgb({ l: L, c, h }: Color): [number, number, number] {
  const a = c * Math.cos((h * Math.PI) / 180);
  const b = c * Math.sin((h * Math.PI) / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map((v) => clamp(v, 0, 1)) as [number, number, number];
}

/** Kontrastverhältnis nach WCAG (1–21) zwischen zwei deckenden Farben. */
export function contrastRatio(a: Color, b: Color): number {
  const lum = (color: Color) => {
    const [r, g, bl] = toLinearRgb(color);
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Hellt bzw. dunkelt `color` in kleinen Schritten, bis sie auf `background` mindestens `min` Kontrast hat. */
export function readableOn(color: Color, background: Color, min = 4.5): Color {
  const step = background.l < 0.5 ? 0.01 : -0.01;
  let result = color;
  while (contrastRatio(result, background) < min && result.l > 0 && result.l < 1) {
    result = { ...result, l: clamp(result.l + step, 0, 1) };
  }
  return result;
}

const round = (v: number, digits: number) => Number(v.toFixed(digits));

export function toCss({ l, c, h, alpha }: Color): string {
  const value = `${round(l, 3)} ${round(c, 3)} ${round(h, 1)}`;
  return alpha == null ? `oklch(${value})` : `oklch(${value} / ${alpha}%)`;
}

// ---------- Palette ----------

export const WHITE: Color = { l: 1, c: 0, h: 0 };

/** Abstand zweier Farbtöne auf dem Farbkreis (0–180°). */
export const hueDistance = (a: number, b: number) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));

/** Farbton der festen Warnfarbe aus globals.css */
const WARNING_HUE = 72;

/**
 * Liegt die Akzentfarbe so nah an einer Signalfarbe, dass man sie verwechseln könnte?
 * `pnl` sind die gerade gewählten Gewinn- und Verlustfarben (Hex).
 */
export function signalConflict(accentHex: string, pnl: { profit: string; loss: string }): { label: string; meaning: string } | null {
  const { c, h } = hexToOklch(accentHex);
  if (c < 0.08) return null;
  const signals = [
    { color: hexToOklch(pnl.loss), label: "der Verlustfarbe", meaning: "Verlusten" },
    { color: hexToOklch(pnl.profit), label: "der Gewinnfarbe", meaning: "Gewinnen" },
    { color: { l: 0.75, c: 0.15, h: WARNING_HUE }, label: "der Warnfarbe", meaning: "Warnungen" },
  ];
  const match = signals.find(({ color }) => color.c >= 0.08 && hueDistance(h, color.h) < 25);
  return match ? { label: match.label, meaning: match.meaning } : null;
}

export type Palette = Record<string, Color>;

/**
 * Leitet aus zwei Farben alle Variablen für Dunkel und Hell ab.
 * Dunkel: Grundfarbe als Hintergrund (bei Bedarf abgedunkelt), Karten eine Stufe heller, Leiste eine dunkler.
 * Hell: fast weißer Hintergrund mit einem Hauch der Grundfarbe, die Seitenleiste bleibt dunkel in der Grundfarbe.
 */
export function themePalette(accentHex: string, baseHex: string): { dark: Palette; light: Palette } {
  const accent = hexToOklch(accentHex);
  const base = hexToOklch(baseHex);
  const h = base.h;
  const tint = Math.min(base.c, 0.08);
  const shade = (l: number, factor: number, alpha?: number): Color => ({ l, c: tint * factor, h, alpha });

  const bg: Color = { l: clamp(base.l, 0.14, 0.26), c: tint, h };
  // Akzent muss sich auf dunklem wie hellem Grund abheben
  const accentDark: Color = { ...accent, l: clamp(accent.l, 0.62, 0.86) };
  const accentLight: Color = { ...accent, l: clamp(accent.l, 0.45, 0.64) };
  const onAccent = contrastRatio(accentDark, bg) >= contrastRatio(accentDark, WHITE) ? bg : { l: 0.985, c: 0, h: 0 };
  const alpha = (color: Color, a: number): Color => ({ ...color, alpha: a });

  const fg = shade(0.965, 0.18);
  const mutedFg = shade(0.74, 0.67);
  const raised = shade(bg.l + 0.086, 1.12);
  const line = (a: number): Color => ({ l: 0.85, c: Math.min(tint * 1.2, 0.08), h, alpha: a });

  const card = shade(bg.l + 0.038, 1.07);
  const lightBg = shade(0.982, 0.12);

  const dark: Palette = {
    background: bg,
    foreground: fg,
    card,
    "card-foreground": fg,
    popover: shade(bg.l + 0.071, 1.12),
    "popover-foreground": fg,
    primary: accentDark,
    "primary-foreground": onAccent,
    secondary: raised,
    "secondary-foreground": fg,
    muted: raised,
    "muted-foreground": mutedFg,
    accent: raised,
    "accent-foreground": fg,
    border: line(11),
    input: line(18),
    ring: alpha(accentDark, 70),
    // Auswahl und Fokus: auch als Schrift auf Karten lesbar
    brand: readableOn(accentDark, card),
    "chart-line": accentDark,
    "chart-grid": line(8),
    "chart-axis": shade(0.62, 0.75),
    sidebar: shade(Math.max(bg.l - 0.032, 0.1), 0.87),
    "sidebar-foreground": fg,
    "sidebar-muted-foreground": mutedFg,
    "sidebar-primary": accentDark,
    "sidebar-primary-foreground": onAccent,
    "sidebar-accent": alpha(accentDark, 15),
    "sidebar-accent-foreground": fg,
    "sidebar-border": line(9),
    "sidebar-ring": alpha(accentDark, 70),
  };

  const soft = shade(0.95, 0.27);
  const light: Palette = {
    background: lightBg,
    foreground: bg,
    card: WHITE,
    "card-foreground": bg,
    popover: WHITE,
    "popover-foreground": bg,
    primary: bg,
    "primary-foreground": shade(0.985, 0.07),
    secondary: soft,
    "secondary-foreground": bg,
    muted: soft,
    "muted-foreground": shade(0.5, 0.67),
    accent: soft,
    "accent-foreground": bg,
    border: shade(0.9, 0.37),
    input: shade(0.9, 0.37),
    ring: alpha(accentLight, 60),
    brand: readableOn(accentLight, lightBg),
    "chart-line": accentLight,
    "chart-grid": shade(0.92, 0.3),
    "chart-axis": shade(0.55, 0.52),
    sidebar: bg,
    "sidebar-foreground": fg,
    "sidebar-muted-foreground": shade(0.72, 0.67),
    "sidebar-primary": accentDark,
    "sidebar-primary-foreground": onAccent,
    "sidebar-accent": alpha(accentDark, 16),
    "sidebar-accent-foreground": shade(0.985, 0.07),
    "sidebar-border": alpha(WHITE, 8),
    "sidebar-ring": alpha(accentDark, 70),
  };

  return { dark, light };
}

/** CSS, das die Variablen aus globals.css überschreibt; leer für Standard. */
export function colorThemeCss(theme: ColorTheme): string {
  if (theme.id === "standard") return "";
  const { dark, light } = themePalette(theme.accent, theme.base);
  const block = (palette: Palette) =>
    Object.entries(palette)
      .map(([name, color]) => `--${name}:${toCss(color)};`)
      .join("");
  // html.x schlägt .dark/:root aus globals.css, ohne !important
  return `html.dark{${block(dark)}}html:not(.dark){${block(light)}}`;
}
