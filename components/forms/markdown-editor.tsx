"use client";

import { useRef, useState } from "react";
import { Bold, Heading2, ImagePlus, Link2, List, ListChecks, Loader2, Quote } from "lucide-react";
import { toast } from "sonner";
import { Markdown } from "@/components/markdown";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { STORAGE_PREFIX } from "@/lib/note-images";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

const ALLOWED = ["image/png", "image/jpeg", "image/webp", "image/gif"];

const TOOLS = [
  { key: "bold", icon: Bold, label: "Fett" },
  { key: "heading", icon: Heading2, label: "Überschrift" },
  { key: "list", icon: List, label: "Liste" },
  { key: "checklist", icon: ListChecks, label: "Checkliste" },
  { key: "quote", icon: Quote, label: "Zitat" },
  { key: "link", icon: Link2, label: "Link" },
] as const;
type ToolKey = (typeof TOOLS)[number]["key"];

/**
 * Markdown-Feld mit Werkzeugleiste und Vorschau. Bilder (Einfügen, Ziehen, Button) werden in den
 * privaten Bucket geladen und als `storage://…` im Text referenziert.
 */
export function MarkdownEditor({
  id,
  name,
  defaultValue = "",
  imageUrls: initialUrls = {},
  userId,
  rows = 10,
  placeholder,
}: {
  id: string;
  name: string;
  defaultValue?: string;
  imageUrls?: Record<string, string>;
  userId: string;
  rows?: number;
  placeholder?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [value, setValueState] = useState(defaultValue);
  const [tab, setTab] = useState<"write" | "preview">("write");
  const [uploading, setUploading] = useState(false);
  const [imageUrls, setImageUrls] = useState(initialUrls);

  // Aktueller Text und Cursor ohne Warten auf das nächste Rendern (mehrere Bilder nacheinander)
  const valueRef = useRef(defaultValue);
  const cursorRef = useRef<{ start: number; end: number } | null>(null);
  const setValue = (next: string) => {
    valueRef.current = next;
    setValueState(next);
  };
  const selection = () => {
    const el = ref.current;
    const current = cursorRef.current ?? { start: el?.selectionStart ?? valueRef.current.length, end: el?.selectionEnd ?? valueRef.current.length };
    cursorRef.current = null;
    return current;
  };

  /** Ersetzt die Auswahl bzw. fügt an der Cursorposition ein. */
  const insert = (before: string, after = "", placeholderText = "") => {
    const text = valueRef.current;
    const { start: s, end: e } = selection();
    const selected = text.slice(s, e) || placeholderText;
    setValue(text.slice(0, s) + before + selected + after + text.slice(e));
    const caret = s + before.length + selected.length + after.length;
    cursorRef.current = { start: caret, end: caret };
    requestAnimationFrame(() => {
      const el = ref.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(s + before.length, s + before.length + selected.length);
      cursorRef.current = null;
    });
  };

  const prefixLines = (prefix: string) => {
    const text = valueRef.current;
    const { start, end } = selection();
    const lineStart = text.lastIndexOf("\n", start - 1) + 1;
    const replaced = text.slice(lineStart, end).split("\n").map((l) => prefix + l).join("\n");
    setValue(text.slice(0, lineStart) + replaced + text.slice(end));
    requestAnimationFrame(() => ref.current?.focus());
  };

  const uploadImages = async (files: File[]) => {
    const images = files.filter((f) => ALLOWED.includes(f.type));
    if (!images.length) return;
    if (images.some((f) => f.size > 10 * 1024 * 1024)) {
      toast.error("Bilder dürfen höchstens 10 MB groß sein.");
      return;
    }
    setUploading(true);
    const supabase = createClient();
    try {
      for (const file of images) {
        const ext = file.type.split("/")[1].replace("jpeg", "jpg");
        const path = `${userId}/notes/${crypto.randomUUID()}.${ext}`;
        const { error } = await supabase.storage.from("screenshots").upload(path, file, { contentType: file.type });
        if (error) throw error;
        setImageUrls((urls) => ({ ...urls, [path]: URL.createObjectURL(file) }));
        insert(`\n![${file.name.replace(/\.[a-z]+$/i, "") || "Bild"}](${STORAGE_PREFIX}${path})\n`);
      }
    } catch (e) {
      toast.error(`Bild-Upload fehlgeschlagen: ${e instanceof Error ? e.message : "Unbekannter Fehler"}`);
    } finally {
      setUploading(false);
    }
  };

  const runTool = (key: ToolKey) => {
    if (key === "bold") insert("**", "**", "fett");
    else if (key === "link") insert("[", "](https://)", "Linktext");
    else prefixLines({ heading: "## ", list: "- ", checklist: "- [ ] ", quote: "> " }[key]);
  };

  return (
    <div className="grid gap-2 rounded-md border p-2">
      <div className="flex flex-wrap items-center gap-1">
        <div className="mr-2 flex rounded-md bg-muted p-0.5 text-sm" role="tablist">
          {(["write", "preview"] as const).map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={cn("rounded px-2.5 py-1", tab === t ? "bg-background font-medium shadow-sm" : "text-muted-foreground")}
            >
              {t === "write" ? "Schreiben" : "Vorschau"}
            </button>
          ))}
        </div>
        {tab === "write" &&
          TOOLS.map(({ key, icon: Icon, label }) => (
            <Button key={key} type="button" variant="ghost" size="icon" className="size-8" onClick={() => runTool(key)} aria-label={label} title={label}>
              <Icon className="size-4" />
            </Button>
          ))}
        {tab === "write" && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={() => fileRef.current?.click()}
            aria-label="Bild einfügen"
            title="Bild einfügen (oder Strg+V)"
            disabled={uploading}
          >
            {uploading ? <Loader2 className="size-4 animate-spin" /> : <ImagePlus className="size-4" />}
          </Button>
        )}
        <input
          ref={fileRef}
          type="file"
          accept={ALLOWED.join(",")}
          multiple
          hidden
          onChange={(e) => {
            void uploadImages(Array.from(e.target.files ?? []));
            e.target.value = "";
          }}
        />
      </div>

      <Textarea
        ref={ref}
        id={id}
        name={name}
        rows={rows}
        value={value}
        placeholder={placeholder}
        onChange={(e) => setValue(e.target.value)}
        onPaste={(e) => {
          const files = Array.from(e.clipboardData.files);
          if (files.some((f) => ALLOWED.includes(f.type))) {
            e.preventDefault();
            void uploadImages(files);
          }
        }}
        onDrop={(e) => {
          const files = Array.from(e.dataTransfer.files);
          if (files.length) {
            e.preventDefault();
            void uploadImages(files);
          }
        }}
        className={cn("min-h-40 border-0 font-mono text-sm shadow-none focus-visible:ring-0", tab === "preview" && "hidden")}
      />
      {tab === "preview" && (
        <div className="min-h-40 px-3 py-2">
          {value.trim() ? (
            <Markdown content={value} imageUrls={imageUrls} />
          ) : (
            <p className="text-sm text-muted-foreground">Nichts zum Anzeigen.</p>
          )}
        </div>
      )}
      <p className="px-1 text-xs text-muted-foreground">
        Markdown: **fett**, ## Überschrift, - Liste, - [ ] Checkliste. Bilder per Strg+V einfügen.
      </p>
    </div>
  );
}
