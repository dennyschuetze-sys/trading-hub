import { z } from "zod";

// Antwortformate der KI (Structured Outputs). Die gleichen Schemas prüfen gespeicherte Ergebnisse beim Anzeigen.

const impact = z.enum(["high", "medium", "low"]);

export const NewsBriefingSchema = z.object({
  /** Ein bis zwei Sätze zur Marktlage */
  overview: z.string(),
  themes: z.array(
    z.object({
      title: z.string(),
      detail: z.string(),
      currencies: z.array(z.string()),
      impact,
    }),
  ),
  /** Termine, auf die es heute ankommt */
  watchlist: z.array(
    z.object({
      time: z.string(),
      event: z.string(),
      why: z.string(),
    }),
  ),
  /** Konkreter Hinweis fürs Risiko heute, z. B. Sperrzeiten */
  risk_note: z.string(),
});

export type NewsBriefing = z.infer<typeof NewsBriefingSchema>;

export const JournalAnalysisSchema = z.object({
  summary: z.string(),
  strengths: z.array(z.string()),
  mistakes: z.array(
    z.object({
      pattern: z.string(),
      evidence: z.string(),
      suggestion: z.string(),
    }),
  ),
  best_setups: z.array(
    z.object({
      setup: z.string(),
      evidence: z.string(),
    }),
  ),
  rule_violations: z.array(
    z.object({
      rule: z.string(),
      observation: z.string(),
    }),
  ),
  focus: z.array(z.string()),
  /** true, wenn für belastbare Aussagen zu wenige Daten da waren */
  low_data: z.boolean(),
});

export type JournalAnalysis = z.infer<typeof JournalAnalysisSchema>;
