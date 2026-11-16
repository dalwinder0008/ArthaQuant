import { mean, stdDev, TRADING_DAYS } from './risk.ts';
import type { AlignedMarketData, MarketRegime, RegimeReport } from './types.ts';

interface GaussianState {
  meanRet: number;
  varRet: number;
  meanVol: number;
  varVol: number;
}

function gaussianPdf2D(r: number, v: number, st: GaussianState): number {
  const z1 = (r - st.meanRet) ** 2 / Math.max(1e-8, st.varRet);
  const z2 = (v - st.meanVol) ** 2 / Math.max(1e-8, st.varVol);
  const denom = 2 * Math.PI * Math.sqrt(Math.max(1e-12, st.varRet * st.varVol));
  return Math.max(1e-16, Math.exp(-0.5 * (z1 + z2)) / denom);
}

function fitGaussianHMM(
  obsRet: number[],
  obsVol: number[],
  kStates: number
): {
  states: GaussianState[];
  trans: number[][];
  pi: number[];
  filteredProbs: number[][];
  logLikelihood: number;
  bic: number;
} {
  const T = obsRet.length;
  // Quantile-based initialization by volatility
  const sortedVol = [...obsVol].sort((a, b) => a - b);
  const states: GaussianState[] = [];
  for (let k = 0; k < kStates; k++) {
    const qIdx = Math.min(sortedVol.length - 1, Math.floor(((k + 0.5) / kStates) * sortedVol.length));
    states.push({
      meanRet: k === kStates - 1 ? -0.001 : k === 0 ? 0.0009 : 0.0001,
      varRet: Math.max(1e-5, Math.pow(stdDev(obsRet), 2) * (k === kStates - 1 ? 1.8 : 0.7)),
      meanVol: sortedVol[qIdx],
      varVol: Math.max(1e-5, Math.pow(stdDev(obsVol), 2) * 0.6),
    });
  }

  let pi = Array(kStates).fill(1 / kStates);
  let trans: number[][] = Array.from({ length: kStates }, (_, i) =>
    Array.from({ length: kStates }, (_, j) => (i === j ? 0.92 : 0.08 / Math.max(1, kStates - 1)))
  );

  let finalLL = -Infinity;

  // Baum-Welch EM (12 iterations)
  for (let iter = 0; iter < 12; iter++) {
    const alpha: number[][] = Array.from({ length: T }, () => Array(kStates).fill(0));
    const scales: number[] = Array(T).fill(1);

    // Forward pass (scaled)
    for (let k = 0; k < kStates; k++) {
      alpha[0][k] = pi[k] * gaussianPdf2D(obsRet[0], obsVol[0], states[k]);
    }
    scales[0] = alpha[0].reduce((a, b) => a + b, 0) || 1e-12;
    for (let k = 0; k < kStates; k++) alpha[0][k] /= scales[0];

    for (let t = 1; t < T; t++) {
      let s = 0;
      for (let j = 0; j < kStates; j++) {
        let sumPrev = 0;
        for (let i = 0; i < kStates; i++) sumPrev += alpha[t - 1][i] * trans[i][j];
        alpha[t][j] = sumPrev * gaussianPdf2D(obsRet[t], obsVol[t], states[j]);
        s += alpha[t][j];
      }
      scales[t] = s || 1e-12;
      for (let j = 0; j < kStates; j++) alpha[t][j] /= scales[t];
    }

    finalLL = scales.reduce((acc, s) => acc + Math.log(Math.max(1e-16, s)), 0);

    // Backward pass
    const beta: number[][] = Array.from({ length: T }, () => Array(kStates).fill(1));
    for (let t = T - 2; t >= 0; t--) {
      for (let i = 0; i < kStates; i++) {
        let sumNext = 0;
        for (let j = 0; j < kStates; j++) {
          sumNext += trans[i][j] * gaussianPdf2D(obsRet[t + 1], obsVol[t + 1], states[j]) * beta[t + 1][j];
        }
        beta[t][i] = sumNext / scales[t + 1];
      }
    }

    // Posteriors gamma
    const gamma: number[][] = Array.from({ length: T }, () => Array(kStates).fill(0));
    for (let t = 0; t < T; t++) {
      let s = 0;
      for (let k = 0; k < kStates; k++) {
        gamma[t][k] = alpha[t][k] * beta[t][k];
        s += gamma[t][k];
      }
      if (s > 0) for (let k = 0; k < kStates; k++) gamma[t][k] /= s;
    }

    // M-step
    pi = gamma[0].map((v) => Math.max(1e-4, v));
    const piSum = pi.reduce((a, b) => a + b, 0);
    pi = pi.map((v) => v / piSum);

    const newTrans: number[][] = Array.from({ length: kStates }, () => Array(kStates).fill(0));
    for (let i = 0; i < kStates; i++) {
      let rowSum = 0;
      for (let j = 0; j < kStates; j++) {
        let xiSum = 0;
        for (let t = 0; t < T - 1; t++) {
          xiSum +=
            (alpha[t][i] *
              trans[i][j] *
              gaussianPdf2D(obsRet[t + 1], obsVol[t + 1], states[j]) *
              beta[t + 1][j]) /
            scales[t + 1];
        }
        newTrans[i][j] = Math.max(1e-4, xiSum);
        rowSum += newTrans[i][j];
      }
      for (let j = 0; j < kStates; j++) newTrans[i][j] /= Math.max(1e-9, rowSum);
    }
    trans = newTrans;

    for (let k = 0; k < kStates; k++) {
      let wSum = 0;
      let mr = 0;
      let mv = 0;
      for (let t = 0; t < T; t++) {
        wSum += gamma[t][k];
        mr += gamma[t][k] * obsRet[t];
        mv += gamma[t][k] * obsVol[t];
      }
      wSum = Math.max(1e-6, wSum);
      states[k].meanRet = mr / wSum;
      states[k].meanVol = mv / wSum;

      let vr = 0;
      let vv = 0;
      for (let t = 0; t < T; t++) {
        vr += gamma[t][k] * Math.pow(obsRet[t] - states[k].meanRet, 2);
        vv += gamma[t][k] * Math.pow(obsVol[t] - states[k].meanVol, 2);
      }
      states[k].varRet = Math.max(1e-5, vr / wSum);
      states[k].varVol = Math.max(1e-5, vv / wSum);
    }
  }

  // Final strict Forward-Algorithm filtered probabilities (no backward look-ahead!)
  const filteredProbs: number[][] = Array.from({ length: T }, () => Array(kStates).fill(0));
  for (let k = 0; k < kStates; k++) {
    filteredProbs[0][k] = pi[k] * gaussianPdf2D(obsRet[0], obsVol[0], states[k]);
  }
  const s0 = filteredProbs[0].reduce((a, b) => a + b, 0) || 1;
  for (let k = 0; k < kStates; k++) filteredProbs[0][k] /= s0;

  for (let t = 1; t < T; t++) {
    let s = 0;
    for (let j = 0; j < kStates; j++) {
      let sumPrev = 0;
      for (let i = 0; i < kStates; i++) sumPrev += filteredProbs[t - 1][i] * trans[i][j];
      filteredProbs[t][j] = sumPrev * gaussianPdf2D(obsRet[t], obsVol[t], states[j]);
      s += filteredProbs[t][j];
    }
    const denom = s || 1;
    for (let j = 0; j < kStates; j++) filteredProbs[t][j] /= denom;
  }

  const numParams = kStates * kStates + kStates * 4 - 1;
  const bic = -2 * finalLL + numParams * Math.log(T);

  return { states, trans, pi, filteredProbs, logLikelihood: finalLL, bic };
}

export function detectMarketRegimes(market: AlignedMarketData): RegimeReport {
  const rets = market.returns['^NSEI'] || Object.values(market.returns)[0];
  const prices = market.pricesInr['^NSEI'] || Object.values(market.pricesInr)[0];
  const dates = market.dates;

  const startIdx = 20;
  const obsRet: number[] = [];
  const obsVol: number[] = [];
  const obsDates: string[] = [];
  const obsClose: number[] = [];

  for (let t = startIdx; t < rets.length; t++) {
    obsRet.push(rets[t]);
    obsVol.push(stdDev(rets.slice(t - 19, t + 1)) * Math.sqrt(TRADING_DAYS));
    obsDates.push(dates[t]);
    obsClose.push(prices[t]);
  }

  const hmm2 = fitGaussianHMM(obsRet, obsVol, 2);
  const hmm3 = fitGaussianHMM(obsRet, obsVol, 3);
  const hmm4 = fitGaussianHMM(obsRet, obsVol, 4);

  // Label the 3 states post-hoc: highest Sharpe/mean with lower vol = Bull, highest vol / lowest mean = Bear, middle = Sideways
  const indices = [0, 1, 2];
  const bearIdx = indices.reduce((a, b) => (hmm3.states[b].meanVol > hmm3.states[a].meanVol ? b : a), 0);
  const remaining = indices.filter((i) => i !== bearIdx);
  const bullIdx =
    hmm3.states[remaining[0]].meanRet >= hmm3.states[remaining[1]].meanRet ? remaining[0] : remaining[1];
  const sidewaysIdx = remaining.find((i) => i !== bullIdx)!;

  const canonicalOrder = [bullIdx, sidewaysIdx, bearIdx];
  const canonicalLabels: [MarketRegime, MarketRegime, MarketRegime] = ['Bull', 'Sideways', 'Bear'];

  const transitionMatrix = canonicalOrder.map((rIdx) =>
    canonicalOrder.map((cIdx) => hmm3.trans[rIdx][cIdx])
  );

  // Build timeline with filtered probabilities
  const counts: Record<MarketRegime, number> = { Bull: 0, Sideways: 0, Bear: 0 };
  const timeline = obsDates.map((d, t) => {
    const pBull = hmm3.filteredProbs[t][bullIdx];
    const pSide = hmm3.filteredProbs[t][sidewaysIdx];
    const pBear = hmm3.filteredProbs[t][bearIdx];
    let regime: MarketRegime = 'Sideways';
    if (pBull >= pSide && pBull >= pBear) regime = 'Bull';
    else if (pBear >= pBull && pBear >= pSide) regime = 'Bear';
    counts[regime] += 1;

    return {
      date: d,
      niftyClose: obsClose[t],
      regime,
      probBull: pBull,
      probSideways: pSide,
      probBear: pBear,
    };
  });

  const last = timeline[timeline.length - 1];
  const currentRegime = last?.regime || 'Sideways';

  const stateStats = canonicalOrder.map((idx, pos) => ({
    regime: canonicalLabels[pos],
    annReturnPct: (Math.pow(1 + hmm3.states[idx].meanRet, TRADING_DAYS) - 1) * 100,
    annVolPct: hmm3.states[idx].meanVol * 100,
    occupancyPct: (counts[canonicalLabels[pos]] / Math.max(1, timeline.length)) * 100,
  }));

  return {
    currentRegime,
    probabilities: {
      Bull: last?.probBull ?? 0.33,
      Sideways: last?.probSideways ?? 0.34,
      Bear: last?.probBear ?? 0.33,
    },
    bicComparison: [
      { states: 2, bic: hmm2.bic, selected: false },
      { states: 3, bic: hmm3.bic, selected: true },
      { states: 4, bic: hmm4.bic, selected: false },
    ],
    transitionMatrix,
    stateLabels: canonicalLabels,
    stateStats,
    timeline: timeline.slice(-360),
  };
}
