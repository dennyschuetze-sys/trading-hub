"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { FormError, bool, num, text, type FormState } from "@/lib/form-data";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { findChatByCode, getBotUsername, sendTelegram, telegramConfigured } from "@/lib/telegram";

const LINK_MINUTES = 30;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

async function requireUser() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");
  return { supabase, userId: data.user.id };
}

export async function saveNotificationPrefs(_prev: FormState, formData: FormData): Promise<FormState> {
  const { supabase, userId } = await requireUser();

  let values;
  try {
    const int = (key: string, label: string, min: number, max: number) => {
      const v = num(formData, key);
      if (v == null || !Number.isInteger(v) || v < min || v > max) throw new FormError(`${label}: bitte eine ganze Zahl von ${min} bis ${max}.`);
      return v;
    };
    const time = (key: string, label: string) => {
      const v = text(formData, key);
      if (!v || !TIME.test(v)) throw new FormError(`${label}: bitte eine Uhrzeit wie 08:30 eingeben.`);
      return v;
    };
    values = {
      news_enabled: bool(formData, "news_enabled") ?? false,
      news_minutes: int("news_minutes", "Vorlauf vor News", 1, 240),
      plan_enabled: bool(formData, "plan_enabled") ?? false,
      plan_time: time("plan_time", "Tagesplan-Erinnerung"),
      journal_enabled: bool(formData, "journal_enabled") ?? false,
      journal_time: time("journal_time", "Journal-Erinnerung"),
      weekdays_only: bool(formData, "weekdays_only") ?? false,
      drawdown_enabled: bool(formData, "drawdown_enabled") ?? false,
      drawdown_threshold: int("drawdown_threshold", "Warnschwelle", 50, 100),
    };
  } catch (e) {
    if (e instanceof FormError) return { error: e.message };
    throw e;
  }

  const { error } = await supabase.from("notification_settings").upsert({ user_id: userId, ...values });
  if (error) return { error: `Speichern fehlgeschlagen: ${error.message}` };
  revalidatePath("/settings");
  return { success: "Benachrichtigungen gespeichert" };
}

/** Einmal-Code für den Link t.me/<bot>?start=<code>. */
export async function createLinkCode(): Promise<{ url?: string; error?: string }> {
  const { supabase, userId } = await requireUser();
  if (!telegramConfigured()) return { error: "Der Telegram-Bot ist noch nicht eingerichtet (TELEGRAM_BOT_TOKEN fehlt)." };
  const username = await getBotUsername();
  if (!username) return { error: "Der Bot antwortet nicht. Ist der Token korrekt?" };

  const code = randomBytes(18).toString("base64url").replace(/[-_]/g, "").slice(0, 20);
  const { error } = await supabase.from("notification_settings").upsert({
    user_id: userId,
    link_code: code,
    link_code_expires_at: new Date(Date.now() + LINK_MINUTES * 60_000).toISOString(),
  });
  if (error) return { error: `Code konnte nicht gespeichert werden: ${error.message}` };
  revalidatePath("/settings");
  return { url: `https://t.me/${username}?start=${code}` };
}

/** Prüft, ob der Bot die /start-Nachricht mit dem Code bekommen hat, und speichert den Chat. */
export async function confirmTelegramLink(): Promise<{ ok?: boolean; error?: string }> {
  const { supabase, userId } = await requireUser();
  const admin = createAdminClient();
  if (!admin || !telegramConfigured()) return { error: "Server-Einrichtung unvollständig (SUPABASE_SECRET_KEY oder TELEGRAM_BOT_TOKEN fehlt)." };

  const { data: settings } = await supabase.from("notification_settings").select("link_code, link_code_expires_at").maybeSingle();
  if (!settings?.link_code || !settings.link_code_expires_at || Date.parse(settings.link_code_expires_at) < Date.now()) {
    return { error: "Der Code ist abgelaufen. Bitte erzeuge einen neuen Link." };
  }

  let chatId: number | null;
  try {
    chatId = await findChatByCode(settings.link_code);
  } catch (e) {
    return { error: `Telegram-Abfrage fehlgeschlagen: ${e instanceof Error ? e.message : "unbekannt"}` };
  }
  if (!chatId) return { error: "Noch keine Nachricht gefunden. Öffne den Link, tippe in Telegram auf „Starten“ und prüfe dann erneut." };

  const { error } = await admin
    .from("notification_settings")
    .update({ telegram_chat_id: chatId, telegram_linked_at: new Date().toISOString(), link_code: null, link_code_expires_at: null })
    .eq("user_id", userId);
  if (error) return { error: `Speichern fehlgeschlagen: ${error.message}` };

  try {
    await sendTelegram(chatId, "✅ <b>Trading Hub verbunden</b>\nAb jetzt kommen hier deine Erinnerungen und Warnungen an.");
  } catch (e) {
    console.error("Willkommensnachricht fehlgeschlagen", e);
  }
  revalidatePath("/settings");
  return { ok: true };
}

export async function sendTestMessage(): Promise<{ ok?: boolean; error?: string }> {
  const { supabase } = await requireUser();
  const { data } = await supabase.from("notification_settings").select("telegram_chat_id").maybeSingle();
  if (!data?.telegram_chat_id) return { error: "Telegram ist nicht verbunden." };
  try {
    await sendTelegram(data.telegram_chat_id, "🔔 <b>Test-Nachricht</b>\nWenn du das liest, funktionieren deine Benachrichtigungen.");
    return { ok: true };
  } catch (e) {
    return { error: `Senden fehlgeschlagen: ${e instanceof Error ? e.message : "unbekannt"}` };
  }
}

export async function disconnectTelegram(): Promise<{ ok?: boolean; error?: string }> {
  const { userId } = await requireUser();
  const admin = createAdminClient();
  if (!admin) return { error: "Server-Einrichtung unvollständig (SUPABASE_SECRET_KEY fehlt)." };
  const { error } = await admin
    .from("notification_settings")
    .update({ telegram_chat_id: null, telegram_linked_at: null })
    .eq("user_id", userId);
  if (error) return { error: error.message };
  revalidatePath("/settings");
  return { ok: true };
}
