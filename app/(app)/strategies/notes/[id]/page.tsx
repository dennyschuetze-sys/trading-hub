import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Pencil, Pin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Markdown } from "@/components/markdown";
import { extractStoragePaths, signStoragePaths } from "@/lib/note-images";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/trading";

export default async function NotePage({ params }: PageProps<"/strategies/notes/[id]">) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: note } = await supabase
    .from("playbook_notes")
    .select("*, strategies(id, name)")
    .eq("id", id)
    .maybeSingle();
  if (!note) notFound();

  const imageUrls = await signStoragePaths(supabase, extractStoragePaths(note.content));

  return (
    <article className="mx-auto grid max-w-3xl gap-6">
      <div className="grid gap-3">
        <Link href="/strategies#wissen" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> Wissen
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            {note.pinned && <Pin className="size-5 text-muted-foreground" aria-label="Angeheftet" />}
            {note.title}
          </h1>
          <Button variant="outline" asChild>
            <Link href={`/strategies/notes/${note.id}/edit`}>
              <Pencil className="size-4" /> Bearbeiten
            </Link>
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <span>Zuletzt geändert {formatDateTime(note.updated_at)}</span>
          {note.strategies && (
            <>
              <span aria-hidden>·</span>
              <Link href={`/strategies/${note.strategies.id}`} className="underline underline-offset-4 hover:text-foreground">
                {note.strategies.name}
              </Link>
            </>
          )}
          {note.tags.map((t) => (
            <Link key={t} href={`/strategies?tag=${encodeURIComponent(t)}#wissen`}>
              <Badge variant="secondary" className="font-normal">
                {t}
              </Badge>
            </Link>
          ))}
        </div>
      </div>

      <Card>
        <CardContent>
          {note.content.trim() ? (
            <Markdown content={note.content} imageUrls={imageUrls} className="text-base" />
          ) : (
            <p className="text-sm text-muted-foreground">Dieser Artikel ist noch leer.</p>
          )}
        </CardContent>
      </Card>
    </article>
  );
}
