import Link from "next/link";
import { Info, Plus, Upload, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { longDate } from "@/components/charts/format";
import { PnlCalendar } from "@/components/charts/pnl-calendar";
import { STATUS_META } from "@/components/charts/rule-meter";
import { StatSection, StatStrip } from "@/components/charts/stat-tile";
import { AccountCard } from "@/components/dashboard/accounts";
import { EquityCard, InsightsCard, PulseCard } from "@/components/dashboard/performance";
import { RecentTradesCard } from "@/components/dashboard/recent-trades";
import { AttentionCard, TradingStatusCard, type StatusCheck } from "@/components/dashboard/status";
import { NewsCard, PlanCard, WeekFocusCard } from "@/components/dashboard/today";
import { AutoRefresh } from "@/components/layout/auto-refresh";
import { PageHeader } from "@/components/layout/page-header";
import { eventTime } from "@/components/news/event-list";
import { berlinDay, filterEvents, nextEvent } from "@/lib/calendar";
import { attentionItems, currentStreak, recentForm, tradingStatus } from "@/lib/dashboard";
import { planStatus } from "@/lib/daily-plan";
import { buildIndex, computeStreaks, scoreDays } from "@/lib/discipline";
import { getCalendar, getNewsSettings } from "@/lib/feeds";
import { evaluateGoal, formatMetric } from "@/lib/goals";
import { loadDisciplineData } from "@/lib/goals-queries";
import { MIN_TRADES, highlight } from "@/lib/insights";
import { periodDays, periodStart, weekday } from "@/lib/periods";
import { evaluateAccount } from "@/lib/prop-rules";
import { fetchStatTrades } from "@/lib/queries";
import { buildRiskToday, getRiskRules, rememberEvents } from "@/lib/risk-queries";
import { hasAnyRule } from "@/lib/risk-rules";
import { rangeStart, resolveScope } from "@/lib/scope";
import { berlinParts, closeTime, closedTrades, dailyResults, equityCurve, maxDrawdown, standardBreakdowns, summarize } from "@/lib/stats";
import { createClient } from "@/lib/supabase/server";
import { PHASES, SESSIONS, TIME_ZONE, formatMoney, formatNumber, formatR, labelFor, plural } from "@/lib/trading";

const clock = (iso: string) =>
  new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit", timeZone: TIME_ZONE }).format(new Date(iso));

const toneOf = (v: number | null | undefined) => (v == null || v === 0 ? null : v > 0 ? ("profit" as const) : ("loss" as const));

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
  const nowIso = now.toISOString();
  const today = berlinParts(nowIso).date;
  const [{ data: todayPlan }, calendar, newsSettings, riskRules] = await Promise.all([
    supabase.from("daily_plans").select("*").eq("plan_date", today).maybeSingle(),
    getCalendar(),
    getNewsSettings(supabase),
    getRiskRules(supabase),
  ]);
  await rememberEvents(supabase, calendar.events);
  const risk = buildRiskToday(list, trades, riskRules, calendar.events, newsSettings.calendarCurrencies, now);

  const subtitleOf = (a: (typeof list)[number]) => [a.firm, labelFor(PHASES, a.phase)].filter(Boolean).join(" · ");
  const nameOf = new Map(list.map((a) => [a.id, a.name]));
  const currencyOf = new Map(list.map((a) => [a.id, a.currency]));

  // Fokus: Account mit dem letzten Trade – Performance, Equity und Kalender beziehen sich darauf
  const focus = resolveScope(list, undefined, trades)!;
  const focusAccount = list.find((a) => a.id === focus.accountIds[0])!;
  const focusTrades = trades.filter((t) => t.account_id === focusAccount.id);
  const currency = focusAccount.currency;
  const money = (v: number | null, signed = false) => formatMoney(v, currency, signed);

  // 1. Status ------------------------------------------------------------------------
  const statusRow = risk.rows.find((r) => r.id === focusAccount.id) ?? risk.rows[0] ?? null;
  const statusAccount = statusRow ? list.find((a) => a.id === statusRow.id)! : null;
  const status = tradingStatus(statusRow, risk.lock);
  const rulesConfigured = hasAnyRule(riskRules);
  const hasPropLimits = Boolean(statusRow && (statusRow.prop.dailyLoss || statusRow.prop.drawdown));

  const highEvents = filterEvents(calendar.events, newsSettings.calendarCurrencies, "high").filter((e) => e.impact === "high");
  const nextHighToday = highEvents.find((e) => e.time > nowIso && berlinDay(e.time) === today) ?? null;
  const planState = planStatus(todayPlan);
  const tradesEnteredToday = focusTrades.filter((t) => berlinParts(t.entry_time).date === today).length;

  const checks: StatusCheck[] = [
    planState === "missing"
      ? { label: "Tagesplan", tone: "open", text: "Offen" }
      : { label: "Tagesplan", tone: "ok", text: planState === "reviewed" ? "Plan & Review erledigt" : "Erstellt" },
    rulesConfigured || hasPropLimits
      ? (() => {
          const ruleStatus = tradingStatus(statusRow, null);
          return {
            label: "Trading-Regeln",
            tone: ruleStatus === "ok" ? "ok" : ruleStatus === "warning" ? "warning" : "danger",
            text: STATUS_META[ruleStatus].label,
          } satisfies StatusCheck;
        })()
      : { label: "Trading-Regeln", tone: "open", text: "Keine Regeln hinterlegt" },
    risk.lock?.state === "active"
      ? { label: "High-Impact News", tone: "danger", text: `Sperre bis ${clock(risk.lock.until)} Uhr` }
      : risk.lock?.state === "soon"
        ? { label: "High-Impact News", tone: "warning", text: `Sperre ab ${clock(risk.lock.startsAt)} Uhr` }
        : nextHighToday
          ? {
              label: "High-Impact News",
              tone: Date.parse(nextHighToday.time) - now.getTime() <= 60 * 60000 ? "warning" : "open",
              text: `${eventTime(nextHighToday)} · ${nextHighToday.currency}`,
            }
          : { label: "High-Impact News", tone: "ok", text: "Keine weiteren heute" },
  ];

  const attention = attentionItems({
    now,
    isWorkday: weekday(today) <= 5,
    planExists: Boolean(todayPlan),
    nextHighImpact: nextHighToday,
    lock: risk.lock,
    focus: statusRow,
    others: risk.rows.filter((r) => r.id !== statusRow?.id).map((r) => ({ name: r.name, status: tradingStatus(r, null) })),
    streak: currentStreak(statusAccount ? trades.filter((t) => t.account_id === statusAccount.id) : []),
    rulesConfigured,
  });

  // 2./3. Performance ------------------------------------------------------------------
  const closed = closedTrades(focusTrades);
  const summary = summarize(focusTrades);
  const curve = equityCurve(focusTrades, focusAccount.starting_balance);
  const drawdown = maxDrawdown(curve);
  const closedToday = closed.filter((t) => berlinParts(closeTime(t)).date === today);
  const monthStart = rangeStart("mtd", now)!;
  const closedMonth = closed.filter((t) => closeTime(t) >= monthStart);
  const sum = (list: typeof closed) => Math.round(list.reduce((s, t) => s + t.net_pnl!, 0) * 100) / 100;
  const todayPnl = sum(closedToday);
  const monthPnl = sum(closedMonth);

  const rById = new Map(focusTrades.map((t) => [t.id, t.r_multiple]));
  const equityPoints = curve.map((p) => ({ time: p.time, balance: p.balance, pnl: p.pnl, r: p.tradeId ? (rById.get(p.tradeId) ?? null) : null }));
  const peak = Math.max(focusAccount.starting_balance, ...curve.map((p) => p.balance));
  const form = recentForm(focusTrades);

  // 4. Insights ----------------------------------------------------------------------
  const breakdowns = standardBreakdowns(focusTrades);
  const insights = [
    { label: "Beste Session", highlight: highlight(breakdowns.session) },
    { label: "Beste Richtung", highlight: highlight(breakdowns.direction) },
    { label: "Bester Wochentag", highlight: highlight(breakdowns.weekday) },
    { label: "Stärkste Einstiegszeit", highlight: highlight(breakdowns.hour) },
  ];

  // 5. Heute & Woche -------------------------------------------------------------------
  const week = periodStart(today, "week");
  const [{ data: discipline }, { data: weekGoals }, { data: weekReview }] = await Promise.all([
    loadDisciplineData(supabase, { trades, rules: riskRules }),
    supabase.from("goals").select("*").eq("period_type", "week").eq("period_start", week).order("position").order("created_at"),
    supabase.from("reviews").select("id").eq("period_type", "week").eq("period_start", week).maybeSingle(),
  ]);
  const disciplineIndex = buildIndex(discipline);
  const weekCtx = { index: disciplineIndex, type: "week" as const, start: week, today };
  const weekGoalRows = (weekGoals ?? []).map((g) => {
    const result = evaluateGoal(g, weekCtx);
    return { id: g.id, title: g.title, status: result.status, valueText: formatMetric(g.metric, result.value, currencyOf.get(g.account_id ?? "")) };
  });
  const closedWeek = closed.filter((t) => berlinParts(closeTime(t)).date >= week);
  const calendarEvents = filterEvents(calendar.events, newsSettings.calendarCurrencies, newsSettings.minImpact);

  // 6. Accounts ------------------------------------------------------------------------
  const activeAccounts = list
    .filter((a) => a.status === "active")
    .map((a) => ({ account: a, rules: evaluateAccount(a, trades.filter((t) => t.account_id === a.id), now) }));

  // 7. Letzte Trades (über alle Accounts) mit Session und Setup ----------------------------
  const recent = closedTrades(trades).reverse().slice(0, 6);
  const { data: recentDetails } = recent.length
    ? await supabase.from("trades").select("id, entry_criterion, strategies(name)").in("id", recent.map((t) => t.id))
    : { data: [] };
  const detailOf = new Map((recentDetails ?? []).map((d) => [d.id, d]));
  // Account-Namen nur, wenn die Liste Trades aus mehreren Accounts enthält
  const mixedAccounts = new Set(recent.map((t) => t.account_id)).size > 1;
  const recentTrades = recent.map((t) => {
    const detail = detailOf.get(t.id);
    const setup = detail?.entry_criterion ?? detail?.strategies?.name ?? null;
    return {
      id: t.id,
      symbol: t.symbol,
      direction: t.direction,
      closedAt: closeTime(t),
      netPnl: t.net_pnl!,
      r: t.r_multiple,
      currency: currencyOf.get(t.account_id) ?? "USD",
      tags: [t.session ? labelFor(SESSIONS, t.session) : null, setup].filter((x): x is string => Boolean(x)),
      account: mixedAccounts ? nameOf.get(t.account_id) : undefined,
    };
  });

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

      <AutoRefresh />
      <div className="grid gap-10">
        <StatSection title="Status" question="Bin ich bereit und darf ich noch traden?">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.9fr)_minmax(0,1fr)]">
            <TradingStatusCard
              account={statusAccount ? { name: statusAccount.name, subtitle: subtitleOf(statusAccount) } : null}
              row={statusRow}
              status={status}
              checks={checks}
            />
            <AttentionCard items={attention} />
          </div>
        </StatSection>

        <StatSection title="Performance" question="Wie läuft mein Trading?" hint={`${focusAccount.name} · alle Trades`}>
          <StatStrip
            items={[
              {
                label: "Heute P&L",
                value: closedToday.length ? money(todayPnl, true) : "–",
                muted: !closedToday.length,
                tone: toneOf(closedToday.length ? todayPnl : null),
                hint: closedToday.length ? plural(closedToday.length, "Trade", "Trades") : "Noch kein Trade geschlossen",
              },
              {
                label: "Dieser Monat",
                value: closedMonth.length ? money(monthPnl, true) : "–",
                muted: !closedMonth.length,
                tone: toneOf(closedMonth.length ? monthPnl : null),
                hint: plural(closedMonth.length, "Trade", "Trades"),
              },
              {
                label: "Winrate",
                value: summary.winRate == null ? "–" : `${formatNumber(summary.winRate * 100, 0)} %`,
                muted: summary.winRate == null,
                hint: `${summary.wins} Gewinner · ${summary.losses} Verlierer`,
              },
              {
                label: "Profit Factor",
                value: summary.profitFactor == null ? "–" : formatNumber(summary.profitFactor, 2),
                muted: summary.profitFactor == null,
                hint: "Gewinne ÷ Verluste",
              },
              {
                label: "Ø R / Trade",
                value: formatR(summary.avgR),
                muted: summary.avgR == null,
                tone: toneOf(summary.avgR),
                hint: summary.rCount ? `aus ${plural(summary.rCount, "Trade", "Trades")}` : "Risiko eintragen",
              },
              {
                label: "Max. Drawdown",
                value: drawdown.amount ? money(-drawdown.amount) : money(0),
                tone: drawdown.amount ? "loss" : null,
                hint: drawdown.amount ? `${formatNumber(drawdown.percent * 100, 1)} % vom Höchststand` : "Kein Rückgang",
              },
            ]}
          />
          <div className="grid gap-4 xl:grid-cols-[minmax(0,2.1fr)_minmax(0,1fr)]">
            <EquityCard
              accountId={focusAccount.id}
              accountName={focusAccount.name}
              points={equityPoints}
              startingBalance={focusAccount.starting_balance}
              currency={currency}
              facts={[
                { label: "Trades", value: String(summary.count) },
                { label: "Handelstage", value: String(summary.tradingDays) },
                { label: "Höchststand", value: money(peak) },
                { label: "Ø pro Trade", value: money(summary.expectancy, true), className: toneOf(summary.expectancy) === "loss" ? "text-loss" : toneOf(summary.expectancy) === "profit" ? "text-profit" : undefined },
              ]}
            />
            <PulseCard results={form.results} summary={form.summary} streak={currentStreak(focusTrades)} currency={currency} />
          </div>
        </StatSection>

        <StatSection title="Insights" question="Was zeigen meine Daten?">
          <InsightsCard items={insights} currency={currency} minTrades={MIN_TRADES} statsHref={`/stats?scope=${focusAccount.id}`} />
        </StatSection>

        <StatSection title="Heute" question="Was muss ich beachten?">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <PlanCard plan={todayPlan} tradesToday={tradesEnteredToday} />
            <NewsCard
              events={calendarEvents.filter((e) => berlinDay(e.time) === today)}
              next={nextEvent(highEvents, now)}
              now={now}
              currencies={newsSettings.calendarCurrencies}
              error={calendar.error}
            />
            <WeekFocusCard
              pnl={sum(closedWeek)}
              trades={closedWeek.length}
              currency={currency}
              score={scoreDays(disciplineIndex, periodDays(week, "week"), today).score}
              planStreak={computeStreaks(disciplineIndex, today).plan.current}
              goals={weekGoalRows}
              showReviewHint={!weekReview && weekday(today) > 5}
            />
          </div>
        </StatSection>

        {activeAccounts.length > 0 && (
          <StatSection title="Accounts" question="Wo stehe ich?" hint={plural(activeAccounts.length, "aktiver Account", "aktive Accounts")}>
            <div className={activeAccounts.length > 2 ? "grid gap-4 md:grid-cols-2 2xl:grid-cols-3" : "grid gap-4 md:grid-cols-2"}>
              {activeAccounts.map(({ account: a, rules }) => (
                <AccountCard
                  key={a.id}
                  account={{ ...a, subtitle: subtitleOf(a) }}
                  rules={rules}
                />
              ))}
            </div>
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Info className="size-3.5 shrink-0" aria-hidden /> Aus geschlossenen Trades berechnet – offene Positionen zählen bei der Prop Firm mit.
            </p>
          </StatSection>
        )}

        <StatSection title="Verlauf" question="Was ist zuletzt passiert?">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            <Card className="gap-3 py-5">
              <CardContent className="grid gap-3 px-5">
                <div>
                  <p className="text-sm font-semibold">Trading-Kalender</p>
                  <p className="text-xs text-muted-foreground">{focusAccount.name}</p>
                </div>
                <PnlCalendar days={dailyResults(focusTrades)} currency={currency} />
              </CardContent>
            </Card>
            <RecentTradesCard trades={recentTrades} />
          </div>
        </StatSection>
      </div>
    </>
  );
}
