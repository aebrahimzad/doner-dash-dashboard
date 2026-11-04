/*
# Align schema with Bolt's original migrations

The 20261104074500–074700 migrations were written from the data dump before
Bolt's own migrations were available. Bolt has since pushed them (Doner-dash-cogs2:
20260727144048 … 20260901063343). This migration brings the database to exactly
what those produce, without re-running them out of order.

## Changes
- ingredients: calories / protein_g / carbs_g / fat_g → numeric(10,2)
- ingredients: drop positive-cost CHECK constraints (Bolt 20260828181638)
- recipes: UNIQUE (sku) as recipes_sku_unique (Bolt 20260813063940)
- recipes: UNIQUE (name) as recipes_name_unique (Bolt 20260828142029)
- ck_meat_tracking: protein_type default 'Beef'; blended_cost_per_kg nullable
  with no default; created_at / updated_at nullable (Bolt 20260831174201)
- ck_meat_tracking: policy and index names as in Bolt, plus the status index

Safe to re-run.
*/

alter table public.ingredients
  alter column calories type numeric(10,2),
  alter column protein_g type numeric(10,2),
  alter column carbs_g type numeric(10,2),
  alter column fat_g type numeric(10,2);

alter table public.ingredients drop constraint if exists ingredients_cost_per_unit_check;
alter table public.ingredients drop constraint if exists ingredients_clean_price_check;
alter table public.ingredients drop constraint if exists ingredients_current_base_unit_cost_check;

do $$ begin
  if not exists (select 1 from pg_constraint
                 where conrelid = 'public.recipes'::regclass and conname = 'recipes_sku_unique') then
    alter table public.recipes add constraint recipes_sku_unique unique (sku);
  end if;
  if not exists (select 1 from pg_constraint
                 where conrelid = 'public.recipes'::regclass and conname = 'recipes_name_unique') then
    alter table public.recipes add constraint recipes_name_unique unique (name);
  end if;
end $$;

alter table public.ck_meat_tracking
  alter column protein_type set default 'Beef',
  alter column blended_cost_per_kg drop not null,
  alter column blended_cost_per_kg drop default,
  alter column created_at drop not null,
  alter column updated_at drop not null;

drop policy if exists "open_select_ck_meat_tracking" on public.ck_meat_tracking;
drop policy if exists "open_insert_ck_meat_tracking" on public.ck_meat_tracking;
drop policy if exists "open_update_ck_meat_tracking" on public.ck_meat_tracking;
drop policy if exists "open_delete_ck_meat_tracking" on public.ck_meat_tracking;

drop policy if exists "anon_select_ck_meat" on public.ck_meat_tracking;
create policy "anon_select_ck_meat" on public.ck_meat_tracking for select
  to anon, authenticated using (true);
drop policy if exists "anon_insert_ck_meat" on public.ck_meat_tracking;
create policy "anon_insert_ck_meat" on public.ck_meat_tracking for insert
  to anon, authenticated with check (true);
drop policy if exists "anon_update_ck_meat" on public.ck_meat_tracking;
create policy "anon_update_ck_meat" on public.ck_meat_tracking for update
  to anon, authenticated using (true) with check (true);
drop policy if exists "anon_delete_ck_meat" on public.ck_meat_tracking;
create policy "anon_delete_ck_meat" on public.ck_meat_tracking for delete
  to anon, authenticated using (true);

alter index if exists public.ck_meat_tracking_batch_date_idx
  rename to idx_ck_meat_tracking_batch_date;
create index if not exists idx_ck_meat_tracking_batch_date
  on public.ck_meat_tracking (batch_date desc);
create index if not exists idx_ck_meat_tracking_status
  on public.ck_meat_tracking (dispatch_status);
