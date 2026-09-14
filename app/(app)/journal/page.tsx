import Link from "next/link";
import { ChevronLeft, ChevronRight, NotebookPen, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SelectField } from "@/components/forms/field";
import { PageHeader } from "@/components/layout/page-header";
import { loadViolations } from "@/lib/risk-queries";
import type { Violation } from "@/lib/risk-rules";
import { berlinParts } from "@/lib/stats";
import { createClient } from "@/lib/supabase/server";
import { dayBoundary } from "@/lib/trading";
import { JournalTable } from "./journal-table";

const PAGE_SIZE = 50;

function param(value: string | string[] | undefined) {
  return typeof value === "string" && value !== "" ? value : undefined;
}

export default async function JournalPage({ searchParams }: PageProps<"/journal">) {
  const sp = await searchParams;
  const filters = {
    account: param(sp.account),
    symbol: param(sp.symbol),
    direction: param(sp.direction),
    result: param(sp.result),
    from: param(sp.from),
    to: param(sp.to),
    strategy: param(sp.strategy),
  };
  const page = Math.max(1, Number(param(sp.page) ?? 1) || 1);

  const supabase = await createClient();

  let query = supabase
    .from("trades")
    .select("id, symbol, direction, status, entry_time, quantity, net_pnl, r_multiple, setup_quality, mistakes, account_id, accounts(name, currency), strategies(name), trade_screenshots(count)", {
      count: "exact",
    })
    .eq("is_backtest", false)
    .order("entry_time", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  if (filters.account) query = query.eq("account_id", filters.account);
  if (filters.symbol) query = query.ilike("symbol", `%${filters.symbol}%`);
  if (filters.direction) query = query.eq("direction", filters.direction);
  if (filters.result === "win") query = query.gt("net_pnl", 0);
  if (filters.result === "loss") query = query.lt("net_pnl", 0);
  if (filters.from) query = query.gte("entry_time", dayBoundary(filters.from, "start"));
  if (filters.to) query = query.lte("entry_time", dayBoundary(filters.to, "end"));
  if (filters.strategy === "none") query = query.is("strategy_id", null);
  else if (filters.strategy) query = query.eq("strategy_id", filters.strategy);

  const [{ data: trades, count }, { data: accounts }, { data: strategies }] = await Promise.all([
    query,
    supabase.from("accounts").select("id, name").order("name"),
    supabase.from("strategies").select("id, name").order("name"),
  ]);

  // Regelverstöße für die Tage dieser Seite
  const entryTimes = (trades ?? []).map((t) => t.entry_time).sort();
  const { violations } = entryTimes.length
    ? await loadViolations(supabase, {
        entryFrom: dayBoundary(berlinParts(entryTimes[0]).date, "start"),
        entryTo: dayBoundary(berlinParts(entryTimes.at(-1)!).date, "end"),
      })
    : { violations: new Map<string, Violation[]>() };

  const total = count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasFilters = Object.values(filters).some(Boolean);
  const pageLink = (p: number) => {
    const qs = new URLSearchParams(
      Object.entries({ ...filters, page: String(p) }).filter((e): e is [string, string] => Boolean(e[1])),
    );
    return `/journal?${qs}`;
  };

  return (
    <>
      <PageHeader title="Journal" description={`${total} ${total === 1 ? "Trade" : "Trades"}`}>
        <Button asChild>
          <Link href={filters.account ? `/journal/new?account=${filters.account}` : "/journal/new"}>
            <Plus className="size-4" /> Neuer Trade
          </Link>
        </Button>
      </PageHeader>

      <Card className="mb-4">
        <CardContent>
          <form className="grid gap-3 sm:grid-cols-2 md:grid-cols-4 xl:grid-cols-8" action="/journal">
            <SelectField
              id="account"
              aria-label="Account"
              options={(accounts ?? []).map((a) => ({ value: a.id, label: a.name }))}
              placeholder="Alle Accounts"
              defaultValue={filters.account ?? ""}
            />
            <SelectField
              id="strategy"
              aria-label="Strategie"
              options={[
                { value: "none", label: "Ohne Strategie" },
                ...(strategies ?? []).map((s) => ({ value: s.id, label: s.name })),
              ]}
              placeholder="Alle Strategien"
              defaultValue={filters.strategy ?? ""}
            />
            <Input name="symbol" placeholder="Symbol" aria-label="Symbol" defaultValue={filters.symbol} />
            <SelectField
              id="direction"
              aria-label="Richtung"
              options={[
                { value: "long", label: "Long" },
                { value: "short", label: "Short" },
              ]}
              placeholder="Long & Short"
              defaultValue={filters.direction ?? ""}
            />
            <SelectField
              id="result"
              aria-label="Ergebnis"
              options={[
                { value: "win", label: "Gewinner" },
                { value: "loss", label: "Verlierer" },
              ]}
              placeholder="Alle Ergebnisse"
              defaultValue={filters.result ?? ""}
            />
            <Input name="from" type="date" aria-label="Von" defaultValue={filters.from} />
            <Input name="to" type="date" aria-label="Bis" defaultValue={filters.to} />
            <div className="flex gap-2">
              <Button type="submit" variant="secondary" className="flex-1">
                Filtern
              </Button>
              {hasFilters && (
                <Button variant="ghost" asChild>
                  <Link href="/journal">Zurücksetzen</Link>
                </Button>
              )}
            </div>
          </form>
        </CardContent>
      </Card>

      {!trades?.length ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <NotebookPen className="size-8 text-muted-foreground" />
            <p className="font-medium">{hasFilters ? "Keine Trades für diese Filter" : "Noch keine Trades"}</p>
            {!hasFilters && (
              <Button asChild>
                <Link href="/journal/new">Ersten Trade erfassen</Link>
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <JournalTable
          strategies={strategies ?? []}
          rows={trades.map((t) => ({
            id: t.id,
            symbol: t.symbol,
            direction: t.direction,
            status: t.status,
            entry_time: t.entry_time,
            quantity: t.quantity,
            net_pnl: t.net_pnl,
            r_multiple: t.r_multiple,
            setup_quality: t.setup_quality,
            mistakes: t.mistakes,
            accountName: t.accounts?.name ?? "",
            currency: t.accounts?.currency ?? "USD",
            strategyName: t.strategies?.name ?? null,
            screenshots: t.trade_screenshots[0]?.count ?? 0,
            violations: (violations.get(t.id) ?? []).map((v) => v.message),
          }))}
        />
      )}

      {pages > 1 && (
        <div className="mt-4 flex items-center justify-center gap-2 text-sm">
          <Button variant="outline" size="icon" asChild disabled={page <= 1}>
            <Link href={pageLink(Math.max(1, page - 1))} aria-label="Vorherige Seite">
              <ChevronLeft className="size-4" />
            </Link>
          </Button>
          <span className="tabular-nums">
            Seite {page} von {pages}
          </span>
          <Button variant="outline" size="icon" asChild disabled={page >= pages}>
            <Link href={pageLink(Math.min(pages, page + 1))} aria-label="Nächste Seite">
              <ChevronRight className="size-4" />
            </Link>
          </Button>
        </div>
      )}
    </>
  );
}
