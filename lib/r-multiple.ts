import { hasPips, resolveInstrument } from "@/lib/position-size";
import { formatNumber } from "@/lib/trading";

type PriceTrade = {
  direction: "long" | "short" | string;
  entry_price: number | null;
  exit_price: number | null;
  stop_loss: number | null;
  pnl: number | null;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Abstand von Einstieg zum SL, wenn der SL auf der Verlustseite liegt – sonst null (z. B. auf Breakeven nachgezogen). */
function stopDistance(direction: string, entry: number, stop: number) {
  const distance = direction === "long" ? entry - stop : stop - entry;
  return distance > 0 ? distance : null;
}

/**
 * Risiko in Kontowährung aus Einstieg, SL und dem tatsächlichen Ergebnis.
 * Der Wert einer Kursbewegung (inkl. Lotgröße, Kontraktgröße und Umrechnung) ergibt sich
 * aus Brutto-P&L ÷ Kursbewegung – so braucht es keine Kontraktdaten je Symbol.
 */
export function estimateRisk(t: PriceTrade): number | null {
  const { entry_price: entry, exit_price: exit, stop_loss: stop, pnl } = t;
  if (entry == null || exit == null || stop == null || pnl == null || pnl === 0) return null;
  const distance = stopDistance(t.direction, entry, stop);
  const move = t.direction === "long" ? exit - entry : entry - exit;
  if (distance == null || move === 0) return null;
  const valuePerPoint = pnl / move;
  if (!(valuePerPoint > 0) || !Number.isFinite(valuePerPoint)) return null;
  const risk = round2(distance * valuePerPoint);
  return risk > 0 ? risk : null;
}

type StopTrade = { direction: string; entry_price: number | null; stop_loss: number | null };

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Größe eines Pips für Forex und Metalle (z. B. EURUSD 0.0001, USDJPY 0.01, XAUUSD 0.1).
 * Null bei Indizes, Futures und Unbekanntem – dort wird in Punkten (Kursabstand) gerechnet.
 * Kommt aus der Instrumententabelle in `position-size`, damit Rechner und Journal
 * dieselben Pips benutzen und Broker-Schreibweisen (`XAUUSDm`, `NQZ6`) gleich erkannt werden.
 */
export function pipSize(symbol: string): number | null {
  const ins = resolveInstrument(symbol);
  return ins && hasPips(ins) ? ins.pipSize : null;
}

/** SL-Größe in Pips (Forex/Metalle) oder Punkten (sonst). */
export function stopSize(t: StopTrade & { symbol: string }): { value: number; unit: "Pips" | "Punkte" } | null {
  if (t.entry_price == null || t.stop_loss == null) return null;
  const distance = stopDistance(t.direction, t.entry_price, t.stop_loss);
  if (distance == null) return null;
  const pip = pipSize(t.symbol);
  return pip ? { value: round1(distance / pip), unit: "Pips" } : { value: Math.round(distance * 100) / 100, unit: "Punkte" };
}

/** „15,2 Pips“ bzw. „25,5 Punkte“ */
export function formatStopSize(size: { value: number; unit: string } | null): string | null {
  return size ? `${formatNumber(size.value, 2)} ${size.unit}` : null;
}

/** Kursbewegung in R: wie viele SL-Abstände ein Kurs in Trade-Richtung (positiv) vom Einstieg entfernt liegt. */
function priceInR(t: StopTrade, price: number | null): number | null {
  if (t.entry_price == null || t.stop_loss == null || price == null) return null;
  const distance = stopDistance(t.direction, t.entry_price, t.stop_loss);
  if (distance == null) return null;
  const move = t.direction === "long" ? price - t.entry_price : t.entry_price - price;
  return round2(move / distance);
}

/** Maximal mögliches R (MFE): bester Kurs während des Trades, gemessen am ursprünglichen SL. */
export function maxFavorableR(t: StopTrade & { best_price: number | null }): number | null {
  const r = priceInR(t, t.best_price);
  return r == null ? null : Math.max(0, r);
}

/** Maximaler Gegenlauf (MAE) in R, positiv angegeben (1 = bis zum SL). */
export function maxAdverseR(t: StopTrade & { worst_price: number | null }): number | null {
  const r = priceInR(t, t.worst_price);
  return r == null ? null : Math.max(0, -r);
}

/** Anteil des möglichen R, der tatsächlich mitgenommen wurde (1 = am besten Kurs ausgestiegen). */
export function exitEfficiency(t: StopTrade & { best_price: number | null; exit_price: number | null }): number | null {
  const mfe = maxFavorableR(t);
  const exit = priceInR(t, t.exit_price);
  if (mfe == null || exit == null || mfe <= 0) return null;
  return round2(exit / mfe);
}

export type ExitReason = "sl" | "tp" | "manual";

/** Ausstieg am SL, am TP (Toleranz 5 % des SL-Abstands) oder manuell. */
export function exitReason(
  t: StopTrade & { exit_price: number | null; take_profit: number | null },
): ExitReason | null {
  if (t.entry_price == null || t.exit_price == null || t.stop_loss == null) return null;
  const distance = stopDistance(t.direction, t.entry_price, t.stop_loss);
  if (distance == null) return null;
  const tolerance = distance * 0.05;
  if (Math.abs(t.exit_price - t.stop_loss) <= tolerance) return "sl";
  if (t.take_profit != null && Math.abs(t.exit_price - t.take_profit) <= tolerance) return "tp";
  return "manual";
}

/** Kommission + Swap in R (negativ = Kosten). */
export function costsInR(t: { commission: number; swap: number; risk_amount: number | null }): number | null {
  if (t.risk_amount == null || t.risk_amount <= 0) return null;
  return round2((t.commission + t.swap) / t.risk_amount);
}

/** Geplantes Chance-Risiko-Verhältnis (TP-Abstand ÷ SL-Abstand). */
export function plannedRewardRisk(t: {
  direction: string;
  entry_price: number | null;
  stop_loss: number | null;
  take_profit: number | null;
}): number | null {
  const { entry_price: entry, stop_loss: stop, take_profit: target } = t;
  if (entry == null || stop == null || target == null) return null;
  const distance = stopDistance(t.direction, entry, stop);
  const reward = t.direction === "long" ? target - entry : entry - target;
  if (distance == null || reward <= 0) return null;
  return round2(reward / distance);
}
