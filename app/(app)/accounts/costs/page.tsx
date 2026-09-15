import Link from "next/link";
import { ArrowLeft, Receipt } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatTile } from "@/components/charts/stat-tile";
import { PageHeader } from "@/components/layout/page-header";
import { COST_KINDS, summarizeCosts } from "@/lib/costs";
import { todayBerlin } from "@/lib/daily-plan";
import { createClient } from "@/lib/supabase/server";
import { formatMoney, formatNumber, labelFor, pnlClass } from "@/lib/trading";
import { cn } from "@/lib/utils";
import { EntryDelete } from "./entry-delete";
import { EntryForm } from "./entry-form";

const roiText = (roi: number | null) => (roi == null ? "–" : `${roi > 0 ? "+" : ""}${formatNumber(roi * 100, 0)} %`);

export default async function CostsPage() {
  const supabase = await createClient();
  const [{ data: costs }, { data: payouts }, { data: accounts }] = await Promise.all([
    supabase.from("account_costs").select("*, accounts(name)").order("incurred_on", { ascending: false }).limit(1000),
    supabase.from("payouts").select("*, accounts(name)").order("paid_on", { ascending: false }).limit(1000),
    supabase.from("accounts").select("id, name, firm, currency, status").order("status").order("name"),
  ]);

  const { byCurrency, byFirm } = summarizeCosts(costs ?? [], payouts ?? []);
  const entries = [
    ...(costs ?? []).map((c) => ({ type: "cost" as const, id: c.id, date: c.incurred_on, firm: c.firm, account: c.accounts?.name ?? null, label: labelFor(COST_KINDS, c.kind), amount: -c.amount, currency: c.currency, note: c.note })),
    ...(payouts ?? []).map((p) => ({ type: "payout" as const, id: p.id, date: p.paid_on, firm: p.firm, account: p.accounts?.name ?? null, label: "Auszahlung", amount: p.amount, currency: p.currency, note: p.note })),
  ].sort((a, b) => b.date.localeCompare(a.date));

  const formatDay = (date: string) => new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));

  return (
    <>
      <PageHeader title="Kosten & Auszahlungen" description="Was dich das Prop-Firm-Trading kostet – und was es wirklich einbringt.">
        <Button variant="outline" asChild>
          <Link href="/accounts">
            <ArrowLeft className="size-4" /> Accounts
          </Link>
        </Button>
      </PageHeader>

      <div className="grid gap-6">
        {byCurrency.length > 0 && (
          <div className="grid gap-3">
            {byCurrency.map((c) => (
              <section key={c.currency} className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label={`Summen in ${c.currency}`}>
                <StatTile label={`Kosten ${c.currency}`} value={formatMoney(c.costs, c.currency)} hint={`${c.costCount} Posten`} />
                <StatTile label={`Auszahlungen ${c.currency}`} value={formatMoney(c.payouts, c.currency)} hint={`${c.payoutCount} Auszahlungen`} />
                <StatTile label={`Netto ${c.currency}`} value={formatMoney(c.net, c.currency, true)} tone={c.net > 0 ? "profit" : c.net < 0 ? "loss" : null} hint="Auszahlungen minus Kosten" />
                <StatTile label={`ROI ${c.currency}`} value={roiText(c.roi)} hint={c.roi == null ? "Noch keine Kosten erfasst" : "Netto im Verhältnis zu den Kosten"} />
              </section>
            ))}
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <div className="grid content-start gap-6">
            <Card className="gap-2">
              <CardHeader>
                <CardTitle>Nach Prop Firm</CardTitle>
                <CardDescription>Lohnt sich die Firma unterm Strich?</CardDescription>
              </CardHeader>
              <CardContent className="px-0">
                {!byFirm.length ? (
                  <p className="px-6 text-sm text-muted-foreground">Noch keine Einträge.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="pl-6">Firma</TableHead>
                          <TableHead className="text-right">Kosten</TableHead>
                          <TableHead className="text-right">Auszahlungen</TableHead>
                          <TableHead className="text-right">Netto</TableHead>
                          <TableHead className="pr-6 text-right">ROI</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {byFirm.map((f) => (
                          <TableRow key={`${f.firm}|${f.currency}`}>
                            <TableCell className="pl-6">
                              <span className="font-medium">{f.firm}</span>
                              {f.accounts > 0 && (
                                <span className="block text-xs text-muted-foreground">{f.accounts === 1 ? "1 Account" : `${f.accounts} Accounts`}</span>
                              )}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">{formatMoney(f.costs, f.currency)}</TableCell>
                            <TableCell className="text-right tabular-nums">{formatMoney(f.payouts, f.currency)}</TableCell>
                            <TableCell className={cn("text-right font-medium tabular-nums", pnlClass(f.net))}>{formatMoney(f.net, f.currency, true)}</TableCell>
                            <TableCell className={cn("pr-6 text-right tabular-nums", pnlClass(f.roi))}>{roiText(f.roi)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="gap-2">
              <CardHeader>
                <CardTitle>Alle Einträge</CardTitle>
              </CardHeader>
              <CardContent className="px-0">
                {!entries.length ? (
                  <div className="flex flex-col items-center gap-2 px-6 py-8 text-center text-sm text-muted-foreground">
                    <Receipt className="size-8" aria-hidden />
                    <p className="font-medium text-foreground">Noch keine Kosten oder Auszahlungen</p>
                    <p className="max-w-sm">Trag Challenge-Gebühren, Resets und jede Auszahlung ein – dann siehst du die echte Rendite deiner Prop-Firm-Accounts.</p>
                  </div>
                ) : (
                  <ul className="divide-y text-sm">
                    {entries.map((e) => (
                      <li key={`${e.type}-${e.id}`} className="flex items-center gap-3 py-2 pr-3 pl-6">
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-x-2">
                            <span className="font-medium">{e.firm}</span>
                            <Badge variant="outline" className={cn("font-normal", e.type === "payout" && "border-profit/40 text-profit")}>
                              {e.label}
                            </Badge>
                          </span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {formatDay(e.date)}
                            {e.account && ` · ${e.account}`}
                            {e.note && ` · ${e.note}`}
                          </span>
                        </span>
                        <span className={cn("shrink-0 font-medium tabular-nums", pnlClass(e.amount))}>{formatMoney(e.amount, e.currency, true)}</span>
                        <EntryDelete type={e.type} id={e.id} label={e.label} />
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>

          <Card className="content-start">
            <CardHeader>
              <CardTitle>Neuer Eintrag</CardTitle>
            </CardHeader>
            <CardContent>
              <EntryForm accounts={accounts ?? []} today={todayBerlin()} />
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
