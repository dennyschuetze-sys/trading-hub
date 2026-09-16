import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function StatTile({
  label,
  value,
  hint,
  tone,
  size = "default",
  className,
  children,
}: {
  label: string;
  value: string;
  hint?: string;
  /** Richtung: färbt den Wert in Türkis (Gewinn) bzw. gedämpftem Rot (Verlust) */
  tone?: "profit" | "loss" | null;
  /** „hero“ für die eine Kennzahl, die am stärksten hervorgehoben werden soll */
  size?: "default" | "hero";
  className?: string;
  /** Zusätzliche Inhalte unter dem Wert, z. B. Balken oder Pills */
  children?: React.ReactNode;
}) {
  const hero = size === "hero";
  return (
    <Card
      className={cn("gap-0 py-5", hero && (tone === "loss" ? "ring-loss/25" : "ring-profit/25"), className)}
      style={
        hero
          ? {
              backgroundImage: `linear-gradient(160deg, color-mix(in oklch, var(${tone === "loss" ? "--loss" : "--profit"}) 11%, transparent), transparent 60%)`,
            }
          : undefined
      }
    >
      <CardContent className="grid content-start gap-1 px-5">
        <p className="text-[0.6875rem] font-medium uppercase tracking-[0.08em] text-muted-foreground">{label}</p>
        <p
          className={cn(
            "font-semibold tracking-tight tabular-nums",
            hero ? "mt-2 text-4xl leading-none sm:text-5xl" : "mt-1.5 text-2xl",
            tone === "profit" && "text-profit",
            tone === "loss" && "text-loss",
          )}
        >
          {value}
        </p>
        {children}
        {hint && <p className={cn("text-xs text-muted-foreground/80", hero && "mt-2")}>{hint}</p>}
      </CardContent>
    </Card>
  );
}

/** Kompakte Leiste mehrerer Nebenkennzahlen in einer Karte, getrennt durch feine Linien. */
export function StatStrip({
  items,
  columns = 6,
  title,
  description,
  className,
}: {
  items: { label: string; value: string; hint?: string; muted?: boolean; tone?: "profit" | "loss" | null }[];
  /** 6 = eine Leiste am Desktop, 3 = Raster aus Zeilen mit je drei Werten */
  columns?: 3 | 6;
  title?: string;
  description?: string;
  className?: string;
}) {
  return (
    <Card className={cn("gap-0 py-0", className)}>
      {title && (
        <div className="px-5 pt-5 pb-4">
          <p className="text-sm font-semibold">{title}</p>
          {description && <p className="text-xs text-muted-foreground">{description}</p>}
        </div>
      )}
      {/* 1px-Abstand auf Randfarbe = feine Trennlinien bei jeder Spaltenzahl */}
      <div className={cn("grid flex-1 grid-cols-2 gap-px bg-border sm:grid-cols-3", columns === 6 && "xl:grid-cols-6", title && "border-t")}>
        {items.map((item) => (
          <div key={item.label} className={cn("bg-card px-5", columns === 3 ? "py-5" : "py-4")}>
            <p className="text-[0.6875rem] font-medium uppercase tracking-[0.08em] text-muted-foreground">{item.label}</p>
            <p
              className={cn(
                "mt-1.5 font-semibold tabular-nums",
                columns === 3 ? "text-2xl" : "text-lg",
                item.muted && "text-base font-medium text-muted-foreground/60",
                item.tone === "profit" && "text-profit",
                item.tone === "loss" && "text-loss",
              )}
            >
              {item.value}
            </p>
            {item.hint && <p className="text-xs text-muted-foreground/80">{item.hint}</p>}
          </div>
        ))}
      </div>
    </Card>
  );
}

/** Überschrift eines Seitenbereichs mit feiner Linie. */
export function StatSection({
  title,
  question,
  hint,
  children,
  className,
}: {
  title: string;
  /** Leitfrage des Bereichs, dezent neben der Überschrift */
  question?: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  const id = `section-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  return (
    <section aria-labelledby={id} className={cn("grid gap-4", className)}>
      <div className="flex items-center gap-3">
        <h2 id={id} className="text-xs font-semibold uppercase tracking-[0.12em]">
          {title}
        </h2>
        {question && <p className="hidden text-xs text-muted-foreground italic md:block">{question}</p>}
        <div className="h-px flex-1 bg-border" aria-hidden />
        {hint && <span className="hidden text-xs text-muted-foreground sm:inline">{hint}</span>}
      </div>
      {children}
    </section>
  );
}
