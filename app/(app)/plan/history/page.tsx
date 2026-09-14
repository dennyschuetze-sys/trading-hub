import Link from "next/link";
import { ArrowLeft, CalendarCheck, CheckCircle2, CircleDashed, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { longDate } from "@/components/charts/format";
import { PageHeader } from "@/components/layout/page-header";
import { BIASES, checkDay, planStatus, readMarkets, readRoutine } from "@/lib/daily-plan";
import { berlinParts } from "@/lib/stats";
import { createClient } from "@/lib/supabase/server";
import { dayBoundary, formatMoney, labelFor } from "@/lib/trading";

export default async function PlanHistoryPage() {
  const supabase = await createClient();
  const { data: plans } = await supabase
    .from("daily_plans")
    .select("*")
    .order("plan_date", { ascending: false })
    .limit(90);

  const list = plans ?? [];
  const oldest = list.at(-1)?.plan_date;
  const { data: trades } = oldest
    ? await supabase
        .from("trades")
        .select("entry_time, net_pnl, status, accounts(currency)")
        .eq("is_backtest", false)
        .gte("entry_time", dayBoundary(oldest, "start"))
        .limit(5000)
    : { data: [] };

  const tradesByDay = new Map<string, NonNullable<typeof trades>>();
  (trades ?? []).forEach((t) => {
    const day = berlinParts(t.entry_time).date;
    tradesByDay.set(day, [...(tradesByDay.get(day) ?? []), t]);
  });

  const reviewed = list.filter((p) => p.reviewed_at);
  const disciplined = reviewed.filter((p) => p.discipline != null);
  const avgDiscipline = disciplined.length
    ? disciplined.reduce((s, p) => s + p.discipline!, 0) / disciplined.length
    : null;

  return (
    <>
      <PageHeader title="Verlauf der Tagespläne" description="Die letzten 90 geplanten Tage">
        <Button variant="outline" asChild>
          <Link href="/plan">
            <ArrowLeft className="size-4" /> Zum heutigen Plan
          </Link>
        </Button>
      </PageHeader>

      {!list.length ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <CalendarCheck className="size-8 text-muted-foreground" />
            <p className="font-medium">Noch keine Tagespläne</p>
            <Button asChild>
              <Link href="/plan">Heute planen</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <Card className="gap-0 py-4">
              <CardContent className="px-4">
                <p className="text-sm text-muted-foreground">Geplante Tage</p>
                <p className="text-2xl font-semibold">{list.length}</p>
              </CardContent>
            </Card>
            <Card className="gap-0 py-4">
              <CardContent className="px-4">
                <p className="text-sm text-muted-foreground">Mit Review</p>
                <p className="text-2xl font-semibold">
                  {reviewed.length} <span className="text-base font-normal text-muted-foreground">({Math.round((reviewed.length / list.length) * 100)} %)</span>
                </p>
              </CardContent>
            </Card>
            <Card className="gap-0 py-4">
              <CardContent className="px-4">
                <p className="text-sm text-muted-foreground">Ø Disziplin</p>
                <p className="text-2xl font-semibold">{avgDiscipline == null ? "–" : `${avgDiscipline.toFixed(1).replace(".", ",")} / 5`}</p>
              </CardContent>
            </Card>
          </div>

          <Card className="py-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tag</TableHead>
                    <TableHead>Fokus & Bias</TableHead>
                    <TableHead className="text-right">Trades</TableHead>
                    <TableHead className="text-right">Ergebnis</TableHead>
                    <TableHead>Limits</TableHead>
                    <TableHead className="text-right">Disziplin</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {list.map((p) => {
                    const dayTrades = tradesByDay.get(p.plan_date) ?? [];
                    const check = checkDay(p, dayTrades);
                    const sums = new Map<string, number>();
                    dayTrades.forEach((t) => {
                      if (t.status !== "closed" || t.net_pnl == null) return;
                      const cur = t.accounts?.currency ?? "USD";
                      sums.set(cur, Math.round(((sums.get(cur) ?? 0) + t.net_pnl) * 100) / 100);
                    });
                    const markets = readMarkets(p.markets).filter((m) => m.symbol);
                    const routine = readRoutine(p.routine);
                    const limitsSet = check.tradesOk != null || check.lossesOk != null;
                    const limitsOk = check.tradesOk !== false && check.lossesOk !== false;
                    const status = planStatus(p);

                    return (
                      <TableRow key={p.id} className="relative">
                        <TableCell className="whitespace-nowrap">
                          <Link href={`/plan?date=${p.plan_date}`} className="font-medium after:absolute after:inset-0">
                            {longDate(p.plan_date)}
                          </Link>
                        </TableCell>
                        <TableCell className="max-w-72">
                          {p.focus && <p className="truncate">{p.focus}</p>}
                          <div className="flex flex-wrap gap-1">
                            {markets.slice(0, 4).map((m, i) => (
                              <Badge key={`${m.symbol}-${i}`} variant="outline" className="font-normal">
                                {m.symbol}
                                {m.bias && ` · ${labelFor(BIASES, m.bias).split(" ")[0]}`}
                              </Badge>
                            ))}
                            {routine.length > 0 && (
                              <Badge variant="outline" className="font-normal text-muted-foreground">
                                Routine {routine.filter((r) => r.done).length}/{routine.length}
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{check.trades}</TableCell>
                        <TableCell className="text-right whitespace-nowrap tabular-nums">
                          {sums.size ? [...sums].map(([cur, v]) => formatMoney(v, cur, true)).join(" · ") : "–"}
                        </TableCell>
                        <TableCell>
                          {!limitsSet ? (
                            <span className="text-muted-foreground">–</span>
                          ) : limitsOk ? (
                            <span className="inline-flex items-center gap-1">
                              <CheckCircle2 className="size-4 text-profit" aria-hidden /> Eingehalten
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1">
                              <XCircle className="size-4 text-loss" aria-hidden /> Überschritten
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{p.discipline ? `${p.discipline}/5` : "–"}</TableCell>
                        <TableCell>
                          {status === "reviewed" ? (
                            <span className="inline-flex items-center gap-1 whitespace-nowrap">
                              <CheckCircle2 className="size-4 text-profit" aria-hidden /> Review
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 whitespace-nowrap text-muted-foreground">
                              <CircleDashed className="size-4" aria-hidden /> Review offen
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </Card>
        </div>
      )}
    </>
  );
}
