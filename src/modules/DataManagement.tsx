import { useState, useEffect } from 'react';
import { Plus, Pencil, Trash2, Check, X, Building2, Wheat, AlertTriangle, CheckCircle, Archive, ArchiveRestore, Loader2, Zap } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { Vendor, Ingredient } from '../types';
import { UOM_CONVERSIONS } from '../types';
import { formatBaseCost } from '../utils/formatting';
import BulkImport from './BulkImport';

const CATEGORY_SUGGESTIONS = ['Dry Goods', 'Meat', 'Packaging', 'Produce', 'Dairy', 'Seafood', 'Spices & Seasonings'];

// ─── Inline Edit Cell ──────────────────────────────────────────────────────

function EditCell({
  value,
  onSave,
  onCancel,
}: {
  value: string;
  onSave: (v: string) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(value);

  return (
    <div className="flex items-center gap-2">
      <input
        className="field-input !py-1 !text-xs"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onSave(draft);
          if (e.key === 'Escape') onCancel();
        }}
        autoFocus
      />
      <button className="text-emerald-400 hover:text-emerald-300" onClick={() => onSave(draft)}>
        <Check size={14} />
      </button>
      <button className="text-ink-tertiary hover:text-ink-secondary" onClick={onCancel}>
        <X size={14} />
      </button>
    </div>
  );
}

// ─── Vendor Table ─────────────────────────────────────────────────────────

function VendorTable({ refreshTrigger }: { refreshTrigger?: number }) {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [newName, setNewName] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const { data, error } = await supabase
      .from('vendors')
      .select('*')
      .order('name');
    if (error) setError(error.message);
    else setVendors(data ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, [refreshTrigger]); // eslint-disable-line react-hooks/exhaustive-deps

  async function addVendor() {
    const name = newName.trim();
    if (!name) return;
    const { error } = await supabase.from('vendors').insert({ name });
    if (error) { setError(error.message); return; }
    setNewName('');
    load();
  }

  async function saveEdit(id: string, name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    const { error } = await supabase.from('vendors').update({ name: trimmed }).eq('id', id);
    if (error) { setError(error.message); return; }
    setEditId(null);
    load();
  }

  async function deleteVendor(id: string) {
    if (!confirm('Delete this vendor? Existing invoice lines will be affected.')) return;
    const { error } = await supabase.from('vendors').delete().eq('id', id);
    if (error) { setError(error.message); return; }
    load();
  }

  return (
    <div className="panel">
      <div className="panel-header">
        <div className="flex items-center gap-3">
          <Building2 size={16} className="text-amber-DEFAULT" />
          <h2 className="text-sm font-semibold text-ink-primary tracking-wide">Vendors</h2>
          <span className="tag bg-surface-border text-ink-secondary">{vendors.length}</span>
        </div>
      </div>

      {error && (
        <div className="mx-4 mt-4 px-4 py-3 rounded bg-red-900/30 border border-red-800/50 text-red-400 text-xs">
          {error}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>Vendor Name</th>
              <th>Added</th>
              <th className="w-24 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={3} className="text-center text-ink-tertiary py-8">Loading...</td>
              </tr>
            )}
            {!loading && vendors.length === 0 && (
              <tr>
                <td colSpan={3} className="text-center text-ink-tertiary py-8">No vendors yet.</td>
              </tr>
            )}
            {vendors.map((v) => (
              <tr key={v.id}>
                <td>
                  {editId === v.id ? (
                    <EditCell
                      value={v.name}
                      onSave={(n) => saveEdit(v.id, n)}
                      onCancel={() => setEditId(null)}
                    />
                  ) : (
                    <span className="font-medium">{v.name}</span>
                  )}
                </td>
                <td className="text-ink-tertiary text-xs mono">
                  {new Date(v.created_at).toLocaleDateString('id-ID')}
                </td>
                <td className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <button className="btn-ghost" onClick={() => setEditId(v.id)}>
                      <Pencil size={12} />
                    </button>
                    <button className="btn-danger" onClick={() => deleteVendor(v.id)}>
                      <Trash2 size={12} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add row */}
      <div className="px-4 py-3 border-t border-surface-border flex gap-2">
        <input
          className="field-input"
          placeholder="New vendor name…"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addVendor()}
        />
        <button className="btn-primary shrink-0" onClick={addVendor} disabled={!newName.trim()}>
          <Plus size={14} /> Add
        </button>
      </div>
    </div>
  );
}

// ─── Ingredient Table ─────────────────────────────────────────────────────

const UOM_OPTIONS = ['gram', 'kg', 'ml', 'liter', 'piece'];

interface IngredientFormState {
  name: string;
  base_uom: string;
  category: string;
  cost: string;
  calories: string;
  protein_g: string;
  carbs_g: string;
  fat_g: string;
}

const EMPTY_FORM: IngredientFormState = { name: '', base_uom: 'gram', category: '', cost: '', calories: '', protein_g: '', carbs_g: '', fat_g: '' };

function IngredientTable({ refreshTrigger }: { refreshTrigger?: number }) {
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [form, setForm] = useState<IngredientFormState>(EMPTY_FORM);
  const [editId, setEditId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<IngredientFormState>(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const { data, error } = await supabase
      .from('ingredients')
      .select('*')
      .order('name');
    if (error) setError(error.message);
    else setIngredients(data ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, [refreshTrigger]); // eslint-disable-line react-hooks/exhaustive-deps

  async function addIngredient() {
    const name = form.name.trim();
    if (!name) return;
    const { error } = await supabase.from('ingredients').insert({
      name,
      base_uom: form.base_uom,
      category: form.category.trim() || null,
      current_base_unit_cost: parseFloat(form.cost) || 0,
      calories: parseFloat(form.calories) || 0,
      protein_g: parseFloat(form.protein_g) || 0,
      carbs_g: parseFloat(form.carbs_g) || 0,
      fat_g: parseFloat(form.fat_g) || 0,
    });
    if (error) { setError(error.message); return; }
    setForm(EMPTY_FORM);
    load();
  }

  function startEdit(ing: Ingredient) {
    setEditId(ing.id);
    setEditForm({
      name: ing.name,
      base_uom: ing.base_uom,
      category: ing.category ?? '',
      calories: String(ing.calories ?? 0),
      protein_g: String(ing.protein_g ?? 0),
      carbs_g: String(ing.carbs_g ?? 0),
      fat_g: String(ing.fat_g ?? 0),
    });
  }

  async function saveEdit() {
    if (!editId || !editForm.name.trim()) return;
    const original = ingredients.find((i) => i.id === editId);
    const oldUom = original?.base_uom;
    const newUom = editForm.base_uom;

    const { error } = await supabase
      .from('ingredients')
      .update({
        name: editForm.name.trim(),
        base_uom: newUom,
        category: editForm.category.trim() || null,
        calories: parseFloat(editForm.calories) || 0,
        protein_g: parseFloat(editForm.protein_g) || 0,
        carbs_g: parseFloat(editForm.carbs_g) || 0,
        fat_g: parseFloat(editForm.fat_g) || 0,
      })
      .eq('id', editId);
    if (error) { setError(error.message); return; }

    // Cascade: if base_uom changed, convert recipe_items quantities
    if (oldUom && newUom && oldUom !== newUom) {
      const oldMult = UOM_CONVERSIONS[oldUom]?.multiplier ?? 1;
      const newMult = UOM_CONVERSIONS[newUom]?.multiplier ?? 1;
      // ratio: how many new-units per old-unit (e.g. gram→kg: 1/1000 = 0.001)
      const ratio = oldMult / newMult;
      if (ratio !== 1) {
        const { data: items } = await supabase
          .from('recipe_items')
          .select('id, quantity')
          .eq('ingredient_id', editId);
        if (items && items.length > 0) {
          await Promise.all(
            items.map((item) =>
              supabase
                .from('recipe_items')
                .update({ quantity: Number(item.quantity) * ratio })
                .eq('id', item.id)
            )
          );
        }
      }
    }

    setEditId(null);
    load();
  }

  async function toggleArchive(id: string, currentlyActive: boolean) {
    const { error } = await supabase
      .from('ingredients')
      .update({ is_active: !currentlyActive })
      .eq('id', id);
    if (error) { setError(error.message); return; }
    load();
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Permanently delete "${name}"? This cannot be undone.`)) return;
    const { error } = await supabase.from('ingredients').delete().eq('id', id);
    if (error) {
      if (error.code === '23503') {
        alert('Cannot delete: This item is currently tied to a recipe or invoice. Please use the Archive toggle to hide it instead.');
      } else {
        setError(error.message);
      }
      return;
    }
    setIngredients((prev) => prev.filter((i) => i.id !== id));
  }

  return (
    <div className="panel">
      <div className="panel-header">
        <div className="flex items-center gap-3">
          <Wheat size={16} className="text-amber-DEFAULT" />
          <h2 className="text-sm font-semibold text-ink-primary tracking-wide">Ingredients</h2>
          <span className="tag bg-surface-border text-ink-secondary">{ingredients.length}</span>
        </div>
      </div>

      {error && (
        <div className="mx-4 mt-4 px-4 py-3 rounded bg-red-900/30 border border-red-800/50 text-red-400 text-xs">
          {error}
        </div>
      )}

      {/* hidden datalist for category autocomplete */}
      <datalist id="category-suggestions">
        {CATEGORY_SUGGESTIONS.map((c) => <option key={c} value={c} />)}
      </datalist>

      <div className="overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>Ingredient Name</th>
              <th>Category</th>
              <th>Base UOM</th>
              <th className="text-right">Cost / unit</th>
              <th className="text-right">Cal</th>
              <th className="text-right">Protein</th>
              <th className="text-right">Carbs</th>
              <th className="text-right">Fat</th>
              <th className="w-24 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={9} className="text-center text-ink-tertiary py-8">Loading...</td>
              </tr>
            )}
            {!loading && ingredients.length === 0 && (
              <tr>
                <td colSpan={9} className="text-center text-ink-tertiary py-8">No ingredients yet.</td>
              </tr>
            )}
            {ingredients.map((ing) => (
              <tr key={ing.id} className={ing.is_active === false ? 'opacity-50' : ''}>
                {/* Name */}
                <td>
                  {editId === ing.id ? (
                    <input
                      className="field-input !py-1 !text-xs"
                      value={editForm.name}
                      onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                      onKeyDown={(e) => e.key === 'Enter' && saveEdit()}
                      autoFocus
                    />
                  ) : (
                    <span className="font-medium">
                      {ing.name}
                      {ing.is_active === false && (
                        <span className="ml-2 tag bg-red-900/30 text-red-400 text-[10px]">Archived</span>
                      )}
                    </span>
                  )}
                </td>

                {/* Category */}
                <td>
                  {editId === ing.id ? (
                    <input
                      className="field-input !py-1 !text-xs"
                      list="category-suggestions"
                      placeholder="e.g. Meat"
                      value={editForm.category}
                      onChange={(e) => setEditForm((f) => ({ ...f, category: e.target.value }))}
                    />
                  ) : (
                    ing.category
                      ? <span className="tag bg-surface-border text-ink-secondary">{ing.category}</span>
                      : <span className="text-ink-disabled text-xs">—</span>
                  )}
                </td>

                {/* Base UOM */}
                <td>
                  {editId === ing.id ? (
                    <select
                      className="field-select !py-1 !text-xs !w-auto"
                      value={editForm.base_uom}
                      onChange={(e) => setEditForm((f) => ({ ...f, base_uom: e.target.value }))}
                    >
                      {UOM_OPTIONS.map((u) => <option key={u} value={u}>{u}</option>)}
                    </select>
                  ) : (
                    <span className="tag bg-surface-raised text-ink-secondary">{ing.base_uom}</span>
                  )}
                </td>

                {/* Cost */}
                <td className="text-right">
                  {ing.current_base_unit_cost > 0 ? (
                    <span className="mono text-amber-DEFAULT text-xs">
                      {formatBaseCost(ing.current_base_unit_cost)}
                    </span>
                  ) : (
                    <span className="text-ink-disabled text-xs">Not set</span>
                  )}
                </td>

                {/* Macros */}
                <td className="text-right">
                  {editId === ing.id ? (
                    <input type="number" min="0" step="any" className="field-input !py-1 !text-xs !w-16 text-right" value={editForm.calories} onChange={(e) => setEditForm((f) => ({ ...f, calories: e.target.value }))} />
                  ) : (
                    <span className="mono text-xs text-ink-secondary">{Number(ing.calories) || 0}</span>
                  )}
                </td>
                <td className="text-right">
                  {editId === ing.id ? (
                    <input type="number" min="0" step="any" className="field-input !py-1 !text-xs !w-16 text-right" value={editForm.protein_g} onChange={(e) => setEditForm((f) => ({ ...f, protein_g: e.target.value }))} />
                  ) : (
                    <span className="mono text-xs text-ink-secondary">{Number(ing.protein_g) || 0}</span>
                  )}
                </td>
                <td className="text-right">
                  {editId === ing.id ? (
                    <input type="number" min="0" step="any" className="field-input !py-1 !text-xs !w-16 text-right" value={editForm.carbs_g} onChange={(e) => setEditForm((f) => ({ ...f, carbs_g: e.target.value }))} />
                  ) : (
                    <span className="mono text-xs text-ink-secondary">{Number(ing.carbs_g) || 0}</span>
                  )}
                </td>
                <td className="text-right">
                  {editId === ing.id ? (
                    <input type="number" min="0" step="any" className="field-input !py-1 !text-xs !w-16 text-right" value={editForm.fat_g} onChange={(e) => setEditForm((f) => ({ ...f, fat_g: e.target.value }))} />
                  ) : (
                    <span className="mono text-xs text-ink-secondary">{Number(ing.fat_g) || 0}</span>
                  )}
                </td>

                {/* Actions */}
                <td className="text-right">
                  {editId === ing.id ? (
                    <div className="flex items-center justify-end gap-1">
                      <button className="text-emerald-400 hover:text-emerald-300 p-1" onClick={saveEdit}>
                        <Check size={14} />
                      </button>
                      <button className="text-ink-tertiary hover:text-ink-secondary p-1" onClick={() => setEditId(null)}>
                        <X size={14} />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-end gap-1">
                      <button className="btn-ghost" onClick={() => startEdit(ing)}>
                        <Pencil size={12} />
                      </button>
                      <button
                        className={`btn-ghost ${ing.is_active === false ? '!text-emerald-500 hover:!text-emerald-400' : '!text-ink-tertiary hover:!text-amber-DEFAULT'}`}
                        onClick={() => toggleArchive(ing.id, ing.is_active !== false)}
                        title={ing.is_active === false ? 'Restore ingredient' : 'Archive ingredient'}
                      >
                        {ing.is_active === false ? <ArchiveRestore size={12} /> : <Archive size={12} />}
                      </button>
                      <button
                        className="btn-ghost !text-ink-disabled hover:!text-red-400 transition-colors"
                        onClick={() => handleDelete(ing.id, ing.name)}
                        title="Permanently delete"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add row */}
      <div className="px-4 py-3 border-t border-surface-border flex flex-wrap gap-2">
        <input
          className="field-input flex-1 min-w-32"
          placeholder="New ingredient name…"
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          onKeyDown={(e) => e.key === 'Enter' && addIngredient()}
        />
        <input
          className="field-input w-36 shrink-0"
          list="category-suggestions"
          placeholder="Category (optional)"
          value={form.category}
          onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
        />
        <select
          className="field-select !w-28 shrink-0"
          value={form.base_uom}
          onChange={(e) => setForm((f) => ({ ...f, base_uom: e.target.value }))}
        >
          {UOM_OPTIONS.map((u) => <option key={u} value={u}>{u}</option>)}
        </select>
        <input type="number" min="0" step="any" className="field-input !w-28 shrink-0" placeholder="Cost/unit" value={form.cost} onChange={(e) => setForm((f) => ({ ...f, cost: e.target.value }))} />
        <input type="number" min="0" step="any" className="field-input !w-20 shrink-0" placeholder="Cal" value={form.calories} onChange={(e) => setForm((f) => ({ ...f, calories: e.target.value }))} />
        <input type="number" min="0" step="any" className="field-input !w-20 shrink-0" placeholder="Prot (g)" value={form.protein_g} onChange={(e) => setForm((f) => ({ ...f, protein_g: e.target.value }))} />
        <input type="number" min="0" step="any" className="field-input !w-20 shrink-0" placeholder="Carbs (g)" value={form.carbs_g} onChange={(e) => setForm((f) => ({ ...f, carbs_g: e.target.value }))} />
        <input type="number" min="0" step="any" className="field-input !w-20 shrink-0" placeholder="Fat (g)" value={form.fat_g} onChange={(e) => setForm((f) => ({ ...f, fat_g: e.target.value }))} />
        <button className="btn-primary shrink-0" onClick={addIngredient} disabled={!form.name.trim()}>
          <Plus size={14} /> Add
        </button>
      </div>
    </div>
  );
}

// ─── Prep Batch Generator ─────────────────────────────────────────────────

const PREP_BATCHES = [
  { name: 'Saffron Water', yieldQty: 500, yieldUom: 'ml', source: 'Bahraman Negin Saffron', sourceQty: 1 },
  { name: 'Fermented Black Garlic', yieldQty: 750, yieldUom: 'gram', source: 'Garlic', sourceQty: 1000 },
  { name: 'Fresh Garlic Paste', yieldQty: 850, yieldUom: 'gram', source: 'Garlic', sourceQty: 1000 },
  { name: 'Fresh Lemon Juice', yieldQty: 400, yieldUom: 'ml', source: 'Local Lemon', sourceQty: 1000 },
];

function PrepBatchGenerator({ onGenerated }: { onGenerated: () => void }) {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{ success: string | null; error: string | null }>({ success: null, error: null });

  async function generate() {
    setRunning(true);
    setResult({ success: null, error: null });

    try {
      // Step 1: Look up source ingredients
      const sourceNames = [...new Set(PREP_BATCHES.map((b) => b.source))];
      const { data: sources, error: srcErr } = await supabase
        .from('ingredients')
        .select('id, name, current_base_unit_cost')
        .in('name', sourceNames);
      if (srcErr) throw new Error(`Source ingredient lookup failed: ${srcErr.message}`);

      const srcMap = new Map((sources ?? []).map((s) => [s.name, s]));
      const missing = sourceNames.filter((n) => !srcMap.has(n));
      if (missing.length > 0) throw new Error(`Source ingredients not found: ${missing.join(', ')}`);

      // Step 2: Calculate burdened costs and update derived ingredients
      const derivedNames = PREP_BATCHES.map((b) => b.name);
      const { data: derivedIngredients, error: dErr } = await supabase
        .from('ingredients')
        .select('id, name')
        .in('name', derivedNames);
      if (dErr) throw new Error(`Derived ingredient lookup failed: ${dErr.message}`);

      const derivedMap = new Map((derivedIngredients ?? []).map((d) => [d.name, d]));
      const missingDerived = derivedNames.filter((n) => !derivedMap.has(n));
      if (missingDerived.length > 0) throw new Error(`Derived ingredients not found in master list: ${missingDerived.join(', ')}. Import them first.`);

      for (const batch of PREP_BATCHES) {
        const src = srcMap.get(batch.source)!;
        const costPerUnit = (src.current_base_unit_cost * batch.sourceQty) / batch.yieldQty;
        const derived = derivedMap.get(batch.name)!;
        const { error: updErr } = await supabase
          .from('ingredients')
          .update({ current_base_unit_cost: costPerUnit })
          .eq('id', derived.id);
        if (updErr) throw new Error(`Failed to update cost for "${batch.name}": ${updErr.message}`);
      }

      // Step 3: Upsert recipes as Prep Batch
      for (const batch of PREP_BATCHES) {
        const { data: recipe, error: recErr } = await supabase
          .from('recipes')
          .upsert({
            name: batch.name,
            category: 'Prep Batch',
            batch_yield_qty: batch.yieldQty,
            batch_yield_uom: batch.yieldUom,
          }, { onConflict: 'name' })
          .select('id')
          .single();
        if (recErr) throw new Error(`Recipe upsert failed for "${batch.name}": ${recErr.message}`);

        // Clear existing BOM and re-insert
        await supabase.from('recipe_items').delete().eq('recipe_id', recipe.id);

        const src = srcMap.get(batch.source)!;
        const { error: bomErr } = await supabase.from('recipe_items').insert({
          recipe_id: recipe.id,
          ingredient_id: src.id,
          quantity: batch.sourceQty,
          unit_cost: src.current_base_unit_cost,
        });
        if (bomErr) throw new Error(`BOM insert failed for "${batch.name}": ${bomErr.message}`);
      }

      setResult({ success: `4 Prep Batches generated and costs updated successfully.`, error: null });
      onGenerated();
    } catch (e) {
      setResult({ success: null, error: (e as Error).message });
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="panel">
      <div className="panel-header">
        <div className="flex items-center gap-3">
          <Zap size={15} className="text-amber-DEFAULT" />
          <h2 className="text-sm font-semibold text-ink-primary tracking-wide">Auto-Generate Prep Batches</h2>
        </div>
      </div>
      <div className="p-6 space-y-4">
        <p className="text-xs text-ink-tertiary leading-relaxed">
          Generates <span className="text-ink-secondary font-medium">Saffron Water</span>,{' '}
          <span className="text-ink-secondary font-medium">Fermented Black Garlic</span>,{' '}
          <span className="text-ink-secondary font-medium">Fresh Garlic Paste</span>, and{' '}
          <span className="text-ink-secondary font-medium">Fresh Lemon Juice</span> as Prep Batch recipes.
          Calculates their per-unit cost from raw ingredient prices and updates the ingredient master.
        </p>

        {result.success && (
          <div className="flex items-start gap-3 px-4 py-3 rounded-lg bg-emerald-900/20 border border-emerald-800/40">
            <CheckCircle size={14} className="text-emerald-400 shrink-0 mt-0.5" />
            <p className="text-xs font-medium text-emerald-400">{result.success}</p>
          </div>
        )}
        {result.error && (
          <div className="flex items-start gap-3 px-4 py-3 rounded-lg bg-red-900/20 border border-red-800/40">
            <AlertTriangle size={14} className="text-red-400 shrink-0 mt-0.5" />
            <p className="text-xs text-red-300">{result.error}</p>
          </div>
        )}

        <button
          className="flex items-center gap-2 px-5 py-2.5 rounded-md text-xs font-semibold
                     bg-amber-DEFAULT/10 border border-amber-DEFAULT/30 text-amber-DEFAULT
                     hover:bg-amber-DEFAULT/20 hover:border-amber-DEFAULT/50 transition-colors"
          onClick={generate}
          disabled={running}
        >
          {running ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
          {running ? 'Generating...' : 'Generate Prep Batches'}
        </button>
      </div>
    </div>
  );
}

// ─── Module Export ────────────────────────────────────────────────────────

export default function DataManagement() {
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [purging, setPurging] = useState(false);
  const [purgeSuccess, setPurgeSuccess] = useState(false);
  const [purgeError, setPurgeError] = useState<string | null>(null);

  async function purgeAllIngredients() {
    if (!confirm('Are you sure? This will wipe all ingredients and empty current recipe BOMs.')) return;
    setPurging(true);
    setPurgeError(null);
    setPurgeSuccess(false);

    try {
      const { error: ilErr } = await supabase.from('invoice_lines').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      if (ilErr) throw new Error(`Failed to clear invoice_lines: ${ilErr.message}`);

      const { error: tmErr } = await supabase.from('toll_manufacturing_orders').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      if (tmErr) throw new Error(`Failed to clear toll_manufacturing_orders: ${tmErr.message}`);

      const { error: prErr } = await supabase.from('production_runs').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      if (prErr) throw new Error(`Failed to clear production_runs: ${prErr.message}`);

      const { error: riErr } = await supabase.from('recipe_items').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      if (riErr) throw new Error(`Failed to clear recipe_items: ${riErr.message}`);

      const { error: ingErr } = await supabase.from('ingredients').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      if (ingErr) throw new Error(`Failed to clear ingredients: ${ingErr.message}`);

      setPurgeSuccess(true);
      setRefreshTrigger((n) => n + 1);
      setTimeout(() => setPurgeSuccess(false), 4000);
    } catch (err: unknown) {
      setPurgeError((err as Error).message);
    } finally {
      setPurging(false);
    }
  }

  return (
    <div className="max-w-screen-2xl mx-auto px-4 py-8 space-y-8">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-ink-primary tracking-tight">Data Management</h1>
          <p className="text-sm text-ink-tertiary mt-1">
            Manage your approved vendor list and ingredient master. All dropdowns across modules pull from these tables.
          </p>
        </div>
        <button
          className="shrink-0 flex items-center gap-2 px-4 py-2 rounded-md text-xs font-semibold
                     bg-red-950/60 border border-red-800/50 text-red-400
                     hover:bg-red-900/40 hover:border-red-700/60 hover:text-red-300 transition-colors"
          onClick={purgeAllIngredients}
          disabled={purging}
        >
          {purging ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
          {purging ? 'Purging...' : 'Purge All Ingredients'}
        </button>
      </div>

      {purgeSuccess && (
        <div className="flex items-center gap-3 px-5 py-4 rounded-lg bg-emerald-900/20 border border-emerald-800/40">
          <CheckCircle size={16} className="text-emerald-400 shrink-0" />
          <p className="text-sm text-emerald-300 font-medium">Database Purged Successfully</p>
        </div>
      )}
      {purgeError && (
        <div className="flex items-center gap-3 px-5 py-4 rounded-lg bg-red-900/20 border border-red-800/40">
          <AlertTriangle size={16} className="text-red-400 shrink-0" />
          <p className="text-sm text-red-300">{purgeError}</p>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <VendorTable refreshTrigger={refreshTrigger} />
        <IngredientTable refreshTrigger={refreshTrigger} />
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <BulkImport onImported={() => setRefreshTrigger((n) => n + 1)} />
        <PrepBatchGenerator onGenerated={() => setRefreshTrigger((n) => n + 1)} />
      </div>
    </div>
  );
}
