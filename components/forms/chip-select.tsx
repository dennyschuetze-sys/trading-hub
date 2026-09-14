"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

type Option = string | { value: string; label: string };
const valueOf = (o: Option) => (typeof o === "string" ? o : o.value);
const labelOf = (o: Option) => (typeof o === "string" ? o : o.label);

/** Mehrfachauswahl als anklickbare Chips; schickt jeden gewählten Wert als eigenes Formularfeld. */
export function ChipSelect({
  name,
  options,
  defaultValue = [],
  tone = "loss",
}: {
  name: string;
  options: Option[];
  defaultValue?: string[];
  /** „loss“ für Fehler-Tags, „neutral“ für normale Auswahl */
  tone?: "loss" | "neutral";
}) {
  const [selected, setSelected] = useState<string[]>(defaultValue);
  // Werte, die nicht (mehr) in der Liste stehen, trotzdem anzeigen
  const known = options.map(valueOf);
  const all: Option[] = [...options, ...defaultValue.filter((v) => !known.includes(v))];

  const toggle = (value: string) =>
    setSelected((prev) => (prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]));

  return (
    <div className="flex flex-wrap gap-2">
      {all.map((option) => {
        const value = valueOf(option);
        const active = selected.includes(value);
        return (
          <button
            key={value}
            type="button"
            aria-pressed={active}
            onClick={() => toggle(value)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs transition-colors",
              active
                ? tone === "loss"
                  ? "border-loss/60 bg-loss/15 text-foreground"
                  : "border-foreground/60 bg-secondary font-medium text-foreground"
                : "text-muted-foreground hover:border-foreground/30 hover:text-foreground",
            )}
          >
            {labelOf(option)}
          </button>
        );
      })}
      {selected.map((value) => (
        <input key={value} type="hidden" name={name} value={value} />
      ))}
    </div>
  );
}
