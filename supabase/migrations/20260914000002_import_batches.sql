-- Phase 2: Protokoll der Importe, damit ein Import rückgängig gemacht werden kann

create table public.import_batches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  account_id uuid not null references public.accounts (id) on delete cascade,
  source text not null check (source in ('mt4', 'mt5', 'tradingview')),
  file_name text not null,
  total_count integer not null default 0 check (total_count >= 0),
  imported_count integer not null default 0 check (imported_count >= 0),
  skipped_count integer not null default 0 check (skipped_count >= 0),
  created_at timestamptz not null default now()
);

create index import_batches_user_idx on public.import_batches (user_id, created_at desc);
create index import_batches_account_idx on public.import_batches (account_id);

alter table public.import_batches enable row level security;

create policy "import_batches_select_own" on public.import_batches
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "import_batches_insert_own" on public.import_batches
  for insert to authenticated with check (
    (select auth.uid()) = user_id
    and exists (select 1 from public.accounts a where a.id = account_id and a.user_id = (select auth.uid()))
  );
create policy "import_batches_update_own" on public.import_batches
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "import_batches_delete_own" on public.import_batches
  for delete to authenticated using ((select auth.uid()) = user_id);

alter table public.trades
  add column import_batch_id uuid references public.import_batches (id) on delete set null;

create index trades_import_batch_idx on public.trades (import_batch_id);
