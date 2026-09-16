"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { segmentClass } from "./yes-no-toggle";

type Option = string | { value: string; label: string };
const valueOf = (o: Option) => (typeof o === "string" ? o : o.value);
const labelOf = (o: Option) => (typeof o === "string" ? o : o.label);

/**
 * Einfachauswahl als Chips oder große Segmente; erneutes Klicken hebt die Auswahl auf.
 * Ein gespeicherter Wert, der nicht (mehr) in der Liste steht, wird trotzdem angezeigt.
 */
export function ChoiceChips({
  name,
  options,
  defaultValue,
  variant = "chip",
  labelledBy,
  onChange,
}: {
  name: string;
  options: Option[];
  defaultValue?: string | null;
  variant?: "chip" | "segment";
  labelledBy?: string;
  onChange?: (value: string | null) => void;
}) {
  const [value, setValue] = useState<string | null>(defaultValue ?? null);
  const known = options.map(valueOf);
  const all: Option[] = defaultValue && !known.includes(defaultValue) ? [...options, defaultValue] : options;

  return (
    <div
      role="radiogroup"
      aria-labelledby={labelledBy}
      className={variant === "segment" ? "grid gap-2" : "flex flex-wrap gap-2"}
      style={variant === "segment" ? { gridTemplateColumns: `repeat(${all.length}, minmax(0, 1fr))` } : undefined}
    >
      <input type="hidden" name={name} value={value ?? ""} />
      {all.map((option) => {
        const v = valueOf(option);
        const active = value === v;
        return (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => {
              const next = active ? null : v;
              setValue(next);
              onChange?.(next);
            }}
            className={
              variant === "segment"
                ? cn(segmentClass(active), "h-12 text-base tracking-normal normal-case")
                : chipClass(active ? "selected" : "idle")
            }
          >
            {labelOf(option)}
          </button>
        );
      })}
    </div>
  );
}

/** Chip-Stil: Türkis für Auswahl, gedämpftes Rot für markierte Fehler, sonst dezentes Anthrazit. */
export const chipClass = (state: "idle" | "selected" | "error") =>
  cn(
    "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-sm transition-colors outline-none focus-visible:ring-3 focus-visible:ring-profit/30",
    state === "selected" && "border-profit/50 bg-profit/12 font-medium text-profit",
    state === "error" && "border-loss/50 bg-loss/12 font-medium text-loss",
    state === "idle" && "border-foreground/[0.07] bg-foreground/[0.04] text-muted-foreground hover:border-foreground/20 hover:text-foreground",
  );
