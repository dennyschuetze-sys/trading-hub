import Link from "next/link";
import { FlaskConical, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/page-header";
import { BACKTEST_STATUSES, rStats } from "@/lib/backtests";
import { fetchBacktestTrades } from "@/lib/queries";
import { summarize } from "@/lib/stats";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatMoney, formatR, labelFor } from "@/lib/trading";
import { cn } from "@/lib/utils";
import { BacktestNav } from "./backtest-nav";

export default async function BacktestingPage() {
  const supabase = await createClient();
  const [{ data: sessions }, trades] = await Promise.all([
    supabase
      .from("backtest_sessions")
      .select("*, strategies(name)")
      .order("status", { ascending: false })
      .order("updated_at", { ascending: false }),
    fetchBacktestTrades(supabase),
  ]);

  return (
    <>
      <PageHeader title="Backtesting" description="Strategien im Replay testen, getrennt von deinen Live-Daten.">
        <Button asChild>
          <Link href="/backtesting/new">
            <Plus className="size-4" /> Neue Session
          </Link>
        </Button>
      </PageHeader>
      <BacktestNav active="/backtesting" />

      {!sessions?.length ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <FlaskConical className="size-8 text-muted-foreground" />
            <p className="font-medium">Noch keine Backtest-Session</p>
            <p className="max-w-md text-sm text-muted-foreground">
              Eine Session ist ein Testlauf: eine Strategie, ein Markt, ein Zeitraum. Die Trades erfasst du mit derselben Maske
              wie im Journal – sie tauchen aber nicht in deinen Live-Statistiken auf.
            </p>
            <Button asChild>
              <Link href="/backtesting/new">Erste Session anlegen</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {sessions.map((session) => {
            const own = trades.filter((t) => t.backtest_session_id === session.id);
            const s = summarize(own);
            const r = rStats(own);
            return (
              <Link key={session.id} href={`/backtesting/${session.id}`} className="group">
                <Card className={cn("h-full transition-colors group-hover:border-foreground/20", session.status === "done" && "opacity-80")}>
                  <CardHeader>
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="truncate">{session.name}</CardTitle>
                      <Badge variant={session.status === "running" ? "secondary" : "outline"}>
                        {labelFor(BACKTEST_STATUSES, session.status)}
                      </Badge>
                    </div>
                    <CardDescription className="truncate">
                      {session.strategies?.name ?? "Ohne Strategie"}
                      {(session.period_from || session.period_to) &&
                        ` · ${formatDate(session.period_from)} – ${formatDate(session.period_to)}`}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-3">
                    <dl className="grid grid-cols-4 gap-2 text-sm">
                      <div>
                        <dt className="text-xs text-muted-foreground">Trades</dt>
                        <dd className="font-semibold">{s.count}</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-muted-foreground">Winrate</dt>
                        <dd className="font-semibold">{s.winRate == null ? "–" : `${Math.round(s.winRate * 100)} %`}</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-muted-foreground">Ø R</dt>
                        <dd className="font-semibold">{formatR(r.avgR)}</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-muted-foreground">Netto</dt>
                        <dd className="truncate font-semibold">{s.count ? formatMoney(s.netPnl, session.currency, true) : "–"}</dd>
                      </div>
                    </dl>
                    {(session.symbols.length > 0 || session.timeframe) && (
                      <div className="flex flex-wrap gap-1.5">
                        {[...session.symbols, ...(session.timeframe ? [session.timeframe] : [])].slice(0, 6).map((m) => (
                          <Badge key={m} variant="outline" className="font-normal">
                            {m}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
