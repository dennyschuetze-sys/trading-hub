import { describe, expect, it } from "vitest";
import {
  applyRules,
  breakevenOutcomes,
  compareCurve,
  describeRule,
  findBestScenario,
  ruleOutcomes,
  rrSweep,
  scenarioStats,
  targetOutcomes,
  type SimTrade,
} from "./simulator";

let seq = 0;
function trade(entry: string, exit: string, net: number, extra: Partial<SimTrade> = {}): SimTrade {
  seq += 1;
  return {
    id: `t${String(seq).padStart(3, "0")}`,
    account_id: "a1",
    symbol: "EURUSD",
    direction: "long",
    status: "closed",
    entry_time: entry,
    exit_time: exit,
    net_pnl: net,
    r_multiple: null,
    session: null,
    setup_quality: null,
    strategy_id: null,
    risk_amount: null,
    entry_price: null,
    exit_price: null,
    stop_loss: null,
    take_profit: null,
    best_price: null,
    worst_price: null,
    pnl: net,
    commission: 0,
    swap: 0,
    ...extra,
  };
}

/** Long-Trade mit Einstieg 100, SL 90 (1 R = 10 Punkte = 100 €). */
function priced(net: number, exit: number, best: number, worst: number, extra: Partial<SimTrade> = {}) {
  return trade("2026-09-01T08:00:00Z", "2026-09-01T09:00:00Z", net, {
    entry_price: 100,
    stop_loss: 90,
    exit_price: exit,
    best_price: best,
    worst_price: worst,
    risk_amount: 100,
    r_multiple: net / 100,
    ...extra,
  });
}

describe("applyRules", () => {
  it("schließt Symbole aus", () => {
    const a = trade("2026-09-01T08:00:00Z", "2026-09-01T09:00:00Z", 10);
    const b = trade("2026-09-01T10:00:00Z", "2026-09-01T11:00:00Z", -10, { symbol: "XAUUSD" });
    expect(applyRules([a, b], [{ kind: "symbol", value: "XAUUSD" }]).map((t) => t.id)).toEqual([a.id]);
  });

  it("begrenzt Trades pro Tag und zählt nur Trades, die die übrigen Regeln passieren", () => {
    const a = trade("2026-09-01T07:00:00Z", "2026-09-01T07:30:00Z", 10, { symbol: "XAUUSD" });
    const b = trade("2026-09-01T08:00:00Z", "2026-09-01T08:30:00Z", 10);
    const c = trade("2026-09-01T09:00:00Z", "2026-09-01T09:30:00Z", 10);
    const kept = applyRules([a, b, c], [{ kind: "maxPerDay", value: 1 }, { kind: "symbol", value: "XAUUSD" }]);
    expect(kept.map((t) => t.id)).toEqual([b.id]);
  });

  it("stoppt den Tag nach N Verlusten, aber erst nachdem der Verlust geschlossen ist", () => {
    const a = trade("2026-09-01T07:00:00Z", "2026-09-01T08:00:00Z", -10);
    const parallel = trade("2026-09-01T07:30:00Z", "2026-09-01T08:30:00Z", 10);
    const later = trade("2026-09-01T09:00:00Z", "2026-09-01T09:30:00Z", 10);
    const nextDay = trade("2026-09-02T07:00:00Z", "2026-09-02T07:30:00Z", 10);
    const kept = applyRules([a, parallel, later, nextDay], [{ kind: "stopAfterLosses", value: 1 }]);
    expect(kept.map((t) => t.id)).toEqual([a.id, parallel.id, nextDay.id]);
  });

  it("erkennt Positionen über Nacht und übers Wochenende", () => {
    const intraday = trade("2026-09-01T08:00:00Z", "2026-09-01T12:00:00Z", 10);
    const overnight = trade("2026-09-01T18:00:00Z", "2026-09-02T08:00:00Z", 10);
    const weekend = trade("2026-09-04T18:00:00Z", "2026-09-07T08:00:00Z", 10); // Freitag → Montag
    const all = [intraday, overnight, weekend];
    expect(applyRules(all, [{ kind: "overnight" }]).map((t) => t.id)).toEqual([intraday.id]);
    expect(applyRules(all, [{ kind: "weekend" }]).map((t) => t.id)).toEqual([intraday.id, overnight.id]);
  });
});

describe("compareCurve", () => {
  it("hält die Szenario-Kurve flach, wo ein Trade wegfällt", () => {
    const a = trade("2026-09-01T08:00:00Z", "2026-09-01T09:00:00Z", 50);
    const b = trade("2026-09-01T10:00:00Z", "2026-09-01T11:00:00Z", -30, { symbol: "XAUUSD" });
    const curve = compareCurve([a, b], ruleOutcomes([a, b], [{ kind: "symbol", value: "XAUUSD" }]), 1000);
    expect(curve.map((p) => [p.actual, p.scenario])).toEqual([
      [1000, 1000],
      [1050, 1050],
      [1020, 1050],
    ]);
  });
});

describe("findBestScenario", () => {
  it("findet die Regel, die die Verluste bringt, und bleibt über der Mindestanzahl", () => {
    const trades: SimTrade[] = [];
    for (let d = 1; d <= 14; d++) {
      const day = String(d).padStart(2, "0");
      trades.push(trade(`2026-08-${day}T08:00:00Z`, `2026-08-${day}T09:00:00Z`, d % 3 === 0 ? -20 : 40));
      trades.push(trade(`2026-08-${day}T10:00:00Z`, `2026-08-${day}T11:00:00Z`, -30, { symbol: "XAUUSD" }));
    }
    const result = findBestScenario(trades, 10000);
    expect(result.rules[0]).toEqual({ kind: "symbol", value: "XAUUSD" });
    expect(result.steps[0]).toMatchObject({ removed: 14, removedPnl: -420 });
    expect(result.stats.netPnl).toBeGreaterThan(result.baseline.netPnl);
    expect(result.stats.count).toBeGreaterThanOrEqual(12);
  });

  it("schlägt nichts vor, wenn keine Regel spürbar hilft", () => {
    const trades = Array.from({ length: 12 }, (_, i) =>
      trade(`2026-08-${String(i + 1).padStart(2, "0")}T08:00:00Z`, `2026-08-${String(i + 1).padStart(2, "0")}T09:00:00Z`, 10),
    );
    expect(findBestScenario(trades, 1000).rules).toEqual([]);
  });
});

describe("targetOutcomes", () => {
  it("wertet Trades mit genug Lauf als Gewinn und lässt offene Fälle unverändert", () => {
    const ranFar = priced(50, 105, 125, 98); // MFE 2,5 R, manuell bei 0,5 R raus
    const stopped = priced(-100, 90, 108, 90); // MFE 0,8 R, dann SL
    const earlyExit = priced(30, 103, 104, 99); // MFE 0,4 R, manuell raus → offen
    const { outcomes, uncertain } = targetOutcomes([ranFar, stopped, earlyExit], 2);
    expect(outcomes.get(ranFar.id)).toEqual({ pnl: 200, r: 2 });
    expect(outcomes.get(stopped.id)).toEqual({ pnl: -100, r: -1 });
    expect(outcomes.get(earlyExit.id)).toEqual({ pnl: 30, r: 0.3 });
    expect(uncertain).toBe(1);
  });

  it("findet im Sweep das beste Ziel-R", () => {
    const trades = [priced(50, 105, 130, 98), priced(-100, 90, 120, 90), priced(-100, 90, 101, 90)];
    const sweep = rrSweep(trades, 10000);
    expect(sweep.eligible).toBe(3);
    expect(sweep.best?.level).toBe(2);
    expect(sweep.best?.stats.netPnl).toBe(300);
  });
});

describe("breakevenOutcomes", () => {
  it("macht aus zurückgelaufenen Verlusttrades Einstand", () => {
    const reversed = priced(-100, 90, 115, 90, { commission: -4, pnl: -96, net_pnl: -100 });
    const clean = priced(200, 120, 120, 100); // nie unter Einstand
    const dipped = priced(200, 120, 120, 95); // Reihenfolge unklar
    const { outcomes, uncertain } = breakevenOutcomes([reversed, clean, dipped], 1);
    expect(outcomes.get(reversed.id)).toEqual({ pnl: -4, r: 0 });
    expect(outcomes.get(clean.id)?.pnl).toBe(200);
    expect(uncertain).toBe(1);
  });
});

describe("scenarioStats / describeRule", () => {
  it("rechnet Ergebnis in Prozent vom Startkapital", () => {
    const a = trade("2026-09-01T08:00:00Z", "2026-09-01T09:00:00Z", 50, { r_multiple: 1 });
    const b = trade("2026-09-01T10:00:00Z", "2026-09-01T11:00:00Z", -25, { r_multiple: -0.5 });
    const s = scenarioStats([a, b], ruleOutcomes([a, b], []), 1000);
    expect(s).toEqual({ count: 2, netPnl: 25, winRate: 0.5, avgR: 0.25, returnPct: 0.025 });
  });

  it("beschreibt Regeln auf Deutsch", () => {
    expect(describeRule({ kind: "maxPerDay", value: 2 })).toBe("Max. 2 Trades pro Tag");
    expect(describeRule({ kind: "weekday", value: 5 })).toBe("Nicht am Freitag");
  });
});
