"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

/** Auswahl 1–5 als Segmente; erneutes Klicken hebt die Auswahl auf. Schickt `name` als Formularfeld. */
export function ScalePicker({
  name,
  label,
  labels,
  defaultValue,
  showEnds = false,
}: {
  name: string;
  label: string;
  labels: string[];
  defaultValue?: number | null;
  /** Bedeutung von 1, Mitte und 5 dezent unter den Feldern anzeigen */
  showEnds?: boolean;
}) {
  const [value, setValue] = useState<number | null>(defaultValue ?? null);

  return (
    <div className="grid gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase" id={`${name}-label`}>
          {label}
        </span>
        <span className={cn("text-xs", value ? "font-medium text-profit" : "text-muted-foreground")}>{value ? labels[value - 1] : "–"}</span>
      </div>
      <input type="hidden" name={name} value={value ?? ""} />
      <div className="grid grid-cols-5 gap-1.5" role="radiogroup" aria-labelledby={`${name}-label`}>
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
                "h-10 rounded-lg border text-sm font-semibold tabular-nums transition-all outline-none focus-visible:ring-2 focus-visible:ring-ring",
                active
                  ? "border-profit bg-profit/15 text-profit shadow-[0_0_0_3px_color-mix(in_oklch,var(--profit)_12%,transparent)]"
                  : "border-input bg-background/40 text-muted-foreground hover:border-foreground/25 hover:text-foreground",
              )}
            >
              {n}
            </button>
          );
        })}
      </div>
      {showEnds && labels.length >= 3 && (
        <div className="flex justify-between gap-2 text-[11px] text-muted-foreground/70">
          <span>{labels[0]}</span>
          <span className="hidden sm:inline">{labels[Math.floor(labels.length / 2)]}</span>
          <span>{labels.at(-1)}</span>
        </div>
      )}
    </div>
  );
}
