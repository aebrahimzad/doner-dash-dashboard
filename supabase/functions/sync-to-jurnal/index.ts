// POST /functions/v1/sync-to-jurnal
//
// Pushes completed iSeller POS transactions into Mekari Jurnal as a Sales
// Invoice plus a Receive Payment that closes it. Safe to call repeatedly with
// the same orders: each order_reference reaches Jurnal at most once.
//
// Request (Authorization: Bearer <signed-in user's access token>):
//   { "transactions": [{ "order_reference": "#2-1958", "sales_date": "2026-11-03",
//                        "payment_method": "EDC BCA", "total_amount": 185000 }],
//     "dry_run": false }
// Response: { "summary": { synced, already_synced, ... }, "results": [ ... ] }
//
// Secrets (supabase secrets set ..., never in the frontend):
//   JURNAL_CLIENT_ID, JURNAL_CLIENT_SECRET   Mekari HMAC credentials (preferred)
//   JURNAL_API_KEY                           legacy Jurnal key, used only if the two above are unset
//   JURNAL_BASE_URL                          optional; https://sandbox-api.mekari.com for testing
//   JURNAL_CUSTOMER_NAME                     optional; default "POS Customer" (must exist in Jurnal)
//   JURNAL_SALES_PRODUCT_NAME                optional; default "POS Sales" (must exist in Jurnal)
//   JURNAL_TRANSACTION_PREFIX                optional; default "POS"
//   JURNAL_PB1_PRODUCT_NAME                  optional; default "PB1 10%" (must exist in Jurnal, with
//                                            its sales account set to PB1 Tax Payable)
//   JURNAL_PB1_RATE_PERCENT                  optional; default 10 (PB1 included in POS totals; 0 = no split)
// SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { JurnalClient, jurnalConfigFromEnv } from './jurnal-client.ts';
import { supabaseStore } from './store.ts';
import { MAX_TRANSACTIONS_PER_REQUEST, syncBatch } from './sync.ts';
import type { MappingConfig, SyncOutcome } from './types.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

const env = (name: string) => Deno.env.get(name) || undefined;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Use POST' }, 405);

  // ── Only signed-in dashboard users. The anon key alone is not enough. ──
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  const authClient = createClient(env('SUPABASE_URL')!, env('SUPABASE_ANON_KEY')!, { auth: { persistSession: false } });
  const { data: userData, error: userError } = token ? await authClient.auth.getUser(token) : { data: { user: null }, error: null };
  if (userError || !userData?.user) return json({ error: 'Sign in to sync to Jurnal' }, 401);

  // ── Input ──
  let body: { transactions?: unknown; dry_run?: unknown };
  try { body = await req.json(); } catch { return json({ error: 'Body must be JSON' }, 400); }
  const transactions = body.transactions;
  if (!Array.isArray(transactions) || transactions.length === 0) {
    return json({ error: 'transactions must be a non-empty array' }, 400);
  }
  if (transactions.length > MAX_TRANSACTIONS_PER_REQUEST) {
    return json({ error: `Send at most ${MAX_TRANSACTIONS_PER_REQUEST} transactions per request` }, 413);
  }
  const dryRun = body.dry_run === true;

  // ── Config ──
  let jurnal: JurnalClient;
  try {
    jurnal = new JurnalClient(jurnalConfigFromEnv(env));
  } catch (err) {
    if (!dryRun) return json({ error: (err as Error).message }, 500);
    jurnal = null as unknown as JurnalClient; // dry run never calls Jurnal
  }
  const cfg: MappingConfig = {
    customerName: env('JURNAL_CUSTOMER_NAME') ?? 'POS Customer',
    salesProductName: env('JURNAL_SALES_PRODUCT_NAME') ?? 'POS Sales',
    transactionNoPrefix: env('JURNAL_TRANSACTION_PREFIX') ?? 'POS',
    pb1ProductName: env('JURNAL_PB1_PRODUCT_NAME') ?? 'PB1 10%',
    pb1RatePercent: Number(env('JURNAL_PB1_RATE_PERCENT') ?? '10'),
  };
  if (!Number.isFinite(cfg.pb1RatePercent) || cfg.pb1RatePercent < 0 || cfg.pb1RatePercent > 50) {
    return json({ error: 'JURNAL_PB1_RATE_PERCENT must be a number between 0 and 50' }, 500);
  }

  const db = createClient(env('SUPABASE_URL')!, env('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

  try {
    const results = await syncBatch(transactions, {
      store: supabaseStore(db), jurnal, cfg, userId: userData.user.id, dryRun,
    });
    const summary = results.reduce((acc, r) => {
      acc[r.outcome] = (acc[r.outcome] ?? 0) + 1;
      return acc;
    }, {} as Partial<Record<SyncOutcome, number>>);
    console.log('[sync-to-jurnal]', JSON.stringify({ user: userData.user.id, dryRun, summary }));
    return json({ dry_run: dryRun, summary, results });
  } catch (err) {
    console.error('[sync-to-jurnal] Error:', (err as Error).message);
    return json({ error: (err as Error).message }, 500);
  }
});
