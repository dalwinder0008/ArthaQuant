import React, { useState } from 'react';
import type {
  AnomalyItem,
  CorrelationReport,
  RegimeReport,
  RiskMetrics,
  SentimentSummary,
  VolatilityComparison,
} from '../engine/types.ts';
import { CorrelationPage } from './CorrelationPage.tsx';
import { InsightsPage } from './InsightsPage.tsx';
import { RiskPage } from './RiskPage.tsx';

type AnalysisSubTab = 'risk' | 'correlation' | 'ai';

export function AnalysisPage({
  risk,
  correlation,
  volTarget,
  onChangeVolTarget,
  volatility,
  regime,
  sentiment,
  anomalies,
}: {
  risk: RiskMetrics;
  correlation: CorrelationReport;
  volTarget: string;
  onChangeVolTarget: (ticker: string) => void;
  volatility: VolatilityComparison;
  regime: RegimeReport;
  sentiment: SentimentSummary | null;
  anomalies: AnomalyItem[];
}) {
  const [subTab, setSubTab] = useState<AnalysisSubTab>('risk');

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
        <div>
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Risk &amp; AI Analysis</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Switch between downside risk, asset correlation, and AI market forecasts.
          </p>
        </div>

        <div className="flex items-center gap-1 rounded-md bg-slate-100 p-1 dark:bg-slate-800">
          {(
            [
              ['risk', 'Risk & Drawdown'],
              ['correlation', 'Diversification & Hedges'],
              ['ai', 'AI Forecasts & News'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setSubTab(id)}
              className={`rounded px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                subTab === id
                  ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-slate-100'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {subTab === 'risk' && <RiskPage risk={risk} />}
      {subTab === 'correlation' && <CorrelationPage correlation={correlation} />}
      {subTab === 'ai' && (
        <InsightsPage
          volTarget={volTarget}
          onChangeVolTarget={onChangeVolTarget}
          volatility={volatility}
          regime={regime}
          sentiment={sentiment}
          anomalies={anomalies}
        />
      )}
    </div>
  );
}
