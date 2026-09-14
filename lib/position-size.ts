/** Positionsgrößen-Rechner: Forex, CFDs (Metalle, Indizes, Öl) und Futures. */

export type InstrumentKind = "forex" | "cfd" | "future";

export type Instrument = {
  symbol: string;
  label: string;
  kind: InstrumentKind;
  group: string;
  /** Währung, in der Gewinn/Verlust anfällt (Quotewährung bzw. Kontraktwährung) */
  quote: string;
  /** Forex/CFD: Einheiten pro 1 Lot */
  contractSize: number;
  /** Forex: Größe eines Pips im Preis */
  pipSize: number;
  /** Futures: kleinste Preisbewegung und ihr Wert pro Kontrakt */
  tickSize: number;
  tickValue: number;
  /** Futures: kleinere Variante (z. B. ES → MES) */
  micro?: string;
  /** Alternative Schreibweisen bei Brokern */
  aliases?: string[];
};

const forex = (symbol: string, group = "Forex"): Instrument => {
  const quote = symbol.slice(3, 6);
  return {
    symbol,
    label: `${symbol.slice(0, 3)}/${quote}`,
    kind: "forex",
    group,
    quote,
    contractSize: 100_000,
    pipSize: quote === "JPY" ? 0.01 : 0.0001,
    tickSize: 0,
    tickValue: 0,
  };
};

const cfd = (symbol: string, label: string, quote: string, contractSize: number, aliases: string[] = [], group = "Indizes & Rohstoffe (CFD)"): Instrument => ({
  symbol,
  label,
  kind: "cfd",
  group,
  quote,
  contractSize,
  pipSize: 1,
  tickSize: 0,
  tickValue: 0,
  aliases,
});

const future = (symbol: string, label: string, tickSize: number, tickValue: number, quote = "USD", micro?: string): Instrument => ({
  symbol,
  label,
  kind: "future",
  group: "Futures",
  quote,
  contractSize: 0,
  pipSize: 0,
  tickSize,
  tickValue,
  micro,
});

export const INSTRUMENTS: Instrument[] = [
  ...["EURUSD", "GBPUSD", "USDJPY", "USDCHF", "USDCAD", "AUDUSD", "NZDUSD"].map((s) => forex(s, "Forex Majors")),
  ...["EURGBP", "EURJPY", "GBPJPY", "EURCHF", "EURAUD", "EURCAD", "GBPCHF", "AUDJPY", "CADJPY", "CHFJPY", "AUDCAD", "AUDNZD", "NZDJPY", "GBPAUD", "GBPCAD"].map(
    (s) => forex(s, "Forex Crosses"),
  ),
  cfd("XAUUSD", "Gold", "USD", 100, ["GOLD"], "Metalle (CFD)"),
  cfd("XAGUSD", "Silber", "USD", 5000, ["SILVER"], "Metalle (CFD)"),
  cfd("US30", "Dow Jones", "USD", 1, ["DJ30", "WS30", "DOW", "USA30"]),
  cfd("US100", "Nasdaq 100", "USD", 1, ["NAS100", "USTEC", "NDX", "USA100"]),
  cfd("US500", "S&P 500", "USD", 1, ["SPX500", "SP500", "SPX", "USA500"]),
  cfd("GER40", "DAX", "EUR", 1, ["DE40", "DAX40", "GER30", "DE30"]),
  cfd("UK100", "FTSE 100", "GBP", 1, ["FTSE100"]),
  cfd("EU50", "Euro Stoxx 50", "EUR", 1, ["STOXX50", "EUSTX50"]),
  cfd("USOIL", "WTI Öl", "USD", 100, ["WTI", "XTIUSD", "CRUDE"]),
  cfd("UKOIL", "Brent Öl", "USD", 100, ["BRENT", "XBRUSD"]),
  cfd("BTCUSD", "Bitcoin", "USD", 1, ["BTC"], "Krypto (CFD)"),
  cfd("ETHUSD", "Ethereum", "USD", 1, ["ETH"], "Krypto (CFD)"),
  future("ES", "E-mini S&P 500", 0.25, 12.5, "USD", "MES"),
  future("MES", "Micro E-mini S&P 500", 0.25, 1.25),
  future("NQ", "E-mini Nasdaq 100", 0.25, 5, "USD", "MNQ"),
  future("MNQ", "Micro E-mini Nasdaq 100", 0.25, 0.5),
  future("YM", "E-mini Dow", 1, 5, "USD", "MYM"),
  future("MYM", "Micro E-mini Dow", 1, 0.5),
  future("RTY", "E-mini Russell 2000", 0.1, 5, "USD", "M2K"),
  future("M2K", "Micro E-mini Russell 2000", 0.1, 0.5),
  future("GC", "Gold", 0.1, 10, "USD", "MGC"),
  future("MGC", "Micro Gold", 0.1, 1),
  future("SI", "Silber", 0.005, 25, "USD", "SIL"),
  future("SIL", "Micro Silber", 0.005, 5),
  future("CL", "Crude Oil WTI", 0.01, 10, "USD", "MCL"),
  future("MCL", "Micro Crude Oil", 0.01, 1),
  future("NG", "Erdgas", 0.001, 10),
  future("6E", "Euro FX", 0.00005, 6.25, "USD", "M6E"),
  future("M6E", "Micro Euro FX", 0.0001, 1.25),
  future("6B", "Britisches Pfund", 0.0001, 6.25),
  future("FDAX", "DAX-Future", 1, 25, "EUR", "FDXM"),
  future("FDXM", "Mini-DAX-Future", 1, 5, "EUR", "FDXS"),
  future("FDXS", "Micro-DAX-Future", 1, 1, "EUR"),
];

const FOREX_CURRENCIES = new Set(["USD", "EUR", "GBP", "JPY", "CHF", "CAD", "AUD", "NZD", "SEK", "NOK", "DKK", "PLN", "HUF", "CZK", "ZAR", "MXN", "SGD", "HKD", "TRY", "CNH"]);

/**
 * Findet ein Instrument zu einer Eingabe wie „EURUSD.pro“, „NAS100.cash“, „MNQZ6“ oder „ger40“.
 * Unbekannte Forex-Paare (6 Buchstaben, zwei bekannte Währungen) werden automatisch erzeugt.
 */
export function resolveInstrument(raw: string): Instrument | null {
  const s = raw.toUpperCase().trim().replace(/[\s/_-]/g, "");
  if (!s) return null;
  const base = s.split(".")[0];

  const exact = INSTRUMENTS.find((i) => i.symbol === base || i.aliases?.includes(base));
  if (exact) return exact;

  // Futures mit Verfallsmonat, z. B. NQZ6, MNQH27, ESU2026
  const futureMatch = base.match(/^([A-Z0-9]{1,4}?)[FGHJKMNQUVXZ]\d{1,4}$/);
  if (futureMatch) {
    const f = INSTRUMENTS.find((i) => i.kind === "future" && i.symbol === futureMatch[1]);
    if (f) return f;
  }

  // Broker-Endungen ohne Punkt, z. B. EURUSDm, XAUUSDpro, US30cash
  const prefix = INSTRUMENTS.filter((i) => i.kind !== "future")
    .flatMap((i) => [i.symbol, ...(i.aliases ?? [])].map((name) => ({ name, i })))
    .filter(({ name }) => base.startsWith(name))
    .sort((a, b) => b.name.length - a.name.length)[0];
  if (prefix) return prefix.i;

  const pair = base.slice(0, 6);
  if (/^[A-Z]{6}$/.test(pair) && FOREX_CURRENCIES.has(pair.slice(0, 3)) && FOREX_CURRENCIES.has(pair.slice(3))) {
    return forex(pair);
  }
  return null;
}

// Wechselkurse ------------------------------------------------------------------------

/** Kurse relativ zum Euro: 1 EUR = rates[X] X (EZB-Referenzkurse). */
export type FxRates = { date: string; rates: Record<string, number> };

export function convertRate(from: string, to: string, fx: FxRates | null): number | null {
  if (from === to) return 1;
  if (!fx) return null;
  const perEur = (c: string) => (c === "EUR" ? 1 : fx.rates[c]);
  const a = perEur(from);
  const b = perEur(to);
  return a && b ? b / a : null;
}

// Berechnung --------------------------------------------------------------------------

export type SizeInput = {
  instrument: Instrument;
  accountCurrency: string;
  /** Risikobetrag in Kontowährung */
  riskAmount: number;
  /** Stop-Abstand als Preisdifferenz (z. B. 0.0020 bei EURUSD, 25 bei NQ) */
  stopDistance: number;
  /** Einstiegskurs (optional, für genauere Umrechnung und Zielkurse) */
  entry?: number | null;
  /** Kleinste Positionsgröße/Schrittweite: Lots (z. B. 0.01) bzw. Kontrakte (1) */
  step: number;
  fx: FxRates | null;
  /** Eigener Umrechnungskurs: 1 Einheit Quotewährung = x Kontowährung */
  rateOverride?: number | null;
};

export type SizeResult = {
  /** Umrechnung Quotewährung → Kontowährung */
  rate: number;
  rateSource: "same" | "override" | "entry" | "ecb";
  /** Verlust pro 1 Lot bzw. 1 Kontrakt beim Stop (Kontowährung) */
  lossPerUnit: number;
  /** Ungerundete Größe */
  exactSize: number;
  /** Auf Schrittweite abgerundet */
  size: number;
  actualRisk: number;
  /** Abstand in Pips (Forex), Ticks (Futures) oder Punkten (CFD) */
  distanceUnits: number;
  unit: "Pips" | "Ticks" | "Punkte";
  /** Wert einer Einheit (1 Pip / 1 Tick / 1 Punkt) pro Lot bzw. Kontrakt in Kontowährung */
  unitValue: number;
};

export type SizeError = { error: string };

const EPS = 1e-9;

/** Rundet auf eine Schrittweite ab (Gleitkomma-sicher). */
export function floorToStep(value: number, step: number) {
  const decimals = Math.max(0, -Math.floor(Math.log10(step)));
  const floored = Math.floor(value / step + EPS) * step;
  return Number(floored.toFixed(decimals));
}

export function calculatePositionSize(input: SizeInput): SizeResult | SizeError {
  const { instrument: ins, accountCurrency, riskAmount, stopDistance, entry, step, fx, rateOverride } = input;
  if (!(riskAmount > 0)) return { error: "Gib ein Risiko größer als 0 ein." };
  if (!(stopDistance > 0)) return { error: "Gib einen Stop-Abstand größer als 0 ein." };
  if (!(step > 0)) return { error: "Die Schrittweite muss größer als 0 sein." };

  let rate: number | null;
  let rateSource: SizeResult["rateSource"];
  if (ins.quote === accountCurrency) {
    rate = 1;
    rateSource = "same";
  } else if (rateOverride && rateOverride > 0) {
    rate = rateOverride;
    rateSource = "override";
  } else if (ins.kind === "forex" && entry && entry > 0 && ins.symbol.slice(0, 3) === accountCurrency) {
    // z. B. EURUSD auf einem EUR-Konto: 1 USD = 1 / Kurs EUR
    rate = 1 / entry;
    rateSource = "entry";
  } else {
    rate = convertRate(ins.quote, accountCurrency, fx);
    rateSource = "ecb";
  }
  if (rate == null) return { error: `Kein Umrechnungskurs ${ins.quote} → ${accountCurrency} verfügbar. Trag ihn selbst ein.` };

  let lossPerUnit: number;
  let distanceUnits: number;
  let unit: SizeResult["unit"];
  let unitValue: number;

  if (ins.kind === "future") {
    if (!(ins.tickSize > 0 && ins.tickValue > 0)) return { error: "Tick-Größe und Tick-Wert fehlen." };
    // Angefangene Ticks zählen voll – der Stop liegt immer auf einem Tick
    distanceUnits = Math.ceil(stopDistance / ins.tickSize - EPS);
    unit = "Ticks";
    unitValue = ins.tickValue * rate;
    lossPerUnit = distanceUnits * unitValue;
  } else {
    if (!(ins.contractSize > 0)) return { error: "Die Kontraktgröße fehlt." };
    lossPerUnit = stopDistance * ins.contractSize * rate;
    if (ins.kind === "forex") {
      distanceUnits = stopDistance / ins.pipSize;
      unit = "Pips";
      unitValue = ins.pipSize * ins.contractSize * rate;
    } else {
      distanceUnits = stopDistance;
      unit = "Punkte";
      unitValue = ins.contractSize * rate;
    }
  }

  const exactSize = riskAmount / lossPerUnit;
  const size = floorToStep(exactSize, step);
  return {
    rate,
    rateSource,
    lossPerUnit,
    exactSize,
    size,
    actualRisk: Math.round(size * lossPerUnit * 100) / 100,
    distanceUnits: Math.round(distanceUnits * 100) / 100,
    unit,
    unitValue,
  };
}

/** Eingabeeinheit für den Stop-Abstand: Pips bei Forex, sonst Punkte (= Preisdifferenz). */
export const distanceInputUnit = (ins: Instrument) => (ins.kind === "forex" ? "Pips" : "Punkte");

/** Umrechnung des eingegebenen Stop-Abstands in eine Preisdifferenz. */
export function distanceToPrice(ins: Instrument, value: number) {
  return ins.kind === "forex" ? value * ins.pipSize : value;
}

/** Zielkurs für ein R-Vielfaches (Richtung ergibt sich aus Einstieg und Stop). */
export function targetPrice(entry: number, stop: number, r: number) {
  return entry + (entry - stop) * r;
}
