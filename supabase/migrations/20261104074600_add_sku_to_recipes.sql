/*
# Add SKU columns to recipes

Brings the schema in line with the Bolt database the 2026-11-04 data dump was
taken from.

## Changed Tables
### recipes
- `sku` (text, nullable) — internal SKU
- `iseller_sku` (text, nullable) — SKU in the iSeller POS, used to match sales
*/

alter table public.recipes
  add column if not exists sku text,
  add column if not exists iseller_sku text;
