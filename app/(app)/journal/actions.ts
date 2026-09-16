"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  FormError,
  bool,
  list,
  money,
  num,
  requiredNum,
  requiredText,
  text,
  type FormState,
} from "@/lib/form-data";
import { estimateRisk } from "@/lib/r-multiple";
import { HTF_BIASES, MARKET_CONTEXTS, TIMEFRAMES, guessSession } from "@/lib/trading";
import type { TablesInsert } from "@/lib/database.types";

function parseTrade(formData: FormData): TablesInsert<"trades"> {
  const entryTime = requiredText(formData, "entry_time", "Einstiegszeit");
  const exitTime = text(formData, "exit_time");
  const status = requiredText(formData, "status", "Status");
  const quantity = requiredNum(formData, "quantity", "Menge");
  const rating = num(formData, "rating");

  if (quantity <= 0) throw new FormError("Die Menge muss größer als 0 sein.");
  if (exitTime && exitTime < entryTime) throw new FormError("Der Ausstieg liegt vor dem Einstieg.");

  const enteredRisk = money(formData, "risk_amount");
  if (enteredRisk != null && enteredRisk <= 0) throw new FormError("Das Risiko muss größer als 0 sein.");
  const direction = requiredText(formData, "direction", "Richtung");
  const prices = {
    entry_price: num(formData, "entry_price"),
    exit_price: status === "closed" ? num(formData, "exit_price") : null,
    stop_loss: num(formData, "stop_loss"),
    pnl: money(formData, "pnl"),
  };
  // Ohne Eingabe aus SL und Ergebnis berechnen, damit das R-Multiple nicht fehlt
  const riskAmount = enteredRisk ?? estimateRisk({ direction, ...prices });

  // Bester/schlechtester Kurs während des Trades – müssen zur Richtung passen
  const bestPrice = num(formData, "best_price");
  const worstPrice = num(formData, "worst_price");
  const entry = prices.entry_price;
  if (entry != null) {
    const favorable = (p: number) => (direction === "long" ? p - entry : entry - p);
    if (bestPrice != null && favorable(bestPrice) < 0)
      throw new FormError(`Der beste Kurs muss bei ${direction === "long" ? "Long über" : "Short unter"} dem Einstieg liegen.`);
    if (worstPrice != null && favorable(worstPrice) > 0)
      throw new FormError(`Der schlechteste Kurs muss bei ${direction === "long" ? "Long unter" : "Short über"} dem Einstieg liegen.`);
  }
  const oneOf = (key: string, values: string[]) => {
    const value = text(formData, key);
    return value != null && values.includes(value) ? value : null;
  };

  const tags = (text(formData, "tags") ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

  const strategyId = text(formData, "strategy_id");

  // Backtest-Trades gehören zu einer Session statt zu einem Account
  const backtestSessionId = text(formData, "backtest_session_id");

  return {
    account_id: backtestSessionId ? null : requiredText(formData, "account_id", "Account"),
    backtest_session_id: backtestSessionId,
    is_backtest: backtestSessionId != null,
    symbol: requiredText(formData, "symbol", "Symbol").toUpperCase(),
    direction,
    status,
    entry_time: entryTime,
    exit_time: status === "closed" ? exitTime : null,
    ...prices,
    quantity,
    take_profit: num(formData, "take_profit"),
    best_price: bestPrice,
    worst_price: worstPrice,
    moved_to_breakeven: bool(formData, "moved_to_breakeven"),
    partial_close: bool(formData, "partial_close"),
    entry_timeframe: oneOf("entry_timeframe", TIMEFRAMES),
    htf_bias: oneOf("htf_bias", HTF_BIASES.map((o) => o.value)),
    market_context: oneOf("market_context", MARKET_CONTEXTS.map((o) => o.value)),
    commission: money(formData, "commission") ?? 0,
    swap: money(formData, "swap") ?? 0,
    risk_amount: riskAmount,
    session: text(formData, "session") ?? guessSession(entryTime),
    setup_quality: text(formData, "setup_quality"),
    emotion: text(formData, "emotion"),
    mistakes: list(formData, "mistakes"),
    tags,
    followed_plan: bool(formData, "followed_plan"),
    rating: rating == null ? null : Math.round(rating),
    notes: text(formData, "notes"),
    lessons: text(formData, "lessons"),
    strategy_id: strategyId,
    entry_criterion: strategyId ? (text(formData, "entry_criterion")?.slice(0, 100) ?? null) : null,
  };
}

/**
 * Speichert die Checklisten-Häkchen eines Trades für die gewählte Strategie.
 * `checklist_item` = alle angezeigten Punkte, `checklist_checked` = die abgehakten.
 */
async function syncChecklist(supabase: Awaited<ReturnType<typeof createClient>>, tradeId: string, formData: FormData) {
  const shown = list(formData, "checklist_item");
  const checked = new Set(list(formData, "checklist_checked"));

  // Häkchen anderer (vorher gewählter) Strategien entfernen
  let cleanup = supabase.from("trade_checklist_results").delete().eq("trade_id", tradeId);
  if (shown.length) cleanup = cleanup.not("item_id", "in", `(${shown.join(",")})`);
  const { error: cleanupError } = await cleanup;
  if (cleanupError) throw new Error(`Checkliste konnte nicht gespeichert werden: ${cleanupError.message}`);

  if (shown.length) {
    const { error } = await supabase
      .from("trade_checklist_results")
      .upsert(shown.map((item_id) => ({ trade_id: tradeId, item_id, checked: checked.has(item_id) })));
    if (error) throw new Error(`Checkliste konnte nicht gespeichert werden: ${error.message}`);
  }
}

const UUID = /^[0-9a-f-]{36}$/i;

async function requireUser() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");
  return supabase;
}

export async function saveTrade(
  tradeId: string | null,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const supabase = await requireUser();

  let values: TablesInsert<"trades">;
  try {
    values = parseTrade(formData);
  } catch (e) {
    if (e instanceof FormError) return { error: e.message };
    throw e;
  }

  const query = tradeId
    ? supabase.from("trades").update(values).eq("id", tradeId).select("id").single()
    : supabase.from("trades").insert(values).select("id").single();
  const { data, error } = await query;

  if (error) return { error: `Speichern fehlgeschlagen: ${error.message}` };

  if (list(formData, "checklist_item").some((id) => !UUID.test(id))) return { error: "Ungültige Checkliste." };
  try {
    await syncChecklist(supabase, data.id, formData);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Checkliste konnte nicht gespeichert werden." };
  }

  revalidatePath("/journal");
  revalidatePath("/accounts");
  revalidatePath("/strategies");
  revalidatePath("/backtesting", "layout");
  // Vorgemerkte Screenshots lädt das Formular hoch und leitet danach selbst weiter
  if (formData.get("after_save") === "upload") return { success: "Trade gespeichert", id: data.id };
  redirect(`/journal/${data.id}`);
}

/** Mehrere Trades auf einmal bearbeiten (z. B. importierten Trades eine Strategie zuweisen). */
export async function bulkUpdateTrades(input: {
  tradeIds: string[];
  strategyId?: string | null;
  setupQuality?: string | null;
}): Promise<{ updated: number }> {
  const supabase = await requireUser();
  const ids = input.tradeIds.filter((id) => UUID.test(id)).slice(0, 1000);
  if (!ids.length) return { updated: 0 };

  const values: { strategy_id?: string | null; setup_quality?: string | null } = {};
  if (input.strategyId !== undefined) {
    if (input.strategyId !== null && !UUID.test(input.strategyId)) throw new Error("Ungültige Strategie");
    values.strategy_id = input.strategyId;
  }
  if (input.setupQuality !== undefined) {
    if (input.setupQuality !== null && !["A+", "A", "B", "C"].includes(input.setupQuality)) throw new Error("Ungültige Setup-Qualität");
    values.setup_quality = input.setupQuality;
  }
  if (!Object.keys(values).length) return { updated: 0 };

  // Trades, deren Strategie sich wirklich ändert – nur dort passen alte Checklisten-Häkchen nicht mehr
  let changed: string[] = [];
  if (values.strategy_id !== undefined) {
    const { data: before } = await supabase.from("trades").select("id, strategy_id").in("id", ids);
    changed = (before ?? []).filter((t) => t.strategy_id !== values.strategy_id).map((t) => t.id);
  }

  const { data, error } = await supabase.from("trades").update(values).in("id", ids).select("id");
  if (error) throw new Error(error.message);

  if (changed.length) await supabase.from("trade_checklist_results").delete().in("trade_id", changed);

  revalidatePath("/journal");
  revalidatePath("/strategies");
  revalidatePath("/stats");
  return { updated: data.length };
}

export async function deleteTrade(tradeId: string) {
  const supabase = await requireUser();

  const { data: shots } = await supabase
    .from("trade_screenshots")
    .select("storage_path")
    .eq("trade_id", tradeId);
  const paths = (shots ?? []).map((s) => s.storage_path);
  if (paths.length) await supabase.storage.from("screenshots").remove(paths);

  const { data: trade, error } = await supabase
    .from("trades")
    .delete()
    .eq("id", tradeId)
    .select("backtest_session_id")
    .maybeSingle();
  if (error) throw new Error(error.message);

  revalidatePath("/journal");
  revalidatePath("/accounts");
  if (trade?.backtest_session_id) {
    revalidatePath("/backtesting", "layout");
    redirect(`/backtesting/${trade.backtest_session_id}`);
  }
  redirect("/journal");
}

export async function deleteScreenshot(screenshotId: string, tradeId: string) {
  const supabase = await requireUser();
  const { data: shot } = await supabase
    .from("trade_screenshots")
    .select("storage_path")
    .eq("id", screenshotId)
    .maybeSingle();
  if (!shot) return;

  await supabase.storage.from("screenshots").remove([shot.storage_path]);
  const { error } = await supabase.from("trade_screenshots").delete().eq("id", screenshotId);
  if (error) throw new Error(error.message);

  revalidatePath(`/journal/${tradeId}`);
}
