import { useState, useEffect, useMemo } from 'react';
import { Play, RotateCcw, Scale, Beaker, CheckCircle2, AlertTriangle, ChevronDown, Loader2, Sprout } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { CENTRAL_KITCHEN_NAME } from '../lib/constants';
import type { Recipe, RecipeItem, Ingredient } from '../types';
import { formatIDR } from '../utils/formatting';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ScaledLine {
  ingredient_id: string | null;
  broiler_yield_id: string | null;
  name: string;
  original_qty: number;
  scaled_qty: number;
  uom: string;
  unit_cost: number;
  line_total: number;
}

interface ProductionRunLog {
  id: string;
  recipe_name: string;
  multiplier: number;
  total_output_qty: number;
  output_uom: string;
  executed_at: string;
}

// ─── Utility ──────────────────────────────────────────────────────────────────

function formatWeight(grams: number): string {
  if (grams >= 1000) return `${(grams / 1000).toFixed(2)} kg`;
  return `${grams.toFixed(1)} g`;
}

// ─── Recipe Selector ──────────────────────────────────────────────────────────

function RecipeSelector({
  recipes,
  selectedId,
  onChange,
}: {
  recipes: Recipe[];
  selectedId: string;
  onChange: (id: string) => void;
}) {
  return (
    <div>
      <label className="field-label">Select Prep Batch Template</label>
      <div className="relative">
        <select
          className="field-select !pr-8"
          value={selectedId}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">-- Select a master recipe --</option>
          {recipes.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
              {r.batch_yield_qty ? ` (${r.batch_yield_qty} ${r.batch_yield_uom})` : ''}
            </option>
          ))}
        </select>
        <ChevronDown size={12} className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-tertiary pointer-events-none" />
      </div>
    </div>
  );
}

// ─── Live Prep Sheet Table ────────────────────────────────────────────────────

function PrepSheet({
  lines,
  multiplier,
  totalOutput,
  outputUom,
}: {
  lines: ScaledLine[];
  multiplier: number;
  totalOutput: number;
  outputUom: string;
}) {
  const totalCost = lines.reduce((s, l) => s + l.line_total, 0);

  return (
    <div className="panel">
      <div className="panel-header">
        <div className="flex items-center gap-3">
          <Beaker size={15} className="text-amber-DEFAULT" />
          <h3 className="text-sm font-semibold text-ink-primary tracking-wide">Live Prep Sheet</h3>
          <span className="tag bg-amber-DEFAULT/15 text-amber-DEFAULT font-mono">
            {multiplier.toFixed(3)}x
          </span>
        </div>
        <div className="flex items-center gap-3 text-xs text-ink-secondary">
          <span>Output: <span className="font-semibold text-ink-primary">{formatWeight(totalOutput)}</span> {outputUom !== 'gram' && `(${outputUom})`}</span>
          <span>Cost: <span className="font-semibold text-amber-DEFAULT">{formatIDR(totalCost)}</span></span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>Ingredient</th>
              <th className="text-right">Original</th>
              <th className="text-right">Scaled Target</th>
              <th>UOM</th>
              <th className="text-right">Unit Cost</th>
              <th className="text-right">Line Total</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line, i) => (
              <tr key={i}>
                <td className="font-medium">{line.name}</td>
                <td className="text-right mono text-xs text-ink-secondary">
                  {formatWeight(line.original_qty)}
                </td>
                <td className="text-right mono text-sm font-semibold text-ink-primary">
                  {formatWeight(line.scaled_qty)}
                </td>
                <td>
                  <span className="tag bg-surface-raised text-ink-tertiary">{line.uom}</span>
                </td>
                <td className="text-right mono text-xs text-ink-secondary">
                  {formatIDR(line.unit_cost)}
                </td>
                <td className="text-right mono text-xs text-amber-DEFAULT">
                  {formatIDR(line.line_total)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-surface-border">
              <td className="font-semibold text-ink-primary">Total</td>
              <td className="text-right mono text-xs text-ink-secondary">
                {formatWeight(lines.reduce((s, l) => s + l.original_qty, 0))}
              </td>
              <td className="text-right mono text-sm font-bold text-ink-primary">
                {formatWeight(lines.reduce((s, l) => s + l.scaled_qty, 0))}
              </td>
              <td></td>
              <td></td>
              <td className="text-right mono text-sm font-bold text-amber-DEFAULT">
                {formatIDR(totalCost)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

// ─── Recent Runs Log ──────────────────────────────────────────────────────────

function RecentRuns({ runs }: { runs: ProductionRunLog[] }) {
  if (runs.length === 0) return null;

  return (
    <div className="panel">
      <div className="panel-header">
        <h3 className="text-sm font-semibold text-ink-primary tracking-wide">Recent Production Runs</h3>
        <span className="tag bg-surface-border text-ink-secondary">{runs.length}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>Recipe</th>
              <th className="text-right">Multiplier</th>
              <th className="text-right">Output</th>
              <th>Executed</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((r) => (
              <tr key={r.id}>
                <td className="font-medium">{r.recipe_name}</td>
                <td className="text-right mono text-xs">{Number(r.multiplier).toFixed(3)}x</td>
                <td className="text-right mono text-xs">{formatWeight(Number(r.total_output_qty))}</td>
                <td className="text-xs text-ink-secondary">
                  {new Date(r.executed_at).toLocaleString('id-ID', {
                    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
                  })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Main Module ──────────────────────────────────────────────────────────────

export default function ProductionRun() {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [selectedRecipeId, setSelectedRecipeId] = useState('');
  const [bomItems, setBomItems] = useState<RecipeItem[]>([]);
  const [anchorInput, setAnchorInput] = useState('');
  const [executing, setExecuting] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ckOutletId, setCkOutletId] = useState<string | null>(null);
  const [recentRuns, setRecentRuns] = useState<ProductionRunLog[]>([]);
  const [loadingBom, setLoadingBom] = useState(false);
  const [seeding, setSeeding] = useState(false);

  // ─── Seed Master Marinades ────────────────────────────────────────────────
  async function seedMasterMarinades() {
    setSeeding(true);
    setError(null);
    setSuccess(null);

    try {
      // 1) Upsert ingredients and collect IDs
      const ingredientDefs = [
        { name: 'Raw Chicken (Trimmed)', base_uom: 'gram' },
        { name: 'Zero-Fat Greek Yogurt', base_uom: 'gram' },
        { name: 'Extra Virgin Olive Oil', base_uom: 'ml' },
        { name: 'Fresh Lemon Juice', base_uom: 'ml' },
        { name: 'Sea Salt', base_uom: 'gram' },
        { name: 'Fresh Garlic Paste', base_uom: 'gram' },
        { name: 'White Pepper', base_uom: 'gram' },
        { name: 'Bahraman Negin Saffron', base_uom: 'gram' },
        { name: 'Raw Beef (Trimmed)', base_uom: 'gram' },
        { name: 'Fermented Black Garlic', base_uom: 'gram' },
        { name: 'Antalya Re\u00E7elcisi', base_uom: 'ml' },
        { name: 'Cracked Black Pepper', base_uom: 'gram' },
      ];

      const { data: ingRows, error: ingErr } = await supabase
        .from('ingredients')
        .upsert(
          ingredientDefs.map((d) => ({ ...d, current_base_unit_cost: 0 })),
          { onConflict: 'name' }
        )
        .select('id, name');

      if (ingErr) throw new Error(`Ingredient upsert failed: ${ingErr.message}`);

      const ingMap = new Map<string, string>();
      (ingRows ?? []).forEach((r: { id: string; name: string }) => ingMap.set(r.name, r.id));

      // If upsert didn't return all rows (existing rows may not be returned), fetch missing
      if (ingMap.size < ingredientDefs.length) {
        const { data: allIngs } = await supabase
          .from('ingredients')
          .select('id, name')
          .in('name', ingredientDefs.map((d) => d.name));
        (allIngs ?? []).forEach((r: { id: string; name: string }) => ingMap.set(r.name, r.id));
      }

      // 2) Upsert recipes
      const recipeDefs = [
        { name: 'The Saffron Chicken (Raw Cone)', category: 'Prep Batch', batch_yield_qty: 11247.5, batch_yield_uom: 'gram' },
        { name: 'The Black Garlic Beef (Raw Cone)', category: 'Prep Batch', batch_yield_qty: 10880, batch_yield_uom: 'gram' },
      ];

      // Insert or fetch each recipe
      const recipeMap = new Map<string, string>();
      for (const rDef of recipeDefs) {
        const { data: existing } = await supabase
          .from('recipes')
          .select('id')
          .eq('name', rDef.name)
          .maybeSingle();

        if (existing) {
          recipeMap.set(rDef.name, (existing as { id: string }).id);
          await supabase.from('recipes').update(rDef).eq('id', (existing as { id: string }).id);
        } else {
          const { data: newR, error: rErr } = await supabase
            .from('recipes')
            .insert(rDef)
            .select('id')
            .single();
          if (rErr) throw new Error(`Recipe insert failed: ${rErr.message}`);
          recipeMap.set(rDef.name, (newR as { id: string }).id);
        }
      }

      // 3) Insert recipe items
      const saffronChickenId = recipeMap.get('The Saffron Chicken (Raw Cone)')!;
      const blackGarlicBeefId = recipeMap.get('The Black Garlic Beef (Raw Cone)')!;

      // Clear existing items for idempotency
      await supabase.from('recipe_items').delete().eq('recipe_id', saffronChickenId);
      await supabase.from('recipe_items').delete().eq('recipe_id', blackGarlicBeefId);

      const saffronItems = [
        { name: 'Raw Chicken (Trimmed)', qty: 10000 },
        { name: 'Zero-Fat Greek Yogurt', qty: 600 },
        { name: 'Extra Virgin Olive Oil', qty: 200 },
        { name: 'Fresh Lemon Juice', qty: 150 },
        { name: 'Sea Salt', qty: 150 },
        { name: 'Fresh Garlic Paste', qty: 120 },
        { name: 'White Pepper', qty: 25 },
        { name: 'Bahraman Negin Saffron', qty: 2.5 },
      ];

      const beefItems = [
        { name: 'Raw Beef (Trimmed)', qty: 10000 },
        { name: 'Fermented Black Garlic', qty: 250 },
        { name: 'Extra Virgin Olive Oil', qty: 200 },
        { name: 'Sea Salt', qty: 180 },
        { name: 'Antalya Re\u00E7elcisi', qty: 150 },
        { name: 'Fresh Lemon Juice', qty: 50 },
        { name: 'Cracked Black Pepper', qty: 50 },
      ];

      function buildItems(recipeId: string, items: { name: string; qty: number }[]) {
        return items.map((it) => ({
          recipe_id: recipeId,
          ingredient_id: ingMap.get(it.name) ?? null,
          quantity: it.qty,
          unit_cost: 0,
        }));
      }

      const { error: itemErr1 } = await supabase
        .from('recipe_items')
        .insert(buildItems(saffronChickenId, saffronItems));
      if (itemErr1) throw new Error(`Saffron Chicken items failed: ${itemErr1.message}`);

      const { error: itemErr2 } = await supabase
        .from('recipe_items')
        .insert(buildItems(blackGarlicBeefId, beefItems));
      if (itemErr2) throw new Error(`Black Garlic Beef items failed: ${itemErr2.message}`);

      setSuccess('Master Marinades Seeded Successfully');
      loadRecipes();
    } catch (err: unknown) {
      setError((err as Error).message ?? 'Seeding failed.');
    } finally {
      setSeeding(false);
    }
  }

  // Load Prep Batch recipes
  async function loadRecipes() {
    const { data } = await supabase
      .from('recipes')
      .select('*')
      .eq('category', 'Prep Batch')
      .order('name');
    setRecipes((data as Recipe[]) ?? []);
  }

  // Load CK outlet
  async function loadCkOutlet() {
    const { data } = await supabase
      .from('outlets')
      .select('id')
      .eq('name', CENTRAL_KITCHEN_NAME)
      .maybeSingle();
    if (data) setCkOutletId((data as { id: string }).id);
  }

  // Load recent runs
  async function loadRecentRuns() {
    const { data } = await supabase
      .from('production_runs')
      .select('id, recipe_name, multiplier, total_output_qty, output_uom, executed_at')
      .order('executed_at', { ascending: false })
      .limit(20);
    setRecentRuns((data as ProductionRunLog[]) ?? []);
  }

  useEffect(() => {
    loadRecipes();
    loadCkOutlet();
    loadRecentRuns();
  }, []);

  // Load BOM when recipe changes
  useEffect(() => {
    if (!selectedRecipeId) { setBomItems([]); return; }
    setLoadingBom(true);
    supabase
      .from('recipe_items')
      .select('*, ingredient:ingredients(*), broiler_yield:broiler_yields(*, base_meat:ingredients(*))')
      .eq('recipe_id', selectedRecipeId)
      .then(({ data }) => {
        setBomItems((data as RecipeItem[]) ?? []);
        setLoadingBom(false);
      });
    setAnchorInput('');
    setSuccess(null);
    setError(null);
  }, [selectedRecipeId]);

  // Derive the anchor ingredient (highest quantity in recipe)
  const anchor = useMemo(() => {
    if (bomItems.length === 0) return null;
    const sorted = [...bomItems].sort((a, b) => Number(b.quantity) - Number(a.quantity));
    const top = sorted[0];
    return {
      item: top,
      name: top.ingredient?.name ?? top.broiler_yield?.name ?? 'Unknown',
      original_qty: Number(top.quantity),
      uom: top.ingredient?.base_uom ?? 'gram',
    };
  }, [bomItems]);

  // Active recipe
  const activeRecipe = recipes.find((r) => r.id === selectedRecipeId) ?? null;

  // Scaling calculations
  const anchorActual = parseFloat(anchorInput) || 0;
  const multiplier = anchor && anchor.original_qty > 0 && anchorActual > 0
    ? anchorActual / anchor.original_qty
    : 0;

  const scaledLines: ScaledLine[] = useMemo(() => {
    if (multiplier === 0) return [];
    return bomItems.map((item) => {
      const qty = Number(item.quantity);
      const cost = Number(item.unit_cost);
      const scaled = qty * multiplier;
      return {
        ingredient_id: item.ingredient_id,
        broiler_yield_id: item.broiler_yield_id,
        name: item.ingredient?.name ?? item.broiler_yield?.name ?? 'Unknown',
        original_qty: qty,
        scaled_qty: scaled,
        uom: item.ingredient?.base_uom ?? 'gram',
        unit_cost: cost,
        line_total: scaled * cost,
      };
    });
  }, [bomItems, multiplier]);

  const totalOutput = useMemo(() => {
    if (!activeRecipe || multiplier === 0) return 0;
    if (activeRecipe.batch_yield_qty) {
      return Number(activeRecipe.batch_yield_qty) * multiplier;
    }
    return scaledLines.reduce((s, l) => s + l.scaled_qty, 0);
  }, [activeRecipe, multiplier, scaledLines]);

  const outputUom = activeRecipe?.batch_yield_uom ?? 'gram';

  // Execute production batch
  async function executeBatch() {
    if (!ckOutletId || !activeRecipe || multiplier === 0 || !anchor) return;

    setExecuting(true);
    setError(null);
    setSuccess(null);

    try {
      // A) Deduct all scaled ingredient quantities from CK inventory
      for (const line of scaledLines) {
        if (!line.ingredient_id) continue;
        // Read current stock
        const { data: inv } = await supabase
          .from('outlet_inventory')
          .select('quantity')
          .eq('outlet_id', ckOutletId)
          .eq('ingredient_id', line.ingredient_id)
          .maybeSingle();

        const currentQty = Number((inv as { quantity: number } | null)?.quantity ?? 0);
        const newQty = currentQty - line.scaled_qty;

        await supabase.from('outlet_inventory').upsert(
          {
            outlet_id: ckOutletId,
            ingredient_id: line.ingredient_id,
            quantity: newQty,
            base_uom: line.uom,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'outlet_id,ingredient_id' },
        );
      }

      // B) Increase the Prep Batch output stock
      // Find or reference the published ingredient for this recipe
      const { data: pubIng } = await supabase
        .from('ingredients')
        .select('id, base_uom')
        .eq('name', activeRecipe.name)
        .maybeSingle();

      if (pubIng) {
        const { data: outInv } = await supabase
          .from('outlet_inventory')
          .select('quantity')
          .eq('outlet_id', ckOutletId)
          .eq('ingredient_id', (pubIng as { id: string }).id)
          .maybeSingle();

        const currentOut = Number((outInv as { quantity: number } | null)?.quantity ?? 0);

        await supabase.from('outlet_inventory').upsert(
          {
            outlet_id: ckOutletId,
            ingredient_id: (pubIng as { id: string }).id,
            quantity: currentOut + totalOutput,
            base_uom: (pubIng as { base_uom: string }).base_uom,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'outlet_id,ingredient_id' },
        );
      }

      // C) Log the production run
      await supabase.from('production_runs').insert({
        recipe_id: activeRecipe.id,
        recipe_name: activeRecipe.name,
        anchor_ingredient_id: anchor.item.ingredient_id,
        anchor_original_qty: anchor.original_qty,
        anchor_actual_qty: anchorActual,
        multiplier,
        total_output_qty: totalOutput,
        output_uom: outputUom,
        outlet_id: ckOutletId,
      });

      setSuccess(
        `Batch executed: ${formatWeight(totalOutput)} of ${activeRecipe.name} produced at ${multiplier.toFixed(3)}x scale.`
      );
      setAnchorInput('');
      setSelectedRecipeId('');
      loadRecentRuns();
    } catch (err: unknown) {
      setError((err as Error).message ?? 'Batch execution failed.');
    } finally {
      setExecuting(false);
    }
  }

  return (
    <div className="max-w-screen-xl mx-auto px-4 py-8 space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-ink-primary tracking-tight">
            Dynamic Batch Scaling
          </h1>
          <p className="text-sm text-ink-tertiary mt-1">
            Scale master R&D recipes to match today's raw material availability. Select a Prep Batch, enter
            your actual anchor weight, and execute to deduct inventory and log output.
          </p>
        </div>
        <button
          className="shrink-0 flex items-center gap-2 px-4 py-2 rounded-md text-xs font-medium
                     bg-surface-card border border-surface-border text-ink-secondary
                     hover:border-amber-dim hover:text-amber-DEFAULT transition-colors"
          onClick={seedMasterMarinades}
          disabled={seeding}
        >
          {seeding ? <Loader2 size={13} className="animate-spin" /> : <Sprout size={13} />}
          {seeding ? 'Seeding...' : 'Seed Master Marinades'}
        </button>
      </div>

      {/* Toast messages */}
      {success && (
        <div className="flex items-center gap-3 px-5 py-4 rounded-lg bg-emerald-900/20 border border-emerald-800/40 animate-in fade-in">
          <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
          <p className="text-sm text-emerald-300 font-medium">{success}</p>
          <button
            className="ml-auto text-emerald-600 hover:text-emerald-400 transition-colors"
            onClick={() => setSuccess(null)}
          >
            <RotateCcw size={13} />
          </button>
        </div>
      )}
      {error && (
        <div className="flex items-center gap-3 px-5 py-4 rounded-lg bg-red-900/20 border border-red-800/40">
          <AlertTriangle size={16} className="text-red-400 shrink-0" />
          <p className="text-sm text-red-300">{error}</p>
        </div>
      )}

      {/* Configuration Panel */}
      <div className="panel">
        <div className="panel-header">
          <div className="flex items-center gap-3">
            <Scale size={15} className="text-amber-DEFAULT" />
            <h2 className="text-sm font-semibold text-ink-primary tracking-wide">Production Configuration</h2>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* Row 1: Recipe selector */}
          <RecipeSelector
            recipes={recipes}
            selectedId={selectedRecipeId}
            onChange={setSelectedRecipeId}
          />

          {/* Loading BOM */}
          {loadingBom && (
            <div className="flex items-center gap-2 text-sm text-ink-tertiary py-4">
              <Loader2 size={14} className="animate-spin" /> Loading recipe components...
            </div>
          )}

          {/* Anchor info + input */}
          {anchor && !loadingBom && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Anchor identifier */}
              <div className="p-4 rounded-lg bg-surface-raised border border-surface-border">
                <p className="field-label">Auto-Detected Anchor Ingredient</p>
                <p className="text-base font-semibold text-ink-primary mt-1">{anchor.name}</p>
                <p className="text-xs text-ink-tertiary mt-1">
                  Original recipe weight: <span className="mono font-medium text-ink-secondary">{formatWeight(anchor.original_qty)}</span>
                </p>
              </div>

              {/* Actual weight input */}
              <div className="p-4 rounded-lg bg-surface-raised border border-amber-dim/30">
                <label className="field-label">Actual Weight Available Today</label>
                <div className="flex items-center gap-3 mt-2">
                  <input
                    type="number"
                    min="0"
                    step="any"
                    className="field-input !text-lg mono font-semibold flex-1"
                    placeholder="e.g. 7500"
                    value={anchorInput}
                    onChange={(e) => setAnchorInput(e.target.value)}
                  />
                  <span className="tag bg-surface-border text-ink-secondary text-sm">{anchor.uom}</span>
                </div>
                {multiplier > 0 && (
                  <div className="mt-3 flex items-center gap-3">
                    <span className="text-xs text-ink-tertiary">Batch Multiplier:</span>
                    <span className="mono text-sm font-bold text-amber-DEFAULT">
                      {multiplier.toFixed(4)}x
                    </span>
                    {multiplier < 1 && (
                      <span className="tag bg-blue-900/30 text-blue-400 text-[10px]">Scaled down</span>
                    )}
                    {multiplier > 1 && (
                      <span className="tag bg-emerald-900/30 text-emerald-400 text-[10px]">Scaled up</span>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Live Prep Sheet */}
      {scaledLines.length > 0 && (
        <>
          <PrepSheet
            lines={scaledLines}
            multiplier={multiplier}
            totalOutput={totalOutput}
            outputUom={outputUom}
          />

          {/* Execute Button */}
          <div className="flex items-center justify-between p-5 rounded-lg bg-surface-card border border-surface-border">
            <div>
              <p className="text-sm font-medium text-ink-primary">Ready to execute production batch</p>
              <p className="text-xs text-ink-tertiary mt-0.5">
                This will deduct raw materials from Central Kitchen inventory and add {formatWeight(totalOutput)} of output stock.
              </p>
            </div>
            <button
              className="btn-primary !px-6 !py-2.5 !text-sm"
              onClick={executeBatch}
              disabled={executing || !ckOutletId}
            >
              {executing ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  Executing...
                </>
              ) : (
                <>
                  <Play size={14} />
                  Execute Production Batch
                </>
              )}
            </button>
          </div>
        </>
      )}

      {/* Recent Runs */}
      <RecentRuns runs={recentRuns} />
    </div>
  );
}
