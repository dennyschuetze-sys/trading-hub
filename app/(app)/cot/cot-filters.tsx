"use client";

import { useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { SelectField } from "@/components/forms/field";
import { COT_GROUPS } from "@/lib/cot";
import { cn } from "@/lib/utils";

/** Filterzeile der COT-Seite: Gruppe zuerst, dann Rückblick und die eigenen Märkte. */
export function CotFilters({ group, lookback, ownOnly }: { group: string; lookback: string; ownOnly: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  const update = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    // Beim Filtern kann der gewählte Markt aus der Liste fallen – dann wieder den ersten zeigen
    if (key !== "markt") next.delete("markt");
    startTransition(() => router.replace(`${pathname}?${next}`, { scroll: false }));
  };

  return (
    <div className="mb-8 flex flex-wrap items-center gap-2">
      <div className="flex flex-wrap gap-0.5 rounded-lg border bg-card p-0.5" role="group" aria-label="Gruppe">
        {[{ value: "", label: "Alle" }, ...COT_GROUPS.map((g) => ({ value: g, label: g }))].map((g) => (
          <button
            key={g.value || "alle"}
            type="button"
            aria-pressed={group === g.value}
            onClick={() => update("gruppe", g.value)}
            className={cn(
              "rounded-md px-2.5 py-1 text-sm transition-colors",
              group === g.value
                ? "bg-secondary font-medium text-foreground shadow-[inset_0_0_0_1px_var(--border)]"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {g.label}
          </button>
        ))}
      </div>
      <SelectField
        id="index"
        aria-label="Rückblick für den COT-Index"
        options={[
          { value: "1", label: "Index: 1 Jahr" },
          { value: "3", label: "Index: 3 Jahre" },
        ]}
        value={lookback}
        onChange={(e) => update("index", e.target.value)}
        className="w-full sm:w-44"
      />
      <button
        type="button"
        aria-pressed={ownOnly}
        onClick={() => update("eigene", ownOnly ? "" : "1")}
        className={cn(
          "rounded-lg border px-2.5 py-1.5 text-sm transition-colors",
          ownOnly ? "bg-secondary font-medium text-foreground" : "bg-card text-muted-foreground hover:text-foreground",
        )}
      >
        Nur meine Symbole
      </button>
      {pending && <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Lädt" />}
    </div>
  );
}
