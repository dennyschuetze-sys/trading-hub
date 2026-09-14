"use client";

import { useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { toDateTimeLocal } from "@/lib/trading";

/**
 * datetime-local-Feld, das eine ISO-Zeit in der Zeitzone des Browsers vorbelegt.
 * Der Wert wird erst im Browser gesetzt, damit die Server-Zeitzone keine Rolle spielt.
 */
export function LocalDateTimeInput({
  iso,
  ...props
}: Omit<React.ComponentProps<"input">, "type" | "defaultValue"> & { iso?: string | null }) {
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (ref.current && iso) ref.current.value = toDateTimeLocal(iso);
  }, [iso]);

  return <Input ref={ref} type="datetime-local" {...props} />;
}
