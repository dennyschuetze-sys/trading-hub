import Link from "next/link";
import { ArrowRight, Info, NotebookPen, Plus, Upload, Wallet } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EquityChart } from "@/components/charts/equity-chart";
import { longDate } from "@/components/charts/format";
import { PnlCalendar } from "@/components/charts/pnl-calendar";
import { RuleMeter, StatusBadge } from "@/components/charts/rule-meter";
import { StatTile } from "@/components/charts/stat-tile";
import { PageHeader } from "@/components/layout/page-header";
import { TodayPlanCard } from "@/components/layout/today-plan-card";
import { TodayEventsCard } from "@/components/news/today-events-card";
import { berlinDay, filterEvents, nextEvent } from "@/lib/calendar";
import { getCalendar, getNewsSettings } from "@/lib/feeds";
import { evaluateAccount } from "@/lib/prop-rules";
import { fetchStatTrades } from "@/lib/queries";
import { rangeStart, resolveScope } from "@/lib/scope";
import { berlinParts, closeTime, closedTrades, dailyResults, equityCurve, type StatTrade } from "@/lib/stats";
import { createClient } from "@/lib/supabase/server";
import { PHASES, formatDateTime, formatMoney, labelFor, pnlClass } from "@/lib/trading";

/** Summen je Währung, z. B. „+120,00 € · −40,00 $“ – Währungen werden nie vermischt. */
function sumByCurrency(trades: StatTrade[], currencyOf: Map<string, string>) {
  const sums = new Map<string, number>();
  for (const t of closedTrades(trades)) {
    const cur = currencyOf.get(t.account_id) ?? "USD";
    sums.set(cur, Math.round(((sums.get(cur) ?? 0) + t.net_pnl!) * 100) / 100);
  }
  return [...sums.entries()];
}

function moneyList(sums: [string, number][]) {
  return sums.length ? sums.map(([cur, v]) => formatMoney(v, cur, true)).join(" · ") : "–";
}

function toneOf(sums: [string, number][]) {
  if (!sums.length) return null;
  if (sums.every(([, v]) => v > 0)) return "profit" as const;
  if (sums.every(([, v]) => v < 0)) return "loss" as const;
  return null;
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const [{ data: accounts }, trades] = await Promise.all([
    supabase
      .from("accounts")
      .select("id, name, firm, currency, starting_balance, status, phase, account_type, max_daily_loss, max_drawdown, drawdown_type, profit_target, min_trading_days")
      .order("name"),
    fetchStatTrades(supabase),
  ]);
  const list = accounts ?? [];

  if (!list.length) {
    return (
      <>
        <PageHeader title="Dashboard" description="Willkommen im Trading Hub." />
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <Wallet className="size-8 text-muted-foreground" />
            <p className="font-medium">Leg los mit deinem ersten Account</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              Danach kannst du Trades erfassen oder aus MetaTrader und TradingView importieren.
            </p>
            <div className="flex gap-2">
              <Button asChild>
                <Link href="/accounts/new">Account anlegen</Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href="/import">Importieren</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </>
    );
  }

  const now = new Date();
  const currencyOf = new Map(list.map((a) => [a.id, a.currency]));
  const today = berlinParts(now.toISOString()).date;
  const [{ data: todayPlan }, calendar, newsSettings] = await Promise.all([
    supabase.from("daily_plans").select("*").eq("plan_date", today).maybeSingle(),
    getCalendar(),
    getNewsSettings(supabase),
  ]);
  const calendarEvents = filterEvents(calendar.events, newsSettings.calendarCurrencies, newsSettings.minImpact);
  const weekStart = (() => {
    const d = new Date(`${today}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    return d.toISOString().slice(0, 10);
  })();
  const monthStart = rangeStart("mtd", now)!;

  const closed = closedTrades(trades);
  const todaySums = sumByCurrency(closed.filter((t) => berlinParts(closeTime(t)).date === today), currencyOf);
  const weekSums = sumByCurrency(closed.filter((t) => berlinParts(closeTime(t)).date >= weekStart), currencyOf);
  const monthSums = sumByCurrency(closed.filter((t) => closeTime(t) >= monthStart), currencyOf);
  const todayCount = closed.filter((t) => berlinParts(closeTime(t)).date === today).length;

  const active = list.filter((a) => a.status === "active");
  const ruleCards = active.map((a) => ({
    account: a,
    rules: evaluateAccount(a, trades.filter((t) => t.account_id === a.id), now),
  }));

  const focus = resolveScope(list, undefined, trades)!;
  const focusAccount = list.find((a) => a.id === focus.accountIds[0])!;
  const focusTrades = trades.filter((t) => t.account_id === focusAccount.id);
  const recent = [...closed].reverse().slice(0, 6);
  const nameOf = new Map(list.map((a) => [a.id, a.name]));

  return (
    <>
      <PageHeader title="Dashboard" description={longDate(today)}>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link href="/import">
              <Upload className="size-4" /> Import
            </Link>
          </Button>
          <Button asChild>
            <Link href="/journal/new">
              <Plus className="size-4" /> Trade
            </Link>
          </Button>
        </div>
      </PageHeader>

      <div className="grid gap-6">
        <section className="grid gap-3 sm:grid-cols-3" aria-label="Ergebnisse">
          <StatTile label="Heute" value={moneyList(todaySums)} tone={toneOf(todaySums)} hint={`${todayCount} ${todayCount === 1 ? "Trade" : "Trades"}`} />
          <StatTile label="Diese Woche" value={moneyList(weekSums)} tone={toneOf(weekSums)} hint="seit Montag" />
          <StatTile label="Dieser Monat" value={moneyList(monthSums)} tone={toneOf(monthSums)} hint="seit dem 1." />
        </section>

        <div className="grid gap-4 lg:grid-cols-2">
          <TodayPlanCard
            plan={todayPlan}
            tradesToday={trades.filter((t) => berlinParts(t.entry_time).date === today).length}
          />
          <TodayEventsCard
            events={calendarEvents.filter((e) => berlinDay(e.time) === today)}
            next={nextEvent(calendarEvents, now)}
            now={now}
            error={calendar.error}
          />
        </div>

        {ruleCards.length > 0 && (
          <section className="grid gap-3" aria-label="Account-Limits">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <h2 className="text-lg font-semibold">Accounts & Limits</h2>
              <p className="flex items-center gap-1 text-xs text-muted-foreground">
                <Info className="size-3.5" /> Aus geschlossenen Trades berechnet – offene Positionen zählen bei der Prop Firm mit.
              </p>
            </div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {ruleCards.map(({ account: a, rules: r }) => {
                const money = (v: number | null, signed = false) => formatMoney(v, a.currency, signed);
                const hasRules = r.dailyLoss || r.drawdown || r.target;
                return (
                  <Card key={a.id} className="gap-4">
                    <CardHeader>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <CardTitle className="truncate">{a.name}</CardTitle>
                          <CardDescription>
                            {[a.firm, labelFor(PHASES, a.phase)].filter(Boolean).join(" · ")}
                          </CardDescription>
                        </div>
                        {hasRules && <StatusBadge status={r.status} />}
                      </div>
                      <div className="flex items-baseline justify-between gap-2 pt-1">
                        <span className="text-2xl font-semibold tracking-tight">{money(r.balance)}</span>
                        <span className="text-sm text-muted-foreground">
                          heute <span className={`font-medium ${pnlClass(r.todayPnl)}`}>{money(r.todayPnl, true)}</span>
                        </span>
                      </div>
                    </CardHeader>
                    <CardContent className="grid gap-4">
                      {r.dailyLoss && (
                        <RuleMeter
                          label="Tagesverlust"
                          ratio={r.dailyLoss.ratio}
                          status={r.dailyLoss.status}
                          detail={`noch ${money(r.dailyLoss.remaining)} von ${money(r.dailyLoss.limit)}`}
                        />
                      )}
                      {r.drawdown && (
                        <RuleMeter
                          label={a.drawdown_type === "static" ? "Max. Drawdown" : "Max. Drawdown (trailing)"}
                          ratio={r.drawdown.ratio}
                          status={r.drawdown.status}
                          detail={`Grenze bei ${money(r.drawdown.floor)} · noch ${money(r.drawdown.remaining)}`}
                        />
                      )}
                      {r.target && (
                        <div className="grid gap-1.5">
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Gewinnziel</span>
                            <span className="text-xs font-medium">
                              {r.target.reached ? "Erreicht" : `${Math.round(r.target.progress * 100)} %`}
                            </span>
                          </div>
                          <div className="h-2 overflow-hidden rounded-full bg-muted">
                            <div className="h-full rounded-full bg-chart-line" style={{ width: `${Math.round(r.target.progress * 100)}%` }} />
                          </div>
                          <p className="text-xs text-muted-foreground tabular-nums">
                            {r.target.reached ? `${money(r.netPnl, true)} erzielt` : `noch ${money(r.target.remaining)} bis ${money(a.profit_target)}`}
                            {r.tradingDays.required ? ` · ${r.tradingDays.done}/${r.tradingDays.required} Handelstage` : ""}
                          </p>
                        </div>
                      )}
                      {!hasRules && (
                        <p className="text-sm text-muted-foreground">
                          Keine Regeln hinterlegt.{" "}
                          <Link href={`/accounts/${a.id}/edit`} className="underline underline-offset-4 hover:text-foreground">
                            Limits eintragen
                          </Link>
                        </p>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </section>
        )}

        <div className="grid gap-6 xl:grid-cols-2">
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <CardTitle>Equity · {focusAccount.name}</CardTitle>
                  <CardDescription>
                    Account mit dem letzten Trade · Start {formatMoney(focusAccount.starting_balance, focusAccount.currency)}
                  </CardDescription>
                </div>
                <Button variant="ghost" size="sm" asChild>
                  <Link href={`/stats?scope=${focusAccount.id}`}>
                    Statistiken <ArrowRight className="size-4" />
                  </Link>
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <EquityChart
                points={equityCurve(focusTrades, focusAccount.starting_balance)}
                startingBalance={focusAccount.starting_balance}
                currency={focusAccount.currency}
                height={240}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Kalender · {focusAccount.name}</CardTitle>
            </CardHeader>
            <CardContent>
              <PnlCalendar days={dailyResults(focusTrades)} currency={focusAccount.currency} />
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <CardTitle>Letzte Trades</CardTitle>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/journal">
                  Journal <ArrowRight className="size-4" />
                </Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {!recent.length ? (
              <div className="flex flex-col items-center gap-2 py-6 text-center text-sm text-muted-foreground">
                <NotebookPen className="size-6" /> Noch keine Trades
              </div>
            ) : (
              <ul className="divide-y">
                {recent.map((t) => (
                  <li key={t.id}>
                    <Link href={`/journal/${t.id}`} className="flex items-center gap-3 py-2.5 hover:bg-muted/40">
                      <Badge variant="outline" className="w-14 justify-center">
                        {t.direction === "long" ? "Long" : "Short"}
                      </Badge>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{t.symbol}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {formatDateTime(closeTime(t))} · {nameOf.get(t.account_id)}
                        </p>
                      </div>
                      <span className={`font-medium tabular-nums ${pnlClass(t.net_pnl)}`}>
                        {formatMoney(t.net_pnl, currencyOf.get(t.account_id), true)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
