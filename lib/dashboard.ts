import type { CalendarEvent } from "@/lib/calendar";
import { worst, type AccountRules, type RuleStatus } from "@/lib/prop-rules";
import type { NewsLock, TodayRisk } from "@/lib/risk-rules";
import { closedTrades, summarize, type CoreTrade } from "@/lib/stats";
import { TIME_ZONE, formatMoney } from "@/lib/trading";

// Ableitungen für das Dashboard – nur aus vorhandenen Daten, nichts wird geschätzt.

const clock = (iso: string) =>
  new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit", timeZone: TIME_ZONE }).format(new Date(iso));

export type Streak = { kind: "win" | "loss"; count: number } | null;

/** Laufende Gewinn- oder Verlustserie am Ende der geschlossenen Trades (Breakeven beendet die Serie). */
export function currentStreak(trades: CoreTrade[]): Streak {
  const closed = closedTrades(trades);
  const last = closed.at(-1);
  if (!last || last.net_pnl === 0) return null;
  const kind = last.net_pnl! > 0 ? "win" : "loss";
  let count = 0;
  for (let i = closed.length - 1; i >= 0; i--) {
    const pnl = closed[i].net_pnl!;
    if (kind === "win" ? pnl > 0 : pnl < 0) count += 1;
    else break;
  }
  return { kind, count };
}

/** Kurzfristige Form: die letzten `size` geschlossenen Trades. */
export function recentForm(trades: CoreTrade[], size = 10) {
  const last = closedTrades(trades).slice(-size);
  return {
    results: last.map((t) => ({ id: t.id, pnl: t.net_pnl! })),
    summary: summarize(last),
  };
}

export type StatusRow = { name: string; currency: string; today: TodayRisk; prop: AccountRules };

/**
 * Gesamtstatus eines Accounts für heute: persönliche Tagesregeln, kritische Prop-Limits und News-Sperre.
 * Prop-Limits zählen wie in „Risiko heute“ erst, wenn sie kritisch werden.
 */
export function tradingStatus(row: StatusRow | null, lock: NewsLock): RuleStatus {
  const statuses: RuleStatus[] = [];
  if (row) {
    const { today, prop } = row;
    for (const check of [today.trades, today.lossStreak, today.dailyLoss]) if (check) statuses.push(check.status);
    for (const limit of [prop.dailyLoss, prop.drawdown]) {
      if (limit && (limit.status === "danger" || limit.status === "breached")) statuses.push(limit.status);
    }
  }
  if (lock) statuses.push(lock.state === "active" ? "danger" : "warning");
  return statuses.reduce<RuleStatus>(worst, "ok");
}

export type Attention = {
  tone: "ok" | "info" | "warning" | "danger";
  title: string;
  detail?: string;
  href?: string;
};

const pct = (ratio: number) => `${Math.round(ratio * 100)} %`;
const toneOf = (status: RuleStatus): Attention["tone"] => (status === "ok" ? "ok" : status === "warning" ? "warning" : "danger");
const TONE_ORDER: Attention["tone"][] = ["danger", "warning", "info", "ok"];

/** Hinweise für heute – ausschließlich aus tatsächlichen Zuständen, Wichtigstes zuerst. */
export function attentionItems(input: {
  now: Date;
  isWorkday: boolean;
  planExists: boolean;
  /** nächster High-Impact-Termin der eigenen Währungen heute, der noch bevorsteht */
  nextHighImpact: CalendarEvent | null;
  lock: NewsLock;
  focus: StatusRow | null;
  /** weitere aktive Accounts mit ihrem Status */
  others: { name: string; status: RuleStatus }[];
  streak: Streak;
  rulesConfigured: boolean;
}): Attention[] {
  const items: Attention[] = [];
  const { focus, lock, now } = input;

  if (lock?.state === "active") {
    items.push({ tone: "danger", title: `News-Sperre bis ${clock(lock.until)} Uhr`, detail: `${lock.event.currency} · ${lock.event.title}` });
  } else if (lock?.state === "soon") {
    items.push({ tone: "warning", title: `News-Sperre ab ${clock(lock.startsAt)} Uhr`, detail: `${lock.event.currency} · ${lock.event.title}` });
  } else if (input.nextHighImpact) {
    const e = input.nextHighImpact;
    const minutes = Math.round((Date.parse(e.time) - now.getTime()) / 60000);
    items.push(
      minutes <= 60
        ? { tone: "warning", title: `High-Impact-News in ${Math.max(1, minutes)} Min.`, detail: `${e.currency} · ${e.title} · ${clock(e.time)} Uhr` }
        : { tone: "info", title: `High-Impact-News heute ${clock(e.time)} Uhr`, detail: `${e.currency} · ${e.title}` },
    );
  }

  if (focus) {
    const { today, prop } = focus;
    const money = (v: number) => formatMoney(v, focus.currency);
    if (today.trades && today.trades.status !== "ok") {
      const { count, max, status } = today.trades;
      items.push(
        status === "warning"
          ? { tone: "warning", title: `Noch ${max - count} Trade bis zum Tageslimit` }
          : { tone: "danger", title: `Trade-Limit erreicht (${count}/${max})`, detail: "Keine weiteren Trades heute" },
      );
    }
    if (today.lossStreak && today.lossStreak.status !== "ok") {
      const { count, max, status } = today.lossStreak;
      items.push({ tone: toneOf(status), title: `${count}/${max} Verluste in Folge heute`, detail: status === "warning" ? undefined : "Pause bis morgen" });
    } else if (input.streak?.kind === "loss" && input.streak.count >= 2) {
      items.push({ tone: "warning", title: `${input.streak.count} Verlusttrades in Folge`, detail: "Letzte geschlossene Trades" });
    }
    if (today.dailyLoss && today.dailyLoss.ratio >= 0.5) {
      const d = today.dailyLoss;
      items.push({ tone: toneOf(d.status), title: `Tagesverlust-Limit zu ${pct(d.ratio)} erreicht`, detail: `noch ${money(Math.max(0, d.remaining))} von ${money(d.limit)}` });
    }
    if (prop.dailyLoss && prop.dailyLoss.ratio >= 0.5) {
      const d = prop.dailyLoss;
      items.push({ tone: toneOf(d.status), title: `Prop-Tageslimit zu ${pct(d.ratio)} erreicht`, detail: `noch ${money(Math.max(0, d.remaining))}` });
    }
    if (prop.drawdown && prop.drawdown.ratio >= 0.5) {
      const d = prop.drawdown;
      items.push({ tone: toneOf(d.status), title: `Max. Drawdown zu ${pct(d.ratio)} erreicht`, detail: `Grenze bei ${money(d.floor)}` });
    }
  }

  for (const other of input.others) {
    if (other.status !== "ok") items.push({ tone: toneOf(other.status), title: `${other.name}: Limits prüfen`, href: "/risk" });
  }

  if (!input.planExists && input.isWorkday) {
    items.push({ tone: "info", title: "Tagesplan noch nicht erstellt", detail: "Fokus, Bias und Limits vor der Session festlegen", href: "/plan" });
  }

  const hasLimits = Boolean(
    focus && (focus.today.trades || focus.today.lossStreak || focus.today.dailyLoss || focus.prop.dailyLoss || focus.prop.drawdown),
  );
  if (hasLimits && !items.some((i) => i.tone === "warning" || i.tone === "danger")) {
    items.push({ tone: "ok", title: "Alle Limits im Rahmen", detail: "Nach den geschlossenen Trades von heute" });
  }
  if (!input.rulesConfigured) {
    items.push({ tone: "info", title: "Noch keine persönlichen Regeln", detail: "z. B. max. Trades pro Tag oder Pause nach Verlustserie", href: "/risk" });
  }

  return items.sort((a, b) => TONE_ORDER.indexOf(a.tone) - TONE_ORDER.indexOf(b.tone));
}
