-- Phase 9: Wochen-/Monatsziele und Reviews

create table public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  period_type text not null check (period_type in ('week', 'month')),
  -- Montag der Woche bzw. Erster des Monats
  period_start date not null,
  title text not null check (char_length(title) between 1 and 200),
  -- automatisch gemessene Kennzahl oder 'manual'
  metric text not null check (metric in (
    'net_pnl', 'trade_count', 'max_trades_day', 'win_rate', 'avg_r', 'rule_violations',
    'checklist_rate', 'journal_rate', 'plan_days', 'review_days', 'discipline_score', 'manual'
  )),
  comparison text not null check (comparison in ('at_least', 'at_most')),
  target numeric(14, 2) not null,
  -- nur für Geld-Ziele Pflicht, sonst optional (leer = alle Accounts)
  account_id uuid references public.accounts (id) on delete cascade,
  manual_value numeric(14, 2),
  notes text check (char_length(notes) <= 2000),
  position smallint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint goals_money_needs_account check (metric <> 'net_pnl' or account_id is not null)
);

create index goals_user_period_idx on public.goals (user_id, period_type, period_start);
create index goals_account_idx on public.goals (account_id);
create trigger goals_set_updated_at before update on public.goals
  for each row execute function public.set_updated_at();
alter table public.goals enable row level security;

create policy "goals_select_own" on public.goals for select to authenticated using ((select auth.uid()) = user_id);
create policy "goals_insert_own" on public.goals for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and (account_id is null or exists (select 1 from public.accounts a where a.id = account_id and a.user_id = (select auth.uid())))
  );
create policy "goals_update_own" on public.goals for update to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and (account_id is null or exists (select 1 from public.accounts a where a.id = account_id and a.user_id = (select auth.uid())))
  );
create policy "goals_delete_own" on public.goals for delete to authenticated using ((select auth.uid()) = user_id);

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  period_type text not null check (period_type in ('week', 'month')),
  period_start date not null,
  rating smallint check (rating between 1 and 5),
  went_well text check (char_length(went_well) <= 10000),
  to_improve text check (char_length(to_improve) <= 10000),
  lessons text check (char_length(lessons) <= 10000),
  next_focus text check (char_length(next_focus) <= 5000),
  -- Kennzahlen zum Zeitpunkt des Speicherns
  stats jsonb not null default '{}' check (jsonb_typeof(stats) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reviews_user_period_unique unique (user_id, period_type, period_start)
);

create trigger reviews_set_updated_at before update on public.reviews
  for each row execute function public.set_updated_at();
alter table public.reviews enable row level security;

create policy "reviews_select_own" on public.reviews for select to authenticated using ((select auth.uid()) = user_id);
create policy "reviews_insert_own" on public.reviews for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "reviews_update_own" on public.reviews for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "reviews_delete_own" on public.reviews for delete to authenticated using ((select auth.uid()) = user_id);
