import type { ChartKind } from "@/lib/daily-plan";
import type { createClient } from "@/lib/supabase/client";

// Bilder hochladen: Datei in den privaten Bucket, dann Eintrag in der passenden Tabelle.
// - Trade-Screenshots: <user>/<trade>/… → trade_screenshots (Detailseite, vorgemerkte Bilder beim Speichern)
// - Chart-Bilder zum Tag: <user>/days/<datum>/… → day_charts (Tagesplan, bewusst nicht in der Screenshot-Galerie)

export const SCREENSHOT_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];
export const SCREENSHOT_MAX_BYTES = 10 * 1024 * 1024;

type Client = ReturnType<typeof createClient>;

/** Nur erlaubte Bilder; Fehlermeldung, wenn keins passt oder eins zu groß ist. */
export function checkScreenshots(files: File[]): { images: File[]; error: string | null } {
  const images = files.filter((f) => SCREENSHOT_TYPES.includes(f.type));
  if (!images.length) return { images: [], error: "Bitte PNG, JPG, WebP oder GIF verwenden." };
  const tooBig = images.find((f) => f.size > SCREENSHOT_MAX_BYTES);
  if (tooBig) return { images: [], error: `„${tooBig.name}“ ist größer als 10 MB.` };
  return { images, error: null };
}

const fileName = (file: File) => `${crypto.randomUUID()}.${file.type.split("/")[1].replace("jpeg", "jpg")}`;

/** Datei hochladen und Eintrag anlegen; scheitert der Eintrag, wird die Datei wieder entfernt. */
async function storeImage(supabase: Client, path: string, file: File, insert: () => PromiseLike<{ error: unknown }>) {
  const { error: uploadError } = await supabase.storage.from("screenshots").upload(path, file, { contentType: file.type });
  if (uploadError) throw uploadError;

  const { error: insertError } = await insert();
  if (insertError) {
    await supabase.storage.from("screenshots").remove([path]);
    throw insertError;
  }
}

export async function uploadScreenshots(supabase: Client, { userId, tradeId, files }: { userId: string; tradeId: string; files: File[] }) {
  for (const file of files) {
    const path = `${userId}/${tradeId}/${fileName(file)}`;
    await storeImage(supabase, path, file, () => supabase.from("trade_screenshots").insert({ trade_id: tradeId, storage_path: path }));
  }
}

export async function uploadDayCharts(
  supabase: Client,
  { userId, date, files, kind, symbol }: { userId: string; date: string; files: File[]; kind: ChartKind; symbol: string | null },
) {
  for (const file of files) {
    const path = `${userId}/days/${date}/${fileName(file)}`;
    await storeImage(supabase, path, file, () =>
      supabase.from("day_charts").insert({ chart_date: date, storage_path: path, kind, symbol }),
    );
  }
}
