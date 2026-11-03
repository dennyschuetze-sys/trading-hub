import "server-only";
import type { KiBar, KiMarket, KiModel, KiPrediction, KiSide, KiStatus, KiTrade } from "@/lib/ki";
import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** Zwei Handelstage M15 für den Vorhersage-Verlauf. */
const RECENT_BARS = 192;
/** Gut sechs Wochen M15 für den Kerzenchart, in Seiten zu 1000 (mehr liefert Supabase je Abfrage nicht). */
const CHART_PAGES = 3;
const PAGE = 1000;
const RECENT_TRADES = 30;
const BAR_COLUMNS = "bar_at, open, high, low, close";

export type KiOverview = {
  status: KiStatus | null;
  bars: KiBar[];
  predictions: KiPrediction[];
  recent: KiTrade[];
  /** alle Trades, die auf den Kerzen des Charts liegen */
  chartTrades: KiTrade[];
  closed: Pick<KiTrade, "signal_at" | "r_net">[];
  models: KiModel[];
};

/** Alles für die Seite /ki zu einem Markt. RLS liefert nur die eigenen Zeilen. */
export async function fetchKiOverview(supabase: Supabase, market: KiMarket): Promise<KiOverview> {
  const [status, bars, predictions, recent, models, closed] = await Promise.all([
    supabase.from("ki_status").select("*").eq("market", market).maybeSingle(),
    fetchChartBars(supabase, market),
    supabase
      .from("ki_predictions")
      .select("bar_at, close, pred_long, pred_short, made_at")
      .eq("market", market)
      .order("bar_at", { ascending: false })
      .limit(RECENT_BARS),
    supabase
      .from("ki_trades")
      .select("*")
      .eq("market", market)
      .order("signal_at", { ascending: false })
      .limit(RECENT_TRADES),
    supabase.from("ki_models").select("*").eq("market", market).order("trained_at", { ascending: false }).limit(30),
    fetchClosedTrades(supabase, market),
  ]);
  for (const [name, result] of [
    ["Status", status],
    ["Vorhersagen", predictions],
    ["Trades", recent],
    ["Modelle", models],
  ] as const) {
    if (result.error) console.error(`KI-${name} konnten nicht geladen werden`, result.error.message);
  }

  // Die Trades für den Chart hängen vom ersten Kerzenzeitpunkt ab; meist sind es dieselben wie die letzten 30.
  let chartTrades = recent.data ?? [];
  const oldest = recent.data?.at(-1);
  if (bars.length && recent.data?.length === RECENT_TRADES && oldest && oldest.signal_at >= bars[0].bar_at) {
    const { data, error } = await supabase
      .from("ki_trades")
      .select("*")
      .eq("market", market)
      .gte("signal_at", bars[0].bar_at)
      .order("signal_at", { ascending: false })
      .limit(PAGE);
    if (error) console.error("KI-Trades für den Chart konnten nicht geladen werden", error.message);
    chartTrades = data ?? chartTrades;
  }

  return {
    status: status.data,
    bars,
    predictions: [...(predictions.data ?? [])].reverse(),
    recent: recent.data ?? [],
    chartTrades,
    closed,
    models: models.data ?? [],
  };
}

/** Die neuesten Kerzen für den Chart, aufsteigend; die Seiten laufen parallel. */
async function fetchChartBars(supabase: Supabase, market: KiMarket): Promise<KiBar[]> {
  const pages = await Promise.all(
    Array.from({ length: CHART_PAGES }, (_, i) =>
      supabase
        .from("ki_bars")
        .select(BAR_COLUMNS)
        .eq("market", market)
        .order("bar_at", { ascending: false })
        .range(i * PAGE, (i + 1) * PAGE - 1),
    ),
  );
  const rows: KiBar[] = [];
  for (const page of pages) {
    if (page.error) {
      console.error("KI-Kerzen konnten nicht geladen werden", page.error.message);
      break;
    }
    rows.push(...page.data);
    if (page.data.length < PAGE) break;
  }
  return rows.reverse();
}

/**
 * Ein gedachter Trade und die Kerzen von zwei Tagen vor dem Signal bis einen Tag nach dem Ausstieg; der Chart zeigt
 * anfangs acht Stunden davor bis vier danach, der Rest ist zum Verschieben da.
 */
export async function fetchKiTrade(supabase: Supabase, market: KiMarket, side: KiSide, signalAt: string) {
  const { data: trade, error } = await supabase
    .from("ki_trades")
    .select("*")
    .eq("market", market)
    .eq("side", side)
    .eq("signal_at", signalAt)
    .maybeSingle();
  if (error) console.error("KI-Trade konnte nicht geladen werden", error.message);
  if (!trade) return null;

  const from = new Date(Date.parse(trade.signal_at) - 48 * 3_600_000).toISOString();
  const to = new Date(Date.parse(trade.exit_at ?? new Date().toISOString()) + 24 * 3_600_000).toISOString();
  const { data: bars, error: barsError } = await supabase
    .from("ki_bars")
    .select(BAR_COLUMNS)
    .eq("market", market)
    .gte("bar_at", from)
    .lte("bar_at", to)
    .order("bar_at")
    .limit(1000);
  if (barsError) console.error("KI-Kerzen konnten nicht geladen werden", barsError.message);
  return { trade, bars: bars ?? [] };
}

/** Alle abgeschlossenen Trades für die Bilanzkurve, seitenweise wie bei den COT-Daten. */
async function fetchClosedTrades(supabase: Supabase, market: KiMarket) {
  const rows: Pick<KiTrade, "signal_at" | "r_net">[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase
      .from("ki_trades")
      .select("signal_at, r_net")
      .eq("market", market)
      .eq("status", "zu")
      .order("signal_at")
      .range(offset, offset + 999);
    if (error) {
      console.error("KI-Bilanz konnte nicht geladen werden", error.message);
      break;
    }
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < 1000) break;
  }
  return rows;
}
