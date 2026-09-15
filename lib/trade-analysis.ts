import {
  costsInR,
  exitEfficiency,
  exitReason,
  maxAdverseR,
  maxFavorableR,
  plannedRewardRisk,
  stopSize,
} from "@/lib/r-multiple";
import {
  berlinParts,
  breakdown,
  closeTime,
  closedTrades,
  type BreakdownRow,
  type CoreTrade,
  type DetailTrade,
  type TradeDetails,
} from "@/lib/stats";
import { HTF_BIASES, MARKET_CONTEXTS, TIMEFRAMES, labelFor } from "@/lib/trading";

// Erweiterte Auswertungen: Ausführung (MFE/MAE, Exit), SL-Größen, Risiko-Konstanz, Kosten und Verhalten.

/** Einstieg innerhalb dieser Minuten nach einem Verlust gilt als Revenge-Trade. */
export const REVENGE_MINUTES = 15;

const round2 = (n: number) => Math.round(n * 100) / 100;
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const avg2 = (xs: number[]) => {
  const a = avg(xs);
  return a == null ? null : round2(a);
};

/** Live- oder Backtest-Trade mit Details */
export type AnalysisTrade = CoreTrade & TradeDetails;

type TimedTrade = Pick<DetailTrade, "id" | "account_id" | "entry_time" | "exit_time" | "status" | "net_pnl">;

function groupByAccount<T extends { account_id: string }>(trades: T[]) {
  const groups = new Map<string, T[]>();
  for (const t of trades) groups.set(t.account_id, [...(groups.get(t.account_id) ?? []), t]);
  return groups;
}

/** Nummer des Trades am Tag (1 = erster Trade), je Account und Berliner Datum nach Einstiegszeit. */
export function tradeNumberOfDay(trades: TimedTrade[]): Map<string, number> {
  const result = new Map<string, number>();
  const counters = new Map<string, number>();
  const sorted = [...trades].sort((a, b) => a.entry_time.localeCompare(b.entry_time) || a.id.localeCompare(b.id));
  for (const t of sorted) {
    const key = `${t.account_id}|${berlinParts(t.entry_time).date}`;
    const n = (counters.get(key) ?? 0) + 1;
    counters.set(key, n);
    result.set(t.id, n);
  }
  return result;
}

/** Trades, die kurz nach dem Schließen eines Verlusttrades im selben Account eröffnet wurden. */
export function revengeTrades(trades: TimedTrade[], minutes = REVENGE_MINUTES): Set<string> {
  const result = new Set<string>();
  const window = minutes * 60000;
  for (const list of groupByAccount(trades).values()) {
    const lossExits = list
      .filter((t) => t.status === "closed" && t.exit_time && (t.net_pnl ?? 0) < 0)
      .map((t) => ({ id: t.id, exit: Date.parse(t.exit_time!) }))
      .sort((a, b) => a.exit - b.exit);
    for (const t of list) {
      const entry = Date.parse(t.entry_time);
      // Letzter Verlust, der vor dem Einstieg geschlossen wurde (binäre Suche)
      let lo = 0;
      let hi = lossExits.length - 1;
      let found = -1;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (lossExits[mid].exit <= entry) {
          found = mid;
          lo = mid + 1;
        } else hi = mid - 1;
      }
      // Bei gleichem Zeitpunkt nicht sich selbst bzw. einen gleichzeitig geschlossenen Trade werten
      while (found >= 0 && lossExits[found].id === t.id) found -= 1;
      if (found >= 0 && entry - lossExits[found].exit <= window) result.add(t.id);
    }
  }
  return result;
}

export type StreakContext = "after_losses" | "after_wins" | "other";

/** Ob ein Trade direkt nach 2+ Verlusten bzw. 2+ Gewinnen in Folge kam (in Reihenfolge der Schließung). */
export function streakContext(trades: AnalysisTrade[]): Map<string, StreakContext> {
  const result = new Map<string, StreakContext>();
  let wins = 0;
  let losses = 0;
  for (const t of closedTrades(trades)) {
    result.set(t.id, losses >= 2 ? "after_losses" : wins >= 2 ? "after_wins" : "other");
    wins = t.net_pnl! > 0 ? wins + 1 : 0;
    losses = t.net_pnl! < 0 ? losses + 1 : 0;
  }
  return result;
}

/**
 * Risiko in % vom Kontostand vor dem Trade (Startkapital + bis dahin realisierter P&L des Accounts).
 * Braucht alle Trades der Accounts, nicht nur den gefilterten Zeitraum.
 */
export function riskPercents(trades: DetailTrade[], startingBalances: Map<string, number>): Map<string, number> {
  const result = new Map<string, number>();
  for (const [accountId, list] of groupByAccount(trades)) {
    const start = startingBalances.get(accountId);
    if (start == null) continue;
    const closed = closedTrades(list);
    const sorted = [...list].sort((a, b) => a.entry_time.localeCompare(b.entry_time));
    let realized = 0;
    let i = 0;
    for (const t of sorted) {
      while (i < closed.length && closeTime(closed[i]) <= t.entry_time) realized += closed[i++].net_pnl!;
      const balance = start + realized;
      if (t.risk_amount != null && balance > 0) result.set(t.id, t.risk_amount / balance);
    }
  }
  return result;
}

const HOLD_BUCKETS: [string, string, number][] = [
  ["0", "< 5 Min.", 5],
  ["1", "5–15 Min.", 15],
  ["2", "15–60 Min.", 60],
  ["3", "1–4 Std.", 240],
  ["4", "4–24 Std.", 1440],
  ["5", "> 1 Tag", Infinity],
];

const R_BUCKETS: [string, number][] = [
  ["≤ −2 R", -2],
  ["−2 bis −1 R", -1],
  ["−1 bis 0 R", 0],
  ["0 bis 1 R", 1],
  ["1 bis 2 R", 2],
  ["2 bis 3 R", 3],
  ["> 3 R", Infinity],
];

export type RBucket = { label: string; count: number; positive: boolean };

export type AdvancedStats = {
  rBuckets: RBucket[];
  mfe: {
    count: number;
    avgMfeR: number | null;
    avgMaeR: number | null;
    avgEfficiency: number | null;
    /** Summe aus möglichem R minus erreichtem R */
    givenBackR: number | null;
    /** Gewinner, die fast ausgestoppt wurden (MAE ≥ 0,8 R) */
    winnersNearStop: number;
    /** Verlierer, die vorher mindestens 1 R im Plus waren */
    losersWithOneR: number;
  };
  plan: { count: number; avgPlannedRR: number | null; avgR: number | null };
  exits: Record<"sl" | "tp" | "manual", number>;
  stopBySymbol: { symbol: string; avg: number; unit: string; count: number }[];
  risk: { count: number; avgPct: number | null; minPct: number | null; maxPct: number | null; stdPct: number | null; oversized: number };
  costs: { count: number; avgR: number | null; shareOfGross: number | null };
};

export function advancedStats(input: AnalysisTrade[], riskPct: Map<string, number> = new Map()): AdvancedStats {
  const trades = closedTrades(input);

  const rs = trades.map((t) => t.r_multiple).filter((r): r is number => r != null);
  const rBuckets = R_BUCKETS.map(([label, upper], i) => {
    const lower = i === 0 ? -Infinity : R_BUCKETS[i - 1][1];
    return { label, count: rs.filter((r) => (i === 0 ? r <= upper : r > lower && r <= upper)).length, positive: upper > 0 };
  });

  const withMfe = trades.flatMap((t) => {
    const mfe = maxFavorableR(t);
    return mfe == null ? [] : [{ t, mfe, mae: maxAdverseR(t), eff: exitEfficiency(t) }];
  });
  const withMae = trades.flatMap((t) => {
    const mae = maxAdverseR(t);
    return mae == null ? [] : [{ t, mae }];
  });
  const givenBack = withMfe.filter((x) => x.t.r_multiple != null).map((x) => Math.max(0, x.mfe - x.t.r_multiple!));

  const planned = trades.flatMap((t) => {
    const rr = plannedRewardRisk(t);
    return rr == null ? [] : [{ rr, r: t.r_multiple }];
  });

  const exits = { sl: 0, tp: 0, manual: 0 };
  for (const t of trades) {
    const reason = exitReason(t);
    if (reason) exits[reason] += 1;
  }

  const stops = new Map<string, { sum: number; count: number; unit: string }>();
  for (const t of input) {
    const size = stopSize(t);
    if (!size) continue;
    const s = stops.get(t.symbol) ?? { sum: 0, count: 0, unit: size.unit };
    s.sum += size.value;
    s.count += 1;
    stops.set(t.symbol, s);
  }
  const stopBySymbol = [...stops.entries()]
    .map(([symbol, s]) => ({ symbol, avg: Math.round((s.sum / s.count) * 10) / 10, unit: s.unit, count: s.count }))
    .sort((a, b) => b.count - a.count);

  const pcts = trades.map((t) => riskPct.get(t.id)).filter((p): p is number => p != null);
  const meanPct = avg(pcts);
  const amounts = trades.map((t) => t.risk_amount).filter((r): r is number => r != null).sort((a, b) => a - b);
  const median = amounts.length ? amounts[Math.floor(amounts.length / 2)] : null;

  const costR = trades.map(costsInR).filter((c): c is number => c != null);
  const totalCosts = trades.reduce((s, t) => s + t.commission + t.swap, 0);
  const grossProfit = trades.reduce((s, t) => s + Math.max(0, t.pnl ?? 0), 0);

  return {
    rBuckets,
    mfe: {
      count: withMfe.length,
      avgMfeR: avg2(withMfe.map((x) => x.mfe)),
      avgMaeR: avg2(withMae.map((x) => x.mae)),
      avgEfficiency: avg2(withMfe.map((x) => x.eff).filter((e): e is number => e != null)),
      givenBackR: givenBack.length ? round2(givenBack.reduce((a, b) => a + b, 0)) : null,
      winnersNearStop: withMae.filter((x) => x.t.net_pnl! > 0 && x.mae >= 0.8).length,
      losersWithOneR: withMfe.filter((x) => x.t.net_pnl! < 0 && x.mfe >= 1).length,
    },
    plan: {
      count: planned.length,
      avgPlannedRR: avg2(planned.map((p) => p.rr)),
      avgR: avg2(planned.map((p) => p.r).filter((r): r is number => r != null)),
    },
    exits,
    stopBySymbol,
    risk: {
      count: pcts.length,
      avgPct: meanPct,
      minPct: pcts.length ? Math.min(...pcts) : null,
      maxPct: pcts.length ? Math.max(...pcts) : null,
      stdPct: meanPct == null ? null : Math.sqrt(avg(pcts.map((p) => (p - meanPct) ** 2))!),
      oversized: median == null ? 0 : amounts.filter((a) => a > median * 1.5).length,
    },
    costs: {
      count: costR.length,
      avgR: avg2(costR),
      shareOfGross: grossProfit > 0 ? Math.abs(totalCosts) / grossProfit : null,
    },
  };
}

export type DetailContext = {
  tradeNumbers: Map<string, number>;
  revenge: Set<string>;
  streaks: Map<string, StreakContext>;
};

/** Zusätzliche Aufschlüsselungen für die Statistikseite. */
export function detailBreakdowns(trades: AnalysisTrade[], ctx: DetailContext): Record<string, BreakdownRow[]> {
  const yesNo = (v: boolean | null) => (v == null ? null : String(v));
  const yesNoLabel = (k: string) => (k === "true" ? "Ja" : "Nein");
  return {
    holdTime: breakdown(
      trades,
      (t) => {
        if (!t.exit_time) return null;
        const minutes = (Date.parse(t.exit_time) - Date.parse(t.entry_time)) / 60000;
        return HOLD_BUCKETS.find(([, , max]) => minutes < max)![0];
      },
      (k) => HOLD_BUCKETS[Number(k)][1],
      HOLD_BUCKETS.map(([k]) => k),
    ),
    exitReason: breakdown(
      trades,
      (t) => exitReason(t),
      (k) => ({ sl: "Am Stop Loss", tp: "Am Take Profit", manual: "Manuell geschlossen" })[k] ?? k,
      ["tp", "manual", "sl"],
    ),
    tradeOfDay: breakdown(
      trades,
      (t) => {
        const n = ctx.tradeNumbers.get(t.id);
        return n == null ? null : String(Math.min(n, 4));
      },
      (k) => (k === "4" ? "4. Trade und später" : `${k}. Trade des Tages`),
      ["1", "2", "3", "4"],
    ),
    revenge: breakdown(
      trades,
      (t) => (ctx.revenge.has(t.id) ? "revenge" : "normal"),
      (k) => (k === "revenge" ? `≤ ${REVENGE_MINUTES} Min. nach einem Verlust` : "Mit Abstand zum letzten Verlust"),
      ["revenge", "normal"],
    ),
    afterStreak: breakdown(
      trades,
      (t) => ctx.streaks.get(t.id) ?? null,
      (k) => ({ after_losses: "Nach 2+ Verlusten", after_wins: "Nach 2+ Gewinnen", other: "Sonst" })[k] ?? k,
      ["after_losses", "after_wins", "other"],
    ),
    timeframe: breakdown(trades, (t) => t.entry_timeframe, (k) => k, TIMEFRAMES),
    htfBias: breakdown(
      trades,
      (t) => t.htf_bias,
      (k) => labelFor(HTF_BIASES, k),
      HTF_BIASES.map((o) => o.value),
    ),
    marketContext: breakdown(
      trades,
      (t) => t.market_context,
      (k) => labelFor(MARKET_CONTEXTS, k),
      MARKET_CONTEXTS.map((o) => o.value),
    ),
    breakeven: breakdown(trades, (t) => yesNo(t.moved_to_breakeven), yesNoLabel, ["true", "false"]),
    partialClose: breakdown(trades, (t) => yesNo(t.partial_close), yesNoLabel, ["true", "false"]),
  };
}
