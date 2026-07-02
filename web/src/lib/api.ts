import { Capacitor } from '@capacitor/core';
import type { AppState, User } from './types';

// Web serves the app and API from the same origin, so it uses the httpOnly
// `croft_token` cookie unchanged. The native app is bundled and runs from
// capacitor://localhost (cross-origin to the API), so it can't rely on that
// cookie - it talks to the absolute API and carries a bearer token instead.
export const isNative = Capacitor.isNativePlatform();
const BASE = isNative ? 'https://www.croftapp.co.za/api' : '/api';

const TOKEN_KEY = 'croft_session';
function getToken(): string | null {
  return isNative ? localStorage.getItem(TOKEN_KEY) : null;
}
/** Persist (or clear) the native session token. No-op on web (cookie is the source of truth). */
export function setToken(t: string | null | undefined) {
  if (!isNative) return;
  if (t) localStorage.setItem(TOKEN_KEY, t);
  else localStorage.removeItem(TOKEN_KEY);
}

async function req<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(BASE + path, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.headers || {}),
    },
    ...opts,
  });
  let body: any = null;
  try {
    body = await res.json();
  } catch {
    /* no body */
  }
  if (!res.ok) {
    // A 401 from a non-auth (data) route means the session expired mid-use -
    // signal the app to reset to the sign-in screen. Login/me 401s are handled
    // inline by their callers and must not trigger a global sign-out.
    if (res.status === 401 && !path.startsWith('/auth/')) {
      setToken(null); // stale native token → drop it
      window.dispatchEvent(new CustomEvent('croft:unauthorized'));
    }
    const err = new Error(body?.error || `Request failed (${res.status})`) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  return body as T;
}

/** Auth calls that mint a session - persist the returned token on native. */
async function reqAuth<T extends { token?: string }>(path: string, opts: RequestInit): Promise<T> {
  const r = await req<T>(path, opts);
  setToken(r.token);
  return r;
}

export const api = {
  // ---- auth ----
  me: () => req<{ user: User | null }>('/auth/me'),
  signup: (data: { name: string; email: string; password: string; household?: string }) =>
    reqAuth<{ user: User; token?: string }>('/auth/signup', { method: 'POST', body: JSON.stringify(data) }),
  login: (data: { email: string; password: string }) =>
    reqAuth<{ user: User; token?: string }>('/auth/login', { method: 'POST', body: JSON.stringify(data) }),
  logout: async () => { const r = await req<{ ok: true }>('/auth/logout', { method: 'POST' }); setToken(null); return r; },
  markOnboarded: () => req<{ ok: true }>('/onboarded', { method: 'POST' }),
  googleUrl: () => `${BASE}/auth/google`,

  // ---- account recovery ----
  forgotPassword: (email: string) =>
    req<{ ok: true }>('/auth/forgot', { method: 'POST', body: JSON.stringify({ email }) }),
  resetPassword: (token: string, password: string) =>
    reqAuth<{ user: User; token?: string }>('/auth/reset', { method: 'POST', body: JSON.stringify({ token, password }) }),
  changePassword: (d: { currentPassword?: string; newPassword: string }) =>
    req<{ ok: true }>('/auth/change-password', { method: 'POST', body: JSON.stringify(d) }),
  deleteAccount: async () => { const r = await req<{ ok: true }>('/auth/delete-account', { method: 'POST' }); setToken(null); return r; },
  lockSet: (pin: string) => req<{ ok: true }>('/auth/lock/set', { method: 'POST', body: JSON.stringify({ pin }) }),
  lockVerify: (pin: string) => req<{ ok: boolean }>('/auth/lock/verify', { method: 'POST', body: JSON.stringify({ pin }) }),
  lockDisable: (pin: string) => req<{ ok: true }>('/auth/lock/disable', { method: 'POST', body: JSON.stringify({ pin }) }),

  // ---- push ----
  calendarFeed: () => req<{ url: string; webcal: string }>('/calendar-feed'),
  addCalendarSource: (d: { url: string; name?: string }) =>
    req<AppState>('/calendar-sources', { method: 'POST', body: JSON.stringify(d) }),
  refreshCalendarSource: (id: string) =>
    req<AppState>(`/calendar-sources/${id}/refresh`, { method: 'POST' }),
  delCalendarSource: (id: string) =>
    req<AppState>(`/calendar-sources/${id}`, { method: 'DELETE' }),
  pushKey: () => req<{ publicKey: string }>('/push/key'),
  pushSubscribe: (sub: unknown) => req<{ ok: true }>('/push/subscribe', { method: 'POST', body: JSON.stringify(sub) }),
  pushUnsubscribe: (endpoint: string) => req<{ ok: true }>('/push/unsubscribe', { method: 'POST', body: JSON.stringify({ endpoint }) }),

  // ---- invites ----
  createInvite: (opts?: { memberId?: string; email?: string }) =>
    req<{ token: string; emailed: boolean }>('/invites', { method: 'POST', body: JSON.stringify(opts || {}) }),
  getInvite: (token: string) =>
    req<{ household_name: string; inviter_name: string | null; role: string | null }>(`/auth/invite/${token}`),
  acceptInvite: (token: string, d: { name: string; email: string; password: string }) =>
    reqAuth<{ user: User; token?: string }>(`/auth/invite/${token}/accept`, { method: 'POST', body: JSON.stringify(d) }),
  googleInviteUrl: (token: string) => `${BASE}/auth/google?invite=${encodeURIComponent(token)}`,
  health: () => req<{ ok: boolean; google: boolean }>('/health'),

  // ---- state ----
  state: () => req<AppState>('/state'),

  // ---- mutations (each returns fresh state) ----
  addEvent: (d: { title: string; date?: string; time?: string; who?: string[]; recur?: string }) =>
    req<AppState>('/events', { method: 'POST', body: JSON.stringify(d) }),
  updEvent: (id: string, d: { title: string; date?: string; time?: string; who?: string[]; recur?: string }) =>
    req<AppState>(`/events/${id}`, { method: 'PATCH', body: JSON.stringify(d) }),
  delEvent: (id: string) => req<AppState>(`/events/${id}`, { method: 'DELETE' }),

  addTask: (d: { title: string; type?: string; assignees?: string[]; recur?: string }) =>
    req<AppState>('/tasks', { method: 'POST', body: JSON.stringify(d) }),
  updTask: (id: string, d: { title: string; type?: string; assignees?: string[]; recur?: string }) =>
    req<AppState>(`/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(d) }),
  toggleTask: (id: string, done: boolean) =>
    req<AppState>(`/tasks/${id}`, { method: 'PATCH', body: JSON.stringify({ done }) }),
  delTask: (id: string) => req<AppState>(`/tasks/${id}`, { method: 'DELETE' }),

  addShop: (name: string) => req<AppState>('/shopping', { method: 'POST', body: JSON.stringify({ name }) }),
  renameShop: (id: string, name: string) =>
    req<AppState>(`/shopping/${id}`, { method: 'PATCH', body: JSON.stringify({ name }) }),
  toggleShop: (id: string) => req<AppState>(`/shopping/${id}`, { method: 'PATCH', body: '{}' }),
  delShop: (id: string) => req<AppState>(`/shopping/${id}`, { method: 'DELETE' }),

  addGoal: (d: { title: string; kind?: string; target?: string }) =>
    req<AppState>('/goals', { method: 'POST', body: JSON.stringify(d) }),
  updGoal: (id: string, d: { title: string; kind?: string; target?: string; addAmount?: string }) =>
    req<AppState>(`/goals/${id}`, { method: 'PATCH', body: JSON.stringify(d) }),
  bumpGoal: (id: string) => req<AppState>(`/goals/${id}`, { method: 'PATCH', body: '{}' }),
  delGoal: (id: string) => req<AppState>(`/goals/${id}`, { method: 'DELETE' }),

  addBudget: (d: { name: string; limit?: string }) =>
    req<AppState>('/budget', { method: 'POST', body: JSON.stringify(d) }),
  updBudget: (id: string, d: { name: string; limit?: string; addSpend?: string; note?: string }) =>
    req<AppState>(`/budget/${id}`, { method: 'PATCH', body: JSON.stringify(d) }),
  delBudget: (id: string) => req<AppState>(`/budget/${id}`, { method: 'DELETE' }),
  delBudgetSpend: (id: string) => req<AppState>(`/budget/spend/${id}`, { method: 'DELETE' }),

  addSaving: (d: { name: string; target?: string; saved?: string }) =>
    req<AppState>('/savings', { method: 'POST', body: JSON.stringify(d) }),
  updSaving: (id: string, d: { name: string; target?: string; saved?: string; addAmount?: string }) =>
    req<AppState>(`/savings/${id}`, { method: 'PATCH', body: JSON.stringify(d) }),
  delSaving: (id: string) => req<AppState>(`/savings/${id}`, { method: 'DELETE' }),

  addSettle: (d: { memberId: string; dir: 'in' | 'out'; amount: string; note?: string }) =>
    req<AppState>('/settle', { method: 'POST', body: JSON.stringify(d) }),
  updSettle: (id: string, d: { memberId: string; dir: 'in' | 'out'; amount: string; note?: string }) =>
    req<AppState>(`/settle/${id}`, { method: 'PATCH', body: JSON.stringify(d) }),
  delSettle: (id: string) => req<AppState>(`/settle/${id}`, { method: 'DELETE' }),

  addBill: (d: { name: string; amount?: string; due?: string; payer?: string[]; recur?: string }) =>
    req<AppState>('/bills', { method: 'POST', body: JSON.stringify(d) }),
  updBill: (id: string, d: { name: string; amount?: string; due?: string; payer?: string[]; recur?: string }) =>
    req<AppState>(`/bills/${id}`, { method: 'PATCH', body: JSON.stringify(d) }),
  payBill: (id: string) => req<AppState>(`/bills/${id}`, { method: 'PATCH', body: JSON.stringify({ status: 'paid' }) }),
  delBill: (id: string) => req<AppState>(`/bills/${id}`, { method: 'DELETE' }),

  addMember: (d: { name: string; role?: string }) =>
    req<AppState>('/members', { method: 'POST', body: JSON.stringify(d) }),
  updMember: (id: string, d: { name?: string; role?: string; color?: string }) =>
    req<AppState>(`/members/${id}`, { method: 'PATCH', body: JSON.stringify(d) }),
  delMember: (id: string) => req<AppState>(`/members/${id}`, { method: 'DELETE' }),

  markAllRead: () => req<AppState>('/notifications/read-all', { method: 'POST' }),
  nudge: (name: string) => req<AppState>('/nudge', { method: 'POST', body: JSON.stringify({ name }) }),
  settleUp: (id: string) => req<AppState>(`/settle/${id}`, { method: 'PATCH', body: '{}' }),
  setSetting: (key: string, value: unknown) =>
    req<AppState>('/settings', { method: 'PATCH', body: JSON.stringify({ key, value }) }),
  renameHousehold: (name: string) =>
    req<AppState>('/household', { method: 'PATCH', body: JSON.stringify({ name }) }),
};

export const money = (n: number) => 'R' + Number(n || 0).toLocaleString('en-ZA');
