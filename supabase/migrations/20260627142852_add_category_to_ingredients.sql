/*
# Add category column to ingredients table

## Summary
Adds an optional free-text `category` column to the existing `ingredients` table so
ingredients can be organised into logical groups (e.g. Meat, Produce, Dry Goods, Packaging).

## Changes

### Modified tables
- `ingredients`
  - New column: `category` (text, nullable, no default)
    Stores the human-readable category name.  NULL means "uncategorised".

## Notes
- Column is nullable — all existing rows remain valid with category = NULL.
- No RLS changes required; existing policies already cover all columns on this table.
- Statement is idempotent via `IF NOT EXISTS` guard.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ingredients' AND column_name = 'category'
  ) THEN
    ALTER TABLE ingredients ADD COLUMN category TEXT;
  END IF;
END $$;
