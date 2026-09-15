# Trading Hub

Persönliches Trading-Dashboard: Journal, Import aus MetaTrader/TradingView, Statistiken, Prop-Firm-Limits,
Strategien & Wissen, Tagesplanung sowie News & Wirtschaftskalender.

**Technik:** Next.js (App Router), TypeScript, Tailwind CSS + shadcn/ui, Supabase (Postgres, Auth, Storage), Recharts, Vitest.

## Lokal starten

```bash
npm install
cp .env.example .env.local   # Werte aus Supabase eintragen
npm run dev
```

Die App läuft dann unter http://localhost:3000.

## Befehle

| Befehl | Zweck |
|---|---|
| `npm run dev` | Entwicklungsserver |
| `npm test` | Automatische Tests (Vitest) |
| `npm run lint` | Code-Prüfung |
| `npm run build` | Produktions-Build |

## Umgebungsvariablen

| Name | Bedeutung |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Projekt-URL aus Supabase |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Publishable Key (für den Browser gedacht, kein Geheimnis) |
| `ALLOW_SIGNUP` | `true` erlaubt die Registrierung in der App – standardmäßig aus |

## Datenbank

Das Schema liegt als Migrationen in `supabase/migrations/`. Alle Tabellen nutzen Row Level Security:
Jeder Benutzer sieht ausschließlich seine eigenen Daten.

## Veröffentlichung

Hosting auf Vercel (Hobby-Tarif), verbunden mit dem GitHub-Repository: Jeder Push auf `main` wird automatisch veröffentlicht.
In Supabase müssen unter **Authentication → URL Configuration** die Vercel-Adresse als Site URL und
`https://<adresse>/auth/callback` als Redirect URL eingetragen sein.

## Telegram-Benachrichtigungen

Supabase Cron ruft alle 5 Minuten `/api/cron/notify` auf. Die Route prüft News-Termine, fehlende Tagespläne und
Reviews sowie die Prop-Firm-Limits und schickt fällige Nachrichten über den Telegram-Bot. Ein Versandprotokoll
(`notification_log`) verhindert doppelte Nachrichten.

Einrichtung:

1. In Telegram mit **@BotFather** einen Bot anlegen (`/newbot`) und den Token kopieren.
2. In Vercel (und lokal in `.env.local`) `TELEGRAM_BOT_TOKEN`, `SUPABASE_SECRET_KEY` und `CRON_SECRET` eintragen, danach neu deployen.
3. `supabase/cron-notify.sql` mit der Vercel-Adresse und dem `CRON_SECRET` im Supabase SQL Editor ausführen.
4. In der App unter **Einstellungen** Telegram verbinden und eine Test-Nachricht senden.

Testlauf ohne Versand: `GET /api/cron/notify?dry=1` mit Header `Authorization: Bearer <CRON_SECRET>`.

## KI-Funktionen

Auf Knopfdruck, mit Claude Opus 5 (`lib/ai/`), Ergebnisse werden in `ai_reports` gespeichert:

- **KI-Briefing** (News & Kalender): Zusammenfassung der Meldungen der letzten 24 Stunden und der Termine für die eigenen Währungen.
- **KI-Wochen-/Monatsanalyse** (Ziele & Reviews): wiederkehrende Fehler, beste Setups, Regelverstöße und Fokus aus Trades, Notizen und Tages-Reviews.

Benötigt `ANTHROPIC_API_KEY` in Vercel. Pro Tag bzw. Zeitraum höchstens 5 Neuerstellungen. Trade-Notizen und Reviews
werden dafür an die Claude API übermittelt.
