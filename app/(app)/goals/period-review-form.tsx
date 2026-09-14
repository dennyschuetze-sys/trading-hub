"use client";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/forms/field";
import { ScalePicker } from "@/components/forms/scale-picker";
import { useFormAction } from "@/components/forms/use-form-action";
import type { Tables } from "@/lib/database.types";
import type { PeriodType } from "@/lib/periods";
import { saveReview } from "./actions";

const RATING_LABELS = ["Sehr schlecht", "Schlecht", "Okay", "Gut", "Sehr gut"];

export function PeriodReviewForm({
  type,
  start,
  review,
  suggestedLessons,
}: {
  type: PeriodType;
  start: string;
  review: Tables<"reviews"> | null;
  /** Lektionen aus den Tagesplänen – füllen ein neues Review vor */
  suggestedLessons: string[];
}) {
  const { state, onSubmit, pending } = useFormAction(saveReview.bind(null, { type, start }));
  const noun = type === "week" ? "Wochen-Review" : "Monats-Review";

  return (
    <form onSubmit={onSubmit} className="grid gap-5">
      <div className="max-w-sm">
        <ScalePicker name="rating" label={`Wie war ${type === "week" ? "die Woche" : "der Monat"}?`} labels={RATING_LABELS} defaultValue={review?.rating} />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Was lief gut?" htmlFor="went_well" hint="Beste Setups, eingehaltene Regeln, gute Entscheidungen">
          <Textarea id="went_well" name="went_well" rows={4} maxLength={10000} defaultValue={review?.went_well ?? ""} />
        </Field>
        <Field label="Was mache ich besser?" htmlFor="to_improve" hint="Wiederkehrende Fehler, Regelverstöße, Emotionen">
          <Textarea id="to_improve" name="to_improve" rows={4} maxLength={10000} defaultValue={review?.to_improve ?? ""} />
        </Field>
      </div>
      <Field
        label="Lektionen"
        htmlFor="lessons"
        hint={!review && suggestedLessons.length ? "Vorausgefüllt mit den Lektionen aus deinen Tagesplänen" : undefined}
      >
        <Textarea
          id="lessons"
          name="lessons"
          rows={4}
          maxLength={10000}
          defaultValue={review?.lessons ?? suggestedLessons.map((l) => `- ${l}`).join("\n")}
        />
      </Field>
      <Field label={`Fokus für ${type === "week" ? "die nächste Woche" : "den nächsten Monat"}`} htmlFor="next_focus" hint="Ein bis drei konkrete Punkte">
        <Textarea id="next_focus" name="next_focus" rows={2} maxLength={5000} defaultValue={review?.next_focus ?? ""} />
      </Field>
      {state.error && <p className="text-sm text-loss">{state.error}</p>}
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Speichern …" : review ? `${noun} aktualisieren` : `${noun} speichern`}
        </Button>
      </div>
    </form>
  );
}
