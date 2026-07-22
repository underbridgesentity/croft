import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { api } from './lib/api';
import { tapHaptic, onNativeResume } from './lib/native';
import type { AppState, User } from './lib/types';

interface Store {
  ready: boolean;
  user: User | null;
  /** Merge fields into the signed-in user (e.g. after saving a per-user setting). */
  patchUser: (p: Partial<User>) => void;
  state: AppState | null;
  toast: string | null;
  flash: (msg: string) => void;
  // auth
  signup: (d: { name: string; email: string; password: string; household?: string }) => Promise<void>;
  login: (d: { email: string; password: string }) => Promise<void>;
  acceptInvite: (token: string, d: { name: string; email: string; password: string }) => Promise<void>;
  resetPassword: (token: string, password: string) => Promise<void>;
  deleteAccount: () => Promise<void>;
  logout: () => Promise<void>;
  completeOnboarding: () => void;
  appUnlocked: boolean;
  unlock: () => void;
  setLockEnabled: (locked: boolean) => void;
  refreshState: () => Promise<void>;
  /** Replay the welcome tour on demand (Family screen). */
  tourOpen: boolean;
  openTour: () => void;
  closeTour: () => void;
  /** A signed-in account accepts an invite into another household. */
  acceptInviteExisting: (token: string) => Promise<void>;
  /** True when the initial load failed on the NETWORK (not auth) - the app
   * doesn't know who you are yet and must offer a retry, never the signup page. */
  loadError: boolean;
  retryLoad: () => void;
  // generic apply (mutations return fresh state). `key` marks the action busy
  // (isBusy) so its button can show a pending state and swallow double-taps.
  run: (p: Promise<AppState>, msg?: string, key?: string) => Promise<void>;
  isBusy: (key: string) => boolean;
}

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [state, setState] = useState<AppState | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [appUnlocked, setAppUnlocked] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [tourOpen, setTourOpen] = useState(false);
  const [busyKeys, setBusyKeys] = useState<Record<string, true>>({});
  const tRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flash = useCallback((msg: string) => {
    setToast(msg);
    if (tRef.current) clearTimeout(tRef.current);
    tRef.current = setTimeout(() => setToast(null), 2200);
  }, []);

  const refreshState = useCallback(async () => {
    const s = await api.state();
    setState(s);
  }, []);

  // Session expired mid-use (a data request returned 401) → reset to sign-in.
  useEffect(() => {
    const onExpired = () => {
      setUser(null);
      setState(null);
      flash('Your session expired - please sign in again');
    };
    window.addEventListener('croft:unauthorized', onExpired);
    return () => window.removeEventListener('croft:unauthorized', onExpired);
  }, [flash]);

  // Native app: refresh state and re-lock (if a passcode is set) on foreground.
  useEffect(() => onNativeResume(() => { refreshState().catch(() => {}); setAppUnlocked(false); }), [refreshState]);

  // Multi-user sync: an open app must learn about the family's changes without
  // a manual reload. Refresh (throttled) on tab focus/visibility, when the
  // connection returns, and on a gentle interval while visible.
  const lastSync = useRef(0);
  const stateRef = useRef<AppState | null>(null);
  stateRef.current = state;
  useEffect(() => {
    const sync = (minGapMs: number) => {
      if (!stateRef.current) return; // not signed in / no household yet
      const now = Date.now();
      if (now - lastSync.current < minGapMs) return;
      lastSync.current = now;
      refreshState().catch(() => {});
    };
    // Co-editing (e.g. two phones on the same shopping list) rides on the
    // interval - quiet mutations send no push, so the poll IS the sync. 15s
    // keeps a family feeling live at ~4 req/min per open app.
    const onVisible = () => { if (document.visibilityState === 'visible') sync(4_000); };
    const onOnline = () => sync(2_000);
    const iv = setInterval(() => { if (document.visibilityState === 'visible') sync(12_000); }, 15_000);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    window.addEventListener('online', onOnline);
    // Service worker tells us a push landed for this household -> fetch it.
    const onSwMessage = (e: MessageEvent) => { if (e?.data?.type === 'croft:refresh') sync(2_000); };
    navigator.serviceWorker?.addEventListener?.('message', onSwMessage);
    return () => {
      clearInterval(iv);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
      window.removeEventListener('online', onOnline);
      navigator.serviceWorker?.removeEventListener?.('message', onSwMessage);
    };
  }, [refreshState]);

  // Initial session check. A NETWORK failure (no HTTP status) means we simply
  // don't know who the user is - flag it so the app shows a retry screen
  // instead of dumping a logged-in family onto the signup page.
  const initialLoad = useCallback(async () => {
    setLoadError(false);
    try {
      const { user } = await api.me();
      setUser(user);
      setAppUnlocked(!(user && user.locked));
      if (user?.household_id) {
        try {
          setState(await api.state());
        } catch (e: any) {
          if (!e?.status) setLoadError(true);
        }
      }
    } catch (e: any) {
      if (!e?.status) setLoadError(true);
    } finally {
      setReady(true);
    }
  }, []);
  useEffect(() => { initialLoad(); }, [initialLoad]);
  const retryLoad = useCallback(() => { setReady(false); initialLoad(); }, [initialLoad]);

  const afterAuth = useCallback(async (u: User) => {
    setUser(u);
    // An explicit login (full credentials) unlocks this session; the passcode
    // only re-gates on a cold reopen/resume. This is also the recovery path for
    // a forgotten passcode (sign out → log in).
    setAppUnlocked(true);
    setState(await api.state());
  }, []);

  const signup = useCallback(
    async (d: { name: string; email: string; password: string; household?: string }) => {
      const { user } = await api.signup(d);
      await afterAuth(user);
    },
    [afterAuth]
  );
  const login = useCallback(
    async (d: { email: string; password: string }) => {
      const { user } = await api.login(d);
      await afterAuth(user);
    },
    [afterAuth]
  );
  const acceptInvite = useCallback(
    async (token: string, d: { name: string; email: string; password: string }) => {
      const { user } = await api.acceptInvite(token, d);
      await afterAuth(user);
    },
    [afterAuth]
  );
  const acceptInviteExisting = useCallback(
    async (token: string) => {
      const { user } = await api.acceptInviteExisting(token);
      await afterAuth(user);
    },
    [afterAuth]
  );
  const logout = useCallback(async () => {
    await api.logout();
    setUser(null);
    setState(null);
  }, []);
  const resetPassword = useCallback(
    async (token: string, password: string) => {
      const { user } = await api.resetPassword(token, password);
      await afterAuth(user);
    },
    [afterAuth]
  );
  const deleteAccount = useCallback(async () => {
    await api.deleteAccount();
    setUser(null);
    setState(null);
  }, []);

  // Dismiss the first-run welcome. Update locally at once; persist best-effort so
  // a network blip doesn't re-trap the user (they'll just see it once more).
  const patchUser = useCallback((p: Partial<User>) => {
    setUser((u) => (u ? { ...u, ...p } : u));
  }, []);

  const completeOnboarding = useCallback(() => {
    setUser((u) => (u ? { ...u, onboarded: true } : u));
    api.markOnboarded().catch(() => {});
  }, []);

  const unlock = useCallback(() => setAppUnlocked(true), []);
  const setLockEnabled = useCallback((locked: boolean) => {
    setUser((u) => (u ? { ...u, locked } : u));
    if (!locked) setAppUnlocked(true);
  }, []);

  const run = useCallback(
    async (p: Promise<AppState>, msg?: string, key?: string) => {
      if (key) setBusyKeys((b) => ({ ...b, [key]: true }));
      try {
        const s = await p;
        setState(s);
        tapHaptic();
        if (msg) flash(msg);
      } catch (e: any) {
        flash(e?.message || 'Something went wrong');
      } finally {
        if (key) setBusyKeys((b) => { const { [key]: _, ...rest } = b; return rest as Record<string, true>; });
      }
    },
    [flash]
  );
  const isBusy = useCallback((key: string) => !!busyKeys[key], [busyKeys]);

  const openTour = useCallback(() => setTourOpen(true), []);
  const closeTour = useCallback(() => setTourOpen(false), []);

  const value: Store = { ready, user, patchUser, state, toast, flash, signup, login, acceptInvite, acceptInviteExisting, resetPassword, deleteAccount, logout, completeOnboarding, appUnlocked, unlock, setLockEnabled, refreshState, loadError, retryLoad, tourOpen, openTour, closeTour, run, isBusy };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useStore must be used within StoreProvider');
  return c;
}
