import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AutoRefresh } from "@/components/layout/auto-refresh";
import { PageHeader } from "@/components/layout/page-header";
import { RiskStatusCard } from "@/components/risk/risk-status-card";
import { getCalendar, getFxRates, getNewsSettings } from "@/lib/feeds";
import { fetchStatTrades } from "@/lib/queries";
import { buildRiskToday, getRiskRules, loadViolations, rememberEvents } from "@/lib/risk-queries";
import { VIOLATION_LABELS, type ViolationKind } from "@/lib/risk-rules";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime, formatMoney, pnlClass } from "@/lib/trading";
import { PositionCalculator } from "./position-calculator";
import { RulesForm } from "./rules-form";

export default async function RiskPage() {
  const supabase = await createClient();
  const [{ data: accounts }, trades, rules, calendar, newsSettings, fx] = await Promise.all([
    supabase
      .from("accounts")
      .select("id, name, currency, starting_balance, status, max_daily_loss, max_drawdown, drawdown_type, profit_target, min_trading_days")
      .order("name"),
    fetchStatTrades(supabase),
    getRiskRules(supabase),
    getCalendar(),
    getNewsSettings(supabase),
    getFxRates(),
  ]);
  await rememberEvents(supabase, calendar.events);

  const list = accounts ?? [];
  const now = new Date();
  const { rows, lock } = buildRiskToday(list, trades, rules, calendar.events, newsSettings.calendarCurrencies, now);

  const since = new Date(now.getTime() - 30 * 24 * 3600_000).toISOString();
  const { violations } = await loadViolations(supabase, { entryFrom: since }, { trades, rules });
  const recent = trades
    .filter((t) => t.entry_time >= since && violations.has(t.id))
    .sort((a, b) => b.entry_time.localeCompare(a.entry_time));
  const counts = new Map<ViolationKind, number>();
  recent.forEach((t) => new Set(violations.get(t.id)!.map((v) => v.kind)).forEach((k) => counts.set(k, (counts.get(k) ?? 0) + 1)));
  const accountOf = new Map(list.map((a) => [a.id, a]));

  // Rechner: aktive Accounts, sonst alle
  const calcAccounts = (rows.length ? list.filter((a) => a.status === "active") : list).map((a) => {
    const row = rows.find((x) => x.id === a.id);
    const balance = row?.prop.balance ?? a.starting_balance + trades.reduce((s, t) => s + (t.account_id === a.id && t.status === "closed" ? (t.net_pnl ?? 0) : 0), 0);
    return {
      id: a.id,
      name: a.name,
      currency: a.currency,
      balance: Math.round(balance * 100) / 100,
      remainingProp: row?.prop.dailyLoss ? Math.max(0, row.prop.dailyLoss.remaining) : null,
      remainingPersonal: row?.today.remainingDailyLoss ?? null,
    };
  });

  return (
    <>
      <AutoRefresh />
      <PageHeader title="Risiko-Tools" description="Positionsgröße berechnen, eigene Regeln festlegen und einhalten" />

      <div className="grid gap-6">
        <RiskStatusCard rows={rows} lock={lock} rules={rules} now={now} />

        <Card>
          <CardHeader>
            <CardTitle>Positionsgrößen-Rechner</CardTitle>
            <CardDescription>Lots für Forex und CFDs, Kontrakte für Futures – umgerechnet in deine Kontowährung</CardDescription>
          </CardHeader>
          <CardContent>
            <PositionCalculator accounts={calcAccounts} fx={fx} defaultRiskPct={rules.defaultRiskPct} maxRiskPct={rules.maxRiskPerTradePct} />
          </CardContent>
        </Card>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <Card>
            <CardHeader>
              <CardTitle>Meine Regeln</CardTitle>
              <CardDescription>Leere Felder = Regel aus. Verstöße werden im Journal und in den Statistiken markiert.</CardDescription>
            </CardHeader>
            <CardContent>
              <RulesForm rules={rules} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Regelverstöße</CardTitle>
              <CardDescription>Letzte 30 Tage · nach deinen aktuellen Regeln</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 text-sm">
              {!recent.length ? (
                <p className="flex items-center gap-2 text-muted-foreground">
                  <ShieldAlert className="size-4" aria-hidden />
                  Keine Verstöße in den letzten 30 Tagen.
                </p>
              ) : (
                <>
                  <ul className="grid gap-1">
                    {[...counts].map(([kind, count]) => (
                      <li key={kind} className="flex justify-between gap-2">
                        <span>{VIOLATION_LABELS[kind]}</span>
                        <span className="tabular-nums">{count}×</span>
                      </li>
                    ))}
                  </ul>
                  <ul className="divide-y rounded-md border">
                    {recent.slice(0, 15).map((t) => {
                      const a = accountOf.get(t.account_id);
                      return (
                        <li key={t.id}>
                          <Link href={`/journal/${t.id}`} className="grid gap-0.5 px-3 py-2 hover:bg-muted/40">
                            <span className="flex justify-between gap-2">
                              <span className="font-medium">
                                {t.symbol} <span className="font-normal text-muted-foreground">{t.direction === "long" ? "Long" : "Short"}</span>
                              </span>
                              <span className={`tabular-nums ${pnlClass(t.net_pnl)}`}>
                                {t.status === "open" ? "offen" : formatMoney(t.net_pnl, a?.currency, true)}
                              </span>
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {formatDateTime(t.entry_time)} · {a?.name}
                            </span>
                            {violations.get(t.id)!.map((v) => (
                              <span key={v.kind} className="flex items-start gap-1.5 text-xs">
                                <ShieldAlert className="mt-0.5 size-3.5 shrink-0 text-loss" aria-hidden />
                                {v.message}
                              </span>
                            ))}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                  {recent.length > 15 && <p className="text-xs text-muted-foreground">+ {recent.length - 15} weitere</p>}
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
