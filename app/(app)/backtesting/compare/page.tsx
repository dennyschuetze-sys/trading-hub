import Link from "next/link";
import { GitCompareArrows } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/layout/page-header";
import { VERDICT_LABELS, compareVerdict, rStats, type RStats, type Verdict } from "@/lib/backtests";
import { fetchBacktestTrades, fetchStatTrades } from "@/lib/queries";
import { createClient } from "@/lib/supabase/server";
import { formatNumber, formatR } from "@/lib/trading";
import { cn } from "@/lib/utils";
import { BacktestNav } from "../backtest-nav";

const pct = (v: number | null) => (v == null ? "–" : `${formatNumber(v * 100, 1)} %`);

type Metric = {
  label: string;
  value: (s: RStats) => number | null;
  format: (v: number | null) => string;
  /** Differenz formatieren (Live minus Backtest) */
  diff: (d: number) => string;
};

const METRICS: Metric[] = [
  { label: "Trades", value: (s) => s.count, format: (v) => String(v ?? 0), diff: () => "" },
  {
    label: "Winrate",
    value: (s) => s.winRate,
    format: pct,
    diff: (d) => `${d > 0 ? "+" : ""}${formatNumber(d * 100, 1)} Pp.`,
  },
  { label: "Ø R pro Trade", value: (s) => s.avgR, format: formatR, diff: (d) => formatR(Math.round(d * 100) / 100) },
  { label: "Ø Gewinner", value: (s) => s.avgWinR, format: formatR, diff: (d) => formatR(Math.round(d * 100) / 100) },
  { label: "Ø Verlierer", value: (s) => s.avgLossR, format: formatR, diff: (d) => formatR(Math.round(d * 100) / 100) },
  {
    label: "Profit Factor (R)",
    value: (s) => s.profitFactorR,
    format: (v) => (v == null ? "–" : formatNumber(v, 2)),
    diff: (d) => `${d > 0 ? "+" : ""}${formatNumber(d, 2)}`,
  },
];

const VERDICT_STYLE: Record<Verdict, string> = {
  too_few: "border-border text-muted-foreground",
  on_track: "border-profit/40 text-profit",
  stronger: "border-profit/40 text-profit",
  weaker: "border-loss/40 text-loss",
};

export default async function ComparePage() {
  const supabase = await createClient();
  const [{ data: strategies }, backtests, live] = await Promise.all([
    supabase.from("strategies").select("id, name, status").order("name"),
    fetchBacktestTrades(supabase),
    fetchStatTrades(supabase),
  ]);

  const rows = (strategies ?? [])
    .map((st) => {
      const bt = rStats(backtests.filter((t) => t.strategy_id === st.id));
      const lv = rStats(live.filter((t) => t.strategy_id === st.id));
      return { strategy: st, bt, lv, verdict: compareVerdict(bt, lv) };
    })
    .filter((r) => r.bt.count > 0);

  const unassigned = backtests.filter((t) => !t.strategy_id).length;

  return (
    <>
      <PageHeader title="Backtest vs. Live" description="Hält die Strategie im echten Trading, was der Backtest verspricht?" />
      <BacktestNav active="/backtesting/compare" />

      <p className="mb-4 max-w-3xl text-sm text-muted-foreground">
        Verglichen wird in R, damit unterschiedliche Kontogrößen und Währungen keine Rolle spielen. Ø R zählt nur Trades mit
        eingetragenem Risiko. Eine Abweichung ab 10 Prozentpunkten Winrate oder 0,3 R gilt als deutlich.
      </p>

      {unassigned > 0 && (
        <p className="mb-4 text-sm text-muted-foreground">
          {unassigned} Backtest-{unassigned === 1 ? "Trade ist" : "Trades sind"} keiner Strategie zugeordnet und fehlen hier.
        </p>
      )}

      {!rows.length ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <GitCompareArrows className="size-8 text-muted-foreground" />
            <p className="font-medium">Noch nichts zu vergleichen</p>
            <p className="max-w-md text-sm text-muted-foreground">
              Lege eine Backtest-Session mit Strategie an und erfasse ein paar Trades. Sobald du dieselbe Strategie auch live
              handelst, siehst du hier beide Seiten nebeneinander.
            </p>
            <Button asChild>
              <Link href="/backtesting/new">Session anlegen</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {rows.map(({ strategy, bt, lv, verdict }) => (
            <Card key={strategy.id} className="gap-3 pb-0">
              <CardHeader>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <CardTitle>
                    <Link href={`/strategies/${strategy.id}`} className="hover:underline">
                      {strategy.name}
                    </Link>
                  </CardTitle>
                  <Badge variant="outline" className={cn("whitespace-normal", VERDICT_STYLE[verdict])}>
                    {VERDICT_LABELS[verdict]}
                  </Badge>
                </div>
                {lv.count > 0 && lv.rCount < lv.count && (
                  <CardDescription>
                    {lv.count - lv.rCount} Live-Trades ohne Risiko fließen nicht in die R-Werte ein.
                  </CardDescription>
                )}
              </CardHeader>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="pl-6">Kennzahl</TableHead>
                      <TableHead className="text-right">Backtest</TableHead>
                      <TableHead className="text-right">Live</TableHead>
                      <TableHead className="pr-6 text-right">Differenz</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {METRICS.map((m) => {
                      const a = m.value(bt);
                      const b = m.value(lv);
                      const d = a != null && b != null && m.label !== "Trades" ? b - a : null;
                      return (
                        <TableRow key={m.label}>
                          <TableCell className="pl-6 text-muted-foreground">{m.label}</TableCell>
                          <TableCell className="text-right tabular-nums">{m.format(a)}</TableCell>
                          <TableCell className="text-right tabular-nums">{lv.count ? m.format(b) : "–"}</TableCell>
                          <TableCell
                            className={cn(
                              "pr-6 text-right tabular-nums",
                              d != null && Math.abs(d) > 1e-9 && (d > 0 ? "text-profit" : "text-loss"),
                            )}
                          >
                            {d == null || !lv.count ? "" : m.diff(d)}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
