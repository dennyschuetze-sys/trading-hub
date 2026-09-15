import "server-only";
import { parseForexFactory, type CalendarEvent } from "@/lib/calendar";
import { mergeNews, NEWS_SOURCES, parseRss, type NewsItem } from "@/lib/news";
import type { FxRates } from "@/lib/position-size";
import type { createClient } from "@/lib/supabase/server";

const USER_AGENT = "TradingHub/1.0 (personal trading journal)";
const MAX_BYTES = 2_000_000;

async function fetchText(url: string, revalidate: number): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json, application/rss+xml, application/xml, text/xml" },
    next: { revalidate },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`${url} antwortete mit ${res.status}`);
  const text = await res.text();
  if (text.length > MAX_BYTES) throw new Error(`${url} ist zu groß`);
  return text;
}

export type CalendarResult = { events: CalendarEvent[]; error: string | null };

/**
 * Wirtschaftskalender der laufenden Woche. ForexFactory bittet um sparsame Abrufe –
 * deshalb höchstens einmal pro Stunde (Next.js-Datencache), für alle Seiten gemeinsam.
 */
export async function getCalendar(): Promise<CalendarResult> {
  try {
    const text = await fetchText("https://nfs.faireconomy.media/ff_calendar_thisweek.json", 3600);
    return { events: parseForexFactory(JSON.parse(text)), error: null };
  } catch (e) {
    console.error("Kalender-Abruf fehlgeschlagen", e);
    return { events: [], error: "Der Wirtschaftskalender ist gerade nicht erreichbar." };
  }
}

/** EZB-Referenzkurse (1 EUR = x), täglich aktualisiert – für den Positionsgrößen-Rechner. */
export async function getFxRates(): Promise<FxRates | null> {
  try {
    const json: unknown = JSON.parse(await fetchText("https://api.frankfurter.dev/v1/latest?base=EUR", 3600));
    const raw = json as { date?: unknown; rates?: Record<string, unknown> };
    if (typeof raw.date !== "string" || !raw.rates || typeof raw.rates !== "object") return null;
    const rates = Object.fromEntries(
      Object.entries(raw.rates).filter((e): e is [string, number] => /^[A-Z]{3}$/.test(e[0]) && typeof e[1] === "number" && e[1] > 0),
    );
    return { date: raw.date.slice(0, 10), rates };
  } catch (e) {
    console.error("Wechselkurse nicht verfügbar", e);
    return null;
  }
}

export type NewsResult = { items: NewsItem[]; failed: string[] };

/** News aller gewählten Quellen (je Quelle höchstens alle 10 Minuten abgerufen). */
export async function getNews(sourceIds: string[]): Promise<NewsResult> {
  const sources = NEWS_SOURCES.filter((s) => sourceIds.includes(s.id));
  const results = await Promise.allSettled(sources.map(async (s) => parseRss(await fetchText(s.url, 600), s.id)));
  const failed: string[] = [];
  const lists = results.flatMap((r, i) => {
    if (r.status === "fulfilled") return [r.value];
    console.error(`News-Abruf ${sources[i].id} fehlgeschlagen`, r.reason);
    failed.push(sources[i].name);
    return [];
  });
  return { items: mergeNews(lists), failed };
}

export type NewsSettings = { calendarCurrencies: string[]; minImpact: "low" | "medium" | "high"; newsSources: string[] };

export const DEFAULT_SETTINGS: NewsSettings = {
  calendarCurrencies: ["USD", "EUR"],
  minImpact: "medium",
  newsSources: NEWS_SOURCES.filter((s) => s.defaultOn !== false).map((s) => s.id),
};

type Supabase = Awaited<ReturnType<typeof createClient>>;

export async function getNewsSettings(supabase: Supabase): Promise<NewsSettings> {
  const { data } = await supabase.from("user_settings").select("calendar_currencies, calendar_min_impact, news_sources").maybeSingle();
  if (!data) return DEFAULT_SETTINGS;
  return {
    calendarCurrencies: data.calendar_currencies,
    minImpact: (["low", "medium", "high"].includes(data.calendar_min_impact) ? data.calendar_min_impact : "medium") as NewsSettings["minImpact"],
    newsSources: data.news_sources,
  };
}
