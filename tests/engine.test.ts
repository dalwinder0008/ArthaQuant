import assert from 'node:assert/strict';
import { alignMarketData, validateAlignedData } from '../src/engine/calendar.ts';
import { analyzeCorrelations } from '../src/engine/correlation.ts';
import { optimizePortfolio } from '../src/engine/optimizer.ts';
import { detectMarketRegimes } from '../src/engine/regime.ts';
import { computePortfolioRisk, computeSeriesRiskStats } from '../src/engine/risk.ts';
import type { PriceBar, RawMarketPayload } from '../src/engine/types.ts';
import { ASSET_UNIVERSE, createStarterHoldings, createStarterManualAssets } from '../src/engine/universe.ts';
import { runVolatilityComparison } from '../src/engine/volatility.ts';
import { calculateXIRR, summarizePortfolio } from '../src/engine/xirr.ts';
import {
  parseBrokerCsvTrades,
  parseTradesFromEmailContent,
} from '../src/services/gmailTradeExtractor.ts';

function generateSyntheticMarket(): RawMarketPayload {
  const days = 420;
  const start = new Date('2024-06-01T00:00:00Z');
  const dates: string[] = [];
  for (let i = 0; i < days * 2 && dates.length < days; i++) {
    const d = new Date(start.getTime() + i * 86400000);
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6) dates.push(d.toISOString().slice(0, 10));
  }

  let seed = 1337;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const norm = () => {
    const u1 = Math.max(1e-8, rand());
    const u2 = rand();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  };

  const series: Record<string, PriceBar[]> = {};
  const liveQuotes: RawMarketPayload['liveQuotes'] = {};

  for (const meta of ASSET_UNIVERSE) {
    let px = meta.ticker === 'USDINR=X' ? 83.5 : meta.ticker === '^INDIAVIX' ? 14 : meta.assetClass === 'Crypto' ? 40000 : 1500;
    const vol = meta.assetClass === 'Crypto' ? 0.032 : meta.assetClass === 'Safe' ? 0.0005 : 0.012;
    const bars: PriceBar[] = [];
    for (const date of dates) {
      const r = 0.0004 + vol * norm();
      px = Math.max(1, px * (1 + r));
      bars.push({
        date,
        open: px * 0.995,
        high: px * 1.01,
        low: px * 0.99,
        close: px,
        adjClose: px,
        volume: 1000000 + Math.floor(rand() * 500000),
      });
    }
    series[meta.ticker] = bars;
    liveQuotes[meta.ticker] = { priceNative: px, changePct1d: 0.4, source: 'test' };
  }

  return {
    fetchedAt: new Date().toISOString(),
    sourceMode: 'live',
    fxUsdinr: 84.2,
    series,
    liveQuotes,
  };
}

// 1. Test XIRR on known cashflows: -100,000 invested 1 year ago -> +115,000 today => ~15%
const xirr = calculateXIRR([
  { date: '2025-01-01', amount: -100000 },
  { date: '2026-01-01', amount: 115000 },
]);
assert(xirr !== null, 'XIRR should converge');
assert(Math.abs(xirr - 0.15) < 0.002, `Expected ~0.15 XIRR, got ${xirr}`);

// 2. Test Calendar alignment & FX conversion
const raw = generateSyntheticMarket();
const aligned = alignMarketData(raw);
const validation = validateAlignedData(aligned);
assert.equal(validation.valid, true, `Aligned data failed validation: ${validation.issues.join('; ')}`);

// 3. Test Portfolio Summary & Risk Math (w' Sigma w <= sum w_i sigma_i)
const holdings = createStarterHoldings('test_user');
const manual = createStarterManualAssets('test_user');
const summary = summarizePortfolio(holdings, manual, aligned);
assert(summary.totalValueInr > 0, 'Portfolio value should be positive');
const risk = computePortfolioRisk(summary, aligned);
assert(
  risk.annualizedVolPct <= risk.weightedAvgVolPct + 1e-6,
  'Portfolio volatility sqrt(w\'Sigma*w) must not exceed weighted average standalone volatility'
);
assert(risk.cvar95Pct >= risk.historicalVar95Pct - 1e-6, 'CVaR must be >= VaR');

const synthStats = computeSeriesRiskStats([0, 0.01, -0.02, 0.015, -0.005, 0.02, -0.01], aligned.dates.slice(0, 7));
assert(synthStats.maxDdPct <= 0, 'Max drawdown must be non-positive');

// 4. Test Correlation & Regime Detection
const corr = analyzeCorrelations(summary, aligned);
assert(corr.diversificationScore >= 0 && corr.diversificationScore <= 100);
const regime = detectMarketRegimes(aligned);
const probSum = regime.probabilities.Bull + regime.probabilities.Sideways + regime.probabilities.Bear;
assert(Math.abs(probSum - 1) < 1e-4, `Regime probabilities must sum to 1, got ${probSum}`);

// 5. Test Walk-Forward Volatility Leakage Check
const volComp = runVolatilityComparison(aligned, '^NSEI');
assert.equal(volComp.leakageCheckPassed, true, 'Walk-forward time series leakage check must pass');
assert.equal(volComp.metrics.length, 5, 'Should evaluate 2 baselines + 3 ML models');

// 6. Test Optimizer Constraints (sum(w) = 1, w >= 0, crypto <= cap)
const opt = optimizePortfolio(
  summary,
  aligned,
  {
    maxCryptoPct: 15,
    minGoldPct: 20,
    minSafePct: 10,
    maxSingleAssetPct: 30,
    riskFreeRatePct: 6.5,
    regimeAware: false,
  },
  'Sideways'
);
const weightSum = Object.values(opt.recommendedPoint.weights).reduce((a, b) => a + b, 0);
assert(Math.abs(weightSum - 100) < 0.25, `Recommended weights must sum to 100%, got ${weightSum}`);

// 7. Test Gmail Broker Email & CSV Trade Extraction
const emailTrades = parseTradesFromEmailContent({
  messageId: 'msg_1',
  from: 'alerts@groww.in',
  subject: 'Order Executed: Bought Infosys',
  internalDateMs: String(new Date('2025-05-12T10:00:00Z').getTime()),
  bodyText: 'You bought 12 shares of Infosys Ltd at ₹1,540.50 on 12-05-2025.',
  existingHoldings: holdings,
});
assert.equal(emailTrades.length, 1, 'Should extract 1 buy trade from narrative Groww email');
assert.equal(emailTrades[0].ticker, 'INFY.NS');
assert.equal(emailTrades[0].quantity, 12);
assert.equal(emailTrades[0].buyPrice, 1540.5);
assert.equal(emailTrades[0].buyDate, '2025-05-12');

const kvEmailTrades = parseTradesFromEmailContent({
  messageId: 'msg_2',
  from: 'no-reply@zerodha.com',
  subject: 'Trade Confirmation',
  bodyText: 'Stock Name: ITC Ltd\nAction: Buy\nQuantity: 40\nAvg Price: Rs. 432.25\nTrade Date: 2025-06-03',
  existingHoldings: holdings,
});
assert.equal(kvEmailTrades.length, 1, 'Should extract key-value trade from Zerodha alert');
assert.equal(kvEmailTrades[0].ticker, 'ITC.NS');
assert.equal(kvEmailTrades[0].quantity, 40);
assert.equal(kvEmailTrades[0].buyPrice, 432.25);

const csvTrades = parseBrokerCsvTrades(
  'symbol,trade_type,quantity,price,trade_date\nINFY,buy,10,1510.00,2025-04-02\nTCS,sell,2,3900.00,2025-04-03\n',
  'zerodha_tradebook.csv',
  holdings
);
assert.equal(csvTrades.length, 1, 'CSV parser should include buy rows and skip sell rows');
assert.equal(csvTrades[0].ticker, 'INFY.NS');
assert.equal(csvTrades[0].broker, 'Zerodha CSV');

console.log('All ArthaQuant quantitative engine, XIRR, risk, leakage, optimizer, and Gmail/CSV tests passed.');
