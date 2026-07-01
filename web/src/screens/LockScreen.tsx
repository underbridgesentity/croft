import { useState } from 'react';
import { useStore } from '../store';
import { api } from '../lib/api';

const grotesk = "'Bricolage Grotesque', sans-serif";

export default function LockScreen() {
  const { user, unlock, logout } = useStore();
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);

  const submit = async (value: string) => {
    setBusy(true);
    setErr(false);
    try {
      const { ok } = await api.lockVerify(value);
      if (ok) unlock();
      else { setErr(true); setPin(''); }
    } catch {
      setErr(true);
      setPin('');
    } finally {
      setBusy(false);
    }
  };

  const press = (d: string) => {
    if (busy) return;
    const next = (pin + d).slice(0, 8);
    setPin(next);
    setErr(false);
  };
  const del = () => setPin((p) => p.slice(0, -1));

  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'];

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 200, background: '#F5F4F1', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
      <div style={{ width: '100%', maxWidth: 320, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <span style={{ width: 52, height: 52, borderRadius: 16, background: '#3B5BFF', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 18, boxShadow: '0 6px 16px rgba(59,91,255,0.32)' }}>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none"><rect x="4.5" y="10.5" width="15" height="10" rx="2.5" stroke="#fff" strokeWidth="1.9" /><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" stroke="#fff" strokeWidth="1.9" /></svg>
        </span>
        <h1 style={{ fontFamily: grotesk, fontWeight: 700, fontSize: 22, margin: '0 0 4px' }}>{user?.name ? `Hi ${user.name.split(' ')[0]}` : 'Locked'}</h1>
        <p style={{ fontSize: 14, color: err ? '#E23A54' : '#6F6C67', margin: '0 0 24px', fontWeight: err ? 700 : 500 }}>
          {err ? 'Incorrect passcode - try again' : 'Enter your passcode'}
        </p>

        {/* dots */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 30, minHeight: 14 }}>
          {Array.from({ length: Math.max(4, pin.length) }).map((_, i) => (
            <span key={i} style={{ width: 13, height: 13, borderRadius: '50%', background: i < pin.length ? '#3B5BFF' : '#D3DAE8' }} />
          ))}
        </div>

        {/* keypad */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, width: '100%' }}>
          {keys.map((k, i) =>
            k === '' ? (
              <span key={i} />
            ) : k === '⌫' ? (
              <button key={i} onClick={del} aria-label="Delete" style={keyStyle(false)}>⌫</button>
            ) : (
              <button key={i} onClick={() => press(k)} style={keyStyle(true)}>{k}</button>
            )
          )}
        </div>

        <button onClick={() => submit(pin)} disabled={busy || pin.length < 4} style={{ width: '100%', marginTop: 24, border: 'none', borderRadius: 16, padding: 15, background: '#3B5BFF', color: '#fff', fontFamily: grotesk, fontWeight: 700, fontSize: 15.5, cursor: 'pointer', opacity: busy || pin.length < 4 ? 0.5 : 1 }}>
          {busy ? 'Checking…' : 'Unlock'}
        </button>
        <button onClick={() => logout()} style={{ border: 'none', background: 'none', color: '#9C968D', fontWeight: 700, fontSize: 13.5, padding: '14px 0 0', cursor: 'pointer' }}>Forgot passcode? Sign out</button>
      </div>
    </div>
  );
}

function keyStyle(filled: boolean): React.CSSProperties {
  return {
    height: 62,
    border: 'none',
    borderRadius: 18,
    background: filled ? '#fff' : 'transparent',
    color: '#181922',
    fontFamily: grotesk,
    fontWeight: 700,
    fontSize: filled ? 24 : 20,
    cursor: 'pointer',
    boxShadow: filled ? '0 1px 3px rgba(16,20,38,0.08)' : 'none',
  };
}
