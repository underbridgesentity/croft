const grotesk = "'Space Grotesk', sans-serif";
const SUPPORT_EMAIL = 'support@croftapp.co.za';
const UPDATED = '1 July 2026';

function Wrap({ children }: { children: React.ReactNode }) {
  return (
    <div className="croft-scroll" style={{ position: 'absolute', inset: 0, background: '#F3F5FB', overflowY: 'auto' }}>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '48px 24px 64px' }}>
        <a href="/" style={{ display: 'inline-flex', alignItems: 'center', gap: 9, textDecoration: 'none', color: '#101426', marginBottom: 28 }}>
          <span style={{ width: 30, height: 30, borderRadius: 9, background: '#3B5BFF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none"><path d="M3.5 11L12 4l8.5 7v8.2a1 1 0 0 1-1 1H4.5a1 1 0 0 1-1-1z" stroke="#fff" strokeWidth="2" strokeLinejoin="round" /><path d="M9.5 20.5v-6h5v6" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </span>
          <span style={{ fontFamily: grotesk, fontWeight: 700, fontSize: 19 }}>Croft</span>
        </a>
        {children}
      </div>
    </div>
  );
}

const h1: React.CSSProperties = { fontFamily: grotesk, fontWeight: 700, fontSize: 30, letterSpacing: '-0.02em', margin: '0 0 6px' };
const meta: React.CSSProperties = { color: '#8A93A6', fontSize: 13.5, margin: '0 0 28px' };
const h2: React.CSSProperties = { fontFamily: grotesk, fontWeight: 700, fontSize: 18, margin: '28px 0 8px' };
const p: React.CSSProperties = { fontSize: 15, lineHeight: 1.65, color: '#3f4756', margin: '0 0 12px' };
const li: React.CSSProperties = { fontSize: 15, lineHeight: 1.6, color: '#3f4756', marginBottom: 6 };

export default function LegalPage({ page }: { page: 'privacy' | 'support' }) {
  if (page === 'support') {
    return (
      <Wrap>
        <h1 style={h1}>Support</h1>
        <p style={meta}>We’re here to help.</p>
        <p style={p}>
          Croft is one calm home for your whole family — shared dates, reminders, lists, goals and money. If something isn’t working or you have a question, email us and we’ll get back to you.
        </p>
        <p style={{ ...p, fontWeight: 700 }}>
          📧 <a href={`mailto:${SUPPORT_EMAIL}`} style={{ color: '#3B5BFF' }}>{SUPPORT_EMAIL}</a>
        </p>
        <h2 style={h2}>Quick answers</h2>
        <ul style={{ paddingLeft: 20, margin: '0 0 12px' }}>
          <li style={li}><strong>Invite your family:</strong> open the <em>Family</em> tab and enter their email (or share an invite link).</li>
          <li style={li}><strong>Forgot your password:</strong> tap “Forgot password?” on the sign-in screen — we’ll email a reset link.</li>
          <li style={li}><strong>Turn on reminders:</strong> <em>Family → Notifications</em>, or enable them during setup.</li>
          <li style={li}><strong>Delete your account:</strong> <em>Family → Account &amp; security → Delete account</em>. This permanently removes your data.</li>
        </ul>
        <p style={{ ...p, marginTop: 24 }}>
          <a href="/" style={{ color: '#3B5BFF', fontWeight: 700 }}>← Back to Croft</a>
        </p>
      </Wrap>
    );
  }

  return (
    <Wrap>
      <h1 style={h1}>Privacy Policy</h1>
      <p style={meta}>Last updated {UPDATED}</p>
      <p style={p}>
        Croft (“we”, “us”) is a family and household management app operated by Underbridges. This policy explains what we collect, how we use it, and the choices you have. Questions? Email <a href={`mailto:${SUPPORT_EMAIL}`} style={{ color: '#3B5BFF' }}>{SUPPORT_EMAIL}</a>.
      </p>

      <h2 style={h2}>Information we collect</h2>
      <ul style={{ paddingLeft: 20, margin: '0 0 12px' }}>
        <li style={li}><strong>Account details:</strong> your name and email. If you sign up with a password, we store a securely hashed (bcrypt) version — never the password itself. If you sign in with Google, we receive your name and verified email from Google.</li>
        <li style={li}><strong>Household content:</strong> the events, to-dos, shopping items, goals, bills, budgets, family members and notifications you create in the app.</li>
        <li style={li}><strong>Notification data:</strong> if you enable push notifications, a browser/device push subscription so we can deliver reminders.</li>
      </ul>
      <p style={p}>We do <strong>not</strong> collect location, contacts, or advertising identifiers, and we do <strong>not</strong> track you across other apps or websites.</p>

      <h2 style={h2}>How we use it</h2>
      <ul style={{ paddingLeft: 20, margin: '0 0 12px' }}>
        <li style={li}>To provide the service — storing your household’s content and syncing it across the people you invite.</li>
        <li style={li}>To send reminders and a daily summary by push and email, according to your settings.</li>
        <li style={li}>To secure your account and keep the service working.</li>
      </ul>
      <p style={p}>We never sell your data or use it for advertising.</p>

      <h2 style={h2}>Sharing within your household</h2>
      <p style={p}>Content you add is visible to the members of your household — that’s the point of a shared home. Only people you invite (or who accept your invite) can access it.</p>

      <h2 style={h2}>Service providers</h2>
      <p style={p}>We use a small number of trusted providers to run Croft, who process data only on our behalf:</p>
      <ul style={{ paddingLeft: 20, margin: '0 0 12px' }}>
        <li style={li}><strong>Neon</strong> — database hosting.</li>
        <li style={li}><strong>Vercel</strong> — application hosting.</li>
        <li style={li}><strong>Resend</strong> — sending transactional and reminder emails.</li>
        <li style={li}><strong>Google</strong> — optional sign-in (OAuth).</li>
      </ul>

      <h2 style={h2}>Security</h2>
      <p style={p}>Passwords are hashed with bcrypt, sessions use signed httpOnly cookies, and all traffic is encrypted in transit (HTTPS).</p>

      <h2 style={h2}>Retention &amp; deletion</h2>
      <p style={p}>You can delete your account any time from <em>Family → Account &amp; security → Delete account</em>. This removes your account and, if you’re the last member of a household, that household and all its data — permanently.</p>

      <h2 style={h2}>Children</h2>
      <p style={p}>Croft is intended for adults managing a household and is not directed at children under 13.</p>

      <h2 style={h2}>Changes</h2>
      <p style={p}>We may update this policy; we’ll revise the “last updated” date above. Continued use means you accept the current version.</p>

      <p style={{ ...p, marginTop: 24 }}>
        <a href="/" style={{ color: '#3B5BFF', fontWeight: 700 }}>← Back to Croft</a>
      </p>
    </Wrap>
  );
}
