import type { AppState, User } from './types';

const BASE = '/api';

async function req<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const res = await fetch(BASE + path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
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
      window.dispatchEvent(new CustomEvent('croft:unauthorized'));
    }
    const err = new Error(body?.error || `Request failed (${res.status})`) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  return body as T;
}

export const api = {
  // ---- auth ----
  me: () => req<{ user: User | null }>('/auth/me'),
  signup: (data: { name: string; email: string; password: string; household?: string }) =>
    req<{ user: User }>('/auth/signup', { method: 'POST', body: JSON.stringify(data) }),
  login: (data: { email: string; password: string }) =>
    req<{ user: User }>('/auth/login', { method: 'POST', body: JSON.stringify(data) }),
  logout: () => req<{ ok: true }>('/auth/logout', { method: 'POST' }),
  markOnboarded: () => req<{ ok: true }>('/onboarded', { method: 'POST' }),
  googleUrl: () => `${BASE}/auth/google`,

  // ---- account recovery ----
  forgotPassword: (email: string) =>
    req<{ ok: true }>('/auth/forgot', { method: 'POST', body: JSON.stringify({ email }) }),
  resetPassword: (token: string, password: string) =>
    req<{ user: User }>('/auth/reset', { method: 'POST', body: JSON.stringify({ token, password }) }),
  changePassword: (d: { currentPassword?: string; newPassword: string }) =>
    req<{ ok: true }>('/auth/change-password', { method: 'POST', body: JSON.stringify(d) }),
  deleteAccount: () => req<{ ok: true }>('/auth/delete-account', { method: 'POST' }),
  lockSet: (pin: string) => req<{ ok: true }>('/auth/lock/set', { method: 'POST', body: JSON.stringify({ pin }) }),
  lockVerify: (pin: string) => req<{ ok: boolean }>('/auth/lock/verify', { method: 'POST', body: JSON.stringify({ pin }) }),
  lockDisable: (pin: string) => req<{ ok: true }>('/auth/lock/disable', { method: 'POST', body: JSON.stringify({ pin }) }),

  // ---- push ----
  calendarFeed: () => req<{ url: string; webcal: string }>('/calendar-feed'),
  pushKey: () => req<{ publicKey: string }>('/push/key'),
  pushSubscribe: (sub: unknown) => req<{ ok: true }>('/push/subscribe', { method: 'POST', body: JSON.stringify(sub) }),
  pushUnsubscribe: (endpoint: string) => req<{ ok: true }>('/push/unsubscribe', { method: 'POST', body: JSON.stringify({ endpoint }) }),

  // ---- invites ----
  createInvite: (opts?: { memberId?: string; email?: string }) =>
    req<{ token: string; emailed: boolean }>('/invites', { method: 'POST', body: JSON.stringify(opts || {}) }),
  getInvite: (token: string) =>
    req<{ household_name: string; inviter_name: string | null; role: string | null }>(`/auth/invite/${token}`),
  acceptInvite: (token: string, d: { name: string; email: string; password: string }) =>
    req<{ user: User }>(`/auth/invite/${token}/accept`, { method: 'POST', body: JSON.stringify(d) }),
  googleInviteUrl: (token: string) => `${BASE}/auth/google?invite=${encodeURIComponent(token)}`,
  health: () => req<{ ok: boolean; google: boolean }>('/health'),

  // ---- state ----
  state: () => req<AppState>('/state'),

  // ---- mutations (each returns fresh state) ----
  addEvent: (d: { title: string; date?: string; time?: string; who?: string[] }) =>
    req<AppState>('/events', { method: 'POST', body: JSON.stringify(d) }),
  updEvent: (id: string, d: { title: string; date?: string; time?: string; who?: string[] }) =>
    req<AppState>(`/events/${id}`, { method: 'PATCH', body: JSON.stringify(d) }),
  delEvent: (id: string) => req<AppState>(`/events/${id}`, { method: 'DELETE' }),

  addTask: (d: { title: string; type?: string; assignees?: string[] }) =>
    req<AppState>('/tasks', { method: 'POST', body: JSON.stringify(d) }),
  updTask: (id: string, d: { title: string; type?: string; assignees?: string[] }) =>
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

  addBudget: (d: { name: string; limit?: string; spent?: string }) =>
    req<AppState>('/budget', { method: 'POST', body: JSON.stringify(d) }),
  updBudget: (id: string, d: { name: string; limit?: string; spent?: string }) =>
    req<AppState>(`/budget/${id}`, { method: 'PATCH', body: JSON.stringify(d) }),
  delBudget: (id: string) => req<AppState>(`/budget/${id}`, { method: 'DELETE' }),

  addSaving: (d: { name: string; target?: string; saved?: string }) =>
    req<AppState>('/savings', { method: 'POST', body: JSON.stringify(d) }),
  updSaving: (id: string, d: { name: string; target?: string; saved?: string }) =>
    req<AppState>(`/savings/${id}`, { method: 'PATCH', body: JSON.stringify(d) }),
  delSaving: (id: string) => req<AppState>(`/savings/${id}`, { method: 'DELETE' }),

  addSettle: (d: { memberId: string; dir: 'in' | 'out'; amount: string; note?: string }) =>
    req<AppState>('/settle', { method: 'POST', body: JSON.stringify(d) }),
  updSettle: (id: string, d: { memberId: string; dir: 'in' | 'out'; amount: string; note?: string }) =>
    req<AppState>(`/settle/${id}`, { method: 'PATCH', body: JSON.stringify(d) }),
  delSettle: (id: string) => req<AppState>(`/settle/${id}`, { method: 'DELETE' }),

  addBill: (d: { name: string; amount?: string; due?: string; payer?: string[] }) =>
    req<AppState>('/bills', { method: 'POST', body: JSON.stringify(d) }),
  updBill: (id: string, d: { name: string; amount?: string; due?: string; payer?: string[] }) =>
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
