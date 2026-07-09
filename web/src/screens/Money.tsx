import { useState } from 'react';
import { useStore } from '../store';
import { api, money } from '../lib/api';
import type { Nav } from '../Shell';
import Icon from '../components/Icon';

const grotesk = "'Geist', sans-serif";

/** Two-tap trash: first tap arms ("Sure?"), second deletes. */
function SureTrash({ label, onConfirm }: { label: string; onConfirm: () => void }) {
  const [armed, setArmed] = useState(false);
  if (armed) {
    return (
      <button onClick={() => { setArmed(false); onConfirm(); }} onBlur={() => setArmed(false)} autoFocus aria-label={`Confirm remove ${label}`} style={{ flexShrink: 0, border: 'none', background: '#FF4D5E', color: '#fff', fontWeight: 700, fontSize: 11, padding: '6px 10px', borderRadius: 100, cursor: 'pointer' }}>Sure?</button>
    );
  }
  return (
    <button onClick={() => setArmed(true)} aria-label={`Remove ${label}`} style={{ flexShrink: 0, border: 'none', background: 'none', cursor: 'pointer', padding: 4 }}>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M5 7h14M10 7V5h4v2M9 7l.7 12h8.6L19 7" stroke="#C9C3B9" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
    </button>
  );
}
// Settle amounts are stored en-ZA formatted ("R1 500,50" - space thousands,
// comma decimal). Strip the currency + grouping and treat the comma as the
// decimal point, otherwise "R527,84" would parse as 52784 (100x too big).
const parseAmt = (s: string) => Number(String(s).replace(/[^\d,]/g, '').replace(',', '.')) || 0;

export default function Money({ nav }: { nav: Nav }) {
  const { state, run, isBusy } = useStore();
  // Month navigator: browse bills (and their totals) month by month, so the
  // household can review past months and plan ahead.
  const [monthOffset, setMonthOffset] = useState(0);
  if (!state) return null;

  const now = new Date();
  const sel = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
  const monthKey = `${sel.getFullYear()}-${String(sel.getMonth() + 1).padStart(2, '0')}`; // YYYY-MM
  const monthLabel = sel.toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' });
  // Bills with a real due date belong to that month; undated ones show in the
  // current month so nothing silently disappears.
  const monthBills = state.bills.filter((b) =>
    b.due_date ? b.due_date.startsWith(monthKey) : monthOffset === 0
  );

  const paid = monthBills.filter((b) => b.status === 'paid').reduce((a, b) => a + b.amount, 0);
  const out = monthBills.filter((b) => b.status !== 'paid').reduce((a, b) => a + b.amount, 0);
  const total = paid + out;
  const paidPct = total ? Math.round((paid / total) * 100) : 0;

  const activeSettle = state.settle.filter((s) => !s.settled);
  const settledItems = state.settle.filter((s) => s.settled);
  // Only IOUs you're actually part of count toward your balance (a debt between
  // two other members shows in the list but isn't yours to owe or be owed).
  const net = activeSettle.filter((s) => s.mine !== false).reduce((a, s) => a + (s.dir === 'out' ? parseAmt(s.amount) : -parseAmt(s.amount)), 0);
  // Open bills stay front and centre; paid ones drop into their own history section.
  const openBills = monthBills.filter((b) => b.status !== 'paid');
  const paidBills = monthBills.filter((b) => b.status === 'paid');
  const you = state.members.find((m) => m.you);
  // Adding a bill while browsing another month pre-fills a due date in it.
  const addBill = () => nav.openForm('bill', monthOffset === 0 ? undefined : { name: '', amount: '', due: `${monthKey}-01`, payer: you ? [you.id] : [] });

  return (
    <div>
      <div style={{ margin: '8px 2px 14px' }}>
        <div style={{ fontFamily: grotesk, fontWeight: 700, fontSize: 30, letterSpacing: '-0.02em' }}>Money</div>
        <div style={{ marginTop: 4, color: '#6F6C67', fontSize: 14, fontWeight: 500 }}>Where the household stands, month by month</div>
      </div>

      {/* Month navigator */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 14 }}>
        <button onClick={() => setMonthOffset(monthOffset - 1)} aria-label="Previous month" style={monthBtn}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M15 5l-7 7 7 7" stroke="#181922" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontFamily: grotesk, fontWeight: 700, fontSize: 16 }}>{monthLabel}</div>
          {monthOffset !== 0 && (
            <button onClick={() => setMonthOffset(0)} style={{ border: 'none', background: 'none', color: '#3B5BFF', fontWeight: 700, fontSize: 11.5, cursor: 'pointer', padding: '1px 0 0' }}>Back to this month</button>
          )}
        </div>
        <button onClick={() => setMonthOffset(monthOffset + 1)} aria-label="Next month" style={monthBtn}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M9 5l7 7-7 7" stroke="#181922" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
      </div>

      {/* Outstanding hero */}
      <div style={{ background: '#3B5BFF', borderRadius: 24, padding: 22, boxShadow: '0 10px 26px rgba(59,91,255,0.3)', color: '#fff', marginBottom: 24, position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: -40, right: -30, width: 130, height: 130, borderRadius: '50%', background: 'rgba(255,255,255,0.1)' }} />
        <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.8)', textTransform: 'uppercase', letterSpacing: '.06em', position: 'relative' }}>{monthOffset === 0 ? 'Still outstanding' : `Outstanding in ${monthLabel.split(' ')[0]}`}</div>
        <div style={{ fontFamily: grotesk, fontWeight: 700, fontSize: 38, margin: '6px 0 2px', letterSpacing: '-0.02em', position: 'relative' }}>{money(out)}</div>
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.85)', marginBottom: 16, position: 'relative' }}>{money(paid)} paid of {money(total)} total</div>
        <div style={{ height: 9, borderRadius: 100, background: 'rgba(255,255,255,0.22)', overflow: 'hidden', position: 'relative' }}>
          <div style={{ height: '100%', width: `${paidPct}%`, borderRadius: 100, background: '#C6F24E' }} />
        </div>
      </div>

      {/* Bills */}
      <div id="bills-section" style={{ fontFamily: grotesk, fontWeight: 700, fontSize: 19, margin: '0 2px 12px', scrollMarginTop: 12 }}>Bills · {monthLabel.split(' ')[0]}</div>
      {openBills.length === 0 && paidBills.length === 0 && (
        <div style={{ fontSize: 13, color: '#6F6C67', margin: '0 2px 12px' }}>
          {monthOffset === 0 ? 'Track rent, utilities and subscriptions with real due dates.' : `No bills for ${monthLabel} yet - add one below to plan ahead.`}
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
        {openBills.map((b) => <BillRow key={b.id} b={b} nav={nav} run={run} />)}
      </div>
      <button onClick={addBill} style={dashedAdd}>+ Add a bill</button>
      {paidBills.length > 0 && (
        <>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#7D776E', textTransform: 'uppercase', letterSpacing: '.05em', margin: '18px 2px 10px' }}>Paid</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {paidBills.map((b) => <BillRow key={b.id} b={b} nav={nav} run={run} muted />)}
          </div>
        </>
      )}

      {/* Budget - spend totals come from the per-month ledger, so browsing months
          shows what was actually spent in each. Logging happens in the current month. */}
      <div id="budget-section" style={{ fontFamily: grotesk, fontWeight: 700, fontSize: 19, margin: '26px 2px 12px', scrollMarginTop: 12 }}>Budget · {monthLabel.split(' ')[0]}</div>
      {state.budget.length > 0 && (
        <div style={{ background: '#fff', borderRadius: 22, padding: '18px 16px 8px', boxShadow: '0 1px 2px rgba(24,25,34,0.04), 0 12px 30px -16px rgba(24,25,34,0.16)', marginBottom: 12 }}>
          {state.budget.map((c) => {
            const spent = (state.budgetMonths || []).find((m) => m.budget_id === c.id && m.month === monthKey)?.total || 0;
            const over = c.limit > 0 && spent > c.limit;
            const barColor = over ? '#FF4D5E' : c.color;
            const w = Math.min(100, c.limit ? Math.round((spent / c.limit) * 100) : 0);
            const canEdit = monthOffset === 0;
            const editBudget = () => canEdit && nav.openForm('budget', { editId: c.id, name: c.name, limit: c.limit ? String(c.limit) : '', amount: '', note: '' });
            return (
              <div
                key={c.id}
                role={canEdit ? 'button' : undefined}
                tabIndex={canEdit ? 0 : undefined}
                aria-label={canEdit ? `Edit budget "${c.name}"` : undefined}
                onClick={editBudget}
                onKeyDown={(ev) => { if (canEdit && (ev.key === 'Enter' || ev.key === ' ')) { ev.preventDefault(); editBudget(); } }}
                style={{ marginBottom: 16, cursor: canEdit ? 'pointer' : 'default' }}
              >
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 7 }}>
                  <span style={{ fontWeight: 600, fontSize: 14 }}>{c.name}</span>
                  <span style={{ fontSize: 12.5, color: '#6F6C67' }}><b style={{ color: barColor, fontWeight: 700, fontFamily: grotesk }}>{money(spent)}</b> / {money(c.limit)}</span>
                </div>
                <div style={{ height: 8, borderRadius: 100, background: '#EBE7DF', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${w}%`, borderRadius: 100, background: barColor }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
      {state.budget.length === 0 && (
        <div style={{ fontSize: 13, color: '#6F6C67', margin: '0 2px 12px' }}>Track monthly spending by category - groceries, transport, school. Tap a category to log each spend; they tally up per month.</div>
      )}
      {monthOffset === 0 && <button onClick={() => nav.openForm('budget')} style={{ ...dashedAdd, marginBottom: 24 }}>+ Add a budget category</button>}
      {monthOffset !== 0 && state.budget.length > 0 && (
        <div style={{ fontSize: 11.5, color: '#7D776E', margin: '0 2px 24px' }}>Viewing {monthLabel} spending. Go back to this month to log spends.</div>
      )}

      {/* Insights */}
      <MoneyInsights state={state} monthKey={monthKey} monthShort={monthLabel.split(' ')[0]} billsTotal={total} nav={nav} onMonth={setMonthOffset} />

      {/* Who owes who */}
      <div style={{ fontFamily: grotesk, fontWeight: 700, fontSize: 19, margin: '0 2px 6px' }}>Who owes who</div>
      <div style={{ fontSize: 13, color: '#6F6C67', margin: '0 2px 12px' }}>
        {net > 0 ? <>Overall, you owe <b style={{ color: '#FF5C8A' }}>{money(net)}</b></> : net < 0 ? <>Overall, you're owed <b style={{ color: '#16C098' }}>{money(-net)}</b></> : <>All square - nobody owes anyone.</>}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 12 }}>
        {activeSettle.map((s) => {
          const editSettle = () => nav.openForm('settle', { editId: s.id, dir: s.dir, amount: String(parseAmt(s.amount) || ''), note: s.detail, who: s.member_id ? [s.member_id] : [] });
          return (
          <div key={s.id} style={{ background: '#fff', borderRadius: 18, padding: '14px 16px', boxShadow: '0 2px 8px rgba(16,20,38,0.04)', display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              role="button"
              tabIndex={0}
              aria-label={`Edit ${s.txt}`}
              onClick={editSettle}
              onKeyDown={(ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); editSettle(); } }}
              style={{ flex: 1, minWidth: 0, cursor: 'pointer' }}
            >
              <div style={{ fontWeight: 600, fontSize: 13.5, lineHeight: 1.3 }}>{s.txt}</div>
              <div style={{ fontSize: 12, color: '#6F6C67', marginTop: 2 }}>{s.detail} <b style={{ color: s.dir === 'in' ? '#16C098' : '#FF5C8A' }}>{s.dir === 'in' ? '+' : '-'}{s.amount}</b></div>
            </div>
            <button onClick={() => !isBusy('settle:' + s.id) && run(s.dir === 'in' ? api.nudge(s.who, s.member_id ? [s.member_id] : [], `${s.txt} ${s.amount}`) : api.settleUp(s.id), s.dir === 'in' ? `Reminder sent to ${s.who}` : 'Settled up', 'settle:' + s.id)} style={{ flexShrink: 0, border: 'none', background: '#EFEBE3', color: '#3B5BFF', fontWeight: 700, fontSize: 12.5, padding: '9px 15px', borderRadius: 100, cursor: 'pointer' }}>
              {s.dir === 'in' ? 'Remind' : 'Settle up'}
            </button>
            {s.dir === 'in' && (
              <button onClick={() => !isBusy('settle:' + s.id) && run(api.settleUp(s.id), 'Settled up', 'settle:' + s.id)} style={{ flexShrink: 0, border: 'none', background: 'none', color: '#7D776E', fontWeight: 700, fontSize: 12, cursor: 'pointer', padding: '9px 2px' }}>Settle</button>
            )}
          </div>
          );
        })}
      </div>
      <button onClick={() => nav.openForm('settle')} style={{ ...dashedAdd, marginBottom: settledItems.length ? 16 : 24 }}>+ Add who owes who</button>

      {/* Settled history - what's been squared up (was previously hidden). */}
      {settledItems.length > 0 && (
        <>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#7D776E', textTransform: 'uppercase', letterSpacing: '.05em', margin: '4px 2px 10px' }}>Settled</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
            {settledItems.map((s) => (
              <div key={s.id} style={{ background: '#EFEBE3', borderRadius: 18, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, opacity: 0.85 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 13.5, color: '#6B6459' }}>{s.txt}</div>
                  <div style={{ fontSize: 12, color: '#8A847B', marginTop: 2 }}>{s.detail ? s.detail + ' · ' : ''}<b>{s.amount}</b></div>
                </div>
                <button onClick={() => run(api.reopenSettle(s.id), 'Reopened')} aria-label={`Reopen ${s.txt}`} style={{ flexShrink: 0, border: 'none', fontSize: 10.5, fontWeight: 700, color: '#3B5BFF', background: 'rgba(59,91,255,0.1)', padding: '3px 10px', borderRadius: 100, cursor: 'pointer' }}>Reopen</button>
                <SureTrash label={s.txt} onConfirm={() => run(api.delSettle(s.id), 'Removed')} />
              </div>
            ))}
          </div>
        </>
      )}

      {/* Savings */}
      <div style={{ fontFamily: grotesk, fontWeight: 700, fontSize: 19, margin: '0 2px 12px' }}>Savings goals</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 12 }}>
        {state.savings.length === 0 && (
          <div style={{ fontSize: 13, color: '#6F6C67', margin: '0 2px' }}>Put a number on the things you're saving for, together.</div>
        )}
        {state.savings.map((v) => {
          const editSaving = () => nav.openForm('saving', { editId: v.id, name: v.name, target: v.target ? String(v.target) : '', saved: v.saved ? String(v.saved) : '', amount: '' });
          return (
            <div
              key={v.id}
              role="button"
              tabIndex={0}
              aria-label={`Edit savings goal "${v.name}"`}
              onClick={editSaving}
              onKeyDown={(ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); editSaving(); } }}
              style={{ background: '#fff', borderRadius: 20, padding: 16, boxShadow: '0 1px 2px rgba(24,25,34,0.04), 0 12px 30px -16px rgba(24,25,34,0.16)', cursor: 'pointer' }}
            >
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontWeight: 700, fontSize: 15 }}>{v.name}</span>
                <span style={{ fontSize: 12.5, color: '#6F6C67' }}><b style={{ color: v.color, fontWeight: 700, fontFamily: grotesk }}>{money(v.saved)}</b> / {money(v.target)}</span>
              </div>
              <div style={{ height: 8, borderRadius: 100, background: '#EBE7DF', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${v.target ? Math.round((v.saved / v.target) * 100) : 0}%`, borderRadius: 100, background: v.color }} />
              </div>
            </div>
          );
        })}
      </div>
      <button onClick={() => nav.openForm('saving')} style={dashedAdd}>+ Add a savings goal</button>
    </div>
  );
}

const dashedAdd: React.CSSProperties = {
  width: '100%', border: '1.5px dashed #D2CCC1', background: 'transparent', color: '#6B6459',
  fontWeight: 700, fontSize: 14, padding: 15, borderRadius: 16, cursor: 'pointer',
};
const monthBtn: React.CSSProperties = {
  width: 38, height: 38, borderRadius: 12, cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  background: 'rgba(255,255,255,0.6)', border: '1px solid rgba(255,255,255,0.55)',
  backdropFilter: 'blur(20px) saturate(180%)', WebkitBackdropFilter: 'blur(20px) saturate(180%)',
  boxShadow: '0 1px 2px rgba(24,25,34,0.05), 0 8px 20px -14px rgba(24,25,34,0.18), inset 0 1px 0 rgba(255,255,255,0.75)',
};

function MoneyInsights({ state, monthKey, monthShort, billsTotal, nav, onMonth }: { state: import('../lib/types').AppState; monthKey: string; monthShort: string; billsTotal: number; nav: Nav; onMonth: (offset: number) => void }) {
  const now = new Date();
  const months = state.budgetMonths || [];
  const trend = [] as { label: string; total: number; current: boolean; offset: number }[];
  for (let i = 5; i >= 0; i--) {
    const dt = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
    trend.push({ label: dt.toLocaleDateString('en-ZA', { month: 'short' }).slice(0, 3), total: months.filter((m) => m.month === key).reduce((a, m) => a + m.total, 0), current: key === monthKey, offset: -i });
  }
  const maxT = Math.max(1, ...trend.map((t) => t.total));
  const cats = state.budget
    .map((c) => ({ id: c.id, name: c.name, color: c.color, limit: c.limit, spent: months.find((m) => m.budget_id === c.id && m.month === monthKey)?.total || 0 }))
    .filter((c) => c.spent > 0)
    .sort((a, b) => b.spent - a.spent);
  const spentTotal = cats.reduce((a, c) => a + c.spent, 0);
  if (!trend.some((t) => t.total > 0) && cats.length === 0) return null; // nothing to show yet

  const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const openBudget = (c: (typeof cats)[number]) => nav.openForm('budget', { editId: c.id, name: c.name, limit: c.limit ? String(c.limit) : '', amount: '', note: '' });

  return (
    <>
      <div style={{ fontFamily: grotesk, fontWeight: 700, fontSize: 19, margin: '0 2px 12px' }}>Insights</div>
      <div style={{ background: '#fff', borderRadius: 22, padding: 18, boxShadow: '0 1px 2px rgba(24,25,34,0.04), 0 12px 30px -16px rgba(24,25,34,0.16)', marginBottom: 24 }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: '#6F6C67', marginBottom: 12 }}>Spending · last 6 months · <span style={{ color: '#9C968D', fontWeight: 600 }}>tap a month</span></div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 90 }}>
          {trend.map((t, i) => (
            <button key={i} onClick={() => onMonth(t.offset)} aria-label={`View ${t.label} · ${money(t.total)}`} style={{ flex: 1, border: 'none', background: 'none', cursor: 'pointer', padding: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, justifyContent: 'flex-end', height: '100%' }}>
              <div style={{ width: '100%', maxWidth: 28, height: Math.max(4, Math.round((t.total / maxT) * 62)), borderRadius: 6, background: t.current ? '#3B5BFF' : '#C9D3FF' }} />
              <div style={{ fontSize: 10, fontWeight: 700, color: t.current ? '#3B5BFF' : '#9C968D' }}>{t.label}</div>
            </button>
          ))}
        </div>

        {cats.length > 0 && (
          <>
            <div style={{ height: 1, background: '#EFEBE3', margin: '16px 0 12px' }} />
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: '#6F6C67' }}>Where it went · {monthShort}</span>
              <span style={{ fontSize: 13, fontWeight: 700, fontFamily: grotesk }}>{money(spentTotal)}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {cats.map((c) => {
                const pct = spentTotal ? Math.round((c.spent / spentTotal) * 100) : 0;
                return (
                  <button key={c.id} onClick={() => openBudget(c)} aria-label={`See ${c.name} spends`} style={{ border: 'none', background: 'none', cursor: 'pointer', padding: '6px 0', textAlign: 'left', width: '100%' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12.5, marginBottom: 4 }}>
                      <span style={{ fontWeight: 600 }}>{c.name}</span>
                      <span style={{ color: '#6F6C67', display: 'inline-flex', alignItems: 'center', gap: 4 }}>{money(c.spent)} · {pct}%<svg width="6" height="10" viewBox="0 0 8 14" style={{ opacity: 0.5 }}><path d="M1 1l6 6-6 6" stroke="#9C968D" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg></span>
                    </div>
                    <div style={{ height: 6, borderRadius: 100, background: '#EBE7DF', overflow: 'hidden' }}><div style={{ height: '100%', width: `${pct}%`, background: c.color, borderRadius: 100 }} /></div>
                  </button>
                );
              })}
            </div>
          </>
        )}

        <div style={{ height: 1, background: '#EFEBE3', margin: '16px 0 12px' }} />
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={() => scrollTo('bills-section')} style={{ flex: 1, background: '#F5F4F1', borderRadius: 14, padding: '11px 13px', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
            <div style={{ fontSize: 11, color: '#7D776E', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>Bills this month <span style={{ color: '#3B5BFF' }}>See →</span></div>
            <div style={{ fontFamily: grotesk, fontWeight: 700, fontSize: 17, marginTop: 2 }}>{money(billsTotal)}</div>
          </button>
          <button onClick={() => scrollTo('budget-section')} style={{ flex: 1, background: '#F5F4F1', borderRadius: 14, padding: '11px 13px', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
            <div style={{ fontSize: 11, color: '#7D776E', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>Budget spent <span style={{ color: '#3B5BFF' }}>See →</span></div>
            <div style={{ fontFamily: grotesk, fontWeight: 700, fontSize: 17, marginTop: 2 }}>{money(spentTotal)}</div>
          </button>
        </div>
      </div>
    </>
  );
}

function BillRow({ b, nav, run, muted }: { b: import('../lib/types').Bill; nav: Nav; run: (p: Promise<import('../lib/types').AppState>, msg?: string) => Promise<void>; muted?: boolean }) {
  const edit = () => nav.openForm('bill', { editId: b.id, name: b.name, amount: String(b.amount || ''), due: b.due_date || '', payer: b.assignee_ids || [], recur: b.recur, remindDays: b.remind_days });
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '13px 14px', background: muted ? '#EFEBE3' : '#fff', borderRadius: 18, boxShadow: muted ? 'none' : '0 2px 8px rgba(16,20,38,0.04)', opacity: muted ? 0.8 : 1 }}>
      <Icon name={b.illo} color={b.color} size={42} radius={13} glyph={22} />
      <div
        role="button"
        tabIndex={0}
        aria-label={`Edit ${b.name}`}
        onClick={edit}
        onKeyDown={(ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); edit(); } }}
        style={{ flex: 1, minWidth: 0, cursor: 'pointer' }}
      >
        <div style={{ fontWeight: 700, fontSize: 14.5 }}>{b.name}</div>
        <div style={{ fontSize: 11.5, color: '#6F6C67', marginTop: 1 }}>{b.payer} · {b.cat} · due {b.due}</div>
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 5 }}>
        <div style={{ fontFamily: grotesk, fontWeight: 700, fontSize: 15 }}>{money(b.amount)}</div>
        {b.status !== 'paid' ? (
          <button onClick={() => run(api.payBill(b.id), 'Marked as paid')} style={{ border: 'none', background: '#3B5BFF', color: '#fff', fontWeight: 700, fontSize: 11, padding: '5px 12px', borderRadius: 100, cursor: 'pointer' }}>Mark paid</button>
        ) : (
          <button onClick={() => run(api.unpayBill(b.id), 'Marked as unpaid')} title="Tap to mark unpaid" aria-label={`Mark ${b.name} as unpaid`} style={{ border: 'none', fontSize: 10.5, fontWeight: 700, color: '#16C098', background: 'rgba(22,192,152,0.12)', padding: '3px 10px', borderRadius: 100, cursor: 'pointer' }}>Paid ↺</button>
        )}
      </div>
    </div>
  );
}
