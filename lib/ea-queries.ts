import "server-only";
import type { EaAccount, EaForecast, EaPosition, EaStatus } from "@/lib/ea";
import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export type EaOverview = {
  status: EaStatus | null;
  accounts: EaAccount[];
  positions: EaPosition[];
  forecast: EaForecast[];
};

/** Alles für die Seite /ea. RLS liefert nur die eigenen Zeilen. */
export async function fetchEaOverview(supabase: Supabase): Promise<EaOverview> {
  const [status, accounts, positions, forecast] = await Promise.all([
    supabase.from("ea_status").select("*").maybeSingle(),
    supabase.from("ea_accounts").select("*").order("tag"),
    // Der Gunner macht an starken Tagen 10–30 Trades je Konto; 1000 reichen für einige Wochen Demo
    supabase.from("ea_positions").select("*").order("opened_at", { ascending: false }).limit(1000),
    supabase.from("ea_forecast").select("*").order("day"),
  ]);
  for (const [name, result] of [
    ["Status", status],
    ["Konten", accounts],
    ["Positionen", positions],
    ["Vorhersage", forecast],
  ] as const) {
    if (result.error) throw new Error(`EA-Monitor ${name}: ${result.error.message}`);
  }
  return {
    status: status.data,
    accounts: accounts.data ?? [],
    positions: positions.data ?? [],
    forecast: forecast.data ?? [],
  };
}
