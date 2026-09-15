"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Field, FormSection, SelectField } from "@/components/forms/field";
import { useFormAction } from "@/components/forms/use-form-action";
import { BACKTEST_STATUSES, type BacktestSession } from "@/lib/backtests";
import { CURRENCIES, MARKETS } from "@/lib/trading";
import { saveBacktestSession } from "./actions";

export function SessionForm({
  session,
  strategies,
  defaultStrategyId,
}: {
  session?: BacktestSession;
  strategies: { id: string; name: string }[];
  defaultStrategyId?: string;
}) {
  const { state, onSubmit, pending } = useFormAction(saveBacktestSession.bind(null, session?.id ?? null));
  const s = session;

  return (
    <Card>
      <CardContent>
        <form onSubmit={onSubmit} className="grid gap-8">
          <FormSection title="Session">
            <Field label="Name *" htmlFor="name" hint="z. B. „NQ London Breakout Q1 2026“">
              <Input id="name" name="name" defaultValue={s?.name} maxLength={100} required />
            </Field>
            <Field label="Strategie" htmlFor="strategy_id" hint="Nötig für den Vergleich mit Live-Trades">
              <SelectField
                id="strategy_id"
                options={strategies.map((st) => ({ value: st.id, label: st.name }))}
                placeholder="Keine Strategie"
                defaultValue={s?.strategy_id ?? defaultStrategyId ?? ""}
              />
            </Field>
            <Field label="Status" htmlFor="status">
              <SelectField id="status" options={BACKTEST_STATUSES} defaultValue={s?.status ?? "running"} />
            </Field>
            <Field label="Symbole" htmlFor="symbols" hint="Mit Komma trennen, z. B. NQ, ES">
              <Input id="symbols" name="symbols" defaultValue={s?.symbols.join(", ")} className="uppercase" />
            </Field>
            <Field label="Zeiteinheit" htmlFor="timeframe" hint="z. B. M5 oder H1">
              <Input id="timeframe" name="timeframe" defaultValue={s?.timeframe ?? ""} maxLength={20} />
            </Field>
            <Field label="Markt" htmlFor="market">
              <SelectField id="market" options={MARKETS} defaultValue={s?.market ?? "forex_cfd"} />
            </Field>
          </FormSection>

          <Separator />

          <FormSection title="Getesteter Zeitraum & Konto" description="Der Marktzeitraum, den du im Replay durchgehst.">
            <Field label="Von" htmlFor="period_from">
              <Input id="period_from" name="period_from" type="date" defaultValue={s?.period_from ?? ""} />
            </Field>
            <Field label="Bis" htmlFor="period_to">
              <Input id="period_to" name="period_to" type="date" defaultValue={s?.period_to ?? ""} />
            </Field>
            <Field label="Währung" htmlFor="currency">
              <SelectField id="currency" options={CURRENCIES} defaultValue={s?.currency ?? "USD"} />
            </Field>
            <Field label="Startkapital" htmlFor="starting_balance" hint="Optional, für die Equity-Kurve">
              <Input
                id="starting_balance"
                name="starting_balance"
                inputMode="decimal"
                defaultValue={s?.starting_balance == null ? "" : String(s.starting_balance)}
              />
            </Field>
          </FormSection>

          <Field label="Notizen" htmlFor="notes" hint="Regeln für diesen Test, Beobachtungen, Fazit">
            <Textarea id="notes" name="notes" rows={5} maxLength={20000} defaultValue={s?.notes ?? ""} />
          </Field>

          {state.error && <p className="text-sm text-loss">{state.error}</p>}

          <div className="flex gap-2">
            <Button type="submit" disabled={pending}>
              {pending ? "Speichern …" : "Speichern"}
            </Button>
            <Button variant="ghost" asChild>
              <Link href={s ? `/backtesting/${s.id}` : "/backtesting"}>Abbrechen</Link>
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
