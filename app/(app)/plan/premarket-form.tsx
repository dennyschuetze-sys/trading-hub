"use client";

import Link from "next/link";
import { Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ChipSelect } from "@/components/forms/chip-select";
import { ScalePicker } from "@/components/forms/scale-picker";
import { useFormAction } from "@/components/forms/use-form-action";
import { SCALE_LABELS, type DailyPlan, type MarketPlan, type RoutineItem } from "@/lib/daily-plan";
import { formatDateTime } from "@/lib/trading";
import { savePremarket } from "./actions";
import { MarketsEditor } from "./markets-editor";
import { NewsNotesField } from "./news-notes-field";
import { PlanCard, PlanLabel, PlanSection } from "./plan-section";
import { RoutineEditor } from "./routine-editor";

export function PremarketForm({
  date,
  plan,
  markets,
  routine,
  strategies,
  events,
}: {
  date: string;
  plan: DailyPlan | null;
  markets: MarketPlan[];
  routine: RoutineItem[];
  strategies: { id: string; name: string }[];
  events: React.ComponentProps<typeof NewsNotesField>["events"];
}) {
  const { state, onSubmit, pending } = useFormAction(savePremarket.bind(null, date));

  return (
    <form onSubmit={onSubmit} className="grid gap-12">
      {/* 01 ---------------------------------------------------------------------------- */}
      <PlanSection id="vor-der-session" number="01" title="Vor der Session" description="Plane deinen Tag, bevor der Markt dich plant.">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
          <PlanCard
            className="grid content-start gap-3 ring-profit/20 hover:ring-profit/30"
          >
            <PlanLabel htmlFor="focus">Fokus des Tages</PlanLabel>
            <Input
              id="focus"
              name="focus"
              defaultValue={plan?.focus ?? ""}
              maxLength={500}
              placeholder="Geduldig bleiben und nur A+ Setups handeln."
              className="h-14 border-profit/25 px-4 text-lg font-medium tracking-tight md:text-lg"
            />
            <p className="text-xs text-muted-foreground/80">Ein Satz, z. B. „Nur A+-Setups, nach 2 Verlusten Schluss“</p>
          </PlanCard>

          <PlanCard className="grid content-start gap-5">
            <PlanLabel>Mentaler Zustand</PlanLabel>
            <ScalePicker name="mood_before" label="Stimmung" labels={SCALE_LABELS.mood} defaultValue={plan?.mood_before} showEnds />
            <ScalePicker name="energy" label="Energie" labels={SCALE_LABELS.energy} defaultValue={plan?.energy} showEnds />
          </PlanCard>
        </div>
      </PlanSection>

      {/* 02 ---------------------------------------------------------------------------- */}
      <PlanSection id="marktanalyse" number="02" title="Marktanalyse" description="Bias, wichtige Levels und dein Plan je Markt.">
        <MarketsEditor defaultMarkets={markets} />
      </PlanSection>

      {/* 03 ---------------------------------------------------------------------------- */}
      <PlanSection
        id="routine-risiko"
        number="03"
        title="Routine & Risiko"
        description="Vorbereitung abhaken und deine Trading-Limits festlegen."
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <PlanCard>
            <RoutineEditor defaultItems={routine} />
          </PlanCard>

          <PlanCard className="grid content-start gap-6">
            <PlanLabel>Setups & Limits</PlanLabel>

            <div className="grid gap-2">
              <PlanLabel>Geplante Strategien</PlanLabel>
              {strategies.length ? (
                <ChipSelect
                  name="strategy_ids"
                  tone="neutral"
                  options={strategies.map((s) => ({ value: s.id, label: s.name }))}
                  defaultValue={plan?.strategy_ids ?? []}
                />
              ) : (
                <p className="rounded-lg border border-dashed border-foreground/15 px-3 py-2.5 text-sm text-muted-foreground">
                  Noch keine Strategien angelegt.{" "}
                  <Link href="/strategies/new" className="text-profit underline-offset-4 hover:underline">
                    Strategie anlegen
                  </Link>
                </p>
              )}
            </div>

            <div className="grid gap-2">
              <PlanLabel>Trading-Limits</PlanLabel>
              <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg bg-border ring-1 ring-border">
                {(
                  [
                    ["max_trades", "Max. Trades", plan?.max_trades, "Trades"],
                    ["max_losses", "Max. Verlusttrades", plan?.max_losses, "Verluste"],
                  ] as const
                ).map(([name, label, value, unit]) => (
                  <div key={name} className="grid gap-1 bg-background/60 px-4 py-3">
                    <PlanLabel htmlFor={name}>{label}</PlanLabel>
                    <div className="flex items-baseline gap-2">
                      <input
                        id={name}
                        name={name}
                        type="number"
                        inputMode="numeric"
                        min={0}
                        max={100}
                        defaultValue={value ?? ""}
                        placeholder="–"
                        className="w-16 min-w-0 bg-transparent text-3xl font-semibold tracking-tight tabular-nums outline-none placeholder:text-muted-foreground/40 [appearance:textfield] focus-visible:text-profit [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                      />
                      <span className="text-xs text-muted-foreground">{unit}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <NewsNotesField defaultValue={plan?.news_notes ?? ""} events={events} />
          </PlanCard>
        </div>

        <PlanCard className="grid gap-2 py-4 sm:py-4">
          <PlanLabel htmlFor="premarket_notes">Notizen</PlanLabel>
          <Textarea
            id="premarket_notes"
            name="premarket_notes"
            rows={2}
            defaultValue={plan?.premarket_notes ?? ""}
            maxLength={20000}
            placeholder="Weitere Gedanken zum Tag …"
            className="min-h-14"
          />
        </PlanCard>

        {/* Speichern bleibt beim Scrollen durch die Vorbereitung am unteren Rand erreichbar */}
        <div className="sticky bottom-4 z-20 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-card/95 py-3 pr-3 pl-5 shadow-[0_16px_40px_-20px_oklch(0_0_0/80%)] ring-1 ring-foreground/10 backdrop-blur">
          <p className="text-xs text-muted-foreground">
            {state.error ? (
              <span className="text-loss">{state.error}</span>
            ) : plan ? (
              `Plan gespeichert · zuletzt geändert ${formatDateTime(plan.updated_at)}`
            ) : (
              "Noch nicht gespeichert"
            )}
          </p>
          <Button type="submit" disabled={pending} className="h-10 bg-profit px-5 text-xs font-bold tracking-[0.08em] text-background uppercase hover:bg-profit/90">
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" strokeWidth={2.5} />}
            {pending ? "Speichern …" : plan ? "Plan aktualisieren" : "Plan speichern"}
          </Button>
        </div>
      </PlanSection>
    </form>
  );
}
