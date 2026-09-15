import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { BROKER_TIME_ZONE } from "@/lib/time";
import { parseCsv } from "./cells";
import { ImportError, netOf, parseImportFile, toImportRows } from "./index";
import { parseMetaTrader } from "./metatrader";
import { cleanTradingViewSymbol, parseTradingView } from "./tradingview";

// Künstliche Beispieldaten im Aufbau der echten Exporte (keine echten Kontodaten)

const MT5_ROWS: string[][] = [
  ["Bericht der Kontohistorie"],
  ["Name:", "", "", "Demo Challenge 10k"],
  ["Konto:", "", "", "12345678 (EUR, Demo-Server1, demo, Hedge)"],
  ["Firma:", "", "", "Demo Broker Ltd"],
  ["Positionen"],
  ["Zeit", "Position", "Symbol", "Typ", "Volumen", "Preis", "S / L", "T / P", "Zeit", "Preis", "Kommission", "Swap", "Gewinn"],
  ["2026.07.15 17:31:21", "1001", "XAUUSD", "sell", "0.09", "4059.29", "4056.01", "4026.60", "2026.07.15 20:33:55", "4056.08", "-0.44", "0.00", "25.20"],
  ["2026.08.20 17:30:05", "1002", "XAUUSD", "buy", "0.02", "4492.32", "4494.11", "4572.39", "2026.08.21 11:19:48", "4547.85", "-0.11", "-0.80", "95.00"],
  ["2026.01.12 09:00:00", "1003", "EURUSD", "buy", "1.00", "1.08500", "", "", "2026.01.12 10:00:00", "1.08400", "-7.00", "0.00", "-100.00"],
  ["Orders"],
  ["Eröffnungszeit", "Auftrag", "Symbol", "Typ", "Volumen", "Preis", "S / L", "T / P", "Zeit", "Status", "", "Kommentar"],
  ["2026.07.15 17:31:21", "1001", "XAUUSD", "sell", "0.09 / 0.09", "market", "4065.28", "4035.39", "2026.07.15 17:31:21", "filled", "", "TUP"],
  ["Trades"],
  ["Zeit", "Trade", "Symbol", "Typ", "Richtung", "Volumen", "Preis", "Auftrag", "Kommission", "Kosten", "Swap", "Gewinn", "Kontostand", "Kommentar"],
  ["2026.07.08 17:03:06", "9001", "", "balance", "", "", "", "", "0", "0", "0", "10000.00", "10000.00", "Initial account balance"],
  ["2026.07.15 17:31:21", "9002", "XAUUSD", "sell", "in", "0.09", "4059.29", "1001", "-0.22", "0.00", "0.00", "0.00", "9999.78", "TUP"],
];

const TV_CSV = `Symbol,Trade-Nummer,Typ,Datum und Uhrzeit,Order-ID,Signal,Preis,Größe (Menge),Größe (Wert),Netto G&V USD,Rendite %,Provision USD,Kumulierter G&V USD,Kumulierter G&V %
CME_MINI:NQ1!,1,Short-Ausstieg,"31. März 2026, 10:23",501,501,23330.5,1,23362.75,644.98,0.14,0.02,644.98,1.29
CME_MINI:NQ1!,1,Short-Einstieg,"31. März 2026, 10:11",500,500,23362.75,1,23362.75,644.98,0.14,0.02,644.98,1.29
COMEX_MINI:MGC1!,2,Long-Ausstieg,"14. Sept. 2026, 18:52",601,601,4357.7,11,47933.6,10.78,0,0.22,655.76,1.3
COMEX_MINI:MGC1!,2,Long-Einstieg,"14. Sept. 2026, 18:52",600,600,4357.6,11,47933.6,10.78,0,0.22,655.76,1.3
COMEX_MINI:MGC1!,3,Long-Einstieg,"14. Sept. 2026, 19:10",700,700,4360.0,2,8720,0,0,0,655.76,1.3
`;

describe("MetaTrader 5", () => {
  const result = parseMetaTrader(MT5_ROWS);

  it("liest nur Positionen, nicht Orders oder Deals", () => {
    expect(result.source).toBe("mt5");
    expect(result.trades.map((t) => t.externalId)).toEqual(["1001", "1002", "1003"]);
  });

  it("übernimmt Kurse, Kosten und Ergebnis", () => {
    const partial = result.trades[1];
    expect(partial).toMatchObject({ direction: "long", quantity: 0.02, pnl: 95, commission: -0.11, swap: -0.8 });
    expect(netOf(partial)).toBe(94.09);
    expect(result.trades[2]).toMatchObject({ stopLoss: null, takeProfit: null, direction: "long" });
  });

  it("nimmt den ursprünglichen SL aus den Orders und berechnet daraus das Risiko", () => {
    // Position 1001: SL später auf 4056.01 nachgezogen, platziert mit 4065.28
    expect(result.trades[0].stopLoss).toBe(4065.28);
    const [trailed, noOrder] = toImportRows(result.trades, BROKER_TIME_ZONE);
    // 25,20 € für 3,21 Punkte → 5,99 Punkte SL-Abstand ≈ 47,02 €
    expect(trailed.risk_amount).toBe(47.02);
    // 1002 ohne Order-Zeile: SL liegt über dem Einstieg (nachgezogen) → kein Risiko ableitbar
    expect(noOrder.risk_amount).toBeNull();
  });

  it("liest Kontodaten und Startkapital", () => {
    expect(result.meta).toEqual({
      accountName: "Demo Challenge 10k",
      accountNumber: "12345678",
      company: "Demo Broker Ltd",
      currency: "EUR",
      startingBalance: 10000,
    });
  });

  it("rechnet Serverzeit korrekt um", () => {
    const [summer, , winter] = toImportRows(result.trades, BROKER_TIME_ZONE);
    expect(summer.entry_time).toBe("2026-07-15T14:31:21.000Z");
    expect(winter.entry_time).toBe("2026-01-12T07:00:00.000Z");
  });

  it("liest eine UTF-16-XLSX, wie MT5 sie schreibt", () => {
    const xml = (s: string) => {
      const utf16 = new Uint8Array(2 + s.length * 2);
      utf16.set([0xff, 0xfe]);
      for (let i = 0; i < s.length; i++) {
        utf16[2 + i * 2] = s.charCodeAt(i) & 0xff;
        utf16[3 + i * 2] = s.charCodeAt(i) >> 8;
      }
      return utf16;
    };
    const strings = MT5_ROWS.flat().filter(Boolean);
    const unique = [...new Set(strings)];
    const cols = "ABCDEFGHIJKLMNOP";
    const sheet = MT5_ROWS.map(
      (row, r) =>
        `<row r="${r + 1}">${row
          .map((v, c) => (v ? `<c r="${cols[c]}${r + 1}" t="s"><v>${unique.indexOf(v)}</v></c>` : `<c r="${cols[c]}${r + 1}"/>`))
          .join("")}</row>`,
    ).join("");
    const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
    const zip = zipSync({
      "xl/workbook.xml": strToU8("<workbook/>"),
      "xl/sharedStrings.xml": xml(`<?xml version="1.0"?><sst>${unique.map((s) => `<si><t>${esc(s)}</t></si>`).join("")}</sst>`),
      "xl/worksheets/sheet1.xml": xml(`<?xml version="1.0"?><worksheet><sheetData>${sheet}</sheetData></worksheet>`),
    });

    const fromFile = parseImportFile("ReportHistory-12345678.xlsx", zip);
    expect(fromFile.trades).toEqual(result.trades);
    expect(fromFile.meta.startingBalance).toBe(10000);
  });

  it("meldet verständlich, wenn keine Trades gefunden werden", () => {
    expect(() => parseMetaTrader([["Irgendeine Tabelle"], ["a", "b"]])).toThrow(ImportError);
  });
});

describe("MetaTrader 4", () => {
  it("liest Closed Transactions (Ticket-Layout)", () => {
    const rows = [
      ["Ticket", "Open Time", "Type", "Size", "Item", "Price", "S / L", "T / P", "Close Time", "Price", "Commission", "Taxes", "Swap", "Profit"],
      ["555", "2026.02.03 10:00", "sell", "0.50", "gbpusd", "1.27000", "1.27500", "0.00000", "2026.02.03 12:30", "1.26500", "-3.50", "0.00", "-1.20", "250.00"],
      ["556", "2026.02.03 13:00", "balance", "Deposit", "", "", "", "", "", "", "", "", "", "5000.00"],
    ];
    const result = parseMetaTrader(rows);
    expect(result.source).toBe("mt4");
    expect(result.trades).toHaveLength(1);
    expect(result.trades[0]).toMatchObject({
      externalId: "555",
      symbol: "GBPUSD",
      direction: "short",
      takeProfit: null,
      commission: -3.5,
      swap: -1.2,
      pnl: 250,
    });
  });
});

describe("TradingView", () => {
  const result = parseTradingView(parseCsv(TV_CSV));

  it("fasst Einstieg und Ausstieg zu einem Trade zusammen", () => {
    expect(result.trades).toHaveLength(2);
    expect(result.trades[0]).toMatchObject({
      externalId: "500",
      symbol: "NQ",
      direction: "short",
      entryPrice: 23362.75,
      exitPrice: 23330.5,
      quantity: 1,
      pnl: 645,
      commission: -0.02,
    });
    expect(netOf(result.trades[0])).toBe(644.98);
  });

  it("schätzt das Startkapital aus dem kumulierten G&V", () => {
    // 655.76 $ = 1.3 % → rund 50.000 $
    expect(result.meta.startingBalance).toBe(50000);
  });

  it("überspringt offene Trades mit Hinweis", () => {
    expect(result.warnings).toEqual([expect.stringContaining("noch offen")]);
  });

  it("interpretiert Zeiten als Berliner Zeit", () => {
    const [nq] = toImportRows(result.trades, result.defaultTimeZone);
    expect(nq.entry_time).toBe("2026-03-31T08:11:00.000Z");
    expect(nq.exit_time).toBe("2026-03-31T08:23:00.000Z");
  });

  it.each([
    ["CME_MINI:NQ1!", "NQ"],
    ["COMEX_MINI:MGC1!", "MGC"],
    ["OANDA:XAUUSD", "XAUUSD"],
    ["NQZ2026", "NQZ2026"],
  ])("Symbol %s → %s", (raw, expected) => {
    expect(cleanTradingViewSymbol(raw)).toBe(expected);
  });

  it("CSV-Datei wird am Inhalt erkannt", () => {
    const parsed = parseImportFile("export.csv", new TextEncoder().encode(TV_CSV));
    expect(parsed.source).toBe("tradingview");
  });

  it("unbekannte CSV wird abgelehnt", () => {
    expect(() => parseImportFile("x.csv", new TextEncoder().encode("a,b\n1,2"))).toThrow(ImportError);
  });
});
