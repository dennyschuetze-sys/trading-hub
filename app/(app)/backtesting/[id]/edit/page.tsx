import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { createClient } from "@/lib/supabase/server";
import { SessionForm } from "../../session-form";

export default async function EditBacktestSessionPage({ params }: PageProps<"/backtesting/[id]/edit">) {
  const { id } = await params;
  const supabase = await createClient();
  const [{ data: session }, { data: strategies }] = await Promise.all([
    supabase.from("backtest_sessions").select("*").eq("id", id).maybeSingle(),
    supabase.from("strategies").select("id, name").order("name"),
  ]);
  if (!session) notFound();

  return (
    <>
      <PageHeader title={`${session.name} bearbeiten`} />
      <SessionForm session={session} strategies={strategies ?? []} />
    </>
  );
}
