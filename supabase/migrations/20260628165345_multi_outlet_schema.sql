/*
# Multi-Outlet Schema

## Summary
Adds the tables needed for multi-outlet operations and POS recipe depletion.

## New Tables

### outlets
Stores physical outlet / branch locations.
- id (uuid, PK)
- name (text, not null) — display name of the outlet
- address (text, nullable)
- created_at (timestamptz)

Two demo rows are seeded (Pondok Indah & BSD City) so the Location Selector
has data immediately.

### menu_items
Represents sellable products (e.g. "Test Döner Kebab").
- id (uuid, PK)
- name (text, not null)
- price (numeric, default 0)
- created_at (timestamptz)

### recipe_mappings
Bill-of-materials linking each menu_item to ingredients with quantities.
- id (uuid, PK)
- menu_item_id (uuid, FK → menu_items)
- ingredient_id (uuid, FK → ingredients)
- quantity (numeric, not null) — amount to deduct per sale
- unit (text, not null) — base unit matching the ingredient base_uom
- created_at (timestamptz)

### outlet_inventory
Per-outlet stock levels for ingredients. UNIQUE(outlet_id, ingredient_id)
ensures one row per ingredient per outlet; upserts update it cleanly.
- id (uuid, PK)
- outlet_id (uuid, FK → outlets)
- ingredient_id (uuid, FK → ingredients)
- quantity (numeric, not null, default 0) — current stock
- base_uom (text, not null) — mirrors ingredient base_uom
- updated_at (timestamptz)

## Modified Tables

### daily_revenue
Added nullable outlet_id column so new simulated records can be scoped to an
outlet while pre-existing rows (outlet_id IS NULL) remain valid.

### invoice_lines
Added nullable outlet_id column for the same reason.

## Security
RLS enabled on all four new tables. Four separate policies per table
(SELECT / INSERT / UPDATE / DELETE), all scoped to authenticated role
with USING(true) / WITH CHECK(true) because this is shared operational
data for the business (no per-row user ownership).

## Notes
1. outlet_id columns on daily_revenue and invoice_lines are nullable — no
   existing data is affected.
2. Using fixed UUIDs for the two seed outlets guarantees the INSERT is
   idempotent on re-run.
3. outlet_inventory has a UNIQUE constraint; use ON CONFLICT(outlet_id,
   ingredient_id) DO UPDATE when upserting stock.
*/

-- ── outlets ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS outlets (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text        NOT NULL,
  address    text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE outlets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_select_outlets" ON outlets;
CREATE POLICY "auth_select_outlets" ON outlets FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "auth_insert_outlets" ON outlets;
CREATE POLICY "auth_insert_outlets" ON outlets FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "auth_update_outlets" ON outlets;
CREATE POLICY "auth_update_outlets" ON outlets FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "auth_delete_outlets" ON outlets;
CREATE POLICY "auth_delete_outlets" ON outlets FOR DELETE TO authenticated USING (true);

-- Seed two demo outlets with stable UUIDs
INSERT INTO outlets (id, name, address) VALUES
  ('00000000-0000-0000-0001-000000000001', 'Outlet Pondok Indah',  'Jl. Metro Pondok Indah, Jakarta Selatan'),
  ('00000000-0000-0000-0001-000000000002', 'Outlet BSD City',      'BSD City Square, Tangerang Selatan')
ON CONFLICT (id) DO NOTHING;

-- ── menu_items ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS menu_items (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text        NOT NULL,
  price      numeric     NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE menu_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_select_menu_items" ON menu_items;
CREATE POLICY "auth_select_menu_items" ON menu_items FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "auth_insert_menu_items" ON menu_items;
CREATE POLICY "auth_insert_menu_items" ON menu_items FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "auth_update_menu_items" ON menu_items;
CREATE POLICY "auth_update_menu_items" ON menu_items FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "auth_delete_menu_items" ON menu_items;
CREATE POLICY "auth_delete_menu_items" ON menu_items FOR DELETE TO authenticated USING (true);

-- ── recipe_mappings ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS recipe_mappings (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  menu_item_id   uuid        NOT NULL REFERENCES menu_items(id)  ON DELETE CASCADE,
  ingredient_id  uuid        NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
  quantity       numeric     NOT NULL,
  unit           text        NOT NULL DEFAULT 'gram',
  created_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE recipe_mappings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_select_recipe_mappings" ON recipe_mappings;
CREATE POLICY "auth_select_recipe_mappings" ON recipe_mappings FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "auth_insert_recipe_mappings" ON recipe_mappings;
CREATE POLICY "auth_insert_recipe_mappings" ON recipe_mappings FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "auth_update_recipe_mappings" ON recipe_mappings;
CREATE POLICY "auth_update_recipe_mappings" ON recipe_mappings FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "auth_delete_recipe_mappings" ON recipe_mappings;
CREATE POLICY "auth_delete_recipe_mappings" ON recipe_mappings FOR DELETE TO authenticated USING (true);

-- ── outlet_inventory ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS outlet_inventory (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  outlet_id     uuid        NOT NULL REFERENCES outlets(id)     ON DELETE CASCADE,
  ingredient_id uuid        NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
  quantity      numeric     NOT NULL DEFAULT 0,
  base_uom      text        NOT NULL DEFAULT 'gram',
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (outlet_id, ingredient_id)
);

ALTER TABLE outlet_inventory ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_select_outlet_inventory" ON outlet_inventory;
CREATE POLICY "auth_select_outlet_inventory" ON outlet_inventory FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "auth_insert_outlet_inventory" ON outlet_inventory;
CREATE POLICY "auth_insert_outlet_inventory" ON outlet_inventory FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "auth_update_outlet_inventory" ON outlet_inventory;
CREATE POLICY "auth_update_outlet_inventory" ON outlet_inventory FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "auth_delete_outlet_inventory" ON outlet_inventory;
CREATE POLICY "auth_delete_outlet_inventory" ON outlet_inventory FOR DELETE TO authenticated USING (true);

-- ── Add outlet_id to daily_revenue ────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'daily_revenue' AND column_name = 'outlet_id'
  ) THEN
    ALTER TABLE daily_revenue ADD COLUMN outlet_id uuid REFERENCES outlets(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ── Add outlet_id to invoice_lines ────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoice_lines' AND column_name = 'outlet_id'
  ) THEN
    ALTER TABLE invoice_lines ADD COLUMN outlet_id uuid REFERENCES outlets(id) ON DELETE SET NULL;
  END IF;
END $$;
