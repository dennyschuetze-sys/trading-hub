export type NewsSource = { id: string; name: string; url: string; topic: string };

export const NEWS_SOURCES: NewsSource[] = [
  { id: "fxstreet", name: "FXStreet", url: "https://www.fxstreet.com/rss/news", topic: "Forex & Gold" },
  { id: "investinglive", name: "investingLive", url: "https://investinglive.com/feed/news", topic: "Schnelle Marktmeldungen" },
  { id: "investing_fx", name: "Investing.com", url: "https://www.investing.com/rss/news_1.rss", topic: "Forex-News" },
  { id: "investing_commodities", name: "Investing.com Rohstoffe", url: "https://www.investing.com/rss/news_11.rss", topic: "Gold, Öl & Rohstoffe" },
];

export type NewsItem = {
  id: string;
  source: string;
  title: string;
  link: string;
  /** ISO-Zeitpunkt */
  published: string | null;
  summary: string;
  image: string | null;
};

const NAMED: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", hellip: "…", ndash: "–", mdash: "—" };

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code: string) => {
    if (code[0] === "#") {
      const n = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : match;
    }
    return NAMED[code.toLowerCase()] ?? match;
  });
}

/** HTML → reiner Text (Tags entfernen, Entities auflösen, Leerraum zusammenfassen). */
export function toPlainText(html: string): string {
  return decodeEntities(
    html
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<br\s*\/?>|<\/(p|li|div)>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
}

/** Nur http(s)-Links zulassen – verhindert javascript:-URLs aus fremden Feeds. */
export function safeUrl(raw: string | undefined | null): string | null {
  if (!raw) return null;
  try {
    const url = new URL(decodeEntities(raw.trim()));
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function tag(xml: string, name: string): string | undefined {
  const m = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i"));
  return m?.[1];
}

function parseDate(raw: string | undefined): string | null {
  if (!raw) return null;
  const text = toPlainText(raw);
  // Investing.com: „2026-09-14 12:13:47“ ohne Zeitzone → UTC
  const iso = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(text) ? `${text.replace(" ", "T")}Z` : text;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** RSS 2.0 → Meldungen. Robust gegen fehlende Felder; unbrauchbare Einträge fallen weg. */
export function parseRss(xml: string, source: string, limit = 40): NewsItem[] {
  const items: NewsItem[] = [];
  for (const m of xml.matchAll(/<item[\s>][\s\S]*?<\/item>/gi)) {
    const raw = m[0];
    const title = toPlainText(tag(raw, "title") ?? "").slice(0, 300);
    const link = safeUrl(toPlainText(tag(raw, "link") ?? "")) ?? safeUrl(toPlainText(tag(raw, "guid") ?? ""));
    if (!title || !link) continue;

    const summary = toPlainText(tag(raw, "description") ?? "");
    const image =
      safeUrl(raw.match(/<enclosure[^>]*url="([^"]+)"[^>]*type="image/i)?.[1]) ??
      safeUrl(raw.match(/<media:(?:content|thumbnail)[^>]*url="([^"]+)"/i)?.[1]);

    items.push({
      id: `${source}:${link}`,
      source,
      title,
      link,
      published: parseDate(tag(raw, "pubDate") ?? tag(raw, "dc:date")),
      summary: summary.length > 280 ? `${summary.slice(0, 280).trimEnd()} …` : summary,
      image,
    });
    if (items.length >= limit) break;
  }
  return items;
}

/** Mehrere Quellen zusammenführen: Duplikate (gleicher Link) entfernen, neueste zuerst. */
export function mergeNews(lists: NewsItem[][]): NewsItem[] {
  const seen = new Set<string>();
  return lists
    .flat()
    .filter((n) => (seen.has(n.link) ? false : (seen.add(n.link), true)))
    .sort((a, b) => (b.published ?? "").localeCompare(a.published ?? ""));
}
