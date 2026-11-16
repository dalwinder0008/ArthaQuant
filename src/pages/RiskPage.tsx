import React from 'react';
import { ChartCaption, InteractiveLineChart, RiskVsWeightBars } from '../components/Charts.tsx';
import type { RiskMetrics } from '../engine/types.ts';

export function RiskPage({ risk }: { risk: RiskMetrics }) {
  return (
    <div className="space-y-6">
      {/* Core Risk Metrics Grid */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {[
          ['Ann. Return', `${risk.annualizedReturnPct.toFixed(2)}%`],
          ['Portfolio Vol (w′Σw)', `${risk.annualizedVolPct.toFixed(2)}%`],
          ['Sharpe Ratio (Rf 6.5%)', risk.sharpeRatio.toFixed(2)],
          ['Sortino Ratio', risk.sortinoRatio.toFixed(2)],
          ['Max Drawdown', `${risk.maxDrawdownPct.toFixed(2)}%`],
          ['Calmar Ratio', risk.calmarRatio.toFixed(2)],
        ].map(([label, val]) => (
          <div key={label} className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">{label}</div>
            <div className="mt-1 font-mono text-xl font-semibold text-slate-900 tabular-nums dark:text-slate-100">{val}</div>
          </div>
        ))}
      </div>

      {/* Drawdown Underwater Chart + VaR/CVaR Panel */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-white p-5 lg:col-span-2 dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Underwater Drawdown Curve vs NIFTY 50</h2>
            <span className="font-mono text-xs text-slate-500 tabular-nums">
              Peak-to-Trough: {risk.maxDrawdownPeakDate} → {risk.maxDrawdownTroughDate} ({risk.maxDrawdownDurationDays}d)
            </span>
          </div>
          <InteractiveLineChart
            data={risk.drawdownSeries}
            series={[
              { key: 'portfolioDdPct', label: 'Your Portfolio DD (%)', color: '#DC2626', areaFill: true },
              { key: 'niftyDdPct', label: 'NIFTY 50 DD (%)', color: '#475569', dashed: true },
            ]}
            yFormat={(v) => `${v.toFixed(1)}%`}
            zeroLine
          />
          <ChartCaption
            text={`Portfolio experienced a maximum peak-to-trough decline of ${risk.maxDrawdownPct.toFixed(
              1
            )}% with longest underwater recovery of ${risk.maxDrawdownDurationDays} trading days.`}
          />
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="mb-4 text-sm font-semibold text-slate-900 dark:text-slate-100">Value at Risk (1-Day 95%) & Tail Loss</h2>
          <div className="space-y-4">
            {[
              ['Historical VaR (5th pct)', risk.historicalVar95Pct, 'Empirical 5th percentile of aligned daily returns'],
              ['Parametric VaR (Gaussian)', risk.parametricVar95Pct, 'Assumes normal distribution (μ - 1.645σ)'],
              ['Monte Carlo VaR (2,500 Cholesky)', risk.monteCarloVar95Pct, 'Correlated paths via Cholesky factor L of Σ'],
              ['CVaR / Expected Shortfall', risk.cvar95Pct, 'Average loss on days strictly worse than 95% VaR'],
            ].map(([name, val, desc]) => (
              <div key={String(name)} className="border-b border-slate-100 pb-3 last:border-0 last:pb-0 dark:border-slate-800">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-slate-800 dark:text-slate-200">{name}</span>
                  <span className="font-mono font-semibold text-rose-700 tabular-nums dark:text-rose-400">
                    -{Number(val).toFixed(2)}%
                  </span>
                </div>
                <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">{desc}</div>
              </div>
            ))}
          </div>
          <ChartCaption
            text={`Covariance diversification reduced annualized volatility by ${risk.diversificationBenefitPct.toFixed(
              2
            )}% (from ${risk.weightedAvgVolPct.toFixed(1)}% weighted average down to ${risk.annualizedVolPct.toFixed(1)}%).`}
          />
        </div>
      </div>

      {/* Risk Contribution & Benchmark Comparison */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="mb-4 text-sm font-semibold text-slate-900 dark:text-slate-100">Marginal Risk Contribution Breakdown</h2>
          <RiskVsWeightBars items={risk.riskContributions} />
          <ChartCaption text="Computed via Euler decomposition: RC_i = w_i · (Σw)_i / (w′Σw). Assets with high standalone volatility and positive equity correlation dominate total portfolio risk." />
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="mb-4 text-sm font-semibold text-slate-900 dark:text-slate-100">Benchmark Risk-Return Comparison</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 dark:border-slate-800 dark:text-slate-400">
                  <th className="py-2 font-medium">Series</th>
                  <th className="py-2 text-right font-medium">Ann. Ret</th>
                  <th className="py-2 text-right font-medium">Ann. Vol</th>
                  <th className="py-2 text-right font-medium">Sharpe</th>
                  <th className="py-2 text-right font-medium">Max DD</th>
                  <th className="py-2 text-right font-medium">95% VaR</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono tabular-nums dark:divide-slate-800">
                {risk.benchmarkComparison.map((b) => (
                  <tr key={b.label} className={b.label === 'Your Portfolio' ? 'bg-blue-50/50 dark:bg-blue-950/20' : ''}>
                    <td className="py-2.5 font-sans font-medium text-slate-900 dark:text-slate-100">{b.label}</td>
                    <td className="py-2.5 text-right">{b.annualReturnPct.toFixed(1)}%</td>
                    <td className="py-2.5 text-right">{b.annualVolPct.toFixed(1)}%</td>
                    <td className="py-2.5 text-right">{b.sharpe.toFixed(2)}</td>
                    <td className="py-2.5 text-right text-rose-700 dark:text-rose-400">{b.maxDrawdownPct.toFixed(1)}%</td>
                    <td className="py-2.5 text-right">{b.var95Pct.toFixed(2)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ChartCaption text="All metrics computed on aligned Indian equity trading days (252 trading days/year) with USD assets converted into INR." />
        </div>
      </div>
    </div>
  );
}
