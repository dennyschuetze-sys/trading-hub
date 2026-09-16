"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

/** Ja/Nein als zwei Schalter; erneutes Klicken hebt die Auswahl auf (= keine Angabe). Schickt `name` als "true"/"false"/"". */
export function YesNoToggle({
  name,
  defaultValue,
  labelledBy,
  size = "default",
  onChange,
}: {
  name: string;
  defaultValue?: boolean | null;
  labelledBy?: string;
  size?: "default" | "lg";
  onChange?: (value: boolean | null) => void;
}) {
  const [value, setValue] = useState<boolean | null>(defaultValue ?? null);

  return (
    <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-labelledby={labelledBy}>
      <input type="hidden" name={name} value={value == null ? "" : String(value)} />
      {([true, false] as const).map((option) => {
        const active = value === option;
        return (
          <button
            key={String(option)}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => {
              const next = active ? null : option;
              setValue(next);
              onChange?.(next);
            }}
            className={cn(segmentClass(active), size === "lg" ? "h-12" : "h-10")}
          >
            {option ? "Ja" : "Nein"}
          </button>
        );
      })}
    </div>
  );
}

/** Gemeinsamer Stil für Auswahl-Segmente: Türkis = ausgewählt (keine Gewinn/Verlust-Aussage). */
export const segmentClass = (active: boolean) =>
  cn(
    "inline-flex items-center justify-center gap-1.5 rounded-lg border text-sm font-semibold tracking-wide uppercase transition-colors outline-none focus-visible:ring-3 focus-visible:ring-profit/30",
    active
      ? "border-profit bg-profit/12 text-profit"
      : "border-input bg-transparent text-muted-foreground hover:border-foreground/25 hover:text-foreground dark:bg-input/30",
  );
