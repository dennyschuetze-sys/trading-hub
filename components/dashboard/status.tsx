import Link from "next/link";
import { AlertOctagon, AlertTriangle, ArrowRight, CheckCircle2, CircleDashed, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { STATUS_META } from "@/components/charts/rule-meter";
import type { Attention, StatusRow } from "@/lib/dashboard";
import type { RuleStatus } from "@/lib/prop-rules";
import { formatMoney } from "@/lib/trading";
import { cn } from "@/lib/utils";

export type Tone = Attention["tone"] | "open";

const TONE_META: Record<Tone, { icon: typeof CheckCircle2; className: string }> = {
  ok: { icon: CheckCircle2, className: "text-profit" },
  info: { icon: Info, className: "text-muted-foreground" },
  open: { icon: CircleDashed, className: "text-muted-foreground" },
  warning: { icon: AlertTriangle, className: "text-warning" },
  danger: { icon: AlertOctagon, className: "text-loss" },
};

export function ToneIcon({ tone, className }: { tone: Tone; className?: string }) {
  const { icon: Icon, className: color } = TONE_META[tone];
  return <Icon className={cn("size-4 shrink-0", color, className)} aria-hidden />;
}

const barColor = (ratio: number) => (ratio >= 0.8 ? "bg-loss" : ratio >= 0.5 ? "bg-warning" : "bg-profit");

export function MiniBar({ ratio, className }: { ratio: number; className?: string }) {
  const percent = Math.min(100, Math.max(0, Math.round(ratio * 100)));
  return (
    <div className={cn("h-1.5 overflow-hidden rounded-full bg-foreground/[0.06]", className)} aria-hidden>
      <div className={cn("h-full rounded-full", barColor(ratio))} style={{ width: `${percent}%` }} />
    </div>
  );
}

export const Eyebrow = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <p className={cn("text-[0.6875rem] font-medium uppercase tracking-[0.08em] text-muted-foreground", className)}>{children}</p>
);

function LimitCell({ label, value, max, ratio, hint }: { label: string; value: string; max?: string; ratio?: number; hint: string }) {
  return (
    <div className="grid content-start gap-2 bg-card/60 px-4 py-3.5">
      <Eyebrow>{label}</Eyebrow>
      <p className="text-2xl font-semibold tabular-nums">
        {value}
        {max && <span className="text-base font-medium text-muted-foreground"> / {max}</span>}
      </p>
      {ratio != null && <MiniBar ratio={ratio} />}
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

const STATUS_STYLE: Record<RuleStatus, { card: string; wash: string; pill: string }> = {
  ok: { card: "ring-profit/25", wash: "--profit", pill: "bg-profit/15 text-profit ring-profit/35" },
  warning: { card: "ring-warning/35", wash: "--warning", pill: "bg-warning/15 text-warning ring-warning/40" },
  danger: { card: "ring-loss/40", wash: "--loss", pill: "bg-loss/15 text-loss ring-loss/40" },
  breached: { card: "ring-loss/40", wash: "--loss", pill: "bg-loss/15 text-loss ring-loss/40" },
};

export type StatusCheck = { label: string; tone: Tone; text: string };

/** „Darf ich heute traden?“ – Limits des Fokus-Accounts, Tagesplan, Regeln und News auf einen Blick. */
export function TradingStatusCard({
  account,
  row,
  status,
  checks,
}: {
  account: { name: string; subtitle: string } | null;
  row: StatusRow | null;
  status: RuleStatus;
  checks: StatusCheck[];
}) {
  const style = STATUS_STYLE[status];
  const meta = STATUS_META[status];
  const StatusIcon = meta.icon;
  const money = (v: number) => formatMoney(v, row?.currency);

  const trades = row?.today.trades;
  const streak = row?.today.lossStreak;
  // Persönliches Tageslimit hat Vorrang, sonst das Limit der Prop Firm
  const dailyLoss = row?.today.dailyLoss ?? row?.prop.dailyLoss ?? null;

  return (
    <Card
      className={cn("gap-0 py-0", style.card)}
      style={{ backgroundImage: `linear-gradient(160deg, color-mix(in oklch, var(${style.wash}) 9%, transparent), transparent 55%)` }}
    >
      <CardContent className="grid gap-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <Eyebrow>Trading-Status</Eyebrow>
            <p className="mt-1 truncate text-lg font-semibold">{account?.name ?? "Kein aktiver Account"}</p>
            {account?.subtitle && <p className="text-xs text-muted-foreground">{account.subtitle}</p>}
          </div>
          <span className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold tracking-wide uppercase ring-1", style.pill)}>
            <StatusIcon className="size-3.5" aria-hidden />
            {meta.label}
          </span>
        </div>

        {row && (
          <div className="grid gap-px overflow-hidden rounded-lg bg-border ring-1 ring-border sm:grid-cols-3">
            <LimitCell
              label="Trades heute"
              value={String(trades?.count ?? row.prop.todayTrades)}
              max={trades ? String(trades.max) : undefined}
              ratio={trades ? trades.count / trades.max : undefined}
              hint={trades ? (trades.count >= trades.max ? "Limit erreicht" : `noch ${trades.max - trades.count} möglich`) : "ohne Tageslimit"}
            />
            <LimitCell
              label="Verluste in Folge"
              value={streak ? String(streak.count) : "–"}
              max={streak ? String(streak.max) : undefined}
              ratio={streak ? streak.count / streak.max : undefined}
              hint={streak ? (streak.count >= streak.max ? "Pause bis morgen" : "heute") : "ohne Regel"}
            />
            <LimitCell
              label="Daily Loss"
              value={dailyLoss ? money(dailyLoss.used) : money(Math.min(0, row.prop.todayPnl))}
              max={dailyLoss ? money(dailyLoss.limit) : undefined}
              ratio={dailyLoss?.ratio}
              hint={dailyLoss ? `noch ${money(Math.max(0, dailyLoss.remaining))} verbleibend` : "ohne Tageslimit"}
            />
          </div>
        )}

        <ul className="grid gap-2 sm:grid-cols-3">
          {checks.map((c) => (
            <li key={c.label} className="flex items-center gap-2.5 rounded-lg bg-foreground/[0.035] px-3 py-2.5">
              <ToneIcon tone={c.tone} />
              <div className="min-w-0">
                <p className="text-sm font-medium">{c.label}</p>
                <p className="truncate text-xs text-muted-foreground">{c.text}</p>
              </div>
            </li>
          ))}
        </ul>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href="/plan">Tagesplan öffnen</Link>
          </Button>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/risk">
              Risiko-Tools <ArrowRight className="size-4" />
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/** Auffälligkeiten des Tages – nur tatsächliche Zustände. */
export function AttentionCard({ items }: { items: Attention[] }) {
  return (
    <Card className="gap-0 py-0">
      <CardContent className="grid content-start gap-3 p-5">
        <p className="text-sm font-semibold">Hinweise</p>
        {items.length ? (
          <ul className="grid gap-2">
            {items.map((item) => {
              const body = (
                <>
                  <ToneIcon tone={item.tone} className="mt-0.5" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{item.title}</p>
                    {item.detail && <p className="text-xs text-muted-foreground">{item.detail}</p>}
                  </div>
                </>
              );
              const className = "flex items-start gap-2.5 rounded-lg bg-foreground/[0.035] px-3 py-2.5";
              return (
                <li key={item.title}>
                  {item.href ? (
                    <Link href={item.href} className={cn(className, "transition-colors hover:bg-foreground/[0.06]")}>
                      {body}
                    </Link>
                  ) : (
                    <div className={className}>{body}</div>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <ToneIcon tone="ok" /> Nichts Auffälliges heute.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
