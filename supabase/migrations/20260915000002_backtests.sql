-- Phase 10: Backtest-Sessions. Backtest-Trades liegen in public.trades (gleiche Maske, Screenshots,
-- Checkliste), gehören aber zu einer Session statt zu einem Account.

create table public.backtest_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  strategy_id uuid references public.strategies (id) on delete set null,
  name text not null check (char_length(name) between 1 and 100),
  symbols text[] not null default '{}',
  timeframe text check (char_length(timeframe) <= 20),
  -- getesteter Marktzeitraum
  period_from date,
  period_to date,
  market text not null default 'forex_cfd' check (market in ('forex_cfd', 'futures', 'mixed')),
  currency text not null default 'USD',
  starting_balance numeric(14, 2) check (starting_balance >= 0),
  status text not null default 'running' check (status in ('running', 'done')),
  notes text check (char_length(notes) <= 20000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint backtest_sessions_period check (period_to is null or period_from is null or period_to >= period_from)
);

create index backtest_sessions_user_idx on public.backtest_sessions (user_id, created_at desc);
create index backtest_sessions_strategy_idx on public.backtest_sessions (strategy_id);
create trigger backtest_sessions_set_updated_at before update on public.backtest_sessions
  for each row execute function public.set_updated_at();
alter table public.backtest_sessions enable row level security;

create policy "backtest_sessions_select_own" on public.backtest_sessions for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "backtest_sessions_insert_own" on public.backtest_sessions for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and (strategy_id is null or exists (select 1 from public.strategies s where s.id = strategy_id and s.user_id = (select auth.uid())))
  );
create policy "backtest_sessions_update_own" on public.backtest_sessions for update to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and (strategy_id is null or exists (select 1 from public.strategies s where s.id = strategy_id and s.user_id = (select auth.uid())))
  );
create policy "backtest_sessions_delete_own" on public.backtest_sessions for delete to authenticated
  using ((select auth.uid()) = user_id);

-- Trades: entweder Live (Account) oder Backtest (Session) ------------------------------
alter table public.trades
  add column backtest_session_id uuid references public.backtest_sessions (id) on delete cascade,
  alter column account_id drop not null,
  add constraint trades_live_or_backtest check (
    (not is_backtest and account_id is not null and backtest_session_id is null)
    or (is_backtest and account_id is null and backtest_session_id is not null)
  );

create index trades_backtest_session_idx on public.trades (backtest_session_id, entry_time desc)
  where backtest_session_id is not null;

drop policy "trades_insert_own" on public.trades;
drop policy "trades_update_own" on public.trades;
create policy "trades_insert_own" on public.trades for insert to authenticated with check (
  (select auth.uid()) = user_id
  and (account_id is null or exists (select 1 from public.accounts a where a.id = account_id and a.user_id = (select auth.uid())))
  and (backtest_session_id is null or exists (select 1 from public.backtest_sessions b where b.id = backtest_session_id and b.user_id = (select auth.uid())))
  and (strategy_id is null or exists (select 1 from public.strategies s where s.id = strategy_id and s.user_id = (select auth.uid())))
);
create policy "trades_update_own" on public.trades for update to authenticated
  using ((select auth.uid()) = user_id) with check (
    (select auth.uid()) = user_id
    and (account_id is null or exists (select 1 from public.accounts a where a.id = account_id and a.user_id = (select auth.uid())))
    and (backtest_session_id is null or exists (select 1 from public.backtest_sessions b where b.id = backtest_session_id and b.user_id = (select auth.uid())))
    and (strategy_id is null or exists (select 1 from public.strategies s where s.id = strategy_id and s.user_id = (select auth.uid())))
  );
