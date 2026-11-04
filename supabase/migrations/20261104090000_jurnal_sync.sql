/*
# Mekari Jurnal sync

## jurnal_payment_accounts
Which Jurnal Cash & Bank account each iSeller payment method is deposited to.
Matching on payment_method ignores case and extra spaces. Fill in
deposit_to_name (the account name exactly as it appears in Jurnal) before
syncing; a method with no account is rejected before anything reaches Jurnal.

## jurnal_sync_log
One row per order_reference: the idempotency ledger. A row in status 'paid'
is never sent to Jurnal again. 'needs_review' means the sync stopped on
purpose (e.g. the order changed after its invoice reached Jurnal); fix it in
Jurnal, then delete the row or set it back to 'failed'.

## jurnal_claim_order(...)
Atomic claim with a short lock, so concurrent clicks can't double-post. Only
the sync-to-jurnal Edge Function (service role) may call it or write the log.

Safe to re-run.
*/

create table if not exists public.jurnal_payment_accounts (
  payment_method text primary key,
  deposit_to_name text,
  account_code text,
  jurnal_payment_method_name text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists jurnal_payment_accounts_method_key
  on public.jurnal_payment_accounts (lower(regexp_replace(btrim(payment_method), '\s+', ' ', 'g')));

-- Placeholders for the methods seen in iSeller. deposit_to_name stays empty
-- until someone enters the matching Jurnal account.
insert into public.jurnal_payment_accounts (payment_method, jurnal_payment_method_name) values
  ('Cash', 'Cash'),
  ('EDC BCA', 'Credit Card'),
  ('QRIS', 'Transfer Bank')
on conflict do nothing;

create table if not exists public.jurnal_sync_log (
  order_reference text primary key,
  status text not null default 'pending'
    check (status in ('pending', 'invoiced', 'paid', 'failed', 'needs_review')),
  sales_date date not null,
  payment_method text not null,
  total_amount bigint not null check (total_amount > 0),
  jurnal_invoice_id text,
  jurnal_invoice_no text,
  jurnal_payment_id text,
  jurnal_payment_no text,
  attempts integer not null default 0,
  last_error text,
  locked_until timestamptz,
  synced_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  paid_at timestamptz
);

create index if not exists jurnal_sync_log_status_idx on public.jurnal_sync_log (status);
create index if not exists jurnal_sync_log_sales_date_idx on public.jurnal_sync_log (sales_date);

create or replace function public.jurnal_touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists jurnal_sync_log_touch on public.jurnal_sync_log;
create trigger jurnal_sync_log_touch before update on public.jurnal_sync_log
  for each row execute function public.jurnal_touch_updated_at();

drop trigger if exists jurnal_payment_accounts_touch on public.jurnal_payment_accounts;
create trigger jurnal_payment_accounts_touch before update on public.jurnal_payment_accounts
  for each row execute function public.jurnal_touch_updated_at();

-- Claims an order for syncing. Returns the stored row when this caller may
-- proceed; returns nothing when the order is paid, under review, or locked by
-- another call. The stored details are kept on re-claim so the function can
-- compare them with the incoming ones.
create or replace function public.jurnal_claim_order(
  p_order_reference text,
  p_sales_date date,
  p_payment_method text,
  p_total_amount bigint,
  p_user_id uuid,
  p_lock_seconds integer default 120
) returns setof public.jurnal_sync_log
language sql
security invoker
set search_path = ''
as $$
  insert into public.jurnal_sync_log as l
    (order_reference, sales_date, payment_method, total_amount, synced_by, attempts, locked_until)
  values
    (p_order_reference, p_sales_date, p_payment_method, p_total_amount, p_user_id, 1,
     now() + make_interval(secs => p_lock_seconds))
  on conflict (order_reference) do update
    set attempts = l.attempts + 1,
        locked_until = now() + make_interval(secs => p_lock_seconds),
        synced_by = coalesce(excluded.synced_by, l.synced_by)
  where l.status not in ('paid', 'needs_review')
    and (l.locked_until is null or l.locked_until < now())
  returning l.*;
$$;

revoke all on function public.jurnal_claim_order(text, date, text, bigint, uuid, integer) from public, anon, authenticated;
grant execute on function public.jurnal_claim_order(text, date, text, bigint, uuid, integer) to service_role;

-- RLS: signed-in users can read both tables and edit the account mapping;
-- only the Edge Function (service role, which bypasses RLS) writes the log.
alter table public.jurnal_payment_accounts enable row level security;
alter table public.jurnal_sync_log enable row level security;

drop policy if exists "Authenticated read payment accounts" on public.jurnal_payment_accounts;
create policy "Authenticated read payment accounts" on public.jurnal_payment_accounts
  for select to authenticated using (true);

drop policy if exists "Authenticated edit payment accounts" on public.jurnal_payment_accounts;
create policy "Authenticated edit payment accounts" on public.jurnal_payment_accounts
  for all to authenticated using (true) with check (true);

drop policy if exists "Authenticated read sync log" on public.jurnal_sync_log;
create policy "Authenticated read sync log" on public.jurnal_sync_log
  for select to authenticated using (true);

revoke all on public.jurnal_sync_log from anon;
revoke all on public.jurnal_payment_accounts from anon;
