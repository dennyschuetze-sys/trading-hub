"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { DeleteButton } from "@/components/forms/delete-button";
import { ZoomableImage } from "@/components/zoomable-image";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { pnlClass } from "@/lib/trading";
import { cn } from "@/lib/utils";
import { deleteScreenshot } from "../journal/actions";

export type ScreenshotItem = {
  id: string;
  url: string;
  tradeId: string;
  month: string;
  symbol: string;
  direction: "long" | "short";
  date: string;
  context: string;
  pnl: number | null;
  pnlLabel: string | null;
  r: number | null;
  rLabel: string | null;
  /** „2/3“, wenn der Trade mehrere Bilder hat */
  position: string | null;
};

/** Alle Screenshots nach Monat gruppiert; Klick öffnet die Großansicht mit Blättern per Pfeiltasten. */
export function ScreenshotGrid({ items }: { items: ScreenshotItem[] }) {
  const [open, setOpen] = useState<number | null>(null);
  const current = open != null ? items[open] : null;

  const months: { label: string; entries: { item: ScreenshotItem; index: number }[] }[] = [];
  items.forEach((item, index) => {
    const last = months.at(-1);
    if (last?.label === item.month) last.entries.push({ item, index });
    else months.push({ label: item.month, entries: [{ item, index }] });
  });

  const count = items.length;
  const isOpen = open != null;
  const step = (delta: number) => setOpen((i) => (i == null ? i : (i + delta + count) % count));

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      const delta = e.key === "ArrowLeft" ? -1 : e.key === "ArrowRight" ? 1 : 0;
      if (delta) setOpen((i) => (i == null ? i : (i + delta + count) % count));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, count]);

  return (
    <>
      <div className="grid gap-8">
        {months.map((month) => (
          <section key={month.label} className="grid gap-3" aria-label={month.label}>
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="text-lg font-semibold">{month.label}</h2>
              <span className="text-sm text-muted-foreground">
                {month.entries.length} {month.entries.length === 1 ? "Bild" : "Bilder"}
              </span>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {month.entries.map(({ item, index }) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setOpen(index)}
                  className="group overflow-hidden rounded-xl border bg-card text-left transition-colors outline-none hover:border-foreground/20 focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <div className="relative bg-muted">
                    {/* eslint-disable-next-line @next/next/no-img-element -- signierte Supabase-URLs */}
                    <img
                      src={item.url}
                      alt={`Chart ${item.symbol} vom ${item.date}`}
                      className="aspect-video w-full object-cover"
                      loading="lazy"
                    />
                    {item.position && (
                      <Badge variant="secondary" className="absolute top-2 right-2 tabular-nums">
                        {item.position}
                      </Badge>
                    )}
                  </div>
                  <TradeInfo item={item} className="px-4 py-3" />
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>

      <Dialog open={current != null} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="max-w-[95vw] gap-3 p-3 sm:max-w-[90vw]">
          {current && (
            <>
              <DialogTitle className="sr-only">
                Screenshot {current.symbol} vom {current.date}
              </DialogTitle>
              <DialogDescription className="sr-only">Mit den Pfeiltasten zwischen den Screenshots blättern.</DialogDescription>
              <ZoomableImage
                key={current.id}
                src={current.url}
                alt={`Chart ${current.symbol} vom ${current.date}`}
                className="max-h-[78vh] rounded-md"
              />
              <div className="flex flex-wrap items-center gap-3">
                <TradeInfo item={current} className="min-w-0 flex-1" />
                <div className="flex flex-wrap items-center gap-2">
                  {items.length > 1 && (
                    <>
                      <Button variant="outline" size="icon" onClick={() => step(-1)} aria-label="Vorheriger Screenshot">
                        <ChevronLeft className="size-4" />
                      </Button>
                      <span className="text-sm text-muted-foreground tabular-nums">
                        {open! + 1} / {items.length}
                      </span>
                      <Button variant="outline" size="icon" onClick={() => step(1)} aria-label="Nächster Screenshot">
                        <ChevronRight className="size-4" />
                      </Button>
                    </>
                  )}
                  <DeleteButton
                    title="Screenshot löschen?"
                    description={`Das Bild von ${current.symbol} (${current.date}) wird endgültig entfernt.`}
                    onConfirm={async () => {
                      await deleteScreenshot(current.id, current.tradeId);
                      toast.success("Screenshot gelöscht");
                      // Nach dem Neuladen rückt das nächste Bild an diese Stelle
                      setOpen((i) => (count <= 1 || i == null ? null : Math.min(i, count - 2)));
                    }}
                  />
                  <Button variant="secondary" asChild>
                    <Link href={`/journal/${current.tradeId}`}>
                      Zum Trade <ArrowUpRight className="size-4" />
                    </Link>
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function TradeInfo({ item, className }: { item: ScreenshotItem; className?: string }) {
  return (
    <div className={cn("flex items-center justify-between gap-3 text-sm", className)}>
      <span className="min-w-0">
        <span className="font-medium">{item.symbol}</span>{" "}
        <span className={item.direction === "long" ? "text-profit" : "text-loss"}>{item.direction === "long" ? "Long" : "Short"}</span>
        <span className="block truncate text-xs text-muted-foreground">{[item.date, item.context].filter(Boolean).join(" · ")}</span>
      </span>
      <span className="shrink-0 text-right tabular-nums">
        {item.pnlLabel ? (
          <>
            <span className={cn("block font-semibold", pnlClass(item.pnl))}>{item.pnlLabel}</span>
            {item.rLabel && <span className="block text-xs text-muted-foreground">{item.rLabel}</span>}
          </>
        ) : (
          item.rLabel && <span className={cn("font-semibold", pnlClass(item.r))}>{item.rLabel}</span>
        )}
      </span>
    </div>
  );
}
