import { useState, useRef, useEffect, useMemo } from 'react';
import { ChevronDown } from 'lucide-react';

export interface SelectOption {
  value: string;
  label: string;
  group?: string;
}

interface Props {
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

// ─── Types for grouped rendering ─────────────────────────────────────────────

type RenderItem =
  | { kind: 'header'; group: string }
  | { kind: 'option'; opt: SelectOption; filteredIdx: number };

// ─── Component ────────────────────────────────────────────────────────────────

export default function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = '— Select —',
  className = '',
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlighted, setHighlighted] = useState(0);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const selected = options.find((o) => o.value === value);

  // Whether ANY option has a group defined — drives grouped rendering
  const hasGroups = useMemo(() => options.some((o) => !!o.group), [options]);

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    return q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options;
  }, [options, query]);

  // Build flat render list: group headers interleaved with options
  const renderItems = useMemo((): RenderItem[] => {
    if (!hasGroups) {
      return filtered.map((opt, idx) => ({ kind: 'option', opt, filteredIdx: idx }));
    }

    // Bucket options by group
    const buckets = new Map<string, { opt: SelectOption; filteredIdx: number }[]>();
    filtered.forEach((opt, idx) => {
      const g = opt.group ?? '';
      if (!buckets.has(g)) buckets.set(g, []);
      buckets.get(g)!.push({ opt, filteredIdx: idx });
    });

    // Sort groups: named groups alphabetically, then '' (Uncategorized) last
    const sortedKeys = [...buckets.keys()].sort((a, b) => {
      if (!a && b) return 1;
      if (a && !b) return -1;
      return a.localeCompare(b);
    });

    const items: RenderItem[] = [];
    for (const g of sortedKeys) {
      items.push({ kind: 'header', group: g || 'Uncategorized' });
      for (const entry of buckets.get(g)!) {
        items.push({ kind: 'option', ...entry });
      }
    }
    return items;
  }, [filtered, hasGroups]);

  function openDropdown() {
    setQuery('');
    setHighlighted(Math.max(0, filtered.findIndex((o) => o.value === value)));
    setOpen(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  function closeDropdown() {
    setOpen(false);
    setQuery('');
  }

  function pick(opt: SelectOption) {
    onChange(opt.value);
    closeDropdown();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      closeDropdown();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlighted((h) => Math.min(h + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlighted((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filtered[highlighted]) pick(filtered[highlighted]);
    }
  }

  useEffect(() => { setHighlighted(0); }, [query]);

  // Scroll highlighted option into view using data-idx attribute
  useEffect(() => {
    const item = listRef.current?.querySelector(
      `[data-idx="${highlighted}"]`
    ) as HTMLElement | undefined;
    item?.scrollIntoView({ block: 'nearest' });
  }, [highlighted]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (!wrapperRef.current?.contains(e.target as Node)) closeDropdown();
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  return (
    <div ref={wrapperRef} className={`relative ${className}`}>
      {/* Trigger */}
      <div
        className="field-input flex items-center cursor-pointer gap-2"
        onClick={() => { if (!open) openDropdown(); }}
      >
        {open ? (
          <input
            ref={inputRef}
            type="text"
            className="flex-1 bg-transparent outline-none text-sm text-ink-primary placeholder:text-ink-disabled min-w-0"
            placeholder="Type to filter…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
          />
        ) : (
          <span className={`flex-1 text-sm truncate select-none ${selected ? 'text-ink-primary' : 'text-ink-disabled'}`}>
            {selected ? selected.label : placeholder}
          </span>
        )}
        <ChevronDown
          size={14}
          className={`text-ink-tertiary shrink-0 transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
        />
      </div>

      {/* Dropdown */}
      {open && (
        <ul
          ref={listRef}
          className="absolute z-50 w-full mt-1 rounded border border-surface-border bg-surface-raised shadow-lg overflow-y-auto max-h-60"
        >
          {filtered.length === 0 ? (
            <li className="px-3 py-2.5 text-xs text-ink-disabled italic">
              No matches for "{query}"
            </li>
          ) : (
            renderItems.map((item, renderIdx) => {
              if (item.kind === 'header') {
                return (
                  <li
                    key={`header-${item.group}-${renderIdx}`}
                    className="px-3 pt-2.5 pb-1 text-[10px] font-semibold text-ink-tertiary uppercase tracking-widest bg-surface-base border-b border-surface-border sticky top-0"
                  >
                    {item.group}
                  </li>
                );
              }

              const { opt, filteredIdx } = item;
              return (
                <li
                  key={opt.value}
                  data-idx={filteredIdx}
                  className={`px-3 py-2 text-sm cursor-pointer transition-colors leading-snug ${
                    filteredIdx === highlighted ? 'bg-surface-hover' : ''
                  } ${opt.value === value ? 'text-amber-DEFAULT font-medium' : 'text-ink-primary'}`}
                  onMouseDown={(e) => { e.preventDefault(); pick(opt); }}
                  onMouseEnter={() => setHighlighted(filteredIdx)}
                >
                  {opt.label}
                </li>
              );
            })
          )}
        </ul>
      )}
    </div>
  );
}
