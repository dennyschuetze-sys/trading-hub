-- Härtung: Update-Policies prüfen auch den übergeordneten Datensatz (wie die Insert-Policies),
-- damit z. B. trade_id nicht auf einen fremden Trade umgehängt werden kann.

drop policy "screenshots_update_own" on public.trade_screenshots;
create policy "screenshots_update_own" on public.trade_screenshots for update to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (select 1 from public.trades t where t.id = trade_id and t.user_id = (select auth.uid()))
  );

drop policy "import_batches_update_own" on public.import_batches;
create policy "import_batches_update_own" on public.import_batches for update to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (select 1 from public.accounts a where a.id = account_id and a.user_id = (select auth.uid()))
  );

drop policy "checklist_items_update_own" on public.strategy_checklist_items;
create policy "checklist_items_update_own" on public.strategy_checklist_items for update to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (select 1 from public.strategies s where s.id = strategy_id and s.user_id = (select auth.uid()))
  );

drop policy "checklist_results_update_own" on public.trade_checklist_results;
create policy "checklist_results_update_own" on public.trade_checklist_results for update to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (select 1 from public.trades t where t.id = trade_id and t.user_id = (select auth.uid()))
    and exists (select 1 from public.strategy_checklist_items i where i.id = item_id and i.user_id = (select auth.uid()))
  );

-- Doppelt: der Unique-Constraint daily_plans_user_date_unique legt denselben Index (user_id, plan_date) an
drop index public.daily_plans_user_date_idx;
