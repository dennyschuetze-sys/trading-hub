import type { Tables } from "@/lib/database.types";
import { TIME_ZONE } from "@/lib/trading";

export type DailyPlan = Tables<"daily_plans">;
export type Bias = "bullish" | "bearish" | "neutral";
export type MarketPlan = { symbol: string; bias: Bias | null; levels: string; scenario: string };
export type RoutineItem = { label: string; done: boolean };

export const BIASES: { value: Bias; label: string }[] = [
  { value: "bullish", label: "Bullisch" },
  { value: "bearish", label: "Bärisch" },
  { value: "neutral", label: "Neutral / Range" },
];

export const DEFAULT_ROUTINE = [
  "Wirtschaftskalender geprüft",
  "Higher-Timeframe-Analyse (D1/H4)",
  "Key-Levels eingezeichnet",
  "Risiko pro Trade festgelegt",
  "Mentaler Zustand geprüft – bereit zu traden?",
];

export const SCALE_LABELS: Record<"mood" | "energy" | "discipline", string[]> = {
  mood: ["Sehr schlecht", "Schlecht", "Neutral", "Gut", "Sehr gut"],
  energy: ["Erschöpft", "Müde", "Normal", "Wach", "Voller Energie"],
  discipline: ["Regeln gebrochen", "Oft abgewichen", "Teilweise", "Meist diszipliniert", "Voll diszipliniert"],
};

// Datum (Kalendertag in Berliner Zeit, Format YYYY-MM-DD) --------------------------

export function todayBerlin(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE }).format(now);
}

export function isValidDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

export function shiftDate(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// Formular-Daten -------------------------------------------------------------------

const clip = (v: FormDataEntryValue | null | undefined, max: number) => String(v ?? "").trim().slice(0, max);

/** Marktanalyse aus parallelen Feldern `market_symbol[]`, `market_bias[]`, … – leere Zeilen fallen weg. */
export function parseMarkets(formData: FormData): MarketPlan[] {
  const symbols = formData.getAll("market_symbol");
  const biases = formData.getAll("market_bias");
  const levels = formData.getAll("market_levels");
  const scenarios = formData.getAll("market_scenario");
  return symbols
    .map((s, i) => {
      const bias = String(biases[i] ?? "");
      return {
        symbol: clip(s, 30).toUpperCase(),
        bias: BIASES.some((b) => b.value === bias) ? (bias as Bias) : null,
        levels: clip(levels[i], 1000),
        scenario: clip(scenarios[i], 2000),
      };
    })
    .filter((m) => m.symbol || m.levels || m.scenario)
    .slice(0, 20);
}

/** Routine aus `routine_label[]` und den abgehakten Indizes `routine_done[]`. */
export function parseRoutine(formData: FormData): RoutineItem[] {
  const done = new Set(formData.getAll("routine_done").map(String));
  return formData
    .getAll("routine_label")
    .map((label, i) => ({ label: clip(label, 200), done: done.has(String(i)) }))
    .filter((r) => r.label)
    .slice(0, 30);
}

/** Robustes Lesen der JSON-Spalten (Daten könnten aus älteren Versionen stammen). */
export function readMarkets(value: unknown): MarketPlan[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((m) =>
    m && typeof m === "object"
      ? [
          {
            symbol: String((m as MarketPlan).symbol ?? ""),
            bias: BIASES.some((b) => b.value === (m as MarketPlan).bias) ? (m as MarketPlan).bias : null,
            levels: String((m as MarketPlan).levels ?? ""),
            scenario: String((m as MarketPlan).scenario ?? ""),
          },
        ]
      : [],
  );
}

export function readRoutine(value: unknown): RoutineItem[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((r) =>
    r && typeof r === "object" && (r as RoutineItem).label
      ? [{ label: String((r as RoutineItem).label), done: Boolean((r as RoutineItem).done) }]
      : [],
  );
}

/** Routine für einen neuen Tag: Punkte des letzten Plans (unabgehakt) oder die Standardliste. */
export function routineTemplate(previous: unknown): RoutineItem[] {
  const labels = readRoutine(previous).map((r) => r.label);
  return (labels.length ? labels : DEFAULT_ROUTINE).map((label) => ({ label, done: false }));
}

// Auswertung des Tages ----------------------------------------------------------------

export type DayCheck = {
  trades: number;
  wins: number;
  losses: number;
  tradesOk: boolean | null;
  lossesOk: boolean | null;
};

/** Prüft die im Plan gesetzten Limits gegen die tatsächlichen (geschlossenen) Trades des Tages. */
export function checkDay(
  plan: Pick<DailyPlan, "max_trades" | "max_losses"> | null,
  trades: { net_pnl: number | null; status: string }[],
): DayCheck {
  const closed = trades.filter((t) => t.status === "closed" && t.net_pnl != null);
  const losses = closed.filter((t) => t.net_pnl! < 0).length;
  return {
    trades: trades.length,
    wins: closed.filter((t) => t.net_pnl! > 0).length,
    losses,
    tradesOk: plan?.max_trades == null ? null : trades.length <= plan.max_trades,
    lossesOk: plan?.max_losses == null ? null : losses <= plan.max_losses,
  };
}

export type PlanStatus = "missing" | "planned" | "reviewed";

export function planStatus(plan: Pick<DailyPlan, "reviewed_at"> | null): PlanStatus {
  if (!plan) return "missing";
  return plan.reviewed_at ? "reviewed" : "planned";
}
