import { notFound } from "next/navigation";
import { fetchStrategyOptions } from "@/lib/strategy-options";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/trading";
import { TradeForm } from "../../trade-form";

export default async function EditTradePage({ params }: PageProps<"/journal/[id]/edit">) {
  const { id } = await params;
  const supabase = await createClient();
  const [{ data: trade }, { data: accounts }, strategies, { data: results }, { data: auth }] = await Promise.all([
    supabase.from("trades").select("*").eq("id", id).maybeSingle(),
    supabase.from("accounts").select("id, name, market, currency").order("name"),
    fetchStrategyOptions(supabase),
    supabase.from("trade_checklist_results").select("item_id").eq("trade_id", id).eq("checked", true),
    supabase.auth.getUser(),
  ]);
  if (!trade || !auth.user) notFound();

  const { data: backtestSession } = trade.backtest_session_id
    ? await supabase
        .from("backtest_sessions")
        .select("id, name, market, currency, strategy_id, symbols")
        .eq("id", trade.backtest_session_id)
        .maybeSingle()
    : { data: null };

  return (
    <TradeForm
      accounts={accounts ?? []}
      strategies={strategies}
      trade={trade}
      userId={auth.user.id}
      checkedItems={(results ?? []).map((r) => r.item_id)}
      backtestSession={backtestSession ?? undefined}
      heading={{
        eyebrow: backtestSession ? "Backtest-Trade bearbeiten" : "Trade bearbeiten",
        title: `${trade.symbol} vom ${formatDate(trade.entry_time)}`,
        description: "Änderungen werden erst mit „Speichern“ übernommen.",
      }}
    />
  );
}
