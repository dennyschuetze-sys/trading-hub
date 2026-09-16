"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ImagePlus, X } from "lucide-react";
import { toast } from "sonner";
import { SCREENSHOT_TYPES, checkScreenshots } from "@/lib/screenshot-upload";
import { cn } from "@/lib/utils";

/**
 * Screenshots vor dem Speichern sammeln (Auswahl, Drag & Drop, Strg+V). Hochgeladen wird erst,
 * wenn der Trade gespeichert ist – vorher gibt es keine Trade-ID für den Speicherort.
 */
export function PendingScreenshots({ files, onChange, disabled }: { files: File[]; onChange: (files: File[]) => void; disabled?: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const previews = useMemo(() => files.map((file) => ({ file, url: URL.createObjectURL(file) })), [files]);
  useEffect(() => () => previews.forEach((p) => URL.revokeObjectURL(p.url)), [previews]);

  const add = (incoming: File[]) => {
    const { images, error } = checkScreenshots(incoming);
    if (error) {
      toast.error(error);
      return;
    }
    onChange([...files, ...images]);
  };

  // Strg+V außerhalb von Textfeldern fügt Bilder aus der Zwischenablage hinzu
  const addRef = useRef(add);
  useEffect(() => {
    addRef.current = add;
  });
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest("input, textarea, [contenteditable]")) return;
      const pasted = Array.from(event.clipboardData?.files ?? []);
      if (pasted.length) {
        event.preventDefault();
        addRef.current(pasted);
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []);

  return (
    <div className="grid gap-3">
      <div
        role="button"
        tabIndex={0}
        aria-disabled={disabled}
        onClick={() => !disabled && inputRef.current?.click()}
        onKeyDown={(e) => !disabled && (e.key === "Enter" || e.key === " ") && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (!disabled) add(Array.from(e.dataTransfer.files));
        }}
        className={cn(
          "flex flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground transition-colors outline-none hover:border-profit/40 focus-visible:ring-3 focus-visible:ring-profit/25",
          dragging && "border-profit/60 bg-profit/5",
        )}
      >
        <ImagePlus className="size-5" aria-hidden />
        <p className="font-medium text-foreground">Screenshot hinzufügen</p>
        <p className="text-xs">
          Ziehen, klicken oder <kbd className="rounded border px-1">Strg</kbd>+<kbd className="rounded border px-1">V</kbd>
        </p>
        <input
          ref={inputRef}
          type="file"
          accept={SCREENSHOT_TYPES.join(",")}
          multiple
          hidden
          onChange={(e) => {
            add(Array.from(e.target.files ?? []));
            e.target.value = "";
          }}
        />
      </div>

      {previews.length > 0 && (
        <>
          <ul className="grid grid-cols-2 gap-2">
            {previews.map(({ file, url }, i) => (
              <li key={url} className="group relative overflow-hidden rounded-lg border bg-muted">
                {/* eslint-disable-next-line @next/next/no-img-element -- lokale Vorschau (Object-URL) */}
                <img src={url} alt={`Screenshot ${i + 1}: ${file.name}`} className="aspect-video w-full object-cover" />
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onChange(files.filter((f) => f !== file))}
                  className="absolute top-1 right-1 rounded-md bg-background/80 p-1 text-muted-foreground hover:text-foreground"
                  aria-label={`${file.name} entfernen`}
                >
                  <X className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">Wird beim Speichern hochgeladen.</p>
        </>
      )}
    </div>
  );
}
