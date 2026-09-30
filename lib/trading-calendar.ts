import { isNoTradeDay } from "@/lib/daily-plan";
import { berlinParts, closeTime, dailyResults, type CoreTrade } from "@/lib/stats";

/** Monat im Format YYYY-MM (Kalendermonat in Berliner Zeit). */
const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Gültiger Monat aus der URL, sonst der Monat von `today` (YYYY-MM-DD). */
export function parseMonth(value: string | undefined, today: string): string {
  return value && MONTH_PATTERN.test(value) ? value : today.slice(0, 7);
}

export function shiftMonth(month: string, delta: number): string {
  const [year, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(year, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Erster und letzter Kalendertag des Monats (YYYY-MM-DD). */
export function monthBounds(month: string): { first: string; last: string } {
  const [year, m] = month.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, m, 0)).getUTCDate();
  return { first: `${month}-01`, last: `${month}-${String(lastDay).padStart(2, "0")}` };
}

/** Wochen des Monats (Montag zuerst); Tage außerhalb des Monats sind `null`. */
export function monthWeeks(month: string): (string | null)[][] {
  const [year, m] = month.split("-").map(Number);
  const { last } = monthBounds(month);
  const daysInMonth = Number(last.slice(8));
  const firstWeekday = (new Date(Date.UTC(year, m - 1, 1)).getUTCDay() + 6) % 7; // 0 = Montag
  const cells: (string | null)[] = [
    ...Array<null>(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`),
  ];
  while (cells.length % 7) cells.push(null);
  return Array.from({ length: cells.length / 7 }, (_, w) => cells.slice(w * 7, w * 7 + 7));
}

export type CalendarDay = {
  date: string;
  /** Ergebnis der an diesem Tag geschlossenen Trades; null, wenn keiner geschlossen wurde */
  pnl: number | null;
  closed: number;
  /** Trades mit Einstieg an diesem Tag, die noch laufen */
  open: number;
  /** Markierter Kein-Trade-Tag ohne erfasste Trades */
  noTrade: boolean;
  noTradeReason: string | null;
};

/**
 * Tage des Monats, an denen etwas passiert ist: Ergebnisse (nach Tag des Ausstiegs, wie in den Statistiken),
 * laufende Trades (nach Tag des Einstiegs) und Kein-Trade-Tage. Tage ohne all das fehlen.
 * `trades` sind nur die des gewählten Accounts; ob ein Tag „Kein Trade“ ist, hängt dagegen von den
 * Einstiegen aller Accounts ab (`entries`), weil der Tag als Ganzes markiert wird.
 */
export function calendarDays(input: {
  month: string;
  /** Im Monat geschlossene Trades des gewählten Accounts */
  closed: CoreTrade[];
  /** Im Monat eröffnete Trades des gewählten Accounts (laufende werden hier gezählt) */
  entered: Pick<CoreTrade, "status" | "entry_time">[];
  /** Einstiegszeiten aller Live-Trades im Monat, unabhängig vom Account */
  entries: Pick<CoreTrade, "entry_time">[];
  plans: { plan_date: string; no_trade: boolean; no_trade_reason: string | null }[];
}): Map<string, CalendarDay> {
  const days = new Map<string, CalendarDay>();
  const day = (date: string) => {
    const existing = days.get(date);
    if (existing) return existing;
    const created: CalendarDay = { date, pnl: null, closed: 0, open: 0, noTrade: false, noTradeReason: null };
    days.set(date, created);
    return created;
  };
  const inMonth = (date: string) => date.startsWith(input.month);

  for (const r of dailyResults(input.closed)) {
    if (!inMonth(r.date)) continue;
    Object.assign(day(r.date), { pnl: r.pnl, closed: r.count });
  }

  for (const t of input.entered) {
    const date = berlinParts(t.entry_time).date;
    if (t.status === "open" && inMonth(date)) day(date).open += 1;
  }

  const entriesPerDay = new Map<string, number>();
  for (const t of input.entries) {
    const date = berlinParts(t.entry_time).date;
    entriesPerDay.set(date, (entriesPerDay.get(date) ?? 0) + 1);
  }
  for (const plan of input.plans) {
    if (!inMonth(plan.plan_date) || !isNoTradeDay(plan, entriesPerDay.get(plan.plan_date) ?? 0)) continue;
    Object.assign(day(plan.plan_date), { noTrade: true, noTradeReason: plan.no_trade_reason });
  }

  return days;
}

/**
 * Die Trades, die der Kalender an diesem Tag zählt: im Monat geschlossene nach dem Tag ihres Ausstiegs,
 * laufende nach dem Tag ihres Einstiegs – so stimmt die Liste mit Ergebnis und Anzahl in der Zelle überein.
 * Sortiert nach Einstiegszeit.
 */
export function tradesOfDay<T extends CoreTrade>(date: string, closed: T[], entered: T[]): T[] {
  const closedThatDay = closed.filter(
    (t) => t.status === "closed" && t.net_pnl != null && berlinParts(closeTime(t)).date === date,
  );
  const openThatDay = entered.filter((t) => t.status === "open" && berlinParts(t.entry_time).date === date);
  return [...closedThatDay, ...openThatDay].sort((a, b) => a.entry_time.localeCompare(b.entry_time));
}

export type MonthSummary = {
  /** Tage mit mindestens einem geschlossenen Trade */
  tradingDays: number;
  trades: number;
  pnl: number;
  winDays: number;
  lossDays: number;
  noTradeDays: number;
};

export function summarizeMonth(days: Iterable<CalendarDay>): MonthSummary {
  const summary: MonthSummary = { tradingDays: 0, trades: 0, pnl: 0, winDays: 0, lossDays: 0, noTradeDays: 0 };
  for (const d of days) {
    if (d.closed > 0) {
      summary.tradingDays += 1;
      summary.trades += d.closed;
      summary.pnl = Math.round((summary.pnl + (d.pnl ?? 0)) * 100) / 100;
      if ((d.pnl ?? 0) > 0) summary.winDays += 1;
      if ((d.pnl ?? 0) < 0) summary.lossDays += 1;
    } else if (d.noTrade) {
      summary.noTradeDays += 1;
    }
  }
  return summary;
}
