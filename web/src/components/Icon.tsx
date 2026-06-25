// Duotone illustration-style icon set for Hearth.
// A soft tinted tile with a rounded-stroke glyph in `color`.
import type { JSX } from 'react';

function hexA(hex: string, a: number) {
  const h = (hex || '#3B5BFF').replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

const GLYPHS: Record<string, (c: string) => JSX.Element> = {
  calendar: (c) => (<g><rect x="3.5" y="5" width="17" height="15.5" rx="3.5" stroke={c} strokeWidth="1.9" /><path d="M3.5 9.5h17M8 3v4M16 3v4" stroke={c} strokeWidth="1.9" strokeLinecap="round" /><circle cx="8.5" cy="14" r="1.3" fill={c} /><circle cx="13" cy="14" r="1.3" fill={c} /></g>),
  todo: (c) => (<g><rect x="3.5" y="3.5" width="17" height="17" rx="4.5" stroke={c} strokeWidth="1.9" /><path d="M8 12.2l2.6 2.6L16.5 9" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></g>),
  check: (c) => (<g><circle cx="12" cy="12" r="8.5" stroke={c} strokeWidth="1.9" /><path d="M8 12.3l2.6 2.6L16 9" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></g>),
  bell: (c) => (<g><path d="M18 9.5a6 6 0 1 0-12 0c0 6-2.5 7.5-2.5 7.5h17S18 15.5 18 9.5" stroke={c} strokeWidth="1.9" strokeLinejoin="round" /><path d="M10.2 20.5a2 2 0 0 0 3.6 0" stroke={c} strokeWidth="1.9" strokeLinecap="round" /><circle cx="17.5" cy="5.5" r="2.6" fill={c} /></g>),
  cart: (c) => (<g><path d="M3 4h2.2l2 11h9.6l1.8-8H6.4" stroke={c} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" /><circle cx="9" cy="19" r="1.6" fill={c} /><circle cx="16" cy="19" r="1.6" fill={c} /></g>),
  wallet: (c) => (<g><rect x="3" y="6" width="18" height="13" rx="3.5" stroke={c} strokeWidth="1.9" /><path d="M3 10h18" stroke={c} strokeWidth="1.9" /><circle cx="17" cy="14.5" r="1.5" fill={c} /></g>),
  goal: (c) => (<g><circle cx="12" cy="12" r="8.5" stroke={c} strokeWidth="1.9" /><circle cx="12" cy="12" r="4.6" stroke={c} strokeWidth="1.9" /><circle cx="12" cy="12" r="1.6" fill={c} /></g>),
  lock: (c) => (<g><rect x="4.5" y="10" width="15" height="10.5" rx="3.2" stroke={c} strokeWidth="1.9" /><path d="M7.5 10V7.5a4.5 4.5 0 0 1 9 0V10" stroke={c} strokeWidth="1.9" strokeLinecap="round" /><circle cx="12" cy="15" r="1.5" fill={c} /></g>),
  family: (c) => (<g><circle cx="8.5" cy="8" r="3" stroke={c} strokeWidth="1.9" /><circle cx="16" cy="9.5" r="2.3" stroke={c} strokeWidth="1.9" /><path d="M3.5 19c0-3 2.2-4.8 5-4.8s5 1.8 5 4.8M15 14.5c2.3.1 4.3 1.7 4.3 4.5" stroke={c} strokeWidth="1.9" strokeLinecap="round" /></g>),
  shield: (c) => (<g><path d="M12 3l7 2.5v5.5c0 4.5-3 7.8-7 9.5-4-1.7-7-5-7-9.5V5.5L12 3z" stroke={c} strokeWidth="1.9" strokeLinejoin="round" /><path d="M9 12l2.2 2.2L15.5 10" stroke={c} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" /></g>),
  cloud: (c) => (<g><path d="M7 18a4 4 0 0 1-.5-7.97A5 5 0 0 1 16.5 9.5 3.75 3.75 0 0 1 17 18H7z" stroke={c} strokeWidth="1.9" strokeLinejoin="round" /><path d="M10 14l2 2 2-2" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></g>),
  mail: (c) => (<g><rect x="3" y="5.5" width="18" height="13" rx="3.2" stroke={c} strokeWidth="1.9" /><path d="M4.5 8l6.4 4.6a2 2 0 0 0 2.3 0L19.5 8" stroke={c} strokeWidth="1.9" strokeLinecap="round" /></g>),
  alarm: (c) => (<g><circle cx="12" cy="13" r="7" stroke={c} strokeWidth="1.9" /><path d="M12 9.5V13l2.3 1.6M4 5l3-2.2M20 5l-3-2.2" stroke={c} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" /></g>),
  house: (c) => (<g><path d="M3.5 11L12 4l8.5 7v8.2a1 1 0 0 1-1 1H4.5a1 1 0 0 1-1-1z" stroke={c} strokeWidth="1.9" strokeLinejoin="round" /><path d="M9.5 20.5v-6h5v6" stroke={c} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" /></g>),
  heart: (c) => (<g><path d="M12 20s-7-4.3-7-9.3A4 4 0 0 1 12 7a4 4 0 0 1 7 3.7c0 5-7 9.3-7 9.3z" stroke={c} strokeWidth="1.9" strokeLinejoin="round" /></g>),
  coin: (c) => (<g><circle cx="12" cy="12" r="8.5" stroke={c} strokeWidth="1.9" /><path d="M12 7.5v9M9.5 9.5h3.2a1.8 1.8 0 0 1 0 3.6H9.5h3.5a1.8 1.8 0 0 1 0 3.6H9.5" stroke={c} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></g>),
  health: (c) => (<g><rect x="4" y="4" width="16" height="16" rx="5" stroke={c} strokeWidth="1.9" /><path d="M12 8.5v7M8.5 12h7" stroke={c} strokeWidth="2" strokeLinecap="round" /></g>),
  plus: (c) => (<g><path d="M12 5.5v13M5.5 12h13" stroke={c} strokeWidth="2.2" strokeLinecap="round" /></g>),
};

export default function Icon({
  name,
  color = '#3B5BFF',
  size = 44,
  radius = 14,
  glyph = 22,
  bare = false,
}: {
  name: string;
  color?: string;
  size?: number;
  radius?: number;
  glyph?: number;
  bare?: boolean;
}) {
  const draw = GLYPHS[name] || GLYPHS.goal;
  const svg = (
    <svg width={glyph} height={glyph} viewBox="0 0 24 24" fill="none">
      {draw(color)}
    </svg>
  );
  if (bare) return svg;
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        background: hexA(color, 0.13),
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      {svg}
    </div>
  );
}
