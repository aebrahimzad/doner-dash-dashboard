/*
# Seed jurnal_payment_accounts

One row per iSeller payment method, pointing at the Jurnal Cash & Bank account
its money is deposited to.

The deposit_to_name values below are PLACEHOLDERS. The sync refuses any value
shaped like JURNAL_..._ID, so nothing reaches Jurnal until each one is replaced
with the account exactly as it is named in Jurnal (Daftar Akun), and
account_code with its GL code. Either edit this file before it is deployed,
or run, after deployment:

  update public.jurnal_payment_accounts
     set deposit_to_name = 'Kas', account_code = '1-10001'
   where payment_method = 'Cash';

payment_method must match the name iSeller sends (case and spacing are
ignored). An iSeller method with no row here is rejected by the sync, before
anything reaches Jurnal; add a row for it.

Re-running this file never overwrites values already filled in.
*/

insert into public.jurnal_payment_accounts
  (payment_method, deposit_to_name,  account_code,     jurnal_payment_method_name, is_active)
values
  ('Cash',         'JURNAL_CASH_ID', 'JURNAL_CASH_ID', 'Cash',                     true),
  ('EDC BCA',      'JURNAL_BCA_ID',  'JURNAL_BCA_ID',  'Credit Card',              true),
  ('QRIS',         'JURNAL_QRIS_ID', 'JURNAL_QRIS_ID', 'Transfer Bank',            true)
on conflict do nothing;
