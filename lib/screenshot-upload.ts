import type { createClient } from "@/lib/supabase/client";

// Trade-Screenshots hochladen: Datei in den Storage unter <user>/<trade>/…, dann Eintrag in trade_screenshots.
// Genutzt auf der Detailseite und beim Speichern eines Trades mit vorgemerkten Bildern.

export const SCREENSHOT_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];
export const SCREENSHOT_MAX_BYTES = 10 * 1024 * 1024;

/** Nur erlaubte Bilder; Fehlermeldung, wenn keins passt oder eins zu groß ist. */
export function checkScreenshots(files: File[]): { images: File[]; error: string | null } {
  const images = files.filter((f) => SCREENSHOT_TYPES.includes(f.type));
  if (!images.length) return { images: [], error: "Bitte PNG, JPG, WebP oder GIF verwenden." };
  const tooBig = images.find((f) => f.size > SCREENSHOT_MAX_BYTES);
  if (tooBig) return { images: [], error: `„${tooBig.name}“ ist größer als 10 MB.` };
  return { images, error: null };
}

export async function uploadScreenshots(
  supabase: ReturnType<typeof createClient>,
  { userId, tradeId, files }: { userId: string; tradeId: string; files: File[] },
) {
  for (const file of files) {
    const ext = file.type.split("/")[1].replace("jpeg", "jpg");
    const path = `${userId}/${tradeId}/${crypto.randomUUID()}.${ext}`;
    const { error: uploadError } = await supabase.storage.from("screenshots").upload(path, file, { contentType: file.type });
    if (uploadError) throw uploadError;

    const { error: insertError } = await supabase.from("trade_screenshots").insert({ trade_id: tradeId, storage_path: path });
    if (insertError) {
      await supabase.storage.from("screenshots").remove([path]);
      throw insertError;
    }
  }
}
