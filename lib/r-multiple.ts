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
