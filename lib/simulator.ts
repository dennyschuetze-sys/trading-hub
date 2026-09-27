import { estimateRisk, exitReason, maxAdverseR, maxFavorableR } from "@/lib/r-multiple";
import { berlinParts, closeTime, type DetailTrade } from "@/lib/stats";
import { SESSIONS, formatMoney, labelFor } from "@/lib/trading";

// Trade-Simulator: „Was wäre gewesen, wenn …“ – Regeln, anderes Ziel-R oder Break-even-Regel
// werden auf die echten Trades angewendet und mit dem tatsächlichen Verlauf verglichen.

/** Felder, die der Simulator braucht (wird an den Browser übergeben). */
export type SimTrade = Pick<
  DetailTrade,
  | "id"
  | "account_id"
  | "symbol"
  | "direction"
  | "status"
  | "entry_time"
  | "exit_time"
  | "net_pnl"
  | "r_multiple"
  | "session"
  | "setup_quality"
  | "strategy_id"
  | "risk_amount"
  | "entry_price"
  | "exit_price"
  | "stop_loss"
  | "take_profit"
  | "best_price"
  | "worst_price"
  | "pnl"
  | "commission"
  | "swap"
> & {
  /** Trade kam kurz nach einem Verlust (Revenge), aus allen Trades des Accounts berechnet */
  revenge?: boolean;
};

export type Rule =
  | { kind: "symbol"; value: string }
  | { kind: "session"; value: string }
  | { kind: "weekday"; value: number }
  | { kind: "direction"; value: string }
  | { kind: "setup"; value: string }
  | { kind: "strategy"; value: string }
  | { kind: "maxPerDay"; value: number }
  | { kind: "stopAfterLosses"; value: number }
  | { kind: "overnight" }
  | { kind: "weekend" }
  | { kind: "revenge" };

export type RuleKind = Rule["kind"];

/** Ergebnis eines simulierten Trades; null = in diesem Szenario nicht getradet. */
export type SimOutcome = { pnl: number; r: number | null } | null;

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Abgeschlossene Trades in Reihenfolge der Schließung (wie `closedTrades` in stats, nur mit schmalerem Typ). */
function closedTrades<T extends SimTrade>(trades: T[]): T[] {
  return trades
    .filter((t) => t.status === "closed" && t.net_pnl != null)
    .sort((a, b) => closeTime(a).localeCompare(closeTime(b)));
}

export const WEEKDAY_LABELS = ["", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"];

// Regeln -------------------------------------------------------------------------

/** Über Nacht gehalten: Ausstieg an einem späteren Berliner Kalendertag als der Einstieg. */
function heldOvernight(t: SimTrade) {
  return t.exit_time != null && berlinParts(t.exit_time).date > berlinParts(t.entry_time).date;
}

/** Über das Wochenende gehalten: zwischen Einstieg und Ausstieg liegt ein Samstag oder Sonntag. */
function heldOverWeekend(t: SimTrade) {
  if (!t.exit_time) return false;
  const start = berlinParts(t.entry_time);
  const end = berlinParts(t.exit_time);
  if (end.date <= start.date) return false;
  const days = Math.round((Date.parse(`${end.date}T12:00:00Z`) - Date.parse(`${start.date}T12:00:00Z`)) / 86400000);
  return days >= 7 || end.weekday < start.weekday || start.weekday >= 6 || end.weekday >= 6;
}

function excludedByStaticRule(t: SimTrade, rule: Rule): boolean {
  switch (rule.kind) {
    case "symbol":
      return t.symbol === rule.value;
    case "session":
      return t.session === rule.value;
    case "weekday":
      return berlinParts(t.entry_time).weekday === rule.value;
    case "direction":
      return t.direction === rule.value;
    case "setup":
      return t.setup_quality === rule.value;
    case "strategy":
      return t.strategy_id === rule.value;
    case "overnight":
      return heldOvernight(t);
    case "weekend":
      return heldOverWeekend(t);
    case "revenge":
      return t.revenge === true;
    default:
      return false;
  }
}

/**
 * Wendet die Regeln an und liefert die Trades, die im Szenario genommen worden wären.
 * Tageslimits zählen nur Trades, die die übrigen Regeln passiert haben – wer einen Trade auslässt,
 * hätte das Tageslimit noch frei. Tage werden je Account nach Berliner Datum des Einstiegs gebildet.
 */
export function applyRules<T extends SimTrade>(trades: T[], rules: Rule[]): T[] {
  const candidates = closedTrades(trades)
    .filter((t) => !rules.some((r) => excludedByStaticRule(t, r)))
    .sort((a, b) => a.entry_time.localeCompare(b.entry_time) || a.id.localeCompare(b.id));

  const maxPerDay = Math.min(...rules.filter((r) => r.kind === "maxPerDay").map((r) => r.value), Infinity);
  const stopAfter = Math.min(...rules.filter((r) => r.kind === "stopAfterLosses").map((r) => r.value), Infinity);
  if (maxPerDay === Infinity && stopAfter === Infinity) return candidates;

  const days = new Map<string, { count: number; losses: { exit: string }[] }>();
  const kept: T[] = [];
  for (const t of candidates) {
    const key = `${t.account_id}|${berlinParts(t.entry_time).date}`;
    const day = days.get(key) ?? { count: 0, losses: [] };
    days.set(key, day);
    if (day.count >= maxPerDay) continue;
    // Nur Verluste zählen, die vor diesem Einstieg schon geschlossen waren
    if (day.losses.filter((l) => l.exit <= t.entry_time).length >= stopAfter) continue;
    day.count += 1;
    if (t.net_pnl! < 0) day.losses.push({ exit: closeTime(t) });
    kept.push(t);
  }
  return kept;
}

/** Ergebnisse je Trade für ein Regel-Szenario (Trades bleiben unverändert oder fallen weg). */
export function ruleOutcomes(trades: SimTrade[], rules: Rule[]): Map<string, SimOutcome> {
  const kept = new Set(applyRules(trades, rules).map((t) => t.id));
  return new Map(closedTrades(trades).map((t) => [t.id, kept.has(t.id) ? { pnl: t.net_pnl!, r: t.r_multiple } : null]));
}

// Auswertung eines Szenarios --------------------------------------------------------

export type ScenarioStats = {
  count: number;
  netPnl: number;
  winRate: number | null;
  avgR: number | null;
  /** Ergebnis in Prozent vom Startkapital (0.05 = 5 %) */
  returnPct: number | null;
};

export function scenarioStats(trades: SimTrade[], outcomes: Map<string, SimOutcome>, startingBalance: number): ScenarioStats {
  const results = closedTrades(trades)
    .map((t) => outcomes.get(t.id))
    .filter((o): o is NonNullable<SimOutcome> => o != null);
  const netPnl = round2(results.reduce((s, o) => s + o.pnl, 0));
  const rs = results.map((o) => o.r).filter((r): r is number => r != null);
  return {
    count: results.length,
    netPnl,
    winRate: results.length ? results.filter((o) => o.pnl > 0).length / results.length : null,
    avgR: rs.length ? round2(rs.reduce((a, b) => a + b, 0) / rs.length) : null,
    returnPct: startingBalance > 0 ? netPnl / startingBalance : null,
  };
}

/** Tatsächliches Ergebnis jedes Trades – die Vergleichsbasis. */
export function actualOutcomes(trades: SimTrade[]): Map<string, SimOutcome> {
  return new Map(closedTrades(trades).map((t) => [t.id, { pnl: t.net_pnl!, r: t.r_multiple }]));
}

export type ComparePoint = { index: number; time: string; actual: number; scenario: number | null };

/**
 * Zwei Kontostand-Kurven auf derselben Zeitachse (ein Punkt je tatsächlichem Trade).
 * Fällt ein Trade im Szenario weg, bleibt die Szenario-Kurve an dieser Stelle flach.
 */
export function compareCurve(
  trades: SimTrade[],
  scenario: Map<string, SimOutcome> | null,
  startingBalance: number,
): ComparePoint[] {
  const closed = closedTrades(trades);
  if (!closed.length) return [];
  let actual = startingBalance;
  let sim = startingBalance;
  const points: ComparePoint[] = [{ index: 0, time: closed[0].entry_time, actual, scenario: scenario ? sim : null }];
  closed.forEach((t, i) => {
    actual = round2(actual + t.net_pnl!);
    const o = scenario?.get(t.id);
    if (o) sim = round2(sim + o.pnl);
    points.push({ index: i + 1, time: closeTime(t), actual, scenario: scenario ? sim : null });
  });
  return points;
}

// Bestes Szenario ------------------------------------------------------------------

export type ScenarioStep = {
  rule: Rule;
  /** Trades, die durch diese Regel zusätzlich wegfallen */
  removed: number;
  /** Summe ihrer Ergebnisse (negativ = die Regel spart Verluste) */
  removedPnl: number;
};

export type BestScenario = {
  steps: ScenarioStep[];
  rules: Rule[];
  stats: ScenarioStats;
  baseline: ScenarioStats;
};

/** Mindestens so viele Trades müssen im Szenario übrig bleiben. */
export const minKeptTrades = (total: number) => Math.max(10, Math.ceil(total * 0.4));

/** Mögliche Regeln – nur solche, die in den Daten überhaupt einen Unterschied machen können. */
export function candidateRules(trades: SimTrade[]): Rule[] {
  const closed = closedTrades(trades);
  const distinct = <V>(pick: (t: SimTrade) => V | null | undefined) =>
    [...new Set(closed.map(pick).filter((v): v is V => v != null && v !== ""))];
  const multi = <V>(values: V[]) => (values.length > 1 ? values : []);

  const perDay = new Map<string, number>();
  closed.forEach((t) => {
    const key = `${t.account_id}|${berlinParts(t.entry_time).date}`;
    perDay.set(key, (perDay.get(key) ?? 0) + 1);
  });
  const maxDay = Math.max(0, ...perDay.values());

  return [
    ...multi(distinct((t) => t.symbol)).map((value): Rule => ({ kind: "symbol", value })),
    ...multi(distinct((t) => t.session)).map((value): Rule => ({ kind: "session", value })),
    ...multi(distinct((t) => berlinParts(t.entry_time).weekday)).map((value): Rule => ({ kind: "weekday", value })),
    ...multi(distinct((t) => t.direction)).map((value): Rule => ({ kind: "direction", value })),
    ...multi(distinct((t) => t.setup_quality)).map((value): Rule => ({ kind: "setup", value })),
    ...multi(distinct((t) => t.strategy_id)).map((value): Rule => ({ kind: "strategy", value })),
    ...Array.from({ length: Math.min(maxDay - 1, 4) }, (_, i): Rule => ({ kind: "maxPerDay", value: i + 1 })),
    ...(maxDay > 1 ? [1, 2, 3].filter((n) => n < maxDay).map((value): Rule => ({ kind: "stopAfterLosses", value })) : []),
    ...(closed.some(heldOvernight) ? [{ kind: "overnight" } as Rule] : []),
    ...(closed.some(heldOverWeekend) ? [{ kind: "weekend" } as Rule] : []),
    ...(closed.some((t) => t.revenge) ? [{ kind: "revenge" } as Rule] : []),
  ];
}

/** Tageslimits gibt es je Art nur einmal. */
const SINGLE_KINDS: RuleKind[] = ["maxPerDay", "stopAfterLosses", "overnight", "weekend", "revenge"];

/**
 * Sucht schrittweise (gierig) bis zu `maxRules` Regeln, die das Nettoergebnis am stärksten verbessern.
 * Jede Regel muss mindestens 3 Trades betreffen und das Ergebnis spürbar verbessern; insgesamt
 * bleiben mindestens `minKeptTrades` Trades übrig – sonst wäre das Ergebnis reine Kurvenanpassung.
 */
export function findBestScenario(trades: SimTrade[], startingBalance: number, maxRules = 4): BestScenario {
  const closed = closedTrades(trades);
  const baseline = scenarioStats(trades, actualOutcomes(trades), startingBalance);
  const minKept = minKeptTrades(closed.length);
  // Spürbar = mindestens ein Viertel des durchschnittlichen Betrags je Trade
  const avgAbs = closed.length ? closed.reduce((s, t) => s + Math.abs(t.net_pnl!), 0) / closed.length : 0;
  const minGain = Math.max(0.01, avgAbs * 0.25);

  const candidates = candidateRules(trades);
  const rules: Rule[] = [];
  const steps: ScenarioStep[] = [];
  let current = closed;
  let currentPnl = baseline.netPnl;

  while (rules.length < maxRules) {
    let best: { rule: Rule; kept: SimTrade[]; pnl: number } | null = null;
    for (const rule of candidates) {
      if (rules.some((r) => r.kind === rule.kind && (SINGLE_KINDS.includes(r.kind) || sameRule(r, rule)))) continue;
      const kept = applyRules(trades, [...rules, rule]);
      if (kept.length < minKept || current.length - kept.length < 3) continue;
      const pnl = round2(kept.reduce((s, t) => s + t.net_pnl!, 0));
      if (pnl - currentPnl < minGain) continue;
      if (!best || pnl > best.pnl || (pnl === best.pnl && kept.length > best.kept.length)) best = { rule, kept, pnl };
    }
    if (!best) break;
    const keptIds = new Set(best.kept.map((t) => t.id));
    const removed = current.filter((t) => !keptIds.has(t.id));
    steps.push({ rule: best.rule, removed: removed.length, removedPnl: round2(removed.reduce((s, t) => s + t.net_pnl!, 0)) });
    rules.push(best.rule);
    current = best.kept;
    currentPnl = best.pnl;
  }

  return { steps, rules, stats: scenarioStats(trades, ruleOutcomes(trades, rules), startingBalance), baseline };
}

export function sameRule(a: Rule, b: Rule) {
  return a.kind === b.kind && ("value" in a ? a.value : null) === ("value" in b ? b.value : null);
}

/** Kurzbeschreibung einer Regel, z. B. „Ohne XAUUSD“ oder „Max. 2 Trades pro Tag“. */
export function describeRule(rule: Rule, strategyNames: Map<string, string> = new Map()): string {
  switch (rule.kind) {
    case "symbol":
      return `Ohne ${rule.value}`;
    case "session":
      return `Ohne Session ${labelFor(SESSIONS, rule.value)}`;
    case "weekday":
      return `Nicht am ${WEEKDAY_LABELS[rule.value]}`;
    case "direction":
      return rule.value === "long" ? "Keine Long-Trades" : "Keine Short-Trades";
    case "setup":
      return `Ohne Setup-Qualität ${rule.value}`;
    case "strategy":
      return `Ohne Strategie ${strategyNames.get(rule.value) ?? "(unbekannt)"}`;
    case "maxPerDay":
      return `Max. ${rule.value} ${rule.value === 1 ? "Trade" : "Trades"} pro Tag`;
    case "stopAfterLosses":
      return `Tagesstopp nach ${rule.value} ${rule.value === 1 ? "Verlust" : "Verlusten"}`;
    case "overnight":
      return "Keine Positionen über Nacht";
    case "weekend":
      return "Keine Positionen übers Wochenende";
    case "revenge":
      return "Keine Revenge-Trades";
  }
}

/** Begründung aus den Daten: was die Regel wegnimmt und was das bewirkt. */
export function explainStep(step: ScenarioStep, currency: string): string {
  const trades = `${step.removed} ${step.removed === 1 ? "Trade" : "Trades"}`;
  const pnl = formatMoney(step.removedPnl, currency, true);
  return step.removedPnl < 0
    ? `Fällt ${trades} mit zusammen ${pnl} weg – diese Verluste wären erspart geblieben.`
    : `Fällt ${trades} mit zusammen ${pnl} weg; im Zusammenspiel mit den übrigen Regeln steigt das Ergebnis trotzdem.`;
}

// Optimales RR ----------------------------------------------------------------------

/** Risiko des Trades in Kontowährung: erfasst oder aus Kursen und P&L geschätzt. */
function riskOf(t: SimTrade): number | null {
  if (t.risk_amount != null && t.risk_amount > 0) return t.risk_amount;
  return estimateRisk(t);
}

const costsOf = (t: SimTrade) => (t.commission ?? 0) + (t.swap ?? 0);

/** Trades, für die sich Ziel-R und Break-even simulieren lassen (SL, bester Kurs und Risiko bekannt). */
export function simulatable(trades: SimTrade[]) {
  return closedTrades(trades).filter((t) => maxFavorableR(t) != null && riskOf(t) != null);
}

export type SweepPoint = {
  /** Ziel-R bzw. Auslöser in R */
  level: number;
  stats: ScenarioStats;
  /** Trades, deren Ausgang sich nicht sicher bestimmen lässt – dort zählt das tatsächliche Ergebnis */
  uncertain: number;
};

export type Sweep = {
  points: SweepPoint[];
  best: SweepPoint | null;
  baseline: ScenarioStats;
  /** Trades mit SL, bestem Kurs und Risiko */
  eligible: number;
  /** Trades ohne diese Daten – bleiben unverändert */
  skipped: number;
};

export const RR_LEVELS = Array.from({ length: 23 }, (_, i) => 0.5 + i * 0.25); // 0,5 … 6 R
export const BE_LEVELS = Array.from({ length: 11 }, (_, i) => 0.5 + i * 0.25); // 0,5 … 3 R

/**
 * Fester TP bei `target` R statt des tatsächlichen Ausstiegs.
 * - Bester Kurs ≥ Ziel → Gewinn von `target` R (der beste Kurs lag vor dem Ausstieg, also auch vor einem SL).
 * - Sonst, wenn der Trade am SL endete → derselbe Verlust.
 * - Sonst (vorher manuell oder am kleineren TP geschlossen) ist offen, ob das Ziel noch erreicht worden wäre:
 *   dann zählt das tatsächliche Ergebnis, und der Trade wird als „unsicher“ gezählt.
 */
export function targetOutcomes(trades: SimTrade[], target: number): { outcomes: Map<string, SimOutcome>; uncertain: number } {
  const outcomes = actualOutcomes(trades);
  let uncertain = 0;
  for (const t of simulatable(trades)) {
    const mfe = maxFavorableR(t)!;
    if (mfe >= target) {
      outcomes.set(t.id, { pnl: round2(target * riskOf(t)! + costsOf(t)), r: target });
    } else if (exitReason(t) !== "sl") {
      uncertain += 1;
    }
  }
  return { outcomes, uncertain };
}

/**
 * SL auf Einstand, sobald der Kurs `trigger` R im Plus war.
 * - Trigger erreicht und der Trade endete im Minus → der Kurs kam über den Einstand zurück: Ergebnis 0 R (nur Kosten).
 * - Trigger erreicht, Trade im Plus, aber der Kurs lag irgendwann unter dem Einstand → Reihenfolge unbekannt: unsicher.
 * - Sonst bleibt alles wie tatsächlich.
 */
export function breakevenOutcomes(trades: SimTrade[], trigger: number): { outcomes: Map<string, SimOutcome>; uncertain: number } {
  const outcomes = actualOutcomes(trades);
  let uncertain = 0;
  for (const t of simulatable(trades)) {
    if (maxFavorableR(t)! < trigger) continue;
    if (t.net_pnl! <= 0) outcomes.set(t.id, { pnl: round2(costsOf(t)), r: 0 });
    else if ((maxAdverseR(t) ?? 1) > 0) uncertain += 1;
  }
  return { outcomes, uncertain };
}

function sweep(
  trades: SimTrade[],
  levels: number[],
  simulate: (trades: SimTrade[], level: number) => { outcomes: Map<string, SimOutcome>; uncertain: number },
  startingBalance: number,
): Sweep {
  const eligible = simulatable(trades).length;
  const baseline = scenarioStats(trades, actualOutcomes(trades), startingBalance);
  const skipped = closedTrades(trades).length - eligible;
  if (!eligible) return { points: [], best: null, baseline, eligible, skipped };
  const points = levels.map((level) => {
    const { outcomes, uncertain } = simulate(trades, level);
    return { level, stats: scenarioStats(trades, outcomes, startingBalance), uncertain };
  });
  const best = points.reduce((a, b) => (b.stats.netPnl > a.stats.netPnl ? b : a));
  return { points, best, baseline, eligible, skipped };
}

export const rrSweep = (trades: SimTrade[], startingBalance: number) => sweep(trades, RR_LEVELS, targetOutcomes, startingBalance);
export const breakevenSweep = (trades: SimTrade[], startingBalance: number) =>
  sweep(trades, BE_LEVELS, breakevenOutcomes, startingBalance);
