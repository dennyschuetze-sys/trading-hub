import { EquityChart } from "@/components/charts/equity-chart";
import { StatStrip } from "@/components/charts/stat-tile";
import { AutoRefresh } from "@/components/layout/auto-refresh";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  byStrategy,
  equityPoints,
  forecastChecks,
  forecastIntensity,
  formatPercent,
  formatPips,
  isEaStale,
  NO_NEWS_FAMILY,
  parseBacktest,
  parseEvents,
  parseFamilies,
  parseSettings,
  riskWarning,
  serverDay,
  summarize,
  type EaAccount,
  type EaForecast,
  type EaPosition,
  type FamilyRate,
} from "@/lib/ea";
import { fetchEaOverview } from "@/lib/ea-queries";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime, formatMoney, formatNumber, pnlClass } from "@/lib/trading";
import { cn } from "@/lib/utils";

const TITLE = "EA-Monitor";
const DESCRIPTION = "Gunner-EA auf zwei Demokonten · Backtest als Maßstab · Vorhersage der Handelstage aus US-News";
const RECENT = 12;
const FORECAST_DAYS = 25;
const WEEKDAYS = ["Mo", "Di", "Mi", "Do", "Fr"];

export default async function EaPage() {
  const supabase = await createClient();
  const { status, accounts, positions, forecast } = await fetchEaOverview(supabase);

  if (!status && accounts.length === 0) {
    return (
      <>
        <PageHeader title={TITLE} description={DESCRIPTION} />
        <Card>
          <CardHeader>
            <CardTitle>Noch keine Daten</CardTitle>
            <CardDescription>
              Das Skript <code>ea-monitor/scripts/melden.py lauf</code> läuft auf dem Rechner mit den VT-Terminals und
              meldet sich hier alle 15 Minuten.
            </CardDescription>
          </CardHeader>
        </Card>
      </>
    );
  }

  const now = new Date();
  const stale = isEaStale(status?.run_at, now);
  const today = serverDay(now.toISOString());
  const families = parseFamilies(status?.families ?? []);
  const backtest = parseBacktest(status?.backtest ?? {});
  const upcoming = forecast.filter((f) => f.day >= today).slice(0, FORECAST_DAYS);
  const checks = forecastChecks(forecast, accounts, positions, today);

  return (
    <>
      <PageHeader title={TITLE} description={DESCRIPTION}>
        <p className="text-xs text-muted-foreground sm:text-right">
          Gemeldet {formatDateTime(status?.run_at)}
          <br />
          Kalender bis {status?.calendar_until ? formatDateTime(status.calendar_until) : "–"}
        </p>
      </PageHeader>
      <AutoRefresh seconds={60} />

      {(stale || status?.note) && (
        <p role="status" className="mb-6 rounded-lg border border-loss/40 bg-loss/[0.06] px-4 py-3 text-sm">
          {stale
            ? `Der EA-Monitor hat sich seit ${formatDateTime(status?.run_at)} nicht gemeldet. Läuft der Rechner mit den VT-Terminals?`
            : status?.note}
        </p>
      )}

      <div className="grid gap-8">
        <section aria-label="Konten" className="grid gap-6 xl:grid-cols-2">
          {accounts.map((a) => (
            <AccountCard key={a.tag} account={a} positions={positions.filter((p) => p.tag === a.tag)} now={now} />
          ))}
        </section>

        <section aria-label="Vorhersage" className="grid gap-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-lg font-semibold">Wann handelt der EA?</h2>
            <p className="text-xs text-muted-foreground">
              Anteil der Backtest-Tage mit mindestens einem Trade ab 10/2025, nach dem wichtigsten US-Termin des Tages
            </p>
          </div>
          <Card>
            <CardContent className="grid gap-4">
              <ForecastCalendar days={upcoming} today={today} />
              <p className="text-xs text-muted-foreground">
                Nur Fed- und NFP-Tage heben die Chance klar über den Grundwert von gut 40 %; die übrigen Termine
                unterscheiden sich kaum von Tagen ohne News. Etwa jeder fünfte Trade fällt in die ersten 2 Minuten nach
                einem wichtigen US-Termin. Uhrzeiten in Serverzeit (MEZ + 1 h).
              </p>
            </CardContent>
          </Card>

          <div className="grid gap-6 xl:grid-cols-2">
            <FamilyTable families={families} />
            <ChecksTable checks={checks} tags={accounts.map((a) => a.tag)} />
          </div>
        </section>

        <section aria-label="Backtest" className="grid gap-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-lg font-semibold">Backtest als Maßstab</h2>
            <p className="text-xs text-muted-foreground">
              MT5-Tester, {backtest.period} · {backtest.settings}
            </p>
          </div>
          <StatStrip
            items={[
              { label: "Endkonto", value: formatMoney(backtest.stats.end_balance, "EUR"), hint: "aus 1.000 €" },
              { label: "Profitfaktor", value: formatNumber(backtest.stats.profit_factor, 2) },
              { label: "Trades", value: formatNumber(backtest.stats.trades, 0) },
              { label: "Trefferquote", value: formatPercent(backtest.stats.win_rate) },
              { label: "Max. Rückgang", value: formatPercent(backtest.stats.max_dd_equity, 1), hint: "Equity" },
              { label: "Haltedauer", value: `${backtest.stats.median_hold_s ?? "–"} s`, hint: "Median" },
            ]}
          />
          <Card>
            <CardHeader>
              <CardTitle>Ø Pips je Trade und Monat</CardTitle>
              <CardDescription>
                Januar bis September 2025 lag der EA bei −2,4 Pips je Trade, so viel wie zufällige Einstiege nach
                Spread. Erst ab Oktober 2025, mit stark schwankendem Gold, verdient er.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <MonthBars months={backtest.months} />
            </CardContent>
          </Card>
        </section>

        <p className="text-xs text-muted-foreground">
          Daten: <code>ea-monitor/scripts/melden.py</code> liest alle 15 Minuten Konto und Deals aus VT-Terminal 3 und 4
          über die MT5-Schnittstelle (handelt nicht). Den Wirtschaftskalender schreibt der MT5-Dienst{" "}
          <code>EA_Kalender</code> in Terminal 4 alle 6 Stunden. Trade-Zeiten in deutscher Zeit.
        </p>
      </div>
    </>
  );
}

function AccountCard({ account: a, positions, now }: { account: EaAccount; positions: EaPosition[]; now: Date }) {
  const settings = parseSettings(a.settings);
  const warning = riskWarning(settings);
  const sum = summarize(positions);
  const result = Math.round((a.balance - a.start_balance) * 100) / 100;
  const points = equityPoints(a.start_balance, a.live_since, positions);
  const strategies = byStrategy(positions);
  const recent = positions.slice(0, RECENT);
  const stale = isEaStale(a.run_at, now);

  return (
    <Card className="gap-5">
      <CardHeader className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <p className="font-mono text-xs text-brand">
            {a.tag} · Konto {a.login}
          </p>
          <CardTitle className="text-lg">{a.name}</CardTitle>
          <CardDescription>
            {a.symbol} {a.timeframe} · live seit {formatDateTime(a.live_since)}
          </CardDescription>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Badge variant={stale || !a.connected ? "destructive" : "secondary"}>
            {stale ? "keine Meldung" : a.connected ? "verbunden" : "getrennt"}
          </Badge>
          <Badge variant={a.algo_trading ? "secondary" : "destructive"}>Algo {a.algo_trading ? "an" : "aus"}</Badge>
        </div>
      </CardHeader>
      <CardContent className="grid gap-5">
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-4">
          <Kpi label="Saldo" value={formatMoney(a.balance, a.currency)} />
          <Kpi label="Equity" value={formatMoney(a.equity, a.currency)} />
          <Kpi label="Ergebnis" value={formatMoney(result, a.currency, true)} className={pnlClass(result)} />
          <Kpi label="Trades" value={`${sum.closed}${sum.open ? ` + ${sum.open} offen` : ""}`} />
          <Kpi label="Trefferquote" value={formatPercent(sum.winRate)} />
          <Kpi label="Ø je Trade" value={formatPips(sum.meanPips)} className={pnlClass(sum.meanPips)} />
          <Kpi label="Profitfaktor" value={sum.profitFactor == null ? "–" : formatNumber(sum.profitFactor, 2)} />
          <Kpi label="Handelstage" value={String(sum.tradingDays)} />
        </div>

        <div className="flex flex-wrap gap-1.5 text-xs">
          <Chip>Strategien {settings.strategies ?? "–"}</Chip>
          <Chip warn={warning != null}>Risiko {settings.RiskPercent == null ? "–" : `${formatNumber(settings.RiskPercent, 2)} %`}</Chip>
          <Chip>MaxLots {settings.MaxLots ? formatNumber(settings.MaxLots, 2) : "aus"}</Chip>
        </div>
        {warning && <p className="text-xs text-warning">{warning}</p>}

        <EquityChart points={points} startingBalance={a.start_balance} currency={a.currency} height={200} />

        {recent.length > 0 ? (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Eröffnet</TableHead>
                  <TableHead>Strat.</TableHead>
                  <TableHead>Richtung</TableHead>
                  <TableHead className="text-right">Lot</TableHead>
                  <TableHead className="text-right">Dauer</TableHead>
                  <TableHead className="text-right">Pips</TableHead>
                  <TableHead className="text-right">Ergebnis</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recent.map((p) => (
                  <TableRow key={p.position_id}>
                    <TableCell className="tabular-nums">{formatDateTime(p.opened_at)}</TableCell>
                    <TableCell className="font-mono">{p.strategy ?? "?"}</TableCell>
                    <TableCell>{p.side === "long" ? "Long" : "Short"}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatNumber(p.volume, 2)}</TableCell>
                    <TableCell className="text-right tabular-nums">{p.status === "offen" ? "offen" : duration(p.opened_at, p.closed_at)}</TableCell>
                    <TableCell className={cn("text-right tabular-nums", pnlClass(p.pips))}>{formatPips(p.pips)}</TableCell>
                    <TableCell className={cn("text-right tabular-nums", pnlClass(p.profit))}>{formatMoney(p.profit, a.currency, true)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
            Noch kein Trade seit dem Live-Start.
          </p>
        )}

        {strategies.length > 0 && (
          <div className="flex flex-wrap gap-1.5 text-xs">
            {strategies.map((s) => (
              <span key={s.strategy} className="rounded-md bg-muted px-2 py-1 tabular-nums">
                <span className="font-mono">{s.strategy}</span> · {s.trades} ·{" "}
                <span className={pnlClass(s.profit)}>{formatMoney(s.profit, a.currency, true)}</span>
              </span>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Kpi({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="bg-card px-3 py-2.5">
      <p className="text-[0.6875rem] font-medium uppercase tracking-[0.08em] text-muted-foreground">{label}</p>
      <p className={cn("mt-0.5 font-semibold tabular-nums", className)}>{value}</p>
    </div>
  );
}

function Chip({ children, warn }: { children: React.ReactNode; warn?: boolean }) {
  return (
    <span className={cn("rounded-md px-2 py-1 font-mono", warn ? "bg-warning/15 text-warning" : "bg-muted text-muted-foreground")}>
      {children}
    </span>
  );
}

function duration(from: string, to: string | null) {
  if (!to) return "–";
  const s = Math.max(0, Math.round((new Date(to).getTime() - new Date(from).getTime()) / 1000));
  if (s < 60) return `${s} s`;
  if (s < 3600) return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")} min`;
  return `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")} h`;
}

function ForecastCalendar({ days, today }: { days: EaForecast[]; today: string }) {
  if (days.length === 0) {
    return <p className="text-sm text-muted-foreground">Keine Kalenderdaten für die nächsten Tage.</p>;
  }
  // Wochenraster Mo–Fr: Leerfelder vor dem ersten Tag, damit jeder Tag unter seinem Wochentag steht
  const lead = (new Date(`${days[0].day}T12:00:00Z`).getUTCDay() + 6) % 7;
  return (
    <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-5">
      {WEEKDAYS.map((w) => (
        <p key={w} className="hidden px-1 text-[0.6875rem] uppercase tracking-[0.08em] text-muted-foreground sm:block">
          {w}
        </p>
      ))}
      {Array.from({ length: Math.min(lead, 4) }, (_, i) => (
        <div key={`leer-${i}`} className="hidden sm:block" />
      ))}
      {days.map((d) => {
        const events = parseEvents(d.events);
        const names = [...new Set(events.map((e) => e.name))];
        const k = forecastIntensity(d.probability);
        const date = new Date(`${d.day}T12:00:00Z`).toLocaleDateString("de-DE", {
          weekday: "short",
          day: "2-digit",
          month: "2-digit",
          timeZone: "UTC",
        });
        return (
          <div
            key={d.day}
            title={names.join(", ")}
            className={cn(
              "grid min-h-24 min-w-0 content-start gap-1 rounded-lg border p-2",
              d.probability >= 0.6 && "border-brand",
              d.day === today && "ring-2 ring-brand/60",
            )}
            style={{ backgroundColor: `color-mix(in oklch, var(--brand) ${Math.round(k * 38)}%, var(--card))` }}
          >
            <div className="flex justify-between gap-1 text-xs text-muted-foreground">
              <span>{d.day === today ? "heute" : date}</span>
              {events[0] && <span className="font-mono text-[0.6875rem]">{events[0].time}</span>}
            </div>
            <p className="text-lg font-semibold tabular-nums">{formatPercent(d.probability)}</p>
            <p className="text-xs leading-snug [overflow-wrap:anywhere]">
              {d.family === NO_NEWS_FAMILY ? "keine wichtigen US-Termine" : d.family}
            </p>
          </div>
        );
      })}
    </div>
  );
}

function FamilyTable({ families }: { families: FamilyRate[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Trefferquote je Tagestyp</CardTitle>
        <CardDescription>Tage mit mindestens einem Trade im Backtest, vor und ab Oktober 2025</CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Wichtigster Termin</TableHead>
              <TableHead className="text-right">Tage</TableHead>
              <TableHead className="text-right">01–09/2025</TableHead>
              <TableHead className="text-right">ab 10/2025</TableHead>
              <TableHead className="text-right">Ø Trades</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {[...families]
              .sort((a, b) => b.after - a.after)
              .map((f) => (
                <TableRow key={f.family}>
                  <TableCell>{f.family}</TableCell>
                  <TableCell className="text-right tabular-nums">{f.days}</TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">{formatPercent(f.before)}</TableCell>
                  <TableCell className="text-right">
                    <span className="inline-flex items-center justify-end gap-2 tabular-nums">
                      <span className="h-1.5 w-14 overflow-hidden rounded-full bg-muted">
                        <span className="block h-full bg-brand" style={{ width: `${f.after * 100}%` }} />
                      </span>
                      <b className="font-semibold">{formatPercent(f.after)}</b>
                    </span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatNumber(f.trades, 1)}</TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function ChecksTable({ checks, tags }: { checks: ReturnType<typeof forecastChecks>; tags: string[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Vorhersage und tatsächlich</CardTitle>
        <CardDescription>Positionen je Konto an den Tagen seit dem Live-Start</CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        {checks.length === 0 ? (
          <p className="text-sm text-muted-foreground">Noch kein vergangener Tag mit Vorhersage.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tag</TableHead>
                <TableHead>Typ</TableHead>
                <TableHead className="text-right">Vorhersage</TableHead>
                {tags.map((t) => (
                  <TableHead key={t} className="text-right">
                    {t}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {checks.map((c) => (
                <TableRow key={c.day}>
                  <TableCell className="tabular-nums">
                    {new Date(`${c.day}T12:00:00Z`).toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit", timeZone: "UTC" })}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{c.family === NO_NEWS_FAMILY ? "ohne News" : c.family}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatPercent(c.probability)}</TableCell>
                  {tags.map((t) => (
                    <TableCell key={t} className="text-right tabular-nums">
                      {t in c.traded ? (
                        c.traded[t] > 0 ? (
                          <span className="font-semibold text-brand">{c.traded[t]}</span>
                        ) : (
                          <span className="text-muted-foreground">0</span>
                        )
                      ) : (
                        <span className="text-muted-foreground/50">–</span>
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function MonthBars({ months }: { months: { month: string; pips: number; trades: number }[] }) {
  if (months.length === 0) return <p className="text-sm text-muted-foreground">Keine Backtest-Daten.</p>;
  const max = Math.max(10, ...months.map((m) => Math.abs(m.pips)));
  return (
    <div className="overflow-x-auto">
      <div className="grid min-w-[560px] grid-flow-col auto-cols-fr items-end gap-1" role="img" aria-label="Durchschnittliche Pips je Trade pro Monat">
        {months.map((m, i) => {
          const h = (Math.abs(m.pips) / max) * 70;
          const label = m.month.slice(5) === "01" || i === 0 ? `${m.month.slice(5)}/${m.month.slice(2, 4)}` : m.month.slice(5);
          return (
            <div key={m.month} className="grid grid-rows-[72px_72px_auto] text-center" title={`${m.month}: ${formatPips(m.pips)} je Trade, ${m.trades} Trades`}>
              <div className="flex items-end justify-center">
                {m.pips > 0 && <span className="w-3/5 rounded-t-sm bg-profit" style={{ height: `${h}px` }} />}
              </div>
              <div className="flex items-start justify-center border-t border-muted-foreground/40">
                {m.pips < 0 && <span className="w-3/5 rounded-b-sm bg-loss" style={{ height: `${h}px` }} />}
              </div>
              <span className="mt-1 text-[0.6875rem] tabular-nums text-muted-foreground">{label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
