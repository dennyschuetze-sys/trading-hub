import Link from "next/link";
import { CheckCircle2, CircleDashed, History, LineChart, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DeleteButton } from "@/components/forms/delete-button";
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
import { rememberEvents } from "@/lib/risk-queries";
import { createClient } from "@/lib/supabase/server";
import { dayBoundary, formatMoney, formatDateTime, plural, pnlClass } from "@/lib/trading";
import { cn } from "@/lib/utils";
import { deletePlan } from "./actions";
import { DateNav } from "./date-nav";
import { PlanLabel, PlanSection } from "./plan-section";
import { PremarketForm } from "./premarket-form";
import { ReviewForm } from "./review-form";

const STATUS = {
  missing: { label: "Noch kein Plan", icon: CircleDashed, className: "bg-foreground/[0.06] text-muted-foreground" },
  planned: { label: "Plan steht · Review offen", icon: CircleDashed, className: "bg-warning/12 text-warning" },
  reviewed: { label: "Plan & Review erledigt", icon: CheckCircle2, className: "bg-profit/12 text-profit" },
} as const;

/** „Dienstag, 15. September 2026“ */
const fullDate = (date: string) =>
  new Intl.DateTimeFormat("de-DE", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(`${date}T12:00:00Z`),
  );

export default async function PlanPage({ searchParams }: PageProps<"/plan">) {
  const sp = await searchParams;
  const today = todayBerlin();
  const date = isValidDate(sp.date) ? sp.date : today;

  const supabase = await createClient();
  const [calendar, newsSettings] = await Promise.all([getCalendar(), getNewsSettings(supabase)]);
  await rememberEvents(supabase, calendar.events);
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
  const markets = plan ? readMarkets(plan.markets) : [];

  // Fortschritt des Tagesablaufs – nur aus gespeicherten Werten
  const routineDone = routine.filter((r) => r.done).length;
  const netValues = [...byCurrency.values()];
  const steps = [
    {
      href: "#vor-der-session",
      title: "Vor der Session",
      detail: plan?.focus || plan?.mood_before || plan?.energy ? "Fokus & Zustand" : "offen",
      progress: plan ? [plan.focus, plan.mood_before, plan.energy].filter((v) => v != null && v !== "").length / 3 : 0,
    },
    {
      href: "#marktanalyse",
      title: "Marktanalyse",
      detail: markets.length ? plural(markets.length, "Markt geplant", "Märkte geplant") : "offen",
      progress: markets.length ? 1 : 0,
    },
    {
      href: "#routine-risiko",
      title: "Routine & Risiko",
      detail: `${plan ? routineDone : 0} / ${routine.length} erledigt`,
      progress: plan && routine.length ? routineDone / routine.length : 0,
    },
    {
      href: "#session",
      title: "Session",
      detail: plural(dayTrades.length, "Trade", "Trades"),
      progress: dayTrades.length ? 1 : 0,
    },
    {
      href: "#nach-der-session",
      title: "Nach der Session",
      detail: plan?.reviewed_at ? "Review erledigt" : "Review offen",
      progress: plan?.reviewed_at ? 1 : 0,
    },
  ];

  return (
    <div className="grid gap-12 pb-8">
      <div className="grid gap-7">
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div className="grid gap-2">
            <p className="text-[0.6875rem] font-semibold tracking-[0.14em] text-profit uppercase">Tagesplan</p>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{fullDate(date)}</h1>
            <div className="flex flex-wrap items-center gap-3">
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.6875rem] font-semibold tracking-[0.08em] uppercase",
                  STATUS[status].className,
                )}
              >
                <StatusIcon className="size-3.5" aria-hidden />
                {STATUS[status].label}
              </span>
              {plan && (
                <DeleteButton
                  title="Tagesplan löschen?"
                  description="Plan und Review für diesen Tag werden gelöscht. Deine Trades bleiben erhalten."
                  onConfirm={deletePlan.bind(null, date)}
                />
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <DateNav date={date} today={today} prev={shiftDate(date, -1)} next={shiftDate(date, 1)} />
            <Button variant="outline" asChild>
              <Link href="/plan/history">
                <History className="size-4" /> Verlauf
              </Link>
            </Button>
          </div>
        </div>

        <nav aria-label="Ablauf des Tages">
          <ol className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {steps.map((step, i) => (
              <li key={step.href} className={cn(i === 4 && "col-span-2 sm:col-span-1")}>
                <a
                  href={step.href}
                  className={cn(
                    "relative block overflow-hidden rounded-xl bg-card px-4 py-3 ring-1 ring-foreground/[0.07] transition-colors hover:ring-foreground/15",
                    step.progress > 0 && step.progress < 1 && "ring-profit/25",
                  )}
                >
                  <span className={cn("text-[0.6875rem] font-semibold tabular-nums", step.progress >= 1 ? "text-profit" : "text-muted-foreground/60")}>
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="block text-sm font-semibold">{step.title}</span>
                  <span className="block text-xs text-muted-foreground">{step.detail}</span>
                  <span className="absolute inset-x-0 bottom-0 h-0.5 bg-foreground/[0.06]" aria-hidden>
                    <span className="block h-full bg-profit" style={{ width: `${Math.round(step.progress * 100)}%` }} />
                  </span>
                </a>
              </li>
            ))}
          </ol>
        </nav>
      </div>

      <PremarketForm
        key={`pre-${date}-${plan?.updated_at ?? "neu"}`}
        date={date}
        plan={plan}
        markets={markets}
        routine={routine}
        strategies={strategyList.map(({ id, name }) => ({ id, name }))}
        events={dayEvents}
      />

      <PlanSection id="session" number="04" title="Session" description="Trades mit Einstieg an diesem Tag (Berliner Zeit)">
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl bg-border ring-1 ring-foreground/[0.07] lg:grid-cols-4">
          <div className="bg-card px-5 py-4">
            <PlanLabel>Ergebnis</PlanLabel>
            <p
              className={cn(
                "mt-2 text-2xl font-semibold tracking-tight tabular-nums",
                netValues.length === 1 ? pnlClass(netValues[0]) : !netValues.length && "text-muted-foreground",
              )}
            >
              {byCurrency.size ? [...byCurrency].map(([cur, v]) => formatMoney(v, cur, true)).join(" · ") : "–"}
            </p>
            <p className="text-xs text-muted-foreground/80">
              {byCurrency.size ? `${check.wins} Gewinner · ${check.losses} Verlierer` : "noch keine geschlossenen Trades"}
            </p>
          </div>
          <LimitTile label="Trades" value={String(check.trades)} limit={plan?.max_trades} ok={check.tradesOk} />
          <LimitTile label="Verlusttrades" value={String(check.losses)} limit={plan?.max_losses} ok={check.lossesOk} />
          <LimitTile
            label="Außerhalb Setups"
            value={plan?.strategy_ids.length ? String(offPlan) : "keine Setups geplant"}
            unit={plan?.strategy_ids.length ? (offPlan === 1 ? "Trade" : "Trades") : undefined}
            ok={plan?.strategy_ids.length ? offPlan === 0 : null}
            okText="Nur geplante Setups"
            failText="Außerhalb des Plans"
          />
        </div>

        {dayTrades.length ? (
          <ul className="divide-y divide-border overflow-hidden rounded-xl bg-card text-sm ring-1 ring-foreground/[0.07]">
            {dayTrades.map((t) => (
              <li key={t.id}>
                <Link href={`/journal/${t.id}`} className="flex items-center justify-between gap-3 px-5 py-3 transition-colors hover:bg-foreground/[0.03]">
                  <span className="min-w-0">
                    <span className="font-semibold">{t.symbol}</span>{" "}
                    <span className={t.direction === "long" ? "text-profit" : "text-loss"}>{t.direction === "long" ? "Long" : "Short"}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {formatDateTime(t.entry_time)} · {t.accounts?.name}
                      {t.strategy_id ? ` · ${strategyName.get(t.strategy_id) ?? "Strategie"}` : " · ohne Strategie"}
                    </span>
                  </span>
                  <span className={cn("font-semibold tabular-nums", pnlClass(t.net_pnl))}>
                    {t.status === "open" ? "offen" : formatMoney(t.net_pnl, t.accounts?.currency, true)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <div className="flex flex-col items-center gap-1.5 rounded-xl border border-dashed border-foreground/15 px-6 py-8 text-center">
            <LineChart className="size-5 text-muted-foreground/60" aria-hidden />
            <p className="text-sm font-medium">Keine Trades an diesem Tag</p>
            <Link href="/journal/new" className="text-sm text-profit underline-offset-4 hover:underline">
              Trade erfassen
            </Link>
          </div>
        )}
      </PlanSection>

      <ReviewForm key={`review-${date}-${plan?.updated_at ?? "neu"}`} date={date} plan={plan} />
    </div>
  );
}

/** Kennzahl mit Status-Symbol + Text (Farbe nie allein). */
function LimitTile({
  label,
  value,
  limit,
  unit,
  ok,
  okText = "Limit eingehalten",
  failText = "Limit überschritten",
}: {
  label: string;
  value: string;
  limit?: number | null;
  unit?: string;
  ok: boolean | null;
  okText?: string;
  failText?: string;
}) {
  const numeric = /^\d+$/.test(value);
  return (
    <div className="bg-card px-5 py-4">
      <PlanLabel>{label}</PlanLabel>
      <p
        className={cn(
          "mt-2 flex items-center gap-2 font-semibold tracking-tight tabular-nums",
          numeric ? "text-2xl" : "text-base text-muted-foreground",
        )}
      >
        {ok === true && <CheckCircle2 className="size-5 text-profit" aria-label="Eingehalten" />}
        {ok === false && <XCircle className="size-5 text-loss" aria-label="Überschritten" />}
        {value}
        {unit && <span className="text-sm font-medium text-muted-foreground">{unit}</span>}
        {limit != null && <span className="text-sm font-medium text-muted-foreground">/ max. {limit}</span>}
      </p>
      <p className={cn("text-xs", ok === false ? "text-loss" : "text-muted-foreground/80")}>
        {ok === true ? okText : ok === false ? failText : limit == null && numeric ? "kein Limit gesetzt" : " "}
      </p>
    </div>
  );
}
