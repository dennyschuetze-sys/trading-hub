"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Field } from "@/components/forms/field";
import { useFormAction } from "@/components/forms/use-form-action";
import type { RiskRules } from "@/lib/risk-rules";
import { saveRiskRules } from "./actions";

function UnitInput({ id, unit, value, placeholder }: { id: string; unit: string; value: number | null; placeholder?: string }) {
  return (
    <div className="relative">
      <Input
        id={id}
        name={id}
        inputMode="decimal"
        defaultValue={value == null ? "" : String(value).replace(".", ",")}
        placeholder={placeholder ?? "aus"}
        className="pr-12"
      />
      <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs text-muted-foreground">{unit}</span>
    </div>
  );
}

/** Persönliche Regeln – strenger als die Prop Firm, damit ein schlechter Tag nicht den Account kostet. */
export function RulesForm({ rules }: { rules: RiskRules }) {
  const { state, onSubmit, pending } = useFormAction(saveRiskRules);

  return (
    <form onSubmit={onSubmit} className="grid gap-6">
      <section className="grid gap-4">
        <div>
          <h3 className="font-medium">Tageslimits</h3>
          <p className="text-sm text-muted-foreground">Gelten je Account – kopierte Trades auf mehreren Accounts zählen dort jeweils einzeln.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Max. Trades pro Tag" htmlFor="max_trades_per_day" hint="Schutz vor Overtrading">
            <UnitInput id="max_trades_per_day" unit="Trades" value={rules.maxTradesPerDay} />
          </Field>
          <Field label="Max. Verluste in Folge" htmlFor="max_consecutive_losses" hint="Danach Pause bis morgen">
            <UnitInput id="max_consecutive_losses" unit="Verluste" value={rules.maxConsecutiveLosses} />
          </Field>
          <Field label="Eigenes Tagesverlust-Limit" htmlFor="daily_loss_limit_pct" hint="In % vom Startkapital, z. B. 2 bei 5 % der Prop Firm">
            <UnitInput id="daily_loss_limit_pct" unit="%" value={rules.dailyLossLimitPct} />
          </Field>
        </div>
      </section>

      <Separator />

      <section className="grid gap-4">
        <div>
          <h3 className="font-medium">Risiko pro Trade</h3>
          <p className="text-sm text-muted-foreground">
            Geprüft wird das beim Trade eingetragene Risiko (mit 5 % Toleranz für gerundete Lotgrößen).
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Maximum" htmlFor="max_risk_per_trade_pct" hint="In % vom Startkapital">
            <UnitInput id="max_risk_per_trade_pct" unit="%" value={rules.maxRiskPerTradePct} />
          </Field>
          <Field label="Standard im Rechner" htmlFor="default_risk_pct" hint="Wird im Positionsrechner vorausgefüllt">
            <UnitInput id="default_risk_pct" unit="%" value={rules.defaultRiskPct} placeholder="z. B. 0,5" />
          </Field>
        </div>
      </section>

      <Separator />

      <section className="grid gap-4">
        <div>
          <h3 className="font-medium">News-Sperrzeiten</h3>
          <p className="text-sm text-muted-foreground">
            Rund um High-Impact-Termine der Währungen des gehandelten Symbols (z. B. USD bei NAS100 oder XAUUSD). Termine werden ab
            dieser Woche gespeichert – ältere Trades können nicht geprüft werden.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Vor dem Termin" htmlFor="news_block_before_min">
            <UnitInput id="news_block_before_min" unit="Min." value={rules.newsBlockBeforeMin} />
          </Field>
          <Field label="Nach dem Termin" htmlFor="news_block_after_min">
            <UnitInput id="news_block_after_min" unit="Min." value={rules.newsBlockAfterMin} />
          </Field>
        </div>
      </section>

      {state.error && <p className="text-sm text-loss">{state.error}</p>}
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Speichern …" : "Regeln speichern"}
        </Button>
      </div>
    </form>
  );
}
