/*
# Bypass auth — open all tables to anon + authenticated

All RLS policies previously required the `authenticated` role, which means
the Supabase anon-key client gets no data when there is no active JWT session.
This migration drops every existing policy on every application table and
recreates them as `TO anon, authenticated` so the public anon key (used by
the no-auth app build) can read and write freely.

USING(true) / WITH CHECK(true) is the correct pattern for shared operational
data with no per-row user ownership (matching the existing policy intent,
just widened to the anon role).
*/

-- ── helpers ───────────────────────────────────────────────────────────────────
-- One macro-style block per table: drop all policies then add 4 new ones.
-- Using DROP POLICY IF EXISTS so the migration is idempotent.

-- ── vendors ──────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "select_vendors"          ON vendors;
DROP POLICY IF EXISTS "insert_vendors"          ON vendors;
DROP POLICY IF EXISTS "update_vendors"          ON vendors;
DROP POLICY IF EXISTS "delete_vendors"          ON vendors;
DROP POLICY IF EXISTS "auth_select_vendors"     ON vendors;
DROP POLICY IF EXISTS "auth_insert_vendors"     ON vendors;
DROP POLICY IF EXISTS "auth_update_vendors"     ON vendors;
DROP POLICY IF EXISTS "auth_delete_vendors"     ON vendors;

CREATE POLICY "open_select_vendors" ON vendors FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "open_insert_vendors" ON vendors FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "open_update_vendors" ON vendors FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "open_delete_vendors" ON vendors FOR DELETE TO anon, authenticated USING (true);

-- ── ingredients ───────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "select_ingredients"       ON ingredients;
DROP POLICY IF EXISTS "insert_ingredients"       ON ingredients;
DROP POLICY IF EXISTS "update_ingredients"       ON ingredients;
DROP POLICY IF EXISTS "delete_ingredients"       ON ingredients;
DROP POLICY IF EXISTS "auth_select_ingredients"  ON ingredients;
DROP POLICY IF EXISTS "auth_insert_ingredients"  ON ingredients;
DROP POLICY IF EXISTS "auth_update_ingredients"  ON ingredients;
DROP POLICY IF EXISTS "auth_delete_ingredients"  ON ingredients;

CREATE POLICY "open_select_ingredients" ON ingredients FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "open_insert_ingredients" ON ingredients FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "open_update_ingredients" ON ingredients FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "open_delete_ingredients" ON ingredients FOR DELETE TO anon, authenticated USING (true);

-- ── invoice_lines ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "select_invoice_lines"      ON invoice_lines;
DROP POLICY IF EXISTS "insert_invoice_lines"      ON invoice_lines;
DROP POLICY IF EXISTS "update_invoice_lines"      ON invoice_lines;
DROP POLICY IF EXISTS "delete_invoice_lines"      ON invoice_lines;
DROP POLICY IF EXISTS "auth_select_invoice_lines" ON invoice_lines;
DROP POLICY IF EXISTS "auth_insert_invoice_lines" ON invoice_lines;
DROP POLICY IF EXISTS "auth_update_invoice_lines" ON invoice_lines;
DROP POLICY IF EXISTS "auth_delete_invoice_lines" ON invoice_lines;

CREATE POLICY "open_select_invoice_lines" ON invoice_lines FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "open_insert_invoice_lines" ON invoice_lines FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "open_update_invoice_lines" ON invoice_lines FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "open_delete_invoice_lines" ON invoice_lines FOR DELETE TO anon, authenticated USING (true);

-- ── broiler_yields ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "select_broiler_yields"      ON broiler_yields;
DROP POLICY IF EXISTS "insert_broiler_yields"      ON broiler_yields;
DROP POLICY IF EXISTS "update_broiler_yields"      ON broiler_yields;
DROP POLICY IF EXISTS "delete_broiler_yields"      ON broiler_yields;
DROP POLICY IF EXISTS "auth_select_broiler_yields" ON broiler_yields;
DROP POLICY IF EXISTS "auth_insert_broiler_yields" ON broiler_yields;
DROP POLICY IF EXISTS "auth_update_broiler_yields" ON broiler_yields;
DROP POLICY IF EXISTS "auth_delete_broiler_yields" ON broiler_yields;

CREATE POLICY "open_select_broiler_yields" ON broiler_yields FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "open_insert_broiler_yields" ON broiler_yields FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "open_update_broiler_yields" ON broiler_yields FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "open_delete_broiler_yields" ON broiler_yields FOR DELETE TO anon, authenticated USING (true);

-- ── recipes ───────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "select_recipes"       ON recipes;
DROP POLICY IF EXISTS "insert_recipes"       ON recipes;
DROP POLICY IF EXISTS "update_recipes"       ON recipes;
DROP POLICY IF EXISTS "delete_recipes"       ON recipes;
DROP POLICY IF EXISTS "auth_select_recipes"  ON recipes;
DROP POLICY IF EXISTS "auth_insert_recipes"  ON recipes;
DROP POLICY IF EXISTS "auth_update_recipes"  ON recipes;
DROP POLICY IF EXISTS "auth_delete_recipes"  ON recipes;

CREATE POLICY "open_select_recipes" ON recipes FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "open_insert_recipes" ON recipes FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "open_update_recipes" ON recipes FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "open_delete_recipes" ON recipes FOR DELETE TO anon, authenticated USING (true);

-- ── recipe_items ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "select_recipe_items"       ON recipe_items;
DROP POLICY IF EXISTS "insert_recipe_items"       ON recipe_items;
DROP POLICY IF EXISTS "update_recipe_items"       ON recipe_items;
DROP POLICY IF EXISTS "delete_recipe_items"       ON recipe_items;
DROP POLICY IF EXISTS "auth_select_recipe_items"  ON recipe_items;
DROP POLICY IF EXISTS "auth_insert_recipe_items"  ON recipe_items;
DROP POLICY IF EXISTS "auth_update_recipe_items"  ON recipe_items;
DROP POLICY IF EXISTS "auth_delete_recipe_items"  ON recipe_items;

CREATE POLICY "open_select_recipe_items" ON recipe_items FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "open_insert_recipe_items" ON recipe_items FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "open_update_recipe_items" ON recipe_items FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "open_delete_recipe_items" ON recipe_items FOR DELETE TO anon, authenticated USING (true);

-- ── toll_manufacturing_orders ─────────────────────────────────────────────────
DROP POLICY IF EXISTS "select_tmo"       ON toll_manufacturing_orders;
DROP POLICY IF EXISTS "insert_tmo"       ON toll_manufacturing_orders;
DROP POLICY IF EXISTS "update_tmo"       ON toll_manufacturing_orders;
DROP POLICY IF EXISTS "delete_tmo"       ON toll_manufacturing_orders;
DROP POLICY IF EXISTS "auth_select_tmo"  ON toll_manufacturing_orders;
DROP POLICY IF EXISTS "auth_insert_tmo"  ON toll_manufacturing_orders;
DROP POLICY IF EXISTS "auth_update_tmo"  ON toll_manufacturing_orders;
DROP POLICY IF EXISTS "auth_delete_tmo"  ON toll_manufacturing_orders;
DROP POLICY IF EXISTS "select_toll_manufacturing_orders"      ON toll_manufacturing_orders;
DROP POLICY IF EXISTS "insert_toll_manufacturing_orders"      ON toll_manufacturing_orders;
DROP POLICY IF EXISTS "update_toll_manufacturing_orders"      ON toll_manufacturing_orders;
DROP POLICY IF EXISTS "delete_toll_manufacturing_orders"      ON toll_manufacturing_orders;
DROP POLICY IF EXISTS "auth_select_toll_manufacturing_orders" ON toll_manufacturing_orders;
DROP POLICY IF EXISTS "auth_insert_toll_manufacturing_orders" ON toll_manufacturing_orders;
DROP POLICY IF EXISTS "auth_update_toll_manufacturing_orders" ON toll_manufacturing_orders;
DROP POLICY IF EXISTS "auth_delete_toll_manufacturing_orders" ON toll_manufacturing_orders;

CREATE POLICY "open_select_tmo" ON toll_manufacturing_orders FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "open_insert_tmo" ON toll_manufacturing_orders FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "open_update_tmo" ON toll_manufacturing_orders FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "open_delete_tmo" ON toll_manufacturing_orders FOR DELETE TO anon, authenticated USING (true);

-- ── daily_revenue ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "select_daily_revenue"       ON daily_revenue;
DROP POLICY IF EXISTS "insert_daily_revenue"       ON daily_revenue;
DROP POLICY IF EXISTS "update_daily_revenue"       ON daily_revenue;
DROP POLICY IF EXISTS "delete_daily_revenue"       ON daily_revenue;
DROP POLICY IF EXISTS "auth_select_daily_revenue"  ON daily_revenue;
DROP POLICY IF EXISTS "auth_insert_daily_revenue"  ON daily_revenue;
DROP POLICY IF EXISTS "auth_update_daily_revenue"  ON daily_revenue;
DROP POLICY IF EXISTS "auth_delete_daily_revenue"  ON daily_revenue;

CREATE POLICY "open_select_daily_revenue" ON daily_revenue FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "open_insert_daily_revenue" ON daily_revenue FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "open_update_daily_revenue" ON daily_revenue FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "open_delete_daily_revenue" ON daily_revenue FOR DELETE TO anon, authenticated USING (true);

-- ── outlets ───────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "auth_select_outlets"  ON outlets;
DROP POLICY IF EXISTS "auth_insert_outlets"  ON outlets;
DROP POLICY IF EXISTS "auth_update_outlets"  ON outlets;
DROP POLICY IF EXISTS "auth_delete_outlets"  ON outlets;

CREATE POLICY "open_select_outlets" ON outlets FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "open_insert_outlets" ON outlets FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "open_update_outlets" ON outlets FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "open_delete_outlets" ON outlets FOR DELETE TO anon, authenticated USING (true);

-- ── menu_items ────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "auth_select_menu_items"  ON menu_items;
DROP POLICY IF EXISTS "auth_insert_menu_items"  ON menu_items;
DROP POLICY IF EXISTS "auth_update_menu_items"  ON menu_items;
DROP POLICY IF EXISTS "auth_delete_menu_items"  ON menu_items;

CREATE POLICY "open_select_menu_items" ON menu_items FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "open_insert_menu_items" ON menu_items FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "open_update_menu_items" ON menu_items FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "open_delete_menu_items" ON menu_items FOR DELETE TO anon, authenticated USING (true);

-- ── recipe_mappings ───────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "auth_select_recipe_mappings"  ON recipe_mappings;
DROP POLICY IF EXISTS "auth_insert_recipe_mappings"  ON recipe_mappings;
DROP POLICY IF EXISTS "auth_update_recipe_mappings"  ON recipe_mappings;
DROP POLICY IF EXISTS "auth_delete_recipe_mappings"  ON recipe_mappings;

CREATE POLICY "open_select_recipe_mappings" ON recipe_mappings FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "open_insert_recipe_mappings" ON recipe_mappings FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "open_update_recipe_mappings" ON recipe_mappings FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "open_delete_recipe_mappings" ON recipe_mappings FOR DELETE TO anon, authenticated USING (true);

-- ── outlet_inventory ──────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "auth_select_outlet_inventory"  ON outlet_inventory;
DROP POLICY IF EXISTS "auth_insert_outlet_inventory"  ON outlet_inventory;
DROP POLICY IF EXISTS "auth_update_outlet_inventory"  ON outlet_inventory;
DROP POLICY IF EXISTS "auth_delete_outlet_inventory"  ON outlet_inventory;

CREATE POLICY "open_select_outlet_inventory" ON outlet_inventory FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "open_insert_outlet_inventory" ON outlet_inventory FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "open_update_outlet_inventory" ON outlet_inventory FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "open_delete_outlet_inventory" ON outlet_inventory FOR DELETE TO anon, authenticated USING (true);
