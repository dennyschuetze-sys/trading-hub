"use client";

import { useId, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SelectField } from "@/components/forms/field";
import { BIASES, type MarketPlan } from "@/lib/daily-plan";

type Row = MarketPlan & { key: string };
const emptyRow = (): Row => ({ key: crypto.randomUUID(), symbol: "", bias: null, levels: "", scenario: "" });

/** Marktanalyse je Symbol: Bias, Key-Levels und Szenario („Wenn …, dann …“). */
export function MarketsEditor({ defaultMarkets }: { defaultMarkets: MarketPlan[] }) {
  // Stabile IDs für Server und Browser (Zufalls-Keys nur für die Liste, nie als HTML-Attribut)
  const baseId = useId();
  const [rows, setRows] = useState<Row[]>(() =>
    defaultMarkets.length ? defaultMarkets.map((m) => ({ ...m, key: crypto.randomUUID() })) : [emptyRow()],
  );
  const update = (key: string, patch: Partial<MarketPlan>) =>
    setRows((list) => list.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  return (
    <div className="grid gap-3">
      {rows.map((row, i) => (
        <div key={row.key} className="grid gap-3 rounded-md border p-3 md:grid-cols-[8rem_11rem_minmax(0,1fr)_minmax(0,1.4fr)_auto]">
          <Input
            name="market_symbol"
            value={row.symbol}
            onChange={(e) => update(row.key, { symbol: e.target.value })}
            placeholder="Symbol"
            aria-label={`Markt ${i + 1}: Symbol`}
            className="uppercase"
            maxLength={30}
          />
          <SelectField
            id={`${baseId}-bias-${i}`}
            name="market_bias"
            aria-label={`Markt ${i + 1}: Bias`}
            options={BIASES}
            placeholder="Bias …"
            value={row.bias ?? ""}
            onChange={(e) => update(row.key, { bias: (e.target.value || null) as MarketPlan["bias"] })}
          />
          <Textarea
            name="market_levels"
            value={row.levels}
            onChange={(e) => update(row.key, { levels: e.target.value })}
            placeholder={"Key-Levels\nz. B. 2350 Widerstand, 2330 Support"}
            aria-label={`Markt ${i + 1}: Key-Levels`}
            rows={2}
            maxLength={1000}
            className="min-h-9"
          />
          <Textarea
            name="market_scenario"
            value={row.scenario}
            onChange={(e) => update(row.key, { scenario: e.target.value })}
            placeholder={"Szenario\nWenn Retest von 2330 hält → Long bis 2350"}
            aria-label={`Markt ${i + 1}: Szenario`}
            rows={2}
            maxLength={2000}
            className="min-h-9"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => setRows((list) => (list.length === 1 ? [emptyRow()] : list.filter((r) => r.key !== row.key)))}
            aria-label={`Markt ${i + 1} entfernen`}
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      ))}
      <div>
        <Button type="button" variant="outline" size="sm" onClick={() => setRows((list) => [...list, emptyRow()])}>
          <Plus className="size-4" /> Markt hinzufügen
        </Button>
      </div>
    </div>
  );
}
