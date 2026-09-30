"use client";

import { useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { SelectField } from "@/components/forms/field";
import type { ScopeOption } from "@/lib/scope";

/** Account-Auswahl des Kalenders; der Monat bleibt beim Wechsel erhalten. */
export function ScopeSelect({ scopes, scope }: { scopes: ScopeOption[]; scope: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  const change = (value: string) => {
    const next = new URLSearchParams(params);
    next.set("scope", value);
    startTransition(() => router.replace(`${pathname}?${next}`, { scroll: false }));
  };

  return (
    <div className="flex items-center gap-2">
      <SelectField
        id="scope"
        aria-label="Account"
        options={scopes}
        value={scope}
        onChange={(e) => change(e.target.value)}
        className="w-full sm:w-64"
      />
      {pending && <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Lädt" />}
    </div>
  );
}
