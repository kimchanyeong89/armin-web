import React from 'react';
import { CollyLotusLoader } from './CollyMark';

/* Every wait in the app shows the same thing: the COLLY lotus drawing itself,
   holding, and winding back out - no words under it. A `label` is kept only
   for screen readers. */

const BG = '#080808';

// ── DrawingLoader ─────────────────────────────────────────────────
interface DrawingLoaderProps {
  visible?: boolean;
  label?: string;
  /**
   * 'full'  — full-screen dark overlay. Use for Suspense / initial page loads.
   * 'badge' — the lotus alone, centered over existing content.
   */
  variant?: 'full' | 'badge';
}

const DrawingLoader: React.FC<DrawingLoaderProps> = ({
  visible = true,
  label = 'Loading',
  variant = 'full',
}) => {
  if (!visible) return null;
  return (
    <div
      role="status"
      aria-label={label}
      style={{
        position: 'fixed', inset: 0, zIndex: variant === 'full' ? 9999 : 9998,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        pointerEvents: variant === 'full' ? undefined : 'none',
        background: variant === 'full' ? BG : undefined,
      }}
    >
      <CollyLotusLoader size={variant === 'full' ? 96 : 64} />
    </div>
  );
};

export default DrawingLoader;

// Sample the center-most non-transparent background color and return 'light' | 'dark'
function detectPageBrightness(): 'light' | 'dark' {
  try {
    const cx = window.innerWidth / 2, cy = window.innerHeight / 2;
    const els = document.elementsFromPoint(cx, cy) as HTMLElement[];
    for (const el of els) {
      const bg = window.getComputedStyle(el).backgroundColor;
      if (!bg || bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent') continue;
      const m = bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      if (m) {
        const lum = (0.299 * +m[1] + 0.587 * +m[2] + 0.114 * +m[3]) / 255;
        return lum > 0.5 ? 'light' : 'dark';
      }
    }
  } catch (_) {}
  return 'dark'; // default: assume dark
}

// ── TransitionBadge ───────────────────────────────────────────────
// Handles its own mount/unmount lifecycle so the badge can fade
// in AND fade out smoothly (unlike a simple conditional render).
// Usage in App.tsx:  <TransitionBadge show={transitioning} />
export const TransitionBadge: React.FC<{ show: boolean }> = ({ show }) => {
  const [mounted, setMounted] = React.useState(show);
  const [visible, setVisible] = React.useState(false);
  const [isLight, setIsLight] = React.useState(false);

  React.useEffect(() => {
    if (show) {
      setIsLight(detectPageBrightness() === 'light');
      setMounted(true);
      const raf = requestAnimationFrame(() =>
        requestAnimationFrame(() => setVisible(true))
      );
      return () => cancelAnimationFrame(raf);
    } else {
      setVisible(false);
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
    }}>
      <div style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'scale(1)' : 'scale(0.80)',
        transition: 'opacity 0.22s ease, transform 0.28s cubic-bezier(0.34,1.2,0.64,1)',
        /* it floats over whatever the page shows: a soft disc of the page's own
           ground behind it, so page text under it never reads through the lotus */
        padding: 14,
        borderRadius: '50%',
        background: isLight ? 'rgba(250,250,250,0.86)' : 'rgba(8,8,8,0.82)',
        boxShadow: isLight ? '0 0 30px 18px rgba(250,250,250,0.86)' : '0 0 30px 18px rgba(8,8,8,0.82)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
      }}>
        <CollyLotusLoader size={60} />
      </div>
    </div>
  );
};

// ── LoadingMark ───────────────────────────────────────────────────
// The lotus in the flow of the page, for a place that waits on something.
// Its `label` is read out, not shown.
export const LoadingMark: React.FC<{ label?: string; size?: number }> = ({ label, size = 56 }) => (
  <div role="status" aria-label={label} style={{ display: 'flex', justifyContent: 'center', padding: '24px 0' }}>
    <CollyLotusLoader size={size} />
  </div>
);

// ── ImageWithLoader ───────────────────────────────────────────────
// Drop-in <img> replacement that shows the lotus while loading.
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
          <CollyLotusLoader size={loaderSize} />
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
export function usePageTransitionLoader(isLoading: boolean, label = 'Loading') {
  const LoadingOverlay = isLoading
    ? React.createElement(DrawingLoader, { visible: true, label })
    : null;
  return { LoadingOverlay };
}
