"use client";

import { useEffect, type Dispatch, type SetStateAction } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { longDate } from "@/components/charts/format";
import { ZoomableImage } from "@/components/zoomable-image";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { CHART_KINDS, type ChartKind } from "@/lib/daily-plan";
import type { DayChartItem } from "@/lib/day-charts";
import { labelFor } from "@/lib/trading";
import { cn } from "@/lib/utils";

export const chartAlt = (item: DayChartItem) =>
  `${labelFor(CHART_KINDS, item.kind)}${item.symbol ? ` ${item.symbol}` : ""} vom ${longDate(item.date)}`;

/** Verpasste Setups heben sich ab (Warnton) – Grün/Rot bleiben Gewinn und Verlust vorbehalten. */
export function ChartKindBadge({ kind }: { kind: ChartKind }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center rounded-full px-2 text-[0.6875rem] font-semibold tracking-[0.04em] uppercase",
        kind === "missed_setup" ? "bg-warning/12 text-warning" : "bg-foreground/[0.06] text-muted-foreground",
      )}
    >
      {labelFor(CHART_KINDS, kind)}
    </span>
  );
}

/** Art, Markt, Tag und Notiz eines Bilds. */
export function ChartInfo({ item, showDate = true, clampNote = true, className }: { item: DayChartItem; showDate?: boolean; clampNote?: boolean; className?: string }) {
  return (
    <div className={cn("grid min-w-0 gap-1 text-sm", className)}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <ChartKindBadge kind={item.kind} />
        {item.symbol && <span className="font-semibold">{item.symbol}</span>}
        {showDate && <span className="text-xs text-muted-foreground">{longDate(item.date)}</span>}
      </div>
      {item.note && (
        <p className={cn("text-muted-foreground", clampNote ? "line-clamp-2" : "whitespace-pre-line")}>{item.note}</p>
      )}
    </div>
  );
}

/** Großansicht mit Zoom; Pfeiltasten und Schaltflächen blättern durch `items`. */
export function ChartLightbox({
  items,
  open,
  setOpen,
  actions,
}: {
  items: DayChartItem[];
  open: number | null;
  setOpen: Dispatch<SetStateAction<number | null>>;
  actions?: (item: DayChartItem) => React.ReactNode;
}) {
  // Nach dem Löschen kann der Index kurz ins Leere zeigen, bis die Liste neu geladen ist
  const current = open != null ? (items[open] ?? null) : null;
  const count = items.length;
  const isOpen = current != null;
  const step = (delta: number) => setOpen((i) => (i == null ? i : (i + delta + count) % count));

  useEffect(() => {
    if (!isOpen || count < 2) return;
    const onKey = (e: KeyboardEvent) => {
      const delta = e.key === "ArrowLeft" ? -1 : e.key === "ArrowRight" ? 1 : 0;
      if (delta) setOpen((i) => (i == null ? i : (i + delta + count) % count));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, count, setOpen]);

  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && setOpen(null)}>
      <DialogContent className="max-w-[95vw] gap-3 p-3 sm:max-w-[90vw]">
        {current && (
          <>
            <DialogTitle className="sr-only">{chartAlt(current)}</DialogTitle>
            <DialogDescription className="sr-only">Mit den Pfeiltasten zwischen den Bildern blättern.</DialogDescription>
            <ZoomableImage key={current.id} src={current.url} alt={chartAlt(current)} className="max-h-[78vh] rounded-md" />
            <div className="flex flex-wrap items-center gap-3">
              <ChartInfo item={current} clampNote={false} className="min-w-0 flex-1" />
              <div className="flex flex-wrap items-center gap-2">
                {count > 1 && (
                  <>
                    <Button variant="outline" size="icon" onClick={() => step(-1)} aria-label="Vorheriges Bild">
                      <ChevronLeft className="size-4" />
                    </Button>
                    <span className="text-sm text-muted-foreground tabular-nums">
                      {open! + 1} / {count}
                    </span>
                    <Button variant="outline" size="icon" onClick={() => step(1)} aria-label="Nächstes Bild">
                      <ChevronRight className="size-4" />
                    </Button>
                  </>
                )}
                {actions?.(current)}
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
