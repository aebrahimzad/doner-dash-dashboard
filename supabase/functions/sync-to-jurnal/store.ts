// Supabase-backed SyncStore. Uses the service-role client, so it bypasses RLS;
// the function checks the caller is a signed-in user before using it.

import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import type { JurnalTxnRef } from './jurnal-client.ts';
import { paymentMethodKey } from './mappers.ts';
import type { SyncLogRow, SyncStore } from './sync.ts';
import type { PaymentAccount, PosTransaction } from './types.ts';

const LOCK_SECONDS = 120;

function check<T>(res: { data: T; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.data;
}

export function supabaseStore(db: SupabaseClient): SyncStore {
  const log = () => db.from('jurnal_sync_log');

  return {
    async loadPaymentAccounts() {
      const rows = check(
        await db.from('jurnal_payment_accounts')
          .select('payment_method, deposit_to_name, account_code, jurnal_payment_method_name, is_active'),
        'Loading jurnal_payment_accounts',
      ) as PaymentAccount[];
      return new Map(rows.map((r) => [paymentMethodKey(r.payment_method), r]));
    },

    async claim(t: PosTransaction, userId: string | null) {
      const rows = check(
        await db.rpc('jurnal_claim_order', {
          p_order_reference: t.order_reference,
          p_sales_date: t.sales_date,
          p_payment_method: t.payment_method,
          p_total_amount: t.total_amount,
          p_user_id: userId,
          p_lock_seconds: LOCK_SECONDS,
        }),
        'Claiming order',
      ) as SyncLogRow[] | null;
      return rows?.[0] ?? null;
    },

    async get(orderReference: string) {
      return check(
        await log().select('*').eq('order_reference', orderReference).maybeSingle(),
        'Reading jurnal_sync_log',
      ) as SyncLogRow | null;
    },

    async updateDetails(t: PosTransaction) {
      check(await log().update({
        sales_date: t.sales_date, payment_method: t.payment_method, total_amount: t.total_amount,
      }).eq('order_reference', t.order_reference).is('jurnal_invoice_no', null), 'Updating order details');
    },

    async markInvoiced(orderReference: string, inv: JurnalTxnRef) {
      check(await log().update({
        status: 'invoiced', jurnal_invoice_id: inv.id == null ? null : String(inv.id),
        jurnal_invoice_no: inv.transaction_no, last_error: null,
      }).eq('order_reference', orderReference), 'Recording invoice');
    },

    async markPaid(orderReference: string, pay: JurnalTxnRef) {
      check(await log().update({
        status: 'paid', jurnal_payment_id: pay.id == null ? null : String(pay.id),
        jurnal_payment_no: pay.transaction_no, last_error: null,
        locked_until: null, paid_at: new Date().toISOString(),
      }).eq('order_reference', orderReference), 'Recording payment');
    },

    async markFailed(orderReference: string, error: string) {
      check(await log().update({ status: 'failed', last_error: error.slice(0, 1000), locked_until: null })
        .eq('order_reference', orderReference), 'Recording failure');
    },

    async markNeedsReview(orderReference: string, reason: string) {
      check(await log().update({ status: 'needs_review', last_error: reason.slice(0, 1000), locked_until: null })
        .eq('order_reference', orderReference), 'Flagging for review');
    },
  };
}
