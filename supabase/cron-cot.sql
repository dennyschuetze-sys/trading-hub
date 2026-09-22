-- Zeitplan für den wöchentlichen COT-Abgleich – EINMALIG im Supabase SQL Editor ausführen.
-- Nicht als Migration, weil hier auf die Vault-Secrets zugegriffen wird.
--
-- Die Secrets legt bereits cron-notify.sql an (trading_hub_url, trading_hub_cron_secret).
-- Falls das noch nicht geschehen ist, zuerst dort die beiden create_secret-Zeilen ausführen.
--
-- Vor dem ersten Lauf einmal den Backfill anstoßen (holt drei Jahre Historie für den COT-Index):
--   curl -H "Authorization: Bearer DEIN_CRON_SECRET" "https://DEINE-APP.vercel.app/api/cron/cot?since=2023-09-01"

-- Die CFTC veröffentlicht freitags 15:30 Uhr New Yorker Zeit, also 20:30 bzw. 21:30 UTC.
-- Deshalb freitags nach beiden möglichen Zeiten und samstags noch einmal – der Upsert ist
-- idempotent, ein zusätzlicher Lauf kostet nur einen Abruf.
select cron.schedule(
  'trading-hub-cot',
  '30 22 * * 5',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'trading_hub_url') || '/api/cron/cot',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'trading_hub_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);

select cron.schedule(
  'trading-hub-cot-retry',
  '0 10 * * 6',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'trading_hub_url') || '/api/cron/cot',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'trading_hub_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);

-- Kontrolle: letzte Aufrufe (status_code 200 = ok)
-- select id, status_code, content, created from net._http_response order by created desc limit 10;
-- Kontrolle: gespeicherte Wochen je Markt
-- select contract_code, count(*), max(report_date) from cot_reports group by 1 order by 1;
-- Jobs stoppen: select cron.unschedule('trading-hub-cot'); select cron.unschedule('trading-hub-cot-retry');
