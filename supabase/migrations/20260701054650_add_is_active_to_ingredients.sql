/*
# Add soft-delete (is_active) column to ingredients

## Overview
Adds a boolean `is_active` column to the `ingredients` table to support soft deletion
(archiving) instead of hard deletes, which fail due to foreign key constraints from
`recipe_items` and `invoice_lines`.

## Changes
- `ingredients.is_active` (boolean, NOT NULL, default true)
  - When false, the ingredient is considered "archived" and should be hidden from
    dropdowns in Recipe Builder and Invoice Capture.
  - Existing ingredients all default to active.

## Security
- No RLS changes needed; existing policies cover the new column.

## Notes
1. No data is deleted or altered — purely additive change.
2. Frontend filters by `is_active = true` in selection dropdowns but shows all
   ingredients (including archived) in the Data Management master list.
*/

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ingredients' AND column_name = 'is_active'
  ) THEN
    ALTER TABLE ingredients ADD COLUMN is_active boolean NOT NULL DEFAULT true;
  END IF;
END $$;
