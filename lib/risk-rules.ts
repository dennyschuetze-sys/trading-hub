import { currenciesForSymbol } from "@/lib/calendar";
import { meter, type RuleMeter, type RuleStatus } from "@/lib/prop-rules";
import { berlinParts, breakdown, closeTime, type BreakdownRow, type StatTrade } from "@/lib/stats";
import { formatMoney } from "@/lib/trading";

/** Persönliche Regeln (leer = Regel aus). Prozentwerte beziehen sich auf das Startkapital des Accounts. */
export type RiskRules = {
  maxTradesPerDay: number | null;
  maxConsecutiveLosses: number | null;
  dailyLossLimitPct: number | null;
  maxRiskPerTradePct: number | null;
  defaultRiskPct: number | null;
  newsBlockBeforeMin: number | null;
  newsBlockAfterMin: number | null;
};

export const NO_RULES: RiskRules = {
  maxTradesPerDay: null,
  maxConsecutiveLosses: null,
  dailyLossLimitPct: null,
  maxRiskPerTradePct: null,
  defaultRiskPct: null,
  newsBlockBeforeMin: null,
  newsBlockAfterMin: null,
};

/** Kleine Toleranz, weil Lotgrößen gerundet werden (1 % Risiko wird selten exakt getroffen). */
export const RISK_TOLERANCE = 0.05;

export type ViolationKind = "max_trades" | "loss_streak" | "daily_loss" | "risk_per_trade" | "news_block";

export const VIOLATION_LABELS: Record<ViolationKind, string> = {
  max_trades: "Zu viele Trades am Tag",
  loss_streak: "Nach Verlustserie weitergehandelt",
  daily_loss: "Nach Tageslimit weitergehandelt",
  risk_per_trade: "Risiko pro Trade zu hoch",
  news_block: "In News-Sperrzeit eröffnet",
};

export type Violation = { kind: ViolationKind; message: string };

/** Gespeicherter High-Impact-Termin. */
export type NewsEvent = { title: string; currency: string; time: string };

export type RuleAccount = { id: string; starting_balance: number; currency: string };

export function hasAnyRule(rules: RiskRules) {
  return (
    rules.maxTradesPerDay != null ||
    rules.maxConsecutiveLosses != null ||
    rules.dailyLossLimitPct != null ||
    rules.maxRiskPerTradePct != null ||
    newsBlockActive(rules)
  );
}

export const newsBlockActive = (rules: RiskRules) => (rules.newsBlockBeforeMin ?? 0) > 0 || (rules.newsBlockAfterMin ?? 0) > 0;

const round2 = (n: number) => Math.round(n * 100) / 100;
const byEntry = (a: StatTrade, b: StatTrade) => a.entry_time.localeCompare(b.entry_time) || a.id.localeCompare(b.id);
const isClosed = (t: StatTrade) => t.status === "closed" && t.net_pnl != null;

/** Termin, dessen Sperrzeit einen Zeitpunkt abdeckt (für ein Symbol bzw. eine Währungsliste). */
export function blockingEvent(
  iso: string,
  currencies: string[],
  events: NewsEvent[],
  rules: Pick<RiskRules, "newsBlockBeforeMin" | "newsBlockAfterMin">,
): NewsEvent | null {
  const before = (rules.newsBlockBeforeMin ?? 0) * 60000;
  const after = (rules.newsBlockAfterMin ?? 0) * 60000;
  if (!before && !after) return null;
  const wanted = new Set(currencies);
  const t = Date.parse(iso);
  return (
    events.find((e) => {
      if (!wanted.has(e.currency) && e.currency !== "ALL") return false;
      const at = Date.parse(e.time);
      return t >= at - before && t <= at + after;
    }) ?? null
  );
}

function minutesLabel(fromIso: string, toIso: string) {
  const minutes = Math.round((Date.parse(toIso) - Date.parse(fromIso)) / 60000);
  if (minutes === 0) return "zeitgleich mit";
  return minutes > 0 ? `${minutes} Min. vor` : `${-minutes} Min. nach`;
}

/**
 * Prüft jeden Trade gegen die persönlichen Regeln – je Account, Tagesgrenze Mitternacht Berliner Zeit.
 * Maßgeblich ist der Stand beim Einstieg: Nur Trades, die vorher geschlossen wurden, zählen für
 * Verlustserie und Tagesverlust. Für korrekte Tageswerte müssen alle Trades der betroffenen Tage übergeben werden.
 */
export function findViolations(
  trades: StatTrade[],
  accounts: RuleAccount[],
  rules: RiskRules,
  events: NewsEvent[] = [],
): Map<string, Violation[]> {
  const result = new Map<string, Violation[]>();
  const accountOf = new Map(accounts.map((a) => [a.id, a]));
  const add = (id: string, v: Violation) => result.set(id, [...(result.get(id) ?? []), v]);

  // Gruppen: Account + Kalendertag
  const groups = new Map<string, StatTrade[]>();
  const closedByDay = new Map<string, StatTrade[]>();
  for (const t of trades) {
    const entryKey = `${t.account_id}|${berlinParts(t.entry_time).date}`;
    groups.set(entryKey, [...(groups.get(entryKey) ?? []), t]);
    if (isClosed(t)) {
      const closeKey = `${t.account_id}|${berlinParts(closeTime(t)).date}`;
      closedByDay.set(closeKey, [...(closedByDay.get(closeKey) ?? []), t]);
    }
  }

  for (const [key, dayTrades] of groups) {
    const account = accountOf.get(dayTrades[0].account_id);
    const currency = account?.currency ?? "USD";
    const closedToday = [...(closedByDay.get(key) ?? [])].sort((a, b) => closeTime(a).localeCompare(closeTime(b)));
    const dailyLimit =
      rules.dailyLossLimitPct != null && account ? round2((account.starting_balance * rules.dailyLossLimitPct) / 100) : null;

    [...dayTrades].sort(byEntry).forEach((t, index) => {
      if (rules.maxTradesPerDay != null && index >= rules.maxTradesPerDay) {
        add(t.id, {
          kind: "max_trades",
          message: `${index + 1}. Trade des Tages auf diesem Account (max. ${rules.maxTradesPerDay})`,
        });
      }

      const before = closedToday.filter((c) => c.id !== t.id && closeTime(c) <= t.entry_time);
      if (rules.maxConsecutiveLosses != null) {
        let streak = 0;
        for (const c of before) streak = c.net_pnl! < 0 ? streak + 1 : 0;
        if (streak >= rules.maxConsecutiveLosses) {
          add(t.id, {
            kind: "loss_streak",
            message: `Eröffnet nach ${streak} Verlusten in Folge (max. ${rules.maxConsecutiveLosses})`,
          });
        }
      }

      if (dailyLimit != null) {
        const realized = round2(before.reduce((s, c) => s + c.net_pnl!, 0));
        if (realized <= -dailyLimit) {
          add(t.id, {
            kind: "daily_loss",
            message: `Eröffnet bei ${formatMoney(realized, currency)} Tagesergebnis – dein Limit ist −${formatMoney(dailyLimit, currency)}`,
          });
        }
      }

      if (rules.maxRiskPerTradePct != null && account && t.risk_amount != null) {
        const maxRisk = round2((account.starting_balance * rules.maxRiskPerTradePct) / 100);
        if (t.risk_amount > maxRisk * (1 + RISK_TOLERANCE)) {
          add(t.id, {
            kind: "risk_per_trade",
            message: `Risiko ${formatMoney(t.risk_amount, currency)} – erlaubt sind ${formatMoney(maxRisk, currency)} (${rules.maxRiskPerTradePct} %)`,
          });
        }
      }

      const event = blockingEvent(t.entry_time, currenciesForSymbol(t.symbol), events, rules);
      if (event) {
        add(t.id, {
          kind: "news_block",
          message: `Eröffnet ${minutesLabel(t.entry_time, event.time)} „${event.title}“ (${event.currency})`,
        });
      }
    });
  }

  return result;
}

// Stand heute ---------------------------------------------------------------------

export type CountCheck = { count: number; max: number; status: RuleStatus };

/**
 * Zähler gegen ein Maximum: am Maximum = kritisch (keine weiteren Trades), darüber = verletzt.
 * „Achtung“ einen Schritt vorher – erst ab einem Maximum von 3, sonst wäre schon der erste Trade eine Warnung.
 */
export function countStatus(count: number, max: number): RuleStatus {
  if (count > max) return "breached";
  if (count === max) return "danger";
  if (max >= 3 && count === max - 1) return "warning";
  return "ok";
}

export type TodayRisk = {
  trades: CountCheck | null;
  lossStreak: CountCheck | null;
  dailyLoss: (RuleMeter & { pnl: number }) | null;
  /** Abstand bis zum persönlichen Tageslimit (für den Positionsrechner) */
  remainingDailyLoss: number | null;
};

/** Persönliche Regeln für einen Account am heutigen Tag (Berliner Zeit). */
export function evaluateToday(
  account: RuleAccount,
  trades: StatTrade[],
  rules: RiskRules,
  now: Date = new Date(),
): TodayRisk {
  const today = berlinParts(now.toISOString()).date;
  const own = trades.filter((t) => t.account_id === account.id);
  const entered = own.filter((t) => berlinParts(t.entry_time).date === today);
  const closed = own
    .filter((t) => isClosed(t) && berlinParts(closeTime(t)).date === today)
    .sort((a, b) => closeTime(a).localeCompare(closeTime(b)));

  let streak = 0;
  for (const c of closed) streak = c.net_pnl! < 0 ? streak + 1 : 0;
  const pnl = round2(closed.reduce((s, c) => s + c.net_pnl!, 0));
  const limit = rules.dailyLossLimitPct != null ? round2((account.starting_balance * rules.dailyLossLimitPct) / 100) : null;
  const dailyLoss = limit != null ? { ...meter(-pnl, limit), pnl } : null;

  return {
    trades:
      rules.maxTradesPerDay != null
        ? { count: entered.length, max: rules.maxTradesPerDay, status: countStatus(entered.length, rules.maxTradesPerDay) }
        : null,
    lossStreak:
      rules.maxConsecutiveLosses != null
        ? { count: streak, max: rules.maxConsecutiveLosses, status: countStatus(streak, rules.maxConsecutiveLosses) }
        : null,
    dailyLoss,
    remainingDailyLoss: dailyLoss ? Math.max(0, dailyLoss.remaining) : null,
  };
}

export type NewsLock =
  | { state: "active"; event: NewsEvent; until: string }
  | { state: "soon"; event: NewsEvent; startsAt: string }
  | null;

/** Läuft gerade eine News-Sperrzeit – oder beginnt eine in den nächsten `lookaheadMin` Minuten? */
export function newsLock(
  events: NewsEvent[],
  currencies: string[],
  rules: RiskRules,
  now: Date = new Date(),
  lookaheadMin = 60,
): NewsLock {
  if (!newsBlockActive(rules)) return null;
  const nowIso = now.toISOString();
  const before = (rules.newsBlockBeforeMin ?? 0) * 60000;
  const after = (rules.newsBlockAfterMin ?? 0) * 60000;
  const relevant = currencies.length ? currencies : [...new Set(events.map((e) => e.currency))];
  const active = blockingEvent(nowIso, relevant, events, rules);
  if (active) {
    // Überlappende Sperrzeiten: bis zum Ende der letzten, die jetzt schon läuft
    const until = events
      .filter((e) => blockingEvent(nowIso, relevant, [e], rules))
      .reduce((max, e) => Math.max(max, Date.parse(e.time) + after), 0);
    return { state: "active", event: active, until: new Date(until).toISOString() };
  }
  const t = now.getTime();
  const upcoming = events
    .filter((e) => relevant.includes(e.currency) || e.currency === "ALL")
    .map((e) => ({ event: e, start: Date.parse(e.time) - before }))
    .filter((x) => x.start > t && x.start - t <= lookaheadMin * 60000)
    .sort((a, b) => a.start - b.start)[0];
  return upcoming ? { state: "soon", event: upcoming.event, startsAt: new Date(upcoming.start).toISOString() } : null;
}

// Auswertung ------------------------------------------------------------------------

/** Statistik: Trades mit und ohne Regelverstoß sowie je Regel. */
export function ruleBreakdowns(trades: StatTrade[], violations: Map<string, Violation[]>) {
  const compliance: BreakdownRow[] = breakdown(
    trades,
    (t) => (violations.get(t.id)?.length ? "broken" : "kept"),
    (k) => (k === "kept" ? "Regeln eingehalten" : "Mindestens eine Regel gebrochen"),
    ["kept", "broken"],
  );
  const kinds = Object.keys(VIOLATION_LABELS) as ViolationKind[];
  const byRule: BreakdownRow[] = breakdown(
    trades,
    (t) => [...new Set((violations.get(t.id) ?? []).map((v) => v.kind))],
    (k) => VIOLATION_LABELS[k as ViolationKind] ?? k,
    kinds,
  );
  return { compliance, byRule };
}
