import Link from "next/link";
import { ArrowRight, CheckCircle2, CircleDashed, Flame, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { eventTime, ImpactLabel } from "@/components/news/event-list";
import { berlinDay, relativeTime, type CalendarEvent } from "@/lib/calendar";
import { planStatus, type DailyPlan } from "@/lib/daily-plan";
import { GOAL_STATUS_LABELS, type GoalStatus } from "@/lib/goals";
import { formatDateTime, formatMoney, pnlClass, plural } from "@/lib/trading";
import { cn } from "@/lib/utils";
import { Eyebrow, ToneIcon } from "./status";

function CardHead({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <p className="text-sm font-semibold">{title}</p>
      {children}
    </div>
  );
}

/** Tagesplan: ohne Plan ein klarer Einstieg, mit Plan die wichtigsten Eckdaten. */
export function PlanCard({ plan, tradesToday }: { plan: DailyPlan | null; tradesToday: number }) {
  const status = planStatus(plan);

  if (!plan) {
    return (
      <Card className="gap-0 py-0">
        <CardContent className="flex h-full flex-col gap-3 p-5">
          <CardHead title="Tagesplan">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-foreground/[0.06] px-2.5 py-0.5 text-xs text-muted-foreground">
              <CircleDashed className="size-3.5" aria-hidden /> Offen
            </span>
          </CardHead>
          <div className="grid gap-1 pt-2">
            <p className="text-base font-semibold">Noch kein Tagesplan</p>
            <p className="text-sm text-muted-foreground">
              Definiere Fokus, Markt-Bias und Limits, bevor du deine Session startest.
              {tradesToday > 0 && ` Heute schon ${plural(tradesToday, "Trade", "Trades")}.`}
            </p>
          </div>
          <div className="mt-auto pt-2">
            <Button size="sm" asChild>
              <Link href="/plan">
                Jetzt planen <ArrowRight className="size-4" />
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const facts = [
    plan.focus ? { label: "Fokus", value: plan.focus, wide: true } : null,
    plan.mood_before != null ? { label: "Stimmung", value: `${plan.mood_before} / 5` } : null,
    plan.energy != null ? { label: "Energie", value: `${plan.energy} / 5` } : null,
    plan.max_trades != null ? { label: "Trades", value: `${tradesToday} / ${plan.max_trades}` } : null,
    plan.max_losses != null ? { label: "Max. Verluste", value: String(plan.max_losses) } : null,
  ].filter((f): f is { label: string; value: string; wide?: boolean } => f != null);

  return (
    <Card className="gap-0 py-0">
      <CardContent className="flex h-full flex-col gap-3 p-5">
        <CardHead title="Tagesplan">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/plan">
              {status === "planned" ? "Öffnen" : "Ansehen"} <ArrowRight className="size-4" />
            </Link>
          </Button>
        </CardHead>
        <p className="flex items-center gap-2 text-sm font-medium">
          <ToneIcon tone="ok" />
          {status === "reviewed" ? "Plan & Review erledigt" : "Tagesplan erstellt · Review offen"}
        </p>
        {facts.length ? (
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 pt-1">
            {facts.map((f) => (
              <div key={f.label} className={cn("min-w-0", f.wide && "col-span-2")}>
                <dt className="text-xs text-muted-foreground">{f.label}</dt>
                <dd className={cn("font-semibold tabular-nums", f.wide ? "line-clamp-2" : "text-lg")}>{f.value}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="text-sm text-muted-foreground">Noch keine Eckdaten eingetragen.</p>
        )}
      </CardContent>
    </Card>
  );
}

/** Nächster High-Impact-Termin hervorgehoben, darunter die heutigen Termine. */
export function NewsCard({
  events,
  next,
  now,
  currencies,
  error,
}: {
  events: CalendarEvent[];
  next: CalendarEvent | null;
  now: Date;
  currencies: string[];
  error: string | null;
}) {
  const nowIso = now.toISOString();
  const today = berlinDay(nowIso);
  const highToday = events.some((e) => e.impact === "high");

  return (
    <Card className="gap-0 py-0">
      <CardContent className="flex h-full flex-col gap-3 p-5">
        <CardHead title="News & Termine">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/news">
              {currencies.length ? currencies.join(" · ") : "Kalender"} <ArrowRight className="size-4" />
            </Link>
          </Button>
        </CardHead>

        {error ? (
          <p className="text-sm text-muted-foreground">{error}</p>
        ) : (
          <>
            {next && (
              <div className="rounded-lg bg-warning/[0.07] p-3.5 ring-1 ring-warning/25">
                <Eyebrow className="text-warning">Nächstes High-Impact-Event</Eyebrow>
                <div className="mt-2 flex items-end justify-between gap-3">
                  <div className="min-w-0">
                    <span className="rounded-md bg-foreground/[0.08] px-1.5 py-0.5 text-xs font-semibold">{next.currency}</span>
                    <p className="mt-1.5 truncate font-semibold">{next.title}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-2xl leading-none font-semibold tabular-nums">
                      {berlinDay(next.time) === today ? eventTime(next) : formatDateTime(next.time)}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">{relativeTime(next.time, now)}</p>
                  </div>
                </div>
              </div>
            )}
            {!highToday && (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <ToneIcon tone="ok" /> Keine relevanten High-Impact-Events heute.
              </p>
            )}
            {events.length > 0 && (
              <div className="grid gap-2">
                <Eyebrow>Heute</Eyebrow>
                <ul className="grid gap-1.5 text-sm">
                  {events.slice(0, 5).map((e) => (
                    <li key={e.id} className={cn("flex items-center gap-2", e.time < nowIso && "text-muted-foreground")}>
                      <span className="w-11 shrink-0 tabular-nums">{eventTime(e)}</span>
                      <ImpactLabel impact={e.impact} compact />
                      <span className="w-8 shrink-0 text-xs font-medium">{e.currency}</span>
                      <span className="truncate">{e.title}</span>
                    </li>
                  ))}
                  {events.length > 5 && <li className="text-xs text-muted-foreground">+ {events.length - 5} weitere</li>}
                </ul>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

export type WeekGoal = { id: string; title: string; status: GoalStatus; valueText: string };

/** Woche: Ergebnis, Disziplin, Plan-Serie und Wochenziele. */
export function WeekFocusCard({
  pnl,
  trades,
  currency,
  score,
  planStreak,
  goals,
  showReviewHint,
}: {
  pnl: number;
  trades: number;
  currency: string;
  score: number | null;
  planStreak: number;
  goals: WeekGoal[];
  showReviewHint: boolean;
}) {
  const stats: { label: string; value: React.ReactNode; className?: string }[] = [
    { label: "Wochen-P&L", value: trades ? formatMoney(pnl, currency, true) : "–", className: pnlClass(trades ? pnl : null) },
    { label: "Trades", value: String(trades) },
    {
      label: "Disziplin",
      value:
        score == null ? (
          "–"
        ) : (
          <>
            {score}
            <span className="text-sm font-medium text-muted-foreground"> / 100</span>
          </>
        ),
    },
    {
      label: "Plan-Serie",
      value: (
        <span className="inline-flex items-center gap-1">
          {planStreak > 0 && <Flame className="size-4 text-warning" aria-hidden />}
          {planStreak}
          <span className="text-sm font-medium text-muted-foreground">{planStreak === 1 ? " Tag" : " Tage"}</span>
        </span>
      ),
    },
  ];

  return (
    <Card className="gap-0 py-0">
      <CardContent className="flex h-full flex-col gap-3 p-5">
        <CardHead title="Wochenfokus">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/goals">
              Ziele <ArrowRight className="size-4" />
            </Link>
          </Button>
        </CardHead>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
          {stats.map((s) => (
            <div key={s.label}>
              <dt>
                <Eyebrow>{s.label}</Eyebrow>
              </dt>
              <dd className={cn("mt-1 text-xl font-semibold tabular-nums", s.className)}>{s.value}</dd>
            </div>
          ))}
        </dl>
        <div className="grid gap-2 border-t pt-3">
          <Eyebrow>Wochenziele</Eyebrow>
          {goals.length ? (
            <ul className="grid gap-1.5 text-sm">
              {goals.slice(0, 3).map((g) => {
                const bad = g.status === "failed" || g.status === "missed";
                const good = g.status === "reached" || g.status === "on_track";
                const Icon = good ? CheckCircle2 : bad ? XCircle : CircleDashed;
                return (
                  <li key={g.id} className="flex items-center gap-2">
                    <Icon className={cn("size-4 shrink-0", bad ? "text-loss" : good ? "text-profit" : "text-muted-foreground")} aria-hidden />
                    <span className="sr-only">{GOAL_STATUS_LABELS[g.status]}:</span>
                    <span className="min-w-0 flex-1 truncate">{g.title}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">{g.valueText}</span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              Noch keine Wochenziele.{" "}
              <Link href="/goals" className="underline underline-offset-4 hover:text-foreground">
                Ziele setzen
              </Link>
            </p>
          )}
        </div>
        {showReviewHint && <p className="mt-auto border-t pt-2 text-xs text-muted-foreground">Wochenende – Zeit für dein Wochen-Review.</p>}
      </CardContent>
    </Card>
  );
}
