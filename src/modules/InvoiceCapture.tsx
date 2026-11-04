import { useState, useEffect, useCallback } from 'react';
import { Plus, Upload, FileSpreadsheet, X, AlertTriangle, CheckCircle2, ChevronDown, Sparkles, Building2, Wheat, ArrowRight, RefreshCw, Lock } from 'lucide-react';
import * as XLSX from 'xlsx';
import { supabase } from '../lib/supabase';
import { CENTRAL_KITCHEN_NAME } from '../lib/constants';
import type { Vendor, Ingredient, InvoiceLine } from '../types';
import { INVOICE_UOMS, BASE_UOMS } from '../types';
import { formatIDR, formatBaseCost, formatDate, calcBaseUnitCost } from '../utils/formatting';
import SearchableSelect from '../components/SearchableSelect';

// ─── Types ────────────────────────────────────────────────────────────────

interface InvoiceFormState {
  date: string;
  vendor_id: string;
  item_id: string;
  invoice_qty: string;
  invoice_uom: string;
  total_invoice_price: string;
  freight_tax: string;
  base_uom: string;
  conversion_multiplier: string;
}

const EMPTY_FORM: InvoiceFormState = {
  date: new Date().toISOString().split('T')[0],
  vendor_id: '',
  item_id: '',
  invoice_qty: '',
  invoice_uom: 'kg',
  total_invoice_price: '',
  freight_tax: '0',
  base_uom: 'gram',
  conversion_multiplier: '',
};

// ─── Central Kitchen inventory helper ────────────────────────────────────
// Adds `deltaQty` to the given outlet's stock for the ingredient.
// Uses a read-then-write to preserve existing quantity (upsert replaces, not increments).

async function addToCkInventory(outletId: string, ingredientId: string, deltaQty: number, baseUom: string) {
  const { data } = await supabase
    .from('outlet_inventory')
    .select('quantity')
    .eq('outlet_id', outletId)
    .eq('ingredient_id', ingredientId)
    .maybeSingle();
  const current = (data as { quantity: number } | null)?.quantity ?? 0;
  await supabase.from('outlet_inventory').upsert(
    {
      outlet_id:     outletId,
      ingredient_id: ingredientId,
      quantity:      current + deltaQty,
      base_uom:      baseUom,
      updated_at:    new Date().toISOString(),
    },
    { onConflict: 'outlet_id,ingredient_id' },
  );
}

// ─── Derived math display ────────────────────────────────────────────────

function DerivedStats({ form }: { form: InvoiceFormState }) {
  const qty = parseFloat(form.invoice_qty) || 0;
  const price = parseFloat(form.total_invoice_price) || 0;
  const freight = parseFloat(form.freight_tax) || 0;
  const mult = parseFloat(form.conversion_multiplier) || 0;

  const landed = price + freight;
  const baseCost = qty > 0 && mult > 0 ? calcBaseUnitCost(price, freight, qty, mult) : null;

  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="panel p-4">
        <p className="field-label">Total Landed Cost</p>
        <p className="mono text-lg font-semibold text-ink-primary">{formatIDR(landed)}</p>
        <p className="text-xs text-ink-tertiary mt-1">Invoice + Freight &amp; Tax</p>
      </div>
      <div className="panel p-4">
        <p className="field-label">Base Unit Cost</p>
        {baseCost !== null ? (
          <>
            <p className="mono text-lg font-semibold text-amber-DEFAULT">{formatBaseCost(baseCost)}</p>
            <p className="text-xs text-ink-tertiary mt-1">per {form.base_uom}</p>
          </>
        ) : (
          <p className="mono text-lg font-semibold text-ink-disabled">—</p>
        )}
      </div>
    </div>
  );
}

// ─── Manual Entry Form ────────────────────────────────────────────────────

interface FormProps {
  vendors: Vendor[];
  ingredients: Ingredient[];
  ckOutletId: string;
  onSaved: () => void;
}

function InvoiceForm({ vendors, ingredients, ckOutletId, onSaved }: FormProps) {
  const [form, setForm] = useState<InvoiceFormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (key: keyof InvoiceFormState, val: string) =>
    setForm((f) => ({ ...f, [key]: val }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const qty = parseFloat(form.invoice_qty);
    const price = parseFloat(form.total_invoice_price);
    const freight = parseFloat(form.freight_tax) || 0;
    const mult = parseFloat(form.conversion_multiplier);

    if (!form.vendor_id || !form.item_id || !qty || !price || !mult) {
      setError('Please fill all required fields.');
      return;
    }

    const total_landed_cost = price + freight;
    const base_unit_cost = calcBaseUnitCost(price, freight, qty, mult);

    setSaving(true);
    setError(null);

    const { error: insErr } = await supabase.from('invoice_lines').insert({
      date: form.date,
      vendor_id: form.vendor_id,
      item_id: form.item_id,
      invoice_qty: qty,
      invoice_uom: form.invoice_uom,
      total_invoice_price: price,
      freight_tax: freight,
      base_uom: form.base_uom,
      conversion_multiplier: mult,
      total_landed_cost,
      base_unit_cost,
      outlet_id: ckOutletId,
    });

    if (insErr) { setError(insErr.message); setSaving(false); return; }

    await supabase
      .from('ingredients')
      .update({ current_base_unit_cost: base_unit_cost })
      .eq('id', form.item_id);

    // Add converted quantity to Central Kitchen inventory
    await addToCkInventory(ckOutletId, form.item_id, qty * mult, form.base_uom);

    setForm(EMPTY_FORM);
    setSaving(false);
    onSaved();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="px-4 py-3 rounded bg-red-900/30 border border-red-800/50 text-red-400 text-xs flex items-center gap-2">
          <AlertTriangle size={14} /> {error}
        </div>
      )}

      {/* Row 1 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-4">
        <div>
          <label className="field-label">Date *</label>
          <input type="date" className="field-input" value={form.date} onChange={(e) => set('date', e.target.value)} required />
        </div>
        <div>
          <label className="field-label">Vendor *</label>
          <select className="field-select" value={form.vendor_id} onChange={(e) => set('vendor_id', e.target.value)} required>
            <option value="">— Select vendor —</option>
            {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
        </div>
        <div>
          <label className="field-label">Item / Ingredient *</label>
          <SearchableSelect
            options={ingredients.map((i) => ({ value: i.id, label: i.name, group: i.category || undefined }))}
            value={form.item_id}
            onChange={(v) => set('item_id', v)}
            placeholder="— Select ingredient —"
          />
        </div>
      </div>

      {/* Row 2 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div>
          <label className="field-label">Invoice Qty *</label>
          <input type="number" min="0" step="any" className="field-input" placeholder="e.g. 50" value={form.invoice_qty} onChange={(e) => set('invoice_qty', e.target.value)} required />
        </div>
        <div>
          <label className="field-label">Invoice UOM *</label>
          <select className="field-select" value={form.invoice_uom} onChange={(e) => set('invoice_uom', e.target.value)}>
            {INVOICE_UOMS.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        </div>
        <div>
          <label className="field-label">Base UOM *</label>
          <select className="field-select" value={form.base_uom} onChange={(e) => set('base_uom', e.target.value)}>
            {BASE_UOMS.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        </div>
        <div>
          <label className="field-label">Conversion Multiplier *</label>
          <input type="number" min="0" step="any" className="field-input" placeholder="e.g. 1000" value={form.conversion_multiplier} onChange={(e) => set('conversion_multiplier', e.target.value)} required />
        </div>
      </div>

      {/* Row 3 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label className="field-label">Total Invoice Price (IDR) *</label>
          <input type="number" min="0" step="any" className="field-input" placeholder="e.g. 2500000" value={form.total_invoice_price} onChange={(e) => set('total_invoice_price', e.target.value)} required />
        </div>
        <div>
          <label className="field-label">Freight &amp; Tax (IDR)</label>
          <input type="number" min="0" step="any" className="field-input" placeholder="e.g. 50000" value={form.freight_tax} onChange={(e) => set('freight_tax', e.target.value)} />
        </div>
      </div>

      {/* Derived */}
      <DerivedStats form={form} />

      <div className="flex justify-end">
        <button type="submit" className="btn-primary" disabled={saving}>
          <Plus size={14} /> {saving ? 'Saving…' : 'Add Invoice Line'}
        </button>
      </div>
    </form>
  );
}

// ─── Bulk Upload ──────────────────────────────────────────────────────────

// ── Shared types ──────────────────────────────────────────────────────────

interface UploadResult { imported: number; skipped: number; errors: string[]; }

interface StagedRow {
  rowNum: number;
  rawDate: unknown;
  vendorName: string;
  itemName: string;
  rawQty: unknown;
  rawInvUom: unknown;
  rawPrice: unknown;
  rawFreight: unknown;
  rawBaseUom: unknown;
  rawMult: unknown;
}

interface UnmappedData {
  vendors: string[];
  ingredients: string[];
  stagedRows: StagedRow[];
}

// ── Column mapping types ──────────────────────────────────────────────────

interface ColumnMap {
  date: string;
  vendor: string;
  item: string;
  invoice_qty: string;
  invoice_uom: string;
  total_invoice_price: string;
  freight_tax: string;
  base_uom: string;
  conversion_multiplier: string;
}
type ColumnMapKey = keyof ColumnMap;

interface FieldDef {
  key: ColumnMapKey;
  label: string;
  required: boolean;
  hint: string;
}

interface FileState {
  name: string;
  rowCount: number;
  headers: string[];
  allRows: unknown[][];
}

// ── Field definitions ────────────────────────────────────────────────────

const FIELD_DEFINITIONS: FieldDef[] = [
  { key: 'date',                 label: 'Date',                     required: true,  hint: 'Invoice or purchase date' },
  { key: 'vendor',               label: 'Vendor',                   required: true,  hint: 'Supplier name' },
  { key: 'item',                 label: 'Item / Ingredient',        required: true,  hint: 'Material or product name' },
  { key: 'invoice_qty',          label: 'Invoice Qty',              required: true,  hint: 'Quantity as invoiced' },
  { key: 'total_invoice_price',  label: 'Total Invoice Price (IDR)',required: true,  hint: 'Pre-freight/tax invoice value' },
  { key: 'conversion_multiplier',label: 'Conversion Multiplier',   required: true,  hint: 'Units per invoice qty (e.g. 1000 g/kg)' },
  { key: 'invoice_uom',          label: 'Invoice UOM',              required: false, hint: 'Defaults to "kg"' },
  { key: 'freight_tax',          label: 'Freight & Tax (IDR)',      required: false, hint: 'Defaults to 0' },
  { key: 'base_uom',             label: 'Base UOM',                 required: false, hint: 'Defaults to "gram"' },
];

const REQUIRED_FIELDS = FIELD_DEFINITIONS.filter((f) => f.required);
const OPTIONAL_FIELDS = FIELD_DEFINITIONS.filter((f) => !f.required);

// ── Fuzzy auto-matching ───────────────────────────────────────────────────

const FIELD_KEYWORDS: Record<ColumnMapKey, string[]> = {
  date:                  ['date', 'tanggal', 'tgl', 'invoice date', 'tanggal invoice', 'dt'],
  vendor:                ['vendor', 'supplier', 'pemasok', 'distributor', 'nama vendor', 'nama supplier'],
  item:                  ['item', 'ingredient', 'bahan', 'produk', 'product', 'material', 'barang', 'nama bahan', 'nama item'],
  invoice_qty:           ['qty', 'quantity', 'jumlah', 'kuantitas', 'banyak', 'invoice qty', 'amount qty'],
  invoice_uom:           ['invoice uom', 'uom', 'satuan', 'unit', 'unit of measure', 'satuan invoice', 'unit invoice'],
  total_invoice_price:   ['price', 'harga', 'total price', 'invoice price', 'total invoice', 'nilai', 'amount', 'harga total', 'total harga', 'subtotal', 'nilai invoice'],
  freight_tax:           ['freight', 'tax', 'pajak', 'ongkos', 'ongkir', 'biaya', 'shipping', 'freight tax', 'biaya pengiriman', 'ppn'],
  base_uom:              ['base uom', 'base unit', 'satuan dasar', 'uom dasar', 'unit dasar'],
  conversion_multiplier: ['conversion', 'multiplier', 'konversi', 'faktor', 'factor', 'conversion multiplier', 'faktor konversi', 'conversion factor', 'multiply'],
};

function fuzzyScore(header: string, keywords: string[]): number {
  const h = header.toLowerCase().trim();
  for (const kw of keywords) {
    if (h === kw)                              return 4; // exact
    if (h.startsWith(kw) || kw.startsWith(h)) return 3; // prefix
    if (h.includes(kw))                        return 2; // substring match
    if (kw.includes(h) && h.length > 2)        return 1; // reverse substring
  }
  return 0;
}

function autoMap(headers: string[]): ColumnMap {
  const result: Partial<ColumnMap> = {};
  for (const key of Object.keys(FIELD_KEYWORDS) as ColumnMapKey[]) {
    let best = '';
    let bestScore = 0;
    for (const h of headers) {
      const s = fuzzyScore(h, FIELD_KEYWORDS[key]);
      if (s > bestScore) { bestScore = s; best = h; }
    }
    result[key] = bestScore > 0 ? best : '';
  }
  return result as ColumnMap;
}

// ── Shared commit helpers ─────────────────────────────────────────────────

function buildInsert(
  row: StagedRow,
  vendorMap: Map<string, string>,
  ingredientMap: Map<string, string>,
): object | string {
  const vendor_id = vendorMap.get(row.vendorName.toLowerCase());
  const item_id   = ingredientMap.get(row.itemName.toLowerCase());
  if (!vendor_id) return `Row ${row.rowNum}: Vendor "${row.vendorName}" could not be resolved.`;
  if (!item_id)   return `Row ${row.rowNum}: Item "${row.itemName}" could not be resolved.`;

  const qty     = parseFloat(String(row.rawQty    ?? 0));
  const price   = parseFloat(String(row.rawPrice  ?? 0));
  const freight = parseFloat(String(row.rawFreight ?? 0)) || 0;
  const mult    = parseFloat(String(row.rawMult   ?? 0));

  if (!qty || !price || !mult)
    return `Row ${row.rowNum}: Invalid numeric values (qty, price, or multiplier is zero/missing).`;

  let dateStr = '';
  if (row.rawDate instanceof Date) {
    dateStr = row.rawDate.toISOString().split('T')[0];
  } else {
    const parsed = new Date(String(row.rawDate));
    dateStr = isNaN(parsed.getTime()) ? new Date().toISOString().split('T')[0] : parsed.toISOString().split('T')[0];
  }

  return {
    date: dateStr,
    vendor_id,
    item_id,
    invoice_qty: qty,
    invoice_uom: String(row.rawInvUom ?? 'kg').trim() || 'kg',
    total_invoice_price: price,
    freight_tax: freight,
    base_uom: String(row.rawBaseUom ?? 'gram').trim() || 'gram',
    conversion_multiplier: mult,
    total_landed_cost: price + freight,
    base_unit_cost: calcBaseUnitCost(price, freight, qty, mult),
    // outlet_id is injected by commitInserts using the live-fetched ckOutletId
  };
}

async function commitInserts(
  inserts: object[],
  ckOutletId: string,
  onDone: () => void,
  setResult: (r: UploadResult) => void,
  extraErrors: string[],
) {
  // Stamp the live-fetched Central Kitchen outlet ID onto every row
  const stamped = inserts.map((row) => ({ ...(row as object), outlet_id: ckOutletId }));

  const { error } = await supabase.from('invoice_lines').insert(stamped);
  if (error) { setResult({ imported: 0, skipped: extraErrors.length, errors: [error.message, ...extraErrors] }); return; }

  const lastCostMap = new Map<string, number>();
  const ckQtyMap = new Map<string, { qty: number; base_uom: string }>();

  for (const ins of stamped as { item_id: string; base_unit_cost: number; invoice_qty: number; conversion_multiplier: number; base_uom: string }[]) {
    lastCostMap.set(ins.item_id, ins.base_unit_cost);
    const converted = ins.invoice_qty * ins.conversion_multiplier;
    const entry = ckQtyMap.get(ins.item_id);
    if (entry) { entry.qty += converted; }
    else { ckQtyMap.set(ins.item_id, { qty: converted, base_uom: ins.base_uom }); }
  }

  await Promise.all([
    ...Array.from(lastCostMap.entries()).map(([id, cost]) =>
      supabase.from('ingredients').update({ current_base_unit_cost: cost }).eq('id', id)
    ),
    ...Array.from(ckQtyMap.entries()).map(([id, { qty, base_uom }]) =>
      addToCkInventory(ckOutletId, id, qty, base_uom)
    ),
  ]);

  onDone();
  setResult({ imported: stamped.length, skipped: extraErrors.length, errors: extraErrors });
}

// ── Column Mapping UI ────────────────────────────────────────────────────

function MappingRow({
  field,
  headers,
  value,
  onChange,
}: {
  field: FieldDef;
  headers: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  const matched = !!value;
  return (
    <div className="grid grid-cols-[1fr_20px_1fr] items-center gap-3 py-2 border-b border-surface-border last:border-0">
      {/* Field label */}
      <div className="flex items-center gap-2 min-w-0">
        <span
          className={`w-2 h-2 rounded-full shrink-0 transition-colors ${
            matched ? 'bg-emerald-500' : field.required ? 'bg-red-500' : 'bg-surface-muted'
          }`}
        />
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-medium text-ink-primary truncate">{field.label}</span>
            {field.required && <span className="text-red-400 text-xs shrink-0">*</span>}
          </div>
          <p className="text-[10px] text-ink-disabled truncate">{field.hint}</p>
        </div>
      </div>

      {/* Arrow */}
      <ArrowRight size={12} className={`shrink-0 transition-colors ${matched ? 'text-emerald-600' : 'text-surface-muted'}`} />

      {/* Dropdown */}
      <select
        className={`field-select !py-1.5 !text-xs transition-colors ${
          !matched && field.required ? '!border-red-800/60 !bg-red-900/10' : ''
        }`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">— not mapped —</option>
        {headers.map((h) => (
          <option key={h} value={h}>{h}</option>
        ))}
      </select>
    </div>
  );
}

function ColumnMappingUI({
  fileState,
  columnMap,
  onChange,
  onProcess,
  onReset,
  processing,
}: {
  fileState: FileState;
  columnMap: ColumnMap;
  onChange: (key: ColumnMapKey, value: string) => void;
  onProcess: () => void;
  onReset: () => void;
  processing: boolean;
}) {
  const unmappedRequired = REQUIRED_FIELDS.filter((f) => !columnMap[f.key]);
  const canProcess = unmappedRequired.length === 0;
  const autoMatchedCount = FIELD_DEFINITIONS.filter((f) => !!columnMap[f.key]).length;

  return (
    <div className="space-y-4">
      {/* File info bar */}
      <div className="flex items-center justify-between px-4 py-3 bg-surface-raised rounded border border-surface-border">
        <div className="flex items-center gap-3">
          <FileSpreadsheet size={15} className="text-amber-DEFAULT shrink-0" />
          <span className="text-sm font-medium text-ink-primary truncate max-w-[200px]">{fileState.name}</span>
          <span className="tag bg-surface-border text-ink-secondary shrink-0">{fileState.rowCount} rows</span>
          <span className="tag bg-surface-border text-ink-secondary shrink-0">{fileState.headers.length} columns</span>
        </div>
        <button className="btn-ghost !text-xs shrink-0" onClick={onReset}>
          <RefreshCw size={11} /> Different file
        </button>
      </div>

      {/* Auto-match summary */}
      <div className={`flex items-center gap-2 px-4 py-2.5 rounded border text-xs ${
        autoMatchedCount === FIELD_DEFINITIONS.length
          ? 'bg-emerald-900/20 border-emerald-800/40 text-emerald-400'
          : 'bg-amber-dim/5 border-amber-dim/30 text-amber-DEFAULT'
      }`}>
        <Sparkles size={12} />
        {autoMatchedCount} of {FIELD_DEFINITIONS.length} fields auto-matched from your column headers.
        {autoMatchedCount < FIELD_DEFINITIONS.length && ' Review and correct any mismatches below.'}
      </div>

      {/* Mapping grid */}
      <div className="panel">
        <div className="panel-header !py-3">
          <p className="text-xs font-semibold text-ink-primary tracking-wide uppercase">Map Columns</p>
          <p className="text-xs text-ink-tertiary">Your file's headers → our required fields</p>
        </div>

        <div className="px-4">
          {/* Required */}
          <p className="field-label pt-4 pb-1">Required Fields</p>
          {REQUIRED_FIELDS.map((f) => (
            <MappingRow key={f.key} field={f} headers={fileState.headers} value={columnMap[f.key]} onChange={(v) => onChange(f.key, v)} />
          ))}

          {/* Optional */}
          <p className="field-label pt-5 pb-1">
            Optional Fields
            <span className="normal-case tracking-normal font-normal text-ink-disabled ml-1">
              — default values used if not mapped
            </span>
          </p>
          {OPTIONAL_FIELDS.map((f) => (
            <MappingRow key={f.key} field={f} headers={fileState.headers} value={columnMap[f.key]} onChange={(v) => onChange(f.key, v)} />
          ))}
          <div className="py-2" />
        </div>
      </div>

      {/* Process row */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-ink-tertiary">
          {!canProcess ? (
            <span className="text-red-400">
              <AlertTriangle size={11} className="inline mr-1" />
              {unmappedRequired.length} required field{unmappedRequired.length !== 1 ? 's' : ''} not mapped:{' '}
              {unmappedRequired.map((f) => f.label).join(', ')}
            </span>
          ) : (
            <span className="text-emerald-400">
              <CheckCircle2 size={11} className="inline mr-1" />
              All required fields mapped — ready to process {fileState.rowCount} rows
            </span>
          )}
        </p>
        <button
          className="btn-primary"
          onClick={onProcess}
          disabled={!canProcess || processing}
        >
          {processing ? (
            <>
              <div className="w-3 h-3 border border-surface-base border-t-transparent rounded-full animate-spin" />
              Processing…
            </>
          ) : (
            <>
              <ArrowRight size={14} /> Process Import
            </>
          )}
        </button>
      </div>
    </div>
  );
}

// ── Unmapped Resolution Panel ─────────────────────────────────────────────

function ResolutionPanel({
  unmapped,
  onApprove,
  onDiscard,
  approving,
}: {
  unmapped: UnmappedData;
  vendors: Vendor[];
  ingredients: Ingredient[];
  onApprove: () => Promise<void>;
  onDiscard: () => void;
  approving: boolean;
}) {
  const total = unmapped.vendors.length + unmapped.ingredients.length;
  return (
    <div className="rounded-lg border border-amber-dim/40 bg-amber-dim/5 overflow-hidden">
      <div className="px-5 py-4 border-b border-amber-dim/20 flex items-start gap-3">
        <Sparkles size={16} className="text-amber-DEFAULT mt-0.5 shrink-0" />
        <div className="flex-1">
          <p className="text-sm font-semibold text-ink-primary">Unmapped data detected in your upload</p>
          <p className="text-xs text-ink-secondary mt-0.5">
            {total} new name{total !== 1 ? 's' : ''} not found in your approved lists.
            Approve to add them automatically and complete the import — or discard to cancel.
          </p>
        </div>
        <button className="text-ink-disabled hover:text-ink-secondary transition-colors" onClick={onDiscard}>
          <X size={15} />
        </button>
      </div>

      <div className="px-5 py-4 space-y-4">
        {unmapped.vendors.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Building2 size={13} className="text-ink-tertiary" />
              <p className="text-xs font-semibold text-ink-tertiary uppercase tracking-widest">
                New Vendors ({unmapped.vendors.length})
              </p>
            </div>
            <ul className="space-y-1.5">
              {unmapped.vendors.map((v) => (
                <li key={v} className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-DEFAULT shrink-0" />
                  <span className="text-sm font-medium text-ink-primary">{v}</span>
                  <span className="tag bg-amber-dim/15 text-amber-DEFAULT text-[10px]">vendor</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {unmapped.ingredients.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Wheat size={13} className="text-ink-tertiary" />
              <p className="text-xs font-semibold text-ink-tertiary uppercase tracking-widest">
                New Ingredients ({unmapped.ingredients.length})
              </p>
            </div>
            <ul className="space-y-1.5">
              {unmapped.ingredients.map((i) => (
                <li key={i} className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-DEFAULT shrink-0" />
                  <span className="text-sm font-medium text-ink-primary">{i}</span>
                  <span className="tag bg-surface-border text-ink-secondary text-[10px]">ingredient · gram</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="px-5 py-4 border-t border-amber-dim/20 flex items-center justify-between gap-3">
        <p className="text-xs text-ink-tertiary">
          {unmapped.stagedRows.length} row{unmapped.stagedRows.length !== 1 ? 's' : ''} staged and ready to import after approval.
        </p>
        <div className="flex gap-2">
          <button className="btn-secondary !text-xs !py-1.5" onClick={onDiscard} disabled={approving}>
            Discard Upload
          </button>
          <button className="btn-primary !text-xs !py-1.5" onClick={onApprove} disabled={approving}>
            {approving ? (
              <>
                <div className="w-3 h-3 border border-surface-base border-t-transparent rounded-full animate-spin" />
                Approving…
              </>
            ) : (
              <><Sparkles size={12} /> Approve &amp; Add New Data</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main BulkUpload component ─────────────────────────────────────────────

interface BulkUploadProps {
  vendors: Vendor[];
  ingredients: Ingredient[];
  ckOutletId: string;
  onDone: () => void;
  onDataInjected: () => Promise<void>;
}

type UploadStage = 'idle' | 'mapping' | 'processing' | 'resolving' | 'done';

function BulkUpload({ vendors, ingredients, ckOutletId, onDone, onDataInjected }: BulkUploadProps) {
  const [stage,     setStage]     = useState<UploadStage>('idle');
  const [dragging,  setDragging]  = useState(false);
  const [fileState, setFileState] = useState<FileState | null>(null);
  const [columnMap, setColumnMap] = useState<ColumnMap>({
    date: '', vendor: '', item: '', invoice_qty: '', invoice_uom: '',
    total_invoice_price: '', freight_tax: '', base_uom: '', conversion_multiplier: '',
  });
  const [unmapped,  setUnmapped]  = useState<UnmappedData | null>(null);
  const [result,    setResult]    = useState<UploadResult | null>(null);
  const [approving, setApproving] = useState(false);

  // ── Step 1: read only headers, show mapping UI ───────────────────────

  const readHeaders = useCallback(async (file: File) => {
    setResult(null);
    setUnmapped(null);
    setStage('processing');

    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      // Read all rows so we can later iterate using the mapping
      const allRows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' }) as unknown[][];

      if (allRows.length < 2) {
        setResult({ imported: 0, skipped: 0, errors: ['File appears empty or has no data rows.'] });
        setStage('done');
        return;
      }

      const headers = (allRows[0] as unknown[]).map((h) => String(h ?? '').trim()).filter(Boolean);
      if (headers.length === 0) {
        setResult({ imported: 0, skipped: 0, errors: ['No headers found in the first row.'] });
        setStage('done');
        return;
      }

      const mapped = autoMap(headers);
      setColumnMap(mapped);
      setFileState({ name: file.name, rowCount: allRows.length - 1, headers, allRows });
      setStage('mapping');
    } catch (err: unknown) {
      setResult({ imported: 0, skipped: 0, errors: [(err as Error).message ?? 'Error reading file.'] });
      setStage('done');
    }
  }, []);

  // ── Step 2: process rows using the user-confirmed mapping ────────────

  async function handleProcess() {
    if (!fileState) return;
    setStage('processing');

    const { allRows } = fileState;
    const headerRow = allRows[0] as unknown[];
    const hIdx = new Map<string, number>(
      (headerRow as string[]).map((h, i) => [String(h ?? '').trim(), i])
    );

    function getVal(row: unknown[], field: ColumnMapKey): unknown {
      const col = columnMap[field];
      if (!col) return '';
      const idx = hIdx.get(col);
      return idx !== undefined ? row[idx] : '';
    }

    const staged: StagedRow[] = [];
    const unknownVendors     = new Set<string>();
    const unknownIngredients = new Set<string>();
    const hardErrors: string[] = [];

    for (let i = 1; i < allRows.length; i++) {
      const row = allRows[i] as unknown[];
      const rowNum = i + 1;

      const rawVendor = getVal(row, 'vendor');
      const rawItem   = getVal(row, 'item');
      const rawQty    = getVal(row, 'invoice_qty');

      if (!rawVendor && !rawItem && !rawQty) continue; // blank row

      const vendorName = String(rawVendor ?? '').trim();
      const itemName   = String(rawItem   ?? '').trim();

      if (!vendorName || !itemName) {
        hardErrors.push(`Row ${rowNum}: Vendor or Item name is empty — skipping.`);
        continue;
      }

      const qty   = parseFloat(String(rawQty                       ?? 0));
      const price = parseFloat(String(getVal(row, 'total_invoice_price') ?? 0));
      const mult  = parseFloat(String(getVal(row, 'conversion_multiplier') ?? 0));

      if (!qty || !price || !mult) {
        hardErrors.push(`Row ${rowNum}: Invalid numeric values (qty, price, or multiplier is zero/missing) — skipping.`);
        continue;
      }

      const vendorExists = vendors.some((v) => v.name.toLowerCase() === vendorName.toLowerCase());
      const itemExists   = ingredients.some((g) => g.name.toLowerCase() === itemName.toLowerCase());
      if (!vendorExists)  unknownVendors.add(vendorName);
      if (!itemExists)    unknownIngredients.add(itemName);

      staged.push({
        rowNum,
        rawDate:    getVal(row, 'date'),
        vendorName,
        itemName,
        rawQty,
        rawInvUom:  getVal(row, 'invoice_uom'),
        rawPrice:   getVal(row, 'total_invoice_price'),
        rawFreight: getVal(row, 'freight_tax'),
        rawBaseUom: getVal(row, 'base_uom'),
        rawMult:    getVal(row, 'conversion_multiplier'),
      });
    }

    if (staged.length === 0) {
      setResult({ imported: 0, skipped: hardErrors.length, errors: hardErrors.length ? hardErrors : ['No valid data rows found.'] });
      setStage('done');
      return;
    }

    if (unknownVendors.size > 0 || unknownIngredients.size > 0) {
      setUnmapped({
        vendors:    Array.from(unknownVendors).sort(),
        ingredients: Array.from(unknownIngredients).sort(),
        stagedRows: staged,
      });
      setStage('resolving');
      if (hardErrors.length > 0) setResult({ imported: 0, skipped: hardErrors.length, errors: hardErrors });
      return;
    }

    await commitRows(staged, vendors, ingredients, hardErrors);
    setStage('done');
  }

  // ── Step 3 (optional): approve & inject unknown names ────────────────

  async function handleApprove() {
    if (!unmapped) return;
    setApproving(true);

    try {
      if (unmapped.vendors.length > 0) {
        const { error } = await supabase.from('vendors').insert(unmapped.vendors.map((name) => ({ name })));
        if (error) throw new Error(`Failed to add vendors: ${error.message}`);
      }
      if (unmapped.ingredients.length > 0) {
        const { error } = await supabase.from('ingredients').insert(unmapped.ingredients.map((name) => ({ name, base_uom: 'gram' })));
        if (error) throw new Error(`Failed to add ingredients: ${error.message}`);
      }

      await onDataInjected();

      const [{ data: freshVendors }, { data: freshIngredients }] = await Promise.all([
        supabase.from('vendors').select('*'),
        supabase.from('ingredients').select('*'),
      ]);

      const staged = unmapped.stagedRows;
      setUnmapped(null);
      await commitRows(staged, freshVendors ?? [], freshIngredients ?? [], []);
    } catch (err: unknown) {
      setResult({ imported: 0, skipped: 0, errors: [(err as Error).message ?? 'Approval failed.'] });
    }

    setApproving(false);
    setStage('done');
  }

  // ── Shared: build + commit inserts ───────────────────────────────────

  async function commitRows(
    staged: StagedRow[],
    resolvedVendors: Vendor[],
    resolvedIngredients: Ingredient[],
    extraErrors: string[],
  ) {
    const vendorMap     = new Map(resolvedVendors.map((v) => [v.name.toLowerCase(), v.id]));
    const ingredientMap = new Map(resolvedIngredients.map((i) => [i.name.toLowerCase(), i.id]));
    const inserts: object[] = [];
    const rowErrors = [...extraErrors];

    for (const row of staged) {
      const r = buildInsert(row, vendorMap, ingredientMap);
      if (typeof r === 'string') rowErrors.push(r);
      else inserts.push(r);
    }

    if (inserts.length === 0) {
      setResult({ imported: 0, skipped: rowErrors.length, errors: rowErrors });
      return;
    }
    await commitInserts(inserts, ckOutletId, onDone, setResult, rowErrors);
  }

  function handleFile(f: File) {
    if (!f.name.match(/\.(xlsx|xls|csv)$/i)) {
      setResult({ imported: 0, skipped: 0, errors: ['Only .xlsx, .xls, or .csv files are supported.'] });
      setStage('done');
      return;
    }
    readHeaders(f);
  }

  function resetToIdle() {
    setStage('idle');
    setFileState(null);
    setUnmapped(null);
    setResult(null);
  }

  return (
    <div className="space-y-4">

      {/* ── STAGE: idle — drop zone ── */}
      {stage === 'idle' && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
          className={`relative border-2 border-dashed rounded-lg p-10 text-center transition-colors cursor-pointer
            ${dragging ? 'border-amber-dim bg-amber-dim/5' : 'border-surface-muted hover:border-surface-muted/80 hover:bg-surface-hover'}`}
          onClick={() => document.getElementById('bulk-file-input')?.click()}
        >
          <input
            id="bulk-file-input"
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }}
          />
          <div className="flex flex-col items-center gap-3">
            <FileSpreadsheet size={36} className="text-ink-tertiary" />
            <div>
              <p className="text-sm font-medium text-ink-secondary">Drop .xlsx / .csv here or click to browse</p>
              <p className="text-xs text-ink-tertiary mt-1">
                Any column layout is supported — you'll map your headers to the required fields on the next screen.
              </p>
            </div>
            <Upload size={14} className="text-ink-disabled" />
          </div>
        </div>
      )}

      {/* ── STAGE: processing — spinner ── */}
      {stage === 'processing' && (
        <div className="flex flex-col items-center gap-3 py-10">
          <div className="w-8 h-8 border-2 border-amber-dim border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-ink-secondary">Reading file…</p>
        </div>
      )}

      {/* ── STAGE: mapping — column map UI ── */}
      {stage === 'mapping' && fileState && (
        <ColumnMappingUI
          fileState={fileState}
          columnMap={columnMap}
          onChange={(key, value) => setColumnMap((m) => ({ ...m, [key]: value }))}
          onProcess={handleProcess}
          onReset={resetToIdle}
          processing={false}
        />
      )}

      {/* ── STAGE: resolving — unknown vendor/ingredient panel ── */}
      {stage === 'resolving' && unmapped && (
        <ResolutionPanel
          unmapped={unmapped}
          vendors={vendors}
          ingredients={ingredients}
          onApprove={handleApprove}
          onDiscard={resetToIdle}
          approving={approving}
        />
      )}

      {/* ── STAGE: done — result + reset ── */}
      {stage === 'done' && (
        <div className="space-y-3">
          {result?.imported ? (
            <div className="flex items-center gap-2 px-4 py-3 rounded bg-emerald-900/30 border border-emerald-800/40 text-emerald-400 text-sm">
              <CheckCircle2 size={15} />
              Successfully imported {result.imported} invoice line{result.imported !== 1 ? 's' : ''}.
              {result.skipped > 0 && (
                <span className="text-ink-tertiary ml-1">({result.skipped} row{result.skipped !== 1 ? 's' : ''} skipped)</span>
              )}
            </div>
          ) : null}
          {result?.errors && result.errors.length > 0 && (
            <div className="px-4 py-3 rounded bg-red-900/20 border border-red-800/40">
              <div className="flex items-center gap-2 text-red-400 text-sm font-medium mb-2">
                <AlertTriangle size={14} /> {result.errors.length} issue{result.errors.length !== 1 ? 's' : ''} skipped
              </div>
              <ul className="space-y-1">
                {result.errors.map((e, i) => (
                  <li key={i} className="text-xs text-red-300 pl-4 border-l border-red-800">{e}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="flex justify-end">
            <button className="btn-secondary !text-xs" onClick={resetToIdle}>
              <RefreshCw size={12} /> Import another file
            </button>
          </div>
        </div>
      )}

      {/* Hard errors shown during resolving stage */}
      {stage === 'resolving' && result?.errors && result.errors.length > 0 && (
        <div className="px-4 py-3 rounded bg-red-900/20 border border-red-800/40">
          <div className="flex items-center gap-2 text-red-400 text-sm font-medium mb-2">
            <AlertTriangle size={14} /> {result.errors.length} row{result.errors.length !== 1 ? 's' : ''} skipped before validation
          </div>
          <ul className="space-y-1">
            {result.errors.map((e, i) => (
              <li key={i} className="text-xs text-red-300 pl-4 border-l border-red-800">{e}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}


// ─── Ledger Table ─────────────────────────────────────────────────────────

function InvoiceLedger({ lines, onDelete }: { lines: InvoiceLine[]; onDelete: (id: string) => void }) {
  const [expanded, setExpanded] = useState(true);

  if (lines.length === 0) return (
    <div className="panel p-8 text-center text-ink-tertiary text-sm">
      No invoice lines recorded yet. Add one above or bulk import a spreadsheet.
    </div>
  );

  return (
    <div className="panel">
      <div className="panel-header cursor-pointer select-none" onClick={() => setExpanded((x) => !x)}>
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-semibold text-ink-primary tracking-wide">Purchase Ledger</h3>
          <span className="tag bg-surface-border text-ink-secondary">{lines.length} lines</span>
        </div>
        <ChevronDown size={16} className={`text-ink-tertiary transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </div>

      {expanded && (
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Vendor</th>
                <th>Item</th>
                <th className="text-right">Qty</th>
                <th>UOM</th>
                <th className="text-right">Invoice Price</th>
                <th className="text-right">Freight &amp; Tax</th>
                <th className="text-right">Landed Cost</th>
                <th>Base UOM</th>
                <th className="text-right">Base Unit Cost</th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.id}>
                  <td className="mono text-xs text-ink-secondary">{formatDate(l.date)}</td>
                  <td className="text-ink-secondary text-xs">{l.vendor?.name ?? '—'}</td>
                  <td className="font-medium">{l.ingredient?.name ?? '—'}</td>
                  <td className="text-right mono text-xs">{l.invoice_qty}</td>
                  <td><span className="tag bg-surface-raised text-ink-tertiary">{l.invoice_uom}</span></td>
                  <td className="text-right mono text-xs">{formatIDR(l.total_invoice_price)}</td>
                  <td className="text-right mono text-xs text-ink-secondary">{formatIDR(l.freight_tax)}</td>
                  <td className="text-right mono text-xs font-medium">{formatIDR(l.total_landed_cost)}</td>
                  <td><span className="tag bg-surface-raised text-ink-tertiary">{l.base_uom}</span></td>
                  <td className="text-right mono text-xs text-amber-DEFAULT">{formatBaseCost(l.base_unit_cost)}</td>
                  <td>
                    <button
                      className="text-ink-disabled hover:text-red-400 transition-colors"
                      onClick={() => onDelete(l.id)}
                      title="Delete line"
                    >
                      <X size={13} />
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

// ─── Module Export ────────────────────────────────────────────────────────

export default function InvoiceCapture() {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [lines, setLines] = useState<InvoiceLine[]>([]);
  const [activeTab, setActiveTab] = useState<'manual' | 'bulk'>('manual');
  const [ckOutletId, setCkOutletId] = useState<string | null>(null);

  async function loadCkOutletId() {
    const { data } = await supabase
      .from('outlets')
      .select('id')
      .eq('name', CENTRAL_KITCHEN_NAME)
      .maybeSingle();
    if (data) setCkOutletId((data as { id: string }).id);
  }

  async function loadVendors() {
    const { data } = await supabase.from('vendors').select('*').order('name');
    setVendors(data ?? []);
  }

  async function loadIngredients() {
    const { data } = await supabase.from('ingredients').select('*').eq('is_active', true).order('name');
    setIngredients(data ?? []);
  }

  async function loadLines() {
    const { data } = await supabase
      .from('invoice_lines')
      .select('*, vendor:vendors(id,name,created_at), ingredient:ingredients(id,name,current_base_unit_cost,base_uom,created_at)')
      .order('date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(200);
    setLines((data as InvoiceLine[]) ?? []);
  }

  // Called by BulkUpload after injecting new vendors/ingredients so parent state stays fresh
  async function handleDataInjected() {
    await Promise.all([loadVendors(), loadIngredients()]);
  }

  async function deleteLine(id: string) {
    if (!confirm('Delete this invoice line?')) return;
    await supabase.from('invoice_lines').delete().eq('id', id);
    loadLines();
  }

  useEffect(() => {
    loadCkOutletId();
    loadVendors();
    loadIngredients();
    loadLines();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="max-w-screen-2xl mx-auto px-4 py-8 space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-ink-primary tracking-tight">Invoice Capture</h1>
        <p className="text-sm text-ink-tertiary mt-1">
          Log incoming purchases manually or import a spreadsheet. All entries update the global Base Unit Cost for the selected ingredient.
        </p>
      </div>

      {/* Central Kitchen lock notice */}
      <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-amber-DEFAULT/8 border border-amber-dim/30">
        <Lock size={14} className="text-amber-DEFAULT shrink-0" />
        <p className="text-sm text-ink-secondary">
          All external vendor purchases are assigned to{' '}
          <span className="font-semibold text-amber-DEFAULT">{CENTRAL_KITCHEN_NAME}</span>.
          Retail outlets receive stock via Internal Requisitions only.
        </p>
      </div>

      {/* Entry panel */}
      <div className="panel">
        <div className="panel-header">
          <h2 className="text-sm font-semibold text-ink-primary tracking-wide">New Entry</h2>
          <div className="flex gap-1 bg-surface-raised rounded p-0.5">
            {(['manual', 'bulk'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-1.5 rounded text-xs font-medium transition-colors ${
                  activeTab === tab
                    ? 'bg-surface-muted text-ink-primary'
                    : 'text-ink-tertiary hover:text-ink-secondary'
                }`}
              >
                {tab === 'manual' ? 'Manual Entry' : 'Bulk Import'}
              </button>
            ))}
          </div>
        </div>

        <div className="p-6">
          {!ckOutletId ? (
            <div className="flex items-center gap-2 py-6 text-ink-tertiary text-sm">
              <div className="w-4 h-4 border-2 border-surface-muted border-t-amber-DEFAULT rounded-full animate-spin shrink-0" />
              Resolving outlet configuration…
            </div>
          ) : activeTab === 'manual' ? (
            <InvoiceForm vendors={vendors} ingredients={ingredients} ckOutletId={ckOutletId} onSaved={loadLines} />
          ) : (
            <BulkUpload
              vendors={vendors}
              ingredients={ingredients}
              ckOutletId={ckOutletId}
              onDone={loadLines}
              onDataInjected={handleDataInjected}
            />
          )}
        </div>
      </div>

      {/* Ledger */}
      <InvoiceLedger lines={lines} onDelete={deleteLine} />
    </div>
  );
}
