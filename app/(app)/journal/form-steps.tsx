"use client";

import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export type FormStep = { label: string; sections: string[]; done: boolean };

/** Dezente Orientierung: markiert den Bereich, in dem man gerade ist. Kein Wizard – Klick scrollt nur dorthin. */
export function FormSteps({ steps, percent }: { steps: FormStep[]; percent: number }) {
  const [active, setActive] = useState(0);

  useEffect(() => {
    const ids = steps.flatMap((s) => s.sections);
    const visible = new Map<string, boolean>();
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => visible.set(e.target.id, e.isIntersecting));
        const first = ids.find((id) => visible.get(id));
        if (first) setActive(steps.findIndex((s) => s.sections.includes(first)));
      },
      // Bereich im oberen Drittel des Bildschirms gilt als „aktuell“
      { rootMargin: "-25% 0px -65% 0px" },
    );
    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
    // Abschnitte ändern sich nicht – nur einmal beobachten
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <nav
      aria-label="Bereiche des Formulars"
      className="sticky top-14 z-20 -mx-1 flex items-center gap-1 overflow-x-auto rounded-xl [scrollbar-width:none] border bg-background/85 p-1.5 backdrop-blur"
    >
      {steps.map((step, i) => (
        <div key={step.label} className="flex shrink-0 items-center gap-1">
          {i > 0 && <span className="hidden h-px w-4 bg-border sm:block" aria-hidden />}
          <button
            type="button"
            aria-current={active === i ? "step" : undefined}
            onClick={() => document.getElementById(step.sections[0])?.scrollIntoView({ behavior: "smooth", block: "start" })}
            className={cn(
              "flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[0.6875rem] font-medium tracking-[0.08em] uppercase transition-colors",
              active === i ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <span
              className={cn(
                "grid size-5 place-items-center rounded-full text-[0.6875rem] tracking-normal",
                step.done ? "bg-profit/15 text-profit" : active === i ? "bg-profit text-background" : "ring-1 ring-input",
              )}
            >
              {step.done ? <Check className="size-3" aria-label="vollständig" /> : i + 1}
            </span>
            {step.label}
          </button>
        </div>
      ))}
      <div className="ml-auto hidden shrink-0 items-center gap-2 pr-2 text-xs text-muted-foreground md:flex">
        <span
          className="grid size-5 place-items-center rounded-full"
          style={{ background: `conic-gradient(var(--profit) ${percent}%, var(--secondary) 0)` }}
          aria-hidden
        >
          <span className="size-3 rounded-full bg-background" />
        </span>
        <span>
          <span className="font-semibold text-foreground tabular-nums">{percent} %</span> dokumentiert
        </span>
      </div>
    </nav>
  );
}
