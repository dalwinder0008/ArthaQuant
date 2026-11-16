import type { AlignedMarketData, PortfolioSummary, RiskMetrics } from './types.ts';
import { getAssetMeta } from './universe.ts';

export const TRADING_DAYS = 252;
export const DEFAULT_RISK_FREE_RATE = 0.065; // 6.5% Indian 91-day T-bill / 10Y G-Sec proxy

export function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

export function stdDev(arr: number[], ddof = 1): number {
  if (arr.length <= ddof) return 0;
  const m = mean(arr);
  let sumSq = 0;
  for (const x of arr) sumSq += (x - m) * (x - m);
  return Math.sqrt(sumSq / (arr.length - ddof));
}

export function covariance(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n <= 1) return 0;
  const ma = mean(a.slice(0, n));
  const mb = mean(b.slice(0, n));
  let sum = 0;
  for (let i = 0; i < n; i++) {
    sum += (a[i] - ma) * (b[i] - mb);
  }
  return sum / (n - 1);
}

export function covarianceMatrix(seriesList: number[][]): number[][] {
  const k = seriesList.length;
  const mat: number[][] = Array.from({ length: k }, () => Array(k).fill(0));
  for (let i = 0; i < k; i++) {
    for (let j = i; j < k; j++) {
      const c = covariance(seriesList[i], seriesList[j]);
      mat[i][j] = c;
      mat[j][i] = c;
    }
  }
  return mat;
}

/**
 * Cholesky decomposition of symmetric positive semi-definite matrix A = L * L^T.
 */
export function cholesky(matrix: number[][]): number[][] {
  const n = matrix.length;
  const L: number[][] = Array.from({ length: n }, () => Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let sum = 0;
      for (let k = 0; k < j; k++) {
        sum += L[i][k] * L[j][k];
      }
      if (i === j) {
        const val = matrix[i][i] - sum;
        L[i][j] = Math.sqrt(Math.max(1e-12, val));
      } else {
        L[i][j] = L[j][j] > 1e-12 ? (matrix[i][j] - sum) / L[j][j] : 0;
      }
    }
  }
  return L;
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

function normalSample(rng: () => number): number {
  const u1 = Math.max(1e-10, rng());
  const u2 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

export function computeDrawdownStats(returns: number[], dates: string[]): {
  maxDdPct: number;
  peakDate: string;
  troughDate: string;
  durationDays: number;
  ddSeries: number[];
  equitySeries: number[];
} {
  let equity = 100;
  let peak = 100;
  let peakIdx = 0;
  let maxDd = 0;
  let bestPeakIdx = 0;
  let bestTroughIdx = 0;
  let currentDuration = 0;
  let maxDuration = 0;

  const ddSeries: number[] = [];
  const equitySeries: number[] = [];

  for (let i = 0; i < returns.length; i++) {
    equity = i === 0 ? 100 : equity * (1 + returns[i]);
    if (equity >= peak) {
      peak = equity;
      peakIdx = i;
      currentDuration = 0;
    } else {
      currentDuration += 1;
      if (currentDuration > maxDuration) maxDuration = currentDuration;
    }
    const dd = (equity / peak - 1) * 100;
    if (dd < maxDd) {
      maxDd = dd;
      bestPeakIdx = peakIdx;
      bestTroughIdx = i;
    }
    ddSeries.push(dd);
    equitySeries.push(equity);
  }

  return {
    maxDdPct: maxDd,
    peakDate: dates[bestPeakIdx] || dates[0] || '',
    troughDate: dates[bestTroughIdx] || dates[0] || '',
    durationDays: maxDuration,
    ddSeries,
    equitySeries,
  };
}

export function computeSeriesRiskStats(
  returns: number[],
  dates: string[],
  rf = DEFAULT_RISK_FREE_RATE
): {
  annReturnPct: number;
  annVolPct: number;
  sharpe: number;
  sortino: number;
  maxDdPct: number;
  calmar: number;
  histVar95Pct: number;
  paramVar95Pct: number;
  cvar95Pct: number;
} {
  const clean = returns.slice(1); // skip t=0 placeholder
  if (clean.length < 5) {
    return {
      annReturnPct: 0,
      annVolPct: 0,
      sharpe: 0,
      sortino: 0,
      maxDdPct: 0,
      calmar: 0,
      histVar95Pct: 0,
      paramVar95Pct: 0,
      cvar95Pct: 0,
    };
  }
  const m = mean(clean);
  const s = stdDev(clean);
  const annReturn = Math.pow(1 + m, TRADING_DAYS) - 1;
  const annVol = s * Math.sqrt(TRADING_DAYS);

  const rfDaily = Math.pow(1 + rf, 1 / TRADING_DAYS) - 1;
  const downside = clean.map((r) => Math.min(0, r - rfDaily));
  const downsideDev = Math.sqrt(mean(downside.map((d) => d * d))) * Math.sqrt(TRADING_DAYS);

  const sharpe = annVol > 1e-9 ? (annReturn - rf) / annVol : 0;
  const sortino = downsideDev > 1e-9 ? (annReturn - rf) / downsideDev : 0;

  const dd = computeDrawdownStats(returns, dates);
  const calmar = Math.abs(dd.maxDdPct) > 1e-6 ? (annReturn * 100) / Math.abs(dd.maxDdPct) : 0;

  const sorted = [...clean].sort((a, b) => a - b);
  const idx5 = Math.max(0, Math.floor(0.05 * sorted.length));
  const histVar95 = -sorted[idx5] * 100; // Positive loss percentage
  const paramVar95 = -(m - 1.645 * s) * 100;
  const tail = sorted.slice(0, Math.max(1, idx5 + 1));
  const cvar95 = -mean(tail) * 100;

  return {
    annReturnPct: annReturn * 100,
    annVolPct: annVol * 100,
    sharpe,
    sortino,
    maxDdPct: dd.maxDdPct,
    calmar,
    histVar95Pct: Math.max(0, histVar95),
    paramVar95Pct: Math.max(0, paramVar95),
    cvar95Pct: Math.max(0, cvar95),
  };
}

export function computePortfolioRisk(
  summary: PortfolioSummary,
  market: AlignedMarketData,
  rf = DEFAULT_RISK_FREE_RATE
): RiskMetrics {
  const dates = market.dates;
  const liquidHoldings = summary.valuedHoldings.filter((h) => market.returns[h.ticker]);

  // Aggregate weights per unique ticker within liquid portfolio
  const tickerWeightMap = new Map<string, number>();
  for (const h of liquidHoldings) {
    tickerWeightMap.set(h.ticker, (tickerWeightMap.get(h.ticker) || 0) + h.marketWeightPct / 100);
  }

  const tickers = Array.from(tickerWeightMap.keys());
  if (tickers.length === 0) {
    return {
      annualizedReturnPct: 0,
      annualizedVolPct: 0,
      weightedAvgVolPct: 0,
      diversificationBenefitPct: 0,
      sharpeRatio: 0,
      sortinoRatio: 0,
      maxDrawdownPct: 0,
      maxDrawdownPeakDate: '',
      maxDrawdownTroughDate: '',
      maxDrawdownDurationDays: 0,
      calmarRatio: 0,
      historicalVar95Pct: 0,
      parametricVar95Pct: 0,
      monteCarloVar95Pct: 0,
      cvar95Pct: 0,
      betaVsNifty: 0,
      riskContributions: [],
      drawdownSeries: [],
      benchmarkComparison: [],
    };
  }

  const weights = tickers.map((t) => tickerWeightMap.get(t) || 0);
  const seriesList = tickers.map((t) => market.returns[t]);

  // Daily portfolio returns = sum_i w_i * r_{i,t}
  const portReturns: number[] = dates.map((_, t) => {
    let r = 0;
    for (let i = 0; i < tickers.length; i++) {
      r += weights[i] * seriesList[i][t];
    }
    return r;
  });

  const portStats = computeSeriesRiskStats(portReturns, dates, rf);
  const portDd = computeDrawdownStats(portReturns, dates);
  const niftyReturns = market.returns['^NSEI'] || portReturns;
  const niftyDd = computeDrawdownStats(niftyReturns, dates);

  // Covariance matrix Σ (annualized = daily * 252)
  const cleanSeries = seriesList.map((s) => s.slice(1));
  const dailyCov = covarianceMatrix(cleanSeries);

  // Portfolio variance = w' Σ w
  const sigmaW = tickers.map((_, i) => {
    let sum = 0;
    for (let j = 0; j < tickers.length; j++) {
      sum += dailyCov[i][j] * weights[j];
    }
    return sum;
  });
  let portDailyVar = 0;
  for (let i = 0; i < tickers.length; i++) {
    portDailyVar += weights[i] * sigmaW[i];
  }
  const portAnnVolPct = Math.sqrt(Math.max(0, portDailyVar) * TRADING_DAYS) * 100;

  // Weighted average of standalone volatilities (to illustrate diversification gap)
  let weightedAvgVolPct = 0;
  const riskContributions = tickers.map((t, i) => {
    const standaloneVol = stdDev(cleanSeries[i]) * Math.sqrt(TRADING_DAYS) * 100;
    weightedAvgVolPct += weights[i] * standaloneVol;
    const rcFrac = portDailyVar > 1e-12 ? (weights[i] * sigmaW[i]) / portDailyVar : weights[i];
    const meta = getAssetMeta(t);
    return {
      ticker: t,
      name: meta?.shortName || t,
      assetClass: meta?.assetClass || 'Equity',
      capitalWeightPct: weights[i] * 100,
      riskContributionPct: rcFrac * 100,
      standaloneVolPct: standaloneVol,
    };
  });
  riskContributions.sort((a, b) => b.riskContributionPct - a.riskContributionPct);

  // Monte Carlo VaR (2,500 correlated paths using Cholesky of daily covariance)
  const means = cleanSeries.map((s) => mean(s));
  const L = cholesky(dailyCov);
  const rng = mulberry32(42026);
  const mcPortReturns: number[] = [];
  const N_PATHS = 2500;
  for (let p = 0; p < N_PATHS; p++) {
    const z = tickers.map(() => normalSample(rng));
    let rPort = 0;
    for (let i = 0; i < tickers.length; i++) {
      let corrZ = 0;
      for (let j = 0; j <= i; j++) {
        corrZ += L[i][j] * z[j];
      }
      rPort += weights[i] * (means[i] + corrZ);
    }
    mcPortReturns.push(rPort);
  }
  mcPortReturns.sort((a, b) => a - b);
  const mcVar95Pct = Math.max(0, -mcPortReturns[Math.floor(0.05 * N_PATHS)] * 100);

  // Beta vs Nifty 50
  const cleanPort = portReturns.slice(1);
  const cleanNifty = niftyReturns.slice(1);
  const varNifty = covariance(cleanNifty, cleanNifty);
  const betaVsNifty = varNifty > 1e-12 ? covariance(cleanPort, cleanNifty) / varNifty : 1;

  // Drawdown series (sample every point or last 500 points cleanly)
  const drawdownSeries = dates.map((d, i) => ({
    date: d,
    portfolioDdPct: portDd.ddSeries[i],
    niftyDdPct: niftyDd.ddSeries[i],
    equityIndex: portDd.equitySeries[i],
    niftyIndex: niftyDd.equitySeries[i],
  }));

  // Benchmark comparison
  const goldReturns = market.returns['GOLDBEES.NS'] || portReturns;
  const btcReturns = market.returns['BTC-USD'] || portReturns;
  const niftyStats = computeSeriesRiskStats(niftyReturns, dates, rf);
  const goldStats = computeSeriesRiskStats(goldReturns, dates, rf);
  const btcStats = computeSeriesRiskStats(btcReturns, dates, rf);

  const benchmarkComparison = [
    {
      label: 'Your Portfolio',
      annualReturnPct: portStats.annReturnPct,
      annualVolPct: portAnnVolPct,
      sharpe: portStats.sharpe,
      maxDrawdownPct: portDd.maxDdPct,
      var95Pct: portStats.histVar95Pct,
    },
    {
      label: 'NIFTY 50 Index',
      annualReturnPct: niftyStats.annReturnPct,
      annualVolPct: niftyStats.annVolPct,
      sharpe: niftyStats.sharpe,
      maxDrawdownPct: niftyDd.maxDdPct,
      var95Pct: niftyStats.histVar95Pct,
    },
    {
      label: 'Gold BeES (INR)',
      annualReturnPct: goldStats.annReturnPct,
      annualVolPct: goldStats.annVolPct,
      sharpe: goldStats.sharpe,
      maxDrawdownPct: goldStats.maxDdPct,
      var95Pct: goldStats.histVar95Pct,
    },
    {
      label: 'Bitcoin (INR eq.)',
      annualReturnPct: btcStats.annReturnPct,
      annualVolPct: btcStats.annVolPct,
      sharpe: btcStats.sharpe,
      maxDrawdownPct: btcStats.maxDdPct,
      var95Pct: btcStats.histVar95Pct,
    },
  ];

  return {
    annualizedReturnPct: portStats.annReturnPct,
    annualizedVolPct: portAnnVolPct,
    weightedAvgVolPct,
    diversificationBenefitPct: Math.max(0, weightedAvgVolPct - portAnnVolPct),
    sharpeRatio: portStats.sharpe,
    sortinoRatio: portStats.sortino,
    maxDrawdownPct: portDd.maxDdPct,
    maxDrawdownPeakDate: portDd.peakDate,
    maxDrawdownTroughDate: portDd.troughDate,
    maxDrawdownDurationDays: portDd.durationDays,
    calmarRatio: portStats.calmar,
    historicalVar95Pct: portStats.histVar95Pct,
    parametricVar95Pct: portStats.paramVar95Pct,
    monteCarloVar95Pct: mcVar95Pct,
    cvar95Pct: portStats.cvar95Pct,
    betaVsNifty,
    riskContributions,
    drawdownSeries,
    benchmarkComparison,
  };
}
