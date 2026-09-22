import { CotNetChart } from "@/components/charts/cot-net-chart";
import { StatSection, StatStrip } from "@/components/charts/stat-tile";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { COT_DISCLAIMER, COT_GROUPS, isExtreme, releaseDate, type CotGroup } from "@/lib/cot";
import { fetchCotSeries, fetchTradedCotCodes } from "@/lib/cot-queries";
import { createClient } from "@/lib/supabase/server";
import { formatDate, plural } from "@/lib/trading";
import { CotFilters } from "./cot-filters";
import { MarketCard } from "./market-card";

/** Immer drei Jahre laden – der Rückblick des COT-Index ist nur ein Ausschnitt davon. */
const WEEKS = 157;

export default async function CotPage({ searchParams }: PageProps<"/cot">) {
  const sp = await searchParams;
  const one = (key: string) => {
    const value = sp[key];
    return (Array.isArray(value) ? value[0] : value) ?? "";
  };

  const group = COT_GROUPS.includes(one("gruppe") as CotGroup) ? (one("gruppe") as CotGroup) : "";
  const lookback = one("index") === "1" ? "1" : "3";
  const ownOnly = one("eigene") === "1";

  const supabase = await createClient();
  const [all, ownCodes] = await Promise.all([
    fetchCotSeries(supabase, WEEKS, lookback === "1" ? 52 : 156),
    fetchTradedCotCodes(supabase),
  ]);

  if (!all.length) {
    return (
      <>
        <PageHeader title="COT-Daten" description="Positionierung der großen Spekulanten (CFTC) für deine Märkte" />
        <Card>
          <CardHeader>
            <CardTitle>Noch keine Daten</CardTitle>
            <CardDescription>
              Die wöchentlichen CFTC-Reports werden vom Cron-Job <code>/api/cron/cot</code> geholt. Einmal mit{" "}
              <code>?since=</code> anstoßen, dann steht die Historie hier.
            </CardDescription>
          </CardHeader>
        </Card>
      </>
    );
  }

  let shown = group ? all.filter((s) => s.market.group === group) : all;
  if (ownOnly) shown = shown.filter((s) => ownCodes.has(s.market.code));

  // Eigene Märkte zuerst, danach die auffälligsten (stärkster Bias) oben
  const ranked = [...shown].sort((a, b) => {
    const own = Number(ownCodes.has(b.market.code)) - Number(ownCodes.has(a.market.code));
    if (own) return own;
    return Math.abs((b.index ?? 50) - 50) - Math.abs((a.index ?? 50) - 50);
  });

  const selected = ranked.find((s) => s.market.code === one("markt")) ?? ranked[0] ?? null;
  const latestDate = all.reduce((max, s) => (s.latest.date > max ? s.latest.date : max), all[0].latest.date);

  const href = (code: string) => {
    const next = new URLSearchParams();
    if (group) next.set("gruppe", group);
    if (lookback === "1") next.set("index", "1");
    if (ownOnly) next.set("eigene", "1");
    next.set("markt", code);
    return `/cot?${next}`;
  };

  const counts = {
    bullisch: shown.filter((s) => s.bias.tone === "profit").length,
    baerisch: shown.filter((s) => s.bias.tone === "loss").length,
    neutral: shown.filter((s) => s.bias.tone === null).length,
    extrem: shown.filter((s) => isExtreme(s.index)).length,
  };

  return (
    <>
      <PageHeader title="COT-Daten" description="Positionierung der großen Spekulanten (CFTC) für deine Märkte">
        <p className="text-right text-xs text-muted-foreground">
          Stichtag {formatDate(latestDate)}
          <br />
          veröffentlicht {formatDate(releaseDate(latestDate))}
        </p>
      </PageHeader>

      <CotFilters group={group} lookback={lookback} ownOnly={ownOnly} />

      {shown.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Keine passenden Märkte</CardTitle>
            <CardDescription>
              {ownOnly
                ? "Zu deinen gehandelten Symbolen gibt es in dieser Gruppe keine COT-Daten. Europäische Indizes wie GER40 veröffentlicht die CFTC nicht."
                : "In dieser Gruppe liegen noch keine Daten vor."}
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="grid gap-8">
          <StatStrip
            columns={3}
            items={[
              { label: "Bullisch", value: plural(counts.bullisch, "Markt", "Märkte"), tone: "profit" },
              { label: "Bärisch", value: plural(counts.baerisch, "Markt", "Märkte"), tone: "loss" },
              { label: "Neutral", value: plural(counts.neutral, "Markt", "Märkte") },
            ]}
          />

          <StatSection
            title="Marktbias"
            question="Wo stehen die großen Spekulanten?"
            hint={counts.extrem ? `${plural(counts.extrem, "Markt", "Märkte")} am Rand der eigenen Historie` : undefined}
          >
            <div className="grid gap-3 md:grid-cols-2">
              {ranked.map((s) => (
                <MarketCard
                  key={s.market.code}
                  series={s}
                  href={href(s.market.code)}
                  selected={selected?.market.code === s.market.code}
                  owned={ownCodes.has(s.market.code)}
                />
              ))}
            </div>
          </StatSection>

          {selected && (
            <StatSection
              title="Verlauf"
              question="Baut sich die Position auf oder ab?"
              hint={`${selected.market.symbols[0]} · ${lookback === "1" ? "1 Jahr" : "3 Jahre"}`}
            >
              <Card>
                <CardHeader>
                  <CardTitle>{selected.market.name}</CardTitle>
                  <CardDescription>
                    Fläche: Netto-Position der Non-Commercials um die Nulllinie · dünne Linie: Open Interest
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <CotNetChart
                    weeks={lookback === "1" ? selected.weeks.slice(-52) : selected.weeks}
                    label={selected.market.symbols[0]}
                  />
                </CardContent>
              </Card>
            </StatSection>
          )}
        </div>
      )}

      <p className="mt-8 text-xs text-muted-foreground">
        {COT_DISCLAIMER} Quelle:{" "}
        <a
          href="https://www.cftc.gov/MarketReports/CommitmentsofTraders/index.htm"
          target="_blank"
          rel="noreferrer"
          className="underline underline-offset-4 hover:text-foreground"
        >
          CFTC, Legacy Futures Only
        </a>
        .
      </p>
    </>
  );
}
