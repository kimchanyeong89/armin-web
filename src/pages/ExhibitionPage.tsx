import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import React, { Suspense, useMemo, useState } from 'react';
import type { Exhibition, ExhibitionItem } from '../types/Exhibition';
import DrawingLoader from '../components/DrawingLoader';

const ExhibitionModal = React.lazy(() => import('../components/ExhibitionModal'));

// ── Design tokens ──────────────────────────────────────────────────
const I = {
  BG:     '#111111',
  TEXT:   '#FFFFFF',
  ACCENT: '#CCFF00',
  DIM:    'rgba(255,255,255,0.35)',
  LINE:   'rgba(255,255,255,0.08)',
  LINE_S: 'rgba(255,255,255,0.18)',
};

const D = {
  BG:     '#FFFFFF',
  TEXT:   '#111111',
  ACCENT: '#CCFF00',
  DIM:    'rgba(17,17,17,0.45)',
  LINE:   'rgba(17,17,17,0.10)',
  LINE_S: '#111111',
};

const MONO = "'Space Mono', 'Courier New', monospace";

// ── Injected CSS ────────────────────────────────────────────────────
const CSS = `
@keyframes ep-fade { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
@keyframes ep-slide-in { from { opacity: 0; transform: translateX(-12px); } to { opacity: 1; transform: none; } }

/* ── Shell ── */
.ep-shell {
  position: fixed; inset: 0; overflow: hidden;
  display: flex; flex-direction: column;
  font-family: ${MONO}; z-index: 13000;
}

/* ══════════════════════════════════════════════
   INTERACTIVE MODE
══════════════════════════════════════════════ */
.ep-shell[data-mode="interactive"] {
  background: ${I.BG}; color: ${I.TEXT};
}
.ep-shell[data-mode="interactive"]::before {
  content: ''; position: absolute; inset: 0; pointer-events: none; z-index: 0;
  background-image: radial-gradient(rgba(255,255,255,0.04) 0.8px, transparent 0.8px);
  background-size: 18px 18px;
}
.ep-shell[data-mode="interactive"] .ep-header {
  border-bottom: 1px solid ${I.LINE}; background: rgba(17,17,17,0.9);
}
.ep-shell[data-mode="interactive"] .ep-nav-btn {
  border: 1px solid ${I.LINE_S}; background: rgba(255,255,255,0.05); color: ${I.TEXT};
}
.ep-shell[data-mode="interactive"] .ep-nav-btn:hover {
  background: rgba(255,255,255,0.12); border-color: rgba(255,255,255,0.3);
}
.ep-shell[data-mode="interactive"] .ep-hero { border-bottom: 1px solid ${I.LINE}; }
.ep-shell[data-mode="interactive"] .ep-hero-label { color: ${I.ACCENT}; }
.ep-shell[data-mode="interactive"] .ep-hero-loc,
.ep-shell[data-mode="interactive"] .ep-hero-meta { color: ${I.DIM}; }
.ep-shell[data-mode="interactive"] .ep-hero-desc { color: ${I.DIM}; }
.ep-shell[data-mode="interactive"] .ep-card {
  border: 1px solid ${I.LINE}; background: rgba(255,255,255,0.025);
}
.ep-shell[data-mode="interactive"] .ep-card:hover {
  border-color: rgba(204,255,0,0.4); background: rgba(204,255,0,0.03);
}
.ep-shell[data-mode="interactive"] .ep-card-no-img { background: #1a1a1a; }
.ep-shell[data-mode="interactive"] .ep-card-num { color: ${I.DIM}; }
.ep-shell[data-mode="interactive"] .ep-card-tag {
  border-color: ${I.LINE_S}; color: ${I.DIM};
}
.ep-shell[data-mode="interactive"] .ep-card-tag.permanent {
  border-color: rgba(204,255,0,0.3); color: ${I.ACCENT};
}
.ep-shell[data-mode="interactive"] .ep-card-sub { color: ${I.DIM}; }
.ep-shell[data-mode="interactive"] .ep-card-arrow { color: rgba(204,255,0,0.55); }
.ep-shell[data-mode="interactive"] .ep-grid::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); }

/* ══════════════════════════════════════════════
   DRAWING MODE — root
══════════════════════════════════════════════ */
.ep-shell[data-mode="drawing"] {
  background: ${D.BG}; color: ${D.TEXT};
}

/* ── Shared header ── */
.ep-header {
  position: relative; z-index: 20; flex-shrink: 0;
  display: flex; align-items: center; gap: 10px;
  padding: 0 18px; height: 46px;
  backdrop-filter: blur(10px);
}
.ep-shell[data-mode="drawing"] .ep-header {
  border-bottom: 3px solid ${D.LINE_S}; background: ${D.BG};
  backdrop-filter: none;
}
.ep-nav-btn {
  height: 26px; padding: 0 12px; border-radius: 2px;
  font-family: ${MONO}; font-size: 9px; font-weight: 700;
  letter-spacing: 0.12em; text-transform: uppercase;
  cursor: pointer; white-space: nowrap;
  border-width: 1px; border-style: solid;
  display: inline-flex; align-items: center;
  transition: all 0.12s;
}
.ep-shell[data-mode="drawing"] .ep-nav-btn {
  font-family: sans-serif;
  border: 2px solid ${D.LINE_S}; background: ${D.BG}; color: ${D.TEXT};
  box-shadow: 2px 2px 0 #111111;
  filter: url(#ep-sketch);
}
.ep-shell[data-mode="drawing"] .ep-nav-btn:hover {
  background: ${D.TEXT}; color: ${D.BG};
  box-shadow: none; transform: translate(2px, 2px);
}
.ep-header-meta {
  margin-left: auto; font-size: 9px; letter-spacing: 0.2em;
  white-space: nowrap; opacity: 0.38; text-transform: uppercase;
}

/* ══════════════════════════════════════════════
   INTERACTIVE — hero + grid
══════════════════════════════════════════════ */
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
  font-size: 10px; line-height: 1.8; letter-spacing: 0.03em; max-width: 520px;
}
.ep-main {
  position: relative; z-index: 2; flex: 1; min-height: 0; overflow: hidden;
}
.ep-grid {
  position: absolute; inset: 0;
  overflow-y: auto; overflow-x: hidden;
  padding: 18px 20px 28px;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 14px; align-content: start;
}
.ep-grid::-webkit-scrollbar { width: 4px; }
.ep-grid::-webkit-scrollbar-track { background: transparent; }
.ep-card {
  border-radius: 3px; overflow: hidden; cursor: pointer;
  display: flex; flex-direction: column;
  transition: all 0.18s ease;
  animation: ep-fade 0.38s ease both;
}
.ep-card-img { width: 100%; aspect-ratio: 4/3; object-fit: cover; display: block; flex-shrink: 0; }
.ep-card-no-img {
  width: 100%; aspect-ratio: 4/3;
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}
.ep-card-body { padding: 12px 13px 15px; display: flex; flex-direction: column; gap: 6px; flex: 1; }
.ep-card-num { font-size: 8px; letter-spacing: 0.28em; }
.ep-card-tag {
  display: inline-flex; align-items: center;
  height: 18px; padding: 0 7px; border-radius: 2px;
  font-size: 8px; letter-spacing: 0.1em; text-transform: uppercase;
  width: fit-content; border-width: 1px; border-style: solid;
}
.ep-card-title { font-size: 12.5px; font-weight: 700; line-height: 1.28; margin: 0; }
.ep-card-sub { font-size: 9px; letter-spacing: 0.1em; text-transform: uppercase; }
.ep-card-arrow { margin-top: auto; padding-top: 7px; font-size: 9px; letter-spacing: 0.16em; }
.ep-empty { padding: 32px 20px; font-size: 10px; letter-spacing: 0.2em; opacity: 0.45; }

/* ══════════════════════════════════════════════
   DRAWING MODE — LIST PAGE  (.dg-page)
══════════════════════════════════════════════ */
.dg-page {
  position: relative; z-index: 2; flex: 1; min-height: 0;
  overflow-y: auto; overflow-x: hidden;
  background: #ffffff;
}

/* Museum hero block */
.dg-hero {
  padding: 40px 40px 32px;
  border-bottom: 3px solid #111111;
}
.dg-hero-eyebrow {
  display: flex; align-items: baseline; justify-content: space-between;
  margin-bottom: 16px;
}
.dg-hero-tag {
  font-family: sans-serif; font-size: 7.5px; font-weight: 900;
  letter-spacing: 0.52em; text-transform: uppercase;
  color: rgba(17,17,17,0.35); filter: url(#ep-sketch);
}
.dg-hero-coords {
  font-size: 9px; letter-spacing: 0.18em; color: rgba(17,17,17,0.28);
  filter: url(#ep-sketch);
}
.dg-museum-name {
  font-family: sans-serif; font-weight: 900;
  font-size: clamp(40px, 7vw, 108px);
  line-height: 0.86; letter-spacing: -0.04em; text-transform: uppercase;
  margin: 0 0 28px; word-break: break-word;
  filter: url(#ep-text-wobble);
}
.dg-hero-meta {
  display: flex; gap: 24px; align-items: center; flex-wrap: wrap;
  font-family: sans-serif; font-size: 8.5px; letter-spacing: 0.26em; text-transform: uppercase;
  color: rgba(17,17,17,0.38); margin-bottom: 24px; filter: url(#ep-sketch);
}
.dg-hero-meta-sep { color: rgba(17,17,17,0.18); }
.dg-hero-desc {
  font-size: 10.5px; line-height: 1.9; max-width: 560px;
  color: rgba(17,17,17,0.58);
  padding-left: 16px; border-left: 3px solid #111111;
  filter: url(#ep-sketch);
}

/* Thick rule */
.dg-rule { height: 3px; background: #111111; filter: url(#ep-sketch); flex-shrink: 0; }
.dg-rule-thin { height: 1px; background: rgba(17,17,17,0.1); }

/* Exhibition count header */
.dg-list-hd {
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px 40px;
  font-family: sans-serif; font-size: 7.5px; font-weight: 700;
  letter-spacing: 0.4em; text-transform: uppercase; color: rgba(17,17,17,0.32);
  filter: url(#ep-sketch);
}

/* Exhibition rows */
.dg-row {
  display: flex; align-items: stretch; min-height: 88px; cursor: pointer;
  border-bottom: 1px solid rgba(17,17,17,0.1);
  transition: background 0.12s, color 0.12s;
  animation: ep-fade 0.3s ease both;
}
.dg-row:hover { background: #111111; color: #ffffff; }
.dg-row:hover .dg-row-num { color: rgba(255,255,255,0.14); border-right-color: rgba(255,255,255,0.08); }
.dg-row:hover .dg-row-meta { color: rgba(255,255,255,0.35); }
.dg-row:hover .dg-row-badge { border-color: rgba(255,255,255,0.25); color: rgba(255,255,255,0.55); background: transparent; }
.dg-row:hover .dg-row-badge.perm { background: #CCFF00; border-color: #CCFF00; color: #111111; }
.dg-row:hover .dg-row-arrow { color: #CCFF00; border-left-color: rgba(255,255,255,0.08); }

.dg-row-num {
  width: 88px; flex-shrink: 0;
  display: flex; align-items: flex-start; justify-content: center; padding-top: 26px;
  font-family: sans-serif; font-size: 14px; font-weight: 900; letter-spacing: 0.04em;
  color: rgba(17,17,17,0.14); border-right: 1px solid rgba(17,17,17,0.1);
  filter: url(#ep-sketch);
}
.dg-row-body { flex: 1; padding: 24px 28px; }
.dg-row-title {
  font-family: sans-serif; font-weight: 900;
  font-size: clamp(16px, 2.3vw, 24px); text-transform: uppercase; letter-spacing: 0.02em;
  margin: 0 0 9px; line-height: 1.12; filter: url(#ep-text-wobble);
}
.dg-row-meta {
  font-size: 8.5px; letter-spacing: 0.2em; text-transform: uppercase;
  color: rgba(17,17,17,0.36); filter: url(#ep-sketch);
}
.dg-row-badge-cell {
  display: flex; align-items: center; padding: 24px 24px;
}
.dg-row-badge {
  font-family: sans-serif; font-size: 7.5px; font-weight: 900; letter-spacing: 0.12em;
  text-transform: uppercase; border: 2px solid #111111; padding: 5px 10px;
  white-space: nowrap; filter: url(#ep-sketch);
}
.dg-row-badge.perm { background: #CCFF00; }
.dg-row-arrow {
  width: 68px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  font-size: 22px; font-weight: 900; color: rgba(17,17,17,0.16);
  border-left: 1px solid rgba(17,17,17,0.1); filter: url(#ep-sketch);
}

/* ══════════════════════════════════════════════
   DRAWING MODE — DETAIL PAGE  (.dg-detail)
   Top info strip + full-width artwork canvas
══════════════════════════════════════════════ */
.dg-detail {
  position: relative; z-index: 2; flex: 1; min-height: 0;
  display: flex; flex-direction: column; overflow: hidden;
  background: #ffffff;
}

/* Horizontal info strip at top — editorial header bar */
.dg-detail-strip {
  flex-shrink: 0;
  display: flex; align-items: center;
  border-bottom: 3px solid #111111;
  min-height: 60px; padding: 0;
  background: #ffffff;
  gap: 0;
}

/* Type badge: horizontal pill left side */
.dg-detail-type {
  flex-shrink: 0; display: flex; align-items: center;
  align-self: stretch;
  padding: 0 16px;
  font-family: sans-serif; font-size: 7.5px; font-weight: 900;
  letter-spacing: 0.22em; text-transform: uppercase; color: #111111;
  background: #CCFF00; border-right: 3px solid #111111;
  white-space: nowrap;
  filter: url(#ep-sketch);
}
.dg-detail-type.temp {
  background: #f5f5f5; color: rgba(17,17,17,0.5);
}

/* Exhibition title + stats */
.dg-detail-info {
  flex: 1; display: flex; flex-direction: row; align-items: baseline;
  gap: 20px; padding: 0 24px;
  overflow: hidden;
}
.dg-detail-title {
  font-family: sans-serif; font-weight: 900;
  font-size: clamp(14px, 1.9vw, 22px); text-transform: uppercase;
  letter-spacing: 0.01em; line-height: 1; margin: 0;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  filter: url(#ep-text-wobble);
}
.dg-detail-sub {
  font-size: 8px; letter-spacing: 0.24em; text-transform: uppercase;
  color: rgba(17,17,17,0.35); white-space: nowrap; flex-shrink: 0;
}

/* Exhibition switcher list — shown when multiple exhibitions */
.dg-detail-switcher {
  width: 200px; flex-shrink: 0; overflow-y: auto;
  padding: 8px 10px;
  display: flex; flex-direction: column; gap: 2px;
}
.dg-detail-sw-label {
  font-family: sans-serif; font-size: 6.5px; font-weight: 700;
  letter-spacing: 0.38em; text-transform: uppercase;
  color: rgba(17,17,17,0.28); padding: 4px 6px 6px;
  filter: url(#ep-sketch);
}
.dg-detail-sw-item {
  padding: 6px 8px; cursor: pointer;
  font-family: sans-serif; font-size: 9px; font-weight: 700;
  text-transform: uppercase; letter-spacing: 0.03em; line-height: 1.2;
  border: 2px solid transparent; transition: all 0.1s;
  filter: url(#ep-text-wobble);
}
.dg-detail-sw-item:hover { background: #111111; color: #ffffff; border-color: #111111; }
.dg-detail-sw-item.active { background: #CCFF00; border-color: #111111; color: #111111; }

/* Full-width artwork canvas — ExhibitionModal lives here */
.dg-detail-canvas {
  flex: 1; min-height: 0; position: relative; overflow: hidden;
}

/* Mobile */
@media (max-width: 640px) {
  .dg-hero { padding: 24px 20px 20px; }
  .dg-list-hd { padding: 10px 20px; }
  .dg-row-num { width: 56px; padding-top: 22px; }
  .dg-row-body { padding: 20px 16px; }
  .dg-row-badge-cell { display: none; }
  .dg-detail-strip { min-height: 50px; }
  .dg-detail-type { padding: 0 12px; font-size: 7px; }
  .dg-detail-info { padding: 0 14px; gap: 10px; }
  .dg-detail-title { font-size: 13px; }
  .dg-detail-switcher { display: none; }
  .dg-detail-info { padding: 12px 16px; }
  .ep-grid { padding: 12px 14px 20px; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 10px; }
  .ep-header { padding: 0 12px; height: 42px; }
  .ep-header-meta { display: none; }
  .ep-hero { padding: 16px 14px 14px; }
  .ep-hero-name { font-size: clamp(20px, 6vw, 36px); margin-bottom: 8px; }
  .ep-hero-desc { font-size: 10px; max-width: 100%; }
  .ep-card-title { font-size: 11px; }
}

/* ══════════════════════════════════════════════
   ExhibitionModal sketch variant overrides
   Unify style with dg-detail-strip
══════════════════════════════════════════════ */
.sketch-modal-theme img {
  filter: sepia(0.18) contrast(1.06) brightness(0.96) saturate(0.9);
}

/* Filter buttons → sharp corners, bold borders, brutalist */
.sketch-modal-theme button {
  box-sizing: border-box !important;
  border-radius: 0 !important;
  border: 1.5px solid rgba(17,17,17,0.55) !important;
  font-family: sans-serif !important;
  font-weight: 700 !important;
  letter-spacing: 0.06em !important;
  font-size: 9px !important;
  height: 22px !important;
  padding: 0 8px !important;
}

/* Tab headers (PANORAMA / ARCHIVE / GALLERY) */
.sketch-modal-theme [style*="fontSize: 12"] {
  font-family: sans-serif !important;
  letter-spacing: 0.12em !important;
}

/* SEARCH label */
.sketch-modal-theme [style*="letterSpacing: 1.2"] {
  font-family: sans-serif !important;
  font-weight: 700 !important;
  letter-spacing: 0.3em !important;
  font-size: 8px !important;
  color: rgba(17,17,17,0.38) !important;
}

/* Metadata field labels (TITLE, DATE, CREATOR…) */
.sketch-modal-theme [style*="letterSpacing: '0.2em'"],
.sketch-modal-theme [style*='letterSpacing: "0.2em"'] {
  font-family: sans-serif !important;
}

/* Search input — bottom line only, no box */
.sketch-modal-theme input[type="text"],
.sketch-modal-theme input:not([type]) {
  -webkit-appearance: none !important;
  appearance: none !important;
  border-radius: 0 !important;
  border: none !important;
  border-bottom: 1.5px solid rgba(17,17,17,0.3) !important;
  font-family: sans-serif !important;
  font-size: 9px !important;
  letter-spacing: 0.08em !important;
  background: transparent !important;
  background-color: transparent !important;
  padding: 2px 0 !important;
  box-shadow: none !important;
  -webkit-box-shadow: none !important;
}
.sketch-modal-theme input[type="text"]:focus,
.sketch-modal-theme input:not([type]):focus {
  border-bottom-color: #111111 !important;
  outline: none !important;
  box-shadow: none !important;
  -webkit-box-shadow: none !important;
  background: transparent !important;
}
/* Clear button inside search — no box border */
.sketch-modal-theme input[type="text"] + button,
.sketch-modal-theme .search-clear-btn {
  border: none !important;
  background: transparent !important;
  height: auto !important;
  padding: 2px !important;
}
`;

// ── Corner tick marks (drawing mode aesthetic) ────────────────────
const DrawingCorner = ({
  pos, color, size = 14, offset = 10, zIndex = 3,
}: { pos: 'tl' | 'tr' | 'bl' | 'br'; color: string; size?: number; offset?: number; zIndex?: number }) => {
  const style: React.CSSProperties = {
    position: 'absolute',
    top:    pos.startsWith('t') ? offset : undefined,
    bottom: pos.startsWith('b') ? offset : undefined,
    left:   pos.endsWith('l')   ? offset : undefined,
    right:  pos.endsWith('r')   ? offset : undefined,
    transform: `scale(${pos.endsWith('r') ? -1 : 1},${pos.startsWith('b') ? -1 : 1})`,
    pointerEvents: 'none',
    zIndex,
  };
  const v = size;
  return (
    <svg width={v} height={v} viewBox={`0 0 ${v} ${v}`} style={style}>
      <path d={`M 0 ${v} L 0 0 L ${v} 0`} fill="none" stroke={color} strokeWidth="1.5" />
    </svg>
  );
};

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
  const [isSwitcherOpen, setIsSwitcherOpen] = useState<boolean>(false);

  const allExhibitions = useMemo<ExhibitionWithType[]>(() => [
    ...(museum.permanentExhibitions || []).map((e) => ({ ...e, type: 'PERMANENT' as const })),
    ...(museum.temporaryExhibitions || []).map((e) => ({ ...e, type: 'TEMPORARY' as const })),
  ], [museum.permanentExhibitions, museum.temporaryExhibitions]);

  const totalArtworks = allExhibitions.reduce((s, ex) => s + (ex.artworks?.length || 0), 0);

  const openExhibition = (item: ExhibitionWithType) => setActiveItem(item);
  const closeDetail = () => setActiveItem(null);

  return (
    <div className="ep-shell" data-mode={mode}>

      {/* ── Drawing mode SVG filter defs ── */}
      {isDrawingMode && (
        <svg style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden', pointerEvents: 'none' }} aria-hidden="true">
          <defs>
            <filter id="ep-sketch">
              <feTurbulence type="fractalNoise" baseFrequency="0.05" numOctaves="3" result="noise" />
              <feDisplacementMap in="SourceGraphic" in2="noise" scale="2" xChannelSelector="R" yChannelSelector="G" />
            </filter>
            <filter id="ep-text-wobble">
              <feTurbulence type="fractalNoise" baseFrequency="0.018" numOctaves="2" result="noise" />
              <feDisplacementMap in="SourceGraphic" in2="noise" scale="6" xChannelSelector="R" yChannelSelector="G" />
            </filter>
          </defs>
        </svg>
      )}

      {/* Corner brackets */}
      {isDrawingMode && !activeItem && (
        <>
          <DrawingCorner pos="bl" color={D.TEXT} size={16} offset={12} zIndex={3} />
          <DrawingCorner pos="br" color={D.TEXT} size={16} offset={12} zIndex={3} />
        </>
      )}

      {/* ══ HEADER ══ */}
      <header className="ep-header">
        <button
          className="ep-nav-btn"
          onClick={() => isDrawingMode
            ? navigate('/?drawingMap=true')
            : navigate('/', { state: { fromInteractiveMap: true } })
          }
        >
          ← MAP
        </button>
        {activeItem && (
          <button className="ep-nav-btn" onClick={closeDetail}>
            ← EXHIBITIONS
          </button>
        )}
        <span className="ep-header-meta">
          {activeItem
            ? museum.name.toUpperCase()
            : (museum.location || museum.name || 'GLOBAL').toUpperCase()}
        </span>
      </header>

      {/* ══ INTERACTIVE MODE ══ */}
      {!isDrawingMode && !activeItem && (
        <section className="ep-hero">
          <div className="ep-hero-label">ARMIN · INTERACTIVE</div>
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
              {museum.description.length > 230 ? `${museum.description.slice(0, 230)}…` : museum.description}
            </p>
          )}
        </section>
      )}
      {!isDrawingMode && !activeItem && (
        <main className="ep-main">
          <div className="ep-grid">
            {allExhibitions.map((ex, idx) => (
              <article
                key={ex.id + idx}
                className="ep-card"
                style={{ animationDelay: `${idx * 60}ms` }}
                onClick={() => openExhibition(ex)}
              >
                {ex.image
                  ? <img src={ex.image} alt={ex.title || ex.name} className="ep-card-img" />
                  : <div className="ep-card-no-img"><MiniGlobe dark={true} /></div>}
                <div className="ep-card-body">
                  <span className="ep-card-num">{String(idx + 1).padStart(2, '0')}</span>
                  <span className={`ep-card-tag${ex.type === 'PERMANENT' ? ' permanent' : ''}`}>{ex.type}</span>
                  <h3 className="ep-card-title">{ex.title || ex.name}</h3>
                  <p className="ep-card-sub">{ex.artworks?.length ? `${ex.artworks.length} artworks` : 'Open collection'}</p>
                  <div className="ep-card-arrow">EXPLORE →</div>
                </div>
              </article>
            ))}
            {allExhibitions.length === 0 && <div className="ep-empty">NO EXHIBITIONS FOUND</div>}
          </div>
        </main>
      )}

      {/* ══ DRAWING MODE — LIST VIEW ══ */}
      {isDrawingMode && !activeItem && (
        <div className="dg-page">

          {/* Museum hero */}
          <div className="dg-hero">
            <div className="dg-hero-eyebrow">
              <span className="dg-hero-tag">ARMIN · DRAWING MAP</span>
              {typeof museum.latitude === 'number' && typeof museum.longitude === 'number' && (
                <span className="dg-hero-coords">
                  {Math.abs(museum.latitude).toFixed(2)}°{museum.latitude >= 0 ? 'N' : 'S'}&nbsp;
                  {Math.abs(museum.longitude).toFixed(2)}°{museum.longitude >= 0 ? 'E' : 'W'}
                </span>
              )}
            </div>
            <h1 className="dg-museum-name">{museum.name}</h1>
            <div className="dg-hero-meta">
              {museum.location && <span>{museum.location}</span>}
              {museum.location && <span className="dg-hero-meta-sep">·</span>}
              <span>{allExhibitions.length} exhibition{allExhibitions.length !== 1 ? 's' : ''}</span>
              {totalArtworks > 0 && (
                <>
                  <span className="dg-hero-meta-sep">·</span>
                  <span>{totalArtworks.toLocaleString()} works</span>
                </>
              )}
            </div>
            {museum.description && (
              <p className="dg-hero-desc">
                {museum.description.length > 300 ? `${museum.description.slice(0, 300)}…` : museum.description}
              </p>
            )}
          </div>

          {/* Exhibition index */}
          <div className="dg-rule" />
          <div className="dg-list-hd">
            <span>EXHIBITIONS</span>
            <span>{allExhibitions.length}</span>
          </div>
          <div className="dg-rule" />

          {allExhibitions.map((ex, idx) => (
            <div
              key={ex.id + idx}
              className="dg-row"
              style={{ animationDelay: `${idx * 45}ms` }}
              onClick={() => openExhibition(ex)}
            >
              <div className="dg-row-num">{String(idx + 1).padStart(2, '0')}</div>
              <div className="dg-row-body">
                <h3 className="dg-row-title">{ex.title || ex.name}</h3>
                <div className="dg-row-meta">
                  {ex.artworks?.length ? `${ex.artworks.length} artworks` : 'Open collection'}
                </div>
              </div>
              <div className="dg-row-badge-cell">
                <span className={`dg-row-badge${ex.type === 'PERMANENT' ? ' perm' : ''}`}>{ex.type}</span>
              </div>
              <div className="dg-row-arrow">→</div>
            </div>
          ))}

          {allExhibitions.length === 0 && (
            <div style={{ padding: '32px 40px', fontFamily: 'sans-serif', fontSize: 10, letterSpacing: '0.2em', opacity: 0.4 }}>
              NO EXHIBITIONS
            </div>
          )}
        </div>
      )}

      {/* ══ DRAWING MODE — DETAIL VIEW ══
          Top horizontal info strip + full-width ExhibitionModal below
          No left panel = no blank space offset
      ══ */}
      {isDrawingMode && activeItem && (
        <div className="dg-detail">

          {/* Horizontal info strip */}
          <div className="dg-detail-strip">

            {/* Type badge — horizontal, left side */}
            <div className={`dg-detail-type${activeItem.type === 'TEMPORARY' ? ' temp' : ''}`}>
              {activeItem.type}
            </div>

            {/* Exhibition title + artwork count */}
            <div className="dg-detail-info">
              <h2 className="dg-detail-title">{activeItem.title || activeItem.name}</h2>
              <div className="dg-detail-sub">
                {activeItem.artworks?.length
                  ? `${activeItem.artworks.length} works`
                  : 'open collection'}
              </div>
            </div>

            {/* Exhibition switcher — only when multiple exhibitions */}
            {allExhibitions.length > 1 && (
              <div className="dg-detail-switcher" style={{ position: 'relative', overflow: 'visible' }}>
                <div 
                  className="dg-detail-sw-label"
                  onClick={() => setIsSwitcherOpen(!isSwitcherOpen)}
                  style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                >
                  <span>Switch</span>
                  <span style={{ fontSize: '8px', transform: isSwitcherOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▼</span>
                </div>
                {isSwitcherOpen && (
                  <div style={{
                    position: 'absolute',
                    top: '32px',
                    left: 0,
                    width: '100%',
                    background: '#ffffff',
                    border: '1.5px solid rgba(17,17,17,0.55)',
                    padding: '8px 10px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '2px',
                    zIndex: 9999,
                    boxShadow: '4px 4px 0 rgba(0,0,0,0.1)'
                  }}>
                    {allExhibitions.map((ex, idx) => {
                      const isActive = ex.id === activeItem.id && ex.type === activeItem.type;
                      return (
                        <div
                          key={ex.id + idx}
                          className={`dg-detail-sw-item${isActive ? ' active' : ''}`}
                          onClick={() => {
                            openExhibition(ex);
                            setIsSwitcherOpen(false);
                          }}
                        >
                          {ex.title || ex.name}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Full-width artwork canvas — ExhibitionModal with no side offsets */}
          <div className="dg-detail-canvas">
            <Suspense fallback={
              <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#ffffff' }}>
                <DrawingLoader visible label="COLLECTION" />
              </div>
            }>
              <ExhibitionModal
                exhibition={activeItem}
                museumName={museum.name}
                onClose={closeDetail}
                inline={true}
                variant="sketch"
              />
            </Suspense>
          </div>
        </div>
      )}

      {/* ══ INTERACTIVE MODE — full-screen exhibition modal ══ */}
      {activeItem && !isDrawingMode && (
        <Suspense fallback={
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(17,17,17,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 14000 }}>
            <DrawingLoader visible label="COLLECTION" />
          </div>
        }>
          <ExhibitionModal
            exhibition={activeItem}
            museumName={museum.name}
            onClose={closeDetail}
            inline={false}
            variant="default"
            theme="dark"
          />
        </Suspense>
      )}
    </div>
  );
}
