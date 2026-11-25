import React, { useRef, useState } from 'react';
import { Check, FileSpreadsheet, Mail, Pencil, Plus, RefreshCw, Trash2, Upload, X } from 'lucide-react';
import { AllocationDonut, ChartCaption } from '../components/Charts.tsx';
import { formatINR, formatPct } from '../engine/alerts.ts';
import type { Holding, ManualAsset, PortfolioSummary } from '../engine/types.ts';
import { INVESTABLE_ASSETS } from '../engine/universe.ts';
import { clearCachedGmailAccessToken, getCachedGmailAccessToken } from '../lib/firebase.ts';
import {
  GmailAuthExpiredError,
  parseBrokerCsvTrades,
  scanGmailForTrades,
  type ExtractedTradeCandidate,
} from '../services/gmailTradeExtractor.ts';

type AddPanelTab = 'manual' | 'import' | 'realestate';

export function PortfolioPage({
  summary,
  holdings,
  manualAssets,
  isAuthenticated,
  signingIn,
  onSignInGoogle,
  hasGmailToken,
  onConnectGmail,
  onAddHolding,
  onBatchAddHoldings,
  onUpdateHolding,
  onDeleteHolding,
  onAddManualAsset,
  onDeleteManualAsset,
}: {
  summary: PortfolioSummary;
  holdings: Holding[];
  manualAssets: ManualAsset[];
  isAuthenticated: boolean;
  signingIn: boolean;
  onSignInGoogle: () => Promise<void>;
  hasGmailToken: boolean;
  onConnectGmail: () => Promise<string>;
  onAddHolding: (input: Omit<Holding, 'id' | 'userId'>) => Promise<void>;
  onBatchAddHoldings: (inputs: Array<Omit<Holding, 'id' | 'userId'>>) => Promise<void>;
  onUpdateHolding: (id: string, patch: { quantity: number; buyPrice: number; buyDate: string; notes?: string }) => Promise<void>;
  onDeleteHolding: (id: string) => Promise<void>;
  onAddManualAsset: (input: Omit<ManualAsset, 'id' | 'userId'>) => Promise<void>;
  onDeleteManualAsset: (id: string) => Promise<void>;
}) {
  const [allocDim, setAllocDim] = useState<'class' | 'currency' | 'bucket'>('class');
  const [addTab, setAddTab] = useState<AddPanelTab>('manual');

  // Add Market Holding Form
  const [selectedTicker, setSelectedTicker] = useState(INVESTABLE_ASSETS[0].ticker);
  const [quantity, setQuantity] = useState('10');
  const [buyPrice, setBuyPrice] = useState('1250');
  const [buyDate, setBuyDate] = useState('2024-06-15');
  const [notes, setNotes] = useState('');
  const [savingHolding, setSavingHolding] = useState(false);

  // Inline table editing
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editQty, setEditQty] = useState('');
  const [editPrice, setEditPrice] = useState('');
  const [editDate, setEditDate] = useState('');

  // Manual Real Estate Form
  const [reName, setReName] = useState('');
  const [reCategory, setReCategory] = useState<ManualAsset['category']>('Residential Real Estate');
  const [reCurrent, setReCurrent] = useState('850000');
  const [rePurchase, setRePurchase] = useState('720000');
  const [reGrowth, setReGrowth] = useState('7.5');
  const [reYield, setReYield] = useState('3.2');
  const [reDate, setReDate] = useState('2024-01-15');
  const [savingRe, setSavingRe] = useState(false);

  // Gmail & Broker CSV import state
  const csvInputRef = useRef<HTMLInputElement | null>(null);
  const [scanningGmail, setScanningGmail] = useState(false);
  const [importingBatch, setImportingBatch] = useState(false);
  const [importNotice, setImportNotice] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<ExtractedTradeCandidate[]>([]);

  const handleAddHolding = async (e: React.FormEvent) => {
    e.preventDefault();
    const meta = INVESTABLE_ASSETS.find((a) => a.ticker === selectedTicker);
    if (!meta) return;
    const q = parseFloat(quantity);
    const p = parseFloat(buyPrice);
    if (!Number.isFinite(q) || q <= 0 || !Number.isFinite(p) || p <= 0) return;

    setSavingHolding(true);
    try {
      await onAddHolding({
        ticker: meta.ticker,
        name: meta.name,
        assetClass: meta.assetClass,
        currency: meta.currency,
        quantity: q,
        buyPrice: p,
        buyDate,
        notes,
      });
      setNotes('');
    } finally {
      setSavingHolding(false);
    }
  };

  const handleAddRealEstate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reName.trim()) return;
    setSavingRe(true);
    try {
      await onAddManualAsset({
        name: reName.trim(),
        category: reCategory,
        currentValue: Math.max(1, parseFloat(reCurrent) || 0),
        purchaseValue: Math.max(1, parseFloat(rePurchase) || 0),
        growthPct: parseFloat(reGrowth) || 0,
        rentalYieldPct: parseFloat(reYield) || 0,
        asOfDate: reDate,
      });
      setReName('');
    } finally {
      setSavingRe(false);
    }
  };

  const handleSyncFromGmail = async () => {
    setScanningGmail(true);
    setImportError(null);
    setImportNotice(null);
    try {
      let token = getCachedGmailAccessToken();
      if (!token) {
        token = await onConnectGmail();
      }

      let result;
      try {
        result = await scanGmailForTrades(token, holdings);
      } catch (err) {
        if (err instanceof GmailAuthExpiredError) {
          clearCachedGmailAccessToken();
          const refreshedToken = await onConnectGmail();
          result = await scanGmailForTrades(refreshedToken, holdings);
        } else {
          throw err;
        }
      }

      setCandidates(result.trades);
      if (result.trades.length > 0) {
        const pdfNote =
          result.encryptedContractNotesCount > 0
            ? ` (${result.encryptedContractNotesCount} password-protected PDF contract note${result.encryptedContractNotesCount > 1 ? 's' : ''} skipped — use Broker CSV for full history).`
            : '.';
        setImportNotice(
          `Found ${result.trades.length} buy trade${result.trades.length === 1 ? '' : 's'} from ${result.scannedMessages} broker email${result.scannedMessages === 1 ? '' : 's'}${pdfNote}`
        );
      } else {
        const pdfHint =
          result.encryptedContractNotesCount > 0
            ? ` Found ${result.encryptedContractNotesCount} encrypted PDF contract note(s) — export your Tradebook CSV from Groww/Zerodha and upload it below.`
            : ' Try uploading a Groww or Zerodha CSV instead.';
        setImportNotice(`Scanned ${result.scannedMessages} broker emails; no plain-text buy orders matched.${pdfHint}`);
      }
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Unable to scan Gmail for broker trade emails.');
    } finally {
      setScanningGmail(false);
    }
  };

  const handleCsvFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setImportError(null);
    setImportNotice(null);
    try {
      const text = await file.text();
      const parsed = parseBrokerCsvTrades(text, file.name, holdings);
      setCandidates(parsed);
      setImportNotice(
        parsed.length > 0
          ? `Loaded ${parsed.length} buy position${parsed.length === 1 ? '' : 's'} from ${file.name}. Review and confirm below.`
          : `No buy rows found in ${file.name}.`
      );
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Failed to parse broker CSV file.');
    }
  };

  const updateCandidate = (tempId: string, patch: Partial<ExtractedTradeCandidate>) => {
    setCandidates((prev) => prev.map((c) => (c.tempId === tempId ? { ...c, ...patch } : c)));
  };

  const handleConfirmImport = async () => {
    const selectedRows = candidates.filter((c) => c.selected);
    if (selectedRows.length === 0) return;

    setImportingBatch(true);
    setImportError(null);
    try {
      await onBatchAddHoldings(
        selectedRows.map((c) => ({
          ticker: c.ticker,
          name: c.name,
          assetClass: c.assetClass,
          currency: c.currency,
          quantity: c.quantity,
          buyPrice: c.buyPrice,
          buyDate: c.buyDate,
          notes: c.notes,
        }))
      );
      setImportNotice(`Saved ${selectedRows.length} holding${selectedRows.length === 1 ? '' : 's'} to your portfolio.`);
      setCandidates([]);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Failed to save imported holdings.');
    } finally {
      setImportingBatch(false);
    }
  };

  const slices =
    allocDim === 'class'
      ? summary.byAssetClass
      : allocDim === 'currency'
      ? summary.byCurrency
      : summary.byRiskBucket;

  return (
    <div className="space-y-6">
      {!isAuthenticated && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
          <span>
            Guest mode active — changes are saved in this browser and sync automatically when you sign in.
          </span>
          <button
            type="button"
            onClick={onSignInGoogle}
            disabled={signingIn}
            className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 shadow-2xs transition-colors hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:hover:bg-slate-800 whitespace-nowrap shrink-0"
          >
            <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 48 48" aria-hidden="true">
              <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
              <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
              <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
              <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
            </svg>
            <span>{signingIn ? 'Signing in...' : 'Sign in with Google'}</span>
          </button>
        </div>
      )}

      {/* Top Split: Allocation Chart + Unified Add/Import Panel */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Portfolio Breakdown</h2>
            <div className="flex items-center gap-1 rounded-md bg-slate-100 p-1 dark:bg-slate-800">
              {(
                [
                  ['class', 'By Type'],
                  ['currency', 'By Currency'],
                  ['bucket', 'By Risk'],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setAllocDim(key)}
                  className={`rounded px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                    allocDim === key
                      ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-slate-100'
                      : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <AllocationDonut
            slices={slices}
            centerLabel="Total Wealth"
            centerValue={formatINR(summary.totalValueInr, true)}
          />
          <ChartCaption text="USD assets (Crypto, Gold Futures) are automatically converted into INR." />
        </div>

        {/* Unified Add / Import Card */}
        <div className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Add or Import Assets</h2>
            <div className="flex items-center gap-1 rounded-md bg-slate-100 p-1 dark:bg-slate-800">
              {(
                [
                  ['manual', 'Add Asset'],
                  ['import', 'Gmail / CSV'],
                  ['realestate', 'Real Estate'],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setAddTab(key)}
                  className={`rounded px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                    addTab === key
                      ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-slate-100'
                      : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {addTab === 'manual' && (
            <form onSubmit={handleAddHolding} className="space-y-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
                    Select Stock, Gold, Crypto, or REIT
                  </label>
                  <select
                    value={selectedTicker}
                    onChange={(e) => setSelectedTicker(e.target.value)}
                    className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  >
                    {INVESTABLE_ASSETS.map((a) => (
                      <option key={a.ticker} value={a.ticker}>
                        {a.name} ({a.ticker} · {a.assetClass})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Quantity</label>
                  <input
                    type="number"
                    step="any"
                    min="0.0001"
                    required
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
                    Buy Price (INR)
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="0.01"
                    required
                    value={buyPrice}
                    onChange={(e) => setBuyPrice(e.target.value)}
                    className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Buy Date</label>
                  <input
                    type="date"
                    required
                    value={buyDate}
                    onChange={(e) => setBuyDate(e.target.value)}
                    className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
                    Note (optional)
                  </label>
                  <input
                    type="text"
                    maxLength={120}
                    placeholder="e.g., Long-term hold"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                </div>
              </div>

              <div className="pt-1 flex justify-end">
                <button
                  type="submit"
                  disabled={savingHolding}
                  className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap shrink-0"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>{savingHolding ? 'Saving...' : 'Add Holding'}</span>
                </button>
              </div>
            </form>
          )}

          {addTab === 'import' && (
            <div className="space-y-4">
              <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                Scan read-only broker confirmation emails (Groww, Zerodha, Upstox, CDSL, CoinDCX) from Gmail, or upload a broker CSV file. You can review every row before saving.
              </p>

              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  onClick={handleSyncFromGmail}
                  disabled={scanningGmail}
                  className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-800 shadow-2xs transition-colors hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:hover:bg-slate-800 whitespace-nowrap shrink-0"
                >
                  {scanningGmail ? (
                    <RefreshCw className="h-3.5 w-3.5 animate-spin text-blue-600" />
                  ) : (
                    <Mail className="h-3.5 w-3.5 text-blue-600" />
                  )}
                  <span>
                    {scanningGmail
                      ? 'Scanning Gmail...'
                      : hasGmailToken
                      ? 'Sync Trades from Gmail'
                      : 'Connect Gmail & Sync'}
                  </span>
                </button>

                <input
                  ref={csvInputRef}
                  type="file"
                  accept=".csv,text/csv"
                  onChange={handleCsvFileChange}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => csvInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800 whitespace-nowrap shrink-0"
                >
                  <Upload className="h-3.5 w-3.5" />
                  <span>Upload Broker CSV</span>
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500 dark:text-slate-400">
                <span className="inline-flex items-center gap-1">
                  <FileSpreadsheet className="h-3 w-3" /> Supports Groww &amp; Zerodha Holdings / Tradebook CSV
                </span>
              </div>

              {importError && (
                <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-200">
                  {importError}
                </div>
              )}

              {importNotice && (
                <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
                  {importNotice}
                </div>
              )}
            </div>
          )}

          {addTab === 'realestate' && (
            <form onSubmit={handleAddRealEstate} className="space-y-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Property Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g., Home / Commercial Flat"
                    value={reName}
                    onChange={(e) => setReName(e.target.value)}
                    className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Category</label>
                  <select
                    value={reCategory}
                    onChange={(e) => setReCategory(e.target.value as ManualAsset['category'])}
                    className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  >
                    <option value="Residential Real Estate">Residential Real Estate</option>
                    <option value="Commercial Real Estate">Commercial Real Estate</option>
                    <option value="Land / Plot">Land / Plot</option>
                    <option value="Other Real Asset">Other Real Asset</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Current Value (INR)</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={reCurrent}
                    onChange={(e) => setReCurrent(e.target.value)}
                    className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Purchase Cost (INR)</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={rePurchase}
                    onChange={(e) => setRePurchase(e.target.value)}
                    className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Yearly Growth (%)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={reGrowth}
                    onChange={(e) => setReGrowth(e.target.value)}
                    className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Rental Yield (%)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={reYield}
                    onChange={(e) => setReYield(e.target.value)}
                    className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Purchase Date</label>
                  <input
                    type="date"
                    value={reDate}
                    onChange={(e) => setReDate(e.target.value)}
                    className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                </div>
              </div>
              <div className="pt-1 flex justify-end">
                <button
                  type="submit"
                  disabled={savingRe}
                  className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-4 py-2 text-xs font-medium text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200 whitespace-nowrap shrink-0"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>{savingRe ? 'Saving...' : 'Add Property'}</span>
                </button>
              </div>
            </form>
          )}
        </div>
      </div>

      {/* Full-Width Review Table when trades are extracted */}
      {candidates.length > 0 && (
        <div className="rounded-lg border border-blue-200 bg-white p-5 dark:border-blue-900/60 dark:bg-slate-900">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Review Extracted Positions ({candidates.filter((c) => c.selected).length} of {candidates.length} selected)
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setCandidates([])}
                className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Discard
              </button>
              <button
                type="button"
                disabled={importingBatch || candidates.every((c) => !c.selected)}
                onClick={handleConfirmImport}
                className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                <Check className="h-3.5 w-3.5" />
                <span>
                  {importingBatch
                    ? 'Saving...'
                    : `Save Selected (${candidates.filter((c) => c.selected).length})`}
                </span>
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 dark:border-slate-800 dark:text-slate-400">
                  <th className="py-2 pr-2 font-medium">Use</th>
                  <th className="py-2 pr-3 font-medium">Source</th>
                  <th className="py-2 pr-3 font-medium">Asset</th>
                  <th className="py-2 pr-3 text-right font-medium">Qty</th>
                  <th className="py-2 pr-3 text-right font-medium">Buy Price (INR)</th>
                  <th className="py-2 pr-3 text-right font-medium">Buy Date</th>
                  <th className="py-2 text-right font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono tabular-nums dark:divide-slate-800">
                {candidates.map((row) => (
                  <tr key={row.tempId} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="py-2 pr-2">
                      <input
                        type="checkbox"
                        checked={row.selected}
                        onChange={(e) => updateCandidate(row.tempId, { selected: e.target.checked })}
                        className="h-3.5 w-3.5 rounded border-slate-300 text-blue-600"
                      />
                    </td>
                    <td className="py-2 pr-3 font-sans">
                      <div className="font-medium text-slate-800 dark:text-slate-200">{row.broker}</div>
                      <div className="max-w-[160px] truncate text-[11px] text-slate-500" title={row.sourceSubject}>
                        {row.sourceSubject}
                      </div>
                    </td>
                    <td className="py-2 pr-3 font-sans">
                      <select
                        value={row.ticker}
                        onChange={(e) => {
                          const nextTicker = e.target.value;
                          const meta = INVESTABLE_ASSETS.find((a) => a.ticker === nextTicker);
                          if (meta) {
                            updateCandidate(row.tempId, {
                              ticker: meta.ticker,
                              name: meta.name,
                              assetClass: meta.assetClass,
                              currency: meta.currency,
                              isSupportedInUniverse: true,
                            });
                          }
                        }}
                        className="w-full min-w-[180px] rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                      >
                        {!row.isSupportedInUniverse && (
                          <option value={row.ticker}>
                            {row.ticker} — {row.name} (Custom)
                          </option>
                        )}
                        {INVESTABLE_ASSETS.map((a) => (
                          <option key={a.ticker} value={a.ticker}>
                            {a.ticker} — {a.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-2 pr-3 text-right">
                      <input
                        type="number"
                        step="any"
                        min="0.0001"
                        value={row.quantity}
                        onChange={(e) =>
                          updateCandidate(row.tempId, {
                            quantity: Math.max(0.0001, parseFloat(e.target.value) || 0),
                          })
                        }
                        className="w-20 rounded border border-slate-300 px-1.5 py-1 text-right text-xs dark:border-slate-700 dark:bg-slate-950"
                      />
                    </td>
                    <td className="py-2 pr-3 text-right">
                      <input
                        type="number"
                        step="any"
                        min="0.01"
                        value={row.buyPrice}
                        onChange={(e) =>
                          updateCandidate(row.tempId, {
                            buyPrice: Math.max(0.01, parseFloat(e.target.value) || 0),
                          })
                        }
                        className="w-24 rounded border border-slate-300 px-1.5 py-1 text-right text-xs dark:border-slate-700 dark:bg-slate-950"
                      />
                    </td>
                    <td className="py-2 pr-3 text-right">
                      <input
                        type="date"
                        value={row.buyDate}
                        onChange={(e) => updateCandidate(row.tempId, { buyDate: e.target.value })}
                        className="rounded border border-slate-300 px-1.5 py-1 text-xs dark:border-slate-700 dark:bg-slate-950"
                      />
                    </td>
                    <td className="py-2 text-right font-sans text-[11px]">
                      {row.alreadyExists ? (
                        <span className="text-amber-600 dark:text-amber-400">Duplicate</span>
                      ) : !row.isSupportedInUniverse ? (
                        <span className="text-slate-500">Custom</span>
                      ) : (
                        <span className="text-emerald-700 dark:text-emerald-400">Ready</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Market Holdings Table */}
      <div className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Your Market Holdings</h2>
          <span className="font-mono text-xs text-slate-500 tabular-nums">
            {summary.valuedHoldings.length} assets · {formatINR(summary.liquidValueInr)}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500 dark:border-slate-800 dark:text-slate-400">
                <th className="py-2.5 font-medium">Asset</th>
                <th className="py-2.5 font-medium">Category</th>
                <th className="py-2.5 text-right font-medium">Qty · Avg Cost</th>
                <th className="py-2.5 text-right font-medium">Live Price</th>
                <th className="py-2.5 text-right font-medium">Value</th>
                <th className="py-2.5 text-right font-medium">P&amp;L</th>
                <th className="py-2.5 text-right font-medium">Share</th>
                <th className="py-2.5 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-mono tabular-nums dark:divide-slate-800">
              {summary.valuedHoldings.map((h) => {
                const isEditing = editingId === h.id;
                return (
                  <tr key={h.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="py-2.5 pr-3 font-sans">
                      <div className="font-medium text-slate-900 dark:text-slate-100">{h.name}</div>
                      <div className="text-[11px] text-slate-500">
                        {h.ticker} · Bought{' '}
                        {isEditing ? (
                          <input
                            type="date"
                            value={editDate}
                            onChange={(e) => setEditDate(e.target.value)}
                            className="ml-1 rounded border border-slate-300 px-1 py-0.5 text-[11px] dark:border-slate-700 dark:bg-slate-950"
                          />
                        ) : (
                          h.buyDate
                        )}
                      </div>
                    </td>
                    <td className="py-2.5 font-sans text-slate-600 dark:text-slate-400">{h.assetClass}</td>
                    <td className="py-2.5 text-right">
                      {isEditing ? (
                        <div className="inline-flex items-center gap-1">
                          <input
                            type="number"
                            step="any"
                            value={editQty}
                            onChange={(e) => setEditQty(e.target.value)}
                            aria-label="Quantity"
                            className="w-16 rounded border border-slate-300 px-1.5 py-1 text-right text-xs dark:border-slate-700 dark:bg-slate-950"
                          />
                          <span className="text-slate-400">×</span>
                          <input
                            type="number"
                            step="any"
                            value={editPrice}
                            onChange={(e) => setEditPrice(e.target.value)}
                            aria-label="Buy price"
                            className="w-20 rounded border border-slate-300 px-1.5 py-1 text-right text-xs dark:border-slate-700 dark:bg-slate-950"
                          />
                        </div>
                      ) : (
                        <div>
                          <span className="text-slate-900 dark:text-slate-100">
                            {h.quantity.toFixed(h.quantity < 1 ? 4 : 2)}
                          </span>
                          <span className="text-slate-400"> @ {formatINR(h.buyPrice)}</span>
                        </div>
                      )}
                    </td>
                    <td className="py-2.5 text-right text-slate-700 dark:text-slate-300">{formatINR(h.latestPriceInr)}</td>
                    <td className="py-2.5 text-right font-semibold text-slate-900 dark:text-slate-100">
                      {formatINR(h.currentValueInr)}
                    </td>
                    <td
                      className={`py-2.5 text-right ${
                        h.pnlInr >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'
                      }`}
                    >
                      {formatINR(h.pnlInr)} ({formatPct(h.pnlPct, 1, true)})
                    </td>
                    <td className="py-2.5 text-right text-slate-700 dark:text-slate-300">{h.weightPct.toFixed(1)}%</td>
                    <td className="py-2.5 text-right">
                      {isEditing ? (
                        <div className="inline-flex items-center gap-1">
                          <button
                            onClick={async () => {
                              await onUpdateHolding(h.id, {
                                quantity: Math.max(0.0001, parseFloat(editQty) || h.quantity),
                                buyPrice: Math.max(0.01, parseFloat(editPrice) || h.buyPrice),
                                buyDate: editDate || h.buyDate,
                                notes: h.notes,
                              });
                              setEditingId(null);
                            }}
                            aria-label="Save holding"
                            className="rounded p-1 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950"
                          >
                            <Check className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => setEditingId(null)}
                            aria-label="Cancel edit"
                            className="rounded p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ) : (
                        <div className="inline-flex items-center gap-1">
                          <button
                            onClick={() => {
                              setEditingId(h.id);
                              setEditQty(String(h.quantity));
                              setEditPrice(String(h.buyPrice));
                              setEditDate(h.buyDate);
                            }}
                            aria-label={`Edit ${h.ticker}`}
                            className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => onDeleteHolding(h.id)}
                            aria-label={`Delete ${h.ticker}`}
                            className="rounded p-1 text-slate-500 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Physical Real Estate List (clean compact section) */}
      <div className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Physical Real Estate</h2>
          <button
            type="button"
            onClick={() => setAddTab('realestate')}
            className="text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
          >
            + Add Property
          </button>
        </div>

        {manualAssets.length === 0 ? (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            No manual properties added yet. Use the &ldquo;Real Estate&rdquo; tab above to include physical property in your net worth.
          </p>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {manualAssets.map((m) => {
              const gain = m.currentValue - m.purchaseValue;
              const gainPct = m.purchaseValue > 0 ? (gain / m.purchaseValue) * 100 : 0;
              return (
                <div key={m.id} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
                  <div>
                    <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">{m.name}</div>
                    <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                      {m.category} · Growth {m.growthPct.toFixed(1)}%/yr · Rental Yield {m.rentalYieldPct.toFixed(1)}%/yr
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right font-mono text-xs tabular-nums">
                      <div className="font-semibold text-slate-900 dark:text-slate-100">{formatINR(m.currentValue)}</div>
                      <div className={gain >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'}>
                        {formatPct(gainPct, 1, true)}
                      </div>
                    </div>
                    <button
                      onClick={() => onDeleteManualAsset(m.id)}
                      aria-label={`Delete ${m.name}`}
                      className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
