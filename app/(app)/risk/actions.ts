"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { FormError, num, type FormState } from "@/lib/form-data";
import { createClient } from "@/lib/supabase/server";

function ranged(formData: FormData, key: string, label: string, min: number, max: number, integer: boolean) {
  const value = num(formData, key);
  if (value == null) return null;
  if (integer && !Number.isInteger(value)) throw new FormError(`${label}: bitte eine ganze Zahl eingeben.`);
  if (value < min || value > max) throw new FormError(`${label}: erlaubt sind Werte von ${min} bis ${max}.`);
  return value;
}

export async function saveRiskRules(_prev: FormState, formData: FormData): Promise<FormState> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");

  let values;
  try {
    values = {
      max_trades_per_day: ranged(formData, "max_trades_per_day", "Max. Trades pro Tag", 1, 100, true),
      max_consecutive_losses: ranged(formData, "max_consecutive_losses", "Max. Verluste in Folge", 1, 50, true),
      daily_loss_limit_pct: ranged(formData, "daily_loss_limit_pct", "Tagesverlust-Limit", 0.01, 100, false),
      max_risk_per_trade_pct: ranged(formData, "max_risk_per_trade_pct", "Max. Risiko pro Trade", 0.01, 100, false),
      default_risk_pct: ranged(formData, "default_risk_pct", "Standard-Risiko", 0.01, 100, false),
      news_block_before_min: ranged(formData, "news_block_before_min", "Sperrzeit vor News", 0, 240, true),
      news_block_after_min: ranged(formData, "news_block_after_min", "Sperrzeit nach News", 0, 240, true),
    };
    if (values.default_risk_pct != null && values.max_risk_per_trade_pct != null && values.default_risk_pct > values.max_risk_per_trade_pct) {
      throw new FormError("Das Standard-Risiko darf nicht über deinem maximalen Risiko pro Trade liegen.");
    }
  } catch (e) {
    if (e instanceof FormError) return { error: e.message };
    throw e;
  }

  const { error } = await supabase.from("user_settings").upsert({ user_id: data.user.id, ...values });
  if (error) return { error: `Speichern fehlgeschlagen: ${error.message}` };

  for (const path of ["/risk", "/dashboard", "/journal", "/stats"]) revalidatePath(path);
  return { success: "Regeln gespeichert" };
}
