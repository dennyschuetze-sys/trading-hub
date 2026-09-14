import { AlertOctagon, AlertTriangle, CalendarOff, Minus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { longDate } from "@/components/charts/format";
import { berlinDay, groupByDay, IMPACTS, relativeTime, type CalendarEvent, type Impact } from "@/lib/calendar";
import { TIME_ZONE } from "@/lib/trading";
import { cn } from "@/lib/utils";

const IMPACT_ICON: Record<Impact, { icon: typeof AlertOctagon; className: string }> = {
  high: { icon: AlertOctagon, className: "text-loss" },
  medium: { icon: AlertTriangle, className: "text-warning" },
  low: { icon: Minus, className: "text-muted-foreground" },
  holiday: { icon: CalendarOff, className: "text-muted-foreground" },
};

/** Impact als Symbol + Wort – Farbe trägt die Bedeutung nie allein. */
export function ImpactLabel({ impact, compact = false }: { impact: Impact; compact?: boolean }) {
  const { icon: Icon, className } = IMPACT_ICON[impact];
  const label = IMPACTS.find((i) => i.value === impact)!.label;
  return (
    <span className="inline-flex items-center gap-1 text-xs whitespace-nowrap" title={`Impact: ${label}`}>
      <Icon className={cn("size-3.5", className)} aria-hidden />
      <span className={compact ? "sr-only" : ""}>{label}</span>
    </span>
  );
}

const timeFormatter = new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit", timeZone: TIME_ZONE });

export function eventTime(e: CalendarEvent) {
  return e.impact === "holiday" ? "ganztägig" : timeFormatter.format(new Date(e.time));
}

export function EventList({
  events,
  now = new Date(),
  showDates = true,
  emptyText = "Keine Termine.",
}: {
  events: CalendarEvent[];
  now?: Date;
  showDates?: boolean;
  emptyText?: string;
}) {
  if (!events.length) return <p className="text-sm text-muted-foreground">{emptyText}</p>;
  const today = berlinDay(now.toISOString());
  const nowIso = now.toISOString();

  return (
    <div className="grid gap-5">
      {groupByDay(events).map((day) => (
        <section key={day.date} className="grid gap-1" aria-label={longDate(day.date)}>
          {showDates && (
            <h3 className={cn("text-sm font-medium", day.date === today ? "text-foreground" : "text-muted-foreground")}>
              {longDate(day.date)}
              {day.date === today && (
                <Badge variant="secondary" className="ml-2">
                  Heute
                </Badge>
              )}
            </h3>
          )}
          <ul className="divide-y rounded-md border">
            {day.events.map((e) => {
              const past = e.time < nowIso;
              const soon = !past && new Date(e.time).getTime() - now.getTime() < 2 * 3600_000;
              return (
                <li
                  key={e.id}
                  className={cn(
                    "grid grid-cols-[3.5rem_3rem_minmax(0,1fr)] items-center gap-x-3 gap-y-0.5 px-3 py-2 text-sm sm:grid-cols-[3.5rem_3rem_5.5rem_minmax(0,1fr)_auto]",
                    past && "text-muted-foreground",
                  )}
                >
                  <span className="tabular-nums">{eventTime(e)}</span>
                  <span className="text-xs font-medium">{e.currency}</span>
                  <span className="hidden sm:inline">
                    <ImpactLabel impact={e.impact} />
                  </span>
                  <span className="min-w-0">
                    <span className={cn("block truncate", e.impact === "high" && !past && "font-medium")}>
                      <span className="sm:hidden">
                        <ImpactLabel impact={e.impact} compact />{" "}
                      </span>
                      {e.title}
                    </span>
                    {(e.forecast || e.previous) && (
                      <span className="block text-xs text-muted-foreground tabular-nums sm:hidden">
                        {e.forecast && `Prognose ${e.forecast}`} {e.previous && `· Vorher ${e.previous}`}
                      </span>
                    )}
                  </span>
                  <span className="col-span-3 hidden text-right text-xs tabular-nums text-muted-foreground sm:col-span-1 sm:block">
                    {soon ? (
                      <span className="font-medium text-foreground">{relativeTime(e.time, now)}</span>
                    ) : (
                      <>
                        {e.forecast && <span>Prog. {e.forecast}</span>}
                        {e.previous && <span className="ml-2">Vorh. {e.previous}</span>}
                      </>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
