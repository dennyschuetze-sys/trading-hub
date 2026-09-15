import { cn } from "@/lib/utils";

/** Nummerierter Abschnitt des Tagesablaufs (01 Vor der Session … 05 Nach der Session). */
export function PlanSection({
  id,
  number,
  title,
  description,
  tone = "default",
  children,
  className,
}: {
  id: string;
  number: string;
  title: string;
  description?: React.ReactNode;
  /** „review“ hebt den Rückblick farblich leicht von der Vorbereitung ab */
  tone?: "default" | "review";
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className={cn("grid scroll-mt-20 gap-5", className)}>
      <div className="grid grid-cols-[auto_1fr] items-baseline gap-x-4">
        <span
          aria-hidden
          className={cn(
            "row-span-2 text-3xl leading-none font-semibold tracking-tight tabular-nums",
            tone === "review" ? "text-warning/35" : "text-foreground/15",
          )}
        >
          {number}
        </span>
        <h2 id={`${id}-title`} className="text-sm font-semibold tracking-[0.12em] uppercase">
          {title}
        </h2>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {children}
    </section>
  );
}

/** Kleines Feld-Label im Stil der Seite (Großbuchstaben, dezent). */
export function PlanLabel({ children, htmlFor, className }: { children: React.ReactNode; htmlFor?: string; className?: string }) {
  const Tag = htmlFor ? "label" : "p";
  return (
    <Tag htmlFor={htmlFor} className={cn("text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase", className)}>
      {children}
    </Tag>
  );
}

/** Ruhige Karte der Tagesplan-Seite: etwas mehr Innenabstand, dezenter Hover. */
export function PlanCard({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "rounded-xl bg-card p-5 ring-1 ring-foreground/[0.07] transition-shadow hover:ring-foreground/[0.11] sm:p-6",
        className,
      )}
    >
      {children}
    </div>
  );
}
