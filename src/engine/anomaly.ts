import { mean, stdDev, TRADING_DAYS } from './risk.ts';
import type { AlignedMarketData, AnomalyItem, Holding } from './types.ts';
import { getAssetMeta } from './universe.ts';

interface IsoNode {
  splitFeature?: number;
  splitValue?: number;
  left?: IsoNode;
  right?: IsoNode;
  size: number;
}

function cFactor(n: number): number {
  if (n <= 1) return 0;
  if (n === 2) return 1;
  return 2 * (Math.log(n - 1) + 0.5772156649) - (2 * (n - 1)) / n;
}

function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function buildIsoTree(
  points: number[][],
  depth: number,
  maxDepth: number,
  rng: () => number
): IsoNode {
  if (depth >= maxDepth || points.length <= 2) {
    return { size: points.length };
  }
  const dims = points[0].length;
  const feat = Math.floor(rng() * dims);
  let minV = Infinity;
  let maxV = -Infinity;
  for (const p of points) {
    if (p[feat] < minV) minV = p[feat];
    if (p[feat] > maxV) maxV = p[feat];
  }
  if (maxV - minV < 1e-12) {
    return { size: points.length };
  }
  const split = minV + rng() * (maxV - minV);
  const leftPts: number[][] = [];
  const rightPts: number[][] = [];
  for (const p of points) {
    if (p[feat] < split) leftPts.push(p);
    else rightPts.push(p);
  }
  if (leftPts.length === 0 || rightPts.length === 0) {
    return { size: points.length };
  }
  return {
    splitFeature: feat,
    splitValue: split,
    left: buildIsoTree(leftPts, depth + 1, maxDepth, rng),
    right: buildIsoTree(rightPts, depth + 1, maxDepth, rng),
    size: points.length,
  };
}

function pathLength(point: number[], node: IsoNode, depth = 0): number {
  if (node.splitFeature === undefined || node.splitValue === undefined || !node.left || !node.right) {
    return depth + cFactor(node.size);
  }
  if (point[node.splitFeature] < node.splitValue) {
    return pathLength(point, node.left, depth + 1);
  }
  return pathLength(point, node.right, depth + 1);
}

/**
 * Isolation Forest on [return, abs_return, volume_zscore, (High-Low)/Close, 5-day vol].
 * Contamination ~ 1.5%.
 */
export function detectAnomalies(
  market: AlignedMarketData,
  holdings: Holding[]
): AnomalyItem[] {
  const heldSet = new Set(holdings.map((h) => h.ticker));
  const scanTickers = Array.from(new Set([...Array.from(heldSet), '^NSEI', 'GOLDBEES.NS', 'BTC-USD'])).filter(
    (t) => market.returns[t] && market.returns[t].length > 40
  );

  const rng = mulberry32(918273);
  const results: AnomalyItem[] = [];

  for (const ticker of scanTickers) {
    const rets = market.returns[ticker];
    const prices = market.pricesInr[ticker];
    const highs = market.highsInr[ticker];
    const lows = market.lowsInr[ticker];
    const vols = market.volumes[ticker];
    const meta = getAssetMeta(ticker);

    const points: number[][] = [];
    const rowMeta: Array<{ date: string; retPct: number; volZ: number; rangePct: number }> = [];

    for (let t = 20; t < rets.length; t++) {
      const volWin = vols.slice(t - 20, t);
      const volM = mean(volWin);
      const volS = stdDev(volWin);
      const volZ = volS > 1e-6 ? (vols[t] - volM) / volS : 0;
      const rangePct = prices[t] > 0 ? ((highs[t] - lows[t]) / prices[t]) * 100 : 0;
      const vol5 = stdDev(rets.slice(t - 4, t + 1)) * Math.sqrt(TRADING_DAYS);

      points.push([rets[t], Math.abs(rets[t]), volZ, rangePct / 100, vol5]);
      rowMeta.push({
        date: market.dates[t],
        retPct: rets[t] * 100,
        volZ,
        rangePct,
      });
    }

    const sampleSize = Math.min(256, points.length);
    const maxDepth = Math.ceil(Math.log2(sampleSize));
    const trees: IsoNode[] = [];

    for (let k = 0; k < 48; k++) {
      const sub: number[][] = [];
      for (let s = 0; s < sampleSize; s++) {
        sub.push(points[Math.floor(rng() * points.length)]);
      }
      trees.push(buildIsoTree(sub, 0, maxDepth, rng));
    }

    const cNorm = cFactor(sampleSize);
    const scored = points.map((pt, idx) => {
      const avgPath = trees.reduce((acc, tr) => acc + pathLength(pt, tr), 0) / trees.length;
      const score = Math.pow(2, -avgPath / Math.max(1, cNorm));
      return { score, meta: rowMeta[idx] };
    });

    // Top 1.5% contamination threshold
    const sortedScores = [...scored].sort((a, b) => b.score - a.score);
    const cutoffCount = Math.max(2, Math.floor(scored.length * 0.015));
    const threshold = Math.max(0.62, sortedScores[cutoffCount - 1]?.score ?? 0.65);

    for (const item of scored) {
      if (item.score >= threshold) {
        const reasons: string[] = [];
        if (Math.abs(item.meta.retPct) >= 3.5) {
          reasons.push(`extreme ${item.meta.retPct >= 0 ? 'surge' : 'selloff'} (${item.meta.retPct.toFixed(1)}%)`);
        }
        if (item.meta.volZ >= 2.2) {
          reasons.push(`volume spike (${item.meta.volZ.toFixed(1)}σ)`);
        }
        if (item.meta.rangePct >= 4.0) {
          reasons.push(`wide intraday range (${item.meta.rangePct.toFixed(1)}%)`);
        }
        if (reasons.length === 0) {
          reasons.push('joint return-volatility tail deviation');
        }

        results.push({
          date: item.meta.date,
          ticker,
          name: meta?.shortName || ticker,
          assetClass: meta?.assetClass || 'Equity',
          dailyReturnPct: item.meta.retPct,
          volumeZScore: item.meta.volZ,
          intradayRangePct: item.meta.rangePct,
          anomalyScore: item.score,
          isHeld: heldSet.has(ticker),
          reason: reasons.join(', '),
        });
      }
    }
  }

  return results.sort((a, b) => b.date.localeCompare(a.date) || b.anomalyScore - a.anomalyScore).slice(0, 40);
}
