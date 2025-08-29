import { useEffect, useRef, useState } from 'react';
import { acquireSlot, releaseSlot } from '../utils/imageQueue';

interface LazyImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src: string;
  placeholderColor?: string;
}

export default function LazyImage({ src, placeholderColor = '#eee', style, ...rest }: LazyImageProps) {
  const ref = useRef<HTMLImageElement | null>(null);
  const [visible, setVisible] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          setVisible(true);
          io.disconnect();
          break;
        }
      }
    }, { rootMargin: '200px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!visible || loaded) return;
    let cancelled = false;
    (async () => {
      await acquireSlot();
      try {
        if (cancelled) return;
        const img = new Image();
        img.decoding = 'async' as any;
        img.loading = 'eager' as any;
        (img as any).fetchPriority = (rest as any).fetchPriority || 'low';
        img.onload = () => {
          if (cancelled) return;
          setLoaded(true);
          if (ref.current) ref.current.src = src;
        };
        img.onerror = () => {
          if (cancelled) return;
          setLoaded(true); // avoid endless retry; keeps placeholder
        };
        img.src = src;
      } finally {
        releaseSlot();
      }
    })();
    return () => { cancelled = true; };
  }, [visible, loaded, src, rest]);

  return (
    // eslint-disable-next-line jsx-a11y/alt-text
    <img
      ref={ref}
      src={loaded ? src : undefined}
      style={{ background: loaded ? 'transparent' : placeholderColor, ...style }}
      loading={visible ? 'eager' : 'lazy'}
      decoding="async"
      {...rest}
    />
  );
}
