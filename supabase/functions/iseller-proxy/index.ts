import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Set with: supabase secrets set ISELLER_CLIENT_ID=... ISELLER_CLIENT_SECRET=...
// (or Supabase dashboard → Edge Functions → Secrets). Never commit them.
const ISELLER_CLIENT_ID = Deno.env.get("ISELLER_CLIENT_ID") ?? "";
const ISELLER_CLIENT_SECRET = Deno.env.get("ISELLER_CLIENT_SECRET") ?? "";
const ISELLER_STORE_NAME = Deno.env.get("ISELLER_STORE_NAME") ?? "donerdash";

const TOKEN_URL = "https://isellershop.com/oauth/token";

async function getAccessToken(): Promise<string> {
  if (!ISELLER_CLIENT_ID || !ISELLER_CLIENT_SECRET) {
    throw new Error("ISELLER_CLIENT_ID / ISELLER_CLIENT_SECRET secrets are not set");
  }
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: ISELLER_CLIENT_ID,
      client_secret: ISELLER_CLIENT_SECRET,
      grant_type: 'client_credentials',
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token request failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  if (!data.access_token) {
    throw new Error("No access_token in token response");
  }
  return data.access_token as string;
}

function extractList(data: unknown): unknown[] {
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object") {
    const obj = data as Record<string, unknown>;
    if (Array.isArray(obj.data)) return obj.data;
    if (Array.isArray(obj.orders)) return obj.orders;
    if (Array.isArray(obj.list)) return obj.list;
    if (Array.isArray(obj.result)) return obj.result;
    if (Array.isArray(obj.results)) return obj.results;
  }
  return [];
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { startDate, endDate } = await req.json();
    if (!startDate || !endDate) {
      return new Response(
        JSON.stringify({ error: "startDate and endDate are required" }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = await getAccessToken();

    const PAGE_LIMIT = 200;
    const MAX_PAGES = 20;
    let allOrders: unknown[] = [];
    let page = 1;

    while (page <= MAX_PAGES) {
      const ordersUrl = `https://${ISELLER_STORE_NAME}.isellershop.com/api/v2/GetOrders`;
      const body = {
        includes: "OrderDetails,Transactions,PaymentDetails",
        startDate,
        endDate,
        page,
        limit: PAGE_LIMIT,
      };

      const ordersRes = await fetch(ordersUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });

      if (!ordersRes.ok) {
        const rawText = await ordersRes.text();
        throw new Error(`iSeller API Error (${ordersRes.status}): ${rawText.slice(0, 200)}`);
      }

      const data = await ordersRes.json();
      const list = extractList(data);

      if (list.length === 0) break;

      allOrders = [...allOrders, ...list];

      if (list.length < PAGE_LIMIT) break;
      page++;
    }

    return new Response(
      JSON.stringify({ orders: allOrders, totalFetched: allOrders.length }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    const message = (err as Error).message;
    console.error("[iseller-proxy] Error:", message);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
})
