"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { SelectField } from "@/components/forms/field";
import { cn } from "@/lib/utils";

export type StrategyOption = {
  id: string;
  name: string;
  status: string;
  checklist: { id: string; label: string }[];
};

/** Strategie-Auswahl mit ihrer Checkliste zum Abhaken. */
export function StrategyChecklist({
  strategies,
  defaultStrategyId,
  defaultChecked = [],
}: {
  strategies: StrategyOption[];
  defaultStrategyId?: string | null;
  defaultChecked?: string[];
}) {
  const [strategyId, setStrategyId] = useState(defaultStrategyId ?? "");
  const [checked, setChecked] = useState(() => new Set(defaultChecked));
  const strategy = strategies.find((s) => s.id === strategyId);
  const done = strategy ? strategy.checklist.filter((i) => checked.has(i.id)).length : 0;

  const toggle = (id: string) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // Archivierte Strategien nur anbieten, wenn der Trade sie schon nutzt
  const options = strategies
    .filter((s) => s.status !== "archived" || s.id === defaultStrategyId)
    .map((s) => ({ value: s.id, label: s.status === "archived" ? `${s.name} (archiviert)` : s.name }));

  return (
    <div className="grid gap-3">
      <SelectField
        id="strategy_id"
        options={options}
        placeholder={strategies.length ? "Keine Strategie" : "Noch keine Strategien angelegt"}
        value={strategyId}
        onChange={(e) => setStrategyId(e.target.value)}
        className="w-full sm:max-w-sm"
      />
      {!strategies.length && (
        <p className="text-xs text-muted-foreground">
          <Link href="/strategies/new" className="underline underline-offset-4">
            Strategie anlegen
          </Link>
          , dann kannst du hier ihre Checkliste abhaken.
        </p>
      )}

      {strategy && strategy.checklist.length > 0 && (
        <fieldset className="grid gap-2 rounded-md border p-3">
          <legend className="flex items-center gap-2 px-1 text-sm">
            Checkliste
            <span
              className={cn(
                "inline-flex items-center gap-1 text-xs",
                done === strategy.checklist.length ? "text-foreground" : "text-muted-foreground",
              )}
            >
              {done === strategy.checklist.length && <CheckCircle2 className="size-3.5 text-profit" aria-hidden />}
              {done}/{strategy.checklist.length} erfüllt
            </span>
          </legend>
          {strategy.checklist.map((item) => (
            <label key={item.id} className="flex cursor-pointer items-start gap-2 text-sm">
              <input type="hidden" name="checklist_item" value={item.id} />
              <input
                type="checkbox"
                name="checklist_checked"
                value={item.id}
                checked={checked.has(item.id)}
                onChange={() => toggle(item.id)}
                className="mt-0.5 size-4 shrink-0 accent-foreground"
              />
              <span>{item.label}</span>
            </label>
          ))}
        </fieldset>
      )}
    </div>
  );
}
