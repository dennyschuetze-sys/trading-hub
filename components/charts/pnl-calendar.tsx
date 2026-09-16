"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { DayResult } from "@/lib/stats";
import { formatMoney } from "@/lib/trading";
import { cn } from "@/lib/utils";
import { longDate } from "./format";

const WEEKDAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const pad = (n: number) => String(n).padStart(2, "0");

function monthLabel(year: number, month: number) {
  return new Intl.DateTimeFormat("de-DE", { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(year, month - 1, 15)),
  );
}

/** Kompakt für kleine Zellen: 1.234 → „1,2 Tsd.“ */
function cellAmount(value: number, currency: string) {
  const abs = Math.abs(value);
  const text =
    abs >= 1000
      ? new Intl.NumberFormat("de-DE", { notation: "compact", maximumFractionDigits: 1 }).format(abs)
      : new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 }).format(abs);
  const symbol = new Intl.NumberFormat("de-DE", { style: "currency", currency }).formatToParts(0).find((p) => p.type === "currency")?.value;
  return `${value > 0 ? "+" : value < 0 ? "−" : ""}${text} ${symbol ?? ""}`.trim();
}

/**
 * Monatskalender der Tagesergebnisse. Die Farbe (Türkis/Rot, Deckkraft nach Betrag) zeigt die Richtung,
 * der Betrag steht immer mit Vorzeichen als Text in der Zelle – Farbe ist nie die einzige Information.
 */
export function PnlCalendar({ days, currency, initialMonth }: { days: DayResult[]; currency: string; initialMonth?: string }) {
  const byDate = useMemo(() => new Map(days.map((d) => [d.date, d])), [days]);
  const fallback = initialMonth ?? days.at(-1)?.date.slice(0, 7) ?? new Date().toISOString().slice(0, 7);
  const [cursor, setCursor] = useState(() => ({ year: Number(fallback.slice(0, 4)), month: Number(fallback.slice(5, 7)) }));

  const { weeks, monthPnl, monthDays, maxAbs } = useMemo(() => {
    const { year, month } = cursor;
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const firstWeekday = (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7; // 0 = Montag
    const cells: (string | null)[] = [
      ...Array<null>(firstWeekday).fill(null),
      ...Array.from({ length: daysInMonth }, (_, i) => `${year}-${pad(month)}-${pad(i + 1)}`),
    ];
    while (cells.length % 7) cells.push(null);

    const inMonth = cells.flatMap((c) => (c && byDate.has(c) ? [byDate.get(c)!] : []));
    return {
      weeks: Array.from({ length: cells.length / 7 }, (_, w) => cells.slice(w * 7, w * 7 + 7)),
      monthPnl: Math.round(inMonth.reduce((s, d) => s + d.pnl, 0) * 100) / 100,
      monthDays: inMonth.length,
      maxAbs: Math.max(1, ...inMonth.map((d) => Math.abs(d.pnl))),
    };
  }, [cursor, byDate]);

  const shift = (delta: number) =>
    setCursor(({ year, month }) => {
      const d = new Date(Date.UTC(year, month - 1 + delta, 1));
      return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
    });

  const wash = (pnl: number) => {
    const strength = Math.round(14 + 46 * Math.min(1, Math.abs(pnl) / maxAbs));
    return pnl === 0 ? undefined : `color-mix(in oklch, var(${pnl > 0 ? "--profit" : "--loss"}) ${strength}%, transparent)`;
  };

  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="font-medium capitalize">{monthLabel(cursor.year, cursor.month)}</p>
          <p className="text-sm text-muted-foreground">
            {monthDays} {monthDays === 1 ? "Handelstag" : "Handelstage"} · {formatMoney(monthPnl, currency, true)}
          </p>
        </div>
        <div className="flex gap-1">
          <Button variant="outline" size="icon" onClick={() => shift(-1)} aria-label="Vorheriger Monat">
            <ChevronLeft className="size-4" />
          </Button>
          <Button variant="outline" size="icon" onClick={() => shift(1)} aria-label="Nächster Monat">
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-[repeat(7,minmax(0,1fr))_minmax(0,1.1fr)] gap-1 text-xs">
        {WEEKDAYS.map((d) => (
          <div key={d} className="px-1 pb-1 text-center text-muted-foreground">
            {d}
          </div>
        ))}
        <div className="px-1 pb-1 text-center text-muted-foreground">Woche</div>

        {weeks.map((week, wi) => {
          const weekDays = week.flatMap((c) => (c && byDate.has(c) ? [byDate.get(c)!] : []));
          const weekPnl = Math.round(weekDays.reduce((s, d) => s + d.pnl, 0) * 100) / 100;
          return (
            <div key={wi} className="contents">
              {week.map((date, di) => {
                if (!date) return <div key={`e${wi}-${di}`} className="aspect-square rounded-md sm:aspect-auto sm:h-16" />;
                const day = byDate.get(date);
                const cell = (
                  <div
                    tabIndex={day ? 0 : -1}
                    className={cn(
                      "flex aspect-square flex-col justify-between rounded-md border p-1 outline-none sm:aspect-auto sm:h-16 sm:p-1.5",
                      day ? "border-transparent focus-visible:ring-2 focus-visible:ring-ring" : "border-border/50 text-muted-foreground",
                    )}
                    style={day ? { background: wash(day.pnl) } : undefined}
                  >
                    <span className="text-[0.625rem] leading-none text-muted-foreground sm:text-xs">{Number(date.slice(8))}</span>
                    {day && (
                      <span className="truncate text-[0.625rem] leading-tight font-medium tabular-nums sm:text-xs">
                        {cellAmount(day.pnl, currency)}
                      </span>
                    )}
                  </div>
                );
                return day ? (
                  <Tooltip key={date}>
                    <TooltipTrigger asChild>{cell}</TooltipTrigger>
                    <TooltipContent>
                      <p className="font-semibold tabular-nums">{formatMoney(day.pnl, currency, true)}</p>
                      <p className="opacity-80">
                        {longDate(date)} · {day.count} {day.count === 1 ? "Trade" : "Trades"}
                      </p>
                    </TooltipContent>
                  </Tooltip>
                ) : (
                  <div key={date}>{cell}</div>
                );
              })}
              <div className="flex aspect-square flex-col justify-center rounded-md bg-muted/40 p-1 text-center sm:aspect-auto sm:h-16">
                {weekDays.length > 0 && (
                  <span className="truncate text-[0.625rem] font-medium tabular-nums sm:text-xs">{cellAmount(weekPnl, currency)}</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
