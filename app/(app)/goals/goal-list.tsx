"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, CircleDashed, Copy, Loader2, Target, Trash2, XCircle } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { parseNumber } from "@/lib/form-data";
import { GOAL_STATUS_LABELS, type Goal, type GoalStatus } from "@/lib/goals";
import type { PeriodType } from "@/lib/periods";
import { cn } from "@/lib/utils";
import { copyGoals, deleteGoal, setManualValue } from "./actions";
import { GoalDialog } from "./goal-dialog";

export type GoalRow = {
  goal: Goal;
  valueText: string;
  targetText: string;
  progress: number;
  status: GoalStatus;
  accountName: string | null;
};

const STATUS_ICON: Record<GoalStatus, { icon: typeof CheckCircle2; className: string }> = {
  reached: { icon: CheckCircle2, className: "text-profit" },
  on_track: { icon: CheckCircle2, className: "text-muted-foreground" },
  open: { icon: CircleDashed, className: "text-muted-foreground" },
  missed: { icon: XCircle, className: "text-loss" },
  failed: { icon: XCircle, className: "text-loss" },
};

function ManualValue({ goal }: { goal: Goal }) {
  const router = useRouter();
  const [value, setValue] = useState(goal.manual_value == null ? "" : String(goal.manual_value).replace(".", ","));
  const [pending, startTransition] = useTransition();

  const save = () =>
    startTransition(async () => {
      try {
        await setManualValue(goal.id, value.trim() ? parseNumber(value) : 0);
        router.refresh();
      } catch {
        toast.error("Stand konnte nicht gespeichert werden");
      }
    });

  return (
    <form
      className="flex items-center gap-1.5"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <Input value={value} onChange={(e) => setValue(e.target.value)} inputMode="decimal" className="h-7 w-20" aria-label={`Stand für „${goal.title}“`} />
      <Button type="submit" size="sm" variant="outline" disabled={pending}>
        {pending ? <Loader2 className="size-4 animate-spin" /> : "Stand speichern"}
      </Button>
    </form>
  );
}

function DeleteGoal({ goal }: { goal: Goal }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={`Ziel „${goal.title}“ löschen`} disabled={pending}>
          <Trash2 className="size-4" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Ziel löschen?</AlertDialogTitle>
          <AlertDialogDescription>„{goal.title}“ wird entfernt.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Abbrechen</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={() =>
              startTransition(async () => {
                try {
                  await deleteGoal(goal.id);
                  router.refresh();
                } catch {
                  toast.error("Löschen fehlgeschlagen");
                }
              })
            }
          >
            Löschen
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function GoalList({
  rows,
  type,
  start,
  previousStart,
  previousCount,
  periodLabel,
  accounts,
}: {
  rows: GoalRow[];
  type: PeriodType;
  start: string;
  previousStart: string;
  previousCount: number;
  periodLabel: string;
  accounts: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [copying, startCopy] = useTransition();
  const reached = rows.filter((r) => r.status === "reached").length;

  const copy = () =>
    startCopy(async () => {
      try {
        const { copied } = await copyGoals(type, previousStart, start);
        toast.success(copied ? `${copied} ${copied === 1 ? "Ziel" : "Ziele"} übernommen` : "Alle Ziele sind schon vorhanden");
        router.refresh();
      } catch {
        toast.error("Übernehmen fehlgeschlagen");
      }
    });

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {rows.length ? `${reached} von ${rows.length} erreicht` : "Noch keine Ziele für diesen Zeitraum."}
        </p>
        <div className="flex flex-wrap gap-2">
          {previousCount > 0 && (
            <Button size="sm" variant="outline" onClick={copy} disabled={copying}>
              {copying ? <Loader2 className="size-4 animate-spin" /> : <Copy className="size-4" />}
              {type === "week" ? "Aus Vorwoche übernehmen" : "Aus Vormonat übernehmen"}
            </Button>
          )}
          <GoalDialog type={type} start={start} periodLabel={periodLabel} accounts={accounts} />
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-md border border-dashed py-8 text-center text-sm text-muted-foreground">
          <Target className="size-6" aria-hidden />
          <p>Setz dir 2–3 Ziele – am besten Prozessziele wie „max. 3 Trades am Tag“ statt reiner Gewinnziele.</p>
        </div>
      ) : (
        <ul className="grid gap-3">
          {rows.map(({ goal, valueText, targetText, progress, status, accountName }) => {
            const meta = STATUS_ICON[status];
            const Icon = meta.icon;
            const atMost = goal.comparison === "at_most";
            return (
              <li key={goal.id} className="grid gap-2 rounded-md border p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium">{goal.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {atMost ? "höchstens" : "mindestens"} {targetText}
                      {accountName ? ` · ${accountName}` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-0.5">
                    <span className="mr-1.5 inline-flex items-center gap-1 text-xs font-medium whitespace-nowrap">
                      <Icon className={cn("size-4", meta.className)} aria-hidden />
                      {GOAL_STATUS_LABELS[status]}
                    </span>
                    <GoalDialog goal={goal} type={type} start={start} periodLabel={periodLabel} accounts={accounts} />
                    <DeleteGoal goal={goal} />
                  </div>
                </div>
                <div
                  className="h-2 overflow-hidden rounded-full bg-muted"
                  role="meter"
                  aria-label={goal.title}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(progress * 100)}
                  aria-valuetext={`${valueText} – ${GOAL_STATUS_LABELS[status]}`}
                >
                  <div
                    className={cn(
                      "h-full rounded-full",
                      status === "failed" || status === "missed" ? "bg-loss" : status === "reached" ? "bg-profit" : "bg-chart-line",
                    )}
                    style={{ width: `${Math.max(progress > 0 ? 2 : 0, Math.round(progress * 100))}%` }}
                  />
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span className="tabular-nums">
                    Stand: <span className="font-medium">{valueText}</span>
                    {atMost && status !== "failed" ? <span className="text-muted-foreground"> (Limit {targetText})</span> : null}
                  </span>
                  {goal.metric === "manual" && <ManualValue goal={goal} />}
                </div>
                {goal.notes && <p className="text-xs text-muted-foreground whitespace-pre-wrap">{goal.notes}</p>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
