import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocFromServer,
  getFirestore,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import type { AlertRule, Holding, ManualAsset } from '../engine/types.ts';
import {
  createStarterAlerts,
  createStarterHoldings,
  createStarterManualAssets,
} from '../engine/universe.ts';

export const GMAIL_SCOPES = ['https://www.googleapis.com/auth/gmail.readonly'] as const;

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

// Strictly in-memory OAuth access token cache (never persisted in localStorage/sessionStorage)
let cachedGmailAccessToken: string | null = null;

export function getCachedGmailAccessToken(): string | null {
  return cachedGmailAccessToken;
}

export function clearCachedGmailAccessToken(): void {
  cachedGmailAccessToken = null;
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export async function testFirestoreConnection(): Promise<void> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Firestore client is offline; verify firebase-applet-config.json.');
    }
  }
}

function formatFirebaseAuthError(err: unknown): Error {
  const code =
    typeof err === 'object' && err !== null && 'code' in err
      ? String((err as { code?: unknown }).code)
      : '';
  if (code === 'auth/popup-blocked') {
    return new Error(
      'Sign-in popup was blocked by your browser. Please allow popups for this site and click Sign in with Google again.'
    );
  }
  if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
    return new Error('Google Sign-In popup was closed before completing.');
  }
  if (code === 'auth/unauthorized-domain') {
    return new Error(
      `This domain (${window.location.hostname}) is not authorized in Firebase Authentication settings.`
    );
  }
  return err instanceof Error ? err : new Error('Google Sign-In failed.');
}

export async function signInWithGoogle(): Promise<User> {
  try {
    const cred = await signInWithPopup(auth, googleProvider);
    return cred.user;
  } catch (err) {
    throw formatFirebaseAuthError(err);
  }
}

export async function connectGmailReadAccess(): Promise<{ user: User; accessToken: string }> {
  const gmailProvider = new GoogleAuthProvider();
  GMAIL_SCOPES.forEach((scope) => gmailProvider.addScope(scope));
  const currentEmail = auth.currentUser?.email;
  gmailProvider.setCustomParameters(
    currentEmail
      ? { prompt: 'consent', login_hint: currentEmail }
      : { prompt: 'consent select_account' }
  );

  try {
    const cred = await signInWithPopup(auth, gmailProvider);
    const oauthCred = GoogleAuthProvider.credentialFromResult(cred);
    if (!oauthCred?.accessToken) {
      throw new Error('Could not obtain Gmail read access from Google sign-in.');
    }
    cachedGmailAccessToken = oauthCred.accessToken;
    return { user: cred.user, accessToken: oauthCred.accessToken };
  } catch (err) {
    throw formatFirebaseAuthError(err);
  }
}

export async function signOutUser(): Promise<void> {
  cachedGmailAccessToken = null;
  await signOut(auth);
}

export async function syncGuestPortfolioToFirestore(
  userId: string,
  guestHoldings: Holding[],
  guestManualAssets: ManualAsset[]
): Promise<number> {
  const customHoldings = guestHoldings.filter((h) => h.id.startsWith('guest_'));
  const customManuals = guestManualAssets.filter((m) => m.id.startsWith('guest_re_'));
  if (customHoldings.length === 0 && customManuals.length === 0) return 0;

  if (customHoldings.length > 0) {
    await createHoldingDocsBatch(
      userId,
      customHoldings.map(({ id: _id, userId: _uid, ...rest }) => rest)
    );
  }
  for (const m of customManuals) {
    const { id: _id, userId: _uid, ...rest } = m;
    await createManualAssetDoc(userId, rest);
  }
  return customHoldings.length + customManuals.length;
}

function sanitizeId(raw: string): string {
  const clean = raw.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120);
  return clean || `id_${Date.now()}`;
}

export async function ensureUserProfileAndSeed(user: User): Promise<void> {
  const userPath = `users/${user.uid}`;
  const userRef = doc(db, 'users', user.uid);
  try {
    const snap = await getDoc(userRef);
    if (snap.exists()) return;

    const batch = writeBatch(db);
    const displayName = (user.displayName || user.email?.split('@')[0] || 'Investor').slice(0, 100);
    const email = (user.email || 'investor@example.com').slice(0, 254);

    batch.set(userRef, {
      uid: user.uid,
      displayName,
      email,
      riskProfile: 'Balanced',
      seededStarter: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    for (const h of createStarterHoldings(user.uid)) {
      const hRef = doc(db, 'users', user.uid, 'holdings', h.id);
      batch.set(hRef, {
        ...h,
        notes: (h.notes || '').slice(0, 240),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    for (const m of createStarterManualAssets(user.uid)) {
      const mRef = doc(db, 'users', user.uid, 'manualAssets', m.id);
      batch.set(mRef, {
        ...m,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    for (const a of createStarterAlerts(user.uid)) {
      const aRef = doc(db, 'users', user.uid, 'alerts', a.id);
      batch.set(aRef, {
        ...a,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, userPath);
  }
}

export function subscribeHoldings(
  userId: string,
  onData: (rows: Holding[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const pathStr = `users/${userId}/holdings`;
  const q = query(collection(db, 'users', userId, 'holdings'), where('userId', '==', userId));
  return onSnapshot(
    q,
    (snap) => {
      const rows = snap.docs.map((d) => d.data() as Holding);
      onData(rows);
    },
    (err) => {
      try {
        handleFirestoreError(err, OperationType.LIST, pathStr);
      } catch (wrapped) {
        onError?.(wrapped as Error);
      }
    }
  );
}

export function subscribeManualAssets(
  userId: string,
  onData: (rows: ManualAsset[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const pathStr = `users/${userId}/manualAssets`;
  const q = query(collection(db, 'users', userId, 'manualAssets'), where('userId', '==', userId));
  return onSnapshot(
    q,
    (snap) => {
      const rows = snap.docs.map((d) => d.data() as ManualAsset);
      onData(rows);
    },
    (err) => {
      try {
        handleFirestoreError(err, OperationType.LIST, pathStr);
      } catch (wrapped) {
        onError?.(wrapped as Error);
      }
    }
  );
}

export function subscribeAlertRules(
  userId: string,
  onData: (rows: AlertRule[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const pathStr = `users/${userId}/alerts`;
  const q = query(collection(db, 'users', userId, 'alerts'), where('userId', '==', userId));
  return onSnapshot(
    q,
    (snap) => {
      const rows = snap.docs.map((d) => d.data() as AlertRule);
      onData(rows);
    },
    (err) => {
      try {
        handleFirestoreError(err, OperationType.LIST, pathStr);
      } catch (wrapped) {
        onError?.(wrapped as Error);
      }
    }
  );
}

export async function createHoldingDoc(
  userId: string,
  input: Omit<Holding, 'id' | 'userId'>
): Promise<void> {
  return createHoldingDocsBatch(userId, [input]);
}

export async function createHoldingDocsBatch(
  userId: string,
  inputs: Array<Omit<Holding, 'id' | 'userId'>>
): Promise<void> {
  if (inputs.length === 0) return;
  const pathStr = `users/${userId}/holdings`;
  try {
    // Firestore batch supports up to 500 operations per commit
    for (let offset = 0; offset < inputs.length; offset += 450) {
      const chunk = inputs.slice(offset, offset + 450);
      const batch = writeBatch(db);
      chunk.forEach((input, idx) => {
        const id = sanitizeId(
          `h_${Date.now()}_${offset + idx}_${Math.random().toString(36).slice(2, 6)}`
        );
        const cleanTicker =
          input.ticker
            .trim()
            .toUpperCase()
            .replace(/[^A-Z0-9.=\-^]/g, '')
            .slice(0, 32) || 'CUSTOM.NS';
        const cleanDate = /^\d{4}-\d{2}-\d{2}$/.test(input.buyDate)
          ? input.buyDate
          : new Date().toISOString().slice(0, 10);

        batch.set(doc(db, 'users', userId, 'holdings', id), {
          id,
          userId,
          ticker: cleanTicker,
          name: (input.name.trim() || cleanTicker).slice(0, 100),
          assetClass: input.assetClass,
          currency: input.currency,
          quantity: Math.min(1000000000, Math.max(0.00001, Number(input.quantity) || 1)),
          buyPrice: Math.min(1000000000, Math.max(0.01, Number(input.buyPrice) || 1)),
          buyDate: cleanDate,
          notes: (input.notes || '').slice(0, 240),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      });
      await batch.commit();
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, pathStr);
  }
}

export async function updateHoldingDoc(
  userId: string,
  holdingId: string,
  patch: { quantity: number; buyPrice: number; buyDate: string; notes?: string }
): Promise<void> {
  const pathStr = `users/${userId}/holdings/${holdingId}`;
  try {
    await updateDoc(doc(db, 'users', userId, 'holdings', holdingId), {
      quantity: Math.max(0.00001, Number(patch.quantity)),
      buyPrice: Math.max(0.01, Number(patch.buyPrice)),
      buyDate: patch.buyDate.slice(0, 10),
      notes: (patch.notes || '').slice(0, 240),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, pathStr);
  }
}

export async function deleteHoldingDoc(userId: string, holdingId: string): Promise<void> {
  const pathStr = `users/${userId}/holdings/${holdingId}`;
  try {
    await deleteDoc(doc(db, 'users', userId, 'holdings', holdingId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, pathStr);
  }
}

export async function createManualAssetDoc(
  userId: string,
  input: Omit<ManualAsset, 'id' | 'userId'>
): Promise<void> {
  const id = sanitizeId(`re_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`);
  const pathStr = `users/${userId}/manualAssets/${id}`;
  try {
    const batch = writeBatch(db);
    batch.set(doc(db, 'users', userId, 'manualAssets', id), {
      id,
      userId,
      name: input.name.trim().slice(0, 100),
      category: input.category,
      currentValue: Math.max(1, Number(input.currentValue)),
      purchaseValue: Math.max(1, Number(input.purchaseValue)),
      growthPct: Math.max(-50, Math.min(100, Number(input.growthPct))),
      rentalYieldPct: Math.max(0, Math.min(50, Number(input.rentalYieldPct))),
      asOfDate: input.asOfDate.slice(0, 10),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, pathStr);
  }
}

export async function deleteManualAssetDoc(userId: string, assetId: string): Promise<void> {
  const pathStr = `users/${userId}/manualAssets/${assetId}`;
  try {
    await deleteDoc(doc(db, 'users', userId, 'manualAssets', assetId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, pathStr);
  }
}

export async function createAlertRuleDoc(
  userId: string,
  input: Omit<AlertRule, 'id' | 'userId'>
): Promise<void> {
  const id = sanitizeId(`al_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`);
  const pathStr = `users/${userId}/alerts/${id}`;
  try {
    const batch = writeBatch(db);
    batch.set(doc(db, 'users', userId, 'alerts', id), {
      id,
      userId,
      ruleType: input.ruleType,
      target: input.target.trim().slice(0, 64),
      threshold: Math.max(0, Math.min(1000, Number(input.threshold))),
      active: Boolean(input.active),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, pathStr);
  }
}

export async function toggleAlertRuleDoc(
  userId: string,
  alertId: string,
  active: boolean
): Promise<void> {
  const pathStr = `users/${userId}/alerts/${alertId}`;
  try {
    await updateDoc(doc(db, 'users', userId, 'alerts', alertId), {
      active,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, pathStr);
  }
}

export async function deleteAlertRuleDoc(userId: string, alertId: string): Promise<void> {
  const pathStr = `users/${userId}/alerts/${alertId}`;
  try {
    await deleteDoc(doc(db, 'users', userId, 'alerts', alertId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, pathStr);
  }
}

export interface UserProfileDoc {
  uid: string;
  displayName: string;
  email: string;
  riskProfile: 'Conservative' | 'Balanced' | 'Aggressive';
  seededStarter: boolean;
}

export async function fetchUserProfile(userId: string): Promise<UserProfileDoc | null> {
  const pathStr = `users/${userId}`;
  try {
    const snap = await getDoc(doc(db, 'users', userId));
    return snap.exists() ? (snap.data() as UserProfileDoc) : null;
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, pathStr);
  }
}

export async function updateUserProfileSettings(
  userId: string,
  patch: { displayName: string; riskProfile: 'Conservative' | 'Balanced' | 'Aggressive' }
): Promise<void> {
  const pathStr = `users/${userId}`;
  try {
    await updateDoc(doc(db, 'users', userId), {
      displayName: patch.displayName.trim().slice(0, 100) || 'Investor',
      riskProfile: patch.riskProfile,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, pathStr);
  }
}

