import { useState, useEffect, useMemo } from 'react';
import { Plus, Trash2, BookOpen, Save, AlertTriangle, Package, X, Loader2, Upload, CheckCircle2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { Recipe, RecipeItem, Ingredient, BroilerYield, RecipeCategory } from '../types';
import { RECIPE_CATEGORIES, UOM_CONVERSIONS, BASE_UOMS } from '../types';
import { formatIDR, formatBaseCost } from '../utils/formatting';
import SearchableSelect from '../components/SearchableSelect';

// ─── Unit Conversion Helpers ─────────────────────────────────────────────────

const INPUT_UOM_OPTIONS: Record<string, string[]> = {
  gram: ['gram', 'kg'],
  ml: ['ml', 'liter'],
  piece: ['piece'],
};

function getConvertedQty(inputQty: number, inputUom: string): number {
  const conv = UOM_CONVERSIONS[inputUom];
  if (!conv) return inputQty;
  return inputQty * conv.multiplier;
}

// ─── BOM Item Row ────────────────────────────────────────────────────────────

function BomRow({
  item,
  onDelete,
}: {
  item: RecipeItem;
  onDelete: () => void;
}) {
  const label = item.ingredient?.name ?? item.broiler_yield?.name ?? '—';
  const isYield = !!item.broiler_yield_id;
  const isPkg = !isYield && item.ingredient?.category === 'Packaging';
  const uom = isYield ? 'g' : (item.ingredient?.base_uom ?? 'g');
  const lineTotal = Number(item.quantity) * Number(item.unit_cost);

  const tagClass = isPkg
    ? 'bg-blue-900/30 text-blue-400'
    : isYield
      ? 'bg-amber-dim/20 text-amber-DEFAULT'
      : 'bg-surface-raised text-ink-secondary';
  const tagLabel = isPkg ? 'pkg' : isYield ? 'yield' : 'raw';

  return (
    <tr className="group">
      <td>
        <div className="flex items-center gap-2">
          <span className={`tag text-[10px] ${tagClass}`}>{tagLabel}</span>
          <span className="font-medium text-sm">{label}</span>
        </div>
      </td>
      <td className="text-right mono text-xs">{item.quantity.toLocaleString()}</td>
      <td className="text-center text-xs text-ink-tertiary">{uom}</td>
      <td className="text-right mono text-xs text-ink-secondary">{formatBaseCost(item.unit_cost)}</td>
      <td className="text-right mono text-xs font-semibold text-ink-primary">{formatIDR(lineTotal)}</td>
      <td>
        <button
          className="opacity-0 group-hover:opacity-100 text-ink-disabled hover:text-red-400 transition-all"
          onClick={onDelete}
        >
          <X size={13} />
        </button>
      </td>
    </tr>
  );
}

// ─── Add BOM Item Form ───────────────────────────────────────────────────────

type ComponentType = 'ingredient' | 'broiler';

interface AddItemFormState {
  type: ComponentType;
  ingredient_id: string;
  broiler_yield_id: string;
  quantity: string;
  input_uom: string;
}

const EMPTY_ITEM: AddItemFormState = {
  type: 'ingredient',
  ingredient_id: '',
  broiler_yield_id: '',
  quantity: '',
  input_uom: 'gram',
};

function AddBomItem({
  ingredients,
  broilerYields,
  onAdd,
}: {
  ingredients: Ingredient[];
  broilerYields: BroilerYield[];
  onAdd: (ingredientId: string | null, yieldId: string | null, quantity: number, unitCost: number) => void;
}) {
  const [form, setForm] = useState<AddItemFormState>(EMPTY_ITEM);
  const [error, setError] = useState<string | null>(null);

  const set = (k: keyof AddItemFormState, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const selectedIng = form.type === 'ingredient'
    ? ingredients.find((i) => i.id === form.ingredient_id)
    : null;
  const selectedYield = form.type === 'broiler'
    ? broilerYields.find((y) => y.id === form.broiler_yield_id)
    : null;

  const availableUoms = selectedIng
    ? (INPUT_UOM_OPTIONS[selectedIng.base_uom] ?? [selectedIng.base_uom])
    : ['gram'];

  useEffect(() => {
    if (selectedIng) {
      setForm((f) => ({ ...f, input_uom: selectedIng.base_uom }));
    }
  }, [selectedIng?.id]);

  const rawQty = form.quantity === '' ? 0 : parseFloat(form.quantity);
  const baseQty = getConvertedQty(isNaN(rawQty) ? 0 : rawQty, form.input_uom);
  const unitCost = parseFloat(String(selectedIng?.current_base_unit_cost ?? selectedYield?.true_cost_per_gram ?? 0));
  const lineTotal = baseQty * unitCost;

  function handleAdd() {
    const hasSelection = form.type === 'ingredient' ? !!form.ingredient_id : !!form.broiler_yield_id;
    if (!hasSelection || !rawQty || isNaN(rawQty)) { setError('Select a component and enter a quantity.'); return; }
    if (unitCost === 0 && form.type === 'ingredient') {
      setError('This ingredient has no base cost. Log an invoice purchase first.');
      return;
    }
    setError(null);
    onAdd(
      form.type === 'ingredient' ? form.ingredient_id : null,
      form.type === 'broiler' ? form.broiler_yield_id : null,
      baseQty,
      unitCost,
    );
    setForm(EMPTY_ITEM);
  }

  return (
    <div className="p-4 border-t border-surface-border bg-surface-raised/40 space-y-3">
      {error && (
        <div className="flex items-center gap-2 text-xs text-red-400 px-3 py-2 bg-red-900/20 rounded border border-red-800/30">
          <AlertTriangle size={12} /> {error}
        </div>
      )}

      <div className="flex flex-wrap gap-3 items-end">
        {/* Type toggle */}
        <div>
          <label className="field-label">Type</label>
          <div className="flex gap-0.5 bg-surface-card rounded p-0.5 border border-surface-border">
            {(['ingredient', 'broiler'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setForm((f) => ({ ...f, type: t, ingredient_id: '', broiler_yield_id: '', quantity: '', input_uom: 'gram' }))}
                className={`px-2.5 py-1.5 rounded text-xs font-medium transition-colors ${
                  form.type === t
                    ? 'bg-surface-muted text-ink-primary'
                    : 'text-ink-tertiary hover:text-ink-secondary'
                }`}
              >
                {t === 'ingredient' ? 'Ingredient' : 'Yield'}
              </button>
            ))}
          </div>
        </div>

        {/* Selector */}
        <div className="flex-1 min-w-[200px]">
          <label className="field-label">
            {form.type === 'ingredient' ? 'Ingredient' : 'Yield Batch'}
          </label>
          {form.type === 'ingredient' ? (
            <SearchableSelect
              options={ingredients.map((i) => ({
                value: i.id,
                label: i.name + (i.current_base_unit_cost > 0 ? ` (${formatBaseCost(i.current_base_unit_cost)}/${i.base_uom})` : ' (no cost)'),
                group: i.category || undefined,
              }))}
              value={form.ingredient_id}
              onChange={(v) => set('ingredient_id', v)}
              placeholder="-- Select ingredient --"
            />
          ) : (
            <SearchableSelect
              options={broilerYields.map((y) => ({
                value: y.id,
                label: `${y.name} (${formatBaseCost(y.true_cost_per_gram)}/g)`,
              }))}
              value={form.broiler_yield_id}
              onChange={(v) => set('broiler_yield_id', v)}
              placeholder="-- Select yield batch --"
            />
          )}
        </div>

        {/* Quantity + UOM */}
        <div className="flex gap-2 items-end">
          <div className="w-28">
            <label className="field-label">Qty</label>
            <input
              type="number" min="0" step="any"
              className="field-input"
              placeholder="0"
              value={form.quantity}
              onChange={(e) => set('quantity', e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            />
          </div>
          {form.type === 'ingredient' && availableUoms.length > 1 ? (
            <div className="w-24">
              <label className="field-label">UOM</label>
              <select
                className="field-select !py-2.5"
                value={form.input_uom}
                onChange={(e) => set('input_uom', e.target.value)}
              >
                {availableUoms.map((u) => (
                  <option key={u} value={u}>{u}</option>
                ))}
              </select>
            </div>
          ) : (
            <div className="flex flex-col justify-end pb-0.5">
              <span className="field-label opacity-0 select-none">uom</span>
              <span className="inline-flex items-center h-[38px] px-2.5 rounded border border-surface-border bg-surface-raised text-xs font-medium text-ink-tertiary tracking-wide">
                {form.type === 'broiler' ? 'gram' : (selectedIng?.base_uom ?? '—')}
              </span>
            </div>
          )}
        </div>

        {/* Live preview */}
        {rawQty > 0 && unitCost > 0 && !isNaN(lineTotal) && (
          <div className="w-32">
            <label className="field-label">Line Total</label>
            <p className="mono text-sm font-semibold text-amber-DEFAULT py-2.5">{formatIDR(lineTotal)}</p>
          </div>
        )}

        <button className="btn-primary shrink-0 self-end" onClick={handleAdd}>
          <Plus size={14} /> Add
        </button>
      </div>

      {/* Conversion hint */}
      {form.input_uom !== (selectedIng?.base_uom ?? 'gram') && rawQty > 0 && (
        <p className="text-[11px] text-ink-tertiary ml-1">
          = {baseQty.toLocaleString()} {selectedIng?.base_uom} (auto-converted from {rawQty} {form.input_uom})
        </p>
      )}
    </div>
  );
}

// ─── Profitability Footer ────────────────────────────────────────────────────

function ProfitabilityDashboard({
  items,
  targetPrice,
  yieldPct,
}: {
  items: RecipeItem[];
  targetPrice: number;
  yieldPct: number;
}) {
  const { rawCost, pkgCost, totalCost } = useMemo(() => {
    let raw = 0;
    let pkg = 0;
    for (const item of items) {
      const line = Number(item.quantity) * Number(item.unit_cost);
      const isPkg = item.ingredient?.category === 'Packaging';
      if (isPkg) { pkg += line; }
      else { raw += line; }
    }
    return { rawCost: raw, pkgCost: pkg, totalCost: raw + pkg };
  }, [items]);

  const yieldFactor = (yieldPct > 0 && yieldPct <= 100) ? yieldPct / 100 : 1;
  const burdenedCogs = totalCost / yieldFactor;
  const grossMarginPct = targetPrice > 0 ? ((targetPrice - burdenedCogs) / targetPrice) * 100 : 0;
  const foodCostPct = targetPrice > 0 ? (burdenedCogs / targetPrice) * 100 : 0;

  const marginColor = grossMarginPct >= 70
    ? 'text-emerald-400 drop-shadow-[0_0_6px_rgba(52,211,153,0.6)]'
    : grossMarginPct < 65
      ? 'text-amber-DEFAULT'
      : 'text-ink-primary';

  return (
    <div className="border-t-2 border-amber-dim/40 bg-surface-raised/60 px-6 py-5">
      <p className="text-[10px] font-bold text-ink-tertiary uppercase tracking-[0.12em] mb-4">
        Profitability Analysis
      </p>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div>
          <p className="text-[10px] text-ink-tertiary uppercase tracking-widest mb-1">Raw Material</p>
          <p className="mono text-sm font-semibold text-ink-primary">{formatIDR(rawCost)}</p>
        </div>
        <div>
          <p className="text-[10px] text-ink-tertiary uppercase tracking-widest mb-1">Packaging</p>
          <p className="mono text-sm font-semibold text-ink-primary">{formatIDR(pkgCost)}</p>
        </div>
        <div>
          <p className="text-[10px] text-ink-tertiary uppercase tracking-widest mb-1">Burdened COGS</p>
          <p className="mono text-sm font-bold text-amber-DEFAULT">{formatIDR(burdenedCogs)}</p>
          {yieldPct < 100 && (
            <p className="text-[10px] text-ink-disabled mt-0.5">adj. for {yieldPct}% yield</p>
          )}
        </div>
        <div>
          <p className="text-[10px] text-ink-tertiary uppercase tracking-widest mb-1">Gross Margin</p>
          <p className={`mono text-sm font-bold ${marginColor}`}>
            {targetPrice > 0 ? `${grossMarginPct.toFixed(1)}%` : '--'}
          </p>
        </div>
        <div>
          <p className="text-[10px] text-ink-tertiary uppercase tracking-widest mb-1">Food Cost %</p>
          <p className="mono text-sm font-semibold text-ink-secondary">
            {targetPrice > 0 ? `${foodCostPct.toFixed(1)}%` : '--'}
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Batch Costing Footer (for Prep Batch recipes) ──────────────────────────

function BatchCostingFooter({
  items,
  yieldPct,
  batchYieldQty,
  batchYieldUom,
  recipeName,
  onPublish,
  publishing,
  published,
}: {
  items: RecipeItem[];
  yieldPct: number;
  batchYieldQty: number;
  batchYieldUom: string;
  recipeName: string;
  onPublish: () => void;
  publishing: boolean;
  published: boolean;
}) {
  const totalCost = useMemo(() => {
    return items.reduce((sum, i) => sum + Number(i.quantity) * Number(i.unit_cost), 0);
  }, [items]);

  const yieldFactor = (yieldPct > 0 && yieldPct <= 100) ? yieldPct / 100 : 1;
  const burdenedCogs = totalCost / yieldFactor;
  const costPerUnit = batchYieldQty > 0 ? burdenedCogs / batchYieldQty : 0;

  return (
    <div className="border-t-2 border-amber-dim/40 bg-surface-raised/60 px-6 py-5 space-y-4">
      <p className="text-[10px] font-bold text-ink-tertiary uppercase tracking-[0.12em]">
        Batch Costing
      </p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div>
          <p className="text-[10px] text-ink-tertiary uppercase tracking-widest mb-1">Total Raw Cost</p>
          <p className="mono text-sm font-semibold text-ink-primary">{formatIDR(totalCost)}</p>
        </div>
        <div>
          <p className="text-[10px] text-ink-tertiary uppercase tracking-widest mb-1">Burdened COGS</p>
          <p className="mono text-sm font-bold text-amber-DEFAULT">{formatIDR(burdenedCogs)}</p>
          {yieldPct < 100 && (
            <p className="text-[10px] text-ink-disabled mt-0.5">adj. for {yieldPct}% yield</p>
          )}
        </div>
        <div>
          <p className="text-[10px] text-ink-tertiary uppercase tracking-widest mb-1">Batch Output</p>
          <p className="mono text-sm font-semibold text-ink-primary">
            {batchYieldQty > 0 ? `${batchYieldQty.toLocaleString()} ${batchYieldUom}` : '--'}
          </p>
        </div>
        <div>
          <p className="text-[10px] text-ink-tertiary uppercase tracking-widest mb-1">Cost / {batchYieldUom || 'unit'}</p>
          <p className="mono text-sm font-bold text-emerald-400 drop-shadow-[0_0_6px_rgba(52,211,153,0.6)]">
            {costPerUnit > 0 ? formatBaseCost(costPerUnit) : '--'}
          </p>
        </div>
      </div>

      {/* Publish button */}
      <div className="flex items-center gap-3 pt-2 border-t border-surface-border/50">
        <button
          className="btn-primary border-2 border-emerald-500/40 !bg-emerald-600 hover:!bg-emerald-500"
          onClick={onPublish}
          disabled={publishing || costPerUnit === 0 || !recipeName.trim()}
        >
          {publishing
            ? <><Loader2 size={14} className="animate-spin" /> Publishing...</>
            : published
              ? <><CheckCircle2 size={14} /> Published</>
              : <><Upload size={14} /> Publish Batch to Ingredients</>
          }
        </button>
        {costPerUnit === 0 && (
          <span className="text-xs text-ink-tertiary">Set batch yield quantity to enable publishing.</span>
        )}
        {published && (
          <span className="text-xs text-emerald-400">
            Saved as "{recipeName}" in Ingredient Master.
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Recipe Configuration Card ───────────────────────────────────────────────

interface RecipeConfigProps {
  recipes: Recipe[];
  activeRecipe: Recipe | null;
  onSelect: (r: Recipe) => void;
  onCreate: (name: string) => void;
  onDelete: (id: string) => void;
  onSave: (updates: Partial<Recipe>) => void;
  saving: boolean;
}

function RecipeConfigCard({ recipes, activeRecipe, onSelect, onCreate, onDelete, onSave, saving }: RecipeConfigProps) {
  const [newName, setNewName] = useState('');
  const [name, setName] = useState('');
  const [category, setCategory] = useState<RecipeCategory | ''>('');
  const [price, setPrice] = useState('');
  const [yieldPct, setYieldPct] = useState('100');
  const [batchQty, setBatchQty] = useState('');
  const [batchUom, setBatchUom] = useState('gram');

  useEffect(() => {
    if (activeRecipe) {
      setName(activeRecipe.name);
      setCategory((activeRecipe.category as RecipeCategory) ?? '');
      setPrice(activeRecipe.target_sale_price?.toString() ?? '');
      setYieldPct(activeRecipe.expected_yield_pct?.toString() ?? '100');
      setBatchQty(activeRecipe.batch_yield_qty?.toString() ?? '');
      setBatchUom(activeRecipe.batch_yield_uom ?? 'gram');
    } else {
      setName('');
      setCategory('');
      setPrice('');
      setYieldPct('100');
      setBatchQty('');
      setBatchUom('gram');
    }
  }, [activeRecipe?.id]);

  function handleCreate() {
    const n = newName.trim();
    if (!n) return;
    onCreate(n);
    setNewName('');
  }

  function handleSave() {
    onSave({
      name: name.trim() || activeRecipe?.name,
      category: (category || null) as RecipeCategory | null,
      target_sale_price: parseFloat(price) || null,
      expected_yield_pct: parseFloat(yieldPct) || 100,
      batch_yield_qty: parseFloat(batchQty) || null,
      batch_yield_uom: category === 'Prep Batch' ? batchUom : null,
    });
  }

  return (
    <div className="panel flex flex-col sticky top-6">
      <div className="panel-header">
        <h2 className="text-sm font-bold text-ink-primary tracking-wide uppercase flex items-center gap-2">
          <BookOpen size={15} className="text-amber-DEFAULT" />
          Recipe Config
        </h2>
        <span className="tag bg-surface-border text-ink-secondary">{recipes.length}</span>
      </div>

      {/* Recipe selector list */}
      <div className="max-h-40 overflow-y-auto border-b border-surface-border">
        {recipes.length === 0 ? (
          <p className="text-center text-ink-tertiary text-xs py-4">No recipes yet.</p>
        ) : (
          <ul>
            {recipes.map((r) => (
              <li key={r.id}>
                <button
                  onClick={() => onSelect(r)}
                  className={`w-full flex items-center justify-between px-4 py-2.5 text-left border-b border-surface-border/50 transition-colors text-xs
                    ${activeRecipe?.id === r.id ? 'bg-surface-hover' : 'hover:bg-surface-hover'}`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {activeRecipe?.id === r.id && <div className="w-1 h-3 bg-amber-DEFAULT rounded-full shrink-0" />}
                    <span className={`truncate ${activeRecipe?.id === r.id ? 'text-ink-primary font-medium' : 'text-ink-secondary'}`}>
                      {r.name}
                    </span>
                    {r.category && (
                      <span className="tag text-[9px] bg-surface-muted text-ink-tertiary shrink-0">{r.category}</span>
                    )}
                  </div>
                  <button
                    className="text-ink-disabled hover:text-red-400 transition-colors p-0.5 shrink-0"
                    onClick={(e) => { e.stopPropagation(); onDelete(r.id); }}
                  >
                    <Trash2 size={11} />
                  </button>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Create new */}
      <div className="p-3 border-b border-surface-border flex gap-2">
        <input
          className="field-input !text-xs"
          placeholder="New recipe name..."
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
        />
        <button className="btn-primary shrink-0 !px-3 !py-1.5 !text-xs" onClick={handleCreate} disabled={!newName.trim()}>
          <Plus size={12} />
        </button>
      </div>

      {/* Config form */}
      {activeRecipe && (
        <div className="p-4 space-y-3.5">
          <div>
            <label className="field-label">Recipe Name</label>
            <input
              className="field-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div>
            <label className="field-label">Category</label>
            <select
              className="field-select"
              value={category}
              onChange={(e) => setCategory(e.target.value as RecipeCategory | '')}
            >
              <option value="">-- Select --</option>
              {RECIPE_CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="field-label">Target Sale Price (IDR)</label>
            <input
              type="number" min="0" step="any"
              className="field-input"
              placeholder="e.g. 45000"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
            />
          </div>

          {category === 'Prep Batch' && (
            <>
              <div>
                <label className="field-label">Batch Yield Quantity</label>
                <input
                  type="number" min="0" step="any"
                  className="field-input"
                  placeholder="e.g. 5000"
                  value={batchQty}
                  onChange={(e) => setBatchQty(e.target.value)}
                />
              </div>
              <div>
                <label className="field-label">Batch Yield UOM</label>
                <select
                  className="field-select"
                  value={batchUom}
                  onChange={(e) => setBatchUom(e.target.value)}
                >
                  {BASE_UOMS.map((u) => (
                    <option key={u} value={u}>{u}</option>
                  ))}
                </select>
              </div>
            </>
          )}

          <div>
            <label className="field-label">Expected Yield %</label>
            <div className="flex items-center gap-3">
              <input
                type="number" min="1" max="100" step="1"
                className="field-input w-24"
                value={yieldPct}
                onChange={(e) => setYieldPct(e.target.value)}
              />
              <span className="text-xs text-ink-tertiary flex-1">
                {parseFloat(yieldPct) < 100
                  ? `${(100 - parseFloat(yieldPct)).toFixed(0)}% cooking loss`
                  : 'No loss'}
              </span>
            </div>
          </div>

          <button
            className="btn-primary w-full justify-center mt-2"
            onClick={handleSave}
            disabled={saving}
          >
            {saving
              ? <><Loader2 size={14} className="animate-spin" /> Saving...</>
              : <><Save size={14} /> Save Recipe</>
            }
          </button>
        </div>
      )}

      {!activeRecipe && (
        <div className="p-6 flex flex-col items-center text-center gap-2">
          <BookOpen size={28} className="text-surface-muted" />
          <p className="text-xs text-ink-tertiary">Select or create a recipe to configure.</p>
        </div>
      )}
    </div>
  );
}

// ─── BOM Table Panel ─────────────────────────────────────────────────────────

interface BomPanelProps {
  recipe: Recipe;
  items: RecipeItem[];
  ingredients: Ingredient[];
  broilerYields: BroilerYield[];
  onAddItem: (ingredientId: string | null, yieldId: string | null, quantity: number, unitCost: number) => void;
  onDeleteItem: (id: string) => void;
  onPublishBatch: () => void;
  publishing: boolean;
  published: boolean;
}

function BomPanel({ recipe, items, ingredients, broilerYields, onAddItem, onDeleteItem, onPublishBatch, publishing, published }: BomPanelProps) {
  const totalCost = items.reduce((sum, i) => sum + i.quantity * i.unit_cost, 0);

  return (
    <div className="panel flex flex-col">
      {/* Header */}
      <div className="panel-header">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-bold text-ink-primary tracking-wide uppercase">
            Bill of Materials
          </h2>
          <span className="tag bg-surface-border text-ink-secondary">{items.length} items</span>
        </div>
        <div className="flex flex-col items-end">
          <p className="text-[10px] text-ink-tertiary uppercase tracking-widest">Total Cost</p>
          <p className="mono text-lg font-bold text-amber-DEFAULT">{formatIDR(totalCost)}</p>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto flex-1">
        <table className="data-table">
          <thead>
            <tr>
              <th>Component</th>
              <th className="text-right">Qty</th>
              <th className="text-center">UOM</th>
              <th className="text-right">Unit Cost</th>
              <th className="text-right">Line Total</th>
              <th className="w-8"></th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center text-ink-tertiary py-12 text-sm">
                  <div className="flex flex-col items-center gap-3">
                    <Package size={32} className="text-surface-muted" />
                    <div>
                      <p className="font-medium text-ink-secondary">No components yet</p>
                      <p className="text-xs text-ink-tertiary mt-1">
                        Add raw ingredients, yield batches, or packaging below.
                      </p>
                    </div>
                  </div>
                </td>
              </tr>
            )}
            {items.map((item) => (
              <BomRow key={item.id} item={item} onDelete={() => onDeleteItem(item.id)} />
            ))}
          </tbody>
          {items.length > 0 && (
            <tfoot>
              <tr>
                <td colSpan={4} className="text-right text-xs text-ink-tertiary uppercase tracking-widest">
                  Total BOM Cost
                </td>
                <td className="text-right mono font-bold text-amber-DEFAULT text-base">
                  {formatIDR(totalCost)}
                </td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* Add item form */}
      <AddBomItem ingredients={ingredients} broilerYields={broilerYields} onAdd={onAddItem} />

      {/* Footer: Batch Costing or Profitability Dashboard */}
      {items.length > 0 && recipe.category === 'Prep Batch' && (
        <BatchCostingFooter
          items={items}
          yieldPct={recipe.expected_yield_pct ?? 100}
          batchYieldQty={recipe.batch_yield_qty ?? 0}
          batchYieldUom={recipe.batch_yield_uom ?? 'gram'}
          recipeName={recipe.name}
          onPublish={onPublishBatch}
          publishing={publishing}
          published={published}
        />
      )}
      {items.length > 0 && recipe.category !== 'Prep Batch' && (
        <ProfitabilityDashboard
          items={items}
          targetPrice={recipe.target_sale_price ?? 0}
          yieldPct={recipe.expected_yield_pct ?? 100}
        />
      )}
    </div>
  );
}

// ─── Module Export ────────────────────────────────────────────────────────────

export default function RecipeBuilder() {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [broilerYields, setBroilerYields] = useState<BroilerYield[]>([]);
  const [activeRecipe, setActiveRecipe] = useState<Recipe | null>(null);
  const [bomItems, setBomItems] = useState<RecipeItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [published, setPublished] = useState(false);

  async function loadRecipes() {
    const { data } = await supabase
      .from('recipes')
      .select('*')
      .order('name');
    setRecipes(data ?? []);
  }

  async function loadIngredients() {
    const { data } = await supabase.from('ingredients').select('*').eq('is_active', true).order('name');
    setIngredients(data ?? []);
  }

  async function loadYields() {
    const { data } = await supabase
      .from('broiler_yields')
      .select('*, base_meat:ingredients(id,name,current_base_unit_cost,base_uom,created_at)')
      .order('name');
    setBroilerYields((data as BroilerYield[]) ?? []);
  }

  async function loadBomItems(recipeId: string) {
    const { data } = await supabase
      .from('recipe_items')
      .select(`
        *,
        ingredient:ingredients(id,name,current_base_unit_cost,base_uom,category,created_at),
        broiler_yield:broiler_yields(id,name,true_cost_per_gram,base_meat_id,ap_weight,marinade_batch_cost,final_shaved_yield,created_at)
      `)
      .eq('recipe_id', recipeId)
      .order('created_at');
    setBomItems((data as RecipeItem[]) ?? []);
  }

  async function createRecipe(name: string) {
    const { data } = await supabase.from('recipes').insert({ name }).select().maybeSingle();
    if (data) {
      await loadRecipes();
      setActiveRecipe(data);
    }
  }

  async function deleteRecipe(id: string) {
    if (!confirm('Delete this recipe and all its components?')) return;
    await supabase.from('recipes').delete().eq('id', id);
    if (activeRecipe?.id === id) {
      setActiveRecipe(null);
      setBomItems([]);
    }
    loadRecipes();
  }

  async function saveRecipeConfig(updates: Partial<Recipe>) {
    if (!activeRecipe) return;
    setSaving(true);
    const { data } = await supabase
      .from('recipes')
      .update({
        name: updates.name,
        category: updates.category,
        target_sale_price: updates.target_sale_price,
        expected_yield_pct: updates.expected_yield_pct,
        batch_yield_qty: updates.batch_yield_qty,
        batch_yield_uom: updates.batch_yield_uom,
      })
      .eq('id', activeRecipe.id)
      .select()
      .maybeSingle();
    if (data) {
      setActiveRecipe(data);
    }
    setSaving(false);
    setPublished(false);
    loadRecipes();
  }

  async function publishBatchToIngredients() {
    if (!activeRecipe || activeRecipe.category !== 'Prep Batch') return;
    const batchQty = activeRecipe.batch_yield_qty ?? 0;
    const batchUom = activeRecipe.batch_yield_uom ?? 'gram';
    if (batchQty <= 0) return;

    const totalCost = bomItems.reduce((sum, i) => sum + Number(i.quantity) * Number(i.unit_cost), 0);
    const yieldFactor = ((activeRecipe.expected_yield_pct ?? 100) / 100) || 1;
    const burdenedCogs = totalCost / yieldFactor;
    const costPerUnit = burdenedCogs / batchQty;

    setPublishing(true);
    const { data: existing } = await supabase
      .from('ingredients')
      .select('id')
      .eq('name', activeRecipe.name)
      .maybeSingle();

    if (existing) {
      await supabase
        .from('ingredients')
        .update({
          current_base_unit_cost: Number(costPerUnit.toFixed(4)),
          base_uom: batchUom,
          category: 'Prepared Sauces/Batches',
        })
        .eq('id', existing.id);
    } else {
      await supabase
        .from('ingredients')
        .insert({
          name: activeRecipe.name,
          current_base_unit_cost: Number(costPerUnit.toFixed(4)),
          base_uom: batchUom,
          category: 'Prepared Sauces/Batches',
        });
    }

    setPublishing(false);
    setPublished(true);
    loadIngredients();
  }

  async function addBomItem(ingredientId: string | null, yieldId: string | null, quantity: number, unitCost: number) {
    if (!activeRecipe) return;
    await supabase.from('recipe_items').insert({
      recipe_id: activeRecipe.id,
      ingredient_id: ingredientId,
      broiler_yield_id: yieldId,
      quantity,
      unit_cost: unitCost,
    });
    loadBomItems(activeRecipe.id);
  }

  async function deleteBomItem(id: string) {
    await supabase.from('recipe_items').delete().eq('id', id);
    if (activeRecipe) loadBomItems(activeRecipe.id);
  }

  useEffect(() => {
    loadRecipes();
    loadIngredients();
    loadYields();
  }, []);

  useEffect(() => {
    if (activeRecipe) {
      loadBomItems(activeRecipe.id);
    } else {
      setBomItems([]);
    }
    setPublished(false);
  }, [activeRecipe?.id]);

  return (
    <div className="max-w-screen-2xl mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-ink-primary tracking-tight flex items-center gap-2">
          <BookOpen size={20} className="text-amber-DEFAULT" />
          BOM Recipe Builder
        </h1>
        <p className="text-sm text-ink-tertiary mt-1">
          Assemble menu items from raw ingredients, yield batches, and packaging. COGS and profitability update live.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        <div className="lg:col-span-1">
          <RecipeConfigCard
            recipes={recipes}
            activeRecipe={activeRecipe}
            onSelect={setActiveRecipe}
            onCreate={createRecipe}
            onDelete={deleteRecipe}
            onSave={saveRecipeConfig}
            saving={saving}
          />
        </div>

        <div className="lg:col-span-2">
          {activeRecipe ? (
            <BomPanel
              recipe={activeRecipe}
              items={bomItems}
              ingredients={ingredients}
              broilerYields={broilerYields}
              onAddItem={addBomItem}
              onDeleteItem={deleteBomItem}
              onPublishBatch={publishBatchToIngredients}
              publishing={publishing}
              published={published}
            />
          ) : (
            <div className="panel p-16 flex flex-col items-center justify-center text-center gap-4">
              <div className="w-16 h-16 rounded-full bg-surface-raised border border-surface-border flex items-center justify-center">
                <BookOpen size={28} className="text-surface-muted" />
              </div>
              <div>
                <p className="text-sm font-medium text-ink-secondary">No recipe selected</p>
                <p className="text-xs text-ink-tertiary mt-1.5 max-w-xs">
                  Select a recipe from the configuration panel or create a new one to begin assembling its Bill of Materials.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
