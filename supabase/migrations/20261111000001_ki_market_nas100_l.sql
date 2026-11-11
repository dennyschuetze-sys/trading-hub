-- NAS100 Long lernend (gold-ki/scripts/schatten_nas100_lernt.py, seit 11.11.2026, lernt wöchentlich neu, neben der
-- eingefrorenen Vorwärtsprobe NAS100) meldet als market 'NAS100-L'. Erlaubt in den Spaltenprüfungen und in ki_ingest.

alter table public.ki_status drop constraint ki_status_market_check,
  add constraint ki_status_market_check check (market in ('XAUUSD', 'NAS100', 'XAUUSD-M5', 'NAS100-L'));
alter table public.ki_predictions drop constraint ki_predictions_market_check,
  add constraint ki_predictions_market_check check (market in ('XAUUSD', 'NAS100', 'XAUUSD-M5', 'NAS100-L'));
alter table public.ki_trades drop constraint ki_trades_market_check,
  add constraint ki_trades_market_check check (market in ('XAUUSD', 'NAS100', 'XAUUSD-M5', 'NAS100-L'));
alter table public.ki_models drop constraint ki_models_market_check,
  add constraint ki_models_market_check check (market in ('XAUUSD', 'NAS100', 'XAUUSD-M5', 'NAS100-L'));
alter table public.ki_bars drop constraint ki_bars_market_check,
  add constraint ki_bars_market_check check (market in ('XAUUSD', 'NAS100', 'XAUUSD-M5', 'NAS100-L'));

-- ki_ingest wie in 20261104000001_ki_market_m5, nur mit dem neuen Markt in der Prüfung. Gleiche Signatur: Die
-- Ausführungsrechte bleiben.
create or replace function public.ki_ingest(p_token text, p_payload jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
  v_market text := coalesce(p_payload ->> 'market', 'XAUUSD');
begin
  select t.user_id into v_user
    from public.ki_ingest_tokens t
   where t.token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex');
  if v_user is null then
    raise exception 'Unbekannter Zugangsschlüssel';
  end if;
  if v_market not in ('XAUUSD', 'NAS100', 'XAUUSD-M5', 'NAS100-L') then
    raise exception 'Unbekannter Markt';
  end if;

  if jsonb_array_length(coalesce(p_payload -> 'predictions', '[]'::jsonb)) > 5000
     or jsonb_array_length(coalesce(p_payload -> 'bars', '[]'::jsonb)) > 5000
     or jsonb_array_length(coalesce(p_payload -> 'trades', '[]'::jsonb)) > 5000
     or jsonb_array_length(coalesce(p_payload -> 'models', '[]'::jsonb)) > 100 then
    raise exception 'Zu viele Zeilen in einer Meldung';
  end if;

  insert into public.ki_predictions as p (user_id, market, bar_at, close, atr, pred_long, pred_short, model_version,
                                          made_at)
  select v_user, v_market, r.bar_at, r.close, r.atr, r.pred_long, r.pred_short, r.model_version, r.made_at
    from jsonb_to_recordset(coalesce(p_payload -> 'predictions', '[]'::jsonb)) as r (
      bar_at timestamptz, close double precision, atr double precision, pred_long double precision,
      pred_short double precision, model_version text, made_at timestamptz)
  on conflict (user_id, market, bar_at) do update
    set close = excluded.close, atr = excluded.atr, pred_long = excluded.pred_long,
        pred_short = excluded.pred_short, model_version = excluded.model_version, made_at = excluded.made_at;

  insert into public.ki_bars as b (user_id, market, bar_at, open, high, low, close)
  select v_user, v_market, r.bar_at, r.open, r.high, r.low, r.close
    from jsonb_to_recordset(coalesce(p_payload -> 'bars', '[]'::jsonb)) as r (
      bar_at timestamptz, open double precision, high double precision, low double precision,
      close double precision)
  on conflict (user_id, market, bar_at) do update
    set open = excluded.open, high = excluded.high, low = excluded.low, close = excluded.close;

  insert into public.ki_trades as t (
    user_id, market, side, signal_at, pred, model_version, status, entry_at, entry_price, stop_price, target_price,
    exit_at, exit_price, exit_reason, r_net, r_gross, reasons, updated_at)
  select v_user, v_market, r.side, r.signal_at, r.pred, r.model_version, r.status, r.entry_at, r.entry_price,
         r.stop_price, r.target_price, r.exit_at, r.exit_price, r.exit_reason, r.r_net, r.r_gross,
         coalesce(r.reasons, '{}'::jsonb), now()
    from jsonb_to_recordset(coalesce(p_payload -> 'trades', '[]'::jsonb)) as r (
      side text, signal_at timestamptz, pred double precision, model_version text, status text,
      entry_at timestamptz, entry_price double precision, stop_price double precision,
      target_price double precision, exit_at timestamptz, exit_price double precision, exit_reason text,
      r_net double precision, r_gross double precision, reasons jsonb)
  on conflict (user_id, market, side, signal_at) do update
    set pred = excluded.pred, model_version = excluded.model_version, status = excluded.status,
        entry_at = excluded.entry_at, entry_price = excluded.entry_price, stop_price = excluded.stop_price,
        target_price = excluded.target_price, exit_at = excluded.exit_at, exit_price = excluded.exit_price,
        exit_reason = excluded.exit_reason, r_net = excluded.r_net, r_gross = excluded.r_gross,
        reasons = excluded.reasons, updated_at = now();

  insert into public.ki_models as m (
    user_id, market, version, trained_at, data_until, train_rows, accepted, ic_new, ic_old, importance, note)
  select v_user, v_market, r.version, r.trained_at, r.data_until, r.train_rows, r.accepted, r.ic_new, r.ic_old,
         coalesce(r.importance, '{}'::jsonb), r.note
    from jsonb_to_recordset(coalesce(p_payload -> 'models', '[]'::jsonb)) as r (
      version text, trained_at timestamptz, data_until timestamptz, train_rows integer, accepted boolean,
      ic_new double precision, ic_old double precision, importance jsonb, note text)
  on conflict (user_id, market, version) do update
    set trained_at = excluded.trained_at, data_until = excluded.data_until, train_rows = excluded.train_rows,
        accepted = excluded.accepted, ic_new = excluded.ic_new, ic_old = excluded.ic_old,
        importance = excluded.importance, note = excluded.note;

  if p_payload ? 'status' then
    insert into public.ki_status as s (
      user_id, market, run_at, live_since, last_bar_at, last_close, model_version, pred_long, pred_short,
      closed_trades, mean_r, sum_r, random_mean_r, random_p, random_band, note)
    select v_user, v_market, r.run_at, r.live_since, r.last_bar_at, r.last_close, r.model_version, r.pred_long,
           r.pred_short, coalesce(r.closed_trades, 0), r.mean_r, r.sum_r, r.random_mean_r, r.random_p,
           coalesce(r.random_band, '[]'::jsonb), r.note
      from jsonb_to_record(p_payload -> 'status') as r (
        run_at timestamptz, live_since timestamptz, last_bar_at timestamptz, last_close double precision,
        model_version text, pred_long double precision, pred_short double precision, closed_trades integer,
        mean_r double precision, sum_r double precision, random_mean_r double precision, random_p double precision,
        random_band jsonb, note text)
    on conflict (user_id, market) do update
      set run_at = excluded.run_at, live_since = excluded.live_since, last_bar_at = excluded.last_bar_at,
          last_close = excluded.last_close, model_version = excluded.model_version,
          pred_long = excluded.pred_long, pred_short = excluded.pred_short, closed_trades = excluded.closed_trades,
          mean_r = excluded.mean_r, sum_r = excluded.sum_r, random_mean_r = excluded.random_mean_r,
          random_p = excluded.random_p, random_band = excluded.random_band, note = excluded.note;
  end if;
end;
$$;

