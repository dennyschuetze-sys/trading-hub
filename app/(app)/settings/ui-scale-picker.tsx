"use client";

import { useState } from "react";
import { UI_SCALE_COOKIE, UI_SCALES, type UiScale } from "@/lib/ui-scale";
import { cn } from "@/lib/utils";

/** Stufen für die Anzeigegröße; wirkt sofort und wird pro Browser im Cookie gemerkt. */
export function UiScalePicker({ initial }: { initial: UiScale }) {
  const [scale, setScale] = useState<UiScale>(initial);

  const choose = (value: UiScale) => {
    setScale(value);
    document.cookie = `${UI_SCALE_COOKIE}=${value}; path=/; max-age=31536000; samesite=lax`;
    document.documentElement.style.fontSize = `${value}%`;
  };

  return (
    <div className="grid gap-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="radiogroup" aria-label="Anzeigegröße">
        {UI_SCALES.map(({ value, label }) => {
          const active = scale === value;
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => choose(value)}
              className={cn(
                "grid justify-items-center gap-1 rounded-lg border px-3 py-3 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
                active
                  ? "border-profit bg-profit/10 text-foreground"
                  : "text-muted-foreground hover:border-foreground/30 hover:text-foreground",
              )}
            >
              {/* Vorschau in fester Größe, damit die Stufen vergleichbar bleiben */}
              <span className="leading-none font-semibold" style={{ fontSize: `${(value / 100) * 18}px` }} aria-hidden>
                Aa
              </span>
              <span className="text-sm">{label}</span>
            </button>
          );
        })}
      </div>
      <p className="text-sm text-muted-foreground">Gilt sofort für die ganze App und wird für diesen Browser gespeichert.</p>
    </div>
  );
}
