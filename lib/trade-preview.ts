import { parseNumber } from "@/lib/form-data";
import { estimateRisk, maxAdverseR, maxFavorableR, plannedRewardRisk, stopSize } from "@/lib/r-multiple";

// Live-Vorschau im Trade-Formular: liest den aktuellen Formularstand und rechnet mit denselben
// Regeln wie beim Speichern (Risiko: saveTrade/estimateRisk, Netto & R: generierte Spalten in `trades`).

export type TradeDraft = {
  symbol: string;
  direction: string;
  status: string;
  entryTime: string | null;
  exitTime: string | null;
  quantity: number | null;
  entryPrice: number | null;
  exitPrice: number | null;
  stopLoss: number | null;
  takeProfit: number | null;
  bestPrice: number | null;
  worstPrice: number | null;
  pnl: number | null;
  commission: number | null;
  swap: number | null;
  riskAmount: number | null;
  timeframe: string | null;
  htfBias: string | null;
  marketContext: string | null;
  strategyId: string | null;
  criterion: string | null;
  setupQuality: string | null;
  emotion: string | null;
  followedPlan: boolean | null;
  rating: number | null;
  movedToBreakeven: boolean | null;
  partialClose: boolean | null;
  tags: string[];
  mistakes: string[];
  notes: string | null;
  lessons: string | null;
};

const str = (fd: FormData, key: string) => {
  const v = String(fd.get(key) ?? "").trim();
  return v === "" ? null : v;
};

/** Zahl oder null – unfertige Eingaben („2.50“ beim Tippen, „-“) brechen die Vorschau nicht. */
const number = (fd: FormData, key: string, kind: "money" | "price" = "price") => {
  const raw = str(fd, key);
  if (raw == null) return null;
  try {
    return parseNumber(raw, kind);
  } catch {
    return null;
  }
};

const bool = (fd: FormData, key: string) => {
  const v = str(fd, key);
  return v === "true" ? true : v === "false" ? false : null;
};

export function readDraft(fd: FormData): TradeDraft {
  const status = str(fd, "status") ?? "closed";
  const closed = status === "closed";
  return {
    symbol: (str(fd, "symbol") ?? "").toUpperCase(),
    direction: str(fd, "direction") ?? "long",
    status,
    entryTime: str(fd, "entry_time"),
    exitTime: closed ? str(fd, "exit_time") : null,
    quantity: number(fd, "quantity"),
    entryPrice: number(fd, "entry_price"),
    exitPrice: closed ? number(fd, "exit_price") : null,
    stopLoss: number(fd, "stop_loss"),
    takeProfit: number(fd, "take_profit"),
    bestPrice: number(fd, "best_price"),
    worstPrice: number(fd, "worst_price"),
    pnl: number(fd, "pnl", "money"),
    commission: number(fd, "commission", "money"),
    swap: number(fd, "swap", "money"),
    riskAmount: number(fd, "risk_amount", "money"),
    timeframe: str(fd, "entry_timeframe"),
    htfBias: str(fd, "htf_bias"),
    marketContext: str(fd, "market_context"),
    strategyId: str(fd, "strategy_id"),
    criterion: str(fd, "entry_criterion"),
    setupQuality: str(fd, "setup_quality"),
    emotion: str(fd, "emotion"),
    followedPlan: bool(fd, "followed_plan"),
    rating: number(fd, "rating"),
    movedToBreakeven: closed ? bool(fd, "moved_to_breakeven") : null,
    partialClose: closed ? bool(fd, "partial_close") : null,
    tags: (str(fd, "tags") ?? "")
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean),
    mistakes: fd.getAll("mistakes").map(String),
    notes: str(fd, "notes"),
    lessons: str(fd, "lessons"),
  };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export type TradePreview = {
  costs: number;
  /** wie `trades.net_pnl`, aber null solange kein Brutto-Ergebnis eingetragen ist */
  netPnl: number | null;
  risk: number | null;
  /** Risiko wurde aus Einstieg, SL und P&L berechnet statt eingetragen */
  riskEstimated: boolean;
  /** wie `trades.r_multiple` */
  rMultiple: number | null;
  costsR: number | null;
  holdMinutes: number | null;
  stop: ReturnType<typeof stopSize>;
  plannedRR: number | null;
  mfeR: number | null;
  maeR: number | null;
};

export function previewTrade(d: TradeDraft): TradePreview {
  const costs = round2((d.commission ?? 0) + (d.swap ?? 0));
  const netPnl = d.pnl == null ? null : round2(d.pnl + costs);
  const entered = d.riskAmount != null && d.riskAmount > 0 ? d.riskAmount : null;
  const estimated =
    entered == null
      ? estimateRisk({ direction: d.direction, entry_price: d.entryPrice, exit_price: d.exitPrice, stop_loss: d.stopLoss, pnl: d.pnl })
      : null;
  const risk = entered ?? estimated;
  const prices = { direction: d.direction, entry_price: d.entryPrice, stop_loss: d.stopLoss };
  const entryMs = d.entryTime ? Date.parse(d.entryTime) : NaN;
  const exitMs = d.exitTime ? Date.parse(d.exitTime) : NaN;

  return {
    costs,
    netPnl,
    risk,
    riskEstimated: entered == null && estimated != null,
    rMultiple: risk != null && d.pnl != null ? round2((d.pnl + costs) / risk) : null,
    costsR: risk != null && costs !== 0 ? round2(costs / risk) : null,
    holdMinutes: Number.isFinite(entryMs) && Number.isFinite(exitMs) && exitMs >= entryMs ? Math.round((exitMs - entryMs) / 60000) : null,
    stop: d.symbol ? stopSize({ ...prices, symbol: d.symbol }) : null,
    plannedRR: plannedRewardRisk({ ...prices, take_profit: d.takeProfit }),
    mfeR: maxFavorableR({ ...prices, best_price: d.bestPrice }),
    maeR: maxAdverseR({ ...prices, worst_price: d.worstPrice }),
  };
}

/**
 * Wie vollständig der Trade dokumentiert ist – nur Felder, die für Auswertungen zählen.
 * Ausstiegsfelder zählen erst bei geschlossenen Trades, das Einstiegskriterium nur, wenn die Strategie welche hat.
 */
export function documentation(d: TradeDraft, options: { criteriaAvailable: boolean; screenshots: number }) {
  const closed = d.status === "closed";
  const preview = previewTrade(d);
  const checks: [string, boolean, boolean?][] = [
    ["Einstiegskurs", d.entryPrice != null],
    ["Ausstiegskurs", d.exitPrice != null, closed],
    ["Stop Loss", d.stopLoss != null],
    ["Take Profit", d.takeProfit != null],
    ["Bester Kurs", d.bestPrice != null],
    ["Schlechtester Kurs", d.worstPrice != null],
    ["Timeframe", d.timeframe != null],
    ["HTF-Trend", d.htfBias != null],
    ["Marktkontext", d.marketContext != null],
    ["Strategie", d.strategyId != null],
    ["Einstiegskriterium", d.criterion != null, options.criteriaAvailable],
    ["Ergebnis", d.pnl != null, closed],
    ["Risiko", preview.risk != null],
    ["Setup-Qualität", d.setupQuality != null],
    ["Emotion", d.emotion != null],
    ["Plan eingehalten", d.followedPlan != null],
    ["Bewertung", d.rating != null],
    ["Breakeven", d.movedToBreakeven != null, closed],
    ["Teilgewinne", d.partialClose != null, closed],
    ["Notizen", d.notes != null],
    ["Lessons Learned", d.lessons != null],
    ["Screenshot", options.screenshots > 0],
  ];
  const relevant = checks.filter(([, , applies = true]) => applies);
  const done = relevant.filter(([, filled]) => filled).length;
  return {
    percent: Math.round((done / relevant.length) * 100),
    missing: relevant.filter(([, filled]) => !filled).map(([label]) => label),
  };
}
