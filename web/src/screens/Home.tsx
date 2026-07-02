import { useStore } from '../store';
import { api } from '../lib/api';
import type { Nav } from '../Shell';
import Icon from '../components/Icon';

const grotesk = "'Geist', sans-serif";

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

export default function Home({ nav }: { nav: Nav }) {
  const { state, run, flash } = useStore();
  if (!state) return null;
  const you = state.members.find((m) => m.you);
  const today = new Date().toLocaleDateString('en-ZA', { weekday: 'long', day: 'numeric', month: 'long' });

  const openTasks = state.tasks.filter((t) => !t.done);
  const todayEvents = state.events.filter((e) => e.day === 'today');
  const todayTasks = state.tasks.filter((t) => t.due_key === 'today' && !t.done);
  const unpaid = state.bills.filter((b) => b.status !== 'paid');

  const todayList = [
    ...todayEvents.map((e) => ({
      key: e.id, illo: e.illo, color: e.color, title: e.title, meta: e.loc, time: `${e.time} ${e.ampm}`.trim(), tappable: false as const,
      onEdit: () => nav.openForm('event', { editId: e.id, title: e.title, date: e.event_date || '', time: e.event_time || '', who: e.assignee_ids || [] }),
    })),
    ...todayTasks.map((t) => ({
      key: t.id, illo: t.type === 'Reminder' ? 'bell' : 'todo', color: t.from_color, title: t.title, meta: `From ${t.from_name} · ${t.type}`, tappable: true as const, id: t.id,
      onEdit: () => nav.openForm('task', { editId: t.id, title: t.title, type: t.type, assignees: t.assignee_ids || [] }),
    })),
  ];

  const goal = state.goals.find((g) => g.kind === 'Family') || state.goals[0];

  return (
    <div className="stagger">
      <div style={{ margin: '8px 2px 20px' }}>
        <div style={{ fontFamily: grotesk, fontWeight: 700, fontSize: 31, lineHeight: 1.08, letterSpacing: '-0.025em' }}>
          {greeting()},<br />{you?.name?.split(' ')[0]}.
        </div>
        <div style={{ marginTop: 8, color: '#6F6C67', fontSize: 14, fontWeight: 500 }}>{today} · here's your day</div>
      </div>

      {/* quick stats */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 24 }}>
        <Stat onClick={() => nav.goTab('calendar')} value={todayList.length} color="#FFB020" label="events today" />
        <Stat onClick={() => nav.goTab('tasks')} value={openTasks.length} color="#3B5BFF" label="to-dos left" />
        <Stat onClick={() => nav.goTab('money')} value={unpaid.length} color="#FF4D5E" label="bills due" />
      </div>

      {/* Today */}
      <Row title="Today" action="Calendar" onAction={() => nav.goTab('calendar')} />
      <div style={{ background: '#fff', borderRadius: 22, padding: '6px 14px', boxShadow: '0 1px 2px rgba(24,25,34,0.04), 0 12px 30px -16px rgba(24,25,34,0.16)', marginBottom: 26 }}>
        {todayList.length === 0 && <div style={{ padding: '18px 2px', color: '#6F6C67', fontSize: 13.5 }}>Nothing scheduled today - enjoy the calm.</div>}
        {todayList.map((it) => (
          <div key={it.key} style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '12px 2px', borderBottom: '1px solid #EFEBE3' }}>
            <Icon name={it.illo} color={it.color} size={42} radius={13} glyph={22} />
            <div
              role="button"
              tabIndex={0}
              aria-label={`Edit ${it.title}`}
              onClick={it.onEdit}
              onKeyDown={(ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); it.onEdit(); } }}
              style={{ flex: 1, minWidth: 0, cursor: 'pointer' }}
            >
              <div style={{ fontWeight: 700, fontSize: 14.5, lineHeight: 1.25 }}>{it.title}</div>
              <div style={{ fontSize: 12, color: '#6F6C67', marginTop: 2 }}>{it.meta}</div>
            </div>
            {it.tappable ? (
              <button onClick={() => run(api.toggleTask((it as any).id, true), 'Nice - one less thing')} style={circleBtn} />
            ) : (
              <div style={{ flexShrink: 0, fontFamily: grotesk, fontWeight: 600, fontSize: 13, textAlign: 'right' }}>{it.time}</div>
            )}
          </div>
        ))}
        <div style={{ height: 6 }} />
      </div>

      {/* Family activity */}
      <Row title="Family activity" action="See all" onAction={() => nav.openFeed()} />
      <div style={{ background: '#fff', borderRadius: 22, padding: '6px 16px', boxShadow: '0 1px 2px rgba(24,25,34,0.04), 0 12px 30px -16px rgba(24,25,34,0.16)', marginBottom: 26 }}>
        {state.feed.slice(0, 6).map((f) => (
          <div key={f.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 0', borderBottom: '1px solid #EFEBE3' }}>
            <div style={{ flexShrink: 0, width: 32, height: 32, borderRadius: '50%', background: f.color, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: grotesk, fontWeight: 700, fontSize: 13 }}>{f.initial}</div>
            <div style={{ flex: 1, fontSize: 13.5, color: '#3A362F', lineHeight: 1.4 }}><b style={{ fontWeight: 700, color: '#181922' }}>{f.who}</b> {f.txt}</div>
            <div style={{ flexShrink: 0, fontSize: 11, color: '#7D776E', fontWeight: 600, paddingTop: 2 }}>{f.time_label}</div>
          </div>
        ))}
        <div style={{ height: 6 }} />
      </div>

      {/* Goal highlight */}
      {goal && (
        <>
          <Row title="A goal you're chasing" action="View all" onAction={() => { nav.goTab('tasks'); nav.goPlan('goals'); }} />
          <div style={{ background: '#13182B', borderRadius: 24, padding: 20, boxShadow: '0 10px 26px rgba(19,24,43,0.22)', color: '#fff', position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: -30, right: -30, width: 120, height: 120, borderRadius: '50%', background: 'rgba(198,242,78,0.16)' }} />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative' }}>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: '#C6F24E', textTransform: 'uppercase', letterSpacing: '.08em' }}>{goal.kind} · {goal.tag}</div>
              <div style={{ fontFamily: grotesk, fontSize: 13, fontWeight: 700, color: '#C6F24E' }}>{goal.pct}%</div>
            </div>
            <div style={{ fontFamily: grotesk, fontWeight: 700, fontSize: 21, margin: '10px 0 3px', position: 'relative' }}>{goal.title}</div>
            <div style={{ fontSize: 13, color: '#ADA79C', marginBottom: 16, position: 'relative' }}>{goal.sub}</div>
            <div style={{ height: 9, borderRadius: 100, background: 'rgba(255,255,255,0.14)', overflow: 'hidden', position: 'relative' }}>
              <div style={{ height: '100%', width: `${goal.pct}%`, borderRadius: 100, background: '#C6F24E' }} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

const circleBtn: React.CSSProperties = { flexShrink: 0, width: 26, height: 26, borderRadius: '50%', border: '2px solid #DED9D0', background: '#fff', cursor: 'pointer' };

function Stat({ onClick, value, color, label }: { onClick: () => void; value: number; color: string; label: string }) {
  return (
    <button onClick={onClick} style={{ textAlign: 'left', border: 'none', cursor: 'pointer', background: '#fff', borderRadius: 18, padding: '15px 13px', boxShadow: '0 2px 8px rgba(16,20,38,0.04)' }}>
      <div style={{ fontFamily: grotesk, fontWeight: 700, fontSize: 25, color }}>{value}</div>
      <div style={{ fontSize: 11.5, color: '#6F6C67', fontWeight: 600, marginTop: 3 }}>{label}</div>
    </button>
  );
}

export function Row({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '0 2px 12px' }}>
      <div style={{ fontFamily: grotesk, fontWeight: 700, fontSize: 19 }}>{title}</div>
      {action && <button onClick={onAction} style={{ border: 'none', background: 'none', color: '#3B5BFF', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>{action}</button>}
    </div>
  );
}
