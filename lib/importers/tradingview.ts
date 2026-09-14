import { parseFlexibleWallTime, wallTimeKey, type WallTime } from "@/lib/time";
import { cellNumber, cellText, type Rows } from "./cells";
import { ImportError, type ParseResult, type ParsedTrade } from "./types";

/** Mögliche Spaltennamen (deutscher und englischer Export). */
const COLUMNS = {
  symbol: [/^symbol$/],
  tradeNo: [/^trade-?nummer$/, /^trade\s*#$/, /^trade number$/],
  type: [/^typ$/, /^type$/],
  time: [/^datum und uhrzeit$/, /^date\/time$/, /^date and time$/, /^datum\/uhrzeit$/],
  orderId: [/^order-?id$/],
  price: [/^preis/, /^price/],
  quantity: [/^größe \(menge\)$/, /^size \(qty\)$/, /^menge$/, /^quantity$/, /^contracts$/, /^qty$/],
  net: [/^netto g&v/, /^net p&l/, /^profit/],
  commission: [/^provision/, /^commission/],
  cumPnl: [/^kumulierter g&v (?!%)/, /^cumulative p&l (?!%)/],
  cumPct: [/^kumulierter g&v %$/, /^cumulative p&l %$/],
} satisfies Record<string, RegExp[]>;

type Column = keyof typeof COLUMNS;

export function looksLikeTradingView(rows: Rows): boolean {
  const header = rows[0]?.map((h) => cellText(h).toLowerCase()) ?? [];
  return (["tradeNo", "type", "time", "price"] as Column[]).every((c) =>
    header.some((h) => COLUMNS[c].some((re) => re.test(h))),
  );
}

/** „CME_MINI:NQ1!“ → „NQ“, „OANDA:XAUUSD“ → „XAUUSD“ */
export function cleanTradingViewSymbol(raw: string): string {
  return cellText(raw)
    .replace(/^[A-Z0-9_]+:/i, "")
    .replace(/\d!$/, "")
    .toUpperCase();
}

type Leg = { time: WallTime; price: number | null; quantity: number; orderId: string };

/**
 * TradingView-Handelsverlauf (Paper Trading / Strategie-Tester): zwei Zeilen je Trade,
 * „Long-Einstieg“ und „Long-Ausstieg“, verbunden über die Trade-Nummer.
 * „Netto G&V“ ist nach Provision, daher Brutto = Netto + Provision.
 */
export function parseTradingView(rows: Rows): ParseResult {
  if (!looksLikeTradingView(rows)) {
    throw new ImportError("Die CSV-Datei hat nicht das erwartete TradingView-Format.");
  }

  const header = rows[0].map((h) => cellText(h).toLowerCase());
  const col = (c: Column) => header.findIndex((h) => COLUMNS[c].some((re) => re.test(h)));
  const idx = Object.fromEntries((Object.keys(COLUMNS) as Column[]).map((c) => [c, col(c)])) as Record<Column, number>;

  const groups = new Map<
    string,
    { symbol: string; direction: "long" | "short"; entries: Leg[]; exits: Leg[]; net: number | null; commission: number | null }
  >();
  const warnings: string[] = [];

  for (const r of rows.slice(1)) {
    const type = cellText(r[idx.type]).toLowerCase();
    const tradeNo = cellText(r[idx.tradeNo]);
    const time = parseFlexibleWallTime(cellText(r[idx.time]));
    if (!tradeNo || !type) continue;
    if (!time) {
      warnings.push(`Trade ${tradeNo}: Datum „${cellText(r[idx.time])}“ nicht lesbar – übersprungen.`);
      continue;
    }

    const direction = type.includes("short") ? "short" : "long";
    const isEntry = /einstieg|entry/.test(type);
    const leg: Leg = {
      time,
      price: cellNumber(r[idx.price]),
      quantity: idx.quantity >= 0 ? (cellNumber(r[idx.quantity]) ?? 0) : 0,
      orderId: idx.orderId >= 0 ? cellText(r[idx.orderId]) : "",
    };

    const group = groups.get(tradeNo) ?? {
      symbol: cleanTradingViewSymbol(r[idx.symbol] ?? ""),
      direction,
      entries: [],
      exits: [],
      net: null,
      commission: null,
    };
    (isEntry ? group.entries : group.exits).push(leg);
    // G&V und Provision stehen in beiden Zeilen identisch
    group.net ??= idx.net >= 0 ? cellNumber(r[idx.net]) : null;
    group.commission ??= idx.commission >= 0 ? cellNumber(r[idx.commission]) : null;
    groups.set(tradeNo, group);
  }

  const trades: ParsedTrade[] = [];
  for (const [tradeNo, g] of groups) {
    if (!g.entries.length) continue;
    if (!g.exits.length) {
      warnings.push(`Trade ${tradeNo} (${g.symbol}) ist noch offen und wurde übersprungen.`);
      continue;
    }

    const quantity = sum(g.entries.map((l) => l.quantity));
    const entry = [...g.entries].sort((a, b) => wallTimeKey(a.time).localeCompare(wallTimeKey(b.time)))[0];
    const lastExit = [...g.exits].sort((a, b) => wallTimeKey(b.time).localeCompare(wallTimeKey(a.time)))[0];
    const commissionCost = Math.abs(g.commission ?? 0);

    trades.push({
      externalId: entry.orderId || `${g.symbol}-${wallTimeKey(entry.time)}-${tradeNo}`,
      symbol: g.symbol,
      direction: g.direction,
      entryWall: entry.time,
      exitWall: lastExit.time,
      entryPrice: weightedPrice(g.entries),
      exitPrice: weightedPrice(g.exits),
      quantity,
      stopLoss: null,
      takeProfit: null,
      pnl: g.net == null ? null : round2(g.net + commissionCost),
      commission: -commissionCost,
      swap: 0,
    });
  }

  if (!trades.length) throw new ImportError("In der CSV-Datei wurden keine abgeschlossenen Trades gefunden.");

  return {
    source: "tradingview",
    trades,
    meta: { startingBalance: estimateStartingBalance(rows.slice(1), idx) },
    warnings,
    defaultTimeZone: "Europe/Berlin",
  };
}

/**
 * Schätzt das Startkapital aus „Kumulierter G&V“ in Dollar und Prozent.
 * Die Zeile mit dem größten Betrag ist am genauesten (Prozent sind gerundet); Ergebnis auf 1.000 gerundet.
 */
function estimateStartingBalance(rows: Rows, idx: Record<Column, number>): number | undefined {
  if (idx.cumPnl < 0 || idx.cumPct < 0) return undefined;
  let best: { pnl: number; pct: number } | null = null;
  for (const r of rows) {
    const pnl = cellNumber(r[idx.cumPnl]);
    const pct = cellNumber(r[idx.cumPct]);
    if (pnl == null || pct == null || pct === 0) continue;
    if (!best || Math.abs(pnl) > Math.abs(best.pnl)) best = { pnl, pct };
  }
  if (!best) return undefined;
  const estimate = Math.round(best.pnl / (best.pct / 100) / 1000) * 1000;
  return estimate > 0 ? estimate : undefined;
}

const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);
const round2 = (n: number) => Math.round(n * 100) / 100;

function weightedPrice(legs: Leg[]): number | null {
  const priced = legs.filter((l) => l.price != null);
  if (!priced.length) return null;
  const qty = sum(priced.map((l) => l.quantity));
  if (qty === 0) return priced[0].price;
  return Math.round((sum(priced.map((l) => l.price! * l.quantity)) / qty) * 1e6) / 1e6;
}
