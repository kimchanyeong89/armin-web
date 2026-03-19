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

// Drawing mode — matches DrawingGlobe's WHITE + black brutalist aesthetic
const D = {
  BG:     '#FFFFFF',
  TEXT:   '#111111',
  ACCENT: '#CCFF00',
  DIM:    'rgba(17,17,17,0.55)',
  LINE:   'rgba(17,17,17,0.10)',
  LINE_S: '#111111',
  STAMP:  '#111111',
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
   WHITE brutalist sketch — matches DrawingGlobe's paper aesthetic
═══════════════════════════════════════════════════ */
.ep-shell[data-mode="drawing"] {
  background: ${D.BG}; color: ${D.TEXT};
}

.ep-shell[data-mode="drawing"] .ep-header {
  border-bottom: 3px solid ${D.LINE_S};
  background: ${D.BG};
  backdrop-filter: none;
}

/* ── TYPOGRAPHY — heavy sans-serif + analog wobble filter ── */
.ep-shell[data-mode="drawing"] .ep-hero-name {
  font-family: sans-serif; font-weight: 900;
  letter-spacing: -0.02em;
  filter: url(#ep-text-wobble);
}
.ep-shell[data-mode="drawing"] .ep-hero-label {
  font-family: sans-serif; color: rgba(17,17,17,0.45);
  letter-spacing: 0.5em; font-size: 7.5px;
  filter: url(#ep-text-wobble);
}
.ep-shell[data-mode="drawing"] .ep-card-title {
  font-family: sans-serif; font-weight: 900; letter-spacing: 0.02em; text-transform: uppercase;
  filter: url(#ep-text-wobble);
}
.ep-shell[data-mode="drawing"] .ep-card-arrow {
  font-family: sans-serif; font-weight: 900; letter-spacing: 0.15em;
  filter: url(#ep-text-wobble);
}
.ep-shell[data-mode="drawing"] .ep-hero-desc {
  filter: url(#ep-sketch);
}
.ep-shell[data-mode="drawing"] .ep-header-meta {
  filter: url(#ep-sketch);
}

/* ── NAV BUTTONS ── */
.ep-shell[data-mode="drawing"] .ep-nav-btn {
  font-family: sans-serif;
  border: 2px solid ${D.LINE_S};
  background: ${D.BG}; color: ${D.TEXT};
  box-shadow: 3px 3px 0px rgba(17,17,17,1);
  transition: background 0.12s, color 0.12s, box-shadow 0.12s, transform 0.12s;
  filter: url(#ep-sketch);
}
.ep-shell[data-mode="drawing"] .ep-nav-btn:hover {
  background: ${D.TEXT};
  color: ${D.BG};
  box-shadow: none;
  transform: translate(3px, 3px);
}

.ep-shell[data-mode="drawing"] .ep-hero {
  border-bottom: 2px solid ${D.LINE_S};
}

.ep-shell[data-mode="drawing"] .ep-hero-loc,
.ep-shell[data-mode="drawing"] .ep-hero-meta {
  color: ${D.DIM};
  filter: url(#ep-sketch);
}

.ep-shell[data-mode="drawing"] .ep-hero-desc {
  color: rgba(17,17,17,0.65);
  border-left: 3px solid ${D.LINE_S};
  padding-left: 12px;
  margin-top: 14px;
}

/* Drawing mode cards — brutalist white + black border + sketch filter */
.ep-shell[data-mode="drawing"] .ep-card {
  border: 2px solid ${D.LINE_S};
  background: ${D.BG};
  box-shadow: 5px 5px 0px rgba(17,17,17,1);
  position: relative;
  transition: box-shadow 0.15s ease, transform 0.15s ease;
  filter: url(#ep-sketch);
}
.ep-shell[data-mode="drawing"] .ep-card:hover {
  box-shadow: 7px 7px 0px rgba(17,17,17,1);
  transform: translate(-2px, -2px);
}

.ep-shell[data-mode="drawing"] .ep-card-no-img {
  background: #f0f0f0;
}

.ep-shell[data-mode="drawing"] .ep-card-num {
  color: rgba(17,17,17,0.28); font-size: 9px;
  filter: url(#ep-sketch);
}

.ep-shell[data-mode="drawing"] .ep-card-tag {
  border: 2px solid ${D.LINE_S}; color: ${D.TEXT};
  background: transparent; font-weight: 700; font-family: sans-serif;
}
.ep-shell[data-mode="drawing"] .ep-card-tag.permanent {
  background: ${D.ACCENT}; border-color: ${D.LINE_S}; color: ${D.TEXT};
  font-weight: 900;
}

.ep-shell[data-mode="drawing"] .ep-card-sub { color: ${D.DIM}; filter: url(#ep-sketch); }

.ep-shell[data-mode="drawing"] .ep-switcher-panel {
  background: ${D.BG}; border: 2px solid ${D.LINE_S};
  box-shadow: 6px 6px 0px rgba(17,17,17,1);
  filter: url(#ep-sketch);
}

.ep-shell[data-mode="drawing"] .ep-switcher-input {
  background: #f5f5f5; border: 1px solid rgba(17,17,17,0.2);
  color: ${D.TEXT}; font-family: sans-serif;
}

.ep-shell[data-mode="drawing"] .ep-switcher-item {
  border-left: 3px solid transparent;
}
.ep-shell[data-mode="drawing"] .ep-switcher-item.active {
  background: ${D.ACCENT}; border-left-color: ${D.LINE_S};
}
.ep-shell[data-mode="drawing"] .ep-switcher-item:hover:not(.active) {
  background: rgba(17,17,17,0.05);
}
.ep-shell[data-mode="drawing"] .ep-switcher-title { color: ${D.TEXT}; font-family: sans-serif; font-weight: 900; text-transform: uppercase; }
.ep-shell[data-mode="drawing"] .ep-switcher-title.active { color: ${D.TEXT}; }
.ep-shell[data-mode="drawing"] .ep-switcher-sub { color: ${D.DIM}; }

.ep-shell[data-mode="drawing"] .ep-grid::-webkit-scrollbar-thumb { background: rgba(17,17,17,0.18); }

/* ExhibitionModal sketch variant — vintage photo effect on images, no torn displacement */
.sketch-modal-theme img {
  filter: sepia(0.18) contrast(1.06) brightness(0.96) saturate(0.9);
}

/* ══════════════════════════════════════════════
   DRAWING MODE — LIST VIEW  (ep-dg-*)
══════════════════════════════════════════════ */
.ep-dg-page {
  position: relative; z-index: 2; flex: 1; min-height: 0;
  overflow-y: auto; overflow-x: hidden;
}

/* Hero */
.ep-dg-hero { padding: 32px 36px 26px; }

.ep-dg-label-row {
  display: flex; align-items: baseline; justify-content: space-between;
  margin-bottom: 10px;
}
.ep-dg-label {
  font-family: sans-serif; font-size: 8px; font-weight: 700;
  letter-spacing: 0.48em; text-transform: uppercase; color: rgba(17,17,17,0.4);
  filter: url(#ep-sketch);
}
.ep-dg-coords {
  font-size: 9px; letter-spacing: 0.2em; color: rgba(17,17,17,0.35);
  filter: url(#ep-sketch);
}
.ep-dg-name {
  font-family: sans-serif; font-weight: 900;
  font-size: clamp(38px, 6.5vw, 96px);
  line-height: 0.88; letter-spacing: -0.03em; text-transform: uppercase;
  margin: 0 0 24px; word-break: break-word;
  filter: url(#ep-text-wobble);
}
.ep-dg-sub {
  display: flex; gap: 20px; align-items: center; flex-wrap: wrap;
  font-family: sans-serif; font-size: 9px; letter-spacing: 0.22em; text-transform: uppercase;
  color: rgba(17,17,17,0.4); margin-bottom: 20px;
  filter: url(#ep-sketch);
}
.ep-dg-sub-sep { color: rgba(17,17,17,0.2); }
.ep-dg-desc {
  font-size: 11px; line-height: 1.9; max-width: 520px; color: rgba(17,17,17,0.6);
  padding-left: 14px; border-left: 3px solid #111111;
  filter: url(#ep-sketch);
}

/* Dividers */
.ep-dg-rule { height: 3px; background: #111111; filter: url(#ep-sketch); }
.ep-dg-rule-thin { height: 1px; background: rgba(17,17,17,0.12); }

/* Index label row */
.ep-dg-index-hd {
  display: flex; align-items: center; justify-content: space-between;
  padding: 11px 36px;
  font-family: sans-serif; font-size: 8px; font-weight: 700;
  letter-spacing: 0.32em; text-transform: uppercase; color: rgba(17,17,17,0.38);
  filter: url(#ep-sketch);
}

/* Exhibition rows */
.ep-dg-row {
  display: flex; align-items: stretch; min-height: 84px; cursor: pointer;
  border-bottom: 1px solid rgba(17,17,17,0.11);
  transition: background 0.1s, color 0.1s;
  animation: ep-fade 0.32s ease both;
}
.ep-dg-row:hover { background: #111111; color: #ffffff; }
.ep-dg-row:hover .ep-dg-row-num { color: rgba(255,255,255,0.18); border-right-color: rgba(255,255,255,0.1); }
.ep-dg-row:hover .ep-dg-row-meta { color: rgba(255,255,255,0.38); }
.ep-dg-row:hover .ep-dg-row-badge { border-color: rgba(255,255,255,0.28); color: rgba(255,255,255,0.6); background: transparent; }
.ep-dg-row:hover .ep-dg-row-badge.permanent { background: #CCFF00; border-color: #CCFF00; color: #111111; }
.ep-dg-row:hover .ep-dg-row-arrow { color: #CCFF00; border-left-color: rgba(255,255,255,0.1); }

.ep-dg-row-num {
  width: 80px; flex-shrink: 0;
  display: flex; align-items: flex-start; justify-content: center; padding-top: 24px;
  font-family: sans-serif; font-size: 13px; font-weight: 900; letter-spacing: 0.04em;
  color: rgba(17,17,17,0.18); border-right: 1px solid rgba(17,17,17,0.11);
  filter: url(#ep-sketch);
}
.ep-dg-row-body { flex: 1; padding: 22px 26px; }
.ep-dg-row-title {
  font-family: sans-serif; font-weight: 900;
  font-size: clamp(15px, 2.1vw, 22px); text-transform: uppercase; letter-spacing: 0.03em;
  margin: 0 0 8px; line-height: 1.15;
  filter: url(#ep-text-wobble);
}
.ep-dg-row-meta {
  font-size: 9px; letter-spacing: 0.18em; text-transform: uppercase;
  color: rgba(17,17,17,0.38); filter: url(#ep-sketch);
}
.ep-dg-row-badge-cell {
  display: flex; align-items: center; padding: 22px 22px;
}
.ep-dg-row-badge {
  font-family: sans-serif; font-size: 8px; font-weight: 700; letter-spacing: 0.1em;
  text-transform: uppercase; border: 2px solid #111111; padding: 4px 9px;
  white-space: nowrap; filter: url(#ep-sketch);
}
.ep-dg-row-badge.permanent { background: #CCFF00; }
.ep-dg-row-arrow {
  width: 64px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  font-size: 20px; font-weight: 900; color: rgba(17,17,17,0.18);
  border-left: 1px solid rgba(17,17,17,0.11);
  filter: url(#ep-sketch);
}

/* ══════════════════════════════════════════════
   DRAWING MODE — DETAIL (SPLIT) VIEW
══════════════════════════════════════════════ */
.ep-dg-split {
  position: relative; z-index: 2; flex: 1; min-height: 0;
  display: flex; overflow: hidden;
}

/* Left info panel — compact: type badge + title only */
.ep-dg-panel {
  width: 220px; flex-shrink: 0;
  border-right: 3px solid #111111;
  display: flex; flex-direction: column;
  background: #ffffff;
  overflow: hidden;
  filter: url(#ep-sketch);
  align-self: stretch;
}
.ep-dg-panel-type {
  padding: 8px 16px; flex-shrink: 0;
  font-family: sans-serif; font-size: 8px; font-weight: 900;
  letter-spacing: 0.22em; text-transform: uppercase; color: #111111;
  background: #CCFF00;
  filter: url(#ep-sketch);
}
.ep-dg-panel-type.temporary {
  background: transparent; border-bottom: 2px solid #111111;
}
.ep-dg-panel-title {
  padding: 16px 16px 14px; flex-shrink: 0;
  font-family: sans-serif; font-weight: 900;
  font-size: clamp(13px, 1.5vw, 18px); text-transform: uppercase; letter-spacing: 0.02em; line-height: 1.2;
  border-bottom: 2px solid #111111;
  filter: url(#ep-text-wobble);
}
.ep-dg-panel-desc {
  padding: 14px 16px; font-size: 9.5px; line-height: 1.75;
  color: rgba(17,17,17,0.55); border-bottom: 1px solid rgba(17,17,17,0.12);
  flex-shrink: 0;
  filter: url(#ep-sketch);
}
/* Exhibition switcher (shown when multiple exhibitions) */
.ep-dg-panel-others {
  flex: 1; overflow-y: auto; padding: 10px 12px;
}
.ep-dg-panel-others-label {
  font-family: sans-serif; font-size: 7px; font-weight: 700;
  letter-spacing: 0.3em; text-transform: uppercase; color: rgba(17,17,17,0.32);
  margin-bottom: 8px; filter: url(#ep-sketch);
}
.ep-dg-panel-other-item {
  padding: 8px 10px; cursor: pointer; margin-bottom: 2px;
  font-family: sans-serif; font-size: 10px; font-weight: 700;
  text-transform: uppercase; letter-spacing: 0.03em; line-height: 1.2;
  border: 2px solid transparent; transition: all 0.1s;
  filter: url(#ep-text-wobble);
}
.ep-dg-panel-other-item:hover { background: #111111; color: #ffffff; border-color: #111111; }
.ep-dg-panel-other-item.active { background: #CCFF00; border-color: #111111; color: #111111; }

/* Right artwork panel */
.ep-dg-canvas {
  position: absolute; left: 220px; top: 0; right: 0; bottom: 0; overflow: hidden;
}

/* Mobile */
@media (max-width: 640px) {
  .ep-dg-hero { padding: 22px 20px 18px; }
  .ep-dg-index-hd { padding: 10px 20px; }
  .ep-dg-row-num { width: 52px; padding-top: 20px; }
  .ep-dg-row-body { padding: 18px 16px; }
  .ep-dg-row-badge-cell { display: none; }
  .ep-dg-split { flex-direction: column; }
  .ep-dg-panel { width: 100%; border-right: none; border-bottom: 3px solid #111111; max-height: 180px; flex-direction: row; flex-wrap: wrap; overflow: hidden; align-self: auto; }
  .ep-dg-panel-title { flex: 1; font-size: 13px; padding: 12px 14px; }
  .ep-dg-panel-type { padding: 8px 14px; }
  .ep-dg-panel-stat, .ep-dg-panel-desc, .ep-dg-panel-others { display: none; }
  .ep-dg-canvas { position: absolute; left: 0; top: 180px; right: 0; bottom: 0; }
}

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
  const [, setIsSwitcherOpen] = useState(false);
  const [search] = useState('');

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

      {/* ── Drawing mode: SVG sketch filter defs ── */}
      {isDrawingMode && (
        <svg style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden', pointerEvents: 'none' }} aria-hidden="true">
          <defs>
            {/* UI elements (borders, buttons) — subtle wobble, same as DrawingGlobe dg-sketch-ui */}
            <filter id="ep-sketch">
              <feTurbulence type="fractalNoise" baseFrequency="0.05" numOctaves="3" result="noise" />
              <feDisplacementMap in="SourceGraphic" in2="noise" scale="2" xChannelSelector="R" yChannelSelector="G" />
            </filter>
            {/* Text titles — heavy analog wobble, same as DrawingGlobe dg-kitsch-wobble */}
            <filter id="ep-text-wobble">
              <feTurbulence type="fractalNoise" baseFrequency="0.018" numOctaves="2" result="noise" />
              <feDisplacementMap in="SourceGraphic" in2="noise" scale="6" xChannelSelector="R" yChannelSelector="G" />
            </filter>
          </defs>
        </svg>
      )}

      {/* ── Corner brackets — only on drawing mode list view ── */}
      {isDrawingMode && !activeItem && (
        <>
          <DrawingCorner pos="bl" color={D.TEXT} size={16} offset={12} zIndex={3} />
          <DrawingCorner pos="br" color={D.TEXT} size={16} offset={12} zIndex={3} />
        </>
      )}

      {/* ── Header ─────────────────────────────────────────────── */}
      <header className="ep-header">
        <button className="ep-nav-btn" onClick={() => navigate(backPath)}>← MAP</button>
        {activeItem && (
          <button className="ep-nav-btn" onClick={() => { setActiveItem(null); setIsSwitcherOpen(false); }}>
            ← EXHIBITIONS
          </button>
        )}
        <span className="ep-header-meta">
          {isDrawingMode && activeItem
            ? museum.name.toUpperCase()
            : (museum.location || 'GLOBAL').toUpperCase()}
        </span>
      </header>

      {/* ══ INTERACTIVE MODE: classic hero + card grid ══ */}
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
            {filteredExhibitions.map((ex, idx) => (
              <article key={ex.id + idx} className="ep-card" style={{ animationDelay: `${idx * 60}ms` }} onClick={() => openExhibition(ex)}>
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
            {filteredExhibitions.length === 0 && <div className="ep-empty">NO EXHIBITIONS FOUND</div>}
          </div>
        </main>
      )}

      {/* ══ DRAWING MODE: list view — full editorial layout ══ */}
      {isDrawingMode && !activeItem && (
        <div className="ep-dg-page">

          {/* — Museum hero — */}
          <div className="ep-dg-hero">
            <div className="ep-dg-label-row">
              <span className="ep-dg-label">ARMIN · DRAWING MAP</span>
              {typeof museum.latitude === 'number' && typeof museum.longitude === 'number' && (
                <span className="ep-dg-coords">
                  {Math.abs(museum.latitude).toFixed(2)}°{museum.latitude >= 0 ? 'N' : 'S'}&nbsp;
                  {Math.abs(museum.longitude).toFixed(2)}°{museum.longitude >= 0 ? 'E' : 'W'}
                </span>
              )}
            </div>
            <h1 className="ep-dg-name">{museum.name}</h1>
            <div className="ep-dg-sub">
              {museum.location && <span>{museum.location}</span>}
              {museum.location && <span className="ep-dg-sub-sep">·</span>}
              <span>{allExhibitions.length} exhibition{allExhibitions.length !== 1 ? 's' : ''}</span>
              {totalArtworks > 0 && <><span className="ep-dg-sub-sep">·</span><span>{totalArtworks.toLocaleString()} works</span></>}
            </div>
            {museum.description && (
              <p className="ep-dg-desc">
                {museum.description.length > 280 ? `${museum.description.slice(0, 280)}…` : museum.description}
              </p>
            )}
          </div>

          {/* — Exhibition index — */}
          <div className="ep-dg-rule" />
          <div className="ep-dg-index-hd">
            <span>EXHIBITIONS</span>
            <span>{allExhibitions.length}</span>
          </div>
          <div className="ep-dg-rule" />

          {allExhibitions.map((ex, idx) => (
            <div
              key={ex.id + idx}
              className="ep-dg-row"
              style={{ animationDelay: `${idx * 50}ms` }}
              onClick={() => openExhibition(ex)}
            >
              <div className="ep-dg-row-num">{String(idx + 1).padStart(2, '0')}</div>
              <div className="ep-dg-row-body">
                <h3 className="ep-dg-row-title">{ex.title || ex.name}</h3>
                <div className="ep-dg-row-meta">
                  {ex.artworks?.length ? `${ex.artworks.length} artworks` : 'Open collection'}
                </div>
              </div>
              <div className="ep-dg-row-badge-cell">
                <span className={`ep-dg-row-badge${ex.type === 'PERMANENT' ? ' permanent' : ''}`}>{ex.type}</span>
              </div>
              <div className="ep-dg-row-arrow">→</div>
            </div>
          ))}

          {allExhibitions.length === 0 && (
            <div style={{ padding: '32px 36px', fontFamily: 'sans-serif', fontSize: 10, letterSpacing: '0.2em', opacity: 0.4 }}>
              NO EXHIBITIONS
            </div>
          )}
        </div>
      )}

      {/* ══ DRAWING MODE: detail — split panel + artwork ══ */}
      {activeItem && isDrawingMode && (
        <div className="ep-dg-split">

          {/* Left: compact catalog strip */}
          <div className="ep-dg-panel">
            <div className={`ep-dg-panel-type${activeItem.type === 'TEMPORARY' ? ' temporary' : ''}`}>
              {activeItem.type}
            </div>
            <div className="ep-dg-panel-title">{activeItem.title || activeItem.name}</div>
            {activeItem.description && (
              <div className="ep-dg-panel-desc">
                {activeItem.description.length > 180
                  ? `${activeItem.description.slice(0, 180)}…`
                  : activeItem.description}
              </div>
            )}
            {/* Other exhibitions switcher — only shown when multiple */}
            {allExhibitions.length > 1 && (
              <div className="ep-dg-panel-others">
                <div className="ep-dg-panel-others-label">Switch</div>
                {allExhibitions.map((ex, idx) => {
                  const isActive = ex.id === activeItem.id;
                  return (
                    <div
                      key={ex.id + idx}
                      className={`ep-dg-panel-other-item${isActive ? ' active' : ''}`}
                      onClick={() => openExhibition(ex)}
                    >
                      {ex.title || ex.name}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right: artwork browser */}
          <div className="ep-dg-canvas">
            <div className="ep-inner">
              <Suspense fallback={
                <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#ffffff' }}>
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
            theme="dark"
          />
        </Suspense>
      )}
    </div>
  );
}
