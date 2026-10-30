import "server-only";
import type { KiBar, KiModel, KiPrediction, KiSide, KiStatus, KiTrade } from "@/lib/ki";
import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** Zwei Handelstage M15 für Chart und Vorhersage-Verlauf. */
const RECENT_BARS = 192;
const RECENT_TRADES = 30;
const BAR_COLUMNS = "bar_at, open, high, low, close";

export type KiOverview = {
  status: KiStatus | null;
  bars: KiBar[];
  predictions: KiPrediction[];
  recent: KiTrade[];
  closed: Pick<KiTrade, "signal_at" | "r_net">[];
  models: KiModel[];
};

/** Alles für die Seite /ki. RLS liefert nur die eigenen Zeilen. */
export async function fetchKiOverview(supabase: Supabase): Promise<KiOverview> {
  const [status, bars, predictions, recent, models, closed] = await Promise.all([
    supabase.from("ki_status").select("*").maybeSingle(),
    supabase.from("ki_bars").select(BAR_COLUMNS).order("bar_at", { ascending: false }).limit(RECENT_BARS),
    supabase
      .from("ki_predictions")
      .select("bar_at, close, pred_long, pred_short, made_at")
      .order("bar_at", { ascending: false })
      .limit(RECENT_BARS),
    supabase.from("ki_trades").select("*").order("signal_at", { ascending: false }).limit(RECENT_TRADES),
    supabase.from("ki_models").select("*").order("trained_at", { ascending: false }).limit(30),
    fetchClosedTrades(supabase),
  ]);
  for (const [name, result] of [
    ["Status", status],
    ["Kerzen", bars],
    ["Vorhersagen", predictions],
    ["Trades", recent],
    ["Modelle", models],
  ] as const) {
    if (result.error) console.error(`KI-${name} konnten nicht geladen werden`, result.error.message);
  }

  return {
    status: status.data,
    bars: [...(bars.data ?? [])].reverse(),
    predictions: [...(predictions.data ?? [])].reverse(),
    recent: recent.data ?? [],
    closed,
    models: models.data ?? [],
  };
}

/** Ein gedachter Trade und die Kerzen von acht Stunden vor dem Signal bis vier Stunden nach dem Ausstieg. */
export async function fetchKiTrade(supabase: Supabase, side: KiSide, signalAt: string) {
  const { data: trade, error } = await supabase
    .from("ki_trades")
    .select("*")
    .eq("side", side)
    .eq("signal_at", signalAt)
    .maybeSingle();
  if (error) console.error("KI-Trade konnte nicht geladen werden", error.message);
  if (!trade) return null;

  const from = new Date(Date.parse(trade.signal_at) - 8 * 3_600_000).toISOString();
  const to = new Date(Date.parse(trade.exit_at ?? new Date().toISOString()) + 4 * 3_600_000).toISOString();
  const { data: bars, error: barsError } = await supabase
    .from("ki_bars")
    .select(BAR_COLUMNS)
    .gte("bar_at", from)
    .lte("bar_at", to)
    .order("bar_at")
    .limit(1000);
  if (barsError) console.error("KI-Kerzen konnten nicht geladen werden", barsError.message);
  return { trade, bars: bars ?? [] };
}

/** Alle abgeschlossenen Trades für die Bilanzkurve, seitenweise wie bei den COT-Daten. */
async function fetchClosedTrades(supabase: Supabase) {
  const rows: Pick<KiTrade, "signal_at" | "r_net">[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase
      .from("ki_trades")
      .select("signal_at, r_net")
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
