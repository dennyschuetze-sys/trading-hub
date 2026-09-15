"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, SelectField } from "@/components/forms/field";
import { useFormAction } from "@/components/forms/use-form-action";
import { COST_KINDS } from "@/lib/costs";
import type { FormState } from "@/lib/form-data";
import { CURRENCIES } from "@/lib/trading";
import { cn } from "@/lib/utils";
import { saveCostEntry } from "./actions";

type AccountOption = { id: string; name: string; firm: string | null; currency: string };

export function EntryForm({ accounts, today }: { accounts: AccountOption[]; today: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [type, setType] = useState<"cost" | "payout">("cost");
  const [accountId, setAccountId] = useState("");
  const account = accounts.find((a) => a.id === accountId);

  const { state, onSubmit, pending } = useFormAction(async (prev: FormState, formData: FormData) => {
    const result = await saveCostEntry(prev, formData);
    if (result.success) {
      // Betrag und Notiz leeren, Auswahl behalten – für mehrere Einträge hintereinander
      for (const name of ["amount", "note"]) {
        const input = formRef.current?.elements.namedItem(name);
        if (input instanceof HTMLInputElement) input.value = "";
      }
    }
    return result;
  });

  return (
    <form ref={formRef} onSubmit={onSubmit} className="grid gap-4">
      <input type="hidden" name="type" value={type} />
      <div className="grid grid-cols-2 gap-2" role="group" aria-label="Art des Eintrags">
        {(
          [
            ["cost", "Kosten"],
            ["payout", "Auszahlung"],
          ] as const
        ).map(([value, label]) => (
          <Button
            key={value}
            type="button"
            variant="outline"
            aria-pressed={type === value}
            onClick={() => setType(value)}
            className={cn(
              type === value && (value === "payout" ? "border-profit bg-profit/15 text-profit hover:bg-profit/20" : "border-loss bg-loss/15 text-loss hover:bg-loss/20"),
            )}
          >
            {label}
          </Button>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Account" htmlFor="account_id" hint="Leer lassen für Kosten ohne festen Account">
          <SelectField
            id="account_id"
            options={accounts.map((a) => ({ value: a.id, label: a.firm ? `${a.name} (${a.firm})` : a.name }))}
            placeholder="Kein Account"
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
          />
        </Field>
        <Field label={account ? "Prop Firm" : "Prop Firm *"} htmlFor="firm" hint={account ? "Leer = Firma des Accounts" : "z. B. FTMO, Apex"}>
          <Input id="firm" name="firm" maxLength={100} placeholder={account?.firm ?? ""} required={!account} key={accountId} />
        </Field>
        {type === "cost" && (
          <Field label="Art *" htmlFor="kind">
            <SelectField id="kind" options={COST_KINDS} defaultValue="challenge" />
          </Field>
        )}
        <Field label="Betrag *" htmlFor="amount">
          <Input id="amount" name="amount" inputMode="decimal" required />
        </Field>
        <Field label="Währung" htmlFor="currency" hint={account ? `Leer = ${account.currency}` : undefined}>
          <SelectField id="currency" options={CURRENCIES} placeholder={account ? `Wie Account (${account.currency})` : undefined} defaultValue={account ? "" : "USD"} key={accountId} />
        </Field>
        <Field label="Datum *" htmlFor="date">
          <Input id="date" name="date" type="date" defaultValue={today} required />
        </Field>
        <Field label="Notiz" htmlFor="note" className="sm:col-span-2">
          <Input id="note" name="note" maxLength={500} placeholder="z. B. 100k Challenge, Rabattcode" />
        </Field>
      </div>

      {state.error && <p className="text-sm text-loss">{state.error}</p>}
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Speichern …" : type === "payout" ? "Auszahlung speichern" : "Kosten speichern"}
        </Button>
      </div>
    </form>
  );
}
