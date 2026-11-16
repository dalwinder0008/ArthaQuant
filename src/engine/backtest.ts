import { ledoitWolfCovariance } from './optimizer.ts';
import { computeDrawdownStats, computeSeriesRiskStats, mean, TRADING_DAYS } from './risk.ts';
import type {
  AlignedMarketData,
  BacktestResult,
  BacktestStrategyResult,
  OptimizationConstraints,
  PortfolioSummary,
  RegimeReport,
} from './types.ts';
import { getAssetMeta } from './universe.ts';

function computeMinVarSharpeBlend(
  seriesWindow: number[][],
  tickers: string[],
  maxCrypto: number,
  minGold: number
): number[] {
  const n = tickers.length;
  const cov = ledoitWolfCovariance(seriesWindow).map((row) => row.map((v) => v * TRADING_DAYS));
  const annMu = seriesWindow.map((s) => Math.max(-0.05, Math.min(0.35, Math.pow(1 + mean(s), TRADING_DAYS) - 1)));
  const cryptoMask = tickers.map((t) => getAssetMeta(t)?.assetClass === 'Crypto');
  const goldMask = tickers.map((t) => getAssetMeta(t)?.assetClass === 'Gold');

  let w = Array(n).fill(1 / n);
  for (let iter = 0; iter < 45; iter++) {
    for (let i = 0; i < n; i++) {
      let g = 0;
      for (let j = 0; j < n; j++) g += 2 * cov[i][j] * w[j];
      g -= 0.18 * annMu[i];
      w[i] = Math.max(0, Math.min(0.35, w[i] - 0.08 * g));
    }
    const cryptoSum = w.reduce((a, v, i) => a + (cryptoMask[i] ? v : 0), 0);
    if (cryptoSum > maxCrypto && cryptoSum > 1e-9) {
      w = w.map((v, i) => (cryptoMask[i] ? (v * maxCrypto) / cryptoSum : v));
    }
    const goldSum = w.reduce((a, v, i) => a + (goldMask[i] ? v : 0), 0);
    if (goldSum < minGold && goldMask.some(Boolean)) {
      const def = minGold - goldSum;
      const gc = goldMask.filter(Boolean).length;
      w = w.map((v, i) => (goldMask[i] ? v + def / gc : v));
    }
    const s = w.reduce((a, b) => a + b, 0) || 1;
    w = w.map((v) => v / s);
  }
  return w;
}

/**
 * Expanding-window walk-forward backtester (zero look-ahead) with 0.1% transaction cost + 0.05% slippage.
 */
export function runBacktest(
  summary: PortfolioSummary,
  market: AlignedMarketData,
  regimeReport: RegimeReport,
  constraints: OptimizationConstraints
): BacktestResult {
  const heldLiquid = summary.valuedHoldings.filter((h) => market.returns[h.ticker]);
  const tickers = Array.from(
    new Set([...heldLiquid.map((h) => h.ticker), 'GOLDBEES.NS', 'LIQUIDBEES.NS'])
  ).filter((t) => market.returns[t]);

  const n = tickers.length;
  if (n === 0) {
    return { dates: [], strategies: [], curves: [] };
  }

  const currWeights = tickers.map(
    (t) =>
      summary.valuedHoldings
        .filter((h) => h.ticker === t)
        .reduce((a, b) => a + b.marketWeightPct, 0) / 100
  );
  const cwSum = currWeights.reduce((a, b) => a + b, 0) || 1;
  const initHoldW = currWeights.map((w) => w / cwSum);
  const eqW = Array(n).fill(1 / n);

  const regimeMap = new Map<string, 'Bull' | 'Sideways' | 'Bear'>();
  for (const pt of regimeReport.timeline) {
    regimeMap.set(pt.date, pt.regime);
  }

  const startIdx = Math.max(90, Math.floor(market.dates.length * 0.25));
  const TX_COST = 0.0015; // 0.1% tx cost + 0.05% slippage

  const dates = market.dates.slice(startIdx);
  const bhRets: number[] = [0];
  const eqRets: number[] = [0];
  const mkRets: number[] = [0];
  const regRets: number[] = [0];
  const niftyRets: number[] = [0];

  let wBH = [...initHoldW];
  let wEQ = [...eqW];
  let wMK = [...eqW];
  let wREG = [...eqW];

  let mkTurnover = 0;
  let regTurnover = 0;
  let mkCostSum = 0;
  let regCostSum = 0;
  let prevRegime: string = 'Sideways';

  for (let t = startIdx + 1; t < market.dates.length; t++) {
    const d = market.dates[t];
    const stepRets = tickers.map((tk) => market.returns[tk][t]);
    const niftyR = market.returns['^NSEI']?.[t] ?? 0;

    // Quarterly rebalance (every 63 trading days) using STRICTLY past window [0 .. t-1]
    const daysSinceStart = t - startIdx;
    let mkStepCost = 0;
    let regStepCost = 0;

    if (daysSinceStart % 63 === 1) {
      const pastWindow = tickers.map((tk) => market.returns[tk].slice(Math.max(1, t - 180), t));
      const newMk = computeMinVarSharpeBlend(
        pastWindow,
        tickers,
        constraints.maxCryptoPct / 100,
        constraints.minGoldPct / 100
      );
      const turnMk = newMk.reduce((acc, w, i) => acc + Math.abs(w - wMK[i]), 0) / 2;
      mkTurnover += turnMk;
      mkStepCost = turnMk * TX_COST;
      mkCostSum += mkStepCost;
      wMK = newMk;
    }

    const curRegime = regimeMap.get(market.dates[t - 1]) || prevRegime;
    if (daysSinceStart % 63 === 1 || curRegime !== prevRegime) {
      const pastWindow = tickers.map((tk) => market.returns[tk].slice(Math.max(1, t - 180), t));
      const maxC = curRegime === 'Bear' ? 0.08 : curRegime === 'Bull' ? Math.min(0.25, constraints.maxCryptoPct / 100) : constraints.maxCryptoPct / 100;
      const minG = curRegime === 'Bear' ? Math.max(0.28, constraints.minGoldPct / 100) : constraints.minGoldPct / 100;
      const newReg = computeMinVarSharpeBlend(pastWindow, tickers, maxC, minG);
      const turnReg = newReg.reduce((acc, w, i) => acc + Math.abs(w - wREG[i]), 0) / 2;
      regTurnover += turnReg;
      regStepCost = turnReg * TX_COST;
      regCostSum += regStepCost;
      wREG = newReg;
      prevRegime = curRegime;
    }

    const rBH = wBH.reduce((acc, w, i) => acc + w * stepRets[i], 0);
    const rEQ = wEQ.reduce((acc, w, i) => acc + w * stepRets[i], 0);
    const rMK = wMK.reduce((acc, w, i) => acc + w * stepRets[i], 0) - mkStepCost;
    const rREG = wREG.reduce((acc, w, i) => acc + w * stepRets[i], 0) - regStepCost;

    bhRets.push(rBH);
    eqRets.push(rEQ);
    mkRets.push(rMK);
    regRets.push(rREG);
    niftyRets.push(niftyR);

    // Drift weights by realized returns
    const drift = (ws: number[]) => {
      const next = ws.map((w, i) => w * (1 + stepRets[i]));
      const sum = next.reduce((a, b) => a + b, 0) || 1;
      return next.map((v) => v / sum);
    };
    wBH = drift(wBH);
    wMK = drift(wMK);
    wREG = drift(wREG);
  }

  const years = Math.max(0.5, dates.length / TRADING_DAYS);
  const summarize = (
    name: BacktestStrategyResult['name'],
    rets: number[],
    turnoverTotal: number,
    txCostTotal: number
  ): { stats: BacktestStrategyResult; dd: ReturnType<typeof computeDrawdownStats> } => {
    const dd = computeDrawdownStats(rets, dates);
    const risk = computeSeriesRiskStats(rets, dates, constraints.riskFreeRatePct / 100);
    const finalVal = dd.equitySeries[dd.equitySeries.length - 1] ?? 100;
    const cagr = (Math.pow(finalVal / 100, 1 / years) - 1) * 100;
    return {
      stats: {
        name,
        cagrPct: cagr,
        annualVolPct: risk.annVolPct,
        sharpe: risk.sharpe,
        sortino: risk.sortino,
        maxDrawdownPct: dd.maxDdPct,
        calmar: Math.abs(dd.maxDdPct) > 1e-6 ? cagr / Math.abs(dd.maxDdPct) : 0,
        annualTurnoverPct: (turnoverTotal / years) * 100,
        totalTxCostPct: txCostTotal * 100,
        finalValueOn100: finalVal,
      },
      dd,
    };
  };

  const sBH = summarize('Buy & Hold Current', bhRets, 0, 0);
  const sEQ = summarize('Equal Weight (1/N)', eqRets, 0.25 * years, 0.0004 * years);
  const sMK = summarize('Markowitz Quarterly', mkRets, mkTurnover, mkCostSum);
  const sREG = summarize('Regime-Adjusted', regRets, regTurnover, regCostSum);
  const sNIFTY = summarize('Nifty 50 Benchmark', niftyRets, 0, 0);

  const curves = dates.map((d, i) => ({
    date: d,
    buyHold: sBH.dd.equitySeries[i],
    equalWeight: sEQ.dd.equitySeries[i],
    markowitz: sMK.dd.equitySeries[i],
    regimeAdjusted: sREG.dd.equitySeries[i],
    nifty: sNIFTY.dd.equitySeries[i],
    buyHoldDd: sBH.dd.ddSeries[i],
    markowitzDd: sMK.dd.ddSeries[i],
    regimeAdjustedDd: sREG.dd.ddSeries[i],
  }));

  return {
    dates,
    strategies: [sBH.stats, sEQ.stats, sMK.stats, sREG.stats, sNIFTY.stats],
    curves,
  };
}
