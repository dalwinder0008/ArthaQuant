import React, { useState } from 'react';
import { ChartCaption, EfficientFrontierChart, InteractiveLineChart } from '../components/Charts.tsx';
import { formatINR } from '../engine/alerts.ts';
import type {
  BacktestResult,
  MarketRegime,
  OptimizationConstraints,
  OptimizationResult,
} from '../engine/types.ts';

type OptimizerSubTab = 'plan' | 'backtest';

export function OptimizerPage({
  constraints,
  onChangeConstraints,
  currentRegime,
  optimization,
  backtest,
}: {
  constraints: OptimizationConstraints;
  onChangeConstraints: (next: OptimizationConstraints) => void;
  currentRegime: MarketRegime;
  optimization: OptimizationResult;
  backtest: BacktestResult;
}) {
  const [subTab, setSubTab] = useState<OptimizerSubTab>('plan');
  const applied = optimization.appliedConstraints;

  const applyPreset = (preset: 'Conservative' | 'Balanced' | 'Growth') => {
    onChangeConstraints({
      ...constraints,
      maxCryptoPct: preset === 'Conservative' ? 5 : preset === 'Balanced' ? 15 : 25,
      minGoldPct: preset === 'Conservative' ? 25 : preset === 'Balanced' ? 20 : 10,
      minSafePct: preset === 'Conservative' ? 20 : preset === 'Balanced' ? 10 : 5,
      maxSingleAssetPct: preset === 'Conservative' ? 25 : preset === 'Balanced' ? 30 : 35,
    });
  };

  return (
    <div className="space-y-6">
      {/* Sub-navigation Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
        <div>
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Portfolio Rebalance</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Adjust your limits to see suggested buy/sell trades, or check historical strategy performance.
          </p>
        </div>

        <div className="flex items-center gap-1 rounded-md bg-slate-100 p-1 dark:bg-slate-800">
          <button
            type="button"
            onClick={() => setSubTab('plan')}
            className={`rounded px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
              subTab === 'plan'
                ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-slate-100'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            Rebalance Plan
          </button>
          <button
            type="button"
            onClick={() => setSubTab('backtest')}
            className={`rounded px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
              subTab === 'backtest'
                ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-slate-100'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            Frontier &amp; Backtest
          </button>
        </div>
      </div>

      {subTab === 'plan' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Left: Presets & Simple Sliders */}
          <div className="rounded-lg border border-slate-200 bg-white p-5 space-y-4 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Your Risk Limits</h3>
              <label className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={constraints.regimeAware}
                  onChange={(e) => onChangeConstraints({ ...constraints, regimeAware: e.target.checked })}
                  className="rounded border-slate-300"
                />
                <span>Market-Aware ({currentRegime})</span>
              </label>
            </div>

            {/* 1-Click Presets */}
            <div className="grid grid-cols-3 gap-1.5 rounded-md bg-slate-100 p-1 dark:bg-slate-800">
              {(['Conservative', 'Balanced', 'Growth'] as const).map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => applyPreset(preset)}
                  className="rounded px-2 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-white hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-900 dark:hover:text-slate-100"
                >
                  {preset}
                </button>
              ))}
            </div>

            <div className="space-y-3.5 text-xs">
              <div>
                <div className="mb-1 flex justify-between">
                  <span className="text-slate-600 dark:text-slate-400">Max Crypto</span>
                  <span className="font-mono font-semibold tabular-nums">
                    {constraints.maxCryptoPct}%{applied.maxCryptoPct !== constraints.maxCryptoPct ? ` → ${applied.maxCryptoPct}%` : ''}
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={35}
                  step={1}
                  value={constraints.maxCryptoPct}
                  onChange={(e) => onChangeConstraints({ ...constraints, maxCryptoPct: Number(e.target.value) })}
                  className="w-full"
                />
              </div>

              <div>
                <div className="mb-1 flex justify-between">
                  <span className="text-slate-600 dark:text-slate-400">Min Gold Cushion</span>
                  <span className="font-mono font-semibold tabular-nums">
                    {constraints.minGoldPct}%{applied.minGoldPct !== constraints.minGoldPct ? ` → ${applied.minGoldPct}%` : ''}
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={40}
                  step={1}
                  value={constraints.minGoldPct}
                  onChange={(e) => onChangeConstraints({ ...constraints, minGoldPct: Number(e.target.value) })}
                  className="w-full"
                />
              </div>

              <div>
                <div className="mb-1 flex justify-between">
                  <span className="text-slate-600 dark:text-slate-400">Min Safe Cash ETF</span>
                  <span className="font-mono font-semibold tabular-nums">
                    {constraints.minSafePct}%{applied.minSafePct !== constraints.minSafePct ? ` → ${applied.minSafePct}%` : ''}
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={30}
                  step={1}
                  value={constraints.minSafePct}
                  onChange={(e) => onChangeConstraints({ ...constraints, minSafePct: Number(e.target.value) })}
                  className="w-full"
                />
              </div>

              <div>
                <div className="mb-1 flex justify-between">
                  <span className="text-slate-600 dark:text-slate-400">Max Per Asset</span>
                  <span className="font-mono font-semibold tabular-nums">{applied.maxSingleAssetPct}%</span>
                </div>
                <input
                  type="range"
                  min={15}
                  max={50}
                  step={1}
                  value={constraints.maxSingleAssetPct}
                  onChange={(e) => onChangeConstraints({ ...constraints, maxSingleAssetPct: Number(e.target.value) })}
                  className="w-full"
                />
              </div>

              <div>
                <div className="mb-1 flex justify-between">
                  <span className="text-slate-600 dark:text-slate-400">Safe Benchmark Rate</span>
                  <span className="font-mono font-semibold tabular-nums">{constraints.riskFreeRatePct.toFixed(1)}%</span>
                </div>
                <input
                  type="range"
                  min={4}
                  max={9}
                  step={0.5}
                  value={constraints.riskFreeRatePct}
                  onChange={(e) => onChangeConstraints({ ...constraints, riskFreeRatePct: Number(e.target.value) })}
                  className="w-full"
                />
              </div>
            </div>

            <div className="border-t border-slate-100 pt-3 text-xs space-y-1 dark:border-slate-800">
              <div className="flex justify-between">
                <span className="text-slate-500">Current Sharpe</span>
                <span className="font-mono font-medium tabular-nums">{optimization.currentPoint.sharpe.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Target Sharpe</span>
                <span className="font-mono font-semibold text-emerald-700 tabular-nums dark:text-emerald-400">
                  {optimization.recommendedPoint.sharpe.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Expected Risk</span>
                <span className="font-mono tabular-nums">
                  {optimization.currentPoint.volatilityPct.toFixed(1)}% → {optimization.recommendedPoint.volatilityPct.toFixed(1)}%
                </span>
              </div>
            </div>
          </div>

          {/* Right: Clean Suggested Buy/Sell Plan */}
          <div className="rounded-lg border border-slate-200 bg-white p-5 lg:col-span-2 dark:border-slate-800 dark:bg-slate-900">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Suggested Buy / Sell Plan</h3>
              <div className="font-mono text-xs text-slate-500 tabular-nums">
                Trade Size: {formatINR(optimization.totalTurnoverInr)} · Est. Fee: {formatINR(optimization.totalTxCostInr)}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 dark:border-slate-800 dark:text-slate-400">
                    <th className="py-2 font-medium">Asset</th>
                    <th className="py-2 text-right font-medium">Now</th>
                    <th className="py-2 text-right font-medium">Target</th>
                    <th className="py-2 text-center font-medium">Action</th>
                    <th className="py-2 text-right font-medium">Amount (INR)</th>
                    <th className="py-2 text-right font-medium">Units</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono tabular-nums dark:divide-slate-800">
                  {optimization.trades.map((tr) => (
                    <tr key={tr.ticker} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="py-2.5 font-sans">
                        <div className="font-medium text-slate-900 dark:text-slate-100">{tr.name}</div>
                        <div className="text-[11px] text-slate-500">{tr.assetClass}</div>
                      </td>
                      <td className="py-2.5 text-right">{tr.currentWeightPct.toFixed(1)}%</td>
                      <td className="py-2.5 text-right font-semibold">{tr.targetWeightPct.toFixed(1)}%</td>
                      <td className="py-2.5 text-center font-sans font-semibold">
                        <span
                          className={
                            tr.action === 'BUY'
                              ? 'text-emerald-700 dark:text-emerald-400'
                              : tr.action === 'SELL'
                              ? 'text-rose-700 dark:text-rose-400'
                              : 'text-slate-400'
                          }
                        >
                          {tr.action}
                        </span>
                      </td>
                      <td className="py-2.5 text-right">{formatINR(tr.deltaInr)}</td>
                      <td className="py-2.5 text-right text-slate-600 dark:text-slate-400">
                        {tr.estimatedUnits > 0 ? '+' : ''}
                        {tr.estimatedUnits.toFixed(Math.abs(tr.estimatedUnits) < 1 ? 4 : 2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ChartCaption text="Balances return and equal risk across assets, automatically tightening crypto and stock caps during Bear market phases." />
          </div>
        </div>
      )}

      {subTab === 'backtest' && (
        <div className="space-y-6">
          {/* Efficient Frontier Chart */}
          <div className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Risk vs Return Map (Efficient Frontier)
              </h3>
              <span className="font-mono text-xs text-slate-500 tabular-nums">
                Sharpe: {optimization.currentPoint.sharpe.toFixed(2)} → {optimization.recommendedPoint.sharpe.toFixed(2)}
              </span>
            </div>
            <EfficientFrontierChart
              frontier={optimization.frontier}
              currentPoint={optimization.currentPoint}
              minVariancePoint={optimization.minVariancePoint}
              maxSharpePoint={optimization.maxSharpePoint}
              riskParityPoint={optimization.riskParityPoint}
              recommendedPoint={optimization.recommendedPoint}
            />
            <ChartCaption text="Shows where your current portfolio sits compared to the best risk-adjusted mixes." />
          </div>

          {/* Walk-Forward Backtest */}
          <div className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <div className="mb-3">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Historical Performance Test (₹100 Base, Net of 0.15% Trading Fees)
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Simulates quarterly rebalancing using only past data available at each rebalance date.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <InteractiveLineChart
                data={backtest.curves}
                series={[
                  { key: 'regimeAdjusted', label: 'Regime-Adjusted', color: '#16A34A' },
                  { key: 'markowitz', label: 'Markowitz', color: '#1D4ED8' },
                  { key: 'buyHold', label: 'Buy & Hold', color: '#DC2626' },
                  { key: 'nifty', label: 'NIFTY 50', color: '#64748B', dashed: true },
                ]}
                yFormat={(v) => v.toFixed(0)}
              />
              <InteractiveLineChart
                data={backtest.curves}
                series={[
                  { key: 'regimeAdjustedDd', label: 'Regime-Adjusted Drop', color: '#16A34A' },
                  { key: 'markowitzDd', label: 'Markowitz Drop', color: '#1D4ED8' },
                  { key: 'buyHoldDd', label: 'Buy & Hold Drop', color: '#DC2626' },
                ]}
                yFormat={(v) => `${v.toFixed(1)}%`}
                zeroLine
              />
            </div>

            <div className="mt-5 overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 dark:border-slate-800 dark:text-slate-400">
                    <th className="py-2 font-medium">Strategy</th>
                    <th className="py-2 text-right font-medium">CAGR</th>
                    <th className="py-2 text-right font-medium">Risk/yr</th>
                    <th className="py-2 text-right font-medium">Sharpe</th>
                    <th className="py-2 text-right font-medium">Max Drop</th>
                    <th className="py-2 text-right font-medium">End Value (₹100)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono tabular-nums dark:divide-slate-800">
                  {backtest.strategies.map((s) => (
                    <tr key={s.name} className={s.name === 'Regime-Adjusted' ? 'bg-emerald-50/40 dark:bg-emerald-950/20' : ''}>
                      <td className="py-2.5 font-sans font-medium text-slate-900 dark:text-slate-100">{s.name}</td>
                      <td className="py-2.5 text-right">{s.cagrPct.toFixed(1)}%</td>
                      <td className="py-2.5 text-right">{s.annualVolPct.toFixed(1)}%</td>
                      <td className="py-2.5 text-right font-semibold">{s.sharpe.toFixed(2)}</td>
                      <td className="py-2.5 text-right text-rose-700 dark:text-rose-400">{s.maxDrawdownPct.toFixed(1)}%</td>
                      <td className="py-2.5 text-right font-semibold">₹{s.finalValueOn100.toFixed(0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ChartCaption text="Past simulation results are for learning and do not guarantee future returns." />
          </div>
        </div>
      )}
    </div>
  );
}
