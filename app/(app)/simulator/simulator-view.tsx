"use client";

import { useMemo, useState } from "react";
import { Info, Settings2, Sparkles, X } from "lucide-react";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { SelectField } from "@/components/forms/field";
import { compactMoney, longDate, niceTicks, shortDate } from "@/components/charts/format";
import {
  WEEKDAY_LABELS,
  actualOutcomes,
  breakevenOutcomes,
  breakevenSweep,
  compareCurve,
  describeRule,
  explainStep,
  findBestScenario,
  minKeptTrades,
  ruleOutcomes,
  rrSweep,
  sameRule,
  scenarioStats,
  targetOutcomes,
  type BestScenario,
  type Rule,
  type RuleKind,
  type ScenarioStats,
  type SimOutcome,
  type SimTrade,
  type Sweep,
} from "@/lib/simulator";
import { berlinParts } from "@/lib/stats";
import { SESSIONS, formatMoney, formatNumber, formatR, labelFor, plural } from "@/lib/trading";
import { cn } from "@/lib/utils";

type Tab = "best" | "rr" | "be";

const TABS: { value: Tab; label: string; short: string; color: string; hint: string }[] = [
  {
    value: "best",
    label: "Bestes Szenario",
    short: "Szenario",
    color: "var(--profit)",
    hint: "Sucht Regeln (Symbole, Tage, Tageslimits …), mit denen deine Trades das beste Ergebnis gebracht hätten.",
  },
  {
    value: "rr",
    label: "Optimales RR",
    short: "RR",
    color: "oklch(0.66 0.17 300)",
    hint: "Fester Take-Profit bei x R statt deines tatsächlichen Ausstiegs – gerechnet mit dem besten Kurs im Trade.",
  },
  {
    value: "be",
    label: "Optimaler Break-even",
    short: "Break-even",
    color: "var(--warning)",
    hint: "SL auf Einstand, sobald der Kurs x R im Plus war – gerechnet mit bestem und schlechtestem Kurs im Trade.",
  },
];

const ACTUAL_COLOR = "var(--chart-axis)";

const pct = (v: number | null) => (v == null ? "–" : `${formatNumber(v * 100, 2)} %`);
const signedPct = (v: number | null) => (v == null ? "–" : `${v > 0 ? "+" : ""}${formatNumber(v * 100, 2)} %`);

export function SimulatorView({
  trades,
  startingBalance,
  currency,
  openCount,
  strategies,
}: {
  trades: SimTrade[];
  startingBalance: number;
  currency: string;
  openCount: number;
  strategies: [string, string][];
}) {
  const strategyNames = useMemo(() => new Map(strategies), [strategies]);
  const [tab, setTab] = useState<Tab>("best");

  // Bestes Szenario: gefunden (Vorschlag) oder manuell eingestellt
  const [best, setBest] = useState<BestScenario | null>(null);
  const [manual, setManual] = useState<Rule[] | null>(null);
  // Ziel-R / Break-even: Sweep erst nach Klick, danach eine Stufe ausgewählt
  const [rr, setRr] = useState<{ sweep: Sweep; level: number | null } | null>(null);
  const [be, setBe] = useState<{ sweep: Sweep; level: number | null } | null>(null);

  const baseline = useMemo(() => scenarioStats(trades, actualOutcomes(trades), startingBalance), [trades, startingBalance]);

  const scenario = useMemo((): Map<string, SimOutcome> | null => {
    if (tab === "best") {
      const rules = manual ?? best?.rules;
      return rules && rules.length ? ruleOutcomes(trades, rules) : null;
    }
    const state = tab === "rr" ? rr : be;
    if (state?.level == null) return null;
    return (tab === "rr" ? targetOutcomes : breakevenOutcomes)(trades, state.level).outcomes;
  }, [tab, manual, best, rr, be, trades]);

  const scenarioResult = useMemo(
    () => (scenario ? scenarioStats(trades, scenario, startingBalance) : null),
    [scenario, trades, startingBalance],
  );
  const curve = useMemo(() => compareCurve(trades, scenario, startingBalance), [trades, scenario, startingBalance]);
  const active = TABS.find((t) => t.value === tab)!;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="grid min-w-0 content-start gap-4">
        <Card className="gap-0 py-0">
          <div className="flex overflow-x-auto border-b px-3 py-3 [scrollbar-width:none] sm:justify-center">
            <div className="mx-auto inline-flex shrink-0 gap-0.5 rounded-lg border bg-background/60 p-0.5" role="tablist" aria-label="Simulation">
              {TABS.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  role="tab"
                  aria-selected={tab === t.value}
                  title={t.hint}
                  onClick={() => setTab(t.value)}
                  className={cn(
                    "flex items-center gap-2 whitespace-nowrap rounded-md px-2.5 py-1.5 text-xs transition-colors sm:px-3 sm:text-sm",
                    tab === t.value
                      ? "bg-secondary font-medium text-foreground shadow-[inset_0_0_0_1px_var(--border)]"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <span
                    className={cn("size-2 rounded-full", tab !== t.value && "opacity-50")}
                    style={{ background: t.color }}
                    aria-hidden
                  />
                  <span className="sm:hidden">{t.short}</span>
                  <span className="hidden sm:inline">{t.label}</span>
                </button>
              ))}
            </div>
          </div>
          <CardContent className="px-3 pt-4 pb-3 sm:px-5">
            <CompareChart points={curve} startingBalance={startingBalance} currency={currency} color={active.color} />
            <div className="mt-2 flex flex-wrap items-center justify-center gap-x-5 gap-y-1 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="h-0.5 w-4 rounded-full" style={{ background: ACTUAL_COLOR }} aria-hidden /> Tatsächlich
              </span>
              {scenario && (
                <span className="flex items-center gap-1.5">
                  <span className="h-0.5 w-4 rounded-full" style={{ background: active.color }} aria-hidden /> Simulation
                </span>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4 sm:grid-cols-3">
          <CompareTile
            label="Ergebnis"
            actual={signedPct(baseline.returnPct)}
            actualDetail={`${formatMoney(baseline.netPnl, currency, true)} · ${baseline.count}`}
            simulated={scenarioResult ? signedPct(scenarioResult.returnPct) : null}
            simulatedDetail={scenarioResult ? `${formatMoney(scenarioResult.netPnl, currency, true)} · ${scenarioResult.count}` : null}
            delta={scenarioResult ? scenarioResult.netPnl - baseline.netPnl : null}
            color={active.color}
          />
          <CompareTile
            label="Trefferquote"
            actual={pct(baseline.winRate)}
            simulated={scenarioResult ? pct(scenarioResult.winRate) : null}
            delta={scenarioResult && baseline.winRate != null && scenarioResult.winRate != null ? scenarioResult.winRate - baseline.winRate : null}
            color={active.color}
          />
          <CompareTile
            label="Ø R"
            actual={formatR(baseline.avgR)}
            simulated={scenarioResult ? formatR(scenarioResult.avgR) : null}
            delta={scenarioResult && baseline.avgR != null && scenarioResult.avgR != null ? scenarioResult.avgR - baseline.avgR : null}
            color={active.color}
          />
        </div>
      </div>

      <Card className="content-start gap-0 py-0">
        <div className="border-b px-5 py-4">
          <p className="text-sm font-semibold">{active.label}</p>
          <p className="mt-1 text-xs text-muted-foreground">{active.hint}</p>
        </div>
        <CardContent className="grid gap-4 px-5 py-5">
          {openCount > 0 && (
            <Notice>
              {plural(openCount, "offener Trade wird", "offene Trades werden")} nicht berücksichtigt – noch kein Ergebnis.
            </Notice>
          )}
          {tab === "best" && (
            <BestPanel
              trades={trades}
              currency={currency}
              strategyNames={strategyNames}
              best={best}
              manual={manual}
              result={scenarioResult}
              onFind={() => {
                setBest(findBestScenario(trades, startingBalance));
                setManual(null);
              }}
              onManual={setManual}
              onClear={() => {
                setBest(null);
                setManual(null);
              }}
            />
          )}
          {tab === "rr" && (
            <SweepPanel
              kind="rr"
              state={rr}
              currency={currency}
              color={active.color}
              onRun={() => {
                const sweep = rrSweep(trades, startingBalance);
                setRr({ sweep, level: sweep.best?.level ?? null });
              }}
              onSelect={(level) => setRr((s) => (s ? { ...s, level } : s))}
              onClear={() => setRr(null)}
            />
          )}
          {tab === "be" && (
            <SweepPanel
              kind="be"
              state={be}
              currency={currency}
              color={active.color}
              onRun={() => {
                const sweep = breakevenSweep(trades, startingBalance);
                setBe({ sweep, level: sweep.best?.level ?? null });
              }}
              onSelect={(level) => setBe((s) => (s ? { ...s, level } : s))}
              onClear={() => setBe(null)}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// Chart -----------------------------------------------------------------------------

function CompareChart({
  points,
  startingBalance,
  currency,
  color,
}: {
  points: ReturnType<typeof compareCurve>;
  startingBalance: number;
  currency: string;
  color: string;
}) {
  const values = points.flatMap((p) => (p.scenario == null ? [p.actual] : [p.actual, p.scenario]));
  const ticks = niceTicks(Math.min(...values, startingBalance), Math.max(...values, startingBalance));
  const dayStarts = points.filter((d, i) => i === 0 || shortDate(d.time) !== shortDate(points[i - 1].time)).map((d) => d.index);
  const every = Math.ceil(dayStarts.length / 7);
  const xTicks = dayStarts.filter((_, i) => i % every === 0);
  const last = points.at(-1)!;

  return (
    <div
      className="h-72 sm:h-96"
      role="img"
      aria-label={`Kontostand tatsächlich ${formatMoney(last.actual, currency)}${last.scenario != null ? `, simuliert ${formatMoney(last.scenario, currency)}` : ""}`}
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--chart-grid)" strokeWidth={1} />
          <XAxis
            dataKey="index"
            type="number"
            domain={[0, points.length - 1]}
            ticks={xTicks}
            tickFormatter={(i: number) => shortDate(points[Math.round(i)]?.time ?? points[0].time)}
            tick={{ fill: "var(--chart-axis)", fontSize: "0.75rem" }}
            tickLine={false}
            axisLine={{ stroke: "var(--chart-grid)" }}
            minTickGap={24}
          />
          <YAxis
            domain={[ticks[0], ticks.at(-1)!]}
            ticks={ticks}
            tickFormatter={(v: number) => compactMoney(v, currency)}
            tick={{ fill: "var(--chart-axis)", fontSize: "0.75rem" }}
            tickLine={false}
            axisLine={false}
            width={72}
          />
          <ReferenceLine y={startingBalance} stroke="var(--chart-axis)" strokeOpacity={0.6} strokeDasharray="3 4" strokeWidth={1} />
          <Tooltip
            cursor={{ stroke: "var(--chart-axis)", strokeWidth: 1, strokeOpacity: 0.6 }}
            content={({ active, payload }) => {
              const p = payload?.[0]?.payload as ComparePointLike | undefined;
              if (!active || !p) return null;
              return (
                <div className="rounded-md border bg-popover px-3 py-2 text-popover-foreground shadow-md">
                  <p className="text-xs text-muted-foreground">{p.index === 0 ? "Start" : `Trade ${p.index} · ${longDate(p.time)}`}</p>
                  {p.scenario != null && (
                    <p className="flex items-center gap-1.5 text-sm font-semibold tabular-nums">
                      <span className="size-2 rounded-full" style={{ background: color }} aria-hidden />
                      {formatMoney(p.scenario, currency)}
                    </p>
                  )}
                  <p className={cn("flex items-center gap-1.5 tabular-nums", p.scenario != null ? "text-xs text-muted-foreground" : "text-sm font-semibold")}>
                    <span className="size-2 rounded-full" style={{ background: ACTUAL_COLOR }} aria-hidden />
                    {formatMoney(p.actual, currency)}
                  </p>
                </div>
              );
            }}
          />
          <Line
            type="linear"
            dataKey="actual"
            stroke={ACTUAL_COLOR}
            strokeWidth={1.5}
            dot={points.length <= 60 ? { r: 2, fill: ACTUAL_COLOR, strokeWidth: 0 } : false}
            activeDot={{ r: 4, fill: ACTUAL_COLOR, stroke: "var(--card)", strokeWidth: 2 }}
            isAnimationActive={false}
          />
          {last.scenario != null && (
            <Line
              type="linear"
              dataKey="scenario"
              stroke={color}
              strokeWidth={2.25}
              dot={points.length <= 60 ? { r: 2.5, fill: color, strokeWidth: 0 } : false}
              activeDot={{ r: 4, fill: color, stroke: "var(--card)", strokeWidth: 2 }}
              animationDuration={700}
            />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

type ComparePointLike = { index: number; time: string; actual: number; scenario: number | null };

function CompareTile({
  label,
  actual,
  actualDetail,
  simulated,
  simulatedDetail,
  delta,
  color,
}: {
  label: string;
  actual: string;
  actualDetail?: string;
  simulated: string | null;
  simulatedDetail?: string | null;
  delta: number | null;
  color: string;
}) {
  return (
    <Card className="gap-0 py-4">
      <CardContent className="grid gap-1.5 px-5">
        <p className="text-[0.6875rem] font-medium uppercase tracking-[0.08em] text-muted-foreground">{label}</p>
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="text-xl font-semibold tabular-nums">{actual}</span>
          <span className="text-xs text-muted-foreground">vs</span>
          {simulated ? (
            <span className="text-xl font-semibold tabular-nums" style={{ color }}>
              {simulated}
            </span>
          ) : (
            <span className="text-xl text-muted-foreground/50">—</span>
          )}
        </div>
        {(actualDetail || simulatedDetail) && (
          <p className="text-xs text-muted-foreground tabular-nums">
            {actualDetail} Trades{simulatedDetail ? ` → ${simulatedDetail} Trades` : ""}
          </p>
        )}
        {delta != null && Math.abs(delta) > 1e-9 && (
          <p className={cn("text-xs font-medium", delta > 0 ? "text-profit" : "text-loss")}>
            {delta > 0 ? "▲ besser" : "▼ schlechter"}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function Notice({ children, tone = "info" }: { children: React.ReactNode; tone?: "info" | "warning" }) {
  return (
    <p className={cn("flex gap-2 text-xs", tone === "warning" ? "text-warning" : "text-muted-foreground")}>
      <Info className="mt-px size-3.5 shrink-0" aria-hidden />
      <span>{children}</span>
    </p>
  );
}

function MiniStats({ items }: { items: [string, string][] }) {
  return (
    <div className="grid grid-cols-3 gap-px overflow-hidden rounded-lg border bg-border">
      {items.map(([label, value]) => (
        <div key={label} className="bg-background/60 px-2 py-2.5 text-center">
          <p className="text-[0.625rem] font-medium uppercase tracking-[0.08em] text-muted-foreground">{label}</p>
          <p className="mt-0.5 text-sm font-semibold tabular-nums">{value}</p>
        </div>
      ))}
    </div>
  );
}

// Bestes Szenario ---------------------------------------------------------------------

function BestPanel({
  trades,
  currency,
  strategyNames,
  best,
  manual,
  result,
  onFind,
  onManual,
  onClear,
}: {
  trades: SimTrade[];
  currency: string;
  strategyNames: Map<string, string>;
  best: BestScenario | null;
  manual: Rule[] | null;
  result: ScenarioStats | null;
  onFind: () => void;
  onManual: (rules: Rule[]) => void;
  onClear: () => void;
}) {
  if (manual) {
    return (
      <>
        <PanelTitle title="Eigene Regeln" onClear={onClear} />
        <RuleEditor trades={trades} rules={manual} onChange={onManual} strategyNames={strategyNames} />
        {result && <ResultSummary result={result} total={trades.length} />}
        <Button variant="outline" onClick={onFind}>
          <Sparkles aria-hidden /> Stattdessen bestes Szenario suchen
        </Button>
      </>
    );
  }

  if (!best) {
    return (
      <>
        <Button onClick={onFind}>
          <Sparkles aria-hidden /> Bestes Szenario finden
        </Button>
        <Button variant="outline" onClick={() => onManual([])}>
          <Settings2 aria-hidden /> Manuell einstellen
        </Button>
      </>
    );
  }

  if (!best.steps.length) {
    return (
      <>
        <PanelTitle title="Vorschlag" onClear={onClear} />
        <Notice>
          Keine Regel verbessert dein Ergebnis spürbar, ohne mehr als {100 - 40} % der Trades wegzulassen. Deine Trades sind
          über Symbole, Tage und Tageslimits recht gleichmäßig verteilt.
        </Notice>
        <Button variant="outline" onClick={() => onManual([])}>
          <Settings2 aria-hidden /> Manuell einstellen
        </Button>
      </>
    );
  }

  return (
    <>
      <PanelTitle title="Vorschlag" onClear={onClear} />
      <ol className="grid gap-3">
        {best.steps.map((step, i) => (
          <li key={i} className="grid gap-0.5">
            <p className="text-sm font-medium">{describeRule(step.rule, strategyNames)}</p>
            <p className="text-xs text-muted-foreground">{explainStep(step, currency)}</p>
          </li>
        ))}
      </ol>
      {result && <ResultSummary result={result} total={trades.length} />}
      <Button variant="outline" onClick={() => onManual(best.rules)}>
        <Settings2 aria-hidden /> Regeln anpassen
      </Button>
    </>
  );
}

function PanelTitle({ title, onClear }: { title: string; onClear: () => void }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <p className="flex items-center gap-2 text-sm font-semibold">
        <Sparkles className="size-4 text-muted-foreground" aria-hidden /> {title}
      </p>
      <button type="button" onClick={onClear} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <X className="size-3" aria-hidden /> Zurücksetzen
      </button>
    </div>
  );
}

function ResultSummary({ result, total }: { result: ScenarioStats; total: number }) {
  return (
    <>
      <MiniStats
        items={[
          ["Ergebnis", signedPct(result.returnPct)],
          ["Trefferquote", pct(result.winRate)],
          ["Trades", String(result.count)],
        ]}
      />
      {result.count < 30 && (
        <Notice tone="warning">
          Nur {result.count} Trades – eine kleine Stichprobe. Vergangene Ergebnisse garantieren nichts für die Zukunft.
        </Notice>
      )}
      {result.count < minKeptTrades(total) && (
        <Notice tone="warning">Die Regeln lassen mehr als 60 % deiner Trades weg – das ist eher Kurvenanpassung als ein Plan.</Notice>
      )}
    </>
  );
}

/** Regel-Auswahl: Chips zum Ausschließen, Auswahlfelder für Tageslimits, Schalter für Haltedauer & Revenge. */
function RuleEditor({
  trades,
  rules,
  onChange,
  strategyNames,
}: {
  trades: SimTrade[];
  rules: Rule[];
  onChange: (rules: Rule[]) => void;
  strategyNames: Map<string, string>;
}) {
  const options = useMemo(() => {
    const count = <V,>(pick: (t: SimTrade) => V | null | undefined) => {
      const m = new Map<V, number>();
      trades.forEach((t) => {
        const v = pick(t);
        if (v != null && v !== "") m.set(v, (m.get(v) ?? 0) + 1);
      });
      return [...m.entries()].sort((a, b) => b[1] - a[1]);
    };
    return {
      symbol: count((t) => t.symbol),
      session: count((t) => t.session),
      weekday: count((t) => berlinParts(t.entry_time).weekday).sort((a, b) => a[0] - b[0]),
      direction: count((t) => t.direction),
      setup: count((t) => t.setup_quality).sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
      strategy: count((t) => t.strategy_id),
      revenge: trades.filter((t) => t.revenge).length,
    };
  }, [trades]);

  const has = (rule: Rule) => rules.some((r) => sameRule(r, rule));
  const toggle = (rule: Rule) => onChange(has(rule) ? rules.filter((r) => !sameRule(r, rule)) : [...rules, rule]);
  const setSingle = (kind: RuleKind, value: number | null) =>
    onChange([...rules.filter((r) => r.kind !== kind), ...(value == null ? [] : [{ kind, value } as Rule])]);
  const valueOf = (kind: RuleKind) => {
    const r = rules.find((x) => x.kind === kind);
    return r && "value" in r ? String(r.value) : "";
  };

  const groups: { title: string; items: { rule: Rule; label: string; count: number }[] }[] = [
    { title: "Symbole", items: options.symbol.map(([v, n]) => ({ rule: { kind: "symbol", value: v }, label: v, count: n })) },
    {
      title: "Sessions",
      items: options.session.map(([v, n]) => ({ rule: { kind: "session", value: v }, label: labelFor(SESSIONS, v), count: n })),
    },
    {
      title: "Wochentage",
      items: options.weekday.map(([v, n]) => ({ rule: { kind: "weekday", value: v }, label: WEEKDAY_LABELS[v].slice(0, 2), count: n })),
    },
    {
      title: "Richtung",
      items: options.direction.map(([v, n]) => ({ rule: { kind: "direction", value: v }, label: v === "long" ? "Long" : "Short", count: n })),
    },
    { title: "Setup-Qualität", items: options.setup.map(([v, n]) => ({ rule: { kind: "setup", value: v }, label: v, count: n })) },
    {
      title: "Strategien",
      items: options.strategy.map(([v, n]) => ({ rule: { kind: "strategy", value: v }, label: strategyNames.get(v) ?? "?", count: n })),
    },
  ];

  const flags: { kind: "overnight" | "weekend" | "revenge"; label: string }[] = [
    { kind: "overnight", label: "Keine Positionen über Nacht" },
    { kind: "weekend", label: "Keine Positionen übers Wochenende" },
    ...(options.revenge ? [{ kind: "revenge" as const, label: `Keine Revenge-Trades (${options.revenge})` }] : []),
  ];

  return (
    <div className="grid gap-4">
      <p className="text-xs text-muted-foreground">Angeklickte Werte werden ausgeschlossen.</p>
      {groups
        .filter((g) => g.items.length > 1)
        .map((g) => (
          <div key={g.title} className="grid gap-1.5">
            <p className="text-[0.6875rem] font-medium uppercase tracking-[0.08em] text-muted-foreground">{g.title}</p>
            <div className="flex flex-wrap gap-1.5">
              {g.items.map((item) => {
                const on = has(item.rule);
                return (
                  <button
                    key={item.label}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggle(item.rule)}
                    className={cn(
                      "rounded-md border px-2 py-1 text-xs tabular-nums transition-colors",
                      on
                        ? "border-loss/40 bg-loss/10 text-loss line-through decoration-loss/60"
                        : "bg-background/60 text-foreground hover:bg-secondary",
                    )}
                  >
                    {item.label} <span className="text-muted-foreground">{item.count}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      <div className="grid grid-cols-2 gap-2">
        <label className="grid gap-1.5">
          <span className="text-[0.6875rem] font-medium uppercase tracking-[0.08em] text-muted-foreground">Max. Trades/Tag</span>
          <SelectField
            id="max-per-day"
            options={[1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: String(n) }))}
            placeholder="Kein Limit"
            value={valueOf("maxPerDay")}
            onChange={(e) => setSingle("maxPerDay", e.target.value ? Number(e.target.value) : null)}
          />
        </label>
        <label className="grid gap-1.5">
          <span className="text-[0.6875rem] font-medium uppercase tracking-[0.08em] text-muted-foreground">Stopp nach Verlusten</span>
          <SelectField
            id="stop-after"
            options={[1, 2, 3].map((n) => ({ value: String(n), label: String(n) }))}
            placeholder="Nie"
            value={valueOf("stopAfterLosses")}
            onChange={(e) => setSingle("stopAfterLosses", e.target.value ? Number(e.target.value) : null)}
          />
        </label>
      </div>
      <div className="grid gap-2">
        {flags.map((f) => (
          <label key={f.kind} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4 accent-brand"
              checked={has({ kind: f.kind })}
              onChange={() => toggle({ kind: f.kind })}
            />
            {f.label}
          </label>
        ))}
      </div>
    </div>
  );
}

// Optimales RR / Break-even --------------------------------------------------------------

function SweepPanel({
  kind,
  state,
  currency,
  color,
  onRun,
  onSelect,
  onClear,
}: {
  kind: "rr" | "be";
  state: { sweep: Sweep; level: number | null } | null;
  currency: string;
  color: string;
  onRun: () => void;
  onSelect: (level: number) => void;
  onClear: () => void;
}) {
  const title = "Auswertung";
  if (!state) {
    return (
      <Button onClick={onRun}>
        <Sparkles aria-hidden /> {kind === "rr" ? "Optimales RR finden" : "Optimalen Break-even finden"}
      </Button>
    );
  }

  const { sweep, level } = state;
  if (!sweep.best) {
    return (
      <>
        <PanelTitle title={title} onClear={onClear} />
        <Notice tone="warning">
          Keiner deiner Trades hat SL, besten Kurs (MFE) und Risiko erfasst – ohne diese Werte lässt sich nicht simulieren. Trage
          beim Journal den besten Kurs im Trade ein oder importiere ihn.
        </Notice>
      </>
    );
  }

  const selected = sweep.points.find((p) => p.level === level) ?? sweep.best;
  const improves = sweep.best.stats.netPnl > sweep.baseline.netPnl;
  const maxAbs = Math.max(...sweep.points.map((p) => Math.abs(p.stats.netPnl - sweep.baseline.netPnl)), 1e-9);
  const noun = kind === "rr" ? "Ziel" : "Break-even ab";

  return (
    <>
      <PanelTitle title={title} onClear={onClear} />
      {improves ? (
        <div>
          <p className="text-xs text-muted-foreground">Bestes Ergebnis mit</p>
          <p className="text-2xl font-semibold tabular-nums" style={{ color }}>
            {noun} {formatNumber(sweep.best.level, 2)} R
          </p>
        </div>
      ) : (
        <p className="text-sm">
          Keine Stufe schlägt dein tatsächliches Ergebnis – {kind === "rr" ? "deine Ausstiege" : "dein Umgang mit dem Einstand"} passt
          bei den simulierbaren Trades bereits.
        </p>
      )}

      {/* Säulen: Mehr-/Minderergebnis gegenüber tatsächlich je Stufe, anklickbar */}
      <div className="grid gap-1.5">
        <p className="text-[0.6875rem] font-medium uppercase tracking-[0.08em] text-muted-foreground">
          Unterschied zu tatsächlich je Stufe
        </p>
        <div className="relative flex h-24 items-stretch gap-px" role="group" aria-label="Stufe wählen">
          <div className="pointer-events-none absolute inset-x-0 top-1/2 border-t border-dashed border-chart-axis/50" aria-hidden />
          {sweep.points.map((p) => {
            const diff = p.stats.netPnl - sweep.baseline.netPnl;
            const h = (Math.abs(diff) / maxAbs) * 50;
            const isSel = p.level === selected.level;
            return (
              <button
                key={p.level}
                type="button"
                aria-pressed={isSel}
                aria-label={`${formatNumber(p.level, 2)} R: ${formatMoney(diff, currency, true)}`}
                title={`${formatNumber(p.level, 2)} R: ${formatMoney(diff, currency, true)}`}
                onClick={() => onSelect(p.level)}
                className="group relative flex-1 rounded-sm hover:bg-secondary"
              >
                <span
                  className={cn("absolute inset-x-[15%] rounded-[2px] transition-opacity", !isSel && "opacity-45 group-hover:opacity-80")}
                  style={{
                    background: diff >= 0 ? color : "var(--loss)",
                    height: `${Math.max(h, 1)}%`,
                    ...(diff >= 0 ? { bottom: "50%" } : { top: "50%" }),
                  }}
                />
              </button>
            );
          })}
        </div>
        <div className="flex justify-between text-[0.6875rem] text-muted-foreground tabular-nums">
          <span>{formatNumber(sweep.points[0].level, 2)} R</span>
          <span>{formatNumber(sweep.points.at(-1)!.level, 2)} R</span>
        </div>
      </div>

      <div>
        <p className="mb-2 text-sm font-medium">
          {noun} {formatNumber(selected.level, 2)} R
          {improves && selected.level === sweep.best.level && <span className="ml-1.5 text-xs font-normal text-muted-foreground">(bestes)</span>}
        </p>
        <MiniStats
          items={[
            ["Ergebnis", signedPct(selected.stats.returnPct)],
            ["Trefferquote", pct(selected.stats.winRate)],
            ["Ø R", formatR(selected.stats.avgR)],
          ]}
        />
      </div>

      <div className="grid gap-2">
        <Notice>
          Simuliert: {plural(sweep.eligible, "Trade", "Trades")} mit SL, bestem Kurs und Risiko.
          {sweep.skipped > 0 && ` ${plural(sweep.skipped, "Trade", "Trades")} ohne diese Werte bleiben unverändert.`}
        </Notice>
        {selected.uncertain > 0 && (
          <Notice tone="warning">
            Bei {plural(selected.uncertain, "Trade", "Trades")} ist der Ausgang offen (
            {kind === "rr"
              ? "vorher ausgestiegen, ohne das Ziel zu erreichen"
              : "im Plus beendet, aber zwischendurch unter Einstand – Reihenfolge unbekannt"}
            ) – dort zählt das tatsächliche Ergebnis.
          </Notice>
        )}
        {sweep.eligible < 30 && (
          <Notice tone="warning">Nur {sweep.eligible} simulierbare Trades – das Ergebnis ist ein Hinweis, kein Beweis.</Notice>
        )}
      </div>
    </>
  );
}
