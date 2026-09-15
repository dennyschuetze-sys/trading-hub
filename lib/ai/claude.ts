import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";

export const AI_MODEL = "claude-opus-5";

export const aiConfigured = () => Boolean(process.env.ANTHROPIC_API_KEY);

let client: Anthropic | null = null;
const getClient = () => (client ??= new Anthropic());

export class AiError extends Error {}

export type AiResult<T> = { data: T; model: string; inputTokens: number; outputTokens: number };

/**
 * Ein Aufruf mit festem Antwortformat. Lehnt das Modell aus Sicherheitsgründen ab,
 * springt serverseitig automatisch ein Ersatzmodell ein (fallbacks: "default").
 */
export async function generateStructured<S extends z.ZodType>(options: {
  schema: S;
  system: string;
  prompt: string;
  effort: "low" | "medium" | "high";
}): Promise<AiResult<z.infer<S>>> {
  if (!aiConfigured()) throw new AiError("Die KI ist noch nicht eingerichtet (ANTHROPIC_API_KEY fehlt).");

  let response;
  try {
    response = await getClient().beta.messages.parse(
      {
        model: AI_MODEL,
        max_tokens: 16000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        thinking: { type: "adaptive" },
        system: options.system,
        messages: [{ role: "user", content: options.prompt }],
        output_config: { effort: options.effort, format: betaZodOutputFormat(options.schema) },
      },
      { timeout: 110_000 },
    );
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) throw new AiError("Der API-Schlüssel ist ungültig.");
    if (e instanceof Anthropic.PermissionDeniedError) throw new AiError("Der API-Schlüssel hat keine Berechtigung für dieses Modell.");
    if (e instanceof Anthropic.RateLimitError) throw new AiError("Zu viele Anfragen oder Guthaben aufgebraucht. Bitte später erneut versuchen.");
    if (e instanceof Anthropic.BadRequestError) {
      console.error("Claude-Anfrage abgelehnt", e.message);
      if (/credit|billing/i.test(e.message)) throw new AiError("Das API-Guthaben ist aufgebraucht.");
      // Die API-Meldung enthält keine Geheimnisse und hilft bei der Fehlersuche
      throw new AiError(`Die Anfrage wurde abgelehnt: ${e.message.slice(0, 300)}`);
    }
    if (e instanceof Anthropic.APIConnectionTimeoutError) throw new AiError("Die KI hat zu lange gebraucht. Bitte erneut versuchen.");
    if (e instanceof Anthropic.APIError) {
      console.error("Claude-Fehler", e.status, e.message);
      throw new AiError("Die KI ist gerade nicht erreichbar. Bitte später erneut versuchen.");
    }
    throw e;
  }

  if (response.stop_reason === "refusal") throw new AiError("Die KI hat die Anfrage abgelehnt.");
  if (response.stop_reason === "max_tokens") throw new AiError("Die Antwort war zu lang. Bitte erneut versuchen.");
  if (!response.parsed_output) throw new AiError("Die Antwort der KI war unvollständig. Bitte erneut versuchen.");

  return {
    data: response.parsed_output,
    model: response.model,
    inputTokens: response.usage.input_tokens + (response.usage.cache_read_input_tokens ?? 0) + (response.usage.cache_creation_input_tokens ?? 0),
    outputTokens: response.usage.output_tokens,
  };
}
