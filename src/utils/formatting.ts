export function formatIDR(amount: number): string {
  return (
    'Rp ' +
    new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(Math.round(amount))
  );
}

export function formatBaseCost(cost: number): string {
  // For per-unit costs: show whole IDR when ≥ 1, otherwise show enough decimals
  // to represent the sub-rupiah value meaningfully (e.g. 0.047 IDR/ml)
  const decimals = cost >= 1 ? 0 : cost >= 0.01 ? 2 : 4;
  return (
    'Rp ' +
    new Intl.NumberFormat('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(cost)
  );
}

export function formatDate(dateStr: string): string {
  if (!dateStr) return '—';
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function calcBaseUnitCost(
  totalInvoicePrice: number,
  freightTax: number,
  invoiceQty: number,
  conversionMultiplier: number
): number {
  const landed = totalInvoicePrice + freightTax;
  const units = invoiceQty * conversionMultiplier;
  if (units === 0) return 0;
  return Number((landed / units).toFixed(4));
}
