import { Badge } from "@/components/ui/badge";
import type { NewsBriefing } from "@/lib/ai/schemas";
import { cn } from "@/lib/utils";

const IMPACT = {
  high: { label: "Hoch", className: "border-loss/50 text-loss" },
  medium: { label: "Mittel", className: "border-warning/50 text-warning" },
  low: { label: "Gering", className: "" },
} as const;

export function NewsBriefingView({ briefing }: { briefing: NewsBriefing }) {
  return (
    <div className="grid gap-5 text-sm">
      <p className="text-base leading-relaxed">{briefing.overview}</p>

      {briefing.themes.length > 0 && (
        <ul className="grid gap-3 md:grid-cols-2">
          {briefing.themes.map((t, i) => (
            <li key={i} className="grid content-start gap-1.5 rounded-lg border p-3">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="font-medium">{t.title}</span>
                <Badge variant="outline" className={cn("font-normal", IMPACT[t.impact].className)}>
                  {IMPACT[t.impact].label}
                </Badge>
                {t.currencies.slice(0, 4).map((c) => (
                  <Badge key={c} variant="secondary" className="font-normal">
                    {c}
                  </Badge>
                ))}
              </div>
              <p className="text-muted-foreground">{t.detail}</p>
            </li>
          ))}
        </ul>
      )}

      {briefing.watchlist.length > 0 && (
        <div className="grid gap-2">
          <p className="font-medium">Heute im Blick</p>
          <ul className="grid gap-1.5">
            {briefing.watchlist.map((w, i) => (
              <li key={i} className="grid grid-cols-[3.5rem_1fr] gap-2">
                <span className="tabular-nums text-muted-foreground">{w.time}</span>
                <span>
                  <span className="font-medium">{w.event}</span> – {w.why}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {briefing.risk_note && (
        <p className="rounded-md border-l-2 border-warning bg-warning/5 px-3 py-2">
          <span className="font-medium">Risiko heute: </span>
          {briefing.risk_note}
        </p>
      )}
    </div>
  );
}
