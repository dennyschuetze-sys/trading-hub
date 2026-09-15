import type { BreakdownRow } from "@/lib/stats";

// Automatische Erkenntnisse aus den vorhandenen Aufschlüsselungen. Nur echte Werte, keine Schätzungen.

export type Insight = {
  tone: "good" | "warn";
  title: string;
  /** Belege: Trades, Winrate, Netto (Betrag wird von der Seite formatiert) */
  row: BreakdownRow;
};

/** Gruppen mit weniger Trades gelten als Zufall und werden nicht bewertet. */
export const MIN_TRADES = 3;

const eligible = (rows: BreakdownRow[]) => rows.filter((r) => r.count >= MIN_TRADES);
const best = (rows: BreakdownRow[]) => eligible(rows).sort((a, b) => b.netPnl - a.netPnl)[0];
const worst = (rows: BreakdownRow[]) => eligible(rows).sort((a, b) => a.netPnl - b.netPnl)[0];

export function tradingInsights(b: {
  session: BreakdownRow[];
  hour: BreakdownRow[];
  direction: BreakdownRow[];
  weekday: BreakdownRow[];
  holdTime: BreakdownRow[];
  exitReason?: BreakdownRow[];
}): Insight[] {
  const insights: Insight[] = [];
  const good = (title: string, row: BreakdownRow | undefined) => row && row.netPnl > 0 && insights.push({ tone: "good", title, row });
  const warn = (title: string, row: BreakdownRow | undefined) => row && row.netPnl < 0 && insights.push({ tone: "warn", title, row });

  const session = best(b.session);
  good(`Beste Session: ${session?.label}`, session);
  const hour = best(b.hour);
  good(`Beste Einstiegszeit: ${hour?.label}`, hour);

  const [long, short] = ["long", "short"].map((k) => b.direction.find((r) => r.key === k && r.count >= MIN_TRADES));
  if (long && short && long.netPnl !== short.netPnl) {
    const better = long.netPnl > short.netPnl ? long : short;
    good(`${better.label} performt besser als ${better === long ? short.label : long.label}`, better);
  }

  const weekdayBest = best(b.weekday);
  good(`Stärkster Tag: ${weekdayBest?.label}`, weekdayBest);
  const weekdayWorst = worst(b.weekday);
  warn(`${weekdayWorst?.label} ist der schwächste Tag`, weekdayWorst);

  const hold = worst(b.holdTime);
  warn(`Haltedauer ${hold?.label} ist verlustreich`, hold);

  // Größtes Verbesserungspotenzial: schwächste Stunde oder Session, falls noch nicht genannt
  const potential = [worst(b.hour), worst(b.session)]
    .filter((r): r is BreakdownRow => r != null && r.netPnl < 0)
    .sort((a, c) => a.netPnl - c.netPnl)[0];
  if (potential) warn(`Größtes Potenzial: ${potential.label}`, potential);

  return insights;
}
