import { useState, useEffect } from 'react';
import { Truck, PackageCheck, Clock, ChevronDown, Trash2, Factory, CheckCircle2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { Ingredient } from '../types';
import { formatIDR, formatBaseCost, formatDate } from '../utils/formatting';
import { OutboundForm, ReceiveForm } from './TollManufacturing.forms';
import type { TollOrder } from './TollManufacturing.types';

// ─── WIP Order Card ───────────────────────────────────────────────────────

function WipOrderCard({
  order,
  onReceived,
  onDelete,
}: {
  order: TollOrder;
  onReceived: () => void;
  onDelete: (id: string) => void;
}) {
  const [receiving, setReceiving] = useState(false);
  const daysSince = Math.floor(
    (Date.now() - new Date(order.outbound_date).getTime()) / 86_400_000
  );

  return (
    <div className={`panel transition-all ${receiving ? 'border-amber-dim/40' : ''}`}>
      <div className="p-4">
        {/* Header row */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 w-2 h-2 rounded-full bg-amber-DEFAULT shrink-0 ring-4 ring-amber-DEFAULT/20" />
            <div>
              <p className="text-sm font-semibold text-ink-primary">
                {order.ingredient?.name ?? '—'}
              </p>
              <p className="text-xs text-ink-tertiary mt-0.5">
                {order.grams_sent.toLocaleString()}g dispatched · {formatDate(order.outbound_date)}
                {daysSince > 0 && (
                  <span className="ml-2 text-amber-DEFAULT">
                    <Clock size={10} className="inline" /> {daysSince}d in transit
                  </span>
                )}
              </p>
              {order.notes && (
                <p className="text-xs text-ink-disabled mt-1 italic">{order.notes}</p>
              )}
            </div>
          </div>

          <div className="text-right shrink-0">
            <p className="text-xs text-ink-tertiary">WIP Value</p>
            <p className="mono text-sm font-bold text-ink-primary">{formatIDR(order.part_a_batch_cost)}</p>
            <p className="text-[10px] text-ink-disabled mono">@ {formatBaseCost(order.part_a_unit_cost)}/g</p>
          </div>
        </div>

        {/* Actions */}
        {!receiving && (
          <div className="flex items-center gap-2 mt-4 pt-3 border-t border-surface-border">
            <button className="btn-primary !text-xs !py-1.5 flex-1 justify-center" onClick={() => setReceiving(true)}>
              <PackageCheck size={13} /> Receive Finished Goods
            </button>
            <button className="btn-danger !py-1.5" onClick={() => onDelete(order.id)}>
              <Trash2 size={12} />
            </button>
          </div>
        )}
      </div>

      {/* Inline receive form */}
      {receiving && (
        <div className="px-4 pb-4">
          <ReceiveForm
            order={order}
            onSaved={() => { setReceiving(false); onReceived(); }}
            onCancel={() => setReceiving(false)}
          />
        </div>
      )}
    </div>
  );
}

// ─── Completed Orders Table ───────────────────────────────────────────────

function CompletedTable({ orders, onDelete }: { orders: TollOrder[]; onDelete: (id: string) => void }) {
  const [expanded, setExpanded] = useState(true);

  if (orders.length === 0) return null;

  return (
    <div className="panel">
      <div className="panel-header cursor-pointer select-none" onClick={() => setExpanded((x) => !x)}>
        <div className="flex items-center gap-3">
          <CheckCircle2 size={15} className="text-emerald-500" />
          <h3 className="text-sm font-semibold text-ink-primary tracking-wide">Completed Lots</h3>
          <span className="tag bg-surface-border text-ink-secondary">{orders.length}</span>
        </div>
        <ChevronDown size={16} className={`text-ink-tertiary transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </div>

      {expanded && (
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Outbound</th>
                <th>Inbound</th>
                <th>Raw Material</th>
                <th className="text-right">Grams Sent</th>
                <th className="text-right">Part A Cost</th>
                <th>Finished Product</th>
                <th className="text-right">Units</th>
                <th className="text-right">Labor</th>
                <th className="text-right">Logistics</th>
                <th className="text-right">Total Burdened</th>
                <th className="text-right">Cost / Unit</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id}>
                  <td className="mono text-xs text-ink-secondary">{formatDate(o.outbound_date)}</td>
                  <td className="mono text-xs text-ink-secondary">{o.inbound_date ? formatDate(o.inbound_date) : '—'}</td>
                  <td className="text-sm font-medium">{o.ingredient?.name ?? '—'}</td>
                  <td className="text-right mono text-xs">{o.grams_sent.toLocaleString()}</td>
                  <td className="text-right mono text-xs">{formatIDR(o.part_a_batch_cost)}</td>
                  <td>
                    <div className="flex flex-col">
                      <span className="text-sm font-medium">{o.product_name ?? '—'}</span>
                      {o.product_uom && (
                        <span className="tag bg-surface-raised text-ink-tertiary text-[10px] w-fit mt-0.5">{o.product_uom}</span>
                      )}
                    </div>
                  </td>
                  <td className="text-right mono text-xs">{o.units_received?.toLocaleString() ?? '—'}</td>
                  <td className="text-right mono text-xs">{o.bakery_labor_cost != null ? formatIDR(o.bakery_labor_cost) : '—'}</td>
                  <td className="text-right mono text-xs">{o.logistics_cost != null ? formatIDR(o.logistics_cost) : '—'}</td>
                  <td className="text-right mono text-xs font-semibold">{o.total_burdened_cost != null ? formatIDR(o.total_burdened_cost) : '—'}</td>
                  <td className="text-right mono text-xs font-bold text-amber-DEFAULT">
                    {o.cost_per_unit != null ? formatBaseCost(o.cost_per_unit) : '—'}
                  </td>
                  <td>
                    <button className="text-ink-disabled hover:text-red-400 transition-colors" onClick={() => onDelete(o.id)}>
                      <Trash2 size={12} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Summary Stats Bar ────────────────────────────────────────────────────

function StatsBar({ wip, completed }: { wip: TollOrder[]; completed: TollOrder[] }) {
  const wipValue = wip.reduce((s, o) => s + o.part_a_batch_cost, 0);
  const latestProduct = completed[0];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <div className="stat-card">
        <p className="field-label">WIP Orders</p>
        <p className="text-2xl font-bold text-ink-primary mono">{wip.length}</p>
        <p className="text-xs text-ink-tertiary">Awaiting receipt</p>
      </div>
      <div className="stat-card">
        <p className="field-label">Total WIP Value</p>
        <p className="text-xl font-bold text-amber-DEFAULT mono">{formatIDR(wipValue)}</p>
        <p className="text-xs text-ink-tertiary">Material at bakery</p>
      </div>
      <div className="stat-card">
        <p className="field-label">Completed Lots</p>
        <p className="text-2xl font-bold text-ink-primary mono">{completed.length}</p>
        <p className="text-xs text-ink-tertiary">Finished & costed</p>
      </div>
      <div className="stat-card">
        <p className="field-label">Latest Finished SKU</p>
        {latestProduct ? (
          <>
            <p className="text-sm font-bold text-emerald-400 truncate">{latestProduct.product_name}</p>
            <p className="text-xs text-ink-tertiary mono">
              {latestProduct.cost_per_unit != null ? `${formatBaseCost(latestProduct.cost_per_unit)} / ${latestProduct.product_uom}` : '—'}
            </p>
          </>
        ) : (
          <p className="text-sm text-ink-disabled">None yet</p>
        )}
      </div>
    </div>
  );
}

// ─── Module Export ────────────────────────────────────────────────────────

export default function TollManufacturing() {
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [wip,       setWip]       = useState<TollOrder[]>([]);
  const [completed, setCompleted] = useState<TollOrder[]>([]);

  const SELECT = `
    *,
    ingredient:ingredients!toll_manufacturing_orders_ingredient_id_fkey(id, name),
    finished_ingredient:ingredients!toll_manufacturing_orders_finished_ingredient_id_fkey(id, name, current_base_unit_cost)
  `;

  async function loadIngredients() {
    const { data } = await supabase.from('ingredients').select('*').order('name');
    setIngredients(data ?? []);
  }

  async function loadOrders() {
    const { data } = await supabase
      .from('toll_manufacturing_orders')
      .select(SELECT)
      .order('created_at', { ascending: false });

    const orders = (data as TollOrder[]) ?? [];
    setWip(orders.filter((o) => o.status === 'wip'));
    setCompleted(orders.filter((o) => o.status === 'received'));
  }

  async function deleteOrder(id: string) {
    if (!confirm('Delete this manufacturing order?')) return;
    await supabase.from('toll_manufacturing_orders').delete().eq('id', id);
    loadOrders();
  }

  async function handleReceived() {
    await Promise.all([loadOrders(), loadIngredients()]);
  }

  useEffect(() => {
    loadIngredients();
    loadOrders();
  }, []);

  return (
    <div className="max-w-screen-2xl mx-auto px-4 py-8 space-y-8">
      {/* Page header */}
      <div>
        <h1 className="text-xl font-semibold text-ink-primary tracking-tight flex items-center gap-2">
          <Factory size={20} className="text-amber-DEFAULT" />
          Toll Manufacturing Loop
        </h1>
        <p className="text-sm text-ink-tertiary mt-1">
          Track the full raw-material-to-finished-goods cycle. Outbound transfers log WIP value; inbound receipts calculate fully burdened cost per unit and publish the finished SKU to the ingredient master.
        </p>
      </div>

      {/* Stats */}
      <StatsBar wip={wip} completed={completed} />

      {/* Main two-column layout */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">

        {/* Left: Outbound form */}
        <div className="panel md:col-span-1">
          <div className="panel-header">
            <div className="flex items-center gap-2">
              <Truck size={15} className="text-amber-DEFAULT" />
              <h2 className="text-sm font-semibold text-ink-primary tracking-wide">Send to Toll Manufacturer</h2>
            </div>
          </div>
          <div className="p-5">
            <OutboundForm ingredients={ingredients} onSaved={loadOrders} />
          </div>
        </div>

        {/* Right: WIP orders */}
        <div className="space-y-4 md:col-span-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock size={14} className="text-amber-DEFAULT" />
              <h2 className="text-sm font-semibold text-ink-primary tracking-wide">WIP — At Bakery</h2>
              {wip.length > 0 && (
                <span className="tag bg-amber-dim/20 text-amber-DEFAULT">{wip.length} open</span>
              )}
            </div>
          </div>

          {wip.length === 0 ? (
            <div className="panel p-8 text-center text-ink-tertiary text-sm">
              No WIP orders. Log an outbound transfer to get started.
            </div>
          ) : (
            wip.map((order) => (
              <WipOrderCard
                key={order.id}
                order={order}
                onReceived={handleReceived}
                onDelete={deleteOrder}
              />
            ))
          )}
        </div>
      </div>

      {/* Completed lots */}
      <CompletedTable orders={completed} onDelete={deleteOrder} />

      {completed.length > 0 && (
        <div className="panel px-5 py-4 flex items-start gap-3 border-emerald-800/30 bg-emerald-900/10">
          <CheckCircle2 size={15} className="text-emerald-500 mt-0.5 shrink-0" />
          <p className="text-xs text-emerald-300 leading-relaxed">
            All finished SKUs above are available in the <strong>Ingredient master</strong> (Module 1) and can be added directly to any recipe in the <strong>BOM Recipe Builder</strong> (Module 4) with their fully burdened per-unit cost.
          </p>
        </div>
      )}
    </div>
  );
}
