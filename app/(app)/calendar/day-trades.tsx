import Link from "next/link";
import { CalendarCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { shortDate } from "@/components/charts/format";
import { berlinParts, type StatTrade } from "@/lib/stats";
import { TIME_ZONE, formatMoney, formatR, plural, pnlClass } from "@/lib/trading";
import { cn } from "@/lib/utils";

const clock = (iso: string) =>
  new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit", timeZone: TIME_ZONE }).format(new Date(iso));

/** „Dienstag, 15. September 2026“ */
const fullDate = (date: string) =>
  new Intl.DateTimeFormat("de-DE", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(`${date}T12:00:00Z`),
  );

/** Nur die Uhrzeit, wenn der Zeitpunkt am angezeigten Tag liegt – sonst mit Datum (Trade über Nacht). */
const when = (iso: string, date: string) => (berlinParts(iso).date === date ? clock(iso) : `${shortDate(iso)} ${clock(iso)}`);

/** Die Trades eines Tages aus dem Kalender: Symbol, Richtung, Zeiten und Ergebnis, jeder führt zum Journal-Eintrag. */
export function DayTrades({
  date,
  trades,
  currency,
  accountNames,
  closeHref,
}: {
  date: string;
  trades: StatTrade[];
  currency: string;
  /** Gesetzt, wenn mehrere Accounts im Bereich liegen – dann steht der Account bei jedem Trade */
  accountNames?: Map<string, string>;
  closeHref: string;
}) {
  const net = Math.round(trades.reduce((s, t) => s + (t.status === "closed" ? (t.net_pnl ?? 0) : 0), 0) * 100) / 100;
  const hasClosed = trades.some((t) => t.status === "closed");

  return (
    <Card id="tag" role="region" aria-labelledby="tag-title" className="scroll-mt-20 gap-0 py-0">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3 sm:px-5">
        <div>
          <h2 id="tag-title" className="font-semibold">
            {fullDate(date)}
          </h2>
          <p className="text-sm text-muted-foreground tabular-nums">
            {plural(trades.length, "Trade", "Trades")}
            {hasClosed && (
              <>
                {" · "}
                <span className={cn("font-medium", pnlClass(net))}>{formatMoney(net, currency, true)}</span>
              </>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href={`/plan?date=${date}`}>
              <CalendarCheck className="size-4" /> Tagesplan
            </Link>
          </Button>
          <Button variant="ghost" size="sm" asChild>
            <Link href={closeHref} scroll={false}>
              <X className="size-4" /> Schließen
            </Link>
          </Button>
        </div>
      </div>
      <CardContent className="px-0">
        {trades.length ? (
          <ul className="divide-y divide-border">
            {trades.map((t) => (
              <li key={t.id}>
                <Link
                  href={`/journal/${t.id}`}
                  className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-foreground/[0.03] focus-visible:bg-foreground/[0.03] focus-visible:outline-none sm:px-5"
                >
                  <span className="min-w-0">
                    <span className="font-semibold">{t.symbol}</span>{" "}
                    <span className={cn("font-medium", t.direction === "long" ? "text-profit" : "text-loss")}>
                      {t.direction === "long" ? "Long" : "Short"}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {when(t.entry_time, date)}
                      {t.exit_time && ` → ${when(t.exit_time, date)}`}
                      {accountNames && ` · ${accountNames.get(t.account_id) ?? "Account"}`}
                    </span>
                  </span>
                  <span className="text-right tabular-nums">
                    <span className={cn("block font-semibold", t.status === "open" ? "text-muted-foreground" : pnlClass(t.net_pnl))}>
                      {t.status === "open" ? "offen" : formatMoney(t.net_pnl, currency, true)}
                    </span>
                    {t.status === "closed" && t.r_multiple != null && (
                      <span className="block text-xs text-muted-foreground">{formatR(t.r_multiple)}</span>
                    )}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-5 py-6 text-center text-sm text-muted-foreground">An diesem Tag gibt es keine Trades.</p>
        )}
      </CardContent>
    </Card>
  );
}
