import { useEffect, useRef, useState, type CSSProperties } from 'react';

/**
 * ProgressiveImage
 *
 * Renders an <img> that fades in smoothly from a blurred state to sharp when
 * the high-resolution image finishes loading. Intended to eliminate the
 * "pop" users see when an image swaps from nothing → fully rendered.
 *
 * Loading phases:
 *   1. Before visible (lazy): transparent colored placeholder, nothing fetched.
 *   2. Visible & loading: placeholder image (if given) drawn blurred + dim.
 *   3. Loaded: fade opacity 0 → 1 over ~400ms AND blur 14px → 0 over ~500ms.
 *
 * If a low-res `placeholder` URL is supplied (a small thumbnail or preview),
 * it is shown blurred immediately and the transition morphs into the sharp
 * high-res source. If no placeholder is given, a solid color + subtle blur is
 * used instead.
 *
 * Automatic fallback chain: if `src` errors, the hook walks through
 * `fallbackSrcs` in order. When all sources fail, the container renders empty.
 */

interface ProgressiveImageProps extends Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src' | 'placeholder'> {
  src: string;
  /** Optional low-res image URL shown blurred during load. */
  placeholder?: string;
  /** URLs to try in order after `src` fails. */
  fallbackSrcs?: string[];
  /** Background color while waiting for the placeholder or first paint. */
  placeholderColor?: string;
  /** Whether to lazy-load via IntersectionObserver. Default: true. */
  lazy?: boolean;
  /** Opacity transition duration in ms. Default: 400. */
  fadeMs?: number;
  /** Blur transition duration in ms. Default: 500. */
  blurMs?: number;
  /** Maximum blur radius in px applied during load. Default: 14. */
  blurPx?: number;
  /** Wrapper style (applied to the outer div). */
  wrapperStyle?: CSSProperties;
  /** Wrapper class name. */
  wrapperClassName?: string;
}

export default function ProgressiveImage({
  src,
  placeholder,
  fallbackSrcs = [],
  placeholderColor = '#111',
  lazy = true,
  fadeMs = 400,
  blurMs = 500,
  blurPx = 14,
  wrapperStyle,
  wrapperClassName,
  style,
  onLoad,
  onError,
  ...imgRest
}: ProgressiveImageProps) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(!lazy);
  const [loaded, setLoaded] = useState(false);
  const [srcIndex, setSrcIndex] = useState(0);

  // Walk the fallback chain
  const sources = [src, ...fallbackSrcs].filter(Boolean);
  const currentSrc = sources[srcIndex] || '';
  const exhausted = srcIndex >= sources.length;

  // Reset loaded state when the primary src changes
  useEffect(() => {
    setLoaded(false);
    setSrcIndex(0);
  }, [src]);

  // Lazy-load via IntersectionObserver
  useEffect(() => {
    if (!lazy || visible) return;
    const el = wrapperRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setVisible(true);
            io.disconnect();
            break;
          }
        }
      },
      { rootMargin: '200px 0px' }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [lazy, visible]);

  const handleLoad: React.ReactEventHandler<HTMLImageElement> = (e) => {
    setLoaded(true);
    onLoad?.(e);
  };

  const handleError: React.ReactEventHandler<HTMLImageElement> = (e) => {
    if (srcIndex < sources.length - 1) {
      setSrcIndex((i) => i + 1);
    } else {
      setSrcIndex((i) => i + 1); // mark exhausted
      onError?.(e);
    }
  };

  return (
    <div
      ref={wrapperRef}
      className={wrapperClassName}
      style={{
        position: 'relative',
        overflow: 'hidden',
        background: placeholderColor,
        ...wrapperStyle,
      }}
    >
      {/* Low-res blurred placeholder (only if URL provided) */}
      {placeholder && visible && !loaded && !exhausted && (
        <img
          src={placeholder}
          alt=""
          aria-hidden="true"
          draggable={false}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: (style && (style as any).objectFit) || 'cover',
            filter: `blur(${blurPx}px)`,
            transform: 'scale(1.08)', // hides blur edge bleed
            opacity: 0.85,
            pointerEvents: 'none',
          }}
        />
      )}

      {/* High-res image */}
      {visible && !exhausted && currentSrc && (
        <img
          {...imgRest}
          src={currentSrc}
          loading={lazy ? 'lazy' : 'eager'}
          decoding="async"
          onLoad={handleLoad}
          onError={handleError}
          style={{
            display: 'block',
            width: '100%',
            height: '100%',
            objectFit: (style && (style as any).objectFit) || 'cover',
            ...style,
            opacity: loaded ? 1 : 0,
            filter: loaded ? 'blur(0)' : `blur(${blurPx}px)`,
            transform: loaded ? 'scale(1)' : 'scale(1.04)',
            transition: `opacity ${fadeMs}ms ease, filter ${blurMs}ms ease, transform ${blurMs}ms ease`,
            willChange: 'opacity, filter, transform',
          }}
        />
      )}
    </div>
  );
}

/**
 * FadeInImage — a lighter variant that does NOT wrap the <img> in a container.
 * Use this when the parent layout relies on the image's intrinsic size
 * (e.g. maxWidth/maxHeight + objectFit: contain). Still fades opacity and
 * animates blur→sharp on load, but without a positioned parent div.
 */
interface FadeInImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src: string;
  fadeMs?: number;
  blurMs?: number;
  blurPx?: number;
  /**
   * CSS aspect-ratio (e.g. "16/9", "4/3", "1"). When provided, reserves the
   * layout box before load so neighbouring content doesn't reflow. Combine
   * with width (e.g. "100%") — the height is derived from the ratio.
   */
  aspectRatio?: string;
  /** Placeholder background shown while the image has not yet loaded. */
  placeholderColor?: string;
}

export function FadeInImage({
  src,
  fadeMs = 420,
  blurMs = 520,
  blurPx = 14,
  aspectRatio,
  placeholderColor = '#1a1a1a',
  style,
  onLoad,
  onError,
  ...rest
}: FadeInImageProps) {
  const [loaded, setLoaded] = useState(false);

  // Reset loaded flag whenever the src swaps to a different image
  useEffect(() => {
    setLoaded(false);
  }, [src]);

  return (
    <img
      {...rest}
      src={src}
      decoding="async"
      loading="eager"
      onLoad={(e) => { setLoaded(true); onLoad?.(e); }}
      onError={(e) => { setLoaded(true); onError?.(e); }}
      style={{
        ...(aspectRatio ? { aspectRatio } : null),
        background: loaded ? undefined : placeholderColor,
        ...style,
        opacity: loaded ? 1 : 0,
        filter: loaded ? 'blur(0)' : `blur(${blurPx}px)`,
        transform: loaded ? 'scale(1)' : 'scale(1.02)',
        transition: `opacity ${fadeMs}ms ease, filter ${blurMs}ms ease, transform ${blurMs}ms ease`,
        willChange: 'opacity, filter, transform',
      }}
    />
  );
}
