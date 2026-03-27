-- ============================================================
-- WastePro — Supabase Schema
-- Run this ONCE in: supabase.com → SQL Editor → New Query
-- ============================================================

create table if not exists customers (
  id             text primary key,
  qr_id          text unique not null,
  name           text not null,
  phone          text not null,
  wallet_balance numeric(10,2) default 0,
  created_at     timestamptz default now()
);

create table if not exists transactions (
  id             text primary key,
  invoice_id     text unique,
  customer_id    text references customers(id),
  customer_name  text,
  customer_phone text default '',
  collector_id   text,
  weight_kg      numeric(10,3) not null,
  price_per_kg   numeric(10,2) not null,
  amount         numeric(10,2) not null,
  balance_before numeric(10,2),
  balance_after  numeric(10,2),
  status         text default 'paid',
  notes          text default '',
  timestamp      timestamptz default now()
);

create index if not exists idx_customers_qr      on customers(qr_id);
create index if not exists idx_tx_customer       on transactions(customer_id);
create index if not exists idx_tx_invoice        on transactions(invoice_id);
create index if not exists idx_tx_timestamp      on transactions(timestamp desc);

-- Row Level Security (service key bypasses this, safe for backend use)
alter table customers    enable row level security;
alter table transactions enable row level security;

create policy "service_all_customers"    on customers    for all using (true) with check (true);
create policy "service_all_transactions" on transactions for all using (true) with check (true);
