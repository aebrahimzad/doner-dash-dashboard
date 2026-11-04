/*
# Toll Manufacturing Orders — Module 5

## Overview
Tracks the full cycle of an external toll-manufacturing run:
outbound raw-material transfer → WIP-at-bakery → inbound finished-goods receipt.

## New Tables

### toll_manufacturing_orders
One row = one manufacturing lot from outbound shipment through receipt.

Outbound fields (set on creation):
- ingredient_id  → the raw ingredient (e.g. Proprietary Dry Matrix Part A)
- grams_sent     — quantity dispatched in grams
- part_a_unit_cost — snapshot of ingredient's base_unit_cost at dispatch time (IDR/gram)
- part_a_batch_cost — grams_sent × part_a_unit_cost (pre-calculated for audit trail)
- outbound_date, notes
- status: 'wip' on creation

Inbound fields (populated on receive):
- product_name        — finished product label (e.g. "The Cylinder")
- product_uom         — unit of measure for finished goods (default 'piece')
- units_received      — quantity of finished units
- bakery_labor_cost   — toll manufacturer's processing invoice (IDR)
- logistics_cost      — inbound delivery cost (IDR)
- total_burdened_cost — Part A batch cost + bakery labor + logistics
- cost_per_unit       — total_burdened_cost / units_received (4 decimal places)
- finished_ingredient_id → references the ingredients row created/updated for this SKU
- inbound_date
- status: 'received' after update

## Security
RLS enabled. Single-tenant anon + authenticated policies (no auth required).
*/

CREATE TABLE IF NOT EXISTS toll_manufacturing_orders (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ingredient_id         uuid NOT NULL REFERENCES ingredients(id),
  grams_sent            numeric(18,4) NOT NULL,
  part_a_unit_cost      numeric(18,4) NOT NULL,
  part_a_batch_cost     numeric(18,2) NOT NULL,
  status                text NOT NULL DEFAULT 'wip',
  product_name          text,
  product_uom           text,
  units_received        numeric(18,4),
  bakery_labor_cost     numeric(18,2),
  logistics_cost        numeric(18,2),
  total_burdened_cost   numeric(18,2),
  cost_per_unit         numeric(18,4),
  finished_ingredient_id uuid REFERENCES ingredients(id),
  outbound_date         date NOT NULL DEFAULT CURRENT_DATE,
  inbound_date          date,
  notes                 text,
  created_at            timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tmo_status_idx ON toll_manufacturing_orders(status);
CREATE INDEX IF NOT EXISTS tmo_ingredient_idx ON toll_manufacturing_orders(ingredient_id);

ALTER TABLE toll_manufacturing_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tmo_select" ON toll_manufacturing_orders;
CREATE POLICY "tmo_select" ON toll_manufacturing_orders FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "tmo_insert" ON toll_manufacturing_orders;
CREATE POLICY "tmo_insert" ON toll_manufacturing_orders FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "tmo_update" ON toll_manufacturing_orders;
CREATE POLICY "tmo_update" ON toll_manufacturing_orders FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "tmo_delete" ON toll_manufacturing_orders;
CREATE POLICY "tmo_delete" ON toll_manufacturing_orders FOR DELETE
  TO anon, authenticated USING (true);
