import { TIME_ZONE } from "@/lib/trading";

/** Achsenbeschriftung: 10.500 → „10,5 Tsd.“ */
export function compactMoney(value: number, currency: string) {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency,
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

/** Runde Achsenwerte (1, 2, 2,5 oder 5 × 10ⁿ), die min und max einschließen. */
export function niceTicks(min: number, max: number, count = 5): number[] {
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const rough = (max - min) / Math.max(1, count - 1);
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= rough)!;
  const start = Math.floor(min / step) * step;
  const end = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= end + step / 2; v += step) ticks.push(Math.round(v * 1e6) / 1e6);
  return ticks;
}

export function shortDate(isoOrDate: string) {
  const date = isoOrDate.length === 10 ? new Date(`${isoOrDate}T12:00:00Z`) : new Date(isoOrDate);
  return new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", timeZone: TIME_ZONE }).format(date);
}

/** Achsenbeschriftung über mehrere Jahre: „Sep 24“ – ohne Jahr wären Punkte nicht unterscheidbar. */
export function monthYear(isoOrDate: string) {
  const date = isoOrDate.length === 10 ? new Date(`${isoOrDate}T12:00:00Z`) : new Date(isoOrDate);
  return new Intl.DateTimeFormat("de-DE", { month: "short", year: "2-digit", timeZone: TIME_ZONE }).format(date);
}

export function longDate(isoOrDate: string) {
  const date = isoOrDate.length === 10 ? new Date(`${isoOrDate}T12:00:00Z`) : new Date(isoOrDate);
  return new Intl.DateTimeFormat("de-DE", {
    weekday: "short",
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: TIME_ZONE,
  }).format(date);
}
