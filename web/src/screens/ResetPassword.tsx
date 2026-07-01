import { useState } from 'react';
import { useStore } from '../store';

const grotesk = "'Geist', sans-serif";
const inputStyle: React.CSSProperties = { width: '100%', padding: '13px 15px', borderRadius: 14, border: '1.5px solid #E8E3DB', background: '#fff', fontSize: 15, boxSizing: 'border-box', fontFamily: 'inherit', color: '#181922' };
const primaryBtn: React.CSSProperties = { width: '100%', padding: 15, borderRadius: 14, border: 'none', background: '#3B5BFF', color: '#fff', fontFamily: grotesk, fontWeight: 700, fontSize: 15.5, cursor: 'pointer', boxShadow: '0 8px 22px rgba(59,91,255,0.4)' };
const labelStyle: React.CSSProperties = { fontSize: 12.5, fontWeight: 700, color: '#6F6C67', margin: '0 2px 6px' };

export default function ResetPassword({ token, onDone, onCancel }: { token: string; onDone: () => void; onCancel: () => void }) {
  const { resetPassword } = useStore();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setErr(null);
    if (password.length < 8) return setErr('Password must be at least 8 characters.');
    if (password !== confirm) return setErr('Passwords don’t match.');
    setBusy(true);
    try {
      await resetPassword(token, password);
      onDone();
    } catch (e: any) {
      setErr(e?.message || 'Could not reset your password. The link may have expired.');
      setBusy(false);
    }
  };

  return (
    <div className="croft-scroll" style={{ position: 'absolute', inset: 0, zIndex: 100, background: '#F5F4F1', overflowY: 'auto' }}>
      <div style={{ minHeight: '100%', display: 'flex', flexDirection: 'column', padding: '72px 26px 40px' }}>
        <h1 style={{ fontFamily: grotesk, fontWeight: 700, fontSize: 27, letterSpacing: '-0.02em', margin: '0 0 6px' }}>Set a new password</h1>
        <p style={{ fontSize: 14.5, color: '#6F6C67', margin: '0 0 26px' }}>Choose a new password for your Croft account.</p>
        <div style={{ marginBottom: 14 }}>
          <div style={labelStyle}>New password</div>
          <input style={inputStyle} type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" />
        </div>
        <div style={{ marginBottom: 14 }}>
          <div style={labelStyle}>Confirm password</div>
          <input style={inputStyle} type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} placeholder="Re-enter your password" />
        </div>
        {err && <div style={{ color: '#E23A54', fontSize: 13.5, fontWeight: 600, margin: '0 2px 14px' }}>{err}</div>}
        <button style={{ ...primaryBtn, opacity: busy ? 0.7 : 1 }} disabled={busy} onClick={submit}>
          {busy ? 'Saving…' : 'Save new password'}
        </button>
        <button onClick={onCancel} style={{ border: 'none', background: 'none', color: '#9C968D', fontWeight: 700, fontSize: 14, padding: '14px 0 0', cursor: 'pointer' }}>Back to sign in</button>
      </div>
    </div>
  );
}
