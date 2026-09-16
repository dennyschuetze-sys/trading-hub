import { notFound } from "next/navigation";
import { fetchStrategyOptions } from "@/lib/strategy-options";
import { createClient } from "@/lib/supabase/server";
import { TradeForm } from "../../../journal/trade-form";

export default async function NewBacktestTradePage({ params }: PageProps<"/backtesting/[id]/trade">) {
  const { id } = await params;
  const supabase = await createClient();
  const [{ data: session }, strategies, { data: auth }] = await Promise.all([
    supabase.from("backtest_sessions").select("id, name, market, currency, strategy_id, symbols").eq("id", id).maybeSingle(),
    fetchStrategyOptions(supabase),
    supabase.auth.getUser(),
  ]);
  if (!session || !auth.user) notFound();

  return (
    <TradeForm
      accounts={[]}
      strategies={strategies}
      backtestSession={session}
      userId={auth.user.id}
      heading={{ eyebrow: "Backtest-Trade", title: "Trade erfassen", description: `Session: ${session.name} – Pflichtfelder sind mit * markiert.` }}
    />
  );
}
