-- Phase 1: Accounts, Trades, Screenshots

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Accounts (Prop-Firm- und eigene Konten) ------------------------------------
create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  firm text,
  account_type text not null default 'prop' check (account_type in ('prop', 'personal', 'demo')),
  platform text not null default 'mt5' check (platform in ('mt4', 'mt5', 'tradingview', 'ninjatrader', 'tradovate', 'ctrader', 'other')),
  market text not null default 'forex_cfd' check (market in ('forex_cfd', 'futures', 'mixed')),
  phase text not null default 'challenge' check (phase in ('challenge', 'verification', 'funded', 'live', 'demo')),
  status text not null default 'active' check (status in ('active', 'passed', 'failed', 'paused', 'closed')),
  currency text not null default 'USD',
  starting_balance numeric(14, 2) not null check (starting_balance >= 0),
  profit_target numeric(14, 2) check (profit_target >= 0),
  max_daily_loss numeric(14, 2) check (max_daily_loss >= 0),
  max_drawdown numeric(14, 2) check (max_drawdown >= 0),
  drawdown_type text not null default 'static' check (drawdown_type in ('static', 'trailing', 'eod_trailing')),
  min_trading_days integer check (min_trading_days >= 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index accounts_user_id_idx on public.accounts (user_id);

create trigger accounts_set_updated_at
  before update on public.accounts
  for each row execute function public.set_updated_at();

alter table public.accounts enable row level security;

create policy "accounts_select_own" on public.accounts
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "accounts_insert_own" on public.accounts
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "accounts_update_own" on public.accounts
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "accounts_delete_own" on public.accounts
  for delete to authenticated using ((select auth.uid()) = user_id);

-- Trades ---------------------------------------------------------------------
create table public.trades (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  account_id uuid not null references public.accounts (id) on delete cascade,
  symbol text not null,
  direction text not null check (direction in ('long', 'short')),
  status text not null default 'closed' check (status in ('open', 'closed')),
  entry_time timestamptz not null,
  exit_time timestamptz,
  entry_price numeric(18, 6),
  exit_price numeric(18, 6),
  quantity numeric(14, 4) not null check (quantity > 0),
  stop_loss numeric(18, 6),
  take_profit numeric(18, 6),
  -- Brutto-Gewinn; Kommission und Swap vorzeichenbehaftet (Kosten negativ)
  pnl numeric(14, 2),
  commission numeric(14, 2) not null default 0,
  swap numeric(14, 2) not null default 0,
  net_pnl numeric(14, 2) generated always as (coalesce(pnl, 0) + commission + swap) stored,
  -- Geplantes Risiko in Kontowährung, Basis für das R-Multiple
  risk_amount numeric(14, 2) check (risk_amount > 0),
  r_multiple numeric(10, 2) generated always as (
    case when risk_amount > 0 and pnl is not null
      then round((coalesce(pnl, 0) + commission + swap) / risk_amount, 2)
    end
  ) stored,
  session text check (session in ('asia', 'london', 'new_york', 'london_ny_overlap', 'other')),
  setup_quality text check (setup_quality in ('A+', 'A', 'B', 'C')),
  emotion text,
  mistakes text[] not null default '{}',
  tags text[] not null default '{}',
  followed_plan boolean,
  rating smallint check (rating between 1 and 5),
  notes text,
  lessons text,
  source text not null default 'manual' check (source in ('manual', 'mt4', 'mt5', 'tradingview')),
  external_id text,
  is_backtest boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint trades_exit_after_entry check (exit_time is null or exit_time >= entry_time),
  constraint trades_external_unique unique (account_id, source, external_id)
);

create index trades_user_entry_idx on public.trades (user_id, entry_time desc);
create index trades_account_entry_idx on public.trades (account_id, entry_time desc);

create trigger trades_set_updated_at
  before update on public.trades
  for each row execute function public.set_updated_at();

alter table public.trades enable row level security;

create policy "trades_select_own" on public.trades
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "trades_insert_own" on public.trades
  for insert to authenticated with check (
    (select auth.uid()) = user_id
    and exists (select 1 from public.accounts a where a.id = account_id and a.user_id = (select auth.uid()))
  );
create policy "trades_update_own" on public.trades
  for update to authenticated using ((select auth.uid()) = user_id) with check (
    (select auth.uid()) = user_id
    and exists (select 1 from public.accounts a where a.id = account_id and a.user_id = (select auth.uid()))
  );
create policy "trades_delete_own" on public.trades
  for delete to authenticated using ((select auth.uid()) = user_id);

-- Screenshots ----------------------------------------------------------------
create table public.trade_screenshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  trade_id uuid not null references public.trades (id) on delete cascade,
  storage_path text not null,
  caption text,
  created_at timestamptz not null default now()
);

create index trade_screenshots_trade_idx on public.trade_screenshots (trade_id);
create index trade_screenshots_user_idx on public.trade_screenshots (user_id);

alter table public.trade_screenshots enable row level security;

create policy "screenshots_select_own" on public.trade_screenshots
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "screenshots_insert_own" on public.trade_screenshots
  for insert to authenticated with check (
    (select auth.uid()) = user_id
    and exists (select 1 from public.trades t where t.id = trade_id and t.user_id = (select auth.uid()))
  );
create policy "screenshots_update_own" on public.trade_screenshots
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "screenshots_delete_own" on public.trade_screenshots
  for delete to authenticated using ((select auth.uid()) = user_id);

-- Storage-Bucket (privat, Ordner je Benutzer: <user_id>/<trade_id>/<datei>) --
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('screenshots', 'screenshots', false, 10485760, array['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
on conflict (id) do nothing;

create policy "screenshots_storage_select_own" on storage.objects
  for select to authenticated
  using (bucket_id = 'screenshots' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "screenshots_storage_insert_own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'screenshots' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "screenshots_storage_delete_own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'screenshots' and (storage.foldername(name))[1] = (select auth.uid())::text);
