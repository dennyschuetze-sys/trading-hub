"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { AiError, generateStructured } from "@/lib/ai/claude";
import { NEWS_SYSTEM, buildNewsPrompt } from "@/lib/ai/prompts";
import { MAX_GENERATIONS, loadReport, saveReport } from "@/lib/ai/reports";
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
  const { generations } = await loadReport(supabase, "news_daily", today, NewsBriefingSchema);
  if (generations >= MAX_GENERATIONS) return { error: `Heute wurde das Briefing schon ${MAX_GENERATIONS}-mal erstellt.` };

  const settings = await getNewsSettings(supabase);
  const [calendar, news, { data: symbols }] = await Promise.all([
    getCalendar(),
    getNews(settings.newsSources),
    supabase.from("trades").select("symbol").eq("is_backtest", false).order("entry_time", { ascending: false }).limit(500),
  ]);
  if (!news.items.length && !calendar.events.length) return { error: "Gerade sind weder News noch Termine abrufbar." };

  try {
    const result = await generateStructured({
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
    await saveReport(supabase, auth.user.id, "news_daily", today, result, generations);
  } catch (e) {
    if (e instanceof AiError) return { error: e.message };
    console.error("KI-Briefing fehlgeschlagen", e);
    return { error: "Das Briefing konnte nicht erstellt werden." };
  }

  revalidatePath("/news");
  revalidatePath("/dashboard");
  return {};
}
