import type {
  AlignedMarketData,
  AllocationSlice,
  Holding,
  ManualAsset,
  PortfolioSummary,
  ValuedHolding,
} from './types.ts';
import { ASSET_CLASS_COLORS, getAssetMeta } from './universe.ts';

export interface CashFlow {
  date: string; // YYYY-MM-DD
  amount: number; // Negative for outflow (buy), positive for inflow (terminal value)
}

function daysBetween(dateA: string, dateB: string): number {
  const t1 = new Date(dateA + 'T00:00:00Z').getTime();
  const t2 = new Date(dateB + 'T00:00:00Z').getTime();
  return (t2 - t1) / (1000 * 60 * 60 * 24);
}

export function xnpv(rate: number, cashFlows: CashFlow[]): number {
  if (cashFlows.length === 0) return 0;
  const d0 = cashFlows[0].date;
  let sum = 0;
  for (const cf of cashFlows) {
    const years = daysBetween(d0, cf.date) / 365.0;
    sum += cf.amount / Math.pow(1 + rate, years);
  }
  return sum;
}

/**
 * Solves XIRR via Brent's / bracketed bisection-secant hybrid on [-0.99, 10].
 */
export function calculateXIRR(cashFlows: CashFlow[]): number | null {
  if (cashFlows.length < 2) return null;
  const sorted = [...cashFlows].sort((a, b) => a.date.localeCompare(b.date));
  const hasPos = sorted.some((c) => c.amount > 0);
  const hasNeg = sorted.some((c) => c.amount < 0);
  if (!hasPos || !hasNeg) return null;

  // Check if total duration is at least 7 days
  if (daysBetween(sorted[0].date, sorted[sorted.length - 1].date) < 7) return null;

  let a = -0.99;
  let b = 10.0;
  let fa = xnpv(a, sorted);
  let fb = xnpv(b, sorted);

  // Expand upper bracket if needed
  if (fa * fb > 0) {
    for (const hi of [20, 50, 100]) {
      const fhi = xnpv(hi, sorted);
      if (fa * fhi <= 0) {
        b = hi;
        fb = fhi;
        break;
      }
    }
  }
  if (fa * fb > 0 || !Number.isFinite(fa) || !Number.isFinite(fb)) {
    return null;
  }

  // Brent's method implementation
  let c = a;
  let fc = fa;
  let d = b - a;
  let e = d;
  const tol = 1e-7;

  for (let iter = 0; iter < 120; iter++) {
    if (fb * fc > 0) {
      c = a;
      fc = fa;
      d = b - a;
      e = d;
    }
    if (Math.abs(fc) < Math.abs(fb)) {
      a = b;
      b = c;
      c = a;
      fa = fb;
      fb = fc;
      fc = fa;
    }

    const tol1 = 2 * Number.EPSILON * Math.abs(b) + 0.5 * tol;
    const xm = 0.5 * (c - b);
    if (Math.abs(xm) <= tol1 || Math.abs(fb) < 1e-9) {
      return b;
    }

    if (Math.abs(e) >= tol1 && Math.abs(fa) > Math.abs(fb)) {
      const s = fb / fa;
      let p: number;
      let q: number;
      if (a === c) {
        p = 2 * xm * s;
        q = 1 - s;
      } else {
        q = fa / fc;
        const r = fb / fc;
        p = s * (2 * xm * q * (q - r) - (b - a) * (r - 1));
        q = (q - 1) * (r - 1) * (s - 1);
      }
      if (p > 0) q = -q;
      p = Math.abs(p);
      if (2 * p < Math.min(3 * xm * q - Math.abs(tol1 * q), Math.abs(e * q))) {
        e = d;
        d = p / q;
      } else {
        d = xm;
        e = d;
      }
    } else {
      d = xm;
      e = d;
    }

    a = b;
    fa = fb;
    if (Math.abs(d) > tol1) {
      b += d;
    } else {
      b += xm >= 0 ? tol1 : -tol1;
    }
    fb = xnpv(b, sorted);
  }

  return Number.isFinite(b) ? b : null;
}

const RISK_BUCKET_COLORS: Record<string, string> = {
  'High Growth': '#7C3AED',
  'Core Equity': '#1D4ED8',
  'Hedge & Income': '#0D9488',
  'Capital Preservation': '#475569',
  'Illiquid Real Asset': '#B45309',
};

const CURRENCY_COLORS: Record<string, string> = {
  'INR Direct': '#0F766E',
  'USD Linked (INR Equiv.)': '#4F46E5',
};

export function summarizePortfolio(
  holdings: Holding[],
  manualAssets: ManualAsset[],
  market: AlignedMarketData
): PortfolioSummary {
  const latestDate = market.dates[market.dates.length - 1] || new Date().toISOString().slice(0, 10);

  let liquidValueInr = 0;
  let liquidInvestedInr = 0;
  let dayChangeInr = 0;

  const rawValued = holdings.map((h) => {
    const latestPrice = market.latestPriceInr[h.ticker] ?? h.buyPrice;
    const chgPct = market.changePct1d[h.ticker] ?? 0;
    const currentValueInr = h.quantity * latestPrice;
    const investedValueInr = h.quantity * h.buyPrice;
    const pnlInr = currentValueInr - investedValueInr;
    const pnlPct = investedValueInr > 0 ? (pnlInr / investedValueInr) * 100 : 0;
    const prevValue = chgPct !== -100 ? currentValueInr / (1 + chgPct / 100) : currentValueInr;
    const dChgInr = currentValueInr - prevValue;

    liquidValueInr += currentValueInr;
    liquidInvestedInr += investedValueInr;
    dayChangeInr += dChgInr;

    return {
      ...h,
      latestPriceInr: latestPrice,
      currentValueInr,
      investedValueInr,
      pnlInr,
      pnlPct,
      dayChangeInr: dChgInr,
      dayChangePct: chgPct,
    };
  });

  const manualRealEstateInr = manualAssets.reduce((acc, a) => acc + a.currentValue, 0);
  const manualInvestedInr = manualAssets.reduce((acc, a) => acc + a.purchaseValue, 0);

  const totalValueInr = liquidValueInr + manualRealEstateInr;
  const totalInvestedInr = liquidInvestedInr + manualInvestedInr;
  const unrealizedPnlInr = totalValueInr - totalInvestedInr;
  const unrealizedPnlPct = totalInvestedInr > 0 ? (unrealizedPnlInr / totalInvestedInr) * 100 : 0;
  const prevTotal = totalValueInr - dayChangeInr;
  const dayChangePct = prevTotal > 0 ? (dayChangeInr / prevTotal) * 100 : 0;

  const valuedHoldings: ValuedHolding[] = rawValued
    .map((h) => ({
      ...h,
      weightPct: totalValueInr > 0 ? (h.currentValueInr / totalValueInr) * 100 : 0,
      marketWeightPct: liquidValueInr > 0 ? (h.currentValueInr / liquidValueInr) * 100 : 0,
    }))
    .sort((a, b) => b.currentValueInr - a.currentValueInr);

  // XIRR CashFlows
  const cashFlows: CashFlow[] = [];
  for (const h of holdings) {
    cashFlows.push({ date: h.buyDate, amount: -(h.quantity * h.buyPrice) });
  }
  for (const m of manualAssets) {
    cashFlows.push({ date: m.asOfDate, amount: -m.purchaseValue });
  }
  if (totalValueInr > 0) {
    cashFlows.push({ date: latestDate, amount: totalValueInr });
  }
  const xirrRaw = calculateXIRR(cashFlows);
  const xirrPct = xirrRaw !== null ? xirrRaw * 100 : null;

  // Group by Asset Class
  const classMap = new Map<string, number>();
  for (const h of valuedHoldings) {
    classMap.set(h.assetClass, (classMap.get(h.assetClass) || 0) + h.currentValueInr);
  }
  if (manualRealEstateInr > 0) {
    classMap.set('Real Estate', (classMap.get('Real Estate') || 0) + manualRealEstateInr);
  }
  const byAssetClass: AllocationSlice[] = Array.from(classMap.entries())
    .map(([label, valueInr]) => ({
      label,
      valueInr,
      pct: totalValueInr > 0 ? (valueInr / totalValueInr) * 100 : 0,
      color: ASSET_CLASS_COLORS[label as keyof typeof ASSET_CLASS_COLORS] || '#64748B',
    }))
    .sort((a, b) => b.valueInr - a.valueInr);

  // Group by Currency exposure
  const currMap = new Map<string, number>();
  for (const h of valuedHoldings) {
    const key = h.currency === 'USD' ? 'USD Linked (INR Equiv.)' : 'INR Direct';
    currMap.set(key, (currMap.get(key) || 0) + h.currentValueInr);
  }
  if (manualRealEstateInr > 0) {
    currMap.set('INR Direct', (currMap.get('INR Direct') || 0) + manualRealEstateInr);
  }
  const byCurrency: AllocationSlice[] = Array.from(currMap.entries()).map(([label, valueInr]) => ({
    label,
    valueInr,
    pct: totalValueInr > 0 ? (valueInr / totalValueInr) * 100 : 0,
    color: CURRENCY_COLORS[label] || '#475569',
  }));

  // Group by Risk Bucket
  const bucketMap = new Map<string, number>();
  for (const h of valuedHoldings) {
    const bucket = getAssetMeta(h.ticker)?.riskBucket || 'Core Equity';
    bucketMap.set(bucket, (bucketMap.get(bucket) || 0) + h.currentValueInr);
  }
  if (manualRealEstateInr > 0) {
    bucketMap.set('Illiquid Real Asset', (bucketMap.get('Illiquid Real Asset') || 0) + manualRealEstateInr);
  }
  const byRiskBucket: AllocationSlice[] = Array.from(bucketMap.entries())
    .map(([label, valueInr]) => ({
      label,
      valueInr,
      pct: totalValueInr > 0 ? (valueInr / totalValueInr) * 100 : 0,
      color: RISK_BUCKET_COLORS[label] || '#64748B',
    }))
    .sort((a, b) => b.valueInr - a.valueInr);

  return {
    totalValueInr,
    liquidValueInr,
    manualRealEstateInr,
    totalInvestedInr,
    unrealizedPnlInr,
    unrealizedPnlPct,
    dayChangeInr,
    dayChangePct,
    xirrPct,
    valuedHoldings,
    byAssetClass,
    byCurrency,
    byRiskBucket,
  };
}
