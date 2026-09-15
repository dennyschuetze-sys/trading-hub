"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { AiError, generateStructured } from "@/lib/ai/claude";
import { JOURNAL_SYSTEM, buildJournalPrompt } from "@/lib/ai/prompts";
import { MAX_GENERATIONS, loadReport, saveReport } from "@/lib/ai/reports";
import { JournalAnalysisSchema } from "@/lib/ai/schemas";
import { isValidDate, todayBerlin } from "@/lib/daily-plan";
import { summarizePeriod } from "@/lib/goals";
import { loadDisciplineData } from "@/lib/goals-queries";
import { isPeriodType, periodEnd, periodLabel, periodStart, type PeriodType } from "@/lib/periods";
import { VIOLATION_LABELS } from "@/lib/risk-rules";
import { createClient } from "@/lib/supabase/server";
import { maxAdverseR, maxFavorableR } from "@/lib/r-multiple";
import { revengeTrades, tradeNumberOfDay } from "@/lib/trade-analysis";
import { HTF_BIASES, MARKET_CONTEXTS, SESSIONS, dayBoundary, labelFor } from "@/lib/trading";

/** KI-Analyse des Journals für eine Woche oder einen Monat. */
export async function generateJournalAnalysis(type: PeriodType, requestedStart: string): Promise<{ error?: string }> {
  if (!isPeriodType(type) || !isValidDate(requestedStart)) return { error: "Ungültiger Zeitraum." };
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");

  const start = periodStart(requestedStart, type);
  const end = periodEnd(start, type);
  const today = todayBerlin();
  if (start > today) return { error: "Dieser Zeitraum liegt in der Zukunft." };

  const kind = type === "week" ? "journal_week" : "journal_month";
  const { generations } = await loadReport(supabase, kind, start, JournalAnalysisSchema);
  if (generations >= MAX_GENERATIONS) return { error: `Für diesen Zeitraum wurde die Analyse schon ${MAX_GENERATIONS}-mal erstellt.` };

  const [{ data: discipline }, { data: trades, error: tradesError }, { data: plans }, { data: review }, { data: accounts }, { data: strategies }] = await Promise.all([
    loadDisciplineData(supabase),
    supabase
      .from("trades")
      .select("id, account_id, entry_time, exit_time, symbol, direction, status, net_pnl, r_multiple, session, setup_quality, emotion, mistakes, followed_plan, notes, lessons, entry_price, stop_loss, best_price, worst_price, entry_timeframe, htf_bias, market_context, accounts(name, currency), strategies(name)")
      .eq("is_backtest", false)
      .gte("entry_time", dayBoundary(start, "start"))
      .lte("entry_time", dayBoundary(end, "end"))
      .order("entry_time")
      .limit(500),
    supabase
      .from("daily_plans")
      .select("plan_date, followed_plan, discipline, went_well, to_improve, lesson")
      .gte("plan_date", start)
      .lte("plan_date", end)
      .order("plan_date"),
    supabase.from("reviews").select("went_well, to_improve, lessons").eq("period_type", type).eq("period_start", start).maybeSingle(),
    supabase.from("accounts").select("id, currency"),
    supabase.from("strategies").select("id, name"),
  ]);
  if (tradesError) return { error: "Trades konnten nicht geladen werden." };
  if (!trades?.length && !plans?.length) return { error: "In diesem Zeitraum gibt es weder Trades noch Tagespläne." };

  const stats = summarizePeriod(
    discipline,
    type,
    start,
    today,
    new Map((accounts ?? []).map((a) => [a.id, a.currency])),
    new Map((strategies ?? []).map((s) => [s.id, s.name])),
  );

  const timed = (trades ?? []).map((t) => ({ ...t, account_id: t.account_id ?? "" }));
  const tradeNumbers = tradeNumberOfDay(timed);
  const revenge = revengeTrades(timed);

  try {
    const result = await generateStructured({
      schema: JournalAnalysisSchema,
      system: JOURNAL_SYSTEM,
      prompt: buildJournalPrompt({
        periodLabel: periodLabel(start, type),
        trades: (trades ?? []).map((t) => ({
          ...t,
          currency: t.accounts?.currency ?? "USD",
          account: t.accounts?.name ?? "?",
          strategy: t.strategies?.name ?? null,
          session: t.session ? labelFor(SESSIONS, t.session) : null,
          violations: (discipline.violations.get(t.id) ?? []).map((v) => `${VIOLATION_LABELS[v.kind]} – ${v.message}`),
          mfe_r: maxFavorableR(t),
          mae_r: maxAdverseR(t),
          timeframe: t.entry_timeframe,
          htf_bias: t.htf_bias ? labelFor(HTF_BIASES, t.htf_bias) : null,
          market_context: t.market_context ? labelFor(MARKET_CONTEXTS, t.market_context) : null,
          trade_of_day: tradeNumbers.get(t.id) ?? null,
          revenge: revenge.has(t.id),
        })),
        plans: plans ?? [],
        stats,
        review,
      }),
      effort: "high",
    });
    await saveReport(supabase, auth.user.id, kind, start, result, generations);
  } catch (e) {
    if (e instanceof AiError) return { error: e.message };
    console.error("KI-Analyse fehlgeschlagen", e);
    return { error: "Die Analyse konnte nicht erstellt werden." };
  }

  revalidatePath("/goals");
  return {};
}
