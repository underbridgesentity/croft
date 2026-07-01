import { useState } from 'react';
import { useStore } from '../store';
import { api } from '../lib/api';
import type { Nav } from '../Shell';
import Art from '../components/Art';

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
        <Seg label="Goals" active={nav.plan === 'goals'} onClick={() => nav.goPlan('goals')} />
      </div>

      {nav.plan === 'todos' && <Todos />}
      {nav.plan === 'lists' && <Lists />}
      {nav.plan === 'goals' && <Goals />}
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
function Todos() {
  const { state, run } = useStore();
  const [draft, setDraft] = useState('');
  if (!state) return null;
  const open = state.tasks.filter((t) => !t.done);
  const done = state.tasks.filter((t) => t.done);

  const add = () => {
    const v = draft.trim();
    if (!v) return;
    run(api.addTask({ title: v }), 'To-do added');
    setDraft('');
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} placeholder="Add a to-do or reminder…" style={inlineInput} />
        <AddBtn onClick={add} />
      </div>

      {open.length > 0 ? (
        <div style={{ background: '#fff', borderRadius: 20, padding: '4px 14px', boxShadow: '0 1px 2px rgba(24,25,34,0.04), 0 12px 30px -16px rgba(24,25,34,0.16)', marginBottom: 18 }}>
          {open.map((t) => (
            <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '13px 2px', borderBottom: '1px solid #EFEBE3' }}>
              <button onClick={() => run(api.toggleTask(t.id, true), 'Nice - one less thing')} role="checkbox" aria-checked={false} aria-label={`Mark "${t.title}" as done`} style={checkbox} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14.5, lineHeight: 1.25 }}>{t.title}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 5, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 10.5, fontWeight: 700, color: t.type === 'Reminder' ? '#C77800' : '#3B5BFF', background: t.type === 'Reminder' ? '#FFF4E0' : '#EAEEFF', padding: '2px 9px', borderRadius: 100 }}>{t.type}</span>
                  <span style={{ fontSize: 11.5, color: '#6F6C67' }}>From {t.from_name} · <b style={{ color: t.due_key === 'over' ? '#FF4D5E' : '#6F6C67', fontWeight: 700 }}>{t.due}</b></span>
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
          <div style={{ fontSize: 12, fontWeight: 700, color: '#A6AEC0', textTransform: 'uppercase', letterSpacing: '.05em', margin: '0 2px 8px' }}>Done</div>
          <div style={{ background: '#EBE7DF', borderRadius: 20, padding: '4px 14px' }}>
            {done.map((t) => (
              <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '12px 2px' }}>
                <button onClick={() => run(api.toggleTask(t.id, false))} role="checkbox" aria-checked={true} aria-label={`Mark "${t.title}" as not done`} style={{ ...checkbox, border: 'none', background: '#16C098', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M5 12.5l4.5 4.5L19 7" stroke="#fff" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </button>
                <div style={{ flex: 1, fontWeight: 600, fontSize: 14.5, color: '#9C968D', textDecoration: 'line-through' }}>{t.title}</div>
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
  if (!state) return null;
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
              <div style={{ flex: 1, fontWeight: 600, fontSize: 14.5, color: x.got ? '#A6AEC0' : '#181922', textDecoration: x.got ? 'line-through' : 'none' }}>{x.name}</div>
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

// ---------------- GOALS ----------------
function Goals() {
  const { state, run } = useStore();
  if (!state) return null;
  const family = state.goals.filter((g) => g.kind === 'Family');
  const personal = state.goals.filter((g) => g.kind !== 'Family');

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
            <div style={{ fontWeight: 700, fontSize: 16 }}>{g.title}</div>
            <div style={{ fontSize: 12.5, color: '#6F6C67', margin: '2px 0 13px' }}>{g.sub}</div>
            <div style={{ height: 8, borderRadius: 100, background: '#EBE7DF', overflow: 'hidden', marginBottom: 13 }}>
              <div style={{ height: '100%', width: `${g.pct}%`, borderRadius: 100, background: g.color }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button onClick={() => run(api.bumpGoal(g.id), 'Progress logged')} style={{ border: 'none', background: '#EFEBE3', color: '#3B5BFF', fontWeight: 700, fontSize: 12.5, padding: '9px 15px', borderRadius: 100, cursor: 'pointer' }}>+ Log progress</button>
              <button onClick={() => run(api.delGoal(g.id), 'Goal removed')} style={{ border: 'none', background: 'none', color: '#9C968D', fontWeight: 700, fontSize: 12.5, cursor: 'pointer', marginLeft: 'auto' }}>Remove</button>
            </div>
          </div>
        ))}
      </div>

      <div style={{ fontFamily: grotesk, fontWeight: 700, fontSize: 19, margin: '0 2px 12px' }}>Personal goals</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {personal.map((g) => (
          <div key={g.id} style={{ background: '#fff', borderRadius: 20, padding: 15, boxShadow: '0 1px 2px rgba(24,25,34,0.04), 0 12px 30px -16px rgba(24,25,34,0.16)', display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ flexShrink: 0, width: 48, height: 48, borderRadius: 15, background: g.color, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: grotesk, fontWeight: 700, fontSize: 14 }}>{g.pct}%</div>
            <div style={{ flex: 1, minWidth: 0 }}>
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
const inlineInput: React.CSSProperties = { flex: 1, border: '1.5px solid #E8E3DB', background: '#fff', borderRadius: 14, padding: '13px 16px', fontSize: 14.5, color: '#181922', outline: 'none' };
const checkbox: React.CSSProperties = { flexShrink: 0, width: 26, height: 26, borderRadius: '50%', border: '2px solid #DDE3EF', background: '#fff', cursor: 'pointer' };
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
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M5 7h14M10 7V5h4v2M9 7l.7 12h8.6L19 7" stroke="#C4CBDA" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
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
