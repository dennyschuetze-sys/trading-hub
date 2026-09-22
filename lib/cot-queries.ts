import "server-only";
import { buildSeries, cotMarketForSymbol, type CotRow, type CotSeries } from "@/lib/cot";
import { resolveInstrument } from "@/lib/position-size";
import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

const COLUMNS =
  "contract_code, report_date, market_name, open_interest, noncomm_long, noncomm_short, comm_long, comm_short, nonrept_long, nonrept_short";

/**
 * Alle gespeicherten Wochen ab `weeks` Wochen vor heute, fertig aufbereitet.
 * `lookbackWeeks` bestimmt das Fenster des COT-Index und ist höchstens so lang wie der geladene Zeitraum.
 */
export async function fetchCotSeries(supabase: Supabase, weeks: number, lookbackWeeks: number): Promise<CotSeries[]> {
  const from = new Date();
  from.setUTCDate(from.getUTCDate() - weeks * 7);

  const rows: CotRow[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase
      .from("cot_reports")
      .select(COLUMNS)
      .gte("report_date", from.toISOString().slice(0, 10))
      .order("report_date")
      .range(offset, offset + 999);
    if (error) {
      console.error("COT-Daten konnten nicht geladen werden", error.message);
      break;
    }
    if (!data?.length) break;
    for (const r of data) {
      rows.push({
        contractCode: r.contract_code,
        reportDate: r.report_date,
        marketName: r.market_name,
        openInterest: r.open_interest,
        noncommLong: r.noncomm_long,
        noncommShort: r.noncomm_short,
        commLong: r.comm_long,
        commShort: r.comm_short,
        nonreptLong: r.nonrept_long,
        nonreptShort: r.nonrept_short,
      });
    }
    if (data.length < 1000) break;
  }

  return buildSeries(rows, lookbackWeeks);
}

/**
 * Die CFTC-Kontraktcodes, zu denen es tatsächlich Trades gibt. Broker-Schreibweisen wie
 * „NAS100.cash“ laufen dafür durch `resolveInstrument`, genau wie im Positionsrechner.
 */
export async function fetchTradedCotCodes(supabase: Supabase): Promise<Set<string>> {
  const { data } = await supabase.from("trades").select("symbol").eq("is_backtest", false).limit(1000);
  const codes = new Set<string>();
  for (const { symbol } of data ?? []) {
    const market = cotMarketForSymbol(resolveInstrument(symbol)?.symbol ?? symbol);
    if (market) codes.add(market.code);
  }
  return codes;
}
