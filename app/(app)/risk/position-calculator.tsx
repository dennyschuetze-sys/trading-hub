"use client";

import { useId, useMemo, useState } from "react";
import { AlertTriangle, Calculator, Info } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Field, SelectField } from "@/components/forms/field";
import { parseNumber } from "@/lib/form-data";
import {
  calculatePositionSize,
  distanceInputUnit,
  distanceToPrice,
  INSTRUMENTS,
  resolveInstrument,
  targetPrice,
  type FxRates,
  type Instrument,
} from "@/lib/position-size";
import { CURRENCIES, formatMoney, formatNumber } from "@/lib/trading";
import { cn } from "@/lib/utils";

export type CalculatorAccount = {
  id: string;
  name: string;
  currency: string;
  balance: number;
  /** Abstand zum Tageslimit der Prop Firm bzw. zum persönlichen Limit (Kontowährung) */
  remainingProp: number | null;
  remainingPersonal: number | null;
};

type Spec = { contractSize: string; tickSize: string; tickValue: string; quote: string; step: string };

const MANUAL = "__manual__";
const CALC_CURRENCIES = [...new Set([...CURRENCIES, "JPY", "CAD", "AUD"])];

function parse(value: string, kind: "money" | "price" = "price"): number | null {
  if (!value.trim()) return null;
  try {
    return parseNumber(value, kind);
  } catch {
    return null;
  }
}

const decimal = (n: number) => String(n).replace(".", ",");

function specFor(ins: Instrument | null, currency: string): Spec {
  if (!ins) return { contractSize: "", tickSize: "", tickValue: "", quote: currency, step: "0,01" };
  return {
    contractSize: ins.contractSize ? decimal(ins.contractSize) : "",
    tickSize: ins.tickSize ? decimal(ins.tickSize) : "",
    tickValue: ins.tickValue ? decimal(ins.tickValue) : "",
    quote: ins.quote,
    step: ins.kind === "future" ? "1" : "0,01",
  };
}

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex rounded-lg border p-0.5" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded-md px-2.5 py-1 text-sm transition-colors",
            value === o.value ? "bg-secondary font-medium" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function PositionCalculator({
  accounts,
  fx,
  defaultRiskPct,
  maxRiskPct,
}: {
  accounts: CalculatorAccount[];
  fx: FxRates | null;
  defaultRiskPct: number | null;
  maxRiskPct: number | null;
}) {
  const uid = useId();
  const first = accounts[0];
  const [accountId, setAccountId] = useState(first?.id ?? MANUAL);
  const [balance, setBalance] = useState(first ? decimal(first.balance) : "");
  const [currency, setCurrency] = useState(first?.currency ?? "USD");
  const [symbol, setSymbol] = useState("EURUSD");
  const [spec, setSpec] = useState<Spec>(() => specFor(resolveInstrument("EURUSD"), first?.currency ?? "USD"));
  const [riskMode, setRiskMode] = useState<"percent" | "amount">("percent");
  const [riskValue, setRiskValue] = useState(decimal(defaultRiskPct ?? 1));
  const [stopMode, setStopMode] = useState<"distance" | "prices">("distance");
  const [distance, setDistance] = useState("");
  const [entry, setEntry] = useState("");
  const [stop, setStop] = useState("");
  const [rateOverride, setRateOverride] = useState("");

  const account = accounts.find((a) => a.id === accountId) ?? null;
  const known = useMemo(() => resolveInstrument(symbol), [symbol]);

  const changeAccount = (id: string) => {
    setAccountId(id);
    const a = accounts.find((x) => x.id === id);
    if (a) {
      setBalance(decimal(a.balance));
      setCurrency(a.currency);
    }
  };

  const changeSymbol = (value: string) => {
    setSymbol(value);
    const ins = resolveInstrument(value);
    // Kontraktdetails nur ersetzen, wenn sich das erkannte Instrument ändert – eigene Angaben bleiben sonst erhalten
    if (ins ? ins.symbol !== known?.symbol : known) setSpec(specFor(ins, currency));
  };

  // Instrument mit den (ggf. angepassten) Kontraktdetails
  const instrument: Instrument = useMemo(() => {
    const base: Instrument = known ?? {
      symbol: symbol.toUpperCase(),
      label: "Eigenes Instrument",
      kind: "cfd",
      group: "Eigenes",
      quote: spec.quote,
      contractSize: 0,
      pipSize: 1,
      tickSize: 0,
      tickValue: 0,
    };
    return {
      ...base,
      quote: base.kind === "forex" ? base.quote : spec.quote,
      contractSize: parse(spec.contractSize) ?? 0,
      tickSize: parse(spec.tickSize) ?? 0,
      tickValue: parse(spec.tickValue) ?? 0,
    };
  }, [known, symbol, spec]);

  const balanceNum = parse(balance, "money");
  const riskNum = parse(riskValue, riskMode === "amount" ? "money" : "price");
  const riskAmount =
    riskNum == null ? null : riskMode === "amount" ? riskNum : balanceNum != null ? Math.round(((balanceNum * riskNum) / 100) * 100) / 100 : null;
  const entryNum = parse(entry);
  const stopNum = parse(stop);
  const stopDistance =
    stopMode === "prices"
      ? entryNum != null && stopNum != null
        ? Math.abs(entryNum - stopNum)
        : null
      : (() => {
          const d = parse(distance);
          return d == null ? null : distanceToPrice(instrument, d);
        })();
  const step = parse(spec.step) ?? (instrument.kind === "future" ? 1 : 0.01);

  const result =
    riskAmount != null && stopDistance != null
      ? calculatePositionSize({
          instrument,
          accountCurrency: currency,
          riskAmount,
          stopDistance,
          entry: entryNum,
          step,
          fx,
          rateOverride: parse(rateOverride),
        })
      : null;

  const ok = result && !("error" in result) ? result : null;
  const sizeUnit = instrument.kind === "future" ? "Kontrakte" : "Lots";
  const money = (v: number) => formatMoney(v, currency);
  const warnings: string[] = [];
  if (ok) {
    const riskPct = balanceNum ? (ok.actualRisk / balanceNum) * 100 : null;
    if (ok.size === 0) {
      const micro = instrument.micro ? ` Tipp: Mit ${instrument.micro} (kleinerer Kontrakt) geht es feiner.` : "";
      warnings.push(
        `Das Risiko reicht nicht für die kleinste Größe (${formatNumber(step, 2)} ${sizeUnit}) – die würde ${money(step * ok.lossPerUnit)} riskieren.${micro}`,
      );
    }
    if (maxRiskPct != null && riskPct != null && riskPct > maxRiskPct * 1.05) {
      warnings.push(`${formatNumber(riskPct, 2)} % liegt über deinem Maximum von ${formatNumber(maxRiskPct, 2)} % pro Trade.`);
    }
    if (account?.remainingPersonal != null && ok.actualRisk > account.remainingPersonal) {
      warnings.push(`Mehr als dein restliches persönliches Tageslimit (${money(account.remainingPersonal)}).`);
    }
    if (account?.remainingProp != null && ok.actualRisk > account.remainingProp) {
      warnings.push(`Mehr als der Abstand zum Tagesverlust-Limit der Prop Firm (${money(account.remainingProp)}).`);
    }
  }

  const rateText = ok
    ? ok.rateSource === "same"
      ? null
      : `1 ${instrument.quote} = ${formatNumber(ok.rate, 5)} ${currency} · ${
          ok.rateSource === "override" ? "eigener Kurs" : ok.rateSource === "entry" ? "aus dem Einstiegskurs" : `EZB-Kurs vom ${fx?.date.split("-").reverse().join(".")}`
        }`
    : null;
  const id = (name: string) => `${uid}-${name}`;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
      <div className="grid content-start gap-5">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Account" htmlFor={id("account")}>
            <SelectField
              id={id("account")}
              options={[...accounts.map((a) => ({ value: a.id, label: a.name })), { value: MANUAL, label: "Ohne Account" }]}
              value={accountId}
              onChange={(e) => changeAccount(e.target.value)}
            />
          </Field>
          <Field label="Kontostand" htmlFor={id("balance")} hint={account ? "Aus Startkapital + geschlossenen Trades" : undefined}>
            <Input id={id("balance")} inputMode="decimal" value={balance} onChange={(e) => setBalance(e.target.value)} />
          </Field>
          <Field label="Kontowährung" htmlFor={id("currency")}>
            <SelectField id={id("currency")} options={CALC_CURRENCIES} value={currency} onChange={(e) => setCurrency(e.target.value)} />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field
            label="Symbol"
            htmlFor={id("symbol")}
            hint={known ? `${known.label} · ${known.kind === "future" ? "Future" : known.kind === "forex" ? "Forex" : "CFD"}` : "Unbekannt – Details unten eintragen"}
          >
            <Input
              id={id("symbol")}
              list={id("symbols")}
              value={symbol}
              onChange={(e) => changeSymbol(e.target.value)}
              autoComplete="off"
              spellCheck={false}
            />
            <datalist id={id("symbols")}>
              {INSTRUMENTS.map((i) => (
                <option key={i.symbol} value={i.symbol}>
                  {i.label}
                </option>
              ))}
            </datalist>
          </Field>
          <div className="grid content-start gap-1.5 sm:col-span-2">
            <div className="flex items-center justify-between gap-2">
              <label htmlFor={id("risk")} className="text-sm font-medium">
                Risiko
              </label>
              <Segmented
                label="Risiko angeben in"
                value={riskMode}
                onChange={setRiskMode}
                options={[
                  { value: "percent", label: "%" },
                  { value: "amount", label: currency },
                ]}
              />
            </div>
            <Input id={id("risk")} inputMode="decimal" value={riskValue} onChange={(e) => setRiskValue(e.target.value)} />
            <p className="text-xs text-muted-foreground">
              {riskMode === "percent" && riskAmount != null ? `= ${money(riskAmount)}` : "Betrag, den du beim Stop verlierst"}
            </p>
          </div>
        </div>

        <div className="grid gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium">Stop-Loss</p>
            <Segmented
              label="Stop angeben als"
              value={stopMode}
              onChange={setStopMode}
              options={[
                { value: "distance", label: `Abstand in ${distanceInputUnit(instrument)}` },
                { value: "prices", label: "Einstieg & Stop" },
              ]}
            />
          </div>
          {stopMode === "distance" ? (
            <div className="grid gap-4 sm:grid-cols-3">
              <Field
                label={`Abstand (${distanceInputUnit(instrument)})`}
                htmlFor={id("distance")}
                hint={instrument.kind === "forex" ? "z. B. 15" : instrument.kind === "future" ? "Preisabstand, z. B. 20 bei NQ" : "Preisabstand, z. B. 5 bei Gold = 5 $"}
              >
                <Input id={id("distance")} inputMode="decimal" value={distance} onChange={(e) => setDistance(e.target.value)} />
              </Field>
              <Field label="Einstiegskurs (optional)" htmlFor={id("entry-d")} hint="Macht die Umrechnung genauer">
                <Input id={id("entry-d")} inputMode="decimal" value={entry} onChange={(e) => setEntry(e.target.value)} />
              </Field>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Einstieg" htmlFor={id("entry")}>
                <Input id={id("entry")} inputMode="decimal" value={entry} onChange={(e) => setEntry(e.target.value)} />
              </Field>
              <Field label="Stop" htmlFor={id("stop")}>
                <Input id={id("stop")} inputMode="decimal" value={stop} onChange={(e) => setStop(e.target.value)} />
              </Field>
            </div>
          )}
        </div>

        <details className="rounded-md border p-3 text-sm" open={!known}>
          <summary className="cursor-pointer font-medium">Kontraktdetails & Umrechnung</summary>
          <div className="mt-3 grid gap-4 sm:grid-cols-3">
            {instrument.kind === "future" ? (
              <>
                <Field label="Tick-Größe" htmlFor={id("tick-size")}>
                  <Input id={id("tick-size")} inputMode="decimal" value={spec.tickSize} onChange={(e) => setSpec({ ...spec, tickSize: e.target.value })} />
                </Field>
                <Field label={`Tick-Wert (${spec.quote})`} htmlFor={id("tick-value")}>
                  <Input id={id("tick-value")} inputMode="decimal" value={spec.tickValue} onChange={(e) => setSpec({ ...spec, tickValue: e.target.value })} />
                </Field>
              </>
            ) : (
              <Field
                label="Kontraktgröße (Einheiten pro Lot)"
                htmlFor={id("contract")}
                hint={instrument.kind === "cfd" ? "Je Broker verschieden – in MT5: Symbol → Rechtsklick → Spezifikation" : undefined}
              >
                <Input id={id("contract")} inputMode="decimal" value={spec.contractSize} onChange={(e) => setSpec({ ...spec, contractSize: e.target.value })} />
              </Field>
            )}
            {instrument.kind !== "forex" && (
              <Field label="Gewinn/Verlust in" htmlFor={id("quote")}>
                <SelectField
                  id={id("quote")}
                  options={[...new Set([...CALC_CURRENCIES, spec.quote])]}
                  value={spec.quote}
                  onChange={(e) => setSpec({ ...spec, quote: e.target.value })}
                />
              </Field>
            )}
            <Field label={`Schrittweite (${sizeUnit})`} htmlFor={id("step")}>
              <Input id={id("step")} inputMode="decimal" value={spec.step} onChange={(e) => setSpec({ ...spec, step: e.target.value })} />
            </Field>
            {instrument.quote !== currency && (
              <Field label={`Eigener Kurs: 1 ${instrument.quote} = ? ${currency}`} htmlFor={id("rate")} hint="Leer = automatisch">
                <Input id={id("rate")} inputMode="decimal" value={rateOverride} onChange={(e) => setRateOverride(e.target.value)} />
              </Field>
            )}
          </div>
        </details>
      </div>

      <div className="h-fit rounded-lg border bg-muted/30 p-4 lg:sticky lg:top-20" aria-live="polite">
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Calculator className="size-4" aria-hidden /> Positionsgröße
        </p>
        {!result ? (
          <p className="mt-3 text-sm text-muted-foreground">Trag Risiko und Stop ein, dann erscheint hier die Größe.</p>
        ) : "error" in result ? (
          <p className="mt-3 flex items-start gap-2 text-sm">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden /> {result.error}
          </p>
        ) : (
          <div className="mt-2 grid gap-4">
            <div>
              <p className="text-3xl font-semibold tracking-tight tabular-nums">
                {formatNumber(result.size, 2)} <span className="text-lg font-normal">{sizeUnit}</span>
              </p>
              <p className="text-sm text-muted-foreground tabular-nums">
                Risiko {money(result.actualRisk)}
                {balanceNum ? ` (${formatNumber((result.actualRisk / balanceNum) * 100, 2)} %)` : ""} · exakt {formatNumber(result.exactSize, 3)}
              </p>
            </div>

            {warnings.length > 0 && (
              <ul className="grid gap-1.5 text-sm">
                {warnings.map((w) => (
                  <li key={w} className="flex items-start gap-2">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-label="Warnung" />
                    <span>{w}</span>
                  </li>
                ))}
              </ul>
            )}

            <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm">
              <dt className="text-muted-foreground">Stop</dt>
              <dd className="text-right tabular-nums">
                {formatNumber(result.distanceUnits, 2)} {result.unit}
              </dd>
              <dt className="text-muted-foreground">Wert pro {result.unit.replace(/s$|e$/, "")}</dt>
              <dd className="text-right tabular-nums">
                {money(result.unitValue)} je {instrument.kind === "future" ? "Kontrakt" : "Lot"}
              </dd>
              <dt className="text-muted-foreground">Verlust beim Stop</dt>
              <dd className="text-right tabular-nums">
                {money(result.lossPerUnit)} je {instrument.kind === "future" ? "Kontrakt" : "Lot"}
              </dd>
              {account?.remainingPersonal != null && (
                <>
                  <dt className="text-muted-foreground">Eigenes Tageslimit</dt>
                  <dd className="text-right tabular-nums">noch {money(account.remainingPersonal)}</dd>
                </>
              )}
              {account?.remainingProp != null && (
                <>
                  <dt className="text-muted-foreground">Prop-Tageslimit</dt>
                  <dd className="text-right tabular-nums">noch {money(account.remainingProp)}</dd>
                </>
              )}
            </dl>

            {stopMode === "prices" && entryNum != null && stopNum != null && result.size > 0 && (
              <table className="w-full text-sm">
                <caption className="mb-1 text-left text-xs text-muted-foreground">Ziele ({entryNum > stopNum ? "Long" : "Short"})</caption>
                <thead>
                  <tr className="text-xs text-muted-foreground">
                    <th className="text-left font-normal">Ziel</th>
                    <th className="text-right font-normal">Kurs</th>
                    <th className="text-right font-normal">Gewinn</th>
                  </tr>
                </thead>
                <tbody>
                  {[1, 2, 3].map((r) => (
                    <tr key={r}>
                      <td>{r} R</td>
                      <td className="text-right tabular-nums">{formatNumber(targetPrice(entryNum, stopNum, r), 5)}</td>
                      <td className="text-right tabular-nums">{money(result.actualRisk * r)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {rateText && (
              <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {rateText}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
