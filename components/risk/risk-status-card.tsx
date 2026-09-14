import Link from "next/link";
import { ArrowRight, Clock, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge, STATUS_META } from "@/components/charts/rule-meter";
import { relativeTime } from "@/lib/calendar";
import { worst, type AccountRules, type RuleStatus } from "@/lib/prop-rules";
import { hasAnyRule, type NewsLock, type RiskRules, type TodayRisk } from "@/lib/risk-rules";
import { formatMoney, TIME_ZONE } from "@/lib/trading";
import { cn } from "@/lib/utils";

export type AccountRiskRow = {
  id: string;
  name: string;
  currency: string;
  today: TodayRisk;
  prop: AccountRules;
};

const timeFormatter = new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit", timeZone: TIME_ZONE });
const clock = (iso: string) => timeFormatter.format(new Date(iso));

type Item = { status: RuleStatus; text: string };

function StatusLine({ status, children }: { status: RuleStatus; children: React.ReactNode }) {
  const meta = STATUS_META[status];
  const Icon = meta.icon;
  return (
    <li className="flex items-start gap-2">
      <Icon className={cn("mt-0.5 size-4 shrink-0", meta.text)} aria-label={meta.label} />
      <span>{children}</span>
    </li>
  );
}

function accountItems(row: AccountRiskRow): Item[] {
  const { today, prop } = row;
  const money = (v: number) => formatMoney(v, row.currency);
  const items: Item[] = [];
  if (today.trades) {
    const { count, max, status } = today.trades;
    const suffix = status === "breached" ? " – Limit überschritten" : status === "danger" ? " – keine weiteren Trades heute" : "";
    items.push({ status, text: `${count}/${max} Trades${suffix}` });
  }
  if (today.lossStreak) {
    const { count, max, status } = today.lossStreak;
    const suffix = status === "danger" || status === "breached" ? " – Pause bis morgen" : "";
    items.push({ status, text: `${count}/${max} Verluste in Folge${suffix}` });
  }
  if (today.dailyLoss) {
    const d = today.dailyLoss;
    const suffix = d.status === "breached" ? " – Limit erreicht, Schluss für heute" : ` · noch ${money(Math.max(0, d.remaining))}`;
    items.push({ status: d.status, text: `Tagesverlust ${money(d.used)} von ${money(d.limit)}${suffix}` });
  }
  // Prop-Limits nur, wenn es eng wird – die Details stehen in den Account-Karten
  if (prop.dailyLoss && (prop.dailyLoss.status === "danger" || prop.dailyLoss.status === "breached")) {
    items.push({ status: prop.dailyLoss.status, text: `Prop-Tageslimit: noch ${money(Math.max(0, prop.dailyLoss.remaining))}` });
  }
  if (prop.drawdown && (prop.drawdown.status === "danger" || prop.drawdown.status === "breached")) {
    items.push({ status: prop.drawdown.status, text: `Prop-Drawdown: noch ${money(Math.max(0, prop.drawdown.remaining))}` });
  }
  return items;
}

/** „Risiko heute“: persönliche Regeln je Account, kritische Prop-Limits und News-Sperrzeiten. */
export function RiskStatusCard({
  rows,
  lock,
  rules,
  now,
  showLink = false,
}: {
  rows: AccountRiskRow[];
  lock: NewsLock;
  rules: RiskRules;
  now: Date;
  showLink?: boolean;
}) {
  const configured = hasAnyRule(rules);
  const perAccount = rows.map((row) => ({ row, items: accountItems(row) }));
  const lockStatus: RuleStatus | null = lock ? (lock.state === "active" ? "danger" : "warning") : null;
  const overall = [...perAccount.flatMap((a) => a.items.map((i) => i.status)), ...(lockStatus ? [lockStatus] : [])].reduce<RuleStatus>(worst, "ok");

  if (!configured && overall === "ok") {
    return (
      <Card className="gap-2 py-4">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 px-4">
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <ShieldCheck className="size-4" aria-hidden />
            Noch keine persönlichen Regeln – z. B. max. Trades pro Tag oder Pause nach Verlustserie.
          </p>
          <Button size="sm" variant="outline" asChild>
            <Link href="/risk">Regeln festlegen</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card
      className={cn(
        "gap-3",
        (overall === "danger" || overall === "breached") && "border-loss/60",
        overall === "warning" && "border-warning/60",
      )}
    >
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="size-4" aria-hidden /> Risiko heute
            </CardTitle>
            <CardDescription>Deine persönlichen Regeln · Stand {clock(now.toISOString())} Uhr</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge status={overall} />
            {showLink && (
              <Button variant="ghost" size="sm" asChild>
                <Link href="/risk">
                  Risiko-Tools <ArrowRight className="size-4" />
                </Link>
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="grid gap-3 text-sm">
        {lock && (
          <div
            role={lock.state === "active" ? "alert" : undefined}
            className={cn(
              "flex items-start gap-2 rounded-md border p-2.5",
              lock.state === "active" ? "border-loss/50 bg-loss/5" : "border-warning/50 bg-warning/5",
            )}
          >
            <Clock className={cn("mt-0.5 size-4 shrink-0", lock.state === "active" ? "text-loss" : "text-warning")} aria-hidden />
            <p>
              {lock.state === "active" ? (
                <>
                  <span className="font-medium">News-Sperre bis {clock(lock.until)} Uhr</span> – {lock.event.currency} {lock.event.title} um{" "}
                  {clock(lock.event.time)} Uhr
                </>
              ) : (
                <>
                  <span className="font-medium">
                    News-Sperre ab {clock(lock.startsAt)} Uhr ({relativeTime(lock.startsAt, now)})
                  </span>{" "}
                  – {lock.event.currency} {lock.event.title} um {clock(lock.event.time)} Uhr
                </>
              )}
            </p>
          </div>
        )}

        {perAccount.length === 0 ? (
          <p className="text-muted-foreground">Keine aktiven Accounts.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {perAccount.map(({ row, items }) => (
              <div key={row.id} className="grid content-start gap-1.5 rounded-md border p-3">
                <p className="truncate font-medium">{row.name}</p>
                {items.length && items.every((i) => i.status === "ok") ? (
                  // Alles im Rahmen: kompakt in einer Zeile
                  <p className="flex items-start gap-2">
                    <STATUS_META.ok.icon className="mt-0.5 size-4 shrink-0 text-profit" aria-label={STATUS_META.ok.label} />
                    <span className="text-muted-foreground">{items.map((i) => i.text).join(" · ")}</span>
                  </p>
                ) : items.length ? (
                  <ul className="grid gap-1">
                    {items.map((item) => (
                      <StatusLine key={item.text} status={item.status}>
                        {item.text}
                      </StatusLine>
                    ))}
                  </ul>
                ) : (
                  <p className="text-muted-foreground">Keine Tagesregeln aktiv.</p>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
