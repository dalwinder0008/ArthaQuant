export type AssetClass = 'Equity' | 'Gold' | 'Crypto' | 'REIT' | 'Safe';
export type Currency = 'INR' | 'USD';
export type RiskBucket = 'High Growth' | 'Core Equity' | 'Hedge & Income' | 'Capital Preservation' | 'Illiquid Real Asset';
export type MarketRegime = 'Bull' | 'Bear' | 'Sideways';

export interface AssetMeta {
  ticker: string;
  name: string;
  shortName: string;
  assetClass: AssetClass;
  currency: Currency;
  riskBucket: RiskBucket;
  isBenchmarkOrIndicator?: boolean;
  coingeckoId?: string;
  newsQuery: string;
}

export interface PriceBar {
  date: string; // YYYY-MM-DD
  open: number;
  high: number;
  low: number;
  close: number;
  adjClose: number;
  volume: number;
}

export interface RawMarketPayload {
  fetchedAt: string;
  sourceMode: 'live' | 'partial-fallback' | 'cached-fallback';
  staleReason?: string;
  fxUsdinr: number;
  series: Record<string, PriceBar[]>;
  liveQuotes: Record<string, { priceNative: number; changePct1d: number; source: string }>;
}

export interface AlignedMarketData {
  dates: string[];
  pricesInr: Record<string, number[]>;
  returns: Record<string, number[]>;
  highsInr: Record<string, number[]>;
  lowsInr: Record<string, number[]>;
  volumes: Record<string, number[]>;
  usdinr: number[];
  indiaVix: number[];
  latestPriceInr: Record<string, number>;
  changePct1d: Record<string, number>;
}

export interface Holding {
  id: string;
  userId: string;
  ticker: string;
  name: string;
  assetClass: AssetClass;
  currency: Currency;
  quantity: number;
  buyPrice: number; // In asset native currency or INR (stored in INR cost basis for consistency)
  buyDate: string; // YYYY-MM-DD
  notes?: string;
}

export interface ManualAsset {
  id: string;
  userId: string;
  name: string;
  category: 'Residential Real Estate' | 'Commercial Real Estate' | 'Land / Plot' | 'Other Real Asset';
  currentValue: number; // INR
  purchaseValue: number; // INR
  growthPct: number; // Expected annual appreciation %
  rentalYieldPct: number; // Annual rental yield %
  asOfDate: string;
}

export interface ValuedHolding extends Holding {
  latestPriceInr: number;
  currentValueInr: number;
  investedValueInr: number;
  pnlInr: number;
  pnlPct: number;
  dayChangeInr: number;
  dayChangePct: number;
  weightPct: number;
  marketWeightPct: number; // Weight within liquid market holdings
}

export interface AllocationSlice {
  label: string;
  valueInr: number;
  pct: number;
  color: string;
}

export interface PortfolioSummary {
  totalValueInr: number;
  liquidValueInr: number;
  manualRealEstateInr: number;
  totalInvestedInr: number;
  unrealizedPnlInr: number;
  unrealizedPnlPct: number;
  dayChangeInr: number;
  dayChangePct: number;
  xirrPct: number | null;
  valuedHoldings: ValuedHolding[];
  byAssetClass: AllocationSlice[];
  byCurrency: AllocationSlice[];
  byRiskBucket: AllocationSlice[];
}

export interface RiskMetrics {
  annualizedReturnPct: number;
  annualizedVolPct: number;
  weightedAvgVolPct: number; // Naive sum(w_i * sigma_i) to contrast against sqrt(w' Sigma w)
  diversificationBenefitPct: number;
  sharpeRatio: number;
  sortinoRatio: number;
  maxDrawdownPct: number;
  maxDrawdownPeakDate: string;
  maxDrawdownTroughDate: string;
  maxDrawdownDurationDays: number;
  calmarRatio: number;
  historicalVar95Pct: number;
  parametricVar95Pct: number;
  monteCarloVar95Pct: number;
  cvar95Pct: number;
  betaVsNifty: number;
  riskContributions: Array<{
    ticker: string;
    name: string;
    assetClass: AssetClass;
    capitalWeightPct: number;
    riskContributionPct: number;
    standaloneVolPct: number;
  }>;
  drawdownSeries: Array<{ date: string; portfolioDdPct: number; niftyDdPct: number; equityIndex: number; niftyIndex: number }>;
  benchmarkComparison: Array<{
    label: string;
    annualReturnPct: number;
    annualVolPct: number;
    sharpe: number;
    maxDrawdownPct: number;
    var95Pct: number;
  }>;
}

export interface CorrelationPair {
  a: string;
  b: string;
  pearson: number;
  spearman: number;
  label: 'Strongly Positive' | 'Moderately Positive' | 'Low / Uncorrelated' | 'Negative Hedge';
}

export interface HedgeCandidate {
  ticker: string;
  name: string;
  assetClass: AssetClass;
  corrToPortfolio: number;
  crisisCorrToPortfolio: number;
  label: string;
  heldWeightPct: number;
}

export interface CorrelationReport {
  tickers: string[];
  clusteredOrder: string[];
  pearsonMatrix: number[][];
  spearmanMatrix: number[][];
  effectiveNumBets: number;
  avgPairwiseCorr: number;
  diversificationScore: number; // 0 to 100
  concentrationWarning: string | null;
  calmAvgCorr: number;
  crisis2020AvgCorr: number;
  crisis2022AvgCorr: number;
  rollingPairs: Record<string, Array<{ date: string; corr: number }>>;
  bestHedges: HedgeCandidate[];
  dendrogramMerges: Array<{ left: string; right: string; distance: number }>;
}

export interface VolatilityModelMetrics {
  model: 'Naive (t-1)' | 'Rolling 20D' | 'GARCH(1,1)' | 'XGBoost' | 'LSTM (30D)';
  rmsePct: number;
  maePct: number;
  qlike: number;
  directionalAccPct: number;
  beatsBaseline: boolean;
  latestForecastVolPct: number;
}

export interface VolatilityForecastSeriesPoint {
  date: string;
  actualVolPct: number;
  naivePct: number;
  rolling20Pct: number;
  garchPct: number;
  xgbPct: number;
  lstmPct: number;
}

export interface VolatilityComparison {
  targetTicker: string;
  foldCount: number;
  leakageCheckPassed: boolean;
  metrics: VolatilityModelMetrics[];
  series: VolatilityForecastSeriesPoint[];
}

export interface RegimeReport {
  currentRegime: MarketRegime;
  probabilities: Record<MarketRegime, number>;
  bicComparison: Array<{ states: number; bic: number; selected: boolean }>;
  transitionMatrix: number[][]; // Order: Bull, Sideways, Bear
  stateLabels: [MarketRegime, MarketRegime, MarketRegime];
  stateStats: Array<{ regime: MarketRegime; annReturnPct: number; annVolPct: number; occupancyPct: number }>;
  timeline: Array<{ date: string; niftyClose: number; regime: MarketRegime; probBull: number; probSideways: number; probBear: number }>;
}

export interface SentimentItem {
  id: string;
  ticker: string;
  assetName: string;
  publishedAt: string;
  headline: string;
  source: string;
  url?: string;
  probPos: number;
  probNeg: number;
  probNeu: number;
  score: number; // P(pos) - P(neg)
  label: 'Positive' | 'Negative' | 'Neutral';
}

export interface SentimentSummary {
  items: SentimentItem[];
  perAsset: Array<{
    ticker: string;
    name: string;
    meanScore: number;
    headlineCount: number;
    leadLagCorr: number;
    predictiveNote: string;
  }>;
  sourceNote: string;
}

export interface AnomalyItem {
  date: string;
  ticker: string;
  name: string;
  assetClass: AssetClass;
  dailyReturnPct: number;
  volumeZScore: number;
  intradayRangePct: number;
  anomalyScore: number; // Higher = more anomalous
  isHeld: boolean;
  reason: string;
}

export interface OptimizationConstraints {
  maxCryptoPct: number;
  minGoldPct: number;
  minSafePct: number;
  maxSingleAssetPct: number;
  riskFreeRatePct: number;
  regimeAware: boolean;
}

export interface RebalanceTrade {
  ticker: string;
  name: string;
  assetClass: AssetClass;
  currentWeightPct: number;
  targetWeightPct: number;
  deltaWeightPct: number;
  currentValueInr: number;
  targetValueInr: number;
  deltaInr: number;
  action: 'BUY' | 'SELL' | 'HOLD';
  estimatedUnits: number;
  txCostInr: number;
}

export interface FrontierPoint {
  expectedReturnPct: number;
  volatilityPct: number;
  sharpe: number;
  weights: Record<string, number>;
}

export interface OptimizationResult {
  tickers: string[];
  appliedConstraints: OptimizationConstraints;
  currentPoint: FrontierPoint;
  minVariancePoint: FrontierPoint;
  maxSharpePoint: FrontierPoint;
  riskParityPoint: FrontierPoint;
  recommendedPoint: FrontierPoint;
  frontier: FrontierPoint[];
  trades: RebalanceTrade[];
  totalTurnoverInr: number;
  totalTxCostInr: number;
}

export interface BacktestStrategyResult {
  name: 'Buy & Hold Current' | 'Equal Weight (1/N)' | 'Markowitz Quarterly' | 'Regime-Adjusted' | 'Nifty 50 Benchmark';
  cagrPct: number;
  annualVolPct: number;
  sharpe: number;
  sortino: number;
  maxDrawdownPct: number;
  calmar: number;
  annualTurnoverPct: number;
  totalTxCostPct: number;
  finalValueOn100: number;
}

export interface BacktestResult {
  dates: string[];
  strategies: BacktestStrategyResult[];
  curves: Array<{
    date: string;
    buyHold: number;
    equalWeight: number;
    markowitz: number;
    regimeAdjusted: number;
    nifty: number;
    buyHoldDd: number;
    markowitzDd: number;
    regimeAdjustedDd: number;
  }>;
}

export type AlertRuleType =
  | 'CRYPTO_WEIGHT_MAX'
  | 'ASSET_WEIGHT_MAX'
  | 'PORTFOLIO_VOL_MAX'
  | 'REGIME_BEAR'
  | 'ANOMALY_HELD'
  | 'CORRELATION_SPIKE';

export interface AlertRule {
  id: string;
  userId: string;
  ruleType: AlertRuleType;
  target: string;
  threshold: number;
  active: boolean;
}

export interface TriggeredAlert {
  id: string;
  ruleId: string;
  severity: 'High' | 'Warning' | 'Info';
  title: string;
  detail: string;
  metricValue: string;
}
