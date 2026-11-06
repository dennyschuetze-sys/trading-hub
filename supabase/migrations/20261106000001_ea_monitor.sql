-- Phase 15: EA-Monitor (Projekt ea-monitor, scripts/melden.py)
--
-- Der Gunner-EA läuft in den VT-Terminals 3 und 4 auf je einem Demokonto. Ein Skript auf dem Rechner mit den
-- Terminals liest alle 15 Minuten Konto und Deals über die MT5-Schnittstelle (handelt nicht) und rechnet aus dem
-- MT5-Wirtschaftskalender und dem Backtest eine Vorhersage, an welchen Tagen der EA wahrscheinlich handelt.
-- Die Seite /ea zeigt beides an.
--
-- Geschrieben wird ausschließlich über ea_ingest() mit einem eigenen Zugangsschlüssel (SHA-256 in
-- ea_ingest_tokens), getrennt vom Schlüssel des KI-Schattenbetriebs.

create table public.ea_ingest_tokens (
  token_hash text primary key check (token_hash ~ '^[0-9a-f]{64}$'),
  user_id uuid not null references auth.users (id) on delete cascade,
  label text not null default 'EA-Monitor' check (char_length(label) <= 60),
  created_at timestamptz not null default now()
);

alter table public.ea_ingest_tokens enable row level security;
-- Keine Policies: Die Tabelle liest nur ea_ingest().

-- Ein Konto je Terminal (T3, T4): Stand beim letzten Lauf
create table public.ea_accounts (
  user_id uuid not null references auth.users (id) on delete cascade,
  tag text not null check (tag ~ '^T[0-9]{1,2}$'),
  login bigint not null,
  name text not null check (char_length(name) <= 60),
  expert text not null check (char_length(expert) <= 80),
  symbol text not null check (char_length(symbol) <= 30),
  timeframe text not null check (char_length(timeframe) <= 5),
  -- Eingaben des EA aus dem Chart-Profil: {"RiskPercent": 1, "MaxLots": 0, "strategies": "A–K"}
  settings jsonb not null default '{}'::jsonb,
  currency text not null check (char_length(currency) = 3),
  start_balance double precision not null,
  balance double precision not null,
  equity double precision not null,
  open_positions integer not null default 0 check (open_positions >= 0),
  connected boolean not null,
  algo_trading boolean not null,
  live_since timestamptz not null,
  run_at timestamptz not null,
  note text check (char_length(note) <= 300),
  primary key (user_id, tag)
);

-- Positionen des EA seit live_since, offene mit dem Stand beim letzten Lauf
create table public.ea_positions (
  user_id uuid not null references auth.users (id) on delete cascade,
  tag text not null check (tag ~ '^T[0-9]{1,2}$'),
  position_id bigint not null,
  status text not null check (status in ('offen', 'zu')),
  side text not null check (side in ('long', 'short')),
  strategy text check (char_length(strategy) <= 10),
  volume double precision not null check (volume > 0),
  opened_at timestamptz not null,
  open_price double precision not null,
  closed_at timestamptz,
  close_price double precision,
  -- Gewinn netto inkl. Kommission und Swap in Kontowährung; bei offenen Positionen der Stand
  profit double precision not null,
  pips double precision,
  updated_at timestamptz not null default now(),
  primary key (user_id, tag, position_id)
);

create index ea_positions_user_opened_idx on public.ea_positions (user_id, tag, opened_at desc);

-- Vorhersage je Handelstag (gilt für alle Konten mit demselben EA). Vergangene Tage bleiben stehen, damit
-- die Seite Vorhersage und tatsächliches Handeln vergleichen kann.
create table public.ea_forecast (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  family text not null check (char_length(family) <= 40),
  probability double precision not null check (probability between 0 and 1),
  sample_days integer not null check (sample_days >= 0),
  -- Wichtige US-Termine des Tages: [{"time": "15:30", "name": "CPI m/m"}, …] in Serverzeit
  events jsonb not null default '[]'::jsonb,
  made_at timestamptz not null,
  primary key (user_id, day)
);

-- Lebenszeichen, Trefferquoten je Tagestyp und Backtest-Bezug, eine Zeile je Nutzer
create table public.ea_status (
  user_id uuid primary key references auth.users (id) on delete cascade,
  run_at timestamptz not null,
  calendar_until timestamptz,
  calendar_at timestamptz,
  -- [{"family": "Fed-Zinsentscheid", "days": 9, "before": 0.5, "after": 0.89, "trades": 15.9}, …]
  families jsonb not null default '[]'::jsonb,
  -- {"period": "…", "stats": {…}, "months": [{"month": "2025-01", "pips": 17.5, "trades": 10}, …]}
  backtest jsonb not null default '{}'::jsonb,
  note text check (char_length(note) <= 300)
);

alter table public.ea_accounts enable row level security;
alter table public.ea_positions enable row level security;
alter table public.ea_forecast enable row level security;
alter table public.ea_status enable row level security;

-- Nur lesen: geschrieben wird ausschließlich über ea_ingest()
create policy "ea_accounts_select_own" on public.ea_accounts for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "ea_positions_select_own" on public.ea_positions for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "ea_forecast_select_own" on public.ea_forecast for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "ea_status_select_own" on public.ea_status for select to authenticated
  using ((select auth.uid()) = user_id);

-- Nimmt eine Meldung des EA-Monitors entgegen. Ohne gültigen Zugangsschlüssel passiert nichts.
-- p_payload: {"status": {…}, "accounts": […], "positions": […], "forecast": […]}, jeder Teil optional.
create function public.ea_ingest(p_token text, p_payload jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
begin
  select t.user_id into v_user
    from public.ea_ingest_tokens t
   where t.token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex');
  if v_user is null then
    raise exception 'Unbekannter Zugangsschlüssel';
  end if;

  if jsonb_array_length(coalesce(p_payload -> 'accounts', '[]'::jsonb)) > 20
     or jsonb_array_length(coalesce(p_payload -> 'positions', '[]'::jsonb)) > 5000
     or jsonb_array_length(coalesce(p_payload -> 'forecast', '[]'::jsonb)) > 400 then
    raise exception 'Zu viele Zeilen in einer Meldung';
  end if;

  insert into public.ea_accounts as a (
    user_id, tag, login, name, expert, symbol, timeframe, settings, currency, start_balance, balance, equity,
    open_positions, connected, algo_trading, live_since, run_at, note)
  select v_user, r.tag, r.login, r.name, r.expert, r.symbol, r.timeframe, coalesce(r.settings, '{}'::jsonb),
         r.currency, r.start_balance, r.balance, r.equity, coalesce(r.open_positions, 0), r.connected,
         r.algo_trading, r.live_since, r.run_at, r.note
    from jsonb_to_recordset(coalesce(p_payload -> 'accounts', '[]'::jsonb)) as r (
      tag text, login bigint, name text, expert text, symbol text, timeframe text, settings jsonb, currency text,
      start_balance double precision, balance double precision, equity double precision, open_positions integer,
      connected boolean, algo_trading boolean, live_since timestamptz, run_at timestamptz, note text)
  on conflict (user_id, tag) do update
    set login = excluded.login, name = excluded.name, expert = excluded.expert, symbol = excluded.symbol,
        timeframe = excluded.timeframe, settings = excluded.settings, currency = excluded.currency,
        start_balance = excluded.start_balance, balance = excluded.balance, equity = excluded.equity,
        open_positions = excluded.open_positions, connected = excluded.connected,
        algo_trading = excluded.algo_trading, live_since = excluded.live_since, run_at = excluded.run_at,
        note = excluded.note;

  insert into public.ea_positions as p (
    user_id, tag, position_id, status, side, strategy, volume, opened_at, open_price, closed_at, close_price,
    profit, pips, updated_at)
  select v_user, r.tag, r.position_id, r.status, r.side, r.strategy, r.volume, r.opened_at, r.open_price,
         r.closed_at, r.close_price, r.profit, r.pips, now()
    from jsonb_to_recordset(coalesce(p_payload -> 'positions', '[]'::jsonb)) as r (
      tag text, position_id bigint, status text, side text, strategy text, volume double precision,
      opened_at timestamptz, open_price double precision, closed_at timestamptz, close_price double precision,
      profit double precision, pips double precision)
  on conflict (user_id, tag, position_id) do update
    set status = excluded.status, side = excluded.side, strategy = excluded.strategy, volume = excluded.volume,
        opened_at = excluded.opened_at, open_price = excluded.open_price, closed_at = excluded.closed_at,
        close_price = excluded.close_price, profit = excluded.profit, pips = excluded.pips, updated_at = now();

  -- Eine offene Position, die das Skript nicht mehr meldet, ist inzwischen geschlossen und kommt mit status 'zu'
  -- im selben Lauf; offene Positionen eines gemeldeten Kontos, die fehlen, werden entfernt (z. B. nach Reset).
  delete from public.ea_positions p
   where p.user_id = v_user and p.status = 'offen'
     and p.tag in (select r.tag from jsonb_to_recordset(coalesce(p_payload -> 'accounts', '[]'::jsonb)) as r (tag text))
     and not exists (
       select 1 from jsonb_to_recordset(coalesce(p_payload -> 'positions', '[]'::jsonb)) as r (tag text, position_id bigint)
        where r.tag = p.tag and r.position_id = p.position_id);

  insert into public.ea_forecast as f (user_id, day, family, probability, sample_days, events, made_at)
  select v_user, r.day, r.family, r.probability, r.sample_days, coalesce(r.events, '[]'::jsonb), r.made_at
    from jsonb_to_recordset(coalesce(p_payload -> 'forecast', '[]'::jsonb)) as r (
      day date, family text, probability double precision, sample_days integer, events jsonb, made_at timestamptz)
  on conflict (user_id, day) do update
    set family = excluded.family, probability = excluded.probability, sample_days = excluded.sample_days,
        events = excluded.events, made_at = excluded.made_at;

  if p_payload ? 'status' then
    insert into public.ea_status as s (user_id, run_at, calendar_until, calendar_at, families, backtest, note)
    select v_user, r.run_at, r.calendar_until, r.calendar_at, coalesce(r.families, '[]'::jsonb),
           coalesce(r.backtest, '{}'::jsonb), r.note
      from jsonb_to_record(p_payload -> 'status') as r (
        run_at timestamptz, calendar_until timestamptz, calendar_at timestamptz, families jsonb, backtest jsonb,
        note text)
    on conflict (user_id) do update
      set run_at = excluded.run_at, calendar_until = excluded.calendar_until, calendar_at = excluded.calendar_at,
          families = excluded.families, backtest = excluded.backtest, note = excluded.note;
  end if;
end;
$$;

-- Das Skript ruft ohne Anmeldung auf (Publishable Key); der Zugangsschlüssel ist die Prüfung.
revoke execute on function public.ea_ingest(text, jsonb) from public;
grant execute on function public.ea_ingest(text, jsonb) to anon, authenticated;
