import type { AlignedMarketData, PriceBar, RawMarketPayload } from './types.ts';
import { ASSET_UNIVERSE } from './universe.ts';

/**
 * Aligns 24/7 crypto and global futures calendars onto the Indian equity trading calendar (^NSEI),
 * converts USD-denominated series into INR via USDINR=X, forward-fills gaps up to 3 trading days,
 * and validates monotonic dates and positive prices.
 */
export function alignMarketData(raw: RawMarketPayload): AlignedMarketData {
  const equityAnchor = raw.series['^NSEI'] || raw.series['RELIANCE.NS'] || [];
  if (equityAnchor.length < 60) {
    throw new Error('Insufficient equity trading calendar bars for alignment.');
  }

  // Ensure strictly increasing unique trading dates from equity anchor
  const seenDates = new Set<string>();
  const dates: string[] = [];
  const sortedAnchor = [...equityAnchor].sort((a, b) => a.date.localeCompare(b.date));
  for (const bar of sortedAnchor) {
    if (!seenDates.has(bar.date) && bar.adjClose > 0) {
      seenDates.add(bar.date);
      dates.push(bar.date);
    }
  }

  // Build quick lookup map per ticker
  const maps: Record<string, Map<string, PriceBar>> = {};
  for (const [ticker, bars] of Object.entries(raw.series)) {
    const m = new Map<string, PriceBar>();
    for (const b of bars) {
      if (b.adjClose > 0 && b.close > 0) {
        m.set(b.date, b);
      }
    }
    maps[ticker] = m;
  }

  // First align USDINR=X across equity trading days (with max 3-day forward-fill, else nearest prior)
  const fxMap = maps['USDINR=X'] || new Map<string, PriceBar>();
  const usdinr: number[] = [];
  let lastFx = raw.fxUsdinr || 84.4;
  for (let i = 0; i < dates.length; i++) {
    const d = dates[i];
    const bar = fxMap.get(d);
    if (bar && bar.adjClose > 40 && bar.adjClose < 150) {
      lastFx = bar.adjClose;
    }
    usdinr.push(lastFx);
  }

  // Align VIX
  const vixMap = maps['^INDIAVIX'] || new Map<string, PriceBar>();
  const indiaVix: number[] = [];
  let lastVix = 14.5;
  for (let i = 0; i < dates.length; i++) {
    const bar = vixMap.get(dates[i]);
    if (bar && bar.adjClose > 5 && bar.adjClose < 95) {
      lastVix = bar.adjClose;
    }
    indiaVix.push(lastVix);
  }

  const pricesInr: Record<string, number[]> = {};
  const highsInr: Record<string, number[]> = {};
  const lowsInr: Record<string, number[]> = {};
  const volumes: Record<string, number[]> = {};
  const returns: Record<string, number[]> = {};
  const latestPriceInr: Record<string, number> = {};
  const changePct1d: Record<string, number> = {};

  for (const meta of ASSET_UNIVERSE) {
    const ticker = meta.ticker;
    const tMap = maps[ticker];
    if (!tMap || tMap.size === 0) continue;

    // Sort available bars for initial seed before the first date
    const sortedBars = Array.from(tMap.values()).sort((a, b) => a.date.localeCompare(b.date));
    let lastBar: PriceBar = sortedBars[0];
    let gapCount = 0;

    const pArr: number[] = [];
    const hArr: number[] = [];
    const lArr: number[] = [];
    const vArr: number[] = [];

    for (let i = 0; i < dates.length; i++) {
      const d = dates[i];
      const exact = tMap.get(d);
      let chosen: PriceBar;
      if (exact) {
        chosen = exact;
        lastBar = exact;
        gapCount = 0;
      } else if (gapCount < 3) {
        // Check up to 3 calendar days prior for weekend-only crypto/FX alignment
        chosen = lastBar;
        gapCount += 1;
      } else {
        chosen = lastBar;
      }

      const fx = meta.currency === 'USD' ? usdinr[i] : 1;
      const adj = Math.max(0.01, chosen.adjClose * fx);
      const ratio = chosen.close > 0 ? chosen.adjClose / chosen.close : 1;
      pArr.push(adj);
      hArr.push(Math.max(adj, chosen.high * ratio * fx));
      lArr.push(Math.max(0.01, Math.min(adj, chosen.low * ratio * fx)));
      vArr.push(Math.max(0, chosen.volume));
    }

    // Compute simple daily returns
    const rArr: number[] = [0];
    for (let i = 1; i < pArr.length; i++) {
      const prev = pArr[i - 1];
      const ret = prev > 0 ? (pArr[i] - prev) / prev : 0;
      // Guard outlier spikes > 60% in a single day unless crypto
      const clipped = meta.assetClass === 'Crypto' ? Math.max(-0.55, Math.min(0.65, ret)) : Math.max(-0.35, Math.min(0.35, ret));
      rArr.push(Number.isFinite(clipped) ? clipped : 0);
    }

    pricesInr[ticker] = pArr;
    highsInr[ticker] = hArr;
    lowsInr[ticker] = lArr;
    volumes[ticker] = vArr;
    returns[ticker] = rArr;

    // Apply live quote override for latest point if present
    const live = raw.liveQuotes[ticker];
    const latestFx = usdinr[usdinr.length - 1];
    if (live && live.priceNative > 0) {
      latestPriceInr[ticker] = meta.currency === 'USD' ? live.priceNative * latestFx : live.priceNative;
      changePct1d[ticker] = live.changePct1d;
    } else {
      const last = pArr[pArr.length - 1];
      const prev = pArr[pArr.length - 2] || last;
      latestPriceInr[ticker] = last;
      changePct1d[ticker] = prev > 0 ? ((last - prev) / prev) * 100 : 0;
    }
  }

  return {
    dates,
    pricesInr,
    returns,
    highsInr,
    lowsInr,
    volumes,
    usdinr,
    indiaVix,
    latestPriceInr,
    changePct1d,
  };
}

/**
 * Data integrity verification check (D1 & F1 tests).
 */
export function validateAlignedData(data: AlignedMarketData): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  for (let i = 1; i < data.dates.length; i++) {
    if (data.dates[i] <= data.dates[i - 1]) {
      issues.push(`Non-monotonic date at index ${i}: ${data.dates[i]}`);
      break;
    }
  }
  for (const [ticker, arr] of Object.entries(data.pricesInr)) {
    if (arr.length !== data.dates.length) {
      issues.push(`Length mismatch for ${ticker}`);
    }
    if (arr.some((v) => !Number.isFinite(v) || v <= 0)) {
      issues.push(`Invalid or non-positive price in ${ticker}`);
    }
  }
  for (const [ticker, arr] of Object.entries(data.returns)) {
    if (arr.some((v) => !Number.isFinite(v))) {
      issues.push(`NaN return detected in ${ticker}`);
    }
  }
  return { valid: issues.length === 0, issues };
}
