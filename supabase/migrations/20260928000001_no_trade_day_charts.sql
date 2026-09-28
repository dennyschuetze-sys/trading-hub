-- Tage ohne Trade und Chart-Bilder zum Tag.
--
-- „Kein Trade“ gehört zum Session-Review: ein bewusster Verzicht ist ein Ergebnis und soll
-- im Verlauf nicht wie ein vergessener Tag aussehen. Die Chart-Bilder (Marktverlauf,
-- verpasste Setups) hängen am Datum, nicht am Plan – sie lassen sich auch ohne ausgefüllten
-- Tagesplan hochladen und bleiben erhalten, wenn der Plan gelöscht wird. Sie liegen bewusst
-- nicht in trade_screenshots, damit die Screenshot-Galerie bei Trades bleibt.

alter table public.daily_plans
  add column no_trade boolean not null default false,
  add column no_trade_reason text
    check (no_trade_reason in ('no_setup', 'market', 'missed_setup', 'away', 'rule_pause')),
  add constraint daily_plans_no_trade_reason_needs_flag check (no_trade or no_trade_reason is null);

create table public.day_charts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  chart_date date not null,
  -- Datei im privaten Bucket „screenshots“: <user_id>/days/<datum>/<datei>
  storage_path text not null check (char_length(storage_path) <= 300),
  kind text not null default 'market' check (kind in ('market', 'missed_setup')),
  symbol text check (char_length(symbol) <= 30),
  note text check (char_length(note) <= 1000),
  created_at timestamptz not null default now()
);

-- Tagesansicht (user_id, chart_date) und Galerie (neueste zuerst) aus einem Index
create index day_charts_user_date_idx on public.day_charts (user_id, chart_date desc, created_at);

alter table public.day_charts enable row level security;

-- Pfad muss im eigenen Ordner liegen – sonst könnte ein Eintrag auf eine fremde Datei zeigen
create policy "day_charts_select_own" on public.day_charts for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "day_charts_insert_own" on public.day_charts for insert to authenticated
  with check ((select auth.uid()) = user_id and split_part(storage_path, '/', 1) = (select auth.uid())::text);
create policy "day_charts_update_own" on public.day_charts for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id and split_part(storage_path, '/', 1) = (select auth.uid())::text);
create policy "day_charts_delete_own" on public.day_charts for delete to authenticated
  using ((select auth.uid()) = user_id);
