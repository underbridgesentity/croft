import { useState } from 'react';
import { useStore } from '../store';
import { api } from '../lib/api';
import type { Nav } from '../Shell';
import Art from '../components/Art';
import PeopleFilter from '../components/PeopleFilter';

const grotesk = "'Geist', sans-serif";

export default function Plans({ nav }: { nav: Nav }) {
  const { state } = useStore();
  if (!state) return null;
  return (
    <div>
      <div style={{ margin: '8px 2px 16px' }}>
        <div style={{ fontFamily: grotesk, fontWeight: 700, fontSize: 30, letterSpacing: '-0.02em' }}>Plans</div>
        <div style={{ marginTop: 4, color: '#6F6C67', fontSize: 14, fontWeight: 500 }}>To-dos, lists & goals - together</div>
      </div>

      <div style={{ display: 'flex', gap: 4, background: '#E8E3DB', borderRadius: 14, padding: 4, marginBottom: 22 }}>
        <Seg label="To-dos" active={nav.plan === 'todos'} onClick={() => nav.goPlan('todos')} />
        <Seg label="Lists" active={nav.plan === 'lists'} onClick={() => nav.goPlan('lists')} />
        <Seg label="Meals" active={nav.plan === 'meals'} onClick={() => nav.goPlan('meals')} />
        <Seg label="Goals" active={nav.plan === 'goals'} onClick={() => nav.goPlan('goals')} />
      </div>

      {nav.plan === 'todos' && <Todos nav={nav} />}
      {nav.plan === 'lists' && <Lists />}
      {nav.plan === 'meals' && <Meals />}
      {nav.plan === 'goals' && <Goals nav={nav} />}
    </div>
  );
}

function Seg({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{ flex: 1, border: 'none', cursor: 'pointer', padding: '10px 0', borderRadius: 10, fontWeight: 700, fontSize: 13.5, color: active ? '#181922' : '#6F6C67', background: active ? '#fff' : 'transparent', boxShadow: active ? '0 1px 4px rgba(16,20,38,0.1)' : 'none' }}>
      {label}
    </button>
  );
}

// ---------------- TO-DOS ----------------
function Todos({ nav }: { nav: Nav }) {
  const { state, run } = useStore();
  const [draft, setDraft] = useState('');
  // Filter to one person's to-dos; each task also carries a colour bar for its
  // assignee so "who's it for" reads at a glance.
  const [who, setWho] = useState<string | null>(null);
  if (!state) return null;
  const inWho = (ids?: string[] | null) => !who || (ids || []).includes(who);
  const open = state.tasks.filter((t) => !t.done && inWho(t.assignee_ids));
  const done = state.tasks.filter((t) => t.done && inWho(t.assignee_ids));
  const namesFor = (ids?: string[] | null) =>
    (ids || []).map((id) => state.members.find((m) => m.id === id)?.name).filter(Boolean).join(', ');
  const colorFor = (ids?: string[] | null) => state.members.find((m) => m.id === (ids || [])[0])?.color || '#D2CCC1';

  const add = () => {
    const v = draft.trim();
    if (!v) return;
    run(api.addTask({ title: v }), 'To-do added');
    setDraft('');
  };

  const edit = (t: (typeof open)[number]) =>
    nav.openForm('task', { editId: t.id, title: t.title, type: t.type, assignees: t.assignee_ids || [], recur: t.recur });

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} placeholder="Add a to-do or reminder…" style={inlineInput} />
        <AddBtn onClick={add} />
      </div>

      <PeopleFilter members={state.members} value={who} onChange={setWho} />

      {open.length > 0 ? (
        <div style={{ background: '#fff', borderRadius: 20, padding: '4px 14px', boxShadow: '0 1px 2px rgba(24,25,34,0.04), 0 12px 30px -16px rgba(24,25,34,0.16)', marginBottom: 18 }}>
          {open.map((t) => (
            <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '13px 2px', borderBottom: '1px solid #EFEBE3' }}>
              <span aria-hidden="true" style={{ width: 4, height: 30, borderRadius: 100, background: colorFor(t.assignee_ids), flexShrink: 0 }} />
              <button onClick={() => run(api.toggleTask(t.id, true), 'Nice - one less thing')} role="checkbox" aria-checked={false} aria-label={`Mark "${t.title}" as done`} style={checkbox} />
              <div
                role="button"
                tabIndex={0}
                aria-label={`Edit "${t.title}"`}
                onClick={() => edit(t)}
                onKeyDown={(ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); edit(t); } }}
                style={{ flex: 1, minWidth: 0, cursor: 'pointer' }}
              >
                <div style={{ fontWeight: 700, fontSize: 14.5, lineHeight: 1.25 }}>{t.title}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 5, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 10.5, fontWeight: 700, color: t.type === 'Reminder' ? '#C77800' : '#3B5BFF', background: t.type === 'Reminder' ? '#FFF4E0' : '#EAEEFF', padding: '2px 9px', borderRadius: 100 }}>{t.type}</span>
                  <span style={{ fontSize: 11.5, color: '#6F6C67' }}>
                    {namesFor(t.assignee_ids) ? <>For <b style={{ fontWeight: 700 }}>{namesFor(t.assignee_ids)}</b> · </> : <>From {t.from_name} · </>}
                    <b style={{ color: t.due_key === 'over' ? '#FF4D5E' : '#6F6C67', fontWeight: 700 }}>{t.due}</b>
                  </span>
                </div>
              </div>
              <button onClick={() => run(api.nudge(t.from_name), `Reminder sent to ${t.from_name}`)} title="Nudge" aria-label={`Nudge ${t.from_name}`} style={iconBtn}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M18 9.5a6 6 0 1 0-12 0c0 6-2.5 7.5-2.5 7.5h17S18 15.5 18 9.5" stroke="#3B5BFF" strokeWidth="1.8" strokeLinejoin="round" /><path d="M10.2 20.5a2 2 0 0 0 3.6 0" stroke="#3B5BFF" strokeWidth="1.8" strokeLinecap="round" /></svg>
              </button>
              <DeleteBtn onClick={() => run(api.delTask(t.id), 'Removed')} />
            </div>
          ))}
          <div style={{ height: 6 }} />
        </div>
      ) : (
        <Empty art="done" title="You're all caught up" sub="No open to-dos. Add one above when something comes up." />
      )}

      {done.length > 0 && (
        <>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#7D776E', textTransform: 'uppercase', letterSpacing: '.05em', margin: '0 2px 8px' }}>Done</div>
          <div style={{ background: '#EBE7DF', borderRadius: 20, padding: '4px 14px' }}>
            {done.map((t) => (
              <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '12px 2px' }}>
                <button onClick={() => run(api.toggleTask(t.id, false))} role="checkbox" aria-checked={true} aria-label={`Mark "${t.title}" as not done`} style={{ ...checkbox, border: 'none', background: '#16C098', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M5 12.5l4.5 4.5L19 7" stroke="#fff" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </button>
                <div style={{ flex: 1, fontWeight: 600, fontSize: 14.5, color: '#7D776E', textDecoration: 'line-through' }}>{t.title}</div>
                <DeleteBtn onClick={() => run(api.delTask(t.id), 'Removed')} />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ---------------- LISTS ----------------
function Lists() {
  const { state, run } = useStore();
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  if (!state) return null;
  const saveRename = () => {
    if (!editing) return;
    const v = editing.name.trim();
    const orig = state.shopping.find((x) => x.id === editing.id)?.name;
    setEditing(null);
    if (v && v !== orig) run(api.renameShop(editing.id, v), 'Item renamed');
  };
  const tint: Record<string, string> = { you: '#EAEEFF', naledi: '#FFE9F1', amara: '#FFF4E0', lwazi: '#E3F8F1' };
  const left = state.shopping.filter((x) => !x.got).length;
  const colorFor = (key: string) => state.members.find((m) => m.id === key || m.name.toLowerCase() === key)?.color;
  const initialFor = (key: string) => state.members.find((m) => m.id === key || m.name.toLowerCase() === key)?.initial;

  const add = () => {
    const v = draft.trim();
    if (!v) return;
    run(api.addShop(v), 'Added to shopping list');
    setDraft('');
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '0 2px 12px' }}>
        <div style={{ fontFamily: grotesk, fontWeight: 700, fontSize: 19 }}>Shopping list</div>
        <span style={{ fontSize: 12, fontWeight: 700, color: '#3B5BFF', background: 'rgba(59,91,255,0.1)', padding: '4px 11px', borderRadius: 100 }}>{left} to buy</span>
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} placeholder="Add an item…" style={inlineInput} />
        <AddBtn onClick={add} />
      </div>
      {left === 0 && state.shopping.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'rgba(22,192,152,0.1)', borderRadius: 16, padding: '12px 14px', marginBottom: 12 }}>
          <div style={{ width: 30, height: 30, borderRadius: 9, background: '#16C098', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M5 12.5l4.5 4.5L19 7" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </div>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: '#0E7A5F' }}>Nice - everything's bought!</div>
        </div>
      )}
      {state.shopping.length === 0 ? (
        <Empty art="emptyList" title="Your list is empty" sub="Add what you need above - the family sees it instantly." />
      ) : (
        <div style={{ background: '#fff', borderRadius: 20, padding: '4px 14px', boxShadow: '0 1px 2px rgba(24,25,34,0.04), 0 12px 30px -16px rgba(24,25,34,0.16)' }}>
          {state.shopping.map((x) => (
            <div key={x.id} style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '12px 2px', borderBottom: '1px solid #EFEBE3' }}>
              <button onClick={() => run(api.toggleShop(x.id))} style={{ ...checkbox, width: 25, height: 25, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {x.got && <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M5 12.5l4.5 4.5L19 7" stroke="#16C098" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg>}
              </button>
              {editing?.id === x.id ? (
                <input
                  autoFocus
                  value={editing.name}
                  onChange={(e) => setEditing({ id: x.id, name: e.target.value })}
                  onBlur={saveRename}
                  onKeyDown={(e) => { if (e.key === 'Enter') saveRename(); if (e.key === 'Escape') setEditing(null); }}
                  style={{ flex: 1, minWidth: 0, border: '1.5px solid #3B5BFF', background: '#fff', borderRadius: 10, padding: '7px 10px', fontSize: 16, fontWeight: 600, color: '#181922', outline: 'none' }}
                />
              ) : (
                <div
                  role="button"
                  tabIndex={0}
                  aria-label={`Rename "${x.name}"`}
                  onClick={() => setEditing({ id: x.id, name: x.name })}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setEditing({ id: x.id, name: x.name }); } }}
                  style={{ flex: 1, minWidth: 0, fontWeight: 600, fontSize: 14.5, color: x.got ? '#7D776E' : '#181922', textDecoration: x.got ? 'line-through' : 'none', cursor: 'pointer' }}
                >
                  {x.name}
                </div>
              )}
              <div style={{ flexShrink: 0, width: 22, height: 22, borderRadius: '50%', background: tint[x.by] || '#EAEEFF', color: colorFor(x.by) || '#3B5BFF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800, fontFamily: grotesk }}>{initialFor(x.by) || '?'}</div>
              <DeleteBtn onClick={() => run(api.delShop(x.id), 'Removed')} />
            </div>
          ))}
          <div style={{ height: 6 }} />
        </div>
      )}
    </div>
  );
}

// ---------------- MEALS ----------------
function Meals() {
  const { state, run } = useStore();
  const [weekOffset, setWeekOffset] = useState(0);
  const [draft, setDraft] = useState<Record<string, string>>({});
  if (!state) return null;
  const now = new Date();
  const base = new Date(now.getFullYear(), now.getMonth(), now.getDate() + weekOffset * 7);
  const dow = (base.getDay() + 6) % 7; // Monday-start
  const monday = new Date(base.getFullYear(), base.getMonth(), base.getDate() - dow);
  const todayIso = now.toLocaleDateString('en-CA');
  const days = [...Array(7)].map((_, i) => {
    const d = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i);
    const iso = d.toLocaleDateString('en-CA');
    return { iso, name: d.toLocaleDateString('en-ZA', { weekday: 'long' }), dm: d.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' }), today: iso === todayIso };
  });
  const meals = state.meals || [];
  const add = (iso: string) => { const v = (draft[iso] || '').trim(); if (!v) return; run(api.addMeal({ date: iso, title: v }), 'Meal planned'); setDraft({ ...draft, [iso]: '' }); };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 14 }}>
        <button onClick={() => setWeekOffset(weekOffset - 1)} aria-label="Previous week" style={weekBtn}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M15 5l-7 7 7 7" stroke="#181922" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontFamily: grotesk, fontWeight: 700, fontSize: 15 }}>{monday.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' })} – {days[6].dm}</div>
          {weekOffset !== 0 && <button onClick={() => setWeekOffset(0)} style={{ border: 'none', background: 'none', color: '#3B5BFF', fontWeight: 700, fontSize: 11.5, cursor: 'pointer', padding: '1px 0 0' }}>This week</button>}
        </div>
        <button onClick={() => setWeekOffset(weekOffset + 1)} aria-label="Next week" style={weekBtn}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M9 5l7 7-7 7" stroke="#181922" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {days.map((day) => {
          const dayMeals = meals.filter((m) => m.date === day.iso);
          return (
            <div key={day.iso} style={{ background: '#fff', borderRadius: 18, padding: '13px 15px', boxShadow: '0 1px 2px rgba(24,25,34,0.04), 0 12px 30px -16px rgba(24,25,34,0.16)', border: day.today ? '1.5px solid #3B5BFF' : '1.5px solid transparent' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 9 }}>
                <span style={{ fontWeight: 700, fontSize: 14.5, color: day.today ? '#3B5BFF' : '#181922' }}>{day.name}</span>
                <span style={{ fontSize: 11.5, color: '#9C968D', fontWeight: 600 }}>{day.dm}</span>
              </div>
              {dayMeals.map((m) => (
                <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0', borderTop: '1px solid #F2EEE7' }}>
                  <span style={{ flexShrink: 0, fontSize: 15 }}>🍽️</span>
                  <span style={{ flex: 1, minWidth: 0, fontWeight: 600, fontSize: 14 }}>{m.title}</span>
                  <button onClick={() => run(api.addShop(m.title), `${m.title} added to shopping`)} style={{ flexShrink: 0, border: 'none', background: '#EFEBE3', color: '#3B5BFF', fontWeight: 700, fontSize: 11.5, padding: '6px 11px', borderRadius: 100, cursor: 'pointer' }}>+ List</button>
                  <DeleteBtn onClick={() => run(api.delMeal(m.id), 'Removed')} />
                </div>
              ))}
              <div style={{ display: 'flex', gap: 7, marginTop: dayMeals.length ? 9 : 0 }}>
                <input value={draft[day.iso] || ''} onChange={(e) => setDraft({ ...draft, [day.iso]: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && add(day.iso)} placeholder="What's for dinner?" style={{ flex: 1, minWidth: 0, border: '1.5px solid #E8E3DB', background: '#fff', borderRadius: 11, padding: '9px 12px', fontSize: 16, outline: 'none', color: '#181922' }} />
                <button onClick={() => add(day.iso)} aria-label="Add meal" style={{ flexShrink: 0, width: 40, border: 'none', background: '#3B5BFF', borderRadius: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 5.5v13M5.5 12h13" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" /></svg>
                </button>
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ fontSize: 11.5, color: '#7D776E', margin: '14px 2px 0', textAlign: 'center' }}>Tap “+ List” to send a meal to your shopping list.</div>
    </div>
  );
}

const weekBtn: React.CSSProperties = {
  width: 38, height: 38, borderRadius: 12, border: 'none', background: '#fff', cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 1px 2px rgba(24,25,34,0.05), 0 8px 20px -12px rgba(24,25,34,0.12)', flexShrink: 0,
};

// ---------------- GOALS ----------------
function Goals({ nav }: { nav: Nav }) {
  const { state, run } = useStore();
  if (!state) return null;
  const family = state.goals.filter((g) => g.kind === 'Family');
  const personal = state.goals.filter((g) => g.kind !== 'Family');
  const edit = (g: (typeof family)[number]) =>
    nav.openForm('goal', { editId: g.id, title: g.title, kind: g.kind === 'Family' ? 'family' : 'personal', target: g.target ? String(g.target) : '', amount: '' });

  return (
    <div>
      <div style={{ fontFamily: grotesk, fontWeight: 700, fontSize: 19, margin: '0 2px 12px' }}>Family goals</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 24 }}>
        {family.map((g) => (
          <div key={g.id} style={{ background: '#fff', borderRadius: 20, padding: 16, boxShadow: '0 1px 2px rgba(24,25,34,0.04), 0 12px 30px -16px rgba(24,25,34,0.16)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.05em', textTransform: 'uppercase', color: g.color }}>{g.tag}</span>
              <span style={{ fontFamily: grotesk, fontWeight: 700, fontSize: 15, color: g.color }}>{g.pct}%</span>
            </div>
            <div
              role="button"
              tabIndex={0}
              aria-label={`Edit goal "${g.title}"`}
              onClick={() => edit(g)}
              onKeyDown={(ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); edit(g); } }}
              style={{ cursor: 'pointer' }}
            >
              <div style={{ fontWeight: 700, fontSize: 16 }}>{g.title}</div>
              <div style={{ fontSize: 12.5, color: '#6F6C67', margin: '2px 0 13px' }}>{g.sub}</div>
            </div>
            <div style={{ height: 8, borderRadius: 100, background: '#EBE7DF', overflow: 'hidden', marginBottom: 13 }}>
              <div style={{ height: '100%', width: `${g.pct}%`, borderRadius: 100, background: g.color }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button onClick={() => run(api.bumpGoal(g.id), 'Progress logged')} style={{ border: 'none', background: '#EFEBE3', color: '#3B5BFF', fontWeight: 700, fontSize: 12.5, padding: '9px 15px', borderRadius: 100, cursor: 'pointer' }}>+ Log progress</button>
              <button onClick={() => run(api.delGoal(g.id), 'Goal removed')} style={{ border: 'none', background: 'none', color: '#7D776E', fontWeight: 700, fontSize: 12.5, cursor: 'pointer', marginLeft: 'auto' }}>Remove</button>
            </div>
          </div>
        ))}
      </div>

      <div style={{ fontFamily: grotesk, fontWeight: 700, fontSize: 19, margin: '0 2px 12px' }}>Personal goals</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {personal.map((g) => (
          <div key={g.id} style={{ background: '#fff', borderRadius: 20, padding: 15, boxShadow: '0 1px 2px rgba(24,25,34,0.04), 0 12px 30px -16px rgba(24,25,34,0.16)', display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ flexShrink: 0, width: 48, height: 48, borderRadius: 15, background: g.color, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: grotesk, fontWeight: 700, fontSize: 14 }}>{g.pct}%</div>
            <div
              role="button"
              tabIndex={0}
              aria-label={`Edit goal "${g.title}"`}
              onClick={() => edit(g)}
              onKeyDown={(ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); edit(g); } }}
              style={{ flex: 1, minWidth: 0, cursor: 'pointer' }}
            >
              <div style={{ fontSize: 11, fontWeight: 700, color: g.color }}>{g.kind}</div>
              <div style={{ fontWeight: 700, fontSize: 15 }}>{g.title}</div>
              <div style={{ fontSize: 12, color: '#6F6C67' }}>{g.sub}</div>
            </div>
            <button onClick={() => run(api.bumpGoal(g.id), 'Progress logged')} style={{ flexShrink: 0, width: 36, height: 36, borderRadius: 11, border: 'none', background: '#EFEBE3', cursor: 'pointer', fontSize: 20, color: '#3B5BFF', lineHeight: 1 }}>+</button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------- shared ----------------
const inlineInput: React.CSSProperties = { flex: 1, border: '1.5px solid #E8E3DB', background: '#fff', borderRadius: 14, padding: '13px 16px', fontSize: 16, color: '#181922', outline: 'none' };
const checkbox: React.CSSProperties = { flexShrink: 0, width: 26, height: 26, borderRadius: '50%', border: '2px solid #DED9D0', background: '#fff', cursor: 'pointer' };
const iconBtn: React.CSSProperties = { flexShrink: 0, width: 36, height: 36, borderRadius: 11, border: 'none', background: '#EFEBE3', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' };

function AddBtn({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} aria-label="Add" style={{ width: 48, flexShrink: 0, border: 'none', background: '#3B5BFF', borderRadius: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 3px 10px rgba(59,91,255,0.3)' }}>
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M12 5.5v13M5.5 12h13" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" /></svg>
    </button>
  );
}
function DeleteBtn({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} title="Delete" aria-label="Delete" style={{ flexShrink: 0, width: 30, height: 30, borderRadius: 9, border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M5 7h14M10 7V5h4v2M9 7l.7 12h8.6L19 7" stroke="#C9C3B9" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
    </button>
  );
}
function Empty({ art, title, sub }: { art: string; title: string; sub: string }) {
  return (
    <div style={{ background: '#fff', borderRadius: 20, padding: '28px 20px', boxShadow: '0 1px 2px rgba(24,25,34,0.04), 0 12px 30px -16px rgba(24,25,34,0.16)', marginBottom: 18, textAlign: 'center' }}>
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 4 }}><Art name={art} width={148} /></div>
      <div style={{ fontFamily: grotesk, fontWeight: 700, fontSize: 18 }}>{title}</div>
      <div style={{ fontSize: 13, color: '#6F6C67', marginTop: 4 }}>{sub}</div>
    </div>
  );
}
