import { useState } from 'react';
import { RefreshCw, Clock, AlertCircle, ShoppingBag, CheckCircle2, ChevronRight, ChevronDown, Package, Download, Send } from 'lucide-react';
import * as XLSX from 'xlsx';
import { formatIDR } from '../utils/formatting';
import { useToast } from '../lib/toast';
import { addDays, formatWita, parseOrderTimestamp, todayWita, tradingDate, witaWallClockToEpoch } from '../utils/time';
import { fetchJurnalStatuses, syncToJurnal, type JurnalLogEntry, type JurnalSyncResult, type JurnalSyncTransaction } from '../services/jurnal';

interface OrderDetail {
  product_name: string;
  sku: string;
  quantity: number;
  base_price: number;
}

type JurnalRowState = 'not_synced' | 'pending' | 'synced' | 'failed' | 'needs_review' | 'skipped';

interface JurnalRowStatus {
  state: JurnalRowState;
  message?: string;
  invoiceNo?: string | null;
}

/** iSeller order statuses that count as a completed sale. */
const COMPLETED_STATUSES = new Set(['completed', 'complete', 'paid']);

function fromLog(entry: JurnalLogEntry | undefined): JurnalRowStatus {
  if (!entry) return { state: 'not_synced' };
  switch (entry.status) {
    case 'paid': return { state: 'synced', invoiceNo: entry.jurnal_invoice_no };
    case 'failed': return { state: 'failed', message: entry.last_error ?? undefined, invoiceNo: entry.jurnal_invoice_no };
    case 'needs_review': return { state: 'needs_review', message: entry.last_error ?? undefined, invoiceNo: entry.jurnal_invoice_no };
    default: return { state: 'pending', invoiceNo: entry.jurnal_invoice_no };
  }
}

function fromResult(r: JurnalSyncResult): JurnalRowStatus {
  switch (r.outcome) {
    case 'synced':
    case 'already_synced': return { state: 'synced', invoiceNo: r.jurnal_invoice_no };
    case 'in_progress': return { state: 'pending', message: r.message };
    case 'needs_review': return { state: 'needs_review', message: r.message, invoiceNo: r.jurnal_invoice_no };
    case 'invalid': return { state: 'skipped', message: r.message };
    default: return { state: 'failed', message: r.message, invoiceNo: r.jurnal_invoice_no };
  }
}

interface OrderRow {
  reference: string;
  date: string;
  status: string;
  total: number;
  payment_method: string;
  order_details: OrderDetail[];
}


// ─── Shift presets ──────────────────────────────────────────────────────────

interface ShiftPreset {
  label: string;
  startTime: string;
  endTime: string;
  crossesMidnight: boolean;
}

const SHIFT_PRESETS: ShiftPreset[] = [
  { label: 'Evening Shift (18:00 - 23:59)',        startTime: '18:00', endTime: '23:59', crossesMidnight: false },
  { label: 'Late Night Shift (00:00 - 06:00)',     startTime: '00:00', endTime: '06:00', crossesMidnight: false },
  { label: 'Full Operating Day (18:00 - 06:00)',   startTime: '18:00', endTime: '06:00', crossesMidnight: true  },
];

// ─── Helpers ────────────────────────────────────────────────────────────────

function toDatetimeLocal(dateStr: string, time: string) {
  return `${dateStr}T${time}`;
}

function mapDetail(d: any): OrderDetail {
  return {
    product_name: d.product_name ?? d.productName ?? d.ProductName ?? d.name ?? d.Name ?? '--',
    sku: d.sku ?? d.SKU ?? d.Sku ?? d.product_sku ?? d.ProductSku ?? '--',
    quantity: Number(d.quantity ?? d.Quantity ?? d.qty ?? d.Qty ?? 0),
    base_price: Number(d.base_price ?? d.basePrice ?? d.BasePrice ?? d.price ?? d.Price ?? d.unit_price ?? d.UnitPrice ?? 0),
  };
}

function formatDatetimeDisplay(dt: string): string {
  if (!dt) return '--';
  const [datePart, timePart] = dt.split('T');
  if (!datePart || !timePart) return dt;
  try {
    const [y, m, d] = datePart.split('-');
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const mon = months[parseInt(m, 10) - 1] ?? m;
    return `${d} ${mon} ${y}, ${timePart.slice(0, 5)}`;
  } catch {
    return dt;
  }
}

// ─── Main ───────────────────────────────────────────────────────────────────

export default function SalesSync() {
  const { showToast } = useToast();
  const [startDate, setStartDate] = useState(() => todayWita());
  const [endDate, setEndDate]     = useState(() => addDays(todayWita(), 1));
  const [startTime, setStartTime] = useState('16:00');
  const [endTime, setEndTime]     = useState('06:00');
  const [shiftIdx, setShiftIdx]   = useState(2);

  const [orders, setOrders]       = useState<OrderRow[] | null>(null);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [rawCount, setRawCount]   = useState(0);
  const [expanded, setExpanded]   = useState<Set<number>>(new Set());
  const [syncRange, setSyncRange] = useState<{ start: string; end: string } | null>(null);

  const [jurnalStatus, setJurnalStatus] = useState<Map<string, JurnalRowStatus>>(new Map());
  const [jurnalStatusError, setJurnalStatusError] = useState<string | null>(null);
  const [jurnalSyncing, setJurnalSyncing] = useState(false);
  const [jurnalProgress, setJurnalProgress] = useState<{ done: number; total: number } | null>(null);

  async function loadJurnalStatuses(rows: OrderRow[]) {
    setJurnalStatusError(null);
    try {
      const log = await fetchJurnalStatuses(rows.map((o) => o.reference).filter((r) => r !== '--'));
      setJurnalStatus(new Map(rows.map((o) => [o.reference, fromLog(log.get(o.reference))])));
    } catch (err) {
      setJurnalStatus(new Map());
      setJurnalStatusError((err as Error).message);
    }
  }

  function setRowStatus(updates: Map<string, JurnalRowStatus>) {
    setJurnalStatus((prev) => {
      const next = new Map(prev);
      updates.forEach((v, k) => next.set(k, v));
      return next;
    });
  }

  async function handleJurnalSync() {
    if (!orders || orders.length === 0) return;

    // Only completed sales with a reference and a readable date go to Jurnal.
    const skipped = new Map<string, JurnalRowStatus>();
    const toSend: JurnalSyncTransaction[] = [];
    for (const o of orders) {
      if (o.reference === '--') continue;
      const current = jurnalStatus.get(o.reference)?.state;
      if (current === 'synced') continue;
      if (!COMPLETED_STATUSES.has(o.status.toLowerCase())) {
        skipped.set(o.reference, { state: 'skipped', message: `Order status is "${o.status}", not completed` });
        continue;
      }
      let salesDate: string;
      try { salesDate = tradingDate(o.date); } catch {
        skipped.set(o.reference, { state: 'skipped', message: 'Order date could not be read' });
        continue;
      }
      toSend.push({ order_reference: o.reference, sales_date: salesDate, payment_method: o.payment_method, total_amount: Math.round(o.total) });
    }
    setRowStatus(skipped);

    if (toSend.length === 0) {
      showToast(skipped.size > 0 ? 'No completed orders left to post to Jurnal.' : 'Every order here is already in Jurnal.');
      return;
    }
    const sendTotal = toSend.reduce((s, t) => s + t.total_amount, 0);
    if (!window.confirm(`Post ${toSend.length} order${toSend.length !== 1 ? 's' : ''} (${formatIDR(sendTotal)}) to Mekari Jurnal?`)) return;

    setJurnalSyncing(true);
    setJurnalProgress({ done: 0, total: toSend.length });
    setRowStatus(new Map(toSend.map((t) => [t.order_reference, { state: 'pending' as const }])));
    try {
      const results = await syncToJurnal(toSend, { onProgress: (done, total) => setJurnalProgress({ done, total }) });
      setRowStatus(new Map(results.map((r) => [r.order_reference, fromResult(r)])));
      const ok = results.filter((r) => r.outcome === 'synced' || r.outcome === 'already_synced').length;
      const bad = results.length - ok;
      showToast(bad === 0 ? `Posted ${ok} order${ok !== 1 ? 's' : ''} to Jurnal.` : `Posted ${ok}; ${bad} need attention (see the Jurnal column).`);
    } catch (err) {
      showToast(`Jurnal sync error: ${(err as Error).message}`);
      // Some batches may have gone through before the error: show what the log says.
      await loadJurnalStatuses(orders);
    } finally {
      setJurnalSyncing(false);
      setJurnalProgress(null);
    }
  }


  function toggleRow(idx: number) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }

  function handlePresetChange(idx: number) {
    setShiftIdx(idx);
    const preset = SHIFT_PRESETS[idx];
    setStartTime(preset.startTime);
    setEndTime(preset.endTime);
    if (preset.crossesMidnight) {
      setEndDate(addDays(startDate, 1));
    } else {
      setEndDate(startDate);
    }
  }

  function handleStartDTChange(value: string) {
    const [d, t] = value.split('T');
    if (d) setStartDate(d);
    if (t) setStartTime(t);
    setShiftIdx(-1);
  }

  function handleEndDTChange(value: string) {
    const [d, t] = value.split('T');
    if (d) setEndDate(d);
    if (t) setEndTime(t);
    setShiftIdx(-1);
  }

  async function handleSync() {
    setLoading(true);
    setError(null);
    setOrders(null);
    setExpanded(new Set());
    setJurnalStatus(new Map());

    const resolvedStart = toDatetimeLocal(startDate, startTime);
    const resolvedEnd = toDatetimeLocal(endDate, endTime);

    setSyncRange({ start: resolvedStart, end: resolvedEnd });

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
    const requestUrl = `${supabaseUrl}/functions/v1/iseller-proxy`;
    const requestBody = { startDate: resolvedStart, endDate: resolvedEnd };

    try {
      const res = await fetch(requestUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${anonKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      const rawText = await res.text();

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${rawText.slice(0, 500)}`);
      }

      const data = JSON.parse(rawText);
      console.log('RAW I-SELLER PAYLOAD:', data);


      const orderList: unknown[] = Array.isArray(data)
        ? data
        : Array.isArray(data?.orders)
          ? data.orders
          : Array.isArray(data?.data) ? data.data
          : Array.isArray(data?.list) ? data.list
          : [];

      const mapped: OrderRow[] = orderList.map((o: any) => {
        const rawDetails: any[] = o.order_details ?? o.orderDetails ?? o.OrderDetails ?? o.items ?? o.Items ?? [];
        return {
          reference: o.order_reference ?? o.orderReference ?? o.OrderReference ?? o.reference ?? '--',
          date: o.created_at ?? o.createdAt ?? o.CreatedAt ?? o.order_date ?? o.OrderDate ?? '--',
          status: o.status ?? o.Status ?? o.order_status ?? o.OrderStatus ?? '--',
          total: Number(o.total ?? o.Total ?? o.total_amount ?? o.TotalAmount ?? o.grand_total ?? o.GrandTotal ?? 0),
          payment_method: o.transactions && o.transactions.length > 0 ? o.transactions[0].payment_type_name : 'Unknown',
          order_details: Array.isArray(rawDetails) ? rawDetails.map(mapDetail) : [],
        };
      });

      mapped.sort((a, b) => {
        const timeA = parseOrderTimestamp(a.date) ?? 0;
        const timeB = parseOrderTimestamp(b.date) ?? 0;
        if (timeA !== timeB) return timeA - timeB;
        const numA = parseInt(a.reference.replace(/[^0-9]/g, ''), 10) || 0;
        const numB = parseInt(b.reference.replace(/[^0-9]/g, ''), 10) || 0;
        return numA - numB;
      });

      // Keep orders inside the chosen WITA window. The pickers are read as Bali
      // time whatever the browser's own time zone is.
      const startMs = witaWallClockToEpoch(resolvedStart);
      const endMs = witaWallClockToEpoch(resolvedEnd);
      const filtered = mapped.filter((o) => {
        const ms = parseOrderTimestamp(o.date);
        if (ms === null) return true;
        return ms >= startMs && ms <= endMs;
      });

      setRawCount(mapped.length);
      setOrders(filtered);
      void loadJurnalStatuses(filtered);
    } catch (err) {
      const msg = (err as Error).message;
      setError(msg);
      showToast(`iSeller API Error: ${msg}`);
    } finally {
      setLoading(false);
    }
  }

  const grandTotal = orders?.reduce((s, o) => s + o.total, 0) ?? 0;

  function handleExportExcel() {
    if (!orders || orders.length === 0) return;
    const rows = orders.map((o) => {
      const isValid = parseOrderTimestamp(o.date) !== null;
      const dateTransaction = isValid ? formatWita(o.date) : '--';

      const salesDate = (() => {
        if (!isValid) return '--';
        const [yyyy, mm, dd] = tradingDate(o.date).split('-');
        return `SALES ${dd}/${mm}/${yyyy}`;
      })();

      return {
        'Order Reference': o.reference,
        'DATE TRANSACTION': dateTransaction,
        'SALES DATE': salesDate,
        'Status': o.status,
        'Payment Method': o.payment_method,
        'Total Amount': o.total,
      };
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [
      { wch: 20 }, { wch: 26 }, { wch: 22 }, { wch: 14 }, { wch: 16 }, { wch: 18 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Orders');
    const dateTag = startDate.replace(/-/g, '');
    XLSX.writeFile(wb, `iSeller_Orders_${dateTag}.xlsx`);
  }

  return (
    <section className="max-w-screen-xl mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-sky-500/20 to-sky-600/10 flex items-center justify-center">
          <ShoppingBag size={18} className="text-sky-400" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-ink-primary tracking-tight">
            iSeller Sales Sync
          </h1>
          <p className="text-xs text-ink-tertiary">
            Pull POS order data into your COGS system
          </p>
        </div>
      </div>

      {/* Controls */}
      <div className="card p-5 space-y-4">
        {/* Shift preset row */}
        <div>
          <label className="label-text mb-1.5 block">Shift Preset</label>
          <div className="relative inline-block">
            <select
              value={shiftIdx}
              onChange={(e) => handlePresetChange(Number(e.target.value))}
              className="appearance-none field-input !pr-8 !w-auto min-w-[220px]"
            >
              {SHIFT_PRESETS.map((p, i) => (
                <option key={i} value={i}>{p.label}</option>
              ))}
              {shiftIdx === -1 && <option value={-1}>Custom</option>}
            </select>
            <ChevronDown
              size={12}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-tertiary pointer-events-none"
            />
          </div>
          {SHIFT_PRESETS[shiftIdx]?.crossesMidnight && (
            <p className="text-[11px] text-amber-DEFAULT/70 mt-1.5 flex items-center gap-1">
              <Clock size={11} />
              This shift crosses midnight — End Date has been set to the next calendar day.
            </p>
          )}
        </div>

        {/* Date-time pickers + button */}
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="label-text mb-1 block">Start Date &amp; Time</label>
            <div className="relative">
              <Clock
                size={12}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-disabled pointer-events-none"
              />
              <input
                type="datetime-local"
                className="field-input !pl-7 !w-52"
                value={toDatetimeLocal(startDate, startTime)}
                onChange={(e) => handleStartDTChange(e.target.value)}
              />
            </div>
          </div>
          <div>
            <label className="label-text mb-1 block">End Date &amp; Time</label>
            <div className="relative">
              <Clock
                size={12}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-disabled pointer-events-none"
              />
              <input
                type="datetime-local"
                className="field-input !pl-7 !w-52"
                value={toDatetimeLocal(endDate, endTime)}
                onChange={(e) => handleEndDTChange(e.target.value)}
              />
            </div>
          </div>
          <button
            className="btn-primary flex items-center gap-2"
            onClick={handleSync}
            disabled={loading || !startDate || !endDate}
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            {loading ? 'Syncing...' : 'Sync iSeller Orders'}
          </button>
          {orders && orders.length > 0 && (
            <button
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border border-zinc-700 bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100 transition-colors"
              onClick={handleExportExcel}
            >
              <Download size={14} />
              Export to Excel
            </button>
          )}
          {orders && orders.length > 0 && (
            <button
              className="flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg border border-emerald-600/60 bg-emerald-900/30 text-emerald-300 hover:bg-emerald-800/40 hover:text-emerald-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={handleJurnalSync}
              disabled={jurnalSyncing || loading}
            >
              <Send size={14} className={jurnalSyncing ? 'animate-pulse' : ''} />
              {jurnalSyncing
                ? `Posting${jurnalProgress ? ` ${jurnalProgress.done}/${jurnalProgress.total}` : ''}...`
                : 'SYNC TO JURNAL'}
            </button>
          )}
        </div>
      </div>


      {/* Error */}
      {error && (
        <div className="card border-red-500/30 bg-red-950/20 p-4 flex items-start gap-3">
          <AlertCircle size={16} className="text-red-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-red-300">Sync failed</p>
            <p className="text-xs text-red-400/80 mt-0.5">{error}</p>
          </div>
        </div>
      )}

      {/* Results */}
      {orders && (
        <>
          {/* Summary bar */}
          <div className="card p-4 flex flex-wrap gap-6 items-center">
            <div className="flex items-center gap-2 text-emerald-400">
              <CheckCircle2 size={16} />
              <span className="text-sm font-semibold">
                {orders.length === rawCount
                  ? `${rawCount} order${rawCount !== 1 ? 's' : ''} fetched`
                  : `${orders.length} of ${rawCount} orders in range`}
              </span>
            </div>
            {syncRange && (
              <div className="text-xs text-ink-tertiary flex items-center gap-1.5">
                <Clock size={11} />
                {formatDatetimeDisplay(syncRange.start)} &rarr; {formatDatetimeDisplay(syncRange.end)}
              </div>
            )}
            {orders.length > 0 && (
              <div className="text-xs text-ink-tertiary">
                {jurnalStatusError
                  ? <span className="text-amber-300/80">Jurnal status unavailable: {jurnalStatusError}</span>
                  : <>Jurnal: {orders.filter((o) => jurnalStatus.get(o.reference)?.state === 'synced').length} of {orders.length} posted</>}
              </div>
            )}
            {grandTotal > 0 && (
              <div className="ml-auto text-right">
                <p className="text-[10px] text-ink-tertiary uppercase tracking-widest">
                  Grand Total
                </p>
                <p className="mono text-sm font-bold text-amber-DEFAULT">
                  {formatIDR(grandTotal)}
                </p>
              </div>
            )}
          </div>

          {/* Orders table */}
          {orders.length > 0 ? (
            <div className="card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th className="w-8" />
                      <th>Order Reference</th>
                      <th>Date</th>
                      <th>Status</th>
                      <th>Payment Method</th>
                      <th>Jurnal</th>
                      <th className="text-right">Total Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((o, i) => {
                      const isOpen = expanded.has(i);
                      const hasDetails = o.order_details.length > 0;
                      return (
                        <>
                          <tr
                            key={`row-${i}`}
                            className="cursor-pointer hover:bg-surface-hover/50 transition-colors"
                            onClick={() => toggleRow(i)}
                          >
                            <td className="!pr-0 !pl-3 w-8">
                              <ChevronRight
                                size={14}
                                className={`text-ink-tertiary transition-transform duration-200 ${isOpen ? 'rotate-90' : ''}`}
                              />
                            </td>
                            <td>
                              <span className="mono text-xs font-medium text-ink-primary">
                                {o.reference}
                              </span>
                            </td>
                            <td>
                              <span className="text-xs text-ink-secondary">
                                {formatWita(o.date)}
                              </span>
                            </td>
                            <td>
                              <StatusBadge status={o.status} />
                            </td>
                            <td>
                              <span className="px-2 py-1 text-xs font-medium rounded border border-zinc-700 bg-zinc-800 text-zinc-300 whitespace-nowrap">
                                {o.payment_method}
                              </span>
                            </td>
                            <td onClick={(e) => e.stopPropagation()}>
                              <JurnalBadge status={jurnalStatus.get(o.reference)} />
                            </td>
                            <td className="text-right">
                              <span className="mono text-xs font-semibold text-ink-primary">
                                {formatIDR(o.total)}
                              </span>
                            </td>
                          </tr>
                          {isOpen && (
                            <tr key={`detail-${i}`}>
                              <td colSpan={7} className="!p-0">
                                <DetailPanel details={o.order_details} hasDetails={hasDetails} />
                              </td>
                            </tr>
                          )}
                        </>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="card p-8 text-center text-ink-tertiary text-sm">
              No orders found for this time range.
            </div>
          )}
        </>
      )}
    </section>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function DetailPanel({ details, hasDetails }: { details: OrderDetail[]; hasDetails: boolean }) {
  if (!hasDetails) {
    return (
      <div className="pl-12 pr-4 py-3 bg-surface-secondary/40 border-t border-surface-border/50">
        <p className="text-xs text-ink-disabled italic flex items-center gap-1.5">
          <Package size={12} />
          No line items found for this order
        </p>
      </div>
    );
  }

  return (
    <div className="bg-surface-secondary/40 border-t border-surface-border/50">
      <table className="w-full">
        <thead>
          <tr className="border-b border-surface-border/30">
            <th className="text-[10px] font-semibold text-ink-tertiary uppercase tracking-wider pl-12 pr-3 py-2 text-left">SKU</th>
            <th className="text-[10px] font-semibold text-ink-tertiary uppercase tracking-wider px-3 py-2 text-left">Product Name</th>
            <th className="text-[10px] font-semibold text-ink-tertiary uppercase tracking-wider px-3 py-2 text-right">Qty</th>
            <th className="text-[10px] font-semibold text-ink-tertiary uppercase tracking-wider px-3 py-2 pr-4 text-right">Price</th>
          </tr>
        </thead>
        <tbody>
          {details.map((d, j) => (
            <tr key={j} className="border-b border-surface-border/20 last:border-b-0">
              <td className="pl-12 pr-3 py-1.5">
                <span className="mono text-[11px] text-ink-tertiary">{d.sku}</span>
              </td>
              <td className="px-3 py-1.5">
                <span className="text-xs text-ink-secondary">{d.product_name}</span>
              </td>
              <td className="px-3 py-1.5 text-right">
                <span className="mono text-xs text-ink-secondary">{d.quantity}</span>
              </td>
              <td className="px-3 py-1.5 pr-4 text-right">
                <span className="mono text-xs text-ink-secondary">{formatIDR(d.base_price)}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const JURNAL_BADGE: Record<JurnalRowState, { label: string; color: string }> = {
  not_synced:   { label: 'Not synced',   color: 'bg-surface-border text-ink-tertiary' },
  pending:      { label: 'Pending',      color: 'bg-amber-900/30 text-amber-300' },
  synced:       { label: 'Synced',       color: 'bg-emerald-900/30 text-emerald-400' },
  failed:       { label: 'Failed',       color: 'bg-red-900/30 text-red-400' },
  needs_review: { label: 'Needs review', color: 'bg-orange-900/30 text-orange-300' },
  skipped:      { label: 'Not sent',     color: 'bg-surface-border text-ink-secondary' },
};

function JurnalBadge({ status }: { status: JurnalRowStatus | undefined }) {
  if (!status) return <span className="text-xs text-ink-disabled">--</span>;
  const { label, color } = JURNAL_BADGE[status.state];
  const title = [status.invoiceNo && `Invoice ${status.invoiceNo}`, status.message].filter(Boolean).join(' · ');
  return (
    <span
      title={title || undefined}
      className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider whitespace-nowrap ${color} ${title ? 'cursor-help' : ''}`}
    >
      {label}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const s = status.toLowerCase();
  let color = 'bg-surface-border text-ink-secondary';
  if (s === 'completed' || s === 'complete' || s === 'paid')
    color = 'bg-emerald-900/30 text-emerald-400';
  else if (s === 'pending' || s === 'open')
    color = 'bg-amber-900/30 text-amber-300';
  else if (s === 'cancelled' || s === 'canceled' || s === 'voided')
    color = 'bg-red-900/30 text-red-400';

  return (
    <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider ${color}`}>
      {status}
    </span>
  );
}
