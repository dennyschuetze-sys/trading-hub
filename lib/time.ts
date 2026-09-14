/** Zeitzonen-Helfer ohne externe Bibliothek (Intl reicht für Umrechnungen mit Sommerzeit). */

export type WallTime = {
  year: number;
  month: number; // 1–12
  day: number;
  hour: number;
  minute: number;
  second: number;
};

/**
 * Pseudo-Zeitzone für MetaTrader-Server: Die meisten Forex-Broker (u. a. FTMO) laufen auf
 * New-York-Zeit + 7 Stunden, also UTC+2 im Winter und UTC+3 während der US-Sommerzeit.
 */
export const BROKER_TIME_ZONE = "broker";

/** Offset (ms) einer IANA-Zeitzone zu einem Zeitpunkt: Ortszeit − UTC. */
function zoneOffsetMs(utcMs: number, timeZone: string): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
    })
      .formatToParts(new Date(utcMs))
      .filter((p) => p.type !== "literal")
      .map((p) => [p.type, Number(p.value)]),
  );
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return asUtc - Math.floor(utcMs / 1000) * 1000;
}

/** Wandelt eine Ortszeit („Wanduhrzeit“) in einer Zeitzone in einen ISO-Zeitpunkt (UTC) um. */
export function wallTimeToIso(wall: WallTime, timeZone: string, milliseconds = 0): string {
  if (timeZone === BROKER_TIME_ZONE) {
    const shifted = new Date(
      Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour - 7, wall.minute, wall.second),
    );
    return wallTimeToIso(
      {
        year: shifted.getUTCFullYear(),
        month: shifted.getUTCMonth() + 1,
        day: shifted.getUTCDate(),
        hour: shifted.getUTCHours(),
        minute: shifted.getUTCMinutes(),
        second: shifted.getUTCSeconds(),
      },
      "America/New_York",
      milliseconds,
    );
  }

  const naive = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second, milliseconds);
  let utc = naive - zoneOffsetMs(naive, timeZone);
  // Zweiter Durchlauf korrigiert Fälle rund um die Zeitumstellung
  const offset = zoneOffsetMs(utc, timeZone);
  utc = naive - offset;
  return new Date(utc).toISOString();
}

/** Liest „2026.07.15 17:31:21“, „2026-07-15 17:31“ oder „2026-07-15T17:31:21“. */
export function parseIsoLikeWallTime(raw: string): WallTime | null {
  const m = raw.trim().match(/^(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return null;
  return {
    year: Number(m[1]),
    month: Number(m[2]),
    day: Number(m[3]),
    hour: Number(m[4]),
    minute: Number(m[5]),
    second: Number(m[6] ?? 0),
  };
}

const MONTHS: [RegExp, number][] = [
  [/^jan/, 1],
  [/^feb/, 2],
  [/^(mär|mae|mar|mrz)/, 3],
  [/^apr/, 4],
  [/^(mai|may)/, 5],
  [/^jun/, 6],
  [/^jul/, 7],
  [/^aug/, 8],
  [/^sep/, 9],
  [/^(okt|oct)/, 10],
  [/^nov/, 11],
  [/^(dez|dec)/, 12],
];

function monthFromName(name: string): number | null {
  const lower = name.toLowerCase();
  return MONTHS.find(([re]) => re.test(lower))?.[1] ?? null;
}

/**
 * Liest Datumsangaben, wie TradingView sie exportiert:
 * „31. März 2026, 10:23“, „Mar 31, 2026, 10:23“, „2026-03-31 10:23“.
 */
export function parseFlexibleWallTime(raw: string): WallTime | null {
  const iso = parseIsoLikeWallTime(raw);
  if (iso) return iso;

  const s = raw.trim();
  const time = s.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?\s*$/);
  if (!time) return null;
  const hms = { hour: Number(time[1]), minute: Number(time[2]), second: Number(time[3] ?? 0) };

  const german = s.match(/^(\d{1,2})\.\s*([A-Za-zÄÖÜäöü]+)\.?\s+(\d{4})/);
  if (german) {
    const month = monthFromName(german[2]);
    if (month) return { year: Number(german[3]), month, day: Number(german[1]), ...hms };
  }

  const english = s.match(/^([A-Za-z]+)\.?\s+(\d{1,2}),?\s+(\d{4})/);
  if (english) {
    const month = monthFromName(english[1]);
    if (month) return { year: Number(english[3]), month, day: Number(english[2]), ...hms };
  }

  const numericGerman = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (numericGerman) {
    return { year: Number(numericGerman[3]), month: Number(numericGerman[2]), day: Number(numericGerman[1]), ...hms };
  }

  return null;
}

export function wallTimeKey(w: WallTime): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${w.year}-${p(w.month)}-${p(w.day)}T${p(w.hour)}:${p(w.minute)}:${p(w.second)}`;
}
