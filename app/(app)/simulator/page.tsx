import Link from "next/link";
import { FlaskRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/page-header";
import { fetchDetailTrades } from "@/lib/queries";
import { RANGES, rangeStart, resolveScope, scopeOptions } from "@/lib/scope";
import type { SimTrade } from "@/lib/simulator";
import { closeTime, closedTrades } from "@/lib/stats";
import { revengeTrades } from "@/lib/trade-analysis";
import { createClient } from "@/lib/supabase/server";
import { plural } from "@/lib/trading";
import { FilterBar } from "../stats/filter-bar";
import { SimulatorView } from "./simulator-view";

const param = (v: string | string[] | undefined) => (typeof v === "string" && v ? v : undefined);

export default async function SimulatorPage({ searchParams }: PageProps<"/simulator">) {
  const sp = await searchParams;
  const range = RANGES.some((r) => r.value === sp.range) ? (sp.range as string) : "all";
  const direction = param(sp.direction) === "long" || param(sp.direction) === "short" ? param(sp.direction)! : "";

  const supabase = await createClient();
  const [{ data: accounts }, { data: strategies }] = await Promise.all([
    supabase.from("accounts").select("id, name, currency, starting_balance, status").order("name"),
    supabase.from("strategies").select("id, name"),
  ]);
  const allTrades = await fetchDetailTrades(supabase);
  // Standard: alle Accounts in der Währung des jüngsten Trades – ein einzelner Account hat oft zu wenige Trades
  const fallback = resolveScope(accounts ?? [], undefined, allTrades);
  const sameCurrency = (accounts ?? []).filter((a) => a.currency === fallback?.currency).length;
  const scope = resolveScope(
    accounts ?? [],
    param(sp.scope) ?? (fallback && sameCurrency > 1 ? `cur:${fallback.currency}` : undefined),
    allTrades,
  );

  if (!scope) {
    return (
      <>
        <PageHeader title="Simulator" />
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <FlaskRound className="size-8 text-muted-foreground" />
            <p className="font-medium">Noch keine Accounts</p>
            <Button asChild>
              <Link href="/accounts/new">Account anlegen</Link>
            </Button>
          </CardContent>
        </Card>
      </>
    );
  }

  const start = rangeStart(range);
  const inScope = allTrades.filter((t) => scope.accountIds.includes(t.account_id));
  const scoped = inScope.filter((t) => !direction || t.direction === direction);
  const before = start ? closedTrades(scoped).filter((t) => closeTime(t) < start) : [];
  const inRange = start ? scoped.filter((t) => closeTime(t) >= start) : scoped;
  const closed = closedTrades(inRange);
  const openCount = inRange.length - closed.length;
  const startingBalance = scope.startingBalance + before.reduce((s, t) => s + (t.net_pnl ?? 0), 0);
  // Revenge hängt von allen Trades des Accounts ab, nicht nur vom Filter
  const revenge = revengeTrades(inScope);

  const trades: SimTrade[] = closed.map((t) => ({
    id: t.id,
    account_id: t.account_id,
    symbol: t.symbol,
    direction: t.direction,
    status: t.status,
    entry_time: t.entry_time,
    exit_time: t.exit_time,
    net_pnl: t.net_pnl,
    r_multiple: t.r_multiple,
    session: t.session,
    setup_quality: t.setup_quality,
    strategy_id: t.strategy_id,
    risk_amount: t.risk_amount,
    entry_price: t.entry_price,
    exit_price: t.exit_price,
    stop_loss: t.stop_loss,
    take_profit: t.take_profit,
    best_price: t.best_price,
    worst_price: t.worst_price,
    pnl: t.pnl,
    commission: t.commission,
    swap: t.swap,
    revenge: revenge.has(t.id),
  }));

  const rangeLabel = RANGES.find((r) => r.value === range)!.label;

  return (
    <>
      <PageHeader
        title="Simulator"
        description={`${scope.label} · ${rangeLabel} · ${plural(closed.length, "Trade", "Trades")} – was wäre gewesen, wenn …`}
      />
      <FilterBar scopes={scopeOptions(accounts ?? [])} scope={scope.value} range={range} direction={direction} />
      {closed.length < 2 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <FlaskRound className="size-8 text-muted-foreground" />
            <p className="font-medium">Zu wenige abgeschlossene Trades für eine Simulation</p>
            <p className="text-sm text-muted-foreground">Wähle einen längeren Zeitraum oder einen anderen Account.</p>
          </CardContent>
        </Card>
      ) : (
        <SimulatorView
          // Neu rechnen, wenn sich der Filter ändert
          key={`${scope.value}|${range}|${direction}`}
          trades={trades}
          startingBalance={startingBalance}
          currency={scope.currency}
          openCount={openCount}
          strategies={(strategies ?? []).map((s) => [s.id, s.name] as [string, string])}
        />
      )}
    </>
  );
}
