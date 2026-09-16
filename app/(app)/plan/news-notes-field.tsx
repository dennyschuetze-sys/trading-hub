"use client";

import { useState } from "react";
import { ClipboardPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ImpactLabel } from "@/components/news/event-list";
import type { CalendarEvent } from "@/lib/calendar";
import { PlanLabel } from "./plan-section";

type DayEvent = Pick<CalendarEvent, "id" | "title" | "currency" | "impact"> & { timeLabel: string };

/** News-Notizen mit den Kalender-Terminen des Tages zum Übernehmen. */
export function NewsNotesField({ defaultValue, events }: { defaultValue: string; events: DayEvent[] }) {
  const [value, setValue] = useState(defaultValue);

  const adopt = () => {
    const lines = events
      .filter((e) => e.impact !== "low")
      .map((e) => `${e.timeLabel} ${e.currency} ${e.title}${e.impact === "high" ? " (HIGH)" : ""}`);
    const missing = lines.filter((l) => !value.includes(l));
    if (missing.length) setValue((v) => [v.trim(), ...missing].filter(Boolean).join("\n"));
  };

  return (
    <div className="grid gap-2">
      <PlanLabel htmlFor="news_notes">Wichtige News heute</PlanLabel>
      <Textarea
        id="news_notes"
        name="news_notes"
        rows={3}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        maxLength={5000}
        placeholder="z. B. „14:30 US-CPI – 15 Min. vorher flat“"
        className="min-h-20"
      />
      {events.length > 0 && (
        <div className="grid gap-1.5 rounded-lg border border-border bg-background/30 p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[0.6875rem] font-semibold tracking-[0.08em] text-muted-foreground uppercase">Kalender für diesen Tag</p>
            <Button type="button" variant="ghost" size="sm" onClick={adopt}>
              <ClipboardPlus className="size-4" /> Übernehmen
            </Button>
          </div>
          <ul className="grid gap-1 text-xs">
            {events.map((e) => (
              <li key={e.id} className="flex items-center gap-2">
                <span className="w-16 shrink-0 tabular-nums">{e.timeLabel}</span>
                <span className="w-8 shrink-0 font-medium">{e.currency}</span>
                <ImpactLabel impact={e.impact} compact />
                <span className="truncate">{e.title}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
