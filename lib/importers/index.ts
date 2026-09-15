import { estimateRisk } from "@/lib/r-multiple";
import { wallTimeToIso } from "@/lib/time";
import { parseCsv, type Rows } from "./cells";
import { parseMetaTrader } from "./metatrader";
import { looksLikeTradingView, parseTradingView } from "./tradingview";
import { ImportError, type ParseResult, type ParsedTrade, type TradeImportRow } from "./types";
import { readXlsxRows } from "./xlsx";

export * from "./types";

export const ACCEPTED_EXTENSIONS = [".csv", ".xlsx", ".html", ".htm"];

function decodeText(bytes: Uint8Array): string {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(bytes.subarray(2));
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder("utf-16be").decode(bytes.subarray(2));
  return new TextDecoder("utf-8").decode(bytes);
}

/** HTML-Tabellen als Zeilen; versteckte Zellen (MT5-Bericht) werden ausgelassen. Nur im Browser. */
function readHtmlRows(html: string): Rows {
  if (typeof DOMParser === "undefined") throw new ImportError("HTML-Berichte können nur im Browser gelesen werden.");
  const doc = new DOMParser().parseFromString(html, "text/html");
  return [...doc.querySelectorAll("tr")].map((tr) =>
    [...tr.querySelectorAll("td, th")]
      .filter((cell) => !cell.classList.contains("hidden"))
      .map((cell) => cell.textContent ?? ""),
  );
}

/** Erkennt das Dateiformat und liest die Trades. */
export function parseImportFile(fileName: string, bytes: Uint8Array): ParseResult {
  const ext = fileName.toLowerCase().match(/\.[a-z]+$/)?.[0] ?? "";

  if (ext === ".xlsx") return parseMetaTrader(readXlsxRows(bytes));
  if (ext === ".html" || ext === ".htm") return parseMetaTrader(readHtmlRows(decodeText(bytes)));

  if (ext === ".csv") {
    const rows = parseCsv(decodeText(bytes));
    if (looksLikeTradingView(rows)) return parseTradingView(rows);
    throw new ImportError(
      "Diese CSV-Datei wurde nicht erkannt. Unterstützt wird der Handelsverlauf aus TradingView. Für MetaTrader bitte den Bericht als XLSX oder HTML exportieren.",
    );
  }

  throw new ImportError(`Dateityp „${ext || fileName}“ wird nicht unterstützt. Erlaubt: ${ACCEPTED_EXTENSIONS.join(", ")}`);
}

/** Wandelt gelesene Trades mit der gewählten Zeitzone in das Import-Format um. */
export function toImportRows(trades: ParsedTrade[], timeZone: string): TradeImportRow[] {
  return trades.map((t) => ({
    external_id: t.externalId,
    symbol: t.symbol,
    direction: t.direction,
    entry_time: wallTimeToIso(t.entryWall, timeZone),
    exit_time: t.exitWall ? wallTimeToIso(t.exitWall, timeZone) : null,
    entry_price: t.entryPrice,
    exit_price: t.exitPrice,
    quantity: t.quantity,
    stop_loss: t.stopLoss,
    take_profit: t.takeProfit,
    pnl: t.pnl,
    commission: t.commission,
    swap: t.swap,
    risk_amount: estimateRisk({
      direction: t.direction,
      entry_price: t.entryPrice,
      exit_price: t.exitPrice,
      stop_loss: t.stopLoss,
      pnl: t.pnl,
    }),
  }));
}

export const netOf = (t: Pick<ParsedTrade, "pnl" | "commission" | "swap">) =>
  Math.round(((t.pnl ?? 0) + t.commission + t.swap) * 100) / 100;
