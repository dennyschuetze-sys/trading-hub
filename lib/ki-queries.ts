import "server-only";
import type { KiModel, KiPrediction, KiStatus, KiTrade } from "@/lib/ki";
import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** Zwei Handelstage M15 für den Vorhersage-Verlauf. */
const PREDICTION_BARS = 192;
const RECENT_TRADES = 30;

export type KiOverview = {
  status: KiStatus | null;
  predictions: KiPrediction[];
  recent: KiTrade[];
  closed: Pick<KiTrade, "signal_at" | "r_net">[];
  models: KiModel[];
};

/** Alles für die Seite /ki. RLS liefert nur die eigenen Zeilen. */
export async function fetchKiOverview(supabase: Supabase): Promise<KiOverview> {
  const [status, predictions, recent, models, closed] = await Promise.all([
    supabase.from("ki_status").select("*").maybeSingle(),
    supabase
      .from("ki_predictions")
      .select("bar_at, close, pred_long, pred_short, made_at")
      .order("bar_at", { ascending: false })
      .limit(PREDICTION_BARS),
    supabase.from("ki_trades").select("*").order("signal_at", { ascending: false }).limit(RECENT_TRADES),
    supabase.from("ki_models").select("*").order("trained_at", { ascending: false }).limit(30),
    fetchClosedTrades(supabase),
  ]);
  for (const [name, result] of [["Status", status], ["Vorhersagen", predictions], ["Trades", recent], ["Modelle", models]] as const) {
    if (result.error) console.error(`KI-${name} konnten nicht geladen werden`, result.error.message);
  }

  return {
    status: status.data,
    predictions: [...(predictions.data ?? [])].reverse(),
    recent: recent.data ?? [],
    closed,
    models: models.data ?? [],
  };
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
