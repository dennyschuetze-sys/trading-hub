import { PageHeader } from "@/components/layout/page-header";
import { createClient } from "@/lib/supabase/server";
import { SessionForm } from "../session-form";

export default async function NewBacktestSessionPage({ searchParams }: PageProps<"/backtesting/new">) {
  const { strategy } = await searchParams;
  const supabase = await createClient();
  const { data: strategies } = await supabase.from("strategies").select("id, name").order("name");

  return (
    <>
      <PageHeader title="Neue Backtest-Session" description="Danach erfasst du die Trades aus dem Replay mit der gewohnten Maske." />
      <SessionForm strategies={strategies ?? []} defaultStrategyId={typeof strategy === "string" ? strategy : undefined} />
    </>
  );
}
