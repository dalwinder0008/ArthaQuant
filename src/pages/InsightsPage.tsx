import React, { useState } from 'react';
import { ChartCaption, InteractiveLineChart } from '../components/Charts.tsx';
import type { AnomalyItem, RegimeReport, SentimentSummary, VolatilityComparison } from '../engine/types.ts';

export function InsightsPage({
  volTarget,
  onChangeVolTarget,
  volatility,
  regime,
  sentiment,
  anomalies,
}: {
  volTarget: string;
  onChangeVolTarget: (ticker: string) => void;
  volatility: VolatilityComparison;
  regime: RegimeReport;
  sentiment: SentimentSummary | null;
  anomalies: AnomalyItem[];
}) {
  const [selectedVolModel, setSelectedVolModel] = useState<'garchPct' | 'xgbPct' | 'lstmPct' | 'rolling20Pct'>('garchPct');

  const modelLabels: Record<typeof selectedVolModel, string> = {
    garchPct: 'GARCH(1,1)',
    xgbPct: 'XGBoost',
    lstmPct: 'LSTM',
    rolling20Pct: '20D Average',
  };

  return (
    <div className="space-y-6">
      {/* 1. AI Risk / Volatility Forecast */}
      <div className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              AI Risk Forecast (Next 5 Days)
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Predicts upcoming price swings using past market data only (no future-data leakage).
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={volTarget}
              onChange={(e) => onChangeVolTarget(e.target.value)}
              className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            >
              <option value="^NSEI">NIFTY 50 (^NSEI)</option>
              <option value="RELIANCE.NS">RELIANCE.NS</option>
              <option value="GOLDBEES.NS">GOLDBEES.NS</option>
              <option value="BTC-USD">BTC-USD (INR)</option>
            </select>
            <div className="flex items-center gap-1 rounded-md bg-slate-100 p-1 dark:bg-slate-800">
              {(Object.keys(modelLabels) as Array<keyof typeof modelLabels>).map((k) => (
                <button
                  key={k}
                  onClick={() => setSelectedVolModel(k)}
                  className={`rounded px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                    selectedVolModel === k
                      ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-slate-100'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {modelLabels[k]}
                </button>
              ))}
            </div>
          </div>
        </div>

        <InteractiveLineChart
          data={volatility.series}
          series={[
            { key: 'actualVolPct', label: 'Actual Risk', color: '#475569' },
            { key: selectedVolModel, label: modelLabels[selectedVolModel], color: '#1D4ED8', dashed: false },
            { key: 'naivePct', label: 'Simple Baseline', color: '#94A3B8', dashed: true },
          ]}
          yFormat={(v) => `${v.toFixed(1)}%`}
        />

        <div className="mt-5 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500 dark:border-slate-800 dark:text-slate-400">
                <th className="py-2 font-medium">Model</th>
                <th className="py-2 text-right font-medium">Avg Error (RMSE)</th>
                <th className="py-2 text-right font-medium">Direction Acc.</th>
                <th className="py-2 text-right font-medium">Next Forecast</th>
                <th className="py-2 pl-4 font-medium">Comparison</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-mono tabular-nums dark:divide-slate-800">
              {volatility.metrics.map((m) => {
                const isBaseline = m.model === 'Naive (t-1)' || m.model === 'Rolling 20D';
                return (
                  <tr key={m.model} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="py-2.5 font-sans font-medium text-slate-900 dark:text-slate-100">{m.model}</td>
                    <td className="py-2.5 text-right">{m.rmsePct.toFixed(2)}%</td>
                    <td className="py-2.5 text-right">{m.directionalAccPct.toFixed(1)}%</td>
                    <td className="py-2.5 text-right font-semibold">{m.latestForecastVolPct.toFixed(1)}%</td>
                    <td className="py-2.5 pl-4 font-sans">
                      {isBaseline ? (
                        <span className="text-slate-500">Baseline</span>
                      ) : m.beatsBaseline ? (
                        <span className="font-medium text-emerald-700 dark:text-emerald-400">Beats Baseline</span>
                      ) : (
                        <span className="text-amber-700 dark:text-amber-400">Close to Baseline</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <ChartCaption text="Forecasts how bumpy the market will be (volatility) rather than guessing stock prices." />
      </div>

      {/* 2. Market Phase History (HMM) */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-white p-5 lg:col-span-2 dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Market Phase History (NIFTY 50)
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Automatically detects Bull, Sideways, and Bear phases
              </p>
            </div>
            <div className="flex items-center gap-3 text-xs">
              <span className="text-emerald-700 dark:text-emerald-400">
                Bull {(regime.probabilities.Bull * 100).toFixed(0)}%
              </span>
              <span className="text-amber-700 dark:text-amber-400">
                Sideways {(regime.probabilities.Sideways * 100).toFixed(0)}%
              </span>
              <span className="text-rose-700 dark:text-rose-400">
                Bear {(regime.probabilities.Bear * 100).toFixed(0)}%
              </span>
            </div>
          </div>

          <InteractiveLineChart
            data={regime.timeline}
            series={[{ key: 'niftyClose', label: 'NIFTY 50', color: '#0F172A' }]}
            yFormat={(v) => v.toFixed(0)}
            regimeBandKey="regime"
          />
          <ChartCaption text="Green = Bull (calm growth), Amber = Sideways (choppy), Red = Bear (high volatility or decline)." />
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-5 space-y-5 dark:border-slate-800 dark:bg-slate-900">
          <div>
            <h2 className="mb-2 text-sm font-semibold text-slate-900 dark:text-slate-100">Market Phase Behavior</h2>
            <div className="space-y-2 text-xs">
              {regime.stateStats.map((st) => (
                <div key={st.regime} className="flex items-center justify-between border-b border-slate-100 py-2 dark:border-slate-800">
                  <span className="font-medium text-slate-800 dark:text-slate-200">{st.regime}</span>
                  <span className="font-mono tabular-nums text-slate-600 dark:text-slate-400">
                    Ret {st.annReturnPct.toFixed(1)}% · Risk {st.annVolPct.toFixed(1)}% · {st.occupancyPct.toFixed(0)}% time
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h3 className="mb-2 text-xs font-semibold text-slate-700 dark:text-slate-300">Chance of Staying or Switching</h3>
            <table className="w-full text-center font-mono text-[11px] tabular-nums">
              <thead>
                <tr className="text-slate-500">
                  <th />
                  {regime.stateLabels.map((l) => (
                    <th key={l} className="py-1 font-sans font-medium">{l}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {regime.transitionMatrix.map((row, i) => (
                  <tr key={regime.stateLabels[i]} className="border-t border-slate-100 dark:border-slate-800">
                    <td className="py-1.5 text-left font-sans font-medium text-slate-700 dark:text-slate-300">
                      {regime.stateLabels[i]}
                    </td>
                    {row.map((val, j) => (
                      <td key={j} className="py-1.5">
                        {(val * 100).toFixed(0)}%
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* 3. News Sentiment & Unusual Market Moves */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Market News Mood</h2>
            <span className="text-[11px] text-slate-500">Headline sentiment</span>
          </div>
          {!sentiment ? (
            <div className="py-8 text-center text-xs text-slate-500">Loading latest news...</div>
          ) : (
            <div className="space-y-4">
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {sentiment.items.slice(0, 5).map((item) => (
                  <div key={item.id} className="py-2.5 first:pt-0">
                    <div className="flex items-start justify-between gap-3">
                      <div className="text-xs font-medium text-slate-900 dark:text-slate-100">{item.headline}</div>
                      <span
                        className={`shrink-0 font-mono text-xs font-semibold tabular-nums ${
                          item.label === 'Positive'
                            ? 'text-emerald-700 dark:text-emerald-400'
                            : item.label === 'Negative'
                            ? 'text-rose-700 dark:text-rose-400'
                            : 'text-slate-500'
                        }`}
                      >
                        {item.label}
                      </span>
                    </div>
                    <div className="mt-1 text-[11px] text-slate-500">
                      {item.assetName} · {item.source} · {item.publishedAt}
                    </div>
                  </div>
                ))}
              </div>
              <ChartCaption text="News is shown for market context rather than short-term buy/sell signals." />
            </div>
          )}
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Unusual Price or Volume Moves</h2>
            <span className="text-[11px] text-slate-500">Isolation Forest scan</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 dark:border-slate-800 dark:text-slate-400">
                  <th className="py-2 font-medium">Date</th>
                  <th className="py-2 font-medium">Asset</th>
                  <th className="py-2 text-right font-medium">1D Move</th>
                  <th className="py-2 pl-3 font-medium">Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono tabular-nums dark:divide-slate-800">
                {anomalies.slice(0, 6).map((a, idx) => (
                  <tr key={`${a.ticker}_${a.date}_${idx}`} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="py-2 text-slate-600 dark:text-slate-400">{a.date}</td>
                    <td className="py-2 font-sans font-medium text-slate-900 dark:text-slate-100">
                      {a.name} {a.isHeld ? '(Owned)' : ''}
                    </td>
                    <td
                      className={`py-2 text-right ${
                        a.dailyReturnPct >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'
                      }`}
                    >
                      {a.dailyReturnPct >= 0 ? '+' : ''}
                      {a.dailyReturnPct.toFixed(1)}%
                    </td>
                    <td className="py-2 pl-3 font-sans text-[11px] text-slate-600 dark:text-slate-400">{a.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ChartCaption text="Flags rare days with sudden price swings or unusually high trading volume." />
        </div>
      </div>
    </div>
  );
}
