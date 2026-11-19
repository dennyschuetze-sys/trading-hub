import { EquityChart } from "@/components/charts/equity-chart";
import { StatStrip } from "@/components/charts/stat-tile";
import { AutoRefresh } from "@/components/layout/auto-refresh";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  byEa,
  equityPoints,
  expectedTrades,
  formatPercent,
  isEaStale,
  parseEaSettings,
  parseKombiBacktest,
  summarize,
  T3_EAS,
  type EaAccount,
  type EaPosition,
  type KombiBacktest,
} from "@/lib/ea";
import { fetchEaOverview } from "@/lib/ea-queries";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime, formatMoney, formatNumber, pnlClass } from "@/lib/trading";
import { cn } from "@/lib/utils";

const TITLE = "EA-Monitor";
const DESCRIPTION = "Vorwärtstest Terminal 3 · X5M G + FVG Duo + DRV15 auf 1.000 € Demo · Backtest 2026 als Maßstab";
const RECENT = 15;

const LABEL: Record<string, (typeof T3_EAS)[number]> = Object.fromEntries(T3_EAS.map((e) => [e.key, e]));

export default async function EaPage() {
  const supabase = await createClient();
  const { status, accounts, positions } = await fetchEaOverview(supabase);

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
  const backtest = parseKombiBacktest(status?.backtest ?? {});

  return (
    <>
      <PageHeader title={TITLE} description={DESCRIPTION}>
        <p className="text-xs text-muted-foreground sm:text-right">Gemeldet {formatDateTime(status?.run_at)}</p>
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
        {accounts.map((a) => (
          <AccountSection
            key={a.tag}
            account={a}
            positions={positions.filter((p) => p.tag === a.tag)}
            backtest={backtest}
            now={now}
          />
        ))}

        <section aria-label="Backtest" className="grid gap-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-lg font-semibold">Backtest als Maßstab</h2>
            <p className="text-xs text-muted-foreground">
              Rückblick {backtest.period} · {backtest.settings}
            </p>
          </div>
          <StatStrip
            items={[
              {
                label: "Endkonto",
                value: backtest.endBalance == null ? "–" : formatMoney(backtest.endBalance, "EUR"),
                hint: "aus 1.000 €",
              },
              { label: "Max. Rückgang", value: formatPercent(backtest.maxDd, 1), hint: "geschlossene Trades" },
              { label: "Trades", value: backtest.trades == null ? "–" : formatNumber(backtest.trades, 0) },
              ...backtest.eas.map((e) => ({
                label: LABEL[e.key]?.label ?? e.key,
                value: formatMoney(e.profit, "EUR", true),
                hint: `${e.trades} Trades · ${formatPercent(e.winRate)} Treffer`,
              })),
            ]}
          />
          <Card>
            <CardHeader>
              <CardTitle>Monatsergebnis im Backtest</CardTitle>
              <CardDescription>
                Kontorendite je Monat in % (alle drei EAs zusammen, mit Zinseszins). Die Beträge sind ein Rückblick auf
                bekannte Daten in der Goldrally, keine Vorhersage.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <MonthBars months={backtest.months} />
            </CardContent>
          </Card>
        </section>

        <p className="text-xs text-muted-foreground">
          Daten: <code>ea-monitor/scripts/melden.py</code> liest alle 15 Minuten Konto und Deals aus VT-Terminal 3 über
          die MT5-Schnittstelle (handelt nicht), getrennt nach Magic-Nummer (X5M G 550731, FVG Duo 718331, DRV15 552031).
          Backtest: <code>fvg-duo-studie/konto_1000_x5m.py</code>. Trade-Zeiten in deutscher Zeit. Gold in Pips (0,10 $),
          NAS100 in Punkten.
        </p>
      </div>
    </>
  );
}

function AccountSection({
  account: a,
  positions,
  backtest,
  now,
}: {
  account: EaAccount;
  positions: EaPosition[];
  backtest: KombiBacktest;
  now: Date;
}) {
  const settings = parseEaSettings(a.settings);
  const sum = summarize(positions);
  const result = Math.round((a.balance - a.start_balance) * 100) / 100;
  const points = equityPoints(a.start_balance, a.live_since, positions);
  const rows = byEa(
    T3_EAS.map((e) => e.key),
    positions,
  );
  const recent = positions.slice(0, RECENT);
  const stale = isEaStale(a.run_at, now);

  return (
    <section aria-label={`Konto ${a.tag}`} className="grid gap-6">
      <Card className="gap-5">
        <CardHeader className="flex flex-wrap items-start justify-between gap-3">
          <div className="grid gap-1">
            <p className="font-mono text-xs text-brand">
              {a.tag} · Konto {a.login}
            </p>
            <CardTitle className="text-lg">{a.name}</CardTitle>
            <CardDescription>
              {a.symbol} · live seit {formatDateTime(a.live_since)}
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
            <Kpi
              label="Rendite"
              value={a.start_balance > 0 ? formatPercent(result / a.start_balance, 1) : "–"}
              className={pnlClass(result)}
            />
            <Kpi label="Trades" value={`${sum.closed}${sum.open ? ` + ${sum.open} offen` : ""}`} />
            <Kpi label="Trefferquote" value={formatPercent(sum.winRate)} />
            <Kpi label="Profitfaktor" value={sum.profitFactor == null ? "–" : formatNumber(sum.profitFactor, 2)} />
            <Kpi label="Handelstage" value={String(sum.tradingDays)} />
          </div>

          <EquityChart points={points} startingBalance={a.start_balance} currency={a.currency} height={220} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Die drei EAs</CardTitle>
          <CardDescription>
            Ergebnis seit dem Start im Vergleich zum Backtest 2026 (erwartete Trades linear auf die bisherige Laufzeit
            umgerechnet)
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>EA</TableHead>
                <TableHead>Einstellung</TableHead>
                <TableHead className="text-right">Trades</TableHead>
                <TableHead className="text-right">erwartet</TableHead>
                <TableHead className="text-right">Treffer</TableHead>
                <TableHead className="text-right">Treffer BT</TableHead>
                <TableHead className="text-right">Ø je Trade</TableHead>
                <TableHead className="text-right">Ergebnis</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => {
                const meta = LABEL[r.key];
                const bt = backtest.eas.find((e) => e.key === r.key);
                const s = settings[r.key] ?? {};
                const expected = bt ? expectedTrades(bt.trades, backtest.days, a.live_since, now) : null;
                return (
                  <TableRow key={r.key}>
                    <TableCell>
                      <p className="font-medium">{meta?.label ?? r.key}</p>
                      <p className="text-xs text-muted-foreground">{meta?.market}</p>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{settingText(r.key, s)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.closed}
                      {r.open > 0 && <span className="text-muted-foreground"> + {r.open} offen</span>}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {expected == null ? "–" : formatNumber(expected, 1)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatPercent(r.winRate)}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {formatPercent(bt?.winRate)}
                    </TableCell>
                    <TableCell className={cn("text-right tabular-nums", pnlClass(r.meanPips))}>
                      {formatMove(r.meanPips, meta?.unit ?? "Pkt")}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      <span className={cn("font-semibold", pnlClass(r.profit))}>
                        {formatMoney(r.profit, a.currency, true)}
                      </span>
                      {r.open > 0 && (
                        <p className={cn("text-xs", pnlClass(r.openProfit))}>
                          offen {formatMoney(r.openProfit, a.currency, true)}
                        </p>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Letzte Trades</CardTitle>
          <CardDescription>Die {RECENT} neuesten Positionen aller drei EAs</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {recent.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Eröffnet</TableHead>
                  <TableHead>EA</TableHead>
                  <TableHead>Richtung</TableHead>
                  <TableHead className="text-right">Lot</TableHead>
                  <TableHead className="text-right">Dauer</TableHead>
                  <TableHead className="text-right">Bewegung</TableHead>
                  <TableHead className="text-right">Ergebnis</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recent.map((p) => (
                  <TableRow key={p.position_id}>
                    <TableCell className="tabular-nums">{formatDateTime(p.opened_at)}</TableCell>
                    <TableCell>{LABEL[p.strategy ?? ""]?.label ?? p.strategy ?? "?"}</TableCell>
                    <TableCell>{p.side === "long" ? "Long" : "Short"}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatNumber(p.volume, 2)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {p.status === "offen" ? "offen" : duration(p.opened_at, p.closed_at)}
                    </TableCell>
                    <TableCell className={cn("text-right tabular-nums", pnlClass(p.pips))}>
                      {formatMove(p.pips, LABEL[p.strategy ?? ""]?.unit ?? "Pkt")}
                    </TableCell>
                    <TableCell className={cn("text-right tabular-nums", pnlClass(p.profit))}>
                      {formatMoney(p.profit, a.currency, true)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
              Noch kein Trade seit dem Start. X5M handelt ab 8 Uhr Serverzeit, FVG Duo und DRV15 ab 15:30 deutscher Zeit
              (NY-Eröffnung).
            </p>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

function settingText(key: string, s: Record<string, number | string>) {
  const r = typeof s.RiskPercent === "number" ? `${formatNumber(s.RiskPercent, 1)} %` : "–";
  if (key === "X5M_G") return `Risiko ${r} · max. ${s.MaxPositions ?? "–"} Pos. · Stop ≤ ${s.SlCapAtr ?? "–"} ATR`;
  if (key === "FVG_Duo") return `Risiko ${r} · OD-Stop ${s.OdStopProzent ?? "–"} % · Ziel ${s.TfZielR ?? "–"} R`;
  return `Risiko ${r} · Mindestlot bis ${s.MinLotMaxRiskPct ?? "–"} %`;
}

function formatMove(value: number | null | undefined, unit: string) {
  if (value == null || !Number.isFinite(value)) return "–";
  const s = value.toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return `${value > 0 ? "+" : ""}${s} ${unit}`;
}

function Kpi({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="bg-card px-3 py-2.5">
      <p className="text-[0.6875rem] font-medium uppercase tracking-[0.08em] text-muted-foreground">{label}</p>
      <p className={cn("mt-0.5 font-semibold tabular-nums", className)}>{value}</p>
    </div>
  );
}

function duration(from: string, to: string | null) {
  if (!to) return "–";
  const s = Math.max(0, Math.round((new Date(to).getTime() - new Date(from).getTime()) / 1000));
  if (s < 60) return `${s} s`;
  if (s < 3600) return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")} min`;
  return `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")} h`;
}

function MonthBars({ months }: { months: { month: string; ret: number }[] }) {
  if (months.length === 0) return <p className="text-sm text-muted-foreground">Keine Backtest-Daten.</p>;
  const max = Math.max(5, ...months.map((m) => Math.abs(m.ret)));
  return (
    <div className="overflow-x-auto">
      <div
        className="grid min-w-[420px] grid-flow-col auto-cols-fr items-end gap-1"
        role="img"
        aria-label="Kontorendite je Monat im Backtest"
      >
        {months.map((m, i) => {
          const h = (Math.abs(m.ret) / max) * 70;
          const label = m.month.slice(5) === "01" || i === 0 ? `${m.month.slice(5)}/${m.month.slice(2, 4)}` : m.month.slice(5);
          const text = `${m.ret > 0 ? "+" : ""}${m.ret.toLocaleString("de-DE", { maximumFractionDigits: 1 })} %`;
          return (
            <div key={m.month} className="grid grid-rows-[auto_72px_72px_auto] text-center" title={`${m.month}: ${text}`}>
              <span className="text-[0.625rem] tabular-nums text-muted-foreground">{m.ret > 0 ? text : ""}</span>
              <div className="flex items-end justify-center">
                {m.ret > 0 && <span className="w-3/5 rounded-t-sm bg-profit" style={{ height: `${h}px` }} />}
              </div>
              <div className="flex items-start justify-center border-t border-muted-foreground/40">
                {m.ret < 0 && <span className="w-3/5 rounded-b-sm bg-loss" style={{ height: `${h}px` }} />}
              </div>
              <span className="mt-1 text-[0.6875rem] tabular-nums text-muted-foreground">
                {label}
                {m.ret < 0 ? ` ${text}` : ""}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
