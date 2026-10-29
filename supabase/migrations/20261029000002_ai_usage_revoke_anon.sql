-- Kostenbremse für KI-Aufrufe nur für angemeldete Nutzer.
--
-- 20260922000002_ai_usage.sql hat EXECUTE von PUBLIC genommen und authenticated gegeben. Supabase vergibt bei neuen
-- Funktionen im Schema public aber zusätzlich direkt EXECUTE an anon (Default Privileges), und das blieb stehen.
-- Ohne Anmeldung taten beide Funktionen nichts, weil auth.uid() null ist – in die öffentliche API gehören sie trotzdem
-- nicht (Advisor-Lint 0028). Angemeldete Nutzer brauchen sie weiter: Sie buchen nur die eigene Zeile.
revoke execute on function public.claim_ai_generation(text, date, smallint) from anon, public;
revoke execute on function public.release_ai_generation(text, date) from anon, public;
