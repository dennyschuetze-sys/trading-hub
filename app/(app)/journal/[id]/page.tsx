import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CheckCircle2, Copy, FlaskConical, Pencil, ShieldAlert, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DeleteButton } from "@/components/forms/delete-button";
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
  dayBoundary,
  formatDateTime,
  formatMoney,
  formatNumber,
  formatR,
  labelFor,
  pnlClass,
} from "@/lib/trading";
import { deleteTrade } from "../actions";
import { Screenshots } from "./screenshots";

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

  const details: [string, React.ReactNode][] = [
    session ? ["Backtest", session.name] : ["Account", trade.accounts?.name],
    ["Einstieg", formatDateTime(trade.entry_time)],
    ["Ausstieg", formatDateTime(trade.exit_time)],
    [isFutures ? "Kontrakte" : "Lots", formatNumber(trade.quantity, 4)],
    ["Einstiegskurs", formatNumber(trade.entry_price)],
    ["Ausstiegskurs", formatNumber(trade.exit_price)],
    ["Stop Loss", formatNumber(trade.stop_loss)],
    ["Take Profit", formatNumber(trade.take_profit)],
    ["SL-Größe", formatStopSize(stop) ?? "–"],
    ["Geplantes CRV", plannedRR == null ? "–" : `1 : ${formatNumber(plannedRR)}`],
    ["Bester Kurs", formatNumber(trade.best_price)],
    ["Schlechtester Kurs", formatNumber(trade.worst_price)],
    ["Max. mögliches R", rValue(mfe)],
    ["Max. Gegenlauf", rValue(mae)],
    ["Exit-Effizienz", efficiency == null ? "–" : `${formatNumber(efficiency * 100, 0)} %`],
    ["Ausstiegsart", exit ? { sl: "Am Stop Loss", tp: "Am Take Profit", manual: "Manuell" }[exit] : "–"],
    ["SL auf Breakeven", yesNo(trade.moved_to_breakeven)],
    ["Teilgewinne", yesNo(trade.partial_close)],
    ["P&L brutto", money(trade.pnl, true)],
    ["Kommission", money(trade.commission)],
    ["Swap", money(trade.swap)],
    ["Kosten in R", rValue(costs)],
    ["Risiko", money(trade.risk_amount)],
    ["Session", labelFor(SESSIONS, trade.session)],
    ...(tradeNo ? ([["Trade am Tag", `${tradeNo}. Trade`]] as [string, React.ReactNode][]) : []),
    ["Einstiegskriterium", trade.entry_criterion ?? "–"],
    ["Timeframe", trade.entry_timeframe ?? "–"],
    ["HTF-Trend", labelFor(HTF_BIASES, trade.htf_bias)],
    ["Marktkontext", labelFor(MARKET_CONTEXTS, trade.market_context)],
    ["Setup-Qualität", trade.setup_quality ?? "–"],
    ["Emotion", trade.emotion ?? "–"],
    ["Plan eingehalten", trade.followed_plan == null ? "–" : trade.followed_plan ? "Ja" : "Nein"],
    ["Bewertung", trade.rating ? "★".repeat(trade.rating) : "–"],
  ];

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="grid gap-2">
          <Link
            href={session ? `/backtesting/${session.id}` : "/journal"}
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" /> {session ? session.name : "Journal"}
          </Link>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">{trade.symbol}</h1>
            <Badge className={trade.direction === "long" ? "bg-profit/15 text-profit" : "bg-loss/15 text-loss"}>
              {trade.direction === "long" ? "Long" : "Short"}
            </Badge>
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
          <div className="flex items-baseline gap-3">
            <span className={`text-3xl font-semibold tabular-nums ${pnlClass(trade.net_pnl)}`}>
              {money(trade.net_pnl, true)}
            </span>
            <span className={`tabular-nums ${pnlClass(trade.r_multiple)}`}>{formatR(trade.r_multiple)}</span>
          </div>
        </div>
        <div className="flex gap-2">
          {!session && (
            <Button variant="ghost" asChild>
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
          <DeleteButton
            title="Trade löschen?"
            description="Der Trade und seine Screenshots werden endgültig gelöscht."
            onConfirm={deleteTrade.bind(null, trade.id)}
          />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="grid content-start gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Screenshots</CardTitle>
            </CardHeader>
            <CardContent>
              <Screenshots tradeId={trade.id} userId={auth.user.id} screenshots={screenshots} />
            </CardContent>
          </Card>

          {(trade.notes || trade.lessons) && (
            <div className="grid gap-6 md:grid-cols-2">
              {[
                ["Notizen", trade.notes],
                ["Lessons Learned", trade.lessons],
              ].map(
                ([title, body]) =>
                  body && (
                    <Card key={title}>
                      <CardHeader>
                        <CardTitle>{title}</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-sm whitespace-pre-wrap">{body}</p>
                      </CardContent>
                    </Card>
                  ),
              )}
            </div>
          )}
        </div>

        <div className="grid content-start gap-6">
          {tradeViolations.length > 0 && (
            <Card className="gap-3 border-loss/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
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

          <Card>
            <CardHeader>
              <CardTitle>Strategie</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 text-sm">
              {trade.strategies ? (
                <Link href={`/strategies/${trade.strategies.id}`} className="font-medium underline underline-offset-4">
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

          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                {details.map(([label, value]) => (
                  <div key={label} className="contents">
                    <dt className="text-muted-foreground">{label}</dt>
                    <dd className="text-right tabular-nums">{value ?? "–"}</dd>
                  </div>
                ))}
              </dl>
            </CardContent>
          </Card>

          {(trade.mistakes.length > 0 || trade.tags.length > 0) && (
            <Card>
              <CardContent className="grid gap-4">
                {trade.mistakes.length > 0 && (
                  <div className="grid gap-2">
                    <p className="text-sm text-muted-foreground">Fehler</p>
                    <div className="flex flex-wrap gap-1.5">
                      {trade.mistakes.map((m) => (
                        <Badge key={m} variant="outline" className="border-loss/50">
                          {m}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
                {trade.tags.length > 0 && (
                  <div className="grid gap-2">
                    <p className="text-sm text-muted-foreground">Tags</p>
                    <div className="flex flex-wrap gap-1.5">
                      {trade.tags.map((tag) => (
                        <Badge key={tag} variant="secondary">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
