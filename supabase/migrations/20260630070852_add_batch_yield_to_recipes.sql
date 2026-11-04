/*
# Add Batch Yield Configuration to Recipes

## Overview
Adds fields to support "Prep Batch" recipes that produce a finished ingredient
(e.g., a large batch of signature sauce) which can then be used as a single
line item in other recipes (nested BOM / sub-recipe pattern).

## Modified Tables

### recipes
- `batch_yield_qty` (numeric 18,4, nullable) — Total output quantity of the finished batch (e.g., 5000 for a 5kg sauce batch)
- `batch_yield_uom` (text, nullable) — Unit of measure for the batch output (gram, ml, or piece)

## Important Notes
1. These columns are only relevant when category = 'Prep Batch'.
2. Purely additive — no existing data affected.
3. No RLS changes needed — existing policies cover the table.
*/

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'recipes' AND column_name = 'batch_yield_qty'
  ) THEN
    ALTER TABLE recipes ADD COLUMN batch_yield_qty numeric(18,4);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'recipes' AND column_name = 'batch_yield_uom'
  ) THEN
    ALTER TABLE recipes ADD COLUMN batch_yield_uom text;
  END IF;
END $$;
