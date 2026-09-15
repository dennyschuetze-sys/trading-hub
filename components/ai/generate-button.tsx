"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function GenerateButton({
  action,
  hasReport,
  remaining,
  label,
}: {
  action: () => Promise<{ error?: string }>;
  hasReport: boolean;
  remaining: number;
  label: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        variant={hasReport ? "outline" : "default"}
        size={hasReport ? "sm" : "default"}
        disabled={pending || remaining <= 0}
        onClick={() =>
          start(async () => {
            const result = await action();
            if (result.error) toast.error(result.error);
            else {
              toast.success("Fertig");
              router.refresh();
            }
          })
        }
      >
        {pending ? <Loader2 className="size-4 animate-spin" /> : hasReport ? <RefreshCw className="size-4" /> : <Sparkles className="size-4" />}
        {pending ? "Claude denkt nach …" : hasReport ? "Neu erstellen" : label}
      </Button>
      <span className="text-xs text-muted-foreground" aria-live="polite">
        {pending ? "Dauert meist 20–60 Sekunden." : hasReport ? `noch ${remaining}× möglich` : null}
      </span>
    </div>
  );
}
