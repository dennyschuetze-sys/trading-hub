"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, ImagePlus, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { ZoomableImage } from "@/components/zoomable-image";
import { SCREENSHOT_TYPES, checkScreenshots, uploadScreenshots } from "@/lib/screenshot-upload";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { deleteScreenshot } from "../actions";

export type ScreenshotView = { id: string; url: string };

/** Pfeiltasten wechseln das Bild – nur dort, wo der Fokus im Viewer liegt, damit sie nirgends sonst stören. */
function arrowKeys(go: (delta: number) => void) {
  return (e: React.KeyboardEvent) => {
    if (e.key === "ArrowLeft") go(-1);
    else if (e.key === "ArrowRight") go(1);
    else return;
    e.preventDefault();
  };
}

/** Screenshot-Karte des Trades: ein großes Bild, bei mehreren mit Pfeilen, Zähler und Vorschaubildern zum Wechseln. */
export function Screenshots({
  tradeId,
  userId,
  screenshots,
}: {
  tradeId: string;
  userId: string;
  screenshots: ScreenshotView[];
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [zoomed, setZoomed] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<ScreenshotView | null>(null);
  const [deleting, startDelete] = useTransition();

  // Angezeigtes Bild: nach einem Upload springt die Ansicht zum neuen Bild, nach dem Löschen bleibt sie in Reichweite
  const [index, setIndex] = useState(0);
  const [knownCount, setKnownCount] = useState(screenshots.length);
  if (screenshots.length !== knownCount) {
    setKnownCount(screenshots.length);
    setIndex(screenshots.length > knownCount ? screenshots.length - 1 : Math.min(index, Math.max(0, screenshots.length - 1)));
  }
  const count = screenshots.length;
  const position = Math.max(0, Math.min(index, count - 1));
  const current = screenshots[position] as ScreenshotView | undefined;
  const go = (delta: number) => setIndex((position + delta + count) % count);

  const upload = useCallback(
    async (files: File[]) => {
      const { images, error } = checkScreenshots(files);
      if (error) {
        toast.error(error);
        return;
      }

      setUploading(true);
      try {
        await uploadScreenshots(createClient(), { userId, tradeId, files: images });
        toast.success(images.length === 1 ? "Screenshot gespeichert" : `${images.length} Screenshots gespeichert`);
        router.refresh();
      } catch (e) {
        toast.error(`Upload fehlgeschlagen: ${e instanceof Error ? e.message : "Unbekannter Fehler"}`);
      } finally {
        setUploading(false);
      }
    },
    [router, tradeId, userId],
  );

  // Strg+V: Bild aus der Zwischenablage einfügen
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest("input, textarea, [contenteditable]")) return;
      const files = Array.from(event.clipboardData?.files ?? []);
      if (files.length) {
        event.preventDefault();
        void upload(files);
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [upload]);

  return (
    <Card
      className={cn("[--card-spacing:--spacing(5)]", dragging && "ring-2 ring-foreground/40")}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        void upload(Array.from(e.dataTransfer.files));
      }}
    >
      <CardHeader>
        <CardTitle className="text-lg font-semibold">Screenshots</CardTitle>
        <CardAction>
          <Button
            variant="outline"
            size="sm"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
            title="Oder Bild hierher ziehen bzw. mit Strg+V einfügen"
          >
            {uploading ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            Screenshot hinzufügen
          </Button>
        </CardAction>
      </CardHeader>

      <CardContent className="flex flex-1 flex-col justify-center gap-3">
        <input
          ref={inputRef}
          type="file"
          accept={SCREENSHOT_TYPES.join(",")}
          multiple
          hidden
          onChange={(e) => {
            void upload(Array.from(e.target.files ?? []));
            e.target.value = "";
          }}
        />

        {!current ? (
          <div
            role="button"
            tabIndex={0}
            onClick={() => inputRef.current?.click()}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && inputRef.current?.click()}
            className="flex flex-1 flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground transition-colors hover:border-foreground/30"
          >
            {uploading ? <Loader2 className="size-5 animate-spin" /> : <ImagePlus className="size-5" />}
            <p>
              {uploading ? (
                "Wird hochgeladen …"
              ) : (
                <>
                  Bild hierher ziehen, klicken oder mit <kbd className="rounded border px-1">Strg</kbd>+
                  <kbd className="rounded border px-1">V</kbd> einfügen
                </>
              )}
            </p>
          </div>
        ) : (
          // Der Rahmen schmiegt sich ans Bild: volle Breite, Höhe nach Seitenverhältnis, nichts wird abgeschnitten. Ist die
          // Karte höher als das Bild (neben der Spalte „Strategie / Ausführung“), steht der Rahmen mittig darin. Nur bei
          // sehr hohen Bildern begrenzt max-h die Höhe, dann bleibt links und rechts ein Streifen.
          <div
            className="group relative overflow-hidden rounded-lg border bg-muted"
            role="group"
            aria-roledescription="Bildergalerie"
            aria-label={`Screenshot ${position + 1} von ${count}`}
            onKeyDown={count > 1 ? arrowKeys(go) : undefined}
          >
            <button
              type="button"
              onClick={() => setZoomed(true)}
              className="block w-full cursor-zoom-in"
              aria-label="Screenshot vergrößern"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- signierte Supabase-URLs */}
              <img
                src={current.url}
                alt={`Trade-Screenshot ${position + 1} von ${count}`}
                className="block h-auto max-h-[80vh] w-full object-contain"
              />
            </button>

            {count > 1 && (
              <>
                <Button
                  variant="secondary"
                  size="icon"
                  aria-label="Vorheriges Bild"
                  title="Vorheriges Bild (←)"
                  className="absolute top-1/2 left-2 -translate-y-1/2 opacity-80 shadow-sm transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                  onClick={() => go(-1)}
                >
                  <ChevronLeft className="size-4" />
                </Button>
                <Button
                  variant="secondary"
                  size="icon"
                  aria-label="Nächstes Bild"
                  title="Nächstes Bild (→)"
                  className="absolute top-1/2 right-2 -translate-y-1/2 opacity-80 shadow-sm transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                  onClick={() => go(1)}
                >
                  <ChevronRight className="size-4" />
                </Button>
                <span
                  className="pointer-events-none absolute bottom-2 left-2 rounded-md bg-background/85 px-2 py-0.5 text-xs font-medium tabular-nums shadow-sm backdrop-blur"
                  aria-hidden
                >
                  {position + 1} / {count}
                </span>
              </>
            )}

            <Button
              variant="secondary"
              size="icon"
              disabled={deleting}
              aria-label="Screenshot löschen"
              className="absolute top-2 right-2 opacity-80 shadow-sm transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
              onClick={() => setConfirmDelete(current)}
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        )}
      </CardContent>

      <AlertDialog open={confirmDelete != null} onOpenChange={(open) => !open && !deleting && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Screenshot löschen?</AlertDialogTitle>
            <AlertDialogDescription>Das Bild wird endgültig entfernt.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={deleting}
              onClick={(e) => {
                e.preventDefault();
                const shot = confirmDelete;
                if (!shot) return;
                startDelete(async () => {
                  try {
                    await deleteScreenshot(shot.id, tradeId);
                    toast.success("Screenshot gelöscht");
                    setConfirmDelete(null);
                  } catch {
                    toast.error("Löschen fehlgeschlagen");
                  }
                });
              }}
            >
              {deleting && <Loader2 className="size-4 animate-spin" />}
              Endgültig löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={zoomed && current != null} onOpenChange={setZoomed}>
        <DialogContent
          className="max-w-[95vw] p-2 sm:max-w-[90vw]"
          onKeyDown={count > 1 ? arrowKeys(go) : undefined}
        >
          <DialogTitle className="sr-only">
            Screenshot {position + 1} von {count}
          </DialogTitle>
          {current && <ZoomableImage key={current.id} src={current.url} alt={`Trade-Screenshot ${position + 1} von ${count}`} className="max-h-[85vh] rounded" />}
          {count > 1 && (
            <>
              <Button
                variant="secondary"
                size="icon"
                aria-label="Vorheriges Bild"
                title="Vorheriges Bild (←)"
                className="absolute top-1/2 left-3 -translate-y-1/2 opacity-80 shadow-sm hover:opacity-100"
                onClick={() => go(-1)}
              >
                <ChevronLeft className="size-4" />
              </Button>
              <Button
                variant="secondary"
                size="icon"
                aria-label="Nächstes Bild"
                title="Nächstes Bild (→)"
                className="absolute top-1/2 right-3 -translate-y-1/2 opacity-80 shadow-sm hover:opacity-100"
                onClick={() => go(1)}
              >
                <ChevronRight className="size-4" />
              </Button>
              <span
                className="pointer-events-none absolute top-3 left-3 rounded-md bg-background/85 px-2 py-0.5 text-xs font-medium tabular-nums shadow-sm backdrop-blur"
                aria-hidden
              >
                {position + 1} / {count}
              </span>
            </>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
