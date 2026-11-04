import React, { useState, useEffect, useCallback } from 'react';
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Legend, Brush,
} from 'recharts';
import { TrendingUp, Receipt, Trophy, BarChart2, Percent, MapPin, AlertCircle, Loader2, Calendar, Download, FileText, ChevronDown } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { supabase } from '../lib/supabase';
import { useOutlet, ALL_LOCATIONS } from '../lib/outlet';
import { formatIDR } from '../utils/formatting';
import { fetchISeller, fetchRecipeCosts, computeOrderCogs, setISellerErrorListener } from '../services/iseller';
import type { RawOrder } from '../services/iseller';
import { useToast } from '../lib/toast';


// ─── Types ──────────────────────────────────────────────────────────────────

interface CategorySpend {
  name: string;
  value: number;
}

interface RevenuePoint {
  label: string;
  netSales: number;
  cogs: number;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const PALETTE = [
  '#f59e0b', '#0ea5e9', '#10b981', '#f43f5e', '#fb923c',
  '#06b6d4', '#84cc16', '#e11d48', '#38bdf8', '#4ade80',
];

// ─── Helpers ────────────────────────────────────────────────────────────────

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function MonthPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  const [year, month] = value.split('-').map(Number);
  const [viewYear, setViewYear] = useState(year);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  useEffect(() => { setViewYear(year); }, [year]);

  function pick(m: number) {
    onChange(`${viewYear}-${String(m).padStart(2, '0')}`);
    setOpen(false);
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg bg-zinc-900 border border-zinc-700 text-zinc-200 hover:border-orange-500/60 focus:outline-none focus:ring-1 focus:ring-orange-500 transition-colors"
      >
        <Calendar size={14} className="text-zinc-500" />
        {MONTH_NAMES[month - 1]} {year}
        <ChevronDown size={14} className={`text-zinc-500 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1.5 z-50 w-64 rounded-xl bg-zinc-900 border border-zinc-700 shadow-2xl shadow-black/50 p-3 animate-in fade-in slide-in-from-top-1 duration-150">
          <div className="flex items-center justify-between mb-3">
            <button type="button" onClick={() => setViewYear((y) => y - 1)} className="w-7 h-7 rounded-md flex items-center justify-center text-zinc-400 hover:bg-zinc-800 hover:text-white transition-colors">&lsaquo;</button>
            <span className="text-sm font-semibold text-zinc-200">{viewYear}</span>
            <button type="button" onClick={() => setViewYear((y) => y + 1)} className="w-7 h-7 rounded-md flex items-center justify-center text-zinc-400 hover:bg-zinc-800 hover:text-white transition-colors">&rsaquo;</button>
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {MONTH_NAMES.map((name, i) => {
              const m = i + 1;
              const isActive = viewYear === year && m === month;
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => pick(m)}
                  className={`py-2 px-1 rounded-lg text-xs font-medium transition-colors ${
                    isActive
                      ? 'bg-orange-500 text-white'
                      : 'text-zinc-400 hover:bg-zinc-800 hover:text-white'
                  }`}
                >
                  {name.slice(0, 3)}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function currentMonthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function monthDateRange(monthKey: string) {
  const [year, mon] = monthKey.split('-').map(Number);
  const startDate = `${year}-${String(mon).padStart(2, '0')}-01T00:00:00`;
  const endDay = new Date(year, mon, 0).getDate();
  const endDate = `${year}-${String(mon).padStart(2, '0')}-${String(endDay).padStart(2, '0')}T23:59:59`;
  return { startDate, endDate };
}





function allDaysInMonth(monthKey: string): string[] {
  const [year, mon] = monthKey.split('-').map(Number);
  const daysInMonth = new Date(year, mon, 0).getDate();
  const days: string[] = [];
  for (let d = 1; d <= daysInMonth; d++) {
    days.push(`${year}-${String(mon).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
  }
  return days;
}

function buildRevenuePoints(
  orders: RawOrder[],
  costMap: Map<string, number>,
  monthKey: string,
): RevenuePoint[] {
  const dayMap = new Map<string, { netSales: number; cogs: number }>();

  orders.forEach((order) => {
    if (!order.datetime) return;
    const logicalDate = getLogicalBusinessDay(order.datetime);
    const entry = dayMap.get(logicalDate) ?? { netSales: 0, cogs: 0 };
    entry.netSales += order.total;
    entry.cogs += computeOrderCogs(order, costMap);
    dayMap.set(logicalDate, entry);
  });

  return allDaysInMonth(monthKey).map((date) => {
    const vals = dayMap.get(date) ?? { netSales: 0, cogs: 0 };
    return {
      label: new Date(date + 'T00:00:00').toLocaleDateString('id-ID', {
        day: '2-digit',
        month: 'short',
      }),
      netSales: Math.round(vals.netSales),
      cogs: Math.round(vals.cogs),
    };
  });
}

// ─── Shift aggregation helpers ─────────────────────────────────────────────

interface ShiftRow {
  logicalDate: string;
  shift: 'evening' | 'latenight';
  revenue: number;
  cogs: number;
  orderCount: number;
}

interface DayGroup {
  logicalDate: string;
  dayLabel: string;
  totalRevenue: number;
  totalCogs: number;
  shifts: ShiftRow[];
}

const witaFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Makassar',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  hour12: false,
});

function toWita(datetimeStr: string): { localDate: string; hour: number } {
  const d = new Date(datetimeStr);
  if (isNaN(d.getTime())) return { localDate: '', hour: 12 };
  const parts = witaFormatter.formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  const localDate = `${get('year')}-${get('month')}-${get('day')}`;
  const hour = Number(get('hour'));
  return { localDate, hour };
}

function getLogicalBusinessDay(datetimeStr: string): string {
  const { localDate, hour } = toWita(datetimeStr);
  if (!localDate) return '';
  if (hour >= 0 && hour < 6) {
    const d = new Date(localDate + 'T12:00:00');
    d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
  }
  return localDate;
}

function buildShiftGroups(orders: RawOrder[], costMap: Map<string, number>, monthKey: string): DayGroup[] {
  const shiftMap = new Map<string, ShiftRow>();

  orders.forEach((order) => {
    if (!order.datetime) return;
    const { hour } = toWita(order.datetime);
    const logicalDate = getLogicalBusinessDay(order.datetime);

    let shift: 'evening' | 'latenight';
    if (hour >= 0 && hour < 6) {
      shift = 'latenight';
    } else {
      shift = 'evening';
    }

    const key = `${logicalDate}|${shift}`;
    const row = shiftMap.get(key) ?? { logicalDate, shift, revenue: 0, cogs: 0, orderCount: 0 };
    row.revenue += order.total;
    row.cogs += computeOrderCogs(order, costMap);
    row.orderCount += 1;
    shiftMap.set(key, row);
  });

  const dayGroupMap = new Map<string, DayGroup>();

  for (const dateStr of allDaysInMonth(monthKey)) {
    dayGroupMap.set(dateStr, {
      logicalDate: dateStr,
      dayLabel: formatLogicalDay(dateStr),
      totalRevenue: 0,
      totalCogs: 0,
      shifts: [],
    });
  }

  for (const row of shiftMap.values()) {
    const group = dayGroupMap.get(row.logicalDate) ?? {
      logicalDate: row.logicalDate,
      dayLabel: formatLogicalDay(row.logicalDate),
      totalRevenue: 0,
      totalCogs: 0,
      shifts: [],
    };
    group.totalRevenue += row.revenue;
    group.totalCogs += row.cogs;
    group.shifts.push(row);
    dayGroupMap.set(row.logicalDate, group);
  }

  return [...dayGroupMap.values()]
    .sort((a, b) => a.logicalDate.localeCompare(b.logicalDate))
    .map((g) => {
      g.shifts.sort((a, b) => (a.shift === 'evening' ? -1 : 1));
      return g;
    });
}

function formatLogicalDay(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'short', year: 'numeric' });
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function MetricCard({
  label, value, sub, icon, loading, accent,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ReactNode;
  loading?: boolean;
  accent?: 'amber' | 'emerald';
}) {
  const isEmerald = accent === 'emerald';
  return (
    <div className={`stat-card${isEmerald ? ' border-emerald-700/40' : ''}`}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-[10px] font-semibold text-ink-tertiary uppercase tracking-widest leading-none">
          {label}
        </p>
        <div className={`p-2 rounded-lg shrink-0 -mt-0.5 ${
          isEmerald
            ? 'bg-emerald-900/30 text-emerald-400'
            : 'bg-amber-DEFAULT/10 text-amber-DEFAULT'
        }`}>
          {icon}
        </div>
      </div>
      {loading ? (
        <div className="h-6 w-32 bg-surface-border rounded animate-pulse mt-1" />
      ) : (
        <p className={`text-xl font-bold mono leading-tight ${
          isEmerald ? 'text-emerald-400' : 'text-ink-primary'
        }`}>
          {value}
        </p>
      )}
      {sub && !loading && (
        <p className="text-[11px] text-ink-tertiary">{sub}</p>
      )}
    </div>
  );
}

// ─── Export helpers ─────────────────────────────────────────────────────────

function exportCSV(groups: DayGroup[], monthLabel: string) {
  const rows: string[] = ['Date,Shift,Gross Revenue,Total COGS,Net Profit,Margin %'];
  groups.forEach((g) => {
    g.shifts.forEach((s) => {
      const net = s.revenue - s.cogs;
      const margin = s.revenue > 0 ? ((net / s.revenue) * 100).toFixed(1) : '0.0';
      const shiftLabel = s.shift === 'evening' ? 'Evening' : 'Late Night';
      rows.push(`${g.logicalDate},${shiftLabel},${Math.round(s.revenue)},${Math.round(s.cogs)},${Math.round(net)},${margin}`);
    });
    if (g.shifts.length > 0) {
      const net = g.totalRevenue - g.totalCogs;
      const margin = g.totalRevenue > 0 ? ((net / g.totalRevenue) * 100).toFixed(1) : '0.0';
      rows.push(`${g.logicalDate},TOTAL,${Math.round(g.totalRevenue)},${Math.round(g.totalCogs)},${Math.round(net)},${margin}`);
    }
  });
  const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `doner-dash-financials-${monthLabel.replace(/\s+/g, '-').toLowerCase()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function exportPDF(groups: DayGroup[], monthLabel: string, totalRevenue: number, totalCogs: number) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

  doc.setFontSize(18);
  doc.setTextColor(30, 30, 30);
  doc.text('Döner Dash Financial Summary', 14, 18);

  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  const today = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
  doc.text(`Report generated: ${today}  |  Period: ${monthLabel}`, 14, 25);

  const netProfit = totalRevenue - totalCogs;
  const marginPct = totalRevenue > 0 ? ((netProfit / totalRevenue) * 100).toFixed(1) : '0.0';
  doc.setFontSize(9);
  doc.setTextColor(60, 60, 60);
  doc.text(`Total Revenue: ${formatIDR(totalRevenue)}   |   Total COGS: ${formatIDR(totalCogs)}   |   Net Profit: ${formatIDR(netProfit)}   |   Margin: ${marginPct}%`, 14, 31);

  const tableRows: (string | number)[][] = [];
  groups.forEach((g) => {
    if (g.shifts.length === 0) return;
    g.shifts.forEach((s) => {
      const net = s.revenue - s.cogs;
      const margin = s.revenue > 0 ? `${((net / s.revenue) * 100).toFixed(1)}%` : '--';
      const shiftLabel = s.shift === 'evening' ? 'Evening (16:00-23:59)' : 'Late Night (00:00-06:00)';
      tableRows.push([
        g.dayLabel,
        shiftLabel,
        formatIDR(s.revenue),
        formatIDR(s.cogs),
        formatIDR(net),
        margin,
      ]);
    });
  });

  autoTable(doc, {
    startY: 36,
    head: [['Date', 'Shift', 'Gross Revenue', 'Total COGS', 'Net Profit', 'Margin %']],
    body: tableRows,
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [245, 158, 11], textColor: [255, 255, 255], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [250, 250, 250] },
    columnStyles: {
      2: { halign: 'right' },
      3: { halign: 'right' },
      4: { halign: 'right' },
      5: { halign: 'right' },
    },
  });

  doc.save(`doner-dash-financials-${monthLabel.replace(/\s+/g, '-').toLowerCase()}.pdf`);
}

// ─── Main component ─────────────────────────────────────────────────────────

export default function Statistics() {
  const { selectedOutlet, selectedLocation, setIsellerLocations } = useOutlet();
  const { showToast } = useToast();

  const [chartData,    setChartData]    = useState<CategorySpend[]>([]);
  const [totalSpend,   setTotalSpend]   = useState(0);
  const [totalLines,   setTotalLines]   = useState(0);
  const [spendLoading, setSpendLoading] = useState(true);

  const [allOrders,      setAllOrders]      = useState<RawOrder[]>([]);
  const [costMap,        setCostMap]        = useState<Map<string, number>>(new Map());
  const [revenueLoading, setRevenueLoading] = useState(true);

  const [selectedMonth, setSelectedMonth] = useState(currentMonthKey);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setISellerErrorListener((msg) => showToast(msg));
    return () => setISellerErrorListener(null);
  }, [showToast]);

  const loadRevenue = useCallback(async (monthKey: string) => {
    setRevenueLoading(true);
    try {
      const { startDate, endDate } = monthDateRange(monthKey);
      const startDay = startDate.slice(0, 10);
      const endDay = endDate.slice(0, 10);
      const [rawOrders, costs] = await Promise.all([
        fetchISeller(startDate, endDate),
        fetchRecipeCosts(),
      ]);
      const orders = rawOrders.filter(
        (o) => o.date >= startDay && o.date <= endDay,
      );
      setAllOrders(orders);
      setCostMap(costs);

      const uniqueLocations = [...new Set(
        orders.map((o) => o.outlet_name).filter(Boolean),
      )].sort();
      setIsellerLocations(uniqueLocations);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setRevenueLoading(false);
    }
  }, [setIsellerLocations]);

  useEffect(() => {
    async function load() {
      setError(null);
      setSpendLoading(true);

      const outletId = selectedOutlet?.id ?? null;

      let spendQ = supabase
        .from('invoice_lines')
        .select('total_invoice_price, ingredient:item_id(category)');
      if (outletId) spendQ = spendQ.eq('outlet_id', outletId);
      const { data, error: err } = await spendQ;

      if (err) {
        setError(err.message);
        setSpendLoading(false);
        return;
      }

      const lines = data ?? [];
      const spend = lines.reduce((s, l) => s + (l.total_invoice_price ?? 0), 0);
      setTotalSpend(spend);
      setTotalLines(lines.length);

      const map = new Map<string, number>();
      lines.forEach((line) => {
        const cat =
          (line.ingredient as { category?: string | null } | null)?.category ?? 'Uncategorized';
        map.set(cat, (map.get(cat) ?? 0) + (line.total_invoice_price ?? 0));
      });
      setChartData(
        [...map.entries()].sort((a, b) => b[1] - a[1]).map(([name, value]) => ({ name, value })),
      );
      setSpendLoading(false);
    }

    load();
    loadRevenue(selectedMonth);
  }, [selectedOutlet?.id, loadRevenue, selectedMonth]);

  const filteredOrders =
    selectedLocation === ALL_LOCATIONS
      ? allOrders
      : allOrders.filter((o) => o.outlet_name === selectedLocation);

  const revenuePoints = buildRevenuePoints(filteredOrders, costMap, selectedMonth);
  const shiftGroups = buildShiftGroups(filteredOrders, costMap, selectedMonth);

  // ── Derived values ────────────────────────────────────────────────────────

  const topCategory = chartData[0] ?? null;
  const loading     = spendLoading || revenueLoading;
  const locationLabel = selectedLocation === ALL_LOCATIONS ? null : selectedLocation;

  const totalNetSales = revenuePoints.reduce((s, r) => s + r.netSales, 0);
  const totalCOGS     = revenuePoints.reduce((s, r) => s + r.cogs, 0);
  const grossMarginPct =
    totalNetSales > 0
      ? (((totalNetSales - totalCOGS) / totalNetSales) * 100).toFixed(1)
      : null;

  const monthLabel = new Date(`${selectedMonth}-01T00:00:00`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

  // ── Tooltip renderers ─────────────────────────────────────────────────────

  const renderSpendTooltip = ({ active, payload }: {
    active?: boolean;
    payload?: Array<{ name: string; value: number }>;
  }) => {
    if (!active || !payload?.length) return null;
    const { name, value } = payload[0];
    const pct = totalSpend > 0 ? ((value / totalSpend) * 100).toFixed(1) : '0';
    return (
      <div className="bg-surface-card border border-surface-border rounded-lg px-3 py-2.5 shadow-xl text-left">
        <p className="text-xs font-semibold text-ink-primary mb-1">{name}</p>
        <p className="text-xs mono text-amber-DEFAULT">{formatIDR(value)}</p>
        <p className="text-[11px] text-ink-tertiary mt-0.5">{pct}% of total</p>
      </div>
    );
  };

  const renderRevenueTooltip = ({
    active,
    payload,
    label,
  }: {
    active?: boolean;
    payload?: Array<{ name: string; value: number; color: string }>;
    label?: string;
  }) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="bg-surface-card border border-surface-border rounded-lg px-3 py-2.5 shadow-xl text-left min-w-[180px]">
        <p className="text-[11px] font-semibold text-ink-secondary mb-2">{label}</p>
        {payload.map((p) => (
          <div key={p.name} className="flex items-center justify-between gap-4 mb-1">
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full" style={{ background: p.color }} />
              <span className="text-[11px] text-ink-tertiary">{p.name}</span>
            </div>
            <span className="text-[11px] mono font-medium text-ink-primary">
              {formatIDR(Number(p.value))}
            </span>
          </div>
        ))}
      </div>
    );
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-screen-2xl mx-auto px-4 py-8 space-y-8">

      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-ink-primary tracking-tight">
            Statistics & Insights
          </h1>
          <p className="text-sm text-ink-tertiary mt-1 flex items-center gap-1.5">
            {locationLabel ? (
              <>
                <MapPin size={12} className="text-amber-DEFAULT" />
                Filtered to{' '}
                <span className="text-ink-primary font-medium">{locationLabel}</span>
              </>
            ) : (
              `Sales, COGS, and margin overview for ${monthLabel}.`
            )}
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <MonthPicker value={selectedMonth} onChange={setSelectedMonth} />
          <button
            onClick={() => exportCSV(shiftGroups, monthLabel)}
            disabled={revenueLoading || shiftGroups.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg bg-surface-raised border border-surface-border text-ink-secondary hover:text-ink-primary hover:border-amber-DEFAULT/40 transition-all disabled:opacity-40 disabled:pointer-events-none"
          >
            <Download size={13} />
            CSV
          </button>
          <button
            onClick={() => exportPDF(shiftGroups, monthLabel, totalNetSales, totalCOGS)}
            disabled={revenueLoading || shiftGroups.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg bg-surface-raised border border-surface-border text-ink-secondary hover:text-ink-primary hover:border-amber-DEFAULT/40 transition-all disabled:opacity-40 disabled:pointer-events-none"
          >
            <FileText size={13} />
            PDF
          </button>
          {revenueLoading && (
            <div className="flex items-center gap-2 text-ink-tertiary text-xs">
              <Loader2 size={14} className="animate-spin" />
              Loading...
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="px-4 py-3 rounded-lg bg-red-900/30 border border-red-800/50 text-red-400 text-sm flex items-start gap-2">
          <AlertCircle size={16} className="shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      {/* ── Metric cards ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          label="Total Spend (All Time)"
          value={formatIDR(totalSpend)}
          icon={<TrendingUp size={16} />}
          loading={spendLoading}
        />
        <MetricCard
          label="Total Invoices Logged"
          value={totalLines.toLocaleString()}
          icon={<Receipt size={16} />}
          loading={spendLoading}
        />
        <MetricCard
          label={`Net Sales (${monthLabel})`}
          value={formatIDR(totalNetSales)}
          sub={
            revenuePoints.length > 0
              ? `${monthLabel} from iSeller`
              : 'No sales data from iSeller'
          }
          icon={<BarChart2 size={16} />}
          loading={revenueLoading}
        />
        <MetricCard
          label="Avg Gross Margin %"
          value={grossMarginPct != null ? `${grossMarginPct}%` : 'No data'}
          sub={
            grossMarginPct != null
              ? `Sales ${formatIDR(totalNetSales)} - COGS ${formatIDR(totalCOGS)}`
              : 'Assign SKUs to recipes to calculate'
          }
          icon={<Percent size={16} />}
          loading={revenueLoading}
          accent={grossMarginPct != null ? 'emerald' : undefined}
        />
      </div>

      {/* ── Revenue area chart ─────────────────────────────────────────────── */}
      {!revenueLoading && revenuePoints.length > 0 && (
        <div className="panel">
          <div className="panel-header">
            <div className="flex items-center gap-3">
              <TrendingUp size={16} className="text-amber-DEFAULT" />
              <h2 className="text-sm font-semibold text-ink-primary tracking-wide">
                Daily Net Sales vs. COGS
              </h2>
              <span className="tag bg-surface-border text-ink-secondary">
                {monthLabel}
              </span>
            </div>
            <p className="text-[10px] text-ink-tertiary hidden sm:block">
              COGS calculated from recipe ingredients matched by SKU
            </p>
          </div>

          <div className="px-2 py-6">
            <ResponsiveContainer width="100%" height={340}>
              <AreaChart data={revenuePoints} margin={{ top: 4, right: 20, left: 10, bottom: 0 }}>
                <defs>
                  <linearGradient id="gradNet" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#f59e0b" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gradCogs" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#f43f5e" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#f43f5e" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#71717a' }} axisLine={false} tickLine={false} />
                <YAxis
                  tick={{ fontSize: 11, fill: '#71717a' }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v: number) => `Rp ${(v / 1_000_000).toFixed(1)}M`}
                  width={70}
                />
                <Tooltip
                  content={renderRevenueTooltip as React.FC}
                  cursor={{ stroke: 'rgba(255,255,255,0.08)', strokeWidth: 1 }}
                />
                <Legend
                  iconType="circle"
                  iconSize={8}
                  wrapperStyle={{ fontSize: '11px', paddingTop: '12px', color: '#a1a1aa' }}
                />
                <Area
                  type="monotone"
                  dataKey="netSales"
                  name="Net Sales"
                  stroke="#f59e0b"
                  strokeWidth={2}
                  fill="url(#gradNet)"
                  dot={false}
                  activeDot={{ r: 4, fill: '#f59e0b', stroke: '#1c1917', strokeWidth: 2 }}
                />
                <Area
                  type="monotone"
                  dataKey="cogs"
                  name="COGS"
                  stroke="#f43f5e"
                  strokeWidth={2}
                  fill="url(#gradCogs)"
                  dot={false}
                  activeDot={{ r: 4, fill: '#f43f5e', stroke: '#1c1917', strokeWidth: 2 }}
                />
                <Brush
                  dataKey="label"
                  height={28}
                  fill="#18181b"
                  stroke="#f97316"
                  travellerWidth={10}
                  tickFormatter={() => ''}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Revenue empty state */}
      {!revenueLoading && revenuePoints.length === 0 && (
        <div className="panel">
          <div className="flex flex-col items-center justify-center py-14 text-center gap-3">
            <div className="p-4 rounded-full bg-surface-raised">
              <TrendingUp size={26} className="text-ink-disabled" />
            </div>
            <div>
              <p className="text-sm font-medium text-ink-secondary">No recent sales data</p>
              <p className="text-xs text-ink-tertiary mt-1">
                No orders were returned from iSeller for {monthLabel}.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── Shift Breakdown Table ──────────────────────────────────────────── */}
      {!revenueLoading && shiftGroups.length > 0 && (
        <div className="panel">
          <div className="panel-header">
            <div className="flex items-center gap-3">
              <BarChart2 size={16} className="text-amber-DEFAULT" />
              <h2 className="text-sm font-semibold text-ink-primary tracking-wide">
                Revenue by Logical Business Day & Shift
              </h2>

            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="data-table w-full">
              <thead className="sticky top-0 z-10 bg-surface-card">
                <tr>
                  <th className="text-left">Date & Shift</th>
                  <th className="text-right">Gross Revenue</th>
                  <th className="text-right">Total COGS</th>
                  <th className="text-right">Net Profit</th>
                  <th className="text-right">Margin %</th>
                </tr>
              </thead>
              <tbody>
                {shiftGroups.map((group) => {
                  const netProfit = group.totalRevenue - group.totalCogs;
                  const margin = group.totalRevenue > 0
                    ? ((netProfit / group.totalRevenue) * 100).toFixed(1)
                    : '--';
                  return (
                    <React.Fragment key={group.logicalDate}>
                      <tr className="bg-surface-raised/50 border-t border-surface-border">
                        <td className="!py-3">
                          <span className="text-xs font-semibold text-ink-primary">
                            {group.dayLabel}
                          </span>
                        </td>
                        <td className="text-right !py-3">
                          <span className="mono text-xs font-bold text-ink-primary">
                            {formatIDR(group.totalRevenue)}
                          </span>
                        </td>
                        <td className="text-right !py-3">
                          <span className="mono text-xs font-bold text-red-400">
                            {costMap.size > 0 ? formatIDR(group.totalCogs) : '--'}
                          </span>
                        </td>
                        <td className="text-right !py-3">
                          <span className={`mono text-xs font-bold ${netProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {costMap.size > 0 ? formatIDR(netProfit) : '--'}
                          </span>
                        </td>
                        <td className="text-right !py-3">
                          <span className="mono text-xs font-bold text-ink-secondary">
                            {costMap.size > 0 ? `${margin}%` : '--'}
                          </span>
                        </td>
                      </tr>
                      {group.shifts.map((s) => {
                        const sNet = s.revenue - s.cogs;
                        const sMargin = s.revenue > 0
                          ? ((sNet / s.revenue) * 100).toFixed(1)
                          : '--';
                        return (
                          <tr key={`${group.logicalDate}-${s.shift}`} className="hover:bg-surface-hover/50 transition-colors">
                            <td className="!pl-8 !py-2">
                              <span className="text-[11px] text-ink-tertiary">
                                {s.shift === 'evening' ? 'Evening Shift (16:00–23:59)' : 'Late Night Shift (00:00–06:00)'}
                              </span>
                              <span className="ml-2 text-[10px] text-ink-disabled">
                                {s.orderCount} order{s.orderCount !== 1 ? 's' : ''}
                              </span>
                            </td>
                            <td className="text-right !py-2">
                              <span className="mono text-[11px] text-ink-secondary">
                                {formatIDR(s.revenue)}
                              </span>
                            </td>
                            <td className="text-right !py-2">
                              <span className="mono text-[11px] text-ink-tertiary">
                                {costMap.size > 0 ? formatIDR(s.cogs) : '--'}
                              </span>
                            </td>
                            <td className="text-right !py-2">
                              <span className={`mono text-[11px] ${sNet >= 0 ? 'text-ink-tertiary' : 'text-red-400'}`}>
                                {costMap.size > 0 ? formatIDR(sNet) : '--'}
                              </span>
                            </td>
                            <td className="text-right !py-2">
                              <span className="mono text-[11px] text-ink-tertiary">
                                {costMap.size > 0 ? `${sMargin}%` : '--'}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Spend by Category donut ────────────────────────────────────────── */}
      {!spendLoading && (
        <div className="panel">
          <div className="panel-header">
            <div className="flex items-center gap-3">
              <BarChart2 size={16} className="text-amber-DEFAULT" />
              <h2 className="text-sm font-semibold text-ink-primary tracking-wide">
                Spend by Ingredient Category
              </h2>
              {chartData.length > 0 && (
                <span className="tag bg-surface-border text-ink-secondary">
                  {chartData.length}{' '}
                  {chartData.length === 1 ? 'category' : 'categories'}
                </span>
              )}
            </div>
            {topCategory && (
              <div className="hidden sm:flex items-center gap-2">
                <Trophy size={13} className="text-amber-DEFAULT" />
                <span className="text-xs text-ink-tertiary">
                  Top: <span className="text-ink-primary font-medium">{topCategory.name}</span>
                </span>
              </div>
            )}
          </div>

          {chartData.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
              <div className="p-4 rounded-full bg-surface-raised">
                <BarChart2 size={26} className="text-ink-disabled" />
              </div>
              <div>
                <p className="text-sm font-medium text-ink-secondary">No invoice spend data</p>
                <p className="text-xs text-ink-tertiary mt-1">
                  {selectedOutlet
                    ? `No invoices found for this view yet.`
                    : 'Log invoice lines in Invoice Capture to see spending insights here.'}
                </p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col lg:flex-row gap-6 lg:gap-10 px-6 py-8 items-center lg:items-start">
              {/* Donut */}
              <div className="flex items-center justify-center shrink-0">
                <div className="relative w-72 h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                      <Pie
                        data={chartData}
                        cx="50%"
                        cy="50%"
                        innerRadius={72}
                        outerRadius={120}
                        paddingAngle={2}
                        dataKey="value"
                        stroke="none"
                        animationBegin={0}
                        animationDuration={600}
                      >
                        {chartData.map((_, idx) => (
                          <Cell key={idx} fill={PALETTE[idx % PALETTE.length]} />
                        ))}
                      </Pie>
                      <Tooltip content={renderSpendTooltip as React.FC} cursor={false} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center gap-0.5">
                    <span className="text-[10px] uppercase tracking-widest text-ink-tertiary font-medium">Total</span>
                    <span className="text-[13px] font-bold mono text-ink-primary leading-tight">
                      {formatIDR(totalSpend)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Breakdown table */}
              <div className="flex-1 w-full overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="border-b border-surface-border">
                      <th className="text-left pb-3 text-[10px] uppercase tracking-widest text-ink-tertiary font-semibold">Category</th>
                      <th className="text-right pb-3 text-[10px] uppercase tracking-widest text-ink-tertiary font-semibold w-16">Share</th>
                      <th className="text-right pb-3 text-[10px] uppercase tracking-widest text-ink-tertiary font-semibold">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {chartData.map((item, idx) => {
                      const pct = totalSpend > 0 ? (item.value / totalSpend) * 100 : 0;
                      return (
                        <tr key={item.name} className="border-b border-surface-border hover:bg-surface-hover transition-colors">
                          <td className="py-3">
                            <div className="flex items-center gap-2.5">
                              <div className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: PALETTE[idx % PALETTE.length] }} />
                              <span className="text-sm text-ink-primary">{item.name}</span>
                            </div>
                          </td>
                          <td className="py-3 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <div className="w-16 h-1.5 rounded-full bg-surface-border overflow-hidden hidden sm:block">
                                <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: PALETTE[idx % PALETTE.length] }} />
                              </div>
                              <span className="text-xs text-ink-tertiary w-10 text-right">{pct.toFixed(1)}%</span>
                            </div>
                          </td>
                          <td className="py-3 text-right text-xs mono text-amber-DEFAULT">{formatIDR(item.value)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-amber-DEFAULT/20">
                      <td className="pt-3 text-sm font-semibold text-ink-primary">Total</td>
                      <td className="pt-3 text-right text-xs text-ink-tertiary">100%</td>
                      <td className="pt-3 text-right text-xs mono text-amber-DEFAULT font-bold">{formatIDR(totalSpend)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="panel">
          <div className="flex items-center justify-center py-20">
            <div className="flex flex-col items-center gap-3 text-ink-tertiary">
              <div className="w-16 h-16 rounded-full border-2 border-surface-border border-t-amber-DEFAULT animate-spin" />
              <p className="text-xs">Loading data...</p>
            </div>
          </div>
        </div>
      )}


    </div>
  );
}
