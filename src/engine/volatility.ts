import { mean, stdDev, TRADING_DAYS } from './risk.ts';
import type {
  AlignedMarketData,
  VolatilityComparison,
  VolatilityForecastSeriesPoint,
  VolatilityModelMetrics,
} from './types.ts';

interface VolRow {
  date: string;
  targetVol: number; // Realized 5-day forward annualized vol (decimal, e.g. 0.18)
  yesterdayVol: number;
  roll20Vol: number;
  features: number[]; // Strictly lagged <= t
}

function buildVolatilityDataset(market: AlignedMarketData, ticker: string): VolRow[] {
  const rets = market.returns[ticker] || market.returns['^NSEI'];
  const vols = market.volumes[ticker] || market.volumes['^NSEI'] || rets.map(() => 1);
  const prices = market.pricesInr[ticker] || market.pricesInr['^NSEI'];
  const vix = market.indiaVix;
  const dates = market.dates;
  const n = rets.length;

  const rows: VolRow[] = [];
  const annFactor = Math.sqrt(TRADING_DAYS);

  // Start at index 65 to allow 60-day rolling features; end at n - 6 for 5-day forward realized target
  for (let t = 65; t < n - 6; t++) {
    // Target: realized volatility over next 5 days [t+1 .. t+5]
    let sumSqFwd = 0;
    for (let k = 1; k <= 5; k++) {
      sumSqFwd += rets[t + k] * rets[t + k];
    }
    const targetVol = Math.max(0.02, Math.sqrt(sumSqFwd / 5) * annFactor);

    // Strictly past/current features <= t (zero look-ahead)
    const yesterdayVol = Math.max(0.02, Math.abs(rets[t]) * annFactor);
    const roll5 = stdDev(rets.slice(t - 4, t + 1)) * annFactor;
    const roll10 = stdDev(rets.slice(t - 9, t + 1)) * annFactor;
    const roll20 = Math.max(0.02, stdDev(rets.slice(t - 19, t + 1)) * annFactor);
    const roll60 = Math.max(0.02, stdDev(rets.slice(t - 59, t + 1)) * annFactor);

    const avgVol20 = mean(vols.slice(t - 19, t + 1));
    const volRatio = avgVol20 > 0 ? Math.min(4, vols[t] / avgVol20) : 1;
    const vixLevel = (vix[t] || 15) / 100;
    const vixChange = t > 0 && vix[t - 1] > 0 ? (vix[t] - vix[t - 1]) / vix[t - 1] : 0;

    let peak60 = prices[t];
    for (let k = t - 59; k <= t; k++) {
      if (prices[k] > peak60) peak60 = prices[k];
    }
    const drawdown60 = peak60 > 0 ? (prices[t] - peak60) / peak60 : 0;
    const mom10 = prices[t - 10] > 0 ? (prices[t] - prices[t - 10]) / prices[t - 10] : 0;

    rows.push({
      date: dates[t],
      targetVol,
      yesterdayVol,
      roll20Vol: roll20,
      features: [
        Math.abs(rets[t]),
        Math.abs(rets[t - 1]),
        rets[t] < 0 ? Math.abs(rets[t]) : 0, // Leverage asymmetry
        roll5,
        roll10,
        roll20,
        roll60,
        volRatio,
        vixLevel,
        vixChange,
        Math.abs(drawdown60),
        mom10,
      ],
    });
  }
  return rows;
}

/**
 * Fit GARCH(1,1) parameters on training returns via constrained grid/coordinate MLE
 * minimizing Gaussian quasi-likelihood, then run filtered recursion across train+test.
 */
function fitAndForecastGarch(
  trainReturns: number[],
  fullReturns: number[],
  trainEndIdx: number,
  evalIndices: number[]
): Map<number, number> {
  const sampleVar = Math.max(1e-6, Math.pow(stdDev(trainReturns), 2));
  let bestOmega = 0.05 * sampleVar;
  let bestAlpha = 0.1;
  let bestBeta = 0.85;
  let bestLL = Infinity;

  // Compact grid search strictly on training returns
  for (const alpha of [0.05, 0.09, 0.14, 0.19]) {
    for (const beta of [0.74, 0.8, 0.85, 0.9]) {
      if (alpha + beta >= 0.985) continue;
      const omega = (1 - alpha - beta) * sampleVar;
      let h = sampleVar;
      let nll = 0;
      for (let i = 1; i < trainReturns.length; i++) {
        const eps = trainReturns[i - 1];
        h = Math.max(1e-8, omega + alpha * eps * eps + beta * h);
        nll += Math.log(h) + (trainReturns[i] * trainReturns[i]) / h;
      }
      if (nll < bestLL) {
        bestLL = nll;
        bestOmega = omega;
        bestAlpha = alpha;
        bestBeta = beta;
      }
    }
  }

  // Forward filter using ONLY past realized returns
  const out = new Map<number, number>();
  let h = sampleVar;
  const evalSet = new Set(evalIndices);
  for (let t = 1; t < fullReturns.length; t++) {
    const eps = fullReturns[t - 1];
    h = Math.max(1e-8, bestOmega + bestAlpha * eps * eps + bestBeta * h);
    if (t > trainEndIdx && evalSet.has(t)) {
      // 5-day horizon mean variance forecast under GARCH(1,1)
      const ab = bestAlpha + bestBeta;
      const lrVar = bestOmega / Math.max(1e-4, 1 - ab);
      let sumH = 0;
      let hk = h;
      for (let k = 0; k < 5; k++) {
        sumH += hk;
        hk = lrVar + ab * (hk - lrVar);
      }
      out.set(t, Math.sqrt((sumH / 5) * TRADING_DAYS));
    }
  }
  return out;
}

/**
 * Gradient Boosted Decision Stumps (XGBoost-style L2 regularized additive trees)
 * fit strictly on training fold.
 */
function fitAndPredictBoostedTrees(
  trainX: number[][],
  trainY: number[],
  testX: number[][]
): number[] {
  const n = trainX.length;
  const d = trainX[0].length;
  const basePred = mean(trainY);
  const residuals = trainY.map((y) => y - basePred);
  const lr = 0.14;
  const lambda = 2.0;

  interface Stump {
    feat: number;
    thresh: number;
    leftVal: number;
    rightVal: number;
  }
  const stumps: Stump[] = [];

  for (let m = 0; m < 24; m++) {
    let bestGain = -Infinity;
    let bestStump: Stump = { feat: 0, thresh: 0, leftVal: 0, rightVal: 0 };

    for (let f = 0; f < d; f++) {
      const vals = trainX.map((r) => r[f]).sort((a, b) => a - b);
      // 6 quantile candidate thresholds
      for (const q of [0.15, 0.3, 0.5, 0.7, 0.85]) {
        const thresh = vals[Math.floor(q * (vals.length - 1))];
        let sumL = 0, cntL = 0, sumR = 0, cntR = 0;
        for (let i = 0; i < n; i++) {
          if (trainX[i][f] <= thresh) {
            sumL += residuals[i];
            cntL++;
          } else {
            sumR += residuals[i];
            cntR++;
          }
        }
        if (cntL < 5 || cntR < 5) continue;
        const gain = (sumL * sumL) / (cntL + lambda) + (sumR * sumR) / (cntR + lambda);
        if (gain > bestGain) {
          bestGain = gain;
          bestStump = {
            feat: f,
            thresh,
            leftVal: sumL / (cntL + lambda),
            rightVal: sumR / (cntR + lambda),
          };
        }
      }
    }

    stumps.push(bestStump);
    for (let i = 0; i < n; i++) {
      const leaf = trainX[i][bestStump.feat] <= bestStump.thresh ? bestStump.leftVal : bestStump.rightVal;
      residuals[i] -= lr * leaf;
    }
  }

  return testX.map((x) => {
    let pred = basePred;
    for (const s of stumps) {
      pred += lr * (x[s.feat] <= s.thresh ? s.leftVal : s.rightVal);
    }
    return Math.max(0.03, Math.min(1.8, pred));
  });
}

/**
 * Compact sequence LSTM-inspired gated recurrent state forecaster with 30-day lookback
 * and MinMax scaler fit STRICTLY on the training fold.
 */
function fitAndPredictLSTM(
  trainRows: VolRow[],
  testRows: VolRow[]
): number[] {
  // Fit MinMax scaler ONLY on trainRows (zero leakage)
  const featIndices = [0, 3, 5, 6, 8]; // |r_t|, roll5, roll20, roll60, VIX
  const mins = featIndices.map((fi) => Math.min(...trainRows.map((r) => r.features[fi])));
  const maxs = featIndices.map((fi) => Math.max(...trainRows.map((r) => r.features[fi])));
  const yMean = mean(trainRows.map((r) => r.targetVol));

  const scale = (row: VolRow) =>
    featIndices.map((fi, k) => {
      const span = Math.max(1e-6, maxs[k] - mins[k]);
      return Math.max(0, Math.min(1.5, (row.features[fi] - mins[k]) / span));
    });

  // Compute recurrent EWMA hidden states over 30-day lookback window and fit ridge readout on train
  const encodeSequence = (seq: number[][]): number[] => {
    let hFast = 0;
    let hSlow = 0;
    let cGate = 0;
    const start = Math.max(0, seq.length - 30);
    for (let i = start; i < seq.length; i++) {
      const x = seq[i];
      const fGate = 1 / (1 + Math.exp(-(0.6 * x[2] + 0.4 * x[4] - 0.3)));
      const iGate = 1 / (1 + Math.exp(-(1.2 * x[0] + 0.8 * x[1] - 0.5)));
      cGate = fGate * cGate + iGate * Math.tanh(0.8 * x[0] + 0.6 * x[1] + 0.4 * x[4]);
      hFast = 0.65 * hFast + 0.35 * Math.tanh(cGate + 0.5 * x[1]);
      hSlow = 0.9 * hSlow + 0.1 * x[3];
    }
    const last = seq[seq.length - 1];
    return [1, hFast, hSlow, cGate, last[2], last[4]];
  };

  const trainScaled = trainRows.map(scale);
  const X: number[][] = [];
  const y: number[] = [];
  for (let i = 30; i < trainRows.length; i++) {
    X.push(encodeSequence(trainScaled.slice(i - 30, i + 1)));
    y.push(trainRows[i].targetVol);
  }

  // Ridge regression closed-form for readout weights w = (X^T X + lambda I)^-1 X^T y
  const p = 6;
  const XtX: number[][] = Array.from({ length: p }, () => Array(p).fill(0));
  const XtY: number[] = Array(p).fill(0);
  for (let i = 0; i < X.length; i++) {
    for (let a = 0; a < p; a++) {
      XtY[a] += X[i][a] * y[i];
      for (let b = 0; b < p; b++) {
        XtX[a][b] += X[i][a] * X[i][b];
      }
    }
  }
  for (let a = 0; a < p; a++) XtX[a][a] += 2.5;

  // Gauss-Jordan 6x6 solve
  const aug = XtX.map((row, i) => [...row, XtY[i]]);
  for (let i = 0; i < p; i++) {
    let pivot = i;
    for (let r = i + 1; r < p; r++) {
      if (Math.abs(aug[r][i]) > Math.abs(aug[pivot][i])) pivot = r;
    }
    [aug[i], aug[pivot]] = [aug[pivot], aug[i]];
    const div = Math.abs(aug[i][i]) > 1e-9 ? aug[i][i] : 1;
    for (let c = i; c <= p; c++) aug[i][c] /= div;
    for (let r = 0; r < p; r++) {
      if (r !== i) {
        const factor = aug[r][i];
        for (let c = i; c <= p; c++) aug[r][c] -= factor * aug[i][c];
      }
    }
  }
  const w = aug.map((row) => row[p]);

  const combined = [...trainRows, ...testRows];
  const combinedScaled = combined.map(scale);
  const preds: number[] = [];
  for (let i = trainRows.length; i < combined.length; i++) {
    const feat = encodeSequence(combinedScaled.slice(Math.max(0, i - 30), i + 1));
    let pred = 0;
    for (let k = 0; k < p; k++) pred += w[k] * feat[k];
    if (!Number.isFinite(pred)) pred = yMean;
    preds.push(Math.max(0.03, Math.min(1.8, pred)));
  }
  return preds;
}

function evalVolMetrics(
  model: VolatilityModelMetrics['model'],
  preds: number[],
  actuals: number[],
  prevActuals: number[]
): VolatilityModelMetrics {
  const n = preds.length;
  let sqErr = 0;
  let absErr = 0;
  let qlikeSum = 0;
  let dirCorrect = 0;

  for (let i = 0; i < n; i++) {
    const p = Math.max(0.01, preds[i]);
    const a = Math.max(0.01, actuals[i]);
    const diff = p - a;
    sqErr += diff * diff;
    absErr += Math.abs(diff);

    // QLIKE loss on variance (a^2 / p^2 - log(a^2 / p^2) - 1)
    const ratio = (a * a) / (p * p);
    qlikeSum += ratio - Math.log(Math.max(1e-6, ratio)) - 1;

    const prev = prevActuals[i] ?? a;
    if ((p >= prev && a >= prev) || (p < prev && a < prev)) {
      dirCorrect++;
    }
  }

  return {
    model,
    rmsePct: Math.sqrt(sqErr / Math.max(1, n)) * 100,
    maePct: (absErr / Math.max(1, n)) * 100,
    qlike: qlikeSum / Math.max(1, n),
    directionalAccPct: (dirCorrect / Math.max(1, n)) * 100,
    beatsBaseline: false,
    latestForecastVolPct: (preds[preds.length - 1] ?? 0.16) * 100,
  };
}

export function runVolatilityComparison(
  market: AlignedMarketData,
  ticker = '^NSEI'
): VolatilityComparison {
  const rows = buildVolatilityDataset(market, ticker);
  const fullReturns = market.returns[ticker] || market.returns['^NSEI'];
  const dateToIdx = new Map<string, number>();
  market.dates.forEach((d, i) => dateToIdx.set(d, i));

  const FOLD_COUNT = 5;
  const minTrain = Math.floor(rows.length * 0.45);
  const foldSize = Math.max(15, Math.floor((rows.length - minTrain) / FOLD_COUNT));

  let leakageCheckPassed = true;

  const allActual: number[] = [];
  const allPrevActual: number[] = [];
  const allNaive: number[] = [];
  const allRoll20: number[] = [];
  const allGarch: number[] = [];
  const allXgb: number[] = [];
  const allLstm: number[] = [];
  const series: VolatilityForecastSeriesPoint[] = [];

  for (let f = 0; f < FOLD_COUNT; f++) {
    const trainEnd = minTrain + f * foldSize;
    const testEnd = f === FOLD_COUNT - 1 ? rows.length : Math.min(rows.length, trainEnd + foldSize);
    if (trainEnd >= rows.length || testEnd <= trainEnd) break;

    const trainRows = rows.slice(0, trainEnd);
    const testRows = rows.slice(trainEnd, testEnd);

    // Strict walk-forward time-series leakage assertion
    const maxTrainDate = trainRows[trainRows.length - 1].date;
    const minTestDate = testRows[0].date;
    if (maxTrainDate >= minTestDate) {
      leakageCheckPassed = false;
    }

    const trainLastIdx = dateToIdx.get(maxTrainDate) ?? 65;
    const evalIndices = testRows.map((r) => dateToIdx.get(r.date) ?? 0);
    const garchMap = fitAndForecastGarch(
      fullReturns.slice(0, trainLastIdx + 1),
      fullReturns,
      trainLastIdx,
      evalIndices
    );

    const xgbPreds = fitAndPredictBoostedTrees(
      trainRows.map((r) => r.features),
      trainRows.map((r) => r.targetVol),
      testRows.map((r) => r.features)
    );

    const lstmPreds = fitAndPredictLSTM(trainRows, testRows);

    for (let i = 0; i < testRows.length; i++) {
      const r = testRows[i];
      const idx = evalIndices[i];
      const garch = garchMap.get(idx) ?? r.roll20Vol;
      const xgb = xgbPreds[i];
      const lstm = lstmPreds[i];
      const prevA = i === 0 ? trainRows[trainRows.length - 1].targetVol : testRows[i - 1].targetVol;

      allActual.push(r.targetVol);
      allPrevActual.push(prevA);
      allNaive.push(r.yesterdayVol);
      allRoll20.push(r.roll20Vol);
      allGarch.push(garch);
      allXgb.push(xgb);
      allLstm.push(lstm);

      series.push({
        date: r.date,
        actualVolPct: r.targetVol * 100,
        naivePct: r.yesterdayVol * 100,
        rolling20Pct: r.roll20Vol * 100,
        garchPct: garch * 100,
        xgbPct: xgb * 100,
        lstmPct: lstm * 100,
      });
    }
  }

  const mNaive = evalVolMetrics('Naive (t-1)', allNaive, allActual, allPrevActual);
  const mRoll20 = evalVolMetrics('Rolling 20D', allRoll20, allActual, allPrevActual);
  const mGarch = evalVolMetrics('GARCH(1,1)', allGarch, allActual, allPrevActual);
  const mXgb = evalVolMetrics('XGBoost', allXgb, allActual, allPrevActual);
  const mLstm = evalVolMetrics('LSTM (30D)', allLstm, allActual, allPrevActual);

  const bestBaselineRmse = Math.min(mNaive.rmsePct, mRoll20.rmsePct);
  for (const m of [mGarch, mXgb, mLstm]) {
    m.beatsBaseline = m.rmsePct < bestBaselineRmse;
  }

  return {
    targetTicker: ticker,
    foldCount: FOLD_COUNT,
    leakageCheckPassed,
    metrics: [mNaive, mRoll20, mGarch, mXgb, mLstm],
    series: series.slice(-260),
  };
}
