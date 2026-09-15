import Link from "next/link";
import { Bell, ChevronRight, Newspaper, ShieldAlert, Wallet } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/page-header";
import { DEFAULT_PREFS } from "@/lib/notifications";
import { createClient } from "@/lib/supabase/server";
import { telegramConfigured } from "@/lib/telegram";
import { NotificationPrefsForm } from "./notification-prefs-form";
import { TelegramConnect } from "./telegram-connect";

const LINKS = [
  { href: "/news", icon: Newspaper, label: "News & Kalender", description: "Währungsfilter, Mindest-Impact und News-Quellen – gelten auch für Telegram." },
  { href: "/risk", icon: ShieldAlert, label: "Risikoregeln", description: "Trades pro Tag, Verlustserie, Tageslimit, News-Sperrzeiten." },
  { href: "/accounts/costs", icon: Wallet, label: "Kosten & Auszahlungen", description: "Challenge-Gebühren, Resets und Payouts je Prop Firm." },
];

export default async function SettingsPage() {
  const supabase = await createClient();
  const { data: settings } = await supabase.from("notification_settings").select("*").maybeSingle();
  const prefs = settings ?? DEFAULT_PREFS;
  const configured = telegramConfigured() && Boolean(process.env.SUPABASE_SECRET_KEY);

  return (
    <>
      <PageHeader title="Einstellungen" description="Benachrichtigungen und Verknüpfungen zu deinen Regeln." />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="grid content-start gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="size-4" aria-hidden /> Telegram
              </CardTitle>
              <CardDescription>Erinnerungen und Warnungen direkt aufs Handy – auch wenn die App geschlossen ist.</CardDescription>
            </CardHeader>
            <CardContent>
              <TelegramConnect linkedAt={settings?.telegram_chat_id ? settings.telegram_linked_at : null} configured={configured} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Benachrichtigungen</CardTitle>
              <CardDescription>Geprüft wird alle 5 Minuten. Jede Nachricht kommt nur einmal.</CardDescription>
            </CardHeader>
            <CardContent>
              <NotificationPrefsForm prefs={prefs} />
            </CardContent>
          </Card>
        </div>

        <Card className="content-start gap-2">
          <CardHeader>
            <CardTitle>Weitere Einstellungen</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-1 px-3">
            {LINKS.map(({ href, icon: Icon, label, description }) => (
              <Link key={href} href={href} className="flex items-center gap-3 rounded-md p-3 transition-colors hover:bg-muted/60">
                <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <span className="grid min-w-0 flex-1 gap-0.5">
                  <span className="font-medium">{label}</span>
                  <span className="text-sm text-muted-foreground">{description}</span>
                </span>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
