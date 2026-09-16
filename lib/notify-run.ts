import "server-only";
import { DEFAULT_SETTINGS, getCalendar } from "@/lib/feeds";
import { berlinClock, planNotifications, type NotificationSettings, type PlannedMessage } from "@/lib/notifications";
import { evaluateAccount } from "@/lib/prop-rules";
import { fetchStatTrades } from "@/lib/queries";
import type { AdminClient } from "@/lib/supabase/admin";
import { sendTelegram } from "@/lib/telegram";
import { dayBoundary } from "@/lib/trading";

export type RunResult = {
  users: number;
  sent: number;
  skipped: number;
  errors: string[];
  planned?: { user: string; messages: PlannedMessage[] }[];
};

/** Plant die fälligen Nachrichten eines Benutzers. Alle Abfragen filtern selbst nach user_id (Secret Key). */
async function planForUser(admin: AdminClient, settings: NotificationSettings, now: Date, events: Awaited<ReturnType<typeof getCalendar>>["events"]) {
  const userId = settings.user_id;
  const today = berlinClock(now).date;

  const [{ data: userSettings }, { data: plan }, { data: accounts }, { count: tradesToday }] = await Promise.all([
    admin.from("user_settings").select("calendar_currencies").eq("user_id", userId).maybeSingle(),
    admin.from("daily_plans").select("reviewed_at").eq("user_id", userId).eq("plan_date", today).maybeSingle(),
    settings.drawdown_enabled
      ? admin
          .from("accounts")
          .select("id, name, currency, starting_balance, max_daily_loss, max_drawdown, drawdown_type, profit_target, min_trading_days")
          .eq("user_id", userId)
          .eq("status", "active")
      : Promise.resolve({ data: [] }),
    admin
      .from("trades")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("is_backtest", false)
      .gte("entry_time", dayBoundary(today, "start"))
      .lte("entry_time", dayBoundary(today, "end")),
  ]);

  const list = accounts ?? [];
  const trades = list.length ? await fetchStatTrades(admin, list.map((a) => a.id)) : [];

  return planNotifications({
    prefs: settings,
    now,
    events,
    currencies: userSettings?.calendar_currencies ?? DEFAULT_SETTINGS.calendarCurrencies,
    plan: { exists: Boolean(plan), reviewed: Boolean(plan?.reviewed_at) },
    tradesToday: tradesToday ?? 0,
    accounts: list.map((a) => ({
      id: a.id,
      name: a.name,
      currency: a.currency,
      rules: evaluateAccount(a, trades.filter((t) => t.account_id === a.id), now),
    })),
  });
}

/**
 * Ein Durchlauf des Benachrichtigungs-Jobs (alle 5 Minuten per Supabase Cron).
 * Das Versandprotokoll verhindert doppelte Nachrichten, auch wenn Läufe sich überschneiden.
 */
export async function runNotifications(admin: AdminClient, { dryRun = false, now = new Date() } = {}): Promise<RunResult> {
  const result: RunResult = { users: 0, sent: 0, skipped: 0, errors: [], ...(dryRun ? { planned: [] } : {}) };

  const { data: settings, error } = await admin.from("notification_settings").select("*").not("telegram_chat_id", "is", null);
  if (error) throw new Error(error.message);
  if (!settings.length) return result;
  result.users = settings.length;

  // Termine brauchen die News-Vorwarnung und die Tagesübersicht in der Plan-Erinnerung
  const needsCalendar = settings.some((s) => s.news_enabled || s.plan_enabled);
  const { events } = needsCalendar ? await getCalendar() : { events: [] };

  for (const s of settings) {
    try {
      const messages = await planForUser(admin, s, now, events);
      if (dryRun) {
        result.planned!.push({ user: s.user_id, messages });
        continue;
      }
      for (const m of messages) {
        // Erst eintragen, dann senden: ein zweiter Lauf findet den Eintrag und überspringt
        const { data: claimed, error: logError } = await admin
          .from("notification_log")
          .upsert({ user_id: s.user_id, kind: m.kind, ref: m.ref }, { onConflict: "user_id,kind,ref", ignoreDuplicates: true })
          .select("ref");
        if (logError) throw new Error(logError.message);
        if (!claimed?.length) {
          result.skipped += 1;
          continue;
        }
        try {
          await sendTelegram(s.telegram_chat_id!, m.text);
          result.sent += 1;
        } catch (e) {
          await admin.from("notification_log").delete().match({ user_id: s.user_id, kind: m.kind, ref: m.ref });
          throw e;
        }
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.error(`Benachrichtigungen für ${s.user_id} fehlgeschlagen`, message);
      result.errors.push(message);
    }
  }

  if (!dryRun) {
    const cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
    await admin.from("notification_log").delete().lt("sent_at", cutoff);
  }
  return result;
}
