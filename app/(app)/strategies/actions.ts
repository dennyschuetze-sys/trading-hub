"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { FormError, requiredText, text, type FormState } from "@/lib/form-data";
import { extractStoragePaths } from "@/lib/note-images";
import { STRATEGY_STATUSES, splitList } from "@/lib/strategies";

async function requireUser() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");
  return supabase;
}

type Supabase = Awaited<ReturnType<typeof requireUser>>;

/** Löscht Bilddateien nur, wenn kein anderer Artikel und keine Strategie sie noch verwendet. */
async function removeUnusedImages(supabase: Supabase, paths: string[]) {
  const unused: string[] = [];
  for (const path of paths) {
    const pattern = `%${path}%`;
    const [{ count: inNotes }, { count: inStrategies }] = await Promise.all([
      supabase.from("playbook_notes").select("id", { count: "exact", head: true }).ilike("content", pattern),
      supabase
        .from("strategies")
        .select("id", { count: "exact", head: true })
        .or(`entry_rules.ilike.${pattern},exit_rules.ilike.${pattern},risk_rules.ilike.${pattern},notes.ilike.${pattern}`),
    ]);
    if (!inNotes && !inStrategies) unused.push(path);
  }
  if (unused.length) await supabase.storage.from("screenshots").remove(unused);
}

const MAX_TEXT = 50_000;
const longText = (formData: FormData, key: string) => text(formData, key)?.slice(0, MAX_TEXT) ?? null;

// Strategien -----------------------------------------------------------------------

export async function saveStrategy(strategyId: string | null, _prev: FormState, formData: FormData): Promise<FormState> {
  const supabase = await requireUser();

  let values;
  try {
    const status = requiredText(formData, "status", "Status");
    if (!STRATEGY_STATUSES.some((s) => s.value === status)) throw new FormError("Ungültiger Status.");
    values = {
      name: requiredText(formData, "name", "Name").slice(0, 100),
      summary: text(formData, "summary")?.slice(0, 500) ?? null,
      status,
      markets: splitList(text(formData, "markets")).map((m) => m.toUpperCase()),
      timeframes: splitList(text(formData, "timeframes")),
      entry_rules: longText(formData, "entry_rules"),
      exit_rules: longText(formData, "exit_rules"),
      risk_rules: longText(formData, "risk_rules"),
      notes: longText(formData, "notes"),
    };
  } catch (e) {
    if (e instanceof FormError) return { error: e.message };
    throw e;
  }

  const { data: previous } = strategyId
    ? await supabase.from("strategies").select("entry_rules, exit_rules, risk_rules, notes").eq("id", strategyId).maybeSingle()
    : { data: null };

  const { data: saved, error } = strategyId
    ? await supabase.from("strategies").update(values).eq("id", strategyId).select("id").single()
    : await supabase.from("strategies").insert(values).select("id").single();
  if (error) return { error: `Speichern fehlgeschlagen: ${error.message}` };

  // Checkliste abgleichen: Reihenfolge = Position, leere Zeilen ignorieren
  const ids = formData.getAll("checklist_id").map(String);
  const labels = formData.getAll("checklist_label").map((l) => String(l).trim().slice(0, 200));
  const items = labels.map((label, i) => ({ id: ids[i] || null, label, position: i })).filter((i) => i.label);

  const { data: existing } = await supabase
    .from("strategy_checklist_items")
    .select("id")
    .eq("strategy_id", saved.id);
  const keep = new Set(items.flatMap((i) => (i.id ? [i.id] : [])));
  const removed = (existing ?? []).map((e) => e.id).filter((id) => !keep.has(id));
  if (removed.length) await supabase.from("strategy_checklist_items").delete().in("id", removed);

  for (const item of items.filter((i) => i.id && (existing ?? []).some((e) => e.id === i.id))) {
    await supabase
      .from("strategy_checklist_items")
      .update({ label: item.label, position: item.position })
      .eq("id", item.id!);
  }
  const created = items.filter((i) => !i.id || !(existing ?? []).some((e) => e.id === i.id));
  if (created.length) {
    const { error: insertError } = await supabase
      .from("strategy_checklist_items")
      .insert(created.map((i) => ({ strategy_id: saved.id, label: i.label, position: i.position })));
    if (insertError) return { error: `Checkliste konnte nicht gespeichert werden: ${insertError.message}` };
  }

  if (previous) {
    const now = new Set(extractStoragePaths(values.entry_rules, values.exit_rules, values.risk_rules, values.notes));
    await removeUnusedImages(
      supabase,
      extractStoragePaths(previous.entry_rules, previous.exit_rules, previous.risk_rules, previous.notes).filter((p) => !now.has(p)),
    );
  }

  revalidatePath("/strategies");
  redirect(`/strategies/${saved.id}`);
}

export async function deleteStrategy(strategyId: string) {
  const supabase = await requireUser();
  const { data } = await supabase
    .from("strategies")
    .select("entry_rules, exit_rules, risk_rules, notes")
    .eq("id", strategyId)
    .maybeSingle();
  const { error } = await supabase.from("strategies").delete().eq("id", strategyId);
  if (error) throw new Error(error.message);
  if (data) await removeUnusedImages(supabase, extractStoragePaths(data.entry_rules, data.exit_rules, data.risk_rules, data.notes));
  revalidatePath("/strategies");
  revalidatePath("/journal");
  redirect("/strategies");
}

// Wissensartikel ---------------------------------------------------------------------

export async function saveNote(noteId: string | null, _prev: FormState, formData: FormData): Promise<FormState> {
  const supabase = await requireUser();

  let values;
  try {
    values = {
      title: requiredText(formData, "title", "Titel").slice(0, 200),
      content: longText(formData, "content") ?? "",
      tags: splitList(text(formData, "tags")),
      strategy_id: text(formData, "strategy_id"),
      pinned: formData.get("pinned") === "on",
    };
  } catch (e) {
    if (e instanceof FormError) return { error: e.message };
    throw e;
  }

  let previousContent = "";
  if (noteId) {
    const { data } = await supabase.from("playbook_notes").select("content").eq("id", noteId).maybeSingle();
    previousContent = data?.content ?? "";
  }

  const { data: saved, error } = noteId
    ? await supabase.from("playbook_notes").update(values).eq("id", noteId).select("id").single()
    : await supabase.from("playbook_notes").insert(values).select("id").single();
  if (error) return { error: `Speichern fehlgeschlagen: ${error.message}` };

  // Aus dem Text entfernte Bilder auch im Speicher löschen
  const stillUsed = new Set(extractStoragePaths(values.content));
  await removeUnusedImages(supabase, extractStoragePaths(previousContent).filter((p) => !stillUsed.has(p)));

  revalidatePath("/strategies");
  redirect(`/strategies/notes/${saved.id}`);
}

export async function deleteNote(noteId: string) {
  const supabase = await requireUser();
  const { data } = await supabase.from("playbook_notes").select("content").eq("id", noteId).maybeSingle();

  const { error } = await supabase.from("playbook_notes").delete().eq("id", noteId);
  if (error) throw new Error(error.message);
  await removeUnusedImages(supabase, extractStoragePaths(data?.content));
  revalidatePath("/strategies");
  redirect("/strategies#wissen");
}
