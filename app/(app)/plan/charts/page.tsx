import Link from "next/link";
import { ArrowLeft, ChevronLeft, ChevronRight, History, Images } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { SelectField } from "@/components/forms/field";
import { PageHeader } from "@/components/layout/page-header";
import { CHART_KINDS, isChartKind } from "@/lib/daily-plan";
import { DAY_CHART_COLUMNS, withSignedUrls } from "@/lib/day-charts";
import { createClient } from "@/lib/supabase/server";
import { plural } from "@/lib/trading";
import { ChartGallery } from "./chart-gallery";

/** Bilder pro Seite */
const PAGE_SIZE = 36;
const param = (v: string | string[] | undefined) => (typeof v === "string" && v !== "" ? v : undefined);

/** Chart-Bilder zum Tag (Marktverlauf, verpasste Setups) – getrennt von den Trade-Screenshots. */
export default async function DayChartsPage({ searchParams }: PageProps<"/plan/charts">) {
  const sp = await searchParams;
  const kind = param(sp.kind);
  const filters = { kind: isChartKind(kind) ? kind : undefined, symbol: param(sp.symbol) };
  const page = Math.max(1, Number(param(sp.page) ?? 1) || 1);

  const supabase = await createClient();
  let query = supabase
    .from("day_charts")
    .select(DAY_CHART_COLUMNS, { count: "exact" })
    .order("chart_date", { ascending: false })
    .order("created_at")
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (filters.kind) query = query.eq("kind", filters.kind);
  if (filters.symbol) query = query.eq("symbol", filters.symbol);

  const [{ data: rows, count, error }, { data: symbolRows }, { count: missed }] = await Promise.all([
    query,
    supabase.from("day_charts").select("symbol").not("symbol", "is", null).limit(5000),
    supabase.from("day_charts").select("id", { count: "exact", head: true }).eq("kind", "missed_setup"),
  ]);
  if (error) throw new Error(error.message);

  const items = await withSignedUrls(supabase, rows ?? []);
  const symbols = [...new Set((symbolRows ?? []).map((r) => r.symbol!))].sort();
  const total = count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasFilters = Object.values(filters).some(Boolean);
  const pageLink = (p: number) => {
    const qs = new URLSearchParams(
      Object.entries({ ...filters, page: String(p) }).filter((e): e is [string, string] => Boolean(e[1])),
    );
    return `/plan/charts?${qs}`;
  };

  return (
    <>
      <PageHeader
        title="Chart-Rückblick"
        description={`Marktverlauf und verpasste Setups aus deinen Tagesplänen · ${plural(total, "Bild", "Bilder")}${
          !hasFilters && missed ? `, davon ${missed} verpasste${missed === 1 ? "s Setup" : " Setups"}` : ""
        }`}
      >
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild>
            <Link href="/plan">
              <ArrowLeft className="size-4" /> Zum Tagesplan
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/plan/history">
              <History className="size-4" /> Verlauf
            </Link>
          </Button>
        </div>
      </PageHeader>

      <Card className="mb-6">
        <CardContent>
          <form action="/plan/charts" className="grid gap-3 sm:grid-cols-3">
            <SelectField
              id="kind"
              aria-label="Art"
              options={CHART_KINDS}
              placeholder="Alle Arten"
              defaultValue={filters.kind ?? ""}
            />
            <SelectField
              id="symbol"
              aria-label="Markt"
              options={filters.symbol && !symbols.includes(filters.symbol) ? [...symbols, filters.symbol] : symbols}
              placeholder="Alle Märkte"
              defaultValue={filters.symbol ?? ""}
            />
            <div className="flex gap-2">
              <Button type="submit" variant="secondary" className="flex-1">
                Filtern
              </Button>
              {hasFilters && (
                <Button variant="ghost" asChild>
                  <Link href="/plan/charts">Zurücksetzen</Link>
                </Button>
              )}
            </div>
          </form>
        </CardContent>
      </Card>

      {!items.length ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <Images className="size-8 text-muted-foreground" />
            <p className="font-medium">{hasFilters ? "Keine Bilder für diese Filter" : "Noch keine Chart-Bilder"}</p>
            {!hasFilters && (
              <>
                <p className="max-w-md text-sm text-muted-foreground">
                  Lade im Tagesplan unter „Session“ Charts vom Tag hoch – auch ohne Trade. Sie erscheinen dann hier.
                </p>
                <Button asChild>
                  <Link href="/plan#chart-rueckblick">Zum heutigen Tagesplan</Link>
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      ) : (
        <ChartGallery items={items} />
      )}

      {pages > 1 && (
        <div className="mt-6 flex items-center justify-center gap-2 text-sm">
          <Button variant="outline" size="icon" asChild disabled={page <= 1}>
            <Link href={pageLink(Math.max(1, page - 1))} aria-label="Vorherige Seite">
              <ChevronLeft className="size-4" />
            </Link>
          </Button>
          <span className="tabular-nums">
            Seite {page} von {pages}
          </span>
          <Button variant="outline" size="icon" asChild disabled={page >= pages}>
            <Link href={pageLink(Math.min(pages, page + 1))} aria-label="Nächste Seite">
              <ChevronRight className="size-4" />
            </Link>
          </Button>
        </div>
      )}
    </>
  );
}
