import "server-only";
import { joinVolumes, MARKET_SYMBOL, type MarketDay } from "@/lib/market";
import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;
type Page<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

/** Alle Tageskerzen mit Futures-Volumen, aufsteigend. RLS liefert nur die eigenen Zeilen. */
export async function fetchMarketDays(supabase: Supabase, symbol = MARKET_SYMBOL): Promise<MarketDay[]> {
  const [days, volumes] = await Promise.all([
    allPages(
      (from, to) =>
        supabase.from("market_days").select("day, open, high, low, close").eq("symbol", symbol).order("day").range(from, to),
      "Kerzen",
    ),
    allPages(
      (from, to) =>
        supabase
          .from("market_volumes")
          .select("day, contracts_front, contracts_next")
          .eq("symbol", symbol)
          .order("day")
          .range(from, to),
      "Volumen",
    ),
  ]);
  return joinVolumes(days, volumes);
}

/** Seitenweise wie bei den COT-Daten: PostgREST liefert höchstens 1000 Zeilen je Abfrage. */
async function allPages<T>(page: (from: number, to: number) => Page<T>, what: string) {
  const rows: T[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await page(offset, offset + 999);
    if (error) {
      console.error(`Markt-${what} konnten nicht geladen werden`, error.message);
      break;
    }
    rows.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return rows;
}
