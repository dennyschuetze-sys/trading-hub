import Link from "next/link";
import { AlertTriangle, BarChart3, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BreakdownBars } from "@/components/charts/breakdown-bars";
import { BreakdownTable } from "@/components/charts/breakdown-table";
import { DailyPnlChart } from "@/components/charts/daily-pnl-chart";
import { EquityPanel } from "@/components/charts/equity-chart";
import { longDate } from "@/components/charts/format";
import { HourHeatmap } from "@/components/charts/hour-heatmap";
import { PnlCalendar } from "@/components/charts/pnl-calendar";
import { RDistributionChart } from "@/components/charts/r-distribution-chart";
import { StatSection, StatStrip, StatTile } from "@/components/charts/stat-tile";
import { PageHeader } from "@/components/layout/page-header";
import { tradingInsights } from "@/lib/insights";
import { fetchDetailTrades } from "@/lib/queries";
import { loadViolations } from "@/lib/risk-queries";
import { hasAnyRule, ruleBreakdowns } from "@/lib/risk-rules";
import { RANGES, rangeStart, resolveScope, scopeOptions } from "@/lib/scope";
import { closeTime, closedTrades, dailyResults, equityCurve, maxDrawdown, standardBreakdowns, summarize } from "@/lib/stats";
import {
  REVENGE_MINUTES,
  advancedStats,
  detailBreakdowns,
  revengeTrades,
  riskPercents,
  streakContext,
  tradeNumberOfDay,
} from "@/lib/trade-analysis";
import { createClient } from "@/lib/supabase/server";
import { formatMoney, formatNumber, formatR, plural } from "@/lib/trading";
import { cn } from "@/lib/utils";
import { FilterBar } from "./filter-bar";

const param = (v: string | string[] | undefined) => (typeof v === "string" && v ? v : undefined);

function formatDuration(minutes: number | null) {
  if (minutes == null) return "–";
  if (minutes < 60) return `${minutes} Min.`;
  const h = Math.floor(minutes / 60);
  if (h < 48) return `${h} Std. ${minutes % 60} Min.`;
  return `${Math.round(h / 24)} Tage`;
}

const toneOf = (v: number | null) => (v == null || v === 0 ? null : v > 0 ? "profit" : "loss");

export default async function StatsPage({ searchParams }: PageProps<"/stats">) {
  const sp = await searchParams;
  const range = RANGES.some((r) => r.value === sp.range) ? (sp.range as string) : "all";
  const direction = param(sp.direction) === "long" || param(sp.direction) === "short" ? param(sp.direction)! : "";

  const supabase = await createClient();
  const [{ data: accounts }, { data: strategies }] = await Promise.all([
    supabase.from("accounts").select("id, name, currency, starting_balance, status").order("name"),
    supabase.from("strategies").select("id, name"),
  ]);
  const allTrades = await fetchDetailTrades(supabase);
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
  const inScope = allTrades.filter((t) => scope.accountIds.includes(t.account_id));
  const scoped = inScope.filter((t) => !direction || t.direction === direction);
  const before = start ? closedTrades(scoped).filter((t) => closeTime(t) < start) : [];
  const trades = start ? scoped.filter((t) => closeTime(t) >= start) : scoped;

  // Kontostand zu Beginn des Zeitraums, damit Kurve und Drawdown stimmen
  const periodStartBalance = scope.startingBalance + before.reduce((s, t) => s + (t.net_pnl ?? 0), 0);
  const s = summarize(trades);
  const curve = equityCurve(trades, periodStartBalance);
  const dd = maxDrawdown(curve);
  const days = dailyResults(trades);
  const b = standardBreakdowns(trades, new Map((strategies ?? []).map((st) => [st.id, st.name])));
  // Tagesnummer, Revenge, Serien und Kontostand hängen von allen Trades der Accounts ab, nicht nur vom Filter
  const riskPct = riskPercents(inScope, new Map((accounts ?? []).map((a) => [a.id, a.starting_balance])));
  const x = advancedStats(trades, riskPct);
  const revenge = revengeTrades(inScope);
  const db = detailBreakdowns(trades, {
    tradeNumbers: tradeNumberOfDay(inScope),
    revenge,
    streaks: streakContext(inScope),
  });
  const closed = closedTrades(trades);
  const revengeCount = closed.filter((t) => revenge.has(t.id)).length;
  const symbols = new Set(trades.map((t) => t.symbol));
  const singleStop = symbols.size === 1 ? x.stopBySymbol[0] : undefined;
  const exitTotal = x.exits.sl + x.exits.tp + x.exits.manual;
  const pctOf = (n: number, total: number) => (total ? `${Math.round((n / total) * 100)} %` : "–");
  // Verstöße über alle Trades berechnen (Tageszählung braucht auch Trades außerhalb des Filters)
  const { violations, rules } = await loadViolations(supabase, {}, { trades: allTrades });
  const ruleRows = ruleBreakdowns(trades, violations);
  const money = (v: number | null, signed = false) => formatMoney(v, scope.currency, signed);
  const pct = (v: number | null) => (v == null ? "–" : `${formatNumber(v * 100, 1)} %`);
  const rangeLabel = RANGES.find((r) => r.value === range)!.label;

  const dayTable = days.reduce<(typeof days[number] & { balance: number })[]>((rows, d) => {
    const previous = rows.at(-1)?.balance ?? periodStartBalance;
    return [...rows, { ...d, balance: Math.round((previous + d.pnl) * 100) / 100 }];
  }, []);

  // Equity-Kurve mit R je Trade für die R-Ansicht
  const rById = new Map(trades.map((t) => [t.id, t.r_multiple]));
  const equityPoints = curve.map((p) => ({ time: p.time, balance: p.balance, pnl: p.pnl, r: p.tradeId ? (rById.get(p.tradeId) ?? null) : null }));

  const insights = tradingInsights({ ...b, holdTime: db.holdTime, exitReason: db.exitReason });

  // Disziplin: nur aus erfassten Werten, sonst „nicht erfasst“
  const withPlan = closed.filter((t) => t.followed_plan != null);
  const planKept = withPlan.filter((t) => t.followed_plan).length;
  const ruleKept = ruleRows.compliance.find((r) => r.key === "kept")?.count ?? 0;
  const withMistakes = closed.filter((t) => t.mistakes.length > 0).length;
  const topEmotion = [...b.emotion].sort((a, c) => c.count - a.count)[0];
  const withBreakeven = closed.filter((t) => t.moved_to_breakeven != null);
  const movedToBreakeven = withBreakeven.filter((t) => t.moved_to_breakeven).length;

  return (
    <>
      <PageHeader title="Statistiken" description={`${scope.label} · ${rangeLabel} · ${plural(s.count, "Trade", "Trades")}`} />
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
        <div className="grid gap-12">
          {/* PERFORMANCE ------------------------------------------------------------------ */}
          <StatSection title="Performance">
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4 xl:grid-cols-[1.6fr_repeat(4,minmax(0,1fr))]">
              <StatTile
                size="hero"
                className="col-span-2 lg:col-span-4 xl:col-span-1"
                label="Netto P&L"
                value={money(s.netPnl, true)}
                tone={toneOf(s.netPnl)}
                hint={`${plural(s.count, "Trade", "Trades")} · ${plural(s.tradingDays, "Tag", "Tage")} · Bruttogewinn ${money(s.grossProfit)} · Bruttoverlust ${money(s.grossLoss)}`}
              >
                <div className="mt-3 flex flex-wrap gap-2">
                  <span
                    className={cn(
                      "rounded-full px-2.5 py-0.5 text-xs font-medium tabular-nums",
                      s.avgR != null && s.avgR < 0 ? "bg-loss/15 text-loss" : "bg-profit/15 text-profit",
                    )}
                  >
                    {formatR(s.avgR)} / Trade
                  </span>
                  {periodStartBalance > 0 && (
                    <span className="rounded-full bg-foreground/5 px-2.5 py-0.5 text-xs font-medium text-muted-foreground tabular-nums">
                      {s.netPnl > 0 ? "+" : ""}
                      {formatNumber((s.netPnl / periodStartBalance) * 100, 2)} %
                    </span>
                  )}
                </div>
              </StatTile>
              <StatTile label="Winrate" value={pct(s.winRate)} hint={`${s.wins} Gewinner · ${s.losses} Verlierer`}>
                <div className="mt-3 flex h-1 overflow-hidden rounded-full bg-foreground/5" aria-hidden>
                  <div className="bg-profit" style={{ width: `${(s.winRate ?? 0) * 100}%` }} />
                  <div className="bg-loss/60" style={{ width: `${s.count ? (s.losses / s.count) * 100 : 0}%` }} />
                </div>
              </StatTile>
              <StatTile
                label="Profit Factor"
                value={s.profitFactor == null ? "–" : formatNumber(s.profitFactor, 2)}
                hint={`Ø Gewinner ${money(s.avgWin)} · Ø Verlierer ${money(s.avgLoss)}`}
              />
              <StatTile
                label="Ø R / Trade"
                value={formatR(s.avgR)}
                tone={toneOf(s.avgR)}
                hint={`${s.rCount ? `aus ${s.rCount} Trades mit Risiko` : "Risiko bei Trades eintragen"} · Ø ${money(s.expectancy, true)}`}
              />
              <StatTile
                label="Max. Drawdown"
                value={money(dd.amount ? -dd.amount : 0)}
                tone={dd.amount ? "loss" : null}
                hint={dd.amount ? `${pct(dd.percent)} vom Höchststand` : "Kein Rückgang"}
              />
            </div>

            <StatStrip
              items={[
                {
                  label: "Ø SL-Größe",
                  value: singleStop ? `${formatNumber(singleStop.avg, 1)} ${singleStop.unit}` : "–",
                  muted: !singleStop,
                  hint: singleStop
                    ? `${singleStop.symbol} · ${plural(singleStop.count, "Trade", "Trades")}`
                    : x.stopBySymbol.length
                      ? "Mehrere Symbole – siehe Trade-Management"
                      : "Stop Loss eintragen",
                },
                {
                  label: "Ø geplantes CRV",
                  value: x.plan.avgPlannedRR == null ? "–" : `1 : ${formatNumber(x.plan.avgPlannedRR, 2)}`,
                  muted: x.plan.avgPlannedRR == null,
                  hint: x.plan.count ? `erreicht Ø ${formatR(x.plan.avgR)}` : "SL und TP eintragen",
                },
                {
                  label: "Ø Risiko",
                  value: x.risk.avgPct == null ? "–" : `${formatNumber(x.risk.avgPct * 100, 2)} %`,
                  muted: x.risk.avgPct == null,
                  hint: x.risk.count
                    ? `${formatNumber(x.risk.minPct! * 100, 2)}–${formatNumber(x.risk.maxPct! * 100, 2)} % · ${plural(x.risk.oversized, "Übergröße", "Übergrößen")}`
                    : "Risiko eintragen",
                },
                {
                  label: "Ø Kosten",
                  value: x.costs.avgR == null ? "–" : `${formatNumber(x.costs.avgR, 2)} R`,
                  muted: x.costs.avgR == null,
                  hint: x.costs.shareOfGross == null ? "Kommission + Swap" : `${pct(x.costs.shareOfGross)} vom Bruttogewinn`,
                },
                {
                  label: "Ø max. mögl. R",
                  value: formatR(x.mfe.avgMfeR),
                  muted: x.mfe.avgMfeR == null,
                  hint: x.mfe.count
                    ? `Ø Gegenlauf ${x.mfe.avgMaeR == null ? "–" : `${formatNumber(x.mfe.avgMaeR, 2)} R`}`
                    : "Besten Kurs eintragen",
                },
                {
                  label: "Exit-Effizienz",
                  value: pct(x.mfe.avgEfficiency),
                  muted: x.mfe.avgEfficiency == null,
                  hint: x.mfe.givenBackR == null ? "Besten Kurs eintragen" : `${formatNumber(x.mfe.givenBackR, 1)} R liegen gelassen`,
                },
              ]}
            />

            <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
              <Card className="gap-4 py-5">
                <CardHeader className="px-5">
                  <CardTitle className="text-sm font-semibold">Equity-Kurve</CardTitle>
                  <CardDescription className="text-xs">Kontostand nach jedem Trade</CardDescription>
                </CardHeader>
                <CardContent className="px-5">
                  <EquityPanel points={equityPoints} startingBalance={periodStartBalance} currency={scope.currency} height={320} />
                </CardContent>
              </Card>

              <Card className="gap-2 py-5">
                <CardHeader className="px-5">
                  <CardTitle className="text-sm font-semibold">Trading Insights</CardTitle>
                  <CardDescription className="text-xs">Automatisch aus deinen Statistiken · ab 3 Trades je Gruppe</CardDescription>
                </CardHeader>
                <CardContent className="px-5">
                  {insights.length ? (
                    <ul className="divide-y divide-border">
                      {insights.map((insight) => (
                        <li key={insight.title} className="flex gap-3 py-3">
                          <span
                            className={cn(
                              "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md",
                              insight.tone === "good" ? "bg-profit/15 text-profit" : "bg-warning/15 text-warning",
                            )}
                          >
                            {insight.tone === "good" ? (
                              <CheckCircle2 className="size-3.5" aria-label="Stärke" />
                            ) : (
                              <AlertTriangle className="size-3.5" aria-label="Schwäche" />
                            )}
                          </span>
                          <div className="min-w-0">
                            <p className="text-sm font-medium">{insight.title}</p>
                            <p className="text-xs text-muted-foreground tabular-nums">
                              {plural(insight.row.count, "Trade", "Trades")} · {Math.round(insight.row.winRate * 100)} % Winrate ·{" "}
                              <span className={insight.row.netPnl > 0 ? "text-profit" : "text-loss"}>{money(insight.row.netPnl, true)}</span>
                              {insight.row.avgR != null && ` · ${formatR(insight.row.avgR)}`}
                            </p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="py-3 text-sm text-muted-foreground">Für belastbare Erkenntnisse braucht es mehr Trades je Session, Uhrzeit und Wochentag.</p>
                  )}
                </CardContent>
              </Card>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <Card className="gap-4 py-5">
                <CardHeader className="px-5">
                  <CardTitle className="text-sm font-semibold">R-Verteilung</CardTitle>
                  <CardDescription className="text-xs">Ergebnisse in 1-R-Schritten · Erwartungswert {formatR(s.avgR)} pro Trade</CardDescription>
                </CardHeader>
                <CardContent className="px-5">
                  <RDistributionChart buckets={x.rBuckets} />
                </CardContent>
              </Card>
              <Card className="gap-4 py-5">
                <CardHeader className="px-5">
                  <CardTitle className="text-sm font-semibold">Tagesergebnisse</CardTitle>
                  <CardDescription className="text-xs">
                    Netto P&L je Handelstag (Berliner Zeit)
                    {days.length > 0 &&
                      ` · bester ${money(Math.max(...days.map((d) => d.pnl)), true)} · schlechtester ${money(Math.min(...days.map((d) => d.pnl)), true)}`}
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-3 px-5">
                  <DailyPnlChart days={days} currency={scope.currency} />
                  <details className="text-sm">
                    <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">Als Tabelle anzeigen</summary>
                    <div className="mt-2 max-h-72 overflow-auto rounded-lg border">
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
                              <TableCell className={cn("text-right font-medium tabular-nums", d.pnl > 0 ? "text-profit" : d.pnl < 0 ? "text-loss" : "")}>
                                {money(d.pnl, true)}
                              </TableCell>
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
          </StatSection>

          {/* ANALYSE ---------------------------------------------------------------------- */}
          <StatSection title="Analyse" hint="Wann und was funktioniert">
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
              <Card className="gap-4 py-5">
                <CardHeader className="px-5">
                  <CardTitle className="text-sm font-semibold">Einstiegszeit</CardTitle>
                  <CardDescription className="text-xs">Netto P&L je Stunde (Berliner Zeit)</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-5 px-5">
                  <HourHeatmap rows={b.hour} currency={scope.currency} />
                  <div className="grid gap-2 border-t pt-5">
                    <p className="text-sm font-semibold">Nach Wochentag</p>
                    <BreakdownBars rows={b.weekday} currency={scope.currency} />
                  </div>
                </CardContent>
              </Card>
              <Card className="gap-4 py-5">
                <CardHeader className="px-5">
                  <CardTitle className="text-sm font-semibold">Kalender</CardTitle>
                </CardHeader>
                <CardContent className="px-5">
                  <PnlCalendar days={days} currency={scope.currency} />
                </CardContent>
              </Card>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <Card className="gap-4 py-5">
                <CardHeader className="px-5">
                  <CardTitle className="text-sm font-semibold">Nach Session</CardTitle>
                </CardHeader>
                <CardContent className="px-5">
                  <BreakdownBars rows={b.session} currency={scope.currency} />
                </CardContent>
              </Card>
              <Card className="gap-4 py-5">
                <CardHeader className="px-5">
                  <CardTitle className="text-sm font-semibold">Nach Richtung</CardTitle>
                </CardHeader>
                <CardContent className="px-5">
                  <BreakdownBars rows={b.direction} currency={scope.currency} />
                </CardContent>
              </Card>
              <Card className="gap-4 py-5 md:col-span-2 xl:col-span-1">
                <CardHeader className="px-5">
                  <CardTitle className="text-sm font-semibold">Details</CardTitle>
                </CardHeader>
                <CardContent className="px-5">
                  <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-2.5 text-sm">
                    {(
                      [
                        ["Größter Gewinner", money(s.largestWin), "text-profit"],
                        ["Größter Verlierer", money(s.largestLoss), "text-loss"],
                        ["Gewinnserie (max.)", plural(s.maxWinStreak, "Trade", "Trades"), ""],
                        ["Verlustserie (max.)", plural(s.maxLossStreak, "Trade", "Trades"), ""],
                        ["Breakeven-Trades", String(s.breakeven), ""],
                        ["Ø Haltedauer", formatDuration(s.avgHoldMinutes), ""],
                        ["Bester Tag", days.length ? money(Math.max(...days.map((d) => d.pnl)), true) : "–", "text-profit"],
                        ["Schlechtester Tag", days.length ? money(Math.min(...days.map((d) => d.pnl)), true) : "–", "text-loss"],
                      ] as const
                    ).map(([label, value, className]) => (
                      <div key={label} className="contents">
                        <dt className="text-muted-foreground">{label}</dt>
                        <dd className={cn("text-right font-medium tabular-nums", value !== "–" && className)}>{value}</dd>
                      </div>
                    ))}
                  </dl>
                </CardContent>
              </Card>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <BreakdownTable title="Nach Strategie" firstColumn="Strategie" rows={b.strategy} currency={scope.currency} />
              <BreakdownTable title="Nach Symbol" firstColumn="Symbol" rows={b.symbol} currency={scope.currency} />
              <BreakdownTable title="Nach Einstiegsuhrzeit" firstColumn="Uhrzeit" rows={b.hour} currency={scope.currency} />
              <BreakdownTable title="Nach Wochentag" firstColumn="Tag" rows={b.weekday} currency={scope.currency} />
            </div>
          </StatSection>

          {/* TRADE-VERHALTEN ---------------------------------------------------------------- */}
          <StatSection title="Trade-Verhalten" hint="Disziplin & Psychologie">
            <StatStrip
              columns={3}
              title="Trade Discipline"
              description="Aus den Angaben bei deinen Trades"
              items={[
                {
                  label: "Plan eingehalten",
                  value: withPlan.length ? pctOf(planKept, withPlan.length) : "nicht erfasst",
                  muted: !withPlan.length,
                  hint: withPlan.length ? `${planKept} von ${plural(withPlan.length, "Trade", "Trades")}` : "Bei Trades markieren",
                },
                {
                  label: "Regeln eingehalten",
                  value: hasAnyRule(rules) ? pctOf(ruleKept, closed.length) : "keine Regeln",
                  muted: !hasAnyRule(rules),
                  hint: hasAnyRule(rules) ? `${ruleKept} von ${plural(closed.length, "Trade", "Trades")}` : "Unter Risiko-Tools festlegen",
                },
                {
                  label: "Trades mit Fehlern",
                  value: pctOf(withMistakes, closed.length),
                  tone: withMistakes ? "loss" : null,
                  hint: `${withMistakes} von ${plural(closed.length, "Trade", "Trades")} mit Fehler-Tag`,
                },
                {
                  label: "Häufigste Emotion",
                  value: topEmotion ? topEmotion.label : "nicht erfasst",
                  muted: !topEmotion,
                  hint: topEmotion ? `${plural(topEmotion.count, "Trade", "Trades")} · ${money(topEmotion.netPnl, true)}` : "Bei Trades eintragen",
                },
                {
                  label: "Revenge-Trades",
                  value: String(revengeCount),
                  tone: revengeCount ? "loss" : null,
                  hint: `≤ ${REVENGE_MINUTES} Min. nach einem Verlust`,
                },
                {
                  label: "SL auf Breakeven",
                  value: withBreakeven.length ? plural(movedToBreakeven, "Trade", "Trades") : "nicht erfasst",
                  muted: !withBreakeven.length,
                  hint: withBreakeven.length ? `von ${withBreakeven.length} erfassten` : "Bei Trades markieren",
                },
              ]}
            />

            <div className="grid gap-4 lg:grid-cols-2">
              {hasAnyRule(rules) && (
                <>
                  <BreakdownTable title="Persönliche Regeln" rows={ruleRows.compliance} currency={scope.currency} />
                  <BreakdownTable
                    title="Nach Regelverstoß"
                    firstColumn="Regel"
                    rows={ruleRows.byRule}
                    currency={scope.currency}
                    emptyText="Keine Regelverstöße in diesem Zeitraum."
                  />
                </>
              )}
              <BreakdownTable
                title="Revenge-Trades"
                description={`Einstieg ≤ ${REVENGE_MINUTES} Min. nach einem Verlust im selben Account`}
                rows={db.revenge}
                currency={scope.currency}
              />
              <BreakdownTable title="Fehler" firstColumn="Fehler" rows={b.mistakes} currency={scope.currency} />
              <BreakdownTable
                title="Nach Setup-Qualität"
                firstColumn="Qualität"
                rows={b.setupQuality}
                currency={scope.currency}
                emptyText="Trage bei deinen Trades die Setup-Qualität ein (A+ bis C)."
              />
              <BreakdownTable
                title="Nach Emotion"
                firstColumn="Emotion"
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
              <BreakdownTable
                title="Nach Einstiegs-Timeframe"
                firstColumn="Timeframe"
                rows={db.timeframe}
                currency={scope.currency}
                emptyText="Trage bei deinen Trades den Einstiegs-Timeframe ein."
              />
              <BreakdownTable
                title="Nach übergeordnetem Trend"
                rows={db.htfBias}
                currency={scope.currency}
                emptyText="Trage bei deinen Trades ein, ob du mit oder gegen den Trend gehandelt hast."
              />
              <BreakdownTable
                title="Nach Marktkontext"
                rows={db.marketContext}
                currency={scope.currency}
                emptyText="Trage bei deinen Trades den Marktkontext ein."
              />
            </div>
          </StatSection>

          {/* TRADE-MANAGEMENT ---------------------------------------------------------------- */}
          <StatSection title="Trade-Management" hint="Ausführung & Timing">
            <div className="grid gap-4 lg:grid-cols-2">
              <Card className="gap-4 py-5">
                <CardHeader className="px-5">
                  <CardTitle className="text-sm font-semibold">Ausführung</CardTitle>
                  <CardDescription className="text-xs">Wo du R liegen lässt – und wie knapp dein Stop war</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4 px-5">
                  {exitTotal > 0 && (
                    <div className="grid gap-2">
                      <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-full" aria-hidden>
                        <div className="bg-profit" style={{ flex: x.exits.tp }} />
                        <div className="bg-profit/45" style={{ flex: x.exits.manual }} />
                        <div className="bg-loss/75" style={{ flex: x.exits.sl }} />
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1.5">
                          <span className="size-2 rounded-sm bg-profit" aria-hidden /> Take Profit {pctOf(x.exits.tp, exitTotal)}
                        </span>
                        <span className="flex items-center gap-1.5">
                          <span className="size-2 rounded-sm bg-profit/45" aria-hidden /> Manuell {pctOf(x.exits.manual, exitTotal)}
                        </span>
                        <span className="flex items-center gap-1.5">
                          <span className="size-2 rounded-sm bg-loss/75" aria-hidden /> Stop Loss {pctOf(x.exits.sl, exitTotal)}
                        </span>
                      </div>
                    </div>
                  )}
                  <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-2.5 text-sm">
                    {(
                      [
                        ["Ausstieg am Take Profit", `${x.exits.tp} (${pctOf(x.exits.tp, exitTotal)})`],
                        ["Manuell geschlossen", `${x.exits.manual} (${pctOf(x.exits.manual, exitTotal)})`],
                        ["Ausstieg am Stop Loss", `${x.exits.sl} (${pctOf(x.exits.sl, exitTotal)})`],
                        ["Gewinner fast ausgestoppt (Gegenlauf ≥ 0,8 R)", String(x.mfe.winnersNearStop)],
                        ["Verlierer, die ≥ 1 R im Plus waren", String(x.mfe.losersWithOneR)],
                        [`Revenge-Trades (≤ ${REVENGE_MINUTES} Min. nach Verlust)`, String(revengeCount)],
                      ] as const
                    ).map(([label, value]) => (
                      <div key={label} className="contents">
                        <dt className="text-muted-foreground">{label}</dt>
                        <dd className="text-right font-medium tabular-nums">{value}</dd>
                      </div>
                    ))}
                  </dl>
                  {x.stopBySymbol.length > 0 && (
                    <div className="max-h-56 overflow-auto rounded-lg border">
                      <Table>
                        <TableHeader>
                          <TableRow className="hover:bg-transparent">
                            <TableHead className="h-8 text-[0.6875rem] tracking-[0.07em] text-muted-foreground uppercase">Symbol</TableHead>
                            <TableHead className="h-8 text-right text-[0.6875rem] tracking-[0.07em] text-muted-foreground uppercase">Ø SL-Größe</TableHead>
                            <TableHead className="h-8 text-right text-[0.6875rem] tracking-[0.07em] text-muted-foreground uppercase">Trades</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {x.stopBySymbol.map((row) => (
                            <TableRow key={row.symbol}>
                              <TableCell>{row.symbol}</TableCell>
                              <TableCell className="text-right font-medium tabular-nums">
                                {formatNumber(row.avg, 1)} {row.unit}
                              </TableCell>
                              <TableCell className="text-right tabular-nums text-muted-foreground">{row.count}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>
              <BreakdownTable
                title="Nach Ausstieg"
                firstColumn="Ausstieg"
                rows={db.exitReason}
                currency={scope.currency}
                emptyText="Trage bei deinen Trades Einstieg, Ausstieg und Stop Loss ein."
              />
              <BreakdownTable title="Nach Haltedauer" firstColumn="Dauer" description={`Ø ${formatDuration(s.avgHoldMinutes)}`} rows={db.holdTime} currency={scope.currency} />
              <BreakdownTable title="Nach Trade-Nr. am Tag" firstColumn="Trade" description="Ab wann wird es Overtrading?" rows={db.tradeOfDay} currency={scope.currency} />
              <BreakdownTable title="Trade-Serien" firstColumn="Situation" description="Ergebnis des nächsten Trades" rows={db.afterStreak} currency={scope.currency} />
              <BreakdownTable
                title="SL auf Breakeven gezogen?"
                rows={db.breakeven}
                currency={scope.currency}
                emptyText="Markiere bei deinen Trades, ob du den SL auf Breakeven gezogen hast."
              />
              <BreakdownTable
                title="Teilgewinne genommen?"
                rows={db.partialClose}
                currency={scope.currency}
                emptyText="Markiere bei deinen Trades, ob du Teilgewinne genommen hast."
              />
            </div>
          </StatSection>
        </div>
      )}
    </>
  );
}
