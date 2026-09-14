import { notFound, redirect } from "next/navigation";
import { DeleteButton } from "@/components/forms/delete-button";
import { PageHeader } from "@/components/layout/page-header";
import { extractStoragePaths, signStoragePaths } from "@/lib/note-images";
import { createClient } from "@/lib/supabase/server";
import { deleteNote } from "../../../actions";
import { NoteForm } from "../../note-form";

export default async function EditNotePage({ params }: PageProps<"/strategies/notes/[id]/edit">) {
  const { id } = await params;
  const supabase = await createClient();
  const [{ data: auth }, { data: note }, { data: strategies }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from("playbook_notes").select("*").eq("id", id).maybeSingle(),
    supabase.from("strategies").select("id, name").order("name"),
  ]);
  if (!auth.user) redirect("/login");
  if (!note) notFound();

  const imageUrls = await signStoragePaths(supabase, extractStoragePaths(note.content));

  return (
    <>
      <PageHeader title="Artikel bearbeiten">
        <DeleteButton
          title="Artikel löschen?"
          description="Der Artikel und seine Bilder werden endgültig gelöscht."
          onConfirm={deleteNote.bind(null, note.id)}
        />
      </PageHeader>
      <NoteForm note={note} strategies={strategies ?? []} userId={auth.user.id} imageUrls={imageUrls} />
    </>
  );
}
