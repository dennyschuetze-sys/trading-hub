"use client";

import { useState } from "react";
import { Check, CircleSlash2, Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ChoiceChips } from "@/components/forms/choice-chips";
import { ScalePicker } from "@/components/forms/scale-picker";
import { segmentClass } from "@/components/forms/yes-no-toggle";
import { useFormAction } from "@/components/forms/use-form-action";
import { NO_TRADE_REASONS, SCALE_LABELS, isNoTradeDay, type DailyPlan } from "@/lib/daily-plan";
import { formatDateTime } from "@/lib/trading";
import { cn } from "@/lib/utils";
import { saveReview } from "./actions";
import { PlanCard, PlanLabel, PlanSection } from "./plan-section";

export function ReviewForm({ date, plan, tradeCount }: { date: string; plan: DailyPlan | null; tradeCount: number }) {
  const { state, onSubmit, pending } = useFormAction(saveReview.bind(null, date));
  const [followedPlan, setFollowedPlan] = useState(plan?.followed_plan == null ? "" : String(plan.followed_plan));
  const [noTrade, setNoTrade] = useState(isNoTradeDay(plan, tradeCount));
  const [noTradeReason, setNoTradeReason] = useState(plan?.no_trade_reason ?? null);

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
        {/* Nur ohne erfasste Trades – sonst widerspräche die Auswahl dem Journal */}
        {tradeCount === 0 && (
          <PlanCard className="grid gap-4">
            <input type="hidden" name="no_trade" value={String(noTrade)} />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="grid gap-1">
                <PlanLabel>Session ohne Trade</PlanLabel>
                <p className="text-sm text-muted-foreground">Heute nicht gehandelt? Halte fest, warum – auch ein bewusster Verzicht ist ein Ergebnis.</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={noTrade}
                onClick={() => setNoTrade((v) => !v)}
                className={cn(segmentClass(noTrade), "h-10 px-4")}
              >
                <CircleSlash2 className="size-4" aria-hidden />
                Kein Trade heute
              </button>
            </div>
            {noTrade && (
              <div className="grid gap-2">
                <span id="no_trade_reason-label" className="text-[0.6875rem] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
                  Grund <span className="font-normal tracking-normal normal-case">(optional)</span>
                </span>
                <ChoiceChips
                  name="no_trade_reason"
                  options={NO_TRADE_REASONS}
                  defaultValue={noTradeReason}
                  labelledBy="no_trade_reason-label"
                  onChange={setNoTradeReason}
                />
                {noTradeReason === "missed_setup" && (
                  <p className="text-xs text-muted-foreground">
                    Tipp: Lade den Chart oben im{" "}
                    <a href="#chart-rueckblick" className="text-brand underline-offset-4 hover:underline">
                      Chart-Rückblick
                    </a>{" "}
                    als „Verpasstes Setup“ hoch.
                  </p>
                )}
              </div>
            )}
          </PlanCard>
        )}

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
                    ["true", "Ja", "border-profit bg-profit/20 text-profit"],
                    ["false", "Nein", "border-loss bg-loss/20 text-loss"],
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
            <span className="mb-1 flex size-7 items-center justify-center rounded-lg bg-profit/20 text-profit" aria-hidden>
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
            <span className="mb-1 flex size-7 items-center justify-center rounded-lg bg-loss/20 text-loss" aria-hidden>
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
