import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { STATUS_META } from "@/components/charts/rule-meter";
import type { AccountRules } from "@/lib/prop-rules";
import { formatMoney, pnlClass } from "@/lib/trading";
import { cn } from "@/lib/utils";
import { Eyebrow, MiniBar } from "./status";

type AccountInfo = {
  id: string;
  name: string;
  subtitle: string;
  currency: string;
  starting_balance: number;
  profit_target: number | null;
  drawdown_type: string;
};

function Cell({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("grid content-start gap-1.5 border-r border-b px-3.5 py-3", className)}>
      <Eyebrow>{label}</Eyebrow>
      {children}
    </div>
  );
}

/** Kompakter Account-Stand mit Limits der Prop Firm. */
export function AccountCard({ account: a, rules: r }: { account: AccountInfo; rules: AccountRules }) {
  const money = (v: number | null, signed = false) => formatMoney(v, a.currency, signed);
  const hasRules = Boolean(r.dailyLoss || r.drawdown || r.target);
  const meta = STATUS_META[r.status];
  const StatusIcon = meta.icon;

  return (
    <Card className="gap-0 py-0">
      <CardContent className="grid gap-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Eyebrow className="truncate">{a.name}</Eyebrow>
            {a.subtitle && <p className="mt-0.5 truncate text-xs text-muted-foreground">{a.subtitle}</p>}
          </div>
          {hasRules ? (
            <span className={cn("inline-flex shrink-0 items-center gap-1 text-xs font-medium", meta.text)}>
              <StatusIcon className="size-3.5" aria-hidden /> {meta.label}
            </span>
          ) : (
            <span className="shrink-0 rounded-md border px-2 py-0.5 text-xs text-muted-foreground">Keine Limits</span>
          )}
        </div>

        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <p className="text-3xl font-semibold tracking-tight tabular-nums">{money(r.balance)}</p>
          <span className={cn("text-sm font-semibold tabular-nums", pnlClass(r.netPnl))}>{money(r.netPnl, true)}</span>
        </div>

        {/* Trennlinien je Zelle; der Rand der letzten Spalte/Zeile verschwindet unter overflow-hidden */}
        <div className="overflow-hidden rounded-lg bg-foreground/[0.02] ring-1 ring-border">
          <div className="-mr-px -mb-px grid grid-cols-2 sm:grid-cols-3">
            <Cell label="Start">
              <p className="font-semibold tabular-nums">{money(a.starting_balance)}</p>
            </Cell>
            <Cell label="Heute">
              <p className={cn("font-semibold tabular-nums", pnlClass(r.todayPnl))}>{money(r.todayPnl, true)}</p>
              <p className="text-xs text-muted-foreground">{r.todayTrades === 1 ? "1 Trade" : `${r.todayTrades} Trades`}</p>
            </Cell>
            {r.dailyLoss && (
              <Cell label="Daily Loss">
                <p className="font-semibold tabular-nums">
                  {money(r.dailyLoss.used)} <span className="font-medium text-muted-foreground">/ {money(r.dailyLoss.limit)}</span>
                </p>
                <MiniBar ratio={r.dailyLoss.ratio} />
              </Cell>
            )}
            {r.drawdown && (
              <Cell label={a.drawdown_type === "static" ? "Max. Loss" : "Max. Loss (trailing)"}>
                <p className="font-semibold tabular-nums">
                  {money(Math.max(0, r.drawdown.remaining))} <span className="font-medium text-muted-foreground">frei</span>
                </p>
                <MiniBar ratio={r.drawdown.ratio} />
                <p className="text-xs text-muted-foreground tabular-nums">Grenze {money(r.drawdown.floor)}</p>
              </Cell>
            )}
            {r.target && (
              <Cell label="Profit Target" className={cn(!r.tradingDays.required && "col-span-2 sm:col-span-1")}>
                <p className="font-semibold tabular-nums">{r.target.reached ? "Erreicht" : `${Math.round(r.target.progress * 100)} %`}</p>
                <div className="h-1.5 overflow-hidden rounded-full bg-foreground/[0.06]" aria-hidden>
                  <div className="h-full rounded-full bg-profit" style={{ width: `${Math.min(100, Math.round(r.target.progress * 100))}%` }} />
                </div>
                {!r.target.reached && <p className="text-xs text-muted-foreground tabular-nums">noch {money(r.target.remaining)} bis zum Ziel</p>}
              </Cell>
            )}
            {r.tradingDays.required != null && (
              <Cell label="Trading-Tage">
                <p className="font-semibold tabular-nums">
                  {r.tradingDays.done} <span className="font-medium text-muted-foreground">/ {r.tradingDays.required} min.</span>
                </p>
                {r.tradingDays.done >= r.tradingDays.required && <p className="text-xs text-profit">erfüllt</p>}
              </Cell>
            )}
          </div>
        </div>

        {!hasRules && (
          <p className="text-xs text-muted-foreground">
            Tageslimit, Max. Drawdown und Gewinnziel lassen sich{" "}
            <Link href={`/accounts/${a.id}/edit`} className="underline underline-offset-4 hover:text-foreground">
              im Account hinterlegen
            </Link>
            .
          </p>
        )}
      </CardContent>
    </Card>
  );
}
