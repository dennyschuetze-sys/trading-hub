/**
 * Bilder in Markdown-Texten werden als `storage://<pfad>` gespeichert (privater Bucket).
 * Beim Anzeigen werden daraus kurzlebige signierte URLs.
 */
export const STORAGE_PREFIX = "storage://";

export function extractStoragePaths(...texts: (string | null | undefined)[]): string[] {
  const paths = new Set<string>();
  for (const text of texts) {
    for (const m of (text ?? "").matchAll(/storage:\/\/([\w\-./]+)/g)) paths.add(m[1]);
  }
  return [...paths];
}

type StorageClient = {
  storage: {
    from: (bucket: string) => {
      createSignedUrls: (
        paths: string[],
        expiresIn: number,
      ) => Promise<{ data: { path: string | null; signedUrl: string | null }[] | null }>;
    };
  };
};

/** Pfad → signierte URL (1 Stunde gültig). */
export async function signStoragePaths(supabase: StorageClient, paths: string[]): Promise<Record<string, string>> {
  if (!paths.length) return {};
  const { data } = await supabase.storage.from("screenshots").createSignedUrls(paths, 60 * 60);
  return Object.fromEntries((data ?? []).flatMap((d, i) => (d.signedUrl ? [[paths[i], d.signedUrl] as const] : [])));
}
