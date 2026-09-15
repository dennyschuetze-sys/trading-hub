-- Phase 12: gespeicherte KI-Auswertungen (Tages-Briefing, Wochen-/Monatsanalyse)
-- Pro Benutzer, Art und Zeitraum genau ein Ergebnis; neu erstellen überschreibt es.

create table public.ai_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('news_daily', 'journal_week', 'journal_month')),
  -- Datum (Briefing) bzw. Beginn der Woche/des Monats (Analyse)
  period_key date not null,
  content jsonb not null check (jsonb_typeof(content) = 'object'),
  model text not null,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  -- wie oft für diesen Zeitraum erstellt wurde (Kostenbremse)
  generations smallint not null default 1 check (generations between 1 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_reports_unique unique (user_id, kind, period_key)
);

create trigger ai_reports_set_updated_at before update on public.ai_reports
  for each row execute function public.set_updated_at();
alter table public.ai_reports enable row level security;

create policy "ai_reports_select_own" on public.ai_reports for select to authenticated using ((select auth.uid()) = user_id);
create policy "ai_reports_insert_own" on public.ai_reports for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "ai_reports_update_own" on public.ai_reports for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "ai_reports_delete_own" on public.ai_reports for delete to authenticated using ((select auth.uid()) = user_id);
