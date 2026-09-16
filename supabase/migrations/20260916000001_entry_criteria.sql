-- Einstiegskriterien: pro Strategie eine Liste, pro Trade das gewählte Kriterium
alter table public.strategies
  add column entry_criteria text[] not null default '{}',
  add constraint strategies_entry_criteria_limit check (cardinality(entry_criteria) <= 30);

alter table public.trades
  add column entry_criterion text check (char_length(entry_criterion) <= 100);
