"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { ChipSelect } from "@/components/forms/chip-select";
import { Field, FormSection, SelectField } from "@/components/forms/field";
import { LocalDateTimeInput } from "@/components/forms/local-datetime-input";
import { useFormAction } from "@/components/forms/use-form-action";
import { EMOTIONS, MISTAKES, SESSIONS, SETUP_QUALITIES, type Account, type Trade } from "@/lib/trading";
import { cn } from "@/lib/utils";
import { saveTrade } from "./actions";
import { StrategyChecklist, type StrategyOption } from "./strategy-checklist";

type AccountOption = Pick<Account, "id" | "name" | "market">;
type BacktestSessionOption = { id: string; name: string; market: string; strategy_id: string | null; symbols: string[] };

export function TradeForm({
  accounts,
  strategies,
  trade,
  checkedItems = [],
  defaultAccountId,
  backtestSession,
}: {
  accounts: AccountOption[];
  strategies: StrategyOption[];
  trade?: Trade;
  checkedItems?: string[];
  defaultAccountId?: string;
  /** Gesetzt = Backtest-Trade dieser Session statt Live-Trade eines Accounts */
  backtestSession?: BacktestSessionOption;
}) {
  // Zeiten aus dem Browser (lokale Zeitzone) als eindeutige UTC-Zeit an den Server schicken
  const { state, onSubmit, pending } = useFormAction(saveTrade.bind(null, trade?.id ?? null), (formData) => {
    for (const key of ["entry_time", "exit_time"]) {
      const local = String(formData.get(key) ?? "");
      formData.set(key, local ? new Date(local).toISOString() : "");
    }
  });
  const [direction, setDirection] = useState(trade?.direction ?? "long");
  const [status, setStatus] = useState(trade?.status ?? "closed");
  const [accountId, setAccountId] = useState(trade?.account_id ?? defaultAccountId ?? accounts[0]?.id);
  const [now] = useState(() => new Date().toISOString());
  const isFutures = (backtestSession?.market ?? accounts.find((a) => a.id === accountId)?.market) === "futures";
  const t = trade;

  const num = (v: number | null | undefined) => (v == null ? "" : String(v));

  return (
    <Card>
      <CardContent>
        <form onSubmit={onSubmit} className="grid gap-8">
          <FormSection title="Trade">
            {backtestSession ? (
              <Field label="Backtest-Session" htmlFor="backtest_session_name">
                <input type="hidden" name="backtest_session_id" value={backtestSession.id} />
                <Input id="backtest_session_name" value={backtestSession.name} readOnly aria-readonly />
              </Field>
            ) : (
              <Field label="Account *" htmlFor="account_id">
                <SelectField
                  id="account_id"
                  options={accounts.map((a) => ({ value: a.id, label: a.name }))}
                  value={accountId}
                  onChange={(e) => setAccountId(e.target.value)}
                  required
                />
              </Field>
            )}
            <Field label="Symbol *" htmlFor="symbol" hint={isFutures ? "z. B. NQ, ES, MNQ, GC" : "z. B. EURUSD, XAUUSD, US30"}>
              <Input
                id="symbol"
                name="symbol"
                defaultValue={t?.symbol ?? (backtestSession?.symbols.length === 1 ? backtestSession.symbols[0] : undefined)}
                className="uppercase"
                required
              />
            </Field>
            <Field label="Richtung" htmlFor="direction">
              <input type="hidden" name="direction" value={direction} />
              <div className="grid grid-cols-2 gap-2" id="direction">
                {(["long", "short"] as const).map((d) => (
                  <Button
                    key={d}
                    type="button"
                    variant="outline"
                    aria-pressed={direction === d}
                    onClick={() => setDirection(d)}
                    className={cn(
                      direction === d &&
                        (d === "long"
                          ? "border-profit bg-profit/15 text-profit hover:bg-profit/20"
                          : "border-loss bg-loss/15 text-loss hover:bg-loss/20"),
                    )}
                  >
                    {d === "long" ? "Long" : "Short"}
                  </Button>
                ))}
              </div>
            </Field>
            <Field label="Status" htmlFor="status">
              <SelectField
                id="status"
                options={[
                  { value: "closed", label: "Geschlossen" },
                  { value: "open", label: "Offen" },
                ]}
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              />
            </Field>
            <Field label="Einstieg *" htmlFor="entry_time">
              <LocalDateTimeInput id="entry_time" name="entry_time" iso={t?.entry_time ?? now} required />
            </Field>
            {status === "closed" && (
              <Field label="Ausstieg" htmlFor="exit_time">
                <LocalDateTimeInput id="exit_time" name="exit_time" iso={t?.exit_time} />
              </Field>
            )}
          </FormSection>

          <Separator />

          <FormSection title="Ausführung">
            <Field label={isFutures ? "Kontrakte *" : "Lots *"} htmlFor="quantity">
              <Input id="quantity" name="quantity" inputMode="decimal" defaultValue={num(t?.quantity)} required />
            </Field>
            <Field label="Einstiegskurs" htmlFor="entry_price">
              <Input id="entry_price" name="entry_price" inputMode="decimal" defaultValue={num(t?.entry_price)} />
            </Field>
            {status === "closed" && (
              <Field label="Ausstiegskurs" htmlFor="exit_price">
                <Input id="exit_price" name="exit_price" inputMode="decimal" defaultValue={num(t?.exit_price)} />
              </Field>
            )}
            <Field label="Stop Loss" htmlFor="stop_loss">
              <Input id="stop_loss" name="stop_loss" inputMode="decimal" defaultValue={num(t?.stop_loss)} />
            </Field>
            <Field label="Take Profit" htmlFor="take_profit">
              <Input id="take_profit" name="take_profit" inputMode="decimal" defaultValue={num(t?.take_profit)} />
            </Field>
          </FormSection>

          <Separator />

          <FormSection
            title="Ergebnis & Risiko"
            description="Kosten wie Kommission und Swap mit Minus eintragen, z. B. -7."
          >
            <Field label="Gewinn/Verlust (brutto)" htmlFor="pnl" hint="Verlust mit Minus, z. B. -250">
              <Input id="pnl" name="pnl" inputMode="decimal" defaultValue={num(t?.pnl)} />
            </Field>
            <Field label="Kommission" htmlFor="commission">
              <Input id="commission" name="commission" inputMode="decimal" defaultValue={num(t?.commission || null)} />
            </Field>
            <Field label="Swap" htmlFor="swap">
              <Input id="swap" name="swap" inputMode="decimal" defaultValue={num(t?.swap || null)} />
            </Field>
            <Field label="Geplantes Risiko (Betrag)" htmlFor="risk_amount" hint="Verlust bei SL, Basis für das R-Multiple. Leer lassen: wird aus Einstieg, SL und P&L berechnet">
              <Input id="risk_amount" name="risk_amount" inputMode="decimal" defaultValue={num(t?.risk_amount)} />
            </Field>
          </FormSection>

          <Separator />

          <section className="grid gap-3">
            <div>
              <h2 className="font-medium">Strategie</h2>
              <p className="text-sm text-muted-foreground">Welches Setup war das – und hast du dich an die Checkliste gehalten?</p>
            </div>
            <StrategyChecklist
              strategies={strategies}
              defaultStrategyId={t ? t.strategy_id : backtestSession?.strategy_id}
              defaultChecked={checkedItems}
            />
          </section>

          <Separator />

          <FormSection title="Bewertung & Psychologie">
            <Field label="Session" htmlFor="session" hint="Leer = automatisch aus der Einstiegszeit">
              <SelectField id="session" options={SESSIONS} placeholder="Automatisch" defaultValue={t?.session ?? ""} />
            </Field>
            <Field label="Setup-Qualität" htmlFor="setup_quality">
              <SelectField id="setup_quality" options={SETUP_QUALITIES} placeholder="–" defaultValue={t?.setup_quality ?? ""} />
            </Field>
            <Field label="Emotion" htmlFor="emotion">
              <SelectField id="emotion" options={EMOTIONS} placeholder="–" defaultValue={t?.emotion ?? ""} />
            </Field>
            <Field label="Plan eingehalten?" htmlFor="followed_plan">
              <SelectField
                id="followed_plan"
                options={[
                  { value: "true", label: "Ja" },
                  { value: "false", label: "Nein" },
                ]}
                placeholder="–"
                defaultValue={t?.followed_plan == null ? "" : String(t.followed_plan)}
              />
            </Field>
            <Field label="Bewertung (1–5)" htmlFor="rating">
              <SelectField
                id="rating"
                options={["5", "4", "3", "2", "1"].map((v) => ({ value: v, label: "★".repeat(Number(v)) }))}
                placeholder="–"
                defaultValue={t?.rating ? String(t.rating) : ""}
              />
            </Field>
            <Field label="Tags" htmlFor="tags" hint="Mit Komma trennen, z. B. Breakout, FVG">
              <Input id="tags" name="tags" defaultValue={t?.tags.join(", ")} />
            </Field>
          </FormSection>

          <Field label="Fehler" htmlFor="mistakes">
            <ChipSelect name="mistakes" options={MISTAKES} defaultValue={t?.mistakes} />
          </Field>

          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Notizen" htmlFor="notes" hint="Warum bin ich eingestiegen? Was ist passiert?">
              <Textarea id="notes" name="notes" rows={5} defaultValue={t?.notes ?? ""} />
            </Field>
            <Field label="Lessons Learned" htmlFor="lessons" hint="Was mache ich beim nächsten Mal anders?">
              <Textarea id="lessons" name="lessons" rows={5} defaultValue={t?.lessons ?? ""} />
            </Field>
          </div>

          {state.error && <p className="text-sm text-loss">{state.error}</p>}

          <div className="flex gap-2">
            <Button type="submit" disabled={pending}>
              {pending ? "Speichern …" : "Speichern"}
            </Button>
            <Button variant="ghost" asChild>
              <Link href={t ? `/journal/${t.id}` : backtestSession ? `/backtesting/${backtestSession.id}` : "/journal"}>Abbrechen</Link>
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
