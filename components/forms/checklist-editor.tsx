"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Item = { key: string; id: string | null; label: string };

/**
 * Bearbeitbare Checkliste. Schickt je Punkt `checklist_id` (leer = neu) und `checklist_label`
 * in Reihenfolge – der Server gleicht damit Hinzufügen, Ändern, Sortieren und Löschen ab.
 */
export function ChecklistEditor({ defaultItems = [] }: { defaultItems?: { id: string; label: string }[] }) {
  const [items, setItems] = useState<Item[]>(() =>
    defaultItems.length
      ? defaultItems.map((i) => ({ key: i.id, id: i.id, label: i.label }))
      : [{ key: crypto.randomUUID(), id: null, label: "" }],
  );

  const update = (key: string, label: string) => setItems((list) => list.map((i) => (i.key === key ? { ...i, label } : i)));
  const remove = (key: string) => setItems((list) => list.filter((i) => i.key !== key));
  const move = (index: number, delta: number) =>
    setItems((list) => {
      const next = [...list];
      const [item] = next.splice(index, 1);
      next.splice(index + delta, 0, item);
      return next;
    });
  // Neu hinzugefügte Zeile bekommt den Fokus
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const add = (afterIndex?: number) => {
    const key = crypto.randomUUID();
    setItems((list) => {
      const next = [...list];
      next.splice(afterIndex == null ? list.length : afterIndex + 1, 0, { key, id: null, label: "" });
      return next;
    });
    setFocusKey(key);
  };

  return (
    <div className="grid gap-2">
      {items.map((item, index) => (
        <div key={item.key} className="flex items-center gap-1">
          <span className="w-6 text-right text-xs text-muted-foreground tabular-nums">{index + 1}.</span>
          <input type="hidden" name="checklist_id" value={item.id ?? ""} />
          <Input
            name="checklist_label"
            value={item.label}
            onChange={(e) => update(item.key, e.target.value)}
            placeholder="z. B. Higher-Timeframe-Trend bestätigt"
            aria-label={`Checklistenpunkt ${index + 1}`}
            maxLength={200}
            ref={(el) => {
              if (el && item.key === focusKey) {
                el.focus();
                setFocusKey(null);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add(index);
              }
            }}
          />
          <Button type="button" variant="ghost" size="icon" disabled={index === 0} onClick={() => move(index, -1)} aria-label="Nach oben">
            <ArrowUp className="size-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={index === items.length - 1}
            onClick={() => move(index, 1)}
            aria-label="Nach unten"
          >
            <ArrowDown className="size-4" />
          </Button>
          <Button type="button" variant="ghost" size="icon" onClick={() => remove(item.key)} aria-label="Entfernen">
            <Trash2 className="size-4" />
          </Button>
        </div>
      ))}
      <div>
        <Button type="button" variant="outline" size="sm" onClick={() => add()}>
          <Plus className="size-4" /> Punkt hinzufügen
        </Button>
      </div>
    </div>
  );
}
