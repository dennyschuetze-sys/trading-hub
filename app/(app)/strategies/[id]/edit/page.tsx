import { notFound, redirect } from "next/navigation";
import { DeleteButton } from "@/components/forms/delete-button";
import { PageHeader } from "@/components/layout/page-header";
import { extractStoragePaths, signStoragePaths } from "@/lib/note-images";
import { createClient } from "@/lib/supabase/server";
import { deleteStrategy } from "../../actions";
import { StrategyForm } from "../../strategy-form";

export default async function EditStrategyPage({ params }: PageProps<"/strategies/[id]/edit">) {
  const { id } = await params;
  const supabase = await createClient();
  const [{ data: auth }, { data: strategy }, { data: checklist }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from("strategies").select("*").eq("id", id).maybeSingle(),
    supabase.from("strategy_checklist_items").select("id, label").eq("strategy_id", id).order("position"),
  ]);
  if (!auth.user) redirect("/login");
  if (!strategy) notFound();

  const imageUrls = await signStoragePaths(
    supabase,
    extractStoragePaths(strategy.entry_rules, strategy.exit_rules, strategy.risk_rules, strategy.notes),
  );

  return (
    <>
      <PageHeader title={`${strategy.name} bearbeiten`}>
        <DeleteButton
          title="Strategie löschen?"
          description="Die Strategie und ihre Checkliste werden gelöscht. Deine Trades bleiben erhalten, verlieren aber die Zuordnung und die Checklisten-Häkchen."
          onConfirm={deleteStrategy.bind(null, strategy.id)}
        />
      </PageHeader>
      <StrategyForm strategy={strategy} checklist={checklist ?? []} userId={auth.user.id} imageUrls={imageUrls} />
    </>
  );
}
