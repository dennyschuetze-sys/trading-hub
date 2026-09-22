import "server-only";
import type { z } from "zod";
import type { Json } from "@/lib/database.types";
import type { createClient } from "@/lib/supabase/server";
import type { AiResult } from "./claude";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export type AiReportKind = "news_daily" | "journal_week" | "journal_month";

/** Kostenbremse: so oft darf ein Ergebnis pro Zeitraum neu erstellt werden. */
export const MAX_GENERATIONS = 5;

export type StoredReport<T> = { data: T; updatedAt: string; generations: number };

/** Verbrauchte Generierungen. Der Zähler liegt in `ai_usage`, weil der Nutzer dort nicht schreiben darf. */
export async function usedGenerations(supabase: Supabase, kind: AiReportKind, periodKey: string): Promise<number> {
  const { data } = await supabase
    .from("ai_usage")
    .select("generations")
    .eq("kind", kind)
    .eq("period_key", periodKey)
    .maybeSingle();
  return data?.generations ?? 0;
}

/** Gespeichertes Ergebnis laden – ungültige oder veraltete Formate werden ignoriert. */
export async function loadReport<S extends z.ZodType>(
  supabase: Supabase,
  kind: AiReportKind,
  periodKey: string,
  schema: S,
): Promise<{ report: StoredReport<z.infer<S>> | null; generations: number }> {
  const [{ data }, generations] = await Promise.all([
    supabase.from("ai_reports").select("content, updated_at").eq("kind", kind).eq("period_key", periodKey).maybeSingle(),
    usedGenerations(supabase, kind, periodKey),
  ]);
  if (!data) return { report: null, generations };
  const parsed = schema.safeParse(data.content);
  return {
    report: parsed.success ? { data: parsed.data, updatedAt: data.updated_at, generations } : null,
    generations,
  };
}

/**
 * Bucht eine Generierung, bevor der teure Aufruf startet, und gibt den neuen Stand zurück.
 * `null` heißt: Limit erreicht. Das Hochzählen passiert in einem einzigen Statement in der
 * Datenbank, deshalb können zwei gleichzeitige Anfragen nicht dieselbe Restfreigabe nutzen.
 */
export async function claimGeneration(supabase: Supabase, kind: AiReportKind, periodKey: string): Promise<number | null> {
  const { data, error } = await supabase.rpc("claim_ai_generation", {
    p_kind: kind,
    p_period_key: periodKey,
    p_max: MAX_GENERATIONS,
  });
  if (error) throw new Error(`Kontingent konnte nicht geprüft werden: ${error.message}`);
  return data ?? null;
}

/** Buchung zurücknehmen, wenn der Aufruf fehlgeschlagen ist. Fehler dabei sind unkritisch. */
export async function releaseGeneration(supabase: Supabase, kind: AiReportKind, periodKey: string) {
  const { error } = await supabase.rpc("release_ai_generation", { p_kind: kind, p_period_key: periodKey });
  if (error) console.error("Kontingent nicht zurückgegeben", error.message);
}

export async function saveReport(
  supabase: Supabase,
  userId: string,
  kind: AiReportKind,
  periodKey: string,
  result: AiResult<unknown>,
  generations: number,
) {
  const { error } = await supabase.from("ai_reports").upsert(
    {
      user_id: userId,
      kind,
      period_key: periodKey,
      content: result.data as Json,
      model: result.model,
      input_tokens: result.inputTokens,
      output_tokens: result.outputTokens,
      generations,
    },
    { onConflict: "user_id,kind,period_key" },
  );
  if (error) throw new Error(`Ergebnis konnte nicht gespeichert werden: ${error.message}`);
}
