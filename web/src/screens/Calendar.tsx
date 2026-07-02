import { useState } from 'react';
import { useStore } from '../store';
import type { Nav } from '../Shell';
import type { EventItem } from '../lib/types';
import Icon from '../components/Icon';

const grotesk = "'Geist', sans-serif";
const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export default function Calendar({ nav }: { nav: Nav }) {
  const { state } = useStore();
  // Month navigator: browse the grid and each month's events, like the Money tab.
  const [monthOffset, setMonthOffset] = useState(0);
  if (!state) return null;

  const now = new Date();
  const todayIso = now.toLocaleDateString('en-CA'); // YYYY-MM-DD, local
  const sel = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
  const year = sel.getFullYear();
  const month = sel.getMonth();
  const isCurrentMonth = monthOffset === 0;
  const todayDate = now.getDate();
  const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`; // YYYY-MM
  const monthLabel = sel.toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' });
  const monthShort = sel.toLocaleDateString('en-ZA', { month: 'long' });
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDow = new Date(year, month, 1).getDay();
  const you = state.members.find((m) => m.you);

  // dots: mark days in the DISPLAYED month that have an event (real dates only)
  const dotMap: Record<number, string> = {};
  for (const e of state.events) {
    if (e.event_date?.startsWith(monthKey + '-')) {
      dotMap[Number(e.event_date.slice(8, 10))] = e.color;
    } else if (isCurrentMonth && !e.event_date && e.day === 'today') {
      dotMap[todayDate] = e.color;
    }
  }

  const cells: { key: string; label: number; today: boolean; dot: string; faded: boolean }[] = [];
  for (let i = 0; i < firstDow; i++) cells.push({ key: 'p' + i, label: 0, today: false, dot: 'transparent', faded: true });
  for (let d = 1; d <= daysInMonth; d++) cells.push({ key: 'd' + d, label: d, today: isCurrentMonth && d === todayDate, dot: dotMap[d] || 'transparent', faded: false });
  while (cells.length % 7 !== 0) cells.push({ key: 'n' + cells.length, label: 0, today: false, dot: 'transparent', faded: true });

  const openEdit = (e: EventItem) =>
    nav.openForm('event', { editId: e.id, title: e.title, date: e.event_date || '', time: e.event_time || '', who: e.assignee_ids || [] });
  // Tap a day to add an event on it (nice for planning ahead in any month).
  const addOnDay = (d: number) =>
    nav.openForm('event', { title: '', date: `${monthKey}-${String(d).padStart(2, '0')}`, time: '', who: you ? [you.id] : [] });

  // Current month keeps the agenda view (everything upcoming + a past section).
  // Any other month shows just that month's events, newest first.
  const upcoming = state.events.filter((e) => !e.event_date || e.event_date >= todayIso);
  const past = state.events.filter((e) => e.event_date && e.event_date < todayIso).reverse();
  const monthEvents = state.events.filter((e) => e.event_date?.startsWith(monthKey + '-'));

  return (
    <div>
      <div style={{ margin: '8px 2px 14px' }}>
        <div style={{ fontFamily: grotesk, fontWeight: 700, fontSize: 30, letterSpacing: '-0.02em' }}>Calendar</div>
        <div style={{ marginTop: 4, color: '#6F6C67', fontSize: 14, fontWeight: 500 }}>Plan and review any month</div>
      </div>

      {/* Month navigator */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 14 }}>
        <button onClick={() => setMonthOffset(monthOffset - 1)} aria-label="Previous month" style={monthBtn}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M15 5l-7 7 7 7" stroke="#181922" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontFamily: grotesk, fontWeight: 700, fontSize: 16 }}>{monthLabel}</div>
          {!isCurrentMonth && (
            <button onClick={() => setMonthOffset(0)} style={{ border: 'none', background: 'none', color: '#3B5BFF', fontWeight: 700, fontSize: 11.5, cursor: 'pointer', padding: '1px 0 0' }}>Back to this month</button>
          )}
        </div>
        <button onClick={() => setMonthOffset(monthOffset + 1)} aria-label="Next month" style={monthBtn}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M9 5l7 7-7 7" stroke="#181922" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
      </div>

      <div style={{ background: '#fff', borderRadius: 22, padding: '16px 12px 18px', boxShadow: '0 1px 2px rgba(24,25,34,0.04), 0 12px 30px -16px rgba(24,25,34,0.16)', marginBottom: 24 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', marginBottom: 8 }}>
          {DOW.map((d, i) => (
            <div key={i} style={{ textAlign: 'center', fontSize: 11, fontWeight: 700, color: '#7D776E' }}>{d}</div>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', rowGap: 2 }}>
          {cells.map((c) => (
            c.faded ? (
              <div key={c.key} style={{ height: 42 }} />
            ) : (
              <button
                key={c.key}
                onClick={() => addOnDay(c.label)}
                aria-label={`Add an event on ${c.label} ${monthShort}`}
                style={{ height: 42, border: 'none', background: 'none', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3, padding: 0 }}
              >
                <div style={{ width: 31, height: 31, borderRadius: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: grotesk, fontSize: 13.5, fontWeight: 600, background: c.today ? '#3B5BFF' : 'transparent', color: c.today ? '#fff' : '#181922' }}>
                  {c.label}
                </div>
                <div style={{ width: 5, height: 5, borderRadius: '50%', background: c.dot }} />
              </button>
            )
          ))}
        </div>
      </div>

      {isCurrentMonth ? (
        <>
          <div style={{ fontFamily: grotesk, fontWeight: 700, fontSize: 19, margin: '0 2px 12px' }}>Important dates</div>
          {upcoming.length === 0 && past.length === 0 && (
            <div style={{ fontSize: 13, color: '#6F6C67', margin: '0 2px 12px' }}>No dates yet - add birthdays, appointments and school events below.</div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {upcoming.map((e) => <EventRow key={e.id} e={e} onEdit={openEdit} />)}
          </div>

          <button onClick={() => nav.openForm('event')} style={dashedAdd}>+ Add an important date</button>

          {past.length > 0 && (
            <>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#7D776E', textTransform: 'uppercase', letterSpacing: '.05em', margin: '26px 2px 10px' }}>Past</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {past.map((e) => <EventRow key={e.id} e={e} onEdit={openEdit} muted />)}
              </div>
            </>
          )}
        </>
      ) : (
        <>
          <div style={{ fontFamily: grotesk, fontWeight: 700, fontSize: 19, margin: '0 2px 12px' }}>{monthShort} events</div>
          {monthEvents.length === 0 && (
            <div style={{ fontSize: 13, color: '#6F6C67', margin: '0 2px 12px' }}>Nothing in {monthLabel} yet - add something below to plan ahead.</div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {monthEvents.map((e) => <EventRow key={e.id} e={e} onEdit={openEdit} />)}
          </div>
          <button onClick={() => addOnDay(1)} style={dashedAdd}>+ Add an event in {monthShort}</button>
        </>
      )}
    </div>
  );
}

function EventRow({ e, onEdit, muted }: { e: EventItem; onEdit: (e: EventItem) => void; muted?: boolean }) {
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`Edit ${e.title}`}
      onClick={() => onEdit(e)}
      onKeyDown={(ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); onEdit(e); } }}
      className="tap"
      style={{ display: 'flex', gap: 13, padding: 14, background: muted ? '#EFEBE3' : '#fff', borderRadius: 18, boxShadow: muted ? 'none' : '0 2px 8px rgba(16,20,38,0.04)', alignItems: 'center', cursor: 'pointer', opacity: muted ? 0.75 : 1 }}
    >
      <Icon name={e.illo} color={e.color} size={muted ? 40 : 44} radius={muted ? 12 : 14} glyph={muted ? 21 : 23} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 14.5, lineHeight: 1.25 }}>{e.title}</div>
        <div style={{ fontSize: 12, color: '#6F6C67', marginTop: 2 }}>{e.date_label} · {e.loc}</div>
      </div>
      <div style={{ flexShrink: 0, textAlign: 'right' }}>
        <div style={{ fontFamily: grotesk, fontWeight: 600, fontSize: 13 }}>{e.time}</div>
        {!muted && <div style={{ fontSize: 10, color: '#7D776E', fontWeight: 600 }}>{e.ampm}</div>}
      </div>
    </div>
  );
}

const dashedAdd: React.CSSProperties = {
  width: '100%', border: '1.5px dashed #D2CCC1', background: 'transparent', color: '#6B6459',
  fontWeight: 700, fontSize: 14, padding: 15, borderRadius: 16, cursor: 'pointer', marginTop: 14,
};
const monthBtn: React.CSSProperties = {
  width: 38, height: 38, borderRadius: 12, border: 'none', background: '#fff', cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 1px 2px rgba(24,25,34,0.05), 0 8px 20px -12px rgba(24,25,34,0.12)', flexShrink: 0,
};
