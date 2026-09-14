"use client";

import { useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { SelectField } from "@/components/forms/field";
import { RANGES, type ScopeOption } from "@/lib/scope";
import { cn } from "@/lib/utils";

/** Eine Filterzeile über allen Auswertungen: Zeitraum zuerst, dann Account und Richtung. */
export function FilterBar({
  scopes,
  scope,
  range,
  direction,
}: {
  scopes: ScopeOption[];
  scope: string;
  range: string;
  direction: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  const update = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    startTransition(() => router.replace(`${pathname}?${next}`, { scroll: false }));
  };

  return (
    <div className="mb-6 flex flex-wrap items-center gap-2">
      <div className="flex flex-wrap gap-1 rounded-lg border p-1" role="group" aria-label="Zeitraum">
        {RANGES.map((r) => (
          <button
            key={r.value}
            type="button"
            aria-pressed={range === r.value}
            onClick={() => update("range", r.value === "all" ? "" : r.value)}
            className={cn(
              "rounded-md px-2.5 py-1 text-sm transition-colors",
              range === r.value ? "bg-secondary font-medium text-foreground" : "text-muted-foreground hover:bg-muted/60",
            )}
          >
            {r.label}
          </button>
        ))}
      </div>
      <SelectField
        id="scope"
        aria-label="Account"
        options={scopes}
        value={scope}
        onChange={(e) => update("scope", e.target.value)}
        className="w-full sm:w-64"
      />
      <SelectField
        id="direction"
        aria-label="Richtung"
        options={[
          { value: "long", label: "Nur Long" },
          { value: "short", label: "Nur Short" },
        ]}
        placeholder="Long & Short"
        value={direction}
        onChange={(e) => update("direction", e.target.value)}
        className="w-full sm:w-40"
      />
      {pending && <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Lädt" />}
    </div>
  );
}
