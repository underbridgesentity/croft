import { useEffect, useState } from 'react';
import { useStore } from './store';
import { api } from './lib/api';
import Home from './screens/Home';
import Calendar from './screens/Calendar';
import Plans from './screens/Plans';
import Money from './screens/Money';
import Family from './screens/Family';
import { AddSheet, NotifSheet, FormSheet } from './screens/Sheets';

export type Tab = 'home' | 'calendar' | 'tasks' | 'money' | 'family';
export type Plan = 'todos' | 'lists' | 'goals';
export type FormType = 'event' | 'bill' | 'goal';

export interface FormData {
  title?: string; name?: string; amount?: string; date?: string;
  time?: string; due?: string; target?: string; who?: string; payer?: string; kind?: string;
}

export interface Nav {
  tab: Tab; plan: Plan;
  goTab: (t: Tab) => void;
  goPlan: (p: Plan) => void;
  openAdd: () => void;
  openNotifs: () => void;
  openForm: (f: FormType) => void;
  closeSheet: () => void;
}

const grotesk = "'Space Grotesk', sans-serif";

export default function Shell({ onSignedOut }: { onSignedOut: () => void }) {
  const { state, toast, logout, flash } = useStore();
  const [tab, setTab] = useState<Tab>('home');
  const [plan, setPlan] = useState<Plan>('todos');
  const [sheet, setSheet] = useState<null | 'add' | 'notifs' | 'form'>(null);
  const [form, setForm] = useState<FormType>('event');
  const [fd, setFd] = useState<FormData>({});

  // Close the bottom sheet on Escape (basic modal a11y).
  useEffect(() => {
    if (!sheet) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setSheet(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
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
    openForm: (f) => {
      const defaults: Record<FormType, FormData> = {
        event: { title: '', date: '', time: '', who: you?.id },
        bill: { name: '', amount: '', due: '', payer: you?.id },
        goal: { title: '', kind: 'family', target: '' },
      };
      setForm(f);
      setFd(defaults[f]);
      setSheet('form');
    },
    closeSheet: () => setSheet(null),
  };

  const signOut = async () => {
    await logout();
    onSignedOut();
  };

  return (
    <>
      {/* Top bar */}
      <div style={{ flexShrink: 0, padding: '20px 18px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative', zIndex: 8 }}>
        <button onClick={() => nav.goTab('family')} style={{ display: 'flex', alignItems: 'center', gap: 9, border: 'none', background: '#fff', padding: '7px 14px 7px 9px', borderRadius: 100, boxShadow: '0 1px 3px rgba(16,20,38,0.06)', cursor: 'pointer' }}>
          <span style={{ width: 28, height: 28, borderRadius: 9, background: 'rgba(59,91,255,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M3.5 11L12 4l8.5 7v8.2a1 1 0 0 1-1 1H4.5a1 1 0 0 1-1-1z" stroke="#3B5BFF" strokeWidth="1.9" strokeLinejoin="round" /><path d="M9.5 20.5v-6h5v6" stroke="#3B5BFF" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </span>
          <span style={{ fontFamily: grotesk, fontWeight: 700, fontSize: 14.5, letterSpacing: '-0.01em' }}>{state.household.name}</span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ opacity: 0.35 }}><path d="M6 9l6 6 6-6" stroke="#101426" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={nav.openNotifs} aria-label={`Notifications${hasUnread ? ' (unread)' : ''}`} style={{ position: 'relative', width: 42, height: 42, borderRadius: 13, border: 'none', background: '#fff', boxShadow: '0 1px 3px rgba(16,20,38,0.06)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="21" height="21" viewBox="0 0 24 24" fill="none"><path d="M18 9.5a6 6 0 1 0-12 0c0 6-2.5 7.5-2.5 7.5h17S18 15.5 18 9.5" stroke="#101426" strokeWidth="1.8" strokeLinejoin="round" /><path d="M10.2 20.5a2 2 0 0 0 3.6 0" stroke="#101426" strokeWidth="1.8" strokeLinecap="round" /></svg>
            {hasUnread && <span style={{ position: 'absolute', top: 9, right: 10, width: 9, height: 9, borderRadius: '50%', background: '#FF4D5E', border: '2px solid #fff' }} />}
          </button>
          <button onClick={() => nav.goTab('family')} aria-label="Your profile & settings" style={{ width: 42, height: 42, borderRadius: '50%', border: 'none', background: you?.color || '#3B5BFF', color: '#fff', fontFamily: grotesk, fontWeight: 700, fontSize: 16, cursor: 'pointer', boxShadow: '0 2px 8px rgba(59,91,255,0.32)' }}>
            {you?.initial}
          </button>
        </div>
      </div>

      {/* Scroll area */}
      <div className="croft-scroll" style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '4px 18px calc(120px + env(safe-area-inset-bottom))' }}>
        <div className="croft-fade" key={tab}>
          {tab === 'home' && <Home nav={nav} />}
          {tab === 'calendar' && <Calendar nav={nav} />}
          {tab === 'tasks' && <Plans nav={nav} />}
          {tab === 'money' && <Money nav={nav} />}
          {tab === 'family' && <Family nav={nav} onSignOut={signOut} />}
        </div>
      </div>

      {/* FAB */}
      <button onClick={nav.openAdd} aria-label="Add something" style={{ position: 'absolute', right: 18, bottom: 'calc(92px + env(safe-area-inset-bottom))', width: 56, height: 56, borderRadius: 18, border: 'none', background: '#3B5BFF', boxShadow: '0 10px 24px rgba(59,91,255,0.45)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 30 }}>
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" /></svg>
      </button>

      {/* Tab bar */}
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 25, padding: '12px 10px max(16px, env(safe-area-inset-bottom))', background: 'rgba(255,255,255,0.94)', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)', borderTop: '1px solid #EAEEF6', display: 'flex', justifyContent: 'space-around', alignItems: 'center' }}>
        <TabBtn active={tab === 'home'} onClick={() => nav.goTab('home')} label="Home">
          <path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" fill="none" />
        </TabBtn>
        <TabBtn active={tab === 'calendar'} onClick={() => nav.goTab('calendar')} label="Calendar">
          <rect x="3" y="4.5" width="18" height="16" rx="3" stroke="currentColor" strokeWidth="1.9" fill="none" /><path d="M3 9h18M8 2.5v4M16 2.5v4" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
        </TabBtn>
        <TabBtn active={tab === 'tasks'} onClick={() => nav.goTab('tasks')} label="Plans">
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.9" fill="none" /><path d="M8 12.2l2.6 2.6L16 9.4" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
        </TabBtn>
        <TabBtn active={tab === 'money'} onClick={() => nav.goTab('money')} label="Money">
          <rect x="2.5" y="5.5" width="19" height="14" rx="3" stroke="currentColor" strokeWidth="1.9" fill="none" /><path d="M2.5 10h19" stroke="currentColor" strokeWidth="1.9" /><circle cx="17.5" cy="15" r="1.4" fill="currentColor" />
        </TabBtn>
        <TabBtn active={tab === 'family'} onClick={() => nav.goTab('family')} label="Family">
          <circle cx="9" cy="8" r="3.2" stroke="currentColor" strokeWidth="1.9" fill="none" /><circle cx="16.5" cy="9.5" r="2.4" stroke="currentColor" strokeWidth="1.9" fill="none" /><path d="M3.5 19c0-3 2.5-5 5.5-5s5.5 2 5.5 5M15 14.2c2.4.2 4.5 2 4.5 4.8" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" fill="none" />
        </TabBtn>
      </div>

      {/* Sheets */}
      {sheet && (
        <div onClick={nav.closeSheet} className="scrim-in" style={{ position: 'absolute', inset: 0, zIndex: 40, background: 'rgba(16,20,38,0.45)', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
          <div role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()} className="sheet-up croft-scroll" style={{ background: '#F3F5FB', borderRadius: '28px 28px 0 0', padding: '10px 18px calc(30px + env(safe-area-inset-bottom))', maxHeight: '86%', overflowY: 'auto', boxShadow: '0 -8px 40px rgba(0,0,0,0.2)' }}>
            <div style={{ width: 40, height: 5, borderRadius: 100, background: '#D3DAE8', margin: '4px auto 16px' }} />
            {sheet === 'add' && <AddSheet nav={nav} />}
            {sheet === 'notifs' && <NotifSheet />}
            {sheet === 'form' && <FormSheet form={form} fd={fd} setFd={setFd} nav={nav} />}
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div role="status" aria-live="polite" className="toast-in" style={{ position: 'absolute', bottom: 110, left: '50%', zIndex: 60, background: '#101426', color: '#fff', padding: '12px 20px', borderRadius: 100, fontSize: 13.5, fontWeight: 600, whiteSpace: 'nowrap', boxShadow: '0 8px 24px rgba(0,0,0,0.25)' }}>
          {toast}
        </div>
      )}
    </>
  );
}

function TabBtn({ active, onClick, label, children }: { active: boolean; onClick: () => void; label: string; children: React.ReactNode }) {
  return (
    <button onClick={onClick} style={{ border: 'none', background: 'none', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, color: active ? '#3B5BFF' : '#A6AEC0', width: 60 }}>
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">{children}</svg>
      <span style={{ fontSize: 10.5, fontWeight: 700 }}>{label}</span>
    </button>
  );
}
