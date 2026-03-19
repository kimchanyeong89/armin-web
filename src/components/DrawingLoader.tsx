import React from 'react';

// ── Design tokens ─────────────────────────────────────────────────
const BG     = '#111111';
const TEXT   = '#FFFFFF';
const ACCENT = '#CCFF00';
const MONO   = "'Space Mono', 'Courier New', monospace";

// ── CSS keyframes (injected once) ─────────────────────────────────
const KEYFRAMES = `
@keyframes dl-draw-globe {
  0%   { stroke-dashoffset: 534; opacity: 0.2; }
  15%  { opacity: 1; }
  70%  { stroke-dashoffset: 0; }
  85%  { stroke-dashoffset: 0; opacity: 1; }
  100% { stroke-dashoffset: 0; opacity: 0.2; }
}
@keyframes dl-draw-lat1 {
  0%,10% { stroke-dashoffset: 280; }
  65%    { stroke-dashoffset: 0; }
  100%   { stroke-dashoffset: 0; }
}
@keyframes dl-draw-lat2 {
  0%,20% { stroke-dashoffset: 400; }
  70%    { stroke-dashoffset: 0; }
  100%   { stroke-dashoffset: 0; }
}
@keyframes dl-draw-vline {
  0%,25% { stroke-dashoffset: 170; }
  75%    { stroke-dashoffset: 0; }
  100%   { stroke-dashoffset: 0; }
}
@keyframes dl-draw-hline {
  0%,30% { stroke-dashoffset: 170; }
  80%    { stroke-dashoffset: 0; }
  100%   { stroke-dashoffset: 0; }
}
@keyframes dl-dot-pulse {
  0%,100% { r: 2.5; opacity: 0.4; }
  50%     { r: 4;   opacity: 1; }
}
@keyframes dl-dot-blink {
  0%,100% { opacity: 0.15; transform: scale(0.7); }
  50%     { opacity: 1;    transform: scale(1); }
}
@keyframes dl-scan {
  0%   { left: -45%; opacity: 0; }
  10%  { opacity: 1; }
  90%  { opacity: 1; }
  100% { left: 110%; opacity: 0; }
}
@keyframes dl-corner-fade {
  0%,100% { opacity: 0.25; }
  50%     { opacity: 0.7; }
}
@keyframes dl-fade-in {
  from { opacity: 0; }
  to   { opacity: 1; }
}
`;

let injected = false;
function injectStyles() {
  if (injected || typeof document === 'undefined') return;
  const style = document.createElement('style');
  style.textContent = KEYFRAMES;
  document.head.appendChild(style);
  injected = true;
}

// ── Corner bracket decoration (used by full variant) ──────────────
const Corner = ({ pos }: { pos: 'tl' | 'tr' | 'bl' | 'br' }) => {
  const t = pos.startsWith('t') ? 20 : undefined;
  const b = pos.startsWith('b') ? 20 : undefined;
  const l = pos.endsWith('l') ? 20 : undefined;
  const r = pos.endsWith('r') ? 20 : undefined;
  const flipX = pos.endsWith('r');
  const flipY = pos.startsWith('b');
  return (
    <svg width={20} height={20} viewBox="0 0 20 20" style={{
      position: 'absolute', top: t, bottom: b, left: l, right: r,
      transform: `scale(${flipX ? -1 : 1},${flipY ? -1 : 1})`,
      animation: 'dl-corner-fade 2.4s ease-in-out infinite',
      animationDelay: `${(['tl','tr','bl','br'].indexOf(pos)) * 0.3}s`,
    }}>
      <path d="M 0 12 L 0 0 L 12 0" fill="none" stroke={ACCENT} strokeWidth="1.5" />
    </svg>
  );
};

// ── Shared globe SVG ──────────────────────────────────────────────
const GlobeSVG = ({ size, dur = '2.6s' }: { size: number; dur?: string }) => {
  const cx = size / 2, cy = size / 2, R = size * 0.43;
  const cMain = 2 * Math.PI * R;
  const cLat1 = cMain * 0.35;
  const cLat2 = cMain * 0.60;
  const cLine = R * 2;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ overflow: 'visible' }}>
      <circle cx={cx} cy={cy} r={R} fill="none" stroke={TEXT} strokeWidth="1.2"
        strokeDasharray={`${cMain} ${cMain}`}
        style={{ animation: `dl-draw-globe ${dur} ease-in-out infinite`, transformOrigin: `${cx}px ${cy}px` }} />
      <ellipse cx={cx} cy={cy} rx={R} ry={R * 0.28}
        fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="0.8"
        strokeDasharray={`${cLat1} ${cLat1}`}
        style={{ animation: `dl-draw-lat1 ${dur} ease-in-out infinite` }} />
      <ellipse cx={cx} cy={cy} rx={R} ry={R * 0.65}
        fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="0.8"
        strokeDasharray={`${cLat2} ${cLat2}`}
        style={{ animation: `dl-draw-lat2 ${dur} ease-in-out infinite` }} />
      <line x1={cx} y1={cy - R} x2={cx} y2={cy + R}
        stroke="rgba(255,255,255,0.3)" strokeWidth="0.8"
        strokeDasharray={`${cLine} ${cLine}`}
        style={{ animation: `dl-draw-vline ${dur} ease-in-out infinite` }} />
      <line x1={cx - R} y1={cy} x2={cx + R} y2={cy}
        stroke="rgba(255,255,255,0.3)" strokeWidth="0.8"
        strokeDasharray={`${cLine} ${cLine}`}
        style={{ animation: `dl-draw-hline ${dur} ease-in-out infinite` }} />
      <circle cx={cx} cy={cy} r={size * 0.025} fill={ACCENT}
        style={{ animation: `dl-dot-pulse ${dur} ease-in-out infinite` }} />
    </svg>
  );
};

// ── DrawingLoader ─────────────────────────────────────────────────
interface DrawingLoaderProps {
  visible?: boolean;
  label?: string;
  /**
   * 'full'  — full-screen dark overlay. Use for Suspense / initial page loads.
   * 'badge' — small floating card centered on screen over existing content.
   *           Use for route transitions where the page already exists.
   */
  variant?: 'full' | 'badge';
}

const DrawingLoader: React.FC<DrawingLoaderProps> = ({
  visible = true,
  label = 'LOADING',
  variant = 'full',
}) => {
  injectStyles();
  if (!visible) return null;

  if (variant === 'badge') {
    // Small floating badge — doesn't cover the page
    return (
      <div style={{
        position: 'fixed', inset: 0, zIndex: 9998,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        pointerEvents: 'none',
        fontFamily: MONO,
      }}>
        <div style={{
          width: 104, height: 104,
          borderRadius: 18,
          background: 'rgba(17,17,17,0.90)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          border: '1px solid rgba(255,255,255,0.07)',
          boxShadow: '0 12px 40px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.04)',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          gap: 8,
        }}>
          <GlobeSVG size={62} dur="2.2s" />
          {/* Three blinking dots only */}
          <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
            {[0, 1, 2].map(i => (
              <div key={i} style={{
                width: 4, height: 4, borderRadius: '50%',
                background: ACCENT,
                animation: `dl-dot-blink 1.2s ease-in-out ${i * 0.22}s infinite`,
              }} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── Full-screen variant (Suspense / first load) ────────────────
  const size = 140;
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: BG,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      fontFamily: MONO,
      animation: 'dl-fade-in 0.3s ease',
    }}>
      <Corner pos="tl" /><Corner pos="tr" />
      <Corner pos="bl" /><Corner pos="br" />

      <GlobeSVG size={size} />

      <div style={{ marginTop: 28, fontSize: 9, letterSpacing: '0.55em', color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase' }}>
        A R M I N
      </div>
      <div style={{ marginTop: 10, fontSize: 8, letterSpacing: '0.3em', color: 'rgba(255,255,255,0.2)', textTransform: 'uppercase' }}>
        {label}
      </div>
      <div style={{ marginTop: 14, display: 'flex', gap: 7, alignItems: 'center' }}>
        {[0, 1, 2].map(i => (
          <div key={i} style={{
            width: 5, height: 5, borderRadius: '50%', background: ACCENT,
            animation: `dl-dot-blink 1.4s ease-in-out ${i * 0.28}s infinite`,
          }} />
        ))}
      </div>

      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
        <div style={{
          position: 'absolute', top: 0, bottom: 0, width: '35%',
          background: `linear-gradient(to right, transparent 0%, rgba(204,255,0,0.025) 40%, rgba(204,255,0,0.05) 50%, rgba(204,255,0,0.025) 60%, transparent 100%)`,
          animation: `dl-scan 3.2s ease-in-out infinite`,
        }} />
      </div>
    </div>
  );
};

export default DrawingLoader;

// ── TransitionBadge ───────────────────────────────────────────────
// Handles its own mount/unmount lifecycle so the badge can fade
// in AND fade out smoothly (unlike a simple conditional render).
// Usage in App.tsx:  <TransitionBadge show={transitioning} />
export const TransitionBadge: React.FC<{ show: boolean }> = ({ show }) => {
  injectStyles();
  const [mounted, setMounted] = React.useState(show);
  const [visible, setVisible] = React.useState(false);

  React.useEffect(() => {
    if (show) {
      setMounted(true);
      // Two rAF frames to ensure DOM is painted before opacity transitions
      const raf = requestAnimationFrame(() =>
        requestAnimationFrame(() => setVisible(true))
      );
      return () => cancelAnimationFrame(raf);
    } else {
      setVisible(false);
      // Unmount after the CSS transition completes
      const t = setTimeout(() => setMounted(false), 260);
      return () => clearTimeout(t);
    }
  }, [show]);

  if (!mounted) return null;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9998,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      pointerEvents: 'none',
      fontFamily: MONO,
    }}>
      {/* Ghost badge — no background, dual-shadow for visibility on any bg color */}
      <div style={{
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        gap: 10,
        opacity: visible ? 1 : 0,
        transform: visible ? 'scale(1)' : 'scale(0.80)',
        transition: 'opacity 0.22s ease, transform 0.28s cubic-bezier(0.34,1.2,0.64,1)',
        // Drop-shadow combo: dark halo visible on light, light glow visible on dark
        filter: 'drop-shadow(0 0 6px rgba(0,0,0,0.55)) drop-shadow(0 0 14px rgba(0,0,0,0.25)) drop-shadow(0 0 4px rgba(204,255,0,0.3))',
      }}>
        <GlobeSVG size={56} dur="2.2s" />
        <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
          {[0, 1, 2].map(i => (
            <div key={i} style={{
              width: 4, height: 4, borderRadius: '50%',
              background: ACCENT,
              animation: `dl-dot-blink 1.2s ease-in-out ${i * 0.22}s infinite`,
            }} />
          ))}
        </div>
      </div>
    </div>
  );
};

// ── ImageWithLoader ───────────────────────────────────────────────
// Drop-in <img> replacement that shows a globe skeleton while loading.
interface ImageWithLoaderProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  loaderSize?: number;
}
export const ImageWithLoader: React.FC<ImageWithLoaderProps> = ({
  src, alt, style, className, loaderSize = 60, onLoad, onError, ...rest
}) => {
  const [loaded, setLoaded] = React.useState(false);
  const [errored, setErrored] = React.useState(false);
  React.useEffect(() => { setLoaded(false); setErrored(false); }, [src]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', ...(!loaded ? { background: '#1a1a1a' } : {}) }}>
      {!loaded && !errored && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#1a1a1a' }}>
          <GlobeSVG size={loaderSize} dur="2.6s" />
        </div>
      )}
      <img src={src} alt={alt} className={className}
        style={{ ...style, opacity: loaded ? 1 : 0, transition: 'opacity 0.35s ease' }}
        onLoad={e => { setLoaded(true); onLoad?.(e); }}
        onError={e => { setErrored(true); onError?.(e); }}
        {...rest}
      />
    </div>
  );
};

// ── usePageTransitionLoader ───────────────────────────────────────
export function usePageTransitionLoader(isLoading: boolean, label = 'LOADING') {
  injectStyles();
  const LoadingOverlay = isLoading
    ? React.createElement(DrawingLoader, { visible: true, label })
    : null;
  return { LoadingOverlay };
}
