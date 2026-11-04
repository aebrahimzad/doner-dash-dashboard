/*
# Hub-and-Spoke Schema

## Summary
- Seeds "Central Kitchen" as the hub outlet (UUID 00000000-0000-0000-0001-000000000000)
- Creates internal_transfers — records every stock movement from Central Kitchen to a retail outlet
- Creates outlet_cogs_entries — logs the burdened COGS recognised by the receiving retail outlet
  on each transfer

## Design Decisions
- from_outlet_id is technically a free FK (any outlet can be a source) but the app always populates
  it with the Central Kitchen ID.  Keeping it generic avoids needing a constraint that would be
  awkward to maintain if the hub ever changes.
- burdened_cost_per_unit is stored at transfer time (snapshot) so historical COGS are immutable
  even if future toll manufacturing runs produce a different cost_per_unit.
- outlet_cogs_entries is intentionally simple – one row per transfer line.  Aggregating by outlet_id
  + entry_date gives per-outlet daily COGS without a materialised view.
*/

-- ── Central Kitchen outlet ────────────────────────────────────────────────────

INSERT INTO outlets (id, name, address) VALUES
  ('00000000-0000-0000-0001-000000000000', 'Central Kitchen', 'Production Hub – Internal Cost Centre')
ON CONFLICT (id) DO NOTHING;

-- ── internal_transfers ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS internal_transfers (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  from_outlet_id        uuid        NOT NULL REFERENCES outlets(id)     ON DELETE RESTRICT,
  to_outlet_id          uuid        NOT NULL REFERENCES outlets(id)     ON DELETE RESTRICT,
  ingredient_id         uuid        NOT NULL REFERENCES ingredients(id) ON DELETE RESTRICT,
  quantity              numeric     NOT NULL CHECK (quantity > 0),
  unit                  text        NOT NULL DEFAULT 'piece',
  burdened_cost_per_unit numeric    NOT NULL CHECK (burdened_cost_per_unit >= 0),
  total_cost            numeric     NOT NULL CHECK (total_cost >= 0),
  transfer_date         date        NOT NULL DEFAULT CURRENT_DATE,
  notes                 text,
  created_at            timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE internal_transfers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "open_select_internal_transfers" ON internal_transfers
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "open_insert_internal_transfers" ON internal_transfers
  FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "open_update_internal_transfers" ON internal_transfers
  FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "open_delete_internal_transfers" ON internal_transfers
  FOR DELETE TO anon, authenticated USING (true);

-- ── outlet_cogs_entries ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS outlet_cogs_entries (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  outlet_id     uuid        NOT NULL REFERENCES outlets(id)           ON DELETE CASCADE,
  transfer_id   uuid        NOT NULL REFERENCES internal_transfers(id) ON DELETE CASCADE,
  ingredient_id uuid        NOT NULL REFERENCES ingredients(id)       ON DELETE RESTRICT,
  quantity      numeric     NOT NULL,
  cost_per_unit numeric     NOT NULL,
  total_cost    numeric     NOT NULL,
  entry_date    date        NOT NULL DEFAULT CURRENT_DATE,
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE outlet_cogs_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "open_select_outlet_cogs_entries" ON outlet_cogs_entries
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "open_insert_outlet_cogs_entries" ON outlet_cogs_entries
  FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "open_update_outlet_cogs_entries" ON outlet_cogs_entries
  FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "open_delete_outlet_cogs_entries" ON outlet_cogs_entries
  FOR DELETE TO anon, authenticated USING (true);
