import Link from "next/link";
import { Images } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { SelectField } from "@/components/forms/field";
import { PageHeader } from "@/components/layout/page-header";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatR, pnlClass } from "@/lib/trading";
import { cn } from "@/lib/utils";
import { BacktestNav } from "../backtest-nav";

const LIMIT = 120;
const param = (v: string | string[] | undefined) => (typeof v === "string" && v !== "" ? v : undefined);

export default async function GalleryPage({ searchParams }: PageProps<"/backtesting/gallery">) {
  const sp = await searchParams;
  const strategy = param(sp.strategy);
  const source = param(sp.source);
  const quality = param(sp.quality) === "a" ? ["A+", "A"] : ["A+"];

  const supabase = await createClient();
  let query = supabase
    .from("trades")
    .select("id, symbol, direction, entry_time, r_multiple, setup_quality, is_backtest, strategy_id, trade_screenshots!inner(storage_path, created_at)")
    .in("setup_quality", quality)
    .eq("status", "closed")
    .order("entry_time", { ascending: false })
    .limit(LIMIT);
  if (strategy === "none") query = query.is("strategy_id", null);
  else if (strategy) query = query.eq("strategy_id", strategy);
  if (source === "live") query = query.eq("is_backtest", false);
  if (source === "backtest") query = query.eq("is_backtest", true);

  const [{ data: trades, error }, { data: strategies }] = await Promise.all([
    query,
    supabase.from("strategies").select("id, name").order("name"),
  ]);
  if (error) throw new Error(error.message);

  // Pro Trade das erste Bild als Vorschau
  const covers = (trades ?? []).map(
    (t) => [...t.trade_screenshots].sort((a, b) => a.created_at.localeCompare(b.created_at))[0].storage_path,
  );
  const { data: signed } = covers.length
    ? await supabase.storage.from("screenshots").createSignedUrls(covers, 60 * 60)
    : { data: [] };

  const nameOf = new Map((strategies ?? []).map((s) => [s.id, s.name]));
  const groups = new Map<string, { title: string; items: { trade: NonNullable<typeof trades>[number]; url: string | null; shots: number }[] }>();
  (trades ?? []).forEach((trade, i) => {
    const key = trade.strategy_id ?? "none";
    const group = groups.get(key) ?? {
      title: trade.strategy_id ? (nameOf.get(trade.strategy_id) ?? "Gelöschte Strategie") : "Ohne Strategie",
      items: [],
    };
    group.items.push({ trade, url: signed?.[i]?.signedUrl ?? null, shots: trade.trade_screenshots.length });
    groups.set(key, group);
  });
  const hasFilters = Boolean(strategy || source || param(sp.quality));

  return (
    <>
      <PageHeader
        title="Setup-Galerie"
        description="Deine besten Beispiele mit Screenshot – so sieht ein Setup aus, das du wieder handeln willst."
      />
      <BacktestNav active="/backtesting/gallery" />

      <Card className="mb-6">
        <CardContent>
          <form action="/backtesting/gallery" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <SelectField
              id="strategy"
              aria-label="Strategie"
              options={[{ value: "none", label: "Ohne Strategie" }, ...(strategies ?? []).map((s) => ({ value: s.id, label: s.name }))]}
              placeholder="Alle Strategien"
              defaultValue={strategy ?? ""}
            />
            <SelectField
              id="source"
              aria-label="Herkunft"
              options={[
                { value: "live", label: "Nur Live" },
                { value: "backtest", label: "Nur Backtest" },
              ]}
              placeholder="Live & Backtest"
              defaultValue={source ?? ""}
            />
            <SelectField
              id="quality"
              aria-label="Setup-Qualität"
              options={[{ value: "a", label: "A+ und A" }]}
              placeholder="Nur A+"
              defaultValue={param(sp.quality) ?? ""}
            />
            <div className="flex gap-2">
              <Button type="submit" variant="secondary" className="flex-1">
                Filtern
              </Button>
              {hasFilters && (
                <Button variant="ghost" asChild>
                  <Link href="/backtesting/gallery">Zurücksetzen</Link>
                </Button>
              )}
            </div>
          </form>
        </CardContent>
      </Card>

      {!groups.size ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <Images className="size-8 text-muted-foreground" />
            <p className="font-medium">{hasFilters ? "Keine Beispiele für diese Filter" : "Noch keine A+-Setups mit Screenshot"}</p>
            <p className="max-w-md text-sm text-muted-foreground">
              Gib einem Trade die Setup-Qualität „A+“ und lade auf der Trade-Seite einen Chart-Screenshot hoch. Dann erscheint er
              hier – aus dem Journal und aus deinen Backtests.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-8">
          {[...groups.entries()].map(([key, group]) => (
            <section key={key} className="grid gap-3" aria-labelledby={`gallery-${key}`}>
              <div className="flex items-baseline justify-between gap-2">
                <h2 id={`gallery-${key}`} className="text-lg font-semibold">
                  {key === "none" ? group.title : <Link href={`/strategies/${key}`} className="hover:underline">{group.title}</Link>}
                </h2>
                <span className="text-sm text-muted-foreground">{group.items.length}</span>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {group.items.map(({ trade, url, shots }) => (
                  <Link key={trade.id} href={`/journal/${trade.id}`} className="group">
                    <Card className="h-full gap-0 overflow-hidden py-0 transition-colors group-hover:border-foreground/20">
                      <div className="relative bg-muted">
                        {url ? (
                          // eslint-disable-next-line @next/next/no-img-element -- signierte Supabase-URLs
                          <img src={url} alt={`Chart ${trade.symbol} vom ${formatDate(trade.entry_time)}`} className="aspect-video w-full object-cover" loading="lazy" />
                        ) : (
                          <div className="aspect-video" />
                        )}
                        {shots > 1 && (
                          <Badge variant="secondary" className="absolute top-2 right-2">
                            {shots} Bilder
                          </Badge>
                        )}
                      </div>
                      <CardContent className="flex items-center justify-between gap-2 px-4 py-3 text-sm">
                        <span className="min-w-0">
                          <span className="font-medium">{trade.symbol}</span>{" "}
                          <span className={trade.direction === "long" ? "text-profit" : "text-loss"}>
                            {trade.direction === "long" ? "Long" : "Short"}
                          </span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {formatDate(trade.entry_time)} · {trade.is_backtest ? "Backtest" : "Live"} · {trade.setup_quality}
                          </span>
                        </span>
                        <span className={cn("font-semibold tabular-nums", pnlClass(trade.r_multiple))}>{formatR(trade.r_multiple)}</span>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {(trades?.length ?? 0) >= LIMIT && (
        <p className="mt-6 text-center text-sm text-muted-foreground">Die neuesten {LIMIT} Beispiele – filtere nach Strategie für mehr.</p>
      )}
    </>
  );
}
