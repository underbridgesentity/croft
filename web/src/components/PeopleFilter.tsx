const grotesk = "'Geist', sans-serif";

/** A horizontal chip row of family members that doubles as a colour legend and a
 * filter. Each chip carries the member's colour, so tapping one narrows a list to
 * what's "for" that person; "Everyone" clears it. Hidden for a one-person home. */
export default function PeopleFilter({
  members, value, onChange,
}: {
  members: { id: string; name: string; color: string }[];
  value: string | null;
  onChange: (id: string | null) => void;
}) {
  if (members.length <= 1) return null;
  const base: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0, cursor: 'pointer',
    padding: '8px 13px', borderRadius: 100, fontWeight: 700, fontSize: 12.5, whiteSpace: 'nowrap',
    fontFamily: 'inherit',
  };
  return (
    <div className="croft-scroll" style={{ display: 'flex', gap: 7, overflowX: 'auto', paddingBottom: 4, marginBottom: 14 }}>
      <button
        onClick={() => onChange(null)}
        style={{ ...base, border: '1.5px solid ' + (value === null ? '#181922' : '#E8E3DB'), background: value === null ? '#181922' : '#fff', color: value === null ? '#fff' : '#181922' }}
      >
        Everyone
      </button>
      {members.map((m) => {
        const sel = value === m.id;
        return (
          <button
            key={m.id}
            onClick={() => onChange(sel ? null : m.id)}
            aria-pressed={sel}
            style={{ ...base, fontFamily: grotesk, border: '1.5px solid ' + (sel ? m.color : '#E8E3DB'), background: sel ? m.color : '#fff', color: sel ? '#fff' : '#181922' }}
          >
            <span style={{ width: 9, height: 9, borderRadius: '50%', background: sel ? '#fff' : m.color, flexShrink: 0 }} />
            {m.name}
          </button>
        );
      })}
    </div>
  );
}
