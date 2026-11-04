import { useState, useEffect } from 'react';
import { Plus, Pencil, Trash2, Check, X, Building2, Wheat, Upload, FileText, AlertTriangle, CheckCircle, RefreshCw, Archive, ArchiveRestore, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { Vendor, Ingredient } from '../types';
import { UOM_CONVERSIONS } from '../types';
import { formatBaseCost } from '../utils/formatting';

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
}

const EMPTY_FORM: IngredientFormState = { name: '', base_uom: 'gram', category: '' };

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
    });
    if (error) { setError(error.message); return; }
    setForm(EMPTY_FORM);
    load();
  }

  function startEdit(ing: Ingredient) {
    setEditId(ing.id);
    setEditForm({ name: ing.name, base_uom: ing.base_uom, category: ing.category ?? '' });
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
              <th className="text-right">Current Base Cost / unit</th>
              <th className="w-24 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={5} className="text-center text-ink-tertiary py-8">Loading...</td>
              </tr>
            )}
            {!loading && ingredients.length === 0 && (
              <tr>
                <td colSpan={5} className="text-center text-ink-tertiary py-8">No ingredients yet.</td>
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
        <button className="btn-primary shrink-0" onClick={addIngredient} disabled={!form.name.trim()}>
          <Plus size={14} /> Add
        </button>
      </div>
    </div>
  );
}

// ─── Bulk Import ─────────────────────────────────────────────────────────────

interface ParsedRow {
  vendor: string;
  ingredientName: string;
  category: string;
  baseUom: string;
  cleanPrice: number;
}

interface ImportResult {
  vendorsCreated: number;
  ingredientsUpserted: number;
  errors: string[];
}

function parsePrice(raw: string): number {
  const s = String(raw ?? '').replace(/,/g, '').replace(/[^0-9.]/g, '');
  return parseFloat(s) || 0;
}

function parseCSVFile(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length === 0) return { headers: [], rows: [] };

  function parseLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { inQuotes = !inQuotes; continue; }
      if (ch === ',' && !inQuotes) { result.push(current.trim()); current = ''; continue; }
      current += ch;
    }
    result.push(current.trim());
    return result;
  }

  return { headers: parseLine(lines[0]), rows: lines.slice(1).map(parseLine) };
}

function BulkImport({ onImported }: { onImported: () => void }) {
  const [dragging,   setDragging]   = useState(false);
  const [parsedRows, setParsedRows] = useState<ParsedRow[] | null>(null);
  const [fileName,   setFileName]   = useState('');
  const [importing,  setImporting]  = useState(false);
  const [result,     setResult]     = useState<ImportResult | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);

  function handleFile(file: File) {
    if (!file.name.match(/\.csv$/i)) {
      setParseError('Only .csv files are supported.');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const { headers, rows } = parseCSVFile(text);

        // Case-insensitive header index lookup
        const hIdx: Record<string, number> = {};
        headers.forEach((h, i) => { hIdx[h.toLowerCase().trim()] = i; });

        const iVendor = hIdx['vendor']          ?? -1;
        const iName   = hIdx['ingredient name'] ?? -1;
        const iCat    = hIdx['category']        ?? -1;
        const iUom    = hIdx['base uom']        ?? -1;
        const iPrice  = hIdx['clean price']     ?? -1;

        if (iName === -1) {
          setParseError('Missing required column "Ingredient Name". Check that your CSV headers match exactly.');
          return;
        }

        const parsed: ParsedRow[] = [];
        for (const row of rows) {
          const ingredientName = (row[iName] ?? '').trim();
          if (!ingredientName) continue;
          parsed.push({
            vendor:         iVendor >= 0 ? (row[iVendor] ?? '').trim()  : '',
            ingredientName,
            category:       iCat    >= 0 ? (row[iCat]    ?? '').trim()  : '',
            baseUom:        iUom    >= 0 ? (row[iUom]    ?? '').trim()  : 'gram',
            cleanPrice:     iPrice  >= 0 ? parsePrice(row[iPrice] ?? '') : 0,
          });
        }

        if (parsed.length === 0) {
          setParseError('No valid data rows found. Make sure your CSV has data rows below the header.');
          return;
        }

        setParseError(null);
        setParsedRows(parsed);
        setFileName(file.name);
        setResult(null);
      } catch (err) {
        setParseError((err as Error).message ?? 'Failed to parse CSV.');
      }
    };
    reader.readAsText(file);
  }

  async function runImport() {
    if (!parsedRows?.length) return;
    setImporting(true);
    setResult(null);

    let vendorsCreated = 0;
    let ingredientsUpserted = 0;
    const errors: string[] = [];

    try {
      // ── Step 1: resolve vendor names → UUIDs ─────────────────────────────
      const uniqueVendorNames = [...new Set(parsedRows.map((r) => r.vendor).filter(Boolean))];
      const vendorMap = new Map<string, string>(); // lowercase name → uuid

      if (uniqueVendorNames.length > 0) {
        // Fetch already-existing vendors by exact name
        const { data: existing, error: fetchErr } = await supabase
          .from('vendors')
          .select('id, name')
          .in('name', uniqueVendorNames);
        if (fetchErr) throw new Error(`Vendor lookup failed: ${fetchErr.message}`);

        for (const v of existing ?? []) {
          vendorMap.set(v.name.toLowerCase(), v.id as string);
        }

        // Insert only the genuinely new ones
        const newNames = uniqueVendorNames.filter((n) => !vendorMap.has(n.toLowerCase()));
        if (newNames.length > 0) {
          const { data: created, error: insErr } = await supabase
            .from('vendors')
            .insert(newNames.map((name) => ({ name })))
            .select('id, name');
          if (insErr) throw new Error(`Vendor insert failed: ${insErr.message}`);
          for (const v of created ?? []) {
            vendorMap.set((v.name as string).toLowerCase(), v.id as string);
          }
          vendorsCreated = newNames.length;
        }
      }

      // ── Step 2: upsert ingredients (name is the conflict key) ────────────
      // Build insert objects — only include current_base_unit_cost when > 0
      // so existing costs are not overwritten by blank/zero Clean Price cells.
      const inserts = parsedRows.map((row) => {
        const base: Record<string, unknown> = {
          name:     row.ingredientName,
          category: row.category || null,
          base_uom: row.baseUom  || 'gram',
        };
        if (row.cleanPrice > 0) base.current_base_unit_cost = row.cleanPrice;
        return base;
      });

      const { data: upserted, error: ingErr } = await supabase
        .from('ingredients')
        .upsert(inserts, { onConflict: 'name' })
        .select('id');
      if (ingErr) throw new Error(`Ingredient upsert failed: ${ingErr.message}`);
      ingredientsUpserted = upserted?.length ?? inserts.length;

    } catch (err) {
      errors.push((err as Error).message);
    }

    setResult({ vendorsCreated, ingredientsUpserted, errors });
    setImporting(false);
    if (errors.length === 0) onImported();
  }

  function reset() {
    setParsedRows(null);
    setFileName('');
    setResult(null);
    setParseError(null);
  }

  return (
    <div className="panel">
      <div className="panel-header">
        <div className="flex items-center gap-3">
          <Upload size={15} className="text-amber-DEFAULT" />
          <h2 className="text-sm font-semibold text-ink-primary tracking-wide">Bulk Import — Master Ingredient List</h2>
        </div>
        {parsedRows && !result && (
          <button className="btn-ghost !text-xs" onClick={reset}>
            <RefreshCw size={11} /> Different file
          </button>
        )}
      </div>

      <div className="p-6 space-y-5">

        {/* Expected format hint */}
        <div className="flex items-start gap-3 px-4 py-3 rounded-lg bg-surface-raised border border-surface-border text-xs text-ink-tertiary">
          <FileText size={13} className="text-amber-DEFAULT shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold text-ink-secondary">Expected CSV headers (exact):</span>{' '}
            <code className="mono text-ink-secondary bg-surface-muted px-1 py-0.5 rounded text-[11px]">
              Vendor, Ingredient Name, Category, Base UOM, Clean Price
            </code>
            <p className="mt-1">
              Vendors are created automatically if they do not yet exist — no pre-setup required.
              Ingredients are upserted by name; existing records are updated with new category, UOM, and price.
            </p>
          </div>
        </div>

        {parseError && (
          <div className="flex items-center gap-2 px-4 py-3 rounded bg-red-900/30 border border-red-800/50 text-red-400 text-xs">
            <AlertTriangle size={13} className="shrink-0" /> {parseError}
          </div>
        )}

        {/* ── Drop zone ── */}
        {!parsedRows && !result && (
          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              const f = e.dataTransfer.files[0];
              if (f) handleFile(f);
            }}
            className={`border-2 border-dashed rounded-lg p-10 text-center cursor-pointer transition-colors
              ${dragging
                ? 'border-amber-dim bg-amber-dim/5'
                : 'border-surface-muted hover:border-surface-muted/80 hover:bg-surface-hover'
              }`}
            onClick={() => document.getElementById('dm-bulk-csv-input')?.click()}
          >
            <input
              id="dm-bulk-csv-input"
              type="file"
              accept=".csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
                e.target.value = '';
              }}
            />
            <div className="flex flex-col items-center gap-3">
              <Upload size={32} className="text-ink-tertiary" />
              <div>
                <p className="text-sm font-medium text-ink-secondary">Drop your .csv here or click to browse</p>
                <p className="text-xs text-ink-tertiary mt-1">Headers must match the format shown above</p>
              </div>
            </div>
          </div>
        )}

        {/* ── Preview table ── */}
        {parsedRows && !result && (
          <div className="space-y-4">
            {/* File info bar */}
            <div className="flex items-center gap-3 px-4 py-3 bg-surface-raised rounded border border-surface-border">
              <FileText size={14} className="text-amber-DEFAULT shrink-0" />
              <span className="text-sm font-medium text-ink-primary truncate max-w-xs">{fileName}</span>
              <span className="tag bg-surface-border text-ink-secondary shrink-0">{parsedRows.length} rows</span>
              <span className="tag bg-surface-border text-ink-secondary shrink-0">
                {[...new Set(parsedRows.map((r) => r.vendor).filter(Boolean))].length} vendors
              </span>
            </div>

            <div className="overflow-x-auto rounded border border-surface-border">
              <table className="data-table">
                <thead>
                  <tr>
                    <th className="w-8">#</th>
                    <th>Vendor</th>
                    <th>Ingredient Name</th>
                    <th>Category</th>
                    <th>Base UOM</th>
                    <th className="text-right">Clean Price</th>
                  </tr>
                </thead>
                <tbody>
                  {parsedRows.slice(0, 100).map((row, i) => (
                    <tr key={i}>
                      <td className="text-ink-disabled text-xs mono">{i + 1}</td>
                      <td className="text-ink-secondary text-xs">{row.vendor || <span className="text-ink-disabled">—</span>}</td>
                      <td className="font-medium text-ink-primary">{row.ingredientName}</td>
                      <td>
                        {row.category
                          ? <span className="tag bg-surface-border text-ink-secondary">{row.category}</span>
                          : <span className="text-ink-disabled text-xs">—</span>}
                      </td>
                      <td>
                        <span className="tag bg-surface-raised text-ink-secondary">{row.baseUom || 'gram'}</span>
                      </td>
                      <td className="text-right mono text-xs text-amber-DEFAULT">
                        {row.cleanPrice > 0
                          ? row.cleanPrice.toLocaleString()
                          : <span className="text-ink-disabled">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {parsedRows.length > 100 && (
                <p className="text-center text-xs text-ink-tertiary py-2 border-t border-surface-border">
                  Showing first 100 of {parsedRows.length} rows — all will be imported.
                </p>
              )}
            </div>

            <div className="flex items-center justify-between">
              <p className="text-xs text-ink-tertiary">
                <span className="text-emerald-400 font-medium">{parsedRows.length} ingredient{parsedRows.length !== 1 ? 's' : ''}</span> ready.
                New vendors will be created automatically.
              </p>
              <button className="btn-primary" onClick={runImport} disabled={importing}>
                {importing ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-surface-base border-t-transparent rounded-full animate-spin" />
                    Importing…
                  </>
                ) : (
                  <><CheckCircle size={14} /> Confirm &amp; Import</>
                )}
              </button>
            </div>
          </div>
        )}

        {/* ── Results ── */}
        {result && (
          <div className="space-y-4">
            {result.errors.length === 0 ? (
              <div className="flex items-start gap-3 px-5 py-4 rounded-lg bg-emerald-900/20 border border-emerald-800/40">
                <CheckCircle size={16} className="text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-emerald-400">Import complete</p>
                  <p className="text-xs text-ink-secondary mt-1">
                    {result.ingredientsUpserted} ingredient{result.ingredientsUpserted !== 1 ? 's' : ''} saved to the database
                    {result.vendorsCreated > 0 && (
                      <> · <span className="text-amber-DEFAULT">{result.vendorsCreated} new vendor{result.vendorsCreated !== 1 ? 's' : ''} created</span></>
                    )}
                  </p>
                </div>
              </div>
            ) : (
              <div className="px-5 py-4 rounded-lg bg-red-900/20 border border-red-800/40 space-y-2">
                <div className="flex items-center gap-2 text-red-400 text-sm font-semibold">
                  <AlertTriangle size={15} /> Import failed
                </div>
                {result.errors.map((e, i) => (
                  <p key={i} className="text-xs text-red-300 pl-4 border-l border-red-800">{e}</p>
                ))}
              </div>
            )}
            <div className="flex justify-end">
              <button className="btn-secondary !text-xs" onClick={reset}>
                <RefreshCw size={12} /> Import another file
              </button>
            </div>
          </div>
        )}
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
      <BulkImport onImported={() => setRefreshTrigger((n) => n + 1)} />
    </div>
  );
}
