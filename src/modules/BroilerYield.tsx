import { useState, useEffect } from 'react';
import { Plus, Flame, Trash2, AlertTriangle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { Ingredient, BroilerYield } from '../types';
import { formatIDR, formatBaseCost } from '../utils/formatting';
import SearchableSelect from '../components/SearchableSelect';

// ─── Live Calc Preview ────────────────────────────────────────────────────

interface CalcPreviewProps {
  apWeight: number;
  baseUnitCost: number;
  marinade: number;
  finalYield: number;
}

function CalcPreview({ apWeight, baseUnitCost, marinade, finalYield }: CalcPreviewProps) {
  const meatCost = apWeight * baseUnitCost;
  const totalCost = meatCost + marinade;
  const trueCost = finalYield > 0 ? Number((totalCost / finalYield).toFixed(4)) : null;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <div className="panel p-4">
        <p className="field-label">AP Meat Cost</p>
        <p className="mono text-sm font-semibold text-ink-primary">{formatIDR(meatCost)}</p>
        <p className="text-xs text-ink-tertiary mt-1">{apWeight}g × {formatBaseCost(baseUnitCost)}</p>
      </div>
      <div className="panel p-4">
        <p className="field-label">Total Pre-Cook Cost</p>
        <p className="mono text-sm font-semibold text-ink-primary">{formatIDR(totalCost)}</p>
        <p className="text-xs text-ink-tertiary mt-1">Meat + Marinade</p>
      </div>
      <div className="panel p-4">
        <p className="field-label">Final Shaved Yield</p>
        <p className="mono text-sm font-semibold text-ink-primary">{finalYield > 0 ? `${finalYield}g` : '—'}</p>
        {apWeight > 0 && finalYield > 0 && (
          <p className="text-xs text-ink-tertiary mt-1">
            {((finalYield / apWeight) * 100).toFixed(1)}% yield ratio
          </p>
        )}
      </div>
      <div className="panel p-4 border border-amber-dim/30">
        <p className="field-label text-amber-DEFAULT">True Cost / Gram</p>
        {trueCost !== null ? (
          <>
            <p className="mono text-sm font-bold text-amber-DEFAULT">{formatBaseCost(trueCost)}</p>
            <p className="text-xs text-ink-tertiary mt-1">per gram (post-cook)</p>
          </>
        ) : (
          <p className="mono text-sm font-semibold text-ink-disabled">—</p>
        )}
      </div>
    </div>
  );
}

// ─── Form ─────────────────────────────────────────────────────────────────

interface YieldFormState {
  name: string;
  base_meat_id: string;
  ap_weight: string;
  marinade_batch_cost: string;
  final_shaved_yield: string;
}

const EMPTY: YieldFormState = {
  name: '',
  base_meat_id: '',
  ap_weight: '',
  marinade_batch_cost: '0',
  final_shaved_yield: '',
};

interface FormProps {
  ingredients: Ingredient[];
  onSaved: () => void;
}

function YieldForm({ ingredients, onSaved }: FormProps) {
  const [form, setForm] = useState<YieldFormState>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (k: keyof YieldFormState, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const selectedMeat = ingredients.find((i) => i.id === form.base_meat_id);
  const apWeight = parseFloat(form.ap_weight) || 0;
  const marinade = parseFloat(form.marinade_batch_cost) || 0;
  const finalYield = parseFloat(form.final_shaved_yield) || 0;
  const baseUnitCost = selectedMeat?.current_base_unit_cost ?? 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.base_meat_id || !apWeight || !finalYield) {
      setError('Please fill all required fields.');
      return;
    }
    if (baseUnitCost === 0) {
      setError('Selected meat has no Base Unit Cost. Log an invoice purchase first.');
      return;
    }

    const totalCost = apWeight * baseUnitCost + marinade;
    const true_cost_per_gram = Number((totalCost / finalYield).toFixed(4));

    setSaving(true);
    setError(null);

    const { error: insErr } = await supabase.from('broiler_yields').insert({
      name: form.name.trim(),
      base_meat_id: form.base_meat_id,
      ap_weight: apWeight,
      marinade_batch_cost: marinade,
      final_shaved_yield: finalYield,
      true_cost_per_gram,
    });

    if (insErr) { setError(insErr.message); setSaving(false); return; }
    setForm(EMPTY);
    setSaving(false);
    onSaved();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && (
        <div className="px-4 py-3 rounded bg-red-900/30 border border-red-800/50 text-red-400 text-xs flex items-center gap-2">
          <AlertTriangle size={14} /> {error}
        </div>
      )}

      {/* Row 1 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="field-label">Yield Batch Name *</label>
          <input
            className="field-input"
            placeholder="e.g. Chicken Shawarma — Batch #12"
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
            required
          />
        </div>
        <div>
          <label className="field-label">Base Meat *</label>
          <SearchableSelect
            options={ingredients.map((i) => ({
              value: i.id,
              label: i.name + (i.current_base_unit_cost > 0 ? ` (${formatBaseCost(i.current_base_unit_cost)}/${i.base_uom})` : ' — no cost set'),
              group: i.category || undefined,
            }))}
            value={form.base_meat_id}
            onChange={(v) => set('base_meat_id', v)}
            placeholder="— Select protein —"
          />
          {selectedMeat && selectedMeat.current_base_unit_cost === 0 && (
            <p className="text-xs text-amber-DEFAULT mt-1 flex items-center gap-1">
              <AlertTriangle size={11} /> No cost set. Log an invoice for this item first.
            </p>
          )}
        </div>
      </div>

      {/* Row 2 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="field-label">AP Weight (grams) *</label>
          <input
            type="number" min="0" step="any"
            className="field-input"
            placeholder="e.g. 5000"
            value={form.ap_weight}
            onChange={(e) => set('ap_weight', e.target.value)}
            required
          />
        </div>
        <div>
          <label className="field-label">Marinade Batch Cost (IDR)</label>
          <input
            type="number" min="0" step="any"
            className="field-input"
            placeholder="e.g. 75000"
            value={form.marinade_batch_cost}
            onChange={(e) => set('marinade_batch_cost', e.target.value)}
          />
        </div>
        <div>
          <label className="field-label">Final Shaved Yield (grams) *</label>
          <input
            type="number" min="0" step="any"
            className="field-input"
            placeholder="e.g. 3800"
            value={form.final_shaved_yield}
            onChange={(e) => set('final_shaved_yield', e.target.value)}
            required
          />
        </div>
      </div>

      {/* Live calc */}
      {apWeight > 0 && selectedMeat && (
        <CalcPreview
          apWeight={apWeight}
          baseUnitCost={baseUnitCost}
          marinade={marinade}
          finalYield={finalYield}
        />
      )}

      <div className="flex justify-end">
        <button type="submit" className="btn-primary" disabled={saving}>
          <Plus size={14} /> {saving ? 'Saving…' : 'Save Yield Batch'}
        </button>
      </div>
    </form>
  );
}

// ─── Yield Records Table ──────────────────────────────────────────────────

function YieldRecords({ yields, onDelete }: { yields: BroilerYield[]; onDelete: (id: string) => void }) {
  if (yields.length === 0) return (
    <div className="panel p-8 text-center text-ink-tertiary text-sm">
      No yield batches saved yet.
    </div>
  );

  return (
    <div className="panel">
      <div className="panel-header">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-semibold text-ink-primary tracking-wide">Saved Yield Batches</h3>
          <span className="tag bg-surface-border text-ink-secondary">{yields.length}</span>
        </div>
        <p className="text-xs text-ink-tertiary">Available in Recipe Builder as costed protein components</p>
      </div>
      <div className="overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>Batch Name</th>
              <th>Base Meat</th>
              <th className="text-right">AP Weight (g)</th>
              <th className="text-right">Marinade Cost</th>
              <th className="text-right">Final Yield (g)</th>
              <th className="text-right">Yield %</th>
              <th className="text-right">True Cost / gram</th>
              <th className="w-10"></th>
            </tr>
          </thead>
          <tbody>
            {yields.map((y) => {
              const yieldPct = y.ap_weight > 0 ? ((y.final_shaved_yield / y.ap_weight) * 100).toFixed(1) : '—';
              return (
                <tr key={y.id}>
                  <td className="font-medium">{y.name}</td>
                  <td className="text-ink-secondary text-xs">{y.base_meat?.name ?? '—'}</td>
                  <td className="text-right mono text-xs">{y.ap_weight.toLocaleString()}</td>
                  <td className="text-right mono text-xs">{formatIDR(y.marinade_batch_cost)}</td>
                  <td className="text-right mono text-xs">{y.final_shaved_yield.toLocaleString()}</td>
                  <td className="text-right mono text-xs text-ink-secondary">{yieldPct}%</td>
                  <td className="text-right mono text-xs font-semibold text-amber-DEFAULT">
                    {formatBaseCost(y.true_cost_per_gram)}
                  </td>
                  <td>
                    <button
                      className="text-ink-disabled hover:text-red-400 transition-colors"
                      onClick={() => onDelete(y.id)}
                      title="Delete batch"
                    >
                      <Trash2 size={13} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Module Export ────────────────────────────────────────────────────────

export default function BroilerYield() {
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [yields, setYields] = useState<BroilerYield[]>([]);

  async function loadIngredients() {
    const { data } = await supabase.from('ingredients').select('*').eq('is_active', true).order('name');
    setIngredients(data ?? []);
  }

  async function loadYields() {
    const { data } = await supabase
      .from('broiler_yields')
      .select('*, base_meat:ingredients(id,name,current_base_unit_cost,base_uom,created_at)')
      .order('created_at', { ascending: false });
    setYields((data as BroilerYield[]) ?? []);
  }

  async function deleteYield(id: string) {
    if (!confirm('Delete this yield batch? It will be removed from any recipes using it.')) return;
    await supabase.from('broiler_yields').delete().eq('id', id);
    loadYields();
  }

  useEffect(() => {
    loadIngredients();
    loadYields();
  }, []);

  return (
    <div className="max-w-screen-2xl mx-auto px-4 py-8 space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-ink-primary tracking-tight">
          <span className="inline-flex items-center gap-2">
            <Flame size={20} className="text-amber-DEFAULT" />
            Vertical Broiler Yield Calculator
          </span>
        </h1>
        <p className="text-sm text-ink-tertiary mt-1">
          Calculate the true post-cook cost per gram of a protein batch. Saved batches are available as components in the Recipe Builder.
        </p>
      </div>

      <div className="panel">
        <div className="panel-header">
          <h2 className="text-sm font-semibold text-ink-primary tracking-wide">New Yield Batch</h2>
        </div>
        <div className="p-6">
          <YieldForm ingredients={ingredients} onSaved={loadYields} />
        </div>
      </div>

      <YieldRecords yields={yields} onDelete={deleteYield} />
    </div>
  );
}
