export interface TollOrder {
  id: string;
  ingredient_id: string;
  grams_sent: number;
  part_a_unit_cost: number;
  part_a_batch_cost: number;
  status: 'wip' | 'received';
  product_name: string | null;
  product_uom: string | null;
  units_received: number | null;
  bakery_labor_cost: number | null;
  logistics_cost: number | null;
  total_burdened_cost: number | null;
  cost_per_unit: number | null;
  finished_ingredient_id: string | null;
  outbound_date: string;
  inbound_date: string | null;
  notes: string | null;
  created_at: string;
  ingredient?: { id: string; name: string };
  finished_ingredient?: { id: string; name: string; current_base_unit_cost: number };
}

export interface OutboundFormState {
  ingredient_id: string;
  grams_sent: string;
  outbound_date: string;
  notes: string;
}

export interface ReceiveFormState {
  product_name: string;
  product_uom: string;
  units_received: string;
  bakery_labor_cost: string;
  logistics_cost: string;
  inbound_date: string;
}
