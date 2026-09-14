"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Field, FormSection, SelectField } from "@/components/forms/field";
import { useFormAction } from "@/components/forms/use-form-action";
import {
  ACCOUNT_STATUSES,
  ACCOUNT_TYPES,
  CURRENCIES,
  DRAWDOWN_TYPES,
  MARKETS,
  PHASES,
  PLATFORMS,
  type Account,
} from "@/lib/trading";
import { saveAccount } from "./actions";

export function AccountForm({ account }: { account?: Account }) {
  const { state, onSubmit, pending } = useFormAction(saveAccount.bind(null, account?.id ?? null));
  const a = account;

  return (
    <Card>
      <CardContent>
        <form onSubmit={onSubmit} className="grid gap-8">
          <FormSection title="Allgemein">
            <Field label="Name *" htmlFor="name" hint="z. B. „FTMO 100k #1“">
              <Input id="name" name="name" defaultValue={a?.name} required />
            </Field>
            <Field label="Prop Firm / Broker" htmlFor="firm">
              <Input id="firm" name="firm" defaultValue={a?.firm ?? ""} placeholder="FTMO, Apex, Topstep …" />
            </Field>
            <Field label="Kontotyp" htmlFor="account_type">
              <SelectField id="account_type" options={ACCOUNT_TYPES} defaultValue={a?.account_type ?? "prop"} />
            </Field>
            <Field label="Plattform" htmlFor="platform">
              <SelectField id="platform" options={PLATFORMS} defaultValue={a?.platform ?? "mt5"} />
            </Field>
            <Field label="Markt" htmlFor="market">
              <SelectField id="market" options={MARKETS} defaultValue={a?.market ?? "forex_cfd"} />
            </Field>
            <Field label="Phase" htmlFor="phase">
              <SelectField id="phase" options={PHASES} defaultValue={a?.phase ?? "challenge"} />
            </Field>
            <Field label="Status" htmlFor="status">
              <SelectField id="status" options={ACCOUNT_STATUSES} defaultValue={a?.status ?? "active"} />
            </Field>
            <Field label="Währung" htmlFor="currency">
              <SelectField id="currency" options={CURRENCIES} defaultValue={a?.currency ?? "USD"} />
            </Field>
            <Field label="Startkapital *" htmlFor="starting_balance">
              <Input
                id="starting_balance"
                name="starting_balance"
                inputMode="decimal"
                defaultValue={a?.starting_balance}
                placeholder="100000"
                required
              />
            </Field>
          </FormSection>

          <Separator />

          <FormSection
            title="Regeln der Prop Firm"
            description="Beträge in Kontowährung. Leer lassen, wenn es die Regel nicht gibt."
          >
            <Field label="Gewinnziel" htmlFor="profit_target" hint="z. B. 10.000 bei 10 % auf 100k">
              <Input id="profit_target" name="profit_target" inputMode="decimal" defaultValue={a?.profit_target ?? ""} />
            </Field>
            <Field label="Max. Tagesverlust" htmlFor="max_daily_loss" hint="z. B. 5.000 bei 5 %">
              <Input id="max_daily_loss" name="max_daily_loss" inputMode="decimal" defaultValue={a?.max_daily_loss ?? ""} />
            </Field>
            <Field label="Max. Drawdown" htmlFor="max_drawdown" hint="z. B. 10.000 bei 10 %">
              <Input id="max_drawdown" name="max_drawdown" inputMode="decimal" defaultValue={a?.max_drawdown ?? ""} />
            </Field>
            <Field label="Art des Drawdowns" htmlFor="drawdown_type">
              <SelectField id="drawdown_type" options={DRAWDOWN_TYPES} defaultValue={a?.drawdown_type ?? "static"} />
            </Field>
            <Field label="Mindest-Handelstage" htmlFor="min_trading_days">
              <Input
                id="min_trading_days"
                name="min_trading_days"
                inputMode="numeric"
                defaultValue={a?.min_trading_days ?? ""}
              />
            </Field>
          </FormSection>

          <Separator />

          <Field label="Notizen" htmlFor="notes">
            <Textarea id="notes" name="notes" rows={3} defaultValue={a?.notes ?? ""} />
          </Field>

          {state.error && <p className="text-sm text-loss">{state.error}</p>}

          <div className="flex gap-2">
            <Button type="submit" disabled={pending}>
              {pending ? "Speichern …" : "Speichern"}
            </Button>
            <Button variant="ghost" asChild>
              <Link href="/accounts">Abbrechen</Link>
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
