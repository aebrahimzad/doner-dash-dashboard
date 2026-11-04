import { useState, useEffect } from 'react';
import {
  ArrowLeftRight, Package, MapPin, AlertTriangle, CheckCircle,
  RefreshCw, Warehouse, ChevronRight, Clock,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { CENTRAL_KITCHEN_ID, CENTRAL_KITCHEN_NAME } from '../lib/constants';
import { formatIDR, formatBaseCost, formatDate } from '../utils/formatting';
import type { Outlet, InternalTransfer } from '../types';

// ─── Local types ──────────────────────────────────────────────────────────────

interface CkItem {
  id: string;          // outlet_inventory.id
  ingredient_id: string;
  quantity: number;
  base_uom: string;
  updated_at: string;
  name: string;
  category: string | null;
  current_base_unit_cost: number;
  burdenedCost: number;
  costSource: 'Toll Manufacturing' | 'Invoice Cost';
}

interface TransferFormState {
  to_outlet_id: string;
  ingredient_id: string;
  quantity: string;
  transfer_date: string;
  notes: string;
}

const EMPTY_FORM: TransferFormState = {
  to_outlet_id: '',
  ingredient_id: '',
  quantity: '',
  transfer_date: new Date().toISOString().split('T')[0],
  notes: '',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function CostBadge({ source }: { source: CkItem['costSource'] }) {
  const isBurdened = source === 'Toll Manufacturing';
  return (
    <span className={`tag text-[10px] ${isBurdened ? 'bg-emerald-900/30 text-emerald-400' : 'bg-surface-border text-ink-secondary'}`}>
      {isBurdened ? 'Burdened' : 'Invoice'}
    </span>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

export default function Requisitions() {
  const [ckItems,     setCkItems]     = useState<CkItem[]>([]);
  const [retailers,   setRetailers]   = useState<Outlet[]>([]);
  const [transfers,   setTransfers]   = useState<InternalTransfer[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [submitting,  setSubmitting]  = useState(false);
  const [form,        setForm]        = useState<TransferFormState>(EMPTY_FORM);
  const [message,     setMessage]     = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const set = (k: keyof TransferFormState, v: string) => setForm((f) => ({ ...f, [k]: v }));

  // ── Loaders ────────────────────────────────────────────────────────────────

  async function loadAll() {
    setLoading(true);
    await Promise.all([loadCkInventory(), loadRetailers(), loadTransfers()]);
    setLoading(false);
  }

  async function loadCkInventory() {
    // Fetch CK inventory with ingredient details
    const { data: inv } = await supabase
      .from('outlet_inventory')
      .select('*, ingredient:ingredient_id(id, name, category, current_base_unit_cost, base_uom)')
      .eq('outlet_id', CENTRAL_KITCHEN_ID)
      .order('updated_at', { ascending: false });

    // Fetch latest burdened cost per finished ingredient from toll manufacturing
    const { data: tollOrders } = await supabase
      .from('toll_manufacturing_orders')
      .select('finished_ingredient_id, cost_per_unit')
      .eq('status', 'received')
      .not('finished_ingredient_id', 'is', null)
      .not('cost_per_unit', 'is', null)
      .order('inbound_date', { ascending: false });

    const burdenedMap = new Map<string, number>();
    for (const o of (tollOrders ?? [])) {
      if (!burdenedMap.has(o.finished_ingredient_id)) {
        burdenedMap.set(o.finished_ingredient_id, o.cost_per_unit as number);
      }
    }

    const items: CkItem[] = (inv ?? []).map((row) => {
      const ing = row.ingredient as {
        id: string; name: string; category: string | null;
        current_base_unit_cost: number; base_uom: string;
      } | null;
      const hasBurdened = burdenedMap.has(row.ingredient_id);
      return {
        id:                    row.id,
        ingredient_id:         row.ingredient_id,
        quantity:              row.quantity,
        base_uom:              row.base_uom,
        updated_at:            row.updated_at,
        name:                  ing?.name ?? '—',
        category:              ing?.category ?? null,
        current_base_unit_cost: ing?.current_base_unit_cost ?? 0,
        burdenedCost:          hasBurdened ? burdenedMap.get(row.ingredient_id)! : (ing?.current_base_unit_cost ?? 0),
        costSource:            hasBurdened ? 'Toll Manufacturing' : 'Invoice Cost',
      };
    });
    setCkItems(items);
  }

  async function loadRetailers() {
    const { data } = await supabase
      .from('outlets')
      .select('*')
      .neq('id', CENTRAL_KITCHEN_ID)
      .order('name');
    setRetailers((data ?? []) as Outlet[]);
  }

  async function loadTransfers() {
    const { data } = await supabase
      .from('internal_transfers')
      .select(`
        *,
        ingredient:ingredient_id(id, name, base_uom),
        from_outlet:from_outlet_id(id, name),
        to_outlet:to_outlet_id(id, name)
      `)
      .order('transfer_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(100);
    setTransfers((data ?? []) as InternalTransfer[]);
  }

  useEffect(() => { loadAll(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Derived ────────────────────────────────────────────────────────────────

  const selectedItem    = ckItems.find((i) => i.ingredient_id === form.ingredient_id) ?? null;
  const qty             = parseFloat(form.quantity) || 0;
  const totalCost       = selectedItem ? qty * selectedItem.burdenedCost : 0;
  const isOverStock     = selectedItem !== null && qty > selectedItem.quantity;
  const canSubmit       = !!form.to_outlet_id && !!form.ingredient_id && qty > 0 && !isOverStock && !submitting;

  // ── Submit transfer ────────────────────────────────────────────────────────

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || !selectedItem) return;
    setSubmitting(true);
    setMessage(null);

    try {
      // Re-verify CK has enough stock (guard against race conditions)
      const { data: live } = await supabase
        .from('outlet_inventory')
        .select('quantity')
        .eq('outlet_id', CENTRAL_KITCHEN_ID)
        .eq('ingredient_id', form.ingredient_id)
        .maybeSingle();
      const liveQty = (live as { quantity: number } | null)?.quantity ?? 0;
      if (liveQty < qty) {
        throw new Error(`Insufficient stock at ${CENTRAL_KITCHEN_NAME}. Available: ${liveQty} ${selectedItem.base_uom}.`);
      }

      // 1. Deduct from Central Kitchen
      await supabase.from('outlet_inventory')
        .update({ quantity: liveQty - qty, updated_at: new Date().toISOString() })
        .eq('outlet_id', CENTRAL_KITCHEN_ID)
        .eq('ingredient_id', form.ingredient_id);

      // 2. Add to retail outlet (upsert additive)
      const { data: retailRow } = await supabase
        .from('outlet_inventory')
        .select('quantity')
        .eq('outlet_id', form.to_outlet_id)
        .eq('ingredient_id', form.ingredient_id)
        .maybeSingle();
      const retailQty = (retailRow as { quantity: number } | null)?.quantity ?? 0;
      await supabase.from('outlet_inventory').upsert(
        {
          outlet_id:     form.to_outlet_id,
          ingredient_id: form.ingredient_id,
          quantity:      retailQty + qty,
          base_uom:      selectedItem.base_uom,
          updated_at:    new Date().toISOString(),
        },
        { onConflict: 'outlet_id,ingredient_id' },
      );

      // 3. Log the internal transfer
      const { data: transfer, error: tErr } = await supabase
        .from('internal_transfers')
        .insert({
          from_outlet_id:        CENTRAL_KITCHEN_ID,
          to_outlet_id:          form.to_outlet_id,
          ingredient_id:         form.ingredient_id,
          quantity:              qty,
          unit:                  selectedItem.base_uom,
          burdened_cost_per_unit: selectedItem.burdenedCost,
          total_cost:            totalCost,
          transfer_date:         form.transfer_date,
          notes:                 form.notes.trim() || null,
        })
        .select('id')
        .single();
      if (tErr || !transfer) throw new Error(tErr?.message ?? 'Failed to log transfer.');

      // 4. Log COGS entry for the receiving outlet
      await supabase.from('outlet_cogs_entries').insert({
        outlet_id:     form.to_outlet_id,
        transfer_id:   (transfer as { id: string }).id,
        ingredient_id: form.ingredient_id,
        quantity:      qty,
        cost_per_unit: selectedItem.burdenedCost,
        total_cost:    totalCost,
        entry_date:    form.transfer_date,
      });

      setMessage({ type: 'success', text: `Transferred ${qty} ${selectedItem.base_uom} of ${selectedItem.name} — COGS logged.` });
      setForm(EMPTY_FORM);
      await loadAll();
    } catch (err) {
      setMessage({ type: 'error', text: (err as Error).message });
    }
    setSubmitting(false);
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-screen-2xl mx-auto px-4 py-8 space-y-8">

      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-ink-primary tracking-tight">Internal Requisitions</h1>
        <p className="text-sm text-ink-tertiary mt-1">
          Transfer processed goods from{' '}
          <span className="text-ink-primary font-medium">{CENTRAL_KITCHEN_NAME}</span>{' '}
          to retail outlets at exact burdened cost — no markup.
        </p>
      </div>

      {message && (
        <div className={`flex items-start gap-2 px-4 py-3 rounded-lg border text-sm ${
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

      {/* ── Two-up: transfer form + CK inventory ──────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">

        {/* Transfer form */}
        <div className="md:col-span-1 panel">
          <div className="panel-header">
            <div className="flex items-center gap-3">
              <ArrowLeftRight size={15} className="text-amber-DEFAULT" />
              <h2 className="text-sm font-semibold text-ink-primary tracking-wide">New Transfer</h2>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-5">
            {/* From (locked) */}
            <div>
              <label className="field-label">From (Hub)</label>
              <div className="field-input flex items-center gap-2 !cursor-not-allowed opacity-70">
                <Warehouse size={13} className="text-amber-DEFAULT shrink-0" />
                <span className="text-ink-secondary">{CENTRAL_KITCHEN_NAME}</span>
                <span className="tag bg-amber-DEFAULT/10 text-amber-DEFAULT text-[10px] ml-auto">Locked</span>
              </div>
            </div>

            {/* To outlet */}
            <div>
              <label className="field-label">To Outlet *</label>
              <select
                className="field-select"
                value={form.to_outlet_id}
                onChange={(e) => set('to_outlet_id', e.target.value)}
                required
              >
                <option value="">— Select retail outlet —</option>
                {retailers.map((o) => (
                  <option key={o.id} value={o.id}>{o.name}</option>
                ))}
              </select>
            </div>

            {/* Product */}
            <div>
              <label className="field-label">Product *</label>
              <select
                className="field-select"
                value={form.ingredient_id}
                onChange={(e) => set('ingredient_id', e.target.value)}
                required
              >
                <option value="">— Select product —</option>
                {ckItems.filter((i) => i.quantity > 0).map((i) => (
                  <option key={i.ingredient_id} value={i.ingredient_id}>
                    {i.name} — {i.quantity.toLocaleString()} {i.base_uom} available
                  </option>
                ))}
              </select>
            </div>

            {/* Selected item info */}
            {selectedItem && (
              <div className="rounded-lg border border-surface-border bg-surface-raised text-xs divide-y divide-surface-border overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2.5">
                  <span className="text-ink-tertiary">Available at CK</span>
                  <span className="mono font-semibold text-ink-primary">
                    {selectedItem.quantity.toLocaleString()} {selectedItem.base_uom}
                  </span>
                </div>
                <div className="flex items-center justify-between px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <span className="text-ink-tertiary">Cost per unit</span>
                    <CostBadge source={selectedItem.costSource} />
                  </div>
                  <span className="mono font-semibold text-amber-DEFAULT">
                    {formatBaseCost(selectedItem.burdenedCost)} / {selectedItem.base_uom}
                  </span>
                </div>
              </div>
            )}

            {/* Quantity */}
            <div>
              <label className="field-label">Quantity *</label>
              <input
                type="number"
                min="0.001"
                step="any"
                className={`field-input ${isOverStock ? '!border-red-700/60 !bg-red-900/10' : ''}`}
                placeholder={selectedItem ? `Max ${selectedItem.quantity} ${selectedItem.base_uom}` : 'Select a product first'}
                value={form.quantity}
                onChange={(e) => set('quantity', e.target.value)}
                disabled={!selectedItem}
                required
              />
              {isOverStock && (
                <p className="text-xs text-red-400 mt-1 flex items-center gap-1">
                  <AlertTriangle size={11} />
                  Exceeds available stock at {CENTRAL_KITCHEN_NAME}.
                </p>
              )}
            </div>

            {/* Transfer date */}
            <div>
              <label className="field-label">Transfer Date *</label>
              <input
                type="date"
                className="field-input"
                value={form.transfer_date}
                onChange={(e) => set('transfer_date', e.target.value)}
                required
              />
            </div>

            {/* Notes */}
            <div>
              <label className="field-label">Notes</label>
              <input
                className="field-input"
                placeholder="Requisition ref, batch, notes…"
                value={form.notes}
                onChange={(e) => set('notes', e.target.value)}
              />
            </div>

            {/* Cost preview */}
            {selectedItem && qty > 0 && (
              <div className="rounded-lg border border-emerald-800/40 bg-emerald-900/10 px-4 py-3 space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-ink-tertiary">{qty.toLocaleString()} {selectedItem.base_uom} × {formatBaseCost(selectedItem.burdenedCost)}</span>
                </div>
                <div className="flex justify-between border-t border-emerald-800/30 pt-1.5 font-semibold">
                  <span className="text-emerald-400">Total COGS recognised</span>
                  <span className="mono text-emerald-400">{formatIDR(totalCost)}</span>
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={!canSubmit}
              className="btn-primary w-full flex items-center justify-center gap-2"
            >
              {submitting ? (
                <><div className="w-3.5 h-3.5 border-2 border-surface-base border-t-transparent rounded-full animate-spin" /> Processing…</>
              ) : (
                <><ArrowLeftRight size={14} /> Confirm Transfer</>
              )}
            </button>
          </form>
        </div>

        {/* Central Kitchen inventory */}
        <div className="md:col-span-2 panel">
          <div className="panel-header">
            <div className="flex items-center gap-3">
              <Warehouse size={15} className="text-amber-DEFAULT" />
              <h2 className="text-sm font-semibold text-ink-primary tracking-wide">
                {CENTRAL_KITCHEN_NAME} — Current Stock
              </h2>
              {loading && (
                <div className="w-3.5 h-3.5 border-2 border-surface-muted border-t-amber-DEFAULT rounded-full animate-spin" />
              )}
            </div>
            <button
              onClick={loadAll}
              disabled={loading}
              className="btn-ghost"
            >
              <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> Refresh
            </button>
          </div>

          {!loading && ckItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
              <div className="p-4 rounded-full bg-surface-raised">
                <Package size={26} className="text-ink-disabled" />
              </div>
              <div>
                <p className="text-sm font-medium text-ink-secondary">No stock at Central Kitchen</p>
                <p className="text-xs text-ink-tertiary mt-1">
                  Capture invoices to add raw ingredients, or receive a toll manufacturing order to add finished goods.
                </p>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Category</th>
                    <th className="text-right">Stock</th>
                    <th className="text-right">Unit</th>
                    <th className="text-right">Cost / Unit</th>
                    <th className="text-center">Cost Basis</th>
                    <th className="text-right">Total Value</th>
                  </tr>
                </thead>
                <tbody>
                  {ckItems.map((item) => (
                    <tr
                      key={item.ingredient_id}
                      className={`cursor-pointer ${form.ingredient_id === item.ingredient_id ? 'bg-amber-DEFAULT/5' : ''}`}
                      onClick={() => set('ingredient_id', item.ingredient_id)}
                    >
                      <td className="font-medium text-ink-primary">
                        <div className="flex items-center gap-2">
                          {form.ingredient_id === item.ingredient_id && (
                            <ChevronRight size={12} className="text-amber-DEFAULT shrink-0" />
                          )}
                          {item.name}
                        </div>
                      </td>
                      <td>
                        {item.category
                          ? <span className="tag bg-surface-border text-ink-secondary">{item.category}</span>
                          : <span className="text-ink-disabled text-xs">—</span>}
                      </td>
                      <td className="text-right mono font-semibold">
                        <span className={item.quantity <= 0 ? 'text-red-400' : 'text-ink-primary'}>
                          {item.quantity.toLocaleString()}
                        </span>
                      </td>
                      <td className="text-right text-xs text-ink-tertiary">{item.base_uom}</td>
                      <td className="text-right mono text-xs text-amber-DEFAULT">
                        {formatBaseCost(item.burdenedCost)}
                      </td>
                      <td className="text-center">
                        <CostBadge source={item.costSource} />
                      </td>
                      <td className="text-right mono text-xs text-ink-secondary">
                        {formatIDR(item.quantity * item.burdenedCost)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ── Transfer history ──────────────────────────────────────────────── */}
      <div className="panel">
        <div className="panel-header">
          <div className="flex items-center gap-3">
            <Clock size={15} className="text-amber-DEFAULT" />
            <h2 className="text-sm font-semibold text-ink-primary tracking-wide">Transfer History</h2>
            <span className="tag bg-surface-border text-ink-secondary">{transfers.length}</span>
          </div>
        </div>

        {transfers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-14 text-center gap-3">
            <div className="p-4 rounded-full bg-surface-raised">
              <ArrowLeftRight size={26} className="text-ink-disabled" />
            </div>
            <p className="text-sm font-medium text-ink-secondary">No transfers yet</p>
            <p className="text-xs text-ink-tertiary">Complete a transfer above to see it here.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Product</th>
                  <th>From</th>
                  <th className="flex items-center gap-1.5"><MapPin size={11} />To</th>
                  <th className="text-right">Qty</th>
                  <th>Unit</th>
                  <th className="text-right">Cost / Unit</th>
                  <th className="text-right">Total COGS</th>
                </tr>
              </thead>
              <tbody>
                {transfers.map((t) => {
                  const ing    = t.ingredient as { name: string; base_uom: string } | undefined;
                  const from   = t.from_outlet as { name: string } | undefined;
                  const to     = t.to_outlet   as { name: string } | undefined;
                  return (
                    <tr key={t.id}>
                      <td className="mono text-xs text-ink-secondary">{formatDate(t.transfer_date)}</td>
                      <td className="font-medium text-ink-primary">{ing?.name ?? '—'}</td>
                      <td className="text-xs text-ink-tertiary">{from?.name ?? '—'}</td>
                      <td className="text-xs font-medium text-ink-primary">{to?.name ?? '—'}</td>
                      <td className="text-right mono text-xs">{t.quantity.toLocaleString()}</td>
                      <td><span className="tag bg-surface-raised text-ink-tertiary">{t.unit}</span></td>
                      <td className="text-right mono text-xs text-amber-DEFAULT">
                        {formatBaseCost(t.burdened_cost_per_unit)}
                      </td>
                      <td className="text-right mono text-xs font-semibold text-emerald-400">
                        {formatIDR(t.total_cost)}
                      </td>
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
