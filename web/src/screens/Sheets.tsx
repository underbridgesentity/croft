import { useStore } from '../store';
import { api } from '../lib/api';
import type { FormData, FormType, Nav } from '../Shell';
import Icon from '../components/Icon';

const grotesk = "'Geist', sans-serif";

// ---------------- ADD MENU ----------------
export function AddSheet({ nav }: { nav: Nav }) {
  const { flash } = useStore();
  const route = (tab: 'tasks', plan: 'todos' | 'lists' | 'goals', msg: string) => {
    nav.goTab(tab);
    nav.goPlan(plan);
    nav.closeSheet();
    flash(msg);
  };
  const options = [
    { label: 'Calendar event', sub: 'Appointment, birthday, school date', illo: 'calendar', color: '#FFB020', onTap: () => nav.openForm('event') },
    { label: 'To-do', sub: 'A task for you or the family', illo: 'todo', color: '#3B5BFF', onTap: () => route('tasks', 'todos', 'Type your to-do below ↓') },
    { label: 'Reminder for someone', sub: 'Nudge a family member', illo: 'bell', color: '#FF5C8A', onTap: () => route('tasks', 'todos', 'Add a reminder below ↓') },
    { label: 'Shopping item', sub: 'Add to the shared list', illo: 'cart', color: '#16C098', onTap: () => route('tasks', 'lists', 'Add items to the list below ↓') },
    { label: 'Bill', sub: 'Track a payment', illo: 'wallet', color: '#7A5CFF', onTap: () => nav.openForm('bill') },
    { label: 'Goal', sub: 'Family or personal', illo: 'goal', color: '#FF6B5C', onTap: () => nav.openForm('goal') },
  ];
  return (
    <div>
      <div style={{ fontFamily: grotesk, fontWeight: 700, fontSize: 22, margin: '0 2px 4px' }}>Add to Croft</div>
      <div style={{ fontSize: 13, color: '#6F6C67', margin: '0 2px 16px' }}>What would you like to add?</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {options.map((o) => (
          <button key={o.label} onClick={o.onTap} style={{ display: 'flex', alignItems: 'center', gap: 14, textAlign: 'left', border: 'none', background: '#fff', padding: '13px 15px', borderRadius: 18, cursor: 'pointer', boxShadow: '0 1px 2px rgba(24,25,34,0.04), 0 8px 22px -14px rgba(24,25,34,0.12)' }}>
            <Icon name={o.illo} color={o.color} size={44} radius={14} glyph={23} />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 15 }}>{o.label}</div>
              <div style={{ fontSize: 12, color: '#6F6C67', marginTop: 1 }}>{o.sub}</div>
            </div>
            <svg width="8" height="14" viewBox="0 0 8 14"><path d="M1 1l6 6-6 6" stroke="#C4CBDA" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------------- NOTIFICATIONS ----------------
export function NotifSheet() {
  const { state, run } = useStore();
  if (!state) return null;
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '0 2px 16px' }}>
        <div style={{ fontFamily: grotesk, fontWeight: 700, fontSize: 22 }}>Notifications</div>
        <button onClick={() => run(api.markAllRead(), 'All caught up')} style={{ border: 'none', background: 'none', color: '#3B5BFF', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>Mark all read</button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {state.notifications.length === 0 && <div style={{ color: '#6F6C67', fontSize: 13.5, padding: '8px 2px' }}>No notifications yet.</div>}
        {state.notifications.map((n) => (
          <div key={n.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 13, background: '#fff', padding: '14px 15px', borderRadius: 18, boxShadow: '0 1px 2px rgba(24,25,34,0.04), 0 8px 22px -14px rgba(24,25,34,0.12)', position: 'relative' }}>
            <Icon name={n.illo} color={n.color} size={40} radius={12} glyph={21} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 14, lineHeight: 1.25 }}>{n.title}</div>
              <div style={{ fontSize: 12.5, color: '#6F6C67', marginTop: 2, lineHeight: 1.35 }}>{n.body}</div>
              <div style={{ fontSize: 11, color: '#9C968D', fontWeight: 600, marginTop: 5 }}>{n.time_label}</div>
            </div>
            {n.unread && <span style={{ position: 'absolute', top: 14, right: 14, width: 9, height: 9, borderRadius: '50%', background: '#FF4D5E' }} />}
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------- FORMS ----------------
export function FormSheet({ form, fd, setFd, nav }: { form: FormType; fd: FormData; setFd: (d: FormData) => void; nav: Nav }) {
  const { state, run, flash } = useStore();
  if (!state) return null;
  const set = (k: keyof FormData, v: string) => setFd({ ...fd, [k]: v });
  const title = form === 'event' ? 'New event' : form === 'bill' ? 'New bill' : 'New goal';

  const submit = async () => {
    if (form === 'event') {
      if (!fd.title?.trim()) return flash('Add a title first');
      await run(api.addEvent({ title: fd.title, date: fd.date, time: fd.time, who: fd.who }), 'Event added');
      nav.goTab('calendar');
    } else if (form === 'bill') {
      if (!fd.name?.trim()) return flash('Add a bill name');
      await run(api.addBill({ name: fd.name, amount: fd.amount, due: fd.due, payer: fd.payer }), 'Bill added');
      nav.goTab('money');
    } else {
      if (!fd.title?.trim()) return flash('Add a goal title');
      await run(api.addGoal({ title: fd.title, kind: fd.kind, target: fd.target }), 'Goal added');
      nav.goTab('tasks');
      nav.goPlan('goals');
    }
    nav.closeSheet();
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '0 2px 18px' }}>
        <div style={{ fontFamily: grotesk, fontWeight: 700, fontSize: 22 }}>{title}</div>
        <button onClick={nav.closeSheet} style={{ width: 34, height: 34, borderRadius: 11, border: 'none', background: '#EBE7DF', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="#181922" strokeWidth="2.2" strokeLinecap="round" /></svg>
        </button>
      </div>

      {form === 'event' && (
        <div>
          <Field label="Title"><input style={inp} value={fd.title || ''} onChange={(e) => set('title', e.target.value)} placeholder="e.g. Swimming lesson" /></Field>
          <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
            <div style={{ flex: 1 }}><Lbl>Date</Lbl><input style={inp} type="date" value={fd.date || ''} onChange={(e) => set('date', e.target.value)} /></div>
            <div style={{ flex: 1 }}><Lbl>Time</Lbl><input style={inp} type="time" value={fd.time || ''} onChange={(e) => set('time', e.target.value)} /></div>
          </div>
          <Lbl>Who's it for</Lbl>
          <Chips items={state.members.map((m) => ({ id: m.id, label: m.name, color: m.color }))} value={fd.who} onPick={(id) => set('who', id)} />
        </div>
      )}

      {form === 'bill' && (
        <div>
          <Field label="Bill name"><input style={inp} value={fd.name || ''} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Water & lights" /></Field>
          <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
            <div style={{ flex: 1 }}><Lbl>Amount (R)</Lbl><input style={inp} type="number" value={fd.amount || ''} onChange={(e) => set('amount', e.target.value)} placeholder="0" /></div>
            <div style={{ flex: 1 }}><Lbl>Due date</Lbl><input style={inp} type="date" value={fd.due || ''} onChange={(e) => set('due', e.target.value)} /></div>
          </div>
          <Lbl>Paid by</Lbl>
          <Chips items={state.members.map((m) => ({ id: m.id, label: m.name, color: m.color }))} value={fd.payer} onPick={(id) => set('payer', id)} />
        </div>
      )}

      {form === 'goal' && (
        <div>
          <Field label="Goal"><input style={inp} value={fd.title || ''} onChange={(e) => set('title', e.target.value)} placeholder="e.g. Save for a family car" /></Field>
          <div style={{ marginBottom: 16 }}>
            <Lbl>Type</Lbl>
            <div style={{ display: 'flex', gap: 8 }}>
              {[{ k: 'family', l: 'Family' }, { k: 'personal', l: 'Personal' }].map((o) => {
                const sel = (fd.kind || 'family') === o.k;
                return <button key={o.k} onClick={() => set('kind', o.k)} style={{ flex: 1, border: 'none', cursor: 'pointer', padding: '11px 0', borderRadius: 12, fontWeight: 700, fontSize: 13.5, background: sel ? '#3B5BFF' : '#EBE7DF', color: sel ? '#fff' : '#181922' }}>{o.l}</button>;
              })}
            </div>
          </div>
          <Field label="Target amount (optional)"><input style={inp} type="number" value={fd.target || ''} onChange={(e) => set('target', e.target.value)} placeholder="e.g. 15000" /></Field>
        </div>
      )}

      <button onClick={submit} style={{ width: '100%', padding: 16, borderRadius: 16, border: 'none', background: '#3B5BFF', color: '#fff', fontWeight: 700, fontSize: 15.5, cursor: 'pointer', boxShadow: '0 8px 20px rgba(59,91,255,0.32)', marginTop: 22 }}>Add</button>
    </div>
  );
}

const inp: React.CSSProperties = { width: '100%', padding: '14px 16px', borderRadius: 14, border: '1.5px solid #E8E3DB', background: '#fff', fontSize: 15, color: '#181922', outline: 'none' };
function Lbl({ children }: { children: React.ReactNode }) {
  return <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: '#6F6C67', marginBottom: 8 }}>{children}</label>;
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div style={{ marginBottom: 16 }}><Lbl>{label}</Lbl>{children}</div>;
}
function Chips({ items, value, onPick }: { items: { id: string; label: string; color: string }[]; value?: string; onPick: (id: string) => void }) {
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {items.map((c) => {
        const sel = value === c.id;
        return <button key={c.id} onClick={() => onPick(c.id)} style={{ border: 'none', cursor: 'pointer', padding: '9px 14px', borderRadius: 100, fontWeight: 700, fontSize: 13, background: sel ? c.color : '#EBE7DF', color: sel ? '#fff' : '#181922' }}>{c.label}</button>;
      })}
    </div>
  );
}
