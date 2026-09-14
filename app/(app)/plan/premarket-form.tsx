"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { ChipSelect } from "@/components/forms/chip-select";
import { Field } from "@/components/forms/field";
import { ScalePicker } from "@/components/forms/scale-picker";
import { useFormAction } from "@/components/forms/use-form-action";
import { SCALE_LABELS, type DailyPlan, type MarketPlan, type RoutineItem } from "@/lib/daily-plan";
import { savePremarket } from "./actions";
import { MarketsEditor } from "./markets-editor";
import { NewsNotesField } from "./news-notes-field";
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
    <Card>
      <CardHeader>
        <CardTitle>Vor der Session</CardTitle>
        <CardDescription>Plane den Tag, bevor der Markt dich plant.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="grid gap-6">
          <Field label="Fokus des Tages" htmlFor="focus" hint="Ein Satz, z. B. „Nur A+-Setups, nach 2 Verlusten Schluss“">
            <Input id="focus" name="focus" defaultValue={plan?.focus ?? ""} maxLength={500} />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <ScalePicker name="mood_before" label="Stimmung" labels={SCALE_LABELS.mood} defaultValue={plan?.mood_before} />
            <ScalePicker name="energy" label="Energie" labels={SCALE_LABELS.energy} defaultValue={plan?.energy} />
          </div>

          <Separator />

          <section className="grid gap-3">
            <div>
              <h3 className="font-medium">Marktanalyse</h3>
              <p className="text-sm text-muted-foreground">Bias, wichtige Levels und dein Plan je Markt.</p>
            </div>
            <MarketsEditor defaultMarkets={markets} />
          </section>

          <Separator />

          <div className="grid gap-6 lg:grid-cols-2">
            <section className="grid content-start gap-3">
              <h3 className="font-medium">Routine</h3>
              <RoutineEditor defaultItems={routine} />
            </section>

            <section className="grid content-start gap-4">
              <h3 className="font-medium">Setups & Limits</h3>
              <div className="grid gap-1.5">
                <Label>Geplante Strategien</Label>
                {strategies.length ? (
                  <ChipSelect
                    name="strategy_ids"
                    tone="neutral"
                    options={strategies.map((s) => ({ value: s.id, label: s.name }))}
                    defaultValue={plan?.strategy_ids ?? []}
                  />
                ) : (
                  <p className="text-sm text-muted-foreground">Noch keine Strategien angelegt.</p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Max. Trades" htmlFor="max_trades">
                  <Input id="max_trades" name="max_trades" type="number" min={0} max={100} defaultValue={plan?.max_trades ?? ""} />
                </Field>
                <Field label="Max. Verlusttrades" htmlFor="max_losses">
                  <Input id="max_losses" name="max_losses" type="number" min={0} max={100} defaultValue={plan?.max_losses ?? ""} />
                </Field>
              </div>
              <NewsNotesField defaultValue={plan?.news_notes ?? ""} events={events} />
            </section>
          </div>

          <Field label="Weitere Notizen" htmlFor="premarket_notes">
            <Textarea id="premarket_notes" name="premarket_notes" rows={3} defaultValue={plan?.premarket_notes ?? ""} maxLength={20000} />
          </Field>

          {state.error && <p className="text-sm text-loss">{state.error}</p>}
          <div>
            <Button type="submit" disabled={pending}>
              {pending ? "Speichern …" : plan ? "Plan aktualisieren" : "Plan speichern"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
