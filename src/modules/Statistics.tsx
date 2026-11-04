import { useState, useEffect } from 'react';
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Legend,
} from 'recharts';
import { TrendingUp, Receipt, Trophy, BarChart2, RefreshCw, Percent, MapPin } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useOutlet } from '../lib/outlet';
import { formatIDR } from '../utils/formatting';
import type { DailyRevenue } from '../types';

// ─── Local types ──────────────────────────────────────────────────────────────

interface CategorySpend {
  name: string;
  value: number;
}

interface RevenuePoint {
  label: string;
  netSales: number;
  cogs: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PALETTE = [
  '#f59e0b', '#0ea5e9', '#10b981', '#f43f5e', '#fb923c',
  '#06b6d4', '#84cc16', '#e11d48', '#38bdf8', '#4ade80',
];

const COGS_RATIO = 0.4;

// ─── Mock revenue generator ───────────────────────────────────────────────────

function buildMockRows(outletId: string): Omit<DailyRevenue, 'id' | 'created_at'>[] {
  const today = new Date();
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() - (6 - i));
    const gross = Math.round((3_500_000 + Math.random() * 4_500_000) / 1000) * 1000;
    const disc  = Math.round(gross * (0.03 + Math.random() * 0.05) / 1000) * 1000;
    return {
      date:        d.toISOString().slice(0, 10),
      gross_sales: gross,
      discounts:   disc,
      net_sales:   gross - disc,
      outlet_id:   outletId,
    };
  });
}

// ─── Sub-components ──────────────────────────────────────────────────────────

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

// ─── Main component ──────────────────────────────────────────────────────────

export default function Statistics() {
  const { selectedOutlet } = useOutlet();

  const [chartData,    setChartData]    = useState<CategorySpend[]>([]);
  const [totalSpend,   setTotalSpend]   = useState(0);
  const [totalLines,   setTotalLines]   = useState(0);
  const [spendLoading, setSpendLoading] = useState(true);

  const [revenueRows,    setRevenueRows]    = useState<DailyRevenue[]>([]);
  const [revenueLoading, setRevenueLoading] = useState(true);
  const [simulating,     setSimulating]     = useState(false);

  const [error, setError] = useState<string | null>(null);

  // ── Loaders ───────────────────────────────────────────────────────────────

  async function loadRevenue(outletId: string | null) {
    setRevenueLoading(true);
    let q = supabase.from('daily_revenue').select('*').order('date', { ascending: true });
    if (outletId) q = q.eq('outlet_id', outletId);
    const { data, error: err } = await q;
    if (err) setError(err.message);
    else     setRevenueRows((data ?? []) as DailyRevenue[]);
    setRevenueLoading(false);
  }

  useEffect(() => {
    async function load() {
      setError(null);
      setSpendLoading(true);

      const outletId = selectedOutlet?.id ?? null;

      // Invoice spend
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

      await loadRevenue(outletId);
    }

    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedOutlet?.id]);

  async function handleSimulate() {
    setSimulating(true);
    setError(null);
    const outletId = selectedOutlet?.id ?? null;
    const rows = buildMockRows(outletId ?? '');
    const { error: err } = await supabase.from('daily_revenue').insert(rows);
    if (err) setError(err.message);
    else     await loadRevenue(outletId);
    setSimulating(false);
  }

  // ── Derived values ────────────────────────────────────────────────────────

  const topCategory = chartData[0] ?? null;
  const loading     = spendLoading || revenueLoading;

  const revenuePoints: RevenuePoint[] = revenueRows.slice(-14).map((r) => ({
    label:    new Date(r.date + 'T00:00:00').toLocaleDateString('id-ID', {
                day: '2-digit', month: 'short',
              }),
    netSales: r.net_sales,
    cogs:     Math.round(r.net_sales * COGS_RATIO),
  }));

  const totalNetSales  = revenueRows.reduce((s, r) => s + r.net_sales, 0);
  const totalCOGS      = Math.round(totalNetSales * COGS_RATIO);
  const grossMarginPct =
    totalNetSales > 0
      ? (((totalNetSales - totalCOGS) / totalNetSales) * 100).toFixed(1)
      : null;

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const netSales7d = revenueRows
    .filter((r) => new Date(r.date + 'T00:00:00') >= sevenDaysAgo)
    .reduce((s, r) => s + r.net_sales, 0);

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
            {selectedOutlet ? (
              <>
                <MapPin size={12} className="text-amber-DEFAULT" />
                Filtered to{' '}
                <span className="text-ink-primary font-medium">{selectedOutlet.name}</span>
              </>
            ) : (
              'Purchasing, revenue, and margin overview.'
            )}
          </p>
        </div>
        <button
          onClick={handleSimulate}
          disabled={simulating}
          className="btn-secondary shrink-0"
        >
          <RefreshCw size={14} className={simulating ? 'animate-spin' : ''} />
          {simulating ? 'Syncing…' : 'Simulate iSeller Sync'}
        </button>
      </div>

      {error && (
        <div className="px-4 py-3 rounded-lg bg-red-900/30 border border-red-800/50 text-red-400 text-sm">
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
          label="Net Sales (Last 7 Days)"
          value={formatIDR(netSales7d)}
          sub={
            revenueRows.length > 0
              ? `${revenueRows.length} day${revenueRows.length === 1 ? '' : 's'} on record`
              : 'No revenue data for this outlet'
          }
          icon={<BarChart2 size={16} />}
          loading={revenueLoading}
        />
        <MetricCard
          label="Avg Gross Margin %"
          value={grossMarginPct != null ? `${grossMarginPct}%` : 'No data'}
          sub={
            grossMarginPct != null
              ? 'Net Sales − COGS ÷ Net Sales'
              : 'Simulate iSeller to populate'
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
                Last {revenuePoints.length} days
              </span>
            </div>
            <p className="text-[10px] text-ink-tertiary hidden sm:block">
              COGS estimated at {COGS_RATIO * 100}% of net sales
            </p>
          </div>

          <div className="px-2 py-6">
            <ResponsiveContainer width="100%" height={280}>
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
              <p className="text-sm font-medium text-ink-secondary">No revenue data yet</p>
              <p className="text-xs text-ink-tertiary mt-1">
                {selectedOutlet
                  ? `Click "Simulate iSeller Sync" to generate 7 days of mock data for ${selectedOutlet.name}.`
                  : 'Select an outlet and simulate data.'}
              </p>
            </div>
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
                    ? `No invoices are tagged to ${selectedOutlet.name} yet.`
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
              <p className="text-xs">Loading data…</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
