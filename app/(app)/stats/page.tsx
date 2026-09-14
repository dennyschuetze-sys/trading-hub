import Link from "next/link";
import { BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BreakdownTable } from "@/components/charts/breakdown-table";
import { DailyPnlChart } from "@/components/charts/daily-pnl-chart";
import { EquityChart } from "@/components/charts/equity-chart";
import { longDate } from "@/components/charts/format";
import { PnlCalendar } from "@/components/charts/pnl-calendar";
import { StatTile } from "@/components/charts/stat-tile";
import { PageHeader } from "@/components/layout/page-header";
import { fetchStatTrades } from "@/lib/queries";
import { RANGES, rangeStart, resolveScope, scopeOptions } from "@/lib/scope";
import { closeTime, closedTrades, dailyResults, equityCurve, maxDrawdown, standardBreakdowns, summarize } from "@/lib/stats";
import { createClient } from "@/lib/supabase/server";
import { formatMoney, formatNumber, formatR, plural } from "@/lib/trading";
import { FilterBar } from "./filter-bar";

const param = (v: string | string[] | undefined) => (typeof v === "string" && v ? v : undefined);

function formatDuration(minutes: number | null) {
  if (minutes == null) return "–";
  if (minutes < 60) return `${minutes} Min.`;
  const h = Math.floor(minutes / 60);
  if (h < 48) return `${h} Std. ${minutes % 60} Min.`;
  return `${Math.round(h / 24)} Tage`;
}

export default async function StatsPage({ searchParams }: PageProps<"/stats">) {
  const sp = await searchParams;
  const range = RANGES.some((r) => r.value === sp.range) ? (sp.range as string) : "all";
  const direction = param(sp.direction) === "long" || param(sp.direction) === "short" ? param(sp.direction)! : "";

  const supabase = await createClient();
  const [{ data: accounts }, { data: strategies }] = await Promise.all([
    supabase.from("accounts").select("id, name, currency, starting_balance, status").order("name"),
    supabase.from("strategies").select("id, name"),
  ]);
  const allTrades = await fetchStatTrades(supabase);
  const scope = resolveScope(accounts ?? [], param(sp.scope), allTrades);

  if (!scope) {
    return (
      <>
        <PageHeader title="Statistiken" />
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <BarChart3 className="size-8 text-muted-foreground" />
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
  const scoped = allTrades.filter(
    (t) => scope.accountIds.includes(t.account_id) && (!direction || t.direction === direction),
  );
  const before = start ? closedTrades(scoped).filter((t) => closeTime(t) < start) : [];
  const trades = start ? scoped.filter((t) => closeTime(t) >= start) : scoped;

  // Kontostand zu Beginn des Zeitraums, damit Kurve und Drawdown stimmen
  const periodStartBalance = scope.startingBalance + before.reduce((s, t) => s + (t.net_pnl ?? 0), 0);
  const s = summarize(trades);
  const curve = equityCurve(trades, periodStartBalance);
  const dd = maxDrawdown(curve);
  const days = dailyResults(trades);
  const b = standardBreakdowns(trades, new Map((strategies ?? []).map((st) => [st.id, st.name])));
  const money = (v: number | null, signed = false) => formatMoney(v, scope.currency, signed);
  const pct = (v: number | null) => (v == null ? "–" : `${formatNumber(v * 100, 1)} %`);
  const rangeLabel = RANGES.find((r) => r.value === range)!.label;

  const dayTable = days.reduce<(typeof days[number] & { balance: number })[]>((rows, d) => {
    const previous = rows.at(-1)?.balance ?? periodStartBalance;
    return [...rows, { ...d, balance: Math.round((previous + d.pnl) * 100) / 100 }];
  }, []);

  return (
    <>
      <PageHeader title="Statistiken" description={`${scope.label} · ${rangeLabel}`} />
      <FilterBar scopes={scopeOptions(accounts ?? [])} scope={scope.value} range={range} direction={direction} />

      {s.count === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <BarChart3 className="size-8 text-muted-foreground" />
            <p className="font-medium">Keine abgeschlossenen Trades in diesem Zeitraum</p>
            <p className="text-sm text-muted-foreground">Wähle einen längeren Zeitraum oder einen anderen Account.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6">
          <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6" aria-label="Kennzahlen">
            <StatTile
              label="Netto P&L"
              value={money(s.netPnl, true)}
              tone={s.netPnl > 0 ? "profit" : s.netPnl < 0 ? "loss" : null}
              hint={`${plural(s.count, "Trade", "Trades")} · ${plural(s.tradingDays, "Tag", "Tage")}`}
            />
            <StatTile label="Winrate" value={pct(s.winRate)} hint={`${s.wins} Gewinner · ${s.losses} Verlierer`} />
            <StatTile
              label="Profit Factor"
              value={s.profitFactor == null ? "–" : formatNumber(s.profitFactor, 2)}
              hint="Bruttogewinn ÷ Bruttoverlust"
            />
            <StatTile label="Ø pro Trade" value={money(s.expectancy, true)} hint="Erwartungswert" />
            <StatTile
              label="Ø R-Multiple"
              value={formatR(s.avgR)}
              hint={s.rCount ? `aus ${s.rCount} Trades mit Risiko` : "Risiko bei Trades eintragen"}
            />
            <StatTile
              label="Max. Drawdown"
              value={money(dd.amount ? -dd.amount : 0)}
              hint={dd.amount ? `${pct(dd.percent)} vom Höchststand` : "Kein Rückgang"}
            />
          </section>

          <div className="grid gap-6 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Equity-Kurve</CardTitle>
                <CardDescription>
                  Kontostand nach jedem Trade · {money(periodStartBalance)} → {money(curve.at(-1)?.balance ?? periodStartBalance)}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <EquityChart points={curve} startingBalance={periodStartBalance} currency={scope.currency} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Tagesergebnisse</CardTitle>
                <CardDescription>Netto P&L je Handelstag (Berliner Zeit)</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3">
                <DailyPnlChart days={days} currency={scope.currency} />
                <details className="text-sm">
                  <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Als Tabelle anzeigen</summary>
                  <div className="mt-2 max-h-72 overflow-auto rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Tag</TableHead>
                          <TableHead className="text-right">Trades</TableHead>
                          <TableHead className="text-right">Netto</TableHead>
                          <TableHead className="text-right">Kontostand</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {[...dayTable].reverse().map((d) => (
                          <TableRow key={d.date}>
                            <TableCell>{longDate(d.date)}</TableCell>
                            <TableCell className="text-right tabular-nums">{d.count}</TableCell>
                            <TableCell className="text-right tabular-nums">{money(d.pnl, true)}</TableCell>
                            <TableCell className="text-right tabular-nums">{money(d.balance)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </details>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <Card>
              <CardHeader>
                <CardTitle>Kalender</CardTitle>
              </CardHeader>
              <CardContent>
                <PnlCalendar days={days} currency={scope.currency} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Details</CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  {(
                    [
                      ["Bruttogewinn", money(s.grossProfit)],
                      ["Bruttoverlust", money(s.grossLoss)],
                      ["Ø Gewinner", money(s.avgWin)],
                      ["Ø Verlierer", money(s.avgLoss)],
                      ["Größter Gewinner", money(s.largestWin)],
                      ["Größter Verlierer", money(s.largestLoss)],
                      ["Gewinnserie (max.)", `${s.maxWinStreak} ${s.maxWinStreak === 1 ? "Trade" : "Trades"}`],
                      ["Verlustserie (max.)", `${s.maxLossStreak} ${s.maxLossStreak === 1 ? "Trade" : "Trades"}`],
                      ["Breakeven-Trades", String(s.breakeven)],
                      ["Ø Haltedauer", formatDuration(s.avgHoldMinutes)],
                      ["Bester Tag", days.length ? money(Math.max(...days.map((d) => d.pnl)), true) : "–"],
                      ["Schlechtester Tag", days.length ? money(Math.min(...days.map((d) => d.pnl)), true) : "–"],
                    ] as const
                  ).map(([label, value]) => (
                    <div key={label} className="contents">
                      <dt className="text-muted-foreground">{label}</dt>
                      <dd className="text-right tabular-nums">{value}</dd>
                    </div>
                  ))}
                </dl>
              </CardContent>
            </Card>
          </div>

          <section className="grid gap-6 lg:grid-cols-2" aria-label="Auswertungen">
            <BreakdownTable title="Nach Strategie" rows={b.strategy} currency={scope.currency} />
            <BreakdownTable title="Nach Symbol" rows={b.symbol} currency={scope.currency} />
            <BreakdownTable title="Nach Richtung" rows={b.direction} currency={scope.currency} />
            <BreakdownTable title="Nach Session" rows={b.session} currency={scope.currency} />
            <BreakdownTable title="Nach Wochentag" rows={b.weekday} currency={scope.currency} />
            <BreakdownTable title="Nach Einstiegsuhrzeit" rows={b.hour} currency={scope.currency} />
            <BreakdownTable
              title="Nach Setup-Qualität"
              rows={b.setupQuality}
              currency={scope.currency}
              emptyText="Trage bei deinen Trades die Setup-Qualität ein (A+ bis C)."
            />
            <BreakdownTable
              title="Nach Emotion"
              rows={b.emotion}
              currency={scope.currency}
              emptyText="Trage bei deinen Trades die Emotion ein."
            />
            <BreakdownTable
              title="Plan eingehalten?"
              rows={b.followedPlan}
              currency={scope.currency}
              emptyText="Markiere bei deinen Trades, ob du den Plan eingehalten hast."
            />
            <BreakdownTable title="Fehler" rows={b.mistakes} currency={scope.currency} />
          </section>
        </div>
      )}
    </>
  );
}
