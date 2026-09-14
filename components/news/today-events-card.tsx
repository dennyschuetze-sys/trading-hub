import Link from "next/link";
import { ArrowRight, Newspaper } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { relativeTime, type CalendarEvent } from "@/lib/calendar";
import { formatDateTime } from "@/lib/trading";
import { eventTime, ImpactLabel } from "./event-list";

/** Dashboard: heutige Termine der gewählten Währungen + nächster High-Impact-Termin. */
export function TodayEventsCard({
  events,
  next,
  now,
  error,
}: {
  events: CalendarEvent[];
  next: CalendarEvent | null;
  now: Date;
  error: string | null;
}) {
  const nowIso = now.toISOString();
  return (
    <Card className="gap-3">
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2">
            <Newspaper className="size-4" /> Termine heute
          </CardTitle>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/news">
              Kalender <ArrowRight className="size-4" />
            </Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="grid gap-3 text-sm">
        {error ? (
          <p className="text-muted-foreground">{error}</p>
        ) : events.length ? (
          <ul className="grid gap-1.5">
            {events.slice(0, 6).map((e) => (
              <li key={e.id} className={`flex items-center gap-2 ${e.time < nowIso ? "text-muted-foreground" : ""}`}>
                <span className="w-11 shrink-0 tabular-nums">{eventTime(e)}</span>
                <span className="w-8 shrink-0 text-xs font-medium">{e.currency}</span>
                <ImpactLabel impact={e.impact} compact />
                <span className="truncate">{e.title}</span>
              </li>
            ))}
            {events.length > 6 && <li className="text-xs text-muted-foreground">+ {events.length - 6} weitere</li>}
          </ul>
        ) : (
          <p className="text-muted-foreground">Keine wichtigen Termine für deine Währungen heute.</p>
        )}
        {next && (
          <p className="border-t pt-2 text-xs text-muted-foreground">
            Nächster High-Impact: <span className="font-medium text-foreground">{next.currency} {next.title}</span> ·{" "}
            {formatDateTime(next.time)} ({relativeTime(next.time, now)})
          </p>
        )}
      </CardContent>
    </Card>
  );
}
