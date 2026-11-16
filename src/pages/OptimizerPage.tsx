import React from 'react';
import { ChartCaption, EfficientFrontierChart, InteractiveLineChart } from '../components/Charts.tsx';
import { formatINR } from '../engine/alerts.ts';
import type {
  BacktestResult,
  MarketRegime,
  OptimizationConstraints,
  OptimizationResult,
} from '../engine/types.ts';

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
  const applied = optimization.appliedConstraints;

  return (
    <div className="space-y-6">
      {/* Constraint Controls + Efficient Frontier */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-white p-5 space-y-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Optimizer Constraints</h2>
            <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={constraints.regimeAware}
                onChange={(e) => onChangeConstraints({ ...constraints, regimeAware: e.target.checked })}
                className="rounded border-slate-300"
              />
              <span>Regime-Aware ({currentRegime})</span>
            </label>
          </div>

          <div className="space-y-3.5 text-xs">
            <div>
              <div className="mb-1 flex justify-between">
                <span className="text-slate-600 dark:text-slate-400">Max Crypto Allocation</span>
                <span className="font-mono font-semibold tabular-nums">
                  {constraints.maxCryptoPct}% {applied.maxCryptoPct !== constraints.maxCryptoPct ? `(Regime -> ${applied.maxCryptoPct}%)` : ''}
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
                <span className="text-slate-600 dark:text-slate-400">Min Gold Hedge Floor</span>
                <span className="font-mono font-semibold tabular-nums">
                  {constraints.minGoldPct}% {applied.minGoldPct !== constraints.minGoldPct ? `(Regime -> ${applied.minGoldPct}%)` : ''}
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
                <span className="text-slate-600 dark:text-slate-400">Min Liquid Safe Floor</span>
                <span className="font-mono font-semibold tabular-nums">
                  {constraints.minSafePct}% {applied.minSafePct !== constraints.minSafePct ? `(Regime -> ${applied.minSafePct}%)` : ''}
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
                <span className="text-slate-600 dark:text-slate-400">Max Single-Asset Cap</span>
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
                <span className="text-slate-600 dark:text-slate-400">Risk-Free Rate (T-Bill %)</span>
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

          <ChartCaption text="Covariance matrix uses Ledoit-Wolf shrinkage; expected returns blend historical drift with long-run asset-class priors to prevent extreme corner weights." />
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-5 lg:col-span-2 dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Mean-Variance Efficient Frontier & Portfolio Targets
            </h2>
            <span className="font-mono text-xs text-slate-500 tabular-nums">
              Sharpe: Current {optimization.currentPoint.sharpe.toFixed(2)} → Target {optimization.recommendedPoint.sharpe.toFixed(2)}
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
          <ChartCaption text="Recommended allocation blends Max-Sharpe and Equal Risk Contribution (Risk Parity), adjusting class caps automatically when the HMM detects Bear or Bull regimes." />
        </div>
      </div>

      {/* Rebalance Trade Plan */}
      <div className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Regime-Aware Rebalancing Trade Plan</h2>
          <div className="font-mono text-xs text-slate-500 tabular-nums">
            One-Way Turnover: {formatINR(optimization.totalTurnoverInr)} · Est. Tx Cost (0.1%): {formatINR(optimization.totalTxCostInr)}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500 dark:border-slate-800 dark:text-slate-400">
                <th className="py-2 font-medium">Asset</th>
                <th className="py-2 font-medium">Class</th>
                <th className="py-2 text-right font-medium">Current %</th>
                <th className="py-2 text-right font-medium">Target %</th>
                <th className="py-2 text-right font-medium">Shift</th>
                <th className="py-2 text-center font-medium">Action</th>
                <th className="py-2 text-right font-medium">Trade Amount (INR)</th>
                <th className="py-2 text-right font-medium">Est. Units</th>
                <th className="py-2 text-right font-medium">Tx Fee</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-mono tabular-nums dark:divide-slate-800">
              {optimization.trades.map((tr) => (
                <tr key={tr.ticker} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                  <td className="py-2.5 font-sans font-medium text-slate-900 dark:text-slate-100">{tr.name}</td>
                  <td className="py-2.5 font-sans text-slate-600 dark:text-slate-400">{tr.assetClass}</td>
                  <td className="py-2.5 text-right">{tr.currentWeightPct.toFixed(1)}%</td>
                  <td className="py-2.5 text-right font-semibold">{tr.targetWeightPct.toFixed(1)}%</td>
                  <td
                    className={`py-2.5 text-right ${
                      tr.deltaWeightPct > 0.5
                        ? 'text-emerald-700 dark:text-emerald-400'
                        : tr.deltaWeightPct < -0.5
                        ? 'text-rose-700 dark:text-rose-400'
                        : 'text-slate-400'
                    }`}
                  >
                    {tr.deltaWeightPct > 0 ? '+' : ''}
                    {tr.deltaWeightPct.toFixed(1)}%
                  </td>
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
                  <td className="py-2.5 text-right text-slate-500">{formatINR(tr.txCostInr)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Walk-Forward Backtest */}
      <div className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Walk-Forward Backtest (Base = 100, Net of 0.15% Tx Costs & Slippage)
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Rolling 180-day estimation window — weights at date t strictly use returns before t
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <InteractiveLineChart
            data={backtest.curves}
            series={[
              { key: 'regimeAdjusted', label: 'Regime-Adjusted', color: '#16A34A' },
              { key: 'markowitz', label: 'Markowitz Quarterly', color: '#1D4ED8' },
              { key: 'buyHold', label: 'Buy & Hold Current', color: '#DC2626' },
              { key: 'nifty', label: 'NIFTY 50', color: '#64748B', dashed: true },
            ]}
            yFormat={(v) => v.toFixed(0)}
          />
          <InteractiveLineChart
            data={backtest.curves}
            series={[
              { key: 'regimeAdjustedDd', label: 'Regime-Adjusted DD', color: '#16A34A' },
              { key: 'markowitzDd', label: 'Markowitz DD', color: '#1D4ED8' },
              { key: 'buyHoldDd', label: 'Buy & Hold DD', color: '#DC2626' },
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
                <th className="py-2 text-right font-medium">Ann. Vol</th>
                <th className="py-2 text-right font-medium">Sharpe</th>
                <th className="py-2 text-right font-medium">Sortino</th>
                <th className="py-2 text-right font-medium">Max DD</th>
                <th className="py-2 text-right font-medium">Calmar</th>
                <th className="py-2 text-right font-medium">Turnover/yr</th>
                <th className="py-2 text-right font-medium">End Value (100)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-mono tabular-nums dark:divide-slate-800">
              {backtest.strategies.map((s) => (
                <tr key={s.name} className={s.name === 'Regime-Adjusted' ? 'bg-emerald-50/40 dark:bg-emerald-950/20' : ''}>
                  <td className="py-2.5 font-sans font-medium text-slate-900 dark:text-slate-100">{s.name}</td>
                  <td className="py-2.5 text-right">{s.cagrPct.toFixed(2)}%</td>
                  <td className="py-2.5 text-right">{s.annualVolPct.toFixed(2)}%</td>
                  <td className="py-2.5 text-right font-semibold">{s.sharpe.toFixed(2)}</td>
                  <td className="py-2.5 text-right">{s.sortino.toFixed(2)}</td>
                  <td className="py-2.5 text-right text-rose-700 dark:text-rose-400">{s.maxDrawdownPct.toFixed(2)}%</td>
                  <td className="py-2.5 text-right">{s.calmar.toFixed(2)}</td>
                  <td className="py-2.5 text-right">{s.annualTurnoverPct.toFixed(1)}%</td>
                  <td className="py-2.5 text-right font-semibold">{s.finalValueOn100.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <ChartCaption text="Historical backtest results are hypothetical simulations net of 0.15% transaction cost and slippage; past performance does not guarantee future returns." />
      </div>
    </div>
  );
}
