import { AlertOctagon, AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import type { RuleStatus } from "@/lib/prop-rules";
import { cn } from "@/lib/utils";

export const STATUS_META: Record<RuleStatus, { label: string; icon: typeof CheckCircle2; bar: string; text: string }> = {
  ok: { label: "Im Rahmen", icon: CheckCircle2, bar: "bg-profit", text: "text-profit" },
  warning: { label: "Achtung", icon: AlertTriangle, bar: "bg-warning", text: "text-warning" },
  danger: { label: "Kritisch", icon: AlertOctagon, bar: "bg-loss", text: "text-loss" },
  breached: { label: "Verletzt", icon: XCircle, bar: "bg-loss", text: "text-loss" },
};

export function StatusBadge({ status }: { status: RuleStatus }) {
  const meta = STATUS_META[status];
  const Icon = meta.icon;
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium">
      <Icon className={cn("size-3.5", meta.text)} aria-hidden />
      {meta.label}
    </span>
  );
}

/** Verbrauch eines Limits: Balken + Status-Symbol + Beschriftung (Farbe nie allein). */
export function RuleMeter({
  label,
  ratio,
  status,
  detail,
}: {
  label: string;
  ratio: number;
  status: RuleStatus;
  detail: string;
}) {
  const meta = STATUS_META[status];
  const percent = Math.round(ratio * 100);

  return (
    <div className="grid gap-1.5">
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="text-muted-foreground">{label}</span>
        <StatusBadge status={status} />
      </div>
      <div
        className="h-2 overflow-hidden rounded-full bg-muted"
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.min(100, percent)}
        aria-valuetext={`${percent} % verbraucht – ${meta.label}`}
      >
        <div className={cn("h-full rounded-full transition-[width]", meta.bar)} style={{ width: `${Math.min(100, Math.max(ratio > 0 ? 2 : 0, percent))}%` }} />
      </div>
      <p className="text-xs text-muted-foreground tabular-nums">
        {percent} % verbraucht · {detail}
      </p>
    </div>
  );
}
