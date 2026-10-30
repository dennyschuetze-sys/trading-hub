import Link from "next/link";
import { BrainCircuit } from "lucide-react";
import { KiBalanceChart } from "@/components/charts/ki-balance-chart";
import { KiCandleChart } from "@/components/charts/ki-candle-chart";
import { KiPredictionChart } from "@/components/charts/ki-prediction-chart";
import { StatSection, StatStrip } from "@/components/charts/stat-tile";
import { AutoRefresh } from "@/components/layout/auto-refresh";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  balanceSeries,
  featureLabel,
  formatPred,
  goldMarketOpen,
  isSignal,
  isStale,
  parseBand,
  parseImportance,
  tradeKey,
  tradeState,
  type KiModel,
  type KiSide,
  type KiStatus,
  type KiTrade,
} from "@/lib/ki";
import { fetchKiOverview } from "@/lib/ki-queries";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatDateTime, formatNumber, formatR, plural, pnlClass } from "@/lib/trading";
import { cn } from "@/lib/utils";

const TITLE = "KI-Schattenbetrieb";
const DESCRIPTION = "Gold M15 · sagt jede Kerze voraus, lernt wöchentlich neu und handelt nicht";

/** Eine Vorhersage gilt als nachgeholt, wenn sie erst lange nach Kerzenschluss gerechnet wurde. */
const LATE_MS = 45 * 60_000;

export default async function KiPage() {
  const supabase = await createClient();
  const { status, bars, predictions, recent, closed, models } = await fetchKiOverview(supabase);

  if (!status) {
    return (
      <>
        <PageHeader title={TITLE} description={DESCRIPTION} />
        <Card>
          <CardHeader>
            <CardTitle>Noch keine Daten</CardTitle>
            <CardDescription>
              Der Schattenbetrieb läuft auf dem Rechner mit dem VT-Terminal (Projekt <code>gold-ki</code>,{" "}
              <code>scripts/schatten.py lauf</code>) und meldet sich hier alle 15 Minuten.
            </CardDescription>
          </CardHeader>
        </Card>
      </>
    );
  }

  const now = new Date();
  const stale = isStale(status.run_at, now);
  const running = recent.filter((t) => t.status !== "zu");
  const points = balanceSeries(closed, parseBand(status.random_band));
  const late = predictions.filter((p) => new Date(p.made_at).getTime() - new Date(p.bar_at).getTime() > LATE_MS).length;

  return (
    <>
      <PageHeader title={TITLE} description={DESCRIPTION}>
        <p className="text-xs text-muted-foreground sm:text-right">
          Letzte Kerze {formatDateTime(status.last_bar_at)}
          <br />
          Modell {status.model_version ?? "–"} · gemeldet {formatDateTime(status.run_at)}
        </p>
      </PageHeader>
      <AutoRefresh seconds={60} />

      {(stale || status.note) && (
        <p role="status" className="mb-6 rounded-lg border border-loss/40 bg-loss/[0.06] px-4 py-3 text-sm">
          {stale
            ? `Der Schattenbetrieb hat sich seit ${formatDateTime(status.run_at)} nicht gemeldet. Läuft der Rechner mit dem VT-Terminal?`
            : status.note}
        </p>
      )}
      {!stale && !goldMarketOpen(now) && (
        <p className="mb-6 text-sm text-muted-foreground">Der Goldmarkt ist geschlossen – bis er öffnet, kommen keine neuen Kerzen.</p>
      )}

      <div className="grid gap-8">
        <StatStrip
          items={[
            sideTile(status, running, "long"),
            sideTile(status, running, "short"),
            {
              label: "Offen",
              value: plural(running.length, "Trade", "Trades"),
              hint: running.length ? running.map((t) => (t.side === "long" ? "Long" : "Short")).join(" und ") : "keiner",
            },
            {
              label: "Abgeschlossen",
              value: plural(closed.length, "Trade", "Trades"),
              hint: status.live_since ? `seit ${formatDate(status.live_since)}` : undefined,
            },
            {
              label: "Ø je Trade",
              value: formatR(status.mean_r),
              tone: tone(status.mean_r),
              hint: status.random_mean_r != null ? `Zufall ${formatR(status.random_mean_r)}` : "Zufall ab 5 Trades",
            },
            {
              label: "Summe",
              value: formatR(status.sum_r),
              tone: tone(status.sum_r),
              hint:
                status.random_p != null
                  ? `p ${formatNumber(status.random_p, 3)} gegen Zufall`
                  : `${closed.filter((t) => (t.r_net ?? 0) > 0).length} von ${closed.length} im Plus`,
            },
          ]}
        />

        <StatSection title="Chart" question="Wo hat die KI gehandelt?" hint="M15, Uhrzeit Berlin">
          <Card>
            <CardHeader>
              <CardTitle>XAUUSD-VIP mit den gedachten Trades</CardTitle>
              <CardDescription>
                Dreieck: Einstieg in Trade-Richtung · Punkt: Ausstieg · rot gestrichelt: SL · grün gestrichelt: TP. Ein
                Klick auf ein Dreieck oder einen Trade in der Liste zeigt, warum die KI ihn gesetzt hat.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <KiCandleChart bars={bars} trades={recent.map((t) => ({ ...t, href: `/ki/${tradeKey(t)}` }))} />
            </CardContent>
          </Card>
        </StatSection>

        <StatSection
          title="Jetzt"
          question="Was erwartet die KI von den nächsten Kerzen?"
          hint={late ? `${plural(late, "Kerze", "Kerzen")} nachgeholt` : undefined}
        >
          <Card>
            <CardHeader>
              <CardTitle>Erwartetes Ergebnis je Kerze</CardTitle>
              <CardDescription className="flex flex-wrap items-center gap-x-4 gap-y-1">
                <Dot className="bg-profit" label="Long" />
                <Dot className="bg-loss" label="Short" />
                <Dot className="bg-chart-axis/60" label="Goldkurs" />
                <span>Netto-R nach Spread und Swap. Über der Nulllinie entsteht ein Signal.</span>
              </CardDescription>
            </CardHeader>
            <CardContent>
              <KiPredictionChart predictions={predictions} />
            </CardContent>
          </Card>
        </StatSection>

        <StatSection
          title="Bilanz"
          question="Ist die KI besser als Zufall?"
          hint={status.live_since ? `seit ${formatDate(status.live_since)}` : undefined}
        >
          <Card>
            <CardHeader>
              <CardTitle>Kumuliertes R der gedachten Trades</CardTitle>
              <CardDescription>
                Graue Fläche: Bereich von 90 % der zufälligen Trade-Folgen mit gleich vielen Trades, gestrichelt deren
                Mitte. {points.length < 5 && "Der Vergleich mit Zufall erscheint ab fünf abgeschlossenen Trades."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <KiBalanceChart points={points} />
            </CardContent>
          </Card>
        </StatSection>

        <div className="grid items-start gap-8 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <StatSection title="Gedachte Trades" question="Was hätte die KI gehandelt?">
            <TradeList trades={recent} />
          </StatSection>
          <StatSection title="Lernen" question="Wann hat sie neu gelernt, und worauf achtet sie?">
            <ModelTable models={models} active={status.model_version} />
          </StatSection>
        </div>
      </div>

      <p className="mt-8 text-xs text-muted-foreground">
        Die KI handelt nicht. In den Tests vor dem Start (Projekt gold-ki, README) hatte sie nach Kosten keinen
        gesicherten Vorteil – die Seite ist zum Zuschauen und Lernen da, nicht als Handelssignal.
      </p>
    </>
  );
}

function tone(value: number | null) {
  return value == null || value === 0 ? null : value > 0 ? ("profit" as const) : ("loss" as const);
}

function sideTile(status: KiStatus, running: KiTrade[], side: KiSide) {
  const pred = side === "long" ? status.pred_long : status.pred_short;
  const open = running.find((t) => t.side === side);
  return {
    label: side === "long" ? "Jetzt Long" : "Jetzt Short",
    value: formatPred(pred),
    tone: tone(pred),
    hint: open
      ? open.status === "wartet"
        ? "Signal, Einstieg zur nächsten Kerze"
        : "gedachter Trade läuft"
      : isSignal(pred)
        ? "Signal"
        : "kein Signal",
  };
}

function Dot({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("size-2 rounded-full", className)} aria-hidden />
      {label}
    </span>
  );
}

function TradeList({ trades }: { trades: KiTrade[] }) {
  return (
    <Card className="gap-0 py-0">
      <CardContent className="p-5">
        {trades.length ? (
          <ul className="divide-y">
            {trades.map((t) => (
              <li key={`${t.side}|${t.signal_at}`}>
                <Link
                  href={`/ki/${tradeKey(t)}`}
                  className="-mx-2 flex items-center gap-3 rounded-md px-2 py-3 transition-colors hover:bg-foreground/[0.04]"
                >
                  <span
                    className={cn(
                      "w-14 shrink-0 rounded-md py-0.5 text-center text-[0.65625rem] font-bold tracking-wider",
                      t.side === "long" ? "bg-profit/20 text-profit" : "bg-loss/20 text-loss",
                    )}
                  >
                    {t.side === "long" ? "LONG" : "SHORT"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold tabular-nums">{formatDateTime(t.signal_at)}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {tradeState(t)}
                      {t.entry_price != null && ` · Einstieg ${formatNumber(t.entry_price, 2)}`} · erwartet {formatPred(t.pred)}
                    </p>
                  </div>
                  <div className="shrink-0 text-right tabular-nums">
                    <p className={cn("font-semibold", pnlClass(t.r_net))}>{formatR(t.r_net)}</p>
                    {t.status === "offen" && <p className="text-xs text-muted-foreground">Stand jetzt</p>}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <div className="flex flex-col items-center gap-2 py-8 text-center text-sm text-muted-foreground">
            <BrainCircuit className="size-6" aria-hidden /> Noch keine gedachten Trades
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ModelTable({ models, active }: { models: KiModel[]; active: string | null }) {
  return (
    <Card className="gap-2">
      <CardHeader>
        <CardDescription>
          Prüfung: Rangkorrelation zwischen Vorhersage und Ergebnis der letzten vier Wochen, neues Prüfmodell gegen das
          bisherige. Übernommen wird nur, wenn das neue mindestens so gut sortiert.
        </CardDescription>
      </CardHeader>
      <CardContent className="px-0">
        {!models.length ? (
          <p className="px-6 text-sm text-muted-foreground">Noch kein Modell gemeldet.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">Modell</TableHead>
                  <TableHead>Gelernt</TableHead>
                  <TableHead>Prüfung</TableHead>
                  <TableHead className="pr-6">Achtet am meisten auf</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {models.map((m) => (
                  <TableRow key={m.version}>
                    <TableCell className="pl-6 align-top">
                      <span className="font-medium">{m.version}</span>
                      {m.version === active && (
                        <Badge variant="secondary" className="ml-2">
                          aktiv
                        </Badge>
                      )}
                      <span className="block text-xs text-muted-foreground">{m.accepted ? "übernommen" : "nicht übernommen"}</span>
                    </TableCell>
                    <TableCell className="align-top tabular-nums">
                      {formatDateTime(m.trained_at)}
                      <span className="block text-xs text-muted-foreground">
                        {formatNumber(m.train_rows, 0)} Beispiele bis {formatDate(m.data_until)}
                      </span>
                    </TableCell>
                    <TableCell className="align-top">
                      <span className="tabular-nums">
                        {m.ic_new == null ? "–" : `${formatNumber(m.ic_new, 3)} gegen ${formatNumber(m.ic_old, 3)}`}
                      </span>
                      {m.note && <span className="block max-w-64 text-xs whitespace-normal text-muted-foreground">{m.note}</span>}
                    </TableCell>
                    <TableCell className="pr-6 align-top whitespace-normal">
                      {(["long", "short"] as const).map((side) => (
                        <p key={side} className="min-w-64 text-xs">
                          <span className="text-muted-foreground">{side === "long" ? "Long" : "Short"}: </span>
                          {parseImportance(m.importance, side)
                            .slice(0, 3)
                            .map((i) => `${featureLabel(i.name)} ${formatNumber(i.share * 100, 0)} %`)
                            .join(" · ")}
                        </p>
                      ))}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
