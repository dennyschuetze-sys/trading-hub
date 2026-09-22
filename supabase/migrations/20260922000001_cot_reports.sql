-- Phase 12: Wöchentliche COT-Daten der CFTC (Commitments of Traders)

-- Anders als alle übrigen Tabellen sind das Marktdaten, keine Nutzerdaten: kein user_id.
-- Geschrieben wird ausschließlich vom Cron-Job über den Admin-Client (Service-Role umgeht RLS),
-- gelesen von jedem angemeldeten Nutzer.
create table public.cot_reports (
  contract_code text not null check (char_length(contract_code) <= 10),
  report_date date not null,
  market_name text not null check (char_length(market_name) <= 120),
  open_interest integer not null,
  noncomm_long integer not null,
  noncomm_short integer not null,
  comm_long integer not null,
  comm_short integer not null,
  nonrept_long integer not null,
  nonrept_short integer not null,
  created_at timestamptz not null default now(),
  primary key (contract_code, report_date)
);

create index cot_reports_date_idx on public.cot_reports (report_date desc);

alter table public.cot_reports enable row level security;

create policy "cot_reports_select_all" on public.cot_reports for select to authenticated
  using (true);
