import Link from "next/link";
import { ArrowRight, CalendarCheck, CheckCircle2, CircleDashed } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BIASES, planStatus, readMarkets, readRoutine, type DailyPlan } from "@/lib/daily-plan";
import { labelFor } from "@/lib/trading";

/** Dashboard-Karte: Stand des heutigen Tagesplans mit direktem Einstieg. */
export function TodayPlanCard({ plan, tradesToday }: { plan: DailyPlan | null; tradesToday: number }) {
  const status = planStatus(plan);
  const markets = plan ? readMarkets(plan.markets).filter((m) => m.symbol) : [];
  const routine = plan ? readRoutine(plan.routine) : [];
  const routineDone = routine.filter((r) => r.done).length;

  return (
    <Card className="gap-3">
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2">
            <CalendarCheck className="size-4" /> Tagesplan heute
          </CardTitle>
          <Button variant={status === "missing" ? "default" : "ghost"} size="sm" asChild>
            <Link href="/plan">
              {status === "missing" ? "Jetzt planen" : status === "planned" ? "Öffnen" : "Ansehen"}
              <ArrowRight className="size-4" />
            </Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="grid gap-2 text-sm">
        {status === "missing" ? (
          <p className="flex items-center gap-2 text-muted-foreground">
            <CircleDashed className="size-4" aria-hidden />
            Noch kein Plan{tradesToday > 0 ? ` – aber schon ${tradesToday} ${tradesToday === 1 ? "Trade" : "Trades"} heute.` : "."}
          </p>
        ) : (
          <>
            <p className="flex items-center gap-2">
              {status === "reviewed" ? (
                <CheckCircle2 className="size-4 text-profit" aria-hidden />
              ) : (
                <CircleDashed className="size-4 text-muted-foreground" aria-hidden />
              )}
              {status === "reviewed" ? "Plan & Review erledigt" : "Plan steht · Review nach der Session offen"}
            </p>
            {plan?.focus && <p className="text-muted-foreground">Fokus: {plan.focus}</p>}
            <div className="flex flex-wrap gap-1.5">
              {markets.slice(0, 5).map((m, i) => (
                <Badge key={`${m.symbol}-${i}`} variant="outline" className="font-normal">
                  {m.symbol}
                  {m.bias && ` · ${labelFor(BIASES, m.bias).split(" ")[0]}`}
                </Badge>
              ))}
              {routine.length > 0 && (
                <Badge variant="outline" className="font-normal">
                  Routine {routineDone}/{routine.length}
                </Badge>
              )}
              {plan?.max_trades != null && (
                <Badge variant="outline" className="font-normal">
                  Trades {tradesToday}/{plan.max_trades}
                </Badge>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
