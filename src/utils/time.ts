// Bali time (WITA, UTC+8) helpers.
//
// Everything here does its arithmetic on UTC instants and reads the result with
// UTC getters, so it gives the same answer whatever time zone the browser is set
// to. (Local getters like getHours() would add the browser's own offset on top of
// the +8 h shift, which is what put Bali-browser dates 16 hours off.)

const WITA_OFFSET_MS = 8 * 60 * 60 * 1000;
/** Orders before this WITA hour belong to the previous trading day. */
export const TRADING_DAY_CUTOFF_HOUR = 6;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Parses an iSeller timestamp to epoch ms. A timestamp without a zone
 * ("2026-11-03 17:30:00") is taken as UTC, as this page has always assumed
 * (it added 8 hours to show WITA). Returns null if it can't be parsed.
 */
export function parseOrderTimestamp(raw: string | null | undefined): number | null {
  if (!raw || raw === '--') return null;
  let s = raw.trim().replace(' ', 'T');
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) s += 'T00:00:00';
  if (!/(Z|[+-]\d{2}:?\d{2})$/i.test(s)) s += 'Z';
  const ms = Date.parse(s);
  return Number.isNaN(ms) ? null : ms;
}

/** The WITA wall-clock reading of an instant, as UTC fields of a Date. */
function witaClock(ms: number): Date {
  return new Date(ms + WITA_OFFSET_MS);
}

const pad = (n: number) => n.toString().padStart(2, '0');

/** "04 Nov 2026 at 01:30" in WITA, or the raw value if it can't be parsed. */
export function formatWita(raw: string): string {
  const ms = parseOrderTimestamp(raw);
  if (ms === null) return raw || '--';
  const d = witaClock(ms);
  return `${pad(d.getUTCDate())} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()} at ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

/**
 * Trading date (YYYY-MM-DD) for an order timestamp: WITA, with 00:00–05:59
 * counted as the previous day. Throws if the timestamp can't be parsed.
 */
export function tradingDate(raw: string): string {
  const ms = parseOrderTimestamp(raw);
  if (ms === null) throw new Error(`Invalid order timestamp: ${raw}`);
  const d = witaClock(ms);
  if (d.getUTCHours() < TRADING_DAY_CUTOFF_HOUR) d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** Epoch ms for a WITA wall-clock "YYYY-MM-DDTHH:MM[:SS]" (as from a datetime-local input). */
export function witaWallClockToEpoch(value: string): number {
  const [date, time = '00:00'] = value.split('T');
  const hms = time.length === 5 ? `${time}:00` : time.slice(0, 8);
  return Date.parse(`${date}T${hms}Z`) - WITA_OFFSET_MS;
}

/** Today's date in WITA, YYYY-MM-DD. */
export function todayWita(): string {
  return witaClock(Date.now()).toISOString().slice(0, 10);
}

/** Adds whole days to a YYYY-MM-DD date. */
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
