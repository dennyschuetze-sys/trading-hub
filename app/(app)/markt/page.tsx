import { MarketCandleChart } from "@/components/charts/market-candle-chart";
import { StatSection, StatStrip } from "@/components/charts/stat-tile";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  aggregate,
  candleLabel,
  candleSpan,
  chartCandles,
  containingIndex,
  currentTradeDay,
  dayLabel,
  formatContracts,
  formatPct,
  formatPctMove,
  formatUsd,
  formatUsdMove,
  inRange,
  MARKET_RANGES,
  MARKET_UNITS,
  marketSummary,
  parseMarketParams,
  topMoves,
  topVolume,
  weekdayStats,
  type MarketCandle,
} from "@/lib/market";
import { fetchMarketDays } from "@/lib/market-queries";
import { createClient } from "@/lib/supabase/server";
import { formatNumber } from "@/lib/trading";
import { cn } from "@/lib/utils";
import { MarketFilters } from "./market-filters";
import { TopTable, type TopLists, type TopRow } from "./top-table";

const TITLE = "Markt-Statistik";
const DESCRIPTION = "XAUUSD · größte Bewegungen und meistes Volumen je Tag, Woche, Monat und Jahr";

const CHART_UNIT_LABEL = { tage: "Tageskerzen", wochen: "Wochenkerzen", monate: "Monatskerzen", jahre: "Jahreskerzen" };

const row = (c: MarketCandle): TopRow => ({ ...c, label: candleLabel(c), span: candleSpan(c) });

export default async function MarktPage({ searchParams }: PageProps<"/markt">) {
  const { unit, range } = parseMarketParams(await searchParams);
  const supabase = await createClient();
  const days = await fetchMarketDays(supabase);

  if (days.length < 2) {
    return (
      <>
        <PageHeader title={TITLE} description={DESCRIPTION} />
        <Card>
          <CardHeader>
            <CardTitle>Noch keine Daten</CardTitle>
            <CardDescription>
              Die Kerzen meldet das Skript <code>markt-statistik/scripts/melden.py</code> (einmal <code>historie</code>,
              danach täglich <code>kerzen</code> und <code>volumen</code>).
            </CardDescription>
          </CardHeader>
        </Card>
      </>
    );
  }

  const today = currentTradeDay();
  const unitInfo = MARKET_UNITS.find((u) => u.value === unit)!;
  const rangeInfo = MARKET_RANGES.find((r) => r.value === range)!;
  const candles = inRange(aggregate(days, unit, today), range);
  const summary = marketSummary(candles);
  const chart = chartCandles(days, unit, range, today);
  const lists: TopLists = {
    long: { usd: topMoves(candles, "long", "usd").map(row), pct: topMoves(candles, "long", "pct").map(row) },
    short: { usd: topMoves(candles, "short", "usd").map(row), pct: topMoves(candles, "short", "pct").map(row) },
    volume: topVolume(candles).map(row),
  };
  const recordLong = lists.long.usd[0];
  const recordShort = lists.short.usd[0];
  const marker = (c: TopRow | undefined) => {
    const index = containingIndex(chart, c);
    return c && index >= 0 ? { index, text: `${chart[index].unit === "tage" ? "" : `${dayLabel(c.from).slice(0, 6)} `}${formatUsdMove(c.move)}` } : null;
  };
  const weekdays = unit === "tage" ? weekdayStats(candles) : [];
  const firstYear = days[0].day.slice(0, 4);
  const lastDay = days.at(-1)!.day;
  const lastVolumeDay = [...days].reverse().find((d) => d.volume != null)?.day;
  const longRange = range === "5j" || range === "alles";

  return (
    <>
      <PageHeader title={TITLE} description={DESCRIPTION}>
        <p className="text-xs text-muted-foreground sm:text-right">
          Kerzen bis {dayLabel(lastDay)}
          {lastVolumeDay && lastVolumeDay !== lastDay && ` · Volumen bis ${dayLabel(lastVolumeDay)}`}
          <br />
          {formatNumber(days.length, 0)} Handelstage seit {firstYear}
        </p>
      </PageHeader>
      <MarketFilters unit={unit} range={range} />

      <div className="grid gap-8">
        <StatStrip
          items={[
            { label: unitInfo.label, value: formatNumber(summary.count, 0), hint: rangeInfo.long },
            { label: "Ø Spanne", value: formatPct(summary.avgRangePct), hint: `${formatUsd(summary.avgRange)} Hoch bis Tief` },
            {
              label: "Steigend",
              value: summary.count ? `${Math.round((summary.up / summary.count) * 100)} %` : "–",
              hint: `${summary.up} von ${summary.count}`,
            },
            {
              label: "Größte Bewegung",
              value: summary.biggest ? formatPctMove(summary.biggest.movePct) : "–",
              tone: summary.biggest ? (summary.biggest.move > 0 ? "profit" : "loss") : null,
              hint: summary.biggest ? `${candleLabel(summary.biggest)} · ${formatUsdMove(summary.biggest.move)}` : undefined,
            },
            {
              label: "Meistes Volumen",
              value: formatContracts(summary.maxVolume?.volume),
              hint: summary.maxVolume ? candleLabel(summary.maxVolume) : "kein Volumen gemeldet",
            },
            { label: "Ø Volumen", value: formatContracts(summary.avgVolume), hint: `Kontrakte je ${unitInfo.one}` },
          ]}
        />

        <StatSection title="Chart" question="Wo lagen die großen Bewegungen?" hint={CHART_UNIT_LABEL[chart[0]?.unit ?? unit]}>
          <Card>
            <CardHeader>
              <CardTitle>XAUUSD mit dem Volumen der Gold-Futures</CardTitle>
              <CardDescription>
                ▲ größte Long-, ▼ größte Short-Bewegung in Dollar · türkis: die drei Kerzen mit dem meisten Volumen
                {chart[0] && chart[0].unit !== unit && ` · bei diesem Zeitraum als ${CHART_UNIT_LABEL[chart[0].unit]} zusammengefasst`}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <MarketCandleChart candles={chart} recordLong={marker(recordLong)} recordShort={marker(recordShort)} />
            </CardContent>
          </Card>
        </StatSection>

        <StatSection title="Top 10" question={`Welche ${unitInfo.label} waren am stärksten?`} hint={rangeInfo.long}>
          <Card>
            <CardContent>
              <TopTable lists={lists} unitOne={unitInfo.one} longRange={longRange} />
            </CardContent>
          </Card>
        </StatSection>

        {unit === "tage" && (
          <StatSection title="Wochentage" question="Welcher Tag bewegt sich am meisten?" hint={rangeInfo.long}>
            <Card>
              <CardContent>
                <WeekdayBars stats={weekdays} />
              </CardContent>
            </Card>
          </StatSection>
        )}

        <p className="text-xs text-muted-foreground">
          Handelstag wie bei VT: von 17:00 bis 17:00 Uhr New York. Kurse bis Februar 2024 von Dukascopy, danach von VT
          Markets (XAUUSD-VIP). Volumen: gehandelte Kontrakte der Gold-Futures an der COMEX (TradingView GC1! und GC2!
          zusammen, damit der Kontraktwechsel keine Lücke reißt) – nur zur eigenen Auswertung.
        </p>
      </div>
    </>
  );
}

/** Zwei Balken je Wochentag: Ø Spanne in Prozent und Ø Volumen; der höchste Wert jeweils hervorgehoben. */
function WeekdayBars({ stats }: { stats: ReturnType<typeof weekdayStats> }) {
  const ranges = stats.map((s) => s.avgRangePct ?? 0);
  const volumes = stats.map((s) => s.avgVolume ?? 0);
  const maxRange = Math.max(...ranges);
  const maxVolume = Math.max(...volumes);
  // Balken ab 60 % des kleinsten Werts, damit kleine Unterschiede sichtbar bleiben
  const height = (value: number, values: number[]) => {
    const min = Math.min(...values) * 0.6;
    const max = Math.max(...values);
    return max > min ? `${Math.max(4, ((value - min) / (max - min)) * 100)}%` : "4%";
  };

  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-5 gap-3 sm:gap-6">
        {stats.map((s, i) => (
          <div key={s.label} className="grid gap-2">
            <div className="flex h-28 items-end gap-1.5" aria-hidden>
              <div
                className={cn("flex-1 rounded-t-sm", ranges[i] === maxRange ? "bg-warning" : "bg-warning/30")}
                style={{ height: height(ranges[i], ranges) }}
              />
              <div
                className={cn("flex-1 rounded-t-sm", volumes[i] === maxVolume && maxVolume > 0 ? "bg-chart-line" : "bg-chart-line/30")}
                style={{ height: height(volumes[i], volumes) }}
              />
            </div>
            <div>
              <p className="text-sm font-semibold">{s.label}</p>
              <p className="text-xs text-muted-foreground tabular-nums">
                {formatPct(s.avgRangePct)} · {s.avgVolume != null ? `${formatNumber(Math.round(s.avgVolume / 1000), 0)} Tsd.` : "–"}
              </p>
              <p className="text-xs text-muted-foreground tabular-nums">
                {s.upShare != null ? `${Math.round(s.upShare * 100)} % steigend` : "–"} · {s.count}×
              </p>
            </div>
          </div>
        ))}
      </div>
      <p className="flex flex-wrap gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-warning" aria-hidden /> Ø Spanne in Prozent
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-chart-line" aria-hidden /> Ø Volumen in Kontrakten
        </span>
      </p>
    </div>
  );
}
