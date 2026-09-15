"use client";

import { useTransition } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { deleteCostEntry } from "./actions";

/** Einzelne Buchung löschen – ohne Rückfrage, weil sie sich schnell neu erfassen lässt. */
export function EntryDelete({ type, id, label }: { type: "cost" | "payout"; id: string; label: string }) {
  const [pending, start] = useTransition();
  return (
    <Button
      variant="ghost"
      size="icon"
      disabled={pending}
      aria-label={`${label} löschen`}
      onClick={() =>
        start(async () => {
          try {
            await deleteCostEntry(type, id);
            toast.success("Eintrag gelöscht");
          } catch {
            toast.error("Löschen fehlgeschlagen");
          }
        })
      }
    >
      {pending ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
    </Button>
  );
}
