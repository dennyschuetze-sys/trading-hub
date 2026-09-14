import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function StatTile({
  label,
  value,
  hint,
  tone,
  className,
}: {
  label: string;
  value: string;
  hint?: string;
  /** Richtung: färbt nur einen kleinen Marker, der Wert selbst bleibt in Textfarbe */
  tone?: "profit" | "loss" | null;
  className?: string;
}) {
  return (
    <Card className={cn("gap-0 py-4", className)}>
      <CardContent className="grid gap-1 px-4">
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          {tone && (
            <span
              aria-hidden
              className={cn("inline-block size-2 rounded-full", tone === "profit" ? "bg-profit" : "bg-loss")}
            />
          )}
          {label}
        </p>
        <p className="text-2xl font-semibold tracking-tight">{value}</p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}
