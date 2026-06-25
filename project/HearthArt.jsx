// HearthArt.jsx — original line-art spot-illustrations for Hearth onboarding.
// Style matches the supplied set: black outline, white fill, a single blue accent.
// Mount: <x-import component="Art" from="./HearthArt.jsx" name="organize" width="248" hint-size="248px,207px"></x-import>

const INK = '#15181F', BLUE = '#3B5BFF', LBLUE = '#E4EAFF', SOFT = '#EDF1FA', WHITE = '#FFFFFF', GREY = '#C9CFE0';

const SCENES = {
  organize: () => (
    <g stroke={INK} strokeWidth="2.6" strokeLinejoin="round" strokeLinecap="round">
      <ellipse cx="120" cy="178" rx="78" ry="9" fill={SOFT} stroke="none"/>
      <rect x="58" y="46" width="124" height="110" rx="12" fill={WHITE}/>
      <path d="M58 76h124"/>
      <path d="M58 58a12 12 0 0 1 12-12h100a12 12 0 0 1 12 12v18H58z" fill={BLUE} stroke="none"/>
      <rect x="58" y="46" width="124" height="110" rx="12" fill="none"/>
      <path d="M58 76h124"/>
      <rect x="78" y="36" width="8" height="20" rx="4" fill={INK}/>
      <rect x="154" y="36" width="8" height="20" rx="4" fill={INK}/>
      <g stroke="none">
        <circle cx="80" cy="98" r="6" fill={GREY}/><circle cx="104" cy="98" r="6" fill={GREY}/><circle cx="128" cy="98" r="6" fill={LBLUE}/><circle cx="152" cy="98" r="6" fill={GREY}/>
        <circle cx="80" cy="122" r="6" fill={GREY}/><circle cx="104" cy="122" r="6" fill={BLUE}/><circle cx="128" cy="122" r="6" fill={GREY}/>
      </g>
      <circle cx="158" cy="132" r="19" fill={BLUE} stroke={WHITE} strokeWidth="3"/>
      <path d="M150 132l5 5 11-11" stroke={WHITE} strokeWidth="3.2" fill="none"/>
    </g>
  ),
  remember: () => (
    <g stroke={INK} strokeWidth="2.6" strokeLinejoin="round" strokeLinecap="round">
      <ellipse cx="118" cy="178" rx="74" ry="9" fill={SOFT} stroke="none"/>
      <rect x="68" y="30" width="86" height="142" rx="18" fill={WHITE}/>
      <rect x="80" y="44" width="62" height="116" rx="9" fill={SOFT} stroke="none"/>
      <rect x="102" y="36" width="18" height="4" rx="2" fill={INK} stroke="none"/>
      <g stroke="none">
        <rect x="90" y="58" width="44" height="8" rx="4" fill={BLUE}/>
        <rect x="90" y="76" width="32" height="6" rx="3" fill={GREY}/>
        <rect x="90" y="90" width="38" height="6" rx="3" fill={GREY}/>
        <rect x="90" y="116" width="44" height="8" rx="4" fill={LBLUE}/>
        <rect x="90" y="134" width="28" height="6" rx="3" fill={GREY}/>
      </g>
      <g transform="translate(132 36)">
        <path d="M4 40c0-14 8-23 19-23s19 9 19 23c0 11 5 14 5 14H-1s5-3 5-14z" fill={BLUE}/>
        <path d="M15 58a8 8 0 0 0 16 0" fill={BLUE}/>
        <circle cx="23" cy="13" r="4" fill={INK} stroke="none"/>
        <path d="M-8 30c-4 2-7 6-7 11M54 30c4 2 7 6 7 11" fill="none"/>
        <circle cx="44" cy="8" r="8" fill={BLUE} stroke={WHITE} strokeWidth="2.5"/>
      </g>
    </g>
  ),
  money: () => (
    <g stroke={INK} strokeWidth="2.6" strokeLinejoin="round" strokeLinecap="round">
      <ellipse cx="120" cy="178" rx="78" ry="9" fill={SOFT} stroke="none"/>
      <g><ellipse cx="62" cy="150" rx="22" ry="8" fill={WHITE}/><ellipse cx="62" cy="141" rx="22" ry="8" fill={BLUE}/><ellipse cx="62" cy="132" rx="22" ry="8" fill={WHITE}/><path d="M62 128v8" /></g>
      <path d="M150 36h22v22" fill="none" stroke={BLUE} strokeWidth="4"/>
      <path d="M108 82l20-22 14 13 30-37" fill="none" stroke={BLUE} strokeWidth="4"/>
      <rect x="92" y="92" width="100" height="70" rx="14" fill={WHITE}/>
      <path d="M92 112h100" stroke={GREY}/>
      <rect x="150" y="118" width="48" height="26" rx="9" fill={BLUE} stroke={INK}/>
      <circle cx="169" cy="131" r="6" fill={WHITE}/>
    </g>
  ),
  family: () => (
    <g stroke={INK} strokeWidth="2.6" strokeLinejoin="round" strokeLinecap="round">
      <ellipse cx="120" cy="180" rx="96" ry="10" fill={SOFT} stroke="none"/>
      <path d="M40 180c0-26 22-40 44-40h64c22 0 52 14 52 40z" fill={LBLUE} stroke="none"/>
      {/* adult left (blue top) */}
      <g><path d="M48 168v-26c0-12 9-21 21-21s21 9 21 21v26z" fill={BLUE}/><circle cx="69" cy="92" r="17" fill={WHITE}/><path d="M55 88a14 14 0 0 1 28 0c0-2-3-8-8-9-2 5-13 3-15 1-3 2-5 5-5 8z" fill={INK} stroke="none"/></g>
      {/* adult right (white, long black hair) */}
      <g><path d="M150 168v-26c0-12 9-21 21-21s21 9 21 21v26z" fill={WHITE}/><circle cx="171" cy="92" r="17" fill={WHITE}/><path d="M156 86c0-9 7-16 16-16 8 0 14 6 15 14 2 3 1 18-2 22-1-7-1-14-3-16-3 2-9 3-14 2-5-1-9-4-12-6z" fill={INK} stroke="none"/></g>
      {/* child 1 (blue) */}
      <g><path d="M92 168v-20c0-9 7-15 15-15s15 6 15 15v20z" fill={BLUE}/><circle cx="107" cy="116" r="12" fill={WHITE}/><path d="M96 114a11 11 0 0 1 22 0c0-6-5-10-11-10s-11 4-11 10z" fill={INK} stroke="none"/></g>
      {/* child 2 (white) */}
      <g><path d="M126 168v-18c0-8 6-14 14-14s14 6 14 14v18z" fill={WHITE}/><circle cx="140" cy="120" r="11" fill={WHITE}/><path d="M130 118a10 10 0 0 1 20 0c0-5-4-9-10-9s-10 4-10 9z" fill={INK} stroke="none"/></g>
      <path d="M120 54c-4-7-15-5-15 3 0 7 15 15 15 15s15-8 15-15c0-8-11-10-15-3z" fill={BLUE} stroke={INK}/>
    </g>
  ),
  welcome: () => (
    <g stroke={INK} strokeWidth="2.6" strokeLinejoin="round" strokeLinecap="round">
      <ellipse cx="120" cy="178" rx="86" ry="10" fill={SOFT} stroke="none"/>
      <circle cx="196" cy="42" r="16" fill="none" stroke={BLUE}/>
      <g stroke={BLUE}><path d="M196 16v-7M222 42h7M214 24l5-5M214 60l5 5"/></g>
      <rect x="62" y="96" width="96" height="80" rx="10" fill={WHITE}/>
      <path d="M55 98l55-42 55 42" fill="none"/>
      <path d="M62 96l48-37 48 37z" fill={BLUE} stroke={INK}/>
      <rect x="92" y="128" width="36" height="48" rx="6" fill={SOFT} stroke={INK}/>
      <path d="M110 128v48M92 152h36"/>
      <rect x="128" y="108" width="20" height="18" rx="4" fill={WHITE}/>
      <path d="M148 70c-3-6-12-5-12 2 0 6 12 12 12 12s12-6 12-12c0-7-9-8-12-2z" fill={BLUE} stroke={INK}/>
    </g>
  ),
  notify: () => (
    <g stroke={INK} strokeWidth="2.8" strokeLinejoin="round" strokeLinecap="round">
      <ellipse cx="120" cy="178" rx="74" ry="9" fill={SOFT} stroke="none"/>
      <circle cx="120" cy="100" r="60" fill={SOFT} stroke="none"/>
      <g transform="translate(84 50)">
        <path d="M4 70c0-22 13-34 32-34s32 12 32 34c0 15 7 20 7 20H-3s7-5 7-20z" fill={BLUE}/>
        <path d="M24 96a12 12 0 0 0 24 0" fill={BLUE}/>
        <circle cx="36" cy="30" r="5" fill={INK} stroke="none"/>
        <path d="M28 64l7 7 16-17" stroke={WHITE} strokeWidth="3.4" fill="none"/>
      </g>
      <g stroke={BLUE}><path d="M58 56c-6 4-10 11-10 19M182 56c6 4 10 11 10 19"/></g>
      <circle cx="166" cy="58" r="15" fill={BLUE} stroke={WHITE} strokeWidth="3"/>
      <text x="166" y="64" textAnchor="middle" fontFamily="'Space Grotesk', sans-serif" fontWeight="700" fontSize="16" fill={WHITE} stroke="none">3</text>
    </g>
  ),
  done: () => (
    <g stroke={INK} strokeWidth="2.8" strokeLinejoin="round" strokeLinecap="round">
      <ellipse cx="120" cy="170" rx="60" ry="9" fill={SOFT} stroke="none"/>
      <circle cx="120" cy="94" r="46" fill={BLUE}/>
      <path d="M99 95l15 15 28-30" stroke={WHITE} strokeWidth="5" fill="none"/>
      <g stroke={BLUE}><path d="M56 58v12M50 64h12M186 72v10M181 77h10M64 128l6-6M170 122l-6-6"/></g>
      <circle cx="62" cy="104" r="4" fill={LBLUE} stroke="none"/>
      <circle cx="180" cy="108" r="5" fill={LBLUE} stroke="none"/>
    </g>
  ),
  emptyList: () => (
    <g stroke={INK} strokeWidth="2.6" strokeLinejoin="round" strokeLinecap="round">
      <ellipse cx="120" cy="172" rx="58" ry="9" fill={SOFT} stroke="none"/>
      <rect x="78" y="48" width="84" height="104" rx="12" fill={WHITE}/>
      <rect x="104" y="40" width="32" height="16" rx="6" fill={LBLUE} stroke={INK}/>
      <path d="M94 84h52M94 102h52M94 120h34" stroke={GREY}/>
      <circle cx="150" cy="138" r="20" fill={BLUE} stroke={WHITE} strokeWidth="3"/>
      <path d="M150 130v16M142 138h16" stroke={WHITE} strokeWidth="3" fill="none"/>
    </g>
  ),
};

function Art({ name, width = 240 }) {
  width = Number(width) || 240;
  const height = width * 200 / 240;
  const draw = SCENES[name] || SCENES.organize;
  return (
    <svg width={width} height={height} viewBox="0 0 240 200" fill="none" xmlns="http://www.w3.org/2000/svg">{draw()}</svg>
  );
}

if (typeof module !== 'undefined') module.exports = { Art };
if (typeof window !== 'undefined') window.Art = Art;
