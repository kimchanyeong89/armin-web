import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import React, { Suspense, useMemo, useState } from 'react';
import type { Exhibition, ExhibitionItem } from '../types/Exhibition';
import DrawingLoader from '../components/DrawingLoader';

const ExhibitionModal = React.lazy(() => import('../components/ExhibitionModal'));

// ── Design tokens ──────────────────────────────────────────────────
// Interactive mode (dark)
const I = {
  BG:     '#111111',
  TEXT:   '#FFFFFF',
  ACCENT: '#CCFF00',
  DIM:    'rgba(255,255,255,0.35)',
  LINE:   'rgba(255,255,255,0.08)',
  LINE_S: 'rgba(255,255,255,0.18)',
};

// Drawing mode (paper / sketch)
const D = {
  BG:     '#EDE8D8',
  TEXT:   '#1A1714',
  ACCENT: '#CCFF00',
  DIM:    '#7A7268',
  LINE:   'rgba(0,0,0,0.12)',
  LINE_S: 'rgba(0,0,0,0.28)',
  STAMP:  '#2A2620',
};

const MONO = "'Space Mono', 'Courier New', monospace";

// ── CSS ──────────────────────────────────────────────────────────
const CSS = `
@keyframes ep-fade { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
@keyframes ep-appear { from { opacity: 0; } to { opacity: 1; } }

/* ── Shared shell ── */
.ep-shell {
  position: fixed; inset: 0; overflow: hidden;
  display: flex; flex-direction: column;
  font-family: ${MONO}; z-index: 13000;
}

/* ═══════════════════════════════════════════════════
   INTERACTIVE MODE  (data-mode="interactive")
   Dark digital aesthetic
═══════════════════════════════════════════════════ */
.ep-shell[data-mode="interactive"] {
  background: ${I.BG}; color: ${I.TEXT};
}

/* dot grid texture */
.ep-shell[data-mode="interactive"]::before {
  content: ''; position: absolute; inset: 0; pointer-events: none; z-index: 0;
  background-image: radial-gradient(rgba(255,255,255,0.04) 0.8px, transparent 0.8px);
  background-size: 18px 18px;
}

.ep-shell[data-mode="interactive"] .ep-header {
  border-bottom: 1px solid ${I.LINE};
  background: rgba(17,17,17,0.9);
}

.ep-shell[data-mode="interactive"] .ep-nav-btn {
  border: 1px solid ${I.LINE_S};
  background: rgba(255,255,255,0.05); color: ${I.TEXT};
}
.ep-shell[data-mode="interactive"] .ep-nav-btn:hover {
  background: rgba(255,255,255,0.12); border-color: rgba(255,255,255,0.3);
}

.ep-shell[data-mode="interactive"] .ep-hero {
  border-bottom: 1px solid ${I.LINE};
}

.ep-shell[data-mode="interactive"] .ep-hero-label {
  color: ${I.ACCENT};
}

.ep-shell[data-mode="interactive"] .ep-hero-loc,
.ep-shell[data-mode="interactive"] .ep-hero-meta {
  color: ${I.DIM};
}

.ep-shell[data-mode="interactive"] .ep-hero-desc {
  color: ${I.DIM};
}

.ep-shell[data-mode="interactive"] .ep-card {
  border: 1px solid ${I.LINE};
  background: rgba(255,255,255,0.025);
}
.ep-shell[data-mode="interactive"] .ep-card:hover {
  border-color: rgba(204,255,0,0.4);
  background: rgba(204,255,0,0.03);
}

.ep-shell[data-mode="interactive"] .ep-card-no-img {
  background: #1a1a1a;
}

.ep-shell[data-mode="interactive"] .ep-card-num { color: ${I.DIM}; }

.ep-shell[data-mode="interactive"] .ep-card-tag {
  border-color: ${I.LINE_S}; color: ${I.DIM};
}
.ep-shell[data-mode="interactive"] .ep-card-tag.permanent {
  border-color: rgba(204,255,0,0.3); color: ${I.ACCENT};
}

.ep-shell[data-mode="interactive"] .ep-card-sub { color: ${I.DIM}; }
.ep-shell[data-mode="interactive"] .ep-card-arrow { color: rgba(204,255,0,0.55); }

.ep-shell[data-mode="interactive"] .ep-switcher-panel {
  background: #1c1c1c; border: 1px solid ${I.LINE_S};
  box-shadow: 0 16px 40px rgba(0,0,0,0.7);
}

.ep-shell[data-mode="interactive"] .ep-switcher-input {
  background: rgba(255,255,255,0.06); border: 1px solid ${I.LINE};
  color: ${I.TEXT};
}

.ep-shell[data-mode="interactive"] .ep-switcher-item {
  border-left: 2px solid transparent;
}
.ep-shell[data-mode="interactive"] .ep-switcher-item.active {
  background: rgba(204,255,0,0.07); border-left-color: ${I.ACCENT};
}
.ep-shell[data-mode="interactive"] .ep-switcher-item:hover:not(.active) {
  background: rgba(255,255,255,0.05);
}
.ep-shell[data-mode="interactive"] .ep-switcher-title { color: ${I.TEXT}; }
.ep-shell[data-mode="interactive"] .ep-switcher-title.active { color: ${I.ACCENT}; }
.ep-shell[data-mode="interactive"] .ep-switcher-sub { color: ${I.DIM}; }

.ep-shell[data-mode="interactive"] .ep-grid::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); }

/* ═══════════════════════════════════════════════════
   DRAWING MODE  (data-mode="drawing")
   Paper + architectural sketch aesthetic
═══════════════════════════════════════════════════ */
.ep-shell[data-mode="drawing"] {
  background: ${D.BG}; color: ${D.TEXT};
}

/* Graph paper grid background */
.ep-shell[data-mode="drawing"]::before {
  content: ''; position: absolute; inset: 0; pointer-events: none; z-index: 0;
  background-image:
    linear-gradient(rgba(0,0,0,0.045) 1px, transparent 1px),
    linear-gradient(90deg, rgba(0,0,0,0.045) 1px, transparent 1px);
  background-size: 28px 28px;
}

.ep-shell[data-mode="drawing"] .ep-header {
  border-bottom: 2px dashed rgba(0,0,0,0.15);
  background: rgba(237,232,216,0.95);
}

.ep-shell[data-mode="drawing"] .ep-nav-btn {
  border: 1.5px solid ${D.LINE_S};
  background: rgba(0,0,0,0.04); color: ${D.TEXT};
}
.ep-shell[data-mode="drawing"] .ep-nav-btn:hover {
  background: rgba(0,0,0,0.09);
}

.ep-shell[data-mode="drawing"] .ep-hero {
  border-bottom: 2px dashed rgba(0,0,0,0.15);
}

.ep-shell[data-mode="drawing"] .ep-hero-label {
  color: ${D.DIM}; letter-spacing: 0.45em;
}

.ep-shell[data-mode="drawing"] .ep-hero-loc,
.ep-shell[data-mode="drawing"] .ep-hero-meta {
  color: ${D.DIM};
}

.ep-shell[data-mode="drawing"] .ep-hero-desc {
  color: #5A5448;
  border-left: 2px solid rgba(0,0,0,0.15);
  padding-left: 12px;
  margin-top: 14px;
}

/* Drawing mode cards — sketch rectangle style */
.ep-shell[data-mode="drawing"] .ep-card {
  border: 1.5px solid ${D.LINE_S};
  background: rgba(255,255,255,0.55);
  box-shadow: 2px 3px 0 rgba(0,0,0,0.06);
}
.ep-shell[data-mode="drawing"] .ep-card:hover {
  border-color: ${D.STAMP};
  background: rgba(255,255,255,0.85);
  box-shadow: 3px 4px 0 rgba(0,0,0,0.1);
}

.ep-shell[data-mode="drawing"] .ep-card-no-img {
  background: rgba(0,0,0,0.04);
  border-bottom: 1px dashed rgba(0,0,0,0.15);
}

.ep-shell[data-mode="drawing"] .ep-card-num {
  color: ${D.DIM}; font-size: 9px;
}

.ep-shell[data-mode="drawing"] .ep-card-tag {
  border: 1px solid ${D.LINE_S}; color: ${D.DIM};
  background: transparent;
}
.ep-shell[data-mode="drawing"] .ep-card-tag.permanent {
  border-color: ${D.STAMP}; color: ${D.STAMP};
  font-weight: 700;
}

.ep-shell[data-mode="drawing"] .ep-card-sub { color: ${D.DIM}; }

.ep-shell[data-mode="drawing"] .ep-card-arrow {
  color: ${D.STAMP}; opacity: 0.55;
}

.ep-shell[data-mode="drawing"] .ep-switcher-panel {
  background: #F2EDD8; border: 1.5px solid ${D.LINE_S};
  box-shadow: 3px 4px 0 rgba(0,0,0,0.1);
}

.ep-shell[data-mode="drawing"] .ep-switcher-input {
  background: rgba(255,255,255,0.7); border: 1px solid ${D.LINE_S};
  color: ${D.TEXT};
}

.ep-shell[data-mode="drawing"] .ep-switcher-item {
  border-left: 2px solid transparent;
}
.ep-shell[data-mode="drawing"] .ep-switcher-item.active {
  background: rgba(0,0,0,0.05); border-left-color: ${D.STAMP};
}
.ep-shell[data-mode="drawing"] .ep-switcher-item:hover:not(.active) {
  background: rgba(0,0,0,0.03);
}
.ep-shell[data-mode="drawing"] .ep-switcher-title { color: ${D.TEXT}; }
.ep-shell[data-mode="drawing"] .ep-switcher-title.active { color: ${D.STAMP}; }
.ep-shell[data-mode="drawing"] .ep-switcher-sub { color: ${D.DIM}; }

.ep-shell[data-mode="drawing"] .ep-grid::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.15); }

/* ═══════════════════════════════════════════════════
   SHARED LAYOUT CLASSES
═══════════════════════════════════════════════════ */
.ep-header {
  position: relative; z-index: 2; flex-shrink: 0;
  display: flex; align-items: center; gap: 10px;
  padding: 0 18px; height: 46px;
  backdrop-filter: blur(10px);
}

.ep-nav-btn {
  height: 26px; padding: 0 12px; border-radius: 3px;
  font-family: ${MONO}; font-size: 9px; font-weight: 700;
  letter-spacing: 0.12em; text-transform: uppercase;
  cursor: pointer; transition: background 0.14s, border-color 0.14s;
  white-space: nowrap; border-width: 1px; border-style: solid;
  display: inline-flex; align-items: center;
}

.ep-header-meta {
  margin-left: auto; font-size: 9px; letter-spacing: 0.2em; white-space: nowrap;
  opacity: 0.45;
}

.ep-hero {
  position: relative; z-index: 2; flex-shrink: 0;
  padding: 22px 22px 18px;
}

.ep-hero-label {
  font-size: 8px; letter-spacing: 0.45em; text-transform: uppercase; margin-bottom: 10px;
}

.ep-hero-name {
  font-size: clamp(24px, 4.5vw, 52px); font-weight: 700;
  letter-spacing: -0.03em; line-height: 0.94; margin: 0 0 12px;
}

.ep-hero-row {
  display: flex; align-items: center; gap: 14px; flex-wrap: wrap;
}

.ep-hero-loc, .ep-hero-meta {
  font-size: 9px; letter-spacing: 0.2em; text-transform: uppercase;
}

.ep-hero-desc {
  font-size: 10px; line-height: 1.8; letter-spacing: 0.03em;
  max-width: 520px;
}

/* Main scroll area */
.ep-main {
  position: relative; z-index: 2; flex: 1; min-height: 0; overflow: hidden;
}

.ep-grid {
  position: absolute; inset: 0;
  overflow-y: auto; overflow-x: hidden;
  padding: 18px 20px 28px;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 14px;
  align-content: start;
}

.ep-grid::-webkit-scrollbar { width: 4px; }
.ep-grid::-webkit-scrollbar-track { background: transparent; }

/* Exhibition card */
.ep-card {
  border-radius: 3px; overflow: hidden; cursor: pointer;
  display: flex; flex-direction: column;
  transition: all 0.18s ease;
  animation: ep-fade 0.38s ease both;
}

.ep-card-img {
  width: 100%; aspect-ratio: 4/3; object-fit: cover; display: block; flex-shrink: 0;
}

.ep-card-no-img {
  width: 100%; aspect-ratio: 4/3;
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}

.ep-card-body {
  padding: 12px 13px 15px; display: flex; flex-direction: column; gap: 6px; flex: 1;
}

.ep-card-num { font-size: 8px; letter-spacing: 0.28em; }

.ep-card-tag {
  display: inline-flex; align-items: center;
  height: 18px; padding: 0 7px; border-radius: 2px;
  font-size: 8px; letter-spacing: 0.1em; text-transform: uppercase;
  width: fit-content;
}

.ep-card-title {
  font-size: 12.5px; font-weight: 700; line-height: 1.28; letter-spacing: -0.01em; margin: 0;
}

.ep-card-sub { font-size: 9px; letter-spacing: 0.1em; text-transform: uppercase; }

.ep-card-arrow { margin-top: auto; padding-top: 7px; font-size: 9px; letter-spacing: 0.16em; }

/* ── Detail (inline) view — used only in drawing mode ── */
.ep-detail {
  position: relative; z-index: 2;
  /* Takes flex:1 to fill remaining ep-shell height */
  flex: 1; min-height: 0;
  overflow: hidden;
}

.ep-detail-bar {
  position: absolute; top: 10px; left: 14px; z-index: 10;
  display: flex; align-items: center; gap: 8px;
}

/* ep-inner fills ep-detail — ExhibitionModal is absolute within here */
.ep-inner {
  position: absolute; inset: 0;
  overflow: hidden;
}

/* Switcher dropdown */
.ep-switcher-panel {
  position: absolute; top: 36px; left: 0;
  width: 296px; max-height: 380px; border-radius: 3px;
  display: flex; flex-direction: column; overflow: hidden; z-index: 20;
}

.ep-switcher-head {
  padding: 8px 10px; border-bottom-width: 1px; border-bottom-style: solid;
  border-bottom-color: rgba(128,128,128,0.2); flex-shrink: 0;
}

.ep-switcher-input {
  width: 100%; height: 28px; border-radius: 2px; padding: 0 9px;
  font-family: ${MONO}; font-size: 10px; letter-spacing: 0.05em;
  outline: none; box-sizing: border-box;
}

.ep-switcher-list { overflow-y: auto; padding: 6px; flex: 1; min-height: 0; }

.ep-switcher-item {
  display: flex; align-items: center; gap: 9px;
  padding: 7px 9px; border-radius: 2px; cursor: pointer;
  margin-bottom: 2px; transition: background 0.1s;
}

.ep-switcher-title { font-size: 11px; font-weight: 700; line-height: 1.25; }
.ep-switcher-sub { font-size: 8px; letter-spacing: 0.1em; text-transform: uppercase; margin-top: 2px; }

/* Empty state */
.ep-empty { padding: 32px 20px; font-size: 10px; letter-spacing: 0.2em; opacity: 0.45; }

@media (max-width: 640px) {
  .ep-hero { padding: 16px 14px 14px; }
  .ep-grid { padding: 12px 14px 20px; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 10px; }
  .ep-header { padding: 0 12px; }
}
`;

// ── Corner tick marks (drawing mode aesthetic) ────────────────────
const DrawingCorner = ({ pos, color }: { pos: 'tl' | 'tr' | 'bl' | 'br'; color: string }) => {
  const style: React.CSSProperties = {
    position: 'absolute',
    top: pos.startsWith('t') ? -1 : undefined, bottom: pos.startsWith('b') ? -1 : undefined,
    left: pos.endsWith('l') ? -1 : undefined, right: pos.endsWith('r') ? -1 : undefined,
    transform: `scale(${pos.endsWith('r') ? -1 : 1},${pos.startsWith('b') ? -1 : 1})`,
    pointerEvents: 'none',
  };
  return (
    <svg width={12} height={12} viewBox="0 0 12 12" style={style}>
      <path d="M 0 8 L 0 0 L 8 0" fill="none" stroke={color} strokeWidth="1.5" />
    </svg>
  );
};

// Mini globe for no-image placeholder
const MiniGlobe = ({ dark }: { dark: boolean }) => {
  const c = dark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.14)';
  const d = dark ? 'rgba(204,255,0,0.4)' : 'rgba(0,0,0,0.2)';
  return (
    <svg width={44} height={44} viewBox="0 0 44 44" fill="none">
      <circle cx={22} cy={22} r={18} stroke={c} strokeWidth="1" strokeDasharray="3.5 2.5" />
      <ellipse cx={22} cy={22} rx={18} ry={7} stroke={c} strokeWidth="0.7" />
      <line x1={22} y1={4} x2={22} y2={40} stroke={c} strokeWidth="0.7" />
      <circle cx={22} cy={22} r={2.2} fill={d} />
    </svg>
  );
};

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
  const [searchParams] = useSearchParams();

  const museum = exhibitions.find((e) => e.id === id);
  if (!museum) return <div />;

  const isDrawingMode = searchParams.get('mode') === 'drawing';
  const mode = isDrawingMode ? 'drawing' : 'interactive';

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

  const backPath = isDrawingMode ? '/?drawingMap=true' : '/';

  return (
    <div className="ep-shell" data-mode={mode}>

      {/* ── Header ─────────────────────────────────────────────── */}
      <header className="ep-header">
        <button className="ep-nav-btn" onClick={() => navigate(backPath)}>
          ← MAP
        </button>
        {activeItem && (
          <button className="ep-nav-btn" onClick={() => { setActiveItem(null); setIsSwitcherOpen(false); }}>
            ← ALL EXHIBITIONS
          </button>
        )}
        <span className="ep-header-meta">
          {(museum.location || 'GLOBAL').toUpperCase()}
        </span>
      </header>

      {/* ── Museum hero — list view only ───────────────────────── */}
      {!activeItem && (
        <section className="ep-hero">
          <div className="ep-hero-label">
            {isDrawingMode ? 'ARMIN · DRAWING MAP' : 'ARMIN · INTERACTIVE'}
          </div>
          <h1 className="ep-hero-name">{museum.name}</h1>
          <div className="ep-hero-row">
            {museum.location && <span className="ep-hero-loc">{museum.location}</span>}
            <span className="ep-hero-meta">
              {allExhibitions.length} exhibition{allExhibitions.length !== 1 ? 's' : ''}
              {totalArtworks > 0 && ` · ${totalArtworks.toLocaleString()} works`}
            </span>
          </div>
          {museum.description && (
            <p className="ep-hero-desc">
              {museum.description.length > 230
                ? `${museum.description.slice(0, 230)}…`
                : museum.description}
            </p>
          )}
        </section>
      )}

      {/* ── Exhibition list ─────────────────────────────────────── */}
      {!activeItem && (
        <main className="ep-main">
          <div className="ep-grid">
            {filteredExhibitions.map((ex, idx) => (
              <article
                key={ex.id + idx}
                className="ep-card"
                style={{ animationDelay: `${idx * 60}ms`, position: 'relative' }}
                onClick={() => openExhibition(ex)}
              >
                {/* Corner marks — drawing mode only */}
                {isDrawingMode && (
                  <>
                    <DrawingCorner pos="tl" color={D.STAMP} />
                    <DrawingCorner pos="tr" color={D.STAMP} />
                    <DrawingCorner pos="bl" color={D.STAMP} />
                    <DrawingCorner pos="br" color={D.STAMP} />
                  </>
                )}

                {ex.image ? (
                  <img src={ex.image} alt={ex.title || ex.name} className="ep-card-img" />
                ) : (
                  <div className="ep-card-no-img">
                    <MiniGlobe dark={!isDrawingMode} />
                  </div>
                )}

                <div className="ep-card-body">
                  <span className="ep-card-num">{String(idx + 1).padStart(2, '0')}</span>
                  <span className={`ep-card-tag${ex.type === 'PERMANENT' ? ' permanent' : ''}`}>
                    {ex.type}
                  </span>
                  <h3 className="ep-card-title">{ex.title || ex.name}</h3>
                  <p className="ep-card-sub">
                    {ex.artworks?.length ? `${ex.artworks.length} artworks` : 'Open collection'}
                  </p>
                  <div className="ep-card-arrow">EXPLORE →</div>
                </div>
              </article>
            ))}

            {filteredExhibitions.length === 0 && (
              <div className="ep-empty">NO EXHIBITIONS FOUND</div>
            )}
          </div>
        </main>
      )}

      {/* ── Detail view ─────────────────────────────────────────── */}

      {/* Drawing mode: ExhibitionModal INLINE within the paper shell */}
      {activeItem && isDrawingMode && (
        <div className="ep-detail">
          {/* Floating switch bar */}
          {allExhibitions.length > 1 && (
            <div className="ep-detail-bar">
              <div style={{ position: 'relative' }}>
                <button
                  className="ep-nav-btn"
                  onClick={() => setIsSwitcherOpen((v) => !v)}
                >
                  SWITCH ({allExhibitions.length})
                </button>

                {isSwitcherOpen && (
                  <div className="ep-switcher-panel">
                    <div className="ep-switcher-head">
                      <input
                        className="ep-switcher-input"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Find exhibition…"
                        autoFocus
                      />
                    </div>
                    <div className="ep-switcher-list">
                      {filteredExhibitions.map((ex, idx) => {
                        const isActive = ex.id === activeItem.id;
                        return (
                          <div
                            key={ex.id + idx}
                            className={`ep-switcher-item${isActive ? ' active' : ''}`}
                            onClick={() => openExhibition(ex)}
                          >
                            {ex.image ? (
                              <img src={ex.image} alt="" style={{ width: 44, height: 32, objectFit: 'cover', borderRadius: 2, flexShrink: 0 }} />
                            ) : (
                              <div style={{ width: 44, height: 32, borderRadius: 2, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.08)' }}>
                                <MiniGlobe dark={false} />
                              </div>
                            )}
                            <div>
                              <div className={`ep-switcher-title${isActive ? ' active' : ''}`}>{ex.title || ex.name}</div>
                              <div className="ep-switcher-sub">{ex.type}</div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ExhibitionModal fills ep-inner — position:absolute within ep-inner (position:relative) */}
          <div className="ep-inner">
            <Suspense fallback={
              <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: D.BG }}>
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

      {/* Interactive mode: ExhibitionModal as FULL-SCREEN OVERLAY (position:fixed) */}
      {activeItem && !isDrawingMode && (
        <Suspense fallback={
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(17,17,17,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 14000 }}>
            <DrawingLoader visible label="COLLECTION" />
          </div>
        }>
          <ExhibitionModal
            exhibition={activeItem}
            museumName={museum.name}
            onClose={() => setActiveItem(null)}
            inline={false}
            variant="default"
          />
        </Suspense>
      )}
    </div>
  );
}
