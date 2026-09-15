import { describe, expect, it } from "vitest";
import { compareVerdict, rStats, type RStats } from "./backtests";
import type { CoreTrade } from "./stats";

let seq = 0;
function trade(net: number, r: number | null, extra: Partial<CoreTrade> = {}): CoreTrade {
  seq += 1;
  const exit = new Date(Date.UTC(2026, 0, 1, 10, seq));
  return {
    id: `t${seq}`,
    symbol: "NQ",
    direction: "long",
    status: "closed",
    entry_time: new Date(exit.getTime() - 60000).toISOString(),
    exit_time: exit.toISOString(),
    net_pnl: net,
    r_multiple: r,
    session: null,
    setup_quality: null,
    emotion: null,
    mistakes: [],
    followed_plan: null,
    strategy_id: null,
    risk_amount: null,
    ...extra,
  };
}

describe("rStats", () => {
  it("rechnet Winrate und Kennzahlen in R", () => {
    const s = rStats([trade(200, 2), trade(-100, -1), trade(300, 3), trade(-100, -1), trade(50, null)]);
    expect(s.count).toBe(5);
    expect(s.winRate).toBe(0.6);
    expect(s.rCount).toBe(4);
    expect(s.avgR).toBe(0.75);
    expect(s.avgWinR).toBe(2.5);
    expect(s.avgLossR).toBe(-1);
    expect(s.profitFactorR).toBe(2.5);
  });

  it("ignoriert offene Trades und kommt ohne Daten aus", () => {
    const s = rStats([trade(100, 1, { status: "open" })]);
    expect(s).toMatchObject({ count: 0, winRate: null, avgR: null, profitFactorR: null });
  });
});

describe("compareVerdict", () => {
  const stats = (count: number, winRate: number, avgR: number): RStats => ({
    count,
    winRate,
    rCount: count,
    avgR,
    avgWinR: null,
    avgLossR: null,
    profitFactorR: null,
  });

  it("braucht genug Trades auf beiden Seiten", () => {
    expect(compareVerdict(stats(100, 0.5, 0.5), stats(19, 0.2, -1))).toBe("too_few");
  });

  it("erkennt schwächere und stärkere Live-Ergebnisse", () => {
    expect(compareVerdict(stats(50, 0.55, 0.6), stats(30, 0.44, 0.5))).toBe("weaker");
    expect(compareVerdict(stats(50, 0.55, 0.6), stats(30, 0.55, 0.25))).toBe("weaker");
    expect(compareVerdict(stats(50, 0.45, 0.3), stats(30, 0.47, 0.65))).toBe("stronger");
    expect(compareVerdict(stats(50, 0.5, 0.5), stats(30, 0.46, 0.4))).toBe("on_track");
  });
});
