import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { fetchStrategyOptions } from "@/lib/strategy-options";
import { createClient } from "@/lib/supabase/server";
import { TradeForm } from "../../trade-form";

export default async function EditTradePage({ params }: PageProps<"/journal/[id]/edit">) {
  const { id } = await params;
  const supabase = await createClient();
  const [{ data: trade }, { data: accounts }, strategies, { data: results }] = await Promise.all([
    supabase.from("trades").select("*").eq("id", id).maybeSingle(),
    supabase.from("accounts").select("id, name, market").order("name"),
    fetchStrategyOptions(supabase),
    supabase.from("trade_checklist_results").select("item_id").eq("trade_id", id).eq("checked", true),
  ]);
  if (!trade) notFound();

  return (
    <>
      <PageHeader title={`${trade.symbol} bearbeiten`} />
      <TradeForm
        accounts={accounts ?? []}
        strategies={strategies}
        trade={trade}
        checkedItems={(results ?? []).map((r) => r.item_id)}
      />
    </>
  );
}
