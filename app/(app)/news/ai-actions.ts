"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { AiError, generateStructured } from "@/lib/ai/claude";
import { NEWS_SYSTEM, buildNewsPrompt } from "@/lib/ai/prompts";
import { MAX_GENERATIONS, claimGeneration, releaseGeneration, saveReport, usedGenerations } from "@/lib/ai/reports";
import { NewsBriefingSchema } from "@/lib/ai/schemas";
import { todayBerlin } from "@/lib/daily-plan";
import { getCalendar, getNews, getNewsSettings } from "@/lib/feeds";
import { createClient } from "@/lib/supabase/server";

/** Erstellt das KI-Briefing für heute (oder neu) und speichert es. */
export async function generateNewsBriefing(): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");

  const today = todayBerlin();
  const limitReached = `Heute wurde das Briefing schon ${MAX_GENERATIONS}-mal erstellt.`;
  // Frühe, freundliche Absage – verbindlich ist erst die Buchung weiter unten
  if ((await usedGenerations(supabase, "news_daily", today)) >= MAX_GENERATIONS) return { error: limitReached };

  const settings = await getNewsSettings(supabase);
  const [calendar, news, { data: symbols }] = await Promise.all([
    getCalendar(),
    getNews(settings.newsSources),
    supabase.from("trades").select("symbol").eq("is_backtest", false).order("entry_time", { ascending: false }).limit(500),
  ]);
  if (!news.items.length && !calendar.events.length) return { error: "Gerade sind weder News noch Termine abrufbar." };

  // Erst unmittelbar vor dem teuren Aufruf buchen, damit abgebrochene Versuche nichts kosten
  const claimed = await claimGeneration(supabase, "news_daily", today);
  if (claimed === null) return { error: limitReached };

  let result;
  try {
    result = await generateStructured({
      schema: NewsBriefingSchema,
      system: NEWS_SYSTEM,
      prompt: buildNewsPrompt({
        now: new Date(),
        news: news.items,
        events: calendar.events,
        currencies: settings.calendarCurrencies,
        symbols: [...new Set((symbols ?? []).map((s) => s.symbol))],
      }),
      effort: "medium",
    });
  } catch (e) {
    // Der Aufruf kam nicht durch – die Buchung zurückgeben
    await releaseGeneration(supabase, "news_daily", today);
    if (e instanceof AiError) return { error: e.message };
    console.error("KI-Briefing fehlgeschlagen", e);
    return { error: "Das Briefing konnte nicht erstellt werden." };
  }

  try {
    // Ab hier ist das Kontingent verbraucht, die Tokens sind geflossen
    await saveReport(supabase, auth.user.id, "news_daily", today, result, claimed);
  } catch (e) {
    console.error("KI-Briefing nicht gespeichert", e);
    return { error: "Das Briefing wurde erstellt, konnte aber nicht gespeichert werden." };
  }

  revalidatePath("/news");
  revalidatePath("/dashboard");
  return {};
}
