-- Kostenbremse für KI-Aufrufe absichern.
--
-- Bisher stand der Zähler in ai_reports.generations und wurde in der Anwendung gelesen,
-- hochgezählt und zurückgeschrieben. Zwei gleichzeitige Anfragen lasen denselben Stand,
-- und weil der Nutzer seine eigene Zeile ändern und löschen darf, ließ sich der Zähler
-- zurücksetzen. Der Zähler zieht deshalb in eine eigene Tabelle ohne Schreibrechte um.

create table public.ai_usage (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('news_daily', 'journal_week', 'journal_month')),
  period_key date not null,
  generations smallint not null default 0 check (generations >= 0 and generations <= 1000),
  updated_at timestamptz not null default now(),
  primary key (user_id, kind, period_key)
);

alter table public.ai_usage enable row level security;

-- Nur lesen: geschrieben wird ausschließlich über die beiden Funktionen unten.
create policy "ai_usage_select_own" on public.ai_usage for select to authenticated
  using ((select auth.uid()) = user_id);

-- Bereits verbrauchte Generierungen übernehmen, damit das Limit nicht von vorn beginnt.
insert into public.ai_usage (user_id, kind, period_key, generations)
select user_id, kind, period_key, generations from public.ai_reports
on conflict (user_id, kind, period_key) do nothing;

-- Bucht eine Generierung und gibt den neuen Stand zurück, oder null, wenn das Limit
-- erreicht ist. Ein einziges Statement – parallele Aufrufe können sich nicht überholen.
create function public.claim_ai_generation(p_kind text, p_period_key date, p_max smallint)
returns smallint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_count smallint;
begin
  if v_user is null then
    raise exception 'Nicht angemeldet';
  end if;
  if p_max is null or p_max < 1 or p_max > 100 then
    raise exception 'Ungültiges Limit';
  end if;

  insert into public.ai_usage as u (user_id, kind, period_key, generations)
  values (v_user, p_kind, p_period_key, 1)
  on conflict (user_id, kind, period_key) do update
    set generations = u.generations + 1, updated_at = now()
    where u.generations < p_max
  returning u.generations into v_count;

  return v_count;
end;
$$;

-- Gibt eine Buchung zurück, wenn der Aufruf fehlgeschlagen ist – sonst würde ein
-- Netzwerkfehler dauerhaft eine der fünf Generierungen kosten.
create function public.release_ai_generation(p_kind text, p_period_key date)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.ai_usage
     set generations = generations - 1, updated_at = now()
   where user_id = (select auth.uid())
     and kind = p_kind
     and period_key = p_period_key
     and generations > 0;
$$;

revoke execute on function public.claim_ai_generation(text, date, smallint) from public;
revoke execute on function public.release_ai_generation(text, date) from public;
grant execute on function public.claim_ai_generation(text, date, smallint) to authenticated;
grant execute on function public.release_ai_generation(text, date) to authenticated;
