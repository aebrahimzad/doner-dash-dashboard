/*
# Add nutrition columns to ingredients

Brings the schema in line with the Bolt database the 2026-11-04 data dump was
taken from. Values are per base unit of measure; existing rows default to 0.

## Changed Tables
### ingredients
- `calories` (numeric, default 0)
- `protein_g` (numeric, default 0)
- `carbs_g` (numeric, default 0)
- `fat_g` (numeric, default 0)
*/

alter table public.ingredients
  add column if not exists calories numeric default 0,
  add column if not exists protein_g numeric default 0,
  add column if not exists carbs_g numeric default 0,
  add column if not exists fat_g numeric default 0;
