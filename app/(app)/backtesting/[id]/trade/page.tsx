import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { fetchStrategyOptions } from "@/lib/strategy-options";
import { createClient } from "@/lib/supabase/server";
import { TradeForm } from "../../../journal/trade-form";

export default async function NewBacktestTradePage({ params }: PageProps<"/backtesting/[id]/trade">) {
  const { id } = await params;
  const supabase = await createClient();
  const [{ data: session }, strategies] = await Promise.all([
    supabase.from("backtest_sessions").select("id, name, market, strategy_id, symbols").eq("id", id).maybeSingle(),
    fetchStrategyOptions(supabase),
  ]);
  if (!session) notFound();

  return (
    <>
      <PageHeader title="Backtest-Trade erfassen" description={`Session: ${session.name}`} />
      <TradeForm accounts={[]} strategies={strategies} backtestSession={session} />
    </>
  );
}
