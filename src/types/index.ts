export interface Vendor {
  id: string;
  name: string;
  created_at: string;
}

export interface Ingredient {
  id: string;
  name: string;
  category: string | null;
  current_base_unit_cost: number;
  base_uom: string;
  is_active: boolean;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  created_at: string;
}

export interface InvoiceLine {
  id: string;
  date: string;
  vendor_id: string;
  item_id: string;
  invoice_qty: number;
  invoice_uom: string;
  total_invoice_price: number;
  freight_tax: number;
  base_uom: string;
  conversion_multiplier: number;
  total_landed_cost: number;
  base_unit_cost: number;
  created_at: string;
  vendor?: Vendor;
  ingredient?: Ingredient;
}

export interface BroilerYield {
  id: string;
  name: string;
  base_meat_id: string;
  ap_weight: number;
  marinade_batch_cost: number;
  final_shaved_yield: number;
  true_cost_per_gram: number;
  created_at: string;
  base_meat?: Ingredient;
}

export const RECIPE_CATEGORIES = ['Food', 'Beverage', 'Custom Packaging', 'Prep Batch'] as const;
export type RecipeCategory = typeof RECIPE_CATEGORIES[number];

export interface Recipe {
  id: string;
  name: string;
  sku: string | null;
  iseller_sku: string | null;
  category: RecipeCategory | null;
  target_sale_price: number | null;
  expected_yield_pct: number | null;
  batch_yield_qty: number | null;
  batch_yield_uom: string | null;
  created_at: string;
  items?: RecipeItem[];
}

export interface RecipeItem {
  id: string;
  recipe_id: string;
  ingredient_id: string | null;
  broiler_yield_id: string | null;
  quantity: number;
  unit_cost: number;
  created_at: string;
  ingredient?: Ingredient;
  broiler_yield?: BroilerYield;
}

export interface DailyRevenue {
  id: string;
  date: string;
  gross_sales: number;
  discounts: number;
  net_sales: number;
  outlet_id: string | null;
  created_at: string;
}

export interface Outlet {
  id: string;
  name: string;
  address: string | null;
  created_at: string;
}

export interface MenuItem {
  id: string;
  name: string;
  price: number;
  created_at: string;
}

export interface RecipeMapping {
  id: string;
  menu_item_id: string;
  ingredient_id: string;
  quantity: number;
  unit: string;
  created_at: string;
  ingredient?: Ingredient;
}

export interface OutletInventory {
  id: string;
  outlet_id: string;
  ingredient_id: string;
  quantity: number;
  base_uom: string;
  updated_at: string;
  ingredient?: Ingredient;
}

export interface InternalTransfer {
  id: string;
  from_outlet_id: string;
  to_outlet_id: string;
  ingredient_id: string;
  quantity: number;
  unit: string;
  burdened_cost_per_unit: number;
  total_cost: number;
  transfer_date: string;
  notes: string | null;
  created_at: string;
  ingredient?: Ingredient;
  from_outlet?: Outlet;
  to_outlet?: Outlet;
}

export interface OutletCogsEntry {
  id: string;
  outlet_id: string;
  transfer_id: string;
  ingredient_id: string;
  quantity: number;
  cost_per_unit: number;
  total_cost: number;
  entry_date: string;
  created_at: string;
}

export const INVOICE_UOMS = ['kg', 'liter', 'gram', 'ml', 'piece', 'box', 'bottle'] as const;
export const BASE_UOMS = ['gram', 'ml', 'piece'] as const;
export type InvoiceUOM = typeof INVOICE_UOMS[number];
export type BaseUOM = typeof BASE_UOMS[number];

export const UOM_CONVERSIONS: Record<string, { target: string; multiplier: number }> = {
  kg: { target: 'gram', multiplier: 1000 },
  liter: { target: 'ml', multiplier: 1000 },
  gram: { target: 'gram', multiplier: 1 },
  ml: { target: 'ml', multiplier: 1 },
  piece: { target: 'piece', multiplier: 1 },
};
