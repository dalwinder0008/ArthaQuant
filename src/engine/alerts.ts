import type {
  AlertRule,
  AnomalyItem,
  BacktestResult,
  CorrelationReport,
  OptimizationResult,
  PortfolioSummary,
  RegimeReport,
  RiskMetrics,
  TriggeredAlert,
} from './types.ts';

export function formatINR(value: number, compact = false): string {
  if (!Number.isFinite(value)) return '₹0';
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  if (compact) {
    if (abs >= 1e7) return `${sign}₹${(abs / 1e7).toFixed(2)} Cr`;
    if (abs >= 1e5) return `${sign}₹${(abs / 1e5).toFixed(2)} L`;
    if (abs >= 1e3) return `${sign}₹${(abs / 1e3).toFixed(1)}K`;
  }
  return `${sign}₹${abs.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

export function formatPct(val: number | null | undefined, digits = 2, showSign = false): string {
  if (val === null || val === undefined || !Number.isFinite(val)) return '—';
  const sign = showSign && val > 0 ? '+' : '';
  return `${sign}${val.toFixed(digits)}%`;
}

export function evaluateAlerts(
  rules: AlertRule[],
  summary: PortfolioSummary,
  risk: RiskMetrics,
  regime: RegimeReport,
  correlation: CorrelationReport,
  anomalies: AnomalyItem[]
): TriggeredAlert[] {
  const triggered: TriggeredAlert[] = [];

  for (const rule of rules) {
    if (!rule.active) continue;

    if (rule.ruleType === 'CRYPTO_WEIGHT_MAX') {
      const cryptoPct = summary.byAssetClass.find((s) => s.label === 'Crypto')?.pct ?? 0;
      if (cryptoPct > rule.threshold) {
        triggered.push({
          id: `trig_${rule.id}`,
          ruleId: rule.id,
          severity: cryptoPct > rule.threshold + 8 ? 'High' : 'Warning',
          title: `Crypto weight (${cryptoPct.toFixed(1)}%) exceeds ${rule.threshold}% cap`,
          detail: 'High-beta digital assets amplify portfolio tail risk. Review Optimizer tab for regime-aware rebalancing.',
          metricValue: `${cryptoPct.toFixed(1)}%`,
        });
      }
    } else if (rule.ruleType === 'ASSET_WEIGHT_MAX') {
      const top = summary.valuedHoldings.find((h) => h.ticker === rule.target || h.weightPct > rule.threshold);
      if (top && top.weightPct > rule.threshold) {
        triggered.push({
          id: `trig_${rule.id}`,
          ruleId: rule.id,
          severity: 'Warning',
          title: `Single holding ${top.name} at ${top.weightPct.toFixed(1)}%`,
          detail: `Exceeds your ${rule.threshold}% single-position limit, reducing effective diversification.`,
          metricValue: `${top.weightPct.toFixed(1)}%`,
        });
      }
    } else if (rule.ruleType === 'PORTFOLIO_VOL_MAX') {
      if (risk.annualizedVolPct > rule.threshold) {
        triggered.push({
          id: `trig_${rule.id}`,
          ruleId: rule.id,
          severity: 'High',
          title: `Annualized volatility (${risk.annualizedVolPct.toFixed(1)}%) above ${rule.threshold}%`,
          detail: 'Portfolio risk exceeds your volatility budget. Shifting toward Gold BeES or Liquid BeES lowers variance.',
          metricValue: `${risk.annualizedVolPct.toFixed(1)}%`,
        });
      }
    } else if (rule.ruleType === 'REGIME_BEAR') {
      const bearProbPct = regime.probabilities.Bear * 100;
      if (regime.currentRegime === 'Bear' || bearProbPct >= rule.threshold) {
        triggered.push({
          id: `trig_${rule.id}`,
          ruleId: rule.id,
          severity: 'High',
          title: `Bear Regime probability at ${bearProbPct.toFixed(0)}%`,
          detail: 'Filtered HMM detects elevated volatility / negative drift. Defensive constraints tighten equity & crypto caps.',
          metricValue: `${bearProbPct.toFixed(0)}%`,
        });
      }
    } else if (rule.ruleType === 'ANOMALY_HELD') {
      const recentHeld = anomalies.filter((a) => a.isHeld).slice(0, 2);
      if (recentHeld.length > 0 && Math.abs(recentHeld[0].volumeZScore) >= rule.threshold - 0.5) {
        triggered.push({
          id: `trig_${rule.id}`,
          ruleId: rule.id,
          severity: 'Warning',
          title: `Unusual behavior flagged in ${recentHeld[0].name}`,
          detail: `${recentHeld[0].date}: ${recentHeld[0].reason} (Isolation Forest score ${recentHeld[0].anomalyScore.toFixed(2)}).`,
          metricValue: `${recentHeld[0].anomalyScore.toFixed(2)}`,
        });
      }
    } else if (rule.ruleType === 'CORRELATION_SPIKE') {
      const series = correlation.rollingPairs['BTC-USD vs ^NSEI'];
      const latest = series?.[series.length - 1]?.corr ?? 0;
      if (latest > rule.threshold) {
        triggered.push({
          id: `trig_${rule.id}`,
          ruleId: rule.id,
          severity: 'Info',
          title: `BTC–Nifty 90D correlation elevated (${latest.toFixed(2)})`,
          detail: 'Cross-asset diversification benefit weakens when crypto moves in lockstep with Indian equities.',
          metricValue: latest.toFixed(2),
        });
      }
    }
  }

  return triggered;
}

/**
 * Generates plain-language narrative summary aligned with Part E3 of the specification.
 */
export function buildPlainLanguageSummary(
  summary: PortfolioSummary,
  risk: RiskMetrics,
  regime: RegimeReport,
  optimization: OptimizationResult,
  backtest: BacktestResult
): string {
  const valStr = formatINR(summary.totalValueInr, true);
  const pnlStr = formatPct(summary.unrealizedPnlPct, 1, true);
  const xirrStr = summary.xirrPct !== null ? `${summary.xirrPct.toFixed(1)}%` : 'N/A';
  const regProb = (regime.probabilities[regime.currentRegime] * 100).toFixed(0);

  // Find asset class with widest risk vs capital gap
  const cryptoCapital = summary.byAssetClass.find((s) => s.label === 'Crypto')?.pct ?? 0;
  const cryptoRisk = risk.riskContributions
    .filter((r) => r.assetClass === 'Crypto')
    .reduce((a, b) => a + b.riskContributionPct, 0);

  const goldCapital = summary.byAssetClass.find((s) => s.label === 'Gold')?.pct ?? 0;
  const targetCrypto = optimization.trades
    .filter((t) => t.assetClass === 'Crypto')
    .reduce((a, b) => a + b.targetWeightPct, 0);
  const targetGold = optimization.trades
    .filter((t) => t.assetClass === 'Gold')
    .reduce((a, b) => a + b.targetWeightPct, 0);

  const bhStrat = backtest.strategies.find((s) => s.name === 'Buy & Hold Current');
  const regStrat = backtest.strategies.find((s) => s.name === 'Regime-Adjusted');

  const parts: string[] = [
    `Your multi-asset portfolio is worth ${valStr} (${pnlStr} since purchase, XIRR ${xirrStr}).`,
    `Annualized volatility is ${risk.annualizedVolPct.toFixed(1)}% (vs ${risk.weightedAvgVolPct.toFixed(1)}% un-diversified) with a 1-day 95% VaR of ${risk.historicalVar95Pct.toFixed(2)}% and CVaR of ${risk.cvar95Pct.toFixed(2)}%.`,
    `The forward-filtered HMM classifies the NIFTY 50 regime as ${regime.currentRegime} (${regProb}% probability).`,
  ];

  if (cryptoCapital > 0) {
    parts.push(
      `Crypto represents ${cryptoCapital.toFixed(1)}% of total wealth but drives ${cryptoRisk.toFixed(1)}% of liquid portfolio variance.`
    );
  }
  if (optimization.trades.some((t) => t.action !== 'HOLD')) {
    parts.push(
      `Regime-aware optimization suggests adjusting Crypto toward ${targetCrypto.toFixed(1)}% and Gold toward ${targetGold.toFixed(1)}% (currently ${goldCapital.toFixed(1)}%).`
    );
  }
  if (bhStrat && regStrat) {
    parts.push(
      `Walk-forward backtest (after 0.15% tx/slippage): regime-adjusted allocation achieved ${regStrat.maxDrawdownPct.toFixed(1)}% max drawdown vs ${bhStrat.maxDrawdownPct.toFixed(1)}% buy-and-hold.`
    );
  }
  parts.push('Educational decision-support analysis only — not SEBI-registered financial advice.');

  return parts.join(' ');
}
