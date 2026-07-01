import { useStore } from '../store';
import type { Nav } from '../Shell';
import Icon from '../components/Icon';

const grotesk = "'Geist', sans-serif";
const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export default function Calendar({ nav }: { nav: Nav }) {
  const { state } = useStore();
  if (!state) return null;

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const todayDate = now.getDate();
  const monthLabel = now.toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' });
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDow = new Date(year, month, 1).getDay();

  // dots: map each important date to its day-of-month + member colour
  const dotMap: Record<number, string> = {};
  for (const e of state.events) {
    let d: number | null = null;
    if (e.day === 'today') d = todayDate;
    else {
      const m = e.date_label.match(/\d+/);
      if (m) d = parseInt(m[0], 10);
    }
    if (d && d >= 1 && d <= daysInMonth) dotMap[d] = e.color;
  }

  const cells: { key: string; label: number; today: boolean; dot: string; faded: boolean }[] = [];
  for (let i = 0; i < firstDow; i++) cells.push({ key: 'p' + i, label: 0, today: false, dot: 'transparent', faded: true });
  for (let d = 1; d <= daysInMonth; d++) cells.push({ key: 'd' + d, label: d, today: d === todayDate, dot: dotMap[d] || 'transparent', faded: false });
  while (cells.length % 7 !== 0) cells.push({ key: 'n' + cells.length, label: 0, today: false, dot: 'transparent', faded: true });

  return (
    <div>
      <div style={{ margin: '8px 2px 18px' }}>
        <div style={{ fontFamily: grotesk, fontWeight: 700, fontSize: 30, letterSpacing: '-0.02em' }}>Calendar</div>
        <div style={{ marginTop: 4, color: '#6F6C67', fontSize: 14, fontWeight: 500 }}>{monthLabel} · {state.events.length} important dates</div>
      </div>

      <div style={{ background: '#fff', borderRadius: 22, padding: '16px 12px 18px', boxShadow: '0 1px 2px rgba(24,25,34,0.04), 0 12px 30px -16px rgba(24,25,34,0.16)', marginBottom: 24 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', marginBottom: 8 }}>
          {DOW.map((d, i) => (
            <div key={i} style={{ textAlign: 'center', fontSize: 11, fontWeight: 700, color: '#7D776E' }}>{d}</div>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', rowGap: 2 }}>
          {cells.map((c) => (
            <div key={c.key} style={{ height: 42, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3 }}>
              <div style={{ width: 31, height: 31, borderRadius: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: grotesk, fontSize: 13.5, fontWeight: 600, background: c.today ? '#3B5BFF' : 'transparent', color: c.today ? '#fff' : c.faded ? '#C9C3B9' : '#181922' }}>
                {c.label || ''}
              </div>
              <div style={{ width: 5, height: 5, borderRadius: '50%', background: c.dot }} />
            </div>
          ))}
        </div>
      </div>

      <div style={{ fontFamily: grotesk, fontWeight: 700, fontSize: 19, margin: '0 2px 12px' }}>Important dates</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {state.events.map((e) => (
          <div
            key={e.id}
            role="button"
            tabIndex={0}
            aria-label={`Edit ${e.title}`}
            onClick={() => nav.openForm('event', { editId: e.id, title: e.title, date: e.event_date || '', time: e.event_time || '', who: e.assignee_ids || [] })}
            onKeyDown={(ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); nav.openForm('event', { editId: e.id, title: e.title, date: e.event_date || '', time: e.event_time || '', who: e.assignee_ids || [] }); } }}
            className="tap"
            style={{ display: 'flex', gap: 13, padding: 14, background: '#fff', borderRadius: 18, boxShadow: '0 2px 8px rgba(16,20,38,0.04)', alignItems: 'center', cursor: 'pointer' }}
          >
            <Icon name={e.illo} color={e.color} size={44} radius={14} glyph={23} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 14.5, lineHeight: 1.25 }}>{e.title}</div>
              <div style={{ fontSize: 12, color: '#6F6C67', marginTop: 2 }}>{e.date_label} · {e.loc}</div>
            </div>
            <div style={{ flexShrink: 0, textAlign: 'right' }}>
              <div style={{ fontFamily: grotesk, fontWeight: 600, fontSize: 13 }}>{e.time}</div>
              <div style={{ fontSize: 10, color: '#7D776E', fontWeight: 600 }}>{e.ampm}</div>
            </div>
            <svg width="8" height="14" viewBox="0 0 8 14" style={{ flexShrink: 0 }} aria-hidden="true"><path d="M1 1l6 6-6 6" stroke="#C9C3B9" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </div>
        ))}
      </div>

      <button onClick={() => nav.openForm('event')} style={dashedAdd}>+ Add an important date</button>
    </div>
  );
}

const dashedAdd: React.CSSProperties = {
  width: '100%', border: '1.5px dashed #D2CCC1', background: 'transparent', color: '#6B6459',
  fontWeight: 700, fontSize: 14, padding: 15, borderRadius: 16, cursor: 'pointer', marginTop: 14,
};
