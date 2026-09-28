"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { toast } from "sonner";
import { DeleteButton } from "@/components/forms/delete-button";
import { Button } from "@/components/ui/button";
import type { DayChartItem } from "@/lib/day-charts";
import { TIME_ZONE } from "@/lib/trading";
import { deleteDayChart } from "../actions";
import { ChartInfo, ChartLightbox, chartAlt } from "../chart-lightbox";

const monthLabel = new Intl.DateTimeFormat("de-DE", { month: "long", year: "numeric", timeZone: TIME_ZONE });

/** Alle Chart-Bilder nach Monat gruppiert; Klick öffnet die Großansicht mit Blättern per Pfeiltasten. */
export function ChartGallery({ items }: { items: DayChartItem[] }) {
  const [open, setOpen] = useState<number | null>(null);
  const count = items.length;

  const months: { label: string; entries: { item: DayChartItem; index: number }[] }[] = [];
  items.forEach((item, index) => {
    const label = monthLabel.format(new Date(`${item.date}T12:00:00Z`));
    const last = months.at(-1);
    if (last?.label === label) last.entries.push({ item, index });
    else months.push({ label, entries: [{ item, index }] });
  });

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
                  <div className="bg-muted">
                    {/* eslint-disable-next-line @next/next/no-img-element -- signierte Supabase-URLs */}
                    <img src={item.url} alt={chartAlt(item)} className="aspect-video w-full object-cover" loading="lazy" />
                  </div>
                  <ChartInfo item={item} className="px-4 py-3" />
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>

      <ChartLightbox
        items={items}
        open={open}
        setOpen={setOpen}
        actions={(current) => (
          <>
            <DeleteButton
              title="Chart-Bild löschen?"
              description={`${chartAlt(current)} wird endgültig entfernt.`}
              onConfirm={async () => {
                await deleteDayChart(current.id);
                toast.success("Chart-Bild gelöscht");
                // Nach dem Neuladen rückt das nächste Bild an diese Stelle
                setOpen((i) => (count <= 1 || i == null ? null : Math.min(i, count - 2)));
              }}
            />
            <Button variant="secondary" asChild>
              <Link href={`/plan?date=${current.date}#chart-rueckblick`}>
                Zum Tag <ArrowUpRight className="size-4" />
              </Link>
            </Button>
          </>
        )}
      />
    </>
  );
}
