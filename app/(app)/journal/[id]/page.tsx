import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Calendar, CheckCircle2, Clock, Copy, FlaskConical, Link2, Pencil, ShieldAlert, Star, Timer, Wallet, XCircle, type LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { shortDate } from "@/components/charts/format";
import {
  costsInR,
  exitEfficiency,
  exitReason,
  formatStopSize,
  maxAdverseR,
  maxFavorableR,
  plannedRewardRisk,
  stopSize,
} from "@/lib/r-multiple";
import { REVENGE_MINUTES, revengeTrades, tradeNumberOfDay } from "@/lib/trade-analysis";
import { loadViolations } from "@/lib/risk-queries";
import { VIOLATION_LABELS, type Violation } from "@/lib/risk-rules";
import { berlinParts } from "@/lib/stats";
import { createClient } from "@/lib/supabase/server";
import {
  HTF_BIASES,
  MARKET_CONTEXTS,
  SESSIONS,
  TIME_ZONE,
  dayBoundary,
  formatDate,
  formatMoney,
  formatNumber,
  formatR,
  labelFor,
  pnlClass,
} from "@/lib/trading";
import { cn } from "@/lib/utils";
import { deleteTrade } from "../actions";
import { formatDuration } from "../trade-summary";
import { Screenshots } from "./screenshots";
import { TradeMenu } from "./trade-menu";

export default async function TradeDetailPage({ params }: PageProps<"/journal/[id]">) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: trade }, { data: shots }, { data: auth }, { data: checklistResults }] = await Promise.all([
    supabase
      .from("trades")
      .select("*, accounts(name, currency, market), backtest_sessions(id, name, currency, market), strategies(id, name)")
      .eq("id", id)
      .maybeSingle(),
    supabase.from("trade_screenshots").select("id, storage_path").eq("trade_id", id).order("created_at"),
    supabase.auth.getUser(),
    supabase
      .from("trade_checklist_results")
      .select("checked, strategy_checklist_items(label, position)")
      .eq("trade_id", id),
  ]);
  if (!trade || !auth.user) notFound();

  // Regeln gelten nur für Live-Trades
  const session = trade.backtest_sessions;
  const day = berlinParts(trade.entry_time).date;
  const { violations } = session
    ? { violations: new Map<string, Violation[]>() }
    : await loadViolations(supabase, {
        entryFrom: dayBoundary(day, "start"),
        entryTo: dayBoundary(day, "end"),
      });
  const tradeViolations = violations.get(trade.id) ?? [];

  // Trade-Nr. am Tag und Revenge-Erkennung aus den Trades desselben Accounts rund um den Einstieg
  const { data: nearby } = trade.account_id
    ? await supabase
        .from("trades")
        .select("id, account_id, entry_time, exit_time, status, net_pnl")
        .eq("account_id", trade.account_id)
        .gte("entry_time", new Date(Date.parse(trade.entry_time) - 24 * 3600000).toISOString())
        .lte("entry_time", dayBoundary(day, "end"))
    : { data: null };
  const neighbours = (nearby ?? []).map((t) => ({ ...t, account_id: t.account_id! }));
  const tradeNo = neighbours.length ? tradeNumberOfDay(neighbours).get(trade.id) : undefined;
  const isRevenge = revengeTrades(neighbours).has(trade.id);

  const checklist = (checklistResults ?? [])
    .flatMap((r) => (r.strategy_checklist_items ? [{ ...r.strategy_checklist_items, checked: r.checked }] : []))
    .sort((a, b) => a.position - b.position);

  const { data: signed } = shots?.length
    ? await supabase.storage.from("screenshots").createSignedUrls(
        shots.map((s) => s.storage_path),
        60 * 60,
      )
    : { data: [] };
  const screenshots = (shots ?? []).flatMap((s, i) =>
    signed?.[i]?.signedUrl ? [{ id: s.id, url: signed[i].signedUrl }] : [],
  );

  const container = trade.accounts ?? session;
  const currency = container?.currency ?? "USD";
  const isFutures = container?.market === "futures";
  const money = (v: number | null, signed = false) => formatMoney(v, currency, signed);
  const plannedRR = plannedRewardRisk(trade);
  const stop = stopSize(trade);
  const mfe = maxFavorableR(trade);
  const mae = maxAdverseR(trade);
  const efficiency = exitEfficiency(trade);
  const exit = trade.status === "closed" ? exitReason(trade) : null;
  const costs = costsInR(trade);
  const yesNo = (v: boolean | null) => (v == null ? "–" : v ? "Ja" : "Nein");
  const rValue = (v: number | null) => (v == null ? "–" : `${formatNumber(v, 2)} R`);

  // Kopfzeile: Account, Datum, Uhrzeit (Berliner Zeit), Haltedauer, geplantes CRV
  const clock = (iso: string) =>
    new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit", timeZone: TIME_ZONE }).format(new Date(iso));
  const exitTime = trade.exit_time;
  const timeRange = exitTime
    ? `${clock(trade.entry_time)} – ${berlinParts(exitTime).date === day ? clock(exitTime) : `${shortDate(exitTime)} ${clock(exitTime)}`}`
    : `${clock(trade.entry_time)} – offen`;
  const holdMinutes = exitTime ? Math.round((Date.parse(exitTime) - Date.parse(trade.entry_time)) / 60000) : null;
  const meta: { icon: LucideIcon; label: string; text: string }[] = [
    { icon: Wallet, label: session ? "Backtest" : "Account", text: session ? session.name : (trade.accounts?.name ?? "–") },
    { icon: Calendar, label: "Einstiegstag", text: formatDate(trade.entry_time) },
    { icon: Clock, label: "Uhrzeit (Berliner Zeit)", text: timeRange },
    ...(holdMinutes != null ? [{ icon: Timer, label: "Haltedauer", text: formatDuration(holdMinutes) ?? "–" }] : []),
    ...(plannedRR != null ? [{ icon: Link2, label: "Geplantes CRV", text: `CRV 1:${formatNumber(plannedRR, 2)}` }] : []),
  ];

  const execution: [string, React.ReactNode][] = [
    [isFutures ? "Kontrakte" : "Lots", formatNumber(trade.quantity, 4)],
    ["Einstiegskurs", formatNumber(trade.entry_price)],
    ["Ausstiegskurs", formatNumber(trade.exit_price)],
    ["Stop Loss", formatNumber(trade.stop_loss)],
    ["Take Profit", formatNumber(trade.take_profit)],
    ["SL-Größe", formatStopSize(stop) ?? "–"],
    ["Ausstiegsart", exit ? { sl: "Am Stop Loss", tp: "Am Take Profit", manual: "Manuell" }[exit] : "–"],
  ];
  const setup: [string, React.ReactNode][] = [
    ["Einstiegskriterium", trade.entry_criterion ?? "–"],
    ["Timeframe", trade.entry_timeframe ?? "–"],
    ["HTF-Trend", labelFor(HTF_BIASES, trade.htf_bias)],
    ["Marktkontext", labelFor(MARKET_CONTEXTS, trade.market_context)],
    ["Setup-Qualität", trade.setup_quality ?? "–"],
  ];
  const evaluation: [string, React.ReactNode][] = [
    ["Session", labelFor(SESSIONS, trade.session)],
    ...(tradeNo ? ([["Trade am Tag", `${tradeNo}. Trade`]] as [string, React.ReactNode][]) : []),
    ["SL auf Breakeven", yesNo(trade.moved_to_breakeven)],
    ["Teilgewinne", yesNo(trade.partial_close)],
  ];
  const moreFigures: [string, React.ReactNode][] = [
    ["Bester Kurs", formatNumber(trade.best_price)],
    ["Schlechtester Kurs", formatNumber(trade.worst_price)],
    ["Max. mögliches R", rValue(mfe)],
    ["Max. Gegenlauf", rValue(mae)],
    ["Exit-Effizienz", efficiency == null ? "–" : `${formatNumber(efficiency * 100, 0)} %`],
  ];
  const costRows: [string, React.ReactNode][] = [
    ["P&L brutto", money(trade.pnl, true)],
    ["Kommission", money(trade.commission)],
    ["Swap", money(trade.swap)],
    ["Kosten in R", rValue(costs)],
    ["Risiko", money(trade.risk_amount)],
  ];
  const rating = trade.rating;
  const review: [string, React.ReactNode][] = [
    ["Plan eingehalten", yesNo(trade.followed_plan)],
    ["Emotion", trade.emotion ?? "–"],
    [
      "Bewertung",
      rating ? (
        <span className="inline-flex gap-0.5 align-middle" role="img" aria-label={`${rating} von 5 Sternen`}>
          {[1, 2, 3, 4, 5].map((n) => (
            <Star key={n} className={cn("size-4", n <= rating ? "fill-foreground text-foreground" : "text-muted-foreground/40")} aria-hidden />
          ))}
        </span>
      ) : (
        "–"
      ),
    ],
  ];

  return (
    <div className="grid gap-6">
      <header className="grid gap-3">
        <Link
          href={session ? `/backtesting/${session.id}` : "/journal"}
          className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> {session ? session.name : "Journal"}
        </Link>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">{trade.symbol}</h1>
            <Badge className={trade.direction === "long" ? "bg-profit/20 text-profit" : "bg-loss/20 text-loss"}>
              {trade.direction === "long" ? "Long" : "Short"}
            </Badge>
            {trade.net_pnl != null && (
              <span className="flex items-baseline gap-2">
                <span className={cn("text-xl font-semibold tabular-nums", pnlClass(trade.net_pnl))}>{money(trade.net_pnl, true)}</span>
                {trade.r_multiple != null && (
                  <span className={cn("text-sm tabular-nums", pnlClass(trade.r_multiple))}>{formatR(trade.r_multiple)}</span>
                )}
              </span>
            )}
            {trade.status === "open" && <Badge variant="outline">Offen</Badge>}
            {isRevenge && (
              <Badge variant="outline" className="border-loss/50" title={`Eröffnet ≤ ${REVENGE_MINUTES} Min. nach einem Verlust`}>
                Revenge-Trade?
              </Badge>
            )}
            {session && (
              <Badge variant="secondary">
                <FlaskConical aria-hidden /> Backtest
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            {!session && (
              <Button variant="outline" asChild>
                <Link href={`/journal/new?vorlage=${trade.id}`} title="Neuen Trade mit Account, Symbol, Setup, Risiko und Tags dieses Trades anlegen">
                  <Copy className="size-4" /> Als Vorlage
                </Link>
              </Button>
            )}
            <Button variant="outline" asChild>
              <Link href={`/journal/${trade.id}/edit`}>
                <Pencil className="size-4" /> Bearbeiten
              </Link>
            </Button>
            <TradeMenu onDelete={deleteTrade.bind(null, trade.id)} />
          </div>
        </div>

        <ul className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          {meta.map(({ icon: Icon, label, text }, i) => (
            <li key={label} className={cn("flex items-center gap-2", i > 0 && "sm:border-l sm:pl-4")} title={label}>
              <Icon className="size-4 text-muted-foreground" aria-hidden />
              <span className="sr-only">{label}: </span>
              {text}
            </li>
          ))}
        </ul>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <Screenshots tradeId={trade.id} userId={auth.user.id} screenshots={screenshots} />

        <div className="grid content-start gap-6">
          {tradeViolations.length > 0 && (
            <Card className="gap-3 border-loss/50 [--card-spacing:--spacing(5)]">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg font-semibold">
                  <ShieldAlert className="size-4 text-loss" aria-hidden /> Regelverstoß
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-2 text-sm">
                <ul className="grid gap-1.5">
                  {tradeViolations.map((v) => (
                    <li key={v.kind}>
                      <span className="font-medium">{VIOLATION_LABELS[v.kind]}</span>
                      <span className="block text-muted-foreground">{v.message}</span>
                    </li>
                  ))}
                </ul>
                <Link href="/risk" className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground">
                  Regeln ansehen
                </Link>
              </CardContent>
            </Card>
          )}

          <Card className="[--card-spacing:--spacing(5)]">
            <CardHeader>
              <CardTitle className="text-lg font-semibold">Strategie</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 text-sm">
              {trade.strategies ? (
                <Link href={`/strategies/${trade.strategies.id}`} className="w-fit font-medium underline underline-offset-4">
                  {trade.strategies.name}
                </Link>
              ) : (
                <p className="text-muted-foreground">
                  Keine Strategie zugeordnet.{" "}
                  <Link href={`/journal/${trade.id}/edit`} className="underline underline-offset-4 hover:text-foreground">
                    Zuordnen
                  </Link>
                </p>
              )}
              {checklist.length > 0 && (
                <div className="grid gap-1.5">
                  <p className="text-muted-foreground">
                    Checkliste: {checklist.filter((c) => c.checked).length}/{checklist.length} erfüllt
                  </p>
                  <ul className="grid gap-1">
                    {checklist.map((c) => (
                      <li key={c.label} className="flex items-start gap-2">
                        {c.checked ? (
                          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-profit" aria-label="Erfüllt" />
                        ) : (
                          <XCircle className="mt-0.5 size-4 shrink-0 text-loss" aria-label="Nicht erfüllt" />
                        )}
                        <span className={c.checked ? "" : "text-muted-foreground"}>{c.label}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="[--card-spacing:--spacing(5)]">
            <CardHeader>
              <CardTitle className="text-lg font-semibold">Ausführung</CardTitle>
            </CardHeader>
            <CardContent>
              <Rows rows={execution} />
            </CardContent>
          </Card>

          <Card className="[--card-spacing:--spacing(5)]">
            <CardHeader>
              <CardTitle className="text-lg font-semibold">Setup</CardTitle>
            </CardHeader>
            <CardContent>
              <Rows rows={setup} />
            </CardContent>
          </Card>
        </div>
      </div>

      <Card className="[--card-spacing:--spacing(5)]">
        <CardHeader className="border-b">
          <CardTitle className="text-lg font-semibold">Trade-Review</CardTitle>
        </CardHeader>
        {/* Vier Spalten nebeneinander (ab xl), darunter 2 × 2, auf dem Handy untereinander */}
        <CardContent className="grid gap-6 md:grid-cols-2 md:gap-x-0 xl:grid-cols-4">
          <section className="grid content-start gap-3 md:pr-6">
            <h3 className="font-semibold">Notizen</h3>
            {trade.notes ? (
              <p className="text-sm whitespace-pre-wrap">{trade.notes}</p>
            ) : (
              <p className="text-sm text-muted-foreground">Noch keine Notizen.</p>
            )}
            {(trade.mistakes.length > 0 || trade.tags.length > 0) && (
              <ul className="flex flex-wrap gap-2" aria-label="Fehler und Tags">
                {trade.mistakes.map((m) => (
                  <li key={`fehler-${m}`}>
                    <Badge variant="outline" className="h-auto rounded-full border-loss/60 px-3 py-1 text-xs" title="Fehler">
                      {m}
                    </Badge>
                  </li>
                ))}
                {trade.tags.map((tag) => (
                  <li key={`tag-${tag}`}>
                    <Badge variant="secondary" className="h-auto rounded-full px-3 py-1 text-xs" title="Tag">
                      {tag}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="grid content-start gap-3 md:border-l md:pl-6 xl:pr-6">
            <h3 className="font-semibold">Lessons Learned</h3>
            {trade.lessons ? (
              <p className="text-sm whitespace-pre-wrap">{trade.lessons}</p>
            ) : (
              <p className="text-sm text-muted-foreground">Noch keine Lessons Learned.</p>
            )}
            <Rows rows={review} />
          </section>
          <section className="grid content-start gap-3 md:pr-6 xl:border-l xl:pl-6">
            <h3 className="font-semibold">Auswertung</h3>
            <Rows rows={evaluation} />
            <details className="group text-sm">
              <summary className="w-fit cursor-pointer list-none text-brand underline underline-offset-4 [&::-webkit-details-marker]:hidden">
                <span className="group-open:hidden">Weitere Kennzahlen</span>
                <span className="hidden group-open:inline">Weniger anzeigen</span>
              </summary>
              <div className="mt-3">
                <Rows rows={moreFigures} />
              </div>
            </details>
          </section>
          <section className="grid content-start gap-3 md:border-l md:pl-6">
            <h3 className="font-semibold">Kosten</h3>
            <Rows rows={costRows} />
          </section>
        </CardContent>
      </Card>
    </div>
  );
}

/** Beschriftung links, Wert rechts – die Zeilen aller Kennzahlen-Blöcke. */
function Rows({ rows }: { rows: [string, React.ReactNode][] }) {
  return (
    <dl className="grid gap-2.5 text-sm">
      {rows.map(([label, value]) => (
        <div key={label} className="flex items-baseline justify-between gap-4">
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="text-right tabular-nums">{value ?? "–"}</dd>
        </div>
      ))}
    </dl>
  );
}
