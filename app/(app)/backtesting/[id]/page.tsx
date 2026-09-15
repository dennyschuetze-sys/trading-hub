import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, FlaskConical, Image as ImageIcon, Pencil, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BreakdownTable } from "@/components/charts/breakdown-table";
import { EquityChart } from "@/components/charts/equity-chart";
import { StatTile } from "@/components/charts/stat-tile";
import { DeleteButton } from "@/components/forms/delete-button";
import { BACKTEST_STATUSES, rStats } from "@/lib/backtests";
import { fetchBacktestTrades } from "@/lib/queries";
import { equityCurve, maxDrawdown, standardBreakdowns, summarize } from "@/lib/stats";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatDateTime, formatMoney, formatNumber, formatR, labelFor, plural, pnlClass } from "@/lib/trading";
import { deleteBacktestSession } from "../actions";

export default async function BacktestSessionPage({ params }: PageProps<"/backtesting/[id]">) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: session }, trades, { data: list }] = await Promise.all([
    supabase.from("backtest_sessions").select("*, strategies(id, name)").eq("id", id).maybeSingle(),
    fetchBacktestTrades(supabase, [id]),
    supabase
      .from("trades")
      .select("id, symbol, direction, status, entry_time, net_pnl, r_multiple, setup_quality, trade_screenshots(count)")
      .eq("backtest_session_id", id)
      .order("entry_time", { ascending: false })
      .limit(500),
  ]);
  if (!session) notFound();

  const currency = session.currency;
  const start = session.starting_balance ?? 0;
  const money = (v: number | null, signed = false) => formatMoney(v, currency, signed);
  const s = summarize(trades);
  const r = rStats(trades);
  const curve = equityCurve(trades, start);
  const dd = maxDrawdown(curve);
  const b = standardBreakdowns(trades);

  const period =
    session.period_from || session.period_to
      ? `${formatDate(session.period_from)} – ${formatDate(session.period_to)}`
      : null;

  return (
    <div className="grid gap-6">
      <div className="grid gap-3">
        <Link href="/backtesting" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> Backtesting
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="grid gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">{session.name}</h1>
              <Badge variant={session.status === "running" ? "secondary" : "outline"}>
                {labelFor(BACKTEST_STATUSES, session.status)}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              {session.strategies ? (
                <Link href={`/strategies/${session.strategies.id}`} className="underline underline-offset-4 hover:text-foreground">
                  {session.strategies.name}
                </Link>
              ) : (
                "Ohne Strategie"
              )}
              {period && ` · ${period}`}
              {session.timeframe && ` · ${session.timeframe}`}
            </p>
            {session.symbols.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {session.symbols.map((sym) => (
                  <Badge key={sym} variant="outline">
                    {sym}
                  </Badge>
                ))}
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild>
              <Link href={`/backtesting/${id}/trade`}>
                <Plus className="size-4" /> Trade erfassen
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href={`/backtesting/${id}/edit`}>
                <Pencil className="size-4" /> Bearbeiten
              </Link>
            </Button>
            <DeleteButton
              title="Backtest-Session löschen?"
              description={`Die Session und ${plural(list?.length ?? 0, "Trade", "Trades")} samt Screenshots werden endgültig gelöscht.`}
              onConfirm={deleteBacktestSession.bind(null, id)}
            />
          </div>
        </div>
      </div>

      {s.count > 0 ? (
        <>
          <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6" aria-label="Kennzahlen der Session">
            <StatTile label="Trades" value={String(s.count)} hint={`${s.wins} Gewinner / ${s.losses} Verlierer`} />
            <StatTile label="Winrate" value={s.winRate == null ? "–" : `${formatNumber(s.winRate * 100, 1)} %`} />
            <StatTile label="Ø R-Multiple" value={formatR(r.avgR)} hint={r.rCount ? `aus ${r.rCount} Trades` : "Risiko eintragen"} />
            <StatTile label="Profit Factor (R)" value={r.profitFactorR == null ? "–" : formatNumber(r.profitFactorR, 2)} />
            <StatTile
              label="Netto P&L"
              value={money(s.netPnl, true)}
              tone={s.netPnl > 0 ? "profit" : s.netPnl < 0 ? "loss" : null}
            />
            <StatTile
              label="Max. Drawdown"
              value={money(dd.amount ? -dd.amount : 0)}
              hint={start > 0 ? `${formatNumber(dd.percent * 100, 1)} % vom Höchststand` : "der kumulierten P&L"}
            />
          </section>

          <Card>
            <CardHeader>
              <CardTitle>{start > 0 ? "Equity-Kurve" : "Kumulierte P&L"}</CardTitle>
              <CardDescription>
                {start > 0 ? `Virtuelles Konto mit ${money(start)} Startkapital` : "Startkapital eintragen, um den Kontostand zu sehen"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <EquityChart points={curve} startingBalance={start} currency={currency} height={240} />
            </CardContent>
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <BreakdownTable title="Nach Setup-Qualität" rows={b.setupQuality} currency={currency} emptyText="Noch keine Setup-Qualität erfasst." />
            <BreakdownTable title="Nach Session" rows={b.session} currency={currency} />
            <BreakdownTable title="Nach Symbol" rows={b.symbol} currency={currency} />
            <BreakdownTable title="Nach Wochentag" rows={b.weekday} currency={currency} />
          </div>
        </>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <FlaskConical className="size-8 text-muted-foreground" />
            <p className="font-medium">Noch keine Trades in dieser Session</p>
            <p className="max-w-md text-sm text-muted-foreground">
              Geh den Zeitraum im Replay durch und erfasse jeden Trade, den deine Regeln erlauben – auch die Verlierer.
              Trag das Risiko ein, dann lässt sich die Session in R mit deinen Live-Trades vergleichen.
            </p>
            <Button asChild>
              <Link href={`/backtesting/${id}/trade`}>Ersten Trade erfassen</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {list && list.length > 0 && (
        <Card className="gap-0 overflow-hidden py-0">
          <CardHeader className="py-4">
            <CardTitle>Trades</CardTitle>
          </CardHeader>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Einstieg</TableHead>
                  <TableHead>Symbol</TableHead>
                  <TableHead>Richtung</TableHead>
                  <TableHead>Setup</TableHead>
                  <TableHead className="text-right">P&L</TableHead>
                  <TableHead className="text-right">R</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.map((t) => (
                  <TableRow key={t.id} className="relative">
                    <TableCell className="whitespace-nowrap">
                      <Link href={`/journal/${t.id}`} className="after:absolute after:inset-0">
                        {formatDateTime(t.entry_time)}
                      </Link>
                    </TableCell>
                    <TableCell className="font-medium">
                      <span className="flex items-center gap-1.5">
                        {t.symbol}
                        {(t.trade_screenshots[0]?.count ?? 0) > 0 && (
                          <ImageIcon className="size-3.5 text-muted-foreground" aria-label="Mit Screenshot" />
                        )}
                      </span>
                    </TableCell>
                    <TableCell className={t.direction === "long" ? "text-profit" : "text-loss"}>
                      {t.direction === "long" ? "Long" : "Short"}
                    </TableCell>
                    <TableCell>{t.setup_quality ?? "–"}</TableCell>
                    <TableCell className={`text-right tabular-nums ${pnlClass(t.net_pnl)}`}>
                      {t.status === "open" ? "Offen" : money(t.net_pnl, true)}
                    </TableCell>
                    <TableCell className={`text-right tabular-nums ${pnlClass(t.r_multiple)}`}>{formatR(t.r_multiple)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      {session.notes && (
        <Card>
          <CardHeader>
            <CardTitle>Notizen</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-wrap">{session.notes}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
