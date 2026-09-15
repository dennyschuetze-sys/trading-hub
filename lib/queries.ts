import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { CoreTrade, StatTrade } from "@/lib/stats";

const STAT_COLUMNS =
  "id, account_id, symbol, direction, status, entry_time, exit_time, net_pnl, r_multiple, session, setup_quality, emotion, mistakes, followed_plan, strategy_id, risk_amount";
const PAGE = 1000;

type Supabase = Awaited<ReturnType<typeof createClient>>;

/**
 * Alle Live-Trades (ohne Backtests) für Auswertungen – seitenweise, weil Supabase max. 1000 Zeilen liefert.
 * Optional nur Trades mit Einstieg im Zeitraum `entryFrom`–`entryTo` (ISO).
 */
export async function fetchStatTrades(
  supabase: Supabase,
  accountIds?: string[],
  range: { entryFrom?: string; entryTo?: string } = {},
): Promise<StatTrade[]> {
  if (accountIds && accountIds.length === 0) return [];
  const all: StatTrade[] = [];
  for (let from = 0; ; from += PAGE) {
    let query = supabase
      .from("trades")
      .select(STAT_COLUMNS)
      .eq("is_backtest", false)
      .order("entry_time", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (accountIds) query = query.in("account_id", accountIds);
    if (range.entryFrom) query = query.gte("entry_time", range.entryFrom);
    if (range.entryTo) query = query.lte("entry_time", range.entryTo);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    // Live-Trades haben laut Constraint trades_live_or_backtest immer einen Account
    all.push(...(data as StatTrade[]));
    if (data.length < PAGE) break;
  }
  return all;
}

export type BacktestTrade = CoreTrade & { backtest_session_id: string };

/** Backtest-Trades, optional nur bestimmter Sessions – seitenweise wie fetchStatTrades. */
export async function fetchBacktestTrades(supabase: Supabase, sessionIds?: string[]): Promise<BacktestTrade[]> {
  if (sessionIds && sessionIds.length === 0) return [];
  const columns = STAT_COLUMNS.replace("account_id", "backtest_session_id");
  const all: BacktestTrade[] = [];
  for (let from = 0; ; from += PAGE) {
    let query = supabase
      .from("trades")
      .select(columns)
      .eq("is_backtest", true)
      .order("entry_time", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (sessionIds) query = query.in("backtest_session_id", sessionIds);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    // Backtest-Trades haben laut Constraint trades_live_or_backtest immer eine Session
    all.push(...(data as unknown as BacktestTrade[]));
    if (data.length < PAGE) break;
  }
  return all;
}
