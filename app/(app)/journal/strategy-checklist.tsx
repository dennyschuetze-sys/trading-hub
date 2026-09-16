"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { SelectField } from "@/components/forms/field";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export type StrategyOption = {
  id: string;
  name: string;
  status: string;
  entryCriteria: string[];
  checklist: { id: string; label: string }[];
};

/** Strategie-Auswahl mit Einstiegskriterium und Checkliste zum Abhaken. */
export function StrategyChecklist({
  strategies,
  defaultStrategyId,
  defaultCriterion,
  defaultChecked = [],
  isNew = false,
}: {
  strategies: StrategyOption[];
  defaultStrategyId?: string | null;
  defaultCriterion?: string | null;
  defaultChecked?: string[];
  /** Neuer Trade: gibt es nur eine Strategie, ist sie vorausgewählt */
  isNew?: boolean;
}) {
  // Archivierte Strategien nur anbieten, wenn der Trade sie schon nutzt
  const offered = strategies.filter((s) => s.status !== "archived" || s.id === defaultStrategyId);
  const [strategyId, setStrategyId] = useState(
    defaultStrategyId ?? (isNew && offered.length === 1 ? offered[0].id : ""),
  );
  const [criterion, setCriterion] = useState(defaultCriterion ?? "");
  const [checked, setChecked] = useState(() => new Set(defaultChecked));
  const strategy = strategies.find((s) => s.id === strategyId);
  const done = strategy ? strategy.checklist.filter((i) => checked.has(i.id)).length : 0;

  // Ein gespeichertes Kriterium, das in der Strategie nicht mehr steht, trotzdem anzeigen
  const criteria = strategy
    ? [...strategy.entryCriteria, ...(criterion && !strategy.entryCriteria.includes(criterion) ? [criterion] : [])]
    : [];

  const toggle = (id: string) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const changeStrategy = (id: string) => {
    setStrategyId(id);
    const next = strategies.find((s) => s.id === id);
    if (!next?.entryCriteria.includes(criterion)) setCriterion("");
  };

  return (
    <div className="grid gap-4">
      <SelectField
        id="strategy_id"
        options={offered.map((s) => ({ value: s.id, label: s.status === "archived" ? `${s.name} (archiviert)` : s.name }))}
        placeholder={strategies.length ? "Keine Strategie" : "Noch keine Strategien angelegt"}
        value={strategyId}
        onChange={(e) => changeStrategy(e.target.value)}
        className="w-full sm:max-w-sm"
      />
      {!strategies.length && (
        <p className="text-xs text-muted-foreground">
          <Link href="/strategies/new" className="underline underline-offset-4">
            Strategie anlegen
          </Link>
          , dann kannst du hier ihre Einstiegskriterien auswählen und die Checkliste abhaken.
        </p>
      )}

      {strategy && (
        <div className="grid gap-2">
          <Label id="entry_criterion-label">Einstiegskriterium</Label>
          <input type="hidden" name="entry_criterion" value={criterion} />
          {criteria.length ? (
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-labelledby="entry_criterion-label">
              {criteria.map((c) => {
                const active = criterion === c;
                return (
                  <button
                    key={c}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setCriterion(active ? "" : c)}
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      active
                        ? "border-profit bg-profit/15 font-medium text-profit"
                        : "text-muted-foreground hover:border-foreground/30 hover:text-foreground",
                    )}
                  >
                    {c}
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              Für diese Strategie sind noch keine Einstiegskriterien hinterlegt.{" "}
              <Link href={`/strategies/${strategy.id}/edit`} className="underline underline-offset-4 hover:text-foreground">
                Kriterien anlegen
              </Link>
            </p>
          )}
        </div>
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
