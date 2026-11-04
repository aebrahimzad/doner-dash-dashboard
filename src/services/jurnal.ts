import { supabase } from '../lib/supabase';

// Browser side of "SYNC TO JURNAL". Holds no Jurnal credentials: it calls the
// sync-to-jurnal Edge Function with the signed-in user's session token.

export interface JurnalSyncTransaction {
  order_reference: string;
  sales_date: string;      // YYYY-MM-DD trading date (see tradingDate)
  payment_method: string;
  total_amount: number;    // whole Rupiah
}

export type JurnalSyncOutcome =
  | 'synced' | 'already_synced' | 'in_progress' | 'needs_review' | 'failed' | 'invalid' | 'dry_run';

export interface JurnalSyncResult {
  order_reference: string;
  outcome: JurnalSyncOutcome;
  message?: string;
  jurnal_invoice_no?: string | null;
  jurnal_payment_no?: string | null;
  payloads?: unknown;
}

const BATCH_SIZE = 50; // the function accepts up to 100; smaller batches finish well inside its time limit

/**
 * Trading date for an iSeller order timestamp: UTC+8, with 00:00–05:59
 * counted as the previous day. Uses UTC getters, so it gives the same answer
 * whatever time zone the browser is in.
 */
export function tradingDate(timestamp: string): string {
  const ms = Date.parse(timestamp);
  if (Number.isNaN(ms)) throw new Error(`Invalid order timestamp: ${timestamp}`);
  const local = new Date(ms + 8 * 60 * 60 * 1000);
  if (local.getUTCHours() < 6) local.setUTCDate(local.getUTCDate() - 1);
  return local.toISOString().slice(0, 10);
}

/**
 * Sends transactions to Jurnal in batches. Safe to call again with the same
 * orders: ones already synced come back as "already_synced".
 * Pass dryRun: true to see the exact Jurnal payloads without sending anything.
 */
export async function syncToJurnal(
  transactions: JurnalSyncTransaction[],
  opts: { dryRun?: boolean; onProgress?: (done: number, total: number) => void } = {},
): Promise<JurnalSyncResult[]> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Sign in to sync to Jurnal');

  const url = `${import.meta.env.VITE_SUPABASE_URL as string}/functions/v1/sync-to-jurnal`;
  const results: JurnalSyncResult[] = [];

  for (let i = 0; i < transactions.length; i += BATCH_SIZE) {
    const batch = transactions.slice(i, i + BATCH_SIZE);
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ transactions: batch, dry_run: opts.dryRun === true }),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) throw new Error(body?.error ?? `Jurnal sync failed (HTTP ${res.status})`);
    results.push(...(body.results as JurnalSyncResult[]));
    opts.onProgress?.(Math.min(i + BATCH_SIZE, transactions.length), transactions.length);
  }
  return results;
}
