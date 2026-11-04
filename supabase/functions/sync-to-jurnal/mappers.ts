// Pure mapping and validation: POS transaction → Jurnal payloads.
//
// Field names follow Jurnal's create API (name-based lookups such as
// person_name / product_name / deposit_to_name). They are kept in this one file
// so that, if the sandbox rejects a field, there is exactly one place to change.

import type {
  MappingConfig,
  PaymentAccount,
  PosTransaction,
  ReceivePaymentPayload,
  SalesInvoicePayload,
} from './types.ts';

// ─── Trading date ───────────────────────────────────────────────────────────

const UTC8_MS = 8 * 60 * 60 * 1000;
/** Orders before this local hour belong to the previous trading day. */
export const TRADING_DAY_CUTOFF_HOUR = 6;

/**
 * Trading date (YYYY-MM-DD) for an order timestamp: shift to UTC+8, and count
 * 00:00–05:59 as the previous day. Uses UTC getters only, so the result does
 * not depend on the time zone of the machine running it.
 */
export function tradingDate(timestamp: string | Date): string {
  const ms = typeof timestamp === 'string' ? Date.parse(timestamp) : timestamp.getTime();
  if (Number.isNaN(ms)) throw new Error(`Invalid order timestamp: ${String(timestamp)}`);
  const local = new Date(ms + UTC8_MS);
  if (local.getUTCHours() < TRADING_DAY_CUTOFF_HOUR) local.setUTCDate(local.getUTCDate() - 1);
  return local.toISOString().slice(0, 10);
}

// ─── Validation ─────────────────────────────────────────────────────────────

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isRealDate(s: string): boolean {
  if (!DATE_RE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** Returns the cleaned transaction, or an error message. */
export function validateTransaction(input: unknown): { ok: true; value: PosTransaction } | { ok: false; error: string } {
  if (!input || typeof input !== 'object') return { ok: false, error: 'Transaction must be an object' };
  const t = input as Record<string, unknown>;

  const order_reference = typeof t.order_reference === 'string' ? t.order_reference.trim() : '';
  if (!order_reference) return { ok: false, error: 'order_reference is required' };
  if (order_reference.length > 64) return { ok: false, error: 'order_reference is longer than 64 characters' };

  const sales_date = typeof t.sales_date === 'string' ? t.sales_date.trim() : '';
  if (!isRealDate(sales_date)) return { ok: false, error: `sales_date must be a real date as YYYY-MM-DD (got "${String(t.sales_date)}")` };

  const payment_method = typeof t.payment_method === 'string' ? t.payment_method.trim() : '';
  if (!payment_method || payment_method.toLowerCase() === 'unknown') {
    return { ok: false, error: 'payment_method is missing or "Unknown"' };
  }

  const total_amount = t.total_amount;
  if (typeof total_amount !== 'number' || !Number.isSafeInteger(total_amount)) {
    return { ok: false, error: 'total_amount must be a whole number of Rupiah' };
  }
  if (total_amount <= 0) {
    // Refunds and zero-value orders need a credit memo / no entry, not an invoice.
    return { ok: false, error: 'total_amount must be greater than 0 (refunds and zero orders are not synced)' };
  }

  return { ok: true, value: { order_reference, sales_date, payment_method, total_amount } };
}

// ─── Keys and numbers ───────────────────────────────────────────────────────

/** Lookup key for payment methods: case-, space- and zero-width-insensitive. */
export function paymentMethodKey(method: string): string {
  return method.replace(/[​-‍﻿]/g, '').trim().replace(/\s+/g, ' ').toLowerCase();
}

/** "#2-1958" → "2-1958": Jurnal numbers should not carry the "#". */
function referenceSlug(orderReference: string): string {
  return orderReference.replace(/^#+/, '').replace(/[^A-Za-z0-9\-_/.]/g, '-');
}

/** Deterministic Jurnal invoice number, e.g. "POS-2-1958". Same order → same number. */
export function invoiceTransactionNo(orderReference: string, cfg: MappingConfig): string {
  return `${cfg.transactionNoPrefix}-${referenceSlug(orderReference)}`;
}

/** Deterministic Jurnal receive-payment number, e.g. "RP-POS-2-1958". */
export function paymentTransactionNo(orderReference: string, cfg: MappingConfig): string {
  return `RP-${cfg.transactionNoPrefix}-${referenceSlug(orderReference)}`;
}

// ─── Payloads ───────────────────────────────────────────────────────────────

/** POS transaction → Jurnal SalesInvoice. transaction_date is the trading date. */
export function toSalesInvoice(t: PosTransaction, cfg: MappingConfig): SalesInvoicePayload {
  return {
    sales_invoice: {
      transaction_no: invoiceTransactionNo(t.order_reference, cfg),
      transaction_date: t.sales_date,
      due_date: t.sales_date, // paid at the till, so due the same day
      person_name: cfg.customerName,
      reference_no: t.order_reference,
      memo: `iSeller ${t.order_reference} · ${t.payment_method}`,
      transaction_lines_attributes: [
        {
          product_name: cfg.salesProductName,
          description: `POS order ${t.order_reference}`,
          quantity: 1,
          rate: t.total_amount,
        },
      ],
    },
  };
}

/** Finds the Jurnal account for a payment method, or says why it can't. */
export function resolvePaymentAccount(
  method: string,
  accounts: Map<string, PaymentAccount>,
): { ok: true; account: PaymentAccount & { deposit_to_name: string } } | { ok: false; error: string } {
  const account = accounts.get(paymentMethodKey(method));
  if (!account || !account.is_active) {
    return { ok: false, error: `No Jurnal account is mapped for payment method "${method}". Add it to jurnal_payment_accounts.` };
  }
  if (!account.deposit_to_name?.trim()) {
    return { ok: false, error: `Payment method "${method}" has no deposit_to_name set in jurnal_payment_accounts.` };
  }
  return { ok: true, account: account as PaymentAccount & { deposit_to_name: string } };
}

/** Invoice → Jurnal ReceivePayment for the full amount, closing the invoice. */
export function toReceivePayment(
  t: PosTransaction,
  invoiceNo: string,
  account: PaymentAccount & { deposit_to_name: string },
  cfg: MappingConfig,
): ReceivePaymentPayload {
  return {
    receive_payment: {
      transaction_no: paymentTransactionNo(t.order_reference, cfg),
      transaction_date: t.sales_date,
      person_name: cfg.customerName,
      payment_method_name: account.jurnal_payment_method_name?.trim() || t.payment_method,
      deposit_to_name: account.deposit_to_name.trim(),
      memo: `iSeller ${t.order_reference} · ${t.payment_method}`,
      is_draft: false,
      records_attributes: [{ transaction_no: invoiceNo, amount: t.total_amount }],
    },
  };
}
