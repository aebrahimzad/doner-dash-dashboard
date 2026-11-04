/*
# Lock All Tables to Authenticated Users Only

## Overview
Previously all tables used `TO anon, authenticated` policies (open to unauthenticated
clients). This migration replaces every policy with `TO authenticated` only, so the
anon-key without a valid session can no longer read or write any data.

## Tables Modified
- vendors
- ingredients
- invoice_lines
- broiler_yields
- recipes
- recipe_items
- toll_manufacturing_orders

## Security Changes
All SELECT / INSERT / UPDATE / DELETE policies are dropped and recreated restricted
to the `authenticated` role. Unauthenticated requests will receive zero rows on
SELECT and a policy violation error on writes.

## Important Notes
1. A sign-in UI must be live in the frontend before this migration is useful —
   the anon client has no session and will be locked out of everything.
2. This is a shared-facility single-tenant system; all authenticated users have
   full CRUD access to all rows. No per-user row isolation is applied.
3. Policies use USING (true) / WITH CHECK (true) because the isolation is at the
   session level (must be logged in), not at the row level (all rows are shared).
*/

-- ─── VENDORS ────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "vendors_select" ON vendors;
CREATE POLICY "vendors_select" ON vendors FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "vendors_insert" ON vendors;
CREATE POLICY "vendors_insert" ON vendors FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "vendors_update" ON vendors;
CREATE POLICY "vendors_update" ON vendors FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "vendors_delete" ON vendors;
CREATE POLICY "vendors_delete" ON vendors FOR DELETE TO authenticated USING (true);

-- ─── INGREDIENTS ─────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "ingredients_select" ON ingredients;
CREATE POLICY "ingredients_select" ON ingredients FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "ingredients_insert" ON ingredients;
CREATE POLICY "ingredients_insert" ON ingredients FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "ingredients_update" ON ingredients;
CREATE POLICY "ingredients_update" ON ingredients FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "ingredients_delete" ON ingredients;
CREATE POLICY "ingredients_delete" ON ingredients FOR DELETE TO authenticated USING (true);

-- ─── INVOICE LINES ───────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "invoice_lines_select" ON invoice_lines;
CREATE POLICY "invoice_lines_select" ON invoice_lines FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "invoice_lines_insert" ON invoice_lines;
CREATE POLICY "invoice_lines_insert" ON invoice_lines FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "invoice_lines_update" ON invoice_lines;
CREATE POLICY "invoice_lines_update" ON invoice_lines FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "invoice_lines_delete" ON invoice_lines;
CREATE POLICY "invoice_lines_delete" ON invoice_lines FOR DELETE TO authenticated USING (true);

-- ─── BROILER YIELDS ──────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "broiler_yields_select" ON broiler_yields;
CREATE POLICY "broiler_yields_select" ON broiler_yields FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "broiler_yields_insert" ON broiler_yields;
CREATE POLICY "broiler_yields_insert" ON broiler_yields FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "broiler_yields_update" ON broiler_yields;
CREATE POLICY "broiler_yields_update" ON broiler_yields FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "broiler_yields_delete" ON broiler_yields;
CREATE POLICY "broiler_yields_delete" ON broiler_yields FOR DELETE TO authenticated USING (true);

-- ─── RECIPES ─────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "recipes_select" ON recipes;
CREATE POLICY "recipes_select" ON recipes FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "recipes_insert" ON recipes;
CREATE POLICY "recipes_insert" ON recipes FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "recipes_update" ON recipes;
CREATE POLICY "recipes_update" ON recipes FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "recipes_delete" ON recipes;
CREATE POLICY "recipes_delete" ON recipes FOR DELETE TO authenticated USING (true);

-- ─── RECIPE ITEMS ────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "recipe_items_select" ON recipe_items;
CREATE POLICY "recipe_items_select" ON recipe_items FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "recipe_items_insert" ON recipe_items;
CREATE POLICY "recipe_items_insert" ON recipe_items FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "recipe_items_update" ON recipe_items;
CREATE POLICY "recipe_items_update" ON recipe_items FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "recipe_items_delete" ON recipe_items;
CREATE POLICY "recipe_items_delete" ON recipe_items FOR DELETE TO authenticated USING (true);

-- ─── TOLL MANUFACTURING ORDERS ───────────────────────────────────────────────

DROP POLICY IF EXISTS "tmo_select" ON toll_manufacturing_orders;
CREATE POLICY "tmo_select" ON toll_manufacturing_orders FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "tmo_insert" ON toll_manufacturing_orders;
CREATE POLICY "tmo_insert" ON toll_manufacturing_orders FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "tmo_update" ON toll_manufacturing_orders;
CREATE POLICY "tmo_update" ON toll_manufacturing_orders FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "tmo_delete" ON toll_manufacturing_orders;
CREATE POLICY "tmo_delete" ON toll_manufacturing_orders FOR DELETE TO authenticated USING (true);
