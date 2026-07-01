const grotesk = "'Bricolage Grotesque', sans-serif";
const SUPPORT_EMAIL = 'info@underbridges.co.za';
const OPERATOR = 'Underbridges';
const UPDATED = '1 July 2026';

function Wrap({ children }: { children: React.ReactNode }) {
  return (
    <div className="croft-scroll" style={{ position: 'absolute', inset: 0, background: '#F5F4F1', overflowY: 'auto' }}>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '48px 24px 72px' }}>
        <a href="/" style={{ display: 'inline-flex', alignItems: 'center', gap: 9, textDecoration: 'none', color: '#181922', marginBottom: 28 }}>
          <img src="/icons/icon-192.png" width={30} height={30} alt="" style={{ borderRadius: 8, display: 'block' }} />
          <span style={{ fontFamily: grotesk, fontWeight: 700, fontSize: 19 }}>Croft</span>
        </a>
        {children}
      </div>
    </div>
  );
}

const h1: React.CSSProperties = { fontFamily: grotesk, fontWeight: 700, fontSize: 30, letterSpacing: '-0.02em', margin: '0 0 6px' };
const meta: React.CSSProperties = { color: '#8C877E', fontSize: 13.5, margin: '0 0 28px' };
const h2: React.CSSProperties = { fontFamily: grotesk, fontWeight: 700, fontSize: 18, margin: '30px 0 8px' };
const p: React.CSSProperties = { fontSize: 15, lineHeight: 1.65, color: '#403c36', margin: '0 0 12px' };
const li: React.CSSProperties = { fontSize: 15, lineHeight: 1.6, color: '#403c36', marginBottom: 7 };
const ulS: React.CSSProperties = { paddingLeft: 20, margin: '0 0 12px' };
const mail = (
  <a href={`mailto:${SUPPORT_EMAIL}`} style={{ color: '#3B5BFF' }}>{SUPPORT_EMAIL}</a>
);
const backLink = (
  <p style={{ ...p, marginTop: 26 }}>
    <a href="/" style={{ color: '#3B5BFF', fontWeight: 700 }}>&larr; Back to Croft</a>
  </p>
);

export default function LegalPage({ page }: { page: 'privacy' | 'terms' | 'support' }) {
  if (page === 'support') {
    return (
      <Wrap>
        <h1 style={h1}>Support</h1>
        <p style={meta}>We are here to help.</p>
        <p style={p}>
          Croft is one calm home for your whole family: shared dates, reminders, lists, goals and money. If something is not
          working, you have a question, or you want to make a data-privacy request, email us and we will get back to you,
          usually within two business days.
        </p>
        <p style={{ ...p, fontWeight: 700 }}>{mail}</p>

        <h2 style={h2}>Quick answers</h2>
        <ul style={ulS}>
          <li style={li}><strong>Invite your family:</strong> open the <em>Family</em> tab and enter their email, or share an invite link.</li>
          <li style={li}><strong>Forgot your password:</strong> tap &ldquo;Forgot password?&rdquo; on the sign-in screen and we will email a reset link.</li>
          <li style={li}><strong>Turn on reminders:</strong> <em>Family &rarr; Notifications</em>, or enable them during setup.</li>
          <li style={li}><strong>Add events to your calendar:</strong> <em>Family &rarr; Calendar &rarr; Subscribe</em> to add Croft to Apple or Google Calendar.</li>
          <li style={li}><strong>Delete your account:</strong> <em>Family &rarr; Account &amp; security &rarr; Delete account</em>. This permanently removes your data.</li>
        </ul>

        <h2 style={h2}>Legal</h2>
        <p style={p}>
          Read our <a href="/privacy" style={{ color: '#3B5BFF', fontWeight: 700 }}>Privacy Policy</a> and{' '}
          <a href="/terms" style={{ color: '#3B5BFF', fontWeight: 700 }}>Terms of Service</a>.
        </p>
        {backLink}
      </Wrap>
    );
  }

  if (page === 'terms') {
    return (
      <Wrap>
        <h1 style={h1}>Terms of Service</h1>
        <p style={meta}>Last updated {UPDATED}</p>

        <p style={p}>
          These Terms of Service (&ldquo;Terms&rdquo;) are a binding agreement between you and {OPERATOR} (&ldquo;{OPERATOR}&rdquo;,
          &ldquo;we&rdquo;, &ldquo;us&rdquo;, &ldquo;our&rdquo;), the operator of the Croft application and website (together, the
          &ldquo;Service&rdquo;). By creating an account, accessing, or using the Service, you agree to these Terms and to our{' '}
          <a href="/privacy" style={{ color: '#3B5BFF', fontWeight: 700 }}>Privacy Policy</a>. If you do not agree, do not use the Service.
        </p>

        <h2 style={h2}>1. Eligibility</h2>
        <p style={p}>
          You must be at least 18 years old, or the age of legal majority where you live, and able to enter into a binding
          contract. If you use the Service on behalf of a household or other people, you confirm that you are authorized to do
          so and to accept these Terms for them.
        </p>

        <h2 style={h2}>2. Your account</h2>
        <ul style={ulS}>
          <li style={li}>Provide accurate, current information and keep it up to date.</li>
          <li style={li}>Keep your password and app passcode confidential, and do not share your account.</li>
          <li style={li}>You are responsible for all activity that happens under your account.</li>
          <li style={li}>Tell us promptly at {mail} if you suspect any unauthorized access or security issue.</li>
        </ul>

        <h2 style={h2}>3. Your content and licence to us</h2>
        <p style={p}>
          You retain ownership of the content you add to the Service, including events, tasks, lists, goals, bills, notes,
          member details and other information (&ldquo;Your Content&rdquo;). You grant us a worldwide, non-exclusive, royalty-free
          licence to host, store, copy, transmit, display and process Your Content solely to operate, maintain, secure and
          improve the Service and to make it available to the household members you invite. This licence ends when Your Content
          is deleted, except for backups retained for a limited period and anything we must keep by law.
        </p>
        <p style={p}>
          You are responsible for Your Content and confirm you have the rights to share it. Do not upload content that is
          unlawful, infringing, or that you are not permitted to share.
        </p>

        <h2 style={h2}>4. Households and invitations</h2>
        <p style={p}>
          Croft is built for shared households. Content within a household is visible to every member who has joined it.
          Anyone who has a valid invite link can join that household, so only share invite links with people you trust. You are
          responsible for who you invite and for what you choose to share with your household.
        </p>

        <h2 style={h2}>5. Acceptable use</h2>
        <p style={p}>You agree not to, and not to allow anyone to:</p>
        <ul style={ulS}>
          <li style={li}>use the Service for anything unlawful, harmful, fraudulent, or that infringes the rights of others;</li>
          <li style={li}>upload malware, or attempt to disrupt, overload, or interfere with the Service or its infrastructure;</li>
          <li style={li}>probe, scan, or test the vulnerability of the Service, or breach or circumvent any security or authentication;</li>
          <li style={li}>access the Service by any automated means, scrape it, or reverse-engineer, decompile or copy it, except as allowed by law;</li>
          <li style={li}>misuse invitations, notifications or email to spam, harass, or deceive; or</li>
          <li style={li}>resell, sublicense or commercially exploit the Service without our written permission.</li>
        </ul>

        <h2 style={h2}>6. Availability and changes to the Service</h2>
        <p style={p}>
          The Service is provided on an &ldquo;as is&rdquo; and &ldquo;as available&rdquo; basis. We work to keep it running and to
          improve it, but we do not guarantee that it will be uninterrupted, timely, secure, or error-free. We may add, change,
          suspend, or remove features at any time, and we may set limits on use.
        </p>

        <h2 style={h2}>7. Fees</h2>
        <p style={p}>
          Croft is currently free to use. If we introduce paid plans or features in future, we will make the pricing and terms
          clear before you are charged, and paid features will be optional.
        </p>

        <h2 style={h2}>8. Intellectual property</h2>
        <p style={p}>
          The Service, including its software, design, brand, name, logo and content we provide (but excluding Your Content), is
          owned by {OPERATOR} or our licensors and is protected by intellectual-property laws. We grant you a limited,
          personal, non-transferable, revocable licence to use the Service in line with these Terms. All rights not expressly
          granted are reserved.
        </p>

        <h2 style={h2}>9. Third-party services</h2>
        <p style={p}>
          The Service relies on third parties, for example Google for optional sign-in, and providers for hosting and email
          delivery. Your use of those third-party services is also governed by their own terms and privacy policies, and we are
          not responsible for them.
        </p>

        <h2 style={h2}>10. Termination</h2>
        <p style={p}>
          You may stop using the Service and delete your account at any time from <em>Family &rarr; Account &amp; security &rarr;
          Delete account</em>. We may suspend or terminate your access if you breach these Terms, if required by law, or to
          protect the Service or its users. On termination, your right to use the Service ends; sections that by their nature
          should survive (for example content licence for backups, disclaimers, liability, indemnity, and governing law) will
          survive.
        </p>

        <h2 style={h2}>11. Disclaimers</h2>
        <p style={p}>
          To the fullest extent permitted by law, we disclaim all warranties, whether express or implied, including any implied
          warranties of merchantability, fitness for a particular purpose, and non-infringement. Croft helps you organize your
          household, but you are responsible for your own decisions, dates, payments and reminders. We do not provide financial,
          legal or other professional advice.
        </p>

        <h2 style={h2}>12. Limitation of liability</h2>
        <p style={p}>
          To the fullest extent permitted by law, {OPERATOR} and its people will not be liable for any indirect, incidental,
          special, consequential or punitive damages, or for any loss of data, profits, revenue, or goodwill, arising out of or
          related to your use of, or inability to use, the Service. Where liability cannot be excluded, our total liability is
          limited to the greater of the amount you paid us for the Service in the twelve months before the claim, or ZAR 1,000.
          Nothing in these Terms limits liability that cannot be limited under applicable law.
        </p>

        <h2 style={h2}>13. Indemnity</h2>
        <p style={p}>
          You agree to indemnify and hold {OPERATOR} harmless from claims, losses and expenses (including reasonable legal
          fees) arising from your misuse of the Service, your breach of these Terms, or your infringement of any third-party
          rights.
        </p>

        <h2 style={h2}>14. Governing law and disputes</h2>
        <p style={p}>
          These Terms are governed by the laws of the Republic of South Africa, without regard to conflict-of-laws rules. You
          agree to the exclusive jurisdiction of the courts of South Africa, unless mandatory local law gives you the right to
          bring a claim elsewhere. We encourage you to contact us first at {mail} so we can try to resolve any issue.
        </p>

        <h2 style={h2}>15. Changes to these Terms</h2>
        <p style={p}>
          We may update these Terms from time to time. When we do, we will revise the &ldquo;last updated&rdquo; date above and,
          for material changes, take reasonable steps to let you know. Your continued use of the Service after changes take
          effect means you accept the updated Terms.
        </p>

        <h2 style={h2}>16. General</h2>
        <ul style={ulS}>
          <li style={li}><strong>Entire agreement:</strong> these Terms and the Privacy Policy are the entire agreement between you and us regarding the Service.</li>
          <li style={li}><strong>Severability:</strong> if any part is found unenforceable, the rest stays in effect.</li>
          <li style={li}><strong>No waiver:</strong> if we do not enforce a right, that is not a waiver of it.</li>
          <li style={li}><strong>Assignment:</strong> you may not transfer your rights under these Terms; we may transfer ours as part of a merger, acquisition or sale.</li>
        </ul>

        <h2 style={h2}>17. Contact</h2>
        <p style={p}>Questions about these Terms? Email {mail}.</p>

        <p style={{ ...p, marginTop: 20, fontSize: 14 }}>
          See also our <a href="/privacy" style={{ color: '#3B5BFF', fontWeight: 700 }}>Privacy Policy</a>.
        </p>
        {backLink}
      </Wrap>
    );
  }

  // ---------- PRIVACY ----------
  return (
    <Wrap>
      <h1 style={h1}>Privacy Policy</h1>
      <p style={meta}>Last updated {UPDATED}</p>

      <p style={p}>
        This Privacy Policy explains how {OPERATOR} (&ldquo;{OPERATOR}&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;), the operator of
        Croft (the &ldquo;Service&rdquo;), collects, uses, shares and protects your personal information, and the rights you have.
        We act as the responsible party (data controller) for the personal information described here. We aim to comply with the
        Protection of Personal Information Act, 2013 (POPIA) in South Africa and, where it applies, the EU/UK General Data
        Protection Regulation (GDPR). Contact us any time at {mail}.
      </p>

      <h2 style={h2}>1. Information we collect</h2>
      <ul style={ulS}>
        <li style={li}><strong>Account information:</strong> your name and email address. If you register with a password, we store a securely hashed (bcrypt) version, never the password itself. If you sign in with Google, we receive your name and verified email address from Google.</li>
        <li style={li}><strong>Household content:</strong> the events, to-dos, shopping items, goals, bills, budgets, savings, member details, notifications and similar content you create in the Service.</li>
        <li style={li}><strong>Notification and calendar data:</strong> if you enable push notifications, a browser/device push subscription; if you subscribe to your calendar feed, a private feed identifier.</li>
        <li style={li}><strong>Technical and usage data:</strong> limited information needed to run and secure the Service, such as IP address (used for rate limiting and abuse prevention), device/browser type, and basic error logs.</li>
        <li style={li}><strong>Communications:</strong> messages you send us, for example support or privacy requests.</li>
      </ul>
      <p style={p}>
        We do <strong>not</strong> collect precise location, contacts, or advertising identifiers, and we do <strong>not</strong>{' '}
        track you across other apps or websites.
      </p>

      <h2 style={h2}>2. How we use your information</h2>
      <ul style={ulS}>
        <li style={li}>To provide the Service: store your household content and sync it across the people you invite.</li>
        <li style={li}>To send reminders, a daily summary, transactional email (such as password resets and invites) and, where enabled, push notifications, according to your settings.</li>
        <li style={li}>To secure your account, prevent abuse and fraud, and keep the Service working.</li>
        <li style={li}>To respond to your requests and provide support.</li>
        <li style={li}>To improve and maintain the Service and comply with legal obligations.</li>
      </ul>

      <h2 style={h2}>3. Legal bases for processing</h2>
      <p style={p}>Where GDPR or similar law applies, we rely on: performance of our contract with you (to provide the Service); your consent (for example for push notifications, which you can withdraw at any time); our legitimate interests (to secure and improve the Service); and compliance with legal obligations. Under POPIA, we process personal information on comparable lawful grounds, including consent, contract, and legitimate interest.</p>

      <h2 style={h2}>4. Sharing within your household</h2>
      <p style={p}>Content you add is visible to the members of your household; that is the purpose of a shared home. Only people you invite, or who accept your invite, can access it. When someone joins, other members may see that they joined.</p>

      <h2 style={h2}>5. Service providers (operators)</h2>
      <p style={p}>We use a small number of trusted providers who process personal information only on our behalf and under contract:</p>
      <ul style={ulS}>
        <li style={li}><strong>Neon</strong> - database hosting (stores your account and household content).</li>
        <li style={li}><strong>Vercel</strong> - application hosting and content delivery.</li>
        <li style={li}><strong>Resend</strong> - delivery of transactional and reminder emails.</li>
        <li style={li}><strong>Google</strong> - optional sign-in (OAuth), if you choose it.</li>
      </ul>
      <p style={p}>We do not sell your personal information, and we do not share it for advertising. We may disclose information if required by law, to enforce our Terms, or to protect the rights, safety and security of our users or the Service.</p>

      <h2 style={h2}>6. International transfers</h2>
      <p style={p}>Our providers may process and store data in countries outside South Africa or your own. Where we transfer personal information across borders, we take reasonable steps to ensure it receives an adequate level of protection, consistent with POPIA and, where applicable, GDPR (for example through providers that offer appropriate safeguards).</p>

      <h2 style={h2}>7. Cookies and similar technologies</h2>
      <p style={p}>We use a single, essential authentication cookie to keep you signed in (a signed, httpOnly session token). We do not use advertising or third-party tracking cookies. Some browser storage may be used to make the app work offline and to remember preferences.</p>

      <h2 style={h2}>8. Data retention</h2>
      <p style={p}>We keep your personal information for as long as your account is active and as needed to provide the Service. When you delete your account, we delete your account and, if you are the last member of a household, that household and its content. Residual copies may remain in encrypted backups for a limited period before being overwritten, and we may retain limited information where the law requires it (for example for security or legal records).</p>

      <h2 style={h2}>9. Security</h2>
      <p style={p}>We take reasonable technical and organizational measures to protect your information, including bcrypt password hashing, signed httpOnly session cookies, encryption in transit (HTTPS/TLS), rate limiting on sensitive actions, and an optional in-app passcode lock. No method of transmission or storage is completely secure, but we work to protect your information and to respond quickly to any issue.</p>

      <h2 style={h2}>10. Your rights</h2>
      <p style={p}>Depending on where you live, you may have the right to:</p>
      <ul style={ulS}>
        <li style={li}>access the personal information we hold about you and request a copy;</li>
        <li style={li}>correct or update inaccurate or incomplete information;</li>
        <li style={li}>delete your account and personal information;</li>
        <li style={li}>object to or restrict certain processing, and withdraw consent (for example for notifications);</li>
        <li style={li}>request portability of information you provided to us; and</li>
        <li style={li}>lodge a complaint with a supervisory authority.</li>
      </ul>
      <p style={p}>You can delete your account directly in the app. For any other request, email us at {mail} and we will respond as required by law. In South Africa, you may also contact the Information Regulator; in the EU/UK, your local data-protection authority.</p>

      <h2 style={h2}>11. Children</h2>
      <p style={p}>Croft is intended for adults managing a household and is not directed at children under 18. We do not knowingly collect personal information from children. If you believe a child has provided us information, contact us and we will remove it.</p>

      <h2 style={h2}>12. Changes to this policy</h2>
      <p style={p}>We may update this Privacy Policy from time to time. We will revise the &ldquo;last updated&rdquo; date above and, for material changes, take reasonable steps to notify you. Continued use of the Service after changes take effect means you accept the updated policy.</p>

      <h2 style={h2}>13. Contact us</h2>
      <p style={p}>For any privacy question or request, email {mail}. We aim to respond within the timeframes required by applicable law.</p>

      <p style={{ ...p, marginTop: 20, fontSize: 14 }}>
        See also our <a href="/terms" style={{ color: '#3B5BFF', fontWeight: 700 }}>Terms of Service</a>.
      </p>
      {backLink}
    </Wrap>
  );
}
