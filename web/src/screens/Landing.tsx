import { useEffect, useState } from 'react';
import { useIsDesktop } from '../lib/useMedia';
import { APP_STORE_URL, PLAY_STORE_URL, PLAY_STORE_LIVE, showInstallUI, preferredStoreUrl, isIOSSafari, isNativeAppInstalled } from '../lib/appLinks';

const grotesk = "'Geist', sans-serif";
const INK = '#181922';
const BLUE = '#3B5BFF';
const MUTED = '#655F57';

const STRIP_KEY = 'croft-app-strip-dismissed';

// Slim app-install strip, mobile browser only. Scrolls away with the page
// (like Apple's own banner) and stays dismissed via localStorage. showInstallUI()
// guarantees it never renders inside the iOS app, the Android TWA or an
// installed PWA - those all load this same page.
function AppStrip() {
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(STRIP_KEY) === '1');
  // Android Chrome can report our TWA as installed - hide the strip for those
  // users. iOS has no such API; there Safari's own banner handles Get/Open.
  const [installed, setInstalled] = useState(false);
  useEffect(() => {
    isNativeAppInstalled().then(setInstalled).catch(() => {});
  }, []);
  if (dismissed || installed || !showInstallUI() || isIOSSafari()) return null;
  const url = preferredStoreUrl();
  if (!url) return null;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px 9px 6px', background: '#F1EFEA', borderBottom: '1px solid #E8E3DB' }}>
      <button
        onClick={() => { localStorage.setItem(STRIP_KEY, '1'); setDismissed(true); }}
        aria-label="Dismiss"
        style={{ flexShrink: 0, border: 'none', background: 'none', cursor: 'pointer', padding: '6px 8px', color: '#9B958B', fontSize: 14, lineHeight: 1 }}
      >
        ✕
      </button>
      <img src="/icons/icon-192.png" width={30} height={30} alt="" style={{ borderRadius: 8.5, display: 'block' }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: grotesk, fontWeight: 700, fontSize: 13.5, color: INK, lineHeight: 1.2 }}>Croft - Family Hub</div>
        <div style={{ fontSize: 11.5, color: MUTED }}>Free on your phone</div>
      </div>
      <a href={url} style={{ flexShrink: 0, background: BLUE, color: '#fff', fontFamily: grotesk, fontWeight: 700, fontSize: 13, padding: '8px 18px', borderRadius: 100, textDecoration: 'none' }}>Get</a>
    </div>
  );
}

// Footer store badges (self-drawn, on-brand). The Play badge stays dark until
// the listing is approved; both disappear entirely inside the apps.
function StoreBadges() {
  if (!showInstallUI()) return null;
  const badge: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 9, background: INK, color: '#fff', borderRadius: 12, padding: '8px 16px 8px 13px', textDecoration: 'none' };
  const lines = (top: string, bottom: string) => (
    <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.18, textAlign: 'left' }}>
      <span style={{ fontSize: 9.5, opacity: 0.72, fontWeight: 500, letterSpacing: '0.02em' }}>{top}</span>
      <span style={{ fontFamily: grotesk, fontSize: 14.5, fontWeight: 700 }}>{bottom}</span>
    </span>
  );
  return (
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
      <a href={APP_STORE_URL} style={badge} aria-label="Download on the App Store">
        <svg width="19" height="22" viewBox="0 0 384 512" fill="#fff" aria-hidden="true">
          <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z" />
        </svg>
        {lines('Download on the', 'App Store')}
      </a>
      {PLAY_STORE_LIVE && (
        <a href={PLAY_STORE_URL} style={badge} aria-label="Get it on Google Play">
          <svg width="19" height="21" viewBox="0 0 24 24" fill="#fff" aria-hidden="true">
            <path d="M4 2.6a1.6 1.6 0 0 0-.6 1.25v16.3c0 .5.23.96.6 1.25l9.1-9.4L4 2.6zm10.5 8L6.2 2.05l10.2 5.86-1.9 2.69zm1.9 2.06l2.9 1.67c1.1.63 1.1 1.71 0 2.34l-2.9 1.67-2.15-2.84 2.15-2.84zM6.2 21.95l8.3-8.55 1.9 2.69-10.2 5.86z" />
          </svg>
          {lines('Get it on', 'Google Play')}
        </a>
      )}
    </div>
  );
}

function Logo({ size = 34 }: { size?: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <img src="/icons/icon-192.png" width={size} height={size} alt="" style={{ borderRadius: size * 0.28, display: 'block', boxShadow: '0 4px 12px rgba(31,153,255,0.28)' }} />
      <span style={{ fontFamily: grotesk, fontWeight: 700, fontSize: size * 0.62, letterSpacing: '-0.01em' }}>Croft</span>
    </div>
  );
}

function Illus({ src, alt }: { src: string; alt: string }) {
  return <img src={src} alt={alt} loading="lazy" style={{ width: '100%', height: 'auto', display: 'block', mixBlendMode: 'multiply' }} />;
}

export default function Landing({ onStart, onLogin }: { onStart: () => void; onLogin: () => void }) {
  const desktop = useIsDesktop();
  const pad = desktop ? '0 40px' : '0 22px';
  const maxW = 1080;

  const primaryBtn: React.CSSProperties = { border: 'none', background: BLUE, color: '#fff', fontFamily: grotesk, fontWeight: 700, fontSize: 15.5, padding: '13px 24px', borderRadius: 14, cursor: 'pointer', boxShadow: '0 8px 22px rgba(59,91,255,0.34)' };
  const ghostBtn: React.CSSProperties = { border: '1.5px solid #E8E3DB', background: '#fff', color: INK, fontFamily: grotesk, fontWeight: 700, fontSize: 15.5, padding: '12px 22px', borderRadius: 14, cursor: 'pointer' };

  const feature = (title: string, body: string, bullets: string[], img: string, flip: boolean) => (
    <div style={{ display: 'flex', flexDirection: desktop ? 'row' : 'column', alignItems: 'center', gap: desktop ? 56 : 24, margin: desktop ? '68px 0' : '44px 0' }}>
      <div style={{ flex: 1, order: desktop && flip ? 2 : 1 }}>
        <h2 style={{ fontFamily: grotesk, fontWeight: 700, fontSize: desktop ? 32 : 26, letterSpacing: '-0.02em', margin: '0 0 12px', lineHeight: 1.15 }}>{title}</h2>
        <p style={{ fontSize: 16.5, lineHeight: 1.6, color: MUTED, margin: '0 0 18px' }}>{body}</p>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {bullets.map((b) => (
            <li key={b} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 15, color: INK, fontWeight: 500 }}>
              <span style={{ flexShrink: 0, marginTop: 2, width: 20, height: 20, borderRadius: '50%', background: 'rgba(59,91,255,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M5 12.5l4.5 4.5L19 7" stroke={BLUE} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </span>
              {b}
            </li>
          ))}
        </ul>
      </div>
      <div style={{ flex: 1, order: desktop && flip ? 1 : 2, width: '100%' }}>
        <Illus src={img} alt={title} />
      </div>
    </div>
  );

  const smallFeatures = [
    { t: 'Real reminders', d: 'Push + email nudges so nothing slips - on the day it matters.' },
    { t: 'Shared calendar', d: 'Subscribe once; Croft events show in Apple or Google Calendar.' },
    { t: 'Invite your family', d: 'Everyone gets their own login and the same live home.' },
    { t: 'Money, together', d: 'Bills, budgets and who-owes-who - no awkward maths.' },
    { t: 'Passcode lock', d: 'Keep your home private on shared devices.' },
    { t: 'Works everywhere', d: 'Get the app or use any browser - phone, tablet or desktop, always in sync.' },
  ];

  const faqs = [
    { q: 'Is Croft free?', a: 'Yes. You can create your home, invite your family and use every feature for free.' },
    { q: 'Is there an app?', a: `Yes - Croft has an app for ${PLAY_STORE_LIVE ? 'iPhone and Android' : 'iPhone (Android is on the way)'}, and it also runs beautifully in any browser. Whichever you use, your home stays in sync.` },
    { q: 'Can the whole family use it?', a: 'Yes. Invite people by email or a link, and each person gets their own login and the same live home.' },
    { q: 'Will I actually get reminders?', a: 'Croft sends push notifications and a friendly daily email summary, and you can subscribe your events to Apple or Google Calendar.' },
    { q: 'Is my data private?', a: 'Your household content is private to your household. We never sell your data or use it for advertising, and you can delete your account and data at any time.' },
    { q: 'What devices does it work on?', a: 'Any modern phone, tablet or computer, staying in sync across all of them.' },
  ];

  return (
    <div className="croft-scroll" style={{ position: 'absolute', inset: 0, overflowY: 'auto', background: '#fff', color: INK }}>
      {!desktop && <AppStrip />}
      {/* NAV */}
      {/* In the iOS app the webview draws under the status bar - pad the sticky
          bar by the safe-area inset so the logo/buttons sit below the clock. */}
      <div style={{ position: 'sticky', top: 0, zIndex: 20, paddingTop: 'env(safe-area-inset-top)', background: 'rgba(255,255,255,0.9)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', borderBottom: '1px solid #EBE7DF' }}>
        <div style={{ maxWidth: maxW, margin: '0 auto', padding: pad, height: 66, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Logo size={30} />
          <div style={{ display: 'flex', alignItems: 'center', gap: desktop ? 10 : 8 }}>
            <button onClick={onLogin} style={{ ...ghostBtn, padding: desktop ? '10px 18px' : '9px 14px', fontSize: 14.5 }}>Log in</button>
            <button onClick={onStart} style={{ ...primaryBtn, padding: desktop ? '11px 20px' : '10px 16px', fontSize: 14.5 }}>Get started</button>
          </div>
        </div>
      </div>

      {/* HERO */}
      <div style={{ background: 'linear-gradient(180deg,#F1EFEA 0%,#fff 100%)' }}>
        <div style={{ maxWidth: maxW, margin: '0 auto', padding: pad }}>
          <div style={{ display: 'flex', flexDirection: desktop ? 'row' : 'column', alignItems: 'center', gap: desktop ? 40 : 8, paddingTop: desktop ? 56 : 32, paddingBottom: desktop ? 40 : 8 }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(59,91,255,0.09)', color: BLUE, fontWeight: 700, fontSize: 13, padding: '7px 14px', borderRadius: 100, marginBottom: 18 }}>
                For your whole family
              </div>
              <h1 style={{ fontFamily: grotesk, fontWeight: 700, fontSize: desktop ? 52 : 36, lineHeight: 1.06, letterSpacing: '-0.03em', margin: '0 0 18px' }}>
                One calm home for<br />your whole family.
              </h1>
              <p style={{ fontSize: desktop ? 19 : 16.5, lineHeight: 1.55, color: MUTED, margin: '0 0 26px', maxWidth: 460 }}>
                Shared dates, reminders, lists, goals and money - all in one place, off your group chats. Plan together, stay organized, live better.
              </p>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <button onClick={onStart} style={primaryBtn}>Get started</button>
                <a href="#features" style={{ ...ghostBtn, textDecoration: 'none', display: 'inline-block' }}>See how it works</a>
              </div>
              <div style={{ marginTop: 18, fontSize: 13.5, color: '#7D776E', fontWeight: 500 }}>No credit card · Works on any device</div>
            </div>
            <div style={{ flex: 1, width: '100%' }}>
              <Illus src="/illustrations/hero-home.jpg" alt="A family and their home" />
            </div>
          </div>
        </div>
      </div>

      {/* TAGLINE STRIP */}
      <div style={{ background: BLUE, color: '#fff' }}>
        <div style={{ maxWidth: maxW, margin: '0 auto', padding: `${desktop ? 22 : 18}px ${desktop ? 40 : 22}px`, textAlign: 'center', fontFamily: grotesk, fontWeight: 700, fontSize: desktop ? 18 : 15, letterSpacing: '0.01em' }}>
          Plan together. &nbsp;·&nbsp; Stay organized. &nbsp;·&nbsp; Live better.
        </div>
      </div>

      {/* FEATURES */}
      <div id="features" style={{ maxWidth: maxW, margin: '0 auto', padding: pad }}>
        <div style={{ textAlign: 'center', paddingTop: desktop ? 64 : 44 }}>
          <h2 style={{ fontFamily: grotesk, fontWeight: 700, fontSize: desktop ? 36 : 28, letterSpacing: '-0.02em', margin: '0 0 10px' }}>Everything a household runs on</h2>
          <p style={{ fontSize: 16.5, color: MUTED, maxWidth: 520, margin: '0 auto', lineHeight: 1.55 }}>Croft brings the moving parts of family life into one shared, always-in-sync home.</p>
        </div>

        {feature(
          'Your family, on the same page',
          'A shared calendar and to-dos everyone can see and edit - so appointments, school runs and chores never live in one person’s head.',
          ['Shared events, reminders & important dates', 'To-dos, shopping lists & family goals', 'Nudge each other with a tap'],
          '/illustrations/app-in-hand.jpg', false
        )}
        {feature(
          'Never drop the ball',
          'Real reminders reach you and the family the moment they matter - as a push notification and a friendly morning email digest.',
          ['Push notifications on any device', 'Daily summary of what’s due', 'Subscribe your calendar app'],
          '/illustrations/chores.jpg', true
        )}
        {feature(
          'Money, handled together',
          'See what’s paid, what’s still due, and who owes who - at a glance, without the awkward maths.',
          ['Bills with real due dates & overdue alerts', 'Budgets and savings goals', 'Settle up who-owes-who'],
          '/illustrations/work.jpg', false
        )}
      </div>

      {/* HOW IT WORKS */}
      <div style={{ background: '#F1EFEA' }}>
        <div style={{ maxWidth: maxW, margin: '0 auto', padding: `${desktop ? 60 : 44}px ${desktop ? 40 : 22}px` }}>
          <h2 style={{ fontFamily: grotesk, fontWeight: 700, fontSize: desktop ? 32 : 26, letterSpacing: '-0.02em', textAlign: 'center', margin: '0 0 34px' }}>Up and running in minutes</h2>
          <div style={{ display: 'grid', gridTemplateColumns: desktop ? 'repeat(3,1fr)' : '1fr', gap: 18 }}>
            {[
              { n: '1', t: 'Create your home', d: 'Sign up and your household is ready in seconds.' },
              { n: '2', t: 'Invite your family', d: 'Send a link or email - everyone gets their own login.' },
              { n: '3', t: 'Stay in sync', d: 'Add dates, tasks and bills - updates reach everyone live.' },
            ].map((s) => (
              <div key={s.n} style={{ background: '#fff', borderRadius: 20, padding: 24, boxShadow: '0 1px 2px rgba(24,25,34,0.04), 0 14px 34px -18px rgba(24,25,34,0.16)' }}>
                <div style={{ width: 40, height: 40, borderRadius: 12, background: BLUE, color: '#fff', fontFamily: grotesk, fontWeight: 700, fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>{s.n}</div>
                <div style={{ fontFamily: grotesk, fontWeight: 700, fontSize: 18, marginBottom: 6 }}>{s.t}</div>
                <div style={{ fontSize: 14.5, color: MUTED, lineHeight: 1.55 }}>{s.d}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* SMALL FEATURE GRID */}
      <div style={{ maxWidth: maxW, margin: '0 auto', padding: `${desktop ? 62 : 44}px ${desktop ? 40 : 22}px` }}>
        <div style={{ display: 'grid', gridTemplateColumns: desktop ? 'repeat(3,1fr)' : '1fr', gap: 16 }}>
          {smallFeatures.map((f) => (
            <div key={f.t} style={{ border: '1px solid #EBE7DF', borderRadius: 18, padding: 22 }}>
              <div style={{ fontFamily: grotesk, fontWeight: 700, fontSize: 17, marginBottom: 6 }}>{f.t}</div>
              <div style={{ fontSize: 14.5, color: MUTED, lineHeight: 1.55 }}>{f.d}</div>
            </div>
          ))}
        </div>
      </div>

      {/* FAMILY */}
      <div style={{ background: '#F1EFEA' }}>
        <div style={{ maxWidth: maxW, margin: '0 auto', padding: `${desktop ? 62 : 44}px ${desktop ? 40 : 22}px`, display: 'flex', flexDirection: desktop ? 'row' : 'column', alignItems: 'center', gap: desktop ? 48 : 24 }}>
          <div style={{ flex: 1, width: '100%', borderRadius: 24, overflow: 'hidden', boxShadow: '0 12px 34px rgba(16,20,38,0.10)' }}>
            <img src="/illustrations/family-together.jpg" alt="A family together at home" loading="lazy" style={{ width: '100%', height: 'auto', display: 'block' }} />
          </div>
          <div style={{ flex: 1 }}>
            <h2 style={{ fontFamily: grotesk, fontWeight: 700, fontSize: desktop ? 32 : 26, letterSpacing: '-0.02em', margin: '0 0 12px', lineHeight: 1.15 }}>Made for the whole family</h2>
            <p style={{ fontSize: 16.5, lineHeight: 1.6, color: MUTED, margin: '0 0 12px' }}>Croft is built for real homes: partners, parents, kids and everyone in between. Invite the people you live with and give each of them their own way in.</p>
            <p style={{ fontSize: 16.5, lineHeight: 1.6, color: MUTED, margin: 0 }}>No more “did you see my message?” Just one calm, shared home that keeps everyone on the same page.</p>
          </div>
        </div>
      </div>

      {/* FAQ */}
      <div style={{ maxWidth: 760, margin: '0 auto', padding: `${desktop ? 64 : 46}px ${desktop ? 40 : 22}px` }}>
        <h2 style={{ fontFamily: grotesk, fontWeight: 700, fontSize: desktop ? 32 : 26, letterSpacing: '-0.02em', textAlign: 'center', margin: '0 0 30px' }}>Questions, answered</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {faqs.map((f) => (
            <div key={f.q} style={{ background: '#fff', border: '1px solid #EBE7DF', borderRadius: 16, padding: '18px 20px' }}>
              <div style={{ fontFamily: grotesk, fontWeight: 700, fontSize: 16.5, marginBottom: 6 }}>{f.q}</div>
              <div style={{ fontSize: 15, color: MUTED, lineHeight: 1.6 }}>{f.a}</div>
            </div>
          ))}
        </div>
      </div>

      {/* FINAL CTA */}
      <div style={{ maxWidth: maxW, margin: '0 auto', padding: `0 ${desktop ? 40 : 22}px ${desktop ? 72 : 48}px` }}>
        <div style={{ background: 'linear-gradient(135deg,#3B5BFF 0%,#1F99FF 100%)', borderRadius: 28, padding: desktop ? '56px 48px' : '40px 26px', textAlign: 'center', color: '#fff', boxShadow: '0 20px 50px rgba(59,91,255,0.35)' }}>
          <h2 style={{ fontFamily: grotesk, fontWeight: 700, fontSize: desktop ? 38 : 28, letterSpacing: '-0.02em', margin: '0 0 12px', lineHeight: 1.1 }}>Bring your whole home together</h2>
          <p style={{ fontSize: 17, opacity: 0.92, margin: '0 auto 26px', maxWidth: 440, lineHeight: 1.55 }}>Join the families running a calmer, more organized home with Croft.</p>
          <button onClick={onStart} style={{ border: 'none', background: '#fff', color: BLUE, fontFamily: grotesk, fontWeight: 700, fontSize: 16.5, padding: '15px 32px', borderRadius: 14, cursor: 'pointer', boxShadow: '0 10px 26px rgba(0,0,0,0.18)' }}>Get started</button>
        </div>
      </div>

      {/* FOOTER */}
      <div style={{ borderTop: '1px solid #EBE7DF' }}>
        <div style={{ maxWidth: maxW, margin: '0 auto', padding: `${desktop ? 34 : 26}px ${desktop ? 40 : 22}px`, display: 'flex', flexDirection: desktop ? 'row' : 'column', alignItems: desktop ? 'center' : 'flex-start', justifyContent: 'space-between', gap: 16 }}>
          <div>
            <Logo size={26} />
            <div style={{ fontSize: 13, color: '#7D776E', marginTop: 8 }}>Plan together. Stay organized. Live better.</div>
            <div style={{ marginTop: 14 }}>
              <StoreBadges />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 22, fontSize: 14, fontWeight: 600 }}>
            <a href="/privacy" style={{ color: MUTED, textDecoration: 'none' }}>Privacy</a>
            <a href="/terms" style={{ color: MUTED, textDecoration: 'none' }}>Terms</a>
            <a href="/support" style={{ color: MUTED, textDecoration: 'none' }}>Support</a>
            <button onClick={onLogin} style={{ border: 'none', background: 'none', color: MUTED, fontWeight: 600, fontSize: 14, cursor: 'pointer', padding: 0 }}>Log in</button>
          </div>
        </div>
        <div style={{ textAlign: 'center', fontSize: 12.5, color: '#7D776E', paddingBottom: 24 }}>© 2026 Croft · croftapp.co.za</div>
      </div>
    </div>
  );
}
