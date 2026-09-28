"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { SelectField } from "@/components/forms/field";
import { DASHBOARD_ACCOUNT_COOKIE } from "@/lib/dashboard";

/** Account für Status, Performance und Kalender; wird pro Browser im Cookie gemerkt. Leer = automatisch. */
export function AccountSwitch({
  options,
  value,
  autoLabel,
}: {
  options: { value: string; label: string }[];
  value: string;
  autoLabel: string;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState(value);
  const [pending, startTransition] = useTransition();

  const choose = (id: string) => {
    setSelected(id);
    document.cookie = id
      ? `${DASHBOARD_ACCOUNT_COOKIE}=${id}; path=/; max-age=31536000; samesite=lax`
      : `${DASHBOARD_ACCOUNT_COOKIE}=; path=/; max-age=0; samesite=lax`;
    startTransition(() => router.refresh());
  };

  return (
    <div className="flex w-full items-center gap-2 sm:w-auto">
      {pending && <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" aria-label="Lädt" />}
      <SelectField
        id="dashboard-account"
        aria-label="Account"
        options={options}
        placeholder={autoLabel}
        value={selected}
        onChange={(e) => choose(e.target.value)}
        className="w-full sm:w-64"
      />
    </div>
  );
}
