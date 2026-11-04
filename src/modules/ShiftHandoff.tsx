import { useState, useEffect } from 'react';
import { Layers, Zap, RefreshCw, Package, AlertTriangle, CheckCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useOutlet } from '../lib/outlet';
import type { OutletInventory } from '../types';

// ─── Seed constants ───────────────────────────────────────────────────────────

const KEBAB_NAME  = 'Test Döner Kebab';
const KEBAB_PRICE = 65_000;

const SEED_INGREDIENTS = [
  { name: 'Döner Protein',                    category: 'Protein',   base_uom: 'gram',  starting_qty: 2000 },
  { name: 'Flatbread',                         category: 'Bakery',    base_uom: 'piece', starting_qty: 50   },
  { name: '1.2mm Matte Black Corrugated Tray', category: 'Packaging', base_uom: 'piece', starting_qty: 50   },
] as const;

const RECIPE_LINES = [
  { name: 'Döner Protein',                    qty: 150, unit: 'gram'  },
  { name: 'Flatbread',                         qty: 1,   unit: 'piece' },
  { name: '1.2mm Matte Black Corrugated Tray', qty: 1,   unit: 'piece' },
] as const;

// ─── Stock status helper ──────────────────────────────────────────────────────

function stockStatus(qty: number, uom: string): { label: string; color: string; icon: React.ReactNode } {
  const low = uom === 'gram' ? 300 : 5;
  if (qty <= 0)   return { label: 'Out of Stock', color: 'text-red-400',    icon: <AlertTriangle size={13} /> };
  if (qty <= low) return { label: 'Low Stock',    color: 'text-amber-DEFAULT', icon: <AlertTriangle size={13} /> };
  return             { label: 'In Stock',     color: 'text-emerald-400',  icon: <CheckCircle    size={13} /> };
}

// ─── Main component ──────────────────────────────────────────────────────────

export default function ShiftHandoff() {
  const { selectedOutlet } = useOutlet();

  const [inventory,  setInventory]  = useState<OutletInventory[]>([]);
  const [invLoading, setInvLoading] = useState(false);
  const [seeding,    setSeeding]    = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [message,    setMessage]    = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // ── Load inventory for selected outlet ───────────────────────────────────

  async function loadInventory(outletId: string) {
    setInvLoading(true);
    const { data, error } = await supabase
      .from('outlet_inventory')
      .select('*, ingredient:ingredient_id(id, name, base_uom, category)')
      .eq('outlet_id', outletId)
      .order('updated_at', { ascending: false });
    if (!error) setInventory((data ?? []) as OutletInventory[]);
    setInvLoading(false);
  }

  useEffect(() => {
    if (selectedOutlet) loadInventory(selectedOutlet.id);
    else setInventory([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedOutlet?.id]);

  // ── Seed mock recipe data ─────────────────────────────────────────────────

  async function handleSeed() {
    if (!selectedOutlet) return;
    setSeeding(true);
    setMessage(null);

    try {
      // 1. Upsert each ingredient (match by name)
      const ingredientIds: Record<string, string> = {};
      for (const ing of SEED_INGREDIENTS) {
        // Check if exists
        const { data: existing } = await supabase
          .from('ingredients')
          .select('id')
          .eq('name', ing.name)
          .maybeSingle();

        let id: string;
        if (existing) {
          id = existing.id as string;
        } else {
          const { data: created, error } = await supabase
            .from('ingredients')
            .insert({
              name: ing.name,
              category: ing.category,
              base_uom: ing.base_uom,
              current_base_unit_cost: 0,
            })
            .select('id')
            .single();
          if (error) throw new Error(`Ingredient "${ing.name}": ${error.message}`);
          id = (created as { id: string }).id;
        }
        ingredientIds[ing.name] = id;
      }

      // 2. Upsert menu item
      const { data: existingItem } = await supabase
        .from('menu_items')
        .select('id')
        .eq('name', KEBAB_NAME)
        .maybeSingle();

      let menuItemId: string;
      if (existingItem) {
        menuItemId = (existingItem as { id: string }).id;
      } else {
        const { data: created, error } = await supabase
          .from('menu_items')
          .insert({ name: KEBAB_NAME, price: KEBAB_PRICE })
          .select('id')
          .single();
        if (error) throw new Error(`Menu item: ${error.message}`);
        menuItemId = (created as { id: string }).id;
      }

      // 3. Replace recipe mappings for this item
      await supabase.from('recipe_mappings').delete().eq('menu_item_id', menuItemId);
      const { error: rmErr } = await supabase.from('recipe_mappings').insert(
        RECIPE_LINES.map((line) => ({
          menu_item_id:  menuItemId,
          ingredient_id: ingredientIds[line.name],
          quantity:      line.qty,
          unit:          line.unit,
        })),
      );
      if (rmErr) throw new Error(`Recipe mappings: ${rmErr.message}`);

      // 4. Seed / reset outlet_inventory for this outlet
      const invRows = SEED_INGREDIENTS.map((ing) => ({
        outlet_id:     selectedOutlet.id,
        ingredient_id: ingredientIds[ing.name],
        quantity:      ing.starting_qty,
        base_uom:      ing.base_uom,
        updated_at:    new Date().toISOString(),
      }));
      const { error: invErr } = await supabase
        .from('outlet_inventory')
        .upsert(invRows, { onConflict: 'outlet_id,ingredient_id' });
      if (invErr) throw new Error(`Inventory seed: ${invErr.message}`);

      setMessage({ type: 'success', text: 'Mock data seeded — inventory reset to starting levels.' });
      await loadInventory(selectedOutlet.id);
    } catch (e) {
      setMessage({ type: 'error', text: (e as Error).message });
    }
    setSeeding(false);
  }

  // ── Simulate 1 sale ───────────────────────────────────────────────────────

  async function handleSimulateSale() {
    if (!selectedOutlet) return;
    setSimulating(true);
    setMessage(null);

    try {
      // Fetch recipe_mappings for the kebab
      const { data: item } = await supabase
        .from('menu_items')
        .select('id')
        .eq('name', KEBAB_NAME)
        .maybeSingle();

      if (!item) {
        throw new Error('Test Döner Kebab not found. Seed mock data first.');
      }

      const { data: mappings, error: rmErr } = await supabase
        .from('recipe_mappings')
        .select('ingredient_id, quantity')
        .eq('menu_item_id', (item as { id: string }).id);

      if (rmErr) throw new Error(rmErr.message);
      if (!mappings?.length) throw new Error('No recipe mappings found. Seed mock data first.');

      // Deduct each ingredient from outlet_inventory (floor at 0)
      for (const mapping of mappings) {
        const { error } = await supabase.rpc('deduct_inventory', {
          p_outlet_id:     selectedOutlet.id,
          p_ingredient_id: mapping.ingredient_id,
          p_qty:           mapping.quantity,
        });
        if (error) {
          // Fallback: manual update if RPC not available
          const { data: row } = await supabase
            .from('outlet_inventory')
            .select('quantity')
            .eq('outlet_id', selectedOutlet.id)
            .eq('ingredient_id', mapping.ingredient_id)
            .maybeSingle();

          const current = (row as { quantity: number } | null)?.quantity ?? 0;
          const newQty  = Math.max(0, current - (mapping.quantity as number));

          await supabase
            .from('outlet_inventory')
            .update({ quantity: newQty, updated_at: new Date().toISOString() })
            .eq('outlet_id', selectedOutlet.id)
            .eq('ingredient_id', mapping.ingredient_id);
        }
      }

      setMessage({ type: 'success', text: '1 sale simulated — stock depleted.' });
      await loadInventory(selectedOutlet.id);
    } catch (e) {
      setMessage({ type: 'error', text: (e as Error).message });
    }
    setSimulating(false);
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (!selectedOutlet) {
    return (
      <div className="max-w-screen-2xl mx-auto px-4 py-8">
        <div className="panel flex flex-col items-center justify-center py-20 text-center gap-3">
          <div className="p-4 rounded-full bg-surface-raised">
            <Layers size={28} className="text-ink-disabled" />
          </div>
          <p className="text-sm font-medium text-ink-secondary">No outlet selected</p>
          <p className="text-xs text-ink-tertiary">Select a location from the header to begin.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-screen-2xl mx-auto px-4 py-8 space-y-8">

      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-ink-primary tracking-tight">Shift Handoff</h1>
        <p className="text-sm text-ink-tertiary mt-1">
          POS recipe depletion simulator for{' '}
          <span className="text-ink-primary font-medium">{selectedOutlet.name}</span>.
        </p>
      </div>

      {message && (
        <div className={`px-4 py-3 rounded-lg border text-sm flex items-start gap-2 ${
          message.type === 'success'
            ? 'bg-emerald-900/20 border-emerald-800/40 text-emerald-400'
            : 'bg-red-900/30 border-red-800/50 text-red-400'
        }`}>
          {message.type === 'success'
            ? <CheckCircle size={15} className="shrink-0 mt-0.5" />
            : <AlertTriangle size={15} className="shrink-0 mt-0.5" />}
          {message.text}
        </div>
      )}

      {/* ── Recipe info panel ────────────────────────────────────────────── */}
      <div className="panel">
        <div className="panel-header">
          <div className="flex items-center gap-3">
            <Package size={15} className="text-amber-DEFAULT" />
            <h2 className="text-sm font-semibold text-ink-primary tracking-wide">
              Test Döner Kebab — Bill of Materials
            </h2>
          </div>
          <span className="tag bg-surface-border text-ink-secondary">Mock POS Item</span>
        </div>

        <div className="px-6 py-5">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-surface-border">
                <th className="text-left pb-3 text-[10px] uppercase tracking-widest text-ink-tertiary font-semibold">
                  Ingredient
                </th>
                <th className="text-right pb-3 text-[10px] uppercase tracking-widest text-ink-tertiary font-semibold">
                  Qty per Sale
                </th>
              </tr>
            </thead>
            <tbody>
              {RECIPE_LINES.map((line) => (
                <tr key={line.name} className="border-b border-surface-border">
                  <td className="py-3 text-ink-primary">{line.name}</td>
                  <td className="py-3 text-right mono text-amber-DEFAULT">
                    {line.qty} {line.unit}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Action buttons ───────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row gap-3">
        <button
          onClick={handleSeed}
          disabled={seeding || simulating}
          className="btn-secondary flex items-center justify-center gap-2 py-3"
        >
          <RefreshCw size={14} className={seeding ? 'animate-spin' : ''} />
          {seeding ? 'Seeding…' : 'Seed Mock Recipe Data'}
        </button>

        <button
          onClick={handleSimulateSale}
          disabled={seeding || simulating || inventory.length === 0}
          className="btn-primary flex items-center justify-center gap-2 py-3"
        >
          <Zap size={14} className={simulating ? 'animate-pulse' : ''} />
          {simulating ? 'Simulating…' : 'Simulate 1 Sale'}
        </button>
      </div>

      {/* ── Live inventory table ─────────────────────────────────────────── */}
      <div className="panel">
        <div className="panel-header">
          <div className="flex items-center gap-3">
            <Layers size={15} className="text-amber-DEFAULT" />
            <h2 className="text-sm font-semibold text-ink-primary tracking-wide">
              Live Inventory — {selectedOutlet.name}
            </h2>
            {invLoading && (
              <div className="w-3.5 h-3.5 rounded-full border-2 border-surface-muted border-t-amber-DEFAULT animate-spin" />
            )}
          </div>
          <button
            onClick={() => loadInventory(selectedOutlet.id)}
            disabled={invLoading}
            className="btn-ghost"
          >
            <RefreshCw size={12} className={invLoading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>

        {!invLoading && inventory.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
            <div className="p-4 rounded-full bg-surface-raised">
              <Package size={26} className="text-ink-disabled" />
            </div>
            <div>
              <p className="text-sm font-medium text-ink-secondary">No inventory at this outlet</p>
              <p className="text-xs text-ink-tertiary mt-1">
                Click "Seed Mock Recipe Data" to populate starting stock.
              </p>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Ingredient</th>
                  <th>Category</th>
                  <th className="text-right">Qty on Hand</th>
                  <th className="text-right">Unit</th>
                  <th className="text-center">Status</th>
                  <th className="text-right">Last Updated</th>
                </tr>
              </thead>
              <tbody>
                {inventory.map((row) => {
                  const name  = (row.ingredient as { name: string } | undefined)?.name ?? '—';
                  const cat   = (row.ingredient as { category?: string | null } | undefined)?.category ?? '—';
                  const st    = stockStatus(row.quantity, row.base_uom);
                  const date  = new Date(row.updated_at).toLocaleString('id-ID', {
                    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
                  });

                  return (
                    <tr key={row.id}>
                      <td className="font-medium text-ink-primary">{name}</td>
                      <td>
                        <span className="tag bg-surface-border text-ink-secondary">{cat}</span>
                      </td>
                      <td className="text-right mono font-semibold">
                        <span className={row.quantity <= 0 ? 'text-red-400' : row.quantity <= (row.base_uom === 'gram' ? 300 : 5) ? 'text-amber-DEFAULT' : 'text-ink-primary'}>
                          {row.quantity.toLocaleString()}
                        </span>
                      </td>
                      <td className="text-right text-ink-tertiary text-xs">{row.base_uom}</td>
                      <td className="text-center">
                        <div className={`inline-flex items-center gap-1 text-xs font-medium ${st.color}`}>
                          {st.icon}
                          {st.label}
                        </div>
                      </td>
                      <td className="text-right text-xs text-ink-tertiary">{date}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
