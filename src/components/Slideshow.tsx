import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, Maximize2, Minimize2, Pause, Play, X } from 'lucide-react';
import { getOptimizedImageUrl } from '../utils/imageProxy';
import { prettifyArtistName } from '../utils/canonicalArtist';
import { useLanguage } from '../contexts/LanguageContext';
import './slideshow.css';

/* A playlist played as a slideshow. It starts playing at once, over the whole
   screen: the work fills a black letterbox and nothing else shows. Moving the
   mouse (or tapping, on a phone) brings the controls back for a moment - the
   counter and close above, the work's name and the playing controls below.
   On a phone it plays sideways: fullscreen and the landscape lock where the
   browser allows them, and otherwise the stage itself is turned. */

interface SlideshowProps {
    artworks: any[];
    onClose: () => void;
}

type Orientation = 'all' | 'landscape' | 'portrait';
const DURATIONS = [10000, 30000, 60000, 180000, 300000, 1800000];
const HIDE_AFTER = 2600;

const durationLabel = (ms: number, ko: boolean) =>
    ms < 60000 ? `${ms / 1000}${ko ? '초' : 's'}` : `${ms / 60000}${ko ? '분' : 'm'}`;

const Slideshow: React.FC<SlideshowProps> = ({ artworks, onClose }) => {
    const { t, language } = useLanguage();
    const ko = language === 'ko';
    const [order, setOrder] = useState<any[]>([]);
    const [index, setIndex] = useState(0);
    const [playing, setPlaying] = useState(true);
    const [playMode, setPlayMode] = useState<'random' | 'sequential'>('random');
    const [orientation, setOrientation] = useState<Orientation>('all');
    const [duration, setDuration] = useState(60000);
    const [chrome, setChrome] = useState(true);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const rootRef = useRef<HTMLDivElement>(null);
    const hideTimer = useRef<number | undefined>(undefined);
    const touch = useRef<{ x: number; y: number } | null>(null);

    useEffect(() => {
        const list = [...artworks];
        if (playMode === 'random') list.sort(() => Math.random() - 0.5);
        setOrder(list);
        setIndex(0);
    }, [artworks, playMode]);

    const next = useCallback(() => setIndex((i) => (order.length ? (i + 1) % order.length : 0)), [order.length]);
    const prev = useCallback(() => setIndex((i) => (order.length ? (i - 1 + order.length) % order.length : 0)), [order.length]);

    useEffect(() => {
        if (!playing || order.length < 2) return;
        const timer = window.setInterval(next, duration);
        return () => window.clearInterval(timer);
    }, [playing, next, duration, order.length]);

    /* the controls show for a moment after any movement, then leave the work alone */
    const wake = useCallback(() => {
        setChrome(true);
        window.clearTimeout(hideTimer.current);
        hideTimer.current = window.setTimeout(() => setChrome(false), HIDE_AFTER);
    }, []);
    useEffect(() => {
        wake();
        return () => window.clearTimeout(hideTimer.current);
    }, [wake]);

    /* fullscreen from the start; on a phone also try to hold it sideways */
    const enterFullscreen = useCallback(async () => {
        const el = rootRef.current as any;
        try {
            if (el?.requestFullscreen) await el.requestFullscreen();
            else if (el?.webkitRequestFullscreen) el.webkitRequestFullscreen();
        } catch {
            /* not allowed here (an iPhone, the app's web view): the page still fills the screen */
        }
        try {
            await (screen.orientation as any)?.lock?.('landscape');
        } catch {
            /* no lock: the stage is turned by the stylesheet instead */
        }
    }, []);
    const leaveFullscreen = useCallback(() => {
        try { (screen.orientation as any)?.unlock?.(); } catch { /* nothing to undo */ }
        if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    }, []);

    useEffect(() => {
        void enterFullscreen();
        const sync = () => setIsFullscreen(!!document.fullscreenElement);
        document.addEventListener('fullscreenchange', sync);
        document.documentElement.classList.add('slideshow-open');
        return () => {
            document.removeEventListener('fullscreenchange', sync);
            document.documentElement.classList.remove('slideshow-open');
            leaveFullscreen();
        };
    }, [enterFullscreen, leaveFullscreen]);

    /* a browser that refused fullscreen on opening (the click that opened the
       show was already spent) gets it on the first touch or key inside the show */
    const onFirstGesture = useCallback(() => {
        if (!document.fullscreenElement) void enterFullscreen();
    }, [enterFullscreen]);
    useEffect(() => {
        const el = rootRef.current;
        if (!el) return;
        el.addEventListener('pointerdown', onFirstGesture, { once: true });
        window.addEventListener('keydown', onFirstGesture, { once: true });
        return () => {
            el.removeEventListener('pointerdown', onFirstGesture);
            window.removeEventListener('keydown', onFirstGesture);
        };
    }, [onFirstGesture, order.length > 0]); // eslint-disable-line react-hooks/exhaustive-deps

    const close = useCallback(() => {
        leaveFullscreen();
        onClose();
    }, [leaveFullscreen, onClose]);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && !document.fullscreenElement) close();
            else if (e.key === 'ArrowRight') { next(); wake(); }
            else if (e.key === 'ArrowLeft') { prev(); wake(); }
            else if (e.key === ' ') { e.preventDefault(); setPlaying((p) => !p); wake(); }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [close, next, prev, wake]);

    /* a work of the wrong shape for the chosen orientation is passed over */
    const onImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
        const img = e.currentTarget;
        const wide = img.naturalWidth >= img.naturalHeight;
        if (order.length > 1 && ((orientation === 'landscape' && !wide) || (orientation === 'portrait' && wide))) next();
    };

    const work = order[index];
    if (!work) return null;

    const cycle = <T,>(list: T[], value: T) => list[(list.indexOf(value) + 1) % list.length];
    const orientationLabel = {
        all: t({ ko: '모든 방향', en: 'Any shape' }),
        landscape: t({ ko: '가로 작품만', en: 'Landscape only' }),
        portrait: t({ ko: '세로 작품만', en: 'Portrait only' }),
    }[orientation];
    const figure = (n: number) => String(n).padStart(2, '0');

    return createPortal(
        <div
            ref={rootRef}
            className={`ss${chrome ? ' is-awake' : ''}`}
            role="dialog"
            aria-modal="true"
            aria-label={t({ ko: '슬라이드쇼', en: 'Slideshow' })}
            onMouseMove={wake}
            onPointerDown={(e) => { if (e.pointerType !== 'mouse') touch.current = { x: e.clientX, y: e.clientY }; }}
            onPointerUp={(e) => {
                const start = touch.current;
                touch.current = null;
                if (!start) return;
                const dx = e.clientX - start.x, dy = e.clientY - start.y;
                /* the stage may be turned a quarter on a phone: a swipe along its long side either way */
                const along = Math.abs(dx) > Math.abs(dy) ? dx : dy;
                if (Math.abs(along) > 50) { (along < 0 ? next : prev)(); wake(); return; }
                if ((e.target as HTMLElement).closest('button')) return;
                if (chrome) { window.clearTimeout(hideTimer.current); setChrome(false); } else wake();
            }}
        >
            <div className="ss__stage">
                <img
                    key={work.id || index}
                    className="ss__work"
                    src={getOptimizedImageUrl(work.image, 2048)}
                    alt={work.title || ''}
                    onLoad={onImageLoad}
                    draggable={false}
                />

                <header className="ss__top">
                    <span className="ss__count">{figure(index + 1)} <i>/</i> {figure(order.length)}</span>
                    <button type="button" className="ss__close" onClick={close} aria-label={t({ ko: '닫기', en: 'Close' })}>
                        <X size={22} strokeWidth={1.6} />
                    </button>
                </header>

                <button type="button" className="ss__side ss__side--prev" onClick={() => { prev(); wake(); }} aria-label={t({ ko: '이전 작품', en: 'Previous' })}>
                    <ChevronLeft size={34} strokeWidth={1.3} />
                </button>
                <button type="button" className="ss__side ss__side--next" onClick={() => { next(); wake(); }} aria-label={t({ ko: '다음 작품', en: 'Next' })}>
                    <ChevronRight size={34} strokeWidth={1.3} />
                </button>

                <footer className="ss__bottom">
                    <div className="ss__caption">
                        <h2>{work.title}</h2>
                        <p>
                            {prettifyArtistName(work.artist)}
                            {work.year ? <span> · {work.year}</span> : null}
                        </p>
                    </div>
                    <div className="ss__controls">
                        <button type="button" className="ss__play" onClick={() => { setPlaying((p) => !p); wake(); }}>
                            {playing ? <Pause size={15} strokeWidth={2} /> : <Play size={15} strokeWidth={2} />}
                            {playing ? t({ ko: '일시정지', en: 'Pause' }) : t({ ko: '재생', en: 'Play' })}
                        </button>
                        <button type="button" onClick={() => { setDuration(cycle(DURATIONS, duration)); wake(); }}>
                            {t({ ko: '간격', en: 'Every' })} <b>{durationLabel(duration, ko)}</b>
                        </button>
                        <button type="button" onClick={() => { setPlayMode(playMode === 'random' ? 'sequential' : 'random'); wake(); }}>
                            {playMode === 'random' ? t({ ko: '무작위', en: 'Shuffle' }) : t({ ko: '순서대로', en: 'In order' })}
                        </button>
                        <button type="button" onClick={() => { setOrientation(cycle<Orientation>(['all', 'landscape', 'portrait'], orientation)); wake(); }}>
                            {orientationLabel}
                        </button>
                        <button
                            type="button"
                            className="ss__full"
                            onClick={() => { if (isFullscreen) leaveFullscreen(); else void enterFullscreen(); wake(); }}
                            aria-label={isFullscreen ? t({ ko: '전체화면 끄기', en: 'Exit fullscreen' }) : t({ ko: '전체화면', en: 'Fullscreen' })}
                        >
                            {isFullscreen ? <Minimize2 size={15} strokeWidth={1.8} /> : <Maximize2 size={15} strokeWidth={1.8} />}
                            {isFullscreen ? t({ ko: '전체화면 끄기', en: 'Exit full screen' }) : t({ ko: '전체화면', en: 'Full screen' })}
                        </button>
                    </div>
                </footer>
            </div>
        </div>,
        document.body,
    );
};

export default Slideshow;
