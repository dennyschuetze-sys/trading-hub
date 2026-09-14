"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Json } from "@/lib/database.types";
import { isValidDate, todayBerlin } from "@/lib/daily-plan";
import { FormError, num, requiredText, text, type FormState } from "@/lib/form-data";
import { GOAL_METRICS, summarizePeriod } from "@/lib/goals";
import { loadDisciplineData } from "@/lib/goals-queries";
import { isPeriodType, periodStart, type PeriodType } from "@/lib/periods";
import { createClient } from "@/lib/supabase/server";

async function requireUser() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");
  return supabase;
}

const UUID = /^[0-9a-f-]{36}$/i;
const clipped = (formData: FormData, key: string, max: number) => text(formData, key)?.slice(0, max) ?? null;

function checkPeriod(type: string, start: string): asserts type is PeriodType {
  if (!isPeriodType(type) || !isValidDate(start) || periodStart(start, type) !== start) throw new Error("Ungültiger Zeitraum");
}

function refresh() {
  revalidatePath("/goals");
  revalidatePath("/dashboard");
}

export async function saveGoal(
  target: { id: string | null; type: string; start: string },
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const supabase = await requireUser();
  checkPeriod(target.type, target.start);

  let values;
  try {
    const metric = requiredText(formData, "metric", "Kennzahl");
    const info = GOAL_METRICS.find((m) => m.value === metric);
    if (!info) throw new FormError("Unbekannte Kennzahl.");
    const comparison = text(formData, "comparison") === "at_most" ? "at_most" : "at_least";
    const goalTarget = num(formData, "target", info.unit === "money" ? "money" : "price");
    if (goalTarget == null) throw new FormError("Zielwert fehlt.");
    if (goalTarget < 0 && info.unit !== "money" && info.unit !== "r") throw new FormError("Der Zielwert darf nicht negativ sein.");
    if (info.unit === "percent" && goalTarget > 100) throw new FormError("Prozentwerte gehen höchstens bis 100.");
    const accountRaw = text(formData, "account_id");
    const accountId = info.perAccount && accountRaw && UUID.test(accountRaw) ? accountRaw : null;
    if (info.unit === "money" && !accountId) throw new FormError("Für Geld-Ziele bitte einen Account wählen (wegen der Währung).");

    values = {
      period_type: target.type,
      period_start: target.start,
      title: requiredText(formData, "title", "Titel").slice(0, 200),
      metric,
      comparison,
      target: goalTarget,
      account_id: accountId,
      manual_value: metric === "manual" ? num(formData, "manual_value") : null,
      notes: clipped(formData, "notes", 2000),
    };
  } catch (e) {
    if (e instanceof FormError) return { error: e.message };
    throw e;
  }

  const { error } = target.id
    ? await supabase.from("goals").update(values).eq("id", target.id)
    : await supabase.from("goals").insert(values);
  if (error) return { error: `Speichern fehlgeschlagen: ${error.message}` };

  refresh();
  return { success: target.id ? "Ziel aktualisiert" : "Ziel angelegt" };
}

export async function setManualValue(goalId: string, value: number) {
  const supabase = await requireUser();
  if (!UUID.test(goalId) || !Number.isFinite(value)) throw new Error("Ungültige Eingabe");
  const { error } = await supabase.from("goals").update({ manual_value: Math.round(value * 100) / 100 }).eq("id", goalId).eq("metric", "manual");
  if (error) throw new Error(error.message);
  refresh();
}

export async function deleteGoal(goalId: string) {
  const supabase = await requireUser();
  if (!UUID.test(goalId)) throw new Error("Ungültige ID");
  const { error } = await supabase.from("goals").delete().eq("id", goalId);
  if (error) throw new Error(error.message);
  refresh();
}

/** Übernimmt die Ziele des vorherigen Zeitraums (ohne manuellen Fortschritt). */
export async function copyGoals(type: string, fromStart: string, toStart: string) {
  const supabase = await requireUser();
  checkPeriod(type, fromStart);
  checkPeriod(type, toStart);

  const [{ data: source }, { data: existing }] = await Promise.all([
    supabase.from("goals").select("*").eq("period_type", type).eq("period_start", fromStart).order("position").order("created_at"),
    supabase.from("goals").select("title, metric").eq("period_type", type).eq("period_start", toStart),
  ]);
  const taken = new Set((existing ?? []).map((g) => `${g.metric}|${g.title}`));
  const rows = (source ?? [])
    .filter((g) => !taken.has(`${g.metric}|${g.title}`))
    .map((g) => ({
      period_type: g.period_type,
      period_start: toStart,
      title: g.title,
      metric: g.metric,
      comparison: g.comparison,
      target: g.target,
      account_id: g.account_id,
      manual_value: null,
      notes: g.notes,
      position: g.position,
    }));
  if (rows.length) {
    const { error } = await supabase.from("goals").insert(rows);
    if (error) throw new Error(error.message);
  }
  refresh();
  return { copied: rows.length };
}

export async function saveReview(target: { type: string; start: string }, _prev: FormState, formData: FormData): Promise<FormState> {
  const supabase = await requireUser();
  checkPeriod(target.type, target.start);

  const ratingRaw = Number(text(formData, "rating"));
  // Kennzahlen serverseitig neu berechnen und als Momentaufnahme speichern
  const [{ data }, { data: accounts }, { data: strategies }] = await Promise.all([
    loadDisciplineData(supabase),
    supabase.from("accounts").select("id, currency"),
    supabase.from("strategies").select("id, name"),
  ]);
  const summary = summarizePeriod(
    data,
    target.type,
    target.start,
    todayBerlin(),
    new Map((accounts ?? []).map((a) => [a.id, a.currency])),
    new Map((strategies ?? []).map((s) => [s.id, s.name])),
  );
  // Die Lektionen stehen bereits in den Tagesplänen
  const stats = Object.fromEntries(Object.entries(summary).filter(([key]) => key !== "lessons"));

  const { error } = await supabase.from("reviews").upsert(
    {
      period_type: target.type,
      period_start: target.start,
      rating: Number.isInteger(ratingRaw) && ratingRaw >= 1 && ratingRaw <= 5 ? ratingRaw : null,
      went_well: clipped(formData, "went_well", 10000),
      to_improve: clipped(formData, "to_improve", 10000),
      lessons: clipped(formData, "lessons", 10000),
      next_focus: clipped(formData, "next_focus", 5000),
      stats: stats as unknown as Json,
    },
    { onConflict: "user_id,period_type,period_start" },
  );
  if (error) return { error: `Speichern fehlgeschlagen: ${error.message}` };

  refresh();
  return { success: "Review gespeichert" };
}

export async function deleteReview(type: string, start: string) {
  const supabase = await requireUser();
  checkPeriod(type, start);
  const { error } = await supabase.from("reviews").delete().eq("period_type", type).eq("period_start", start);
  if (error) throw new Error(error.message);
  refresh();
}
