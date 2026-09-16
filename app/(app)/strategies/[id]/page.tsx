import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CheckSquare, Crosshair, FileText, FlaskConical, Pencil, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BreakdownTable } from "@/components/charts/breakdown-table";
import { EquityChart } from "@/components/charts/equity-chart";
import { StatTile } from "@/components/charts/stat-tile";
import { Markdown } from "@/components/markdown";
import { extractStoragePaths, signStoragePaths } from "@/lib/note-images";
import { fetchStatTrades } from "@/lib/queries";
import { breakdown, checklistBreakdowns, closeTime, closedTrades, equityCurve, maxDrawdown, standardBreakdowns, summarize } from "@/lib/stats";
import { STRATEGY_STATUSES, excerpt } from "@/lib/strategies";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatDateTime, formatMoney, formatNumber, formatR, labelFor, plural, pnlClass } from "@/lib/trading";
import { cn } from "@/lib/utils";

export default async function StrategyPage({ params, searchParams }: PageProps<"/strategies/[id]">) {
  const { id } = await params;
  const { cur } = await searchParams;
  const supabase = await createClient();

  const { data: strategy } = await supabase.from("strategies").select("*").eq("id", id).maybeSingle();
  if (!strategy) notFound();

  const [{ data: checklist }, { data: notes }, { data: accounts }, allTrades, { data: backtests }, { data: criteria }] = await Promise.all([
    supabase.from("strategy_checklist_items").select("id, label").eq("strategy_id", id).order("position"),
    supabase.from("playbook_notes").select("id, title, content, updated_at").eq("strategy_id", id).order("updated_at", { ascending: false }),
    supabase.from("accounts").select("id, name, currency"),
    fetchStatTrades(supabase),
    supabase.from("backtest_sessions").select("id, name, status, trades(count)").eq("strategy_id", id).order("updated_at", { ascending: false }),
    supabase.from("trades").select("id, entry_criterion").eq("strategy_id", id).eq("is_backtest", false).not("entry_criterion", "is", null),
  ]);

  const currencyOf = new Map((accounts ?? []).map((a) => [a.id, a.currency]));
  const nameOf = new Map((accounts ?? []).map((a) => [a.id, a.name]));
  const strategyTrades = allTrades.filter((t) => t.strategy_id === id);

  // Beträge nur innerhalb einer Währung auswerten; Standard: Währung mit den meisten Trades
  const counts = new Map<string, number>();
  strategyTrades.forEach((t) => {
    const c = currencyOf.get(t.account_id) ?? "USD";
    counts.set(c, (counts.get(c) ?? 0) + 1);
  });
  const currencies = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);
  const currency = typeof cur === "string" && counts.has(cur) ? cur : (currencies[0] ?? "USD");
  const trades = strategyTrades.filter((t) => (currencyOf.get(t.account_id) ?? "USD") === currency);

  const { data: results } = trades.length
    ? await supabase
        .from("trade_checklist_results")
        .select("trade_id, item_id, checked")
        .in("trade_id", trades.map((t) => t.id).slice(0, 1000))
    : { data: [] };

  const s = summarize(trades);
  const curve = equityCurve(trades, 0);
  const dd = maxDrawdown(curve.map((p) => ({ balance: p.balance })));
  const b = standardBreakdowns(trades);
  const cb = checklistBreakdowns(trades, checklist ?? [], results ?? []);
  const criterionOf = new Map((criteria ?? []).map((t) => [t.id, t.entry_criterion]));
  const byCriterion = breakdown(trades, (t) => criterionOf.get(t.id) ?? null);
  const money = (v: number | null, signed = false) => formatMoney(v, currency, signed);
  const recent = closedTrades(trades).reverse().slice(0, 8);

  const imageUrls = await signStoragePaths(
    supabase,
    extractStoragePaths(strategy.entry_rules, strategy.exit_rules, strategy.risk_rules, strategy.notes),
  );

  const rules = [
    ["Einstieg", strategy.entry_rules],
    ["Ausstieg", strategy.exit_rules],
    ["Risiko & Money Management", strategy.risk_rules],
    ["Notizen & Beispiele", strategy.notes],
  ] as const;

  return (
    <div className="grid gap-6">
      <div className="grid gap-3">
        <Link href="/strategies" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> Strategien
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="grid gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">{strategy.name}</h1>
              <Badge variant={strategy.status === "active" ? "secondary" : "outline"}>
                {labelFor(STRATEGY_STATUSES, strategy.status)}
              </Badge>
            </div>
            {strategy.summary && <p className="text-muted-foreground">{strategy.summary}</p>}
            {(strategy.markets.length > 0 || strategy.timeframes.length > 0) && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {strategy.markets.map((m) => (
                  <Badge key={m} variant="outline">
                    {m}
                  </Badge>
                ))}
                {strategy.timeframes.map((tf) => (
                  <Badge key={tf} variant="outline" className="font-normal">
                    {tf}
                  </Badge>
                ))}
              </div>
            )}
          </div>
          <Button variant="outline" asChild>
            <Link href={`/strategies/${id}/edit`}>
              <Pencil className="size-4" /> Bearbeiten
            </Link>
          </Button>
        </div>
      </div>

      {currencies.length > 1 && (
        <div className="flex flex-wrap items-center gap-1 text-sm" role="group" aria-label="Währung">
          <span className="mr-1 text-muted-foreground">Auswertung in</span>
          {currencies.map((c) => (
            <Link
              key={c}
              href={`/strategies/${id}?cur=${c}`}
              className={cn("rounded-md border px-2.5 py-1", c === currency ? "bg-secondary font-medium" : "text-muted-foreground")}
            >
              {c}
            </Link>
          ))}
        </div>
      )}

      {s.count > 0 ? (
        <>
          <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6" aria-label="Kennzahlen der Strategie">
            <StatTile label="Netto P&L" value={money(s.netPnl, true)} tone={s.netPnl > 0 ? "profit" : s.netPnl < 0 ? "loss" : null} hint={plural(s.count, "Trade", "Trades")} />
            <StatTile label="Winrate" value={s.winRate == null ? "–" : `${formatNumber(s.winRate * 100, 1)} %`} hint={`${s.wins} / ${s.losses}`} />
            <StatTile label="Profit Factor" value={s.profitFactor == null ? "–" : formatNumber(s.profitFactor, 2)} />
            <StatTile label="Ø pro Trade" value={money(s.expectancy, true)} />
            <StatTile label="Ø R-Multiple" value={formatR(s.avgR)} hint={s.rCount ? `aus ${s.rCount} Trades` : "Risiko eintragen"} />
            <StatTile label="Max. Drawdown" value={money(dd.amount ? -dd.amount : 0)} hint="der kumulierten P&L" />
          </section>

          <div className="grid gap-6 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Kumulierte P&L</CardTitle>
                <CardDescription>Summe aller Trades dieser Strategie in {currency}</CardDescription>
              </CardHeader>
              <CardContent>
                <EquityChart points={curve} startingBalance={0} currency={currency} height={240} />
              </CardContent>
            </Card>
            <BreakdownTable
              title="Regeltreue"
              rows={cb.compliance}
              currency={currency}
              emptyText="Hake beim Erfassen die Checkliste ab, dann siehst du hier, ob sich Regeltreue auszahlt."
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            {cb.missed.length > 0 && (
              <BreakdownTable title="Wenn dieser Punkt NICHT erfüllt war" rows={cb.missed} currency={currency} />
            )}
            <BreakdownTable
              title="Nach Einstiegskriterium"
              rows={byCriterion}
              currency={currency}
              emptyText="Wähle beim Erfassen das Einstiegskriterium, dann siehst du hier, welcher Einstieg am besten läuft."
            />
            <BreakdownTable title="Nach Symbol" rows={b.symbol} currency={currency} />
            <BreakdownTable title="Nach Session" rows={b.session} currency={currency} />
            <BreakdownTable title="Nach Setup-Qualität" rows={b.setupQuality} currency={currency} emptyText="Noch keine Setup-Qualität erfasst." />
          </div>
        </>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-8 text-center text-sm text-muted-foreground">
            <p className="font-medium text-foreground">Noch keine Trades mit dieser Strategie</p>
            <p>Wähle die Strategie beim Erfassen eines Trades oder weise sie im Journal mehreren Trades gleichzeitig zu.</p>
            <Button variant="outline" size="sm" asChild className="mt-2">
              <Link href="/journal">Zum Journal</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="grid content-start gap-6">
          {rules.some(([, body]) => body?.trim()) ? (
            rules.map(
              ([title, body]) =>
                body?.trim() && (
                  <Card key={title}>
                    <CardHeader>
                      <CardTitle>{title}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <Markdown content={body} imageUrls={imageUrls} />
                    </CardContent>
                  </Card>
                ),
            )
          ) : (
            <Card>
              <CardContent className="py-8 text-center text-sm text-muted-foreground">
                Noch keine Regeln aufgeschrieben.{" "}
                <Link href={`/strategies/${id}/edit`} className="underline underline-offset-4 hover:text-foreground">
                  Jetzt ergänzen
                </Link>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="grid content-start gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Crosshair className="size-4" /> Einstiegskriterien
              </CardTitle>
            </CardHeader>
            <CardContent>
              {strategy.entry_criteria.length ? (
                <div className="flex flex-wrap gap-1.5">
                  {strategy.entry_criteria.map((c) => (
                    <Badge key={c} variant="outline" className="font-normal">
                      {c}
                    </Badge>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Keine Einstiegskriterien hinterlegt.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckSquare className="size-4" /> Checkliste
              </CardTitle>
            </CardHeader>
            <CardContent>
              {checklist?.length ? (
                <ol className="grid gap-2 text-sm">
                  {checklist.map((item, i) => (
                    <li key={item.id} className="flex gap-2">
                      <span className="w-5 shrink-0 text-right text-muted-foreground tabular-nums">{i + 1}.</span>
                      {item.label}
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-sm text-muted-foreground">Keine Checkliste hinterlegt.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="flex items-center gap-2">
                  <FileText className="size-4" /> Artikel
                </CardTitle>
                <Button variant="ghost" size="sm" asChild>
                  <Link href={`/strategies/notes/new?strategy=${id}`}>
                    <Plus className="size-4" /> Neu
                  </Link>
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {notes?.length ? (
                <ul className="grid gap-3">
                  {notes.map((n) => (
                    <li key={n.id}>
                      <Link href={`/strategies/notes/${n.id}`} className="group grid gap-0.5">
                        <span className="font-medium group-hover:underline">{n.title}</span>
                        <span className="line-clamp-1 text-xs text-muted-foreground">
                          {formatDate(n.updated_at)} {n.content && `· ${excerpt(n.content, 80)}`}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">Noch keine Artikel zu dieser Strategie.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="flex items-center gap-2">
                  <FlaskConical className="size-4" /> Backtests
                </CardTitle>
                <Button variant="ghost" size="sm" asChild>
                  <Link href={`/backtesting/new?strategy=${id}`}>
                    <Plus className="size-4" /> Neu
                  </Link>
                </Button>
              </div>
            </CardHeader>
            <CardContent className="grid gap-3 text-sm">
              {backtests?.length ? (
                <>
                  <ul className="grid gap-2">
                    {backtests.map((b) => (
                      <li key={b.id}>
                        <Link href={`/backtesting/${b.id}`} className="flex items-baseline justify-between gap-2 hover:underline">
                          <span className="truncate font-medium">{b.name}</span>
                          <span className="shrink-0 text-xs text-muted-foreground">
                            {plural(b.trades[0]?.count ?? 0, "Trade", "Trades")}
                            {b.status === "done" && " · fertig"}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                  <Link href="/backtesting/compare" className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground">
                    Mit Live-Trades vergleichen
                  </Link>
                </>
              ) : (
                <p className="text-muted-foreground">Noch kein Backtest zu dieser Strategie.</p>
              )}
            </CardContent>
          </Card>

          {recent.length > 0 && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <CardTitle>Letzte Trades</CardTitle>
                  <Button variant="ghost" size="sm" asChild>
                    <Link href={`/journal?strategy=${id}`}>Alle</Link>
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <ul className="divide-y text-sm">
                  {recent.map((t) => (
                    <li key={t.id}>
                      <Link href={`/journal/${t.id}`} className="flex items-center justify-between gap-2 py-2 hover:bg-muted/40">
                        <span className="min-w-0">
                          <span className="font-medium">{t.symbol}</span>{" "}
                          <span className="text-muted-foreground">{t.direction === "long" ? "Long" : "Short"}</span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {formatDateTime(closeTime(t))} · {nameOf.get(t.account_id)}
                          </span>
                        </span>
                        <span className={cn("font-medium tabular-nums", pnlClass(t.net_pnl))}>{money(t.net_pnl, true)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
