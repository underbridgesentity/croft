import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { api } from './lib/api';
import type { AppState, User } from './lib/types';

interface Store {
  ready: boolean;
  user: User | null;
  state: AppState | null;
  toast: string | null;
  flash: (msg: string) => void;
  // auth
  signup: (d: { name: string; email: string; password: string; household?: string }) => Promise<void>;
  login: (d: { email: string; password: string }) => Promise<void>;
  logout: () => Promise<void>;
  completeOnboarding: () => void;
  refreshState: () => Promise<void>;
  // generic apply (mutations return fresh state)
  run: (p: Promise<AppState>, msg?: string) => Promise<void>;
}

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [state, setState] = useState<AppState | null>(null);
  const [toast, setToast] = useState<string | null>(null);
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

  // initial session check
  useEffect(() => {
    (async () => {
      try {
        const { user } = await api.me();
        setUser(user);
        if (user?.household_id) {
          try {
            setState(await api.state());
          } catch {
            /* ignore */
          }
        }
      } catch {
        /* not signed in */
      } finally {
        setReady(true);
      }
    })();
  }, []);

  const afterAuth = useCallback(async (u: User) => {
    setUser(u);
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
  const logout = useCallback(async () => {
    await api.logout();
    setUser(null);
    setState(null);
  }, []);

  // Dismiss the first-run welcome. Update locally at once; persist best-effort so
  // a network blip doesn't re-trap the user (they'll just see it once more).
  const completeOnboarding = useCallback(() => {
    setUser((u) => (u ? { ...u, onboarded: true } : u));
    api.markOnboarded().catch(() => {});
  }, []);

  const run = useCallback(
    async (p: Promise<AppState>, msg?: string) => {
      try {
        const s = await p;
        setState(s);
        if (msg) flash(msg);
      } catch (e: any) {
        flash(e?.message || 'Something went wrong');
      }
    },
    [flash]
  );

  const value: Store = { ready, user, state, toast, flash, signup, login, logout, completeOnboarding, refreshState, run };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useStore must be used within StoreProvider');
  return c;
}
