import "server-only";
import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** Strategien mit sortierter Checkliste für das Trade-Formular. */
export async function fetchStrategyOptions(supabase: Supabase) {
  const { data } = await supabase
    .from("strategies")
    .select("id, name, status, strategy_checklist_items(id, label, position)")
    .order("name");
  return (data ?? []).map((s) => ({
    id: s.id,
    name: s.name,
    status: s.status,
    checklist: [...s.strategy_checklist_items]
      .sort((a, b) => a.position - b.position)
      .map(({ id, label }) => ({ id, label })),
  }));
}
