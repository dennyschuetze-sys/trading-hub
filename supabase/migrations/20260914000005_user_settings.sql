-- Phase 6: Persönliche Einstellungen (zunächst News & Kalender, später erweitert)

create table public.user_settings (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  calendar_currencies text[] not null default '{USD,EUR}',
  calendar_min_impact text not null default 'medium' check (calendar_min_impact in ('low', 'medium', 'high')),
  news_sources text[] not null default '{fxstreet,investinglive,investing_fx,investing_commodities}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_settings_currencies_limit check (cardinality(calendar_currencies) <= 20),
  constraint user_settings_sources_limit check (cardinality(news_sources) <= 20)
);

create trigger user_settings_set_updated_at before update on public.user_settings
  for each row execute function public.set_updated_at();
alter table public.user_settings enable row level security;

create policy "user_settings_select_own" on public.user_settings for select to authenticated using ((select auth.uid()) = user_id);
create policy "user_settings_insert_own" on public.user_settings for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "user_settings_update_own" on public.user_settings for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
