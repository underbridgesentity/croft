import { useRef, useState } from 'react';
import { useStore } from '../store';
import { api, money } from '../lib/api';
import type { FormData, FormType, Nav } from '../Shell';
import Icon from '../components/Icon';
import { parseRecur, buildInterval, buildPos, WEEKDAYS, ORDINALS, type Unit } from '../lib/recur';

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
    { label: 'To-do', sub: 'A task for anyone in the family', illo: 'todo', color: '#3B5BFF', onTap: () => nav.openForm('task') },
    { label: 'Reminder for someone', sub: 'Nudge one or more people', illo: 'bell', color: '#FF5C8A', onTap: () => nav.openForm('task', { title: '', type: 'Reminder', assignees: [] }) },
    { label: 'Shopping item', sub: 'Add to the shared list', illo: 'cart', color: '#16C098', onTap: () => route('tasks', 'lists', 'Add items to the list below') },
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
            <svg width="8" height="14" viewBox="0 0 8 14"><path d="M1 1l6 6-6 6" stroke="#C9C3B9" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
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
              <div style={{ fontSize: 11, color: '#7D776E', fontWeight: 600, marginTop: 5 }}>{n.time_label}</div>
            </div>
            {n.unread && <span style={{ position: 'absolute', top: 14, right: 14, width: 9, height: 9, borderRadius: '50%', background: '#FF4D5E' }} />}
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------- FAMILY ACTIVITY (full feed) ----------------
export function FeedSheet() {
  const { state } = useStore();
  if (!state) return null;
  return (
    <div>
      <div style={{ fontFamily: grotesk, fontWeight: 700, fontSize: 22, margin: '0 2px 16px' }}>Family activity</div>
      {state.feed.length === 0 && <div style={{ color: '#6F6C67', fontSize: 13.5, padding: '8px 2px' }}>No activity yet - it shows up here as the family adds and completes things.</div>}
      <div style={{ background: '#fff', borderRadius: 18, padding: '4px 16px' }}>
        {state.feed.map((f) => (
          <div key={f.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 0', borderBottom: '1px solid #EFEBE3' }}>
            <div style={{ flexShrink: 0, width: 32, height: 32, borderRadius: '50%', background: f.color, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: grotesk, fontWeight: 700, fontSize: 13 }}>{f.initial}</div>
            <div style={{ flex: 1, fontSize: 13.5, color: '#3A362F', lineHeight: 1.4 }}><b style={{ fontWeight: 700, color: '#181922' }}>{f.who}</b> {f.txt}</div>
            <div style={{ flexShrink: 0, fontSize: 11, color: '#7D776E', fontWeight: 600, paddingTop: 2 }}>{f.time_label}</div>
          </div>
        ))}
        <div style={{ height: 6 }} />
      </div>
    </div>
  );
}

// ---------------- FORMS ----------------
export function FormSheet({ form, fd, setFd, nav }: { form: FormType; fd: FormData; setFd: (d: FormData) => void; nav: Nav }) {
  const { state, run, flash } = useStore();
  // In-flight guard: a slow (cold-start) request must not allow a second tap to
  // submit twice - the cause of duplicated bills/IOUs. The ref blocks re-entry
  // SYNCHRONOUSLY (state alone lags a render, so rapid taps slip through);
  // the state drives the disabled/label visuals.
  const busyRef = useRef(false);
  const [busy, setBusy] = useState(false);
  if (!state) return null;
  const set = (k: keyof FormData, v: string) => setFd({ ...fd, [k]: v });
  const toggle = (k: 'who' | 'payer' | 'assignees', id: string) => {
    const cur = fd[k] || [];
    setFd({ ...fd, [k]: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id] });
  };
  const editing = !!fd.editId;
  const NOUNS: Record<FormType, string> = { event: 'event', bill: 'bill', task: 'to-do', goal: 'goal', budget: 'budget category', saving: 'savings goal', settle: 'IOU' };
  const noun = NOUNS[form];
  const title = form === 'settle' && !editing ? 'Who owes who' : `${editing ? 'Edit' : 'New'} ${noun}`;
  const memberChips = state.members.map((m) => ({ id: m.id, label: m.name, color: m.color }));
  // This month's spends behind the budget being edited (SAST month = the user's
  // local month here), newest first, so the full breakdown shows and any mistake
  // can be removed.
  const thisMonth = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; })();
  const budgetSpends = editing && form === 'budget'
    ? (state.budgetSpends || []).filter((sp) => sp.budget_id === fd.editId && sp.month === thisMonth)
    : [];
  const fmtDay = (iso: string) => { try { return new Date(iso + 'T00:00').toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' }); } catch { return iso; } };

  const submit = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      await doSubmit();
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const doSubmit = async () => {
    if (form === 'event') {
      if (!fd.title?.trim()) return flash('Add a title first');
      const d = { title: fd.title, date: fd.date, time: fd.time, who: fd.who, recur: fd.recur };
      await run(editing ? api.updEvent(fd.editId!, d) : api.addEvent(d), editing ? 'Event updated' : 'Event added');
      if (!editing) nav.goTab('calendar');
    } else if (form === 'bill') {
      if (!fd.name?.trim()) return flash('Add a bill name');
      const d = { name: fd.name, amount: fd.amount, due: fd.due, payer: fd.payer, recur: fd.recur };
      await run(editing ? api.updBill(fd.editId!, d) : api.addBill(d), editing ? 'Bill updated' : 'Bill added');
      if (!editing) nav.goTab('money');
    } else if (form === 'task') {
      if (!fd.title?.trim()) return flash('Type a to-do');
      const d = { title: fd.title, type: fd.type, assignees: fd.assignees, recur: fd.recur };
      await run(editing ? api.updTask(fd.editId!, d) : api.addTask(d), editing ? 'To-do updated' : 'To-do added');
      if (!editing) { nav.goTab('tasks'); nav.goPlan('todos'); }
    } else if (form === 'goal') {
      if (!fd.title?.trim()) return flash('Add a goal title');
      const d = { title: fd.title, kind: fd.kind, target: fd.target };
      await run(
        editing ? api.updGoal(fd.editId!, { ...d, addAmount: fd.amount }) : api.addGoal(d),
        editing ? 'Goal updated' : 'Goal added'
      );
      if (!editing) { nav.goTab('tasks'); nav.goPlan('goals'); }
    } else if (form === 'budget') {
      if (!fd.name?.trim()) return flash('Add a category name');
      await run(
        editing
          ? api.updBudget(fd.editId!, { name: fd.name, limit: fd.limit, addSpend: fd.amount, note: fd.note })
          : api.addBudget({ name: fd.name, limit: fd.limit }),
        editing ? (Number(fd.amount) ? 'Spend logged' : 'Budget updated') : 'Budget category added'
      );
    } else if (form === 'saving') {
      if (!fd.name?.trim()) return flash('Add a savings goal name');
      const d = { name: fd.name, target: fd.target, saved: fd.saved, addAmount: fd.amount };
      await run(editing ? api.updSaving(fd.editId!, d) : api.addSaving(d), editing ? (Number(fd.amount) ? 'Added to savings' : 'Savings goal updated') : 'Savings goal added');
    } else {
      const memberId = (fd.who || [])[0];
      if (!memberId) return flash('Pick a family member');
      if (!Number(fd.amount)) return flash('Enter an amount');
      const d = { memberId, dir: (fd.dir as 'in' | 'out') || 'in', amount: fd.amount!, note: fd.note };
      await run(editing ? api.updSettle(fd.editId!, d) : api.addSettle(d), editing ? 'Updated' : 'Added to who owes who');
    }
    nav.closeSheet();
  };

  const remove = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      const del = { event: api.delEvent, bill: api.delBill, task: api.delTask, goal: api.delGoal, budget: api.delBudget, saving: api.delSaving, settle: api.delSettle }[form];
      await run(del(fd.editId!), 'Removed');
      nav.closeSheet();
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
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
            <div style={{ flex: 1, minWidth: 0 }}><Lbl>Date</Lbl><input style={inp} type="date" value={fd.date || ''} onChange={(e) => set('date', e.target.value)} /></div>
            <div style={{ flex: 1, minWidth: 0 }}><Lbl>Time</Lbl><input style={inp} type="time" value={fd.time || ''} onChange={(e) => set('time', e.target.value)} /></div>
          </div>
          <Lbl>Who's it for - pick any</Lbl>
          <Chips items={memberChips} value={fd.who || []} onToggle={(id) => toggle('who', id)} emptyHint="Nobody picked = the whole family" />
          <div style={{ height: 16 }} />
          <RepeatField value={fd.recur} onChange={(v) => set('recur', v)} anchorDate={fd.date} showAdvanced />
        </div>
      )}

      {form === 'task' && (
        <div>
          <Field label="What needs doing"><input style={inp} value={fd.title || ''} onChange={(e) => set('title', e.target.value)} placeholder="e.g. Take out the recycling" /></Field>
          <div style={{ marginBottom: 16 }}>
            <Lbl>Type</Lbl>
            <div style={{ display: 'flex', gap: 8 }}>
              {[{ k: 'Task', l: 'To-do' }, { k: 'Reminder', l: 'Reminder' }].map((o) => {
                const sel = (fd.type || 'Task') === o.k;
                return <button key={o.k} onClick={() => set('type', o.k)} style={{ flex: 1, border: 'none', cursor: 'pointer', padding: '11px 0', borderRadius: 12, fontWeight: 700, fontSize: 13.5, background: sel ? '#3B5BFF' : '#EBE7DF', color: sel ? '#fff' : '#181922' }}>{o.l}</button>;
              })}
            </div>
          </div>
          <Lbl>Who's responsible - pick any</Lbl>
          <Chips items={memberChips} value={fd.assignees || []} onToggle={(id) => toggle('assignees', id)} emptyHint="Nobody picked = anyone can do it" />
          <div style={{ height: 16 }} />
          <RepeatField value={fd.recur} onChange={(v) => set('recur', v)} />
        </div>
      )}

      {form === 'bill' && (
        <div>
          <Field label="Bill name"><input style={inp} value={fd.name || ''} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Water & lights" /></Field>
          <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
            <div style={{ flex: 1, minWidth: 0 }}><Lbl>Amount (R)</Lbl><input style={inp} type="number" value={fd.amount || ''} onChange={(e) => set('amount', e.target.value)} placeholder="0" /></div>
            <div style={{ flex: 1, minWidth: 0 }}><Lbl>Due date</Lbl><input style={inp} type="date" value={fd.due || ''} onChange={(e) => set('due', e.target.value)} /></div>
          </div>
          <Lbl>Paid by - pick any</Lbl>
          <Chips items={memberChips} value={fd.payer || []} onToggle={(id) => toggle('payer', id)} emptyHint="Nobody picked = shared" />
          <div style={{ height: 16 }} />
          <RepeatField value={fd.recur} onChange={(v) => set('recur', v)} anchorDate={fd.due} showAdvanced hint="A paid recurring bill creates next period's bill automatically." />
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
          {editing && Number(fd.target) > 0 && (
            <Field label="Add to progress (R, optional)"><input style={inp} type="number" value={fd.amount || ''} onChange={(e) => set('amount', e.target.value)} placeholder="e.g. 500" /></Field>
          )}
        </div>
      )}

      {form === 'budget' && (
        <div>
          <Field label="Category name"><input style={inp} value={fd.name || ''} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Groceries" /></Field>
          <Field label="Monthly limit (R)"><input style={inp} type="number" value={fd.limit || ''} onChange={(e) => set('limit', e.target.value)} placeholder="0" /></Field>
          {editing && (
            <>
              <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
                <div style={{ flex: 1, minWidth: 0 }}><Lbl>Log a spend (R)</Lbl><input style={inp} type="number" value={fd.amount || ''} onChange={(e) => set('amount', e.target.value)} placeholder="e.g. 250" /></div>
                <div style={{ flex: 1.4, minWidth: 0 }}><Lbl>What for? (optional)</Lbl><input style={inp} value={fd.note || ''} onChange={(e) => set('note', e.target.value)} placeholder="e.g. Woolies run" /></div>
              </div>
              <div style={{ fontSize: 11.5, color: '#7D776E', margin: '-6px 2px 14px' }}>Spends tally up for the month. Use a minus amount to correct a mistake.</div>
              {budgetSpends.length > 0 && (
                <div style={{ marginBottom: 4 }}>
                  <Lbl>This month's spends</Lbl>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {budgetSpends.map((sp) => (
                      <div key={sp.id} style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#fff', border: '1px solid #EEEAE2', borderRadius: 12, padding: '9px 12px' }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13.5, fontWeight: 600, color: '#181922', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sp.note || 'Spend'}</div>
                          <div style={{ fontSize: 11.5, color: '#7D776E', marginTop: 1 }}>{fmtDay(sp.date)}</div>
                        </div>
                        <div style={{ fontFamily: grotesk, fontWeight: 700, fontSize: 14, color: sp.amount < 0 ? '#16C098' : '#181922' }}>{sp.amount < 0 ? '-' : ''}{money(Math.abs(sp.amount))}</div>
                        <button onClick={() => run(api.delBudgetSpend(sp.id), 'Spend removed')} aria-label="Remove spend" style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 4, flexShrink: 0 }}>
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M5 7h14M10 7V5h4v2M9 7l.7 12h8.6L19 7" stroke="#C9C3B9" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {form === 'saving' && (
        <div>
          <Field label="What are you saving for?"><input style={inp} value={fd.name || ''} onChange={(e) => set('name', e.target.value)} placeholder="e.g. December holiday" /></Field>
          <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
            <div style={{ flex: 1, minWidth: 0 }}><Lbl>Target (R)</Lbl><input style={inp} type="number" value={fd.target || ''} onChange={(e) => set('target', e.target.value)} placeholder="0" /></div>
            <div style={{ flex: 1, minWidth: 0 }}><Lbl>Saved so far (R)</Lbl><input style={inp} type="number" value={fd.saved || ''} onChange={(e) => set('saved', e.target.value)} placeholder="0" /></div>
          </div>
          {editing && (
            <Field label="Add to savings (R)"><input style={inp} type="number" value={fd.amount || ''} onChange={(e) => set('amount', e.target.value)} placeholder="e.g. 500" /></Field>
          )}
        </div>
      )}

      {form === 'settle' && (
        <div>
          <div style={{ marginBottom: 16 }}>
            <Lbl>Direction</Lbl>
            <div style={{ display: 'flex', gap: 8 }}>
              {[{ k: 'in', l: 'They owe me' }, { k: 'out', l: 'I owe them' }].map((o) => {
                const sel = (fd.dir || 'in') === o.k;
                return <button key={o.k} onClick={() => set('dir', o.k)} style={{ flex: 1, border: 'none', cursor: 'pointer', padding: '11px 0', borderRadius: 12, fontWeight: 700, fontSize: 13.5, background: sel ? '#3B5BFF' : '#EBE7DF', color: sel ? '#fff' : '#181922' }}>{o.l}</button>;
              })}
            </div>
          </div>
          <div style={{ marginBottom: 16 }}>
            <Lbl>Who</Lbl>
            <Chips items={memberChips} value={fd.who || []} onToggle={(id) => setFd({ ...fd, who: [id] })} />
          </div>
          <Field label="Amount (R)"><input style={inp} type="number" value={fd.amount || ''} onChange={(e) => set('amount', e.target.value)} placeholder="e.g. 450" /></Field>
          <Field label="What for? (optional)"><input style={inp} value={fd.note || ''} onChange={(e) => set('note', e.target.value)} placeholder="e.g. Groceries last week" /></Field>
        </div>
      )}

      <button onClick={submit} disabled={busy} style={{ width: '100%', padding: 16, borderRadius: 16, border: 'none', background: '#3B5BFF', color: '#fff', fontWeight: 700, fontSize: 15.5, cursor: 'pointer', boxShadow: '0 8px 20px rgba(59,91,255,0.32)', marginTop: 22, opacity: busy ? 0.6 : 1 }}>
        {busy ? (editing ? 'Saving…' : 'Adding…') : editing ? 'Save changes' : 'Add'}
      </button>
      {editing && (
        <button onClick={remove} disabled={busy} style={{ width: '100%', border: 'none', background: 'none', color: '#FF4D5E', fontWeight: 700, fontSize: 13.5, padding: '14px 0 2px', cursor: 'pointer', opacity: busy ? 0.5 : 1 }}>Delete this {noun}</button>
      )}
    </div>
  );
}

const inp: React.CSSProperties = { width: '100%', minWidth: 0, maxWidth: '100%', height: 51, boxSizing: 'border-box', padding: '14px 16px', borderRadius: 14, border: '1.5px solid #E8E3DB', background: '#fff', fontSize: 16, color: '#181922', outline: 'none', WebkitAppearance: 'none', appearance: 'none' };
function Lbl({ children }: { children: React.ReactNode }) {
  return <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: '#6F6C67', marginBottom: 8 }}>{children}</label>;
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div style={{ marginBottom: 16 }}><Lbl>{label}</Lbl>{children}</div>;
}
const pillStyle = (sel: boolean): React.CSSProperties => ({ border: 'none', cursor: 'pointer', padding: '9px 13px', borderRadius: 100, fontWeight: 700, fontSize: 12.5, background: sel ? '#3B5BFF' : '#EBE7DF', color: sel ? '#fff' : '#181922' });
const CHIP_TO_UNIT: Record<string, Unit> = { daily: 'day', weekly: 'week', monthly: 'month', yearly: 'year' };
const UNIT_TO_CHIP: Record<Unit, string> = { day: 'daily', week: 'weekly', month: 'monthly', year: 'yearly' };

/** Repeat-rule picker. Basic (tasks): frequency only. Advanced (events/bills):
 * an "every N units" interval, and for Monthly an "on the Nth weekday" option
 * derived from the anchor date. */
function RepeatField({ value, onChange, hint, anchorDate, showAdvanced }: { value?: string; onChange: (v: string) => void; hint?: string; anchorDate?: string; showAdvanced?: boolean }) {
  const rule = parseRecur(value);
  const chip = rule.kind === 'none' ? 'none' : rule.kind === 'pos' ? 'monthly' : UNIT_TO_CHIP[rule.unit];
  const interval = rule.kind === 'int' ? rule.n : 1;
  const isPos = rule.kind === 'pos';
  const anchor = anchorDate ? new Date(anchorDate + 'T00:00') : null;
  const anchorOk = anchor && !isNaN(anchor.getTime());
  const anchorWd = anchorOk ? anchor!.getDay() : null;
  const anchorDom = anchorOk ? anchor!.getDate() : null;
  const defOrd = anchorDom ? Math.min(4, Math.ceil(anchorDom / 7)) : 1;
  const curWd = isPos ? rule.wd : anchorWd;
  const curOrd = isPos ? rule.ord : defOrd;

  const freqChips: [string, string][] = [['none', "Doesn't repeat"], ['daily', 'Daily'], ['weekly', 'Weekly'], ['monthly', 'Monthly'], ['yearly', 'Yearly']];
  const setN = (n: number) => onChange(buildInterval(CHIP_TO_UNIT[chip], Math.min(30, Math.max(1, n))));

  return (
    <div style={{ marginBottom: 16 }}>
      <Lbl>Repeats</Lbl>
      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
        {freqChips.map(([k, l]) => <button key={k} onClick={() => onChange(k)} aria-pressed={chip === k} style={pillStyle(chip === k)}>{l}</button>)}
      </div>

      {showAdvanced && chip !== 'none' && !isPos && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12 }}>
          <span style={{ fontSize: 12.5, color: '#6F6C67', fontWeight: 600 }}>Every</span>
          <button onClick={() => setN(interval - 1)} aria-label="Fewer" style={{ width: 34, height: 34, borderRadius: 10, border: 'none', background: '#EBE7DF', cursor: 'pointer', fontSize: 18, color: '#181922', lineHeight: 1 }}>−</button>
          <span style={{ minWidth: 20, textAlign: 'center', fontWeight: 700, fontFamily: grotesk, fontSize: 15 }}>{interval}</span>
          <button onClick={() => setN(interval + 1)} aria-label="More" style={{ width: 34, height: 34, borderRadius: 10, border: 'none', background: '#EBE7DF', cursor: 'pointer', fontSize: 18, color: '#181922', lineHeight: 1 }}>+</button>
          <span style={{ fontSize: 12.5, color: '#6F6C67', fontWeight: 600 }}>{CHIP_TO_UNIT[chip]}{interval > 1 ? 's' : ''}</span>
        </div>
      )}

      {showAdvanced && chip === 'monthly' && anchorWd !== null && (
        <div style={{ marginTop: 12 }}>
          <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
            <button onClick={() => onChange(buildInterval('month', interval))} style={pillStyle(!isPos)}>On day {anchorDom}</button>
            <button onClick={() => onChange(buildPos(defOrd, anchorWd))} style={pillStyle(isPos)}>On a weekday</button>
          </div>
          {isPos && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8, alignItems: 'center' }}>
              {ORDINALS.map(([v, l]) => <button key={v} onClick={() => onChange(buildPos(v, curWd ?? 0))} style={{ ...pillStyle(curOrd === v), fontSize: 12, padding: '7px 11px' }}>{l}</button>)}
              <span style={{ fontSize: 13, fontWeight: 700, color: '#181922' }}>{WEEKDAYS[curWd ?? 0]}</span>
            </div>
          )}
        </div>
      )}

      {hint && chip !== 'none' && <div style={{ fontSize: 11.5, color: '#7D776E', marginTop: 8 }}>{hint}</div>}
    </div>
  );
}
/** Multi-select member chips: tap to toggle any number of people in or out. */
function Chips({ items, value, onToggle, emptyHint }: { items: { id: string; label: string; color: string }[]; value: string[]; onToggle: (id: string) => void; emptyHint?: string }) {
  return (
    <div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {items.map((c) => {
          const sel = value.includes(c.id);
          return (
            <button key={c.id} onClick={() => onToggle(c.id)} role="checkbox" aria-checked={sel} style={{ display: 'flex', alignItems: 'center', gap: 6, border: 'none', cursor: 'pointer', padding: '9px 14px', borderRadius: 100, fontWeight: 700, fontSize: 13, background: sel ? c.color : '#EBE7DF', color: sel ? '#fff' : '#181922' }}>
              {sel && <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M5 12.5l4.5 4.5L19 7" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
              {c.label}
            </button>
          );
        })}
      </div>
      {emptyHint && value.length === 0 && <div style={{ fontSize: 11.5, color: '#7D776E', marginTop: 8 }}>{emptyHint}</div>}
    </div>
  );
}
