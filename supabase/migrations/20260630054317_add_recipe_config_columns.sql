/*
# Add Recipe Configuration Columns

## Overview
Extends the existing `recipes` table with fields needed for the Recipe Builder's
profitability dashboard: category classification, target sale price, and expected yield percentage.

## Modified Tables

### recipes
- `category` (text, nullable) — Recipe category: 'Food', 'Beverage', or 'Custom Packaging'
- `target_sale_price` (numeric 18,2, nullable) — Target retail price in IDR for margin calculation
- `expected_yield_pct` (numeric 5,2, default 100) — Expected yield percentage after cooking loss (100 = no loss, 85 = 15% cooking loss)

## Important Notes
1. All new columns are nullable or have safe defaults so existing recipe data is preserved.
2. No destructive changes — purely additive ALTER TABLE statements.
3. No RLS changes needed — existing policies already cover the table.
*/

-- Add category column
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'recipes' AND column_name = 'category'
  ) THEN
    ALTER TABLE recipes ADD COLUMN category text;
  END IF;
END $$;

-- Add target_sale_price column
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'recipes' AND column_name = 'target_sale_price'
  ) THEN
    ALTER TABLE recipes ADD COLUMN target_sale_price numeric(18,2);
  END IF;
END $$;

-- Add expected_yield_pct column (default 100 = no loss)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'recipes' AND column_name = 'expected_yield_pct'
  ) THEN
    ALTER TABLE recipes ADD COLUMN expected_yield_pct numeric(5,2) DEFAULT 100;
  END IF;
END $$;
