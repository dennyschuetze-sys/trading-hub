import { CheckCircle2, Crosshair, ShieldAlert, Target, TriangleAlert } from "lucide-react";
import type { JournalAnalysis } from "@/lib/ai/schemas";

function Section({ icon: Icon, title, children }: { icon: typeof Target; title: string; children: React.ReactNode }) {
  return (
    <section className="grid content-start gap-2">
      <h3 className="flex items-center gap-2 font-medium">
        <Icon className="size-4 text-muted-foreground" aria-hidden /> {title}
      </h3>
      {children}
    </section>
  );
}

export function JournalAnalysisView({ analysis }: { analysis: JournalAnalysis }) {
  return (
    <div className="grid gap-6 text-sm">
      <p className="text-base leading-relaxed">{analysis.summary}</p>
      {analysis.low_data && (
        <p className="text-muted-foreground">Wenige Daten in diesem Zeitraum – die Aussagen sind nur eingeschränkt belastbar.</p>
      )}

      {analysis.focus.length > 0 && (
        <div className="rounded-lg border bg-muted/40 p-4">
          <Section icon={Target} title="Fokus für den nächsten Zeitraum">
            <ol className="grid list-decimal gap-1 pl-5">
              {analysis.focus.map((f, i) => (
                <li key={i}>{f}</li>
              ))}
            </ol>
          </Section>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {analysis.mistakes.length > 0 && (
          <Section icon={TriangleAlert} title="Wiederkehrende Fehler">
            <ul className="grid gap-3">
              {analysis.mistakes.map((m, i) => (
                <li key={i} className="grid gap-0.5 border-l-2 border-loss/60 pl-3">
                  <span className="font-medium">{m.pattern}</span>
                  <span className="text-muted-foreground">{m.evidence}</span>
                  <span>→ {m.suggestion}</span>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {analysis.best_setups.length > 0 && (
          <Section icon={Crosshair} title="Beste Setups">
            <ul className="grid gap-3">
              {analysis.best_setups.map((s, i) => (
                <li key={i} className="grid gap-0.5 border-l-2 border-profit/60 pl-3">
                  <span className="font-medium">{s.setup}</span>
                  <span className="text-muted-foreground">{s.evidence}</span>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {analysis.rule_violations.length > 0 && (
          <Section icon={ShieldAlert} title="Regelverstöße">
            <ul className="grid gap-2">
              {analysis.rule_violations.map((v, i) => (
                <li key={i}>
                  <span className="font-medium">{v.rule}:</span> <span className="text-muted-foreground">{v.observation}</span>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {analysis.strengths.length > 0 && (
          <Section icon={CheckCircle2} title="Das lief gut">
            <ul className="grid list-disc gap-1 pl-5">
              {analysis.strengths.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          </Section>
        )}
      </div>
    </div>
  );
}
