-- Phase 4: Strategien, Checklisten, Wissensartikel

-- Strategien ----------------------------------------------------------------------
create table public.strategies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  summary text,
  status text not null default 'active' check (status in ('active', 'testing', 'archived')),
  markets text[] not null default '{}',
  timeframes text[] not null default '{}',
  entry_rules text,
  exit_rules text,
  risk_rules text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index strategies_user_idx on public.strategies (user_id);
create trigger strategies_set_updated_at before update on public.strategies
  for each row execute function public.set_updated_at();
alter table public.strategies enable row level security;

create policy "strategies_select_own" on public.strategies for select to authenticated using ((select auth.uid()) = user_id);
create policy "strategies_insert_own" on public.strategies for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "strategies_update_own" on public.strategies for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "strategies_delete_own" on public.strategies for delete to authenticated using ((select auth.uid()) = user_id);

-- Checklistenpunkte je Strategie ---------------------------------------------------
create table public.strategy_checklist_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  strategy_id uuid not null references public.strategies (id) on delete cascade,
  label text not null check (char_length(label) between 1 and 200),
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create index checklist_items_strategy_idx on public.strategy_checklist_items (strategy_id, position);
create index checklist_items_user_idx on public.strategy_checklist_items (user_id);
alter table public.strategy_checklist_items enable row level security;

create policy "checklist_items_select_own" on public.strategy_checklist_items for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "checklist_items_insert_own" on public.strategy_checklist_items for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (select 1 from public.strategies s where s.id = strategy_id and s.user_id = (select auth.uid()))
  );
create policy "checklist_items_update_own" on public.strategy_checklist_items for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "checklist_items_delete_own" on public.strategy_checklist_items for delete to authenticated
  using ((select auth.uid()) = user_id);

-- Trades ↔ Strategie ---------------------------------------------------------------
alter table public.trades add column strategy_id uuid references public.strategies (id) on delete set null;
create index trades_strategy_idx on public.trades (strategy_id);

-- Checkliste pro Trade ---------------------------------------------------------------
create table public.trade_checklist_results (
  trade_id uuid not null references public.trades (id) on delete cascade,
  item_id uuid not null references public.strategy_checklist_items (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  checked boolean not null,
  primary key (trade_id, item_id)
);

create index checklist_results_item_idx on public.trade_checklist_results (item_id);
create index checklist_results_user_idx on public.trade_checklist_results (user_id);
alter table public.trade_checklist_results enable row level security;

create policy "checklist_results_select_own" on public.trade_checklist_results for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "checklist_results_insert_own" on public.trade_checklist_results for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (select 1 from public.trades t where t.id = trade_id and t.user_id = (select auth.uid()))
    and exists (select 1 from public.strategy_checklist_items i where i.id = item_id and i.user_id = (select auth.uid()))
  );
create policy "checklist_results_update_own" on public.trade_checklist_results for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "checklist_results_delete_own" on public.trade_checklist_results for delete to authenticated
  using ((select auth.uid()) = user_id);

-- Wissensartikel --------------------------------------------------------------------
create table public.playbook_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  strategy_id uuid references public.strategies (id) on delete set null,
  title text not null check (char_length(title) between 1 and 200),
  content text not null default '',
  tags text[] not null default '{}',
  pinned boolean not null default false,
  search tsvector generated always as (
    setweight(to_tsvector('german', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('german', coalesce(content, '')), 'B')
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index playbook_notes_user_idx on public.playbook_notes (user_id, pinned desc, updated_at desc);
create index playbook_notes_strategy_idx on public.playbook_notes (strategy_id);
create index playbook_notes_search_idx on public.playbook_notes using gin (search);
create index playbook_notes_tags_idx on public.playbook_notes using gin (tags);
create trigger playbook_notes_set_updated_at before update on public.playbook_notes
  for each row execute function public.set_updated_at();
alter table public.playbook_notes enable row level security;

create policy "notes_select_own" on public.playbook_notes for select to authenticated using ((select auth.uid()) = user_id);
create policy "notes_insert_own" on public.playbook_notes for insert to authenticated with check (
  (select auth.uid()) = user_id
  and (strategy_id is null or exists (select 1 from public.strategies s where s.id = strategy_id and s.user_id = (select auth.uid())))
);
create policy "notes_update_own" on public.playbook_notes for update to authenticated
  using ((select auth.uid()) = user_id) with check (
    (select auth.uid()) = user_id
    and (strategy_id is null or exists (select 1 from public.strategies s where s.id = strategy_id and s.user_id = (select auth.uid())))
  );
create policy "notes_delete_own" on public.playbook_notes for delete to authenticated using ((select auth.uid()) = user_id);

-- Trades dürfen nur eigene Strategien referenzieren
drop policy "trades_insert_own" on public.trades;
drop policy "trades_update_own" on public.trades;
create policy "trades_insert_own" on public.trades for insert to authenticated with check (
  (select auth.uid()) = user_id
  and exists (select 1 from public.accounts a where a.id = account_id and a.user_id = (select auth.uid()))
  and (strategy_id is null or exists (select 1 from public.strategies s where s.id = strategy_id and s.user_id = (select auth.uid())))
);
create policy "trades_update_own" on public.trades for update to authenticated
  using ((select auth.uid()) = user_id) with check (
    (select auth.uid()) = user_id
    and exists (select 1 from public.accounts a where a.id = account_id and a.user_id = (select auth.uid()))
    and (strategy_id is null or exists (select 1 from public.strategies s where s.id = strategy_id and s.user_id = (select auth.uid())))
  );
