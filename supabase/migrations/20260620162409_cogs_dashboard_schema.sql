/*
# COGS & Purchasing Master Dashboard — Initial Schema

## Overview
Single-tenant (no auth) schema for a food & beverage manufacturing facility's
cost-of-goods and purchasing management system.

## New Tables

### vendors
Approved supplier list. Referenced by invoice_lines.
- id (uuid PK)
- name (text, unique)
- created_at

### ingredients
Raw material master. Stores the current best-known base unit cost (per gram/ml/piece)
updated whenever a new invoice line is logged.
- id (uuid PK)
- name (text, unique)
- current_base_unit_cost (numeric 18,4) — kept in sync from invoice_lines
- base_uom (text) — default display unit
- created_at

### invoice_lines
Every purchase event. Stores both raw inputs and derived financial values.
- id (uuid PK)
- date (date)
- vendor_id → vendors
- item_id  → ingredients
- invoice_qty, invoice_uom
- total_invoice_price, freight_tax
- base_uom, conversion_multiplier
- total_landed_cost = total_invoice_price + freight_tax
- base_unit_cost (numeric 18,4) = total_landed_cost / (invoice_qty * conversion_multiplier)
- created_at

### broiler_yields
Calculated post-cook protein costs from the Vertical Broiler Yield module.
- id (uuid PK)
- name (user-given label)
- base_meat_id → ingredients
- ap_weight (grams), marinade_batch_cost (IDR), final_shaved_yield (grams)
- true_cost_per_gram (numeric 18,4)
- created_at

### recipes
Menu item / BOM header.
- id (uuid PK)
- name
- created_at

### recipe_items
Individual BOM lines. Each line references either a raw ingredient OR a broiler yield.
- id (uuid PK)
- recipe_id → recipes (CASCADE DELETE)
- ingredient_id → ingredients (nullable)
- broiler_yield_id → broiler_yields (nullable)
- quantity (numeric)
- unit_cost (numeric 18,4) — snapshot at time of add
- created_at

## Security
RLS enabled on all tables. Single-tenant anon+authenticated policies (USING true)
because this is a shared facility dashboard with no per-user isolation requirement.

## Seed Data
Vendors and Ingredients are seeded only when the tables are empty.
*/

-- ─── VENDORS ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS vendors (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL UNIQUE,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE vendors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "vendors_select" ON vendors;
CREATE POLICY "vendors_select" ON vendors FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "vendors_insert" ON vendors;
CREATE POLICY "vendors_insert" ON vendors FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "vendors_update" ON vendors;
CREATE POLICY "vendors_update" ON vendors FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "vendors_delete" ON vendors;
CREATE POLICY "vendors_delete" ON vendors FOR DELETE TO anon, authenticated USING (true);

-- ─── INGREDIENTS ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ingredients (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                   text NOT NULL UNIQUE,
  current_base_unit_cost numeric(18,4) NOT NULL DEFAULT 0,
  base_uom               text NOT NULL DEFAULT 'gram',
  created_at             timestamptz DEFAULT now()
);

ALTER TABLE ingredients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ingredients_select" ON ingredients;
CREATE POLICY "ingredients_select" ON ingredients FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "ingredients_insert" ON ingredients;
CREATE POLICY "ingredients_insert" ON ingredients FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "ingredients_update" ON ingredients;
CREATE POLICY "ingredients_update" ON ingredients FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "ingredients_delete" ON ingredients;
CREATE POLICY "ingredients_delete" ON ingredients FOR DELETE TO anon, authenticated USING (true);

-- ─── INVOICE LINES ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS invoice_lines (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date                  date NOT NULL,
  vendor_id             uuid NOT NULL REFERENCES vendors(id),
  item_id               uuid NOT NULL REFERENCES ingredients(id),
  invoice_qty           numeric(18,4) NOT NULL,
  invoice_uom           text NOT NULL,
  total_invoice_price   numeric(18,2) NOT NULL,
  freight_tax           numeric(18,2) NOT NULL DEFAULT 0,
  base_uom              text NOT NULL,
  conversion_multiplier numeric(18,4) NOT NULL,
  total_landed_cost     numeric(18,2) NOT NULL,
  base_unit_cost        numeric(18,4) NOT NULL,
  created_at            timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS invoice_lines_vendor_idx ON invoice_lines(vendor_id);
CREATE INDEX IF NOT EXISTS invoice_lines_item_idx   ON invoice_lines(item_id);
CREATE INDEX IF NOT EXISTS invoice_lines_date_idx   ON invoice_lines(date DESC);

ALTER TABLE invoice_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "invoice_lines_select" ON invoice_lines;
CREATE POLICY "invoice_lines_select" ON invoice_lines FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "invoice_lines_insert" ON invoice_lines;
CREATE POLICY "invoice_lines_insert" ON invoice_lines FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "invoice_lines_update" ON invoice_lines;
CREATE POLICY "invoice_lines_update" ON invoice_lines FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "invoice_lines_delete" ON invoice_lines;
CREATE POLICY "invoice_lines_delete" ON invoice_lines FOR DELETE TO anon, authenticated USING (true);

-- ─── BROILER YIELDS ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS broiler_yields (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                text NOT NULL,
  base_meat_id        uuid NOT NULL REFERENCES ingredients(id),
  ap_weight           numeric(18,4) NOT NULL,
  marinade_batch_cost numeric(18,2) NOT NULL DEFAULT 0,
  final_shaved_yield  numeric(18,4) NOT NULL,
  true_cost_per_gram  numeric(18,4) NOT NULL,
  created_at          timestamptz DEFAULT now()
);

ALTER TABLE broiler_yields ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "broiler_yields_select" ON broiler_yields;
CREATE POLICY "broiler_yields_select" ON broiler_yields FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "broiler_yields_insert" ON broiler_yields;
CREATE POLICY "broiler_yields_insert" ON broiler_yields FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "broiler_yields_update" ON broiler_yields;
CREATE POLICY "broiler_yields_update" ON broiler_yields FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "broiler_yields_delete" ON broiler_yields;
CREATE POLICY "broiler_yields_delete" ON broiler_yields FOR DELETE TO anon, authenticated USING (true);

-- ─── RECIPES ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS recipes (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE recipes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "recipes_select" ON recipes;
CREATE POLICY "recipes_select" ON recipes FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "recipes_insert" ON recipes;
CREATE POLICY "recipes_insert" ON recipes FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "recipes_update" ON recipes;
CREATE POLICY "recipes_update" ON recipes FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "recipes_delete" ON recipes;
CREATE POLICY "recipes_delete" ON recipes FOR DELETE TO anon, authenticated USING (true);

-- ─── RECIPE ITEMS ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS recipe_items (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id        uuid NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  ingredient_id    uuid REFERENCES ingredients(id),
  broiler_yield_id uuid REFERENCES broiler_yields(id),
  quantity         numeric(18,4) NOT NULL,
  unit_cost        numeric(18,4) NOT NULL,
  created_at       timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS recipe_items_recipe_idx ON recipe_items(recipe_id);

ALTER TABLE recipe_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "recipe_items_select" ON recipe_items;
CREATE POLICY "recipe_items_select" ON recipe_items FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "recipe_items_insert" ON recipe_items;
CREATE POLICY "recipe_items_insert" ON recipe_items FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "recipe_items_update" ON recipe_items;
CREATE POLICY "recipe_items_update" ON recipe_items FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "recipe_items_delete" ON recipe_items;
CREATE POLICY "recipe_items_delete" ON recipe_items FOR DELETE TO anon, authenticated USING (true);

-- ─── SEED DATA ───────────────────────────────────────────────────────────────

INSERT INTO vendors (name)
SELECT name FROM (VALUES
  ('PT Meat Supplier'),
  ('Bali Fresh Produce'),
  ('Packaging Co.')
) AS v(name)
WHERE NOT EXISTS (SELECT 1 FROM vendors LIMIT 1);

INSERT INTO ingredients (name, base_uom)
SELECT name, base_uom FROM (VALUES
  ('Raw Beef (Trimmed)',     'gram'),
  ('Raw Chicken (Trimmed)', 'gram'),
  ('Kentang Tes Potatoes',  'gram'),
  ('Premium Cassava Flour', 'gram'),
  ('Tapioca Starch',        'gram'),
  ('Psyllium Husk Powder',  'gram'),
  ('Active Dry Yeast',      'gram')
) AS i(name, base_uom)
WHERE NOT EXISTS (SELECT 1 FROM ingredients LIMIT 1);
