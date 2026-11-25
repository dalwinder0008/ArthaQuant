import React from 'react';
import { ChartCaption, InteractiveLineChart, RiskVsWeightBars } from '../components/Charts.tsx';
import type { RiskMetrics } from '../engine/types.ts';

export function RiskPage({ risk }: { risk: RiskMetrics }) {
  return (
    <div className="space-y-6">
      {/* 4 Core Risk Cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          ['Yearly Return', `${risk.annualizedReturnPct.toFixed(1)}%`, 'Estimated annual pace'],
          ['Portfolio Risk (Volatility)', `${risk.annualizedVolPct.toFixed(1)}%`, 'Yearly ups & downs'],
          ['Risk-Adjusted Score (Sharpe)', risk.sharpeRatio.toFixed(2), `Sortino ${risk.sortinoRatio.toFixed(2)}`],
          ['Worst Historical Drop', `${risk.maxDrawdownPct.toFixed(1)}%`, `Calmar ${risk.calmarRatio.toFixed(2)}`],
        ].map(([label, val, hint]) => (
          <div key={label} className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <div className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</div>
            <div className="mt-1 font-mono text-2xl font-semibold text-slate-900 tabular-nums dark:text-slate-100">{val}</div>
            <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">{hint}</div>
          </div>
        ))}
      </div>

      {/* Drawdown Chart + Value at Risk */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-white p-5 lg:col-span-2 dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Historical Drops vs NIFTY 50</h2>
            <span className="font-mono text-xs text-slate-500 tabular-nums">
              Longest recovery: {risk.maxDrawdownDurationDays} days
            </span>
          </div>
          <InteractiveLineChart
            data={risk.drawdownSeries}
            series={[
              { key: 'portfolioDdPct', label: 'Your Portfolio (%)', color: '#DC2626', areaFill: true },
              { key: 'niftyDdPct', label: 'NIFTY 50 (%)', color: '#475569', dashed: true },
            ]}
            yFormat={(v) => `${v.toFixed(1)}%`}
            zeroLine
          />
          <ChartCaption
            text={`Your worst peak-to-bottom drop was ${risk.maxDrawdownPct.toFixed(
              1
            )}% (${risk.maxDrawdownPeakDate} to ${risk.maxDrawdownTroughDate}).`}
          />
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="mb-4 text-sm font-semibold text-slate-900 dark:text-slate-100">1-Day Downside Risk (95% Confidence)</h2>
          <div className="space-y-4">
            {[
              ['Historical 1-Day VaR', risk.historicalVar95Pct, 'Worst loss on 19 out of 20 normal days'],
              ['Normal Model VaR', risk.parametricVar95Pct, 'Bell-curve estimate of a bad day'],
              ['Simulated VaR (2,500 runs)', risk.monteCarloVar95Pct, 'Stress simulation keeping asset links'],
              ['Worst-Case Avg (CVaR)', risk.cvar95Pct, 'Average loss on the worst 5% of days'],
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
            text={`Mixing different assets cut your risk by ${risk.diversificationBenefitPct.toFixed(1)}% overall.`}
          />
        </div>
      </div>

      {/* Risk Contribution & Benchmark Comparison */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="mb-4 text-sm font-semibold text-slate-900 dark:text-slate-100">Which Assets Drive Your Risk</h2>
          <RiskVsWeightBars items={risk.riskContributions} />
          <ChartCaption text="Compares how much money is in each asset vs how much volatility it adds." />
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="mb-4 text-sm font-semibold text-slate-900 dark:text-slate-100">How You Compare to Benchmarks</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 dark:border-slate-800 dark:text-slate-400">
                  <th className="py-2 font-medium">Portfolio / Benchmark</th>
                  <th className="py-2 text-right font-medium">Return/yr</th>
                  <th className="py-2 text-right font-medium">Risk/yr</th>
                  <th className="py-2 text-right font-medium">Sharpe</th>
                  <th className="py-2 text-right font-medium">Max Drop</th>
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ChartCaption text="All numbers are converted to INR over aligned Indian trading days." />
        </div>
      </div>
    </div>
  );
}
