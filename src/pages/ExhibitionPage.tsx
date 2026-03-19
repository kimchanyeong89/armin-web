import { useParams, useNavigate } from "react-router-dom";
import React, { Suspense, useMemo, useState } from 'react';
import type { Exhibition, ExhibitionItem } from '../types/Exhibition';
import DrawingLoader from '../components/DrawingLoader';

const ExhibitionModal = React.lazy(() => import('../components/ExhibitionModal'));

// ── Design tokens — Drawing Map concept ───────────────────────────
const BG     = '#111111';
const TEXT   = '#FFFFFF';
const ACCENT = '#CCFF00';
const DIM    = 'rgba(255,255,255,0.38)';
const LINE   = 'rgba(255,255,255,0.10)';
const LINE_S = 'rgba(255,255,255,0.22)';
const MONO   = "'Space Mono', 'Courier New', monospace";

// ── CSS injection ─────────────────────────────────────────────────
const CSS = `
@keyframes ep-fade-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }

.ep-shell {
  position: fixed; inset: 0; background: ${BG}; color: ${TEXT};
  font-family: ${MONO}; overflow: hidden; display: flex; flex-direction: column;
  z-index: 13000;
}

/* Subtle dot grid texture */
.ep-shell::before {
  content: ''; position: absolute; inset: 0; pointer-events: none;
  background-image: radial-gradient(rgba(255,255,255,0.04) 0.8px, transparent 0.8px);
  background-size: 18px 18px; z-index: 0;
}

/* ── Header ── */
.ep-header {
  position: relative; z-index: 2; flex-shrink: 0;
  display: flex; align-items: center; gap: 12px;
  padding: 0 20px; height: 48px;
  border-bottom: 1px solid ${LINE};
}

.ep-nav-btn {
  height: 28px; padding: 0 12px;
  border: 1px solid ${LINE_S}; border-radius: 3px;
  background: rgba(255,255,255,0.04); color: ${TEXT};
  font-family: ${MONO}; font-size: 9px; font-weight: 700;
  letter-spacing: 0.12em; text-transform: uppercase;
  cursor: pointer; transition: background 0.15s, border-color 0.15s;
  white-space: nowrap;
}
.ep-nav-btn:hover { background: rgba(255,255,255,0.10); border-color: ${LINE_S}; }
.ep-nav-btn.accent { background: ${ACCENT}; color: #111; border-color: ${ACCENT}; }
.ep-nav-btn.accent:hover { background: #d4ff00; }

.ep-header-meta {
  margin-left: auto; font-size: 9px; letter-spacing: 0.18em; color: ${DIM}; white-space: nowrap;
}

/* ── Museum hero ── */
.ep-hero {
  position: relative; z-index: 2; flex-shrink: 0;
  padding: 28px 24px 20px;
  border-bottom: 1px solid ${LINE};
}

.ep-hero-label {
  font-size: 8px; letter-spacing: 0.45em; color: ${ACCENT};
  margin-bottom: 10px; text-transform: uppercase;
}

.ep-hero-name {
  font-size: clamp(28px, 5vw, 54px); font-weight: 700;
  letter-spacing: -0.03em; line-height: 0.95;
  margin: 0 0 10px;
}

.ep-hero-row {
  display: flex; align-items: center; gap: 16px; flex-wrap: wrap;
}

.ep-hero-loc {
  font-size: 9px; letter-spacing: 0.22em; color: ${DIM}; text-transform: uppercase;
}

.ep-hero-desc {
  font-size: 10px; color: ${DIM}; line-height: 1.75;
  max-width: 540px; letter-spacing: 0.04em;
  margin-top: 12px;
}

/* ── Exhibition list ── */
.ep-main {
  position: relative; z-index: 2; flex: 1; min-height: 0; overflow: hidden;
}

.ep-grid {
  height: 100%; overflow-y: auto; overflow-x: hidden;
  padding: 20px 24px 32px;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 16px;
  align-content: start;
}

/* ── Exhibition card ── */
.ep-card {
  border: 1px solid ${LINE}; border-radius: 4px;
  background: rgba(255,255,255,0.03);
  overflow: hidden; cursor: pointer;
  display: flex; flex-direction: column;
  transition: border-color 0.18s, background 0.18s, transform 0.18s;
  animation: ep-fade-in 0.4s ease both;
}
.ep-card:hover {
  border-color: rgba(204,255,0,0.45);
  background: rgba(204,255,0,0.04);
  transform: translateY(-2px);
}

.ep-card-img {
  width: 100%; aspect-ratio: 4/3; object-fit: cover;
  background: #1a1a1a; display: block; flex-shrink: 0;
}

.ep-card-no-img {
  width: 100%; aspect-ratio: 4/3; background: #1a1a1a;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}

.ep-card-body {
  padding: 12px 14px 16px; display: flex; flex-direction: column; gap: 7px;
  flex: 1;
}

.ep-card-num {
  font-size: 8px; letter-spacing: 0.3em; color: ${DIM};
}

.ep-card-tag {
  display: inline-flex; align-items: center;
  height: 18px; padding: 0 8px;
  border: 1px solid ${LINE_S}; border-radius: 2px;
  font-size: 8px; letter-spacing: 0.12em; text-transform: uppercase;
  color: ${DIM}; width: fit-content;
}
.ep-card-tag.permanent { border-color: rgba(204,255,0,0.3); color: ${ACCENT}; }

.ep-card-title {
  font-size: 13px; font-weight: 700; line-height: 1.25;
  letter-spacing: -0.01em; color: ${TEXT};
  margin: 0;
}

.ep-card-sub {
  font-size: 9px; letter-spacing: 0.12em; color: ${DIM};
  text-transform: uppercase;
}

.ep-card-arrow {
  margin-top: auto; padding-top: 8px;
  font-size: 9px; letter-spacing: 0.18em; color: rgba(204,255,0,0.6);
}

/* ── Detail view ── */
.ep-detail {
  position: relative; z-index: 2; flex: 1; min-height: 0; overflow: hidden;
}

.ep-detail-bar {
  position: absolute; top: 12px; left: 16px; z-index: 8;
  display: flex; align-items: center; gap: 8px;
}

.ep-inner {
  position: absolute; inset: 0; overflow: auto; padding: 0;
}

/* ── Scrollbar ── */
.ep-grid::-webkit-scrollbar,
.ep-inner::-webkit-scrollbar { width: 4px; }
.ep-grid::-webkit-scrollbar-thumb,
.ep-inner::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.12); border-radius: 99px; }
.ep-grid::-webkit-scrollbar-track,
.ep-inner::-webkit-scrollbar-track { background: transparent; }

/* ── No-image globe placeholder ── */
.ep-globe-placeholder svg { opacity: 0.18; }

@media (max-width: 640px) {
  .ep-hero { padding: 18px 16px 14px; }
  .ep-grid { padding: 14px 16px 24px; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 10px; }
  .ep-header { padding: 0 14px; }
}
`;

// Corner brackets — drawing map accent
const Corner = ({ pos }: { pos: 'tl' | 'tr' | 'bl' | 'br' }) => {
  const style: React.CSSProperties = {
    position: 'absolute',
    top: pos.startsWith('t') ? 0 : undefined,
    bottom: pos.startsWith('b') ? 0 : undefined,
    left: pos.endsWith('l') ? 0 : undefined,
    right: pos.endsWith('r') ? 0 : undefined,
    transform: `scale(${pos.endsWith('r') ? -1 : 1},${pos.startsWith('b') ? -1 : 1})`,
    opacity: 0.4,
  };
  return (
    <svg width={14} height={14} viewBox="0 0 14 14" style={style}>
      <path d="M 0 9 L 0 0 L 9 0" fill="none" stroke={ACCENT} strokeWidth="1.5" />
    </svg>
  );
};

// Minimal globe SVG for no-image cards
const MiniGlobe = () => (
  <svg width={48} height={48} viewBox="0 0 48 48" fill="none" opacity={0.22}>
    <circle cx={24} cy={24} r={20} stroke={TEXT} strokeWidth="1" strokeDasharray="4 3" />
    <ellipse cx={24} cy={24} rx={20} ry={8} stroke={TEXT} strokeWidth="0.6" />
    <line x1={24} y1={4} x2={24} y2={44} stroke={TEXT} strokeWidth="0.6" />
    <circle cx={24} cy={24} r={2.5} fill={ACCENT} />
  </svg>
);

let _cssInjected = false;
function injectCSS() {
  if (_cssInjected || typeof document === 'undefined') return;
  const s = document.createElement('style');
  s.textContent = CSS;
  document.head.appendChild(s);
  _cssInjected = true;
}

type ExhibitionWithType = ExhibitionItem & { type: 'PERMANENT' | 'TEMPORARY' };

export default function ExhibitionPage({ exhibitions }: { exhibitions: Exhibition[] }) {
  injectCSS();
  const { id } = useParams();
  const navigate = useNavigate();
  const museum = exhibitions.find((e) => e.id === id);

  if (!museum) return <div />;

  const [activeItem, setActiveItem] = useState<ExhibitionWithType | null>(null);
  const [isSwitcherOpen, setIsSwitcherOpen] = useState(false);
  const [search, setSearch] = useState('');

  const allExhibitions = useMemo<ExhibitionWithType[]>(() => [
    ...(museum.permanentExhibitions || []).map((e) => ({ ...e, type: 'PERMANENT' as const })),
    ...(museum.temporaryExhibitions || []).map((e) => ({ ...e, type: 'TEMPORARY' as const })),
  ], [museum.permanentExhibitions, museum.temporaryExhibitions]);

  const filteredExhibitions = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return allExhibitions;
    return allExhibitions.filter((ex) => {
      const title = (ex.title || ex.name || '').toLowerCase();
      const desc = (ex.description || '').toLowerCase();
      return title.includes(q) || desc.includes(q);
    });
  }, [allExhibitions, search]);

  const openExhibition = (item: ExhibitionWithType) => {
    setActiveItem(item);
    setIsSwitcherOpen(false);
  };

  const totalArtworks = allExhibitions.reduce((s, ex) => s + (ex.artworks?.length || 0), 0);

  return (
    <div className="ep-shell">
      {/* ── Header ── */}
      <header className="ep-header">
        <button className="ep-nav-btn" onClick={() => navigate('/?drawingMap=true')}>
          ← MAP
        </button>
        {activeItem && (
          <button className="ep-nav-btn" onClick={() => setActiveItem(null)}>
            ← ALL EXHIBITIONS
          </button>
        )}
        <span className="ep-header-meta">
          {museum.location ? museum.location.toUpperCase() : 'GLOBAL'}
        </span>
      </header>

      {/* ── Museum hero (only when no detail open) ── */}
      {!activeItem && (
        <section className="ep-hero">
          <div className="ep-hero-label">A R M I N · MUSEUM</div>
          <h1 className="ep-hero-name">{museum.name}</h1>
          <div className="ep-hero-row">
            {museum.location && (
              <span className="ep-hero-loc">{museum.location}</span>
            )}
            <span className="ep-hero-loc">
              {allExhibitions.length} exhibition{allExhibitions.length !== 1 ? 's' : ''}
              {totalArtworks > 0 && ` · ${totalArtworks.toLocaleString()} works`}
            </span>
          </div>
          {museum.description && (
            <p className="ep-hero-desc">
              {museum.description.length > 240
                ? `${museum.description.slice(0, 240)}…`
                : museum.description}
            </p>
          )}
        </section>
      )}

      {/* ── Main content ── */}
      <main className="ep-main">

        {/* List view */}
        {!activeItem && (
          <div className="ep-grid">
            {filteredExhibitions.map((ex, idx) => (
              <article
                key={ex.id + idx}
                className="ep-card"
                style={{ animationDelay: `${idx * 55}ms` }}
                onClick={() => openExhibition(ex)}
              >
                {ex.image ? (
                  <img src={ex.image} alt={ex.title || ex.name} className="ep-card-img" />
                ) : (
                  <div className="ep-card-no-img">
                    <MiniGlobe />
                  </div>
                )}

                <div className="ep-card-body">
                  <span className="ep-card-num">{String(idx + 1).padStart(2, '0')}</span>
                  <span className={`ep-card-tag${ex.type === 'PERMANENT' ? ' permanent' : ''}`}>
                    {ex.type}
                  </span>
                  <h3 className="ep-card-title">{ex.title || ex.name}</h3>
                  {ex.artworks?.length ? (
                    <p className="ep-card-sub">{ex.artworks.length} artworks</p>
                  ) : (
                    <p className="ep-card-sub">Open collection</p>
                  )}
                  <div className="ep-card-arrow">EXPLORE →</div>
                </div>
              </article>
            ))}

            {filteredExhibitions.length === 0 && (
              <div style={{ color: DIM, fontSize: 11, letterSpacing: '0.15em', padding: '32px 0' }}>
                NO EXHIBITIONS FOUND
              </div>
            )}
          </div>
        )}

        {/* Detail view — ExhibitionModal inline */}
        {activeItem && (
          <div className="ep-detail">
            {/* Floating nav bar */}
            <div className="ep-detail-bar">
              {allExhibitions.length > 1 && (
                <div style={{ position: 'relative' }}>
                  <button
                    className="ep-nav-btn"
                    onClick={() => setIsSwitcherOpen((v) => !v)}
                  >
                    SWITCH ({allExhibitions.length})
                  </button>

                  {isSwitcherOpen && (
                    <div style={{
                      position: 'absolute', top: 36, left: 0,
                      width: 300, maxHeight: 420,
                      background: '#1a1a1a', border: `1px solid ${LINE_S}`,
                      borderRadius: 4, zIndex: 20, overflow: 'hidden',
                      display: 'flex', flexDirection: 'column',
                      boxShadow: '0 16px 40px rgba(0,0,0,0.6)',
                    }}>
                      {/* Search */}
                      <div style={{ padding: '8px 10px', borderBottom: `1px solid ${LINE}` }}>
                        <input
                          value={search}
                          onChange={(e) => setSearch(e.target.value)}
                          placeholder="Search exhibition..."
                          autoFocus
                          style={{
                            width: '100%', background: 'rgba(255,255,255,0.06)',
                            border: `1px solid ${LINE}`, borderRadius: 3,
                            height: 30, padding: '0 10px', outline: 'none',
                            color: TEXT, fontFamily: MONO, fontSize: 10,
                            letterSpacing: '0.08em', boxSizing: 'border-box',
                          }}
                        />
                      </div>
                      {/* List */}
                      <div style={{ overflowY: 'auto', padding: '6px' }}>
                        {filteredExhibitions.map((ex, idx) => {
                          const isActive = ex.id === activeItem.id;
                          return (
                            <div
                              key={ex.id + idx}
                              onClick={() => openExhibition(ex)}
                              style={{
                                display: 'flex', alignItems: 'center', gap: 10,
                                padding: '8px 10px', borderRadius: 3, cursor: 'pointer',
                                background: isActive ? 'rgba(204,255,0,0.08)' : 'transparent',
                                borderLeft: isActive ? `2px solid ${ACCENT}` : '2px solid transparent',
                                transition: 'background 0.12s',
                                marginBottom: 2,
                              }}
                              onMouseEnter={(e) => { if (!isActive) (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.05)'; }}
                              onMouseLeave={(e) => { if (!isActive) (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}
                            >
                              {ex.image ? (
                                <img src={ex.image} alt="" style={{ width: 46, height: 34, objectFit: 'cover', borderRadius: 2, flexShrink: 0 }} />
                              ) : (
                                <div style={{ width: 46, height: 34, background: '#222', borderRadius: 2, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                  <MiniGlobe />
                                </div>
                              )}
                              <div>
                                <div style={{ fontSize: 11, fontWeight: 700, color: isActive ? ACCENT : TEXT, lineHeight: 1.25 }}>
                                  {ex.title || ex.name}
                                </div>
                                <div style={{ fontSize: 8, letterSpacing: '0.12em', color: DIM, marginTop: 2 }}>{ex.type}</div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="ep-inner">
              <Suspense fallback={
                <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <DrawingLoader visible label="COLLECTION" />
                </div>
              }>
                <ExhibitionModal
                  exhibition={activeItem}
                  museumName={museum.name}
                  onClose={() => setActiveItem(null)}
                  inline={true}
                  variant="sketch"
                />
              </Suspense>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
