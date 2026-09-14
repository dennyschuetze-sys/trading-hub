import { redirect } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { getUser } from "@/lib/supabase/server";
import { StrategyForm } from "../strategy-form";

export default async function NewStrategyPage() {
  const user = await getUser();
  if (!user) redirect("/login");

  return (
    <>
      <PageHeader title="Neue Strategie" description="Klare Regeln und eine Checkliste machen dein Setup messbar." />
      <StrategyForm userId={user.id} />
    </>
  );
}
