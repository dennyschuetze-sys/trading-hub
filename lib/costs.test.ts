import { describe, expect, it } from "vitest";
import { summarizeCosts } from "./costs";

const cost = (firm: string, amount: number, currency = "USD", account_id: string | null = null) => ({ firm, amount, currency, account_id });

describe("summarizeCosts", () => {
  it("rechnet Netto und ROI je Währung", () => {
    const { byCurrency } = summarizeCosts(
      [cost("FTMO", 540, "EUR"), cost("FTMO", 90, "EUR"), cost("Apex", 167)],
      [cost("FTMO", 1260, "EUR"), cost("Apex", 100)],
    );
    const eur = byCurrency.find((c) => c.currency === "EUR")!;
    expect(eur).toMatchObject({ costs: 630, payouts: 1260, net: 630, costCount: 2, payoutCount: 1 });
    expect(eur.roi).toBe(1);
    const usd = byCurrency.find((c) => c.currency === "USD")!;
    expect(usd.net).toBe(-67);
    expect(usd.roi).toBeCloseTo(-0.4012, 4);
  });

  it("fasst Firmen unabhängig von Groß-/Kleinschreibung zusammen und zählt Accounts", () => {
    const { byFirm } = summarizeCosts(
      [cost("Apex", 35, "USD", "a1"), cost("apex ", 35, "USD", "a2"), cost("Apex", 85, "USD", "a1")],
      [cost("Apex", 500, "USD", "a1")],
    );
    expect(byFirm).toHaveLength(1);
    expect(byFirm[0]).toMatchObject({ firm: "Apex", costs: 155, payouts: 500, net: 345, accounts: 2 });
  });

  it("trennt dieselbe Firma nach Währung und kommt ohne Kosten aus", () => {
    const { byFirm } = summarizeCosts([cost("FTMO", 100, "EUR")], [cost("FTMO", 300, "USD")]);
    expect(byFirm).toHaveLength(2);
    expect(byFirm.find((f) => f.currency === "USD")!.roi).toBeNull();
  });

  it("vermeidet Rundungsfehler", () => {
    const { byCurrency } = summarizeCosts([cost("X", 0.1), cost("X", 0.2)], []);
    expect(byCurrency[0].costs).toBe(0.3);
  });
});
