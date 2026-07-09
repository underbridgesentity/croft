import { useState } from 'react';
import { useStore } from '../store';
import { api } from '../lib/api';
import { enablePush } from '../lib/push';
import { isNative, nativeShare } from '../lib/native';
import Art from '../components/Art';

type Step = 'welcome' | 'intro' | 'signup' | 'login' | 'forgot' | 'family' | 'notify';

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '15px 16px',
  borderRadius: 14,
  border: '1.5px solid #E8E3DB',
  background: '#fff',
  fontSize: 16, // 16px+ stops iOS Safari auto-zooming on focus
  color: '#181922',
  outline: 'none',
};
const labelStyle: React.CSSProperties = { fontSize: 12.5, fontWeight: 700, color: '#6F6C67', marginBottom: 6 };
const primaryBtn: React.CSSProperties = {
  width: '100%',
  padding: 16,
  borderRadius: 16,
  border: 'none',
  background: '#3B5BFF',
  color: '#fff',
  fontWeight: 700,
  fontSize: 15.5,
  cursor: 'pointer',
  boxShadow: '0 10px 22px rgba(59,91,255,0.34)',
};
const grotesk = "'Geist', sans-serif";

const INTRO = [
  { art: 'organize', title: 'Everything in one place', body: 'Dates, to-dos, lists, goals and bills - together, instead of scattered across chats.' },
  { art: 'remember', title: 'Never drop the ball', body: 'Gentle reminders and push notifications, so nothing slips through the cracks.' },
  { art: 'money', title: 'Money, handled together', body: "See what's paid, what's still due, and who owes who - all at a glance." },
];

export default function Onboarding({ onComplete, initialStep = 'welcome' }: { onComplete: () => void; initialStep?: Step }) {
  const { signup, login, state, user, run, flash } = useStore();
  const [step, setStep] = useState<Step>(initialStep);
  const [intro, setIntro] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  // form fields
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [householdName, setHouseholdName] = useState('');
  const [forgotSent, setForgotSent] = useState(false);

  const doForgot = async () => {
    setErr('');
    if (!email.trim()) {
      setErr('Enter your email address.');
      return;
    }
    setBusy(true);
    try {
      await api.forgotPassword(email.trim());
      setForgotSent(true);
    } catch {
      setForgotSent(true); // never reveal whether the email exists
    } finally {
      setBusy(false);
    }
  };

  const doSignup = async () => {
    setErr('');
    if (!name.trim() || !email.trim() || password.length < 8) {
      setErr('Fill in your name, email and a password (8+ characters).');
      return;
    }
    setBusy(true);
    try {
      await signup({ name, email, password });
      setHouseholdName(`${name.split(' ')[0]}'s Home`);
      setStep('family');
    } catch (e: any) {
      setErr(e?.message || 'Could not create your account');
    } finally {
      setBusy(false);
    }
  };

  const doLogin = async () => {
    setErr('');
    setBusy(true);
    try {
      await login({ email, password });
      onComplete();
    } catch (e: any) {
      setErr(e?.message || 'Could not log in');
    } finally {
      setBusy(false);
    }
  };

  const saveHome = async () => {
    if (householdName.trim()) await run(api.renameHousehold(householdName.trim()));
    setStep('notify');
  };

  // The multiplayer moment: offer the invite link right here, at peak
  // motivation, instead of hoping they find it later on the Family tab.
  const [inviteBusy, setInviteBusy] = useState(false);
  const shareInvite = async () => {
    if (inviteBusy) return;
    setInviteBusy(true);
    try {
      const { token } = await api.createInvite();
      const url = `${window.location.origin}/join/${token}`;
      const shared = await nativeShare({ title: 'Join our home on Croft', text: `Join ${householdName || 'our home'} on Croft`, url });
      if (!shared) {
        await navigator.clipboard?.writeText(url);
        flash('Invite link copied - send it to your family');
      }
    } catch {
      flash('Could not create the invite - you can invite from the Family tab');
    } finally {
      setInviteBusy(false);
    }
  };

  const enableNotifs = async () => {
    try {
      const ok = await enablePush();
      if (ok) {
        await run(api.setSetting('push', true));
        flash('Notifications turned on');
      } else {
        flash('You can turn on notifications later in Family');
      }
    } catch {
      flash('You can turn on notifications later in Family');
    }
    onComplete();
  };

  // ---------- WELCOME ----------
  if (step === 'welcome') {
    return (
      <Scroll>
        <div style={{ minHeight: '100%', display: 'flex', flexDirection: 'column', padding: '60px 26px 36px', textAlign: 'center' }}>
          <Wordmark />
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px 0' }}>
            <img src="/illustrations/family-home.jpg" alt="A family relaxing at home" style={{ width: '100%', maxWidth: 372, height: 'auto', mixBlendMode: 'multiply' }} />
          </div>
          <h1 style={{ fontFamily: grotesk, fontWeight: 700, fontSize: 29, lineHeight: 1.12, letterSpacing: '-0.02em', margin: '0 0 12px' }}>
            One calm home for<br />your whole family.
          </h1>
          <p style={{ fontSize: 15, lineHeight: 1.5, color: '#6F6C67', margin: '0 8px 28px' }}>
            Dates, reminders, lists, goals and money - all in one warm place, off your group chats.
          </p>
          <button style={primaryBtn} onClick={() => setStep('intro')}>Get started</button>
          <button onClick={() => setStep('login')} style={ghostBtn}>I already have an account</button>
        </div>
      </Scroll>
    );
  }

  // ---------- INTRO CAROUSEL ----------
  if (step === 'intro') {
    const slide = INTRO[intro];
    const next = () => (intro >= 2 ? setStep('signup') : setIntro(intro + 1));
    return (
      <Scroll>
        <div style={{ minHeight: '100%', display: 'flex', flexDirection: 'column', padding: '24px 26px 36px' }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button onClick={() => setStep('signup')} style={{ border: 'none', background: 'none', color: '#6F6C67', fontWeight: 700, fontSize: 14, cursor: 'pointer', padding: 8 }}>Skip</button>
          </div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
            <div style={{ marginBottom: 36 }}><Art name={slide.art} width={248} /></div>
            <h1 style={{ fontFamily: grotesk, fontWeight: 700, fontSize: 26, letterSpacing: '-0.02em', margin: '0 0 12px' }}>{slide.title}</h1>
            <p style={{ fontSize: 15, lineHeight: 1.55, color: '#6F6C67', margin: '0 6px', maxWidth: 320 }}>{slide.body}</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, marginBottom: 22 }}>
            {[0, 1, 2].map((i) => (
              <div key={i} style={{ height: 7, width: intro === i ? 22 : 7, borderRadius: 100, background: intro === i ? '#3B5BFF' : '#D8D2C8', transition: 'all .2s' }} />
            ))}
          </div>
          <button style={primaryBtn} onClick={next}>{intro >= 2 ? 'Create my account' : 'Next'}</button>
        </div>
      </Scroll>
    );
  }

  // ---------- SIGN UP ----------
  if (step === 'signup') {
    return (
      <Scroll>
        <div style={{ minHeight: '100%', display: 'flex', flexDirection: 'column', padding: '56px 26px 36px' }}>
          <BackBtn onClick={() => setStep('welcome')} />
          <h1 style={titleStyle}>Create your account</h1>
          <p style={subStyle}>Start running your home in one place.</p>
          <Field label="Full name"><input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} placeholder="Sipho Mokoena" /></Field>
          <Field label="Email"><input style={inputStyle} type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@email.com" /></Field>
          <Field label="Password">
            <div style={{ position: 'relative' }}>
              <input style={{ ...inputStyle, paddingRight: 46 }} type={showPw ? 'text' : 'password'} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" />
              <EyeBtn shown={showPw} onClick={() => setShowPw((v) => !v)} />
            </div>
          </Field>
          {err && <ErrLine msg={err} />}
          <button style={{ ...primaryBtn, marginTop: 10, marginBottom: 12, opacity: busy ? 0.7 : 1 }} disabled={busy} onClick={doSignup}>
            {busy ? 'Creating…' : 'Create account'}
          </button>
          <div style={{ fontSize: 12, color: '#7D776E', textAlign: 'center', marginBottom: 16, lineHeight: 1.5 }}>
            By creating an account, you agree to our <a href="/terms" style={{ color: '#6F6C67', fontWeight: 700 }}>Terms</a> and <a href="/privacy" style={{ color: '#6F6C67', fontWeight: 700 }}>Privacy Policy</a>.
          </div>
          {/* Third-party login is hidden in the native app: it would redirect out
              to the system browser (App Review 4.0/4.8). Web keeps Google. */}
          {!isNative() && (
            <>
              <Divider />
              <button onClick={() => (window.location.href = api.googleUrl())} style={oauthBtn}>
                <GoogleMark />Continue with Google
              </button>
            </>
          )}
          <div style={{ textAlign: 'center', marginTop: 'auto', paddingTop: 22, fontSize: 14, color: '#6F6C67' }}>
            Already have an account? <Link onClick={() => setStep('login')}>Log in</Link>
          </div>
        </div>
      </Scroll>
    );
  }

  // ---------- FORGOT PASSWORD ----------
  if (step === 'forgot') {
    return (
      <Scroll>
        <div style={{ minHeight: '100%', display: 'flex', flexDirection: 'column', padding: '56px 26px 36px' }}>
          <BackBtn onClick={() => { setForgotSent(false); setStep('login'); }} />
          {forgotSent ? (
            <>
              <h1 style={titleStyle}>Check your email</h1>
              <p style={subStyle}>
                If an account exists for <strong>{email}</strong>, we’ve sent a link to reset your password. It expires in 1 hour.
              </p>
              <button style={{ ...primaryBtn, marginTop: 8 }} onClick={() => { setForgotSent(false); setStep('login'); }}>Back to log in</button>
            </>
          ) : (
            <>
              <h1 style={titleStyle}>Reset your password</h1>
              <p style={subStyle}>Enter your email and we’ll send you a link to set a new password.</p>
              <Field label="Email"><input style={inputStyle} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@email.com" /></Field>
              {err && <ErrLine msg={err} />}
              <button style={{ ...primaryBtn, marginTop: 12, opacity: busy ? 0.7 : 1 }} disabled={busy} onClick={doForgot}>
                {busy ? 'Sending…' : 'Send reset link'}
              </button>
            </>
          )}
        </div>
      </Scroll>
    );
  }

  // ---------- LOG IN ----------
  if (step === 'login') {
    return (
      <Scroll>
        <div style={{ minHeight: '100%', display: 'flex', flexDirection: 'column', padding: '56px 26px 36px' }}>
          <BackBtn onClick={() => setStep('welcome')} />
          <h1 style={titleStyle}>Welcome back</h1>
          <p style={subStyle}>Log in to your Croft home.</p>
          <Field label="Email"><input style={inputStyle} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@email.com" /></Field>
          <Field label="Password"><input style={inputStyle} type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Your password" /></Field>
          <div style={{ textAlign: 'right', marginTop: -6, marginBottom: 4 }}>
            <button onClick={() => { setErr(''); setForgotSent(false); setStep('forgot'); }} style={{ border: 'none', background: 'none', color: '#3B5BFF', fontWeight: 700, fontSize: 13, cursor: 'pointer', padding: 4 }}>Forgot password?</button>
          </div>
          {err && <ErrLine msg={err} />}
          <button style={{ ...primaryBtn, marginTop: 12, opacity: busy ? 0.7 : 1 }} disabled={busy} onClick={doLogin}>
            {busy ? 'Logging in…' : 'Log in'}
          </button>
          {!isNative() && (
            <>
              <Divider />
              <button onClick={() => (window.location.href = api.googleUrl())} style={oauthBtn}><GoogleMark />Continue with Google</button>
            </>
          )}
          {/* Google sign-in isn't offered in the app, so give Google users a way
              in: set a password once, then sign in by email. */}
          {isNative() && (
            <div style={{ textAlign: 'center', marginTop: 16, fontSize: 12.5, color: '#7D776E', lineHeight: 1.5 }}>
              Signed up with Google? <Link onClick={() => { setErr(''); setForgotSent(false); setStep('forgot'); }}>Set a password</Link> to sign in here.
            </div>
          )}
          <div style={{ textAlign: 'center', marginTop: 'auto', paddingTop: 22, fontSize: 14, color: '#6F6C67' }}>
            New here? <Link onClick={() => setStep('signup')}>Create account</Link>
          </div>
        </div>
      </Scroll>
    );
  }

  // ---------- SET UP HOME ----------
  if (step === 'family') {
    const members = state?.members || [];
    return (
      <Scroll>
        <div style={{ minHeight: '100%', display: 'flex', flexDirection: 'column', padding: '56px 26px 36px' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}><Art name="family" width={200} /></div>
          <h1 style={{ ...titleStyle, textAlign: 'center', fontSize: 27 }}>Set up your home</h1>
          <p style={{ ...subStyle, textAlign: 'center' }}>Give your household a name and review the family.</p>
          <Field label="Household name"><input style={inputStyle} value={householdName} onChange={(e) => setHouseholdName(e.target.value)} placeholder="Mokoena Home" /></Field>
          <div style={{ ...labelStyle, marginTop: 8, marginBottom: 10 }}>Members</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 }}>
            {members.map((m) => (
              <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#fff', padding: '11px 14px', borderRadius: 16, boxShadow: '0 1px 2px rgba(24,25,34,0.05), 0 8px 20px -12px rgba(24,25,34,0.12)' }}>
                <Avatar color={m.color} initial={m.initial} size={38} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 14.5 }}>{m.name}</div>
                  <div style={{ fontSize: 12, color: '#6F6C67' }}>{m.role}</div>
                </div>
                {m.you && <YouBadge />}
              </div>
            ))}
          </div>
          <button onClick={shareInvite} disabled={inviteBusy} style={{ width: '100%', border: '1.5px dashed #B9C6FF', background: 'rgba(59,91,255,0.06)', color: '#3B5BFF', fontWeight: 700, fontSize: 14, padding: 14, borderRadius: 14, cursor: 'pointer', marginBottom: 12, opacity: inviteBusy ? 0.6 : 1 }}>
            {inviteBusy ? 'Creating link…' : '+ Invite your family (share a link)'}
          </button>
          <div style={{ fontSize: 11.5, color: '#7D776E', textAlign: 'center', margin: '0 2px 14px' }}>Croft works best together - everyone gets their own login to the same home. You can also invite later from the Family tab.</div>
          <button style={primaryBtn} onClick={saveHome}>Continue</button>
        </div>
      </Scroll>
    );
  }

  // ---------- NOTIFICATIONS ----------
  return (
    <Scroll>
      <div style={{ minHeight: '100%', display: 'flex', flexDirection: 'column', padding: '56px 26px 36px', textAlign: 'center' }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ marginBottom: 28, width: '100%', display: 'flex', justifyContent: 'center' }}>
            <img src="/illustrations/in-sync.jpg" alt="Family staying in sync" style={{ width: '100%', maxWidth: 340, height: 'auto', mixBlendMode: 'multiply' }} />
          </div>
          <h1 style={{ fontFamily: grotesk, fontWeight: 700, fontSize: 27, letterSpacing: '-0.02em', margin: '0 0 12px' }}>Stay in the loop</h1>
          <p style={{ fontSize: 15, lineHeight: 1.55, color: '#6F6C67', margin: '0 8px', maxWidth: 320 }}>
            Turn on push notifications so reminders, dates and nudges reach you and the family the moment they happen.
          </p>
        </div>
        <button style={primaryBtn} onClick={enableNotifs}>Turn on notifications</button>
        <button onClick={onComplete} style={{ ...ghostBtn, color: '#6F6C67' }}>Maybe later</button>
      </div>
    </Scroll>
  );
}

// ---------- small pieces ----------
const titleStyle: React.CSSProperties = { fontFamily: grotesk, fontWeight: 700, fontSize: 28, letterSpacing: '-0.02em', margin: '0 0 6px' };
const subStyle: React.CSSProperties = { fontSize: 14.5, color: '#6F6C67', margin: '0 0 24px' };
const ghostBtn: React.CSSProperties = { width: '100%', padding: 15, marginTop: 8, border: 'none', background: 'none', color: '#3B5BFF', fontWeight: 700, fontSize: 14.5, cursor: 'pointer' };
const oauthBtn: React.CSSProperties = { width: '100%', padding: 14, borderRadius: 14, border: '1.5px solid #E8E3DB', background: '#fff', color: '#181922', fontWeight: 700, fontSize: 14.5, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 };

function Scroll({ children }: { children: React.ReactNode }) {
  return (
    <div className="croft-scroll" style={{ position: 'absolute', inset: 0, zIndex: 100, background: '#F5F4F1', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
      {children}
    </div>
  );
}
function Wordmark() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
      <img src="/icons/icon-192.png" width={36} height={36} alt="" style={{ borderRadius: 10, display: 'block', boxShadow: '0 4px 12px rgba(31,153,255,0.32)' }} />
      <span style={{ fontFamily: grotesk, fontWeight: 700, fontSize: 22, letterSpacing: '-0.01em' }}>Croft</span>
    </div>
  );
}
function BackBtn({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} style={{ width: 42, height: 42, borderRadius: 13, border: 'none', background: '#fff', boxShadow: '0 1px 2px rgba(24,25,34,0.05), 0 8px 20px -12px rgba(24,25,34,0.12)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M15 5l-7 7 7 7" stroke="#181922" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
    </button>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={labelStyle}>{label}</div>
      {children}
    </div>
  );
}
export function EyeBtn({ shown, onClick }: { shown: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-label={shown ? 'Hide password' : 'Show password'} style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'none', cursor: 'pointer', padding: 9, color: '#7D776E', display: 'flex' }}>
      {shown ? (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 5.1A9.6 9.6 0 0 1 12 5c6 0 9 7 9 7a13.5 13.5 0 0 1-2.2 3.2M6.1 6.1A13.3 13.3 0 0 0 3 12s3 7 9 7a9.3 9.3 0 0 0 3.9-.8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
      ) : (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" /><circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.7" /></svg>
      )}
    </button>
  );
}
function Divider() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '8px 0 16px' }}>
      <div style={{ flex: 1, height: 1, background: '#E8E3DB' }} />
      <span style={{ fontSize: 12, color: '#7D776E', fontWeight: 600 }}>or</span>
      <div style={{ flex: 1, height: 1, background: '#E8E3DB' }} />
    </div>
  );
}
function Link({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return <button onClick={onClick} style={{ border: 'none', background: 'none', color: '#3B5BFF', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>{children}</button>;
}
function ErrLine({ msg }: { msg: string }) {
  return <div style={{ background: 'rgba(255,77,94,0.1)', color: '#D11F36', fontSize: 13, fontWeight: 600, padding: '10px 14px', borderRadius: 12, marginTop: 4 }}>{msg}</div>;
}
function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24"><path d="M21.6 12.2c0-.6-.1-1.3-.2-1.9H12v3.6h5.4c-.2 1.2-.9 2.3-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.2z" fill="#4285F4" /><path d="M12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.5c-.9.6-2 .9-3.4.9-2.6 0-4.8-1.8-5.6-4.1H3.1v2.6C4.7 19.7 8.1 22 12 22z" fill="#34A853" /><path d="M6.4 13.9c-.4-1.2-.4-2.5 0-3.7V7.6H3.1c-1.4 2.7-1.4 5.9 0 8.6l3.3-2.3z" fill="#FBBC05" /><path d="M12 6.1c1.5 0 2.8.5 3.8 1.5l2.8-2.8C16.9 3.2 14.7 2.3 12 2.3 8.1 2.3 4.7 4.6 3.1 7.6l3.3 2.6c.8-2.3 3-4.1 5.6-4.1z" fill="#EA4335" /></svg>
  );
}
export function Avatar({ color, initial, size = 38 }: { color: string; initial: string; size?: number }) {
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: color, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: grotesk, fontWeight: 700, fontSize: size * 0.4, flexShrink: 0 }}>
      {initial}
    </div>
  );
}
export function YouBadge() {
  return <span style={{ fontSize: 10.5, fontWeight: 700, color: '#3B5BFF', background: 'rgba(59,91,255,0.1)', padding: '3px 10px', borderRadius: 100 }}>You</span>;
}
