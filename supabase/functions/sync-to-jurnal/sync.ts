// Sync orchestration: one POS transaction → one Jurnal invoice + one payment,
// at most once, however many times "SYNC TO JURNAL" is clicked.
//
// Idempotency has three layers:
//   1. jurnal_sync_log, keyed by order_reference. A paid row is never sent again.
//   2. An atomic claim (jurnal_claim_order) with a short lock, so two clicks or
//      two tabs can't work on the same order at the same time.
//   3. Deterministic Jurnal transaction numbers (POS-2-1958 / RP-POS-2-1958).
//      If Jurnal saved something but we crashed before recording it, the retry's
//      create is rejected as a duplicate number, and the client looks the
//      existing record up instead of creating a second one.

import { JurnalApiError, type JurnalClient, type JurnalTxnRef } from './jurnal-client.ts';
import {
  invoiceTransactionNo,
  resolvePaymentAccount,
  toReceivePayment,
  toSalesInvoice,
  validateTransaction,
} from './mappers.ts';
import type { MappingConfig, PaymentAccount, PosTransaction, SyncResult } from './types.ts';

export interface SyncLogRow {
  order_reference: string;
  status: 'pending' | 'invoiced' | 'paid' | 'failed' | 'needs_review';
  sales_date: string;
  payment_method: string;
  total_amount: number;
  jurnal_invoice_id: string | null;
  jurnal_invoice_no: string | null;
  jurnal_payment_id: string | null;
  jurnal_payment_no: string | null;
  last_error: string | null;
}

/** Database operations the sync needs (Supabase in production, an in-memory fake in tests). */
export interface SyncStore {
  loadPaymentAccounts(): Promise<Map<string, PaymentAccount>>;
  /** Atomically claims the order; null if it is paid, under review, or locked by another call. */
  claim(t: PosTransaction, userId: string | null): Promise<SyncLogRow | null>;
  get(orderReference: string): Promise<SyncLogRow | null>;
  /** Replaces the stored details (only while nothing exists in Jurnal yet). */
  updateDetails(t: PosTransaction): Promise<void>;
  markInvoiced(orderReference: string, invoice: JurnalTxnRef): Promise<void>;
  markPaid(orderReference: string, payment: JurnalTxnRef): Promise<void>;
  markFailed(orderReference: string, error: string): Promise<void>;
  markNeedsReview(orderReference: string, reason: string): Promise<void>;
}

export const MAX_TRANSACTIONS_PER_REQUEST = 100;

function sameDetails(row: SyncLogRow, t: PosTransaction): boolean {
  return Number(row.total_amount) === t.total_amount
    && row.sales_date === t.sales_date
    && row.payment_method === t.payment_method;
}

function describeError(err: unknown): string {
  if (err instanceof JurnalApiError) return err.message;
  return (err as Error)?.message ?? String(err);
}

export async function syncTransaction(
  raw: unknown,
  deps: { store: SyncStore; jurnal: JurnalClient; cfg: MappingConfig; accounts: Map<string, PaymentAccount>; userId: string | null },
): Promise<SyncResult> {
  const { store, jurnal, cfg, accounts, userId } = deps;

  const v = validateTransaction(raw);
  const refForError = (raw as { order_reference?: unknown })?.order_reference;
  if (!v.ok) return { order_reference: typeof refForError === 'string' ? refForError : '', outcome: 'invalid', message: v.error };
  const t = v.value;

  // Check the account before touching Jurnal, so a missing mapping never leaves
  // an unpaid invoice behind.
  const acct = resolvePaymentAccount(t.payment_method, accounts);
  if (!acct.ok) return { order_reference: t.order_reference, outcome: 'invalid', message: acct.error };

  const row = await store.claim(t, userId);
  if (!row) {
    const existing = await store.get(t.order_reference);
    if (existing?.status === 'paid') {
      return { order_reference: t.order_reference, outcome: 'already_synced',
        jurnal_invoice_no: existing.jurnal_invoice_no, jurnal_payment_no: existing.jurnal_payment_no };
    }
    if (existing?.status === 'needs_review') {
      return { order_reference: t.order_reference, outcome: 'needs_review', message: existing.last_error ?? undefined,
        jurnal_invoice_no: existing.jurnal_invoice_no };
    }
    return { order_reference: t.order_reference, outcome: 'in_progress', message: 'Another sync is processing this order. Try again in a couple of minutes.' };
  }

  try {
    // An order whose amount/date/method changed after its invoice reached Jurnal
    // must not be paid with different numbers: stop and flag it.
    if (!sameDetails(row, t)) {
      if (row.jurnal_invoice_no) {
        const reason = `Order changed after its invoice was created in Jurnal (was ${row.total_amount} on ${row.sales_date} via ${row.payment_method}; now ${t.total_amount} on ${t.sales_date} via ${t.payment_method}). Fix in Jurnal, then clear this row.`;
        await store.markNeedsReview(t.order_reference, reason);
        return { order_reference: t.order_reference, outcome: 'needs_review', message: reason, jurnal_invoice_no: row.jurnal_invoice_no };
      }
      await store.updateDetails(t);
    }

    // 1) Sales invoice
    let invoiceNo = row.jurnal_invoice_no;
    if (!invoiceNo) {
      const { ref } = await jurnal.createSalesInvoice(toSalesInvoice(t, cfg));
      invoiceNo = ref.transaction_no || invoiceTransactionNo(t.order_reference, cfg);
      await store.markInvoiced(t.order_reference, { ...ref, transaction_no: invoiceNo });
    }

    // 2) Receive payment for the full amount, into the mapped cash/bank account
    let paymentNo = row.jurnal_payment_no;
    if (!paymentNo) {
      const { ref } = await jurnal.createReceivePayment(toReceivePayment(t, invoiceNo, acct.account, cfg));
      paymentNo = ref.transaction_no;
      await store.markPaid(t.order_reference, ref);
    }

    return { order_reference: t.order_reference, outcome: 'synced', jurnal_invoice_no: invoiceNo, jurnal_payment_no: paymentNo };
  } catch (err) {
    const message = describeError(err);
    // markFailed keeps any invoice id already recorded, so a retry only
    // creates the missing payment.
    await store.markFailed(t.order_reference, message).catch(() => {});
    return { order_reference: t.order_reference, outcome: 'failed', message };
  }
}

/** Dry run: validates and builds the exact payloads, without writing or calling Jurnal. */
export async function previewTransaction(
  raw: unknown,
  deps: { store: SyncStore; cfg: MappingConfig; accounts: Map<string, PaymentAccount> },
): Promise<SyncResult> {
  const v = validateTransaction(raw);
  const refForError = (raw as { order_reference?: unknown })?.order_reference;
  if (!v.ok) return { order_reference: typeof refForError === 'string' ? refForError : '', outcome: 'invalid', message: v.error };
  const t = v.value;

  const existing = await deps.store.get(t.order_reference);
  if (existing?.status === 'paid') {
    return { order_reference: t.order_reference, outcome: 'already_synced',
      jurnal_invoice_no: existing.jurnal_invoice_no, jurnal_payment_no: existing.jurnal_payment_no };
  }

  const invoice = toSalesInvoice(t, deps.cfg);
  const acct = resolvePaymentAccount(t.payment_method, deps.accounts);
  return {
    order_reference: t.order_reference,
    outcome: acct.ok ? 'dry_run' : 'invalid',
    message: acct.ok ? undefined : acct.error,
    payloads: {
      sales_invoice: invoice,
      receive_payment: acct.ok ? toReceivePayment(t, invoice.sales_invoice.transaction_no, acct.account, deps.cfg) : null,
    },
  };
}

/**
 * Runs a batch in order. Duplicate references inside one batch are processed
 * once; the later copies report "already in this batch".
 */
export async function syncBatch(
  transactions: unknown[],
  deps: { store: SyncStore; jurnal: JurnalClient; cfg: MappingConfig; userId: string | null; dryRun: boolean },
): Promise<SyncResult[]> {
  const accounts = await deps.store.loadPaymentAccounts();
  const seen = new Set<string>();
  const results: SyncResult[] = [];

  for (const raw of transactions) {
    const ref = typeof (raw as { order_reference?: unknown })?.order_reference === 'string'
      ? (raw as { order_reference: string }).order_reference.trim() : '';
    if (ref && seen.has(ref)) {
      results.push({ order_reference: ref, outcome: 'invalid', message: 'Duplicate order_reference in this batch; processed once.' });
      continue;
    }
    if (ref) seen.add(ref);

    results.push(deps.dryRun
      ? await previewTransaction(raw, { store: deps.store, cfg: deps.cfg, accounts })
      : await syncTransaction(raw, { store: deps.store, jurnal: deps.jurnal, cfg: deps.cfg, accounts, userId: deps.userId }));
  }
  return results;
}
