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
