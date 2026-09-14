import { closeTime, type StatTrade } from "@/lib/stats";
import { dayBoundary, type Account } from "@/lib/trading";

export type ScopeAccount = Pick<Account, "id" | "name" | "currency" | "starting_balance" | "status">;

export type ScopeOption = { value: string; label: string };

export type ResolvedScope = {
  value: string;
  label: string;
  currency: string;
  accountIds: string[];
  startingBalance: number;
};

/**
 * Auswertungs-Bereich: ein einzelner Account oder alle Accounts einer Währung.
 * Beträge verschiedener Währungen werden nie zusammengerechnet.
 */
export function scopeOptions(accounts: ScopeAccount[]): ScopeOption[] {
  const byCurrency = new Map<string, ScopeAccount[]>();
  accounts.forEach((a) => byCurrency.set(a.currency, [...(byCurrency.get(a.currency) ?? []), a]));
  return [
    ...[...byCurrency.entries()]
      .filter(([, list]) => list.length > 1)
      .map(([currency, list]) => ({ value: `cur:${currency}`, label: `Alle ${currency}-Accounts (${list.length})` })),
    ...accounts.map((a) => ({ value: a.id, label: `${a.name} (${a.currency})` })),
  ];
}

export function resolveScope(
  accounts: ScopeAccount[],
  requested: string | undefined,
  trades: Pick<StatTrade, "account_id" | "entry_time" | "exit_time">[],
): ResolvedScope | null {
  if (!accounts.length) return null;

  const build = (list: ScopeAccount[], value: string, label: string): ResolvedScope => ({
    value,
    label,
    currency: list[0].currency,
    accountIds: list.map((a) => a.id),
    startingBalance: list.reduce((s, a) => s + a.starting_balance, 0),
  });

  if (requested?.startsWith("cur:")) {
    const currency = requested.slice(4);
    const list = accounts.filter((a) => a.currency === currency);
    if (list.length) return build(list, requested, `Alle ${currency}-Accounts`);
  }
  const direct = accounts.find((a) => a.id === requested);
  if (direct) return build([direct], direct.id, direct.name);

  // Standard: der Account mit dem jüngsten Trade, sonst der erste aktive
  const latest = [...trades].sort((a, b) => closeTime(b).localeCompare(closeTime(a)))[0];
  const fallback =
    accounts.find((a) => a.id === latest?.account_id) ?? accounts.find((a) => a.status === "active") ?? accounts[0];
  return build([fallback], fallback.id, fallback.name);
}

export const RANGES = [
  { value: "7d", label: "7 Tage" },
  { value: "30d", label: "30 Tage" },
  { value: "90d", label: "90 Tage" },
  { value: "mtd", label: "Dieser Monat" },
  { value: "ytd", label: "Dieses Jahr" },
  { value: "all", label: "Gesamt" },
] as const;

export type RangeValue = (typeof RANGES)[number]["value"];

/** Beginn des Zeitraums als ISO-Zeitpunkt (Berliner Tagesgrenzen) oder null für „Gesamt“. */
export function rangeStart(range: string | undefined, now = new Date()): string | null {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin" }).format(now); // YYYY-MM-DD
  const daysAgo = (n: number) => {
    const d = new Date(`${today}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - (n - 1));
    return dayBoundary(d.toISOString().slice(0, 10), "start");
  };
  switch (range) {
    case "7d":
      return daysAgo(7);
    case "30d":
      return daysAgo(30);
    case "90d":
      return daysAgo(90);
    case "mtd":
      return dayBoundary(`${today.slice(0, 8)}01`, "start");
    case "ytd":
      return dayBoundary(`${today.slice(0, 5)}01-01`, "start");
    default:
      return null;
  }
}
