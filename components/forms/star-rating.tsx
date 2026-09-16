"use client";

import { useState } from "react";
import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

/** Bewertung 1–5 als Sterne; erneutes Klicken auf den gewählten Stern hebt die Auswahl auf. Schickt `name` als Formularfeld. */
export function StarRating({
  name,
  defaultValue,
  labelledBy,
  onChange,
}: {
  name: string;
  defaultValue?: number | null;
  labelledBy?: string;
  onChange?: (value: number | null) => void;
}) {
  const [value, setValue] = useState<number | null>(defaultValue ?? null);
  const [hover, setHover] = useState<number | null>(null);

  const choose = (next: number | null) => {
    setValue(next);
    onChange?.(next);
  };

  return (
    <div className="flex items-center gap-3">
      <input type="hidden" name={name} value={value ?? ""} />
      <div className="flex items-center gap-0.5" role="radiogroup" aria-labelledby={labelledBy} onMouseLeave={() => setHover(null)}>
        {[1, 2, 3, 4, 5].map((n) => {
          const active = value === n;
          const filled = n <= (value ?? 0);
          const previewed = hover != null && n <= hover;
          return (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={active}
              aria-label={`${n} von 5 Sternen`}
              onClick={() => choose(active ? null : n)}
              onMouseEnter={() => setHover(n)}
              className="rounded-md p-1 outline-none focus-visible:ring-2 focus-visible:ring-profit/50"
            >
              <Star
                className={cn(
                  "size-8 transition-colors",
                  previewed
                    ? "fill-profit/35 text-profit/70"
                    : filled
                      ? "fill-profit text-profit"
                      : "text-muted-foreground/35",
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
