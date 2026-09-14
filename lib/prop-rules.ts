import { berlinParts, closeTime, closedTrades, type StatTrade } from "@/lib/stats";
import type { Account } from "@/lib/trading";

export type RuleStatus = "ok" | "warning" | "danger" | "breached";

export type RuleMeter = {
  /** verbrauchter Betrag (≥ 0) */
  used: number;
  limit: number;
  /** used / limit, 0–1+ */
  ratio: number;
  /** Abstand bis zum Limit */
  remaining: number;
  status: RuleStatus;
};

export type AccountRules = {
  balance: number;
  netPnl: number;
  todayPnl: number;
  todayTrades: number;
  dailyLoss: RuleMeter | null;
  drawdown: (RuleMeter & { floor: number; peak: number }) | null;
  target: { progress: number; remaining: number; reached: boolean } | null;
  tradingDays: { done: number; required: number | null };
  /** schlechtester Status aller Limits */
  status: RuleStatus;
};

export function statusFor(ratio: number): RuleStatus {
  if (ratio >= 1) return "breached";
  if (ratio >= 0.8) return "danger";
  if (ratio >= 0.5) return "warning";
  return "ok";
}

const ORDER: RuleStatus[] = ["ok", "warning", "danger", "breached"];
const worst = (a: RuleStatus, b: RuleStatus) => (ORDER.indexOf(a) > ORDER.indexOf(b) ? a : b);
const round2 = (n: number) => Math.round(n * 100) / 100;

function meter(used: number, limit: number): RuleMeter {
  const u = round2(Math.max(0, used));
  const ratio = limit > 0 ? u / limit : 0;
  return { used: u, limit, ratio, remaining: round2(limit - u), status: statusFor(ratio) };
}

/**
 * Prüft die Regeln eines Prop-Accounts anhand der geschlossenen Trades.
 * Tagesgrenze ist Mitternacht Berliner Zeit (wie bei FTMO). Offene Positionen und
 * schwebende Gewinne/Verluste sind nicht enthalten – die echten Limits der Prop Firm
 * rechnen mit Equity und können früher greifen.
 */
export function evaluateAccount(
  account: Pick<Account, "starting_balance" | "max_daily_loss" | "max_drawdown" | "drawdown_type" | "profit_target" | "min_trading_days">,
  input: StatTrade[],
  now: Date = new Date(),
): AccountRules {
  const trades = closedTrades(input);
  const today = berlinParts(now.toISOString()).date;
  const start = account.starting_balance;

  let balance = start;
  let peak = start;
  let eodPeak = start;
  let todayPnl = 0;
  let todayTrades = 0;
  let currentDay: string | null = null;
  const days = new Set<string>();

  for (const t of trades) {
    const day = berlinParts(closeTime(t)).date;
    // Tageswechsel: Schlussstand des Vortags zählt für End-of-Day-Trailing
    if (currentDay && day !== currentDay) eodPeak = Math.max(eodPeak, balance);
    currentDay = day;
    days.add(day);

    balance = round2(balance + t.net_pnl!);
    peak = Math.max(peak, balance);
    if (day === today) {
      todayPnl = round2(todayPnl + t.net_pnl!);
      todayTrades += 1;
    }
  }
  // Ein abgeschlossener Tag (nicht heute) zählt ebenfalls zum End-of-Day-Höchststand
  if (currentDay && currentDay !== today) eodPeak = Math.max(eodPeak, balance);

  let status: RuleStatus = "ok";

  const dailyLoss = account.max_daily_loss ? meter(-todayPnl, account.max_daily_loss) : null;
  if (dailyLoss) status = worst(status, dailyLoss.status);

  let drawdown: AccountRules["drawdown"] = null;
  if (account.max_drawdown) {
    const reference =
      account.drawdown_type === "trailing" ? peak : account.drawdown_type === "eod_trailing" ? eodPeak : start;
    drawdown = {
      ...meter(reference - balance, account.max_drawdown),
      floor: round2(reference - account.max_drawdown),
      peak: reference,
    };
    status = worst(status, drawdown.status);
  }

  const netPnl = round2(balance - start);
  const target = account.profit_target
    ? {
        progress: Math.max(0, Math.min(1, netPnl / account.profit_target)),
        remaining: round2(Math.max(0, account.profit_target - netPnl)),
        reached: netPnl >= account.profit_target,
      }
    : null;

  return {
    balance,
    netPnl,
    todayPnl,
    todayTrades,
    dailyLoss,
    drawdown,
    target,
    tradingDays: { done: days.size, required: account.min_trading_days },
    status,
  };
}
