import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Beef, Scale, AlertTriangle, Check, ChevronDown,
  Trash2, FileText, Loader2, Plus, RefreshCw, Ban, X, ShieldAlert, Lock,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { formatIDR } from '../utils/formatting';
import { useToast } from '../lib/toast';

// ─── Types ──────────────────────────────────────────────────────────────────

interface MeatBatch {
  id: string;
  batch_date: string;
  protein_type: string;
  phase_a_raw_weight_kg: number;
  phase_b_trimming_waste_kg: number;
  phase_f_marinade_batch_id: string | null;
  phase_f_marinade_cost: number;
  phase_c_marinated_weight_kg: number;
  phase_d_spoilage_weight_kg: number;
  phase_e_dispatch_weight_kg: number;
  raw_cost_per_kg: number;
  blended_cost_per_kg: number | null;
  dispatch_status: string;
  dispatch_approved_at: string | null;
  notes: string | null;
  void_reason: string | null;
  void_justification: string | null;
  voided_at: string | null;
  created_at: string;
}

interface MarinadeOption {
  id: string;
  name: string;
  batchCost: number;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const YIELD_LOSS_THRESHOLD = 15;
const PROTEIN_TYPES = ['Beef', 'Chicken Leg', 'Chicken Breast'];
const PROTEIN_INGREDIENT_MAP: Record<string, string> = {
  Beef: 'Raw Beef (Untrimmed)',
  'Chicken Leg': 'Raw Chicken Leg (Untrimmed)',
  'Chicken Breast': 'Raw Chicken Breast (Untrimmed)',
};

// ─── Mekari Jurnal Payload Builder ──────────────────────────────────────────

function buildMekariPayloads(batch: MeatBatch, marinadeLabel: string) {
  const date = new Date(batch.batch_date).toISOString().slice(0, 10);
  const rawTotalCost = batch.phase_a_raw_weight_kg * batch.raw_cost_per_kg;

  const payload1_adjustment = {
    type: 'Penyesuaian Stok (Stock Adjustment)',
    description: `Trim waste deduction – ${batch.protein_type} batch ${date}`,
    date,
    line_items: [{
      product: `Raw ${batch.protein_type} (kg)`,
      adjustment_qty: -batch.phase_b_trimming_waste_kg,
      unit: 'kg',
      unit_cost: batch.raw_cost_per_kg,
      total_cost: -(batch.phase_b_trimming_waste_kg * batch.raw_cost_per_kg),
    }],
  };

  const netRawKg = batch.phase_a_raw_weight_kg - batch.phase_b_trimming_waste_kg;
  const payload2_assembly = {
    type: 'Perakitan (Product Assembly)',
    description: `Marinate assembly – ${batch.protein_type} batch ${date}`,
    date,
    finished_product: {
      product: `Marinated ${batch.protein_type} (kg)`,
      qty: batch.phase_c_marinated_weight_kg,
      unit: 'kg',
    },
    consumed_materials: [
      {
        product: `Raw ${batch.protein_type} (kg)`,
        qty: netRawKg,
        unit: 'kg',
        unit_cost: batch.raw_cost_per_kg,
        total_cost: netRawKg * batch.raw_cost_per_kg,
      },
      {
        product: marinadeLabel,
        qty: 1,
        unit: 'batch',
        unit_cost: batch.phase_f_marinade_cost,
        total_cost: batch.phase_f_marinade_cost,
      },
    ],
    total_assembly_cost: (netRawKg * batch.raw_cost_per_kg) + batch.phase_f_marinade_cost,
  };

  const payload3_disposal = {
    type: 'Pembuangan Stok (Stock Disposal)',
    description: `Spoilage write-off – ${batch.protein_type} batch ${date}`,
    date,
    line_items: [{
      product: `Marinated ${batch.protein_type} (kg)`,
      disposal_qty: batch.phase_d_spoilage_weight_kg,
      unit: 'kg',
      unit_cost: batch.blended_cost_per_kg ?? 0,
      total_cost: batch.phase_d_spoilage_weight_kg * (batch.blended_cost_per_kg ?? 0),
    }],
  };

  const payload4_transfer = {
    type: 'Pemindahan Barang (Stock Transfer)',
    description: `CK → Retail dispatch – ${batch.protein_type} batch ${date}`,
    date,
    from_warehouse: 'Central Kitchen',
    to_warehouse: 'Retail Outlet',
    line_items: [{
      product: `Marinated ${batch.protein_type} (kg)`,
      transfer_qty: batch.phase_e_dispatch_weight_kg,
      unit: 'kg',
      unit_cost: batch.blended_cost_per_kg ?? 0,
      total_cost: batch.phase_e_dispatch_weight_kg * (batch.blended_cost_per_kg ?? 0),
    }],
  };

  return [payload1_adjustment, payload2_assembly, payload3_disposal, payload4_transfer];
}

// ─── Yield Alert Utility ────────────────────────────────────────────────────

function buildYieldAlertPayload(batch: MeatBatch, yieldLossPct: number, reason: string) {
  return {
    alert_type: 'MEAT_YIELD_ANOMALY',
    batch_id: batch.id,
    batch_date: batch.batch_date,
    protein_type: batch.protein_type,
    yield_loss_pct: yieldLossPct,
    threshold_pct: YIELD_LOSS_THRESHOLD,
    trigger_reason: reason,
    raw_weight_kg: batch.phase_a_raw_weight_kg,
    trimming_waste_kg: batch.phase_b_trimming_waste_kg,
    timestamp: new Date().toISOString(),
  };
}

// ─── Calculations ───────────────────────────────────────────────────────────

function calcYieldLoss(phaseA: number, phaseB: number): number {
  if (phaseA <= 0) return 0;
  return (phaseB / phaseA) * 100;
}

function calcVariance(phaseC: number, phaseD: number, phaseE: number): number {
  return phaseC - (phaseD + phaseE);
}

function calcBlendedCost(phaseA: number, rawCostPerKg: number, marinadeCost: number, phaseC: number): number {
  if (phaseC <= 0) return 0;
  return ((phaseA * rawCostPerKg) + marinadeCost) / phaseC;
}

// ─── Sub-components ─────────────────────────────────────────────────────────

const MEAT_CARD = 'bg-[#121212] border border-zinc-800 rounded-xl p-6 mb-6';

function PhaseInput({ label, phase, value, onChange, unit = 'kg', disabled = false, hint }: {
  label: string;
  phase: string;
  value: string;
  onChange: (v: string) => void;
  unit?: string;
  disabled?: boolean;
  hint?: string;
}) {
  return (
    <div>
      <label className="flex items-center text-xs font-semibold text-zinc-300 mb-2 uppercase">
        <span className="flex items-center justify-center min-w-5 h-5 px-1 rounded bg-zinc-800 text-[10px] text-zinc-300 mr-2 shrink-0 font-bold">
          {phase}
        </span>
        {label}
      </label>
      {hint && <p className="text-[11px] text-zinc-500 mb-2 ml-7">{hint}</p>}
      <div className="relative">
        <input
          type="number"
          step="any"
          min="0"
          className="w-full bg-black border border-zinc-700 rounded-lg px-4 py-3 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition-all duration-150"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          placeholder="0.00"
        />
        <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[11px] text-zinc-600 pointer-events-none font-medium">
          {unit}
        </span>
      </div>
    </div>
  );
}

function ReadonlyCalc({ label, value, status }: { label: string; value: string; status?: 'ok' | 'warn' | 'neutral' }) {
  const ring = status === 'warn'
    ? 'border-red-500/50 bg-red-950/40'
    : status === 'ok'
      ? 'border-emerald-500/50 bg-emerald-950/40'
      : 'border-zinc-800 bg-zinc-900/60';
  const text = status === 'warn'
    ? 'text-red-400'
    : status === 'ok'
      ? 'text-emerald-400'
      : 'text-zinc-100';
  return (
    <div className={`rounded-xl px-5 py-4 border ${ring}`}>
      <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-1.5">{label}</div>
      <div className={`text-lg font-bold tabular-nums ${text}`}>{value}</div>
    </div>
  );
}

function SectionLabel({ title }: { title: string }) {
  return (
    <h3 className="text-sm font-bold tracking-widest text-zinc-400 uppercase mb-6">{title}</h3>
  );
}

function StatusBadge({ status }: { status: string }) {
  const isDraft = status === 'Draft';
  const isVoided = status === 'Voided';
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
      isVoided ? 'bg-red-500/10 text-red-400' : isDraft ? 'bg-amber-DEFAULT/10 text-amber-DEFAULT' : 'bg-emerald-500/10 text-emerald-400'
    }`}>
      {isVoided ? <Ban size={10} /> : isDraft ? <Scale size={10} /> : <Check size={10} />}
      {status}
    </span>
  );
}

const VOID_REASONS = ['Scale Calibration Error', 'Wrong Protein Selected', 'Accidental Double-Entry'];
const MANAGER_PIN = '1234';

// ─── Main export ────────────────────────────────────────────────────────────

export default function MeatTracker() {
  const toast = useToast();
  const [batches, setBatches] = useState<MeatBatch[]>([]);
  const [marinades, setMarinades] = useState<MarinadeOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [debugPayload, setDebugPayload] = useState<any>(null);

  const [voidTarget, setVoidTarget] = useState<string | null>(null);
  const [voidStep, setVoidStep] = useState<'pin' | 'justify'>('pin');
  const [voidPin, setVoidPin] = useState('');
  const [voidPinError, setVoidPinError] = useState(false);
  const [voidReason, setVoidReason] = useState(VOID_REASONS[0]);
  const [voidJustification, setVoidJustification] = useState('');
  const [voidSaving, setVoidSaving] = useState(false);
  const [view, setView] = useState<'list' | 'form'>('list');
  const [editId, setEditId] = useState<string | null>(null);
  const [adminOverride, setAdminOverride] = useState(false);

  // Form state
  const [proteinType, setProteinTypeRaw] = useState('Beef');
  const [batchDate, setBatchDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [phaseA, setPhaseA] = useState('');
  const [phaseB, setPhaseB] = useState('');
  const [phaseF, setPhaseF] = useState('');
  const [phaseFCost, setPhaseFCost] = useState('');
  const [phaseC, setPhaseC] = useState('');
  const [phaseD, setPhaseD] = useState('');
  const [phaseE, setPhaseE] = useState('');
  const [rawCostPerKg, setRawCostPerKg] = useState('0');

  useEffect(() => { fetchProteinCost('Beef').then((c) => setRawCostPerKg(String(c))); }, []);

  async function fetchProteinCost(protein: string): Promise<number> {
    const ingredientName = PROTEIN_INGREDIENT_MAP[protein];
    if (!ingredientName) return 0;
    const { data } = await supabase.from('ingredients').select('current_base_unit_cost').eq('name', ingredientName).limit(1);
    return Number(data?.[0]?.current_base_unit_cost) || 0;
  }

  function setProteinType(val: string) {
    setProteinTypeRaw(val);
    fetchProteinCost(val).then((cost) => setRawCostPerKg(String(cost)));
  }
  const [notes, setNotes] = useState('');

  // ─── Derived calculations ───────────────────────────────────────────────

  const yieldLoss = useMemo(() => calcYieldLoss(Number(phaseA) || 0, Number(phaseB) || 0), [phaseA, phaseB]);
  const variance = useMemo(() => calcVariance(Number(phaseC) || 0, Number(phaseD) || 0, Number(phaseE) || 0), [phaseC, phaseD, phaseE]);
  const blendedCost = useMemo(
    () => calcBlendedCost(Number(phaseA) || 0, Number(rawCostPerKg) || 0, Number(phaseFCost) || 0, Number(phaseC) || 0),
    [phaseA, rawCostPerKg, phaseFCost, phaseC],
  );

  const sequenceComplete = (Number(phaseA) || 0) > 0 && (Number(phaseC) || 0) > 0 && (Number(phaseE) || 0) > 0;
  const varianceIsZero = sequenceComplete && Math.abs(variance) < 0.0001;
  const canDispatch = varianceIsZero || adminOverride;
  const yieldAlert = yieldLoss > YIELD_LOSS_THRESHOLD;

  // ─── Data fetching ──────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    setLoading(true);
    const [batchRes, recipeRes] = await Promise.all([
      supabase.from('ck_meat_tracking').select('*').order('batch_date', { ascending: false }),
      supabase.from('recipes').select('id, name').or('name.ilike.%marination%,name.ilike.%marinade%'),
    ]);
    if (batchRes.data) setBatches(batchRes.data as MeatBatch[]);
    if (recipeRes.data) {
      const ids = recipeRes.data.map((r) => r.id);
      let costs = new Map<string, number>();
      if (ids.length > 0) {
        const { data: items } = await supabase.from('recipe_items').select('recipe_id, quantity, unit_cost').in('recipe_id', ids);
        (items ?? []).forEach((i) => {
          costs.set(i.recipe_id, (costs.get(i.recipe_id) ?? 0) + (i.quantity ?? 0) * (i.unit_cost ?? 0));
        });
      }
      setMarinades(recipeRes.data.map((r) => ({
        id: r.id,
        name: r.name,
        batchCost: costs.get(r.id) ?? 0,
      })));
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // ─── Form helpers ───────────────────────────────────────────────────────

  function resetForm() {
    setProteinType('Beef');
    setBatchDate(new Date().toISOString().slice(0, 10));
    setPhaseA(''); setPhaseB(''); setPhaseF(''); setPhaseFCost('');
    setPhaseC(''); setPhaseD(''); setPhaseE('');
    fetchProteinCost('Beef').then((c) => setRawCostPerKg(String(c))); setNotes(''); setEditId(null);
    setAdminOverride(false);
  }

  function openNew() {
    resetForm();
    setView('form');
  }

  function openEdit(b: MeatBatch) {
    setEditId(b.id);
    setProteinType(b.protein_type);
    setBatchDate(new Date(b.batch_date).toISOString().slice(0, 10));
    setPhaseA(String(b.phase_a_raw_weight_kg));
    setPhaseB(String(b.phase_b_trimming_waste_kg));
    setPhaseF(b.phase_f_marinade_batch_id ?? '');
    setPhaseFCost(String(b.phase_f_marinade_cost));
    setPhaseC(String(b.phase_c_marinated_weight_kg));
    setPhaseD(String(b.phase_d_spoilage_weight_kg));
    setPhaseE(String(b.phase_e_dispatch_weight_kg));
    setRawCostPerKg(String(b.raw_cost_per_kg));
    setNotes(b.notes ?? '');
    setAdminOverride(false);
    setView('form');
  }

  // ─── Save / Dispatch ───────────────────────────────────────────────────

  async function handleSave(dispatch: boolean) {
    setSaving(true);
    const timeout = setTimeout(() => {
      setSaving(false);
      toast.error('Operation timed out. Your data may have saved — please refresh.');
    }, 5000);

    try {
      const row = {
        batch_date: batchDate + 'T00:00:00+08:00',
        protein_type: proteinType,
        phase_a_raw_weight_kg: Number(phaseA) || 0,
        phase_b_trimming_waste_kg: Number(phaseB) || 0,
        phase_f_marinade_batch_id: phaseF || null,
        phase_f_marinade_cost: Number(phaseFCost) || 0,
        phase_c_marinated_weight_kg: Number(phaseC) || 0,
        phase_d_spoilage_weight_kg: Number(phaseD) || 0,
        phase_e_dispatch_weight_kg: Number(phaseE) || 0,
        raw_cost_per_kg: Number(rawCostPerKg) || 0,
        blended_cost_per_kg: blendedCost,
        dispatch_status: dispatch ? 'Dispatched' : 'Draft',
        dispatch_approved_at: dispatch ? new Date().toISOString() : null,
        notes: notes || null,
        updated_at: new Date().toISOString(),
      };

      let error;
      if (editId) {
        ({ error } = await supabase.from('ck_meat_tracking').update(row).eq('id', editId));
      } else {
        ({ error } = await supabase.from('ck_meat_tracking').insert(row));
      }

      if (error) {
        toast.error('Save failed: ' + error.message);
        return;
      }

      if (dispatch) {
        const marinadeLabel = marinades.find((m) => m.id === phaseF)?.name ?? 'Marinade Batch';
        const savedBatch: MeatBatch = { ...row, id: editId ?? '', created_at: '' } as MeatBatch;
        const payloads = buildMekariPayloads(savedBatch, marinadeLabel);
        console.log('Mekari Jurnal Payloads:', payloads);
        payloads.forEach((p, i) => {
          console.log(`── Payload ${i + 1}: ${p.type} ──`);
          console.log(JSON.stringify(p, null, 2));
        });

        let alertPayload: any = null;
        if (yieldAlert || adminOverride) {
          const reason = adminOverride
            ? 'Admin override applied to variance lock'
            : `Yield loss ${yieldLoss.toFixed(1)}% exceeds ${YIELD_LOSS_THRESHOLD}% threshold`;
          alertPayload = buildYieldAlertPayload(savedBatch, yieldLoss, reason);
          console.log('Yield Alert Payload:', JSON.stringify(alertPayload, null, 2));
        }

        setDebugPayload({ payloads, ...(alertPayload ? { yieldAlert: alertPayload } : {}) });
        toast.success('Dispatch approved! Payloads visible below.');
      } else {
        toast.success(editId ? 'Batch updated.' : 'Batch saved as draft.');
      }

      if (!dispatch) {
        setView('list');
        resetForm();
      }
      loadData();
    } catch (err) {
      console.error('handleSave error:', err);
      toast.error('An unexpected error occurred. Please try again.');
    } finally {
      clearTimeout(timeout);
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    const { error } = await supabase.from('ck_meat_tracking').delete().eq('id', id);
    if (error) { toast.error('Delete failed.'); return; }
    toast.success('Batch deleted.');
    loadData();
  }

  // ─── Void handlers ─────────────────────────────────────────────────────

  function openVoidModal(batchId: string) {
    setVoidTarget(batchId);
    setVoidStep('pin');
    setVoidPin('');
    setVoidPinError(false);
    setVoidReason(VOID_REASONS[0]);
    setVoidJustification('');
  }

  function closeVoidModal() {
    setVoidTarget(null);
  }

  function checkVoidPin() {
    if (voidPin === MANAGER_PIN) {
      setVoidPinError(false);
      setVoidStep('justify');
    } else {
      setVoidPinError(true);
      setVoidPin('');
    }
  }

  async function confirmVoid() {
    if (!voidTarget || !voidJustification.trim()) return;
    setVoidSaving(true);
    try {
      const { error } = await supabase.from('ck_meat_tracking').update({
        dispatch_status: 'Voided',
        void_reason: voidReason,
        void_justification: voidJustification.trim(),
        voided_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('id', voidTarget);
      if (error) { toast.error('Void failed: ' + error.message); return; }
      setBatches((prev) => prev.map((b) => b.id === voidTarget
        ? { ...b, dispatch_status: 'Voided', void_reason: voidReason, void_justification: voidJustification.trim(), voided_at: new Date().toISOString() }
        : b
      ));
      toast.success('Batch voided successfully.');
      closeVoidModal();
      loadData();
    } catch {
      toast.error('An unexpected error occurred.');
    } finally {
      setVoidSaving(false);
    }
  }

  // ─── Marinade selection handler ─────────────────────────────────────────

  function handleMarinadeChange(id: string) {
    setPhaseF(id);
    const match = marinades.find((m) => m.id === id);
    setPhaseFCost(match ? String(match.batchCost) : '0');
  }

  // ─── Render ─────────────────────────────────────────────────────────────

  if (view === 'form') {
    const inputCls = 'w-full bg-black border border-zinc-700 rounded-lg px-4 py-3 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition-all duration-150';
    const selectCls = `${inputCls} cursor-pointer appearance-none`;
    const labelCls = 'flex items-center text-xs font-semibold text-zinc-300 mb-2 uppercase';

    return (
      <div className="max-w-screen-md mx-auto px-4 py-10">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-xl font-semibold text-zinc-100 tracking-tight flex items-center gap-2.5">
              <Beef size={20} className="text-orange-500" />
              {editId ? 'Edit Meat Batch' : 'New Meat Batch'}
            </h1>
            <p className="text-[13px] text-zinc-500 mt-1">
              Record scale weights in processing order. All fields lock after dispatch.
            </p>
          </div>
          <button onClick={() => { setView('list'); resetForm(); }} className="text-sm text-zinc-500 hover:text-zinc-200 transition-colors">
            Cancel
          </button>
        </div>

        {/* Batch Information */}
        <div className={MEAT_CARD}>
          <SectionLabel title="Batch Information" />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '1.5rem', width: '100%' }}>
            {/* Column 1: Date */}
            <div style={{ border: 'none' }}>
              <label className="text-xs font-semibold text-zinc-300 uppercase tracking-widest mb-2 block">Batch Date</label>
              <input
                type="date"
                value={batchDate}
                onChange={(e) => setBatchDate(e.target.value)}
                className="w-full bg-black border border-zinc-700 rounded-lg px-4 py-3 text-white appearance-none focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
              />
            </div>
            {/* Column 2: Protein */}
            <div style={{ border: 'none' }}>
              <label className="text-xs font-semibold text-zinc-300 uppercase tracking-widest mb-2 block">Protein Type</label>
              <select
                value={proteinType}
                onChange={(e) => setProteinType(e.target.value)}
                className="w-full bg-black border border-zinc-700 rounded-lg px-4 py-3 text-white appearance-none focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
              >
                {PROTEIN_TYPES.map((p) => <option key={p}>{p}</option>)}
              </select>
            </div>
            {/* Column 3: Cost (read-only, auto-calculated) */}
            <div style={{ border: 'none' }}>
              <label className="text-xs font-semibold text-zinc-300 uppercase tracking-widest mb-2 flex items-center gap-2">
                <span className="bg-zinc-800 text-zinc-400 text-[10px] px-1.5 py-0.5 rounded font-bold">RP</span>
                Raw Cost / KG
              </label>
              <div className="relative" style={{ border: 'none' }}>
                <input
                  type="text"
                  disabled
                  readOnly
                  value={Number(rawCostPerKg).toLocaleString('id-ID')}
                  placeholder="0"
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-3 text-zinc-400 font-medium tabular-nums appearance-none focus:outline-none cursor-not-allowed"
                />
                <div className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-600 text-xs font-medium pointer-events-none">IDR/kg</div>
              </div>
            </div>
          </div>
        </div>

        {/* Raw Processing */}
        <div className={MEAT_CARD}>
          <SectionLabel title="Raw Processing" />
          <div className="grid grid-cols-2 gap-6">
            <PhaseInput label="Raw Received Weight" phase="A" value={phaseA} onChange={setPhaseA} hint="Weight from vendor delivery" />
            <PhaseInput label="Trimming Waste" phase="B" value={phaseB} onChange={setPhaseB} hint="Fat & sinew removed" />
          </div>
        </div>

        {/* Marination Phase */}
        <div className={MEAT_CARD}>
          <SectionLabel title="Marination Phase" />
          <div className="grid grid-cols-2 gap-6">
            <div>
              <label className={labelCls}>
                <span className="flex items-center justify-center w-5 h-5 rounded bg-zinc-800 text-[10px] text-zinc-300 mr-2 shrink-0 font-bold">F</span>
                Marinade Batch
              </label>
              <p className="text-[11px] text-zinc-500 mb-2 ml-7">Select the prep recipe used</p>
              <div className="relative">
                <select className={`${selectCls} !pr-9`} value={phaseF} onChange={(e) => handleMarinadeChange(e.target.value)}>
                  <option value="">-- Select marinade --</option>
                  {marinades.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({formatIDR(m.batchCost)})
                    </option>
                  ))}
                </select>
                <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-600 pointer-events-none" />
              </div>
            </div>
            <PhaseInput label="Marinated Weight" phase="C" value={phaseC} onChange={setPhaseC} hint="Total weight after marinade" />
          </div>
        </div>

        {/* Validation & Dispatch */}
        <div className={MEAT_CARD}>
          <SectionLabel title="Validation & Dispatch" />
          <div className="grid grid-cols-2 gap-6">
            <PhaseInput label="Spoilage / Disposal" phase="D" value={phaseD} onChange={setPhaseD} hint="Compromised or discarded" />
            <PhaseInput label="Final Dispatch Weight" phase="E" value={phaseE} onChange={setPhaseE} hint="Lexans loaded for retail" />
          </div>
        </div>

        {/* Calculated Metrics */}
        <div className={MEAT_CARD}>
          <SectionLabel title="Calculated Metrics" />
          <div className="grid grid-cols-3 gap-4">
            <ReadonlyCalc
              label="Yield Loss %"
              value={`${yieldLoss.toFixed(2)}%`}
              status={yieldAlert ? 'warn' : 'neutral'}
            />
            <ReadonlyCalc
              label="Unaccounted Variance"
              value={`${variance.toFixed(4)} kg`}
              status={varianceIsZero ? 'ok' : sequenceComplete ? 'warn' : 'neutral'}
            />
            <ReadonlyCalc
              label="True Cost / KG"
              value={formatIDR(blendedCost)}
              status={(Number(phaseC) || 0) > 0 ? 'neutral' : 'neutral'}
            />
          </div>
          {yieldAlert && (
            <div className="flex items-start gap-2.5 mt-5 p-4 rounded-xl bg-red-950/50 border border-red-500/30 text-[13px] text-red-300">
              <AlertTriangle size={15} className="mt-0.5 shrink-0" />
              <span>
                Yield loss of <strong>{yieldLoss.toFixed(1)}%</strong> exceeds the {YIELD_LOSS_THRESHOLD}% threshold.
                An auditor alert fires on dispatch.
              </span>
            </div>
          )}
        </div>

        {/* Notes */}
        <div className={MEAT_CARD}>
          <label className="flex items-center text-xs font-semibold text-zinc-300 mb-2 uppercase">Notes (optional)</label>
          <textarea
            className="w-full bg-black border border-zinc-700 rounded-lg px-4 py-3 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition-all duration-150 min-h-[80px] resize-y"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Any observations about this batch..."
          />
        </div>

        {/* Variance lock + admin override */}
        {!varianceIsZero && (
          <div className={`${MEAT_CARD} space-y-3`}>
            <div className="flex items-start gap-2.5 p-4 rounded-xl bg-orange-950/30 border border-orange-500/30 text-[13px] text-orange-200">
              <AlertTriangle size={15} className="mt-0.5 shrink-0 text-orange-500" />
              <span>
                {!sequenceComplete
                  ? 'Dispatch is locked \u2014 Processing phases incomplete. Please enter Marinated Weight (C) and Final Dispatch Weight (E).'
                  : <>Dispatch is locked \u2014 unaccounted variance is <strong>{variance.toFixed(4)} kg</strong> (must be exactly 0). Adjust Spoilage (D) or Dispatch (E) weights.</>}
              </span>
            </div>
            <label className="flex items-center gap-2.5 text-[13px] text-zinc-400 cursor-pointer select-none">
              <input type="checkbox" checked={adminOverride} onChange={(e) => setAdminOverride(e.target.checked)} className="rounded border-zinc-700 bg-black" />
              Admin Override — force approve (triggers auditor alert)
            </label>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex items-center gap-3 pt-2">
          <button
            onClick={() => handleSave(false)}
            disabled={saving}
            className="btn-secondary flex items-center gap-2"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
            Save Draft
          </button>
          <button
            onClick={() => handleSave(true)}
            disabled={saving || !canDispatch}
            className="btn-primary flex items-center gap-2 disabled:opacity-40 disabled:pointer-events-none"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            Approve Dispatch
          </button>
        </div>

        {debugPayload && (
          <div className="mt-8 p-4 bg-black border border-orange-500/50 rounded-lg w-full overflow-x-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-orange-500 text-sm font-bold uppercase tracking-widest">Mekari Jurnal JSON Payload</h3>
              <button onClick={() => setDebugPayload(null)} className="text-zinc-500 hover:text-white text-xs font-bold uppercase">Close</button>
            </div>
            <pre className="text-zinc-300 text-xs font-mono whitespace-pre-wrap">{JSON.stringify(debugPayload, null, 2)}</pre>
          </div>
        )}
      </div>
    );
  }

  // ─── List view ──────────────────────────────────────────────────────────

  return (
    <div className="max-w-screen-2xl mx-auto px-4 py-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-ink-primary tracking-tight flex items-center gap-2">
            <Beef size={20} className="text-amber-DEFAULT" />
            CK Meat Tracker
          </h1>
          <p className="text-sm text-ink-tertiary mt-1">
            Track meat processing from receiving to dispatch with full financial traceability.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={loadData} disabled={loading} className="btn-secondary flex items-center gap-1.5 text-xs">
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
          <button onClick={openNew} className="btn-primary flex items-center gap-1.5 text-xs">
            <Plus size={13} />
            New Batch
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-ink-tertiary">
          <Loader2 size={20} className="animate-spin mr-2" /> Loading batches...
        </div>
      ) : batches.length === 0 ? (
        <div className="card p-12 text-center text-ink-tertiary">
          <Beef size={40} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">No meat batches recorded yet.</p>
          <button onClick={openNew} className="mt-4 btn-primary text-xs inline-flex items-center gap-1.5">
            <Plus size={13} /> Record First Batch
          </button>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-ink-tertiary border-b border-surface-border">
                <th className="pb-2 pr-4 font-medium">Date</th>
                <th className="pb-2 pr-4 font-medium">Protein</th>
                <th className="pb-2 pr-4 font-medium text-right">Raw (A)</th>
                <th className="pb-2 pr-4 font-medium text-right">Trim (B)</th>
                <th className="pb-2 pr-4 font-medium text-right">Marinated (C)</th>
                <th className="pb-2 pr-4 font-medium text-right">Spoilage (D)</th>
                <th className="pb-2 pr-4 font-medium text-right">Dispatch (E)</th>
                <th className="pb-2 pr-4 font-medium text-right">Yield Loss</th>
                <th className="pb-2 pr-4 font-medium text-right">Cost/KG</th>
                <th className="pb-2 pr-4 font-medium">Status</th>
                <th className="pb-2 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-border">
              {batches.map((b) => {
                const yl = calcYieldLoss(b.phase_a_raw_weight_kg, b.phase_b_trimming_waste_kg);
                return (
                  <tr key={b.id} className={`hover:bg-surface-hover/40 transition-colors group ${b.dispatch_status === 'Voided' ? 'opacity-50 pointer-events-none' : ''}`}>
                    <td className="py-3 pr-4 text-ink-primary whitespace-nowrap">
                      {new Date(b.batch_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </td>
                    <td className="py-3 pr-4 text-ink-secondary">{b.protein_type}</td>
                    <td className="py-3 pr-4 text-ink-primary text-right tabular-nums">{Number(b.phase_a_raw_weight_kg).toFixed(2)}</td>
                    <td className="py-3 pr-4 text-ink-secondary text-right tabular-nums">{Number(b.phase_b_trimming_waste_kg).toFixed(2)}</td>
                    <td className="py-3 pr-4 text-ink-primary text-right tabular-nums">{Number(b.phase_c_marinated_weight_kg).toFixed(2)}</td>
                    <td className="py-3 pr-4 text-ink-secondary text-right tabular-nums">{Number(b.phase_d_spoilage_weight_kg).toFixed(2)}</td>
                    <td className="py-3 pr-4 text-ink-primary text-right tabular-nums font-medium">{Number(b.phase_e_dispatch_weight_kg).toFixed(2)}</td>
                    <td className={`py-3 pr-4 text-right tabular-nums ${yl > YIELD_LOSS_THRESHOLD ? 'text-red-400 font-medium' : 'text-ink-secondary'}`}>
                      {yl.toFixed(1)}%
                    </td>
                    <td className="py-3 pr-4 text-right tabular-nums text-ink-primary">
                      {b.blended_cost_per_kg != null ? formatIDR(Number(b.blended_cost_per_kg)) : '—'}
                    </td>
                    <td className="py-3 pr-4"><StatusBadge status={b.dispatch_status} /></td>
                    <td className="py-3 text-right whitespace-nowrap">
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity justify-end">
                        {b.dispatch_status === 'Draft' && (
                          <>
                            <button onClick={() => openEdit(b)} className="p-1.5 rounded hover:bg-surface-raised text-ink-tertiary hover:text-ink-primary transition-colors" title="Edit">
                              <FileText size={14} />
                            </button>
                            <button onClick={() => handleDelete(b.id)} className="p-1.5 rounded hover:bg-red-500/10 text-ink-tertiary hover:text-red-400 transition-colors" title="Delete">
                              <Trash2 size={14} />
                            </button>
                          </>
                        )}
                        {b.dispatch_status === 'Dispatched' && (
                          <button onClick={() => openVoidModal(b.id)} className="inline-flex items-center gap-1 px-2 py-1 rounded border border-red-500/30 text-red-400 text-[11px] font-medium uppercase tracking-wider hover:bg-red-500/10 transition-colors" title="Void this batch">
                            <Ban size={11} /> Void
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Void PIN + Justification Modal */}
      {voidTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4" onClick={closeVoidModal}>
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl w-full max-w-md shadow-2xl" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
              <div className="flex items-center gap-2 text-red-400">
                <ShieldAlert size={18} />
                <span className="text-sm font-bold uppercase tracking-widest">Void &amp; Reverse</span>
              </div>
              <button onClick={closeVoidModal} className="p-1.5 rounded hover:bg-zinc-800 text-zinc-500 hover:text-white transition-colors">
                <X size={16} />
              </button>
            </div>

            {voidStep === 'pin' ? (
              <div className="p-6 space-y-5">
                <div className="flex items-center gap-3 p-3 rounded-xl bg-red-950/30 border border-red-500/20">
                  <Lock size={16} className="text-red-400 shrink-0" />
                  <p className="text-[13px] text-red-200">Enter the 4-digit Manager PIN to authorize this void.</p>
                </div>
                <div>
                  <input
                    type="password"
                    inputMode="numeric"
                    maxLength={4}
                    autoFocus
                    value={voidPin}
                    onChange={(e) => { setVoidPin(e.target.value.replace(/\D/g, '')); setVoidPinError(false); }}
                    onKeyDown={(e) => e.key === 'Enter' && voidPin.length === 4 && checkVoidPin()}
                    placeholder="_ _ _ _"
                    className="w-full bg-black border border-zinc-700 rounded-lg px-4 py-3 text-white text-center text-2xl tracking-[0.5em] font-mono focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500"
                  />
                  {voidPinError && (
                    <p className="mt-2 text-red-400 text-xs font-semibold flex items-center gap-1.5">
                      <AlertTriangle size={12} /> Unauthorized Access — incorrect PIN
                    </p>
                  )}
                </div>
                <button
                  onClick={checkVoidPin}
                  disabled={voidPin.length !== 4}
                  className="w-full py-3 rounded-lg bg-red-600 hover:bg-red-500 text-white text-sm font-semibold disabled:opacity-40 disabled:pointer-events-none transition-colors"
                >
                  Authenticate
                </button>
              </div>
            ) : (
              <div className="p-6 space-y-4">
                <div>
                  <label className="text-xs font-semibold text-zinc-300 uppercase tracking-widest mb-2 block">Void Reason</label>
                  <select
                    value={voidReason}
                    onChange={(e) => setVoidReason(e.target.value)}
                    className="w-full bg-black border border-zinc-700 rounded-lg px-4 py-3 text-white appearance-none focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500"
                  >
                    {VOID_REASONS.map((r) => <option key={r}>{r}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-zinc-300 uppercase tracking-widest mb-2 block">Manager Justification <span className="text-red-400">*</span></label>
                  <textarea
                    value={voidJustification}
                    onChange={(e) => setVoidJustification(e.target.value)}
                    rows={3}
                    placeholder="Explain why this dispatched batch must be voided..."
                    className="w-full bg-black border border-zinc-700 rounded-lg px-4 py-3 text-white text-sm focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500 resize-none"
                  />
                </div>
                <button
                  onClick={confirmVoid}
                  disabled={!voidJustification.trim() || voidSaving}
                  className="w-full py-3 rounded-lg bg-red-600 hover:bg-red-500 text-white text-sm font-semibold disabled:opacity-40 disabled:pointer-events-none transition-colors flex items-center justify-center gap-2"
                >
                  {voidSaving ? <Loader2 size={14} className="animate-spin" /> : <Ban size={14} />}
                  Confirm Void
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
