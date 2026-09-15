import Link from "next/link";
import { ChevronLeft, ChevronRight, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { shortDate } from "@/components/charts/format";
import { StatTile } from "@/components/charts/stat-tile";
import { AiReportCard } from "@/components/ai/ai-report-card";
import { JournalAnalysisView } from "@/components/ai/journal-analysis-view";
import { PageHeader } from "@/components/layout/page-header";
import { aiConfigured } from "@/lib/ai/claude";
import { MAX_GENERATIONS, loadReport } from "@/lib/ai/reports";
import { JournalAnalysisSchema } from "@/lib/ai/schemas";
import { isValidDate, todayBerlin } from "@/lib/daily-plan";
import { buildIndex, computeStreaks, PARTS, scoreDays, type Streak } from "@/lib/discipline";
import { evaluateGoal, formatMetric, summarizePeriod } from "@/lib/goals";
import { loadDisciplineData } from "@/lib/goals-queries";
import { isPeriodType, PERIOD_TYPES, periodDays, periodLabel, periodStart, shiftPeriod, type PeriodType } from "@/lib/periods";
import { createClient } from "@/lib/supabase/server";
import { formatMoney, formatNumber, formatR, plural } from "@/lib/trading";
import { cn } from "@/lib/utils";
import { generateJournalAnalysis } from "./ai-actions";
import { GoalList, type GoalRow } from "./goal-list";
import { PeriodReviewForm } from "./period-review-form";

// Die KI-Analyse kann bis zu einer Minute dauern
export const maxDuration = 120;

const weekdayFormatter = new Intl.DateTimeFormat("de-DE", { weekday: "short", timeZone: "UTC" });

function streakTile(label: string, streak: Streak | null, unit: string, hint: string) {
  if (!streak) return <StatTile label={label} value="–" hint="Erst Risikoregeln festlegen" />;
  return (
    <StatTile
      label={label}
      value={plural(streak.current, unit, `${unit}e`)}
      hint={`${hint} · Rekord ${streak.best}`}
    />
  );
}

export default async function GoalsPage({ searchParams }: PageProps<"/goals">) {
  const sp = await searchParams;
  const type: PeriodType = isPeriodType(sp.period) ? sp.period : "week";
  const today = todayBerlin();
  const start = periodStart(isValidDate(sp.start) ? sp.start : today, type);
  const current = periodStart(today, type);
  const previous = shiftPeriod(start, type, -1);
  const label = periodLabel(start, type);
  const link = (t: PeriodType, s?: string) => `/goals?period=${t}${s ? `&start=${s}` : ""}`;

  const supabase = await createClient();
  const [{ data }, { data: goals }, { data: previousGoals }, { data: review }, { data: accounts }, { data: strategies }] = await Promise.all([
    loadDisciplineData(supabase),
    supabase.from("goals").select("*").eq("period_type", type).eq("period_start", start).order("position").order("created_at"),
    supabase.from("goals").select("id").eq("period_type", type).eq("period_start", previous),
    supabase.from("reviews").select("*").eq("period_type", type).eq("period_start", start).maybeSingle(),
    supabase.from("accounts").select("id, name, currency, status").order("name"),
    supabase.from("strategies").select("id, name"),
  ]);
  const analysis = await loadReport(supabase, type === "week" ? "journal_week" : "journal_month", start, JournalAnalysisSchema);

  const index = buildIndex(data);
  const days = periodDays(start, type);
  const score = scoreDays(index, days, today);
  const streaks = computeStreaks(index, today);
  const accountList = accounts ?? [];
  const accountOf = new Map(accountList.map((a) => [a.id, a]));
  const ctx = { index, type, start, today };

  const rows: GoalRow[] = (goals ?? []).map((goal) => {
    const result = evaluateGoal(goal, ctx);
    const currency = goal.account_id ? accountOf.get(goal.account_id)?.currency : undefined;
    return {
      goal,
      valueText: formatMetric(goal.metric, result.value, currency),
      targetText: formatMetric(goal.metric, Number(goal.target), currency),
      progress: result.progress,
      status: result.status,
      accountName: goal.account_id ? (accountOf.get(goal.account_id)?.name ?? null) : null,
    };
  });

  const summary = summarizePeriod(
    data,
    type,
    start,
    today,
    new Map(accountList.map((a) => [a.id, a.currency])),
    new Map((strategies ?? []).map((s) => [s.id, s.name])),
  );
  const dayScores = days.filter((d) => index.tradesByDay.has(d)).map((d) => ({ date: d, ...scoreDays(index, [d], today) }));

  return (
    <>
      <PageHeader title="Ziele & Reviews" description={label}>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border p-0.5" role="group" aria-label="Zeitraum">
            {PERIOD_TYPES.map((p) => (
              <Link
                key={p.value}
                href={link(p.value, p.value === type ? start : periodStart(start, p.value))}
                aria-current={p.value === type ? "true" : undefined}
                className={cn(
                  "rounded-md px-3 py-1 text-sm transition-colors",
                  p.value === type ? "bg-secondary font-medium" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {p.label}
              </Link>
            ))}
          </div>
          <Button variant="outline" size="icon" asChild>
            <Link href={link(type, previous)} aria-label={type === "week" ? "Vorherige Woche" : "Vorheriger Monat"}>
              <ChevronLeft className="size-4" />
            </Link>
          </Button>
          <Button variant="outline" size="icon" asChild>
            <Link href={link(type, shiftPeriod(start, type, 1))} aria-label={type === "week" ? "Nächste Woche" : "Nächster Monat"}>
              <ChevronRight className="size-4" />
            </Link>
          </Button>
          {start !== current && (
            <Button variant="ghost" asChild>
              <Link href={link(type)}>{type === "week" ? "Diese Woche" : "Dieser Monat"}</Link>
            </Button>
          )}
          <Button variant="outline" asChild>
            <Link href="/goals/reviews">
              <History className="size-4" /> Alle Reviews
            </Link>
          </Button>
        </div>
      </PageHeader>

      <div className="grid gap-6">
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-5" aria-label="Disziplin und Serien">
          <StatTile
            label={`Disziplin · ${type === "week" ? "Woche" : "Monat"}`}
            value={score.score == null ? "–" : `${score.score} / 100`}
            hint={score.trades ? `${plural(score.trades, "Trade", "Trades")} an ${plural(score.tradingDays, "Tag", "Tagen")}` : "Keine Trades im Zeitraum"}
            className="col-span-2 lg:col-span-1"
          />
          {streakTile("Plan-Serie", streaks.plan, "Tag", "Werktage mit Plan")}
          {streakTile("Journal-Serie", streaks.journal, "Tag", "Handelstage gepflegt")}
          {streakTile("Regel-Serie", streaks.rules, "Tag", "Handelstage ohne Verstoß")}
          {streakTile("Review-Serie", streaks.review, "Tag", "Handelstage mit Review")}
        </section>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <Card>
            <CardHeader>
              <CardTitle>Ziele</CardTitle>
              <CardDescription>Werden automatisch aus Journal, Tagesplänen und Regeln gemessen</CardDescription>
            </CardHeader>
            <CardContent>
              <GoalList
                rows={rows}
                type={type}
                start={start}
                previousStart={previous}
                previousCount={previousGoals?.length ?? 0}
                periodLabel={label}
                accounts={accountList.filter((a) => a.status === "active" || (goals ?? []).some((g) => g.account_id === a.id)).map(({ id, name }) => ({ id, name }))}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Disziplin-Score</CardTitle>
              <CardDescription>Gewichteter Durchschnitt – Teile ohne Daten zählen nicht mit</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-5 text-sm">
              <ul className="grid gap-3">
                {score.parts.map((p) => {
                  const hint = PARTS.find((x) => x.key === p.key)!.hint;
                  const percent = p.value == null ? null : Math.round(p.value * 100);
                  return (
                    <li key={p.key} className="grid gap-1">
                      <div className="flex justify-between gap-2">
                        <span>
                          {p.label} <span className="text-xs text-muted-foreground">· Gewicht {p.weight}</span>
                        </span>
                        <span className="font-medium tabular-nums">{percent == null ? "keine Daten" : `${percent} %`}</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
                        {percent != null && <div className="h-full rounded-full bg-chart-line" style={{ width: `${Math.max(percent > 0 ? 2 : 0, percent)}%` }} />}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {p.key === "rules" && p.value == null ? "Leg unter Risiko-Tools eigene Regeln fest, damit dieser Teil zählt." : hint}
                      </p>
                    </li>
                  );
                })}
              </ul>

              {dayScores.length > 0 && (
                <div className="grid gap-1.5">
                  <p className="font-medium">Je Handelstag</p>
                  <table className="w-full">
                    <thead className="sr-only">
                      <tr>
                        <th>Tag</th>
                        <th>Trades</th>
                        <th>Score</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dayScores.map((d) => (
                        <tr key={d.date}>
                          <td className="w-24 py-0.5 whitespace-nowrap">
                            <Link href={`/plan?date=${d.date}`} className="hover:underline">
                              {weekdayFormatter.format(new Date(`${d.date}T12:00:00Z`))} {shortDate(d.date)}
                            </Link>
                          </td>
                          <td className="w-16 py-0.5 text-xs text-muted-foreground tabular-nums">{plural(d.trades, "Trade", "Trades")}</td>
                          <td className="py-0.5">
                            <div className="flex items-center gap-2">
                              <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted" aria-hidden>
                                <div className="h-full rounded-full bg-chart-line" style={{ width: `${d.score ?? 0}%` }} />
                              </div>
                              <span className="w-8 text-right tabular-nums">{d.score ?? "–"}</span>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {start <= today && (
          <AiReportCard
            title={type === "week" ? "KI-Wochenanalyse" : "KI-Monatsanalyse"}
            intro="Claude sucht in Trades, Notizen, Regelverstößen und Tages-Reviews nach wiederkehrenden Fehlern und deinen besten Setups."
            configured={aiConfigured()}
            updatedAt={analysis.report?.updatedAt ?? null}
            remaining={MAX_GENERATIONS - analysis.generations}
            action={generateJournalAnalysis.bind(null, type, start)}
            buttonLabel="Analyse erstellen"
          >
            {analysis.report && <JournalAnalysisView analysis={analysis.report.data} />}
          </AiReportCard>
        )}

        <Card>
          <CardHeader>
            <CardTitle>{type === "week" ? "Wochen-Review" : "Monats-Review"}</CardTitle>
            <CardDescription>
              {review ? `Gespeichert · zuletzt geändert am ${shortDate(review.updated_at)}` : "Die Kennzahlen sind schon eingetragen – ergänze deine Gedanken."}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
            <dl className="grid h-fit grid-cols-2 gap-x-4 gap-y-2 rounded-md border p-4 text-sm">
              {(
                [
                  ["Ergebnis", summary.pnlByCurrency.length ? summary.pnlByCurrency.map(([c, v]) => formatMoney(v, c, true)).join(" · ") : "–"],
                  ["Trades", `${summary.trades} an ${plural(summary.tradingDays, "Tag", "Tagen")}`],
                  ["Winrate", summary.winRate == null ? "–" : `${formatNumber(summary.winRate * 100, 1)} %`],
                  ["Ø R", formatR(summary.avgR)],
                  ["Disziplin", summary.discipline == null ? "–" : `${summary.discipline} / 100`],
                  ["Tagespläne", `${summary.planDays} · davon ${summary.reviewDays} mit Review`],
                  ["Regelverstöße", summary.violations ? `${plural(summary.violations, "Trade", "Trades")}` : "keine"],
                ] as const
              ).map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="text-muted-foreground">{k}</dt>
                  <dd className="text-right tabular-nums">{v}</dd>
                </div>
              ))}
              {summary.violationsByKind.length > 0 && (
                <div className="col-span-2 text-xs text-muted-foreground">
                  {summary.violationsByKind.map(([k, n]) => `${k} (${n})`).join(" · ")}
                </div>
              )}
              {summary.strategies.length > 0 && (
                <div className="col-span-2 grid gap-1 border-t pt-2">
                  <dt className="text-muted-foreground">Strategien</dt>
                  {summary.strategies.map((s) => (
                    <dd key={s.name} className="flex justify-between gap-2">
                      <span className="truncate">{s.name}</span>
                      <span className="tabular-nums">
                        {s.trades} · {s.winRate == null ? "–" : `${Math.round(s.winRate * 100)} %`}
                      </span>
                    </dd>
                  ))}
                </div>
              )}
              {summary.topMistakes.length > 0 && (
                <div className="col-span-2 grid gap-1 border-t pt-2">
                  <dt className="text-muted-foreground">Häufigste Fehler</dt>
                  {summary.topMistakes.map(([m, n]) => (
                    <dd key={m} className="flex justify-between gap-2">
                      <span className="truncate">{m}</span>
                      <span className="tabular-nums">{n}×</span>
                    </dd>
                  ))}
                </div>
              )}
            </dl>
            <PeriodReviewForm key={`${type}-${start}-${review?.updated_at ?? "neu"}`} type={type} start={start} review={review} suggestedLessons={summary.lessons} />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
