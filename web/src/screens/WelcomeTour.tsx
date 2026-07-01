import { useState } from 'react';
import { useStore } from '../store';

const grotesk = "'Space Grotesk', sans-serif";

type Step = { color: string; title: string; body: string; icon: React.ReactNode };

function tile(children: React.ReactNode) {
  return (
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none">
      {children}
    </svg>
  );
}

const steps = (name: string): Step[] => [
  {
    color: '#3B5BFF',
    title: `Welcome to Croft, ${name.split(' ')[0] || 'there'} 👋`,
    body: 'One calm home for your whole family — your shared dates, plans, money and reminders, all in one place instead of scattered across group chats.',
    icon: tile(
      <>
        <path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" stroke="#3B5BFF" strokeWidth="1.9" strokeLinejoin="round" />
      </>
    ),
  },
  {
    color: '#FFB020',
    title: 'One shared Calendar',
    body: 'Appointments, birthdays, school dates and pay days — add them once and everyone in the household sees the same schedule.',
    icon: tile(
      <>
        <rect x="3" y="4.5" width="18" height="16" rx="3" stroke="#FFB020" strokeWidth="1.9" />
        <path d="M3 9h18M8 2.5v4M16 2.5v4" stroke="#FFB020" strokeWidth="1.9" strokeLinecap="round" />
      </>
    ),
  },
  {
    color: '#16C098',
    title: 'Plans that get done',
    body: 'To-dos and reminders, a shared shopping list, and family goals. Assign things to each other and tick them off together.',
    icon: tile(
      <>
        <circle cx="12" cy="12" r="9" stroke="#16C098" strokeWidth="1.9" />
        <path d="M8 12.2l2.6 2.6L16 9.4" stroke="#16C098" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
      </>
    ),
  },
  {
    color: '#FF5C8A',
    title: 'Money, sorted',
    body: 'Track bills and due dates, keep an eye on budgets and savings, and settle up who-owes-who — no more awkward maths.',
    icon: tile(
      <>
        <rect x="2.5" y="5.5" width="19" height="14" rx="3" stroke="#FF5C8A" strokeWidth="1.9" />
        <path d="M2.5 10h19" stroke="#FF5C8A" strokeWidth="1.9" />
        <circle cx="17.5" cy="15" r="1.4" fill="#FF5C8A" />
      </>
    ),
  },
  {
    color: '#3B5BFF',
    title: 'Bring your family in',
    body: 'Invite the people you live with from the Family tab so everyone stays in sync. Tap the ＋ button any time to add an event, task, bill or goal.',
    icon: tile(
      <>
        <circle cx="9" cy="8" r="3.2" stroke="#3B5BFF" strokeWidth="1.9" />
        <circle cx="16.5" cy="9.5" r="2.4" stroke="#3B5BFF" strokeWidth="1.9" />
        <path d="M3.5 19c0-3 2.5-5 5.5-5s5.5 2 5.5 5M15 14.2c2.4.2 4.5 2 4.5 4.8" stroke="#3B5BFF" strokeWidth="1.9" strokeLinecap="round" />
      </>
    ),
  },
];

export default function WelcomeTour() {
  const { user, completeOnboarding } = useStore();
  const [i, setI] = useState(0);
  const all = steps(user?.name || '');
  const step = all[i];
  const last = i === all.length - 1;

  const next = () => (last ? completeOnboarding() : setI((n) => n + 1));

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 80,
        background: '#F3F5FB',
        display: 'flex',
        flexDirection: 'column',
        padding: '16px 24px calc(24px + env(safe-area-inset-bottom))',
      }}
    >
      {/* Skip */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', height: 32 }}>
        {!last && (
          <button
            onClick={completeOnboarding}
            style={{ border: 'none', background: 'none', color: '#8A93A6', fontSize: 14, fontWeight: 600, cursor: 'pointer', padding: 6 }}
          >
            Skip
          </button>
        )}
      </div>

      {/* Content */}
      <div className="croft-fade" key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center', gap: 22 }}>
        <div
          style={{
            width: 96,
            height: 96,
            borderRadius: 28,
            background: step.color + '1F',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div style={{ transform: 'scale(1.7)' }}>{step.icon}</div>
        </div>
        <h1 style={{ fontFamily: grotesk, fontWeight: 700, fontSize: 27, lineHeight: 1.15, letterSpacing: '-0.02em', margin: 0, maxWidth: 340 }}>
          {step.title}
        </h1>
        <p style={{ fontSize: 15.5, lineHeight: 1.55, color: '#5A6270', margin: 0, maxWidth: 320 }}>{step.body}</p>
      </div>

      {/* Progress dots */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 7, marginBottom: 20 }}>
        {all.map((_, d) => (
          <span
            key={d}
            style={{
              width: d === i ? 22 : 7,
              height: 7,
              borderRadius: 100,
              background: d === i ? step.color : '#D3DAE8',
              transition: 'width .25s ease, background .25s ease',
            }}
          />
        ))}
      </div>

      {/* Primary + back */}
      <button
        onClick={next}
        style={{
          width: '100%',
          border: 'none',
          borderRadius: 16,
          padding: '16px',
          background: step.color,
          color: '#fff',
          fontFamily: grotesk,
          fontWeight: 700,
          fontSize: 16,
          cursor: 'pointer',
          boxShadow: `0 8px 22px ${step.color}55`,
        }}
      >
        {last ? "Let's get started" : 'Next'}
      </button>
      <button
        onClick={() => setI((n) => Math.max(0, n - 1))}
        disabled={i === 0}
        style={{
          border: 'none',
          background: 'none',
          color: i === 0 ? 'transparent' : '#8A93A6',
          fontSize: 14,
          fontWeight: 600,
          cursor: i === 0 ? 'default' : 'pointer',
          padding: '12px 6px 0',
          height: 36,
        }}
      >
        Back
      </button>
    </div>
  );
}
