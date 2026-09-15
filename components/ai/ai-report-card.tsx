import { Sparkles } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime } from "@/lib/trading";
import { GenerateButton } from "./generate-button";

/** Rahmen für KI-Ergebnisse: Titel, Stand, Erstellen-Button und Hinweis, wenn kein API-Schlüssel da ist. */
export function AiReportCard({
  title,
  intro,
  configured,
  updatedAt,
  remaining,
  action,
  buttonLabel,
  children,
}: {
  title: string;
  intro: string;
  configured: boolean;
  updatedAt: string | null;
  remaining: number;
  action: () => Promise<{ error?: string }>;
  buttonLabel: string;
  children?: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="grid gap-1">
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="size-4" aria-hidden /> {title}
            </CardTitle>
            <CardDescription>{updatedAt ? `Erstellt von Claude · ${formatDateTime(updatedAt)}` : intro}</CardDescription>
          </div>
          {configured && children && <GenerateButton action={action} hasReport remaining={remaining} label={buttonLabel} />}
        </div>
      </CardHeader>
      <CardContent>
        {children ? (
          <div className="grid gap-4">
            {children}
            <p className="text-xs text-muted-foreground">KI-generiert – kann Fehler enthalten. Keine Anlageberatung.</p>
          </div>
        ) : configured ? (
          <GenerateButton action={action} hasReport={false} remaining={remaining} label={buttonLabel} />
        ) : (
          <p className="text-sm text-muted-foreground">
            Noch nicht eingerichtet: Hinterlege <code className="rounded bg-muted px-1">ANTHROPIC_API_KEY</code> auf dem Server.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
