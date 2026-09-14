"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { FormError, money, num, requiredMoney, requiredText, text, type FormState } from "@/lib/form-data";
import type { TablesInsert } from "@/lib/database.types";

function parseAccount(formData: FormData): TablesInsert<"accounts"> {
  return {
    name: requiredText(formData, "name", "Name"),
    firm: text(formData, "firm"),
    account_type: requiredText(formData, "account_type", "Kontotyp"),
    platform: requiredText(formData, "platform", "Plattform"),
    market: requiredText(formData, "market", "Markt"),
    phase: requiredText(formData, "phase", "Phase"),
    status: requiredText(formData, "status", "Status"),
    currency: requiredText(formData, "currency", "Währung"),
    starting_balance: requiredMoney(formData, "starting_balance", "Startkapital"),
    profit_target: money(formData, "profit_target"),
    max_daily_loss: money(formData, "max_daily_loss"),
    max_drawdown: money(formData, "max_drawdown"),
    drawdown_type: requiredText(formData, "drawdown_type", "Drawdown-Art"),
    min_trading_days: num(formData, "min_trading_days"),
    notes: text(formData, "notes"),
  };
}

async function requireUser() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");
  return supabase;
}

export async function saveAccount(
  accountId: string | null,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const supabase = await requireUser();

  let values: TablesInsert<"accounts">;
  try {
    values = parseAccount(formData);
  } catch (e) {
    if (e instanceof FormError) return { error: e.message };
    throw e;
  }

  const { error } = accountId
    ? await supabase.from("accounts").update(values).eq("id", accountId)
    : await supabase.from("accounts").insert(values);

  if (error) return { error: `Speichern fehlgeschlagen: ${error.message}` };

  revalidatePath("/accounts");
  redirect("/accounts");
}

/** Legt einen Account aus einem Formular an und liefert die ID zurück (z. B. aus dem Import heraus). */
export async function createAccountFromForm(formData: FormData): Promise<{ id?: string; error?: string }> {
  const supabase = await requireUser();
  let values: TablesInsert<"accounts">;
  try {
    values = parseAccount(formData);
  } catch (e) {
    if (e instanceof FormError) return { error: e.message };
    throw e;
  }
  const { data, error } = await supabase.from("accounts").insert(values).select("id").single();
  if (error) return { error: `Speichern fehlgeschlagen: ${error.message}` };
  revalidatePath("/accounts");
  return { id: data.id };
}

export async function deleteAccount(accountId: string) {
  const supabase = await requireUser();

  // Bilddateien vorher einsammeln: die Tabellenzeilen löscht die Datenbank automatisch mit
  const { data: shots } = await supabase
    .from("trade_screenshots")
    .select("storage_path, trades!inner(account_id)")
    .eq("trades.account_id", accountId);
  const paths = (shots ?? []).map((s) => s.storage_path);
  if (paths.length) await supabase.storage.from("screenshots").remove(paths);

  const { error } = await supabase.from("accounts").delete().eq("id", accountId);
  if (error) throw new Error(error.message);
  revalidatePath("/accounts");
  revalidatePath("/journal");
  redirect("/accounts");
}
