import Link from "next/link";
import { ChevronLeft, ChevronRight, Images } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SelectField } from "@/components/forms/field";
import { PageHeader } from "@/components/layout/page-header";
import { createClient } from "@/lib/supabase/server";
import { TIME_ZONE, formatDate, formatMoney, formatR } from "@/lib/trading";
import { ScreenshotGrid, type ScreenshotItem } from "./screenshot-grid";

/** Trades pro Seite – jeder Trade kann mehrere Bilder haben. */
const PAGE_SIZE = 24;
const param = (v: string | string[] | undefined) => (typeof v === "string" && v !== "" ? v : undefined);
const monthLabel = new Intl.DateTimeFormat("de-DE", { month: "long", year: "numeric", timeZone: TIME_ZONE });

export default async function ScreenshotsPage({ searchParams }: PageProps<"/screenshots">) {
  const sp = await searchParams;
  const filters = {
    account: param(sp.account),
    strategy: param(sp.strategy),
    symbol: param(sp.symbol),
    result: param(sp.result),
    source: param(sp.source),
  };
  const page = Math.max(1, Number(param(sp.page) ?? 1) || 1);

  const supabase = await createClient();
  let query = supabase
    .from("trades")
    .select(
      "id, symbol, direction, entry_time, net_pnl, r_multiple, is_backtest, accounts(name, currency), strategies(name), trade_screenshots!inner(id, storage_path, created_at)",
      { count: "exact" },
    )
    .order("entry_time", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (filters.account) query = query.eq("account_id", filters.account);
  if (filters.strategy === "none") query = query.is("strategy_id", null);
  else if (filters.strategy) query = query.eq("strategy_id", filters.strategy);
  if (filters.symbol) query = query.ilike("symbol", `%${filters.symbol}%`);
  if (filters.result === "win") query = query.gt("net_pnl", 0);
  if (filters.result === "loss") query = query.lt("net_pnl", 0);
  if (filters.source === "live") query = query.eq("is_backtest", false);
  if (filters.source === "backtest") query = query.eq("is_backtest", true);

  const [{ data: trades, count, error }, { data: accounts }, { data: strategies }] = await Promise.all([
    query,
    supabase.from("accounts").select("id, name").order("name"),
    supabase.from("strategies").select("id, name").order("name"),
  ]);
  if (error) throw new Error(error.message);

  const shots = (trades ?? []).flatMap((trade) =>
    [...trade.trade_screenshots]
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .map((shot, i, all) => ({ trade, shot, position: all.length > 1 ? `${i + 1}/${all.length}` : null })),
  );
  const { data: signed } = shots.length
    ? await supabase.storage.from("screenshots").createSignedUrls(
        shots.map((s) => s.shot.storage_path),
        60 * 60,
      )
    : { data: [] };

  const items: ScreenshotItem[] = shots.flatMap(({ trade, shot, position }, i) => {
    const url = signed?.[i]?.signedUrl;
    if (!url) return [];
    return [
      {
        id: shot.id,
        url,
        tradeId: trade.id,
        month: monthLabel.format(new Date(trade.entry_time)),
        symbol: trade.symbol,
        direction: trade.direction === "long" ? "long" : "short",
        date: formatDate(trade.entry_time),
        context: [trade.is_backtest ? "Backtest" : trade.accounts?.name, trade.strategies?.name].filter(Boolean).join(" · "),
        pnl: trade.net_pnl,
        pnlLabel: trade.net_pnl != null && !trade.is_backtest ? formatMoney(trade.net_pnl, trade.accounts?.currency ?? "USD", true) : null,
        r: trade.r_multiple,
        rLabel: trade.r_multiple != null ? formatR(trade.r_multiple) : null,
        position,
      },
    ];
  });

  const total = count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasFilters = Object.values(filters).some(Boolean);
  const pageLink = (p: number) => {
    const qs = new URLSearchParams(
      Object.entries({ ...filters, page: String(p) }).filter((e): e is [string, string] => Boolean(e[1])),
    );
    return `/screenshots?${qs}`;
  };

  return (
    <>
      <PageHeader
        title="Screenshots"
        description={`Alle Charts, die du zu deinen Trades hochgeladen hast · ${total} ${total === 1 ? "Trade" : "Trades"} mit Bild`}
      />

      <Card className="mb-6">
        <CardContent>
          <form action="/screenshots" className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
            <SelectField
              id="account"
              aria-label="Account"
              options={(accounts ?? []).map((a) => ({ value: a.id, label: a.name }))}
              placeholder="Alle Accounts"
              defaultValue={filters.account ?? ""}
            />
            <SelectField
              id="strategy"
              aria-label="Strategie"
              options={[{ value: "none", label: "Ohne Strategie" }, ...(strategies ?? []).map((s) => ({ value: s.id, label: s.name }))]}
              placeholder="Alle Strategien"
              defaultValue={filters.strategy ?? ""}
            />
            <Input name="symbol" placeholder="Symbol" aria-label="Symbol" defaultValue={filters.symbol} />
            <SelectField
              id="result"
              aria-label="Ergebnis"
              options={[
                { value: "win", label: "Gewinner" },
                { value: "loss", label: "Verlierer" },
              ]}
              placeholder="Alle Ergebnisse"
              defaultValue={filters.result ?? ""}
            />
            <SelectField
              id="source"
              aria-label="Herkunft"
              options={[
                { value: "live", label: "Nur Live" },
                { value: "backtest", label: "Nur Backtest" },
              ]}
              placeholder="Live & Backtest"
              defaultValue={filters.source ?? ""}
            />
            <div className="flex gap-2">
              <Button type="submit" variant="secondary" className="flex-1">
                Filtern
              </Button>
              {hasFilters && (
                <Button variant="ghost" asChild>
                  <Link href="/screenshots">Zurücksetzen</Link>
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
            <p className="font-medium">{hasFilters ? "Keine Screenshots für diese Filter" : "Noch keine Screenshots"}</p>
            {!hasFilters && (
              <p className="max-w-md text-sm text-muted-foreground">
                Lade beim Erfassen eines Trades oder auf der Trade-Seite einen Chart hoch – er erscheint dann hier.
              </p>
            )}
          </CardContent>
        </Card>
      ) : (
        <ScreenshotGrid items={items} />
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
