/*
# daily_revenue — backfill missing table

The original Bolt project created `daily_revenue` outside the migration
history, but 20260628165345_multi_outlet_schema alters it and
20260628173235_open_rls_to_anon replaces its policies. This migration creates
it first so a fresh database can be built from migrations alone.

Columns match the DailyRevenue type in src/types/index.ts (outlet_id is added
by the multi-outlet migration). Policies here are replaced by the later
open_rls_to_anon migration.
*/

CREATE TABLE IF NOT EXISTS daily_revenue (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date        date NOT NULL,
  gross_sales numeric(18,2) NOT NULL DEFAULT 0,
  discounts   numeric(18,2) NOT NULL DEFAULT 0,
  net_sales   numeric(18,2) NOT NULL DEFAULT 0,
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS daily_revenue_date_idx ON daily_revenue(date DESC);

ALTER TABLE daily_revenue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_select_daily_revenue" ON daily_revenue;
CREATE POLICY "auth_select_daily_revenue" ON daily_revenue FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "auth_insert_daily_revenue" ON daily_revenue;
CREATE POLICY "auth_insert_daily_revenue" ON daily_revenue FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "auth_update_daily_revenue" ON daily_revenue;
CREATE POLICY "auth_update_daily_revenue" ON daily_revenue FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "auth_delete_daily_revenue" ON daily_revenue;
CREATE POLICY "auth_delete_daily_revenue" ON daily_revenue FOR DELETE TO authenticated USING (true);
