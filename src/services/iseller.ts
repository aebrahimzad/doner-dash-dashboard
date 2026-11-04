import { supabase } from '../lib/supabase';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface OrderModifier {
  sku: string;
  name: string;
  quantity: number;
  price: number;
}

export interface OrderDetail {
  product_name: string;
  sku: string;
  quantity: number;
  base_price: number;
  modifiers: OrderModifier[];
}

export interface RawOrder {
  total: number;
  date: string;
  datetime: string;
  outlet_name: string;
  order_details: OrderDetail[];
}

// ─── Mappers ────────────────────────────────────────────────────────────────

function mapModifier(m: any): OrderModifier {
  return {
    sku: m.sku ?? m.SKU ?? m.Sku ?? '--',
    name: m.name ?? m.Name ?? m.modifier_name ?? m.ModifierName ?? '--',
    quantity: Number(m.quantity ?? m.Quantity ?? m.qty ?? m.Qty ?? 1),
    price: Number(m.price ?? m.Price ?? m.unit_price ?? m.UnitPrice ?? 0),
  };
}

function mapDetail(d: any): OrderDetail {
  const rawMods: any[] = d.modifiers ?? d.Modifiers ?? d.modifier_lines ?? d.ModifierLines ?? [];
  return {
    product_name: d.product_name ?? d.productName ?? d.ProductName ?? d.name ?? d.Name ?? '--',
    sku: d.sku ?? d.SKU ?? d.Sku ?? d.product_sku ?? d.ProductSku ?? '--',
    quantity: Number(d.quantity ?? d.Quantity ?? d.qty ?? d.Qty ?? 0),
    base_price: Number(d.base_price ?? d.basePrice ?? d.BasePrice ?? d.price ?? d.Price ?? d.unit_price ?? d.UnitPrice ?? 0),
    modifiers: Array.isArray(rawMods) ? rawMods.map(mapModifier) : [],
  };
}

function mapOrder(o: any): RawOrder {
  const rawDetails: any[] = o.order_details ?? o.orderDetails ?? o.OrderDetails ?? o.items ?? o.Items ?? [];
  const rawDate = o.created_at ?? o.createdAt ?? o.CreatedAt ?? o.order_date ?? o.OrderDate ?? '';
  const rawDateFull = typeof rawDate === 'string' ? rawDate : '';
  const dateStr = typeof rawDate === 'string' ? rawDate.slice(0, 10) : '';
  return {
    total: Number(o.total ?? o.Total ?? o.total_amount ?? o.TotalAmount ?? o.grand_total ?? o.GrandTotal ?? 0),
    date: dateStr,
    datetime: rawDateFull,
    outlet_name: o.outlet_name ?? o.outletName ?? o.OutletName ?? o.outlet ?? o.Outlet ?? o.location ?? o.Location ?? '',
    order_details: Array.isArray(rawDetails) ? rawDetails.map(mapDetail) : [],
  };
}

// ─── API ────────────────────────────────────────────────────────────────────

type ErrorListener = (message: string) => void;
let _errorListener: ErrorListener | null = null;

export function setISellerErrorListener(fn: ErrorListener | null) {
  _errorListener = fn;
}

export async function fetchISeller(startDate: string, endDate: string): Promise<RawOrder[]> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
  const url = `${supabaseUrl}/functions/v1/iseller-proxy`;

  console.log('[fetchISeller] Request params:', { startDate, endDate });

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${anonKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ startDate, endDate }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      const msg = body?.error ?? `iSeller API Error: ${res.status}`;
      console.error('[fetchISeller] API error:', msg, { startDate, endDate, status: res.status });
      _errorListener?.(msg);
      throw new Error(msg);
    }
    const data = await res.json();
    console.log('[fetchISeller] Response received, raw type:', typeof data, 'isArray:', Array.isArray(data));
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      console.log('[fetchISeller] Response keys:', Object.keys(data));
    }
    const list: unknown[] = Array.isArray(data)
      ? data
      : Array.isArray(data?.data)
        ? data.data
        : Array.isArray(data?.orders)
          ? data.orders
          : Array.isArray(data?.list)
            ? data.list
            : Array.isArray(data?.result)
              ? data.result
              : Array.isArray(data?.results)
                ? data.results
                : [];
    console.log('[fetchISeller] Extracted order count:', list.length);
    if (list.length === 0 && data) {
      console.warn('[fetchISeller] 0 orders extracted. Full response:', JSON.stringify(data).slice(0, 500));
    }
    return list.map(mapOrder);
  } catch (err) {
    const msg = (err as Error).message;
    console.error('[fetchISeller] Failed to fetch orders:', msg, { startDate, endDate });
    _errorListener?.(msg);
    throw err;
  }
}

export async function fetchRecipeCosts(): Promise<Map<string, number>> {
  const { data: recipes } = await supabase
    .from('recipes')
    .select('id, name, sku, iseller_sku, batch_yield_qty, batch_yield_uom');

  if (!recipes || recipes.length === 0) return new Map();

  const recipeIds = recipes.map((r) => r.id);
  const { data: items } = await supabase
    .from('recipe_items')
    .select('recipe_id, quantity, unit_cost')
    .in('recipe_id', recipeIds);

  const costByRecipe = new Map<string, number>();
  (items ?? []).forEach((item) => {
    const prev = costByRecipe.get(item.recipe_id) ?? 0;
    costByRecipe.set(item.recipe_id, prev + (item.quantity ?? 0) * (item.unit_cost ?? 0));
  });

  const batchRecipes = recipes.filter((r) => !r.iseller_sku && r.batch_yield_qty && costByRecipe.has(r.id));
  const batchByName = new Map<string, { costPerUnit: number; uom: string }>();
  batchRecipes.forEach((r) => {
    const totalCost = costByRecipe.get(r.id) ?? 0;
    const yieldQty = Number(r.batch_yield_qty) || 1;
    batchByName.set(r.name.toLowerCase(), { costPerUnit: totalCost / yieldQty, uom: r.batch_yield_uom ?? 'gram' });
  });

  const PORTION_MAP: Record<string, { batch: string; qty: number }> = {
    'wood-fired beef': { batch: 'beef marination', qty: 120 },
    'saffron citrus chicken': { batch: 'chicken marination', qty: 120 },
    'cassava lavash': { batch: 'gf wrap', qty: 1 },
    'cassava pita': { batch: 'gf wrap', qty: 1 },
    'feta cheese': { batch: 'feta cheese (prep)', qty: 15 },
    'obsidian sauce': { batch: 'obsidian', qty: 50 },
    'obsidian': { batch: 'obsidian', qty: 50 },
    'white noise': { batch: 'white noise', qty: 50 },
    'grilled paprika': { batch: 'grilled paprika', qty: 30 },
    'sauteed mushroom': { batch: 'sautee mushroom', qty: 30 },
    'green drop': { batch: 'green drop', qty: 30 },
    'liquid gold': { batch: 'liquid gold', qty: 30 },
    'hazard pay': { batch: "hazard's pay", qty: 30 },
    'the baseline': { batch: 'the baseline', qty: 30 },
    'shredded lettuce': { batch: 'shredded lettuce', qty: 50 },
    'alapeno': { batch: 'grilled paprika', qty: 30 },
  };

  function resolvePortionCost(recipe: typeof recipes[0]): number {
    const directCost = costByRecipe.get(recipe.id) ?? 0;
    if (directCost > 0) return directCost;

    const baseName = recipe.name
      .replace(/\s*\(1 Portion\)?\s*$/i, '')
      .replace(/\s*\(1 Piece\)\s*$/i, '')
      .replace(/\s*\(1 Can\)\s*$/i, '')
      .trim()
      .toLowerCase();

    const explicit = PORTION_MAP[baseName];
    if (explicit) {
      const batch = batchByName.get(explicit.batch);
      if (batch) {
        if (batch.uom === 'piece') return batch.costPerUnit * explicit.qty;
        return batch.costPerUnit * explicit.qty;
      }
    }

    const auto = batchByName.get(baseName);
    if (auto) {
      if (auto.uom === 'piece') return auto.costPerUnit;
      return auto.costPerUnit * 50;
    }

    return directCost;
  }

  const skuMap = new Map<string, number>();
  recipes.forEach((r) => {
    if (r.iseller_sku) {
      skuMap.set(r.iseller_sku.toLowerCase().replace(/\u200b/g, ''), resolvePortionCost(r));
    } else if (r.sku) {
      skuMap.set(r.sku.toLowerCase(), costByRecipe.get(r.id) ?? 0);
    }
  });
  return skuMap;
}

export function computeOrderCogs(order: RawOrder, costMap: Map<string, number>): number {
  let cogs = 0;
  for (const detail of order.order_details) {
    const sku = detail.sku?.toLowerCase().replace(/\u200b/g, '');
    if (sku && costMap.has(sku)) {
      cogs += costMap.get(sku)! * detail.quantity;
    }
    for (const mod of detail.modifiers) {
      const modSku = mod.sku?.toLowerCase().replace(/\u200b/g, '');
      if (modSku && costMap.has(modSku)) {
        cogs += costMap.get(modSku)! * mod.quantity;
      }
    }
  }
  return cogs;
}
