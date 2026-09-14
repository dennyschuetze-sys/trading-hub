-- Phase 8: Persönliche Risikoregeln und gespeicherte High-Impact-Termine

alter table public.user_settings
  add column max_trades_per_day smallint check (max_trades_per_day between 1 and 100),
  add column max_consecutive_losses smallint check (max_consecutive_losses between 1 and 50),
  add column daily_loss_limit_pct numeric(5, 2) check (daily_loss_limit_pct > 0 and daily_loss_limit_pct <= 100),
  add column max_risk_per_trade_pct numeric(5, 2) check (max_risk_per_trade_pct > 0 and max_risk_per_trade_pct <= 100),
  add column default_risk_pct numeric(5, 2) check (default_risk_pct > 0 and default_risk_pct <= 100),
  add column news_block_before_min smallint check (news_block_before_min between 0 and 240),
  add column news_block_after_min smallint check (news_block_after_min between 0 and 240);

-- Der ForexFactory-Feed enthält nur die laufende Woche. Damit Trades auch später noch
-- gegen News-Sperrzeiten geprüft werden können, werden High-Impact-Termine gespeichert.
create table public.calendar_history (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  event_key text not null check (char_length(event_key) <= 40),
  title text not null check (char_length(title) <= 200),
  currency text not null check (char_length(currency) <= 5),
  event_time timestamptz not null,
  impact text not null default 'high' check (impact in ('high', 'medium', 'low')),
  created_at timestamptz not null default now(),
  primary key (user_id, event_key)
);

create index calendar_history_user_time_idx on public.calendar_history (user_id, event_time);
alter table public.calendar_history enable row level security;

create policy "calendar_history_select_own" on public.calendar_history for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "calendar_history_insert_own" on public.calendar_history for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "calendar_history_delete_own" on public.calendar_history for delete to authenticated
  using ((select auth.uid()) = user_id);
