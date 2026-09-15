import Link from "next/link";
import { Pencil, Plus, Receipt, Wallet } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { PageHeader } from "@/components/layout/page-header";
import { createClient } from "@/lib/supabase/server";
import {
  ACCOUNT_STATUSES,
  DRAWDOWN_TYPES,
  PHASES,
  formatMoney,
  labelFor,
  pnlClass,
  summarizeAccount,
} from "@/lib/trading";

export default async function AccountsPage() {
  const supabase = await createClient();
  const [{ data: accounts }, { data: trades }] = await Promise.all([
    supabase.from("accounts").select("*").order("status").order("created_at", { ascending: false }),
    supabase.from("trades").select("account_id, net_pnl, status").eq("is_backtest", false),
  ]);

  return (
    <>
      <PageHeader title="Accounts" description="Deine Prop-Firm- und eigenen Konten mit ihren Regeln.">
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild>
            <Link href="/accounts/costs">
              <Receipt className="size-4" /> Kosten & Auszahlungen
            </Link>
          </Button>
          <Button asChild>
            <Link href="/accounts/new">
              <Plus className="size-4" /> Neuer Account
            </Link>
          </Button>
        </div>
      </PageHeader>

      {!accounts?.length ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <Wallet className="size-8 text-muted-foreground" />
            <p className="font-medium">Noch keine Accounts</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              Lege zuerst deine Konten an. Danach kannst du Trades erfassen und importieren.
            </p>
            <Button asChild>
              <Link href="/accounts/new">Ersten Account anlegen</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {accounts.map((account) => {
            const s = summarizeAccount(
              account,
              (trades ?? []).filter((t) => t.account_id === account.id),
            );
            const money = (v: number | null, signed = false) => formatMoney(v, account.currency, signed);

            return (
              <Card key={account.id} className={account.status === "active" ? "" : "opacity-70"}>
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <CardTitle className="truncate">{account.name}</CardTitle>
                      <CardDescription>{account.firm ?? "Ohne Firma"}</CardDescription>
                    </div>
                    <Button variant="ghost" size="icon" asChild>
                      <Link href={`/accounts/${account.id}/edit`} aria-label="Bearbeiten">
                        <Pencil className="size-4" />
                      </Link>
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <Badge variant="secondary">{labelFor(PHASES, account.phase)}</Badge>
                    <Badge variant="outline">{labelFor(ACCOUNT_STATUSES, account.status)}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="grid gap-4">
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-muted-foreground">Kontostand</p>
                      <p className="text-lg font-semibold tabular-nums">{money(s.balance)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Netto P&L</p>
                      <p className={`text-lg font-semibold tabular-nums ${pnlClass(s.netPnl)}`}>
                        {money(s.netPnl, true)}
                      </p>
                    </div>
                  </div>

                  {s.targetProgress != null && (
                    <div className="grid gap-1.5">
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>Gewinnziel {money(account.profit_target)}</span>
                        <span>{Math.round(s.targetProgress * 100)} %</span>
                      </div>
                      <Progress value={s.targetProgress * 100} />
                    </div>
                  )}

                  <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                    <dt className="text-muted-foreground">Max. Tagesverlust</dt>
                    <dd className="text-right tabular-nums">{money(account.max_daily_loss)}</dd>
                    <dt className="text-muted-foreground">Max. Drawdown</dt>
                    <dd className="text-right tabular-nums">{money(account.max_drawdown)}</dd>
                    <dt className="text-muted-foreground">Drawdown-Art</dt>
                    <dd className="text-right">{labelFor(DRAWDOWN_TYPES, account.drawdown_type).split(" (")[0]}</dd>
                    <dt className="text-muted-foreground">Trades</dt>
                    <dd className="text-right tabular-nums">{s.tradeCount}</dd>
                  </dl>

                  <Button variant="outline" size="sm" asChild>
                    <Link href={`/journal?account=${account.id}`}>Trades ansehen</Link>
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
