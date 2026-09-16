import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { fetchStrategyOptions } from "@/lib/strategy-options";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/trading";
import { TradeForm, type TradeTemplate } from "../trade-form";

const TEMPLATE_COLUMNS = "id, account_id, symbol, direction, entry_time, entry_price, stop_loss, strategy_id, entry_criterion, entry_timeframe, htf_bias, market_context, risk_amount, tags";

export default async function NewTradePage({ searchParams }: PageProps<"/journal/new">) {
  const { account, vorlage } = await searchParams;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");

  const [{ data: accounts }, strategies, { data: recent }] = await Promise.all([
    supabase.from("accounts").select("id, name, market, currency").eq("status", "active").order("name"),
    fetchStrategyOptions(supabase),
    supabase.from("trades").select(TEMPLATE_COLUMNS).eq("is_backtest", false).order("entry_time", { ascending: false }).limit(50),
  ]);

  if (!accounts?.length) {
    return (
      <>
        <PageHeader title="Neuer Trade" />
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <p className="font-medium">Du brauchst zuerst einen aktiven Account.</p>
            <Button asChild>
              <Link href="/accounts/new">Account anlegen</Link>
            </Button>
          </CardContent>
        </Card>
      </>
    );
  }

  const trades = recent ?? [];
  // Vorlage: ein früherer Trade liefert nur Setup-Werte, nie Kurse, Zeiten oder Ergebnis
  const source =
    typeof vorlage === "string"
      ? (trades.find((t) => t.id === vorlage) ??
        (await supabase.from("trades").select(TEMPLATE_COLUMNS).eq("id", vorlage).eq("is_backtest", false).maybeSingle()).data)
      : null;
  const template: TradeTemplate | null = source && {
    label: `${source.symbol} vom ${formatDate(source.entry_time)}`,
    account_id: accounts.some((a) => a.id === source.account_id) ? source.account_id : null,
    symbol: source.symbol,
    strategy_id: source.strategy_id,
    entry_criterion: source.entry_criterion,
    entry_timeframe: source.entry_timeframe,
    htf_bias: source.htf_bias,
    market_context: source.market_context,
    risk_amount: source.risk_amount,
    tags: source.tags,
  };

  // Letzter SL-Abstand je Symbol (nur Stops auf der Verlustseite)
  const stopDistances: Record<string, number> = {};
  for (const t of trades) {
    if (t.entry_price == null || t.stop_loss == null || t.symbol in stopDistances) continue;
    const distance = t.direction === "long" ? t.entry_price - t.stop_loss : t.stop_loss - t.entry_price;
    if (distance > 0) stopDistances[t.symbol] = Math.round(distance * 100000) / 100000;
  }
  const last = trades[0];

  return (
    <TradeForm
      key={template ? `vorlage-${source?.id}` : "leer"}
      accounts={accounts}
      strategies={strategies}
      userId={auth.user.id}
      defaultAccountId={typeof account === "string" ? account : undefined}
      heading={{ eyebrow: "Neuer Trade", title: "Trade erfassen", description: "Erfasse deinen Trade so detailliert wie nötig – Pflichtfelder sind mit * markiert." }}
      template={template}
      quickActions={{
        lastTrade: last && last.id !== source?.id ? { id: last.id, label: `${last.symbol} vom ${formatDate(last.entry_time)}` } : null,
        stopDistances,
      }}
      symbols={[...new Set(trades.map((t) => t.symbol))].slice(0, 20)}
    />
  );
}
