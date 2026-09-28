"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowUpRight, ImagePlus, Loader2, Pencil, Trash2 } from "lucide-react";
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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { chipClass } from "@/components/forms/choice-chips";
import { CHART_KINDS, type ChartKind } from "@/lib/daily-plan";
import type { DayChartItem } from "@/lib/day-charts";
import { SCREENSHOT_TYPES, checkScreenshots, uploadDayCharts } from "@/lib/screenshot-upload";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { deleteDayChart, updateDayChart } from "./actions";
import { ChartInfo, ChartLightbox, chartAlt } from "./chart-lightbox";
import { PlanCard, PlanLabel } from "./plan-section";

/**
 * Chart-Rückblick des Tages: Marktverlauf und verpasste Setups – unabhängig davon, ob getradet wurde.
 * Die Bilder landen nicht in der Screenshot-Galerie, sondern unter /plan/charts.
 */
export function DayCharts({
  date,
  userId,
  charts,
  markets,
  defaultKind,
}: {
  date: string;
  userId: string;
  charts: DayChartItem[];
  /** Symbole aus der Marktanalyse – Vorschläge für das Markt-Feld */
  markets: string[];
  defaultKind: ChartKind;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<ChartKind>(defaultKind);
  const [symbol, setSymbol] = useState("");
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [open, setOpen] = useState<number | null>(null);
  const [editing, setEditing] = useState<DayChartItem | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<DayChartItem | null>(null);
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
        const cleanSymbol = symbol.trim().slice(0, 30).toUpperCase() || null;
        await uploadDayCharts(createClient(), { userId, date, files: images, kind, symbol: cleanSymbol });
        toast.success(images.length === 1 ? "Chart gespeichert" : `${images.length} Charts gespeichert`);
        router.refresh();
      } catch (e) {
        toast.error(`Upload fehlgeschlagen: ${e instanceof Error ? e.message : "Unbekannter Fehler"}`);
      } finally {
        setUploading(false);
      }
    },
    [router, userId, date, kind, symbol],
  );

  // Strg+V: Bild aus der Zwischenablage einfügen (nicht, während ein Textfeld den Fokus hat)
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
    <PlanCard className="grid gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <PlanLabel>Chart-Rückblick</PlanLabel>
          <p className="text-sm text-muted-foreground">Wie hat sich der Markt bewegt? Hast du ein Setup übersehen?</p>
        </div>
        <Button variant="ghost" size="sm" asChild>
          <Link href="/plan/charts">
            Alle Bilder <ArrowUpRight className="size-3.5" />
          </Link>
        </Button>
      </div>

      <div className="flex flex-wrap items-end gap-x-6 gap-y-4">
        <div className="grid gap-2">
          <span id="chart-kind-label" className="text-[0.6875rem] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
            Neue Bilder als
          </span>
          <div role="radiogroup" aria-labelledby="chart-kind-label" className="flex flex-wrap gap-2">
            {CHART_KINDS.map((k) => (
              <button
                key={k.value}
                type="button"
                role="radio"
                aria-checked={kind === k.value}
                onClick={() => setKind(k.value)}
                className={chipClass(kind === k.value ? "selected" : "idle")}
              >
                {k.label}
              </button>
            ))}
          </div>
        </div>
        <div className="grid gap-2">
          <PlanLabel htmlFor="chart-symbol">Markt</PlanLabel>
          <Input
            id="chart-symbol"
            list="chart-markets"
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
            maxLength={30}
            placeholder="optional, z. B. EURUSD"
            className="w-48"
          />
          <MarketOptions id="chart-markets" markets={markets} />
        </div>
      </div>

      <div
        role="button"
        tabIndex={0}
        aria-label="Chart-Bild hochladen"
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key !== "Enter" && e.key !== " ") return;
          e.preventDefault();
          inputRef.current?.click();
        }}
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
          "flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground transition-colors outline-none hover:border-foreground/30 focus-visible:ring-3 focus-visible:ring-brand/30",
          dragging && "border-foreground/50 bg-muted/50",
        )}
      >
        {uploading ? <Loader2 className="size-5 animate-spin" /> : <ImagePlus className="size-5" />}
        <p>
          {uploading ? (
            "Wird hochgeladen …"
          ) : (
            <>
              Chart hierher ziehen, klicken oder mit <kbd className="rounded border px-1">Strg</kbd>+
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

      {charts.length > 0 && (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {charts.map((chart, i) => (
            <li key={chart.id} className="overflow-hidden rounded-lg border bg-background/40">
              <button
                type="button"
                onClick={() => setOpen(i)}
                className="block w-full bg-muted outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={`${chartAlt(chart)} groß anzeigen`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- signierte Supabase-URLs */}
                <img src={chart.url} alt={chartAlt(chart)} className="aspect-video w-full object-cover" loading="lazy" />
              </button>
              <div className="flex items-start justify-between gap-2 px-3 py-2.5">
                <ChartInfo item={chart} showDate={false} />
                <div className="-mr-1 flex shrink-0">
                  <Button variant="ghost" size="icon-sm" aria-label="Bild bearbeiten" onClick={() => setEditing(chart)}>
                    <Pencil className="size-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon-sm" aria-label="Bild löschen" onClick={() => setConfirmDelete(chart)}>
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <ChartLightbox items={charts} open={open} setOpen={setOpen} />

      <EditChartDialog chart={editing} markets={markets} onClose={() => setEditing(null)} />

      <AlertDialog open={confirmDelete != null} onOpenChange={(o) => !o && !deleting && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Chart-Bild löschen?</AlertDialogTitle>
            <AlertDialogDescription>Das Bild und seine Notiz werden endgültig entfernt.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={deleting}
              onClick={(e) => {
                e.preventDefault();
                const chart = confirmDelete;
                if (!chart) return;
                startDelete(async () => {
                  try {
                    await deleteDayChart(chart.id);
                    toast.success("Chart-Bild gelöscht");
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
    </PlanCard>
  );
}

function MarketOptions({ id, markets }: { id: string; markets: string[] }) {
  return (
    <datalist id={id}>
      {markets.map((m) => (
        <option key={m} value={m} />
      ))}
    </datalist>
  );
}

/** Art, Markt und Notiz eines Bilds nachträglich ändern. */
function EditChartDialog({ chart, markets, onClose }: { chart: DayChartItem | null; markets: string[]; onClose: () => void }) {
  return (
    <Dialog open={chart != null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        {chart && <EditChartForm key={chart.id} chart={chart} markets={markets} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  );
}

function EditChartForm({ chart, markets, onClose }: { chart: DayChartItem; markets: string[]; onClose: () => void }) {
  const [kind, setKind] = useState<ChartKind>(chart.kind);
  const [saving, startSave] = useTransition();

  return (
    <form
      className="grid gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        startSave(async () => {
          try {
            await updateDayChart(chart.id, { kind, symbol: String(fd.get("symbol") ?? ""), note: String(fd.get("note") ?? "") });
            toast.success("Gespeichert");
            onClose();
          } catch {
            toast.error("Speichern fehlgeschlagen");
          }
        });
      }}
    >
      <DialogHeader>
        <DialogTitle>Chart-Bild bearbeiten</DialogTitle>
        <DialogDescription>Art, Markt und eine kurze Notiz – z. B. was du im Chart siehst oder warum du das Setup verpasst hast.</DialogDescription>
      </DialogHeader>
      <div className="grid gap-2">
        <span id="edit-chart-kind-label" className="text-[0.6875rem] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
          Art
        </span>
        <div role="radiogroup" aria-labelledby="edit-chart-kind-label" className="flex flex-wrap gap-2">
          {CHART_KINDS.map((k) => (
            <button
              key={k.value}
              type="button"
              role="radio"
              aria-checked={kind === k.value}
              onClick={() => setKind(k.value)}
              className={chipClass(kind === k.value ? "selected" : "idle")}
            >
              {k.label}
            </button>
          ))}
        </div>
      </div>
      <div className="grid gap-2">
        <PlanLabel htmlFor="edit-chart-symbol">Markt</PlanLabel>
        <Input id="edit-chart-symbol" name="symbol" list="edit-chart-markets" defaultValue={chart.symbol ?? ""} maxLength={30} placeholder="optional" />
        <MarketOptions id="edit-chart-markets" markets={markets} />
      </div>
      <div className="grid gap-2">
        <PlanLabel htmlFor="edit-chart-note">Notiz</PlanLabel>
        <Textarea id="edit-chart-note" name="note" rows={4} defaultValue={chart.note ?? ""} maxLength={1000} placeholder="Was zeigt der Chart?" />
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
          Abbrechen
        </Button>
        <Button type="submit" disabled={saving}>
          {saving && <Loader2 className="size-4 animate-spin" />}
          Speichern
        </Button>
      </DialogFooter>
    </form>
  );
}
