import React, { useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import {
  Activity,
  Bell,
  Briefcase,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  RefreshCw,
  ShieldCheck,
  Sliders,
  Sun,
  UserCog,
  X,
} from 'lucide-react';
import { buildPlainLanguageSummary, evaluateAlerts } from './engine/alerts.ts';
import { detectAnomalies } from './engine/anomaly.ts';
import { runBacktest } from './engine/backtest.ts';
import { alignMarketData } from './engine/calendar.ts';
import { analyzeCorrelations } from './engine/correlation.ts';
import { optimizePortfolio } from './engine/optimizer.ts';
import { detectMarketRegimes } from './engine/regime.ts';
import { exportPortfolioCSV, exportPortfolioPDF } from './engine/report.ts';
import { computePortfolioRisk } from './engine/risk.ts';
import type {
  AlertRule,
  Holding,
  ManualAsset,
  OptimizationConstraints,
  RawMarketPayload,
  SentimentSummary,
} from './engine/types.ts';
import {
  createStarterAlerts,
  createStarterHoldings,
  createStarterManualAssets,
} from './engine/universe.ts';
import { runVolatilityComparison } from './engine/volatility.ts';
import { summarizePortfolio } from './engine/xirr.ts';
import {
  auth,
  clearCachedGmailAccessToken,
  connectGmailReadAccess,
  createAlertRuleDoc,
  createHoldingDoc,
  createHoldingDocsBatch,
  createManualAssetDoc,
  deleteAlertRuleDoc,
  deleteHoldingDoc,
  deleteManualAssetDoc,
  ensureUserProfileAndSeed,
  getCachedGmailAccessToken,
  signInWithGoogle,
  signOutUser,
  subscribeAlertRules,
  subscribeHoldings,
  subscribeManualAssets,
  syncGuestPortfolioToFirestore,
  testFirestoreConnection,
  toggleAlertRuleDoc,
  updateHoldingDoc,
} from './lib/firebase.ts';
import { AccountSettings } from './components/AccountSettings.tsx';
import { AlertsPage } from './pages/AlertsPage.tsx';
import { AnalysisPage } from './pages/AnalysisPage.tsx';
import { OptimizerPage } from './pages/OptimizerPage.tsx';
import { OverviewPage, type NavTab } from './pages/OverviewPage.tsx';
import { PortfolioPage } from './pages/PortfolioPage.tsx';
import { fetchMarketPayload, fetchNewsSentiment } from './services/marketApi.ts';

const NAV_ITEMS: Array<{ id: NavTab; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'portfolio', label: 'My Portfolio', icon: Briefcase },
  { id: 'analysis', label: 'Risk & AI', icon: ShieldCheck },
  { id: 'optimizer', label: 'Rebalance', icon: Sliders },
  { id: 'alerts', label: 'Alerts & Reports', icon: Bell },
];

export default function App() {
  const [activeTab, setActiveTab] = useState<NavTab>('overview');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(false);

  // Firebase Auth & Gmail OAuth state
  const [authReady, setAuthReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState(false);
  const [hasGmailToken, setHasGmailToken] = useState(false);

  // Portfolio state (backed by Firestore when signed in, browser-persisted guest portfolio otherwise)
  const GUEST_HOLDINGS_KEY = 'arthaquant_guest_holdings_v1';
  const GUEST_MANUAL_KEY = 'arthaquant_guest_manual_v1';
  const GUEST_ALERTS_KEY = 'arthaquant_guest_alerts_v1';

  const loadGuestList = <T,>(key: string, fallback: () => T[]): T[] => {
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed as T[];
      }
    } catch {
      // Ignore storage read errors
    }
    return fallback();
  };

  const [holdings, setHoldings] = useState<Holding[]>(() =>
    loadGuestList(GUEST_HOLDINGS_KEY, () => createStarterHoldings('guest'))
  );
  const [manualAssets, setManualAssets] = useState<ManualAsset[]>(() =>
    loadGuestList(GUEST_MANUAL_KEY, () => createStarterManualAssets('guest'))
  );
  const [alertRules, setAlertRules] = useState<AlertRule[]>(() =>
    loadGuestList(GUEST_ALERTS_KEY, () => createStarterAlerts('guest'))
  );
  const [firestoreLoading, setFirestoreLoading] = useState(false);
  const [profileReadyUid, setProfileReadyUid] = useState<string | null>(null);
  const [syncNotice, setSyncNotice] = useState<string | null>(null);

  // Market & News data
  const [rawMarket, setRawMarket] = useState<RawMarketPayload | null>(null);
  const [marketLoading, setMarketLoading] = useState(true);
  const [marketError, setMarketError] = useState<string | null>(null);
  const [sentiment, setSentiment] = useState<SentimentSummary | null>(null);

  // Analytical controls
  const [volTarget, setVolTarget] = useState('^NSEI');
  const [constraints, setConstraints] = useState<OptimizationConstraints>({
    maxCryptoPct: 15,
    minGoldPct: 20,
    minSafePct: 10,
    maxSingleAssetPct: 30,
    riskFreeRatePct: 6.5,
    regimeAware: true,
  });

  // Sync dark mode class on <html>
  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
  }, [darkMode]);

  // Persist guest portfolio edits in browser localStorage (never stores any auth tokens)
  useEffect(() => {
    if (authReady && !user) {
      try {
        localStorage.setItem(GUEST_HOLDINGS_KEY, JSON.stringify(holdings));
        localStorage.setItem(GUEST_MANUAL_KEY, JSON.stringify(manualAssets));
        localStorage.setItem(GUEST_ALERTS_KEY, JSON.stringify(alertRules));
      } catch {
        // Ignore quota errors
      }
    }
  }, [authReady, user, holdings, manualAssets, alertRules]);

  // Boot Firestore connectivity & Auth listener
  useEffect(() => {
    testFirestoreConnection();
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      setAuthReady(true);
      if (u) {
        setHasGmailToken(Boolean(getCachedGmailAccessToken()));
        setFirestoreLoading(true);
        setProfileReadyUid(null);
        try {
          await ensureUserProfileAndSeed(u);
          const pendingGuestHoldings = loadGuestList<Holding>(GUEST_HOLDINGS_KEY, () => []);
          const pendingGuestManuals = loadGuestList<ManualAsset>(GUEST_MANUAL_KEY, () => []);
          const migratedCount = await syncGuestPortfolioToFirestore(
            u.uid,
            pendingGuestHoldings,
            pendingGuestManuals
          );
          if (migratedCount > 0) {
            localStorage.removeItem(GUEST_HOLDINGS_KEY);
            localStorage.removeItem(GUEST_MANUAL_KEY);
            setSyncNotice(`Synced ${migratedCount} guest item${migratedCount === 1 ? '' : 's'} to your account.`);
          }
          setProfileReadyUid(u.uid);
        } catch (err) {
          setAuthError(err instanceof Error ? err.message : 'Failed to initialize user profile.');
        } finally {
          setFirestoreLoading(false);
        }
      } else {
        clearCachedGmailAccessToken();
        setHasGmailToken(false);
        setProfileReadyUid(null);
        setHoldings(loadGuestList(GUEST_HOLDINGS_KEY, () => createStarterHoldings('guest')));
        setManualAssets(loadGuestList(GUEST_MANUAL_KEY, () => createStarterManualAssets('guest')));
        setAlertRules(loadGuestList(GUEST_ALERTS_KEY, () => createStarterAlerts('guest')));
      }
    });
    return () => unsub();
  }, []);

  // Subscribe to user-scoped Firestore collections ONLY after auth + profile seed complete
  useEffect(() => {
    if (!authReady || !user || profileReadyUid !== user.uid) return;
    const unsubH = subscribeHoldings(
      user.uid,
      (rows) => setHoldings(rows),
      (err) => setAuthError(err.message)
    );
    const unsubM = subscribeManualAssets(
      user.uid,
      (rows) => setManualAssets(rows),
      (err) => setAuthError(err.message)
    );
    const unsubA = subscribeAlertRules(
      user.uid,
      (rows) => setAlertRules(rows),
      (err) => setAuthError(err.message)
    );
    return () => {
      unsubH();
      unsubM();
      unsubA();
    };
  }, [authReady, user, profileReadyUid]);

  // Fetch market data
  const loadMarketData = async (refresh = false) => {
    setMarketLoading(true);
    setMarketError(null);
    try {
      const payload = await fetchMarketPayload(refresh);
      setRawMarket(payload);
    } catch (err) {
      setMarketError(err instanceof Error ? err.message : 'Failed to load market data.');
    } finally {
      setMarketLoading(false);
    }
  };

  useEffect(() => {
    loadMarketData(false);
  }, []);

  // Quantitative analytics pipeline (memoized)
  const alignedMarket = useMemo(() => {
    if (!rawMarket) return null;
    return alignMarketData(rawMarket);
  }, [rawMarket]);

  useEffect(() => {
    if (!alignedMarket) return;
    fetchNewsSentiment(alignedMarket)
      .then(setSentiment)
      .catch(() => setSentiment(null));
  }, [alignedMarket]);

  const summary = useMemo(() => {
    if (!alignedMarket) return null;
    return summarizePortfolio(holdings, manualAssets, alignedMarket);
  }, [holdings, manualAssets, alignedMarket]);

  const risk = useMemo(() => {
    if (!summary || !alignedMarket) return null;
    return computePortfolioRisk(summary, alignedMarket, constraints.riskFreeRatePct / 100);
  }, [summary, alignedMarket, constraints.riskFreeRatePct]);

  const correlation = useMemo(() => {
    if (!summary || !alignedMarket) return null;
    return analyzeCorrelations(summary, alignedMarket);
  }, [summary, alignedMarket]);

  const regime = useMemo(() => {
    if (!alignedMarket) return null;
    return detectMarketRegimes(alignedMarket);
  }, [alignedMarket]);

  const volatility = useMemo(() => {
    if (!alignedMarket) return null;
    return runVolatilityComparison(alignedMarket, volTarget);
  }, [alignedMarket, volTarget]);

  const anomalies = useMemo(() => {
    if (!alignedMarket) return [];
    return detectAnomalies(alignedMarket, holdings);
  }, [alignedMarket, holdings]);

  const optimization = useMemo(() => {
    if (!summary || !alignedMarket || !regime) return null;
    return optimizePortfolio(summary, alignedMarket, constraints, regime.currentRegime);
  }, [summary, alignedMarket, constraints, regime]);

  const backtest = useMemo(() => {
    if (!summary || !alignedMarket || !regime) return null;
    return runBacktest(summary, alignedMarket, regime, constraints);
  }, [summary, alignedMarket, regime, constraints]);

  const triggeredAlerts = useMemo(() => {
    if (!summary || !risk || !regime || !correlation) return [];
    return evaluateAlerts(alertRules, summary, risk, regime, correlation, anomalies);
  }, [alertRules, summary, risk, regime, correlation, anomalies]);

  const narrative = useMemo(() => {
    if (!summary || !risk || !regime || !optimization || !backtest) return '';
    return buildPlainLanguageSummary(summary, risk, regime, optimization, backtest);
  }, [summary, risk, regime, optimization, backtest]);

  // Auth & Gmail OAuth handlers
  const handleGoogleSignIn = async () => {
    setSigningIn(true);
    setAuthError(null);
    try {
      await signInWithGoogle();
      setHasGmailToken(Boolean(getCachedGmailAccessToken()));
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Google Sign-In failed or was canceled.');
    } finally {
      setSigningIn(false);
    }
  };

  const handleConnectGmail = async (): Promise<string> => {
    const { accessToken } = await connectGmailReadAccess();
    setHasGmailToken(true);
    return accessToken;
  };

  const handleSignOut = async () => {
    setHasGmailToken(false);
    await signOutUser();
  };

  // CRUD handlers
  const handleAddHolding = async (input: Omit<Holding, 'id' | 'userId'>) => {
    if (user) {
      await createHoldingDoc(user.uid, input);
    } else {
      setHoldings((prev) => [...prev, { ...input, id: `guest_${Date.now()}`, userId: 'guest' }]);
    }
  };

  const handleBatchAddHoldings = async (inputs: Array<Omit<Holding, 'id' | 'userId'>>) => {
    if (inputs.length === 0) return;
    if (user) {
      await createHoldingDocsBatch(user.uid, inputs);
    } else {
      const now = Date.now();
      setHoldings((prev) => [
        ...prev,
        ...inputs.map((inp, idx) => ({ ...inp, id: `guest_${now}_${idx}`, userId: 'guest' })),
      ]);
    }
  };

  const handleUpdateHolding = async (
    id: string,
    patch: { quantity: number; buyPrice: number; buyDate: string; notes?: string }
  ) => {
    if (user) {
      await updateHoldingDoc(user.uid, id, patch);
    } else {
      setHoldings((prev) => prev.map((h) => (h.id === id ? { ...h, ...patch } : h)));
    }
  };

  const handleDeleteHolding = async (id: string) => {
    if (user) {
      await deleteHoldingDoc(user.uid, id);
    } else {
      setHoldings((prev) => prev.filter((h) => h.id !== id));
    }
  };

  const handleAddManualAsset = async (input: Omit<ManualAsset, 'id' | 'userId'>) => {
    if (user) {
      await createManualAssetDoc(user.uid, input);
    } else {
      setManualAssets((prev) => [...prev, { ...input, id: `guest_re_${Date.now()}`, userId: 'guest' }]);
    }
  };

  const handleDeleteManualAsset = async (id: string) => {
    if (user) {
      await deleteManualAssetDoc(user.uid, id);
    } else {
      setManualAssets((prev) => prev.filter((m) => m.id !== id));
    }
  };

  const handleAddAlertRule = async (rule: Omit<AlertRule, 'id' | 'userId'>) => {
    if (user) {
      await createAlertRuleDoc(user.uid, rule);
    } else {
      setAlertRules((prev) => [...prev, { ...rule, id: `guest_al_${Date.now()}`, userId: 'guest' }]);
    }
  };

  const handleToggleAlertRule = async (id: string, active: boolean) => {
    if (user) {
      await toggleAlertRuleDoc(user.uid, id, active);
    } else {
      setAlertRules((prev) => prev.map((a) => (a.id === id ? { ...a, active } : a)));
    }
  };

  const handleDeleteAlertRule = async (id: string) => {
    if (user) {
      await deleteAlertRuleDoc(user.uid, id);
    } else {
      setAlertRules((prev) => prev.filter((a) => a.id !== id));
    }
  };

  const activeTitle =
    activeTab === 'account' ? 'Account' : NAV_ITEMS.find((n) => n.id === activeTab)?.label || 'Overview';

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <div className="flex min-h-screen">
        {/* Clean 5-Item Sidebar */}
        <aside className="hidden w-60 shrink-0 flex-col border-r border-slate-200 bg-white lg:flex dark:border-slate-800 dark:bg-slate-900">
          <div className="flex h-16 items-center border-b border-slate-200 px-5 dark:border-slate-800">
            <span className="font-display text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap dark:text-slate-100">
              ArthaQuant
            </span>
          </div>

          <nav className="flex-1 space-y-1 p-3">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`flex w-full items-center justify-between rounded-md px-3 py-2.5 text-xs font-medium transition-colors whitespace-nowrap ${
                    isActive
                      ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100'
                  }`}
                >
                  <span className="flex items-center gap-2.5">
                    <Icon className="h-4 w-4 shrink-0" />
                    <span>{item.label}</span>
                  </span>
                  {item.id === 'alerts' && triggeredAlerts.length > 0 && (
                    <span className="font-mono text-[11px] font-semibold tabular-nums text-rose-500">
                      {triggeredAlerts.length}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          <div className="border-t border-slate-200 p-3 space-y-2 dark:border-slate-800">
            <button
              onClick={() => setActiveTab('account')}
              className={`flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-xs font-medium transition-colors ${
                activeTab === 'account'
                  ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800'
              }`}
            >
              <UserCog className="h-4 w-4 shrink-0" />
              <span>Account</span>
            </button>

            <button
              onClick={() => setDarkMode((d) => !d)}
              className="flex w-full items-center justify-between rounded-md border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <span>{darkMode ? 'Light Mode' : 'Dark Mode'}</span>
              {darkMode ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
            </button>

            <p className="px-1 pt-1 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
              Educational analytics only. Not financial advice.
            </p>
          </div>
        </aside>

        {/* Mobile Drawer */}
        {mobileNavOpen && (
          <div className="fixed inset-0 z-50 flex lg:hidden">
            <div className="fixed inset-0 bg-slate-950/50" onClick={() => setMobileNavOpen(false)} />
            <div className="relative flex w-64 flex-col bg-white p-4 dark:bg-slate-900">
              <div className="mb-4 flex items-center justify-between">
                <span className="font-display text-lg font-bold">ArthaQuant</span>
                <button onClick={() => setMobileNavOpen(false)} className="p-1" aria-label="Close navigation">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <nav className="flex-1 space-y-1">
                {NAV_ITEMS.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      onClick={() => {
                        setActiveTab(item.id);
                        setMobileNavOpen(false);
                      }}
                      className={`flex w-full items-center gap-2.5 rounded-md px-3 py-2.5 text-xs font-medium ${
                        activeTab === item.id
                          ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                          : 'text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
                <button
                  onClick={() => {
                    setActiveTab('account');
                    setMobileNavOpen(false);
                  }}
                  className={`flex w-full items-center gap-2.5 rounded-md px-3 py-2.5 text-xs font-medium ${
                    activeTab === 'account'
                      ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                      : 'text-slate-600 dark:text-slate-300'
                  }`}
                >
                  <UserCog className="h-4 w-4" />
                  <span>Account</span>
                </button>
              </nav>
            </div>
          </div>
        )}

        {/* Main Workspace */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Clean Top Bar */}
          <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-4 border-b border-slate-200 bg-white px-4 sm:px-6 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center gap-3 min-w-0">
              <button
                onClick={() => setMobileNavOpen(true)}
                className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100 lg:hidden dark:text-slate-300 dark:hover:bg-slate-800"
                aria-label="Open menu"
              >
                <Menu className="h-5 w-5" />
              </button>
              <div className="flex items-center gap-2 text-sm truncate">
                <span className="hidden text-slate-400 sm:inline">ArthaQuant</span>
                <span className="hidden text-slate-300 sm:inline dark:text-slate-700">/</span>
                <h1 className="font-display font-semibold text-slate-900 truncate dark:text-slate-100">{activeTitle}</h1>
              </div>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              <button
                onClick={() => loadMarketData(true)}
                disabled={marketLoading}
                className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-800 whitespace-nowrap shrink-0"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${marketLoading ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">Refresh Prices</span>
              </button>

              {user ? (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setActiveTab('account')}
                    className="flex items-center gap-2 rounded-md px-2 py-1 text-left transition-colors hover:bg-slate-100 dark:hover:bg-slate-800"
                    title="Account Settings"
                  >
                    {user.photoURL && (
                      <img
                        src={user.photoURL}
                        alt={user.displayName || 'User'}
                        referrerPolicy="no-referrer"
                        className="h-7 w-7 rounded-full border border-slate-200 dark:border-slate-700"
                      />
                    )}
                    <span className="hidden text-xs font-medium text-slate-900 sm:inline dark:text-slate-100 truncate max-w-[130px]">
                      {user.displayName || user.email}
                    </span>
                  </button>
                  <button
                    onClick={handleSignOut}
                    className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 whitespace-nowrap shrink-0"
                  >
                    <LogOut className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Sign Out</span>
                  </button>
                </div>
              ) : (
                <button
                  onClick={handleGoogleSignIn}
                  disabled={signingIn}
                  className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3.5 py-1.5 text-xs font-medium text-slate-800 shadow-2xs transition-colors hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:hover:bg-slate-800 whitespace-nowrap shrink-0"
                >
                  <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 48 48" aria-hidden="true">
                    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
                  </svg>
                  <span>{signingIn ? 'Signing in...' : 'Sign in with Google'}</span>
                </button>
              )}
            </div>
          </header>

          {/* Main Content Viewport */}
          <main className="mx-auto w-full max-w-[1320px] flex-1 space-y-5 p-4 sm:p-6">
            {authError && (
              <div className="flex items-center justify-between rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-200">
                <span>Sign-in notice: {authError}</span>
                <button onClick={() => setAuthError(null)} className="ml-3 font-semibold underline">
                  Dismiss
                </button>
              </div>
            )}

            {syncNotice && (
              <div className="flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-200">
                <span>{syncNotice}</span>
                <button onClick={() => setSyncNotice(null)} className="ml-3 font-semibold underline">
                  Dismiss
                </button>
              </div>
            )}

            {rawMarket && rawMarket.sourceMode === 'cached-fallback' && (
              <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
                <Activity className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                <span>
                  Using offline market snapshot · USD/INR ₹{rawMarket.fxUsdinr.toFixed(2)}
                </span>
              </div>
            )}

            {marketError && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-xs text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-200">
                {marketError}
              </div>
            )}

            {/* Loading Skeleton */}
            {(marketLoading || firestoreLoading || !summary || !risk || !correlation || !regime || !volatility || !optimization || !backtest) &&
            !marketError ? (
              <div className="space-y-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div
                      key={i}
                      className="h-24 animate-pulse rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
                    />
                  ))}
                </div>
                <div className="h-64 animate-pulse rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900" />
              </div>
            ) : (
              summary &&
              risk &&
              correlation &&
              regime &&
              volatility &&
              optimization &&
              backtest && (
                <>
                  {activeTab === 'overview' && (
                    <OverviewPage
                      summary={summary}
                      risk={risk}
                      regime={regime}
                      correlation={correlation}
                      alerts={triggeredAlerts}
                      narrative={narrative}
                      onNavigate={setActiveTab}
                    />
                  )}
                  {activeTab === 'portfolio' && (
                    <PortfolioPage
                      summary={summary}
                      holdings={holdings}
                      manualAssets={manualAssets}
                      isAuthenticated={Boolean(user)}
                      signingIn={signingIn}
                      onSignInGoogle={handleGoogleSignIn}
                      hasGmailToken={hasGmailToken}
                      onConnectGmail={handleConnectGmail}
                      onAddHolding={handleAddHolding}
                      onBatchAddHoldings={handleBatchAddHoldings}
                      onUpdateHolding={handleUpdateHolding}
                      onDeleteHolding={handleDeleteHolding}
                      onAddManualAsset={handleAddManualAsset}
                      onDeleteManualAsset={handleDeleteManualAsset}
                    />
                  )}
                  {activeTab === 'analysis' && (
                    <AnalysisPage
                      risk={risk}
                      correlation={correlation}
                      volTarget={volTarget}
                      onChangeVolTarget={setVolTarget}
                      volatility={volatility}
                      regime={regime}
                      sentiment={sentiment}
                      anomalies={anomalies}
                    />
                  )}
                  {activeTab === 'optimizer' && (
                    <OptimizerPage
                      constraints={constraints}
                      onChangeConstraints={setConstraints}
                      currentRegime={regime.currentRegime}
                      optimization={optimization}
                      backtest={backtest}
                    />
                  )}
                  {activeTab === 'alerts' && (
                    <AlertsPage
                      rules={alertRules}
                      triggered={triggeredAlerts}
                      onAddRule={handleAddAlertRule}
                      onToggleRule={handleToggleAlertRule}
                      onDeleteRule={handleDeleteAlertRule}
                      onExportCSV={() => exportPortfolioCSV(summary, manualAssets)}
                      onExportPDF={() =>
                        exportPortfolioPDF({
                          investorName: user?.displayName || user?.email || 'Guest Investor',
                          summary,
                          manualAssets,
                          risk,
                          correlation,
                          regime,
                          optimization,
                          backtest,
                          alerts: triggeredAlerts,
                          narrative,
                        })
                      }
                    />
                  )}
                  {activeTab === 'account' && (
                    <AccountSettings
                      holdings={holdings}
                      manualAssets={manualAssets}
                      alertRules={alertRules}
                      onSelectRiskProfile={(preset) => {
                        setConstraints((prev) => ({
                          ...prev,
                          maxCryptoPct: preset === 'Conservative' ? 5 : preset === 'Balanced' ? 15 : 25,
                          minGoldPct: preset === 'Conservative' ? 25 : preset === 'Balanced' ? 20 : 10,
                          minSafePct: preset === 'Conservative' ? 20 : preset === 'Balanced' ? 10 : 5,
                        }));
                      }}
                    />
                  )}
                </>
              )
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
