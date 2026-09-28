"use client";

import { useState } from "react";
import { PNL_COLORS_COOKIE, PNL_PRESETS, pnlColorsCss, pnlTooSimilar, serializePnlColors, type PnlColors } from "@/lib/pnl-colors";
import { ColorField, CustomPlaceholder, Option, persistStyle } from "./color-theme-picker";

/** Vorgaben oder zwei eigene Farben für Gewinn und Verlust; wirkt sofort und wird pro Browser im Cookie gemerkt. */
export function PnlColorPicker({ value, onChange }: { value: PnlColors; onChange: (next: PnlColors) => void }) {
  // Eigene Farben bleiben erhalten, wenn man zwischendurch eine Vorgabe ausprobiert
  const [lastCustom, setLastCustom] = useState<PnlColors | null>(value.id === "custom" ? value : null);

  const apply = (next: PnlColors) => {
    onChange(next);
    if (next.id === "custom") setLastCustom(next);
    persistStyle(PNL_COLORS_COOKIE, serializePnlColors(next), "pnl-colors", pnlColorsCss(next));
  };

  // Erster Klick auf „Eigene“ startet mit den Farben der aktiven Vorgabe
  const startCustom = () => {
    const from = lastCustom ?? value;
    apply({ id: "custom", profit: from.profit, loss: from.loss });
  };

  return (
    <div className="grid gap-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="radiogroup" aria-label="Gewinn- und Verlustfarben">
        {PNL_PRESETS.map(({ id, label, dark }) => (
          <Option key={id} label={label} active={value.id === id} onSelect={() => apply({ id, ...dark })}>
            <PnlSwatch {...dark} />
          </Option>
        ))}
        <Option label="Eigene" active={value.id === "custom"} onSelect={() => value.id !== "custom" && startCustom()}>
          {lastCustom ? <PnlSwatch profit={lastCustom.profit} loss={lastCustom.loss} /> : <CustomPlaceholder />}
        </Option>
      </div>

      {value.id === "custom" && (
        <div className="grid gap-4 rounded-lg border p-3 sm:grid-cols-2">
          <ColorField label="Gewinn" hint="Gewinne, Long, positive R-Werte" value={value.profit} onChange={(profit) => apply({ ...value, profit })} />
          <ColorField label="Verlust" hint="Verluste, Short, negative R-Werte" value={value.loss} onChange={(loss) => apply({ ...value, loss })} />
          {pnlTooSimilar(value) && (
            <p className="text-sm text-warning sm:col-span-2">Gewinn und Verlust sehen sich sehr ähnlich – auf einen Blick leicht zu verwechseln.</p>
          )}
          <p className="text-sm text-muted-foreground sm:col-span-2">
            Damit Beträge lesbar bleiben, werden die Farben im hellen Modus bei Bedarf abgedunkelt und im dunklen aufgehellt.
          </p>
        </div>
      )}

      <p className="text-sm text-muted-foreground">
        Gilt für Beträge, R-Werte, Long/Short, Kalender und Charts und wird für diesen Browser gespeichert.
      </p>
    </div>
  );
}

const BARS = [0.7, -0.45, 1, 0.55, -0.8];

/** Mini-Vorschau: Tagesbalken wie im P&L-Chart, Gewinne nach oben, Verluste nach unten. */
function PnlSwatch({ profit, loss }: { profit: string; loss: string }) {
  return (
    <span className="flex h-9 w-full items-center justify-center gap-1 rounded-md ring-1 ring-foreground/10 ring-inset" aria-hidden>
      {BARS.map((v, i) => (
        <span key={i} className="flex h-7 w-1.5 flex-col">
          <span className="flex flex-1 items-end">
            {v > 0 && <span className="w-full rounded-t-[2px]" style={{ height: `${v * 100}%`, backgroundColor: profit }} />}
          </span>
          <span className="flex flex-1 items-start">
            {v < 0 && <span className="w-full rounded-b-[2px]" style={{ height: `${-v * 100}%`, backgroundColor: loss }} />}
          </span>
        </span>
      ))}
    </span>
  );
}
