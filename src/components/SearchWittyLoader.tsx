/**
 * Loading state shown while a search is in flight but nothing has rendered
 * yet — ARMIN's interlocking-loop mark with light tracing it, under a plain
 * "Searching" label. Keeps the first-search gap from feeling broken.
 *
 * Shared by GlobalSearchBar (search results) and AICurationHubPage (the
 * Taste-Match tab, when a user who has likes is waiting on recommendations).
 */
export function SearchWittyLoader({ dark }: { dark: boolean }) {
  // ARMIN "Knot" mark (01) — brand Knot shape, in the app's own amber
  // (#D4A547). A light segment travels each loop so the search reads as
  // in-progress — a clean highlight tracing the path, no glow, no shine.
  const ring = dark ? '#D4A547' : '#B89438';
  const trace = dark ? '#E8CC88' : '#D6BE7C';
  const markColor = dark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.45)';
  return (
    <div
      role="status"
      aria-label="검색 중"
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 22, padding: '52px 20px' }}
    >
      <style>{`
        @keyframes armin-orbit-a { from { stroke-dashoffset: 0; } to { stroke-dashoffset: 1; } }
        @keyframes armin-orbit-b { from { stroke-dashoffset: 0; } to { stroke-dashoffset: -1; } }
      `}</style>
      <svg width="80" height="80" viewBox="0 0 64 64" fill="none" aria-hidden="true">
        {/* ARMIN Knot mark — verbatim from the brand asset */}
        <circle cx="32" cy="32" r="26" fill="#0A0A0A" />
        <ellipse cx="26" cy="32" rx="10" ry="14" fill="none" stroke={ring} strokeWidth="2.5" transform="rotate(-30 26 32)" />
        <ellipse cx="38" cy="32" rx="10" ry="14" fill="none" stroke={ring} strokeWidth="2.5" transform="rotate(30 38 32)" />
        {/* a light segment travels each loop — the loading motion, flat (no glow) */}
        <ellipse cx="26" cy="32" rx="10" ry="14" fill="none" stroke={trace} strokeWidth="2.5" strokeLinecap="round"
          transform="rotate(-30 26 32)" pathLength={1} strokeDasharray="0.18 0.82"
          style={{ animation: 'armin-orbit-a 2.4s linear infinite' }} />
        <ellipse cx="38" cy="32" rx="10" ry="14" fill="none" stroke={trace} strokeWidth="2.5" strokeLinecap="round"
          transform="rotate(30 38 32)" pathLength={1} strokeDasharray="0.18 0.82"
          style={{ animation: 'armin-orbit-b 2.4s linear infinite' }} />
      </svg>
      <span style={{
        display: 'flex', alignItems: 'center', gap: 9,
        fontFamily: "'Space Mono', 'SFMono-Regular', monospace", fontSize: 9, letterSpacing: '0.42em',
        textTransform: 'uppercase', color: markColor, paddingLeft: '0.42em',
      }}>
        <span style={{ width: 18, height: 1, background: `linear-gradient(90deg, transparent, ${markColor})` }} />
        Searching
        <span style={{ width: 18, height: 1, background: `linear-gradient(90deg, ${markColor}, transparent)` }} />
      </span>
    </div>
  );
}

export default SearchWittyLoader;
