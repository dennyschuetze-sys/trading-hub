import "server-only";
import type { AccountRiskRow } from "@/components/risk/risk-status-card";
import type { CalendarEvent } from "@/lib/calendar";
import { evaluateAccount } from "@/lib/prop-rules";
import { fetchStatTrades, fetchTradesClosedBetween } from "@/lib/queries";
import {
  evaluateToday,
  findViolations,
  newsLock,
  NO_RULES,
  type NewsEvent,
  type NewsLock,
  type RiskRules,
  type Violation,
} from "@/lib/risk-rules";
import type { StatTrade } from "@/lib/stats";
import type { createClient } from "@/lib/supabase/server";
import type { Account } from "@/lib/trading";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export async function getRiskRules(supabase: Supabase): Promise<RiskRules> {
  const { data } = await supabase
    .from("user_settings")
    .select(
      "max_trades_per_day, max_consecutive_losses, daily_loss_limit_pct, max_risk_per_trade_pct, default_risk_pct, news_block_before_min, news_block_after_min",
    )
    .maybeSingle();
  if (!data) return NO_RULES;
  return {
    maxTradesPerDay: data.max_trades_per_day,
    maxConsecutiveLosses: data.max_consecutive_losses,
    dailyLossLimitPct: data.daily_loss_limit_pct == null ? null : Number(data.daily_loss_limit_pct),
    maxRiskPerTradePct: data.max_risk_per_trade_pct == null ? null : Number(data.max_risk_per_trade_pct),
    defaultRiskPct: data.default_risk_pct == null ? null : Number(data.default_risk_pct),
    newsBlockBeforeMin: data.news_block_before_min,
    newsBlockAfterMin: data.news_block_after_min,
  };
}

/**
 * Speichert die High-Impact-Termine der laufenden Woche, damit News-Sperrzeiten auch
 * nach Ablauf der Woche noch geprüft werden können. Fehler sind unkritisch.
 */
export async function rememberEvents(supabase: Supabase, events: CalendarEvent[]) {
  const rows = events
    .filter((e) => e.impact === "high")
    .map((e) => ({ event_key: e.id, title: e.title, currency: e.currency, event_time: e.time, impact: e.impact }));
  if (!rows.length) return;
  const { error } = await supabase.from("calendar_history").upsert(rows, { onConflict: "user_id,event_key", ignoreDuplicates: true });
  if (error) console.error("Termine konnten nicht gespeichert werden", error.message);
}

/** Gespeicherte High-Impact-Termine, optional nur in einem Zeitraum (ISO). */
export async function getEventHistory(supabase: Supabase, from?: string, to?: string): Promise<NewsEvent[]> {
  const all: NewsEvent[] = [];
  for (let offset = 0; ; offset += 1000) {
    let query = supabase
      .from("calendar_history")
      .select("title, currency, event_time")
      .eq("impact", "high")
      .order("event_time")
      .order("event_key")
      .range(offset, offset + 999);
    if (from) query = query.gte("event_time", from);
    if (to) query = query.lte("event_time", to);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    all.push(...data.map((e) => ({ title: e.title, currency: e.currency, time: new Date(e.event_time).toISOString() })));
    if (data.length < 1000) break;
  }
  return all;
}

type RowAccount = Pick<
  Account,
  "id" | "name" | "currency" | "starting_balance" | "status" | "max_daily_loss" | "max_drawdown" | "drawdown_type" | "profit_target" | "min_trading_days"
>;

/** Stand „heute“ für alle aktiven Accounts plus News-Sperre (aus dem Kalender der laufenden Woche). */
export function buildRiskToday(
  accounts: RowAccount[],
  trades: StatTrade[],
  rules: RiskRules,
  calendar: CalendarEvent[],
  currencies: string[],
  now: Date,
): { rows: AccountRiskRow[]; lock: NewsLock } {
  const rows = accounts
    .filter((a) => a.status === "active")
    .map((a) => {
      const own = trades.filter((t) => t.account_id === a.id);
      return {
        id: a.id,
        name: a.name,
        currency: a.currency,
        today: evaluateToday(a, own, rules, now),
        prop: evaluateAccount(a, own, now),
      };
    });
  const events = calendar.filter((e) => e.impact === "high").map((e) => ({ title: e.title, currency: e.currency, time: e.time }));
  return { rows, lock: newsLock(events, currencies, rules, now) };
}

const DAY = 24 * 60 * 60 * 1000;
const shift = (iso: string, ms: number) => new Date(Date.parse(iso) + ms).toISOString();

/**
 * Regelverstöße für Trades mit Einstieg im Zeitraum. Holt dafür etwas Vorlauf (über Nacht
 * gehaltene Trades zählen zum Tag ihres Ausstiegs) und die Termine rund um den Zeitraum.
 * Ohne Zeitraum werden alle Trades geprüft.
 *
 * Zusätzlich werden alle im Zeitraum geschlossenen Trades geladen, auch wenn ihr Einstieg
 * weit davor liegt: Tagesverlust und Verlustserie zählen sie zum Ausstiegstag, und ein
 * fester Vorlauf würde einen lange gehaltenen Trade übersehen.
 */
export async function loadViolations(
  supabase: Supabase,
  range: { entryFrom?: string; entryTo?: string } = {},
  preloaded?: { trades?: StatTrade[]; rules?: RiskRules },
): Promise<{ violations: Map<string, Violation[]>; rules: RiskRules; trades: StatTrade[] }> {
  const rules = preloaded?.rules ?? (await getRiskRules(supabase));
  const padded = {
    entryFrom: range.entryFrom ? shift(range.entryFrom, -4 * DAY) : undefined,
    entryTo: range.entryTo ? shift(range.entryTo, DAY) : undefined,
  };
  const [entered, closedInRange, { data: accounts }, events] = await Promise.all([
    preloaded?.trades ?? fetchStatTrades(supabase, undefined, padded),
    // Nur nötig, wenn überhaupt eingegrenzt wird und die Trades nicht schon vollständig vorliegen
    preloaded?.trades || !padded.entryFrom
      ? Promise.resolve([])
      : fetchTradesClosedBetween(supabase, padded.entryFrom, padded.entryTo ?? new Date().toISOString()),
    supabase.from("accounts").select("id, starting_balance, currency"),
    rules.newsBlockBeforeMin || rules.newsBlockAfterMin
      ? getEventHistory(supabase, padded.entryFrom && shift(padded.entryFrom, -DAY), padded.entryTo && shift(padded.entryTo, DAY))
      : Promise.resolve([]),
  ]);

  const byId = new Map(entered.map((t) => [t.id, t]));
  for (const t of closedInRange) if (!byId.has(t.id)) byId.set(t.id, t);
  const trades = [...byId.values()];

  // `trades` geht auch an die Aufrufer zurück – in der Einstiegsreihenfolge wie bisher
  trades.sort((a, b) => a.entry_time.localeCompare(b.entry_time) || a.id.localeCompare(b.id));

  return { violations: findViolations(trades, accounts ?? [], rules, events), rules, trades };
}
