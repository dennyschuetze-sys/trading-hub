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

/** Gespeichertes Ergebnis laden – ungültige oder veraltete Formate werden ignoriert. */
export async function loadReport<S extends z.ZodType>(
  supabase: Supabase,
  kind: AiReportKind,
  periodKey: string,
  schema: S,
): Promise<{ report: StoredReport<z.infer<S>> | null; generations: number }> {
  const { data } = await supabase
    .from("ai_reports")
    .select("content, updated_at, generations")
    .eq("kind", kind)
    .eq("period_key", periodKey)
    .maybeSingle();
  if (!data) return { report: null, generations: 0 };
  const parsed = schema.safeParse(data.content);
  return {
    report: parsed.success ? { data: parsed.data, updatedAt: data.updated_at, generations: data.generations } : null,
    generations: data.generations,
  };
}

export async function saveReport(
  supabase: Supabase,
  userId: string,
  kind: AiReportKind,
  periodKey: string,
  result: AiResult<unknown>,
  previousGenerations: number,
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
      generations: previousGenerations + 1,
    },
    { onConflict: "user_id,kind,period_key" },
  );
  if (error) throw new Error(`Ergebnis konnte nicht gespeichert werden: ${error.message}`);
}
