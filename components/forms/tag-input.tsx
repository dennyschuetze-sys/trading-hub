"use client";

import { useState } from "react";
import { X } from "lucide-react";

/** Tags als Chips: Komma oder Enter übernimmt, Rücktaste im leeren Feld entfernt den letzten. Schickt `name` kommagetrennt. */
export function TagInput({
  name,
  id,
  defaultValue = [],
  placeholder = "Tag eingeben, mit Komma bestätigen …",
  onChange,
}: {
  name: string;
  id?: string;
  defaultValue?: string[];
  placeholder?: string;
  onChange?: (tags: string[]) => void;
}) {
  const [tags, setTags] = useState<string[]>(defaultValue);
  const [draft, setDraft] = useState("");

  const update = (next: string[]) => {
    setTags(next);
    onChange?.(next);
  };
  const commit = (raw: string) => {
    const added = raw
      .split(",")
      .map((t) => t.trim())
      .filter((t) => t && !tags.includes(t));
    if (added.length) update([...tags, ...added]);
    setDraft("");
  };

  // Nicht bestätigter Text zählt beim Speichern mit
  const value = [...tags, draft.trim()].filter(Boolean).join(", ");

  return (
    <div className="flex min-h-10 w-full flex-wrap items-center gap-1.5 rounded-lg border border-input px-2 py-1.5 transition-colors focus-within:border-profit focus-within:ring-3 focus-within:ring-profit/20 dark:bg-input/30">
      <input type="hidden" name={name} value={value} />
      {tags.map((tag) => (
        <span key={tag} className="inline-flex h-6 items-center gap-1 rounded-md bg-foreground/[0.07] pr-1 pl-2 text-xs">
          {tag}
          <button
            type="button"
            onClick={() => update(tags.filter((t) => t !== tag))}
            className="rounded p-0.5 text-muted-foreground hover:text-foreground"
            aria-label={`Tag ${tag} entfernen`}
          >
            <X className="size-3" />
          </button>
        </span>
      ))}
      <input
        id={id}
        value={draft}
        onChange={(e) => {
          if (e.target.value.includes(",")) commit(e.target.value);
          else setDraft(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit(draft);
          } else if (e.key === "Backspace" && !draft && tags.length) {
            update(tags.slice(0, -1));
          }
        }}
        onBlur={() => draft.trim() && commit(draft)}
        placeholder={tags.length ? "" : placeholder}
        className="h-7 min-w-32 flex-1 bg-transparent px-1 text-sm outline-none placeholder:text-muted-foreground"
      />
    </div>
  );
}
