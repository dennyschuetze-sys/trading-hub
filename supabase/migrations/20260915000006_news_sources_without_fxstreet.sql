-- FXStreet blockt Abrufe von Vercel (403): nicht mehr vorausgewählt und aus gespeicherten Auswahlen entfernt.
-- In der App lässt sich die Quelle weiterhin einschalten.
alter table public.user_settings
  alter column news_sources set default '{investinglive,investing_fx,investing_commodities}';

update public.user_settings
  set news_sources = array_remove(news_sources, 'fxstreet')
  where 'fxstreet' = any (news_sources);
