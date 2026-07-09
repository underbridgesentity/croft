import { useEffect, useRef, useState } from 'react';
import { useStore } from './store';
import { useIsDesktop } from './lib/useMedia';
import Home from './screens/Home';
import Calendar from './screens/Calendar';
import Plans from './screens/Plans';
import Money from './screens/Money';
import Family from './screens/Family';
import { AddSheet, NotifSheet, FeedSheet, FormSheet } from './screens/Sheets';

export type Tab = 'home' | 'calendar' | 'tasks' | 'money' | 'family';
export type Plan = 'todos' | 'lists' | 'goals' | 'meals';
export type FormType = 'event' | 'bill' | 'goal' | 'task' | 'budget' | 'saving' | 'settle';

export interface FormData {
  title?: string; name?: string; amount?: string; date?: string;
  time?: string; due?: string; target?: string; kind?: string; type?: string;
  limit?: string; spent?: string; saved?: string; note?: string; dir?: string; recur?: string; remindDays?: number;
  dueDate?: string; dueTime?: string;
  // Multi-select member assignment (member ids).
  who?: string[]; payer?: string[]; assignees?: string[];
  // Present when the form edits an existing item instead of creating one.
  editId?: string;
}

export interface Nav {
  tab: Tab; plan: Plan;
  goTab: (t: Tab) => void;
  goPlan: (p: Plan) => void;
  openAdd: () => void;
  openNotifs: () => void;
  openFeed: () => void;
  /** Open a create form, or - when `data.editId` is set - an edit form. */
  openForm: (f: FormType, data?: FormData) => void;
  closeSheet: () => void;
}

const grotesk = "'Geist', sans-serif";

const NAV: { key: Tab; label: string; icon: React.ReactNode }[] = [
  { key: 'home', label: 'Home', icon: <path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" fill="none" /> },
  { key: 'calendar', label: 'Calendar', icon: <><rect x="3" y="4.5" width="18" height="16" rx="3" stroke="currentColor" strokeWidth="1.9" fill="none" /><path d="M3 9h18M8 2.5v4M16 2.5v4" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" /></> },
  { key: 'tasks', label: 'Plans', icon: <><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.9" fill="none" /><path d="M8 12.2l2.6 2.6L16 9.4" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" /></> },
  { key: 'money', label: 'Money', icon: <><rect x="2.5" y="5.5" width="19" height="14" rx="3" stroke="currentColor" strokeWidth="1.9" fill="none" /><path d="M2.5 10h19" stroke="currentColor" strokeWidth="1.9" /><circle cx="17.5" cy="15" r="1.4" fill="currentColor" /></> },
  { key: 'family', label: 'Family', icon: <><circle cx="9" cy="8" r="3.2" stroke="currentColor" strokeWidth="1.9" fill="none" /><circle cx="16.5" cy="9.5" r="2.4" stroke="currentColor" strokeWidth="1.9" fill="none" /><path d="M3.5 19c0-3 2.5-5 5.5-5s5.5 2 5.5 5M15 14.2c2.4.2 4.5 2 4.5 4.8" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" fill="none" /></> },
];

export default function Shell({ onSignedOut }: { onSignedOut: () => void }) {
  const { state, toast, logout, flash } = useStore();
  const isDesktop = useIsDesktop();
  const [tab, setTab] = useState<Tab>('home');
  const [plan, setPlan] = useState<Plan>('todos');
  const [sheet, setSheet] = useState<null | 'add' | 'notifs' | 'feed' | 'form'>(null);
  const [form, setForm] = useState<FormType>('event');
  const [fd, setFd] = useState<FormData>({});

  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!sheet) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setSheet(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sheet]);

  // Modal focus management: move focus into the dialog on open, keep Tab inside
  // it, and restore focus to the trigger on close.
  useEffect(() => {
    if (!sheet) return;
    const prev = document.activeElement as HTMLElement | null;
    const node = dialogRef.current;
    node?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || !node) return;
      const focusable = node.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (!focusable.length) { e.preventDefault(); node.focus(); return; }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement as HTMLElement;
      if (e.shiftKey && (active === first || active === node)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      prev?.focus?.();
    };
  }, [sheet]);

  if (!state) return null;
  const you = state.members.find((m) => m.you) || state.members[0];
  const hasUnread = state.notifications.some((n) => n.unread);

  const nav: Nav = {
    tab,
    plan,
    goTab: (t) => { setTab(t); setSheet(null); },
    goPlan: (p) => setPlan(p),
    openAdd: () => setSheet('add'),
    openNotifs: () => setSheet('notifs'),
    openFeed: () => setSheet('feed'),
    openForm: (f, data) => {
      const defaults: Record<FormType, FormData> = {
        event: { title: '', date: '', time: '', who: you ? [you.id] : [] },
        bill: { name: '', amount: '', due: '', payer: you ? [you.id] : [] },
        goal: { title: '', kind: 'family', target: '' },
        task: { title: '', type: 'Task', assignees: [] },
        budget: { name: '', limit: '' },
        saving: { name: '', target: '', saved: '', amount: '' },
        settle: { who: [], dir: 'in', amount: '', note: '' },
      };
      setForm(f);
      setFd(data || defaults[f]);
      setSheet('form');
    },
    closeSheet: () => setSheet(null),
  };

  const signOut = async () => {
    await logout();
    onSignedOut();
  };

  const screen = (
    <div className="croft-fade" key={tab}>
      {tab === 'home' && <Home nav={nav} />}
      {tab === 'calendar' && <Calendar nav={nav} />}
      {tab === 'tasks' && <Plans nav={nav} />}
      {tab === 'money' && <Money nav={nav} />}
      {tab === 'family' && <Family nav={nav} onSignOut={signOut} />}
    </div>
  );

  // ---------- shared overlay (sheets + toast), adapts bottom-sheet ↔ modal ----------
  const overlay = (
    <>
      {sheet && (
        <div onClick={nav.closeSheet} className="scrim-in" style={{ position: 'absolute', inset: 0, zIndex: 40, background: 'rgba(16,20,38,0.45)', display: 'flex', flexDirection: 'column', justifyContent: isDesktop ? 'center' : 'flex-end', alignItems: isDesktop ? 'center' : 'stretch', padding: isDesktop ? 24 : 0 }}>
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            tabIndex={-1}
            onClick={(e) => e.stopPropagation()}
            className={`croft-scroll ${isDesktop ? 'scrim-in' : 'sheet-up'}`}
            style={{
              outline: 'none',
              background: '#F5F4F1',
              borderRadius: isDesktop ? 24 : '28px 28px 0 0',
              padding: isDesktop ? '20px 22px 26px' : '10px 18px calc(30px + env(safe-area-inset-bottom))',
              overscrollBehavior: 'contain',
              width: isDesktop ? '100%' : 'auto',
              maxWidth: isDesktop ? 460 : 'none',
              maxHeight: isDesktop ? '84vh' : '86%',
              overflowY: 'auto',
              overflowX: 'hidden',
              boxShadow: '0 12px 48px rgba(0,0,0,0.25)',
            }}
          >
            {!isDesktop && <div style={{ width: 40, height: 5, borderRadius: 100, background: '#D8D2C8', margin: '4px auto 16px' }} />}
            {sheet === 'add' && <AddSheet nav={nav} />}
            {sheet === 'notifs' && <NotifSheet />}
            {sheet === 'feed' && <FeedSheet />}
            {sheet === 'form' && <FormSheet form={form} fd={fd} setFd={setFd} nav={nav} />}
          </div>
        </div>
      )}
      {toast && (
        <div role="status" aria-live="polite" className="toast-in" style={{ position: 'absolute', bottom: isDesktop ? 28 : 'calc(164px + env(safe-area-inset-bottom))', left: '50%', zIndex: 60, background: '#181922', color: '#fff', padding: '12px 20px', borderRadius: 100, fontSize: 13.5, fontWeight: 600, whiteSpace: 'nowrap', boxShadow: '0 8px 24px rgba(0,0,0,0.25)' }}>
          {toast}
        </div>
      )}
    </>
  );

  // ================= DESKTOP: sidebar + content =================
  if (isDesktop) {
    return (
      <>
        <div style={{ display: 'flex', height: '100dvh' }}>
          <aside style={{ width: 252, flexShrink: 0, background: '#fff', borderRight: '1px solid #E8E3DB', display: 'flex', flexDirection: 'column', padding: '24px 16px 18px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 8px', marginBottom: 22 }}>
              <img src="/icons/icon-192.png" width={34} height={34} alt="" style={{ borderRadius: 10, display: 'block', boxShadow: '0 4px 12px rgba(31,153,255,0.3)' }} />
              <span style={{ fontFamily: grotesk, fontWeight: 700, fontSize: 19, letterSpacing: '-0.01em' }}>Croft</span>
            </div>

            <button onClick={nav.openAdd} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, border: 'none', background: 'linear-gradient(160deg, #4E6BFF 0%, #3B5BFF 58%, #2E49E8 100%)', color: '#fff', fontFamily: grotesk, fontWeight: 700, fontSize: 14.5, padding: '12px', borderRadius: 14, cursor: 'pointer', boxShadow: '0 6px 16px rgba(59,91,255,0.32), inset 0 1px 0 rgba(255,255,255,0.3)', marginBottom: 18 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" /></svg>
              Add
            </button>

            <nav style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {NAV.map((item) => {
                const active = tab === item.key;
                return (
                  <button key={item.key} onClick={() => nav.goTab(item.key)} style={{ display: 'flex', alignItems: 'center', gap: 12, border: 'none', background: active ? 'rgba(59,91,255,0.1)' : 'transparent', color: active ? '#3B5BFF' : '#655F57', fontWeight: 700, fontSize: 14.5, padding: '11px 12px', borderRadius: 12, cursor: 'pointer', textAlign: 'left' }}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">{item.icon}</svg>
                    {item.label}
                  </button>
                );
              })}
            </nav>

            <div style={{ flex: 1 }} />

            <button onClick={nav.openNotifs} aria-label={`Notifications${hasUnread ? ' (unread)' : ''}`} style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 12, border: 'none', background: 'transparent', color: '#655F57', fontWeight: 700, fontSize: 14, padding: '11px 12px', borderRadius: 12, cursor: 'pointer', textAlign: 'left' }}>
              <svg width="21" height="21" viewBox="0 0 24 24" fill="none"><path d="M18 9.5a6 6 0 1 0-12 0c0 6-2.5 7.5-2.5 7.5h17S18 15.5 18 9.5" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /><path d="M10.2 20.5a2 2 0 0 0 3.6 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
              Notifications
              {hasUnread && <span style={{ position: 'absolute', left: 26, top: 9, width: 8, height: 8, borderRadius: '50%', background: '#FF4D5E', border: '2px solid #fff' }} />}
            </button>

            <button onClick={() => nav.goTab('family')} style={{ display: 'flex', alignItems: 'center', gap: 11, border: 'none', background: '#F5F4F1', padding: '10px 12px', borderRadius: 14, cursor: 'pointer', marginTop: 8, textAlign: 'left' }}>
              <span style={{ width: 36, height: 36, flexShrink: 0, borderRadius: '50%', background: you?.color || '#3B5BFF', color: '#fff', fontFamily: grotesk, fontWeight: 700, fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{you?.initial}</span>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: 'block', fontWeight: 700, fontSize: 13.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{you?.name}</span>
                <span style={{ display: 'block', fontSize: 11.5, color: '#7D776E', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{state.household.name}</span>
              </span>
            </button>
          </aside>

          <main className="croft-scroll" style={{ flex: 1, minHeight: 0, minWidth: 0, overflowY: 'auto', background: 'transparent' }}>
            <div style={{ maxWidth: 880, margin: '0 auto', padding: '30px 40px 64px' }}>{screen}</div>
          </main>
        </div>
        {overlay}
      </>
    );
  }

  // ================= MOBILE: top bar + scroll + FAB + tabs =================
  return (
    <>
      <div style={{ flexShrink: 0, padding: 'max(20px, calc(env(safe-area-inset-top) + 8px)) 18px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative', zIndex: 8 }}>
        <button onClick={() => nav.goTab('family')} className="glass" style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '7px 14px 7px 9px', borderRadius: 100, cursor: 'pointer' }}>
          <span style={{ width: 28, height: 28, borderRadius: 9, background: 'rgba(59,91,255,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M3.5 11L12 4l8.5 7v8.2a1 1 0 0 1-1 1H4.5a1 1 0 0 1-1-1z" stroke="#3B5BFF" strokeWidth="1.9" strokeLinejoin="round" /><path d="M9.5 20.5v-6h5v6" stroke="#3B5BFF" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </span>
          <span style={{ fontFamily: grotesk, fontWeight: 700, fontSize: 14.5, letterSpacing: '-0.01em' }}>{state.household.name}</span>
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={nav.openNotifs} aria-label={`Notifications${hasUnread ? ' (unread)' : ''}`} className="glass" style={{ position: 'relative', width: 42, height: 42, borderRadius: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="21" height="21" viewBox="0 0 24 24" fill="none"><path d="M18 9.5a6 6 0 1 0-12 0c0 6-2.5 7.5-2.5 7.5h17S18 15.5 18 9.5" stroke="#181922" strokeWidth="1.8" strokeLinejoin="round" /><path d="M10.2 20.5a2 2 0 0 0 3.6 0" stroke="#181922" strokeWidth="1.8" strokeLinecap="round" /></svg>
            {hasUnread && <span style={{ position: 'absolute', top: 9, right: 10, width: 9, height: 9, borderRadius: '50%', background: '#FF4D5E', border: '2px solid #fff' }} />}
          </button>
          <button onClick={() => nav.goTab('family')} aria-label="Your profile & settings" style={{ width: 42, height: 42, borderRadius: '50%', border: 'none', background: you?.color || '#3B5BFF', color: '#fff', fontFamily: grotesk, fontWeight: 700, fontSize: 16, cursor: 'pointer', boxShadow: '0 2px 8px rgba(59,91,255,0.32)' }}>
            {you?.initial}
          </button>
        </div>
      </div>

      <div className="croft-scroll" style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', WebkitOverflowScrolling: 'touch', overscrollBehavior: 'contain', padding: '4px 18px calc(172px + env(safe-area-inset-bottom))' }}>
        {screen}
      </div>

      <button onClick={nav.openAdd} aria-label="Add something" style={{ position: 'absolute', right: 18, bottom: 'calc(92px + env(safe-area-inset-bottom))', width: 56, height: 56, borderRadius: 18, border: 'none', background: 'linear-gradient(160deg, #4E6BFF 0%, #3B5BFF 58%, #2E49E8 100%)', boxShadow: '0 10px 26px rgba(59,91,255,0.5), inset 0 1px 0 rgba(255,255,255,0.35)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 30 }}>
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" /></svg>
      </button>

      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 25, padding: '12px 10px max(16px, env(safe-area-inset-bottom))', background: 'rgba(255,255,255,0.72)', backdropFilter: 'blur(22px) saturate(180%)', WebkitBackdropFilter: 'blur(22px) saturate(180%)', borderTop: '1px solid rgba(232,227,219,0.7)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.6), 0 -10px 30px -22px rgba(24,25,34,0.25)', display: 'flex', justifyContent: 'space-around', alignItems: 'center' }}>
        {NAV.map((item) => (
          <button key={item.key} onClick={() => nav.goTab(item.key)} style={{ border: 'none', background: 'none', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, color: tab === item.key ? '#3B5BFF' : '#7D776E', width: 60 }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">{item.icon}</svg>
            <span style={{ fontSize: 10.5, fontWeight: 700 }}>{item.label}</span>
          </button>
        ))}
      </div>

      {overlay}
    </>
  );
}
