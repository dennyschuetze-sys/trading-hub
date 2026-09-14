"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Field, SelectField } from "@/components/forms/field";
import { MarkdownEditor } from "@/components/forms/markdown-editor";
import { useFormAction } from "@/components/forms/use-form-action";
import type { Note, Strategy } from "@/lib/strategies";
import { saveNote } from "../actions";

export function NoteForm({
  note,
  strategies,
  defaultStrategyId,
  userId,
  imageUrls,
}: {
  note?: Note;
  strategies: Pick<Strategy, "id" | "name">[];
  defaultStrategyId?: string;
  userId: string;
  imageUrls?: Record<string, string>;
}) {
  const { state, onSubmit, pending } = useFormAction(saveNote.bind(null, note?.id ?? null));

  return (
    <Card>
      <CardContent>
        <form onSubmit={onSubmit} className="grid gap-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Titel *" htmlFor="title" className="sm:col-span-2">
              <Input id="title" name="title" defaultValue={note?.title} maxLength={200} required />
            </Field>
            <Field label="Strategie" htmlFor="strategy_id">
              <SelectField
                id="strategy_id"
                options={strategies.map((s) => ({ value: s.id, label: s.name }))}
                placeholder="Keine"
                defaultValue={note?.strategy_id ?? defaultStrategyId ?? ""}
              />
            </Field>
            <Field label="Tags" htmlFor="tags" hint="Mit Komma trennen">
              <Input id="tags" name="tags" defaultValue={note?.tags.join(", ")} placeholder="Psychologie, Liquidity" />
            </Field>
          </div>

          <Field label="Inhalt" htmlFor="content">
            <MarkdownEditor
              id="content"
              name="content"
              defaultValue={note?.content ?? ""}
              userId={userId}
              imageUrls={imageUrls}
              rows={18}
              placeholder={"## Worum geht es?\n\nNotizen, Erkenntnisse, Beispiel-Charts per Strg+V …"}
            />
          </Field>

          <div className="flex items-center gap-2">
            <input id="pinned" name="pinned" type="checkbox" defaultChecked={note?.pinned} className="size-4 accent-foreground" />
            <Label htmlFor="pinned">Oben anheften</Label>
          </div>

          {state.error && <p className="text-sm text-loss">{state.error}</p>}

          <div className="flex gap-2">
            <Button type="submit" disabled={pending}>
              {pending ? "Speichern …" : "Speichern"}
            </Button>
            <Button variant="ghost" asChild>
              <Link href={note ? `/strategies/notes/${note.id}` : "/strategies#wissen"}>Abbrechen</Link>
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
