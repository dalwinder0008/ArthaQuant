import React, { useState } from 'react';
import { ChartCaption, CorrelationHeatmap, InteractiveLineChart } from '../components/Charts.tsx';
import type { CorrelationReport } from '../engine/types.ts';

export function CorrelationPage({ correlation }: { correlation: CorrelationReport }) {
  const [matrixMode, setMatrixMode] = useState<'pearson' | 'spearman'>('pearson');
  const pairNames = Object.keys(correlation.rollingPairs);
  const [selectedPair, setSelectedPair] = useState(pairNames[0] || 'GOLDBEES.NS vs ^NSEI');

  const matrix = matrixMode === 'pearson' ? correlation.pearsonMatrix : correlation.spearmanMatrix;
  const rollingData = correlation.rollingPairs[selectedPair] || [];

  return (
    <div className="space-y-6">
      {/* Diversification Summary Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">Diversification Score</div>
          <div className="mt-1 font-mono text-2xl font-semibold text-slate-900 tabular-nums dark:text-slate-100">
            {correlation.diversificationScore} / 100
          </div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">Higher means better balance</div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">Independent Bets</div>
          <div className="mt-1 font-mono text-2xl font-semibold text-slate-900 tabular-nums dark:text-slate-100">
            {correlation.effectiveNumBets.toFixed(1)}
          </div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">True spread across your holdings</div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">Normal Market Link</div>
          <div className="mt-1 font-mono text-2xl font-semibold text-emerald-700 tabular-nums dark:text-emerald-400">
            {correlation.calmAvgCorr.toFixed(2)}
          </div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">Average overlap in calm periods</div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">Crash Market Link</div>
          <div className="mt-1 font-mono text-2xl font-semibold text-rose-700 tabular-nums dark:text-rose-400">
            {correlation.crisis2020AvgCorr.toFixed(2)}
          </div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Overlap during market crashes (2022: {correlation.crisis2022AvgCorr.toFixed(2)})
          </div>
        </div>
      </div>

      {correlation.concentrationWarning && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
          <strong>Heads up:</strong> {correlation.concentrationWarning}
        </div>
      )}

      {/* Heatmap + Rolling Correlation */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-4 flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Asset Movement Overlap</h2>
            <div className="flex items-center gap-1 rounded-md bg-slate-100 p-1 dark:bg-slate-800">
              {(['pearson', 'spearman'] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setMatrixMode(m)}
                  className={`rounded px-2.5 py-1 text-xs font-medium capitalize transition-colors whitespace-nowrap shrink-0 ${
                    matrixMode === m
                      ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-slate-100'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
          <CorrelationHeatmap tickers={correlation.tickers} matrix={matrix} />
          <ChartCaption text="Blue (+1.0) means assets move together; red (-1.0) means they move in opposite directions and help protect your portfolio." />
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">90-Day Relationship Trend</h2>
            <select
              value={selectedPair}
              onChange={(e) => setSelectedPair(e.target.value)}
              className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            >
              {pairNames.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
          <InteractiveLineChart
            data={rollingData}
            series={[{ key: 'corr', label: selectedPair, color: '#1D4ED8', areaFill: true }]}
            yFormat={(v) => v.toFixed(2)}
            zeroLine
          />
          <ChartCaption text="Shows how two assets move relative to each other over time. Gold near 0 or negative helps cushion stock drops." />
        </div>
      </div>

      {/* Best Hedges Table */}
      <div className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Best Protective Assets (Hedges)</h2>
          <span className="text-xs text-slate-500 dark:text-slate-400">Assets least tied to your current holdings</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500 dark:border-slate-800 dark:text-slate-400">
                <th className="py-2 font-medium">Asset</th>
                <th className="py-2 font-medium">Category</th>
                <th className="py-2 text-right font-medium">Normal Link</th>
                <th className="py-2 text-right font-medium">Crash Link</th>
                <th className="py-2 font-medium pl-4">Role</th>
                <th className="py-2 text-right font-medium">You Own</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-mono tabular-nums dark:divide-slate-800">
              {correlation.bestHedges.slice(0, 8).map((h) => (
                <tr key={h.ticker} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                  <td className="py-2.5 font-sans font-medium text-slate-900 dark:text-slate-100">
                    {h.name} <span className="text-slate-400">({h.ticker})</span>
                  </td>
                  <td className="py-2.5 font-sans text-slate-600 dark:text-slate-400">{h.assetClass}</td>
                  <td
                    className={`py-2.5 text-right font-semibold ${
                      h.corrToPortfolio < 0.15 ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {h.corrToPortfolio.toFixed(2)}
                  </td>
                  <td className="py-2.5 text-right text-slate-600 dark:text-slate-400">{h.crisisCorrToPortfolio.toFixed(2)}</td>
                  <td className="py-2.5 pl-4 font-sans text-slate-700 dark:text-slate-300">{h.label}</td>
                  <td className="py-2.5 text-right text-slate-700 dark:text-slate-300">{h.heldWeightPct.toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
