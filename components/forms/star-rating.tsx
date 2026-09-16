"use client";

import { useState } from "react";
import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

/** Bewertung 1–5 als Sterne; erneutes Klicken auf den gewählten Stern hebt die Auswahl auf. Schickt `name` als Formularfeld. */
export function StarRating({
  name,
  defaultValue,
  labelledBy,
}: {
  name: string;
  defaultValue?: number | null;
  labelledBy?: string;
}) {
  const [value, setValue] = useState<number | null>(defaultValue ?? null);
  const [hover, setHover] = useState<number | null>(null);
  const shown = hover ?? value ?? 0;

  return (
    <div className="flex items-center gap-3">
      <input type="hidden" name={name} value={value ?? ""} />
      <div className="flex items-center gap-1" role="radiogroup" aria-labelledby={labelledBy} onMouseLeave={() => setHover(null)}>
        {[1, 2, 3, 4, 5].map((n) => {
          const active = value === n;
          return (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={active}
              aria-label={`${n} von 5 Sternen`}
              onClick={() => setValue(active ? null : n)}
              onMouseEnter={() => setHover(n)}
              className="rounded-md p-1 outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Star
                className={cn(
                  "size-7 transition-colors",
                  n <= shown ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40",
                )}
                aria-hidden
              />
            </button>
          );
        })}
      </div>
      {value && <span className="text-sm text-muted-foreground tabular-nums">{value}/5</span>}
    </div>
  );
}
