-- Phase 11: Prop-Firm-Kosten, Auszahlungen und Telegram-Benachrichtigungen

-- Kosten (Challenges, Resets, Abos …) -------------------------------------------------
create table public.account_costs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- optional: Kosten bleiben erhalten, wenn der Account gelöscht wird
  account_id uuid references public.accounts (id) on delete set null,
  firm text not null check (char_length(firm) between 1 and 100),
  kind text not null check (kind in ('challenge', 'reset', 'activation', 'subscription', 'data', 'other')),
  amount numeric(14, 2) not null check (amount > 0),
  currency text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  incurred_on date not null default current_date,
  note text check (char_length(note) <= 500),
  created_at timestamptz not null default now()
);

create index account_costs_user_idx on public.account_costs (user_id, incurred_on desc);
create index account_costs_account_idx on public.account_costs (account_id);
alter table public.account_costs enable row level security;

create policy "account_costs_select_own" on public.account_costs for select to authenticated using ((select auth.uid()) = user_id);
create policy "account_costs_insert_own" on public.account_costs for insert to authenticated with check (
  (select auth.uid()) = user_id
  and (account_id is null or exists (select 1 from public.accounts a where a.id = account_id and a.user_id = (select auth.uid())))
);
create policy "account_costs_update_own" on public.account_costs for update to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and (account_id is null or exists (select 1 from public.accounts a where a.id = account_id and a.user_id = (select auth.uid())))
  );
create policy "account_costs_delete_own" on public.account_costs for delete to authenticated using ((select auth.uid()) = user_id);

-- Auszahlungen ----------------------------------------------------------------------------
create table public.payouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  account_id uuid references public.accounts (id) on delete set null,
  firm text not null check (char_length(firm) between 1 and 100),
  amount numeric(14, 2) not null check (amount > 0),
  currency text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  paid_on date not null default current_date,
  note text check (char_length(note) <= 500),
  created_at timestamptz not null default now()
);

create index payouts_user_idx on public.payouts (user_id, paid_on desc);
create index payouts_account_idx on public.payouts (account_id);
alter table public.payouts enable row level security;

create policy "payouts_select_own" on public.payouts for select to authenticated using ((select auth.uid()) = user_id);
create policy "payouts_insert_own" on public.payouts for insert to authenticated with check (
  (select auth.uid()) = user_id
  and (account_id is null or exists (select 1 from public.accounts a where a.id = account_id and a.user_id = (select auth.uid())))
);
create policy "payouts_update_own" on public.payouts for update to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and (account_id is null or exists (select 1 from public.accounts a where a.id = account_id and a.user_id = (select auth.uid())))
  );
create policy "payouts_delete_own" on public.payouts for delete to authenticated using ((select auth.uid()) = user_id);

-- Benachrichtigungen ------------------------------------------------------------------------
create table public.notification_settings (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  -- Telegram-Verknüpfung: nur der Server (Secret Key) schreibt chat_id, damit niemand fremde Chats einträgt
  telegram_chat_id bigint,
  telegram_linked_at timestamptz,
  link_code text check (link_code ~ '^[A-Za-z0-9]{12,64}$'),
  link_code_expires_at timestamptz,
  news_enabled boolean not null default true,
  news_minutes smallint not null default 15 check (news_minutes between 1 and 240),
  plan_enabled boolean not null default true,
  plan_time time not null default '08:30',
  journal_enabled boolean not null default true,
  journal_time time not null default '22:00',
  weekdays_only boolean not null default true,
  drawdown_enabled boolean not null default true,
  drawdown_threshold smallint not null default 80 check (drawdown_threshold between 50 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger notification_settings_set_updated_at before update on public.notification_settings
  for each row execute function public.set_updated_at();
alter table public.notification_settings enable row level security;

create policy "notification_settings_select_own" on public.notification_settings for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "notification_settings_insert_own" on public.notification_settings for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "notification_settings_update_own" on public.notification_settings for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Eingeloggte Benutzer dürfen nur Einstellungen und den Verbindungscode schreiben, nicht die Chat-ID
revoke insert, update on public.notification_settings from anon, authenticated;
grant insert (user_id, link_code, link_code_expires_at, news_enabled, news_minutes, plan_enabled, plan_time,
  journal_enabled, journal_time, weekdays_only, drawdown_enabled, drawdown_threshold)
  on public.notification_settings to authenticated;
grant update (link_code, link_code_expires_at, news_enabled, news_minutes, plan_enabled, plan_time,
  journal_enabled, journal_time, weekdays_only, drawdown_enabled, drawdown_threshold)
  on public.notification_settings to authenticated;

-- Versandprotokoll gegen doppelte Nachrichten (schreibt nur der Server)
create table public.notification_log (
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('news', 'plan', 'journal', 'drawdown', 'test')),
  ref text not null check (char_length(ref) <= 200),
  sent_at timestamptz not null default now(),
  primary key (user_id, kind, ref)
);

create index notification_log_sent_idx on public.notification_log (sent_at);
alter table public.notification_log enable row level security;

create policy "notification_log_select_own" on public.notification_log for select to authenticated
  using ((select auth.uid()) = user_id);

-- Zeitplan: pg_cron ruft alle 5 Minuten /api/cron/notify auf (Einrichtung siehe supabase/cron-notify.sql)
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
