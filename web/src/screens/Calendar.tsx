import { useState } from 'react';
import { useStore } from '../store';
import { money } from '../lib/api';
import type { Nav } from '../Shell';
import type { EventItem, Bill } from '../lib/types';
import Icon from '../components/Icon';
import PeopleFilter from '../components/PeopleFilter';
import { occurrencesInRange, nextOccurrence } from '../lib/recur';

const grotesk = "'Geist', sans-serif";
const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export default function Calendar({ nav }: { nav: Nav }) {
  const { state, flash } = useStore();
  // Month navigator: browse the grid and each month's events, like the Money tab.
  const [monthOffset, setMonthOffset] = useState(0);
  // Tapping a day opens that day's detail (events + bills due). Day number is
  // relative to the displayed month, so it resets when the month changes.
  const [openDay, setOpenDay] = useState<number | null>(null);
  const goMonth = (n: number) => { setMonthOffset(n); setOpenDay(null); };
  // Filter the whole calendar (dots, lists, day detail) to one person's items.
  const [who, setWho] = useState<string | null>(null);
  const inWho = (ids?: string[] | null) => !who || (ids || []).includes(who);
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

  // Expand recurring events into their occurrences within the displayed month,
  // so a weekly/monthly event paints every time it lands - not just its anchor.
  const monthStartIso = `${monthKey}-01`;
  const monthEndIso = `${monthKey}-${String(daysInMonth).padStart(2, '0')}`;
  const monthOccs: { e: EventItem; iso: string }[] = [];
  for (const e of state.events) {
    if (!inWho(e.assignee_ids) || !e.event_date) continue;
    for (const iso of occurrencesInRange(e.event_date, e.recur, monthStartIso, monthEndIso)) monthOccs.push({ e, iso });
  }
  // A friendly label for an occurrence date (Today / Tomorrow / Wed 8 Jul).
  const occLabel = (iso: string) => {
    const d = new Date(iso + 'T00:00');
    const t = new Date(); t.setHours(0, 0, 0, 0);
    const diff = Math.round((d.getTime() - t.getTime()) / 86400000);
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Tomorrow';
    if (diff === -1) return 'Yesterday';
    return d.toLocaleDateString('en-ZA', { weekday: 'short', day: 'numeric', month: 'short' });
  };

  // dots: mark every day in the DISPLAYED month that has an occurrence.
  const dotMap: Record<number, string> = {};
  for (const { e, iso } of monthOccs) dotMap[Number(iso.slice(8, 10))] = e.color;
  for (const e of state.events) {
    if (isCurrentMonth && !e.event_date && e.day === 'today' && inWho(e.assignee_ids)) dotMap[todayDate] = e.color;
  }

  const cells: { key: string; label: number; today: boolean; dot: string; faded: boolean }[] = [];
  for (let i = 0; i < firstDow; i++) cells.push({ key: 'p' + i, label: 0, today: false, dot: 'transparent', faded: true });
  for (let d = 1; d <= daysInMonth; d++) cells.push({ key: 'd' + d, label: d, today: isCurrentMonth && d === todayDate, dot: dotMap[d] || 'transparent', faded: false });
  while (cells.length % 7 !== 0) cells.push({ key: 'n' + cells.length, label: 0, today: false, dot: 'transparent', faded: true });

  const openEdit = (e: EventItem) => {
    if (e.external) { flash('Imported from a linked calendar - edit it in that calendar'); return; }
    nav.openForm('event', { editId: e.id, title: e.title, date: e.event_date || '', time: e.event_time || '', who: e.assignee_ids || [], recur: e.recur });
  };
  // Tap a day to add an event on it (nice for planning ahead in any month).
  const addOnDay = (d: number) =>
    nav.openForm('event', { title: '', date: `${monthKey}-${String(d).padStart(2, '0')}`, time: '', who: you ? [you.id] : [] });
  const openBill = (b: Bill) =>
    nav.openForm('bill', { editId: b.id, name: b.name, amount: String(b.amount || ''), due: b.due_date || '', payer: b.assignee_ids || [], recur: b.recur });

  // Day detail: everything happening on the tapped day - events (incl. recurring
  // occurrences) + bills due.
  const dayIso = openDay ? `${monthKey}-${String(openDay).padStart(2, '0')}` : null;
  const dayEvents = dayIso ? monthOccs.filter((o) => o.iso === dayIso).map((o) => ({ ...o.e, date_label: occLabel(o.iso), event_date: o.iso })) : [];
  const dayBills = dayIso ? state.bills.filter((b) => b.due_date === dayIso && inWho(b.assignee_ids)) : [];
  const dayLabel = openDay ? new Date(year, month, openDay).toLocaleDateString('en-ZA', { weekday: 'long', day: 'numeric', month: 'long' }) : '';

  // Current month keeps the agenda view (everything upcoming + a past section).
  // Any other month shows just that month's events, newest first.
  // Current-month agenda: each event once, at its next occurrence from today
  // (recurring events show their upcoming instance, not their old anchor).
  const upcoming = state.events
    .filter((e) => inWho(e.assignee_ids))
    .map((e) => (e.event_date ? { e, iso: nextOccurrence(e.event_date, e.recur, todayIso) } : { e, iso: null as string | null }))
    .filter((o) => o.iso !== null || !o.e.event_date)
    .sort((a, b) => ((a.iso || '9999') < (b.iso || '9999') ? -1 : 1));
  // Past = non-recurring events whose date has gone (recurring always have a next).
  const past = state.events
    .filter((e) => inWho(e.assignee_ids) && e.event_date && e.event_date < todayIso && (!e.recur || e.recur === 'none'))
    .reverse();
  // Other-month list: every occurrence that lands in the displayed month.
  const monthEvents = [...monthOccs].sort((a, b) => (a.iso < b.iso ? -1 : 1));

  return (
    <div>
      <div style={{ margin: '8px 2px 14px' }}>
        <div style={{ fontFamily: grotesk, fontWeight: 700, fontSize: 30, letterSpacing: '-0.02em' }}>Calendar</div>
        <div style={{ marginTop: 4, color: '#6F6C67', fontSize: 14, fontWeight: 500 }}>Plan and review any month</div>
      </div>

      {/* Month navigator */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 14 }}>
        <button onClick={() => goMonth(monthOffset - 1)} aria-label="Previous month" style={monthBtn}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M15 5l-7 7 7 7" stroke="#181922" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontFamily: grotesk, fontWeight: 700, fontSize: 16 }}>{monthLabel}</div>
          {!isCurrentMonth && (
            <button onClick={() => goMonth(0)} style={{ border: 'none', background: 'none', color: '#3B5BFF', fontWeight: 700, fontSize: 11.5, cursor: 'pointer', padding: '1px 0 0' }}>Back to this month</button>
          )}
        </div>
        <button onClick={() => goMonth(monthOffset + 1)} aria-label="Next month" style={monthBtn}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M9 5l7 7-7 7" stroke="#181922" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
      </div>

      <PeopleFilter members={state.members} value={who} onChange={setWho} />

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
                onClick={() => setOpenDay(openDay === c.label ? null : c.label)}
                aria-label={`View ${c.label} ${monthShort}`}
                style={{ height: 42, border: 'none', background: 'none', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3, padding: 0 }}
              >
                <div style={{ width: 31, height: 31, borderRadius: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: grotesk, fontSize: 13.5, fontWeight: 600, background: c.today ? '#3B5BFF' : openDay === c.label ? 'rgba(59,91,255,0.14)' : 'transparent', color: c.today ? '#fff' : '#181922', boxShadow: openDay === c.label && !c.today ? 'inset 0 0 0 2px #3B5BFF' : 'none' }}>
                  {c.label}
                </div>
                <div style={{ width: 5, height: 5, borderRadius: '50%', background: c.dot }} />
              </button>
            )
          ))}
        </div>
      </div>

      {dayIso && (
        <div style={{ background: '#fff', borderRadius: 20, padding: '16px 16px 14px', boxShadow: '0 1px 2px rgba(24,25,34,0.04), 0 12px 30px -16px rgba(24,25,34,0.16)', marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ fontFamily: grotesk, fontWeight: 700, fontSize: 16 }}>{dayLabel}</div>
            <button onClick={() => setOpenDay(null)} aria-label="Close day" style={{ width: 30, height: 30, borderRadius: 10, border: 'none', background: '#EBE7DF', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="#181922" strokeWidth="2.2" strokeLinecap="round" /></svg>
            </button>
          </div>
          {dayEvents.length === 0 && dayBills.length === 0 && (
            <div style={{ fontSize: 13, color: '#6F6C67', margin: '0 2px 12px' }}>Nothing on this day yet.</div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {dayEvents.map((e) => <EventRow key={e.id} e={e} onEdit={openEdit} />)}
            {dayBills.map((b) => (
              <div key={b.id} role="button" tabIndex={0} aria-label={`Edit bill ${b.name}`} onClick={() => openBill(b)} onKeyDown={(ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); openBill(b); } }} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 13px', background: '#F7F5F1', borderRadius: 16, cursor: 'pointer' }}>
                <Icon name={b.illo} color={b.color} size={40} radius={12} glyph={20} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{b.name}</div>
                  <div style={{ fontSize: 11.5, color: '#6F6C67', marginTop: 1 }}>{b.payer} · bill due{b.status === 'paid' ? ' · paid' : ''}</div>
                </div>
                <div style={{ fontFamily: grotesk, fontWeight: 700, fontSize: 14, flexShrink: 0 }}>{money(b.amount)}</div>
              </div>
            ))}
          </div>
          <button onClick={() => addOnDay(openDay!)} style={{ ...dashedAdd, marginTop: dayEvents.length || dayBills.length ? 12 : 0 }}>+ Add an event on this day</button>
        </div>
      )}

      {isCurrentMonth ? (
        <>
          <div style={{ fontFamily: grotesk, fontWeight: 700, fontSize: 19, margin: '0 2px 12px' }}>Important dates</div>
          {upcoming.length === 0 && past.length === 0 && (
            <div style={{ fontSize: 13, color: '#6F6C67', margin: '0 2px 12px' }}>No dates yet - add birthdays, appointments and school events below.</div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {upcoming.map((o) => <EventRow key={o.e.id + (o.iso || '')} e={o.iso ? { ...o.e, date_label: occLabel(o.iso) } : o.e} onEdit={openEdit} />)}
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
            {monthEvents.map((o) => <EventRow key={o.e.id + o.iso} e={{ ...o.e, date_label: occLabel(o.iso) }} onEdit={openEdit} />)}
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ fontWeight: 700, fontSize: 14.5, lineHeight: 1.25, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.title}</div>
          {e.external && <span style={{ flexShrink: 0, fontSize: 9.5, fontWeight: 800, letterSpacing: '.04em', textTransform: 'uppercase', color: '#6D5CD6', background: 'rgba(140,124,255,0.16)', padding: '2px 6px', borderRadius: 100 }}>Linked</span>}
          {e.recur && e.recur !== 'none' && <span style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 9.5, fontWeight: 800, letterSpacing: '.03em', textTransform: 'uppercase', color: '#3B5BFF', background: 'rgba(59,91,255,0.12)', padding: '2px 6px', borderRadius: 100 }}>↻ {e.recur[0].toUpperCase() + e.recur.slice(1)}</span>}
        </div>
        <div style={{ fontSize: 12, color: '#6F6C67', marginTop: 2 }}>{e.date_label}{e.loc ? ' · ' + e.loc : ''}</div>
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
