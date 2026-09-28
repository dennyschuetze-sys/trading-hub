"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isChartKind, isValidDate, parseMarkets, parseNoTrade, parseRoutine, type ChartKind } from "@/lib/daily-plan";
import { bool, list, text, type FormState } from "@/lib/form-data";
import { dayBoundary } from "@/lib/trading";

async function requireUser() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");
  return supabase;
}

const UUID = /^[0-9a-f-]{36}$/i;

function intInRange(formData: FormData, key: string, min: number, max: number): number | null {
  const raw = text(formData, key);
  if (raw == null) return null;
  const n = Number(raw);
  return Number.isInteger(n) && n >= min && n <= max ? n : null;
}

const clipped = (formData: FormData, key: string, max: number) => text(formData, key)?.slice(0, max) ?? null;

export async function savePremarket(date: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const supabase = await requireUser();
  if (!isValidDate(date)) return { error: "Ungültiges Datum." };

  const { error } = await supabase.from("daily_plans").upsert(
    {
      plan_date: date,
      focus: clipped(formData, "focus", 500),
      markets: parseMarkets(formData),
      strategy_ids: list(formData, "strategy_ids").filter((id) => UUID.test(id)).slice(0, 20),
      max_trades: intInRange(formData, "max_trades", 0, 100),
      max_losses: intInRange(formData, "max_losses", 0, 100),
      news_notes: clipped(formData, "news_notes", 5000),
      routine: parseRoutine(formData),
      mood_before: intInRange(formData, "mood_before", 1, 5),
      energy: intInRange(formData, "energy", 1, 5),
      premarket_notes: clipped(formData, "premarket_notes", 20000),
    },
    { onConflict: "user_id,plan_date" },
  );
  if (error) return { error: `Speichern fehlgeschlagen: ${error.message}` };

  revalidatePath("/plan");
  revalidatePath("/dashboard");
  redirect(`/plan?date=${date}&saved=pre`);
}

export async function saveReview(date: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const supabase = await requireUser();
  if (!isValidDate(date)) return { error: "Ungültiges Datum." };

  // „Kein Trade“ nur, wenn wirklich keine (Live-)Trades an dem Tag erfasst sind
  const { count, error: countError } = await supabase
    .from("trades")
    .select("id", { count: "exact", head: true })
    .eq("is_backtest", false)
    .gte("entry_time", dayBoundary(date, "start"))
    .lte("entry_time", dayBoundary(date, "end"));
  if (countError) return { error: `Speichern fehlgeschlagen: ${countError.message}` };

  const { error } = await supabase.from("daily_plans").upsert(
    {
      plan_date: date,
      ...parseNoTrade(formData, count ?? 0),
      went_well: clipped(formData, "went_well", 10000),
      to_improve: clipped(formData, "to_improve", 10000),
      lesson: clipped(formData, "lesson", 2000),
      followed_plan: bool(formData, "followed_plan"),
      discipline: intInRange(formData, "discipline", 1, 5),
      mood_after: intInRange(formData, "mood_after", 1, 5),
      reviewed_at: new Date().toISOString(),
    },
    { onConflict: "user_id,plan_date" },
  );
  if (error) return { error: `Speichern fehlgeschlagen: ${error.message}` };

  revalidatePath("/plan");
  revalidatePath("/dashboard");
  redirect(`/plan?date=${date}&saved=review`);
}

export async function deletePlan(date: string) {
  const supabase = await requireUser();
  if (!isValidDate(date)) throw new Error("Ungültiges Datum");
  const { error } = await supabase.from("daily_plans").delete().eq("plan_date", date);
  if (error) throw new Error(error.message);
  revalidatePath("/plan");
  revalidatePath("/dashboard");
  redirect(`/plan?date=${date}`);
}

// Chart-Bilder zum Tag – hochgeladen wird im Browser (lib/screenshot-upload.ts), hier nur Ändern und Löschen

function revalidateCharts() {
  revalidatePath("/plan");
  revalidatePath("/plan/charts");
  revalidatePath("/plan/history");
}

export async function updateDayChart(id: string, values: { kind: ChartKind; symbol: string; note: string }) {
  const supabase = await requireUser();
  if (!UUID.test(id)) throw new Error("Ungültiges Bild");
  const symbol = values.symbol.trim().slice(0, 30).toUpperCase();
  const note = values.note.trim().slice(0, 1000);
  const { error } = await supabase
    .from("day_charts")
    .update({ kind: isChartKind(values.kind) ? values.kind : "market", symbol: symbol || null, note: note || null })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidateCharts();
}

export async function deleteDayChart(id: string) {
  const supabase = await requireUser();
  if (!UUID.test(id)) throw new Error("Ungültiges Bild");
  const { data: chart } = await supabase.from("day_charts").select("storage_path").eq("id", id).maybeSingle();
  if (!chart) return;

  await supabase.storage.from("screenshots").remove([chart.storage_path]);
  const { error } = await supabase.from("day_charts").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidateCharts();
}
