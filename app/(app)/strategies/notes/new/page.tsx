import { redirect } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { createClient } from "@/lib/supabase/server";
import { NoteForm } from "../note-form";

export default async function NewNotePage({ searchParams }: PageProps<"/strategies/notes/new">) {
  const { strategy } = await searchParams;
  const supabase = await createClient();
  const [{ data: auth }, { data: strategies }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from("strategies").select("id, name").order("name"),
  ]);
  if (!auth.user) redirect("/login");

  return (
    <>
      <PageHeader title="Neuer Artikel" />
      <NoteForm
        strategies={strategies ?? []}
        defaultStrategyId={typeof strategy === "string" ? strategy : undefined}
        userId={auth.user.id}
      />
    </>
  );
}
