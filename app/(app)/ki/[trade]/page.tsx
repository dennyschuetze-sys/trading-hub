import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { KiCandleChart } from "@/components/charts/ki-candle-chart";
import { StatSection, StatStrip } from "@/components/charts/stat-tile";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { featureLabel, featureValue, formatPred, parseReasons, parseTradeKey, tradeState, type KiTrade, type Reasons } from "@/lib/ki";
import { fetchKiTrade } from "@/lib/ki-queries";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime, formatNumber, formatR, pnlClass } from "@/lib/trading";
import { cn } from "@/lib/utils";

/** Ein gedachter Trade der KI: Chart mit Einstieg, SL, TP und Ausstieg, dazu die Gründe des Modells. */
export default async function KiTradePage({ params }: PageProps<"/ki/[trade]">) {
  const { trade: key } = await params;
  const parsed = parseTradeKey(key);
  if (!parsed) notFound();
  const supabase = await createClient();
  const result = await fetchKiTrade(supabase, parsed.side, parsed.signalAt);
  if (!result) notFound();

  const { trade: t, bars } = result;
  const side = t.side === "long" ? "Long" : "Short";
  const reasons = parseReasons(t.reasons);
  const distance = (price: number | null) =>
    t.entry_price != null && price != null ? `${formatNumber(Math.abs(price - t.entry_price), 2)} USD` : undefined;

  return (
    <>
      <PageHeader title={`${side} · Signal ${formatDateTime(t.signal_at)}`} description={`Gedachter Trade der KI, ${tradeState(t)} · Modell ${t.model_version}`}>
        <Button variant="outline" asChild>
          <Link href="/ki">
            <ArrowLeft className="size-4" /> KI-Schattenbetrieb
          </Link>
        </Button>
      </PageHeader>

      <div className="grid gap-8">
        <StatStrip
          items={[
            {
              label: "Einstieg",
              value: formatNumber(t.entry_price, 2),
              hint: t.entry_at ? formatDateTime(t.entry_at) : "zur Eröffnung der nächsten Kerze",
            },
            { label: "Stop (SL)", value: formatNumber(t.stop_price, 2), hint: distance(t.stop_price) && `${distance(t.stop_price)} = 2 ATR` },
            { label: "Ziel (TP)", value: formatNumber(t.target_price, 2), hint: distance(t.target_price) && `${distance(t.target_price)} = 3 ATR` },
            {
              label: "Ausstieg",
              value: t.status === "zu" ? formatNumber(t.exit_price, 2) : t.status === "offen" ? "läuft" : "–",
              hint: t.exit_at ? `${t.exit_reason} · ${formatDateTime(t.exit_at)}` : "spätestens nach 12 Stunden",
            },
            {
              label: t.status === "offen" ? "Stand jetzt" : "Ergebnis",
              value: formatR(t.r_net),
              tone: t.r_net == null || t.r_net === 0 ? null : t.r_net > 0 ? "profit" : "loss",
              hint: t.r_gross != null ? `vor Kosten ${formatR(t.r_gross)}` : undefined,
            },
            { label: "Erwartet", value: formatPred(t.pred), hint: "Vorhersage beim Signal, nach Kosten" },
          ]}
        />

        <StatSection title="Chart" question="Wo lagen Einstieg, SL und TP?" hint="M15, Uhrzeit Berlin">
          <Card>
            <CardHeader>
              <CardTitle>XAUUSD-VIP rund um den Trade</CardTitle>
              <CardDescription>
                Dreieck: Einstieg in Trade-Richtung · Punkt: Ausstieg · rot gestrichelt: SL · grün gestrichelt: TP ·
                gepunktet: Einstiegskurs. Die KI entscheidet am Schluss der Signalkerze und steigt zur Eröffnung der
                nächsten ein.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <KiCandleChart bars={bars} trades={[t]} focus={t.signal_at} height={380} />
            </CardContent>
          </Card>
        </StatSection>

        <StatSection title="Warum" question="Was hat das Modell zu diesem Signal bewogen?">
          <ReasonsCard trade={t} reasons={reasons} />
        </StatSection>
      </div>
    </>
  );
}

function ReasonsCard({ trade, reasons }: { trade: KiTrade; reasons: Reasons | null }) {
  if (!reasons) {
    return (
      <Card>
        <CardHeader>
          <CardDescription>Für diesen Trade liegen keine Gründe vor.</CardDescription>
        </CardHeader>
      </Card>
    );
  }
  const side = trade.side === "long" ? "Long" : "Short";
  const max = Math.max(...reasons.items.map((i) => Math.abs(i.contrib)), Math.abs(reasons.rest), 1e-9);

  return (
    <Card className="gap-4">
      <CardHeader>
        <CardDescription>
          Über alle Kerzen erwartet das Modell für einen {side} im Schnitt {formatPred(reasons.base)}
          {reasons.base < 0 && " – die Kosten drücken den Schnitt ins Minus"}. Für diese Kerze kam es auf{" "}
          {formatPred(trade.pred)}: Die Merkmale unten haben die Erwartung so weit verschoben. Grün spricht für den
          Trade, rot dagegen.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-1">
        <ReasonRow label="Ausgangswert" detail="Schnitt aller Kerzen" value={reasons.base} max={max} neutral />
        {reasons.items.map((item) => (
          <ReasonRow key={item.name} label={featureLabel(item.name)} detail={featureValue(item.name, item.value)} value={item.contrib} max={max} />
        ))}
        <ReasonRow label="Übrige Merkmale" detail="zusammen" value={reasons.rest} max={max} />
        <div className="mt-2 flex items-baseline justify-between gap-4 border-t pt-3 text-sm">
          <span className="font-medium">Vorhersage</span>
          <span className={cn("font-semibold tabular-nums", pnlClass(trade.pred))}>{formatPred(trade.pred)}</span>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Die Beiträge sind SHAP-Werte des LightGBM-Modells: Ausgangswert und alle Beiträge ergeben zusammen genau die
          Vorhersage. Sie zeigen, wie das Modell zu seiner Zahl kommt – nicht, ob der Markt sich daran hält.
          {reasons.later && " Für diesen Trade nachträglich mit demselben Modell und denselben Kerzen berechnet."}
        </p>
      </CardContent>
    </Card>
  );
}

/** Eine Zeile der Gründe: Merkmal und Wert links, Balken nach Größe des Beitrags, Beitrag in R rechts. */
function ReasonRow({ label, detail, value, max, neutral }: { label: string; detail: string; value: number; max: number; neutral?: boolean }) {
  const width = `${Math.max(2, (Math.abs(value) / max) * 100)}%`;
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 py-1.5 sm:grid-cols-[minmax(0,16rem)_minmax(0,1fr)_5rem]">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{label}</p>
        <p className="truncate text-xs text-muted-foreground tabular-nums">{detail}</p>
      </div>
      <div className="col-span-2 row-start-2 h-2 rounded-full bg-foreground/[0.06] sm:col-span-1 sm:row-start-auto" aria-hidden>
        <div
          className={cn("h-2 rounded-full", neutral ? "bg-chart-axis/60" : value >= 0 ? "bg-profit/80" : "bg-loss/80")}
          style={{ width }}
        />
      </div>
      <p className={cn("text-right text-sm font-semibold tabular-nums sm:col-start-3", neutral ? "text-muted-foreground" : pnlClass(value))}>
        {formatPred(value)}
      </p>
    </div>
  );
}
