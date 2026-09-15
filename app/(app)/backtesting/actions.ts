"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { FormError, money, requiredText, text, type FormState } from "@/lib/form-data";
import { BACKTEST_STATUSES } from "@/lib/backtests";
import { splitList } from "@/lib/strategies";
import { CURRENCIES, MARKETS } from "@/lib/trading";
import type { TablesInsert } from "@/lib/database.types";

async function requireUser() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");
  return supabase;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function parseSession(formData: FormData): TablesInsert<"backtest_sessions"> {
  const name = requiredText(formData, "name", "Name").slice(0, 100);
  const periodFrom = text(formData, "period_from");
  const periodTo = text(formData, "period_to");
  if ((periodFrom && !DATE.test(periodFrom)) || (periodTo && !DATE.test(periodTo))) {
    throw new FormError("Ungültiges Datum.");
  }
  if (periodFrom && periodTo && periodTo < periodFrom) throw new FormError("Das Enddatum liegt vor dem Startdatum.");

  const startingBalance = money(formData, "starting_balance");
  if (startingBalance != null && startingBalance < 0) throw new FormError("Das Startkapital darf nicht negativ sein.");

  const pick = (key: string, allowed: string[], fallback: string) => {
    const value = text(formData, key);
    return value && allowed.includes(value) ? value : fallback;
  };

  return {
    name,
    strategy_id: text(formData, "strategy_id"),
    symbols: splitList(text(formData, "symbols")).map((s) => s.toUpperCase()),
    timeframe: text(formData, "timeframe")?.slice(0, 20) ?? null,
    period_from: periodFrom,
    period_to: periodTo,
    market: pick("market", MARKETS.map((m) => m.value), "forex_cfd"),
    currency: pick("currency", CURRENCIES, "USD"),
    starting_balance: startingBalance,
    status: pick("status", BACKTEST_STATUSES.map((s) => s.value), "running"),
    notes: text(formData, "notes")?.slice(0, 20000) ?? null,
  };
}

export async function saveBacktestSession(sessionId: string | null, _prev: FormState, formData: FormData): Promise<FormState> {
  const supabase = await requireUser();

  let values: TablesInsert<"backtest_sessions">;
  try {
    values = parseSession(formData);
  } catch (e) {
    if (e instanceof FormError) return { error: e.message };
    throw e;
  }

  const query = sessionId
    ? supabase.from("backtest_sessions").update(values).eq("id", sessionId).select("id").single()
    : supabase.from("backtest_sessions").insert(values).select("id").single();
  const { data, error } = await query;
  if (error) return { error: `Speichern fehlgeschlagen: ${error.message}` };

  revalidatePath("/backtesting", "layout");
  revalidatePath("/strategies", "layout");
  redirect(`/backtesting/${data.id}`);
}

export async function deleteBacktestSession(sessionId: string) {
  const supabase = await requireUser();

  // Die Trades verschwinden per Cascade, ihre Bilder im Storage aber nicht
  const { data: shots, error: shotsError } = await supabase
    .from("trade_screenshots")
    .select("storage_path, trades!inner(backtest_session_id)")
    .eq("trades.backtest_session_id", sessionId);
  if (shotsError) throw new Error(shotsError.message);
  const paths = (shots ?? []).map((s) => s.storage_path);
  if (paths.length) await supabase.storage.from("screenshots").remove(paths);

  const { error } = await supabase.from("backtest_sessions").delete().eq("id", sessionId);
  if (error) throw new Error(error.message);

  revalidatePath("/backtesting", "layout");
  revalidatePath("/strategies", "layout");
  redirect("/backtesting");
}
