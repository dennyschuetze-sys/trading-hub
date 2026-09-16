import { describe, expect, it } from "vitest";
import { documentation, previewTrade, readDraft } from "./trade-preview";

function form(values: Record<string, string | string[]>) {
  const fd = new FormData();
  for (const [key, value] of Object.entries(values)) {
    for (const v of Array.isArray(value) ? value : [value]) fd.append(key, v);
  }
  return fd;
}

const closedLong = {
  symbol: "xauusd",
  direction: "long",
  status: "closed",
  entry_time: "2026-09-15T13:12:00.000Z",
  exit_time: "2026-09-15T14:47:00.000Z",
  quantity: "0,30",
  entry_price: "2501.25",
  exit_price: "2510.50",
  stop_loss: "2498.00",
  take_profit: "2512.00",
  best_price: "2512.40",
  worst_price: "2499.10",
  pnl: "290,42",
  commission: "-3,50",
};

describe("readDraft", () => {
  it("liest deutsche Zahlen, Ja/Nein, Tags und Mehrfachauswahl", () => {
    const d = readDraft(form({ ...closedLong, followed_plan: "false", tags: "Breakout, FVG,", mistakes: ["Overtrading", "News ignoriert"] }));
    expect(d.symbol).toBe("XAUUSD");
    expect(d.quantity).toBe(0.3);
    expect(d.pnl).toBe(290.42);
    expect(d.followedPlan).toBe(false);
    expect(d.tags).toEqual(["Breakout", "FVG"]);
    expect(d.mistakes).toEqual(["Overtrading", "News ignoriert"]);
  });

  it("ignoriert unfertige Zahlen und Ausstiegsfelder offener Trades", () => {
    const d = readDraft(form({ ...closedLong, status: "open", pnl: "-" }));
    expect(d.pnl).toBeNull();
    expect(d.exitPrice).toBeNull();
    expect(d.exitTime).toBeNull();
  });
});

describe("previewTrade", () => {
  it("rechnet Netto und R wie die Datenbank mit eingetragenem Risiko", () => {
    const p = previewTrade(readDraft(form({ ...closedLong, risk_amount: "100" })));
    expect(p.netPnl).toBe(286.92);
    expect(p.costs).toBe(-3.5);
    expect(p.risk).toBe(100);
    expect(p.riskEstimated).toBe(false);
    expect(p.rMultiple).toBe(2.87);
    expect(p.costsR).toBe(-0.04);
    expect(p.holdMinutes).toBe(95);
    expect(p.plannedRR).toBe(3.31);
    expect(p.mfeR).toBe(3.43);
    expect(p.maeR).toBe(0.66);
    expect(p.stop).toEqual({ value: 32.5, unit: "Pips" });
  });

  it("schätzt das Risiko ohne Eingabe wie beim Speichern", () => {
    const p = previewTrade(readDraft(form(closedLong)));
    // 3,25 Punkte SL × (290,42 ÷ 9,25 Punkte Bewegung)
    expect(p.risk).toBe(102.04);
    expect(p.riskEstimated).toBe(true);
    expect(p.rMultiple).toBe(2.81);
  });

  it("zeigt bei Short-Verlierern negative Werte und ohne Ergebnis nichts", () => {
    const short = previewTrade(
      readDraft(form({ ...closedLong, direction: "short", entry_price: "2510", stop_loss: "2515", exit_price: "2515", pnl: "-150", commission: "", risk_amount: "150" })),
    );
    expect(short.rMultiple).toBe(-1);
    expect(short.netPnl).toBe(-150);

    const empty = previewTrade(readDraft(form({ symbol: "EURUSD", status: "open" })));
    expect(empty.netPnl).toBeNull();
    expect(empty.rMultiple).toBeNull();
    expect(empty.risk).toBeNull();
  });
});

describe("documentation", () => {
  it("zählt nur zutreffende Felder und nennt die fehlenden", () => {
    const draft = readDraft(form({ ...closedLong, risk_amount: "100", notes: "Sauberer Spring" }));
    const doc = documentation(draft, { criteriaAvailable: false, screenshots: 0 });
    expect(doc.missing).toEqual([
      "Timeframe",
      "HTF-Trend",
      "Marktkontext",
      "Strategie",
      "Setup-Qualität",
      "Emotion",
      "Plan eingehalten",
      "Bewertung",
      "Breakeven",
      "Teilgewinne",
      "Lessons Learned",
      "Screenshot",
    ]);
    expect(doc.percent).toBe(43);

    // Offener Trade: Ausstieg, Ergebnis und Management zählen nicht
    const open = documentation(readDraft(form({ symbol: "NQ", status: "open" })), { criteriaAvailable: true, screenshots: 1 });
    expect(open.missing).not.toContain("Ausstiegskurs");
    expect(open.missing).toContain("Einstiegskriterium");
  });
});
