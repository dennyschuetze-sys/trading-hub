-- Phase 5: Tagesplanung (Pre-Market-Plan und Session-Review)

create table public.daily_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  plan_date date not null,

  -- Vor der Session
  focus text check (char_length(focus) <= 500),
  -- [{ symbol, bias: bullish|bearish|neutral, levels, scenario }]
  markets jsonb not null default '[]' check (jsonb_typeof(markets) = 'array'),
  strategy_ids uuid[] not null default '{}',
  max_trades smallint check (max_trades between 0 and 100),
  max_losses smallint check (max_losses between 0 and 100),
  news_notes text check (char_length(news_notes) <= 5000),
  -- [{ label, done }]
  routine jsonb not null default '[]' check (jsonb_typeof(routine) = 'array'),
  mood_before smallint check (mood_before between 1 and 5),
  energy smallint check (energy between 1 and 5),
  premarket_notes text check (char_length(premarket_notes) <= 20000),

  -- Nach der Session
  went_well text check (char_length(went_well) <= 10000),
  to_improve text check (char_length(to_improve) <= 10000),
  lesson text check (char_length(lesson) <= 2000),
  followed_plan boolean,
  discipline smallint check (discipline between 1 and 5),
  mood_after smallint check (mood_after between 1 and 5),
  reviewed_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint daily_plans_user_date_unique unique (user_id, plan_date)
);

create index daily_plans_user_date_idx on public.daily_plans (user_id, plan_date desc);
create trigger daily_plans_set_updated_at before update on public.daily_plans
  for each row execute function public.set_updated_at();
alter table public.daily_plans enable row level security;

create policy "daily_plans_select_own" on public.daily_plans for select to authenticated using ((select auth.uid()) = user_id);
create policy "daily_plans_insert_own" on public.daily_plans for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "daily_plans_update_own" on public.daily_plans for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "daily_plans_delete_own" on public.daily_plans for delete to authenticated using ((select auth.uid()) = user_id);
