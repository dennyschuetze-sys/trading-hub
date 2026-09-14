/** Kleine Helfer, um Formularwerte sicher auszulesen. */

export function text(formData: FormData, key: string): string | null {
  const value = String(formData.get(key) ?? "").trim();
  return value === "" ? null : value;
}

export function requiredText(formData: FormData, key: string, label: string): string {
  const value = text(formData, key);
  if (!value) throw new FormError(`${label} fehlt.`);
  return value;
}

/**
 * Liest deutsche und englische Zahlenformate.
 * - Beide Trennzeichen vorhanden: das hintere ist das Dezimalzeichen („10.000,50“, „10,000.50“).
 * - Nur Komma: Dezimalkomma („1,5“).
 * - Nur Punkt: bei Geldbeträgen im Tausender-Muster ein Tausenderpunkt („10.000“),
 *   sonst Dezimalpunkt – wichtig für Kurse wie „157.123“.
 */
export function parseNumber(raw: string, kind: "money" | "price" = "price"): number {
  let s = raw.replace(/[\s'€$£]/g, "");
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");

  if (lastComma !== -1 && lastDot !== -1) {
    const decimal = lastComma > lastDot ? "," : ".";
    const thousands = decimal === "," ? "." : ",";
    s = s.split(thousands).join("").replace(decimal, ".");
  } else if (lastComma !== -1) {
    s = kind === "money" && /^-?\d{1,3}(,\d{3})+$/.test(s) ? s.split(",").join("") : s.replace(",", ".");
  } else if (kind === "money" && /^-?\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.split(".").join("");
  }

  const value = Number(s);
  if (s === "" || !Number.isFinite(value)) throw new FormError(`„${raw}“ ist keine gültige Zahl.`);
  return value;
}

export function num(formData: FormData, key: string, kind: "money" | "price" = "price"): number | null {
  const raw = text(formData, key);
  return raw == null ? null : parseNumber(raw, kind);
}

export function money(formData: FormData, key: string): number | null {
  return num(formData, key, "money");
}

export function requiredMoney(formData: FormData, key: string, label: string): number {
  const value = money(formData, key);
  if (value == null) throw new FormError(`${label} fehlt.`);
  return value;
}

export function requiredNum(formData: FormData, key: string, label: string): number {
  const value = num(formData, key);
  if (value == null) throw new FormError(`${label} fehlt.`);
  return value;
}

export function bool(formData: FormData, key: string): boolean | null {
  const value = text(formData, key);
  if (value === "true") return true;
  if (value === "false") return false;
  return null;
}

export function list(formData: FormData, key: string): string[] {
  return formData
    .getAll(key)
    .map((v) => String(v).trim())
    .filter(Boolean);
}

export class FormError extends Error {}

export type FormState = { error?: string };
