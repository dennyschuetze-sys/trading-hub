"use client";

import { useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { MARKET_RANGES, MARKET_UNITS, unitAllowed, type MarketRange, type MarketUnit } from "@/lib/market";
import { cn } from "@/lib/utils";

const segment = (on: boolean, disabled = false) =>
  cn(
    "rounded-md px-2.5 py-1 text-sm transition-colors",
    on
      ? "bg-secondary font-medium text-foreground shadow-[inset_0_0_0_1px_var(--border)]"
      : "text-muted-foreground hover:text-foreground",
    disabled && "cursor-not-allowed opacity-40 hover:text-muted-foreground",
  );

/** Einheit (worin gezählt wird) und Zeitraum (wie weit zurück). Grobe Einheiten erst ab passendem Zeitraum. */
export function MarketFilters({ unit, range }: { unit: MarketUnit; range: MarketRange }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  const update = (key: "einheit" | "zeitraum", value: string) => {
    const next = new URLSearchParams(params);
    next.set(key, value);
    startTransition(() => router.replace(`${pathname}?${next}`, { scroll: false }));
  };

  return (
    <div className="mb-8 flex flex-wrap items-center gap-2">
      <div className="flex flex-wrap gap-0.5 rounded-lg border bg-card p-0.5" role="group" aria-label="Einheit">
        {MARKET_UNITS.map((u) => {
          const allowed = unitAllowed(u.value, range);
          return (
            <button
              key={u.value}
              type="button"
              aria-pressed={unit === u.value}
              aria-disabled={!allowed}
              title={allowed ? undefined : "Erst bei einem längeren Zeitraum"}
              onClick={() => allowed && update("einheit", u.value)}
              className={segment(unit === u.value, !allowed)}
            >
              {u.label}
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-0.5 rounded-lg border bg-card p-0.5" role="group" aria-label="Zeitraum">
        {MARKET_RANGES.map((r) => (
          <button
            key={r.value}
            type="button"
            aria-pressed={range === r.value}
            title={r.long}
            onClick={() => update("zeitraum", r.value)}
            className={segment(range === r.value)}
          >
            {r.label}
          </button>
        ))}
      </div>
      {pending && <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Lädt" />}
    </div>
  );
}
