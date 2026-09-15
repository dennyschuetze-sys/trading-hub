-- Zeitplan für Telegram-Benachrichtigungen – EINMALIG im Supabase SQL Editor ausführen.
-- Nicht als Migration, weil hier geheime Werte stehen. Vorher die zwei Platzhalter ersetzen:
--   DEINE-APP  → deine Vercel-Adresse (ohne / am Ende)
--   DEIN_CRON_SECRET → derselbe Wert wie CRON_SECRET in Vercel

select vault.create_secret('https://DEINE-APP.vercel.app', 'trading_hub_url');
select vault.create_secret('DEIN_CRON_SECRET', 'trading_hub_cron_secret');

-- Alle 5 Minuten /api/cron/notify aufrufen
select cron.schedule(
  'trading-hub-notify',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'trading_hub_url') || '/api/cron/notify',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'trading_hub_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);

-- Kontrolle: letzte Aufrufe (status_code 200 = ok)
-- select id, status_code, content, created from net._http_response order by created desc limit 10;
-- Job stoppen: select cron.unschedule('trading-hub-notify');
