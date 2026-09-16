/** Anzeigegröße der Oberfläche in Prozent der Browser-Schriftgröße – alle rem-Maße skalieren mit. */
export const UI_SCALE_COOKIE = "ui-scale";

export const UI_SCALES = [
  { value: 100, label: "Standard" },
  { value: 112.5, label: "Groß" },
  { value: 125, label: "Größer" },
  { value: 150, label: "Sehr groß" },
] as const;

export type UiScale = (typeof UI_SCALES)[number]["value"];

/** Cookie-Wert → erlaubte Stufe, sonst Standard. */
export function parseUiScale(raw: string | undefined): UiScale {
  return UI_SCALES.find((s) => String(s.value) === raw)?.value ?? 100;
}
