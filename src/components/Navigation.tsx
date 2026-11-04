import { MapPin, Package, ShoppingCart, Flame, BookOpen, Factory, BarChart2, ClipboardList, Repeat2, ChevronDown, Scale, ShoppingBag, Beef } from 'lucide-react';
import { useOutlet, ALL_LOCATIONS } from '../lib/outlet';

export type Module = 'data' | 'invoice' | 'broiler' | 'recipe' | 'production' | 'toll' | 'meat' | 'requisitions' | 'stats' | 'shift' | 'sales';

const NAV_ITEMS: { id: Module; label: string; sublabel: string; Icon: typeof Package }[] = [
  { id: 'data',         label: 'Data Management',    sublabel: 'Vendors & Ingredients',    Icon: Package       },
  { id: 'invoice',      label: 'Invoice Capture',    sublabel: 'Central Kitchen Only',     Icon: ShoppingCart  },
  { id: 'broiler',      label: 'Broiler Yield',      sublabel: 'True Post-Cook Cost',      Icon: Flame         },
  { id: 'recipe',       label: 'Recipe Builder',     sublabel: 'BOM & COGS',               Icon: BookOpen      },
  { id: 'production',   label: 'Production Run',     sublabel: 'Dynamic Batch Scaling',    Icon: Scale         },
  { id: 'toll',         label: 'Toll Manufacturing', sublabel: 'WIP Loop & Burdened Cost', Icon: Factory       },
  { id: 'meat',         label: 'Meat Tracker',       sublabel: 'CK Receiving → Dispatch',  Icon: Beef          },
  { id: 'requisitions', label: 'Requisitions',       sublabel: 'Hub → Retail Transfers',   Icon: Repeat2       },
  { id: 'stats',        label: 'Statistics',         sublabel: 'Spend & Revenue Insights', Icon: BarChart2     },
  { id: 'shift',        label: 'Shift Handoff',      sublabel: 'POS Depletion & Handoff',  Icon: ClipboardList },
  { id: 'sales',        label: 'Sales Sync',         sublabel: 'iSeller POS Import',       Icon: ShoppingBag   },
];

interface Props {
  active: Module;
  onChange: (m: Module) => void;
  onSignOut?: () => void;
  userEmail?: string;
}

export default function Navigation({ active, onChange, onSignOut, userEmail }: Props) {
  const { isellerLocations, selectedLocation, setSelectedLocation } = useOutlet();

  return (
    <nav className="bg-surface-card border-b border-surface-border sticky top-0 z-50 shadow-[0_1px_0_rgba(255,255,255,0.04)_inset,0_4px_16px_rgba(0,0,0,0.5)]">
      <div className="max-w-screen-2xl mx-auto px-4 flex items-stretch h-[56px]">

        {/* Wordmark — horizontal layout */}
        <div className="flex items-center shrink-0 pr-6 mr-2 border-r border-surface-border">
          <div className="flex items-center gap-1.5 leading-none tracking-tight">
            <span className="font-black text-ink-primary text-[15px] uppercase tracking-[-0.03em]">DÖNER</span>
            <span className="text-amber-DEFAULT font-black text-[15px] leading-none select-none">/</span>
            <span className="font-black text-amber-DEFAULT text-[15px] uppercase tracking-[-0.03em]">DASH</span>
          </div>
        </div>

        {/* Nav tabs */}
        <div className="flex items-stretch overflow-x-auto flex-1 scrollbar-none">
          {NAV_ITEMS.map(({ id, label, sublabel, Icon }) => {
            const isActive = active === id;
            return (
              <button
                key={id}
                onClick={() => onChange(id)}
                className={`relative flex items-center gap-2.5 px-4 border-b-4 transition-all whitespace-nowrap
                  ${isActive
                    ? 'border-amber bg-amber/5 text-ink-primary'
                    : 'border-transparent text-ink-tertiary hover:text-ink-secondary hover:bg-surface-hover hover:border-surface-muted/60'
                  }`}
              >
                <Icon
                  size={14}
                  className={isActive ? 'text-amber-DEFAULT drop-shadow-glow' : ''}
                />
                <div className="text-left">
                  <p className={`text-xs font-bold leading-none mb-0.5 tracking-tight ${isActive ? 'nav-tab-active-label text-amber-DEFAULT' : ''}`}>
                    {label}
                  </p>
                  <p className="text-[10px] text-ink-disabled leading-none">{sublabel}</p>
                </div>
              </button>
            );
          })}
        </div>

        {/* Location selector */}
        <div className="flex items-center px-4 border-l border-surface-border shrink-0 gap-2">
          <MapPin size={12} className="text-amber-DEFAULT shrink-0" />
          {isellerLocations.length === 0 ? (
            <span className="text-xs text-ink-disabled">No locations</span>
          ) : (
            <div className="relative">
              <select
                value={selectedLocation}
                onChange={(e) => setSelectedLocation(e.target.value)}
                className="appearance-none bg-surface-raised border border-surface-border rounded-sm
                           text-xs text-ink-primary pl-2.5 pr-7 py-1.5 cursor-pointer
                           focus:outline-none focus:border-amber-dim transition-colors max-w-[180px]"
              >
                <option value={ALL_LOCATIONS}>{ALL_LOCATIONS}</option>
                {isellerLocations.map((loc) => (
                  <option key={loc} value={loc}>{loc}</option>
                ))}
              </select>
              <ChevronDown
                size={10}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-tertiary pointer-events-none"
              />
            </div>
          )}
        </div>

        {/* User / sign out */}
        {onSignOut && (
          <div className="flex items-center gap-3 pl-4 border-l border-surface-border shrink-0">
            {userEmail && (
              <span className="text-[11px] text-ink-tertiary hidden xl:block max-w-[120px] truncate">
                {userEmail}
              </span>
            )}
            <button
              onClick={onSignOut}
              title="Sign out"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-sm text-ink-tertiary
                         hover:text-red-400 hover:bg-red-900/20 transition-colors text-xs font-medium"
            >
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        )}
      </div>
    </nav>
  );
}
