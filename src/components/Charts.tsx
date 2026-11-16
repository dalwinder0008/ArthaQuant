import React, { useState } from 'react';
import type { AllocationSlice, FrontierPoint } from '../engine/types.ts';
import { formatINR } from '../engine/alerts.ts';

export function ChartCaption({ text }: { text: string }) {
  return (
    <p className="mt-3 border-t border-slate-200 pt-2.5 text-xs leading-relaxed text-slate-600 dark:border-slate-800 dark:text-slate-400">
      {text}
    </p>
  );
}

export function AllocationDonut({
  slices,
  centerLabel,
  centerValue,
}: {
  slices: AllocationSlice[];
  centerLabel: string;
  centerValue: string;
}) {
  const [hovered, setHovered] = useState<number | null>(null);
  const total = slices.reduce((a, b) => a + b.valueInr, 0) || 1;
  const r = 68;
  const circ = 2 * Math.PI * r;
  let offset = 0;

  return (
    <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-center">
      <div className="relative h-48 w-48 shrink-0">
        <svg viewBox="0 0 180 180" className="h-full w-full -rotate-90">
          <circle cx="90" cy="90" r={r} fill="none" stroke="currentColor" strokeWidth="22" className="text-slate-100 dark:text-slate-800" />
          {slices.map((s, idx) => {
            const frac = s.valueInr / total;
            const dash = frac * circ;
            const curOffset = offset;
            offset += dash;
            const isActive = hovered === idx;
            return (
              <circle
                key={s.label}
                cx="90"
                cy="90"
                r={r}
                fill="none"
                stroke={s.color}
                strokeWidth={isActive ? 26 : 22}
                strokeDasharray={`${Math.max(0, dash - 1.5)} ${circ}`}
                strokeDashoffset={-curOffset}
                className="cursor-pointer transition-all duration-150"
                onMouseEnter={() => setHovered(idx)}
                onMouseLeave={() => setHovered(null)}
              />
            );
          })}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
            {hovered !== null ? slices[hovered]?.label : centerLabel}
          </span>
          <span className="font-mono text-sm font-semibold text-slate-900 tabular-nums dark:text-slate-100">
            {hovered !== null ? `${slices[hovered]?.pct.toFixed(1)}%` : centerValue}
          </span>
        </div>
      </div>

      <div className="w-full flex-1 space-y-2">
        {slices.map((s, idx) => (
          <div
            key={s.label}
            onMouseEnter={() => setHovered(idx)}
            onMouseLeave={() => setHovered(null)}
            className={`flex items-center justify-between rounded-md px-2 py-1.5 text-xs transition-colors ${
              hovered === idx ? 'bg-slate-100 dark:bg-slate-800/70' : ''
            }`}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: s.color }} />
              <span className="truncate font-medium text-slate-800 dark:text-slate-200">{s.label}</span>
            </div>
            <div className="flex items-center gap-3 font-mono tabular-nums shrink-0">
              <span className="text-slate-500 dark:text-slate-400">{formatINR(s.valueInr, true)}</span>
              <span className="w-12 text-right font-semibold text-slate-900 dark:text-slate-100">{s.pct.toFixed(1)}%</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export interface LineSeriesDef {
  key: string;
  label: string;
  color: string;
  dashed?: boolean;
  areaFill?: boolean;
}

export function InteractiveLineChart<T extends { date: string }>({
  data,
  series,
  height = 240,
  yFormat = (v) => v.toFixed(1),
  zeroLine = false,
  regimeBandKey,
}: {
  data: T[];
  series: LineSeriesDef[];
  height?: number;
  yFormat?: (v: number) => string;
  zeroLine?: boolean;
  regimeBandKey?: keyof T;
}) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  if (!data.length) {
    return <div className="flex h-48 items-center justify-center text-xs text-slate-500">No time-series data available.</div>;
  }

  // Downsample for SVG crispness if very long
  const step = Math.max(1, Math.floor(data.length / 180));
  const pts = data.filter((_, i) => i % step === 0 || i === data.length - 1);

  const W = 760;
  const H = height;
  const padL = 52;
  const padR = 16;
  const padT = 14;
  const padB = 26;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  let minY = Infinity;
  let maxY = -Infinity;
  for (const row of pts) {
    for (const s of series) {
      const val = Number((row as Record<string, unknown>)[s.key]);
      if (Number.isFinite(val)) {
        if (val < minY) minY = val;
        if (val > maxY) maxY = val;
      }
    }
  }
  if (!Number.isFinite(minY) || !Number.isFinite(maxY)) {
    minY = 0;
    maxY = 100;
  }
  if (zeroLine) {
    minY = Math.min(minY, 0);
    maxY = Math.max(maxY, 0);
  }
  const span = Math.max(1e-4, maxY - minY);
  const yMin = minY - span * 0.08;
  const yMax = maxY + span * 0.08;

  const xAt = (i: number) => padL + (i / Math.max(1, pts.length - 1)) * plotW;
  const yAt = (v: number) => padT + ((yMax - v) / Math.max(1e-6, yMax - yMin)) * plotH;

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => yMin + f * (yMax - yMin));
  const xTickIdxs = [0, Math.floor((pts.length - 1) * 0.33), Math.floor((pts.length - 1) * 0.66), pts.length - 1];

  const activeRow = hoverIdx !== null ? pts[hoverIdx] : null;

  return (
    <div className="w-full">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex flex-wrap items-center gap-4">
          {series.map((s) => (
            <div key={s.key} className="flex items-center gap-1.5">
              <span
                className="inline-block h-0.5 w-4"
                style={{
                  backgroundColor: s.color,
                  borderTop: s.dashed ? `2px dashed ${s.color}` : undefined,
                }}
              />
              <span className="text-slate-600 dark:text-slate-300">{s.label}</span>
            </div>
          ))}
        </div>
        {activeRow && (
          <div className="flex flex-wrap items-center gap-3 font-mono text-[11px] tabular-nums text-slate-700 dark:text-slate-200">
            <span className="text-slate-500">{activeRow.date}</span>
            {series.map((s) => (
              <span key={s.key} style={{ color: s.color }}>
                {s.label}: {yFormat(Number((activeRow as Record<string, unknown>)[s.key]))}
              </span>
            ))}
          </div>
        )}
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full select-none overflow-visible"
        onMouseLeave={() => setHoverIdx(null)}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const relX = ((e.clientX - rect.left) / rect.width) * W;
          const idx = Math.round(((relX - padL) / plotW) * (pts.length - 1));
          setHoverIdx(Math.max(0, Math.min(pts.length - 1, idx)));
        }}
      >
        {/* Optional regime background bands */}
        {regimeBandKey &&
          pts.map((pt, i) => {
            if (i === pts.length - 1) return null;
            const reg = String((pt as Record<string, unknown>)[String(regimeBandKey)]);
            const fill =
              reg === 'Bull' ? 'rgba(22, 163, 74, 0.08)' : reg === 'Bear' ? 'rgba(220, 38, 38, 0.11)' : 'rgba(217, 119, 6, 0.07)';
            const x1 = xAt(i);
            const x2 = xAt(i + 1);
            return <rect key={i} x={x1} y={padT} width={Math.max(1, x2 - x1)} height={plotH} fill={fill} />;
          })}

        {/* Grid lines */}
        {yTicks.map((tv, i) => {
          const y = yAt(tv);
          return (
            <g key={i}>
              <line x1={padL} x2={W - padR} y1={y} y2={y} stroke="currentColor" className="text-slate-200 dark:text-slate-800" strokeWidth="1" />
              <text x={padL - 8} y={y + 3} textAnchor="end" className="fill-slate-500 font-mono text-[10px]">
                {yFormat(tv)}
              </text>
            </g>
          );
        })}

        {zeroLine && yMin < 0 && yMax > 0 && (
          <line x1={padL} x2={W - padR} y1={yAt(0)} y2={yAt(0)} stroke="#64748B" strokeDasharray="3 3" strokeWidth="1" />
        )}

        {/* Series paths */}
        {series.map((s) => {
          const d = pts
            .map((pt, i) => {
              const v = Number((pt as Record<string, unknown>)[s.key]);
              return `${i === 0 ? 'M' : 'L'} ${xAt(i).toFixed(1)} ${yAt(v).toFixed(1)}`;
            })
            .join(' ');
          return (
            <g key={s.key}>
              {s.areaFill && (
                <path
                  d={`${d} L ${xAt(pts.length - 1).toFixed(1)} ${yAt(zeroLine ? 0 : yMin).toFixed(1)} L ${xAt(0).toFixed(1)} ${yAt(zeroLine ? 0 : yMin).toFixed(1)} Z`}
                  fill={s.color}
                  fillOpacity="0.10"
                />
              )}
              <path
                d={d}
                fill="none"
                stroke={s.color}
                strokeWidth="1.85"
                strokeDasharray={s.dashed ? '5 4' : undefined}
              />
            </g>
          );
        })}

        {/* X Axis labels */}
        {Array.from(new Set(xTickIdxs)).map((idx) => (
          <text key={idx} x={xAt(idx)} y={H - 6} textAnchor="middle" className="fill-slate-500 font-mono text-[10px]">
            {pts[idx]?.date.slice(0, 7)}
          </text>
        ))}

        {/* Hover crosshair */}
        {hoverIdx !== null && activeRow && (
          <g>
            <line
              x1={xAt(hoverIdx)}
              x2={xAt(hoverIdx)}
              y1={padT}
              y2={H - padB}
              stroke="#94A3B8"
              strokeWidth="1"
              strokeDasharray="3 3"
            />
            {series.map((s) => {
              const v = Number((activeRow as Record<string, unknown>)[s.key]);
              return <circle key={s.key} cx={xAt(hoverIdx)} cy={yAt(v)} r="3.5" fill={s.color} stroke="#FFFFFF" strokeWidth="1.2" />;
            })}
          </g>
        )}
      </svg>
    </div>
  );
}

export function RiskVsWeightBars({
  items,
}: {
  items: Array<{ ticker: string; name: string; capitalWeightPct: number; riskContributionPct: number }>;
}) {
  const maxVal = Math.max(25, ...items.flatMap((i) => [i.capitalWeightPct, i.riskContributionPct]));
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-5 text-xs text-slate-600 dark:text-slate-400">
        <div className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-slate-400 dark:bg-slate-600" />
          <span>Capital Weight (%)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-blue-600" />
          <span>Variance Risk Share (%)</span>
        </div>
      </div>

      {items.map((item) => {
        const riskHeavy = item.riskContributionPct > item.capitalWeightPct * 1.35;
        return (
          <div key={item.ticker} className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-slate-800 dark:text-slate-200">{item.name}</span>
              <span className="font-mono tabular-nums text-slate-600 dark:text-slate-300">
                Cap {item.capitalWeightPct.toFixed(1)}% · Risk{' '}
                <strong className={riskHeavy ? 'text-rose-600 dark:text-rose-400' : 'text-slate-900 dark:text-slate-100'}>
                  {item.riskContributionPct.toFixed(1)}%
                </strong>
              </span>
            </div>
            <div className="space-y-1">
              <div className="h-2 w-full rounded-sm bg-slate-100 dark:bg-slate-800">
                <div
                  className="h-2 rounded-sm bg-slate-400 dark:bg-slate-500"
                  style={{ width: `${Math.min(100, (item.capitalWeightPct / maxVal) * 100)}%` }}
                />
              </div>
              <div className="h-2 w-full rounded-sm bg-slate-100 dark:bg-slate-800">
                <div
                  className={`h-2 rounded-sm ${riskHeavy ? 'bg-rose-600' : 'bg-blue-600'}`}
                  style={{ width: `${Math.min(100, (item.riskContributionPct / maxVal) * 100)}%` }}
                />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function CorrelationHeatmap({
  tickers,
  matrix,
}: {
  tickers: string[];
  matrix: number[][];
}) {
  const [hovered, setHovered] = useState<{ i: number; j: number } | null>(null);
  const short = (t: string) => t.replace('.NS', '').replace('-USD', '').replace('^', '').replace('=X', '');

  const cellColor = (val: number) => {
    if (val >= 0) {
      const alpha = Math.min(0.88, Math.max(0.06, val * 0.85));
      return `rgba(29, 78, 216, ${alpha.toFixed(2)})`;
    }
    const alpha = Math.min(0.88, Math.max(0.08, Math.abs(val) * 0.85));
    return `rgba(220, 38, 38, ${alpha.toFixed(2)})`;
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
        <span>Ordered by hierarchical correlation distance</span>
        {hovered ? (
          <span className="font-mono font-medium text-slate-900 tabular-nums dark:text-slate-100">
            {short(tickers[hovered.i])} × {short(tickers[hovered.j])}: {matrix[hovered.i][hovered.j].toFixed(2)}
          </span>
        ) : (
          <span>Hover any cell to inspect pair</span>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[11px] font-mono tabular-nums">
          <thead>
            <tr>
              <th className="p-1.5 text-left text-slate-500" />
              {tickers.map((t) => (
                <th key={t} className="p-1 text-center font-medium text-slate-600 dark:text-slate-300">
                  {short(t)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tickers.map((rowT, i) => (
              <tr key={rowT}>
                <td className="whitespace-nowrap pr-2 py-1 font-medium text-slate-700 dark:text-slate-300">{short(rowT)}</td>
                {tickers.map((colT, j) => {
                  const v = matrix[i][j];
                  const highContrast = Math.abs(v) > 0.48;
                  return (
                    <td
                      key={colT}
                      onMouseEnter={() => setHovered({ i, j })}
                      onMouseLeave={() => setHovered(null)}
                      style={{ backgroundColor: cellColor(v) }}
                      className={`border border-white/60 p-1.5 text-center transition-opacity dark:border-slate-900 ${
                        highContrast ? 'text-white font-semibold' : 'text-slate-800 dark:text-slate-200'
                      }`}
                    >
                      {v.toFixed(2)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function EfficientFrontierChart({
  frontier,
  currentPoint,
  minVariancePoint,
  maxSharpePoint,
  riskParityPoint,
  recommendedPoint,
}: {
  frontier: FrontierPoint[];
  currentPoint: FrontierPoint;
  minVariancePoint: FrontierPoint;
  maxSharpePoint: FrontierPoint;
  riskParityPoint: FrontierPoint;
  recommendedPoint: FrontierPoint;
}) {
  const W = 720;
  const H = 260;
  const padL = 52;
  const padR = 24;
  const padT = 18;
  const padB = 34;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const allPts = [...frontier, currentPoint, minVariancePoint, maxSharpePoint, riskParityPoint, recommendedPoint];
  const minX = Math.max(0, Math.min(...allPts.map((p) => p.volatilityPct)) - 2);
  const maxX = Math.max(...allPts.map((p) => p.volatilityPct)) + 2;
  const minY = Math.min(...allPts.map((p) => p.expectedReturnPct)) - 1.5;
  const maxY = Math.max(...allPts.map((p) => p.expectedReturnPct)) + 1.5;

  const xAt = (v: number) => padL + ((v - minX) / Math.max(1e-4, maxX - minX)) * plotW;
  const yAt = (r: number) => padT + ((maxY - r) / Math.max(1e-4, maxY - minY)) * plotH;

  const sortedFrontier = [...frontier].sort((a, b) => a.volatilityPct - b.volatilityPct);
  const pathD = sortedFrontier
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${xAt(p.volatilityPct).toFixed(1)} ${yAt(p.expectedReturnPct).toFixed(1)}`)
    .join(' ');

  const markers = [
    { label: 'Current', pt: currentPoint, color: '#DC2626' },
    { label: 'Min Variance', pt: minVariancePoint, color: '#475569' },
    { label: 'Risk Parity', pt: riskParityPoint, color: '#0D9488' },
    { label: 'Max Sharpe', pt: maxSharpePoint, color: '#1D4ED8' },
    { label: 'Recommended', pt: recommendedPoint, color: '#16A34A' },
  ];

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-4 text-xs">
        {markers.map((m) => (
          <div key={m.label} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: m.color }} />
            <span className="text-slate-700 dark:text-slate-300">
              {m.label} <span className="font-mono text-slate-500">({m.pt.volatilityPct.toFixed(1)}% vol, {m.pt.expectedReturnPct.toFixed(1)}% ret)</span>
            </span>
          </div>
        ))}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full overflow-visible">
        {[0, 0.25, 0.5, 0.75, 1].map((f, i) => {
          const val = minY + f * (maxY - minY);
          const y = yAt(val);
          return (
            <g key={i}>
              <line x1={padL} x2={W - padR} y1={y} y2={y} stroke="currentColor" className="text-slate-200 dark:text-slate-800" />
              <text x={padL - 8} y={y + 3} textAnchor="end" className="fill-slate-500 font-mono text-[10px]">
                {val.toFixed(1)}%
              </text>
            </g>
          );
        })}
        {[0, 0.25, 0.5, 0.75, 1].map((f, i) => {
          const val = minX + f * (maxX - minX);
          const x = xAt(val);
          return (
            <text key={i} x={x} y={H - 8} textAnchor="middle" className="fill-slate-500 font-mono text-[10px]">
              {val.toFixed(1)}%
            </text>
          );
        })}
        <text x={W / 2} y={H} textAnchor="middle" className="fill-slate-400 text-[10px]">
          Annualized Volatility (%)
        </text>
        <path d={pathD} fill="none" stroke="#3B82F6" strokeWidth="2" />
        {markers.map((m) => (
          <g key={m.label}>
            <circle
              cx={xAt(m.pt.volatilityPct)}
              cy={yAt(m.pt.expectedReturnPct)}
              r={m.label === 'Recommended' || m.label === 'Current' ? 6 : 4.5}
              fill={m.color}
              stroke="#FFFFFF"
              strokeWidth="1.5"
            />
          </g>
        ))}
      </svg>
    </div>
  );
}
