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
  googleUrl: () => `${BASE}/auth/google`,
  health: () => req<{ ok: boolean; google: boolean }>('/health'),

  // ---- state ----
  state: () => req<AppState>('/state'),

  // ---- mutations (each returns fresh state) ----
  addEvent: (d: { title: string; date?: string; time?: string; who?: string }) =>
    req<AppState>('/events', { method: 'POST', body: JSON.stringify(d) }),
  delEvent: (id: string) => req<AppState>(`/events/${id}`, { method: 'DELETE' }),

  addTask: (d: { title: string; type?: string }) =>
    req<AppState>('/tasks', { method: 'POST', body: JSON.stringify(d) }),
  toggleTask: (id: string, done: boolean) =>
    req<AppState>(`/tasks/${id}`, { method: 'PATCH', body: JSON.stringify({ done }) }),
  delTask: (id: string) => req<AppState>(`/tasks/${id}`, { method: 'DELETE' }),

  addShop: (name: string) => req<AppState>('/shopping', { method: 'POST', body: JSON.stringify({ name }) }),
  toggleShop: (id: string) => req<AppState>(`/shopping/${id}`, { method: 'PATCH', body: '{}' }),
  delShop: (id: string) => req<AppState>(`/shopping/${id}`, { method: 'DELETE' }),

  addGoal: (d: { title: string; kind?: string; target?: string }) =>
    req<AppState>('/goals', { method: 'POST', body: JSON.stringify(d) }),
  bumpGoal: (id: string) => req<AppState>(`/goals/${id}`, { method: 'PATCH', body: '{}' }),
  delGoal: (id: string) => req<AppState>(`/goals/${id}`, { method: 'DELETE' }),

  addBill: (d: { name: string; amount?: string; due?: string; payer?: string }) =>
    req<AppState>('/bills', { method: 'POST', body: JSON.stringify(d) }),
  payBill: (id: string) => req<AppState>(`/bills/${id}`, { method: 'PATCH', body: JSON.stringify({ status: 'paid' }) }),
  delBill: (id: string) => req<AppState>(`/bills/${id}`, { method: 'DELETE' }),

  addMember: (d: { name: string; role?: string }) =>
    req<AppState>('/members', { method: 'POST', body: JSON.stringify(d) }),
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
