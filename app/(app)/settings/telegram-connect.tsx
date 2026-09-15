"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, ExternalLink, Loader2, Send, Unplug } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/trading";
import { confirmTelegramLink, createLinkCode, disconnectTelegram, sendTestMessage } from "./actions";

export function TelegramConnect({ linkedAt, configured }: { linkedAt: string | null; configured: boolean }) {
  const [url, setUrl] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [action, setAction] = useState<string | null>(null);

  const run = (name: string, fn: () => Promise<void>) => {
    setAction(name);
    start(async () => {
      try {
        await fn();
      } catch {
        toast.error("Das hat nicht geklappt. Bitte versuche es erneut.");
      } finally {
        setAction(null);
      }
    });
  };
  const spinner = (name: string) => pending && action === name && <Loader2 className="size-4 animate-spin" />;

  if (!configured) {
    return (
      <p className="text-sm text-muted-foreground">
        Der Bot ist auf dem Server noch nicht eingerichtet. Sobald <code className="rounded bg-muted px-1">TELEGRAM_BOT_TOKEN</code> und{" "}
        <code className="rounded bg-muted px-1">SUPABASE_SECRET_KEY</code> hinterlegt sind, kannst du dich hier verbinden.
      </p>
    );
  }

  if (linkedAt) {
    return (
      <div className="grid gap-3">
        <p className="flex items-center gap-2 text-sm">
          <CheckCircle2 className="size-4 text-profit" aria-hidden /> Verbunden seit {formatDateTime(linkedAt)}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={pending}
            onClick={() =>
              run("test", async () => {
                const r = await sendTestMessage();
                if (r.error) toast.error(r.error);
                else toast.success("Test-Nachricht gesendet");
              })
            }
          >
            {spinner("test") || <Send className="size-4" />} Test-Nachricht
          </Button>
          <Button
            variant="ghost"
            disabled={pending}
            onClick={() =>
              run("disconnect", async () => {
                const r = await disconnectTelegram();
                if (r.error) toast.error(r.error);
                else toast.success("Telegram getrennt");
              })
            }
          >
            {spinner("disconnect") || <Unplug className="size-4" />} Trennen
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-4 text-sm">
      <ol className="grid list-decimal gap-2 pl-5 text-muted-foreground">
        <li>Link erzeugen und öffnen – Telegram startet einen Chat mit deinem Bot.</li>
        <li>In Telegram auf „Starten“ tippen.</li>
        <li>Hier auf „Verbindung prüfen“ klicken.</li>
      </ol>
      <div className="flex flex-wrap gap-2">
        {url ? (
          <Button asChild>
            <a href={url} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="size-4" /> In Telegram öffnen
            </a>
          </Button>
        ) : (
          <Button
            disabled={pending}
            onClick={() =>
              run("code", async () => {
                const r = await createLinkCode();
                if (r.error) toast.error(r.error);
                else setUrl(r.url ?? null);
              })
            }
          >
            {spinner("code")} Verbindungslink erzeugen
          </Button>
        )}
        <Button
          variant="outline"
          disabled={pending || !url}
          onClick={() =>
            run("confirm", async () => {
              const r = await confirmTelegramLink();
              if (r.error) toast.error(r.error);
              else toast.success("Telegram verbunden");
            })
          }
        >
          {spinner("confirm")} Verbindung prüfen
        </Button>
      </div>
      {url && <p className="text-xs text-muted-foreground">Der Link ist 30 Minuten gültig.</p>}
    </div>
  );
}
