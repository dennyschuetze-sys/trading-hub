"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, Loader2, Trash2 } from "lucide-react";
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
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { ZoomableImage } from "@/components/zoomable-image";
import { SCREENSHOT_TYPES, checkScreenshots, uploadScreenshots } from "@/lib/screenshot-upload";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { deleteScreenshot } from "../actions";

export type ScreenshotView = { id: string; url: string };

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
  const [preview, setPreview] = useState<ScreenshotView | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<ScreenshotView | null>(null);
  const [deleting, startDelete] = useTransition();

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
    <div className="grid gap-4">
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && inputRef.current?.click()}
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
        className={cn(
          "flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground transition-colors hover:border-foreground/30",
          dragging && "border-foreground/50 bg-muted/50",
        )}
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
      </div>

      {screenshots.length > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {screenshots.map((shot) => (
            <div key={shot.id} className="group relative overflow-hidden rounded-lg border bg-muted">
              <button type="button" onClick={() => setPreview(shot)} className="block w-full">
                {/* eslint-disable-next-line @next/next/no-img-element -- signierte Supabase-URLs */}
                <img src={shot.url} alt="Trade-Screenshot" className="aspect-video w-full object-cover" />
              </button>
              <Button
                variant="secondary"
                size="icon"
                disabled={deleting}
                aria-label="Screenshot löschen"
                className="absolute top-2 right-2 opacity-80 shadow-sm transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                onClick={() => setConfirmDelete(shot)}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
        </div>
      )}

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

      <Dialog open={preview != null} onOpenChange={(open) => !open && setPreview(null)}>
        <DialogContent className="max-w-[95vw] p-2 sm:max-w-[90vw]">
          <DialogTitle className="sr-only">Screenshot</DialogTitle>
          {preview && <ZoomableImage key={preview.id} src={preview.url} alt="Trade-Screenshot" className="max-h-[85vh] rounded" />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
