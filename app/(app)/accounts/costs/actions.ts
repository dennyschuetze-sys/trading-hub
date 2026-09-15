"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { COST_KINDS } from "@/lib/costs";
import { FormError, money, text, type FormState } from "@/lib/form-data";
import { createClient } from "@/lib/supabase/server";

async function requireUser() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");
  return supabase;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function saveCostEntry(_prev: FormState, formData: FormData): Promise<FormState> {
  const supabase = await requireUser();

  try {
    const type = text(formData, "type") === "payout" ? "payout" : "cost";
    const accountId = text(formData, "account_id");
    const amount = money(formData, "amount");
    if (amount == null || amount <= 0) throw new FormError("Bitte einen Betrag größer 0 eingeben.");
    const date = text(formData, "date");
    if (!date || !DATE.test(date)) throw new FormError("Bitte ein Datum wählen.");
    const note = text(formData, "note")?.slice(0, 500) ?? null;

    // Firma und Währung kommen vom Account, falls einer gewählt ist
    let firm = text(formData, "firm")?.slice(0, 100) ?? null;
    let currency = text(formData, "currency")?.toUpperCase() ?? "USD";
    if (accountId) {
      const { data: account } = await supabase.from("accounts").select("firm, name, currency").eq("id", accountId).maybeSingle();
      if (!account) throw new FormError("Account nicht gefunden.");
      firm = firm ?? account.firm ?? account.name;
      if (!text(formData, "currency")) currency = account.currency;
    }
    if (!firm) throw new FormError("Bitte eine Prop Firm angeben oder einen Account wählen.");
    if (!/^[A-Z]{3}$/.test(currency)) throw new FormError("Ungültige Währung.");

    if (type === "payout") {
      const { error } = await supabase.from("payouts").insert({ account_id: accountId, firm, amount, currency, paid_on: date, note });
      if (error) return { error: `Speichern fehlgeschlagen: ${error.message}` };
    } else {
      const kind = text(formData, "kind");
      if (!kind || !COST_KINDS.some((k) => k.value === kind)) throw new FormError("Bitte die Art der Kosten wählen.");
      const { error } = await supabase
        .from("account_costs")
        .insert({ account_id: accountId, firm, kind, amount, currency, incurred_on: date, note });
      if (error) return { error: `Speichern fehlgeschlagen: ${error.message}` };
    }

    revalidatePath("/accounts", "layout");
    return { success: type === "payout" ? "Auszahlung gespeichert" : "Kosten gespeichert" };
  } catch (e) {
    if (e instanceof FormError) return { error: e.message };
    throw e;
  }
}

export async function deleteCostEntry(type: "cost" | "payout", id: string) {
  const supabase = await requireUser();
  const { error } = await supabase.from(type === "payout" ? "payouts" : "account_costs").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/accounts", "layout");
}
