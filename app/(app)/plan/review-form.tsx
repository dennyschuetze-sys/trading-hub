"use client";

import { useState } from "react";
import { Check, Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScalePicker } from "@/components/forms/scale-picker";
import { useFormAction } from "@/components/forms/use-form-action";
import { SCALE_LABELS, type DailyPlan } from "@/lib/daily-plan";
import { formatDateTime } from "@/lib/trading";
import { cn } from "@/lib/utils";
import { saveReview } from "./actions";
import { PlanCard, PlanLabel, PlanSection } from "./plan-section";

export function ReviewForm({ date, plan }: { date: string; plan: DailyPlan | null }) {
  const { state, onSubmit, pending } = useFormAction(saveReview.bind(null, date));
  const [followedPlan, setFollowedPlan] = useState(plan?.followed_plan == null ? "" : String(plan.followed_plan));

  return (
    <PlanSection
      id="nach-der-session"
      number="05"
      title="Nach der Session"
      tone="review"
      description={
        plan?.reviewed_at ? `Review gespeichert am ${formatDateTime(plan.reviewed_at)}` : "Ehrlich reflektieren – dein zukünftiges Ich dankt dir."
      }
    >
      <form onSubmit={onSubmit} className="grid gap-4 rounded-2xl bg-warning/[0.025] p-3 ring-1 ring-warning/10 sm:p-5">
        <PlanCard className="grid gap-5">
          <PlanLabel>Reflexion</PlanLabel>
          <div className="grid gap-6 md:grid-cols-[minmax(0,0.8fr)_minmax(0,1fr)_minmax(0,1fr)]">
            <div className="grid content-start gap-2">
              <span id="followed_plan-label" className="text-[0.6875rem] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
                Plan eingehalten?
              </span>
              <input type="hidden" name="followed_plan" value={followedPlan} />
              <div className="grid grid-cols-2 gap-1.5" role="radiogroup" aria-labelledby="followed_plan-label">
                {(
                  [
                    ["true", "Ja", "border-profit bg-profit/15 text-profit"],
                    ["false", "Nein", "border-loss bg-loss/15 text-loss"],
                  ] as const
                ).map(([value, label, activeClass]) => {
                  const active = followedPlan === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => setFollowedPlan(active ? "" : value)}
                      className={cn(
                        "h-10 rounded-lg border text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        active ? activeClass : "border-input bg-background/40 text-muted-foreground hover:border-foreground/25 hover:text-foreground",
                      )}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
            <ScalePicker name="discipline" label="Disziplin" labels={SCALE_LABELS.discipline} defaultValue={plan?.discipline} showEnds />
            <ScalePicker name="mood_after" label="Stimmung danach" labels={SCALE_LABELS.mood} defaultValue={plan?.mood_after} showEnds />
          </div>
        </PlanCard>

        <div className="grid gap-4 md:grid-cols-2">
          <PlanCard className="grid content-start gap-2">
            <span className="mb-1 flex size-7 items-center justify-center rounded-lg bg-profit/15 text-profit" aria-hidden>
              <Check className="size-3.5" strokeWidth={2.5} />
            </span>
            <PlanLabel htmlFor="went_well">Was lief gut?</PlanLabel>
            <Textarea
              id="went_well"
              name="went_well"
              rows={4}
              defaultValue={plan?.went_well ?? ""}
              maxLength={10000}
              placeholder="Was hast du heute richtig gemacht?"
              className="min-h-28"
            />
          </PlanCard>
          <PlanCard className="grid content-start gap-2">
            <span className="mb-1 flex size-7 items-center justify-center rounded-lg bg-loss/15 text-loss" aria-hidden>
              <Plus className="size-3.5" strokeWidth={2.5} />
            </span>
            <PlanLabel htmlFor="to_improve">Was mache ich besser?</PlanLabel>
            <Textarea
              id="to_improve"
              name="to_improve"
              rows={4}
              defaultValue={plan?.to_improve ?? ""}
              maxLength={10000}
              placeholder="Was änderst du beim nächsten Mal?"
              className="min-h-28"
            />
          </PlanCard>
        </div>

        <PlanCard className="grid gap-3 ring-warning/20 hover:ring-warning/30">
          <PlanLabel htmlFor="lesson" className="text-warning">
            Lektion des Tages
          </PlanLabel>
          <Input
            id="lesson"
            name="lesson"
            defaultValue={plan?.lesson ?? ""}
            maxLength={2000}
            placeholder="Was möchte ich aus diesem Trading-Tag mitnehmen?"
            className="h-14 px-4 text-base font-medium md:text-base"
          />
          <p className="text-xs text-muted-foreground/80">Ein Satz, den du dir merken willst</p>
        </PlanCard>

        <div className="flex flex-wrap items-center justify-end gap-3">
          <p className="text-xs text-muted-foreground">
            {state.error ? <span className="text-loss">{state.error}</span> : plan?.reviewed_at ? "Review gespeichert" : "Noch kein Review gespeichert"}
          </p>
          <Button
            type="submit"
            disabled={pending}
            variant="outline"
            className="h-10 border-warning/40 px-5 text-xs font-bold tracking-[0.08em] text-warning uppercase hover:bg-warning/10 hover:text-warning"
          >
            {pending ? <Loader2 className="size-4 animate-spin" /> : plan?.reviewed_at ? <Check className="size-4" strokeWidth={2.5} /> : null}
            {pending ? "Speichern …" : plan?.reviewed_at ? "Review aktualisieren" : "Review speichern"}
          </Button>
        </div>
      </form>
    </PlanSection>
  );
}
