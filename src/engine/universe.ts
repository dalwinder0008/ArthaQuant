import type { AlertRule, AssetClass, AssetMeta, Holding, ManualAsset } from './types.ts';

export const ASSET_CLASS_COLORS: Record<AssetClass | 'Real Estate', string> = {
  Equity: '#1D4ED8',
  Gold: '#D97706',
  Crypto: '#7C3AED',
  REIT: '#0D9488',
  Safe: '#475569',
  'Real Estate': '#B45309',
};

export const ASSET_UNIVERSE: AssetMeta[] = [
  // Indian Equities
  { ticker: 'RELIANCE.NS', name: 'Reliance Industries Ltd', shortName: 'RELIANCE', assetClass: 'Equity', currency: 'INR', riskBucket: 'Core Equity', newsQuery: 'Reliance Industries stock India' },
  { ticker: 'TCS.NS', name: 'Tata Consultancy Services', shortName: 'TCS', assetClass: 'Equity', currency: 'INR', riskBucket: 'Core Equity', newsQuery: 'TCS stock India IT' },
  { ticker: 'HDFCBANK.NS', name: 'HDFC Bank Ltd', shortName: 'HDFCBANK', assetClass: 'Equity', currency: 'INR', riskBucket: 'Core Equity', newsQuery: 'HDFC Bank stock India' },
  { ticker: 'INFY.NS', name: 'Infosys Ltd', shortName: 'INFY', assetClass: 'Equity', currency: 'INR', riskBucket: 'Core Equity', newsQuery: 'Infosys stock India' },
  { ticker: 'ICICIBANK.NS', name: 'ICICI Bank Ltd', shortName: 'ICICIBANK', assetClass: 'Equity', currency: 'INR', riskBucket: 'Core Equity', newsQuery: 'ICICI Bank stock India' },
  { ticker: 'ITC.NS', name: 'ITC Ltd', shortName: 'ITC', assetClass: 'Equity', currency: 'INR', riskBucket: 'Core Equity', newsQuery: 'ITC stock India' },
  { ticker: 'LT.NS', name: 'Larsen & Toubro Ltd', shortName: 'LT', assetClass: 'Equity', currency: 'INR', riskBucket: 'Core Equity', newsQuery: 'Larsen Toubro stock India' },

  // Gold & Precious Metals
  { ticker: 'GOLDBEES.NS', name: 'Nippon India ETF Gold BeES', shortName: 'GOLDBEES', assetClass: 'Gold', currency: 'INR', riskBucket: 'Hedge & Income', newsQuery: 'Gold price India ETF' },
  { ticker: 'GC=F', name: 'COMEX Gold Futures (INR eq.)', shortName: 'GOLD FUT', assetClass: 'Gold', currency: 'USD', riskBucket: 'Hedge & Income', newsQuery: 'Gold futures bullion price' },
  { ticker: 'SILVERBEES.NS', name: 'Nippon India Silver ETF', shortName: 'SILVERBEES', assetClass: 'Gold', currency: 'INR', riskBucket: 'Hedge & Income', newsQuery: 'Silver price India ETF' },

  // Crypto (USD priced, converted via USDINR)
  { ticker: 'BTC-USD', name: 'Bitcoin', shortName: 'BTC', assetClass: 'Crypto', currency: 'USD', riskBucket: 'High Growth', coingeckoId: 'bitcoin', newsQuery: 'Bitcoin crypto market' },
  { ticker: 'ETH-USD', name: 'Ethereum', shortName: 'ETH', assetClass: 'Crypto', currency: 'USD', riskBucket: 'High Growth', coingeckoId: 'ethereum', newsQuery: 'Ethereum crypto market' },
  { ticker: 'SOL-USD', name: 'Solana', shortName: 'SOL', assetClass: 'Crypto', currency: 'USD', riskBucket: 'High Growth', coingeckoId: 'solana', newsQuery: 'Solana crypto' },
  { ticker: 'BNB-USD', name: 'BNB', shortName: 'BNB', assetClass: 'Crypto', currency: 'USD', riskBucket: 'High Growth', coingeckoId: 'binancecoin', newsQuery: 'BNB crypto' },

  // REITs
  { ticker: 'EMBASSY.NS', name: 'Embassy Office Parks REIT', shortName: 'EMBASSY', assetClass: 'REIT', currency: 'INR', riskBucket: 'Hedge & Income', newsQuery: 'Embassy REIT India' },
  { ticker: 'MINDSPACE.NS', name: 'Mindspace Business Parks REIT', shortName: 'MINDSPACE', assetClass: 'REIT', currency: 'INR', riskBucket: 'Hedge & Income', newsQuery: 'Mindspace REIT India' },

  // Safe Liquid Asset
  { ticker: 'LIQUIDBEES.NS', name: 'Nippon India ETF Liquid BeES', shortName: 'LIQUIDBEES', assetClass: 'Safe', currency: 'INR', riskBucket: 'Capital Preservation', newsQuery: 'India liquid ETF RBI rates' },

  // Benchmarks & Market Indicators
  { ticker: '^NSEI', name: 'NIFTY 50 Index', shortName: 'NIFTY 50', assetClass: 'Equity', currency: 'INR', riskBucket: 'Core Equity', isBenchmarkOrIndicator: true, newsQuery: 'Nifty 50 Indian stock market' },
  { ticker: '^NSEBANK', name: 'NIFTY Bank Index', shortName: 'BANKNIFTY', assetClass: 'Equity', currency: 'INR', riskBucket: 'Core Equity', isBenchmarkOrIndicator: true, newsQuery: 'Bank Nifty India' },
  { ticker: '^INDIAVIX', name: 'India VIX Volatility Index', shortName: 'INDIA VIX', assetClass: 'Safe', currency: 'INR', riskBucket: 'Capital Preservation', isBenchmarkOrIndicator: true, newsQuery: 'India VIX volatility' },
  { ticker: 'USDINR=X', name: 'USD / INR Exchange Rate', shortName: 'USD/INR', assetClass: 'Safe', currency: 'INR', riskBucket: 'Capital Preservation', isBenchmarkOrIndicator: true, newsQuery: 'USD INR rupee exchange rate' },
];

export const INVESTABLE_ASSETS = ASSET_UNIVERSE.filter((a) => !a.isBenchmarkOrIndicator);

export function getAssetMeta(ticker: string): AssetMeta | undefined {
  return ASSET_UNIVERSE.find((a) => a.ticker === ticker);
}

export function createStarterHoldings(userId: string): Holding[] {
  return [
    {
      id: 'h_reliance',
      userId,
      ticker: 'RELIANCE.NS',
      name: 'Reliance Industries Ltd',
      assetClass: 'Equity',
      currency: 'INR',
      quantity: 85,
      buyPrice: 1210,
      buyDate: '2023-06-15',
      notes: 'Core large-cap energy & telecom holding',
    },
    {
      id: 'h_hdfcbank',
      userId,
      ticker: 'HDFCBANK.NS',
      name: 'HDFC Bank Ltd',
      assetClass: 'Equity',
      currency: 'INR',
      quantity: 55,
      buyPrice: 1580,
      buyDate: '2023-08-21',
      notes: 'Private banking anchor',
    },
    {
      id: 'h_tcs',
      userId,
      ticker: 'TCS.NS',
      name: 'Tata Consultancy Services',
      assetClass: 'Equity',
      currency: 'INR',
      quantity: 22,
      buyPrice: 3480,
      buyDate: '2023-11-10',
      notes: 'IT services export hedge',
    },
    {
      id: 'h_goldbees',
      userId,
      ticker: 'GOLDBEES.NS',
      name: 'Nippon India ETF Gold BeES',
      assetClass: 'Gold',
      currency: 'INR',
      quantity: 1450,
      buyPrice: 52.4,
      buyDate: '2023-04-05',
      notes: 'Macro & crisis drawdown hedge',
    },
    {
      id: 'h_btc',
      userId,
      ticker: 'BTC-USD',
      name: 'Bitcoin',
      assetClass: 'Crypto',
      currency: 'USD',
      quantity: 0.022,
      buyPrice: 3650000, // INR cost basis per BTC at purchase
      buyDate: '2024-01-18',
      notes: 'High-beta digital asset exposure',
    },
    {
      id: 'h_eth',
      userId,
      ticker: 'ETH-USD',
      name: 'Ethereum',
      assetClass: 'Crypto',
      currency: 'USD',
      quantity: 0.24,
      buyPrice: 215000, // INR cost basis per ETH at purchase
      buyDate: '2024-02-09',
      notes: 'Smart contract layer-1 allocation',
    },
    {
      id: 'h_embassy',
      userId,
      ticker: 'EMBASSY.NS',
      name: 'Embassy Office Parks REIT',
      assetClass: 'REIT',
      currency: 'INR',
      quantity: 210,
      buyPrice: 332,
      buyDate: '2023-09-14',
      notes: 'Commercial office yield',
    },
    {
      id: 'h_liquid',
      userId,
      ticker: 'LIQUIDBEES.NS',
      name: 'Nippon India ETF Liquid BeES',
      assetClass: 'Safe',
      currency: 'INR',
      quantity: 55,
      buyPrice: 1000,
      buyDate: '2024-03-01',
      notes: 'Dry powder & stability buffer',
    },
  ];
}

export function createStarterManualAssets(userId: string): ManualAsset[] {
  return [
    {
      id: 're_pune_apt',
      userId,
      name: 'Pune 2BHK Residential Flat',
      category: 'Residential Real Estate',
      currentValue: 450000, // Fractional personal equity share or downpayment equity in INR
      purchaseValue: 385000,
      growthPct: 7.2,
      rentalYieldPct: 3.1,
      asOfDate: '2026-10-01',
    },
  ];
}

export function createStarterAlerts(userId: string): AlertRule[] {
  return [
    {
      id: 'al_crypto_cap',
      userId,
      ruleType: 'CRYPTO_WEIGHT_MAX',
      target: 'Crypto',
      threshold: 20,
      active: true,
    },
    {
      id: 'al_vol_cap',
      userId,
      ruleType: 'PORTFOLIO_VOL_MAX',
      target: 'Portfolio Volatility',
      threshold: 18,
      active: true,
    },
    {
      id: 'al_regime_bear',
      userId,
      ruleType: 'REGIME_BEAR',
      target: 'NIFTY 50 HMM',
      threshold: 60,
      active: true,
    },
    {
      id: 'al_anomaly_held',
      userId,
      ruleType: 'ANOMALY_HELD',
      target: 'Held Assets',
      threshold: 2.0,
      active: true,
    },
    {
      id: 'al_corr_spike',
      userId,
      ruleType: 'CORRELATION_SPIKE',
      target: 'BTC-USD vs ^NSEI',
      threshold: 0.55,
      active: true,
    },
  ];
}
