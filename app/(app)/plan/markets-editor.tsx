"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, MoveHorizontal, Plus, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { BIASES, type Bias, type MarketPlan } from "@/lib/daily-plan";
import { cn } from "@/lib/utils";
import { PlanLabel } from "./plan-section";

type Row = MarketPlan & { key: string };
const emptyRow = (): Row => ({ key: crypto.randomUUID(), symbol: "", bias: null, levels: "", scenario: "" });

const BIAS_STYLE: Record<Bias, { icon: typeof ArrowUp; active: string }> = {
  bullish: { icon: ArrowUp, active: "bg-profit/15 text-profit" },
  bearish: { icon: ArrowDown, active: "bg-loss/15 text-loss" },
  neutral: { icon: MoveHorizontal, active: "bg-foreground/10 text-foreground" },
};

/** Marktanalyse je Symbol als kompakte Karte: Symbol & Bias, Key-Levels, Szenario („Wenn …, dann …“). */
export function MarketsEditor({ defaultMarkets }: { defaultMarkets: MarketPlan[] }) {
  const [rows, setRows] = useState<Row[]>(() =>
    defaultMarkets.length ? defaultMarkets.map((m) => ({ ...m, key: crypto.randomUUID() })) : [emptyRow()],
  );
  const update = (key: string, patch: Partial<MarketPlan>) =>
    setRows((list) => list.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  return (
    <div className="grid gap-3">
      {rows.map((row, i) => (
        <div key={row.key} className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/[0.07] transition-shadow hover:ring-foreground/[0.11]">
          <div className="flex flex-wrap items-end gap-x-6 gap-y-3 border-b border-border px-5 py-4">
            <div className="grid gap-1.5">
              <PlanLabel>Symbol</PlanLabel>
              <Input
                name="market_symbol"
                value={row.symbol}
                onChange={(e) => update(row.key, { symbol: e.target.value })}
                placeholder="z. B. XAUUSD"
                aria-label={`Markt ${i + 1}: Symbol`}
                className="h-10 w-40 text-base font-semibold tracking-wide uppercase placeholder:font-normal placeholder:tracking-normal placeholder:normal-case"
                maxLength={30}
              />
            </div>
            <div className="grid gap-1.5">
              <PlanLabel>Bias</PlanLabel>
              {/* Gleiche Reihenfolge der Felder je Markt wie bisher – der Server liest sie über den Index */}
              <input type="hidden" name="market_bias" value={row.bias ?? ""} />
              <div className="inline-flex flex-wrap gap-1 rounded-lg border bg-background/40 p-1" role="radiogroup" aria-label={`Markt ${i + 1}: Bias`}>
                {BIASES.map((b) => {
                  const active = row.bias === b.value;
                  const { icon: Icon, active: activeClass } = BIAS_STYLE[b.value];
                  return (
                    <button
                      key={b.value}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => update(row.key, { bias: active ? null : b.value })}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs transition-colors",
                        active ? `font-semibold ${activeClass}` : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      <Icon className="size-3.5" aria-hidden />
                      {b.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setRows((list) => (list.length === 1 ? [emptyRow()] : list.filter((r) => r.key !== row.key)))}
              aria-label={`Markt ${i + 1} entfernen`}
              className="ml-auto flex size-9 items-center justify-center rounded-md text-muted-foreground/70 transition-colors hover:bg-foreground/5 hover:text-foreground"
            >
              <Trash2 className="size-4" />
            </button>
          </div>
          <div className="grid md:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
            <div className="grid gap-2 px-5 py-4">
              <PlanLabel>Key-Levels</PlanLabel>
              <Textarea
                name="market_levels"
                value={row.levels}
                onChange={(e) => update(row.key, { levels: e.target.value })}
                placeholder="z. B. 2350 Widerstand · 2330 Support"
                aria-label={`Markt ${i + 1}: Key-Levels`}
                rows={2}
                maxLength={1000}
                className="min-h-16 resize-y"
              />
            </div>
            <div className="grid gap-2 border-t border-border px-5 py-4 md:border-t-0 md:border-l">
              <PlanLabel>Szenario</PlanLabel>
              <Textarea
                name="market_scenario"
                value={row.scenario}
                onChange={(e) => update(row.key, { scenario: e.target.value })}
                placeholder="Wenn Retest von 2330 hält → Long bis 2350"
                aria-label={`Markt ${i + 1}: Szenario`}
                rows={2}
                maxLength={2000}
                className="min-h-16 resize-y"
              />
            </div>
          </div>
        </div>
      ))}
      <div>
        <button
          type="button"
          onClick={() => setRows((list) => [...list, emptyRow()])}
          className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-foreground/15 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
        >
          <Plus className="size-3.5" /> Markt hinzufügen
        </button>
      </div>
    </div>
  );
}
