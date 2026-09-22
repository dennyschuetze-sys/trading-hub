import "server-only";
import { COT_MARKETS, parseCotRows, type CotRow } from "@/lib/cot";
import type { createAdminClient } from "@/lib/supabase/admin";

type Admin = NonNullable<ReturnType<typeof createAdminClient>>;

const ENDPOINT = "https://publicreporting.cftc.gov/resource/6dca-aqww.json";
const USER_AGENT = "TradingHub/1.0 (personal trading journal)";
/** Ein Backfill über drei Jahre und 19 Märkte bleibt deutlich darunter. */
const MAX_BYTES = 20_000_000;
/** Wochen, die beim Backfill geholt werden, wenn noch nichts gespeichert ist. */
const BACKFILL_YEARS = 3;
/** Nachmeldungen der CFTC treffen auch ältere Wochen – diese Spanne wird jedes Mal neu geholt. */
const OVERLAP_DAYS = 14;

const FIELDS = [
  "report_date_as_yyyy_mm_dd",
  "cftc_contract_market_code",
  "market_and_exchange_names",
  "open_interest_all",
  "noncomm_positions_long_all",
  "noncomm_positions_short_all",
  "comm_positions_long_all",
  "comm_positions_short_all",
  "nonrept_positions_long_all",
  "nonrept_positions_short_all",
].join(",");

const shiftDays = (date: string, days: number) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

/** Ab welchem Stichtag geholt wird: kurz vor dem letzten gespeicherten Report, sonst drei Jahre zurück. */
async function defaultSince(admin: Admin): Promise<string> {
  const { data } = await admin.from("cot_reports").select("report_date").order("report_date", { ascending: false }).limit(1).maybeSingle();
  if (data?.report_date) return shiftDays(data.report_date, -OVERLAP_DAYS);
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() - BACKFILL_YEARS);
  return d.toISOString().slice(0, 10);
}

async function fetchRows(since: string): Promise<CotRow[]> {
  const codes = COT_MARKETS.map((m) => `'${m.code}'`).join(",");
  const url = new URL(ENDPOINT);
  url.searchParams.set("$select", FIELDS);
  url.searchParams.set("$where", `cftc_contract_market_code in (${codes}) and report_date_as_yyyy_mm_dd >= '${since}T00:00:00.000'`);
  url.searchParams.set("$order", "report_date_as_yyyy_mm_dd");
  url.searchParams.set("$limit", "50000");

  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`CFTC antwortete mit ${res.status}`);

  const text = await res.text();
  if (text.length > MAX_BYTES) throw new Error("Antwort der CFTC ist zu groß");
  return parseCotRows(JSON.parse(text));
}

const toRow = (r: CotRow) => ({
  contract_code: r.contractCode,
  report_date: r.reportDate,
  market_name: r.marketName,
  open_interest: r.openInterest,
  noncomm_long: r.noncommLong,
  noncomm_short: r.noncommShort,
  comm_long: r.commLong,
  comm_short: r.commShort,
  nonrept_long: r.nonreptLong,
  nonrept_short: r.nonreptShort,
});

export type CotSyncResult = { since: string; fetched: number; upserted: number; latestDate: string | null };

/**
 * Holt die COT-Reports ab `since` und schreibt sie in `cot_reports`. Der Upsert ist
 * idempotent, der Job darf also mehrfach laufen – genau das nutzt der Freitag-/Samstag-Zeitplan.
 */
export async function syncCot(admin: Admin, options: { since?: string } = {}): Promise<CotSyncResult> {
  const since = options.since ?? (await defaultSince(admin));
  const rows = await fetchRows(since);

  let upserted = 0;
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500).map(toRow);
    const { error } = await admin.from("cot_reports").upsert(chunk, { onConflict: "contract_code,report_date" });
    if (error) throw new Error(`Speichern fehlgeschlagen: ${error.message}`);
    upserted += chunk.length;
  }

  const latestDate = rows.reduce<string | null>((max, r) => (max === null || r.reportDate > max ? r.reportDate : max), null);
  return { since, fetched: rows.length, upserted, latestDate };
}
