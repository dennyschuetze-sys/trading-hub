import { isChartKind, type ChartKind } from "@/lib/daily-plan";
import { signStoragePaths } from "@/lib/note-images";

/** Chart-Bild zum Tag, fertig zum Anzeigen (signierte URL, 1 Stunde gültig). */
export type DayChartItem = {
  id: string;
  url: string;
  /** Kalendertag YYYY-MM-DD */
  date: string;
  kind: ChartKind;
  symbol: string | null;
  note: string | null;
};

export const DAY_CHART_COLUMNS = "id, chart_date, storage_path, kind, symbol, note";

type DayChartRow = { id: string; chart_date: string; storage_path: string; kind: string; symbol: string | null; note: string | null };

/** Einträge mit signierten URLs; Bilder, deren Datei fehlt, fallen weg. */
export async function withSignedUrls(
  supabase: Parameters<typeof signStoragePaths>[0],
  rows: DayChartRow[],
): Promise<DayChartItem[]> {
  const urls = await signStoragePaths(supabase, rows.map((r) => r.storage_path));
  return rows.flatMap((r) => {
    const url = urls[r.storage_path];
    if (!url) return [];
    return [{ id: r.id, url, date: r.chart_date, kind: isChartKind(r.kind) ? r.kind : "market", symbol: r.symbol, note: r.note }];
  });
}
