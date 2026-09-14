"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isValidDate, parseMarkets, parseRoutine } from "@/lib/daily-plan";
import { bool, list, text, type FormState } from "@/lib/form-data";

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

  const { error } = await supabase.from("daily_plans").upsert(
    {
      plan_date: date,
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
