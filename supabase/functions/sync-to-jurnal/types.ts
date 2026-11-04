// Shared types for the iSeller → Mekari Jurnal bridge.
// Pure TypeScript: no Deno or Node imports, so the mappers can be unit-tested anywhere.

/** One completed POS transaction, as mapped by the dashboard from iSeller. */
export interface PosTransaction {
  /** iSeller order reference, e.g. "#2-1958". The idempotency key. */
  order_reference: string;
  /** Trading date (YYYY-MM-DD): UTC+8, with 00:00–05:59 counted as the previous day. */
  sales_date: string;
  /** iSeller payment type name, e.g. "EDC BCA", "Cash", "QRIS". */
  payment_method: string;
  /** Order total in whole Rupiah. */
  total_amount: number;
}

/** Row of public.jurnal_payment_accounts: where each POS payment method is deposited. */
export interface PaymentAccount {
  payment_method: string;
  /** Jurnal Cash & Bank account name, exactly as in Jurnal, e.g. "Bank BCA". */
  deposit_to_name: string | null;
  /** Account code in Jurnal, kept for reference, e.g. "1-10002". */
  account_code: string | null;
  /** Jurnal payment method name; defaults to the POS name when null. */
  jurnal_payment_method_name: string | null;
  is_active: boolean;
}

/** Fixed settings the mappers need (from function secrets, with defaults). */
export interface MappingConfig {
  /** Jurnal customer (contact) used for walk-in POS sales. Must exist in Jurnal. */
  customerName: string;
  /** Jurnal product (or service) used as the single invoice line. Must exist in Jurnal. */
  salesProductName: string;
  /** Prefix for Jurnal transaction numbers, e.g. "POS". */
  transactionNoPrefix: string;
}

export interface SalesInvoicePayload {
  sales_invoice: {
    transaction_no: string;
    transaction_date: string;
    due_date: string;
    person_name: string;
    reference_no: string;
    memo: string;
    transaction_lines_attributes: Array<{
      product_name: string;
      description: string;
      quantity: number;
      rate: number;
    }>;
  };
}

export interface ReceivePaymentPayload {
  receive_payment: {
    transaction_no: string;
    transaction_date: string;
    person_name: string;
    payment_method_name: string;
    deposit_to_name: string;
    memo: string;
    is_draft: false;
    records_attributes: Array<{
      /** Jurnal transaction number of the invoice being paid. */
      transaction_no: string;
      amount: number;
    }>;
  };
}

export type SyncOutcome =
  | 'synced'           // invoice + payment created in this call
  | 'already_synced'   // both existed from an earlier call; nothing sent to Jurnal
  | 'in_progress'      // another call holds the lock for this order right now
  | 'needs_review'     // stopped on purpose; a person has to look (see message)
  | 'failed'           // error; safe to retry with the same order_reference
  | 'invalid'          // bad input; nothing written
  | 'dry_run';         // payloads built, nothing written or sent

export interface SyncResult {
  order_reference: string;
  outcome: SyncOutcome;
  message?: string;
  jurnal_invoice_no?: string | null;
  jurnal_payment_no?: string | null;
  payloads?: { sales_invoice: SalesInvoicePayload; receive_payment: ReceivePaymentPayload | null };
}
