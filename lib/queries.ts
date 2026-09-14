import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { StatTrade } from "@/lib/stats";

const STAT_COLUMNS =
  "id, account_id, symbol, direction, status, entry_time, exit_time, net_pnl, r_multiple, session, setup_quality, emotion, mistakes, followed_plan, strategy_id";
const PAGE = 1000;

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** Alle Live-Trades (ohne Backtests) für Auswertungen – seitenweise, weil Supabase max. 1000 Zeilen liefert. */
export async function fetchStatTrades(supabase: Supabase, accountIds?: string[]): Promise<StatTrade[]> {
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
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    all.push(...data);
    if (data.length < PAGE) break;
  }
  return all;
}
