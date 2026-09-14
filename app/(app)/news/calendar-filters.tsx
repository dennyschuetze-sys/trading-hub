"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { SelectField } from "@/components/forms/field";
import { CALENDAR_CURRENCIES } from "@/lib/calendar";
import { cn } from "@/lib/utils";
import { saveNewsSettings } from "./actions";

/** Währungs- und Impact-Filter; wird dauerhaft gespeichert und gilt auch für Dashboard und Tagesplan. */
export function CalendarFilters({
  currencies,
  minImpact,
  suggested,
}: {
  currencies: string[];
  minImpact: string;
  suggested: string[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState(currencies);
  const [impact, setImpact] = useState(minImpact);
  const [pending, startTransition] = useTransition();

  const save = (next: { currencies?: string[]; minImpact?: string }) =>
    startTransition(async () => {
      try {
        await saveNewsSettings(next);
        router.refresh();
      } catch {
        toast.error("Filter konnte nicht gespeichert werden");
      }
    });

  const toggle = (c: string) => {
    const next = selected.includes(c) ? selected.filter((x) => x !== c) : [...selected, c];
    setSelected(next);
    save({ currencies: next });
  };

  const missing = suggested.filter((c) => !selected.includes(c));

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1" role="group" aria-label="Währungen">
          {CALENDAR_CURRENCIES.map((c) => (
            <button
              key={c}
              type="button"
              aria-pressed={selected.includes(c)}
              onClick={() => toggle(c)}
              className={cn(
                "rounded-md border px-2.5 py-1 text-sm transition-colors",
                selected.includes(c) ? "border-foreground/60 bg-secondary font-medium" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {c}
            </button>
          ))}
        </div>
        <SelectField
          id="min_impact"
          aria-label="Mindest-Impact"
          options={[
            { value: "high", label: "Nur hoher Impact" },
            { value: "medium", label: "Mittel & hoch" },
            { value: "low", label: "Alle Termine" },
          ]}
          value={impact}
          onChange={(e) => {
            setImpact(e.target.value);
            save({ minImpact: e.target.value });
          }}
          className="w-full sm:w-48"
        />
        {pending && <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Speichert" />}
      </div>
      {missing.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Du handelst Symbole mit {suggested.join(", ")}.{" "}
          <button
            type="button"
            className="underline underline-offset-4 hover:text-foreground"
            onClick={() => {
              const next = [...new Set([...selected, ...missing])];
              setSelected(next);
              save({ currencies: next });
            }}
          >
            {missing.join(", ")} hinzufügen
          </button>
        </p>
      )}
      {selected.length === 0 && <p className="text-xs text-muted-foreground">Keine Währung gewählt – es werden alle angezeigt.</p>}
    </div>
  );
}
