import { useState } from 'react';
import { Truck, PackageCheck, AlertTriangle, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { CENTRAL_KITCHEN_ID } from '../lib/constants';
import type { Ingredient } from '../types';
import { formatIDR, formatBaseCost } from '../utils/formatting';
import SearchableSelect from '../components/SearchableSelect';
import type { TollOrder, OutboundFormState, ReceiveFormState } from './TollManufacturing.types';

const EMPTY_OUTBOUND: OutboundFormState = {
  ingredient_id: '',
  grams_sent: '',
  outbound_date: new Date().toISOString().split('T')[0],
  notes: '',
};

const EMPTY_RECEIVE: ReceiveFormState = {
  product_name: '',
  product_uom: 'piece',
  units_received: '',
  bakery_labor_cost: '',
  logistics_cost: '0',
  inbound_date: new Date().toISOString().split('T')[0],
};

// ─── Burdened Cost Preview ────────────────────────────────────────────────

function CostPreview({
  batchCost,
  labor,
  logistics,
  units,
}: {
  batchCost: number;
  labor: number;
  logistics: number;
  units: number;
}) {
  const total = batchCost + labor + logistics;
  const cpu = units > 0 ? Number((total / units).toFixed(4)) : null;
  return (
    <div className="rounded border border-surface-border bg-surface-raised">
      <div className="px-4 py-2 border-b border-surface-border">
        <p className="text-[10px] font-semibold text-ink-tertiary uppercase tracking-widest">Burdened Cost Breakdown</p>
      </div>
      <div className="px-4 py-3 space-y-1.5 text-xs">
        <div className="flex justify-between">
          <span className="text-ink-tertiary">Part A Batch Cost</span>
          <span className="mono text-ink-secondary">{formatIDR(batchCost)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-ink-tertiary">+ Bakery Labor</span>
          <span className="mono text-ink-secondary">{formatIDR(labor)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-ink-tertiary">+ Logistics</span>
          <span className="mono text-ink-secondary">{formatIDR(logistics)}</span>
        </div>
        <div className="flex justify-between pt-1.5 border-t border-surface-border font-semibold">
          <span className="text-ink-secondary">Total Burdened Cost</span>
          <span className="mono text-ink-primary">{formatIDR(total)}</span>
        </div>
        {units > 0 && (
          <div className="flex justify-between pt-1.5 border-t border-surface-border">
            <span className="text-ink-tertiary">÷ {units} units received</span>
            <span />
          </div>
        )}
        <div className={`flex justify-between pt-1 ${cpu !== null ? 'border-t-2 border-amber-dim/40' : ''}`}>
          <span className="text-amber-DEFAULT font-bold text-sm">Cost Per Unit</span>
          <span className="mono font-bold text-amber-DEFAULT text-sm">
            {cpu !== null ? formatBaseCost(cpu) : '—'}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Outbound Form ────────────────────────────────────────────────────────

export function OutboundForm({
  ingredients,
  onSaved,
}: {
  ingredients: Ingredient[];
  onSaved: () => void;
}) {
  const [form, setForm] = useState<OutboundFormState>(EMPTY_OUTBOUND);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (k: keyof OutboundFormState, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const selectedIng = ingredients.find((i) => i.id === form.ingredient_id);
  const grams = parseFloat(form.grams_sent) || 0;
  const batchCost = selectedIng && grams > 0 ? grams * selectedIng.current_base_unit_cost : 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.ingredient_id || !grams) { setError('Select an ingredient and enter gram quantity.'); return; }
    if (!selectedIng || selectedIng.current_base_unit_cost === 0) {
      setError('Selected ingredient has no Base Unit Cost. Log an invoice purchase first.');
      return;
    }

    setSaving(true);
    setError(null);
    const { error: insErr } = await supabase.from('toll_manufacturing_orders').insert({
      ingredient_id: form.ingredient_id,
      grams_sent: grams,
      part_a_unit_cost: selectedIng.current_base_unit_cost,
      part_a_batch_cost: batchCost,
      outbound_date: form.outbound_date,
      notes: form.notes || null,
      status: 'wip',
    });

    if (insErr) { setError(insErr.message); setSaving(false); return; }
    setForm(EMPTY_OUTBOUND);
    setSaving(false);
    onSaved();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="flex items-center gap-2 px-4 py-3 rounded bg-red-900/30 border border-red-800/50 text-red-400 text-xs">
          <AlertTriangle size={13} /> {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="field-label">Raw Material (Part A) *</label>
          <SearchableSelect
            options={ingredients.map((i) => ({
              value: i.id,
              label: i.name + (i.current_base_unit_cost > 0 ? ` — ${formatBaseCost(i.current_base_unit_cost)}/${i.base_uom}` : ' (no cost set)'),
              group: i.category || undefined,
            }))}
            value={form.ingredient_id}
            onChange={(v) => set('ingredient_id', v)}
            placeholder="— Select ingredient —"
          />
        </div>
        <div>
          <label className="field-label">Outbound Date *</label>
          <input type="date" className="field-input" value={form.outbound_date} onChange={(e) => set('outbound_date', e.target.value)} required />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="field-label">Grams Sent *</label>
          <input type="number" min="0" step="any" className="field-input" placeholder="e.g. 25000" value={form.grams_sent} onChange={(e) => set('grams_sent', e.target.value)} required />
          {selectedIng && grams > 0 && (
            <p className="text-xs text-amber-DEFAULT mt-1 mono">
              Batch IDR value: {formatIDR(batchCost)}
            </p>
          )}
        </div>
        <div>
          <label className="field-label">Notes</label>
          <input className="field-input" placeholder="Lot reference, batch ID…" value={form.notes} onChange={(e) => set('notes', e.target.value)} />
        </div>
      </div>

      <div className="flex justify-end">
        <button type="submit" className="btn-primary" disabled={saving}>
          {saving ? <><Loader2 size={14} className="animate-spin" /> Logging…</> : <><Truck size={14} /> Log Outbound Transfer</>}
        </button>
      </div>
    </form>
  );
}

// ─── Inline Receive Form ──────────────────────────────────────────────────

export function ReceiveForm({
  order,
  onSaved,
  onCancel,
}: {
  order: TollOrder;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<ReceiveFormState>(EMPTY_RECEIVE);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (k: keyof ReceiveFormState, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const units    = parseFloat(form.units_received)   || 0;
  const labor    = parseFloat(form.bakery_labor_cost) || 0;
  const logistics = parseFloat(form.logistics_cost)  || 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.product_name.trim() || !units || !labor) {
      setError('Product name, units received, and bakery labor cost are required.');
      return;
    }

    setSaving(true);
    setError(null);

    const total_burdened_cost = order.part_a_batch_cost + labor + logistics;
    const cost_per_unit = Number((total_burdened_cost / units).toFixed(4));
    const name = form.product_name.trim();

    // Create or update finished ingredient
    const { data: existing } = await supabase
      .from('ingredients')
      .select('id')
      .ilike('name', name)
      .maybeSingle();

    let finished_ingredient_id: string;
    if (existing) {
      await supabase.from('ingredients').update({ current_base_unit_cost: cost_per_unit, base_uom: form.product_uom }).eq('id', existing.id);
      finished_ingredient_id = existing.id;
    } else {
      const { data: newIng, error: ingErr } = await supabase.from('ingredients')
        .insert({ name, base_uom: form.product_uom, current_base_unit_cost: cost_per_unit })
        .select('id').maybeSingle();
      if (ingErr || !newIng) { setError(ingErr?.message ?? 'Failed to create ingredient.'); setSaving(false); return; }
      finished_ingredient_id = newIng.id;
    }

    const { error: updErr } = await supabase.from('toll_manufacturing_orders').update({
      status: 'received',
      product_name: name,
      product_uom: form.product_uom,
      units_received: units,
      bakery_labor_cost: labor,
      logistics_cost: logistics,
      total_burdened_cost,
      cost_per_unit,
      finished_ingredient_id,
      inbound_date: form.inbound_date,
    }).eq('id', order.id);

    if (updErr) { setError(updErr.message); setSaving(false); return; }

    // Add finished goods to Central Kitchen inventory at burdened cost
    const { data: ckRow } = await supabase
      .from('outlet_inventory')
      .select('quantity')
      .eq('outlet_id', CENTRAL_KITCHEN_ID)
      .eq('ingredient_id', finished_ingredient_id)
      .maybeSingle();
    const ckQty = (ckRow as { quantity: number } | null)?.quantity ?? 0;
    await supabase.from('outlet_inventory').upsert(
      {
        outlet_id:     CENTRAL_KITCHEN_ID,
        ingredient_id: finished_ingredient_id,
        quantity:      ckQty + units,
        base_uom:      form.product_uom,
        updated_at:    new Date().toISOString(),
      },
      { onConflict: 'outlet_id,ingredient_id' },
    );
    setSaving(false);
    onSaved();
  }

  return (
    <form onSubmit={handleSubmit} className="mt-4 pt-4 border-t border-surface-border space-y-4">
      <p className="text-xs font-semibold text-ink-tertiary uppercase tracking-widest flex items-center gap-2">
        <PackageCheck size={13} className="text-emerald-500" /> Receive Finished Goods
      </p>

      {error && (
        <div className="flex items-center gap-2 px-3 py-2 rounded bg-red-900/30 border border-red-800/50 text-red-400 text-xs">
          <AlertTriangle size={12} /> {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="md:col-span-2">
          <label className="field-label">Finished Product Name *</label>
          <input className="field-input" placeholder='e.g. "The Cylinder"' value={form.product_name} onChange={(e) => set('product_name', e.target.value)} required />
        </div>
        <div>
          <label className="field-label">Product UOM</label>
          <select className="field-select" value={form.product_uom} onChange={(e) => set('product_uom', e.target.value)}>
            <option value="piece">piece</option>
            <option value="gram">gram</option>
            <option value="ml">ml</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div>
          <label className="field-label">Units Received *</label>
          <input type="number" min="0" step="any" className="field-input" placeholder="e.g. 500" value={form.units_received} onChange={(e) => set('units_received', e.target.value)} required />
        </div>
        <div>
          <label className="field-label">Bakery Labor Invoice (IDR) *</label>
          <input type="number" min="0" step="any" className="field-input" placeholder="e.g. 1500000" value={form.bakery_labor_cost} onChange={(e) => set('bakery_labor_cost', e.target.value)} required />
        </div>
        <div>
          <label className="field-label">Logistics Cost (IDR)</label>
          <input type="number" min="0" step="any" className="field-input" placeholder="e.g. 250000" value={form.logistics_cost} onChange={(e) => set('logistics_cost', e.target.value)} />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="field-label">Inbound Date</label>
          <input type="date" className="field-input" value={form.inbound_date} onChange={(e) => set('inbound_date', e.target.value)} />
        </div>
        <div>
          <CostPreview batchCost={order.part_a_batch_cost} labor={labor} logistics={logistics} units={units} />
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <button type="button" className="btn-secondary !text-xs" onClick={onCancel} disabled={saving}>Cancel</button>
        <button type="submit" className="btn-primary" disabled={saving}>
          {saving
            ? <><Loader2 size={14} className="animate-spin" /> Saving…</>
            : <><PackageCheck size={14} /> Complete Receipt &amp; Save Product</>
          }
        </button>
      </div>
    </form>
  );
}
