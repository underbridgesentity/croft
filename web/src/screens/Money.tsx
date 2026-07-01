import { useStore } from '../store';
import { api, money } from '../lib/api';
import type { Nav } from '../Shell';
import Icon from '../components/Icon';

const grotesk = "'Geist', sans-serif";
const parseAmt = (s: string) => Number(String(s).replace(/[^\d.]/g, '')) || 0;

export default function Money({ nav }: { nav: Nav }) {
  const { state, run } = useStore();
  if (!state) return null;

  const paid = state.bills.filter((b) => b.status === 'paid').reduce((a, b) => a + b.amount, 0);
  const out = state.bills.filter((b) => b.status !== 'paid').reduce((a, b) => a + b.amount, 0);
  const total = paid + out;
  const paidPct = total ? Math.round((paid / total) * 100) : 0;

  const activeSettle = state.settle.filter((s) => !s.settled);
  const net = activeSettle.reduce((a, s) => a + (s.dir === 'out' ? parseAmt(s.amount) : -parseAmt(s.amount)), 0);

  return (
    <div>
      <div style={{ margin: '8px 2px 18px' }}>
        <div style={{ fontFamily: grotesk, fontWeight: 700, fontSize: 30, letterSpacing: '-0.02em' }}>Money</div>
        <div style={{ marginTop: 4, color: '#6F6C67', fontSize: 14, fontWeight: 500 }}>Where the household stands this month</div>
      </div>

      {/* Outstanding hero */}
      <div style={{ background: '#3B5BFF', borderRadius: 24, padding: 22, boxShadow: '0 10px 26px rgba(59,91,255,0.3)', color: '#fff', marginBottom: 24, position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: -40, right: -30, width: 130, height: 130, borderRadius: '50%', background: 'rgba(255,255,255,0.1)' }} />
        <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.8)', textTransform: 'uppercase', letterSpacing: '.06em', position: 'relative' }}>Still outstanding</div>
        <div style={{ fontFamily: grotesk, fontWeight: 700, fontSize: 38, margin: '6px 0 2px', letterSpacing: '-0.02em', position: 'relative' }}>{money(out)}</div>
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.85)', marginBottom: 16, position: 'relative' }}>{money(paid)} paid of {money(total)} total</div>
        <div style={{ height: 9, borderRadius: 100, background: 'rgba(255,255,255,0.22)', overflow: 'hidden', position: 'relative' }}>
          <div style={{ height: '100%', width: `${paidPct}%`, borderRadius: 100, background: '#C6F24E' }} />
        </div>
      </div>

      {/* Bills */}
      <div style={{ fontFamily: grotesk, fontWeight: 700, fontSize: 19, margin: '0 2px 12px' }}>Bills</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
        {state.bills.map((b) => (
          <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '13px 14px', background: '#fff', borderRadius: 18, boxShadow: '0 2px 8px rgba(16,20,38,0.04)' }}>
            <Icon name={b.illo} color={b.color} size={42} radius={13} glyph={22} />
            <div
              role="button"
              tabIndex={0}
              aria-label={`Edit ${b.name}`}
              onClick={() => nav.openForm('bill', { editId: b.id, name: b.name, amount: String(b.amount || ''), due: b.due_date || '', payer: b.assignee_ids || [] })}
              onKeyDown={(ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); nav.openForm('bill', { editId: b.id, name: b.name, amount: String(b.amount || ''), due: b.due_date || '', payer: b.assignee_ids || [] }); } }}
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
                <span style={{ fontSize: 10.5, fontWeight: 700, color: '#16C098', background: 'rgba(22,192,152,0.12)', padding: '3px 10px', borderRadius: 100 }}>Paid</span>
              )}
            </div>
          </div>
        ))}
      </div>
      <button onClick={() => nav.openForm('bill')} style={dashedAdd}>+ Add a bill</button>

      {/* Budget */}
      <div style={{ fontFamily: grotesk, fontWeight: 700, fontSize: 19, margin: '26px 2px 12px' }}>Monthly budget</div>
      <div style={{ background: '#fff', borderRadius: 22, padding: '18px 16px 8px', boxShadow: '0 1px 2px rgba(24,25,34,0.04), 0 12px 30px -16px rgba(24,25,34,0.16)', marginBottom: 24 }}>
        {state.budget.map((c) => {
          const over = c.spent > c.limit;
          const barColor = over ? '#FF4D5E' : c.color;
          const w = Math.min(100, c.limit ? Math.round((c.spent / c.limit) * 100) : 0);
          return (
            <div key={c.id} style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 7 }}>
                <span style={{ fontWeight: 600, fontSize: 14 }}>{c.name}</span>
                <span style={{ fontSize: 12.5, color: '#6F6C67' }}><b style={{ color: barColor, fontWeight: 700, fontFamily: grotesk }}>{money(c.spent)}</b> / {money(c.limit)}</span>
              </div>
              <div style={{ height: 8, borderRadius: 100, background: '#EBE7DF', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${w}%`, borderRadius: 100, background: barColor }} />
              </div>
            </div>
          );
        })}
      </div>

      {/* Who owes who */}
      <div style={{ fontFamily: grotesk, fontWeight: 700, fontSize: 19, margin: '0 2px 6px' }}>Who owes who</div>
      <div style={{ fontSize: 13, color: '#6F6C67', margin: '0 2px 12px' }}>
        {net > 0 ? <>Overall, you owe Naledi <b style={{ color: '#FF5C8A' }}>{money(net)}</b></> : net < 0 ? <>Overall, Naledi owes you <b style={{ color: '#16C098' }}>{money(-net)}</b></> : <>All square - nobody owes anyone.</>}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 24 }}>
        {activeSettle.length === 0 && <div style={{ background: '#fff', borderRadius: 18, padding: '14px 16px', boxShadow: '0 2px 8px rgba(16,20,38,0.04)', fontSize: 13.5, color: '#6F6C67' }}>Nothing to settle right now.</div>}
        {activeSettle.map((s) => (
          <div key={s.id} style={{ background: '#fff', borderRadius: 18, padding: '14px 16px', boxShadow: '0 2px 8px rgba(16,20,38,0.04)', display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 13.5, lineHeight: 1.3 }}>{s.txt}</div>
              <div style={{ fontSize: 12, color: '#6F6C67', marginTop: 2 }}>{s.detail} <b style={{ color: s.dir === 'in' ? '#16C098' : '#FF5C8A' }}>{s.dir === 'in' ? '+' : '-'}{s.amount}</b></div>
            </div>
            <button onClick={() => run(s.dir === 'in' ? api.nudge(s.who) : api.settleUp(s.id), s.dir === 'in' ? `Reminder sent to ${s.who}` : 'Settled up')} style={{ flexShrink: 0, border: 'none', background: '#EFEBE3', color: '#3B5BFF', fontWeight: 700, fontSize: 12.5, padding: '9px 15px', borderRadius: 100, cursor: 'pointer' }}>
              {s.dir === 'in' ? 'Remind' : 'Settle up'}
            </button>
          </div>
        ))}
      </div>

      {/* Savings */}
      <div style={{ fontFamily: grotesk, fontWeight: 700, fontSize: 19, margin: '0 2px 12px' }}>Savings goals</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {state.savings.map((v) => (
          <div key={v.id} style={{ background: '#fff', borderRadius: 20, padding: 16, boxShadow: '0 1px 2px rgba(24,25,34,0.04), 0 12px 30px -16px rgba(24,25,34,0.16)' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontWeight: 700, fontSize: 15 }}>{v.name}</span>
              <span style={{ fontSize: 12.5, color: '#6F6C67' }}><b style={{ color: v.color, fontWeight: 700, fontFamily: grotesk }}>{money(v.saved)}</b> / {money(v.target)}</span>
            </div>
            <div style={{ height: 8, borderRadius: 100, background: '#EBE7DF', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${v.target ? Math.round((v.saved / v.target) * 100) : 0}%`, borderRadius: 100, background: v.color }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const dashedAdd: React.CSSProperties = {
  width: '100%', border: '1.5px dashed #D2CCC1', background: 'transparent', color: '#6B6459',
  fontWeight: 700, fontSize: 14, padding: 15, borderRadius: 16, cursor: 'pointer',
};
