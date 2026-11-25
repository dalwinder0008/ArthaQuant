import React from 'react';
import { AlertTriangle, ArrowRight, ShieldAlert, TrendingDown, TrendingUp } from 'lucide-react';
import { AllocationDonut, ChartCaption, RiskVsWeightBars } from '../components/Charts.tsx';
import { formatINR, formatPct } from '../engine/alerts.ts';
import type {
  CorrelationReport,
  PortfolioSummary,
  RegimeReport,
  RiskMetrics,
  TriggeredAlert,
} from '../engine/types.ts';

export type NavTab =
  | 'overview'
  | 'portfolio'
  | 'analysis'
  | 'optimizer'
  | 'alerts'
  | 'account';

export function OverviewPage({
  summary,
  risk,
  regime,
  correlation,
  alerts,
  narrative,
  onNavigate,
}: {
  summary: PortfolioSummary;
  risk: RiskMetrics;
  regime: RegimeReport;
  correlation: CorrelationReport;
  alerts: TriggeredAlert[];
  narrative: string;
  onNavigate: (tab: NavTab) => void;
}) {
  const regimeTone =
    regime.currentRegime === 'Bull'
      ? 'text-emerald-700 dark:text-emerald-400'
      : regime.currentRegime === 'Bear'
      ? 'text-rose-700 dark:text-rose-400'
      : 'text-amber-700 dark:text-amber-400';

  const cryptoSlice = summary.byAssetClass.find((s) => s.label === 'Crypto');
  const cryptoRisk = risk.riskContributions
    .filter((r) => r.assetClass === 'Crypto')
    .reduce((a, b) => a + b.riskContributionPct, 0);

  return (
    <div className="space-y-6">
      {/* 4 Clean KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">Total Wealth</div>
          <div className="mt-1.5 font-mono text-2xl font-semibold text-slate-900 tabular-nums dark:text-slate-100">
            {formatINR(summary.totalValueInr, true)}
          </div>
          <div className="mt-1 flex items-center gap-1.5 font-mono text-xs tabular-nums">
            {summary.dayChangeInr >= 0 ? (
              <TrendingUp className="h-3.5 w-3.5 text-emerald-600" />
            ) : (
              <TrendingDown className="h-3.5 w-3.5 text-rose-600" />
            )}
            <span className={summary.dayChangeInr >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'}>
              {formatINR(summary.dayChangeInr)} ({formatPct(summary.dayChangePct, 2, true)}) today
            </span>
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">Total Profit / Loss</div>
          <div
            className={`mt-1.5 font-mono text-2xl font-semibold tabular-nums ${
              summary.unrealizedPnlInr >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'
            }`}
          >
            {formatINR(summary.unrealizedPnlInr, true)}
          </div>
          <div className="mt-1 font-mono text-xs text-slate-500 tabular-nums dark:text-slate-400">
            {formatPct(summary.unrealizedPnlPct, 1, true)} · Invested {formatINR(summary.totalInvestedInr, true)}
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">Annual Return (XIRR)</div>
          <div className="mt-1.5 font-mono text-2xl font-semibold text-slate-900 tabular-nums dark:text-slate-100">
            {summary.xirrPct !== null ? `${summary.xirrPct.toFixed(1)}%` : '—'}
          </div>
          <div className="mt-1 font-mono text-xs text-slate-500 tabular-nums dark:text-slate-400">
            Sharpe {risk.sharpeRatio.toFixed(2)} · Volatility {risk.annualizedVolPct.toFixed(1)}%
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">Market Phase &amp; Balance</div>
          <div className={`mt-1.5 font-display text-2xl font-semibold ${regimeTone}`}>{regime.currentRegime}</div>
          <div className="mt-1 font-mono text-xs text-slate-500 tabular-nums dark:text-slate-400">
            {(regime.probabilities[regime.currentRegime] * 100).toFixed(0)}% confidence · Balance {correlation.diversificationScore}/100
          </div>
        </div>
      </div>

      {/* Plain-English Summary Brief */}
      <div className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Portfolio Summary</h2>
          <button
            onClick={() => onNavigate('optimizer')}
            className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-700 whitespace-nowrap shrink-0"
          >
            <span>See Rebalance Plan</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
        <p className="mt-2.5 text-sm leading-relaxed text-slate-700 dark:text-slate-300">{narrative}</p>
      </div>

      {/* Main Split: Asset Allocation + Risk Contribution */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Where Your Money Is</h2>
            <button
              onClick={() => onNavigate('portfolio')}
              className="text-xs font-medium text-blue-600 hover:underline dark:text-blue-400 whitespace-nowrap"
            >
              Manage Holdings
            </button>
          </div>
          <AllocationDonut
            slices={summary.byAssetClass}
            centerLabel="Total Wealth"
            centerValue={formatINR(summary.totalValueInr, true)}
          />
          <ChartCaption
            text={`Includes ${formatINR(summary.liquidValueInr, true)} in market assets and ${formatINR(
              summary.manualRealEstateInr,
              true
            )} in real estate.`}
          />
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Money Share vs Risk Share</h2>
            <button
              onClick={() => onNavigate('analysis')}
              className="text-xs font-medium text-blue-600 hover:underline dark:text-blue-400 whitespace-nowrap"
            >
              Open Risk &amp; AI
            </button>
          </div>
          <RiskVsWeightBars items={risk.riskContributions.slice(0, 5)} />
          <ChartCaption
            text={
              cryptoSlice
                ? `Crypto is ${cryptoSlice.pct.toFixed(1)}% of your money but causes ${cryptoRisk.toFixed(
                    1
                  )}% of your portfolio's ups and downs.`
                : `Spreading across assets lowers overall yearly risk from ${risk.weightedAvgVolPct.toFixed(
                    1
                  )}% to ${risk.annualizedVolPct.toFixed(1)}%.`
            }
          />
        </div>
      </div>

      {/* Active Alerts & Top Holdings Snapshot */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Active Alerts</h2>
            <button
              onClick={() => onNavigate('alerts')}
              className="text-xs font-medium text-blue-600 hover:underline dark:text-blue-400 whitespace-nowrap"
            >
              Manage Alerts
            </button>
          </div>
          {alerts.length === 0 ? (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Everything looks good. No risk or concentration alerts triggered.
            </p>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {alerts.slice(0, 4).map((al) => (
                <div key={al.id} className="py-2.5 first:pt-0 last:pb-0">
                  <div className="flex items-start gap-2">
                    {al.severity === 'High' ? (
                      <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
                    ) : (
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                    )}
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">{al.title}</div>
                      <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{al.detail}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-5 lg:col-span-2 dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Top Holdings</h2>
            <button
              onClick={() => onNavigate('portfolio')}
              className="text-xs font-medium text-blue-600 hover:underline dark:text-blue-400 whitespace-nowrap"
            >
              View All ({summary.valuedHoldings.length})
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 dark:border-slate-800 dark:text-slate-400">
                  <th className="py-2 font-medium">Asset</th>
                  <th className="py-2 font-medium">Category</th>
                  <th className="py-2 text-right font-medium">Price (INR)</th>
                  <th className="py-2 text-right font-medium">Value</th>
                  <th className="py-2 text-right font-medium">P&amp;L</th>
                  <th className="py-2 text-right font-medium">Share</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono tabular-nums dark:divide-slate-800">
                {summary.valuedHoldings.slice(0, 5).map((h) => (
                  <tr key={h.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="py-2.5 font-sans font-medium text-slate-900 dark:text-slate-100">{h.name}</td>
                    <td className="py-2.5 font-sans text-slate-600 dark:text-slate-400">{h.assetClass}</td>
                    <td className="py-2.5 text-right text-slate-700 dark:text-slate-300">{formatINR(h.latestPriceInr)}</td>
                    <td className="py-2.5 text-right font-medium text-slate-900 dark:text-slate-100">{formatINR(h.currentValueInr, true)}</td>
                    <td
                      className={`py-2.5 text-right ${
                        h.pnlInr >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'
                      }`}
                    >
                      {formatPct(h.pnlPct, 1, true)}
                    </td>
                    <td className="py-2.5 text-right text-slate-700 dark:text-slate-300">{h.weightPct.toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
