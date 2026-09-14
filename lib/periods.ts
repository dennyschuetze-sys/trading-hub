/** Wochen (Montag–Sonntag) und Monate als Kalendertage im Format YYYY-MM-DD (Berliner Zeit). */

export type PeriodType = "week" | "month";

export const PERIOD_TYPES: { value: PeriodType; label: string }[] = [
  { value: "week", label: "Woche" },
  { value: "month", label: "Monat" },
];

const toDate = (day: string) => new Date(`${day}T12:00:00Z`);
const toDay = (d: Date) => d.toISOString().slice(0, 10);

export function addDays(day: string, n: number) {
  const d = toDate(day);
  d.setUTCDate(d.getUTCDate() + n);
  return toDay(d);
}

/** 1 = Montag … 7 = Sonntag */
export const weekday = (day: string) => ((toDate(day).getUTCDay() + 6) % 7) + 1;

export function periodStart(day: string, type: PeriodType) {
  return type === "week" ? addDays(day, 1 - weekday(day)) : `${day.slice(0, 7)}-01`;
}

export function periodEnd(start: string, type: PeriodType) {
  if (type === "week") return addDays(start, 6);
  const d = toDate(start);
  d.setUTCMonth(d.getUTCMonth() + 1, 0);
  return toDay(d);
}

export function shiftPeriod(start: string, type: PeriodType, n: number) {
  if (type === "week") return addDays(start, 7 * n);
  const d = toDate(start);
  d.setUTCMonth(d.getUTCMonth() + n, 1);
  return toDay(d);
}

export function periodDays(start: string, type: PeriodType) {
  const end = periodEnd(start, type);
  const days: string[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) days.push(d);
  return days;
}

/** ISO-Kalenderwoche */
export function isoWeek(day: string) {
  const d = toDate(day);
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
  return Math.ceil(((d.getTime() - yearStart) / 86400000 + 1) / 7);
}

const monthFormatter = new Intl.DateTimeFormat("de-DE", { month: "long", year: "numeric", timeZone: "UTC" });
const shortFormatter = new Intl.DateTimeFormat("de-DE", { day: "numeric", month: "short", timeZone: "UTC" });

/** „KW 38 · 14. Sept. – 20. Sept.“ bzw. „September 2026“ */
export function periodLabel(start: string, type: PeriodType) {
  if (type === "month") return monthFormatter.format(toDate(start));
  return `KW ${isoWeek(start)} · ${shortFormatter.format(toDate(start))} – ${shortFormatter.format(toDate(periodEnd(start, type)))}`;
}

export function isPeriodType(value: unknown): value is PeriodType {
  return value === "week" || value === "month";
}
