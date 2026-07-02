import { useEffect, useRef, useState } from 'react';
import { useStore } from './store';
import Onboarding from './screens/Onboarding';
import Shell from './Shell';
import WelcomeTour from './screens/WelcomeTour';
import JoinInvite from './screens/JoinInvite';
import ResetPassword from './screens/ResetPassword';
import LegalPage from './screens/LegalPage';
import LockScreen from './screens/LockScreen';
import Landing from './screens/Landing';

function readLegal(): 'privacy' | 'terms' | 'support' | null {
  const p = window.location.pathname;
  if (p === '/privacy' || p === '/privacy/') return 'privacy';
  if (p === '/terms' || p === '/terms/') return 'terms';
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
  const [showAuth, setShowAuth] = useState(false);
  const [authStart, setAuthStart] = useState<'signup' | 'login'>('signup');
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
      if (a === 'google_ok') flash('Signed in with Google');
      else if (a === 'google_unconfigured') flash('Google sign-in isn’t set up yet');
      else if (a === 'google_error') flash('Google sign-in failed, try again');
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [flash]);

  // Public legal pages - reachable without a session (App Store review, Google
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
      <Frame wide>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="croft-pulse" style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
            <img src="/icons/icon-192.png" width={56} height={56} alt="" style={{ borderRadius: 16, display: 'block', boxShadow: '0 10px 28px rgba(31,153,255,0.38)' }} />
            <span style={{ fontFamily: "'Geist', sans-serif", fontWeight: 700, fontSize: 32, letterSpacing: '-0.02em' }}>Croft</span>
          </div>
        </div>
      </Frame>
    );
  }

  // Password reset link → set-new-password flow. Checked BEFORE the app-lock so a
  // locked-out user can still use their recovery link (and invite links) instead
  // of being trapped on the passcode screen.
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

  // App-lock: an authenticated user with a passcode set must unlock before
  // reaching the app shell (after reset/join deep-links are handled above).
  if (user && user.locked && !appUnlocked) {
    return (
      <Frame wide>
        <LockScreen />
      </Frame>
    );
  }

  if (!(entered && user && state)) {
    // Logged-out visitors land on the marketing page; the CTAs open sign-up/log-in.
    if (!user && !showAuth) {
      return (
        <Frame wide>
          <Landing
            onStart={() => { setAuthStart('signup'); setShowAuth(true); }}
            onLogin={() => { setAuthStart('login'); setShowAuth(true); }}
          />
        </Frame>
      );
    }
    return (
      <Frame>
        <Onboarding initialStep={authStart} onComplete={() => setEntered(true)} />
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
        background: 'radial-gradient(135% 95% at 50% -12%, #F8F7F4 0%, #F3F1EC 55%, #EEECE6 100%)',
        color: '#181922',
        overflow: 'hidden',
      }}
    >
      {children}
    </div>
  );
}

