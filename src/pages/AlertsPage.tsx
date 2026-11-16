import React, { useState } from 'react';
import { Download, FileSpreadsheet, Plus, ShieldAlert, Trash2 } from 'lucide-react';
import type { AlertRule, AlertRuleType, TriggeredAlert } from '../engine/types.ts';

export function AlertsPage({
  rules,
  triggered,
  onAddRule,
  onToggleRule,
  onDeleteRule,
  onExportCSV,
  onExportPDF,
}: {
  rules: AlertRule[];
  triggered: TriggeredAlert[];
  onAddRule: (rule: Omit<AlertRule, 'id' | 'userId'>) => Promise<void>;
  onToggleRule: (id: string, active: boolean) => Promise<void>;
  onDeleteRule: (id: string) => Promise<void>;
  onExportCSV: () => void;
  onExportPDF: () => void;
}) {
  const [ruleType, setRuleType] = useState<AlertRuleType>('CRYPTO_WEIGHT_MAX');
  const [target, setTarget] = useState('Crypto');
  const [threshold, setThreshold] = useState('20');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onAddRule({
        ruleType,
        target: target.trim() || ruleType,
        threshold: Math.max(0, parseFloat(threshold) || 0),
        active: true,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* One-Click Exports */}
      <div className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Portfolio Advisory Reports & Data Export</h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Generate a multi-section PDF advisory report (holdings, P&L, risk attribution, HMM regime, trade plan) or download raw holdings CSV.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={onExportCSV}
              className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800 whitespace-nowrap shrink-0"
            >
              <FileSpreadsheet className="h-4 w-4" />
              <span>Export CSV</span>
            </button>
            <button
              onClick={onExportPDF}
              className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-xs font-medium text-white hover:bg-blue-700 whitespace-nowrap shrink-0"
            >
              <Download className="h-4 w-4" />
              <span>Download PDF Report</span>
            </button>
          </div>
        </div>
      </div>

      {/* Triggered Alerts + Rule Builder */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="mb-4 text-sm font-semibold text-slate-900 dark:text-slate-100">
            Active Triggered Alerts ({triggered.length})
          </h2>
          {triggered.length === 0 ? (
            <p className="text-xs text-slate-500 dark:text-slate-400">No rules are currently breached.</p>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {triggered.map((t) => (
                <div key={t.id} className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
                  <div className="flex items-start gap-2.5">
                    <ShieldAlert
                      className={`mt-0.5 h-4 w-4 shrink-0 ${
                        t.severity === 'High' ? 'text-rose-600' : t.severity === 'Warning' ? 'text-amber-600' : 'text-blue-600'
                      }`}
                    />
                    <div>
                      <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                        [{t.severity}] {t.title}
                      </div>
                      <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{t.detail}</div>
                    </div>
                  </div>
                  <span className="font-mono text-xs font-semibold text-slate-900 tabular-nums dark:text-slate-100">
                    {t.metricValue}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"
        >
          <h2 className="mb-4 text-sm font-semibold text-slate-900 dark:text-slate-100">Create Alert Rule</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Rule Type</label>
              <select
                value={ruleType}
                onChange={(e) => {
                  const val = e.target.value as AlertRuleType;
                  setRuleType(val);
                  if (val === 'CRYPTO_WEIGHT_MAX') {
                    setTarget('Crypto');
                    setThreshold('20');
                  } else if (val === 'PORTFOLIO_VOL_MAX') {
                    setTarget('Portfolio Volatility');
                    setThreshold('18');
                  } else if (val === 'REGIME_BEAR') {
                    setTarget('NIFTY 50 HMM');
                    setThreshold('60');
                  } else if (val === 'ANOMALY_HELD') {
                    setTarget('Held Assets');
                    setThreshold('2.0');
                  } else if (val === 'CORRELATION_SPIKE') {
                    setTarget('BTC-USD vs ^NSEI');
                    setThreshold('0.55');
                  } else {
                    setTarget('RELIANCE.NS');
                    setThreshold('25');
                  }
                }}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              >
                <option value="CRYPTO_WEIGHT_MAX">Crypto Weight Above Cap (%)</option>
                <option value="ASSET_WEIGHT_MAX">Single Asset Weight Above Cap (%)</option>
                <option value="PORTFOLIO_VOL_MAX">Annualized Portfolio Volatility Above (%)</option>
                <option value="REGIME_BEAR">Bear Market Regime Probability Above (%)</option>
                <option value="ANOMALY_HELD">Isolation Forest Anomaly on Held Asset (σ)</option>
                <option value="CORRELATION_SPIKE">BTC–Nifty 90D Correlation Spike Above</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Target Scope</label>
              <input
                type="text"
                required
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Threshold</label>
              <input
                type="number"
                step="any"
                min="0"
                required
                value={threshold}
                onChange={(e) => setThreshold(e.target.value)}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </div>
          </div>

          <div className="mt-4 flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-4 py-2 text-xs font-medium text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 whitespace-nowrap shrink-0"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>{saving ? 'Adding...' : 'Save Rule'}</span>
            </button>
          </div>
        </form>
      </div>

      {/* Configured Rules Table */}
      <div className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="mb-3 text-sm font-semibold text-slate-900 dark:text-slate-100">Configured Alert Rules</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500 dark:border-slate-800 dark:text-slate-400">
                <th className="py-2 font-medium">Rule Type</th>
                <th className="py-2 font-medium">Target</th>
                <th className="py-2 text-right font-medium">Threshold</th>
                <th className="py-2 text-center font-medium">Status</th>
                <th className="py-2 text-right font-medium">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {rules.map((r) => (
                <tr key={r.id}>
                  <td className="py-2.5 font-mono text-slate-900 dark:text-slate-100">{r.ruleType}</td>
                  <td className="py-2.5 text-slate-700 dark:text-slate-300">{r.target}</td>
                  <td className="py-2.5 text-right font-mono tabular-nums">{r.threshold}</td>
                  <td className="py-2.5 text-center">
                    <button
                      onClick={() => onToggleRule(r.id, !r.active)}
                      className={`text-xs font-semibold ${
                        r.active ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-400'
                      }`}
                    >
                      {r.active ? 'Active' : 'Paused'}
                    </button>
                  </td>
                  <td className="py-2.5 text-right">
                    <button
                      onClick={() => onDeleteRule(r.id)}
                      aria-label={`Delete alert ${r.id}`}
                      className="rounded p-1 text-slate-400 hover:text-rose-600"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
