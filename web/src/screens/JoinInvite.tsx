import { useEffect, useState } from 'react';
import { useStore } from '../store';
import { api } from '../lib/api';

const grotesk = "'Space Grotesk', sans-serif";

const inputStyle: React.CSSProperties = { width: '100%', padding: '13px 15px', borderRadius: 14, border: '1.5px solid #E4E9F2', background: '#fff', fontSize: 15, boxSizing: 'border-box', fontFamily: 'inherit', color: '#101426' };
const primaryBtn: React.CSSProperties = { width: '100%', padding: 15, borderRadius: 14, border: 'none', background: '#3B5BFF', color: '#fff', fontFamily: grotesk, fontWeight: 700, fontSize: 15.5, cursor: 'pointer', boxShadow: '0 8px 22px rgba(59,91,255,0.4)' };
const oauthBtn: React.CSSProperties = { width: '100%', padding: 14, borderRadius: 14, border: '1.5px solid #E4E9F2', background: '#fff', color: '#101426', fontWeight: 700, fontSize: 14.5, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 };
const labelStyle: React.CSSProperties = { fontSize: 12.5, fontWeight: 700, color: '#717A90', margin: '0 2px 6px' };

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48">
      <path fill="#4285F4" d="M45 24c0-1.6-.1-2.8-.4-4H24v7.5h11.9c-.2 1.9-1.5 4.9-4.4 6.9l6.7 5.2C42.9 36.2 45 30.6 45 24z" />
      <path fill="#34A853" d="M24 46c5.9 0 10.9-2 14.5-5.3l-6.7-5.2c-1.8 1.2-4.2 2.1-7.8 2.1-6 0-11-4-12.9-9.5l-7 5.4C7.9 40.9 15.3 46 24 46z" />
      <path fill="#FBBC05" d="M11.1 28.1c-.5-1.4-.8-2.9-.8-4.1s.3-2.7.7-4.1l-7-5.4C2.6 17.3 2 20.6 2 24s.6 6.7 2 9.5l7.1-5.4z" />
      <path fill="#EA4335" d="M24 10.7c3.3 0 5.6 1.4 6.9 2.6l5.9-5.8C33.1 4.1 28.9 2 24 2 15.3 2 7.9 7.1 4.3 14.5l7 5.4C13.1 14.7 18 10.7 24 10.7z" />
    </svg>
  );
}

export default function JoinInvite({ token, onJoined, onCancel }: { token: string; onJoined: () => void; onCancel: () => void }) {
  const { acceptInvite } = useStore();
  const [loading, setLoading] = useState(true);
  const [info, setInfo] = useState<{ household_name: string; inviter_name: string | null } | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    api
      .getInvite(token)
      .then((i) => alive && setInfo(i))
      .catch(() => alive && setInfo(null))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [token]);

  const join = async () => {
    setErr(null);
    if (!name.trim() || !email.trim() || password.length < 8) {
      setErr('Enter your name, email and a password (8+ characters).');
      return;
    }
    setBusy(true);
    try {
      await acceptInvite(token, { name: name.trim(), email: email.trim(), password });
      onJoined();
    } catch (e: any) {
      setErr(e?.message || 'Could not join. Please try again.');
      setBusy(false);
    }
  };

  return (
    <div className="croft-scroll" style={{ position: 'absolute', inset: 0, zIndex: 100, background: '#F3F5FB', overflowY: 'auto' }}>
      <div style={{ minHeight: '100%', display: 'flex', flexDirection: 'column', padding: '64px 26px 40px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 30 }}>
          <img src="/icons/icon-192.png" width={36} height={36} alt="" style={{ borderRadius: 10, display: 'block', boxShadow: '0 4px 12px rgba(31,153,255,0.32)' }} />
          <span style={{ fontFamily: grotesk, fontWeight: 700, fontSize: 22, letterSpacing: '-0.01em' }}>Croft</span>
        </div>

        {loading ? (
          <p style={{ textAlign: 'center', color: '#717A90', marginTop: 40 }}>Loading invite…</p>
        ) : !info ? (
          <div style={{ textAlign: 'center', marginTop: 30 }}>
            <h1 style={{ fontFamily: grotesk, fontWeight: 700, fontSize: 24, letterSpacing: '-0.02em' }}>Invite not valid</h1>
            <p style={{ fontSize: 14.5, color: '#717A90', margin: '10px 0 26px', lineHeight: 1.5 }}>
              This invite link is invalid or has expired. Ask whoever invited you to send a fresh one.
            </p>
            <button style={{ ...oauthBtn, maxWidth: 240, margin: '0 auto' }} onClick={onCancel}>Go to sign in</button>
          </div>
        ) : (
          <>
            <h1 style={{ fontFamily: grotesk, fontWeight: 700, fontSize: 27, letterSpacing: '-0.02em', margin: '0 0 6px', textAlign: 'center' }}>
              Join {info.household_name}
            </h1>
            <p style={{ fontSize: 14.5, color: '#717A90', margin: '0 0 26px', textAlign: 'center' }}>
              {info.inviter_name ? `${info.inviter_name} invited you` : 'You’ve been invited'} to share this home on Croft. Create your account to join.
            </p>
            <div style={{ marginBottom: 14 }}>
              <div style={labelStyle}>Full name</div>
              <input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
            </div>
            <div style={{ marginBottom: 14 }}>
              <div style={labelStyle}>Email</div>
              <input style={inputStyle} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@email.com" />
            </div>
            <div style={{ marginBottom: 14 }}>
              <div style={labelStyle}>Password</div>
              <input style={inputStyle} type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" />
            </div>
            {err && <div style={{ color: '#E23A54', fontSize: 13.5, fontWeight: 600, margin: '0 2px 14px' }}>{err}</div>}
            <button style={{ ...primaryBtn, opacity: busy ? 0.7 : 1 }} disabled={busy} onClick={join}>
              {busy ? 'Joining…' : `Join ${info.household_name}`}
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '18px 0' }}>
              <div style={{ flex: 1, height: 1, background: '#E4E9F2' }} />
              <span style={{ fontSize: 12.5, color: '#A6AEC0', fontWeight: 600 }}>or</span>
              <div style={{ flex: 1, height: 1, background: '#E4E9F2' }} />
            </div>
            <button onClick={() => (window.location.href = api.googleInviteUrl(token))} style={oauthBtn}>
              <GoogleMark />Continue with Google
            </button>
            <div style={{ textAlign: 'center', marginTop: 22, fontSize: 14, color: '#717A90' }}>
              Not you? <button onClick={onCancel} style={{ border: 'none', background: 'none', color: '#3B5BFF', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>Go to sign in</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
