import { jsPDF } from 'jspdf';
import { formatINR, formatPct } from './alerts.ts';
import type {
  BacktestResult,
  CorrelationReport,
  ManualAsset,
  OptimizationResult,
  PortfolioSummary,
  RegimeReport,
  RiskMetrics,
  TriggeredAlert,
} from './types.ts';

export function exportPortfolioCSV(summary: PortfolioSummary, manualAssets: ManualAsset[]): void {
  const headers = [
    'Type',
    'Ticker / Category',
    'Name',
    'Asset Class',
    'Quantity',
    'Buy Price (INR)',
    'Latest Price (INR)',
    'Invested (INR)',
    'Current Value (INR)',
    'Unrealized P&L (INR)',
    'P&L (%)',
    'Portfolio Weight (%)',
    'Acquisition Date',
  ];

  const rows: string[][] = summary.valuedHoldings.map((h) => [
    'Market Holding',
    h.ticker,
    `"${h.name.replace(/"/g, '""')}"`,
    h.assetClass,
    h.quantity.toString(),
    h.buyPrice.toFixed(2),
    h.latestPriceInr.toFixed(2),
    h.investedValueInr.toFixed(2),
    h.currentValueInr.toFixed(2),
    h.pnlInr.toFixed(2),
    h.pnlPct.toFixed(2),
    h.weightPct.toFixed(2),
    h.buyDate,
  ]);

  for (const m of manualAssets) {
    const pnl = m.currentValue - m.purchaseValue;
    const pnlPct = m.purchaseValue > 0 ? (pnl / m.purchaseValue) * 100 : 0;
    const w = summary.totalValueInr > 0 ? (m.currentValue / summary.totalValueInr) * 100 : 0;
    rows.push([
      'Manual Real Asset',
      m.category,
      `"${m.name.replace(/"/g, '""')}"`,
      'Real Estate',
      '1',
      m.purchaseValue.toFixed(2),
      m.currentValue.toFixed(2),
      m.purchaseValue.toFixed(2),
      m.currentValue.toFixed(2),
      pnl.toFixed(2),
      pnlPct.toFixed(2),
      w.toFixed(2),
      m.asOfDate,
    ]);
  }

  const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `arthaquant_portfolio_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function exportPortfolioPDF(params: {
  investorName: string;
  summary: PortfolioSummary;
  manualAssets: ManualAsset[];
  risk: RiskMetrics;
  correlation: CorrelationReport;
  regime: RegimeReport;
  optimization: OptimizationResult;
  backtest: BacktestResult;
  alerts: TriggeredAlert[];
  narrative: string;
}): void {
  const { investorName, summary, risk, correlation, regime, optimization, alerts, narrative } = params;
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const margin = 42;
  let y = 48;

  const ensureSpace = (needed: number) => {
    if (y + needed > 780) {
      doc.addPage();
      y = 48;
    }
  };

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(17);
  doc.setTextColor(15, 23, 42);
  doc.text('ArthaQuant — Multi-Asset Portfolio & Risk Advisory Report', margin, y);
  y += 18;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(71, 85, 105);
  doc.text(`Investor: ${investorName}   |   Generated: ${new Date().toISOString().slice(0, 10)}   |   Base Currency: INR`, margin, y);
  y += 18;

  doc.setDrawColor(203, 213, 225);
  doc.line(margin, y, 553, y);
  y += 18;

  // Executive Summary
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(15, 23, 42);
  doc.text('1. Executive Advisory Summary', margin, y);
  y += 14;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(51, 65, 85);
  const splitNarrative = doc.splitTextToSize(narrative, 510);
  doc.text(splitNarrative, margin, y);
  y += splitNarrative.length * 13 + 14;

  // Key Metrics Grid
  ensureSpace(90);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(15, 23, 42);
  doc.text('2. Portfolio Valuation & Quantitative Risk', margin, y);
  y += 16;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  const kpiLines = [
    `Total Wealth: ${formatINR(summary.totalValueInr)}   |   Invested: ${formatINR(summary.totalInvestedInr)}   |   Unrealized P&L: ${formatINR(summary.unrealizedPnlInr)} (${formatPct(summary.unrealizedPnlPct, 2, true)})`,
    `XIRR (Annualized): ${summary.xirrPct !== null ? `${summary.xirrPct.toFixed(2)}%` : 'N/A'}   |   Real Estate (Manual): ${formatINR(summary.manualRealEstateInr)}`,
    `Annualized Return: ${risk.annualizedReturnPct.toFixed(2)}%   |   Volatility: ${risk.annualizedVolPct.toFixed(2)}%   |   Sharpe: ${risk.sharpeRatio.toFixed(2)}   |   Sortino: ${risk.sortinoRatio.toFixed(2)}`,
    `Max Drawdown: ${risk.maxDrawdownPct.toFixed(2)}% (${risk.maxDrawdownDurationDays}d)   |   Hist VaR 95%: ${risk.historicalVar95Pct.toFixed(2)}%   |   CVaR 95%: ${risk.cvar95Pct.toFixed(2)}%`,
    `Beta vs NIFTY 50: ${risk.betaVsNifty.toFixed(2)}   |   Effective Bets: ${correlation.effectiveNumBets.toFixed(2)}   |   Diversification Score: ${correlation.diversificationScore}/100`,
    `HMM Market Regime: ${regime.currentRegime} (Bull ${(regime.probabilities.Bull * 100).toFixed(0)}% / Sideways ${(regime.probabilities.Sideways * 100).toFixed(0)}% / Bear ${(regime.probabilities.Bear * 100).toFixed(0)}%)`,
  ];
  for (const line of kpiLines) {
    doc.text(line, margin, y);
    y += 14;
  }
  y += 8;

  // Holdings table
  ensureSpace(120);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(15, 23, 42);
  doc.text('3. Multi-Asset Holdings & Risk Attribution', margin, y);
  y += 15;

  doc.setFont('courier', 'bold');
  doc.setFontSize(8.5);
  doc.text('TICKER        CLASS     QTY        VALUE (INR)     P&L (%)    WEIGHT   RISK SHARE', margin, y);
  y += 12;
  doc.setFont('courier', 'normal');

  for (const h of summary.valuedHoldings) {
    ensureSpace(16);
    const rc = risk.riskContributions.find((r) => r.ticker === h.ticker)?.riskContributionPct ?? 0;
    const row = `${h.ticker.padEnd(13)} ${h.assetClass.padEnd(9)} ${h.quantity.toFixed(3).padStart(8)} ${formatINR(h.currentValueInr).padStart(14)} ${formatPct(h.pnlPct, 1, true).padStart(9)} ${h.weightPct.toFixed(1).padStart(7)}% ${rc.toFixed(1).padStart(9)}%`;
    doc.text(row, margin, y);
    y += 12;
  }
  y += 10;

  // Optimizer Rebalancing Suggestions
  ensureSpace(110);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('4. Regime-Aware Optimization Trade Plan', margin, y);
  y += 15;

  doc.setFont('courier', 'bold');
  doc.setFontSize(8.5);
  doc.text('ASSET         ACTION   CURR WT   TARGET WT   TRADE (INR)       EST. FEE', margin, y);
  y += 12;
  doc.setFont('courier', 'normal');
  for (const tr of optimization.trades) {
    ensureSpace(16);
    const line = `${tr.name.padEnd(13)} ${tr.action.padEnd(7)} ${tr.currentWeightPct.toFixed(1).padStart(7)}% ${tr.targetWeightPct.toFixed(1).padStart(9)}% ${formatINR(tr.deltaInr).padStart(14)} ${formatINR(tr.txCostInr).padStart(12)}`;
    doc.text(line, margin, y);
    y += 12;
  }
  y += 12;

  if (alerts.length > 0) {
    ensureSpace(70);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text('5. Active Risk & Concentration Alerts', margin, y);
    y += 15;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    for (const al of alerts) {
      ensureSpace(24);
      doc.text(`[${al.severity}] ${al.title} — ${al.detail}`, margin, y, { maxWidth: 510 });
      y += 22;
    }
  }

  ensureSpace(45);
  y += 8;
  doc.setDrawColor(203, 213, 225);
  doc.line(margin, y, 553, y);
  y += 14;
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text(
    'Disclaimer: ArthaQuant is an educational portfolio analytics and quantitative decision-support tool. It does not constitute SEBI-registered investment, legal, or tax advice. Past performance and model forecasts do not guarantee future results.',
    margin,
    y,
    { maxWidth: 510 }
  );

  doc.save(`arthaquant_advisory_report_${new Date().toISOString().slice(0, 10)}.pdf`);
}
