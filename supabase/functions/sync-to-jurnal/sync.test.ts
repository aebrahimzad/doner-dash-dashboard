// Unit tests for the Jurnal bridge. Run with either:
//   node --test supabase/functions/sync-to-jurnal/sync.test.ts
//   deno test supabase/functions/sync-to-jurnal/sync.test.ts
// Jurnal and the database are faked in memory; nothing leaves the machine.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, createHash } from 'node:crypto';

import { bodyDigest, hmacAuthorization, JurnalClient } from './jurnal-client.ts';
import { paymentMethodKey, toReceivePayment, toSalesInvoice, tradingDate, validateTransaction } from './mappers.ts';
import { syncBatch, type SyncLogRow, type SyncStore } from './sync.ts';
import type { MappingConfig, PaymentAccount, PosTransaction } from './types.ts';

const cfg: MappingConfig = { customerName: 'POS Customer', salesProductName: 'POS Sales', transactionNoPrefix: 'POS' };
const txn: PosTransaction = { order_reference: '#2-1958', sales_date: '2026-11-03', payment_method: 'EDC BCA', total_amount: 185000 };

// ─── Fakes ──────────────────────────────────────────────────────────────────

function fakeStore(accounts: PaymentAccount[], opts: { failMarkInvoicedOnce?: boolean } = {}) {
  const rows = new Map<string, SyncLogRow & { locked_until: number | null }>();
  let failMarkInvoiced = opts.failMarkInvoicedOnce ?? false;
  const store: SyncStore = {
    async loadPaymentAccounts() { return new Map(accounts.map((a) => [paymentMethodKey(a.payment_method), a])); },
    async claim(t) {
      // Same rules as jurnal_claim_order, done synchronously (atomic in JS).
      const now = Date.now();
      const r = rows.get(t.order_reference);
      if (!r) {
        const row = { order_reference: t.order_reference, status: 'pending' as const, sales_date: t.sales_date,
          payment_method: t.payment_method, total_amount: t.total_amount, jurnal_invoice_id: null, jurnal_invoice_no: null,
          jurnal_payment_id: null, jurnal_payment_no: null, last_error: null, locked_until: now + 120_000 };
        rows.set(t.order_reference, row);
        return { ...row };
      }
      if (r.status === 'paid' || r.status === 'needs_review') return null;
      if (r.locked_until && r.locked_until > now) return null;
      r.locked_until = now + 120_000;
      return { ...r };
    },
    async get(ref) { const r = rows.get(ref); return r ? { ...r } : null; },
    async updateDetails(t) { Object.assign(rows.get(t.order_reference)!, { sales_date: t.sales_date, payment_method: t.payment_method, total_amount: t.total_amount }); },
    async markInvoiced(ref, inv) {
      if (failMarkInvoiced) { failMarkInvoiced = false; throw new Error('database went away'); }
      Object.assign(rows.get(ref)!, { status: 'invoiced', jurnal_invoice_id: String(inv.id), jurnal_invoice_no: inv.transaction_no });
    },
    async markPaid(ref, pay) { Object.assign(rows.get(ref)!, { status: 'paid', jurnal_payment_id: String(pay.id), jurnal_payment_no: pay.transaction_no, locked_until: null }); },
    async markFailed(ref, error) { Object.assign(rows.get(ref)!, { status: 'failed', last_error: error, locked_until: null }); },
    async markNeedsReview(ref, reason) { Object.assign(rows.get(ref)!, { status: 'needs_review', last_error: reason, locked_until: null }); },
  };
  return { store, rows };
}

/** In-memory Jurnal that, like the real one, rejects a reused transaction_no. */
function fakeJurnal() {
  const invoices = new Map<string, { id: number; body: any }>();
  const payments = new Map<string, { id: number; body: any }>();
  const calls: string[] = [];
  let nextId = 1;
  const fetchImpl = (async (url: string, init: RequestInit) => {
    const u = new URL(url);
    const path = u.pathname.replace('/public/jurnal/api/v1', '');
    calls.push(`${init.method} ${path}`);
    const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
    const [store, key] = path.startsWith('/sales_invoices') ? [invoices, 'sales_invoice'] : [payments, 'receive_payment'];
    if (init.method === 'POST') {
      const body = JSON.parse(String(init.body));
      const no = body[key].transaction_no;
      if (store.has(no)) return reply(422, { error_full_messages: ['Transaction no has already been taken'] });
      const id = nextId++;
      store.set(no, { id, body });
      return reply(201, { [key]: { id, transaction_no: no } });
    }
    const q = u.searchParams.get('transaction_no');
    const hit = q && store.get(q);
    return reply(200, { [`${key}s`]: hit ? [{ id: hit.id, transaction_no: q }] : [] });
  }) as typeof fetch;
  const client = new JurnalClient({
    baseUrl: 'https://sandbox-api.mekari.com', pathPrefix: '/public/jurnal/api/v1',
    auth: { mode: 'hmac', clientId: 'id', clientSecret: 'secret' }, fetchImpl, sleep: async () => {},
  });
  return { client, invoices, payments, calls };
}

const bca: PaymentAccount = { payment_method: 'EDC BCA', deposit_to_name: 'Bank BCA', account_code: '1-10002', jurnal_payment_method_name: 'Credit Card', is_active: true };

// ─── Trading date and validation ────────────────────────────────────────────

test('tradingDate counts 00:00–05:59 (UTC+8) as the previous day', () => {
  assert.equal(tradingDate('2026-11-03T10:00:00Z'), '2026-11-03'); // 18:00 local
  assert.equal(tradingDate('2026-11-03T17:30:00Z'), '2026-11-03'); // 01:30 local, next calendar day
  assert.equal(tradingDate('2026-11-03T21:59:59Z'), '2026-11-03'); // 05:59 local
  assert.equal(tradingDate('2026-11-03T22:00:00Z'), '2026-11-04'); // 06:00 local
  assert.equal(tradingDate('2026-12-31T18:00:00Z'), '2026-12-31'); // 02:00 on 1 Jan → still 31 Dec
});

test('validateTransaction rejects bad input', () => {
  assert.equal(validateTransaction(txn).ok, true);
  assert.equal(validateTransaction({ ...txn, sales_date: '2026-02-30' }).ok, false);
  assert.equal(validateTransaction({ ...txn, total_amount: 185000.5 }).ok, false);
  assert.equal(validateTransaction({ ...txn, total_amount: -5000 }).ok, false);
  assert.equal(validateTransaction({ ...txn, payment_method: 'Unknown' }).ok, false);
  assert.equal(validateTransaction({ ...txn, order_reference: '  ' }).ok, false);
});

test('payment method lookup ignores case, spacing and zero-width characters', () => {
  assert.equal(paymentMethodKey('  edc   BCA​'), paymentMethodKey('EDC BCA'));
});

// ─── Payloads ───────────────────────────────────────────────────────────────

test('sales invoice uses the trading date and a deterministic number', () => {
  const p = toSalesInvoice(txn, cfg).sales_invoice;
  assert.equal(p.transaction_no, 'POS-2-1958');
  assert.equal(p.transaction_date, '2026-11-03');
  assert.equal(p.reference_no, '#2-1958');
  assert.deepEqual(p.transaction_lines_attributes, [{ product_name: 'POS Sales', description: 'POS order #2-1958', quantity: 1, rate: 185000 }]);
});

test('receive payment pays the full amount into the mapped account', () => {
  const p = toReceivePayment(txn, 'POS-2-1958', bca as PaymentAccount & { deposit_to_name: string }, cfg).receive_payment;
  assert.equal(p.transaction_no, 'RP-POS-2-1958');
  assert.equal(p.deposit_to_name, 'Bank BCA');
  assert.equal(p.payment_method_name, 'Credit Card');
  assert.deepEqual(p.records_attributes, [{ transaction_no: 'POS-2-1958', amount: 185000 }]);
});

// ─── HMAC ───────────────────────────────────────────────────────────────────

test('HMAC header matches an independent HMAC-SHA256 of "date\\nrequest-line"', async () => {
  const date = 'Wed, 04 Nov 2026 08:34:02 GMT';
  const expected = createHmac('sha256', 'secret')
    .update(`date: ${date}\nPOST /public/jurnal/api/v1/sales_invoices HTTP/1.1`).digest('base64');
  const header = await hmacAuthorization('my-client', 'secret', 'post', '/public/jurnal/api/v1/sales_invoices', date);
  assert.equal(header, `hmac username="my-client", algorithm="hmac-sha256", headers="date request-line", signature="${expected}"`);
  assert.equal(await bodyDigest('{"a":1}'), `SHA-256=${createHash('sha256').update('{"a":1}').digest('base64')}`);
});

// ─── Idempotency ────────────────────────────────────────────────────────────

test('syncing the same order twice creates one invoice and one payment', async () => {
  const { store } = fakeStore([bca]);
  const j = fakeJurnal();
  const deps = { store, jurnal: j.client, cfg, userId: 'u1', dryRun: false };

  const [first] = await syncBatch([txn], deps);
  const [second] = await syncBatch([txn], deps);

  assert.equal(first.outcome, 'synced');
  assert.equal(second.outcome, 'already_synced');
  assert.equal(j.invoices.size, 1);
  assert.equal(j.payments.size, 1);
  assert.equal(j.calls.filter((c) => c.startsWith('POST')).length, 2);
});

test('the same order twice in one batch is sent once', async () => {
  const { store } = fakeStore([bca]);
  const j = fakeJurnal();
  const results = await syncBatch([txn, { ...txn }], { store, jurnal: j.client, cfg, userId: 'u1', dryRun: false });
  assert.deepEqual(results.map((r) => r.outcome), ['synced', 'invalid']);
  assert.equal(j.invoices.size, 1);
});

test('two simultaneous clicks post the order once', async () => {
  const { store } = fakeStore([bca]);
  const j = fakeJurnal();
  const deps = { store, jurnal: j.client, cfg, userId: 'u1', dryRun: false };
  const [a, b] = await Promise.all([syncBatch([txn], deps), syncBatch([txn], deps)]);
  assert.deepEqual([a[0].outcome, b[0].outcome].sort(), ['in_progress', 'synced']);
  assert.equal(j.invoices.size, 1);
  assert.equal(j.payments.size, 1);
});

test('a crash after Jurnal saved the invoice is recovered without a duplicate', async () => {
  const { store, rows } = fakeStore([bca], { failMarkInvoicedOnce: true });
  const j = fakeJurnal();
  const deps = { store, jurnal: j.client, cfg, userId: 'u1', dryRun: false };

  const [first] = await syncBatch([txn], deps);
  assert.equal(first.outcome, 'failed');          // invoice exists in Jurnal, but not in our log
  assert.equal(j.invoices.size, 1);
  assert.equal(rows.get(txn.order_reference)!.jurnal_invoice_no, null);

  const [retry] = await syncBatch([txn], deps);
  assert.equal(retry.outcome, 'synced');
  assert.equal(j.invoices.size, 1);               // the 422 was resolved by looking the number up
  assert.equal(j.payments.size, 1);
  assert.equal(rows.get(txn.order_reference)!.jurnal_invoice_no, 'POS-2-1958');
});

test('an unmapped payment method is rejected before anything reaches Jurnal', async () => {
  const { store, rows } = fakeStore([bca]);
  const j = fakeJurnal();
  const [r] = await syncBatch([{ ...txn, payment_method: 'QRIS' }], { store, jurnal: j.client, cfg, userId: 'u1', dryRun: false });
  assert.equal(r.outcome, 'invalid');
  assert.match(r.message!, /QRIS/);
  assert.equal(j.calls.length, 0);
  assert.equal(rows.size, 0);
});

test('an amount that changed after invoicing is flagged, not paid', async () => {
  const { store } = fakeStore([bca]);
  const j = fakeJurnal();
  const deps = { store, jurnal: j.client, cfg, userId: 'u1', dryRun: false };
  // Invoice succeeds, payment fails once (Jurnal 500 ×3).
  const original = j.client.createReceivePayment.bind(j.client);
  j.client.createReceivePayment = async () => { throw Object.assign(new Error('Jurnal 500'), {}); };
  assert.equal((await syncBatch([txn], deps))[0].outcome, 'failed');
  j.client.createReceivePayment = original;

  const [r] = await syncBatch([{ ...txn, total_amount: 190000 }], deps);
  assert.equal(r.outcome, 'needs_review');
  assert.equal(j.payments.size, 0);
  // And it stays flagged on later clicks.
  assert.equal((await syncBatch([txn], deps))[0].outcome, 'needs_review');
});

test('dry run builds payloads without writing or calling Jurnal', async () => {
  const { store, rows } = fakeStore([bca]);
  const j = fakeJurnal();
  const [r] = await syncBatch([txn], { store, jurnal: j.client, cfg, userId: 'u1', dryRun: true });
  assert.equal(r.outcome, 'dry_run');
  assert.equal(r.payloads?.receive_payment?.receive_payment.deposit_to_name, 'Bank BCA');
  assert.equal(j.calls.length, 0);
  assert.equal(rows.size, 0);
});

test('retries 5xx and then succeeds', async () => {
  let n = 0;
  const client = new JurnalClient({
    baseUrl: 'https://x', pathPrefix: '', auth: { mode: 'apikey', apiKey: 'k' }, sleep: async () => {},
    fetchImpl: (async (_u: string, init: RequestInit) => {
      assert.equal((init.headers as Record<string, string>).apikey, 'k');
      return ++n < 3 ? new Response('busy', { status: 503 }) : new Response('{"ok":true}', { status: 200 });
    }) as typeof fetch,
  });
  assert.deepEqual(await client.request('GET', '/accounts'), { ok: true });
  assert.equal(n, 3);
});
