import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EquityPanel, type EquityChartPoint } from "@/components/charts/equity-chart";
import type { Streak } from "@/lib/dashboard";
import type { Highlight } from "@/lib/insights";
import type { Summary } from "@/lib/stats";
import { formatMoney, formatNumber, formatR, pnlClass } from "@/lib/trading";
import { cn } from "@/lib/utils";
import { Eyebrow } from "./status";

/** Große Equity-Karte: Kontostand, Gesamtergebnis und Kurve mit Umschalter. */
export function EquityCard({
  accountId,
  accountName,
  points,
  startingBalance,
  currency,
  facts,
}: {
  accountId: string;
  accountName: string;
  points: EquityChartPoint[];
  startingBalance: number;
  currency: string;
  facts: { label: string; value: string; className?: string }[];
}) {
  const balance = points.at(-1)?.balance ?? startingBalance;
  const total = Math.round((balance - startingBalance) * 100) / 100;
  const percent = startingBalance > 0 ? (total / startingBalance) * 100 : null;

  return (
    <Card className="gap-0 py-0">
      <CardContent className="grid gap-4 p-5">
        <EquityPanel
          points={points}
          startingBalance={startingBalance}
          currency={currency}
          height={260}
          summary={
            <div className="grid gap-4">
              <div>
                <Eyebrow>Equity · {accountName}</Eyebrow>
                <p className="mt-1.5 text-4xl leading-none font-semibold tracking-tight tabular-nums">{formatMoney(balance, currency)}</p>
                <p className="mt-2 text-sm tabular-nums">
                  <span className={cn("font-semibold", pnlClass(total))}>{formatMoney(total, currency, true)}</span>
                  <span className="text-muted-foreground">
                    {" "}
                    gesamt{percent != null && ` · ${percent > 0 ? "+" : ""}${formatNumber(percent, 1)} %`}
                  </span>
                </p>
              </div>
              <dl className="flex flex-wrap gap-x-7 gap-y-2">
                {facts.map((f) => (
                  <div key={f.label}>
                    <dd className={cn("text-[0.9375rem] font-semibold tabular-nums", f.className)}>{f.value}</dd>
                    <dt className="text-xs text-muted-foreground">{f.label}</dt>
                  </div>
                ))}
              </dl>
            </div>
          }
        />
        <div className="flex justify-end">
          <Button variant="ghost" size="sm" asChild>
            <Link href={`/stats?scope=${accountId}`}>
              Statistiken <ArrowRight className="size-4" />
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/** Kurzfristige Form der letzten Trades – ergänzt, ersetzt aber nicht die Gesamtstatistik. */
export function PulseCard({
  results,
  summary,
  streak,
  currency,
}: {
  results: { id: string; pnl: number }[];
  summary: Summary;
  streak: Streak;
  currency: string;
}) {
  const enough = results.length >= 3;
  const rows: [string, string, string?][] = [
    ["Winrate", summary.winRate == null ? "–" : `${formatNumber(summary.winRate * 100, 0)} %`],
    ["Netto", formatMoney(summary.netPnl, currency, true), pnlClass(summary.netPnl)],
    ["Ø R", formatR(summary.avgR), pnlClass(summary.avgR)],
    ["Profit Factor", summary.profitFactor == null ? "–" : formatNumber(summary.profitFactor, 2)],
    [
      "Aktuelle Serie",
      streak ? `${streak.count} ${streak.kind === "win" ? (streak.count === 1 ? "Gewinn" : "Gewinne") : streak.count === 1 ? "Verlust" : "Verluste"}` : "–",
      streak ? (streak.kind === "win" ? "text-profit" : "text-loss") : undefined,
    ],
  ];

  return (
    <Card className="gap-0 py-0">
      <CardContent className="flex h-full flex-col gap-3 p-5">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold">Performance Pulse</p>
          <span className="rounded-md border px-2 py-0.5 text-xs text-muted-foreground">
            {results.length ? `Letzte ${results.length} ${results.length === 1 ? "Trade" : "Trades"}` : "Keine Trades"}
          </span>
        </div>
        {enough ? (
          <>
            <div>
              <div className="flex gap-1" role="img" aria-label={`${summary.wins} Gewinner, ${summary.losses} Verlierer, älteste zuerst`}>
                {results.map((r) => (
                  <span
                    key={r.id}
                    className={cn("h-7 flex-1 rounded-[5px]", r.pnl > 0 ? "bg-profit/55" : r.pnl < 0 ? "bg-loss/45" : "bg-foreground/15")}
                  />
                ))}
              </div>
              <p className="mt-1 flex justify-between text-[0.6875rem] text-muted-foreground">
                <span>älter</span>
                <span>neuester</span>
              </p>
            </div>
            <dl className="divide-y">
              {rows.map(([label, value, className]) => (
                <div key={label} className="flex items-baseline justify-between py-2.5">
                  <dt className="text-sm text-muted-foreground">{label}</dt>
                  <dd className={cn("font-semibold tabular-nums", className)}>{value}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-auto text-xs text-muted-foreground">Kurzfristiger Trend – ersetzt nicht die Gesamtstatistik.</p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Noch nicht genügend Daten – ab 3 abgeschlossenen Trades.</p>
        )}
      </CardContent>
    </Card>
  );
}

/** Datenbasierte Erkenntnisse: beste Session, Richtung, Wochentag und Einstiegszeit. */
export function InsightsCard({
  items,
  currency,
  minTrades,
  statsHref,
}: {
  items: { label: string; highlight: Highlight }[];
  currency: string;
  minTrades: number;
  statsHref: string;
}) {
  return (
    <Card className="gap-0 py-0">
      <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-4">
        <div>
          <p className="text-sm font-semibold">Trading Insights</p>
          <p className="text-xs text-muted-foreground">Automatisch aus deinen Statistiken · Gruppen ab {minTrades} Trades</p>
        </div>
        <Button variant="ghost" size="sm" asChild>
          <Link href={statsHref}>
            Zur Statistik <ArrowRight className="size-4" />
          </Link>
        </Button>
      </div>
      <div className="grid gap-px border-t bg-border sm:grid-cols-2 xl:grid-cols-4">
        {items.map(({ label, highlight }) => (
          <div key={label} className="grid content-start gap-1 bg-card px-5 py-4">
            <Eyebrow>{label}</Eyebrow>
            {highlight.state === "found" ? (
              <>
                <p className="mt-1 truncate text-lg font-semibold">{highlight.row.label}</p>
                <p className="text-sm tabular-nums">
                  <span className="font-semibold text-profit">{formatMoney(highlight.row.netPnl, currency, true)}</span>
                  <span className="text-xs text-muted-foreground">
                    {" "}
                    · {highlight.row.count} Trades · {formatNumber(highlight.row.winRate * 100, 0)} %
                  </span>
                </p>
              </>
            ) : (
              <>
                <p className="mt-1 text-sm font-medium text-muted-foreground">
                  {highlight.state === "insufficient" ? "Noch nicht genügend Daten" : "Noch keine Gruppe im Plus"}
                </p>
                <p className="text-xs text-muted-foreground/80">
                  {highlight.state === "insufficient" ? `Mindestens zwei Gruppen mit je ${minTrades} Trades nötig` : "Details auf der Statistikseite"}
                </p>
              </>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}
