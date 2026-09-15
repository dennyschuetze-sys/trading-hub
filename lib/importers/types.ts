import type { WallTime } from "@/lib/time";

export type ImportSource = "mt4" | "mt5" | "tradingview";

/** Ein Trade, wie er aus der Datei gelesen wurde – Zeiten noch als Ortszeit der Datei. */
export type ParsedTrade = {
  externalId: string;
  symbol: string;
  direction: "long" | "short";
  entryWall: WallTime;
  exitWall: WallTime | null;
  entryPrice: number | null;
  exitPrice: number | null;
  quantity: number;
  stopLoss: number | null;
  takeProfit: number | null;
  /** Brutto-Ergebnis */
  pnl: number | null;
  /** Kosten negativ */
  commission: number;
  swap: number;
};

export type ImportMeta = {
  accountName?: string;
  accountNumber?: string;
  company?: string;
  currency?: string;
  startingBalance?: number;
};

export type ParseResult = {
  source: ImportSource;
  trades: ParsedTrade[];
  meta: ImportMeta;
  warnings: string[];
  /** Zeitzone, in der die Datei ihre Zeiten angibt (Vorschlag) */
  defaultTimeZone: string;
};

/** Trade im Format, das an den Server geschickt wird. */
export type TradeImportRow = {
  external_id: string;
  symbol: string;
  direction: "long" | "short";
  entry_time: string;
  exit_time: string | null;
  entry_price: number | null;
  exit_price: number | null;
  quantity: number;
  stop_loss: number | null;
  take_profit: number | null;
  pnl: number | null;
  commission: number;
  swap: number;
  /** Aus SL und Ergebnis berechnet, Basis für das R-Multiple */
  risk_amount: number | null;
};

export class ImportError extends Error {}
