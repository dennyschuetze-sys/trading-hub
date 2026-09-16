"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Ja/Nein als zwei Schalter; erneutes Klicken hebt die Auswahl auf (= keine Angabe). Schickt `name` als "true"/"false"/"". */
export function YesNoToggle({
  name,
  defaultValue,
  labelledBy,
}: {
  name: string;
  defaultValue?: boolean | null;
  labelledBy?: string;
}) {
  const [value, setValue] = useState<boolean | null>(defaultValue ?? null);

  return (
    <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-labelledby={labelledBy}>
      <input type="hidden" name={name} value={value == null ? "" : String(value)} />
      {([true, false] as const).map((option) => {
        const active = value === option;
        return (
          <Button
            key={String(option)}
            type="button"
            variant="outline"
            role="radio"
            aria-checked={active}
            onClick={() => setValue(active ? null : option)}
            className={cn(active && "border-foreground/60 bg-secondary font-medium text-foreground hover:bg-secondary")}
          >
            {option ? "Ja" : "Nein"}
          </Button>
        );
      })}
    </div>
  );
}
