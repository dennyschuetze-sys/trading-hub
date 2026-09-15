-- Upserts (insert … on conflict do update) setzen auch user_id; die Policy erzwingt die eigene ID
grant update (user_id) on public.notification_settings to authenticated;
