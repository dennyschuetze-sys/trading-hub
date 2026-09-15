import type { CalendarEvent } from "@/lib/calendar";
import type { Tables } from "@/lib/database.types";
import type { AccountRules } from "@/lib/prop-rules";
import { TIME_ZONE, formatMoney } from "@/lib/trading";

export type NotificationSettings = Tables<"notification_settings">;
export type NotificationKind = "news" | "plan" | "journal" | "drawdown";

export type NotificationPrefs = Pick<
  NotificationSettings,
  | "news_enabled"
  | "news_minutes"
  | "plan_enabled"
  | "plan_time"
  | "journal_enabled"
  | "journal_time"
  | "weekdays_only"
  | "drawdown_enabled"
  | "drawdown_threshold"
>;

export const DEFAULT_PREFS: NotificationPrefs = {
  news_enabled: true,
  news_minutes: 15,
  plan_enabled: true,
  plan_time: "08:30",
  journal_enabled: true,
  journal_time: "22:00",
  weekdays_only: true,
  drawdown_enabled: true,
  drawdown_threshold: 80,
};

export type PlannerInput = {
  prefs: NotificationPrefs;
  now: Date;
  events: CalendarEvent[];
  /** Währungen aus dem Kalenderfilter (leer = alle) */
  currencies: string[];
  plan: { exists: boolean; reviewed: boolean };
  tradesToday: number;
  accounts: { id: string; name: string; currency: string; rules: AccountRules }[];
};

export type PlannedMessage = { kind: NotificationKind; ref: string; text: string };

/** Erinnerungen werden höchstens so lange nach der eingestellten Uhrzeit noch verschickt. */
export const REMINDER_WINDOW_MIN = 60;

const clockFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  weekday: "short",
});

/** Datum, Wochentag (1 = Montag) und Minuten seit Mitternacht in Berliner Zeit. */
export function berlinClock(now: Date) {
  const p = Object.fromEntries(clockFormatter.formatToParts(now).map((x) => [x.type, x.value]));
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    weekday: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(p.weekday) + 1,
    minutes: Number(p.hour) * 60 + Number(p.minute),
  };
}

/** „08:30“ oder „08:30:00“ → Minuten seit Mitternacht */
export function timeToMinutes(value: string): number {
  const [h, m] = value.split(":").map(Number);
  return h * 60 + (m || 0);
}

export const escapeHtml = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const clock = (iso: string) =>
  new Intl.DateTimeFormat("de-DE", { timeZone: TIME_ZONE, hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

const pct = (ratio: number) => `${Math.round(ratio * 100)} %`;

/** Welche Nachrichten jetzt fällig sind. Doppelte verhindert der Aufrufer über `kind` + `ref`. */
export function planNotifications(input: PlannerInput): PlannedMessage[] {
  const { prefs, now } = input;
  const today = berlinClock(now);
  const messages: PlannedMessage[] = [];
  const isWorkday = today.weekday <= 5;
  const due = (time: string) => {
    const target = timeToMinutes(time);
    return today.minutes >= target && today.minutes < target + REMINDER_WINDOW_MIN;
  };

  // High-Impact-News: alle Termine eines Zeitpunkts in einer Nachricht
  if (prefs.news_enabled) {
    const wanted = new Set(input.currencies.map((c) => c.toUpperCase()));
    const soon = input.events.filter((e) => {
      const diff = Date.parse(e.time) - now.getTime();
      return (
        e.impact === "high" &&
        (wanted.size === 0 || wanted.has(e.currency) || e.currency === "ALL") &&
        diff > 0 &&
        diff <= prefs.news_minutes * 60_000
      );
    });
    const byTime = new Map<string, CalendarEvent[]>();
    soon.forEach((e) => byTime.set(e.time, [...(byTime.get(e.time) ?? []), e]));
    for (const [time, events] of [...byTime].sort((a, b) => a[0].localeCompare(b[0]))) {
      const minutes = Math.max(1, Math.round((Date.parse(time) - now.getTime()) / 60_000));
      messages.push({
        kind: "news",
        ref: time,
        text: [
          `⚠️ <b>High-Impact-News in ${minutes} Min.</b> (${clock(time)} Uhr)`,
          ...events.map((e) => `• ${escapeHtml(e.currency)} – ${escapeHtml(e.title)}`),
        ].join("\n"),
      });
    }
  }

  const workdayOk = !prefs.weekdays_only || isWorkday;

  if (prefs.plan_enabled && workdayOk && !input.plan.exists && due(prefs.plan_time)) {
    messages.push({
      kind: "plan",
      ref: today.date,
      text: "📝 <b>Tagesplan</b>\nFür heute gibt es noch keinen Plan. Bias, Key-Levels und News kurz festhalten, bevor die Session startet.",
    });
  }

  if (prefs.journal_enabled && workdayOk && !input.plan.reviewed && (input.tradesToday > 0 || input.plan.exists) && due(prefs.journal_time)) {
    messages.push({
      kind: "journal",
      ref: today.date,
      text:
        input.tradesToday > 0
          ? `📓 <b>Journal & Review</b>\nHeute ${input.tradesToday === 1 ? "1 Trade" : `${input.tradesToday} Trades`} – Notizen, Screenshots und das Session-Review fehlen noch.`
          : "📓 <b>Session-Review</b>\nDein Tagesplan wartet noch auf das Review nach der Session.",
    });
  }

  if (prefs.drawdown_enabled) {
    const threshold = prefs.drawdown_threshold / 100;
    for (const a of input.accounts) {
      const money = (v: number) => formatMoney(v, a.currency);
      const name = escapeHtml(a.name);
      const daily = a.rules.dailyLoss;
      if (daily && daily.ratio >= threshold) {
        messages.push({
          kind: "drawdown",
          ref: `${today.date}:${a.id}:daily`,
          text:
            daily.ratio >= 1
              ? `🛑 <b>${name}: Tagesverlust-Limit erreicht</b>\n${money(daily.used)} von ${money(daily.limit)}. Heute nicht mehr traden.`
              : `🟠 <b>${name}: ${pct(daily.ratio)} vom Tagesverlust-Limit</b>\nNoch ${money(daily.remaining)} Spielraum bis ${money(daily.limit)}.`,
        });
      }
      const dd = a.rules.drawdown;
      if (dd && dd.ratio >= threshold) {
        messages.push({
          kind: "drawdown",
          ref: `${today.date}:${a.id}:dd`,
          text:
            dd.ratio >= 1
              ? `🛑 <b>${name}: Max. Drawdown erreicht</b>\nKontostand-Grenze ${money(dd.floor)} unterschritten.`
              : `🟠 <b>${name}: ${pct(dd.ratio)} vom Max. Drawdown</b>\nNoch ${money(dd.remaining)} bis zur Grenze bei ${money(dd.floor)}.`,
        });
      }
    }
  }

  return messages;
}
