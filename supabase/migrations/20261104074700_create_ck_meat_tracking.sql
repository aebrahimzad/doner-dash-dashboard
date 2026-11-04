/*
# Create ck_meat_tracking table

Central Kitchen meat batch tracking, brought in line with the Bolt database
the 2026-11-04 data dump was taken from.

## New Tables
### ck_meat_tracking
One row per meat batch, following it through the kitchen phases:
- `batch_date` (timestamptz), `protein_type` (text, e.g. 'Beef', 'Chicken')
- Phase A `phase_a_raw_weight_kg` — raw weight received
- Phase B `phase_b_trimming_waste_kg` — trimming waste
- Phase F `phase_f_marinade_batch_id` (FK → recipes, the 'Prep Batch'
  marinade recipe) and `phase_f_marinade_cost`
- Phase C `phase_c_marinated_weight_kg` — weight after marinating
- Phase D `phase_d_spoilage_weight_kg` — spoilage
- Phase E `phase_e_dispatch_weight_kg` — weight dispatched to outlets
- `raw_cost_per_kg`, `blended_cost_per_kg` — cost before / after yield and marinade
- `dispatch_status` (text, default 'Draft'; e.g. 'Draft', 'Voided') and
  `dispatch_approved_at`
- `notes`, `created_at`, `updated_at`
- Void audit: `void_reason`, `void_justification`, `voided_at`

## Security
- RLS enabled with open anon + authenticated policies (matches existing pattern)

## Notes
1. Policies are dropped before being created so this migration is safe to
   re-run.
*/

create table if not exists public.ck_meat_tracking (
  id uuid primary key default gen_random_uuid(),
  batch_date timestamptz not null default now(),
  protein_type text not null,
  phase_a_raw_weight_kg numeric not null default 0,
  phase_b_trimming_waste_kg numeric not null default 0,
  phase_f_marinade_batch_id uuid references public.recipes(id) on delete set null,
  phase_f_marinade_cost numeric not null default 0,
  phase_c_marinated_weight_kg numeric not null default 0,
  phase_d_spoilage_weight_kg numeric not null default 0,
  phase_e_dispatch_weight_kg numeric not null default 0,
  raw_cost_per_kg numeric not null default 0,
  blended_cost_per_kg numeric not null default 0,
  dispatch_status text not null default 'Draft',
  dispatch_approved_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  void_reason text,
  void_justification text,
  voided_at timestamptz
);

create index if not exists ck_meat_tracking_batch_date_idx
  on public.ck_meat_tracking (batch_date desc);

alter table public.ck_meat_tracking enable row level security;

drop policy if exists "open_select_ck_meat_tracking" on public.ck_meat_tracking;
drop policy if exists "open_insert_ck_meat_tracking" on public.ck_meat_tracking;
drop policy if exists "open_update_ck_meat_tracking" on public.ck_meat_tracking;
drop policy if exists "open_delete_ck_meat_tracking" on public.ck_meat_tracking;

create policy "open_select_ck_meat_tracking" on public.ck_meat_tracking
  for select to anon, authenticated using (true);
create policy "open_insert_ck_meat_tracking" on public.ck_meat_tracking
  for insert to anon, authenticated with check (true);
create policy "open_update_ck_meat_tracking" on public.ck_meat_tracking
  for update to anon, authenticated using (true) with check (true);
create policy "open_delete_ck_meat_tracking" on public.ck_meat_tracking
  for delete to anon, authenticated using (true);
