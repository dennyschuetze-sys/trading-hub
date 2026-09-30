import Link from "next/link";
import { CalendarDays, ChevronLeft, ChevronRight, CircleSlash2, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { monthLabel } from "@/components/charts/format";
import { StatStrip } from "@/components/charts/stat-tile";
import { PageHeader } from "@/components/layout/page-header";
import { isValidDate, todayBerlin } from "@/lib/daily-plan";
import { fetchStatTrades, fetchTradesClosedBetween } from "@/lib/queries";
import { resolveScope, scopeOptions } from "@/lib/scope";
import { createClient } from "@/lib/supabase/server";
import { dayBoundary, formatMoney, plural } from "@/lib/trading";
import { calendarDays, monthBounds, parseMonth, shiftMonth, summarizeMonth, tradesOfDay } from "@/lib/trading-calendar";
import { CalendarGrid } from "./calendar-grid";
import { DayTrades } from "./day-trades";
import { ScopeSelect } from "./scope-select";

const param = (v: string | string[] | undefined) => (typeof v === "string" && v ? v : undefined);

export default async function CalendarPage({ searchParams }: PageProps<"/calendar">) {
  const sp = await searchParams;
  const today = todayBerlin();
  const month = parseMonth(param(sp.month), today);
  const { first, last } = monthBounds(month);
  const from = dayBoundary(first, "start");
  const to = dayBoundary(last, "end");

  const supabase = await createClient();
  // Alles, was nur vom Monat abhängt, startet gleich mit den Accounts: eine Runde statt vieler hintereinander
  const [{ data: accounts }, closed, entered, { data: plans }, { data: latest }] = await Promise.all([
    supabase.from("accounts").select("id, name, currency, starting_balance, status").order("name"),
    fetchTradesClosedBetween(supabase, from, to),
    fetchStatTrades(supabase, undefined, { entryFrom: from, entryTo: to }),
    supabase.from("daily_plans").select("plan_date, no_trade, no_trade_reason").gte("plan_date", first).lte("plan_date", last),
    // Für den Standard-Account: der mit dem jüngsten Trade
    supabase
      .from("trades")
      .select("account_id, entry_time, exit_time")
      .eq("is_backtest", false)
      .order("entry_time", { ascending: false })
      .limit(1),
  ]);

  const scope = resolveScope(accounts ?? [], param(sp.scope), (latest ?? []) as { account_id: string; entry_time: string; exit_time: string | null }[]);

  if (!scope) {
    return (
      <>
        <PageHeader title="Trading-Kalender" />
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <Wallet className="size-8 text-muted-foreground" />
            <p className="font-medium">Noch keine Accounts</p>
            <Button asChild>
              <Link href="/accounts/new">Account anlegen</Link>
            </Button>
          </CardContent>
        </Card>
      </>
    );
  }

  const inScope = new Set(scope.accountIds);
  const scopeClosed = closed.filter((t) => inScope.has(t.account_id));
  const scopeEntered = entered.filter((t) => inScope.has(t.account_id));
  const days = calendarDays({ month, closed: scopeClosed, entered: scopeEntered, entries: entered, plans: plans ?? [] });
  const summary = summarizeMonth(days.values());

  // Gewählter Tag nur, wenn er im angezeigten Monat liegt
  const requestedDay = param(sp.day);
  const selectedDay = requestedDay && isValidDate(requestedDay) && requestedDay.startsWith(month) ? requestedDay : undefined;
  const dayTrades = selectedDay ? tradesOfDay(selectedDay, scopeClosed, scopeEntered) : [];

  const [year, monthNumber] = month.split("-").map(Number);
  const label = monthLabel(year, monthNumber);
  const monthHref = (m: string, day?: string) => {
    const qs = new URLSearchParams({ month: m });
    if (param(sp.scope)) qs.set("scope", scope.value);
    if (day) qs.set("day", day);
    return `/calendar?${qs}`;
  };
  const money = (v: number | null, signed = false) => formatMoney(v, scope.currency, signed);
  const tone = summary.pnl > 0 ? "profit" : summary.pnl < 0 ? "loss" : null;

  return (
    <>
      <PageHeader title="Trading-Kalender" description={`${scope.label} · ${label}`}>
        <div className="flex flex-wrap items-center gap-2">
          <ScopeSelect scopes={scopeOptions(accounts ?? [])} scope={scope.value} />
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" asChild>
              <Link href={monthHref(shiftMonth(month, -1))} aria-label="Vorheriger Monat">
                <ChevronLeft className="size-4" />
              </Link>
            </Button>
            <Button variant="outline" size="icon" asChild>
              <Link href={monthHref(shiftMonth(month, 1))} aria-label="Nächster Monat">
                <ChevronRight className="size-4" />
              </Link>
            </Button>
            {month !== today.slice(0, 7) && (
              <Button variant="ghost" asChild>
                <Link href={monthHref(today.slice(0, 7))}>Heute</Link>
              </Button>
            )}
          </div>
        </div>
      </PageHeader>

      <div className="grid gap-4">
        <StatStrip
          items={[
            { label: "Handelstage", value: String(summary.tradingDays), hint: plural(summary.trades, "Trade", "Trades") },
            { label: "Netto P&L", value: money(summary.pnl, true), tone, hint: "im Monat" },
            { label: "Gewinntage", value: String(summary.winDays), tone: summary.winDays ? "profit" : null },
            { label: "Verlusttage", value: String(summary.lossDays), tone: summary.lossDays ? "loss" : null },
            {
              label: "Kein Trade",
              value: String(summary.noTradeDays),
              hint: summary.noTradeDays ? "im Review festgehalten" : "keine markierten Tage",
            },
            {
              label: "Ø pro Handelstag",
              value: summary.tradingDays ? money(Math.round((summary.pnl / summary.tradingDays) * 100) / 100, true) : "–",
              muted: !summary.tradingDays,
            },
          ]}
        />

        <Card className="gap-4 py-5">
          <CardContent className="grid gap-4 px-3 sm:px-5">
            <CalendarGrid
              month={month}
              days={days}
              currency={scope.currency}
              today={today}
              selected={selectedDay}
              tradesHref={(date) => `${monthHref(month, date)}#tag`}
            />
            {days.size === 0 && (
              <p className="flex items-center justify-center gap-2 py-2 text-sm text-muted-foreground">
                <CalendarDays className="size-4" aria-hidden /> Keine Trades in diesem Monat
              </p>
            )}
            <ul className="flex flex-wrap gap-x-5 gap-y-1 border-t pt-4 text-xs text-muted-foreground">
              <li className="flex items-center gap-1.5">
                <span className="size-3 rounded-sm" style={{ background: "color-mix(in oklch, var(--profit) 40%, transparent)" }} aria-hidden /> Gewinntag
              </li>
              <li className="flex items-center gap-1.5">
                <span className="size-3 rounded-sm" style={{ background: "color-mix(in oklch, var(--loss) 40%, transparent)" }} aria-hidden /> Verlusttag
              </li>
              <li className="flex items-center gap-1.5">
                <CircleSlash2 className="size-3.5 text-brand" aria-hidden /> Kein Trade
              </li>
              <li>Ein Tag zählt nach dem Ausstieg der Trades (Berliner Zeit). Klick auf einen Tag mit Trades zeigt sie unten, jeder andere Tag öffnet den Tagesplan.</li>
            </ul>
          </CardContent>
        </Card>

        {selectedDay && (
          <DayTrades
            date={selectedDay}
            trades={dayTrades}
            currency={scope.currency}
            accountNames={scope.accountIds.length > 1 ? new Map((accounts ?? []).map((a) => [a.id, a.name])) : undefined}
            closeHref={monthHref(month)}
          />
        )}
      </div>
    </>
  );
}
