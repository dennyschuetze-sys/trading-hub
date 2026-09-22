/**
 * COT-Daten der CFTC (Commitments of Traders, Legacy Futures Only).
 *
 * Reine Logik ohne Netzwerk- oder Datenbankzugriff – das Holen erledigt `lib/cot-sync.ts`,
 * das Lesen `lib/cot-queries.ts`.
 *
 * Gelesen wird die Positionierung der Non-Commercials („große Spekulanten“): ihre
 * Netto-Position und, wichtiger, wie extrem diese im historischen Vergleich steht.
 * Das ist ein Kontext-Indikator mit drei Tagen Verzug – keine Prognose.
 */

export type CotGroup = "Forex" | "Metalle" | "Indizes" | "Energie" | "Krypto";

export type CotMarket = {
  /** CFTC-Kontraktcode, z. B. „099741“ */
  code: string;
  name: string;
  /** Symbole im Hub, die dieser Markt abdeckt (CFD-Schreibweise zuerst) */
  symbols: string[];
  group: CotGroup;
  /**
   * Der Future notiert gegen den Dollar, das Hub-Symbol andersherum (Yen-Future ↔ USDJPY).
   * Netto-Long im Future heißt dann fallendes Hub-Symbol – alle Zahlen werden gespiegelt.
   */
  invert?: boolean;
};

/** Kuratierte Märkte: nur Kontrakte, zu denen es ein Instrument in `lib/position-size.ts` gibt. */
export const COT_MARKETS: CotMarket[] = [
  { code: "099741", name: "Euro FX", symbols: ["EURUSD", "6E", "M6E"], group: "Forex" },
  { code: "096742", name: "Britisches Pfund", symbols: ["GBPUSD", "6B"], group: "Forex" },
  { code: "097741", name: "Japanischer Yen", symbols: ["USDJPY"], group: "Forex", invert: true },
  { code: "092741", name: "Schweizer Franken", symbols: ["USDCHF"], group: "Forex", invert: true },
  { code: "090741", name: "Kanadischer Dollar", symbols: ["USDCAD"], group: "Forex", invert: true },
  { code: "232741", name: "Australischer Dollar", symbols: ["AUDUSD"], group: "Forex" },
  { code: "112741", name: "Neuseeland-Dollar", symbols: ["NZDUSD"], group: "Forex" },
  { code: "098662", name: "US-Dollar-Index", symbols: ["DXY"], group: "Forex" },
  { code: "088691", name: "Gold", symbols: ["XAUUSD", "GC", "MGC"], group: "Metalle" },
  { code: "084691", name: "Silber", symbols: ["XAGUSD", "SI", "SIL"], group: "Metalle" },
  { code: "067651", name: "WTI-Rohöl", symbols: ["USOIL", "CL", "MCL"], group: "Energie" },
  { code: "06765T", name: "Brent-Rohöl", symbols: ["UKOIL"], group: "Energie" },
  { code: "023651", name: "Erdgas", symbols: ["NG"], group: "Energie" },
  { code: "13874A", name: "E-mini S&P 500", symbols: ["US500", "ES", "MES"], group: "Indizes" },
  { code: "209742", name: "E-mini Nasdaq 100", symbols: ["US100", "NQ", "MNQ"], group: "Indizes" },
  { code: "124603", name: "E-mini Dow Jones", symbols: ["US30", "YM", "MYM"], group: "Indizes" },
  { code: "239742", name: "E-mini Russell 2000", symbols: ["RTY", "M2K"], group: "Indizes" },
  { code: "133741", name: "Bitcoin", symbols: ["BTCUSD"], group: "Krypto" },
  { code: "146021", name: "Ether", symbols: ["ETHUSD"], group: "Krypto" },
];

export const COT_GROUPS: CotGroup[] = ["Forex", "Metalle", "Indizes", "Energie", "Krypto"];

const BY_CODE = new Map(COT_MARKETS.map((m) => [m.code, m]));

export const cotMarket = (code: string): CotMarket | null => BY_CODE.get(code) ?? null;

/** Findet den COT-Markt zu einem Hub-Symbol – für die Hervorhebung eigener Märkte. */
export const cotMarketForSymbol = (symbol: string): CotMarket | null =>
  COT_MARKETS.find((m) => m.symbols.includes(symbol.toUpperCase())) ?? null;

export type CotRow = {
  contractCode: string;
  /** Stichtag des Reports (Dienstag), als YYYY-MM-DD */
  reportDate: string;
  marketName: string;
  openInterest: number;
  noncommLong: number;
  noncommShort: number;
  commLong: number;
  commShort: number;
  nonreptLong: number;
  nonreptShort: number;
};

/** Die Socrata-API liefert alle Zahlen als Zeichenkette. */
function num(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || !value.trim()) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Wandelt die Antwort der CFTC-API in Zeilen um. Unbekannte Märkte und unvollständige Zeilen fallen weg. */
export function parseCotRows(json: unknown): CotRow[] {
  if (!Array.isArray(json)) return [];
  const rows: CotRow[] = [];

  for (const raw of json) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;

    const code = typeof r.cftc_contract_market_code === "string" ? r.cftc_contract_market_code.trim() : "";
    if (!BY_CODE.has(code)) continue;

    const date = typeof r.report_date_as_yyyy_mm_dd === "string" ? r.report_date_as_yyyy_mm_dd.slice(0, 10) : "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;

    const values = [
      num(r.open_interest_all),
      num(r.noncomm_positions_long_all),
      num(r.noncomm_positions_short_all),
      num(r.comm_positions_long_all),
      num(r.comm_positions_short_all),
      num(r.nonrept_positions_long_all),
      num(r.nonrept_positions_short_all),
    ];
    if (values.some((v) => v === null)) continue;
    const [oi, ncLong, ncShort, cLong, cShort, nrLong, nrShort] = values as number[];

    rows.push({
      contractCode: code,
      reportDate: date,
      marketName: typeof r.market_and_exchange_names === "string" ? r.market_and_exchange_names.slice(0, 120) : code,
      openInterest: oi,
      noncommLong: ncLong,
      noncommShort: ncShort,
      commLong: cLong,
      commShort: cShort,
      nonreptLong: nrLong,
      nonreptShort: nrShort,
    });
  }

  return rows;
}

export type CotWeek = {
  date: string;
  /** Netto-Position der Non-Commercials, bei `invert`-Märkten bereits gespiegelt */
  net: number;
  /** Netto-Position als Anteil am Open Interest (−1 … 1) */
  netPct: number;
  /** Veränderung gegenüber der Vorwoche; in der ersten Woche 0 */
  change: number;
  openInterest: number;
  long: number;
  short: number;
};

export type BiasKey = "stark_bullisch" | "bullisch" | "neutral" | "baerisch" | "stark_baerisch";

export type Bias = { key: BiasKey; label: string; tone: "profit" | "loss" | null };

const BIAS: Record<BiasKey, Bias> = {
  stark_bullisch: { key: "stark_bullisch", label: "stark bullisch", tone: "profit" },
  bullisch: { key: "bullisch", label: "bullisch", tone: "profit" },
  neutral: { key: "neutral", label: "neutral", tone: null },
  baerisch: { key: "baerisch", label: "bärisch", tone: "loss" },
  stark_baerisch: { key: "stark_baerisch", label: "stark bärisch", tone: "loss" },
};

/** So viele Wochen müssen mindestens vorliegen, damit der COT-Index etwas aussagt. */
export const MIN_WEEKS = 26;

/**
 * COT-Index nach Larry Williams: wo steht die aktuelle Netto-Position zwischen dem
 * tiefsten und dem höchsten Wert des Rückblickfensters? 0 = Extrem short, 100 = Extrem long.
 */
export function cotIndex(nets: number[], lookbackWeeks: number): number | null {
  const window = nets.slice(-lookbackWeeks);
  if (window.length < MIN_WEEKS) return null;
  const min = Math.min(...window);
  const max = Math.max(...window);
  if (max === min) return null;
  return ((window[window.length - 1] - min) / (max - min)) * 100;
}

/** Ohne Index bleibt nur das Vorzeichen der Netto-Position – das reicht für bullisch/bärisch, nicht für „stark“. */
export function classifyBias(index: number | null, net: number): Bias {
  if (index === null) {
    if (net > 0) return BIAS.bullisch;
    if (net < 0) return BIAS.baerisch;
    return BIAS.neutral;
  }
  if (index >= 80) return BIAS.stark_bullisch;
  if (index >= 60) return BIAS.bullisch;
  if (index <= 20) return BIAS.stark_baerisch;
  if (index <= 40) return BIAS.baerisch;
  return BIAS.neutral;
}

/** COT-Index unter 10 oder über 90: Positionierung am Rand ihrer eigenen Historie. */
export const isExtreme = (index: number | null) => index !== null && (index >= 90 || index <= 10);

export type CotSeries = {
  market: CotMarket;
  weeks: CotWeek[];
  latest: CotWeek;
  index: number | null;
  bias: Bias;
};

/**
 * Gruppiert die Zeilen nach Markt, rechnet Netto-Positionen und Wochenveränderung aus
 * und hängt COT-Index und Bias an. Märkte mit `invert` werden dabei gespiegelt, damit
 * alle Zahlen aus Sicht des Hub-Symbols gelesen werden können.
 */
export function buildSeries(rows: CotRow[], lookbackWeeks: number): CotSeries[] {
  const byCode = new Map<string, CotRow[]>();
  for (const row of rows) {
    const list = byCode.get(row.contractCode);
    if (list) list.push(row);
    else byCode.set(row.contractCode, [row]);
  }

  const series: CotSeries[] = [];

  for (const market of COT_MARKETS) {
    const list = byCode.get(market.code);
    if (!list?.length) continue;

    const sign = market.invert ? -1 : 1;
    const sorted = [...list].sort((a, b) => a.reportDate.localeCompare(b.reportDate));
    const nets = sorted.map((row) => (row.noncommLong - row.noncommShort) * sign);

    const weeks: CotWeek[] = sorted.map((row, i) => ({
      date: row.reportDate,
      net: nets[i],
      netPct: row.openInterest > 0 ? nets[i] / row.openInterest : 0,
      change: i === 0 ? 0 : nets[i] - nets[i - 1],
      openInterest: row.openInterest,
      long: sign > 0 ? row.noncommLong : row.noncommShort,
      short: sign > 0 ? row.noncommShort : row.noncommLong,
    }));

    const latest = weeks[weeks.length - 1];
    const index = cotIndex(nets, lookbackWeeks);
    series.push({ market, weeks, latest, index, bias: classifyBias(index, latest.net) });
  }

  return series;
}

/** Der Report hat den Stichtag Dienstag und wird erst am Freitag darauf veröffentlicht. */
export function releaseDate(reportDate: string): string {
  const d = new Date(`${reportDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 3);
  return d.toISOString().slice(0, 10);
}

export const COT_DISCLAIMER =
  "Positionierung mit drei Tagen Verzug – ein Kontext-Indikator, keine Prognose und keine Handelsempfehlung.";
