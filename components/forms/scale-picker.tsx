"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

/** Auswahl 1–5 als Segmente; erneutes Klicken hebt die Auswahl auf. Schickt `name` als Formularfeld. */
export function ScalePicker({
  name,
  label,
  labels,
  defaultValue,
}: {
  name: string;
  label: string;
  labels: string[];
  defaultValue?: number | null;
}) {
  const [value, setValue] = useState<number | null>(defaultValue ?? null);

  return (
    <div className="grid gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium" id={`${name}-label`}>
          {label}
        </span>
        <span className="text-xs text-muted-foreground">{value ? labels[value - 1] : "–"}</span>
      </div>
      <input type="hidden" name={name} value={value ?? ""} />
      <div className="grid grid-cols-5 gap-1" role="radiogroup" aria-labelledby={`${name}-label`}>
        {labels.map((text, i) => {
          const n = i + 1;
          const active = value === n;
          return (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={active}
              aria-label={`${n} – ${text}`}
              title={text}
              onClick={() => setValue(active ? null : n)}
              className={cn(
                "h-9 rounded-md border text-sm tabular-nums transition-colors",
                active ? "border-foreground bg-secondary font-semibold" : "text-muted-foreground hover:border-foreground/30",
              )}
            >
              {n}
            </button>
          );
        })}
      </div>
    </div>
  );
}
