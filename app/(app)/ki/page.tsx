import Link from "next/link";
import { BrainCircuit } from "lucide-react";
import { KiBalanceChart } from "@/components/charts/ki-balance-chart";
import { KiPredictionChart } from "@/components/charts/ki-prediction-chart";
import { KiTradeChart } from "@/components/charts/ki-trade-chart";
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
  KI_MARKETS,
  parseBand,
  parseImportance,
  parseMarket,
  tradeKey,
  tradeState,
  type KiMarket,
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
const DESCRIPTION: Record<KiMarket, string> = {
  XAUUSD: "Gold M15 · sagt jede Kerze voraus, lernt wöchentlich neu und handelt nicht",
  NAS100: "NAS100 M15 · Vorwärtsprobe nur Long, eingefrorenes Modell, handelt nicht",
  "XAUUSD-M5": "Gold M5 · Long und Short, eingefrorene Modelle, Trades höchstens 4 Stunden, handelt nicht",
};
const SCRIPT: Record<KiMarket, string> = {
  XAUUSD: "scripts/schatten.py",
  NAS100: "scripts/schatten_nas100.py",
  "XAUUSD-M5": "scripts/schatten_m5.py",
};

/** Eine Vorhersage gilt als nachgeholt, wenn sie erst lange nach Kerzenschluss gerechnet wurde. */
const LATE_MS = 45 * 60_000;

export default async function KiPage({ searchParams }: PageProps<"/ki">) {
  const market = parseMarket((await searchParams).markt);
  const info = KI_MARKETS[market];
  const supabase = await createClient();
  const { status, bars, predictions, recent, chartTrades, closed, models } = await fetchKiOverview(supabase, market);

  if (!status) {
    return (
      <>
        <PageHeader title={TITLE} description={DESCRIPTION[market]} />
        <MarketSwitch market={market} />
        <Card>
          <CardHeader>
            <CardTitle>Noch keine Daten</CardTitle>
            <CardDescription>
              Der Schattenbetrieb läuft auf dem Rechner mit dem VT-Terminal (Projekt <code>gold-ki</code>,{" "}
              <code>{SCRIPT[market]} lauf</code>) und meldet sich hier
              alle {market === "XAUUSD-M5" ? 5 : 15} Minuten.
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
      <PageHeader title={TITLE} description={DESCRIPTION[market]}>
        <p className="text-xs text-muted-foreground sm:text-right">
          Letzte Kerze {formatDateTime(status.last_bar_at)}
          <br />
          Modell {status.model_version ?? "–"} · gemeldet {formatDateTime(status.run_at)}
        </p>
      </PageHeader>
      <AutoRefresh seconds={60} />
      <MarketSwitch market={market} />

      {market === "NAS100" && (
        <p className="mb-6 rounded-lg border px-4 py-3 text-sm text-muted-foreground">
          Vorwärtsprobe seit 03.11.2026: Das Modell wurde einmal auf NAS100-Kerzen 2018–2026 gelernt und dann
          eingefroren; es lernt nie neu und handelt nur Long. Nach 500 Trades (etwa 6 Monate) wird abgebrochen, wenn
          der Schnitt bei −0,07 R oder darunter liegt; ein Urteil gibt es erst nach 3.000 Trades (etwa 3 Jahre).
        </p>
      )}
      {market === "XAUUSD-M5" && (
        <p className="mb-6 rounded-lg border px-4 py-3 text-sm text-muted-foreground">
          Schattenbetrieb seit 04.11.2026 zum Zuschauen: Im Test 2013–2026 war M5 nach Kosten leicht negativ (−0,02 R je
          Trade), weil der Spread beim kleinen Stop schwer wiegt. Die Modelle wurden einmal gelernt und eingefroren. Nach
          1.000 Trades wird abgebrochen, wenn der Schnitt bei −0,07 R oder darunter liegt; ein Urteil gibt es nach
          3.000 Trades.
        </p>
      )}

      {(stale || status.note) && (
        <p role="status" className="mb-6 rounded-lg border border-loss/40 bg-loss/[0.06] px-4 py-3 text-sm">
          {stale
            ? `Der Schattenbetrieb hat sich seit ${formatDateTime(status.run_at)} nicht gemeldet. Läuft der Rechner mit dem VT-Terminal?`
            : status.note}
        </p>
      )}
      {!stale && !goldMarketOpen(now) && (
        <p className="mb-6 text-sm text-muted-foreground">
          Der Markt ist geschlossen – bis er öffnet, kommen keine neuen Kerzen.
        </p>
      )}

      <div className="grid gap-8">
        <StatStrip
          items={[
            ...info.sides.map((side) => sideTile(status, running, side)),
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

        <StatSection title="Chart" question="Wo hat die KI gehandelt?" hint="Uhrzeit Berlin">
          <Card>
            <CardHeader>
              <CardTitle>{info.symbol} mit den gedachten Trades</CardTitle>
              <CardDescription>
                Jeder Trade als Box wie in TradingView: grün bis zum Ziel (TP), rot bis zum Stop (SL), die Linie
                dazwischen ist der Einstieg. Pfeil: Einstieg, Punkt: Ausstieg mit Ergebnis. Mausrad oder zwei Finger
                zoomen, Ziehen verschiebt. Ein Klick auf eine Box zeigt, warum die KI den Trade gesetzt hat.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <KiTradeChart
                bars={bars}
                symbol={info.symbol}
                timeframes={info.timeframes}
                trades={chartTrades.map((t) => ({ ...t, href: `/ki/${tradeKey(t)}` }))}
              />
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
                {info.sides.includes("short") && <Dot className="bg-loss" label="Short" />}
                <Dot className="bg-chart-axis/60" label={market === "NAS100" ? "NAS100-Kurs" : "Goldkurs"} />
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
            <ModelTable models={models} active={status.model_version} market={market} />
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

/** Umschaltung zwischen den Märkten; Gold bleibt die Grundadresse /ki. */
function MarketSwitch({ market }: { market: KiMarket }) {
  return (
    <nav aria-label="Markt" className="mb-6 inline-flex rounded-lg border p-1">
      {(Object.keys(KI_MARKETS) as KiMarket[]).map((m) => (
        <Link
          key={m}
          href={m === "XAUUSD" ? "/ki" : `/ki?markt=${KI_MARKETS[m].slug}`}
          aria-current={m === market ? "page" : undefined}
          className={cn(
            "rounded-md px-4 py-1.5 text-sm font-medium transition-colors",
            m === market ? "bg-foreground/[0.08] text-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {KI_MARKETS[m].label}
        </Link>
      ))}
    </nav>
  );
}

function tone(value: number | null) {
  return value == null || value === 0 ? null : value > 0 ? ("profit" as const) : ("loss" as const);
}

function sideTile(status: KiStatus, running: KiTrade[], side: KiSide) {
  const pred = side === "long" ? status.pred_long : status.pred_short;
  const open = running.find((t) => t.side === side);
  const label = side === "long" ? "Jetzt Long" : "Jetzt Short";
  // Läuft ein gedachter Trade, zeigt die Kachel dessen Stand; die Vorhersage gilt nur für einen neuen Einstieg
  if (open?.status === "offen") {
    return {
      label,
      value: formatR(open.r_net),
      tone: tone(open.r_net),
      hint: `Trade läuft · neues Signal ${formatPred(pred)}`,
    };
  }
  return {
    label,
    value: formatPred(pred),
    tone: tone(pred),
    hint: open ? "Signal, Einstieg zur nächsten Kerze" : isSignal(pred) ? "Signal" : "kein Signal",
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

function ModelTable({ models, active, market }: { models: KiModel[]; active: string | null; market: KiMarket }) {
  return (
    <Card className="gap-2">
      <CardHeader>
        <CardDescription>
          {market === "XAUUSD"
            ? "Prüfung: Rangkorrelation zwischen Vorhersage und Ergebnis der letzten vier Wochen, neues Prüfmodell gegen das bisherige. Übernommen wird nur, wenn das neue mindestens so gut sortiert."
            : market === "NAS100"
              ? "Ein einziges Modell, vor dem Start eingefroren. Es lernt während der Vorwärtsprobe nie neu, damit sie ehrlich bleibt."
              : "Je ein Modell für Long und Short, vor dem Start auf Gold M5 2010–2026 gelernt und eingefroren. Sie lernen nie neu, damit das Ergebnis ehrlich bleibt."}
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
                      {KI_MARKETS[market].sides.map((side) => (
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
