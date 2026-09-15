"use client";

import { useState } from "react";
import { Check, Plus, X } from "lucide-react";
import type { RoutineItem } from "@/lib/daily-plan";
import { cn } from "@/lib/utils";
import { PlanLabel } from "./plan-section";

type Row = RoutineItem & { key: string };

/** Pre-Market-Routine zum Abhaken; Punkte lassen sich direkt umbenennen, ergänzen und entfernen. */
export function RoutineEditor({ defaultItems }: { defaultItems: RoutineItem[] }) {
  const [rows, setRows] = useState<Row[]>(() => defaultItems.map((r) => ({ ...r, key: crypto.randomUUID() })));
  const done = rows.filter((r) => r.done && r.label.trim()).length;
  const total = rows.filter((r) => r.label.trim()).length;
  const percent = total ? Math.round((done / total) * 100) : 0;

  const update = (key: string, patch: Partial<RoutineItem>) =>
    setRows((list) => list.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  return (
    <div className="grid gap-4">
      <div className="grid gap-3">
        <PlanLabel>Routine</PlanLabel>
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-2xl font-semibold tracking-tight tabular-nums">
            {done} <span className="text-sm font-medium text-muted-foreground">/ {total} erledigt</span>
          </p>
          <span className={cn("text-xs font-semibold tabular-nums", done && done === total ? "text-profit" : "text-muted-foreground")}>
            {percent} %
          </span>
        </div>
        <div
          className="h-1.5 overflow-hidden rounded-full bg-foreground/[0.06]"
          role="progressbar"
          aria-label="Routine erledigt"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={done}
        >
          <div className="h-full rounded-full bg-profit transition-[width] duration-300" style={{ width: `${percent}%` }} />
        </div>
      </div>

      <ul className="grid gap-0.5">
        {rows.map((row, i) => (
          <li key={row.key} className="group flex items-center gap-3 rounded-lg px-2 py-1 transition-colors hover:bg-foreground/[0.03]">
            <label className="relative flex size-5 shrink-0 cursor-pointer items-center justify-center">
              <input
                type="checkbox"
                name="routine_done"
                value={i}
                checked={row.done}
                onChange={(e) => update(row.key, { done: e.target.checked })}
                aria-label={row.label || `Punkt ${i + 1}`}
                className="peer absolute inset-0 cursor-pointer appearance-none rounded-md border-[1.5px] border-foreground/25 transition-colors checked:border-profit checked:bg-profit focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              />
              <Check className="pointer-events-none relative size-3.5 text-background opacity-0 transition-opacity peer-checked:opacity-100" strokeWidth={3} aria-hidden />
            </label>
            <input
              name="routine_label"
              value={row.label}
              onChange={(e) => update(row.key, { label: e.target.value })}
              aria-label={`Routinepunkt ${i + 1}`}
              maxLength={200}
              placeholder="Neuer Punkt …"
              className={cn(
                "h-9 min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-2 text-sm transition-colors outline-none hover:border-input focus:border-input focus:bg-background/40",
                row.done && "text-muted-foreground line-through decoration-foreground/25",
              )}
            />
            <button
              type="button"
              onClick={() => setRows((list) => list.filter((r) => r.key !== row.key))}
              aria-label={`Routinepunkt ${i + 1} entfernen`}
              className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground/60 opacity-100 transition-opacity hover:bg-foreground/5 hover:text-foreground focus-visible:opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
            >
              <X className="size-4" />
            </button>
          </li>
        ))}
      </ul>
      <div>
        <button
          type="button"
          onClick={() => setRows((list) => [...list, { key: crypto.randomUUID(), label: "", done: false }])}
          className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-foreground/15 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
        >
          <Plus className="size-3.5" /> Punkt hinzufügen
        </button>
      </div>
    </div>
  );
}
