import Link from "next/link";
import { CheckCircle2, CircleDashed, History, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { longDate } from "@/components/charts/format";
import { DeleteButton } from "@/components/forms/delete-button";
import { PageHeader } from "@/components/layout/page-header";
import {
  checkDay,
  isValidDate,
  planStatus,
  readMarkets,
  readRoutine,
  routineTemplate,
  shiftDate,
  todayBerlin,
} from "@/lib/daily-plan";
import { eventTime } from "@/components/news/event-list";
import { berlinDay, filterEvents } from "@/lib/calendar";
import { getCalendar, getNewsSettings } from "@/lib/feeds";
import { createClient } from "@/lib/supabase/server";
import { dayBoundary, formatMoney, formatDateTime, plural, pnlClass } from "@/lib/trading";
import { cn } from "@/lib/utils";
import { deletePlan } from "./actions";
import { DateNav } from "./date-nav";
import { PremarketForm } from "./premarket-form";
import { ReviewForm } from "./review-form";

const STATUS = {
  missing: { label: "Noch kein Plan", icon: CircleDashed },
  planned: { label: "Plan steht · Review offen", icon: CircleDashed },
  reviewed: { label: "Plan & Review erledigt", icon: CheckCircle2 },
} as const;

export default async function PlanPage({ searchParams }: PageProps<"/plan">) {
  const sp = await searchParams;
  const today = todayBerlin();
  const date = isValidDate(sp.date) ? sp.date : today;

  const supabase = await createClient();
  const [calendar, newsSettings] = await Promise.all([getCalendar(), getNewsSettings(supabase)]);
  const dayEvents = filterEvents(calendar.events, newsSettings.calendarCurrencies, newsSettings.minImpact)
    .filter((e) => berlinDay(e.time) === date)
    .map((e) => ({ id: e.id, title: e.title, currency: e.currency, impact: e.impact, timeLabel: eventTime(e) }));

  const [{ data: plan }, { data: previous }, { data: strategies }, { data: trades }] = await Promise.all([
    supabase.from("daily_plans").select("*").eq("plan_date", date).maybeSingle(),
    supabase.from("daily_plans").select("routine").lt("plan_date", date).order("plan_date", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("strategies").select("id, name, status").order("name"),
    supabase
      .from("trades")
      .select("id, symbol, direction, status, entry_time, net_pnl, strategy_id, accounts(name, currency)")
      .eq("is_backtest", false)
      .gte("entry_time", dayBoundary(date, "start"))
      .lte("entry_time", dayBoundary(date, "end"))
      .order("entry_time"),
  ]);

  const status = planStatus(plan);
  const StatusIcon = STATUS[status].icon;
  const dayTrades = trades ?? [];
  const check = checkDay(plan, dayTrades);
  const byCurrency = new Map<string, number>();
  dayTrades.forEach((t) => {
    if (t.status !== "closed" || t.net_pnl == null) return;
    const cur = t.accounts?.currency ?? "USD";
    byCurrency.set(cur, Math.round(((byCurrency.get(cur) ?? 0) + t.net_pnl) * 100) / 100);
  });

  const strategyList = (strategies ?? []).filter((s) => s.status !== "archived" || plan?.strategy_ids.includes(s.id));
  const strategyName = new Map((strategies ?? []).map((s) => [s.id, s.name]));
  const plannedStrategies = new Set(plan?.strategy_ids ?? []);
  const offPlan = plan?.strategy_ids.length
    ? dayTrades.filter((t) => !t.strategy_id || !plannedStrategies.has(t.strategy_id)).length
    : 0;
  const routine = plan ? readRoutine(plan.routine) : routineTemplate(previous?.routine);

  return (
    <>
      <PageHeader title="Tagesplan" description={longDate(date)}>
        <div className="flex flex-wrap items-center gap-2">
          <DateNav date={date} today={today} prev={shiftDate(date, -1)} next={shiftDate(date, 1)} />
          <Button variant="outline" asChild>
            <Link href="/plan/history">
              <History className="size-4" /> Verlauf
            </Link>
          </Button>
        </div>
      </PageHeader>

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <Badge variant={status === "reviewed" ? "secondary" : "outline"} className="gap-1.5 py-1">
          <StatusIcon className={cn("size-3.5", status === "reviewed" && "text-profit")} aria-hidden />
          {STATUS[status].label}
        </Badge>
        {plan && (
          <DeleteButton
            title="Tagesplan löschen?"
            description="Plan und Review für diesen Tag werden gelöscht. Deine Trades bleiben erhalten."
            onConfirm={deletePlan.bind(null, date)}
          />
        )}
      </div>

      <div className="grid gap-6">
        <PremarketForm
          key={`pre-${date}-${plan?.updated_at ?? "neu"}`}
          date={date}
          plan={plan}
          markets={plan ? readMarkets(plan.markets) : []}
          routine={routine}
          strategies={strategyList.map(({ id, name }) => ({ id, name }))}
          events={dayEvents}
        />

        <Card>
          <CardHeader>
            <CardTitle>Session</CardTitle>
            <CardDescription>Trades mit Einstieg an diesem Tag (Berliner Zeit)</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">Ergebnis</p>
                <p className="font-semibold">
                  {byCurrency.size ? [...byCurrency].map(([cur, v]) => formatMoney(v, cur, true)).join(" · ") : "–"}
                </p>
              </div>
              <LimitTile
                label="Trades"
                value={`${check.trades}${plan?.max_trades != null ? ` / max. ${plan.max_trades}` : ""}`}
                ok={check.tradesOk}
              />
              <LimitTile
                label="Verlusttrades"
                value={`${check.losses}${plan?.max_losses != null ? ` / max. ${plan.max_losses}` : ""}`}
                ok={check.lossesOk}
              />
              <LimitTile
                label="Außerhalb geplanter Setups"
                value={plan?.strategy_ids.length ? plural(offPlan, "Trade", "Trades") : "keine Setups geplant"}
                ok={plan?.strategy_ids.length ? offPlan === 0 : null}
              />
            </div>

            {dayTrades.length ? (
              <ul className="divide-y rounded-md border text-sm">
                {dayTrades.map((t) => (
                  <li key={t.id}>
                    <Link href={`/journal/${t.id}`} className="flex items-center justify-between gap-3 px-3 py-2 hover:bg-muted/40">
                      <span className="min-w-0">
                        <span className="font-medium">{t.symbol}</span>{" "}
                        <span className="text-muted-foreground">{t.direction === "long" ? "Long" : "Short"}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {formatDateTime(t.entry_time)} · {t.accounts?.name}
                          {t.strategy_id ? ` · ${strategyName.get(t.strategy_id) ?? "Strategie"}` : " · ohne Strategie"}
                        </span>
                      </span>
                      <span className={cn("font-medium tabular-nums", pnlClass(t.net_pnl))}>
                        {t.status === "open" ? "offen" : formatMoney(t.net_pnl, t.accounts?.currency, true)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">
                Keine Trades an diesem Tag.{" "}
                <Link href="/journal/new" className="underline underline-offset-4 hover:text-foreground">
                  Trade erfassen
                </Link>
              </p>
            )}
          </CardContent>
        </Card>

        <ReviewForm key={`review-${date}-${plan?.updated_at ?? "neu"}`} date={date} plan={plan} />
      </div>
    </>
  );
}

/** Kennzahl mit Status-Symbol + Text (Farbe nie allein). */
function LimitTile({ label, value, ok }: { label: string; value: string; ok: boolean | null }) {
  return (
    <div className="rounded-md border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="flex items-center gap-1.5 font-semibold">
        {ok === true && <CheckCircle2 className="size-4 text-profit" aria-label="Eingehalten" />}
        {ok === false && <XCircle className="size-4 text-loss" aria-label="Überschritten" />}
        {value}
      </p>
      {ok === false && <p className="text-xs text-loss">Limit überschritten</p>}
    </div>
  );
}
