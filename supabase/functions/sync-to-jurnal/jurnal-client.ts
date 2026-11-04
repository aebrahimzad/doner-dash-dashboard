// Minimal Mekari Jurnal API client: authentication, retries, and the four calls
// the sync needs. Uses only fetch + Web Crypto, so it runs in Deno and Node.
//
// Auth modes (picked from which secrets are set):
//   • HMAC (Mekari API Gateway, current):   JURNAL_CLIENT_ID + JURNAL_CLIENT_SECRET
//       base https://api.mekari.com (sandbox: https://sandbox-api.mekari.com),
//       paths under /public/jurnal/api/v1
//   • API key (legacy Jurnal API):          JURNAL_API_KEY
//       base https://api.jurnal.id, paths under /core/api/v1

import type { ReceivePaymentPayload, SalesInvoicePayload } from './types.ts';

export interface JurnalConfig {
  baseUrl: string;      // e.g. https://api.mekari.com
  pathPrefix: string;   // e.g. /public/jurnal/api/v1
  auth:
    | { mode: 'hmac'; clientId: string; clientSecret: string }
    | { mode: 'apikey'; apiKey: string };
  /** Attempts per request for 429 / 5xx / network errors. */
  maxAttempts?: number;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

export class JurnalApiError extends Error {
  readonly status: number; // 0 = network error
  readonly body: unknown;

  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = 'JurnalApiError';
    this.status = status;
    this.body = body;
  }
  /** 4xx other than 408/429: Jurnal rejected the data; retrying won't help. */
  get isClientError() {
    return this.status >= 400 && this.status < 500 && this.status !== 408 && this.status !== 429;
  }
}

export interface JurnalTxnRef {
  id: number | string | null;
  transaction_no: string;
}

// ─── HMAC signing (Mekari API Gateway) ──────────────────────────────────────

const enc = new TextEncoder();

function toBase64(buf: ArrayBuffer): string {
  let s = '';
  for (const b of new Uint8Array(buf)) s += String.fromCharCode(b);
  return btoa(s);
}

/** Base64 SHA-256 of the request body, for the Digest header. */
export async function bodyDigest(body: string): Promise<string> {
  return `SHA-256=${toBase64(await crypto.subtle.digest('SHA-256', enc.encode(body)))}`;
}

/**
 * Mekari HMAC signature. Signing string is
 *   "date: <Date header>\n<METHOD> <path?query> HTTP/1.1"
 * signed with HMAC-SHA256 using the client secret, Base64-encoded.
 */
export async function hmacAuthorization(
  clientId: string,
  clientSecret: string,
  method: string,
  pathWithQuery: string,
  date: string,
): Promise<string> {
  const signingString = `date: ${date}\n${method.toUpperCase()} ${pathWithQuery} HTTP/1.1`;
  const key = await crypto.subtle.importKey('raw', enc.encode(clientSecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = toBase64(await crypto.subtle.sign('HMAC', key, enc.encode(signingString)));
  return `hmac username="${clientId}", algorithm="hmac-sha256", headers="date request-line", signature="${signature}"`;
}

// ─── Client ─────────────────────────────────────────────────────────────────

function errorMessage(body: unknown, status: number): string {
  if (body && typeof body === 'object') {
    const b = body as Record<string, unknown>;
    const parts = [b.error_full_messages, b.errors, b.error, b.message].filter((v) => v != null);
    if (parts.length) {
      const flat = parts.map((p) => (typeof p === 'string' ? p : JSON.stringify(p))).join('; ');
      return `Jurnal ${status}: ${flat}`.slice(0, 500);
    }
  }
  if (typeof body === 'string' && body) return `Jurnal ${status}: ${body}`.slice(0, 500);
  return `Jurnal ${status}`;
}

/** Pulls { id, transaction_no } out of Jurnal's usual { <resource>: {...} } wrapper. */
function extractRef(body: unknown, resource: string): JurnalTxnRef | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;
  const obj = (b[resource] ?? b) as Record<string, unknown>;
  const no = obj?.transaction_no;
  if (typeof no !== 'string' || !no) return null;
  return { id: (obj.id as number | string | undefined) ?? null, transaction_no: no };
}

/** Finds an exact transaction_no match in a list response, whatever its wrapper. */
function findInList(body: unknown, listKey: string, transactionNo: string): JurnalTxnRef | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;
  const list = (Array.isArray(b[listKey]) ? b[listKey] : Array.isArray(b.data) ? b.data : Array.isArray(body) ? body : []) as unknown[];
  for (const item of list) {
    const ref = extractRef(item, listKey.replace(/s$/, ''));
    if (ref && ref.transaction_no === transactionNo) return ref;
  }
  return null;
}

export class JurnalClient {
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly maxAttempts: number;
  private readonly cfg: JurnalConfig;

  constructor(cfg: JurnalConfig) {
    this.cfg = cfg;
    this.fetchImpl = cfg.fetchImpl ?? fetch;
    this.sleep = cfg.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.maxAttempts = cfg.maxAttempts ?? 3;
  }

  /** One API call with auth headers; retries 408/429/5xx and network errors with backoff. */
  async request(method: 'GET' | 'POST', path: string, payload?: unknown): Promise<unknown> {
    const pathWithQuery = `${this.cfg.pathPrefix}${path}`;
    const body = payload === undefined ? undefined : JSON.stringify(payload);

    for (let attempt = 1; ; attempt++) {
      const headers: Record<string, string> = { Accept: 'application/json' };
      if (body !== undefined) headers['Content-Type'] = 'application/json';

      if (this.cfg.auth.mode === 'hmac') {
        // Signed per attempt: Mekari rejects a Date more than 300 s off.
        const date = new Date().toUTCString();
        headers['Date'] = date;
        headers['Authorization'] = await hmacAuthorization(
          this.cfg.auth.clientId, this.cfg.auth.clientSecret, method, pathWithQuery, date);
        if (body !== undefined) headers['Digest'] = await bodyDigest(body);
      } else {
        headers['apikey'] = this.cfg.auth.apiKey;
      }

      let res: Response;
      try {
        res = await this.fetchImpl(`${this.cfg.baseUrl}${pathWithQuery}`, { method, headers, body });
      } catch (err) {
        if (attempt < this.maxAttempts) { await this.sleep(500 * 2 ** (attempt - 1)); continue; }
        throw new JurnalApiError(`Could not reach Jurnal: ${(err as Error).message}`, 0, null);
      }

      const text = await res.text();
      let parsed: unknown = text;
      try { parsed = text ? JSON.parse(text) : null; } catch { /* keep text */ }

      if (res.ok) return parsed;

      const retryable = res.status === 408 || res.status === 429 || res.status >= 500;
      if (retryable && attempt < this.maxAttempts) {
        const retryAfter = Number(res.headers.get('retry-after'));
        await this.sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 500 * 2 ** (attempt - 1));
        continue;
      }
      throw new JurnalApiError(errorMessage(parsed, res.status), res.status, parsed);
    }
  }

  /** Looks up a sales invoice by our deterministic transaction number. Exact match only. */
  async findSalesInvoice(transactionNo: string): Promise<JurnalTxnRef | null> {
    const q = encodeURIComponent(transactionNo);
    const body = await this.request('GET', `/sales_invoices?transaction_no=${q}&search_query=${q}`);
    return findInList(body, 'sales_invoices', transactionNo);
  }

  async findReceivePayment(transactionNo: string): Promise<JurnalTxnRef | null> {
    const q = encodeURIComponent(transactionNo);
    const body = await this.request('GET', `/receive_payments?transaction_no=${q}&search_query=${q}`);
    return findInList(body, 'receive_payments', transactionNo);
  }

  /**
   * Creates the invoice. If Jurnal rejects it (e.g. the number is already taken
   * because an earlier call created it and then crashed), looks the number up
   * and returns the existing invoice instead of failing.
   */
  async createSalesInvoice(payload: SalesInvoicePayload): Promise<{ ref: JurnalTxnRef; existed: boolean }> {
    return this.createOrRecover(
      () => this.request('POST', '/sales_invoices', payload),
      'sales_invoice',
      payload.sales_invoice.transaction_no,
      (no) => this.findSalesInvoice(no),
    );
  }

  async createReceivePayment(payload: ReceivePaymentPayload): Promise<{ ref: JurnalTxnRef; existed: boolean }> {
    return this.createOrRecover(
      () => this.request('POST', '/receive_payments', payload),
      'receive_payment',
      payload.receive_payment.transaction_no,
      (no) => this.findReceivePayment(no),
    );
  }

  private async createOrRecover(
    create: () => Promise<unknown>,
    resource: string,
    transactionNo: string,
    find: (no: string) => Promise<JurnalTxnRef | null>,
  ): Promise<{ ref: JurnalTxnRef; existed: boolean }> {
    try {
      const body = await create();
      return { ref: extractRef(body, resource) ?? { id: null, transaction_no: transactionNo }, existed: false };
    } catch (err) {
      if (!(err instanceof JurnalApiError) || !err.isClientError) throw err;
      const existing = await find(transactionNo).catch(() => null);
      if (existing) return { ref: existing, existed: true };
      throw err;
    }
  }
}

/** Builds the client config from function secrets. Throws if no credentials are set. */
export function jurnalConfigFromEnv(get: (name: string) => string | undefined): JurnalConfig {
  const clientId = get('JURNAL_CLIENT_ID');
  const clientSecret = get('JURNAL_CLIENT_SECRET');
  const apiKey = get('JURNAL_API_KEY');

  if (clientId && clientSecret) {
    return {
      baseUrl: (get('JURNAL_BASE_URL') ?? 'https://api.mekari.com').replace(/\/$/, ''),
      pathPrefix: get('JURNAL_PATH_PREFIX') ?? '/public/jurnal/api/v1',
      auth: { mode: 'hmac', clientId, clientSecret },
    };
  }
  if (apiKey) {
    return {
      baseUrl: (get('JURNAL_BASE_URL') ?? 'https://api.jurnal.id').replace(/\/$/, ''),
      pathPrefix: get('JURNAL_PATH_PREFIX') ?? '/core/api/v1',
      auth: { mode: 'apikey', apiKey },
    };
  }
  throw new Error('Jurnal credentials are not set: add JURNAL_CLIENT_ID + JURNAL_CLIENT_SECRET (or JURNAL_API_KEY) as function secrets');
}
