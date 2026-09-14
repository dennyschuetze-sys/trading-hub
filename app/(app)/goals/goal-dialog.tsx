"use client";

import { useState } from "react";
import { Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, SelectField } from "@/components/forms/field";
import { useFormAction } from "@/components/forms/use-form-action";
import type { FormState } from "@/lib/form-data";
import { GOAL_METRICS, metricInfo, type Goal, type GoalMetric } from "@/lib/goals";
import type { PeriodType } from "@/lib/periods";
import { saveGoal } from "./actions";

const UNIT_HINT: Record<string, string> = {
  money: "Betrag in Kontowährung",
  count: "Anzahl",
  percent: "Prozent (0–100)",
  r: "R-Multiple, z. B. 1,5",
  score: "Punkte (0–100)",
};

const decimal = (n: number | null | undefined) => (n == null ? "" : String(n).replace(".", ","));

function GoalForm({
  goal,
  type,
  start,
  accounts,
  onDone,
}: {
  goal?: Goal;
  type: PeriodType;
  start: string;
  accounts: { id: string; name: string }[];
  onDone: () => void;
}) {
  const [metric, setMetric] = useState<GoalMetric>((goal?.metric as GoalMetric) ?? "discipline_score");
  const info = metricInfo(metric);
  const [title, setTitle] = useState(goal?.title ?? info.example);
  const [titleTouched, setTitleTouched] = useState(Boolean(goal));
  const [comparison, setComparison] = useState(goal?.comparison ?? info.comparison);

  const { state, onSubmit, pending } = useFormAction(async (prev: FormState, formData: FormData) => {
    const result = await saveGoal({ id: goal?.id ?? null, type, start }, prev, formData);
    if (result.success) onDone();
    return result;
  });

  const changeMetric = (value: GoalMetric) => {
    setMetric(value);
    const next = metricInfo(value);
    setComparison(next.comparison);
    if (!titleTouched) setTitle(next.example);
  };

  return (
    <form onSubmit={onSubmit} className="grid gap-4">
      <Field label="Was wird gemessen?" htmlFor="metric" hint={metric === "manual" ? "Den Fortschritt trägst du selbst ein" : "Wird automatisch aus Journal, Plänen und Regeln berechnet"}>
        <SelectField
          id="metric"
          options={GOAL_METRICS.map((m) => ({ value: m.value, label: m.label }))}
          value={metric}
          onChange={(e) => changeMetric(e.target.value as GoalMetric)}
        />
      </Field>
      <Field label="Titel" htmlFor="title">
        <Input
          id="title"
          name="title"
          value={title}
          maxLength={200}
          required
          onChange={(e) => {
            setTitle(e.target.value);
            setTitleTouched(true);
          }}
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Bedingung" htmlFor="comparison">
          <SelectField
            id="comparison"
            options={[
              { value: "at_least", label: "mindestens" },
              { value: "at_most", label: "höchstens" },
            ]}
            value={comparison}
            onChange={(e) => setComparison(e.target.value)}
          />
        </Field>
        <Field label="Zielwert" htmlFor="target" hint={UNIT_HINT[info.unit]}>
          <Input id="target" name="target" inputMode="decimal" defaultValue={decimal(goal?.target)} required />
        </Field>
      </div>
      {info.perAccount && (
        <Field label="Account" htmlFor="account_id" hint={info.unit === "money" ? "Pflicht bei Geld-Zielen" : "Leer = alle Accounts"}>
          <SelectField
            id="account_id"
            options={accounts.map((a) => ({ value: a.id, label: a.name }))}
            placeholder={info.unit === "money" ? "Account wählen" : "Alle Accounts"}
            defaultValue={goal?.account_id ?? ""}
            required={info.unit === "money"}
          />
        </Field>
      )}
      {metric === "manual" && (
        <Field label="Aktueller Stand" htmlFor="manual_value">
          <Input id="manual_value" name="manual_value" inputMode="decimal" defaultValue={decimal(goal?.manual_value)} placeholder="0" />
        </Field>
      )}
      <Field label="Notiz (optional)" htmlFor="notes">
        <Textarea id="notes" name="notes" rows={2} maxLength={2000} defaultValue={goal?.notes ?? ""} />
      </Field>
      {state.error && <p className="text-sm text-loss">{state.error}</p>}
      <Button type="submit" disabled={pending}>
        {pending ? "Speichern …" : goal ? "Ziel speichern" : "Ziel anlegen"}
      </Button>
    </form>
  );
}

export function GoalDialog({
  goal,
  type,
  start,
  periodLabel,
  accounts,
}: {
  goal?: Goal;
  type: PeriodType;
  start: string;
  periodLabel: string;
  accounts: { id: string; name: string }[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {goal ? (
          <Button variant="ghost" size="icon-sm" aria-label={`Ziel „${goal.title}“ bearbeiten`}>
            <Pencil className="size-4" />
          </Button>
        ) : (
          <Button size="sm">
            <Plus className="size-4" /> Ziel
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{goal ? "Ziel bearbeiten" : "Neues Ziel"}</DialogTitle>
          <DialogDescription>{periodLabel}</DialogDescription>
        </DialogHeader>
        {/* Erst beim Öffnen rendern, damit das Formular jedes Mal mit den gespeicherten Werten startet */}
        {open && <GoalForm goal={goal} type={type} start={start} accounts={accounts} onDone={() => setOpen(false)} />}
      </DialogContent>
    </Dialog>
  );
}
