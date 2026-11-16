import { covarianceMatrix, DEFAULT_RISK_FREE_RATE, mean, TRADING_DAYS } from './risk.ts';
import type {
  AlignedMarketData,
  FrontierPoint,
  MarketRegime,
  OptimizationConstraints,
  OptimizationResult,
  PortfolioSummary,
  RebalanceTrade,
} from './types.ts';
import { getAssetMeta } from './universe.ts';

/**
 * Ledoit-Wolf shrinkage covariance estimator toward constant-variance diagonal target.
 */
export function ledoitWolfCovariance(seriesList: number[][]): number[][] {
  const n = seriesList.length;
  const T = seriesList[0]?.length || 1;
  const S = covarianceMatrix(seriesList);

  let avgVar = 0;
  for (let i = 0; i < n; i++) avgVar += S[i][i];
  avgVar /= Math.max(1, n);

  // Shrinkage intensity delta (bounded [0.10, 0.45] for sample stability)
  const delta = Math.max(0.1, Math.min(0.45, 25 / Math.max(30, T)));
  const shrunk: number[][] = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => (i === j ? (1 - delta) * S[i][j] + delta * avgVar : (1 - delta) * S[i][j]))
  );
  return shrunk;
}

function projectToSimplexWithBounds(
  weights: number[],
  lower: number[],
  upper: number[],
  cryptoMask: boolean[],
  maxCrypto: number,
  goldMask: boolean[],
  minGold: number,
  safeMask: boolean[],
  minSafe: number
): number[] {
  let w = weights.map((v, i) => Math.max(lower[i], Math.min(upper[i], v)));

  for (let pass = 0; pass < 16; pass++) {
    // Enforce class floors & caps
    const cryptoSum = w.reduce((acc, v, i) => acc + (cryptoMask[i] ? v : 0), 0);
    if (cryptoSum > maxCrypto && cryptoSum > 1e-9) {
      const ratio = maxCrypto / cryptoSum;
      w = w.map((v, i) => (cryptoMask[i] ? v * ratio : v));
    }

    const goldSum = w.reduce((acc, v, i) => acc + (goldMask[i] ? v : 0), 0);
    if (goldSum < minGold && goldMask.some(Boolean)) {
      const deficit = minGold - goldSum;
      const gCount = goldMask.filter(Boolean).length;
      w = w.map((v, i) => (goldMask[i] ? Math.min(upper[i], v + deficit / gCount) : v));
    }

    const safeSum = w.reduce((acc, v, i) => acc + (safeMask[i] ? v : 0), 0);
    if (safeSum < minSafe && safeMask.some(Boolean)) {
      const deficit = minSafe - safeSum;
      const sCount = safeMask.filter(Boolean).length;
      w = w.map((v, i) => (safeMask[i] ? Math.min(upper[i], v + deficit / sCount) : v));
    }

    // Re-normalize remaining free weights to sum to 1
    const total = w.reduce((a, b) => a + b, 0);
    if (total > 1e-9) {
      w = w.map((v) => v / total);
    } else {
      w = Array(w.length).fill(1 / w.length);
    }

    // Clamp bounds
    w = w.map((v, i) => Math.max(lower[i], Math.min(upper[i], v)));
  }

  const finalSum = w.reduce((a, b) => a + b, 0) || 1;
  return w.map((v) => v / finalSum);
}

function portfolioStats(
  w: number[],
  annMu: number[],
  annCov: number[][],
  rf: number
): { ret: number; vol: number; sharpe: number } {
  let ret = 0;
  for (let i = 0; i < w.length; i++) ret += w[i] * annMu[i];
  let variance = 0;
  for (let i = 0; i < w.length; i++) {
    for (let j = 0; j < w.length; j++) {
      variance += w[i] * annCov[i][j] * w[j];
    }
  }
  const vol = Math.sqrt(Math.max(1e-8, variance));
  return { ret, vol, sharpe: (ret - rf) / vol };
}

function solveRiskParityWeights(
  annCov: number[][],
  lower: number[],
  upper: number[],
  cryptoMask: boolean[],
  maxCrypto: number,
  goldMask: boolean[],
  minGold: number,
  safeMask: boolean[],
  minSafe: number
): number[] {
  const n = annCov.length;
  let w = Array(n).fill(1 / n);

  for (let iter = 0; iter < 80; iter++) {
    const sigmaW = annCov.map((row) => row.reduce((acc, val, j) => acc + val * w[j], 0));
    const portVar = w.reduce((acc, wi, i) => acc + wi * sigmaW[i], 0);
    const targetRC = portVar / n;
    for (let i = 0; i < n; i++) {
      const rc = w[i] * sigmaW[i];
      if (rc > 1e-12) {
        w[i] = w[i] * Math.pow(targetRC / rc, 0.35);
      }
    }
    w = projectToSimplexWithBounds(
      w,
      lower,
      upper,
      cryptoMask,
      maxCrypto,
      goldMask,
      minGold,
      safeMask,
      minSafe
    );
  }
  return w;
}

export function applyRegimeConstraints(
  base: OptimizationConstraints,
  regime: MarketRegime
): OptimizationConstraints {
  if (!base.regimeAware) return base;
  if (regime === 'Bear') {
    return {
      ...base,
      maxCryptoPct: Math.min(base.maxCryptoPct, 10),
      minGoldPct: Math.max(base.minGoldPct, 25),
      minSafePct: Math.max(base.minSafePct, 15),
      maxSingleAssetPct: Math.min(base.maxSingleAssetPct, 25),
    };
  }
  if (regime === 'Bull') {
    return {
      ...base,
      maxCryptoPct: Math.min(25, Math.max(base.maxCryptoPct, 18)),
      minGoldPct: Math.max(10, Math.min(base.minGoldPct, 15)),
      minSafePct: Math.min(base.minSafePct, 5),
    };
  }
  return base;
}

export function optimizePortfolio(
  summary: PortfolioSummary,
  market: AlignedMarketData,
  baseConstraints: OptimizationConstraints,
  currentRegime: MarketRegime
): OptimizationResult {
  const constraints = applyRegimeConstraints(baseConstraints, currentRegime);
  const rf = (constraints.riskFreeRatePct ?? DEFAULT_RISK_FREE_RATE * 100) / 100;

  // Candidate universe: all held liquid tickers + GOLDBEES.NS + LIQUIDBEES.NS + EMBASSY.NS for hedging options
  const heldLiquid = summary.valuedHoldings.filter((h) => market.returns[h.ticker]);
  const candidateTickers = Array.from(
    new Set([
      ...heldLiquid.map((h) => h.ticker),
      'GOLDBEES.NS',
      'LIQUIDBEES.NS',
      'EMBASSY.NS',
    ])
  ).filter((t) => market.returns[t]);

  const n = candidateTickers.length;
  const seriesClean = candidateTickers.map((t) => market.returns[t].slice(1));
  const dailyCov = ledoitWolfCovariance(seriesClean);
  const annCov = dailyCov.map((row) => row.map((v) => v * TRADING_DAYS));

  // Shrink expected returns toward grand mean / asset-class priors to avoid Markowitz extreme corner weights
  const rawAnnMu = seriesClean.map((s) => (Math.pow(1 + mean(s), TRADING_DAYS) - 1));
  const priorMu = candidateTickers.map((t) => {
    const cls = getAssetMeta(t)?.assetClass;
    if (cls === 'Equity') return 0.13;
    if (cls === 'Gold') return 0.105;
    if (cls === 'Crypto') return 0.22;
    if (cls === 'REIT') return 0.095;
    return 0.068;
  });
  const annMu = rawAnnMu.map((m, i) => 0.45 * Math.max(-0.1, Math.min(0.45, m)) + 0.55 * priorMu[i]);

  const cryptoMask = candidateTickers.map((t) => getAssetMeta(t)?.assetClass === 'Crypto');
  const goldMask = candidateTickers.map((t) => getAssetMeta(t)?.assetClass === 'Gold');
  const safeMask = candidateTickers.map((t) => getAssetMeta(t)?.assetClass === 'Safe');

  const maxCrypto = constraints.maxCryptoPct / 100;
  const minGold = constraints.minGoldPct / 100;
  const minSafe = constraints.minSafePct / 100;
  const maxSingle = constraints.maxSingleAssetPct / 100;

  const lower = Array(n).fill(0);
  const upper = candidateTickers.map((_, i) => (cryptoMask[i] ? Math.min(maxSingle, maxCrypto) : maxSingle));

  // Current weights vector
  const currentWeights = candidateTickers.map(
    (t) =>
      summary.valuedHoldings
        .filter((h) => h.ticker === t)
        .reduce((a, b) => a + b.marketWeightPct, 0) / 100
  );
  const currSum = currentWeights.reduce((a, b) => a + b, 0) || 1;
  const normCurrent = currentWeights.map((w) => w / currSum);

  const toPoint = (w: number[]): FrontierPoint => {
    const st = portfolioStats(w, annMu, annCov, rf);
    const weightsObj: Record<string, number> = {};
    candidateTickers.forEach((t, i) => {
      weightsObj[t] = w[i] * 100;
    });
    return {
      expectedReturnPct: st.ret * 100,
      volatilityPct: st.vol * 100,
      sharpe: st.sharpe,
      weights: weightsObj,
    };
  };

  // Projected gradient solver for objective: maximize (ret - rf)/vol or minimize vol - lambda * ret
  const solveForLambda = (returnRewardLambda: number): number[] => {
    let w = projectToSimplexWithBounds(
      Array(n).fill(1 / n),
      lower,
      upper,
      cryptoMask,
      maxCrypto,
      goldMask,
      minGold,
      safeMask,
      minSafe
    );

    const step = 0.08;
    for (let iter = 0; iter < 140; iter++) {
      const grad = Array(n).fill(0);
      for (let i = 0; i < n; i++) {
        let covGrad = 0;
        for (let j = 0; j < n; j++) covGrad += 2 * annCov[i][j] * w[j];
        grad[i] = covGrad - returnRewardLambda * annMu[i];
      }
      const next = w.map((wi, i) => wi - step * grad[i]);
      w = projectToSimplexWithBounds(
        next,
        lower,
        upper,
        cryptoMask,
        maxCrypto,
        goldMask,
        minGold,
        safeMask,
        minSafe
      );
    }
    return w;
  };

  const minVarW = solveForLambda(0);
  const frontier: FrontierPoint[] = [];
  let maxSharpeW = minVarW;
  let bestSharpe = -Infinity;

  for (let k = 0; k <= 24; k++) {
    const lam = k * 0.025;
    const w = solveForLambda(lam);
    const pt = toPoint(w);
    frontier.push(pt);
    if (pt.sharpe > bestSharpe) {
      bestSharpe = pt.sharpe;
      maxSharpeW = w;
    }
  }

  const riskParityW = solveRiskParityWeights(
    annCov,
    lower,
    upper,
    cryptoMask,
    maxCrypto,
    goldMask,
    minGold,
    safeMask,
    minSafe
  );

  // Recommended allocation blends Max-Sharpe and Risk Parity (more Risk Parity in Bear regime)
  const rpBlend = currentRegime === 'Bear' ? 0.5 : currentRegime === 'Sideways' ? 0.35 : 0.2;
  const recommendedW = projectToSimplexWithBounds(
    maxSharpeW.map((w, i) => (1 - rpBlend) * w + rpBlend * riskParityW[i]),
    lower,
    upper,
    cryptoMask,
    maxCrypto,
    goldMask,
    minGold,
    safeMask,
    minSafe
  );

  const liquidTotal = Math.max(1, summary.liquidValueInr);
  const TX_FEE_RATE = 0.001; // 0.1% brokerage + STT + slippage

  const trades: RebalanceTrade[] = candidateTickers.map((t, i) => {
    const meta = getAssetMeta(t)!;
    const cw = normCurrent[i] * 100;
    const tw = recommendedW[i] * 100;
    const currentVal = normCurrent[i] * liquidTotal;
    const targetVal = recommendedW[i] * liquidTotal;
    const deltaInr = targetVal - currentVal;
    const latestPrice = market.latestPriceInr[t] || 1;
    const action: RebalanceTrade['action'] =
      Math.abs(deltaInr) < liquidTotal * 0.01 ? 'HOLD' : deltaInr > 0 ? 'BUY' : 'SELL';

    return {
      ticker: t,
      name: meta.shortName,
      assetClass: meta.assetClass,
      currentWeightPct: cw,
      targetWeightPct: tw,
      deltaWeightPct: tw - cw,
      currentValueInr: currentVal,
      targetValueInr: targetVal,
      deltaInr,
      action,
      estimatedUnits: deltaInr / latestPrice,
      txCostInr: action === 'HOLD' ? 0 : Math.abs(deltaInr) * TX_FEE_RATE,
    };
  });

  trades.sort((a, b) => Math.abs(b.deltaInr) - Math.abs(a.deltaInr));
  const totalTurnoverInr = trades.reduce((acc, tr) => acc + (tr.action === 'HOLD' ? 0 : Math.abs(tr.deltaInr)), 0) / 2;
  const totalTxCostInr = trades.reduce((acc, tr) => acc + tr.txCostInr, 0);

  return {
    tickers: candidateTickers,
    appliedConstraints: constraints,
    currentPoint: toPoint(normCurrent),
    minVariancePoint: toPoint(minVarW),
    maxSharpePoint: toPoint(maxSharpeW),
    riskParityPoint: toPoint(riskParityW),
    recommendedPoint: toPoint(recommendedW),
    frontier,
    trades,
    totalTurnoverInr,
    totalTxCostInr,
  };
}
