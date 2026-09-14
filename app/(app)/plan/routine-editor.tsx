"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { RoutineItem } from "@/lib/daily-plan";

type Row = RoutineItem & { key: string };

/** Pre-Market-Routine zum Abhaken; Punkte lassen sich direkt umbenennen, ergänzen und entfernen. */
export function RoutineEditor({ defaultItems }: { defaultItems: RoutineItem[] }) {
  const [rows, setRows] = useState<Row[]>(() => defaultItems.map((r) => ({ ...r, key: crypto.randomUUID() })));
  const done = rows.filter((r) => r.done && r.label.trim()).length;
  const total = rows.filter((r) => r.label.trim()).length;

  const update = (key: string, patch: Partial<RoutineItem>) =>
    setRows((list) => list.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  return (
    <div className="grid gap-2">
      <p className="text-xs text-muted-foreground tabular-nums">
        {done}/{total} erledigt
      </p>
      {rows.map((row, i) => (
        <div key={row.key} className="flex items-center gap-2">
          <input
            type="checkbox"
            name="routine_done"
            value={i}
            checked={row.done}
            onChange={(e) => update(row.key, { done: e.target.checked })}
            aria-label={row.label || `Punkt ${i + 1}`}
            className="size-4 shrink-0 accent-foreground"
          />
          <Input
            name="routine_label"
            value={row.label}
            onChange={(e) => update(row.key, { label: e.target.value })}
            aria-label={`Routinepunkt ${i + 1}`}
            maxLength={200}
            className={row.done ? "text-muted-foreground line-through" : ""}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => setRows((list) => list.filter((r) => r.key !== row.key))}
            aria-label={`Routinepunkt ${i + 1} entfernen`}
          >
            <X className="size-4" />
          </Button>
        </div>
      ))}
      <div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setRows((list) => [...list, { key: crypto.randomUUID(), label: "", done: false }])}
        >
          <Plus className="size-4" /> Punkt hinzufügen
        </Button>
      </div>
    </div>
  );
}
