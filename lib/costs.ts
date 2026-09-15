import type { Tables } from "@/lib/database.types";

export type AccountCost = Tables<"account_costs">;
export type Payout = Tables<"payouts">;

export const COST_KINDS = [
  { value: "challenge", label: "Challenge-Gebühr" },
  { value: "reset", label: "Reset / Neustart" },
  { value: "activation", label: "Aktivierungsgebühr" },
  { value: "subscription", label: "Abo / Monatsgebühr" },
  { value: "data", label: "Datenfeed / Plattform" },
  { value: "other", label: "Sonstiges" },
];

export type MoneyTotals = {
  currency: string;
  costs: number;
  payouts: number;
  net: number;
  /** Netto im Verhältnis zu den Kosten; null ohne Kosten */
  roi: number | null;
  costCount: number;
  payoutCount: number;
};

export type FirmTotals = MoneyTotals & { firm: string; accounts: number };

type CostLike = Pick<AccountCost, "firm" | "amount" | "currency" | "account_id">;
type PayoutLike = Pick<Payout, "firm" | "amount" | "currency" | "account_id">;

const round2 = (n: number) => Math.round(n * 100) / 100;

function finish<T extends Omit<MoneyTotals, "net" | "roi">>(t: T): T & Pick<MoneyTotals, "net" | "roi"> {
  const costs = round2(t.costs);
  const payouts = round2(t.payouts);
  const net = round2(payouts - costs);
  return { ...t, costs, payouts, net, roi: costs > 0 ? net / costs : null };
}

/**
 * Kosten gegen Auszahlungen – je Währung und je Firma (innerhalb einer Währung).
 * Beträge verschiedener Währungen werden nie zusammengerechnet.
 */
export function summarizeCosts(costs: CostLike[], payouts: PayoutLike[]) {
  const byCurrency = new Map<string, Omit<MoneyTotals, "net" | "roi">>();
  const byFirm = new Map<string, Omit<FirmTotals, "net" | "roi"> & { accountIds: Set<string> }>();

  const add = (entry: CostLike | PayoutLike, kind: "costs" | "payouts") => {
    const currency = byCurrency.get(entry.currency) ?? { currency: entry.currency, costs: 0, payouts: 0, costCount: 0, payoutCount: 0 };
    currency[kind] += entry.amount;
    currency[kind === "costs" ? "costCount" : "payoutCount"] += 1;
    byCurrency.set(entry.currency, currency);

    const firmName = entry.firm.trim();
    const key = `${firmName.toLowerCase()}|${entry.currency}`;
    const firm = byFirm.get(key) ?? {
      firm: firmName,
      currency: entry.currency,
      costs: 0,
      payouts: 0,
      costCount: 0,
      payoutCount: 0,
      accounts: 0,
      accountIds: new Set<string>(),
    };
    firm[kind] += entry.amount;
    firm[kind === "costs" ? "costCount" : "payoutCount"] += 1;
    if (entry.account_id) firm.accountIds.add(entry.account_id);
    byFirm.set(key, firm);
  };

  costs.forEach((c) => add(c, "costs"));
  payouts.forEach((p) => add(p, "payouts"));

  return {
    byCurrency: [...byCurrency.values()].map(finish).sort((a, b) => b.costs + b.payouts - (a.costs + a.payouts)),
    byFirm: [...byFirm.values()]
      .map(({ accountIds, ...f }) => finish({ ...f, accounts: accountIds.size }))
      .sort((a, b) => a.currency.localeCompare(b.currency) || b.net - a.net),
  };
}
