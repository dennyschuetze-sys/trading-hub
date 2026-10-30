-- Markt-Statistik (Seite /markt): Tageskerzen von XAUUSD und das Volumen der Gold-Futures an der COMEX
--
-- market_days: eine Kerze je Handelstag, Tagesgrenze wie bei VT um 17:00 New York. Bis Februar 2024 aus
-- Dukascopy-M1 zusammengefasst, danach die D1-Kerzen von VT (XAUUSD-VIP).
-- market_volumes: gehandelte Kontrakte der Gold-Futures am selben Handelstag (TradingView COMEX:GC1! und GC2!).
-- Die Seite zählt beide zusammen: Am Kontraktwechsel bricht das Volumen des vordersten Kontrakts ein, der
-- nächste übernimmt.
--
-- Geschrieben wird ausschließlich über market_ingest() (Skript markt-statistik/scripts/melden.py). Die Funktion
-- prüft gegen dieselben Zugangsschlüssel wie ki_ingest (ki_ingest_tokens) und schreibt nur die Zeilen des
-- zugehörigen Nutzers.

create table public.market_days (
  user_id uuid not null references auth.users (id) on delete cascade,
  symbol text not null check (char_length(symbol) <= 20),
  day date not null,
  open double precision not null,
  high double precision not null,
  low double precision not null,
  close double precision not null check (high >= low),
  source text not null check (source in ('dukascopy', 'vt')),
  primary key (user_id, symbol, day)
);

create table public.market_volumes (
  user_id uuid not null references auth.users (id) on delete cascade,
  symbol text not null check (char_length(symbol) <= 20),
  day date not null,
  contracts_front bigint not null check (contracts_front >= 0),
  contracts_next bigint check (contracts_next >= 0),
  primary key (user_id, symbol, day)
);

alter table public.market_days enable row level security;
alter table public.market_volumes enable row level security;

-- Nur lesen: geschrieben wird ausschließlich über market_ingest()
create policy "market_days_select_own" on public.market_days for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "market_volumes_select_own" on public.market_volumes for select to authenticated
  using ((select auth.uid()) = user_id);

-- p_payload: {"symbol": "XAUUSD", "days": [{day, open, high, low, close, source}, …],
--             "volumes": [{day, contracts_front, contracts_next}, …]}, days und volumes optional.
create function public.market_ingest(p_token text, p_payload jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
  v_symbol text := p_payload ->> 'symbol';
begin
  select t.user_id into v_user
    from public.ki_ingest_tokens t
   where t.token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex');
  if v_user is null then
    raise exception 'Unbekannter Zugangsschlüssel';
  end if;
  if v_symbol is null or char_length(v_symbol) > 20 then
    raise exception 'Symbol fehlt';
  end if;
  if jsonb_array_length(coalesce(p_payload -> 'days', '[]'::jsonb)) > 6000
     or jsonb_array_length(coalesce(p_payload -> 'volumes', '[]'::jsonb)) > 6000 then
    raise exception 'Zu viele Zeilen in einer Meldung';
  end if;

  insert into public.market_days as d (user_id, symbol, day, open, high, low, close, source)
  select v_user, v_symbol, r.day, r.open, r.high, r.low, r.close, r.source
    from jsonb_to_recordset(coalesce(p_payload -> 'days', '[]'::jsonb)) as r (
      day date, open double precision, high double precision, low double precision, close double precision,
      source text)
  on conflict (user_id, symbol, day) do update
    set open = excluded.open, high = excluded.high, low = excluded.low, close = excluded.close,
        source = excluded.source;

  insert into public.market_volumes as v (user_id, symbol, day, contracts_front, contracts_next)
  select v_user, v_symbol, r.day, r.contracts_front, r.contracts_next
    from jsonb_to_recordset(coalesce(p_payload -> 'volumes', '[]'::jsonb)) as r (
      day date, contracts_front bigint, contracts_next bigint)
  on conflict (user_id, symbol, day) do update
    set contracts_front = excluded.contracts_front, contracts_next = excluded.contracts_next;
end;
$$;

-- Das Skript ruft ohne Anmeldung auf (Publishable Key); der Zugangsschlüssel ist die Prüfung.
revoke execute on function public.market_ingest(text, jsonb) from public;
grant execute on function public.market_ingest(text, jsonb) to anon, authenticated;
