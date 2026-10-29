-- Phase 13: KI-Schattenbetrieb (Projekt gold-ki, scripts/schatten.py)
--
-- Die Gold-KI läuft auf dem Rechner mit dem VT-Terminal: Sie sagt jede M15-Kerze von XAUUSD voraus, rechnet
-- gedachte Trades mit VT-Kosten ab und lernt einmal pro Woche neu. Sie handelt nicht. Die Seite /ki zeigt das an.
--
-- Geschrieben wird ausschließlich über ki_ingest(). Der Schattenbetrieb meldet sich mit einem eigenen
-- Zugangsschlüssel, dessen SHA-256 in ki_ingest_tokens steht. Der Schlüssel erlaubt nur, die KI-Tabellen des
-- zugehörigen Nutzers zu schreiben – anders als ein Secret Key, der RLS für alle Tabellen umgehen würde.

create table public.ki_ingest_tokens (
  token_hash text primary key check (token_hash ~ '^[0-9a-f]{64}$'),
  user_id uuid not null references auth.users (id) on delete cascade,
  label text not null default 'Schattenbetrieb' check (char_length(label) <= 60),
  created_at timestamptz not null default now()
);

alter table public.ki_ingest_tokens enable row level security;
-- Keine Policies: Die Tabelle liest nur ki_ingest().

-- Lebenszeichen und Bilanz, eine Zeile je Nutzer
create table public.ki_status (
  user_id uuid primary key references auth.users (id) on delete cascade,
  run_at timestamptz not null,
  live_since timestamptz,
  last_bar_at timestamptz,
  last_close double precision,
  model_version text check (char_length(model_version) <= 20),
  pred_long double precision,
  pred_short double precision,
  closed_trades integer not null default 0 check (closed_trades >= 0),
  mean_r double precision,
  sum_r double precision,
  random_mean_r double precision,
  random_p double precision check (random_p between 0 and 1),
  -- Kumuliertes R zufälliger Trades nach Trade-Nummer: [{"n": 1, "lo": …, "mid": …, "hi": …}, …]
  random_band jsonb not null default '[]'::jsonb,
  note text check (char_length(note) <= 300)
);

-- Eine Vorhersage je abgeschlossener M15-Kerze: erwartetes Netto-R eines Long- bzw. Short-Trades
create table public.ki_predictions (
  user_id uuid not null references auth.users (id) on delete cascade,
  bar_at timestamptz not null,
  close double precision not null,
  atr double precision not null check (atr > 0),
  pred_long double precision not null,
  pred_short double precision not null,
  model_version text not null check (char_length(model_version) <= 20),
  -- Später als 30 Minuten nach Kerzenschluss gerechnet, z. B. nach einer Pause des Rechners
  made_at timestamptz not null,
  primary key (user_id, bar_at)
);

-- Gedachte Trades: Signal, wenn die Vorhersage > 0 R ist und in dieser Richtung kein Trade offen ist
create table public.ki_trades (
  user_id uuid not null references auth.users (id) on delete cascade,
  side text not null check (side in ('long', 'short')),
  signal_at timestamptz not null,
  pred double precision not null,
  model_version text not null check (char_length(model_version) <= 20),
  status text not null check (status in ('wartet', 'offen', 'zu')),
  entry_at timestamptz,
  entry_price double precision,
  stop_price double precision,
  target_price double precision,
  exit_at timestamptz,
  exit_price double precision,
  exit_reason text check (exit_reason in ('Ziel', 'Stop', 'Zeit')),
  -- Bei offenen Trades der Stand zum letzten Schlusskurs
  r_net double precision,
  r_gross double precision,
  updated_at timestamptz not null default now(),
  primary key (user_id, side, signal_at)
);

create index ki_trades_user_signal_idx on public.ki_trades (user_id, signal_at desc);

-- Jedes Neulernen, auch die nicht übernommenen Modelle
create table public.ki_models (
  user_id uuid not null references auth.users (id) on delete cascade,
  version text not null check (char_length(version) <= 20),
  trained_at timestamptz not null,
  data_until timestamptz not null,
  train_rows integer not null check (train_rows >= 0),
  accepted boolean not null,
  ic_new double precision,
  ic_old double precision,
  -- Worauf das Modell achtet: {"long": [{"name": "cost_r", "share": 0.14}, …], "short": […]}
  importance jsonb not null default '{}'::jsonb,
  note text check (char_length(note) <= 300),
  primary key (user_id, version)
);

alter table public.ki_status enable row level security;
alter table public.ki_predictions enable row level security;
alter table public.ki_trades enable row level security;
alter table public.ki_models enable row level security;

-- Nur lesen: geschrieben wird ausschließlich über ki_ingest()
create policy "ki_status_select_own" on public.ki_status for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "ki_predictions_select_own" on public.ki_predictions for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "ki_trades_select_own" on public.ki_trades for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "ki_models_select_own" on public.ki_models for select to authenticated
  using ((select auth.uid()) = user_id);

-- Nimmt eine Meldung des Schattenbetriebs entgegen. Ohne gültigen Zugangsschlüssel passiert nichts.
-- p_payload: {"status": {…}, "predictions": […], "trades": […], "models": […]}, jeder Teil optional.
create function public.ki_ingest(p_token text, p_payload jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
begin
  select t.user_id into v_user
    from public.ki_ingest_tokens t
   where t.token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex');
  if v_user is null then
    raise exception 'Unbekannter Zugangsschlüssel';
  end if;

  if jsonb_array_length(coalesce(p_payload -> 'predictions', '[]'::jsonb)) > 5000
     or jsonb_array_length(coalesce(p_payload -> 'trades', '[]'::jsonb)) > 5000
     or jsonb_array_length(coalesce(p_payload -> 'models', '[]'::jsonb)) > 100 then
    raise exception 'Zu viele Zeilen in einer Meldung';
  end if;

  insert into public.ki_predictions as p (user_id, bar_at, close, atr, pred_long, pred_short, model_version, made_at)
  select v_user, r.bar_at, r.close, r.atr, r.pred_long, r.pred_short, r.model_version, r.made_at
    from jsonb_to_recordset(coalesce(p_payload -> 'predictions', '[]'::jsonb)) as r (
      bar_at timestamptz, close double precision, atr double precision, pred_long double precision,
      pred_short double precision, model_version text, made_at timestamptz)
  on conflict (user_id, bar_at) do update
    set close = excluded.close, atr = excluded.atr, pred_long = excluded.pred_long,
        pred_short = excluded.pred_short, model_version = excluded.model_version, made_at = excluded.made_at;

  insert into public.ki_trades as t (
    user_id, side, signal_at, pred, model_version, status, entry_at, entry_price, stop_price, target_price,
    exit_at, exit_price, exit_reason, r_net, r_gross, updated_at)
  select v_user, r.side, r.signal_at, r.pred, r.model_version, r.status, r.entry_at, r.entry_price, r.stop_price,
         r.target_price, r.exit_at, r.exit_price, r.exit_reason, r.r_net, r.r_gross, now()
    from jsonb_to_recordset(coalesce(p_payload -> 'trades', '[]'::jsonb)) as r (
      side text, signal_at timestamptz, pred double precision, model_version text, status text,
      entry_at timestamptz, entry_price double precision, stop_price double precision,
      target_price double precision, exit_at timestamptz, exit_price double precision, exit_reason text,
      r_net double precision, r_gross double precision)
  on conflict (user_id, side, signal_at) do update
    set pred = excluded.pred, model_version = excluded.model_version, status = excluded.status,
        entry_at = excluded.entry_at, entry_price = excluded.entry_price, stop_price = excluded.stop_price,
        target_price = excluded.target_price, exit_at = excluded.exit_at, exit_price = excluded.exit_price,
        exit_reason = excluded.exit_reason, r_net = excluded.r_net, r_gross = excluded.r_gross, updated_at = now();

  insert into public.ki_models as m (
    user_id, version, trained_at, data_until, train_rows, accepted, ic_new, ic_old, importance, note)
  select v_user, r.version, r.trained_at, r.data_until, r.train_rows, r.accepted, r.ic_new, r.ic_old,
         coalesce(r.importance, '{}'::jsonb), r.note
    from jsonb_to_recordset(coalesce(p_payload -> 'models', '[]'::jsonb)) as r (
      version text, trained_at timestamptz, data_until timestamptz, train_rows integer, accepted boolean,
      ic_new double precision, ic_old double precision, importance jsonb, note text)
  on conflict (user_id, version) do update
    set trained_at = excluded.trained_at, data_until = excluded.data_until, train_rows = excluded.train_rows,
        accepted = excluded.accepted, ic_new = excluded.ic_new, ic_old = excluded.ic_old,
        importance = excluded.importance, note = excluded.note;

  if p_payload ? 'status' then
    insert into public.ki_status as s (
      user_id, run_at, live_since, last_bar_at, last_close, model_version, pred_long, pred_short, closed_trades,
      mean_r, sum_r, random_mean_r, random_p, random_band, note)
    select v_user, r.run_at, r.live_since, r.last_bar_at, r.last_close, r.model_version, r.pred_long, r.pred_short,
           coalesce(r.closed_trades, 0), r.mean_r, r.sum_r, r.random_mean_r, r.random_p,
           coalesce(r.random_band, '[]'::jsonb), r.note
      from jsonb_to_record(p_payload -> 'status') as r (
        run_at timestamptz, live_since timestamptz, last_bar_at timestamptz, last_close double precision,
        model_version text, pred_long double precision, pred_short double precision, closed_trades integer,
        mean_r double precision, sum_r double precision, random_mean_r double precision, random_p double precision,
        random_band jsonb, note text)
    on conflict (user_id) do update
      set run_at = excluded.run_at, live_since = excluded.live_since, last_bar_at = excluded.last_bar_at,
          last_close = excluded.last_close, model_version = excluded.model_version,
          pred_long = excluded.pred_long, pred_short = excluded.pred_short, closed_trades = excluded.closed_trades,
          mean_r = excluded.mean_r, sum_r = excluded.sum_r, random_mean_r = excluded.random_mean_r,
          random_p = excluded.random_p, random_band = excluded.random_band, note = excluded.note;
  end if;
end;
$$;

-- Der Schattenbetrieb ruft ohne Anmeldung auf (Publishable Key); der Zugangsschlüssel ist die Prüfung.
revoke execute on function public.ki_ingest(text, jsonb) from public;
grant execute on function public.ki_ingest(text, jsonb) to anon, authenticated;
