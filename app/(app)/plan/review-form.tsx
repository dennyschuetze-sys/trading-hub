"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, SelectField } from "@/components/forms/field";
import { ScalePicker } from "@/components/forms/scale-picker";
import { useFormAction } from "@/components/forms/use-form-action";
import { SCALE_LABELS, type DailyPlan } from "@/lib/daily-plan";
import { formatDateTime } from "@/lib/trading";
import { saveReview } from "./actions";

export function ReviewForm({ date, plan }: { date: string; plan: DailyPlan | null }) {
  const { state, onSubmit, pending } = useFormAction(saveReview.bind(null, date));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Nach der Session</CardTitle>
        <CardDescription>
          {plan?.reviewed_at ? `Review gespeichert am ${formatDateTime(plan.reviewed_at)}` : "Ehrlich reflektieren – dein zukünftiges Ich dankt dir."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="grid gap-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Plan eingehalten?" htmlFor="followed_plan">
              <SelectField
                id="followed_plan"
                options={[
                  { value: "true", label: "Ja" },
                  { value: "false", label: "Nein" },
                ]}
                placeholder="–"
                defaultValue={plan?.followed_plan == null ? "" : String(plan.followed_plan)}
              />
            </Field>
            <ScalePicker name="discipline" label="Disziplin" labels={SCALE_LABELS.discipline} defaultValue={plan?.discipline} />
            <ScalePicker name="mood_after" label="Stimmung danach" labels={SCALE_LABELS.mood} defaultValue={plan?.mood_after} />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Was lief gut?" htmlFor="went_well">
              <Textarea id="went_well" name="went_well" rows={4} defaultValue={plan?.went_well ?? ""} maxLength={10000} />
            </Field>
            <Field label="Was mache ich besser?" htmlFor="to_improve">
              <Textarea id="to_improve" name="to_improve" rows={4} defaultValue={plan?.to_improve ?? ""} maxLength={10000} />
            </Field>
          </div>

          <Field label="Lektion des Tages" htmlFor="lesson" hint="Ein Satz, den du dir merken willst">
            <Input id="lesson" name="lesson" defaultValue={plan?.lesson ?? ""} maxLength={2000} />
          </Field>

          {state.error && <p className="text-sm text-loss">{state.error}</p>}
          <div>
            <Button type="submit" disabled={pending}>
              {pending ? "Speichern …" : plan?.reviewed_at ? "Review aktualisieren" : "Review speichern"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
