import { useEffect, useRef, useState } from 'react';
import { useStore } from './store';
import Onboarding from './screens/Onboarding';
import Shell from './Shell';
import WelcomeTour from './screens/WelcomeTour';
import JoinInvite from './screens/JoinInvite';
import ResetPassword from './screens/ResetPassword';
import LegalPage from './screens/LegalPage';
import LockScreen from './screens/LockScreen';

function readLegal(): 'privacy' | 'support' | null {
  const p = window.location.pathname;
  if (p === '/privacy' || p === '/privacy/') return 'privacy';
  if (p === '/support' || p === '/support/') return 'support';
  return null;
}
function readJoinToken(): string | null {
  const m = window.location.pathname.match(/^\/join\/(.+)$/);
  if (m) return decodeURIComponent(m[1]);
  return new URLSearchParams(window.location.search).get('join');
}
function readResetToken(): string | null {
  const m = window.location.pathname.match(/^\/reset\/(.+)$/);
  return m ? decodeURIComponent(m[1]) : null;
}

export default function App() {
  const { ready, user, state, flash, appUnlocked } = useStore();
  const [entered, setEntered] = useState(false);
  const [joinToken, setJoinToken] = useState<string | null>(() => readJoinToken());
  const [resetToken, setResetToken] = useState<string | null>(() => readResetToken());
  const checked = useRef(false);

  // Returning users (valid session) skip onboarding straight into the app.
  useEffect(() => {
    if (ready && !checked.current) {
      checked.current = true;
      if (user && user.household_id) setEntered(true);
    }
  }, [ready, user]);

  // Surface Google OAuth redirect results.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const a = p.get('auth');
    if (a) {
      if (a === 'google_ok') flash('Signed in with Google ✓');
      else if (a === 'google_unconfigured') flash('Google sign-in isn’t set up yet');
      else if (a === 'google_error') flash('Google sign-in failed, try again');
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [flash]);

  // Public legal pages — reachable without a session (App Store review, Google
  // consent screen), independent of auth state.
  const legal = readLegal();
  if (legal) {
    return (
      <Frame wide>
        <LegalPage page={legal} />
      </Frame>
    );
  }

  if (!ready) {
    return (
      <Frame>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Logo />
        </div>
      </Frame>
    );
  }

  // App-lock: an authenticated user with a passcode set must unlock first.
  if (user && user.locked && !appUnlocked) {
    return (
      <Frame wide>
        <LockScreen />
      </Frame>
    );
  }

  // Password reset link → set-new-password flow.
  if (resetToken) {
    const clearUrl = () => window.history.replaceState({}, '', '/');
    return (
      <Frame>
        <ResetPassword
          token={resetToken}
          onDone={() => { clearUrl(); setResetToken(null); setEntered(true); }}
          onCancel={() => { clearUrl(); setResetToken(null); }}
        />
      </Frame>
    );
  }

  // Someone opened an invite link and isn't already in a household → join flow.
  if (joinToken && !(user && user.household_id)) {
    const clearUrl = () => window.history.replaceState({}, '', '/');
    return (
      <Frame>
        <JoinInvite
          token={joinToken}
          onJoined={() => { clearUrl(); setJoinToken(null); setEntered(true); }}
          onCancel={() => { clearUrl(); setJoinToken(null); }}
        />
      </Frame>
    );
  }

  if (!(entered && user && state)) {
    return (
      <Frame>
        <Onboarding onComplete={() => setEntered(true)} />
      </Frame>
    );
  }

  return (
    <Frame wide>
      <Shell onSignedOut={() => setEntered(false)} />
      {user && user.onboarded === false && <WelcomeTour />}
    </Frame>
  );
}

export function Frame({ children, wide }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: '100dvh',
        maxWidth: wide ? '100%' : 440,
        margin: '0 auto',
        display: 'flex',
        flexDirection: 'column',
        background: '#F3F5FB',
        color: '#101426',
        overflow: 'hidden',
      }}
    >
      {children}
    </div>
  );
}

function Logo() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <span
        style={{
          width: 34,
          height: 34,
          borderRadius: 11,
          background: '#3B5BFF',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 4px 12px rgba(59,91,255,0.32)',
        }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          <path d="M3.5 11L12 4l8.5 7v8.2a1 1 0 0 1-1 1H4.5a1 1 0 0 1-1-1z" stroke="#fff" strokeWidth="2" strokeLinejoin="round" />
          <path d="M9.5 20.5v-6h5v6" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 22, letterSpacing: '-0.01em' }}>
        Croft
      </span>
    </div>
  );
}
