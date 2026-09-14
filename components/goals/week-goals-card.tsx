import Link from "next/link";
import { ArrowRight, CheckCircle2, CircleDashed, Flame, Target, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GOAL_STATUS_LABELS, type GoalStatus } from "@/lib/goals";
import { plural } from "@/lib/trading";

export type WeekGoal = { id: string; title: string; status: GoalStatus; valueText: string };

/** Dashboard: Disziplin der Woche, Ziele und Plan-Serie. */
export function WeekGoalsCard({
  score,
  goals,
  planStreak,
  hasReview,
  isWeekend,
}: {
  score: number | null;
  goals: WeekGoal[];
  planStreak: number;
  hasReview: boolean;
  isWeekend: boolean;
}) {
  const reached = goals.filter((g) => g.status === "reached").length;
  return (
    <Card className="gap-3">
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2">
            <Target className="size-4" /> Diese Woche
          </CardTitle>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/goals">
              Ziele <ArrowRight className="size-4" />
            </Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="grid gap-3 text-sm">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-xs text-muted-foreground">Disziplin</p>
            <p className="text-xl font-semibold tabular-nums">{score == null ? "–" : `${score}/100`}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Plan-Serie</p>
            <p className="flex items-center gap-1 text-xl font-semibold tabular-nums">
              <Flame className="size-4 text-warning" aria-hidden /> {plural(planStreak, "Tag", "Tage")}
            </p>
          </div>
        </div>
        {goals.length ? (
          <>
            <p className="text-muted-foreground">
              {reached} von {goals.length} {goals.length === 1 ? "Ziel" : "Zielen"} erreicht
            </p>
            <ul className="grid gap-1">
              {goals.slice(0, 4).map((g) => {
                const bad = g.status === "failed" || g.status === "missed";
                const Icon = g.status === "reached" || g.status === "on_track" ? CheckCircle2 : bad ? XCircle : CircleDashed;
                return (
                  <li key={g.id} className="flex items-center gap-2">
                    <Icon
                      className={bad ? "size-4 shrink-0 text-loss" : g.status === "reached" ? "size-4 shrink-0 text-profit" : "size-4 shrink-0 text-muted-foreground"}
                      aria-hidden
                    />
                    <span className="sr-only">{GOAL_STATUS_LABELS[g.status]}:</span>
                    <span className="min-w-0 flex-1 truncate">{g.title}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">{g.valueText}</span>
                  </li>
                );
              })}
            </ul>
          </>
        ) : (
          <p className="text-muted-foreground">
            Noch keine Wochenziele.{" "}
            <Link href="/goals" className="underline underline-offset-4 hover:text-foreground">
              Ziele setzen
            </Link>
          </p>
        )}
        {!hasReview && isWeekend && (
          <p className="border-t pt-2 text-xs text-muted-foreground">Wochenende – Zeit für dein Wochen-Review.</p>
        )}
      </CardContent>
    </Card>
  );
}
