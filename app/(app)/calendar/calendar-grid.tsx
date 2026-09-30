import Link from "next/link";
import { CircleSlash2 } from "lucide-react";
import { cellAmount, longDate, pnlWash } from "@/components/charts/format";
import { NO_TRADE_REASONS } from "@/lib/daily-plan";
import { formatMoney, labelFor, plural } from "@/lib/trading";
import { monthWeeks, type CalendarDay } from "@/lib/trading-calendar";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

/** Für Screenreader und Tooltip: alles, was die Zelle zeigt, als Text. */
function dayDescription(date: string, day: CalendarDay | undefined, currency: string) {
  const parts: string[] = [];
  if (day?.closed) parts.push(`${formatMoney(day.pnl, currency, true)}, ${plural(day.closed, "Trade", "Trades")}`);
  if (day?.open) parts.push(`${day.open} offen`);
  if (day?.noTrade && !day.closed) {
    parts.push(day.noTradeReason ? `Kein Trade (${labelFor(NO_TRADE_REASONS, day.noTradeReason)})` : "Kein Trade");
  }
  return `${longDate(date)}${parts.length ? `: ${parts.join(", ")}` : ""}`;
}

/**
 * Monatsraster der Handelstage. Die Farbe zeigt Gewinn oder Verlust, Betrag und Symbole stehen zusätzlich als
 * Text in der Zelle – Farbe ist nie die einzige Information. Ein Tag mit Trades wählt sie für die Liste darunter aus,
 * jeder andere Tag führt zum Tagesplan.
 */
export function CalendarGrid({
  month,
  days,
  currency,
  today,
  selected,
  tradesHref,
}: {
  month: string;
  days: Map<string, CalendarDay>;
  currency: string;
  today: string;
  /** Tag, dessen Trades gerade unter dem Kalender stehen */
  selected?: string;
  /** Adresse, die die Trades eines Tages zeigt */
  tradesHref: (date: string) => string;
}) {
  const weeks = monthWeeks(month);
  const maxAbs = Math.max(1, ...[...days.values()].map((d) => Math.abs(d.pnl ?? 0)));

  return (
    <div className="grid grid-cols-[repeat(7,minmax(0,1fr))_minmax(0,1.1fr)] gap-1 text-xs sm:gap-1.5">
      {WEEKDAYS.map((d) => (
        <div key={d} className="px-1 pb-1 text-center text-muted-foreground">
          {d}
        </div>
      ))}
      <div className="px-1 pb-1 text-center text-muted-foreground">Woche</div>

      {weeks.map((week, wi) => {
        const weekDays = week.flatMap((date) => (date && days.get(date)?.closed ? [days.get(date)!] : []));
        const weekPnl = Math.round(weekDays.reduce((s, d) => s + (d.pnl ?? 0), 0) * 100) / 100;
        return (
          <div key={wi} className="contents">
            {week.map((date, di) => {
              if (!date) return <div key={`leer-${wi}-${di}`} aria-hidden className="aspect-square sm:aspect-auto sm:h-24" />;
              const day = days.get(date);
              const traded = Boolean(day?.closed);
              const hasTrades = traded || Boolean(day?.open);
              const isSelected = date === selected;
              const description = `${dayDescription(date, day, currency)}${hasTrades ? " – Trades anzeigen" : " – Tagesplan öffnen"}`;
              return (
                <Link
                  key={date}
                  href={hasTrades ? tradesHref(date) : `/plan?date=${date}`}
                  title={description}
                  aria-label={isSelected ? `${description} (ausgewählt)` : description}
                  aria-current={date === today ? "date" : undefined}
                  className={cn(
                    "flex aspect-square flex-col justify-between rounded-md border p-1 outline-none transition-colors hover:border-foreground/30 focus-visible:ring-2 focus-visible:ring-ring sm:aspect-auto sm:h-24 sm:p-2",
                    traded ? "border-transparent" : "border-border/60",
                    date === today && "ring-2 ring-brand/60",
                    isSelected && "border-foreground/70 ring-2 ring-foreground/70",
                  )}
                  style={traded ? { background: pnlWash(day!.pnl ?? 0, maxAbs) } : undefined}
                >
                  <span className={cn("text-[0.625rem] leading-none sm:text-xs", date === today ? "font-semibold text-brand" : "text-muted-foreground")}>
                    {Number(date.slice(8))}
                  </span>

                  {traded ? (
                    <span className="grid gap-0.5">
                      <span className="truncate text-[0.625rem] leading-tight font-semibold tabular-nums sm:text-sm">
                        {cellAmount(day!.pnl ?? 0, currency)}
                      </span>
                      <span className="hidden truncate text-xs text-muted-foreground sm:block">
                        {plural(day!.closed, "Trade", "Trades")}
                        {day!.open > 0 && ` · ${day!.open} offen`}
                      </span>
                    </span>
                  ) : day?.open ? (
                    <span className="truncate text-[0.625rem] leading-tight text-muted-foreground sm:text-xs">{day.open} offen</span>
                  ) : day?.noTrade ? (
                    <span className="grid gap-0.5 text-muted-foreground">
                      <span className="flex items-center gap-1 text-xs">
                        <CircleSlash2 className="size-3.5 shrink-0 text-brand" aria-hidden />
                        <span className="hidden truncate sm:inline">Kein Trade</span>
                      </span>
                      {day.noTradeReason && (
                        <span className="hidden truncate text-[0.6875rem] lg:block">{labelFor(NO_TRADE_REASONS, day.noTradeReason)}</span>
                      )}
                    </span>
                  ) : null}
                </Link>
              );
            })}
            <div className="flex aspect-square flex-col justify-center rounded-md bg-muted/40 p-1 text-center sm:aspect-auto sm:h-24">
              {weekDays.length > 0 && (
                <>
                  <span className="truncate text-[0.625rem] font-semibold tabular-nums sm:text-sm">{cellAmount(weekPnl, currency)}</span>
                  <span className="hidden truncate text-xs text-muted-foreground sm:block">{plural(weekDays.length, "Tag", "Tage")}</span>
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
