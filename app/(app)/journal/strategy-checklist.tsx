"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, CheckCircle2 } from "lucide-react";
import { chipClass } from "@/components/forms/choice-chips";
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
  onChange,
}: {
  strategies: StrategyOption[];
  defaultStrategyId?: string | null;
  defaultCriterion?: string | null;
  defaultChecked?: string[];
  /** Neuer Trade: gibt es nur eine Strategie, ist sie vorausgewählt */
  isNew?: boolean;
  /** Nach jeder Änderung von Strategie, Kriterium oder Checkliste */
  onChange?: () => void;
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

  const toggle = (id: string) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    onChange?.();
  };

  const changeStrategy = (id: string) => {
    setStrategyId(id);
    const next = strategies.find((s) => s.id === id);
    if (!next?.entryCriteria.includes(criterion)) setCriterion("");
    onChange?.();
  };

  return (
    <div className="grid gap-5">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <div className="grid content-start gap-1.5">
          <Label htmlFor="strategy_id">Strategie</Label>
          <SelectField
            id="strategy_id"
            options={offered.map((s) => ({ value: s.id, label: s.status === "archived" ? `${s.name} (archiviert)` : s.name }))}
            placeholder={strategies.length ? "Keine Strategie" : "Noch keine Strategien angelegt"}
            value={strategyId}
            onChange={(e) => changeStrategy(e.target.value)}
          />
          {!strategies.length ? (
            <p className="text-xs text-muted-foreground">
              <Link href="/strategies/new" className="underline underline-offset-4 hover:text-foreground">
                Strategie anlegen
              </Link>
              , dann kannst du hier Einstiegskriterien wählen und die Checkliste abhaken.
            </p>
          ) : (
            isNew &&
            offered.length === 1 &&
            strategyId === offered[0].id && <p className="text-xs text-muted-foreground">Einzige aktive Strategie – vorausgewählt</p>
          )}
        </div>

        <div className="grid content-start gap-1.5">
          <Label id="entry_criterion-label">Einstiegskriterium</Label>
          <input type="hidden" name="entry_criterion" value={strategy ? criterion : ""} />
          {!strategy ? (
            <p className="flex h-10 items-center text-sm text-muted-foreground">Erst eine Strategie wählen.</p>
          ) : criteria.length ? (
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-labelledby="entry_criterion-label">
              {criteria.map((c) => {
                const active = criterion === c;
                return (
                  <button
                    key={c}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => {
                      setCriterion(active ? "" : c);
                      onChange?.();
                    }}
                    className={chipClass(active ? "selected" : "idle")}
                  >
                    {active && <Check className="size-3.5" aria-hidden />}
                    {c}
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="flex min-h-10 items-center text-sm text-muted-foreground">
              <span>
                Für diese Strategie sind noch keine Einstiegskriterien hinterlegt.{" "}
                <Link href={`/strategies/${strategy.id}/edit`} className="underline underline-offset-4 hover:text-foreground">
                  Kriterien anlegen
                </Link>
              </span>
            </p>
          )}
        </div>
      </div>

      {strategy && strategy.checklist.length > 0 && (
        <fieldset className="grid gap-3 rounded-xl border bg-foreground/[0.02] p-4">
          <legend className="sr-only">Checkliste {strategy.name}</legend>
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="font-medium">Checkliste · {strategy.name}</span>
            <span
              className={cn(
                "inline-flex items-center gap-1 text-xs tabular-nums",
                done === strategy.checklist.length ? "text-profit" : "text-muted-foreground",
              )}
            >
              {done === strategy.checklist.length && <CheckCircle2 className="size-3.5" aria-hidden />}
              {done}/{strategy.checklist.length} erfüllt
            </span>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {strategy.checklist.map((item) => (
              <label key={item.id} className="flex cursor-pointer items-start gap-2 text-sm">
                <input type="hidden" name="checklist_item" value={item.id} />
                <input
                  type="checkbox"
                  name="checklist_checked"
                  value={item.id}
                  checked={checked.has(item.id)}
                  onChange={() => toggle(item.id)}
                  className="mt-0.5 size-4 shrink-0 accent-[var(--profit)]"
                />
                <span className={checked.has(item.id) ? undefined : "text-muted-foreground"}>{item.label}</span>
              </label>
            ))}
          </div>
        </fieldset>
      )}
    </div>
  );
}
