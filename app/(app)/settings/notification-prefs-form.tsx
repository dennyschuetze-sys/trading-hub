"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/forms/field";
import { useFormAction } from "@/components/forms/use-form-action";
import type { NotificationPrefs } from "@/lib/notifications";
import { saveNotificationPrefs } from "./actions";

function Toggle({ name, label, description, defaultChecked, children }: {
  name: string;
  label: string;
  description: string;
  defaultChecked: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className="grid gap-3 rounded-lg border p-4 sm:grid-cols-[1fr_auto] sm:items-start">
      <label className="flex items-start gap-3">
        <input type="checkbox" name={name} value="true" defaultChecked={defaultChecked} className="mt-1 size-4 shrink-0 accent-foreground" />
        <span className="grid gap-0.5">
          <span className="font-medium">{label}</span>
          <span className="text-sm text-muted-foreground">{description}</span>
        </span>
      </label>
      {children && <div className="pl-7 sm:w-40 sm:pl-0">{children}</div>}
    </div>
  );
}

const hhmm = (time: string) => time.slice(0, 5);

export function NotificationPrefsForm({ prefs }: { prefs: NotificationPrefs }) {
  const { state, onSubmit, pending } = useFormAction(saveNotificationPrefs);

  return (
    <form onSubmit={onSubmit} className="grid gap-3">
      <Toggle
        name="news_enabled"
        label="High-Impact-News"
        description="Kurz vor wichtigen Terminen in deinen Kalender-Währungen."
        defaultChecked={prefs.news_enabled}
      >
        <Field label="Minuten vorher" htmlFor="news_minutes">
          <Input id="news_minutes" name="news_minutes" inputMode="numeric" defaultValue={prefs.news_minutes} required />
        </Field>
      </Toggle>
      <Toggle
        name="plan_enabled"
        label="Tagesplan-Erinnerung"
        description="Nur wenn für heute noch kein Plan angelegt ist."
        defaultChecked={prefs.plan_enabled}
      >
        <Field label="Uhrzeit" htmlFor="plan_time">
          <Input id="plan_time" name="plan_time" type="time" defaultValue={hhmm(prefs.plan_time)} required />
        </Field>
      </Toggle>
      <Toggle
        name="journal_enabled"
        label="Journal & Review"
        description="Wenn du gehandelt oder geplant hast und das Session-Review noch fehlt."
        defaultChecked={prefs.journal_enabled}
      >
        <Field label="Uhrzeit" htmlFor="journal_time">
          <Input id="journal_time" name="journal_time" type="time" defaultValue={hhmm(prefs.journal_time)} required />
        </Field>
      </Toggle>
      <Toggle
        name="drawdown_enabled"
        label="Warnung bei Prop-Firm-Limits"
        description="Wenn ein aktiver Account sich dem Tagesverlust oder Max. Drawdown nähert (aus geschlossenen Trades)."
        defaultChecked={prefs.drawdown_enabled}
      >
        <Field label="Ab % des Limits" htmlFor="drawdown_threshold">
          <Input id="drawdown_threshold" name="drawdown_threshold" inputMode="numeric" defaultValue={prefs.drawdown_threshold} required />
        </Field>
      </Toggle>
      <label className="flex items-center gap-3 px-1 py-2 text-sm">
        <input type="checkbox" name="weekdays_only" value="true" defaultChecked={prefs.weekdays_only} className="size-4 accent-foreground" />
        Plan- und Journal-Erinnerungen nur Montag bis Freitag
      </label>

      {state.error && <p className="text-sm text-loss">{state.error}</p>}
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Speichern …" : "Speichern"}
        </Button>
      </div>
    </form>
  );
}
