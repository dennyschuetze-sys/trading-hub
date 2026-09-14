import { TIME_ZONE } from "@/lib/trading";

export type Impact = "high" | "medium" | "low" | "holiday";

export type CalendarEvent = {
  id: string;
  title: string;
  currency: string;
  /** ISO-Zeitpunkt (UTC) */
  time: string;
  impact: Impact;
  forecast: string;
  previous: string;
};

export const IMPACTS: { value: Impact; label: string; rank: number }[] = [
  { value: "high", label: "Hoch", rank: 3 },
  { value: "medium", label: "Mittel", rank: 2 },
  { value: "low", label: "Niedrig", rank: 1 },
  { value: "holiday", label: "Feiertag", rank: 0 },
];

export const CALENDAR_CURRENCIES = ["USD", "EUR", "GBP", "JPY", "CHF", "CAD", "AUD", "NZD", "CNY"];

const impactRank = (i: Impact) => IMPACTS.find((x) => x.value === i)!.rank;

function normalizeImpact(raw: unknown): Impact {
  const v = String(raw ?? "").toLowerCase();
  if (v.startsWith("high")) return "high";
  if (v.startsWith("med")) return "medium";
  if (v.startsWith("holiday")) return "holiday";
  return "low";
}

/** Einfacher, stabiler Hash für IDs (kein Sicherheitszweck). */
function hash(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/** ForexFactory-Wochenfeed (nfs.faireconomy.media) → Termine. Ungültige Einträge werden übersprungen. */
export function parseForexFactory(json: unknown): CalendarEvent[] {
  if (!Array.isArray(json)) return [];
  return json
    .flatMap((e): CalendarEvent[] => {
      if (!e || typeof e !== "object") return [];
      const raw = e as Record<string, unknown>;
      const date = new Date(String(raw.date ?? ""));
      const title = String(raw.title ?? "").trim().slice(0, 200);
      if (!title || Number.isNaN(date.getTime())) return [];
      const currency = String(raw.country ?? "").trim().toUpperCase().slice(0, 5);
      const time = date.toISOString();
      return [
        {
          id: hash(`${title}|${currency}|${time}`),
          title,
          currency,
          time,
          impact: normalizeImpact(raw.impact),
          forecast: String(raw.forecast ?? "").slice(0, 30),
          previous: String(raw.previous ?? "").slice(0, 30),
        },
      ];
    })
    .sort((a, b) => a.time.localeCompare(b.time));
}

/** Filter nach Währungen (leer = alle; „ALL“-Termine wie Gipfel immer) und Mindest-Impact. Feiertage bleiben sichtbar. */
export function filterEvents(events: CalendarEvent[], currencies: string[], minImpact: Exclude<Impact, "holiday">) {
  const wanted = new Set(currencies.map((c) => c.toUpperCase()));
  const min = impactRank(minImpact);
  return events.filter(
    (e) =>
      (wanted.size === 0 || wanted.has(e.currency) || e.currency === "ALL") &&
      (e.impact === "holiday" || impactRank(e.impact) >= min),
  );
}

const dayFormatter = new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE });

export function berlinDay(iso: string) {
  return dayFormatter.format(new Date(iso));
}

export function groupByDay(events: CalendarEvent[]): { date: string; events: CalendarEvent[] }[] {
  const groups = new Map<string, CalendarEvent[]>();
  events.forEach((e) => {
    const d = berlinDay(e.time);
    groups.set(d, [...(groups.get(d) ?? []), e]);
  });
  return [...groups.entries()].map(([date, list]) => ({ date, events: list }));
}

/** Nächster anstehender Termin ab `now` (optional nur ab einem Impact). */
export function nextEvent(events: CalendarEvent[], now = new Date(), minImpact: Impact = "high") {
  const t = now.toISOString();
  return events.find((e) => e.time >= t && e.impact !== "holiday" && impactRank(e.impact) >= impactRank(minImpact)) ?? null;
}

/** „in 25 Min.“, „in 3 Std.“, „vor 10 Min.“ */
export function relativeTime(iso: string, now = new Date()): string {
  const minutes = Math.round((new Date(iso).getTime() - now.getTime()) / 60000);
  const abs = Math.abs(minutes);
  const text = abs < 60 ? `${abs} Min.` : abs < 48 * 60 ? `${Math.round(abs / 60)} Std.` : `${Math.round(abs / 1440)} Tagen`;
  if (abs === 0) return "jetzt";
  return minutes > 0 ? `in ${text}` : `vor ${text}`;
}

/** Welche Kalender-Währungen betreffen ein gehandeltes Symbol? */
export function currenciesForSymbol(symbol: string): string[] {
  const s = symbol.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const futuresUsd = /^(M?NQ|M?ES|M?YM|M?RTY|M?GC|MGC|SI|SIL|CL|MCL|NG|ZB|ZN|HG|6[EBJAC]|US30|US100|US500|NAS100|SPX500|SP500|USTEC|DJ30)/;
  if (futuresUsd.test(s)) return ["USD"];
  if (/^(GER|DE|DAX|EU50|STOXX|FRA40)/.test(s)) return ["EUR"];
  if (/^(UK100|FTSE)/.test(s)) return ["GBP"];
  if (/^(JP225|JPN225|NIK)/.test(s)) return ["JPY"];
  const found = CALENDAR_CURRENCIES.filter((c) => s.includes(c));
  // XAUUSD, XAGUSD → USD
  return found.length ? found : [];
}
