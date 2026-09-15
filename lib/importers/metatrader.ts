import { BROKER_TIME_ZONE, parseIsoLikeWallTime } from "@/lib/time";
import { cellNumber, cellText, findLabeledValue, type Rows } from "./cells";
import { ImportError, type ImportMeta, type ParseResult, type ParsedTrade } from "./types";

const SIDES: Record<string, "long" | "short"> = { buy: "long", sell: "short" };

const isDate = (v: string | undefined) => parseIsoLikeWallTime(cellText(v)) != null;
const isInteger = (v: string | undefined) => /^\d+$/.test(cellText(v));
const isPlainNumber = (v: string | undefined) => cellNumber(v) != null;

/**
 * MetaTrader 5 „Bericht der Kontohistorie“ (XLSX oder HTML), Abschnitt „Positionen“.
 * Eine Zeile je Position: Zeit | Position | Symbol | Typ | Volumen | Preis | S/L | T/P |
 * Zeit | Preis | Kommission | Swap | Gewinn. Teilschließungen sind bereits zusammengefasst.
 * Erkannt wird über die Form der Zeile, nicht über Überschriften – das funktioniert in jeder Sprache.
 */
function parseMt5Positions(rows: Rows): ParsedTrade[] {
  const initialStops = parseMt5OrderStops(rows);
  const trades: ParsedTrade[] = [];
  for (const r of rows) {
    const side = SIDES[cellText(r[3]).toLowerCase()];
    if (
      !side ||
      !isDate(r[0]) ||
      !isInteger(r[1]) ||
      !isPlainNumber(r[4]) || // Orders-Zeilen haben „0.09 / 0.09“
      !isDate(r[8]) ||
      !isPlainNumber(r[9])
    ) {
      continue;
    }
    trades.push({
      externalId: cellText(r[1]),
      symbol: cellText(r[2]).toUpperCase(),
      direction: side,
      entryWall: parseIsoLikeWallTime(cellText(r[0]))!,
      exitWall: parseIsoLikeWallTime(cellText(r[8])),
      quantity: cellNumber(r[4])!,
      entryPrice: cellNumber(r[5]),
      // In „Positionen“ steht der zuletzt nachgezogene SL – für das Risiko zählt der ursprüngliche
      stopLoss: initialStops.get(cellText(r[1])) ?? nonZero(cellNumber(r[6])),
      takeProfit: nonZero(cellNumber(r[7])),
      exitPrice: cellNumber(r[9]),
      commission: cellNumber(r[10]) ?? 0,
      swap: cellNumber(r[11]) ?? 0,
      pnl: cellNumber(r[12]),
    });
  }
  return trades;
}

/**
 * Abschnitt „Orders“: Eröffnungszeit | Auftrag | Symbol | Typ | Volumen („0.09 / 0.09“) | Preis | S/L | T/P | …
 * Die Auftragsnummer der Eröffnungsorder ist in MT5 zugleich die Positionsnummer.
 * Liefert je Position den SL, mit dem die Order platziert wurde.
 */
function parseMt5OrderStops(rows: Rows): Map<string, number> {
  const stops = new Map<string, number>();
  for (const r of rows) {
    if (!SIDES[cellText(r[3]).toLowerCase()] || !isDate(r[0]) || !isInteger(r[1]) || !/\S\s*\/\s*\S/.test(cellText(r[4]))) {
      continue;
    }
    const stop = nonZero(cellNumber(r[6]));
    // Nur die erste Order je Nummer (Eröffnung); Schließ-Orders haben eigene Nummern
    if (stop != null && !stops.has(cellText(r[1]))) stops.set(cellText(r[1]), stop);
  }
  return stops;
}

/**
 * MetaTrader 4 „Detailed Statement“ (HTML), Abschnitt „Closed Transactions“:
 * Ticket | Open Time | Type | Size | Item | Price | S/L | T/P | Close Time | Price |
 * Commission | Taxes | Swap | Profit
 */
function parseMt4Closed(rows: Rows): ParsedTrade[] {
  const trades: ParsedTrade[] = [];
  for (const r of rows) {
    const side = SIDES[cellText(r[2]).toLowerCase()];
    if (!side || !isInteger(r[0]) || !isDate(r[1]) || !isPlainNumber(r[3]) || !isDate(r[8]) || r.length < 14) {
      continue;
    }
    trades.push({
      externalId: cellText(r[0]),
      symbol: cellText(r[4]).toUpperCase(),
      direction: side,
      entryWall: parseIsoLikeWallTime(cellText(r[1]))!,
      exitWall: parseIsoLikeWallTime(cellText(r[8])),
      quantity: cellNumber(r[3])!,
      entryPrice: cellNumber(r[5]),
      stopLoss: nonZero(cellNumber(r[6])),
      takeProfit: nonZero(cellNumber(r[7])),
      exitPrice: cellNumber(r[9]),
      commission: (cellNumber(r[10]) ?? 0) + (cellNumber(r[11]) ?? 0),
      swap: cellNumber(r[12]) ?? 0,
      pnl: cellNumber(r[13]),
    });
  }
  return trades;
}

const nonZero = (n: number | null) => (n === 0 ? null : n);

function parseMeta(rows: Rows): ImportMeta {
  const meta: ImportMeta = {
    accountName: findLabeledValue(rows, ["Name:"]),
    company: findLabeledValue(rows, ["Firma:", "Company:", "Unternehmen:"]),
  };

  // „541360519 (EUR, FTMO-Server4, real, Hedge)“
  const account = findLabeledValue(rows, ["Konto:", "Account:"]);
  if (account) {
    meta.accountNumber = account.match(/^\s*(\d+)/)?.[1];
    meta.currency = account.match(/\(([A-Z]{3})\b/)?.[1];
  }

  // Erste Einzahlung („balance“) aus dem Abschnitt „Trades“/„Deals“ als Startkapital
  for (const r of rows) {
    const typeIdx = r.findIndex((c) => cellText(c).toLowerCase() === "balance");
    if (typeIdx === -1 || !isDate(r[0])) continue;
    const amount = r.slice(typeIdx + 1).map(cellNumber).find((n) => n != null && n > 0);
    if (amount) {
      meta.startingBalance = amount;
      break;
    }
  }
  return meta;
}

export function parseMetaTrader(rows: Rows): ParseResult {
  const mt5 = parseMt5Positions(rows);
  const trades = mt5.length ? mt5 : parseMt4Closed(rows);
  if (!trades.length) {
    throw new ImportError(
      "In der Datei wurden keine abgeschlossenen Trades gefunden. Bitte exportiere in MetaTrader den Bericht der Kontohistorie (Historie → Rechtsklick → Bericht).",
    );
  }

  const warnings: string[] = [];
  const unique = new Map(trades.map((t) => [t.externalId, t]));
  if (unique.size !== trades.length) warnings.push(`${trades.length - unique.size} doppelte Positionen wurden zusammengefasst.`);

  return {
    source: mt5.length ? "mt5" : "mt4",
    trades: [...unique.values()],
    meta: parseMeta(rows),
    warnings,
    defaultTimeZone: BROKER_TIME_ZONE,
  };
}
