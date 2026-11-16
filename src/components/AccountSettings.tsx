import React, { useEffect, useState } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { Bell, Briefcase, Building2, Calendar, CheckCircle2, LogIn, LogOut, Mail, Shield, UserCheck } from 'lucide-react';
import type { AlertRule, Holding, ManualAsset } from '../engine/types.ts';
import {
  auth,
  fetchUserProfile,
  signInWithGoogle,
  signOutUser,
  updateUserProfileSettings,
  type UserProfileDoc,
} from '../lib/firebase.ts';

function formatAuthTimestamp(raw?: string | null): string {
  if (!raw) return 'Unavailable';
  const dt = new Date(raw);
  if (Number.isNaN(dt.getTime())) return raw;
  return dt.toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export function AccountSettings({
  holdings,
  manualAssets = [],
  alertRules,
  onSelectRiskProfile,
}: {
  holdings: Holding[];
  manualAssets?: ManualAsset[];
  alertRules: AlertRule[];
  onSelectRiskProfile?: (profile: 'Conservative' | 'Balanced' | 'Aggressive') => void;
}) {
  const [currentUser, setCurrentUser] = useState<User | null>(() => auth.currentUser);
  const [profileDoc, setProfileDoc] = useState<UserProfileDoc | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [riskProfile, setRiskProfile] = useState<'Conservative' | 'Balanced' | 'Aggressive'>('Balanced');
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setCurrentUser(u);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!currentUser) {
      setProfileDoc(null);
      return;
    }
    let active = true;
    setLoadingProfile(true);
    setErrorMessage(null);
    fetchUserProfile(currentUser.uid)
      .then((docData) => {
        if (!active) return;
        setProfileDoc(docData);
        setDisplayName(docData?.displayName || currentUser.displayName || currentUser.email?.split('@')[0] || 'Investor');
        setRiskProfile(docData?.riskProfile || 'Balanced');
      })
      .catch((err) => {
        if (!active) return;
        setErrorMessage(err instanceof Error ? err.message : 'Unable to load profile settings.');
      })
      .finally(() => {
        if (active) setLoadingProfile(false);
      });
    return () => {
      active = false;
    };
  }, [currentUser]);

  const handleSignIn = async () => {
    setErrorMessage(null);
    try {
      await signInWithGoogle();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Google Sign-In failed or was canceled.');
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
    setSaving(true);
    setSaveMessage(null);
    setErrorMessage(null);
    try {
      await updateUserProfileSettings(currentUser.uid, {
        displayName: displayName.trim() || 'Investor',
        riskProfile,
      });
      onSelectRiskProfile?.(riskProfile);
      setSaveMessage('Account preferences saved to Firestore.');
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to update account settings.');
    } finally {
      setSaving(false);
    }
  };

  const totalHoldingsTracked = holdings.length;
  const distinctClassesCount = new Set(holdings.map((h) => h.assetClass)).size;
  const alertsConfiguredCount = alertRules.length;
  const activeAlertsCount = alertRules.filter((r) => r.active).length;
  const manualAssetsCount = manualAssets.length;

  const summaryStatsStrip = (
    <section aria-labelledby="account-summary-heading" className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 id="account-summary-heading" className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          Account Setup Summary
        </h2>
        <span className="text-xs text-slate-500 dark:text-slate-400">
          {currentUser ? 'Live Firestore counts' : 'Guest preview counts'}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
            <Briefcase className="h-3.5 w-3.5" />
            <span>Total Holdings Tracked</span>
          </div>
          <div className="mt-1.5 font-mono text-2xl font-semibold text-slate-900 tabular-nums dark:text-slate-100">
            {totalHoldingsTracked}
          </div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Across {distinctClassesCount} liquid asset {distinctClassesCount === 1 ? 'class' : 'classes'}
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
            <Bell className="h-3.5 w-3.5" />
            <span>Total Alerts Configured</span>
          </div>
          <div className="mt-1.5 font-mono text-2xl font-semibold text-slate-900 tabular-nums dark:text-slate-100">
            {alertsConfiguredCount}
          </div>
          <div className="mt-1 font-mono text-xs text-slate-500 tabular-nums dark:text-slate-400">
            {activeAlertsCount} active · {alertsConfiguredCount - activeAlertsCount} paused
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
            <Building2 className="h-3.5 w-3.5" />
            <span>Manual Real Assets</span>
          </div>
          <div className="mt-1.5 font-mono text-2xl font-semibold text-slate-900 tabular-nums dark:text-slate-100">
            {manualAssetsCount}
          </div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {currentUser ? 'Synced to Firestore' : 'Guest preview state'}
          </div>
        </div>
      </div>
    </section>
  );

  if (!currentUser) {
    return (
      <div className="space-y-6">
        {summaryStatsStrip}
        <div className="rounded-lg border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
          <div className="max-w-lg space-y-3">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Account Settings</h2>
            <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-400">
              You are currently exploring the guest preview portfolio. Sign in with your Google account via Firebase Authentication to view your verified profile details, registration timestamp, and persist portfolio holdings across sessions.
            </p>
            {errorMessage && (
              <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-200">
                {errorMessage}
              </div>
            )}
            <div className="pt-2">
              <button
                onClick={handleSignIn}
                className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-blue-700 whitespace-nowrap shrink-0"
              >
                <LogIn className="h-4 w-4" />
                <span>Sign in with Google</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const providerLabel =
    currentUser.providerData.map((p) => (p.providerId === 'google.com' ? 'Google OAuth 2.0' : p.providerId)).join(', ') ||
    'Firebase Auth';

  return (
    <div className="space-y-6">
      {summaryStatsStrip}
      {/* Firebase Auth User Profile Section */}
      <section aria-labelledby="profile-section-heading" className="rounded-lg border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-5 dark:border-slate-800">
          <div className="flex items-center gap-4">
            {currentUser.photoURL ? (
              <img
                src={currentUser.photoURL}
                alt={currentUser.displayName || 'Authenticated User'}
                referrerPolicy="no-referrer"
                className="h-14 w-14 rounded-full border border-slate-200 object-cover dark:border-slate-700"
              />
            ) : (
              <div className="flex h-14 w-14 items-center justify-center rounded-full border border-slate-200 bg-slate-100 text-sm font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                {(currentUser.displayName || currentUser.email || 'U').slice(0, 2).toUpperCase()}
              </div>
            )}
            <div>
              <h2 id="profile-section-heading" className="text-base font-semibold text-slate-900 dark:text-slate-100">
                User Profile
              </h2>
              <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                <span>{currentUser.displayName || profileDoc?.displayName || 'Authenticated Investor'}</span>
                <span aria-hidden="true">·</span>
                <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  <span>{currentUser.emailVerified ? 'Verified Google Account' : 'Unverified Email'}</span>
                </span>
              </div>
            </div>
          </div>

          <button
            onClick={() => signOutUser()}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-800 whitespace-nowrap shrink-0"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span>Sign Out</span>
          </button>
        </div>

        {/* Profile Details retrieved from Firebase Auth */}
        <dl className="mt-5 grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-5">
          <div>
            <dt className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500 dark:text-slate-400">
              <UserCheck className="h-3.5 w-3.5" />
              <span>Display Name</span>
            </dt>
            <dd className="mt-1.5 truncate text-xs font-semibold text-slate-900 dark:text-slate-100">
              {currentUser.displayName || profileDoc?.displayName || '—'}
            </dd>
          </div>

          <div>
            <dt className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500 dark:text-slate-400">
              <Mail className="h-3.5 w-3.5" />
              <span>Email</span>
            </dt>
            <dd className="mt-1.5 truncate text-xs font-semibold text-slate-900 dark:text-slate-100">
              {currentUser.email || '—'}
            </dd>
          </div>

          <div>
            <dt className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500 dark:text-slate-400">
              <Calendar className="h-3.5 w-3.5" />
              <span>Account Creation Date</span>
            </dt>
            <dd className="mt-1.5 font-mono text-xs font-semibold text-slate-900 tabular-nums dark:text-slate-100">
              {formatAuthTimestamp(currentUser.metadata.creationTime)}
            </dd>
          </div>

          <div>
            <dt className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500 dark:text-slate-400">
              <Calendar className="h-3.5 w-3.5" />
              <span>Last Sign-In</span>
            </dt>
            <dd className="mt-1.5 font-mono text-xs font-medium text-slate-700 tabular-nums dark:text-slate-300">
              {formatAuthTimestamp(currentUser.metadata.lastSignInTime)}
            </dd>
          </div>

          <div>
            <dt className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500 dark:text-slate-400">
              <Shield className="h-3.5 w-3.5" />
              <span>Provider &amp; UID</span>
            </dt>
            <dd className="mt-1.5 truncate text-xs font-medium text-slate-900 dark:text-slate-100">
              {providerLabel}
            </dd>
            <dd className="mt-0.5 truncate font-mono text-[10px] text-slate-500">{currentUser.uid}</dd>
          </div>
        </dl>
      </section>

      {/* Firestore Profile Preferences */}
      <form
        onSubmit={handleSave}
        className="rounded-lg border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900"
      >
        <div className="mb-4">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Investor Profile Preferences</h3>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Stored securely in your owner-isolated Firestore profile document. Selecting a risk posture updates your default optimizer bounds.
          </p>
        </div>

        {errorMessage && (
          <div className="mb-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-200">
            {errorMessage}
          </div>
        )}
        {saveMessage && (
          <div className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-200">
            {saveMessage}
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Display Name</label>
            <input
              type="text"
              required
              maxLength={100}
              disabled={loadingProfile}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Risk Posture</label>
            <select
              disabled={loadingProfile}
              value={riskProfile}
              onChange={(e) => setRiskProfile(e.target.value as 'Conservative' | 'Balanced' | 'Aggressive')}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            >
              <option value="Conservative">Conservative (Crypto ≤ 5%, Gold ≥ 25%, Liquid ≥ 20%)</option>
              <option value="Balanced">Balanced (Crypto ≤ 15%, Gold ≥ 20%, Liquid ≥ 10%)</option>
              <option value="Aggressive">Aggressive (Crypto ≤ 25%, Gold ≥ 10%, Liquid ≥ 5%)</option>
            </select>
          </div>
        </div>

        <div className="mt-5 flex justify-end">
          <button
            type="submit"
            disabled={saving || loadingProfile}
            className="rounded-md bg-blue-600 px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap shrink-0"
          >
            {saving ? 'Saving...' : 'Save Preferences'}
          </button>
        </div>
      </form>
    </div>
  );
}
