import { covariance, stdDev } from './risk.ts';
import type { AlignedMarketData, CorrelationReport, HedgeCandidate, PortfolioSummary } from './types.ts';
import { getAssetMeta } from './universe.ts';

export function pearsonCorr(a: number[], b: number[]): number {
  const sa = stdDev(a);
  const sb = stdDev(b);
  if (sa < 1e-12 || sb < 1e-12) return 0;
  const c = covariance(a, b) / (sa * sb);
  return Math.max(-1, Math.min(1, c));
}

function rankArray(arr: number[]): number[] {
  const indexed = arr.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
  const ranks = new Array<number>(arr.length);
  let i = 0;
  while (i < indexed.length) {
    let j = i;
    while (j + 1 < indexed.length && indexed[j + 1].v === indexed[i].v) {
      j++;
    }
    const avgRank = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) {
      ranks[indexed[k].i] = avgRank;
    }
    i = j + 1;
  }
  return ranks;
}

export function spearmanCorr(a: number[], b: number[]): number {
  return pearsonCorr(rankArray(a), rankArray(b));
}

export function classifyCorrelation(r: number): string {
  if (r >= 0.6) return 'Strongly Positive';
  if (r >= 0.3) return 'Moderately Positive';
  if (r > -0.3) return 'Low / Uncorrelated';
  return 'Negative Hedge';
}

function avgOffDiagonal(mat: number[][]): number {
  const n = mat.length;
  if (n <= 1) return 0;
  let sum = 0;
  let cnt = 0;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      sum += mat[i][j];
      cnt++;
    }
  }
  return cnt > 0 ? sum / cnt : 0;
}

function buildCorrelationMatrix(series: number[][], fn: (a: number[], b: number[]) => number): number[][] {
  const n = series.length;
  const mat: number[][] = Array.from({ length: n }, () => Array(n).fill(1));
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const c = fn(series[i], series[j]);
      mat[i][j] = c;
      mat[j][i] = c;
    }
  }
  return mat;
}

function hierarchicalClusterOrder(
  tickers: string[],
  corrMat: number[][]
): { ordered: string[]; merges: Array<{ left: string; right: string; distance: number }> } {
  if (tickers.length <= 2) {
    return { ordered: [...tickers], merges: [] };
  }

  interface Cluster {
    label: string;
    members: number[];
  }
  let clusters: Cluster[] = tickers.map((t, i) => ({ label: t, members: [i] }));
  const merges: Array<{ left: string; right: string; distance: number }> = [];

  const dist = (i: number, j: number) => Math.sqrt(Math.max(0, 0.5 * (1 - corrMat[i][j])));

  while (clusters.length > 1) {
    let bestI = 0;
    let bestJ = 1;
    let bestD = Infinity;
    for (let i = 0; i < clusters.length; i++) {
      for (let j = i + 1; j < clusters.length; j++) {
        // Average linkage distance
        let sumD = 0;
        let cnt = 0;
        for (const mi of clusters[i].members) {
          for (const mj of clusters[j].members) {
            sumD += dist(mi, mj);
            cnt++;
          }
        }
        const avgD = sumD / Math.max(1, cnt);
        if (avgD < bestD) {
          bestD = avgD;
          bestI = i;
          bestJ = j;
        }
      }
    }

    const left = clusters[bestI];
    const right = clusters[bestJ];
    merges.push({ left: left.label, right: right.label, distance: bestD });

    const merged: Cluster = {
      label: `(${left.label}+${right.label})`,
      members: [...left.members, ...right.members],
    };
    clusters = clusters.filter((_, idx) => idx !== bestI && idx !== bestJ);
    clusters.push(merged);
  }

  const ordered = clusters[0].members.map((idx) => tickers[idx]);
  return { ordered, merges };
}

export function analyzeCorrelations(
  summary: PortfolioSummary,
  market: AlignedMarketData
): CorrelationReport {
  const heldSet = new Set(summary.valuedHoldings.map((h) => h.ticker));
  // Core multi-asset matrix tickers: all held assets + key macro anchors if missing
  const anchorTickers = ['^NSEI', 'GOLDBEES.NS', 'BTC-USD', 'EMBASSY.NS', 'LIQUIDBEES.NS', '^INDIAVIX', 'USDINR=X'];
  const rawTickers = Array.from(new Set([...Array.from(heldSet), ...anchorTickers])).filter(
    (t) => market.returns[t] && market.returns[t].length > 30
  );

  const seriesAll = rawTickers.map((t) => market.returns[t].slice(1));
  const rawPearson = buildCorrelationMatrix(seriesAll, pearsonCorr);
  const { ordered, merges } = hierarchicalClusterOrder(rawTickers, rawPearson);

  const orderedSeries = ordered.map((t) => market.returns[t].slice(1));
  const pearsonMatrix = buildCorrelationMatrix(orderedSeries, pearsonCorr);
  const spearmanMatrix = buildCorrelationMatrix(orderedSeries, spearmanCorr);

  // Diversification metrics on held portfolio
  const weights = summary.valuedHoldings.map((h) => h.marketWeightPct / 100);
  const sumW2 = weights.reduce((acc, w) => acc + w * w, 0);
  const effectiveNumBets = sumW2 > 1e-9 ? 1 / sumW2 : 0;

  const heldTickers = Array.from(heldSet).filter((t) => market.returns[t]);
  const heldMatrix = buildCorrelationMatrix(
    heldTickers.map((t) => market.returns[t].slice(1)),
    pearsonCorr
  );
  const avgPairwiseCorr = avgOffDiagonal(heldMatrix);
  const diversificationScore = Math.max(
    0,
    Math.min(100, Math.round((1 - Math.max(0, avgPairwiseCorr)) * 55 + Math.min(1, effectiveNumBets / 8) * 45))
  );

  // Concentration check
  const cryptoWeight = summary.byAssetClass.find((s) => s.label === 'Crypto')?.pct || 0;
  const maxHolding = summary.valuedHoldings[0];
  let concentrationWarning: string | null = null;
  if (cryptoWeight > 20) {
    concentrationWarning = `High crypto concentration (${cryptoWeight.toFixed(1)}% of portfolio). Consider capping digital assets below 20% to reduce tail drawdown.`;
  } else if (maxHolding && maxHolding.weightPct > 30) {
    concentrationWarning = `Single-asset concentration in ${maxHolding.name} (${maxHolding.weightPct.toFixed(1)}% weight). Effective bets = ${effectiveNumBets.toFixed(1)}.`;
  } else if (diversificationScore < 45) {
    concentrationWarning = `Low diversification score (${diversificationScore}/100): held assets share high positive correlation (${avgPairwiseCorr.toFixed(2)}).`;
  }

  // Calm vs Crisis analysis (March 2020 COVID & 2022 drawdown vs calm)
  const sliceByDates = (start: string, end: string) => {
    const idxs: number[] = [];
    for (let i = 1; i < market.dates.length; i++) {
      if (market.dates[i] >= start && market.dates[i] <= end) idxs.push(i);
    }
    return idxs;
  };
  const avgCorrInIdxs = (idxs: number[], tickersList: string[]) => {
    if (idxs.length < 10 || tickersList.length < 2) return avgPairwiseCorr;
    const subSeries = tickersList.map((t) => idxs.map((i) => market.returns[t][i]));
    return avgOffDiagonal(buildCorrelationMatrix(subSeries, pearsonCorr));
  };

  const evalTickers = heldTickers.length >= 2 ? heldTickers : ['RELIANCE.NS', 'GOLDBEES.NS', 'BTC-USD', 'EMBASSY.NS'];
  const crisis2020Idxs = sliceByDates('2020-02-15', '2020-05-15');
  const crisis2022Idxs = sliceByDates('2022-01-01', '2022-06-30');
  const calmIdxs = sliceByDates('2023-04-01', '2024-03-31');

  const calmAvgCorr = avgCorrInIdxs(calmIdxs, evalTickers);
  const crisis2020AvgCorr = crisis2020Idxs.length >= 10 ? avgCorrInIdxs(crisis2020Idxs, evalTickers) : Math.min(0.85, calmAvgCorr + 0.24);
  const crisis2022AvgCorr = crisis2022Idxs.length >= 10 ? avgCorrInIdxs(crisis2022Idxs, evalTickers) : Math.min(0.82, calmAvgCorr + 0.17);

  // Rolling 90-day correlation for key pairs
  const pairDefs: Array<[string, string, string]> = [
    ['GOLDBEES.NS vs ^NSEI', 'GOLDBEES.NS', '^NSEI'],
    ['BTC-USD vs ^NSEI', 'BTC-USD', '^NSEI'],
    ['^INDIAVIX vs ^NSEI', '^INDIAVIX', '^NSEI'],
    ['USDINR=X vs ^NSEI', 'USDINR=X', '^NSEI'],
  ];
  const rollingPairs: Record<string, Array<{ date: string; corr: number }>> = {};
  const WIN = 90;
  for (const [label, tA, tB] of pairDefs) {
    const sA = market.returns[tA];
    const sB = market.returns[tB];
    const pts: Array<{ date: string; corr: number }> = [];
    if (sA && sB) {
      for (let i = WIN; i < market.dates.length; i += 3) {
        const wA = sA.slice(i - WIN, i);
        const wB = sB.slice(i - WIN, i);
        pts.push({ date: market.dates[i], corr: pearsonCorr(wA, wB) });
      }
    }
    rollingPairs[label] = pts;
  }

  // Portfolio daily return series to rank Best Hedges across entire investable universe
  const portDaily = market.dates.map((_, t) => {
    let r = 0;
    for (const h of summary.valuedHoldings) {
      const s = market.returns[h.ticker];
      if (s) r += (h.marketWeightPct / 100) * s[t];
    }
    return r;
  });
  const portClean = portDaily.slice(1);
  const stressIdxs = crisis2022Idxs.length >= 15 ? crisis2022Idxs : portDaily.map((_, i) => i).slice(-180);

  const bestHedges: HedgeCandidate[] = Object.keys(market.returns)
    .filter((t) => {
      const m = getAssetMeta(t);
      return m && !m.isBenchmarkOrIndicator;
    })
    .map((t) => {
      const s = market.returns[t];
      const corrToPortfolio = pearsonCorr(s.slice(1), portClean);
      const crisisCorrToPortfolio = pearsonCorr(
        stressIdxs.map((i) => s[i]),
        stressIdxs.map((i) => portDaily[i])
      );
      const meta = getAssetMeta(t)!;
      const heldWeightPct =
        summary.valuedHoldings.filter((h) => h.ticker === t).reduce((a, b) => a + b.weightPct, 0);
      return {
        ticker: t,
        name: meta.name,
        assetClass: meta.assetClass,
        corrToPortfolio,
        crisisCorrToPortfolio,
        label: classifyCorrelation(corrToPortfolio),
        heldWeightPct,
      };
    })
    .sort((a, b) => a.corrToPortfolio - b.corrToPortfolio);

  return {
    tickers: ordered,
    clusteredOrder: ordered,
    pearsonMatrix,
    spearmanMatrix,
    effectiveNumBets,
    avgPairwiseCorr,
    diversificationScore,
    concentrationWarning,
    calmAvgCorr,
    crisis2020AvgCorr,
    crisis2022AvgCorr,
    rollingPairs,
    bestHedges,
    dendrogramMerges: merges,
  };
}
