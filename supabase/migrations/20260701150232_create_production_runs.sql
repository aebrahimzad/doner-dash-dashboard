/*
# Create production_runs table for Dynamic Batch Scaling

## Overview
Logs every production batch execution performed by the kitchen team.
When a batch is "run", this table records: which recipe was used, what multiplier
was applied, the total output weight, and a timestamp. This provides a full
audit trail of production activity and enables historical reporting.

## New Tables

### production_runs
- `id` (uuid, primary key) — unique identifier for each production run
- `recipe_id` (uuid, FK → recipes) — the Prep Batch recipe used as template
- `recipe_name` (text) — denormalized recipe name for easy display
- `anchor_ingredient_id` (uuid, FK → ingredients) — the ingredient used as scaling anchor
- `anchor_original_qty` (numeric 18,4) — original recipe quantity of the anchor
- `anchor_actual_qty` (numeric 18,4) — actual weight input by the user
- `multiplier` (numeric 18,6) — scaling factor (actual / original)
- `total_output_qty` (numeric 18,4) — total output weight of the batch
- `output_uom` (text) — unit of measure for the output
- `outlet_id` (uuid, FK → outlets) — outlet where production occurred (Central Kitchen)
- `executed_at` (timestamptz) — when the batch was executed
- `created_at` (timestamptz) — record creation time

## Security
- RLS enabled with open anon + authenticated policies (matches existing pattern)

## Notes
1. Uses denormalized recipe_name so production history remains readable even if recipe is renamed/deleted.
2. multiplier stored at 6 decimal places for precision in small-batch scaling.
3. Foreign keys use NO ACTION on delete to prevent accidental data loss.
*/

CREATE TABLE IF NOT EXISTS production_runs (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id             uuid        NOT NULL REFERENCES recipes(id),
  recipe_name           text        NOT NULL,
  anchor_ingredient_id  uuid        REFERENCES ingredients(id),
  anchor_original_qty   numeric(18,4) NOT NULL,
  anchor_actual_qty     numeric(18,4) NOT NULL,
  multiplier            numeric(18,6) NOT NULL,
  total_output_qty      numeric(18,4) NOT NULL,
  output_uom            text        NOT NULL DEFAULT 'gram',
  outlet_id             uuid        NOT NULL REFERENCES outlets(id),
  executed_at           timestamptz NOT NULL DEFAULT now(),
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS production_runs_recipe_idx ON production_runs(recipe_id);
CREATE INDEX IF NOT EXISTS production_runs_executed_at_idx ON production_runs(executed_at DESC);

ALTER TABLE production_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "open_select_production_runs" ON production_runs;
CREATE POLICY "open_select_production_runs" ON production_runs FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "open_insert_production_runs" ON production_runs;
CREATE POLICY "open_insert_production_runs" ON production_runs FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "open_update_production_runs" ON production_runs;
CREATE POLICY "open_update_production_runs" ON production_runs FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "open_delete_production_runs" ON production_runs;
CREATE POLICY "open_delete_production_runs" ON production_runs FOR DELETE
  TO anon, authenticated USING (true);
