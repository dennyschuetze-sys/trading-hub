-- Zusätzliche Trade-Daten: Kursextreme während des Trades (MFE/MAE), Setup-Kontext und SL-Management
alter table public.trades
  add column best_price numeric(18, 6),
  add column worst_price numeric(18, 6),
  add column entry_timeframe text check (char_length(entry_timeframe) <= 20),
  add column htf_bias text check (htf_bias in ('with', 'against', 'neutral')),
  add column market_context text check (market_context in ('trend', 'range', 'volatile')),
  add column moved_to_breakeven boolean,
  add column partial_close boolean;
