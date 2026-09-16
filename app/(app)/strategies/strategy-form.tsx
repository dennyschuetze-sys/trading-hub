"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { ChecklistEditor } from "@/components/forms/checklist-editor";
import { Field, FormSection, SelectField } from "@/components/forms/field";
import { MarkdownEditor } from "@/components/forms/markdown-editor";
import { useFormAction } from "@/components/forms/use-form-action";
import { STRATEGY_STATUSES, type ChecklistItem, type Strategy } from "@/lib/strategies";
import { saveStrategy } from "./actions";

export function StrategyForm({
  strategy,
  checklist = [],
  userId,
  imageUrls,
}: {
  strategy?: Strategy;
  checklist?: Pick<ChecklistItem, "id" | "label">[];
  userId: string;
  imageUrls?: Record<string, string>;
}) {
  const { state, onSubmit, pending } = useFormAction(saveStrategy.bind(null, strategy?.id ?? null));
  const s = strategy;

  return (
    <Card>
      <CardContent>
        <form onSubmit={onSubmit} className="grid gap-8">
          <FormSection title="Allgemein">
            <Field label="Name *" htmlFor="name" hint="z. B. „London Breakout“">
              <Input id="name" name="name" defaultValue={s?.name} maxLength={100} required />
            </Field>
            <Field label="Status" htmlFor="status">
              <SelectField id="status" options={STRATEGY_STATUSES} defaultValue={s?.status ?? "active"} />
            </Field>
            <Field label="Märkte" htmlFor="markets" hint="Mit Komma trennen, z. B. XAUUSD, NQ">
              <Input id="markets" name="markets" defaultValue={s?.markets.join(", ")} className="uppercase" />
            </Field>
            <Field label="Zeiteinheiten" htmlFor="timeframes" hint="z. B. H4, M15, M5">
              <Input id="timeframes" name="timeframes" defaultValue={s?.timeframes.join(", ")} />
            </Field>
            <Field label="Kurzbeschreibung" htmlFor="summary" className="sm:col-span-2" hint="Ein Satz: Worum geht es?">
              <Input id="summary" name="summary" defaultValue={s?.summary ?? ""} maxLength={500} />
            </Field>
          </FormSection>

          <Separator />

          <section className="grid gap-3">
            <div>
              <h2 className="font-medium">Checkliste vor dem Einstieg</h2>
              <p className="text-sm text-muted-foreground">
                Diese Punkte hakst du beim Erfassen eines Trades ab. So siehst du später, ob sich Regeltreue auszahlt.
              </p>
            </div>
            <ChecklistEditor defaultItems={checklist} />
          </section>

          <Separator />

          <section className="grid gap-3">
            <div>
              <h2 className="font-medium">Einstiegskriterien</h2>
              <p className="text-sm text-muted-foreground">
                Die Auslöser, mit denen du einsteigst – beim Trade wählst du eins davon aus, z. B. „FVG-Retest“ oder „BOS + Pullback“.
              </p>
            </div>
            <ChecklistEditor
              name="criterion"
              defaultItems={(s?.entry_criteria ?? []).map((label, i) => ({ id: String(i), label }))}
              placeholder="z. B. FVG-Retest"
              itemLabel="Einstiegskriterium"
              maxLength={100}
            />
          </section>

          <Separator />

          <section className="grid gap-6">
            <h2 className="font-medium">Regeln</h2>
            <div className="grid gap-6 lg:grid-cols-2">
              <Field label="Einstieg" htmlFor="entry_rules">
                <MarkdownEditor
                  id="entry_rules"
                  name="entry_rules"
                  defaultValue={s?.entry_rules ?? ""}
                  userId={userId}
                  imageUrls={imageUrls}
                  rows={8}
                  placeholder={"- Trend auf H4 bestimmen\n- Einstieg nach Retest …"}
                />
              </Field>
              <Field label="Ausstieg" htmlFor="exit_rules">
                <MarkdownEditor
                  id="exit_rules"
                  name="exit_rules"
                  defaultValue={s?.exit_rules ?? ""}
                  userId={userId}
                  imageUrls={imageUrls}
                  rows={8}
                  placeholder={"- TP1 bei 1R, Rest laufen lassen\n- SL auf Breakeven …"}
                />
              </Field>
              <Field label="Risiko & Money Management" htmlFor="risk_rules">
                <MarkdownEditor
                  id="risk_rules"
                  name="risk_rules"
                  defaultValue={s?.risk_rules ?? ""}
                  userId={userId}
                  imageUrls={imageUrls}
                  rows={6}
                  placeholder={"- Max. 0,5 % Risiko pro Trade\n- Keine Trades 15 Min. vor High-Impact-News"}
                />
              </Field>
              <Field label="Notizen & Beispiele" htmlFor="notes">
                <MarkdownEditor
                  id="notes"
                  name="notes"
                  defaultValue={s?.notes ?? ""}
                  userId={userId}
                  imageUrls={imageUrls}
                  rows={6}
                  placeholder="Beispiel-Charts per Strg+V einfügen"
                />
              </Field>
            </div>
          </section>

          {state.error && <p className="text-sm text-loss">{state.error}</p>}

          <div className="flex gap-2">
            <Button type="submit" disabled={pending}>
              {pending ? "Speichern …" : "Speichern"}
            </Button>
            <Button variant="ghost" asChild>
              <Link href={s ? `/strategies/${s.id}` : "/strategies"}>Abbrechen</Link>
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
