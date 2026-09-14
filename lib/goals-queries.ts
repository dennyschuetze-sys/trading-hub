import "server-only";
import type { DisciplineData, PlanFact } from "@/lib/discipline";
import { fetchStatTrades } from "@/lib/queries";
import { getRiskRules, loadViolations } from "@/lib/risk-queries";
import { hasAnyRule, type RiskRules } from "@/lib/risk-rules";
import type { ChecklistResult, StatTrade } from "@/lib/stats";
import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;
const PAGE = 1000;

async function fetchPlans(supabase: Supabase): Promise<PlanFact[]> {
  const all: PlanFact[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("daily_plans")
      .select("plan_date, reviewed_at, max_trades, max_losses, lesson")
      .order("plan_date")
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    all.push(...data);
    if (data.length < PAGE) break;
  }
  return all;
}

async function fetchChecklist(supabase: Supabase): Promise<ChecklistResult[]> {
  const all: ChecklistResult[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("trade_checklist_results")
      .select("trade_id, item_id, checked")
      .order("trade_id")
      .order("item_id")
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    all.push(...data);
    if (data.length < PAGE) break;
  }
  return all;
}

/** Alles, was für Disziplin-Score, Streaks und Ziele gebraucht wird (Live-Trades, Pläne, Checklisten, Verstöße). */
export async function loadDisciplineData(
  supabase: Supabase,
  preloaded?: { trades?: StatTrade[]; rules?: RiskRules },
): Promise<{ data: DisciplineData; rules: RiskRules }> {
  const [trades, rules, plans, checklist] = await Promise.all([
    preloaded?.trades ?? fetchStatTrades(supabase),
    preloaded?.rules ?? getRiskRules(supabase),
    fetchPlans(supabase),
    fetchChecklist(supabase),
  ]);
  const { violations } = await loadViolations(supabase, {}, { trades, rules });
  return { data: { trades, plans, violations, checklist, rulesActive: hasAnyRule(rules) }, rules };
}
