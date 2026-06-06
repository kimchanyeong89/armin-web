import { Fragment, useState, useEffect, useRef, useCallback, useMemo, useDeferredValue, lazy, Suspense, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { ShoppingBag, BookmarkPlus } from 'lucide-react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { searchByText, preloadEncoder, onEncoderStatusChange, getEncoderStatus, looksNonEnglish } from '../utils/siglipSearch';
import { searchTextServer } from '../utils/serverKeywordSearch';
import { getSearchThumbnail, getLightboxImage, getOptimizedImageUrl, normalizeImageUrl } from '../utils/imageProxy';
import { shouldLimitNetwork, isLikelyMobileDevice } from '../utils/network';
import { ensureSharedSearchWorkerLoaded } from '../utils/searchWorkerRuntime';
import { auth, db } from '../firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, doc, setDoc, deleteDoc, onSnapshot, getDocs } from 'firebase/firestore';
import { HeartOverlay } from './HeartOverlay';
import { ProductModal } from './ProductModal';
import { PlaylistModal } from './PlaylistModal';
import ArtistWikiPanel from './ArtistWikiPanel';
import { ArtworkLightbox } from './ArtworkLightbox';
import LanguageToggle from './LanguageToggle';
import { useLanguage } from '../contexts/LanguageContext';
import { useArtistI18n, getArtistDisplayName, resolveKoreanToEnglishArtist } from '../i18n/artistLocalization';
import { getCanonicalName, prettifyArtistName } from '../utils/canonicalArtist';
import { getArtworkTitle, useArtworkI18n } from '../i18n/artworkLocalization';
import { getMuseumDisplayName } from '../i18n/museumLocalization';
import { localizeCountryName } from '../i18n/geoLocalization';
import { getMediumKo } from '../i18n/mediumGlossary';
import { useLikedArtworkSet } from '../hooks/useLikedArtworkSet';
import type { RecommendationResponse, RecommendedArtwork } from '../types/Recommendation';
import { artists } from '../data/artists';
const ArtistDistributionMap = lazy(() => import('./ArtistDistributionMap'));

function buildFallbackAscii(name: string) {
    const clean = (name || 'Artist').trim() || 'Artist';
    const displayable = clean.length > 18 ? `${clean.slice(0, 15)}...` : clean;
    const padded = ` ${displayable} `;
    const border = '─'.repeat(padded.length);
    return `┌${border}┐\n│${padded}│\n└${border}┘`;
}



export type SearchableArtwork = {
    id: string;
    name: string;
    artist: string;
    image: string;
    date?: string;
    museumName: string;
    exhibitionId: string;
    searchName?: string;
    searchArtist?: string;
    sourceUrl?: string;
};

type RecommendationSearchRow = Partial<RecommendedArtwork> & {
    date?: string;
    museumName?: string;
    m?: string;
    year?: string | number;
    y?: string | number;
};

export type Museum = {
    id: string;
    name: string;
    country: string;
    region?: string;
    latitude: number;
    longitude: number;
    representativeImage?: string;
    permanentExhibitions?: { id: string, name: string }[];
};

type GlobalSearchBarProps = { forceWidth?: string;
    onOpenLightbox?: (artwork: SearchableArtwork, openLightbox?: boolean) => void;
    onNavigateToMuseum?: (museum: { id: string, name: string }, collectionId?: string, artwork?: SearchableArtwork) => void;
    museums?: Museum[];
    isModalOpen?: boolean;
    initialQuery?: string;
    isMobile?: boolean;
    inlineMode?: boolean;
    isDark?: boolean;
    drawingSkin?: boolean;
};

const normalizeToken = (value?: string) => (value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[^a-z0-9]+/g, '');

const getExhibitionTokens = (entry?: { [key: string]: any } | null) => {
    const tokens = new Set<string>();
    const addToken = (value?: string | null) => {
        const token = normalizeToken(value || undefined);
        if (token) tokens.add(token);
    };
    if (!entry) return tokens;
    addToken(entry.id);
    addToken(entry.name);
    addToken(entry.title);
    addToken(entry.slug);
    addToken(entry.collectionId);
    const file = entry.collectionFile;
    if (typeof file === 'string') {
        addToken(file.replace(/\.json$/i, ''));
    }
    const aliases = entry.aliases;
    if (Array.isArray(aliases)) aliases.forEach(addToken);
    return tokens;
};

const formatArtworkYear = (value?: string) => {
    if (!value) return '';
    const normalized = value
        .replace(/[a-zA-Z]+/g, ' ')
        .replace(/[^0-9\- ]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    if (!normalized) return '';
    const matches = normalized.match(/\d{1,4}/g);
    if (!matches) return '';
    let last = matches[matches.length - 1];
    if (last.length < 4 && matches.length > 1) {
        const donor = [...matches]
            .slice(0, -1)
            .reverse()
            .find(token => token.length === 4) || matches[matches.length - 2];
        if (donor && donor.length >= last.length) {
            const prefix = donor.slice(0, donor.length - last.length);
            last = `${prefix}${last}`;
        }
    }
    const trimmed = last.replace(/^0+/, '');
    return trimmed || last;
};

const describeArtworkHighlight = (art?: SearchableArtwork) => {
    if (!art) return '';
    const yearLabel = formatArtworkYear(art.date);
    const museumLabel = art.museumName?.trim();
    if (yearLabel && museumLabel) return `${art.name} (${yearLabel}, ${museumLabel})`;
    if (yearLabel) return `${art.name} (${yearLabel})`;
    if (museumLabel) return `${art.name} - ${museumLabel}`;
    return art.name;
};

// Final fallback image for broken images (no text placeholder)
const FALLBACK_IMG = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="%2311161f"/><stop offset="1" stop-color="%23232d3b"/></linearGradient></defs><rect fill="url(%23g)" width="100" height="100"/></svg>';

const getArtistChipThumbnail = (url: string) => getOptimizedImageUrl(url, 84, 42, 'webp');
const getTinyBlurThumbnail = (url: string) => getOptimizedImageUrl(url, 28, 26, 'webp');

type ProgressiveThumbProps = {
    primaryUrl?: string;
    fallbackUrl?: string;
    style?: CSSProperties;
    preferDirect?: boolean;
    loading?: 'lazy' | 'eager';
};

// Rotating curator-flavoured loading copy (see SearchWittyLoader).
/**
 * Loading state shown while a search is in flight but nothing has rendered
 * yet — ARMIN's interlocking-loop mark with light tracing it, under a plain
 * "Searching" label. Keeps the first-search gap from feeling broken.
 */
function SearchWittyLoader({ dark }: { dark: boolean }) {
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

function ProgressiveThumb({
    primaryUrl,
    fallbackUrl,
    style,
    preferDirect = false,
    loading = 'lazy',
}: ProgressiveThumbProps) {
    const [attempt, setAttempt] = useState(0);
    const [loaded, setLoaded] = useState(false);
    const imgRef = useRef<HTMLImageElement | null>(null);

    const primary = normalizeKnownBrokenImageUrl(primaryUrl);
    const fallback = normalizeKnownBrokenImageUrl(fallbackUrl);

    const candidates = useMemo(() => {
        const list: string[] = [];
        const push = (value?: string) => {
            const v = String(value || '').trim();
            if (!v || list.includes(v)) return;
            list.push(v);
        };

        if (preferDirect) {
            push(primary);
            push(primary ? getArtistChipThumbnail(primary) : '');
            push(fallback);
            push(fallback ? getArtistChipThumbnail(fallback) : '');
        } else {
            push(primary ? getSearchThumbnail(primary) : '');
            push(primary);
            push(fallback ? getSearchThumbnail(fallback) : '');
            push(fallback);
        }
        return list;
    }, [fallback, preferDirect, primary]);

    useEffect(() => {
        setAttempt(0);
        setLoaded(false);
    }, [primary, fallback, preferDirect]);

    const activeSrc = candidates[attempt] || FALLBACK_IMG;
    const blurSeed = primary || fallback;
    const blurSrc = blurSeed ? getTinyBlurThumbnail(blurSeed) : FALLBACK_IMG;

    // A cached image can finish decoding before React attaches its onLoad
    // listener — onLoad then never fires and the thumbnail stays pinned behind
    // the blur layer (very common on a repeat search). Detect the already-
    // decoded <img> directly and reveal it. The single delayed re-check covers
    // the commit/decode race without force-revealing lazy/offscreen images.
    useEffect(() => {
        if (loaded) return;
        const reveal = () => {
            const img = imgRef.current;
            if (img && img.complete && img.naturalWidth > 0) {
                setLoaded(true);
                return true;
            }
            return false;
        };
        if (reveal()) return;
        const t = setTimeout(reveal, 60);
        return () => clearTimeout(t);
    }, [activeSrc, loaded]);

    return (
        <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
            {blurSrc && (
                <img
                    src={blurSrc}
                    alt=""
                    aria-hidden
                    style={{
                        ...style,
                        position: 'absolute',
                        inset: 0,
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                        filter: 'blur(12px)',
                        transform: 'scale(1.12)',
                        opacity: loaded ? 0 : 0.95,
                        transition: 'opacity 280ms ease',
                    }}
                />
            )}
            <img
                key={`${activeSrc}-${attempt}`}
                ref={imgRef}
                src={activeSrc}
                alt=""
                loading={loading}
                onLoad={() => setLoaded(true)}
                onError={() => {
                    setLoaded(false);
                    setAttempt((prev) => prev + 1);
                }}
                style={{
                    ...style,
                    position: 'absolute',
                    inset: 0,
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    opacity: loaded ? 1 : 0,
                    filter: loaded ? 'blur(0)' : 'blur(8px)',
                    transition: 'opacity 300ms ease, filter 300ms ease',
                }}
            />
        </div>
    );
}

type ArtistChipThumbProps = {
    primaryUrl?: string;
    fallbackUrl?: string;
    style?: CSSProperties;
};

function ArtistChipThumb({ primaryUrl, fallbackUrl, style }: ArtistChipThumbProps) {
    return (
        <ProgressiveThumb
            primaryUrl={primaryUrl}
            fallbackUrl={fallbackUrl}
            style={style}
            preferDirect
            loading="eager"
        />
    );
}

/**
 * ExhibitionThumb — React-state-based image with multi-level fallback.
 *
 * Uses internal state for fallback so React never fights with imperative
 * img.src mutations (which previously caused broken thumbnails in WKWebView).
 *
 * Chain:
 * 1) wsrv(primary) -> 2) direct(primary)
 * 3) wsrv(collection fallback) -> 4) direct(collection fallback)
 * 5) wsrv(museum backup) -> 6) direct(museum backup)
 * 7) local gradient fallback
 */
type ExhibitionThumbProps = {
    primaryUrl: string;        // The raw URL (R2 or other)
    fallbackUrl?: string;      // Second image from collection (may be different domain)
    backupUrl?: string;        // Museum-level backup image
    style?: CSSProperties;
    exhibitionId?: string;     // For debug logging only
};

function ExhibitionThumb({ primaryUrl, fallbackUrl, backupUrl, style, exhibitionId }: ExhibitionThumbProps) {
    // 0 = wsrv primary, 1 = direct primary, 2 = wsrv fallback, 3 = direct fallback,
    // 4 = wsrv backup, 5 = direct backup, 6 = local fallback
    const [attempt, setAttempt] = useState(0);

    // Reset attempt to 0 whenever the primary URL changes (new search result)
    useEffect(() => {
        setAttempt(0);
    }, [primaryUrl]);

    const safeUrl = normalizeKnownBrokenImageUrl(primaryUrl);
    const safeFb = normalizeKnownBrokenImageUrl(fallbackUrl);
    const safeBackup = normalizeKnownBrokenImageUrl(backupUrl);
    const hasFallback = !!safeFb && safeFb !== safeUrl;
    const hasBackup = !!safeBackup && safeBackup !== safeUrl && safeBackup !== safeFb;

    if (!safeUrl) return <img src={FALLBACK_IMG} alt="" style={style} />;

    let src: string;
    if (attempt === 0) {
        src = getSearchThumbnail(safeUrl);
    } else if (attempt === 1) {
        // Direct R2 (bypass wsrv.nl)
        src = safeUrl;
    } else if (attempt === 2 && hasFallback) {
        src = getSearchThumbnail(safeFb);
    } else if (attempt === 3 && hasFallback) {
        src = safeFb;
    } else if (attempt === 4 && hasBackup) {
        src = getSearchThumbnail(safeBackup);
    } else if (attempt === 5 && hasBackup) {
        src = safeBackup;
    } else {
        src = FALLBACK_IMG;
    }

    const handleError = () => {
        console.warn(`[IMG-DEBUG] ExhibitionThumb error attempt=${attempt} id="${exhibitionId}" src=${src}`);
        setAttempt(prev => {
            let next = prev + 1;
            if ((next === 2 || next === 3) && !hasFallback) next = 4;
            if ((next === 4 || next === 5) && !hasBackup) next = 6;
            return next;
        });
    };

    if (src === FALLBACK_IMG) {
        console.error(`[IMG-DEBUG] ExhibitionThumb exhausted id="${exhibitionId}" primary="${safeUrl}" fallback="${safeFb || 'NONE'}" backup="${safeBackup || 'NONE'}"`);
        return <img src={FALLBACK_IMG} alt="" style={style} />;
    }

    return (
        <SmoothThumb
            key={`${exhibitionId}-${attempt}`}
            src={src}
            style={style}
            onError={handleError}
        />
    );
}

/**
 * Internal helper that fades the thumbnail from blurred → sharp on load.
 * Kept as a one-off component (rather than ProgressiveImage) because the
 * thumbnails here are already sized directly by the `style` prop passed
 * from the search card layout and we want to keep behavior identical.
 */
function SmoothThumb({ src, style, onError }: { src: string; style?: CSSProperties; onError?: () => void }) {
    const [loaded, setLoaded] = useState(false);
    const imgRef = useRef<HTMLImageElement | null>(null);
    useEffect(() => { setLoaded(false); }, [src]);
    // A cached image can already be decoded before React attaches onLoad, so
    // reveal it immediately when it is. Safety valve: if the browser never
    // fires onLoad (CORS issue, stalled proxy, etc.) we still reveal the image
    // after a timeout so thumbnails don't stay blurred indefinitely.
    useEffect(() => {
        const img = imgRef.current;
        if (img && img.complete && img.naturalWidth > 0) {
            setLoaded(true);
            return;
        }
        const tm = setTimeout(() => setLoaded(true), 2500);
        return () => clearTimeout(tm);
    }, [src]);
    return (
        <img
            ref={imgRef}
            src={src}
            alt=""
            loading="eager"
            decoding="async"
            onLoad={() => setLoaded(true)}
            onError={() => { setLoaded(true); onError?.(); }}
            style={{
                ...style,
                opacity: loaded ? 1 : 0,
                filter: loaded ? 'blur(0)' : 'blur(10px)',
                transform: loaded ? 'scale(1)' : 'scale(1.02)',
                transition: 'opacity 380ms ease, filter 480ms ease, transform 480ms ease',
                willChange: 'opacity, filter, transform',
            }}
        />
    );
}

const normalizeKnownBrokenImageUrl = (value?: string): string => {
    const raw = String(value || '').trim();
    if (!raw) return '';
    // Ignore malformed placeholders coming from legacy datasets.
    if (raw === 'default.jpg' || raw === '/default.jpg') return '';
    const lower = raw.toLowerCase();
    if (
        /no[-_ ]?image|placeholder|default[-_ ]?image|image-not-found|not[-_ ]?found/.test(lower) ||
        (lower.startsWith('data:image/svg+xml') && lower.includes('no%20image'))
    ) {
        return '';
    }

    return normalizeImageUrl(raw);
};

const getSafeImageUrl = (value?: string): string => normalizeKnownBrokenImageUrl(value) || FALLBACK_IMG;

const normalizeLookupText = (value?: string) =>
    String(value || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();

/**
 * AI \uc2dc\ub9e8\ud2f1 \uac80\uc0c9\uc774 \uc2dc\uc791\ub418\ub294 \ucd5c\uc18c \uae00\uc790 \uc218.
 * \uc601\uc5b4\ub294 2\uc790 \ucffc\ub9ac\uac00 \ub178\uc774\uc988\ub77c 3\uc790\ub97c \uc720\uc9c0\ud558\uc9c0\ub9cc, \ud55c\uad6d\uc5b4 \ub4f1 \ube44\ub77c\ud2f4 \uc5b8\uc5b4\ub294
 * 2\uc790 \ub2e8\uc5b4\uac00 \ud754\ud558\ubbc0\ub85c(\ubc14\ub2e4\u00b7\ud558\ub298\u00b7\uc0ac\ub791\u00b7\uace0\uc591\u2026) 2\uc790\ubd80\ud130 \uac80\uc0c9\uc744 \ud5c8\uc6a9\ud55c\ub2e4.
 */
const aiSearchMinLen = (q: string): number => (looksNonEnglish(q) ? 2 : 3);

const isStrictArtistNameMatch = (candidateRaw?: string, targetRaw?: string) => {
    const candidate = normalizeLookupText(candidateRaw);
    const target = normalizeLookupText(targetRaw);
    if (!candidate || !target) return false;
    if (candidate === target) return true;

    const candidateTokens = candidate.split(' ').filter((token) => token.length >= 3);
    const targetTokens = target.split(' ').filter((token) => token.length >= 3);
    if (candidateTokens.length === 0 || targetTokens.length === 0) return false;

    let overlap = 0;
    for (const token of targetTokens) {
        if (candidateTokens.includes(token)) overlap += 1;
    }
    const requiredOverlap = Math.min(2, targetTokens.length);
    return overlap >= requiredOverlap;
};

const getArtistGalleryCacheKey = (artistName: string) => {
    const token = normalizeLookupText(artistName).replace(/\s+/g, '-');
    return `artistGalleryCache:${token}`;
};

// Persists a per-artist gallery to sessionStorage. When the quota is exceeded,
// stale artistGalleryCache:* entries are evicted and the write retried once, so
// the cache stays warm for the current artist without growing unbounded.
const writeArtistGalleryCache = (artistName: string, gallery: unknown) => {
    const key = getArtistGalleryCacheKey(artistName);
    let json: string;
    try {
        json = JSON.stringify(gallery);
    } catch {
        return;
    }
    try {
        sessionStorage.setItem(key, json);
    } catch {
        for (let i = sessionStorage.length - 1; i >= 0; i--) {
            const k = sessionStorage.key(i);
            if (k && k !== key && k.startsWith('artistGalleryCache:')) {
                sessionStorage.removeItem(k);
            }
        }
        try {
            sessionStorage.setItem(key, json);
        } catch {
            // Gallery still too large for the freed space — skip caching it.
        }
    }
};

// Known artist last-name keys (mirrors search.worker.ts KNOWN_ARTIST_KEYS)
const KNOWN_ARTIST_FILE_KEYS: Record<string, string> = {
    monet:'monet', manet:'manet', renoir:'renoir', picasso:'picasso', nolde:'nolde',
    delacroix:'delacroix', gogh:'gogh', rembrandt:'rembrandt', vermeer:'vermeer',
    cezanne:'cezanne', degas:'degas', gauguin:'gauguin', matisse:'matisse',
    kandinsky:'kandinsky', klimt:'klimt', dali:'dali', warhol:'warhol', miro:'miro',
    chagall:'chagall', klee:'klee', rodin:'rodin', mondrian:'mondrian',
    pollock:'pollock', rothko:'rothko', bacon:'bacon', hockney:'hockney',
    basquiat:'basquiat', caravaggio:'caravaggio', raphael:'raphael',
    michelangelo:'michelangelo', botticelli:'botticelli', titian:'titian',
    tintoretto:'tintoretto', veronese:'veronese', rubens:'rubens', velazquez:'velazquez',
    goya:'goya', greco:'greco', bruegel:'bruegel', bosch:'bosch', durer:'durer',
    holbein:'holbein', constable:'constable', turner:'turner', gainsborough:'gainsborough',
    reynolds:'reynolds', hogarth:'hogarth', whistler:'whistler', sargent:'sargent',
    homer:'homer', eakins:'eakins', cassatt:'cassatt', seurat:'seurat', signac:'signac',
    caillebotte:'caillebotte', toulouse:'toulouse-lautrec', lautrec:'toulouse-lautrec',
    bonnard:'bonnard', vuillard:'vuillard', redon:'redon', munch:'munch', ensor:'ensor',
    kirchner:'kirchner', schiele:'schiele', kokoschka:'kokoschka', beckmann:'beckmann',
    grosz:'grosz', dix:'dix', duchamp:'duchamp', leger:'leger', braque:'braque',
    gris:'gris', malevich:'malevich', tatlin:'tatlin', lissitzky:'lissitzky',
    rivera:'rivera', kahlo:'kahlo', orozco:'orozco', siqueiros:'siqueiros',
    hopper:'hopper', okeefe:'okeefe', wood:'wood', benton:'benton',
    lichtenstein:'lichtenstein', rauschenberg:'rauschenberg', johns:'johns',
    haring:'haring', koons:'koons', richter:'richter', kiefer:'kiefer',
    bourgeois:'bourgeois', kusama:'kusama', banksy:'banksy', heckel:'heckel',
    pechstein:'pechstein', soutine:'soutine', simonet:'simonet', desportes:'desportes',
    rottluff:'schmidt-rottluff', manetti:'manetti', paik:'paik',
    fantin:'fantin-latour', latour:'fantin-latour',
};
const ARTIST_KEY_STOP = new Set(['the','van','der','von','and','und','la','le']);

/** Returns the static-file key for a known artist name (e.g. "gogh" for Vincent van Gogh). */
const getArtistStaticFileKey = (artistName: string): string => {
    // Canonicalize first so malformed labels — "1840-1926) Claude Monet (French",
    // "Alberto Giacometti (Switzerland, 1901-19" — collapse to the same key as the
    // clean name instead of leaking bio tokens (switzerland/1901) into the fallback.
    const norm = normalizeLookupText(getCanonicalName(artistName) || artistName);
    const tokens = norm.split(/\s+/).filter(t => t.length > 2 && !ARTIST_KEY_STOP.has(t));
    for (const t of tokens) {
        if (KNOWN_ARTIST_FILE_KEYS[t]) return KNOWN_ARTIST_FILE_KEYS[t];
    }
    // Fallback: sorted tokens (for warm-data artists not in KNOWN list)
    return tokens.sort().join('_');
};

type SearchFilterType = 'all' | 'artwork' | 'artist' | 'museum' | 'exhibition';

const SEARCH_FILTER_TABS: Array<{ id: SearchFilterType; label: string }> = [
    { id: 'all', label: '전체' },
    { id: 'artwork', label: '작품' },
    { id: 'artist', label: '작가' },
    { id: 'museum', label: '미술관' },
    { id: 'exhibition', label: '전시' },
];

type SearchTrendItem = {
    rank: number;
    term: string;
    delta: string;
    score: number;
};

type SearchTrendStat = {
    term: string;
    count: number;
    lastUsedAt: number;
};

const SEARCH_TREND_STATS_KEY = 'globalSearchTrendStats:v1';
const SEARCH_TREND_LAST_RANKS_KEY = 'globalSearchTrendLastRanks:v1';
const MAX_TRENDING_TERMS = 8;

const ARTIST_INTENT_STOP_TOKENS = new Set([
    'a', 'an', 'the', 'of', 'and', 'or', 'to', 'for', 'in', 'on', 'at', 'by', 'with',
    'de', 'la', 'le', 'du', 'des', 'van', 'von', 'da', 'di', 'del', 'della'
]);

const extractYearToken = (value?: string) => {
    const m = String(value || '').match(/(\d{4})/);
    return m ? m[1] : '';
};

const buildBrueckeLookupKeyCandidates = (art: any): string[] => {
    const title = normalizeLookupText(art?.name || art?.title);
    const artist = normalizeLookupText(art?.artist);
    const year = extractYearToken(art?.date || art?.year);
    const keys = [
        `${title}__${artist}__${year}`,
        `${title}__${artist}`,
        `${title}__${year}`,
        `${title}`,
    ];
    return keys.filter((k) => k && !k.startsWith('__'));
};

const sanitizeTrendTerm = (value?: string) =>
    String(value || '')
        .replace(/\s+/g, ' ')
        .trim();

export default function GlobalSearchBar({ forceWidth, onOpenLightbox, onNavigateToMuseum, museums = [], isModalOpen, inlineMode = false, drawingSkin = false }: GlobalSearchBarProps) {
    void onOpenLightbox; // Deprecated callback (kept for prop compatibility)
    const navigate = useNavigate();
    const location = useLocation();
    const { language, t } = useLanguage();
    const artistMap = useArtistI18n();
    const titleMap = useArtworkI18n();
    // Latest artist map for use inside async search closures whose effect deps
    // intentionally exclude artistMap (it loads once and caches).
    const artistMapRef = useRef(artistMap);
    artistMapRef.current = artistMap;
    // Tracks which non-English query the artwork list is currently accumulating
    // (worker + server results are merged per-query). Lets us reset the list when
    // the query itself changes so e.g. "모네" results don't linger under "샤갈".
    const augmentQueryRef = useRef<string>('');
    const isSearchPageMode = inlineMode && location.pathname.startsWith('/search');
    const { artistName: routeArtistSlug } = useParams<{ artistName?: string }>();
    // Restore query from sessionStorage if available
    const [query, setQuery] = useState(() => {
        try {
            const saved = sessionStorage.getItem('globalSearchQuery');
            return saved || '';
        } catch {
            return '';
        }
    });
    // Deferred copy of `query`. The <input> stays bound to `query` (instant,
    // urgent update) while heavy per-keystroke work — notably the ~8K artist
    // index scan below, which does a per-entry Korean name lookup — reads
    // `deferredQuery`. React keeps the deferred value lagging during fast typing
    // and only settles it once the main thread is idle, so that scan effectively
    // runs "after typing pauses" instead of on every character → no input jank.
    const deferredQuery = useDeferredValue(query);
    const [isExpanded, setIsExpanded] = useState(false);
    const [searchFilter, setSearchFilter] = useState<SearchFilterType>('all');
    const [filteredArtworks, setFilteredArtworks] = useState<SearchableArtwork[]>([]);
    const [workerArtistSuggestions, setSuggestedArtists] = useState<Array<{ artist: string; count: number; image?: string }>>([]);
    // Local artist index (substring search across ~8K artists) — populated by an effect below.
    const [artistIndexMatches, setArtistIndexMatches] = useState<Array<{ artist: string; count: number; image?: string }>>([]);
    // Combined artist suggestions: worker results take precedence (richer image
    // metadata), then dedupe-append local-index matches so substring queries
    // like "monet" / "manet" surface even when the worker returned nothing.
    // Dedupe by canonical artist key (getArtistStaticFileKey) so name-order /
    // casing variants of one artist — "Henri Matisse" vs "MATISSE Henri" —
    // merge into a single chip with a cleaned-up display name.
    const suggestedArtists = useMemo(() => {
        const byKey = new Map<string, { artist: string; count: number; image?: string; src: 'worker' | 'index' }>();
        const order: string[] = [];
        const consider = (a: { artist: string; count: number; image?: string }, src: 'worker' | 'index') => {
            const key = getArtistStaticFileKey(a.artist) || normalizeLookupText(a.artist);
            if (!key) return;
            const existing = byKey.get(key);
            if (!existing) {
                // Canonicalize before prettifying so the displayed name is the clean
                // form ("Claude Monet") the Korean i18n map is keyed by — getCanonicalName
                // also strips bio garbage that prettify alone would re-order into noise.
                byKey.set(key, { artist: prettifyArtistName(getCanonicalName(a.artist) || a.artist), count: a.count || 0, image: a.image, src });
                order.push(key);
                return;
            }
            // The worker's count is the authoritative global tally, so never stack the
            // index on top of it. But two *index* rows of one artist (a clean label plus
            // a malformed "(Switzerland, 1901-19" mis-split) are distinct buckets that
            // canonicalize to the same person — sum them so the chip shows the real total.
            if (existing.src === 'index' && src === 'index') existing.count += a.count || 0;
            if (!existing.image && a.image) existing.image = a.image;
        };
        for (const a of workerArtistSuggestions) consider(a, 'worker');
        for (const a of artistIndexMatches) consider(a, 'index');
        return order.map((k) => { const { src, ...rest } = byKey.get(k)!; void src; return rest; });
    }, [workerArtistSuggestions, artistIndexMatches]);
    const [filteredMuseums, setFilteredMuseums] = useState<Museum[]>([]);
    const [recentSearches, setRecentSearches] = useState<string[]>(() => {
        try {
            const raw = sessionStorage.getItem('searchRecentKeywords');
            if (!raw) return [];
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
                return parsed.filter((v) => typeof v === 'string').slice(0, 8);
            }
        } catch {
            // ignore
        }
        return [];
    });
    const [searchTrendStats, setSearchTrendStats] = useState<Record<string, SearchTrendStat>>(() => {
        try {
            const raw = sessionStorage.getItem(SEARCH_TREND_STATS_KEY);
            if (!raw) return {};
            const parsed = JSON.parse(raw);
            if (!parsed || typeof parsed !== 'object') return {};
            const next: Record<string, SearchTrendStat> = {};
            Object.entries(parsed).forEach(([key, value]) => {
                if (!value || typeof value !== 'object') return;
                const row = value as Partial<SearchTrendStat>;
                const term = sanitizeTrendTerm(row.term || key);
                if (!term) return;
                next[key] = {
                    term,
                    count: Math.max(0, Number(row.count) || 0),
                    lastUsedAt: Number(row.lastUsedAt) || 0,
                };
            });
            return next;
        } catch {
            return {};
        }
    });
    const previousTrendRanksRef = useRef<Record<string, number>>((() => {
        try {
            const raw = sessionStorage.getItem(SEARCH_TREND_LAST_RANKS_KEY);
            if (!raw) return {};
            const parsed = JSON.parse(raw);
            return parsed && typeof parsed === 'object' ? parsed as Record<string, number> : {};
        } catch {
            return {};
        }
    })());
    const [totalCount, setTotalCount] = useState(0);
    const workerRef = useRef<Worker | null>(null);
    const workerMessageHandlerRef = useRef<((e: MessageEvent) => void) | null>(null);
    const pendingRouteArtistRef = useRef<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    // True while a non-AI search is in flight with nothing rendered yet —
    // drives the witty loading state so the first-search gap isn't blank.
    const [searchPending, setSearchPending] = useState(false);
    const [isNetworkConstrained] = useState(() => shouldLimitNetwork());
    // Restore artistGallery from sessionStorage if available
    const [artistGallery, setArtistGallery] = useState<{ artist: string; artworks: SearchableArtwork[]; isLoading?: boolean } | null>(() => {
        try {
            const saved = sessionStorage.getItem('artistGallery');
            if (saved) {
                const data = JSON.parse(saved);
                // Sanitize/Fix IDs on load (Critical for MAMCS navigation fix)
                let works = data.artworks || [];
                works = works.map((art: any) => {
                    if (art.id && (art.id.startsWith('mamcs-') || art.id.startsWith('mamcs_'))) {
                        if (art.id.startsWith('mamcs-paintings-')) art.exhibitionId = 'mamcs-strasbourg-paintings-collection';
                        else if (art.id.startsWith('mamcs-drawings-')) art.exhibitionId = 'mamcs-strasbourg-drawings-collection';
                        else if (art.id.startsWith('mamcs-photography-')) art.exhibitionId = 'mamcs-strasbourg-photography-collection';
                        else if (art.id.startsWith('mamcs-graphic-design-')) art.exhibitionId = 'mamcs-strasbourg-graphic-design-collection';
                    }
                    return art;
                });
                works = works.filter((art: any) => {
                    const museumName = (art.museumName || '').toLowerCase();
                    const exhibitionId = (art.exhibitionId || '').toLowerCase();
                    if (museumName.includes('serpentine gallery') || museumName.includes('british museum')) return false;
                    if (exhibitionId.includes('serpentine') || exhibitionId.includes('british-museum') || exhibitionId.includes('the-british-museum') || exhibitionId.includes('bm-collection')) return false;
                    return true;
                });
                const savedArtist = String(data.artist || '').trim();
                if (!savedArtist) return null;
                return { artist: savedArtist, artworks: works, isLoading: data.isLoading === true };
            }
        } catch {
            // Ignore parse errors
        }
        return null;
    });
    const [lightboxArtwork, setLightboxArtwork] = useState<SearchableArtwork | null>(null);
    const [productArtwork, setProductArtwork] = useState<SearchableArtwork | null>(null);
    const [playlistArtwork, setPlaylistArtwork] = useState<SearchableArtwork | null>(null);
    const [isMobile, setIsMobile] = useState(false);
    const [isArtistListExpanded, setIsArtistListExpanded] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const queryRef = useRef(query);
    const semanticSearchRequestSeqRef = useRef(0);

    // Mobile augmentation merge.
    // - prev = local warm-prefix matches (real keyword matches against artist/title)
    // - next = server semantic matches (visually similar, may not be name matches)
    //
    // Local matches are AUTHORITATIVE for keyword queries (they actually contain
    // the substring). We keep them all, then prepend server results that are also
    // real artist matches (catches "Gogh" → all "Vincent van Gogh" works that
    // weren't in the local "g" bucket because the artist's name starts with V).
    // Pure visual matches go below the artist matches as supplementary.
    const mergeMobileServerAugment = useCallback((prev: SearchableArtwork[], next: SearchableArtwork[], queryText: string) => {
        const seen = new Set<string>();
        const local: SearchableArtwork[] = [];
        const artistMatches: SearchableArtwork[] = [];
        const titleMatches: SearchableArtwork[] = [];
        const visualOnly: SearchableArtwork[] = [];
        const q = (queryText || '').trim().toLowerCase();

        // 1) Keep ALL local results (these are real text matches from warm prefix)
        for (const item of prev) {
            const id = String(item.id || '');
            if (!id || seen.has(id)) continue;
            seen.add(id);
            local.push(item);
        }

        // 2) Triage server results into artist-name match / title match / visual-only
        for (const item of next) {
            const id = String(item.id || '');
            if (!id || seen.has(id)) continue;
            seen.add(id);
            const artist = (item.artist || '').toLowerCase();
            const name = (item.name || '').toLowerCase();
            if (q.length >= 2 && artist.includes(q)) artistMatches.push(item);
            else if (q.length >= 2 && name.includes(q)) titleMatches.push(item);
            else visualOnly.push(item);
        }

        // 3) Order: local (authoritative) → artist matches → title matches → visual
        return [...local, ...artistMatches, ...titleMatches, ...visualOnly];
    }, []);

    // AI Semantic Search (Transformers.js 브라우저 WASM + HF API 폴백)
    const [isAIMode, setIsAIMode] = useState(false);
    // AI 모드 안의 정밀 검색 토글 (Jina CLIP v2 한국어 native). 기본 OFF = SigLIP+번역.
    const [isPrecisionMode, setIsPrecisionMode] = useState(false);
    const [aiPulsing, setAiPulsing] = useState(false);
    const [aiResults, setAiResults] = useState<SearchableArtwork[]>([]);
    const [isAILoading, setIsAILoading] = useState(false);
    const [isClipLoading, setIsClipLoading] = useState(false); // 호환성 유지 (항상 false)
    const [encoderStatus, setEncoderStatusState] = useState<'idle' | 'loading' | 'ready' | 'error'>(getEncoderStatus);
    const [artistPreviewImageAsyncByName, setArtistPreviewImageAsyncByName] = useState<Record<string, string>>({});
    const [museumPreviewImageAsyncById, setMuseumPreviewImageAsyncById] = useState<Record<string, string>>({});
    const [exhibitionPreviewImageAsyncById, setExhibitionPreviewImageAsyncById] = useState<Record<string, string>>({});
    const [exhibitionPreviewFallbackById, setExhibitionPreviewFallbackById] = useState<Record<string, string>>({});
    const artistPreviewFetchInFlightRef = useRef<Set<string>>(new Set());
    // Session-level cache for the "first image in a collection JSON" lookup.
    // Persisting across component remounts (same tab session) avoids re-issuing
    // 32KB range fetches whenever the user leaves and returns to the search UI,
    // which was a noticeable CPU/battery drain on mobile.
    const collectionPreviewByFileRef = useRef<Map<string, string>>(
        (() => {
            try {
                const raw = sessionStorage.getItem('armin:collectionPreview:v1');
                if (!raw) return new Map<string, string>();
                const obj = JSON.parse(raw);
                return new Map<string, string>(Object.entries(obj));
            } catch {
                return new Map<string, string>();
            }
        })()
    );
    const collectionSecondPreviewByFileRef = useRef<Map<string, string>>(
        (() => {
            try {
                const raw = sessionStorage.getItem('armin:collectionPreview2:v1');
                if (!raw) return new Map<string, string>();
                const obj = JSON.parse(raw);
                return new Map<string, string>(Object.entries(obj));
            } catch {
                return new Map<string, string>();
            }
        })()
    );
    const collectionPreviewFetchInFlightRef = useRef<Map<string, Promise<string>>>(new Map());
    // Throttled sessionStorage flush — batch writes so we don't serialize on every set.
    const previewCacheFlushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const schedulePreviewCacheFlush = () => {
        if (previewCacheFlushTimerRef.current) return;
        previewCacheFlushTimerRef.current = setTimeout(() => {
            previewCacheFlushTimerRef.current = null;
            try {
                const a = Object.fromEntries(collectionPreviewByFileRef.current.entries());
                const b = Object.fromEntries(collectionSecondPreviewByFileRef.current.entries());
                sessionStorage.setItem('armin:collectionPreview:v1', JSON.stringify(a));
                sessionStorage.setItem('armin:collectionPreview2:v1', JSON.stringify(b));
            } catch {
                // quota / access error — cache stays in memory
            }
        }, 1500);
    };
    // Stores exhibition IDs requested before worker finishes loading allArtworks,
    // so GET_EXHIBITION_SAMPLE can be retried once LOAD_COMPLETE fires.
    const pendingExhibitionIdsRef = useRef<string[]>([]);
    // Whether exhibition-previews.json has been loaded
    const exhibitionPreviewsLoadedRef = useRef(false);

    // ── Pre-populate exhibition preview images from static JSON ───────────────
    // exhibition-previews.json is pre-built at dev/build time with the first image
    // URL for every collection. This eliminates runtime Range-fetch and ensures
    // thumbnails appear immediately — no worker, no network delay.
    useEffect(() => {
        if (exhibitionPreviewsLoadedRef.current) return;
        exhibitionPreviewsLoadedRef.current = true;
        fetch('/data/exhibition-previews.json')
            .then(r => {
                console.log('[IMG-DEBUG] exhibition-previews.json fetch status:', r.status, r.ok);
                return r.ok ? r.json() : null;
            })
            .then((map: Record<string, string> | null) => {
                if (!map) { console.warn('[IMG-DEBUG] exhibition-previews.json returned null/empty'); return; }
                console.log('[IMG-DEBUG] exhibition-previews.json loaded. Keys:', Object.keys(map).length, '| Sample keys:', Object.keys(map).slice(0, 10));
                // Log Rijksmuseum entries specifically
                const rijksKeys = Object.keys(map).filter(k => k.includes('rijks'));
                console.log('[IMG-DEBUG] Rijksmuseum entries in previews JSON:', rijksKeys.length, rijksKeys);
                for (const k of rijksKeys) {
                    console.log(`[IMG-DEBUG]   ${k} → ${map[k]}`);
                }
                setExhibitionPreviewImageAsyncById(prev => {
                    const merged: Record<string, string> = { ...map };
                    // Don't overwrite existing values (e.g., from worker)
                    for (const [k, v] of Object.entries(prev)) {
                        if (v) merged[k] = v;
                    }
                    return merged;
                });
            })
            .catch((err) => { console.error('[IMG-DEBUG] exhibition-previews.json fetch failed:', err); });
    }, []);

    const rememberSearchTerm = useCallback((raw: string) => {
        const keyword = String(raw || '').trim();
        if (!keyword) return;
        const keywordToken = normalizeLookupText(keyword);
        setRecentSearches((prev) => {
            const merged = [keyword, ...prev.filter((v) => normalizeLookupText(v) !== normalizeLookupText(keyword))].slice(0, 8);
            try {
                sessionStorage.setItem('searchRecentKeywords', JSON.stringify(merged));
            } catch {
                // ignore
            }
            return merged;
        });
        setSearchTrendStats((prev) => {
            if (!keywordToken) return prev;
            const now = Date.now();
            const existing = prev[keywordToken];
            const next: Record<string, SearchTrendStat> = {
                ...prev,
                [keywordToken]: {
                    term: keyword,
                    count: (existing?.count || 0) + 1,
                    lastUsedAt: now,
                },
            };
            try {
                sessionStorage.setItem(SEARCH_TREND_STATS_KEY, JSON.stringify(next));
            } catch {
                // ignore
            }
            return next;
        });
    }, []);

    const clearRecentSearches = useCallback(() => {
        setRecentSearches([]);
        try {
            sessionStorage.removeItem('searchRecentKeywords');
        } catch {
            // ignore
        }
    }, []);

    // Recommendation Mode
    const [isRecommendMode, setIsRecommendMode] = useState(false);
    const [recommendResults, setRecommendResults] = useState<SearchableArtwork[]>([]);
    const [isRecommendLoading, setIsRecommendLoading] = useState(false);

    const [aiFilteredCount, setAiFilteredCount] = useState(0);
    const [videoEmbedIdsReady, setVideoEmbedIdsReady] = useState(false);
    const videoEmbedIdsRef = useRef<Set<string>>(new Set());

    const knownArtistTokenSet = useMemo(() => {
        const tokens = new Set<string>();
        for (const entry of artists as Array<{ name?: string }>) {
            const normalizedName = normalizeLookupText(entry?.name || '');
            if (!normalizedName) continue;
            for (const token of normalizedName.split(' ')) {
                if (token.length < 3) continue;
                if (ARTIST_INTENT_STOP_TOKENS.has(token)) continue;
                tokens.add(token);
            }
        }
        return tokens;
    }, []);

    const matchedExhibitions = useMemo(() => {
        const q = normalizeLookupText(query);
        if (!q) return [] as Array<{ exhibitionId: string; exhibitionName: string; museumName: string; museumNameDisplay: string; country?: string }>;
        const unique = new Map<string, { exhibitionId: string; exhibitionName: string; museumName: string; museumNameDisplay: string; country?: string }>();
        for (const museum of museums) {
            // museumName stays canonical (used as a resolveMuseumId key); the
            // display/match-token below carries the localized name.
            const museumName = museum?.name || '';
            const museumNameDisplay = getMuseumDisplayName(museum, language);
            const museumToken = normalizeLookupText(museumName);
            const museumKoToken = normalizeLookupText(museumNameDisplay);
            for (const pe of museum?.permanentExhibitions || []) {
                const exhibitionId = String(pe?.id || '').trim();
                if (!exhibitionId) continue;
                const exhibitionName = String(pe?.name || '').trim() || exhibitionId;
                const exhibitionToken = normalizeLookupText(exhibitionName);
                if (!exhibitionToken.includes(q) && !museumToken.includes(q) && !museumKoToken.includes(q)) continue;
                if (!unique.has(exhibitionId)) {
                    unique.set(exhibitionId, {
                        exhibitionId,
                        exhibitionName,
                        museumName,
                        museumNameDisplay,
                        country: museum?.country,
                    });
                }
            }
        }
        return Array.from(unique.values()).slice(0, 8);
    }, [museums, query, language]);

    const liveTrendingTerms = useMemo<SearchTrendItem[]>(() => {
        const scoreByToken = new Map<string, { term: string; score: number }>();
        const exhibitionNameTokenSet = new Set<string>();

        const upsertScore = (rawTerm: string, score: number) => {
            const term = sanitizeTrendTerm(rawTerm);
            const token = normalizeLookupText(term);
            if (!token || token.length < 2 || !term || !Number.isFinite(score) || score <= 0) return;
            const existing = scoreByToken.get(token);
            if (!existing) {
                scoreByToken.set(token, { term, score });
                return;
            }
            existing.score += score;
            if (term.length > existing.term.length) {
                existing.term = term;
            }
        };

        const now = Date.now();

        Object.values(searchTrendStats).forEach((entry) => {
            const recencyHours = Math.max(0, (now - Number(entry.lastUsedAt || 0)) / (1000 * 60 * 60));
            const recencyBoost = Math.max(0, 36 - recencyHours) * 0.35;
            const frequencyBoost = Math.max(1, Number(entry.count) || 0) * 12;
            upsertScore(entry.term, frequencyBoost + recencyBoost);
        });

        recentSearches.forEach((term, index) => {
            upsertScore(term, Math.max(0, 16 - index * 1.9));
        });

        museums.forEach((museum) => {
            const museumName = sanitizeTrendTerm(museum?.name || '');
            if (museumName) {
                const exhibitionCount = museum?.permanentExhibitions?.length || 0;
                upsertScore(museumName, 3 + Math.min(18, exhibitionCount * 0.8));
            }
            (museum?.permanentExhibitions || []).forEach((pe) => {
                const exhibitionName = sanitizeTrendTerm(pe?.name || '');
                if (!exhibitionName || exhibitionName.length < 3) return;
                const exhibitionToken = normalizeLookupText(exhibitionName);
                if (exhibitionToken) exhibitionNameTokenSet.add(exhibitionToken);
            });
        });

        const artistCounts = new Map<string, number>();
        filteredArtworks.forEach((artwork) => {
            const artist = sanitizeTrendTerm(artwork.artist);
            if (!artist || normalizeLookupText(artist) === 'unknown artist') return;
            artistCounts.set(artist, (artistCounts.get(artist) || 0) + 1);
        });

        Array.from(artistCounts.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .forEach(([artist, count]) => {
                upsertScore(artist, 4 + count * 3.2);
            });

        const artworkTitleCounts = new Map<string, number>();
        filteredArtworks.forEach((artwork) => {
            const title = sanitizeTrendTerm(artwork.name || artwork.searchName || '');
            if (!title || title.length < 3) return;
            artworkTitleCounts.set(title, (artworkTitleCounts.get(title) || 0) + 1);
        });

        Array.from(artworkTitleCounts.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 12)
            .forEach(([title, count]) => {
                upsertScore(title, 3 + count * 2.4);
            });

        const ranked = Array.from(scoreByToken.values())
            .filter((item) => {
                const token = normalizeLookupText(item.term);
                if (!token) return false;
                // Exclude exhibition names from live trending list.
                if (exhibitionNameTokenSet.has(token)) return false;
                return true;
            })
            .sort((a, b) => b.score - a.score)
            .slice(0, MAX_TRENDING_TERMS);

        const prevRanks = previousTrendRanksRef.current;
        return ranked.map((item, index) => {
            const rank = index + 1;
            const token = normalizeLookupText(item.term);
            const previousRank = token ? prevRanks[token] : undefined;
            let delta = '-';
            if (typeof previousRank === 'number') {
                if (previousRank > rank) delta = `▲${previousRank - rank}`;
                else if (previousRank < rank) delta = `▼${rank - previousRank}`;
            } else if (item.score >= 20) {
                delta = 'NEW';
            }
            return { rank, term: item.term, delta, score: item.score };
        });
    }, [filteredArtworks, museums, recentSearches, searchTrendStats]);

    useEffect(() => {
        const nextRanks: Record<string, number> = {};
        liveTrendingTerms.forEach((item) => {
            const token = normalizeLookupText(item.term);
            if (!token) return;
            nextRanks[token] = item.rank;
        });
        previousTrendRanksRef.current = nextRanks;
        try {
            sessionStorage.setItem(SEARCH_TREND_LAST_RANKS_KEY, JSON.stringify(nextRanks));
        } catch {
            // ignore
        }
    }, [liveTrendingTerms]);

    const artistPreviewCandidatesByName = useMemo(() => {
        const map = new Map<string, string[]>();

        const pushCandidate = (artistName?: string, imageUrl?: string) => {
            const key = normalizeLookupText(artistName);
            const image = normalizeKnownBrokenImageUrl(imageUrl);
            if (!key || !image) return;

            const candidates = map.get(key) || [];
            if (candidates.includes(image)) return;
            if (candidates.length >= 3) return;

            map.set(key, [...candidates, image]);
        };

        for (const art of filteredArtworks) {
            pushCandidate(art.artist, art.image);
        }
        for (const art of artistGallery?.artworks || []) {
            pushCandidate(art.artist, art.image);
        }
        for (const artist of suggestedArtists) {
            pushCandidate(artist.artist, artist.image);
        }

        return map;
    }, [artistGallery?.artworks, filteredArtworks, suggestedArtists]);

    const artistPreviewImageByName = useMemo(() => {
        const map = new Map<string, string>();
        for (const [key, candidates] of artistPreviewCandidatesByName.entries()) {
            if (candidates[0]) map.set(key, candidates[0]);
        }
        return map;
    }, [artistPreviewCandidatesByName]);

    const artistPreviewFallbackByName = useMemo(() => {
        const map = new Map<string, string>();
        for (const [key, candidates] of artistPreviewCandidatesByName.entries()) {
            if (candidates[1]) map.set(key, candidates[1]);
        }
        return map;
    }, [artistPreviewCandidatesByName]);

    const museumIdByName = useMemo(() => {
        const map = new Map<string, string>();
        for (const museum of museums) {
            // Primary key: name only (for basic lookups)
            const nameKey = normalizeLookupText(museum?.name || '');
            if (nameKey && !map.has(nameKey)) map.set(nameKey, museum.id);
            // Secondary key: name+country for disambiguation (e.g. NPG UK vs USA)
            const countryKey = nameKey && museum.country
                ? `${nameKey}||${normalizeLookupText(museum.country)}`
                : '';
            if (countryKey) map.set(countryKey, museum.id);
        }
        return map;
    }, [museums]);

    /** Resolve museum ID preferring name+country match, falling back to name-only */
    const resolveMuseumId = useCallback((museumName: string, country?: string) => {
        const nameKey = normalizeLookupText(museumName);
        if (country) {
            const countryKey = `${nameKey}||${normalizeLookupText(country)}`;
            const byCountry = museumIdByName.get(countryKey);
            if (byCountry) return byCountry;
        }
        return museumIdByName.get(nameKey);
    }, [museumIdByName]);

    const museumPreviewImageById = useMemo(() => {
        const map = new Map<string, string>();
        for (const museum of museums) {
            let chosen = normalizeKnownBrokenImageUrl(museum.representativeImage);

            if (!chosen) {
                const byMuseumName = filteredArtworks.find((art) =>
                    normalizeLookupText(art.museumName) === normalizeLookupText(museum.name) &&
                    !!normalizeKnownBrokenImageUrl(art.image)
                );
                chosen = normalizeKnownBrokenImageUrl(byMuseumName?.image);
            }

            if (!chosen) {
                const exhibitionTokenSet = new Set<string>();
                for (const pe of museum.permanentExhibitions || []) {
                    const token = normalizeToken((pe as any)?.id || '');
                    if (token) exhibitionTokenSet.add(token);
                }
                if (exhibitionTokenSet.size > 0) {
                    const byExhibition = filteredArtworks.find((art) =>
                        exhibitionTokenSet.has(normalizeToken(art.exhibitionId || '')) &&
                        !!normalizeKnownBrokenImageUrl(art.image)
                    );
                    chosen = normalizeKnownBrokenImageUrl(byExhibition?.image);
                }
            }

            if (chosen) {
                map.set(museum.id, chosen);
            }
        }
        return map;
    }, [filteredArtworks, museums]);

    const exhibitionPreviewImageById = useMemo(() => {
        const map = new Map<string, string>();

        for (const art of filteredArtworks) {
            const exId = String(art.exhibitionId || '').trim();
            const img = normalizeKnownBrokenImageUrl(art.image);
            if (!exId || !img || map.has(exId)) continue;
            map.set(exId, img);
        }

        for (const item of matchedExhibitions) {
            if (map.has(item.exhibitionId)) continue;
            // Use country-aware museum lookup to avoid cross-museum collisions (e.g. NPG UK vs USA)
            const museumId = resolveMuseumId(item.museumName, item.country);
            if (!museumId) continue;
            const museumImg = museumPreviewImageById.get(museumId);
            if (museumImg) map.set(item.exhibitionId, museumImg);
        }

        return map;
    }, [filteredArtworks, matchedExhibitions, resolveMuseumId, museumPreviewImageById]);

    const resolveCollectionFileByExhibitionId = useCallback((exhibitionId: string, museumIdHint?: string) => {
        const targetToken = normalizeToken(exhibitionId);
        if (!targetToken) return '';

        const findInMuseum = (museum?: Museum) => {
            if (!museum) return '';
            for (const pe of museum.permanentExhibitions || []) {
                const peAny = pe as any;
                const peIdToken = normalizeToken(peAny?.id || '');
                if (peIdToken === targetToken || getExhibitionTokens(peAny).has(targetToken)) {
                    const file = String(peAny?.collectionFile || '').trim();
                    if (file) return file;
                }
            }
            return '';
        };

        if (museumIdHint) {
            const hinted = museums.find((m) => m.id === museumIdHint);
            const file = findInMuseum(hinted);
            if (file) return file;
        }

        for (const museum of museums) {
            const file = findInMuseum(museum);
            if (file) return file;
        }

        return '';
    }, [museums]);

    const pickFirstCollectionImage = useCallback((payload: any) => {
        const list = Array.isArray(payload)
            ? payload
            : (payload?.artworks || payload?.objects || payload?.items || payload?.results || []);
        if (!Array.isArray(list)) return '';

        for (const item of list) {
            const candidate = normalizeKnownBrokenImageUrl(
                item?.image || item?.imageUrl || item?.i || item?.thumbnail?.url || item?.thumbnail?.src || item?.thumbnail
            );
            if (candidate) return candidate;
        }

        return '';
    }, []);

    const fetchCollectionPreviewImage = useCallback(async (collectionFile: string) => {
        const file = String(collectionFile || '').trim();
        if (!file) return '';

        // Synchronous cache hit
        if (collectionPreviewByFileRef.current.has(file)) {
            return collectionPreviewByFileRef.current.get(file) || '';
        }

        // In-flight: return the SAME promise so all concurrent callers get the result
        const existing = collectionPreviewFetchInFlightRef.current.get(file);
        if (existing) return existing;

        const promise = (async () => {
            try {
                // Fetch only the first 32KB to quickly extract the first image URL,
                // instead of downloading potentially 10–50MB collection files.
                const res = await fetch(`/data/${file}`, {
                    headers: { 'Range': 'bytes=0-32767' },
                });
                // Range responses return 206; full responses (small files) return 200
                if (!res.ok && res.status !== 206) {
                    collectionPreviewByFileRef.current.set(file, '');
                    return '';
                }

                const text = await res.text();

                // Try full JSON parse first (works if the file fits in 32KB or server returns full)
                let image = '';
                let secondImage = '';
                try {
                    const payload = JSON.parse(text);
                    // Pick first 2 valid images from the collection.
                    // Priority: image > imageUrl > thumbnailUrl > i > thumbnail.*
                    // We also separately grab thumbnailUrl to use as a fallback when
                    // the primary imageUrl (R2) is the same URL but fails in WebView.
                    const list = Array.isArray(payload)
                        ? payload
                        : (payload?.artworks || payload?.objects || payload?.items || payload?.results || []);
                    for (const entry of Array.isArray(list) ? list : []) {
                        const primary = normalizeKnownBrokenImageUrl(
                            entry?.image || entry?.imageUrl || entry?.i
                        );
                        const fallback = normalizeKnownBrokenImageUrl(
                            entry?.thumbnailUrl || entry?.thumbnail?.url || entry?.thumbnail?.src || entry?.thumbnail
                        );
                        if (primary && !image) {
                            image = primary;
                            // Use a different-domain fallback (thumbnailUrl) so if the CDN
                            // that serves `image` is blocked by the WebView, the IIIF-based
                            // thumbnailUrl (proxied through wsrv.nl) still loads.
                            if (fallback && fallback !== primary) secondImage = fallback;
                        } else if (!image && fallback) {
                            image = fallback;
                        } else if (image && !secondImage) {
                            const alt = primary || fallback;
                            if (alt && alt !== image) { secondImage = alt; break; }
                        }
                        if (image && secondImage) break;
                    }
                } catch {
                    // Partial JSON — extract first two image URLs via regex.
                    const patterns = [
                        /"(?:image|imageUrl|primaryImageSmall|primaryImage|img)\s*"\s*:\s*"([^"]{10,})"/g,
                        /"thumbnailUrl"\s*:\s*"(https?:\/\/[^"]{8,})"/g,
                        /"i"\s*:\s*"(https?:\/\/[^"]{8,})"/g,
                        /"thumbnail"\s*:\s*\{[^}]*"url"\s*:\s*"([^"]{10,})"/g,
                    ];
                    for (const pat of patterns) {
                        const matches = [...text.matchAll(pat)];
                        for (const m of matches) {
                            if (m[1]) {
                                const candidate = normalizeKnownBrokenImageUrl(m[1]);
                                if (candidate) {
                                    if (!image) image = candidate;
                                    else if (candidate !== image) { secondImage = candidate; break; }
                                }
                            }
                        }
                        if (image && secondImage) break;
                    }
                }

                // Cache both images so we don't retry
                console.log(`[IMG-DEBUG] fetchCollectionPreviewImage("${file}") → image=${image || 'NONE'} | second=${secondImage || 'NONE'}`);
                collectionPreviewByFileRef.current.set(file, image);
                collectionSecondPreviewByFileRef.current.set(file, secondImage);
                schedulePreviewCacheFlush();
                return image;
            } catch (err) {
                console.error(`[IMG-DEBUG] fetchCollectionPreviewImage("${file}") EXCEPTION:`, err);
                collectionPreviewByFileRef.current.set(file, '');
                return '';
            } finally {
                collectionPreviewFetchInFlightRef.current.delete(file);
            }
        })();

        collectionPreviewFetchInFlightRef.current.set(file, promise);
        return promise;
    }, [pickFirstCollectionImage]);

    const fetchSemanticPreviewImage = useCallback(async (keyword: string) => {
        const q = String(keyword || '').trim();
        if (!q || q.length < 2) return '';
        try {
            const rows = await searchByText(q, 16);
            for (const row of rows) {
                const candidate = normalizeKnownBrokenImageUrl(row?.i || row?.image || row?.url || row?.thumbnail);
                if (candidate) return candidate;
            }
            return '';
        } catch {
            return '';
        }
    }, []);

    useEffect(() => {
        if (!isSearchPageMode || query.trim().length < 2 || suggestedArtists.length === 0) return;

        let cancelled = false;
        const missing = suggestedArtists
            .slice(0, 8)
            .map(({ artist }) => artist)
            .filter((artistName) => {
                const key = normalizeLookupText(artistName);
                return !!key &&
                    !artistPreviewImageByName.has(key) &&
                    !artistPreviewImageAsyncByName[key] &&
                    !artistPreviewFetchInFlightRef.current.has(key);
            })
            .slice(0, 4);

        if (missing.length === 0) return;

        const run = async () => {
            for (const artistName of missing) {
                const key = normalizeLookupText(artistName);
                if (!key) continue;
                artistPreviewFetchInFlightRef.current.add(key);
                try {
                    const rows = await searchByText(artistName, 12);
                    const strict = rows.find((row: any) => {
                        return isStrictArtistNameMatch(row?.artist || row?.a || '', artistName);
                    });
                    const relaxed = rows.find((row: any) => {
                        const candidateArtist = normalizeLookupText(row?.artist || row?.a || '');
                        const target = normalizeLookupText(artistName);
                        if (!candidateArtist || !target) return false;
                        return candidateArtist.includes(target) || target.includes(candidateArtist);
                    });
                    const firstWithImage = rows.find((row: any) => {
                        return !!normalizeKnownBrokenImageUrl(row?.i || row?.image || row?.url);
                    });
                    const picked = strict || relaxed || firstWithImage;
                    const image = normalizeKnownBrokenImageUrl(picked?.i || picked?.image || picked?.url);
                    if (!cancelled && image) {
                        setArtistPreviewImageAsyncByName((prev) => (prev[key] ? prev : { ...prev, [key]: image }));
                    }
                } catch {
                    // ignore artist thumb fetch failures
                } finally {
                    artistPreviewFetchInFlightRef.current.delete(key);
                }
            }
        };

        void run();

        return () => {
            cancelled = true;
        };
    }, [artistPreviewImageAsyncByName, artistPreviewImageByName, isSearchPageMode, query, suggestedArtists]);

    // ── Worker-based fast exhibition image lookup ──────────────────────────────
    // When matchedExhibitions changes, immediately ask the search worker to return
    // one sample image per exhibitionId from its in-memory allArtworks array.
    // This is O(n) in-memory — no network I/O — and is much faster than Range-fetching
    // collection JSON files. Falls back to the Range-fetch effect below for slow/cold cases.
    useEffect(() => {
        if (matchedExhibitions.length === 0) return;

        const missingIds = matchedExhibitions
            .map(item => item.exhibitionId)
            .filter(id => id && !exhibitionPreviewImageAsyncById[id]);

        if (missingIds.length === 0) return;

        // Always update the pending list (for retry on LOAD_COMPLETE)
        pendingExhibitionIdsRef.current = missingIds;

        if (workerRef.current) {
            workerRef.current.postMessage({
                type: 'GET_EXHIBITION_SAMPLE',
                exhibitionIds: missingIds,
            });
        }
    }, [matchedExhibitions, exhibitionPreviewImageAsyncById]);

    useEffect(() => {
        // Fetch preview images for any matched exhibitions/museums that don't yet have one.
        // NOTE: Do NOT include exhibitionPreviewImageAsyncById / museumPreviewImageAsyncById in
        // deps — those are the values we're writing to, and including them causes an infinite loop.
        if (matchedExhibitions.length === 0 && filteredMuseums.length === 0) return;

        // Use a per-task cancel set keyed by exhibitionId/museumId so that a later
        // effect re-run (triggered by filteredArtworks changes) does NOT cancel
        // still-pending fetches that started in an earlier run.
        const cancelledIds = new Set<string>();
        const tasks: Array<Promise<void>> = [];

        for (const museum of filteredMuseums.slice(0, 8)) {
            if (museumPreviewImageById.has(museum.id)) continue;
            const collectionFile = (museum.permanentExhibitions || [])
                .map((pe) => String((pe as any)?.collectionFile || '').trim())
                .find(Boolean);
            // Skip if we already have a cached result for this file
            if (collectionFile && collectionPreviewByFileRef.current.has(collectionFile)) continue;

            const id = museum.id;
            tasks.push((async () => {
                const collectionImage = collectionFile
                    ? await fetchCollectionPreviewImage(collectionFile)
                    : '';
                const image = collectionImage
                    || await fetchSemanticPreviewImage(`${museum.name} ${museum.country || ''}`);
                if (!cancelledIds.has(id) && image) {
                    setMuseumPreviewImageAsyncById((prev) => (prev[id] ? prev : { ...prev, [id]: image }));
                }
            })());
        }

        for (const item of matchedExhibitions.slice(0, 10)) {
            // Use country-aware museum resolution
            const museumId = resolveMuseumId(item.museumName, item.country);
            const collectionFile = resolveCollectionFileByExhibitionId(item.exhibitionId, museumId);

            const id = item.exhibitionId;
            const hasPrimary = exhibitionPreviewImageById.has(id) || !!exhibitionPreviewImageAsyncById[id];
            const hasFallback = !!exhibitionPreviewFallbackById[id];
            if (hasPrimary && hasFallback) continue;

            tasks.push((async () => {
                const collectionImage = collectionFile
                    ? await fetchCollectionPreviewImage(collectionFile)
                    : '';
                if (!hasPrimary) {
                    const image = collectionImage
                        || await fetchSemanticPreviewImage(`${item.exhibitionName} ${item.museumName}`);
                    if (!cancelledIds.has(id) && image) {
                        // Always overwrite — collection-file images take priority over stale R2 cache
                        setExhibitionPreviewImageAsyncById((prev) => (prev[id] === image ? prev : { ...prev, [id]: image }));
                    }
                }
                // Store second image as onError fallback
                if (!cancelledIds.has(id) && collectionFile && !hasFallback) {
                    const second = collectionSecondPreviewByFileRef.current.get(collectionFile) || '';
                    if (second) {
                        setExhibitionPreviewFallbackById((prev) => (prev[id] === second ? prev : { ...prev, [id]: second }));
                    }
                }
            })());
        }

        if (tasks.length > 0) {
            void Promise.all(tasks);
        }

        return () => {
            // Mark this batch as cancelled so stale results are ignored.
            // We cancel per-ID so only the outdated batch is discarded,
            // not still-pending fetches from a newer effect run.
            for (const museum of filteredMuseums) cancelledIds.add(museum.id);
            for (const item of matchedExhibitions) cancelledIds.add(item.exhibitionId);
        };
    }, [
        // Stable: only re-run when the matched set changes, not when async state updates
        exhibitionPreviewFallbackById,
        exhibitionPreviewImageAsyncById,
        exhibitionPreviewImageById,
        fetchCollectionPreviewImage,
        fetchSemanticPreviewImage,
        filteredMuseums,
        matchedExhibitions,
        museumPreviewImageById,
        resolveCollectionFileByExhibitionId,
        resolveMuseumId,
    ]);


    const showArtistsInSearchMode = searchFilter === 'all' || searchFilter === 'artist';
    const showMuseumsInSearchMode = searchFilter === 'all' || searchFilter === 'museum';
    const showArtworksInSearchMode = searchFilter === 'all' || searchFilter === 'artwork';
    const showExhibitionsInSearchMode = searchFilter === 'all' || searchFilter === 'exhibition';
    const artistCollapsedCount = isMobile ? 8 : 10;

    useEffect(() => {
        setIsArtistListExpanded(false);
    }, [query, searchFilter]);

    // 인코더 상태 구독 (모델 로딩 진행 UI)
    useEffect(() => {
        const unsub = onEncoderStatusChange(setEncoderStatusState);
        return unsub;
    }, []);

    const requestLoginModal = useCallback(() => {
        if (typeof window === 'undefined') return;
        try {
            window.dispatchEvent(new CustomEvent('auth:request-login'));
        } catch (err) {
            console.error('Failed to dispatch login modal request', err);
        }
    }, []);

    const sanitizeArtistId = (value: string) => {
        // Revert to allow parentheses for DB consistency
        return (value || '')
            .replace(/[\/\\#\[\].*?]/g, '_')
            .trim()
            .slice(0, 200);
    };

    const toArtistSlug = (value: string) => {
        // Strip parentheses for cleaner URLs
        return sanitizeArtistId(value)
            .replace(/[()]/g, '')
            .replace(/[\s_]+/g, '-')
            .replace(/-+/g, '-')
            .toLowerCase();
    };

    const getRouteArtistName = useCallback(() => {
        const params = new URLSearchParams(location.search);
        let nameFromQuery = params.get('name')?.trim();
        if (nameFromQuery) {
            nameFromQuery = nameFromQuery.split('?')[0].split('&')[0];
            return nameFromQuery;
        }
        const marker = '/artist-gallery/';
        const path = location.pathname || '';
        const markerIndex = path.indexOf(marker);
        if (markerIndex !== -1) {
            const rawSlug = path
                .slice(markerIndex + marker.length)
                .split('/')[0]
                .trim();
            if (rawSlug) {
                return decodeURIComponent(rawSlug).replace(/[-_]+/g, ' ').trim();
            }
        }
        if (!routeArtistSlug) return '';
        return decodeURIComponent(routeArtistSlug).replace(/[-_]+/g, ' ').trim();
    }, [location.pathname, location.search, routeArtistSlug]);

    const isDrawingGalleryMode = useMemo(() => {
        const params = new URLSearchParams(location.search);
        return drawingSkin || params.get('mode') === 'drawing';
    }, [drawingSkin, location.search]);

    // Must stay above HomePage interactive globe layer (z-index: 12500)
    // but BELOW the BottomPageNavigator (z-index: 250000) so the tab bar stays visible.
    const GALLERY_Z_BASE = 240000;
    const GALLERY_Z_BELOW_MODAL = 3400;
    // Dynamic Z-Index for ArtistGallery window management
    const [galleryZIndex, setGalleryZIndex] = useState(GALLERY_Z_BASE);
    const [galleryVisibleCount, setGalleryVisibleCount] = useState(160);
    const [galleryCategory, setGalleryCategory] = useState<string | null>(null);
    const [galleryWikiUrl, setGalleryWikiUrl] = useState('');
    const [galleryAsciiArt, setGalleryAsciiArt] = useState('');
    const [galleryMapSlide, setGalleryMapSlide] = useState(0);
    const [brueckeR2Lookup, setBrueckeR2Lookup] = useState<Record<string, string>>({});
    const slideDragStartX = useRef<number | null>(null);
    const slideDragPointerId = useRef<number | null>(null);
    const galleryContainerRef = useRef<HTMLDivElement>(null);

    const moveGallerySlideByDelta = (delta: number) => {
        if (Math.abs(delta) < 22) return;
        setGalleryMapSlide(prev => delta < 0 ? Math.min(2, prev + 1) : Math.max(0, prev - 1));
    };

    // Nav/dropdown theme — synced with the global homeTheme preference
    const [isNavDark, setIsNavDark] = useState(() => {
        try { return localStorage.getItem('homeTheme') !== 'light'; } catch { return true; }
    });
    useEffect(() => {
        const sync = () => {
            try {
                const isLight = localStorage.getItem('homeTheme') === 'light';
                setIsNavDark(!isLight);
                setGalleryTheme(isLight ? 'light' : 'dark');
            } catch { /* ignore */ }
        };
        window.addEventListener('storage', sync);
        window.addEventListener('theme-changed', sync as EventListener);
        return () => {
            window.removeEventListener('storage', sync);
            window.removeEventListener('theme-changed', sync as EventListener);
        };
    }, []);

    useEffect(() => {
        setGalleryVisibleCount(isMobile ? 80 : 160);
    }, [isMobile, artistGallery?.artist, galleryCategory]);

    useEffect(() => {
        if (isDrawingGalleryMode) {
            setGalleryTheme('light');
        }
    }, [isDrawingGalleryMode]);

    useEffect(() => {
        // When Artist Gallery opens or content updates, bring to front
        if (artistGallery) {
            setGalleryZIndex(GALLERY_Z_BASE);
        }
    }, [artistGallery]);

    // ── Category normalization for filter pills ────────────────────────────
    const normalizeArtworkCategory = useCallback((art: SearchableArtwork): string => {
        const raw = (
            (art as any).category ||
            (art as any).artworkType ||
            (art as any).medium ||
            ''
        ).toLowerCase();
        const exhId = (art.exhibitionId || '').toLowerCase();
        // Also check museum name for category clues (e.g., "Gemäldegalerie" → Painting)
        const musName = (art.museumName || '').toLowerCase();
        const combined = raw + ' ' + exhId + ' ' + musName;
        if (/paint|peinture|pittura|油画|회화|gemälde|pinacoth|pinakoth|malerei/.test(combined)) return 'Painting';
        if (/watercolor|watercolour|aquarell|gouache/.test(combined)) return 'Watercolor';
        if (/draw|sketch|dessin|素描|zeichnung/.test(combined)) return 'Drawing';
        if (/print|etching|lithograph|engraving|woodcut|druckgraphik/.test(combined)) return 'Print';
        if (/photo/.test(combined)) return 'Photography';
        if (/sculpt|bronze|marble|terracotta|relief|plastik/.test(combined)) return 'Sculpture';
        if (/film|video/.test(combined)) return 'Film & Video';
        if (/textile|fashion|costume|fabric/.test(combined)) return 'Textile';
        if (/ceramic|porcelain|glass|decor|applied|craft|furniture/.test(combined)) return 'Decorative Arts';
        if (/poster/.test(combined)) return 'Poster';
        if (/manuscript|letter|document/.test(combined)) return 'Works on Paper';
        // Fallback: use museum name as the grouping key so pills always appear
        return art.museumName || 'Other';
    }, []);

    // Available categories for this artist (keyword-based or museum-based fallback)
    const galleryCategories = useMemo(() => {
        if (!artistGallery?.artworks?.length) return [];
        const counts = new Map<string, number>();
        for (const art of artistGallery.artworks) {
            const cat = normalizeArtworkCategory(art);
            counts.set(cat, (counts.get(cat) || 0) + 1);
        }
        return Array.from(counts.entries())
            .sort((a, b) => b[1] - a[1])
            .filter(([cat, cnt]) => cnt >= 2 && cat !== 'Other')
            .slice(0, 7)  // max 7 pills
            .map(([cat, cnt]) => ({ cat, cnt }));
    }, [artistGallery, normalizeArtworkCategory]);

    // Reset category filter and map slide when artist changes
    useEffect(() => {
        setGalleryCategory(null);
        setGalleryMapSlide(0);
    }, [artistGallery?.artist]);

    const artworkSortPriority = (art: any): number => {
        const name = String(art.name || '').toLowerCase();
        const id = String(art.id || '');
        const exhibitionId = String(art.exhibitionId || '').toLowerCase();
        const category = String((art as any).category || '').toLowerCase();
        // Letters/text: lowest priority (pushed to end)
        const isLetter = /\bletter[s]?\b|\blettre[s]?\b|\bbrief[e]?\b|\bcorrespondence\b|\bmanuscript\b/.test(name)
            || /^b[a-z]?\d+[a-z]*v\d{4}/i.test(id)
            || /^ba?\d+$/.test(id.toLowerCase())
            || category === 'letter' || category === 'letters';
        if (isLetter) return 2;
        // Paintings: highest priority (pushed to front)
        const isPainting = category === 'painting' || category === 'paintings'
            || exhibitionId.includes('painting')
            || /\bpainting\b|\bpeinture\b|\bgemälde\b|\bschilderij\b/.test(category);
        if (isPainting) return 0;
        return 1;
    };

    const filteredGalleryArtworks = useMemo(() => {
        if (!artistGallery?.artworks?.length) return [] as SearchableArtwork[];
        const list = galleryCategory
            ? artistGallery.artworks.filter(art => normalizeArtworkCategory(art) === galleryCategory)
            : artistGallery.artworks;
        // Paintings first, letters/text last
        return [...list].sort((a, b) => artworkSortPriority(a) - artworkSortPriority(b));
    }, [artistGallery, galleryCategory, normalizeArtworkCategory]);

    const visibleGalleryArtworks = useMemo(() => {
        return filteredGalleryArtworks.slice(0, galleryVisibleCount);
    }, [filteredGalleryArtworks, galleryVisibleCount]);

    const artistGalleryColumns = useMemo(() => {
        if (!artistGallery || !artistGallery.artworks?.length) return [];
        if (!visibleGalleryArtworks.length) return [];
        const desiredCount = isMobile ? 3 : 4;
        const safeCount = Math.min(desiredCount, Math.max(1, visibleGalleryArtworks.length));
        const columns = Array.from({ length: safeCount }, () => [] as SearchableArtwork[]);
        visibleGalleryArtworks.forEach((art, index) => {
            columns[index % safeCount].push(art);
        });
        return columns;
    }, [artistGallery, isMobile, visibleGalleryArtworks]);

    const artistFallbackDescription = useMemo(() => {
        if (!artistGallery?.artworks?.length) return '';
        const highlights = artistGallery.artworks
            .slice(0, 3)
            .map(describeArtworkHighlight)
            .filter(Boolean)
            .join(' · ');
        const countLabel = artistGallery.artworks.length.toLocaleString();
        let base = `${artistGallery.artist}의 작품 ${countLabel}점이 아르민 라이브러리에 등록되어 있습니다.`;
        if (highlights) {
            base += ` 대표 작품: ${highlights}.`;
        }
        return base;
    }, [artistGallery]);

    const museumCountryMap = useMemo(() => {
        const map = new Map<string, string>();
        (museums || []).forEach((museum) => {
            if (museum?.name) {
                map.set(museum.name, museum.country || '');
            }
        });
        return map;
    }, [museums]);

    const galleryFoundArtist = useMemo(() => {
        if (!artistGallery?.artist) return null;
        const name = artistGallery.artist.toLowerCase();
        return artists.find(a => a.name.toLowerCase() === name) || null;
    }, [artistGallery?.artist]);


    useEffect(() => {
        if (isModalOpen) {
            setGalleryZIndex(GALLERY_Z_BELOW_MODAL);
        } else if (!artistGallery) {
            setGalleryZIndex(GALLERY_Z_BASE);
        }
    }, [isModalOpen, artistGallery]);

    const overlayActive = !!artistGallery || !!isModalOpen;
    const overlayStateRef = useRef(false);

    useEffect(() => {
        if (overlayActive && !overlayStateRef.current) {
            // Collapse once when a modal/gallery first opens, but allow manual reopen
            setIsExpanded(false);
        }
        overlayStateRef.current = overlayActive;
    }, [overlayActive]);

    // Wiki URL for artist gallery hero
    useEffect(() => {
        if (!artistGallery?.artist) { setGalleryWikiUrl(''); return; }
        const controller = new AbortController();
        const encoded = encodeURIComponent(artistGallery.artist);
        fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encoded}`, { signal: controller.signal })
            .then(r => r.json())
            .then(data => { if (!controller.signal.aborted) setGalleryWikiUrl(data.content_urls?.desktop?.page || ''); })
            .catch(() => {});
        return () => controller.abort();
    }, [artistGallery?.artist]);

    // ASCII art for artist gallery bio
    useEffect(() => {
        if (!artistGallery?.artist) {
            setGalleryAsciiArt('');
            return;
        }
        // Avoid cross-origin fetch noise and stalls from artii.herokuapp.com CORS errors.
        setGalleryAsciiArt(buildFallbackAscii(artistGallery.artist));
    }, [artistGallery?.artist]);

    const loadMoreGalleryArtworks = useCallback(() => {
        setGalleryVisibleCount((prev) => {
            if (prev >= filteredGalleryArtworks.length) return prev;
            return Math.min(filteredGalleryArtworks.length, prev + (isMobile ? 60 : 120));
        });
    }, [filteredGalleryArtworks.length, isMobile]);

    const handleGalleryScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
        const el = e.currentTarget;
        if (el.scrollHeight - (el.scrollTop + el.clientHeight) < 500) {
            loadMoreGalleryArtworks();
        }
    }, [loadMoreGalleryArtworks]);

    useEffect(() => {
        const shouldLoadLookup = !!artistGallery?.artworks?.some((art) => {
            const museum = String(art.museumName || '').toLowerCase();
            const image = String(art.image || '').toLowerCase();
            return museum.includes('brücke') || museum.includes('brucke') || image.includes('deutsche-digitale-bibliothek.de');
        });
        if (!shouldLoadLookup) return;

        let cancelled = false;
        fetch('/data/bruecke-museum-collection.json', { cache: 'no-store' })
            .then((r) => (r.ok ? r.json() : null))
            .then((data) => {
                if (cancelled || !data) return;
                const items = Array.isArray(data) ? data : (data.items || data.objects || data.data || data.artworks || []);
                const next: Record<string, string> = {};
                for (const item of items) {
                    const image = String(item?.imageUrl || item?.image || '').trim();
                    if (!image || !/\.r2\.dev\//i.test(image)) continue;
                    const keys = buildBrueckeLookupKeyCandidates({
                        name: item?.title,
                        artist: item?.artist,
                        date: item?.date,
                        year: item?.year,
                    });
                    for (const k of keys) {
                        if (!next[k]) next[k] = image;
                    }
                }
                setBrueckeR2Lookup(next);
            })
            .catch(() => { /* ignore */ });

        return () => { cancelled = true; };
    }, [artistGallery?.artist, artistGallery?.artworks]);

    const resolveGalleryImageUrl = useCallback((art: SearchableArtwork) => {
        const normalized = normalizeKnownBrokenImageUrl(art.image);
        const museum = String(art.museumName || '').toLowerCase();
        const looksBruecke = museum.includes('brücke') || museum.includes('brucke');
        const isDdb = /deutsche-digitale-bibliothek\.de/i.test(normalized);
        if (looksBruecke && (!normalized || isDdb)) {
            const keys = buildBrueckeLookupKeyCandidates(art);
            for (const k of keys) {
                if (brueckeR2Lookup[k]) return brueckeR2Lookup[k];
            }
        }
        return normalized || FALLBACK_IMG;
    }, [brueckeR2Lookup]);



    // User & Likes Logic
    const [currentUser, setCurrentUser] = useState<any>(null);
    const [likedArtists, setLikedArtists] = useState<Set<string>>(new Set());

    // liked_artworks state + optimistic toggle are owned by the shared
    // useLikedArtworkSet hook (also used by AICurationHubPage). Aliased to the
    // prior local names so existing call sites need no change.
    const { likedIds: likedArtworks, isLiked: isArtworkLiked, toggleLike } = useLikedArtworkSet();

    const artistGalleryLikeKey = artistGallery?.artist ? sanitizeArtistId(artistGallery.artist) : '';
    const artistGalleryIsLiked = artistGalleryLikeKey ? likedArtists.has(artistGalleryLikeKey) : false;

    useEffect(() => {
        let unsubArtist: (() => void) | null = null;
        const unsubscribe = onAuthStateChanged(auth, (user) => {
            setCurrentUser(user);
            if (unsubArtist) {
                unsubArtist();
                unsubArtist = null;
            }
            if (user) {
                if (shouldLimitNetwork()) {
                    getDocs(collection(db, `users/${user.uid}/liked_artists`)).then((snap) => {
                        const ids = new Set(snap.docs.map(doc => doc.id));
                        setLikedArtists(ids);
                    }).catch(() => {
                        setLikedArtists(new Set());
                    });
                    return;
                }
                // Subscribe to liked artists (liked_artworks is owned by useLikedArtworkSet)
                unsubArtist = onSnapshot(
                    collection(db, `users/${user.uid}/liked_artists`),
                    (snap) => {
                        const ids = new Set(snap.docs.map(doc => doc.id));
                        setLikedArtists(ids);
                    },
                    (error) => {
                        console.error('liked_artists snapshot listener failed:', error);
                    },
                );
            } else {
                setLikedArtists(new Set());
            }
        });
        return () => {
            if (unsubArtist) unsubArtist();
            unsubscribe();
        };
    }, []);

    // ── 취향 프로파일 업데이트 (3초 디바운스) ──────────────────────────────────
    const tasteProfileUpdateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const scheduleTasteProfileUpdate = useCallback((userId: string, likedIds: string[]) => {
        // 최소 3개 이상 하트가 있어야 의미있는 프로파일 생성
        if (likedIds.length < 3) return;

        if (tasteProfileUpdateTimer.current) {
            clearTimeout(tasteProfileUpdateTimer.current);
        }
        tasteProfileUpdateTimer.current = setTimeout(async () => {
            try {
                await fetch('https://armin-semantic-search.armin-art.workers.dev/taste-profile', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ userId, likedIds }),
                });
            } catch {
                // 취향 프로파일 업데이트 실패 시 무시 (사용자 경험에 영향 없음)
            }
        }, 3000); // 3초 디바운스
    }, []);

    // ── 추천 작품 로드 ────────────────────────────────────────────────────────
    const fetchRecommendations = useCallback(async (userId: string, likedIds: string[]) => {
        if (likedIds.length < 3) {
            setRecommendResults([]);
            return;
        }
        setIsRecommendLoading(true);
        try {
            const res = await fetch('https://armin-semantic-search.armin-art.workers.dev/recommend', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId, likedIds, limit: 30 }),
            });
            if (!res.ok) throw new Error('recommend failed');
            const data = (await res.json()) as Partial<RecommendationResponse>;
            const results: SearchableArtwork[] = (Array.isArray(data.results) ? (data.results as RecommendationSearchRow[]) : []).map(r => ({
                id: String(r.id || ''),
                name: String(r.name || r.title || r.n || 'Untitled'),
                artist: String(r.artist || r.a || 'Unknown'),
                image: String(r.image || r.i || ''),
                date: String(r.date || r.year || r.y || ''),
                museumName: String(r.museumName || r.m || ''),
                exhibitionId: '',
            }));
            setRecommendResults(results);
        } catch {
            setRecommendResults([]);
        } finally {
            setIsRecommendLoading(false);
        }
    }, []);

    const toggleLikeArtwork = async (e: React.MouseEvent, art: SearchableArtwork) => {
        e.stopPropagation();
        if (!currentUser) {
            requestLoginModal();
            return;
        }
        if (!art.id) {
            console.warn('Cannot like artwork without ID');
            return;
        }

        // The shared hook handles the optimistic flip, Firestore write and rollback.
        const newLikedIds = await toggleLike(art);
        // 취향 프로파일 업데이트 — 쓰기 성공 시에만 (실패하면 toggleLike가 null 반환).
        if (newLikedIds) {
            scheduleTasteProfileUpdate(currentUser.uid, newLikedIds);
        }
    };

    const toggleLikeArtist = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!artistGallery) return;
        if (!currentUser) {
            requestLoginModal();
            return;
        }
        const artistName = artistGallery.artist;
        if (!artistName) return;

        const artistId = sanitizeArtistId(artistName);

        try {
            const ref = doc(db, `users/${currentUser.uid}/liked_artists/${artistId}`);
            if (likedArtists.has(artistId)) {
                await deleteDoc(ref);
            } else {
                await setDoc(ref, {
                    artist: artistName,
                    count: artistGallery.artworks.length,
                    image: artistGallery.artworks[0]?.image || '',
                    likedAt: new Date()
                });
            }
        } catch (error) {
            console.error('Failed to toggle artist like:', error);
        }
    };

    useEffect(() => { queryRef.current = query; }, [query]);

    // ── Artist index ──────────────────────────────────────────────────────────
    // The warm-prefix worker bucket only contains ~224 hand-picked artists, so
    // famous painters like Monet/Manet never surfaced as suggestions. We ship a
    // small ~1.6MB index of every artist with ≥10 works (8K artists) at
    // /artists/_index.json. It loads once, lazily, and we substring-match
    // against pre-normalized search text so partial queries (e.g. "mon",
    // "manet", "gogh") return matches even when the worker has nothing.
    const artistIndexRef = useRef<Array<{ k: string; a: string; c: number; i: string; s: string }> | null>(null);
    const [artistIndexLoaded, setArtistIndexLoaded] = useState(false);
    useEffect(() => {
        // Lazy load on first interaction (input focus / query typed)
        if (artistIndexRef.current || !isExpanded) return;
        let cancelled = false;
        fetch('/artists/_index.json')
            .then(r => r.ok ? r.json() : null)
            .then((data: any[] | null) => {
                if (cancelled || !Array.isArray(data)) return;
                artistIndexRef.current = data;
                setArtistIndexLoaded(true);
            })
            .catch(() => {});
        return () => { cancelled = true; };
    }, [isExpanded]);

    // Recompute matches whenever query changes
    useEffect(() => {
        const idx = artistIndexRef.current;
        if (!idx) {
            if (artistIndexMatches.length > 0) setArtistIndexMatches([]);
            return;
        }
        const q = normalizeLookupText(deferredQuery).trim();
        // Korean (or other non-Latin) query: normalizeLookupText strips it to '',
        // so keep a Hangul-preserving copy and match against each artist's name_ko.
        // This makes "고흐" resolve to "빈센트 반 고흐" → Vincent van Gogh, same key as "gogh".
        const qKo = deferredQuery.toLowerCase().replace(/\s+/g, ' ').trim();
        const hasKo = /[가-힣]/.test(qKo);
        if (q.length < 2 && !(hasKo && qKo.length >= 2)) {
            if (artistIndexMatches.length > 0) setArtistIndexMatches([]);
            return;
        }
        // Substring match across pre-normalized 's' field. Rank: prefix > word-start > substring.
        const matches: Array<{ entry: typeof idx[number]; score: number }> = [];
        for (const entry of idx) {
            const s = entry.s;
            let score = -1;
            if (q.length >= 2 && s.includes(q)) {
                score = entry.c; // base = artwork count
                if (s.startsWith(q)) score += 100000;
                else if (s.includes(' ' + q)) score += 50000; // word-start
            } else if (hasKo && artistMap) {
                const ko = getArtistDisplayName(entry.a, 'ko', artistMap).toLowerCase();
                if (ko.includes(qKo)) {
                    score = entry.c;
                    if (ko.startsWith(qKo)) score += 100000;
                    else if (ko.includes(' ' + qKo)) score += 50000;
                }
            }
            if (score < 0) continue;
            matches.push({ entry, score });
            if (matches.length > 200) break; // cap pre-sort to bound CPU
        }
        matches.sort((a, b) => b.score - a.score);
        const top = matches.slice(0, 24).map(m => ({
            artist: m.entry.a,
            count: m.entry.c,
            image: m.entry.i,
        }));
        // Avoid setState if shallow-equal (keeps render thrash low)
        const same = top.length === artistIndexMatches.length
            && top.every((t, i) => t.artist === artistIndexMatches[i].artist);
        if (!same) setArtistIndexMatches(top);
    }, [deferredQuery, artistIndexLoaded, artistMap]); // eslint-disable-line react-hooks/exhaustive-deps

    // Save query to sessionStorage whenever it changes
    useEffect(() => {
        try {
            if (query) {
                sessionStorage.setItem('globalSearchQuery', query);
            } else {
                sessionStorage.removeItem('globalSearchQuery');
            }
        } catch (e) {
            console.error('Failed to save query to sessionStorage', e);
        }
    }, [query]);

    // Height animation logic
    const contentRef = useRef<HTMLDivElement>(null);
    const [containerHeight, setContainerHeight] = useState(50); // Default collapsed height

    useEffect(() => {
        if (!contentRef.current) return;

        // Measure function
        const updateHeight = () => {
            if (!isExpanded) {
                setContainerHeight(50);
                return;
            }
            if (contentRef.current) {
                const contentH = contentRef.current.scrollHeight;
                // Clamp max height
                // Mobile: 100vh - 80px (header + gap)
                // Desktop: 80vh
                const maxH = window.innerWidth < 768
                    ? window.innerHeight - 80
                    : window.innerHeight * 0.8;

                const target = Math.min(contentH + 60, maxH);
                setContainerHeight(target);
            }
        };

        // Run immediately
        updateHeight();

        // Also run on window resize
        window.addEventListener('resize', updateHeight);
        return () => window.removeEventListener('resize', updateHeight);
    }, [isExpanded, filteredArtworks, suggestedArtists, filteredMuseums, aiResults, query, isAIMode, isLoading]);

    // Detect mobile
    useEffect(() => {
        const checkMobile = () => setIsMobile(window.innerWidth < 768);
        checkMobile();
        window.addEventListener('resize', checkMobile);
        return () => window.removeEventListener('resize', checkMobile);
    }, [videoEmbedIdsReady]);

    const lastProgressAtRef = useRef(0);

    const ensureWorker = useCallback(() => {
        if (workerRef.current) return;

        const sharedWorker = ensureSharedSearchWorkerLoaded();
        if (!sharedWorker) return;
        workerRef.current = sharedWorker;

        const handleWorkerMessage = (e: MessageEvent) => {
            const { type, results, artists, count, artist, works } = e.data;

            // --- PRECISE COLLECTION RESOLVER ---
            // Helper to fix exhibitionId based on artwork ID patterns (for MAMCS, etc)
            const resolvePreciseCollectionId = (art: SearchableArtwork) => {
                // MAMCS Strasbourg Logic — guard: id may be numeric from some sources
                const id = String(art.id ?? '');
                if (id && (id.startsWith('mamcs-') || id.startsWith('mamcs_'))) {
                    if (id.startsWith('mamcs-paintings-')) return 'mamcs-strasbourg-paintings-collection';
                    if (id.startsWith('mamcs-drawings-')) return 'mamcs-strasbourg-drawings-collection';
                    if (id.startsWith('mamcs-photography-')) return 'mamcs-strasbourg-photography-collection';
                    if (id.startsWith('mamcs-graphic-design-')) return 'mamcs-strasbourg-graphic-design-collection';
                }
                return art.exhibitionId;
            };

            if (type === 'LOAD_PROGRESS') {
                const now = Date.now();
                // Throttle progress UI updates to avoid global jank.
                if (now - lastProgressAtRef.current > 350) {
                    lastProgressAtRef.current = now;
                    setTotalCount(count);
                    // Intentionally do NOT re-run the search on every chunk.
                    // Per-chunk re-search made the Artworks list clear and
                    // refill — and the artist work-count flip between the
                    // correct warm count and a partial count — every ~350ms
                    // for the entire index load. That constant remount also
                    // left thumbnails stuck on their blur placeholder because
                    // each image was reset before it could finish loading.
                    // Results now settle exactly once, on LOAD_COMPLETE below.
                }
            } else if (type === 'LOAD_COMPLETE') {
                setTotalCount(count);
                setIsLoading(false);
                // Run one final refresh only after full index load.
                if (queryRef.current && queryRef.current.length >= 2) {
                    workerRef.current?.postMessage({ type: 'SEARCH', query: queryRef.current });
                }
                if (pendingRouteArtistRef.current) {
                    workerRef.current?.postMessage({ type: 'GET_ARTIST_WORKS', query: pendingRouteArtistRef.current });
                }
                // Once the full artwork index is loaded, re-request exhibition sample images
                // so that exhibitions found before data load now get images.
                if (pendingExhibitionIdsRef.current.length > 0) {
                    workerRef.current?.postMessage({
                        type: 'GET_EXHIBITION_SAMPLE',
                        exhibitionIds: pendingExhibitionIdsRef.current,
                    });
                }
            } else if (type === 'RESULTS') {
                const incomingQuery = normalizeLookupText(String(e.data?.query || ''));
                const activeQuery = normalizeLookupText(queryRef.current || '');
                if (incomingQuery && incomingQuery !== activeQuery) return;
                // A 'full' message is the definitive result — end the loading state.
                if (String(e.data?.source || '') === 'full') setSearchPending(false);

                const preciseResults = (results || [])
                    .map((art: SearchableArtwork) => ({
                        ...art,
                        exhibitionId: resolvePreciseCollectionId(art)
                    }))
                    .filter((art: SearchableArtwork) => {
                        const museumName = (art.museumName || '').toLowerCase();
                        const exhibitionId = (art.exhibitionId || '').toLowerCase();
                        if (museumName.includes('serpentine gallery') || museumName.includes('british museum')) return false;
                        if (exhibitionId.includes('serpentine') || exhibitionId.includes('british-museum') || exhibitionId.includes('the-british-museum') || exhibitionId.includes('bm-collection')) return false;
                        return true;
                    });
                // The worker emits two messages per search: an instant 'warm'
                // result from a small pre-baked prefix bucket, then the 'full'
                // index scan. The warm bucket holds no artworks for many
                // popular artists (e.g. Picasso), so an empty warm `results`
                // must NOT wipe a list the full scan already filled — that was
                // blanking the Artworks section and remounting every thumbnail.
                const isWarmResult = String(e.data?.source || '') === 'warm';
                if (looksNonEnglish(String(e.data?.query || ''))) {
                    // Non-Latin query (Korean/CJK/…): the local index is an
                    // English corpus, so the worker only incidentally matches
                    // works whose title was already localized (e.g. the single
                    // Korean-titled Monet work for "모네"). The server
                    // augmentation below resolves the query to the English
                    // canonical and returns the artist's full body of work.
                    // MERGE rather than replace so the worker's tiny incidental
                    // result can't clobber the server's complete set — and
                    // vice-versa — whichever arrives last.
                    if (preciseResults.length > 0) {
                        setFilteredArtworks((prev) => {
                            const seen = new Set<string>();
                            const out: SearchableArtwork[] = [];
                            for (const item of [...prev, ...preciseResults]) {
                                const id = String(item.id || '');
                                if (!id || seen.has(id)) continue;
                                seen.add(id);
                                out.push(item);
                            }
                            return out.slice(0, 50);
                        });
                    }
                } else if (!(isWarmResult && preciseResults.length === 0)) {
                    // Replace, don't merge: for artist-name queries the worker
                    // returns a fresh random sample each search, so preserving
                    // the previous order would re-pin the same works and
                    // defeat the per-search variety.
                    setFilteredArtworks(preciseResults.slice(0, 30));
                }
                setSuggestedArtists(
                    (artists || [])
                        .filter((a: any) => a.count >= 5)
                        .map((a: any) => ({
                            artist: String(a?.artist || ''),
                            count: Number(a?.count || 0),
                            image: normalizeKnownBrokenImageUrl(a?.image || ''),
                        }))
                        .filter((a: { artist: string; count: number }) => !!a.artist),
                );
            } else if (type === 'ARTIST_WORKS') {
                if (artist) {
                    const preciseWorks = (works || [])
                        .map((art: SearchableArtwork) => ({
                            ...art,
                            exhibitionId: resolvePreciseCollectionId(art)
                        }))
                        .filter((art: SearchableArtwork) => {
                            const museumName = (art.museumName || '').toLowerCase();
                            const exhibitionId = (art.exhibitionId || '').toLowerCase();
                            if (museumName.includes('serpentine gallery') || museumName.includes('british museum')) return false;
                            if (exhibitionId.includes('serpentine') || exhibitionId.includes('british-museum') || exhibitionId.includes('the-british-museum') || exhibitionId.includes('bm-collection')) return false;
                            return true;
                        });
                    const gallery = { artist, artworks: preciseWorks, isLoading: false };
                    setArtistGallery((prev) => {
                        if (prev?.artist === gallery.artist && prev?.artworks?.length === gallery.artworks.length && prev?.isLoading === false) {
                            return prev;
                        }
                        return gallery;
                    });
                    // Save to sessionStorage
                    try {
                        sessionStorage.setItem('artistGallery', JSON.stringify(gallery));
                    } catch (e) {
                        console.error('Failed to save artistGallery to sessionStorage', e);
                    }
                    writeArtistGalleryCache(artist, gallery);
                }
            } else if (type === 'EXHIBITION_SAMPLE_RESULT') {
                // Worker returned one sample image per exhibitionId from in-memory allArtworks.
                const result: Record<string, string> = e.data?.result || {};
                if (Object.keys(result).length > 0) {
                    setExhibitionPreviewImageAsyncById(prev => {
                        const updates: Record<string, string> = {};
                        for (const [id, img] of Object.entries(result)) {
                            if (!prev[id] && img) updates[id] = img as string;
                        }
                        return Object.keys(updates).length > 0 ? { ...prev, ...updates } : prev;
                    });
                }
            } else if (type === 'ERROR') {
                console.error('Worker error:', e.data.error);
                setIsLoading(false);
                setSearchPending(false);
            }
        };

        workerMessageHandlerRef.current = handleWorkerMessage;
        workerRef.current.addEventListener('message', handleWorkerMessage);

        if (pendingRouteArtistRef.current) {
            workerRef.current.postMessage({ type: 'GET_ARTIST_WORKS', query: pendingRouteArtistRef.current });
        }
    }, []);

    useEffect(() => {
        if (!isNetworkConstrained) {
            ensureWorker();
        }

        return () => {
            if (workerRef.current) {
                if (workerMessageHandlerRef.current) {
                    workerRef.current.removeEventListener('message', workerMessageHandlerRef.current);
                }
                workerRef.current = null;
                workerMessageHandlerRef.current = null;
            }
        };
    }, [ensureWorker, isNetworkConstrained]);

    const loadedRouteNameRef = useRef<string | null>(null);

    useEffect(() => {
        const routeName = getRouteArtistName();
        if (!routeName) {
            pendingRouteArtistRef.current = null;
            loadedRouteNameRef.current = null;
            setArtistGallery(prev => {
                if (prev) {
                    setLightboxArtwork(null);
                    return null;
                }
                return prev;
            });
            return;
        }

        pendingRouteArtistRef.current = routeName;
        if (loadedRouteNameRef.current === routeName) return;
        loadedRouteNameRef.current = routeName;

        setIsExpanded(false);
        setLightboxArtwork(null);
        const normalizedRouteName = normalizeLookupText(routeName);
        let warmGallery: { artist: string; artworks: SearchableArtwork[]; isLoading?: boolean } | null = null;
        try {
            const cached = sessionStorage.getItem('artistGallery');
            if (cached) {
                const parsed = JSON.parse(cached);
                const cachedArtist = String(parsed?.artist || '').trim();
                const cachedWorks = Array.isArray(parsed?.artworks) ? parsed.artworks as SearchableArtwork[] : [];
                if (cachedArtist && normalizeLookupText(cachedArtist) === normalizedRouteName) {
                    warmGallery = {
                        artist: cachedArtist,
                        artworks: cachedWorks,
                        isLoading: true,
                    };
                }
            }
        } catch {
            // ignore
        }

        const nextGallery = warmGallery || { artist: routeName, artworks: [] as SearchableArtwork[], isLoading: true };
        setArtistGallery(nextGallery);
        try {
            sessionStorage.setItem('artistGallery', JSON.stringify(nextGallery));
        } catch {
            // ignore
        }
        ensureWorker();
        workerRef.current?.postMessage({ type: 'GET_ARTIST_WORKS', query: routeName });
    }, [getRouteArtistName, ensureWorker]);

    // Mobile fallback: when the worker finishes but returns 0 works (because it skips loading
    // the 170MB chunk index on iOS), fetch from the pre-built per-artist static JSON file.
    useEffect(() => {
        if (!artistGallery) return;
        if (artistGallery.isLoading !== false) return;       // still loading, wait
        if (artistGallery.artworks.length > 0) return;       // already have works
        if (!isLikelyMobileDevice()) return;                 // desktop has full index
        const capturedArtist = artistGallery.artist;
        if (!capturedArtist) return;
        const fileKey = getArtistStaticFileKey(capturedArtist);
        if (!fileKey) return;
        const safeKey = fileKey.replace(/[^\w\-]/g, '_');
        let cancelled = false;
        fetch(`/artists/${safeKey}.json`)
            .then(r => r.ok ? r.json() : null)
            .then((items: any[] | null) => {
                if (cancelled || !Array.isArray(items) || items.length === 0) return;
                const mapped: SearchableArtwork[] = items
                    .map(art => ({
                        id: String(art.id || ''),
                        name: art.n || 'Untitled',
                        artist: art.a || capturedArtist,
                        image: art.i || '',
                        date: art.d || '',
                        museumName: art.m || '',
                        exhibitionId: art.e || '',
                        sourceUrl: art.u || '',
                    }))
                    .filter(art => {
                        const mn = (art.museumName || '').toLowerCase();
                        const ei = (art.exhibitionId || '').toLowerCase();
                        if (mn.includes('serpentine gallery') || mn.includes('british museum')) return false;
                        if (ei.includes('serpentine') || ei.includes('british-museum') || ei.includes('the-british-museum') || ei.includes('bm-collection')) return false;
                        return true;
                    });
                if (mapped.length === 0) return;
                setArtistGallery(prev => {
                    if (!prev || prev.artist !== capturedArtist) return prev;
                    if ((prev.artworks?.length ?? 0) > 0) return prev; // don't overwrite if worker caught up
                    const gallery = { artist: capturedArtist, artworks: mapped, isLoading: false };
                    writeArtistGalleryCache(capturedArtist, gallery);
                    return gallery;
                });
            })
            .catch(() => {}); // silently ignore fetch errors
        return () => { cancelled = true; };
    }, [artistGallery?.artist, artistGallery?.isLoading, artistGallery?.artworks?.length]);

    useEffect(() => {
        fetch('/data/video-embed-ids.json')
            .then(res => res.ok ? res.json() : null)
            .then((data) => {
                if (data && Array.isArray(data.ids)) {
                    videoEmbedIdsRef.current = new Set(data.ids);
                }
                setVideoEmbedIdsReady(true);
            })
            .catch(() => {
                setVideoEmbedIdsReady(true);
            });
    }, []);
    // AI 모델 로딩 상태

    const resolveCollectionIdForMuseum = useCallback((artworkItem: Partial<SearchableArtwork>, museum?: Museum) => {
        if (!museum) return artworkItem.exhibitionId || '';

        const normalize = (value?: string) => normalizeToken(value);
        const permanent = museum.permanentExhibitions || [];
        const artExhId = normalize(artworkItem.exhibitionId);
        const direct = permanent.find((pe: any) => normalize(pe?.id) === artExhId);
        if (direct?.id) return direct.id;

        if (artExhId) {
            const aliasMatch = permanent.find((pe: any) => getExhibitionTokens(pe).has(artExhId));
            if (aliasMatch?.id) return aliasMatch.id;
        }

        const artId = normalize(artworkItem.id);
        const artImage = normalize(artworkItem.image);
        const artSource = normalize(artworkItem.sourceUrl);

        let bestMatch: { id: string; score: number } | null = null;

        for (const pe of permanent) {
            const peId = normalize(pe?.id);
            if (!peId) continue;

            let score = 0;
            if (artId) {
                if (artId === peId) score = 1000;
                else if (artId.startsWith(`${peId}-`) || artId.startsWith(`${peId}_`)) score = 900 + peId.length;
                else if (artId.includes(`${peId}-`) || artId.includes(`${peId}_`)) score = 700 + peId.length;
                else if (artId.includes(peId)) score = 500 + peId.length;
            }

            const collectionFile = (pe as any)?.collectionFile as string | undefined;
            if (!score && collectionFile) {
                const base = normalize(String(collectionFile).replace('.json', ''));
                if (base && (artId.includes(base) || artImage.includes(base) || artSource.includes(base))) {
                    score = 600 + base.length;
                }
            }

            if (score > 0 && (!bestMatch || score > bestMatch.score)) {
                bestMatch = { id: pe.id, score };
            }
        }

        if (bestMatch?.id) return bestMatch.id;
        return artworkItem.exhibitionId || permanent?.[0]?.id || '';
    }, []);

    const findMuseumForArtwork = useCallback((artworkItem: Partial<SearchableArtwork>) => {
        const artExhibitionToken = normalizeToken(artworkItem.exhibitionId);
        if (artExhibitionToken) {
            const byCollection = museums.find((museum) =>
                (museum.permanentExhibitions || []).some((pe: any) => getExhibitionTokens(pe).has(artExhibitionToken))
            );
            if (byCollection) return byCollection;
        }

        const artMuseumToken = normalizeToken(artworkItem.museumName);
        if (artMuseumToken) {
            const byName = museums.find((museum) => {
                const nameToken = normalizeToken(museum.name);
                return nameToken && (nameToken === artMuseumToken || nameToken.includes(artMuseumToken) || artMuseumToken.includes(nameToken));
            });
            if (byName) return byName;
        }

        const artIdPrefix = normalizeToken((artworkItem.id || '').split('-')[0]) || normalizeToken((artworkItem.id || '').split('_')[0]);
        if (artIdPrefix) {
            const byId = museums.find((museum) => normalizeToken(museum.id) === artIdPrefix);
            if (byId) return byId;
        }

        return undefined;
    }, [museums]);

    const runWorkerLexicalFallback = useCallback(async (searchQuery: string): Promise<SearchableArtwork[]> => {
        const q = String(searchQuery || '').trim();
        if (q.length < 2) return [];

        ensureWorker();
        if (!workerRef.current) return [];

        return await new Promise<SearchableArtwork[]>((resolve) => {
            const normalizedTarget = normalizeLookupText(q);
            let latestRows: SearchableArtwork[] = [];
            let settled = false;

            const finish = (rows: SearchableArtwork[]) => {
                if (settled) return;
                settled = true;
                workerRef.current?.removeEventListener('message', onMsg);
                resolve(rows);
            };

            const mapRows = (payload: any): SearchableArtwork[] =>
                (payload?.results || []).map((r: any) => {
                    const museumMatch = findMuseumForArtwork({
                        id: r.id,
                        museumName: r.museumName,
                        exhibitionId: r.exhibitionId,
                        image: r.image || '',
                        sourceUrl: r.sourceUrl || '',
                    });
                    const exhibitionId = resolveCollectionIdForMuseum({
                        id: r.id,
                        exhibitionId: r.exhibitionId,
                        image: r.image || '',
                        sourceUrl: r.sourceUrl || '',
                    }, museumMatch);

                    return {
                        id: String(r.id || ''),
                        name: String(r.name || 'Untitled'),
                        artist: String(r.artist || 'Unknown'),
                        image: String(r.image || ''),
                        museumName: String(r.museumName || museumMatch?.name || ''),
                        exhibitionId: exhibitionId || '',
                        sourceUrl: String(r.sourceUrl || ''),
                    } as SearchableArtwork;
                }).filter((row: SearchableArtwork) => !!row.id);

            const onMsg = (ev: MessageEvent) => {
                if (ev.data?.type !== 'RESULTS') return;
                const incoming = normalizeLookupText(String(ev.data?.query || ''));
                if (incoming !== normalizedTarget) return;

                const rows = mapRows(ev.data);
                if (rows.length > 0) latestRows = rows;

                const pending = Boolean(ev.data?.pending);
                const source = String(ev.data?.source || '');
                if (!pending || source === 'full') {
                    finish(rows.length > 0 ? rows : latestRows);
                }
            };

            workerRef.current?.addEventListener('message', onMsg);
            workerRef.current?.postMessage({ type: 'SEARCH', query: q });

            setTimeout(() => {
                finish(latestRows);
            }, 2400);
        });
    }, [ensureWorker, findMuseumForArtwork, resolveCollectionIdForMuseum]);


    // Semantic search function - 브라우저에서 CLIP 텍스트 임베딩 생성
    const performSemanticSearch = useCallback(async (searchQuery: string) => {
        console.log('Performing semantic search with query:', searchQuery, 'videoReady:', videoEmbedIdsReady);
        if (searchQuery.length < aiSearchMinLen(searchQuery)) {
            setAiResults([]);

            setAiFilteredCount(0);
            return;
        }

        if (!videoEmbedIdsReady) {
            setAiResults([]);

            setAiFilteredCount(0);
            return;
        }

        const requestSeq = ++semanticSearchRequestSeqRef.current;
        const isStaleRequest = () => {
            if (requestSeq !== semanticSearchRequestSeqRef.current) return true;
            return normalizeLookupText(queryRef.current || '') !== normalizeLookupText(searchQuery || '');
        };

        setIsAILoading(true);
        ensureWorker();

        try {
            const normalizeForMatch = (value: string) =>
                (value || '')
                    .toLowerCase()
                    .normalize('NFD')
                    .replace(/[\u0300-\u036f]/g, '')
                    .replace(/[^a-z0-9\uac00-\ud7a3\s]/g, ' ')
                    .replace(/\s+/g, ' ')
                    .trim();

            const queryNorm = normalizeForMatch(searchQuery);
            const metadataStopTokens = new Set(['a', 'an', 'the', 'of', 'and', 'or', 'to', 'for', 'in', 'on', 'at', 'by', 'with', 'de', 'la', 'le', 'du', 'des', 'van', 'von', 'da', 'di', 'del', 'della', 'painting', 'paintings', 'artwork', 'artworks', 'work', 'works', 'piece', 'pieces']);
            const nonArtistHintTokens = new Set(['flower', 'flowers', 'painting', 'paintings', 'portrait', 'landscape', 'still', 'life', 'sunflower', 'sunflowers', 'blossom', 'blossoms', 'parasol', 'umbrella', 'woman', 'man', 'self', 'study', 'untitled']);
            const lowQualityTitleRegex = /^(painting|untitled|study|object|work|image|photo|drawing)(\b|$)/;
            const trustedArtistExceptions = new Set(['man ray']);

            const isLowQualityArtistLabel = (value: string) => {
                const artistNorm = normalizeForMatch(value);
                if (!artistNorm) return true;
                if (trustedArtistExceptions.has(artistNorm)) return false;
                if (artistNorm === 'unknown' || artistNorm === 'unknown artist' || artistNorm === 'artist unknown') return true;
                if (artistNorm.includes('portrait miniature of an unknown woman')) return true;
                if (artistNorm.includes('portrait of an unknown woman')) return true;
                if (/\bunknown woman\b/.test(artistNorm)) return true;
                if (/^(painting|paintings|woman|women|unknown|artist|anonymous|anon|unidentified|school|workshop|atelier|follower|circle|manner|style)(\b|$)/.test(artistNorm)) return true;
                if (/^man\b/.test(artistNorm) && artistNorm !== 'man ray') return true;
                return false;
            };

            const getMetadataReliability = (artistValue: string, titleValue: string) => {
                const artistNorm = normalizeForMatch(artistValue);
                const titleNorm = normalizeForMatch(titleValue);
                let reliability = 1;
                if (isLowQualityArtistLabel(artistValue)) reliability -= 0.7;
                if (!titleNorm || lowQualityTitleRegex.test(titleNorm)) reliability -= 0.25;
                if (/\bunknown\b/.test(artistNorm) || /\bunknown\b/.test(titleNorm)) reliability -= 0.2;
                return Math.max(0.1, Math.min(1, reliability));
            };
            const queryTokens = queryNorm
                .split(' ')
                .map((token) => token.trim())
                .filter((token) => token.length >= 2 && !metadataStopTokens.has(token));
            const strongArtistQueryTokens = queryTokens
                .filter((token) => token.length >= 4 && !nonArtistHintTokens.has(token));

            const hasMeaningfulArtistIntent = strongArtistQueryTokens.some((token) => knownArtistTokenSet.has(token));
            let shouldApplyMetadataFusion = hasMeaningfulArtistIntent;

            // SigLIP 서버사이드 검색: 텍스트를 Worker로 전송, 브라우저 모델 다운로드 없음
            let rawResults: any[];
            try {
                const normalizedSemanticQuery = queryNorm || searchQuery.toLowerCase();
                rawResults = await searchByText(normalizedSemanticQuery, 100, isPrecisionMode ? 'jina' : 'siglip');
            } catch (err) {
                console.warn('SigLIP search failed:', err);
                if (isStaleRequest()) return;
                const lexicalFallback = await runWorkerLexicalFallback(searchQuery);
                if (isStaleRequest()) return;
                console.warn('[AI Search] falling back to worker lexical results (SigLIP error)', {
                    query: searchQuery,
                    fallbackCount: lexicalFallback.length,
                });
                setAiFilteredCount(0);
                setAiResults(lexicalFallback.slice(0, 30));
                return;
            }

            if (isStaleRequest()) return;

            if (!Array.isArray(rawResults) || rawResults.length === 0) {
                const lexicalFallback = await runWorkerLexicalFallback(searchQuery);
                if (isStaleRequest()) return;
                console.warn('[AI Search] SigLIP empty result, using lexical fallback', {
                    query: searchQuery,
                    fallbackCount: lexicalFallback.length,
                });
                setAiFilteredCount(0);
                setAiResults(lexicalFallback.slice(0, 30));
                return;
            }

            // Vectorize 결과는 {id, score, e} 만 포함 — Worker idMap에서 full 메타데이터 조회
            const vectorizeIds = rawResults.map(r => r.id);
            const scoreMap: Record<string, number> = {};
            rawResults.forEach(r => { if (r.id) scoreMap[r.id] = r.score; });

            const enrichedResults = await new Promise<any[]>((resolve) => {
                if (!workerRef.current || vectorizeIds.length === 0) {
                    resolve(rawResults); // Worker 없으면 원본 그대로
                    return;
                }
                const onMsg = (ev: MessageEvent) => {
                    if (ev.data?.type === 'DETAILS_RESULTS') {
                        workerRef.current?.removeEventListener('message', onMsg);
                        const matched = ev.data.results as any[];
                        // Problem 3 fix: the local search index is a smaller,
                        // different set than the Vectorize corpus, so the old
                        // "keep idMap hits only" filter silently dropped real
                        // semantic matches. Keep EVERY Vectorize result; use
                        // the local entry only to enrich. Vectorize metadata is
                        // complete (id/n/a/i/m/e/u) and `raw` is spread last so
                        // its image always wins — a stale/empty local entry can
                        // never blank a result.
                        const localById = new Map<string, any>();
                        for (const m of matched) {
                            const mid = String(m?.id || '');
                            if (mid && !localById.has(mid)) localById.set(mid, m);
                        }
                        const enriched = rawResults
                            .map((raw: any) => {
                                const local = localById.get(String(raw.id));
                                const score = scoreMap[raw.id] || 0;
                                return local ? { ...local, ...raw, score } : { ...raw, score };
                            })
                            .sort((a, b) => (b.score || 0) - (a.score || 0));
                        resolve(enriched);
                    }
                };
                workerRef.current.addEventListener('message', onMsg);
                workerRef.current.postMessage({ type: 'GET_DETAILS_BY_IDS', ids: vectorizeIds });
                // 2초 타임아웃 — search index 조회 실패 시 rawResults로 폴백
                setTimeout(() => {
                    workerRef.current?.removeEventListener('message', onMsg);
                    resolve(rawResults);
                }, 2000);
            });

            if (isStaleRequest()) return;

            const data = { results: enrichedResults };

            if (data.results) {
                // Deduplicate by ID while preserving score order from Vectorize
                const seenRawIds = new Set<string>();
                const filteredRaw = data.results.filter((r: any) => {
                    const id = String(r?.id || '');
                    if (!id || seenRawIds.has(id)) return false;
                    seenRawIds.add(id);
                    return true;
                });

                const results = filteredRaw.map((r: any) => {
                    const museumMatch = findMuseumForArtwork({
                        id: r.id,
                        museumName: r.museum,
                        exhibitionId: r.e || r.exhibitionId,
                        image: r.i || r.image || r.url || '',
                        sourceUrl: r.sourceUrl || r.url || ''
                    });

                    const exhibitionId = r.e || r.exhibitionId || resolveCollectionIdForMuseum({
                        id: r.id,
                        exhibitionId: r.e || r.exhibitionId,
                        image: r.i || r.image || r.url || '',
                        sourceUrl: r.sourceUrl || r.url || ''
                    }, museumMatch);

                    const resolvedName = r.name || r.n || '';
                    const resolvedArtistRaw = r.artist || r.a || '';
                    const resolvedArtist = isLowQualityArtistLabel(resolvedArtistRaw) ? 'Unknown' : resolvedArtistRaw;
                    const resolvedImage = r.i || r.image || r.url || '';
                    const resolvedMuseum = r.museum || r.m || museumMatch?.name || '';
                    const metaReliability = getMetadataReliability(resolvedArtist, resolvedName);
                    return {
                        id: r.id,
                        name: resolvedName || 'Untitled',
                        artist: resolvedArtist || 'Unknown',
                        image: resolvedImage,
                        museumName: resolvedMuseum,
                        exhibitionId: exhibitionId || '',
                        sourceUrl: r.sourceUrl || '',
                        __semanticScore: Number(r.score || 0),
                        __metaReliability: metaReliability,
                    } as SearchableArtwork & { __semanticScore?: number; __metaReliability?: number };
                });

                const dedupedResults: SearchableArtwork[] = [];
                const seenResultIds = new Set<string>();
                for (const item of results) {
                    const id = String(item.id || '');
                    if (!id || seenResultIds.has(id)) continue;
                    seenResultIds.add(id);
                    dedupedResults.push(item);
                }

                if (!shouldApplyMetadataFusion && strongArtistQueryTokens.length > 0) {
                    const runtimeArtistTokenSet = new Set<string>();
                    for (const item of dedupedResults.slice(0, 60)) {
                        const artistRaw = item.artist || '';
                        if (isLowQualityArtistLabel(artistRaw)) continue;
                        const artistNorm = normalizeForMatch(artistRaw);
                        if (!artistNorm) continue;
                        for (const token of artistNorm.split(' ')) {
                            if (token.length < 3) continue;
                            if (metadataStopTokens.has(token)) continue;
                            runtimeArtistTokenSet.add(token);
                        }
                    }
                    shouldApplyMetadataFusion = strongArtistQueryTokens.some((token) => runtimeArtistTokenSet.has(token));
                }

                let finalResults = dedupedResults;
                if (shouldApplyMetadataFusion) {
                    const rerankedSemantic = [...dedupedResults]
                        .map((item, index) => {
                            const title = normalizeForMatch(item.name || '');
                            const artistRaw = item.artist || '';
                            const artist = isLowQualityArtistLabel(artistRaw) ? '' : normalizeForMatch(artistRaw);
                            const semanticScore = Number((item as any).__semanticScore || 0);
                            const metaReliability = Number((item as any).__metaReliability || 1);

                            let titleTokenMatches = 0;
                            let artistTokenMatches = 0;
                            for (const token of queryTokens) {
                                if (title.includes(token)) titleTokenMatches += 1;
                                if (artist.includes(token)) artistTokenMatches += 1;
                            }

                            let strongArtistMatches = 0;
                            for (const token of strongArtistQueryTokens) {
                                if (artist.includes(token)) strongArtistMatches += 1;
                            }

                            let metadataBoost = 0;
                            if (title && queryNorm && title.includes(queryNorm)) metadataBoost += 70;
                            if (artist && queryNorm && artist.includes(queryNorm)) metadataBoost += 55;
                            metadataBoost += titleTokenMatches * 11;
                            metadataBoost += artistTokenMatches * 18;
                            metadataBoost += strongArtistMatches * 72;

                            if (strongArtistQueryTokens.length > 0) {
                                if (strongArtistMatches === 0) {
                                    metadataBoost -= 96;
                                } else if (strongArtistMatches >= strongArtistQueryTokens.length) {
                                    metadataBoost += 36;
                                }
                            }

                            const totalTokenMatches = titleTokenMatches + artistTokenMatches;
                            if (queryTokens.length >= 2 && totalTokenMatches >= queryTokens.length) {
                                metadataBoost += 24;
                            } else if (queryTokens.length >= 2 && totalTokenMatches >= queryTokens.length - 1) {
                                metadataBoost += 12;
                            }

                            metadataBoost *= metaReliability;

                            const rankPrior = Math.max(0, 100 - index) * 0.02;
                            const combinedScore = (semanticScore * 95) + (metadataBoost * 0.45) + rankPrior;
                            return { item, combinedScore };
                        })
                        .sort((a, b) => b.combinedScore - a.combinedScore)
                        .map(({ item }) => item);

                    // Rescue exact/strong lexical title matches when pure vector ranking misses them.
                    // This keeps AI mode useful for explicit title queries like "woman with a parasol".
                    let lexicalRescue: SearchableArtwork[] = [];
                    if (workerRef.current && queryNorm.length >= 3) {
                        lexicalRescue = await new Promise<SearchableArtwork[]>((resolve) => {
                            const timeoutMs = 2500;
                            let latestWarmRows: SearchableArtwork[] = [];

                            const mapRows = (payload: any): SearchableArtwork[] =>
                                (payload?.results || []).map((r: any) => ({
                                    id: r.id,
                                    name: r.name || 'Untitled',
                                    artist: r.artist || 'Unknown',
                                    image: r.image || '',
                                    museumName: r.museumName || '',
                                    exhibitionId: r.exhibitionId || '',
                                    sourceUrl: r.sourceUrl || '',
                                } as SearchableArtwork));

                            const onMsg = (ev: MessageEvent) => {
                                if (ev.data?.type !== 'RESULTS' || ev.data?.query !== searchQuery) return;

                                const rows = mapRows(ev.data);
                                const source = String(ev.data?.source || '');
                                const pending = Boolean(ev.data?.pending);

                                // search.worker sends warm results first and full results later.
                                // Wait for full/non-pending payload to avoid missing strong lexical hits.
                                if (source === 'full' || pending === false) {
                                    workerRef.current?.removeEventListener('message', onMsg);
                                    resolve(rows.length > 0 ? rows : latestWarmRows);
                                    return;
                                }

                                if (rows.length > 0) {
                                    latestWarmRows = rows;
                                }
                            };

                            workerRef.current?.addEventListener('message', onMsg);
                            workerRef.current?.postMessage({ type: 'SEARCH', query: searchQuery });
                            setTimeout(() => {
                                workerRef.current?.removeEventListener('message', onMsg);
                                resolve(latestWarmRows);
                            }, timeoutMs);
                        });
                    }

                    finalResults = rerankedSemantic;
                    if (lexicalRescue.length > 0) {
                        const scoredLexical = lexicalRescue
                            .map((item) => {
                                const title = normalizeForMatch(item.name || '');
                                const artistRaw = item.artist || '';
                                const artist = isLowQualityArtistLabel(artistRaw) ? '' : normalizeForMatch(artistRaw);
                                let boost = 0;
                                if (title && queryNorm && title.includes(queryNorm)) boost += 100;
                                if (artist && queryNorm && queryNorm.includes(artist)) boost += 20;

                                let tokenMatches = 0;
                                for (const token of queryTokens) {
                                    if (title.includes(token)) tokenMatches += 1;
                                }

                                if (tokenMatches > 0) boost += tokenMatches * 12;
                                if (queryTokens.length >= 3 && tokenMatches >= Math.ceil(queryTokens.length * 0.6)) {
                                    boost += 28;
                                }

                                const hasArtistTokenHit = queryTokens.some((token) => artist.includes(token));
                                if (hasArtistTokenHit) boost += 24;

                                let strongArtistMatches = 0;
                                for (const token of strongArtistQueryTokens) {
                                    if (artist.includes(token)) strongArtistMatches += 1;
                                }
                                if (strongArtistMatches > 0) boost += strongArtistMatches * 74;
                                if (strongArtistQueryTokens.length > 0 && strongArtistMatches === 0) boost -= 90;

                                return { item, boost, tokenMatches };
                            })
                            .filter(({ boost, tokenMatches }) => boost >= 28 || tokenMatches >= 2)
                            .sort((a, b) => b.boost - a.boost)
                            .map(({ item }) => item)
                            .slice(0, 20);

                        const merged = [...scoredLexical, ...rerankedSemantic];
                        const seenMergedIds = new Set<string>();
                        finalResults = merged.filter((item) => {
                            const id = String(item.id || '');
                            if (!id || seenMergedIds.has(id)) return false;
                            seenMergedIds.add(id);
                            return true;
                        });
                    }

                    if (strongArtistQueryTokens.length > 0 && finalResults.length > 0) {
                        const subjectTokens = queryTokens.filter((token) => !strongArtistQueryTokens.includes(token));
                        finalResults = [...finalResults]
                            .map((item) => {
                                const title = normalizeForMatch(item.name || '');
                                const artistRaw = item.artist || '';
                                const artist = isLowQualityArtistLabel(artistRaw) ? '' : normalizeForMatch(artistRaw);

                                let strongArtistMatches = 0;
                                for (const token of strongArtistQueryTokens) {
                                    if (artist.includes(token)) strongArtistMatches += 1;
                                }

                                let subjectMatches = 0;
                                for (const token of subjectTokens) {
                                    if (title.includes(token)) subjectMatches += 1;
                                }

                                let priority = strongArtistMatches * 140 + subjectMatches * 28;
                                if (strongArtistMatches === 0) priority -= 1000;
                                return { item, priority };
                            })
                            .sort((a, b) => b.priority - a.priority)
                            .map(({ item }) => item);
                    }
                }

                setAiFilteredCount(0);

                // Similarity-threshold cut-off — drop the deep noise tail while
                // keeping the moderately-relevant band. Floor scales with the
                // top score: floor = max(top * (1 - DROP), MIN_FLOOR).
                // text→image SigLIP scores sit in a compressed band
                // (~0.10–0.22) from the modality gap; this trims the noise
                // tail (lexical/visual look-alikes that rank low) without
                // gutting the list.
                //
                // We do this BEFORE stripping __semanticScore from items,
                // since the threshold check needs to read it.
                const SCORE_RELATIVE_DROP = 0.30;
                const SCORE_MIN_FLOOR = 0.05;
                const topScore = Number((finalResults[0] as any)?.__semanticScore || 0);
                const relativeFloor = topScore * (1 - SCORE_RELATIVE_DROP);
                const effectiveFloor = Math.max(relativeFloor, SCORE_MIN_FLOOR);
                const thresholdedResults = topScore > 0
                    ? finalResults.filter((item: any) => Number(item.__semanticScore || 0) >= effectiveFloor)
                    : finalResults;

                // Strip internal scoring fields only after thresholding.
                const cleanedResults = thresholdedResults.map((item: any) => {
                    const { __semanticScore, __metaReliability, ...rest } = item;
                    return rest as SearchableArtwork;
                });

                if (isStaleRequest()) return;

                // AI search is purely semantic — SigLIP text→image only. No
                // keyword/metadata matching: that pulls in lexical look-alikes
                // ("apple" → "Applique", artist "Appleton") that belong in
                // plain text search, not here. Drop imageless results so no
                // card renders blank.
                const semanticResults = cleanedResults.filter(
                    (it) => !!String(it.image || '').trim()
                );
                setAiResults(semanticResults);

            } else if ((data as any).error) {
                console.error('Search error:', (data as any).error);
                if (isStaleRequest()) return;
                setAiResults([]);
            } else {
                if (isStaleRequest()) return;
                setAiResults([]);
            }
        } catch (error: any) {
            console.error('Semantic search error:', error);
            if (requestSeq !== semanticSearchRequestSeqRef.current) return;
            setAiResults([{
                id: 'error-msg',
                name: `Connection Error: ${error.message || 'Unknown'}`,
                artist: 'System Check',
                image: 'https://placehold.co/100x100?text=Error',
                museumName: 'Check Console & Network',
                exhibitionId: '',
                sourceUrl: '',
            }]);
        } finally {
            if (requestSeq === semanticSearchRequestSeqRef.current) {
                setIsAILoading(false);
                setIsClipLoading(false);
            }
        }
    }, [videoEmbedIdsReady, museums, resolveCollectionIdForMuseum, findMuseumForArtwork, knownArtistTokenSet, runWorkerLexicalFallback, ensureWorker]);

    // Debounced search - artworks + museums
    useEffect(() => {
        // A non-AI search with a real query is "pending" until the worker
        // posts a full result (see the RESULTS handler) or the safety timeout
        // fires — this drives the witty loading state.
        setSearchPending(!isAIMode && query.trim().length >= 2);
        const timer = setTimeout(() => {
            if (isAIMode) {
                performSemanticSearch(query);
            } else {
                if (query.length >= 2) {
                    ensureWorker();
                    workerRef.current?.postMessage({ type: 'SEARCH', query });

                    // Server augmentation — runs in two cases:
                    //  1. Mobile: the local worker only has the 385KB
                    //     warm-prefix (chunks disabled to avoid the 1.2GB OOM
                    //     crash), effectively empty for popular artists.
                    //  2. Non-Latin query (Korean/CJK/etc.): the local index
                    //     is an English corpus, so a Korean query like "고양이"
                    //     matches almost nothing locally. The server /search-text
                    //     translates the query before FTS5 matching, so it can
                    //     return real artworks ("Cat" works for "고양이").
                    if (isLikelyMobileDevice() || looksNonEnglish(query)) {
                        // Non-Latin results are merged (not replaced) so the
                        // worker's tiny incidental match and the server's full
                        // set survive each other (see the RESULTS handler). That
                        // accumulator must reset when the QUERY changes, or a
                        // previous query's works ("모네") stay pinned ahead of the
                        // new query's ("샤갈") and get sliced off at 50.
                        if (looksNonEnglish(query) && augmentQueryRef.current !== query) {
                            augmentQueryRef.current = query;
                            setFilteredArtworks([]);
                        }
                        void (async () => {
                            const startedQuery = query;
                            // The server translates common nouns ("고양이"→cat) but not
                            // artist transliterations ("모네"→Monet), so a Korean name
                            // query found nothing. Resolve it to the English canonical
                            // here so the artwork search behaves like typing "monet".
                            const serverQuery = resolveKoreanToEnglishArtist(startedQuery, artistMapRef.current) || startedQuery;
                            // Two-tier server augmentation:
                            //  Tier 1: D1 + FTS5 keyword search via /search-text.
                            //          Returns exact text/prefix matches (e.g.
                            //          'Gogh' → all Vincent van Gogh works).
                            //          ~150ms when seeded; returns [] with
                            //          30s backoff if 404/503 (D1 not ready).
                            //  Tier 2: SigLIP semantic /search-by-text.
                            //          Used when keyword returned nothing,
                            //          for queries that have no text match
                            //          but might have visual neighbours
                            //          (e.g. 'abstract red').
                            const keywordRows = await searchTextServer(serverQuery, 60);
                            const useKeyword = keywordRows.length > 0;
                            const rows = useKeyword
                                ? keywordRows
                                : await searchByText(serverQuery, 100, isPrecisionMode ? 'jina' : 'siglip');
                            if (!rows || rows.length === 0) return;
                            if ((queryRef.current || '').trim() !== startedQuery.trim()) return;
                            const mapped = rows.map((r: any) => ({
                                id: String(r.id || ''),
                                name: r.n || 'Untitled',
                                artist: r.a || 'Unknown',
                                image: r.i || '',
                                year: r.d || '',
                                museumName: r.m || '',
                                exhibitionId: r.e || '',
                                sourceUrl: r.u || '',
                            }) as SearchableArtwork)
                              .filter((art) => {
                                  if (!art.image) return false;
                                  const museumName = (art.museumName || '').toLowerCase();
                                  const exhibitionId = (art.exhibitionId || '').toLowerCase();
                                  if (museumName.includes('serpentine gallery') || museumName.includes('british museum')) return false;
                                  if (exhibitionId.includes('serpentine') || exhibitionId.includes('british-museum') || exhibitionId.includes('the-british-museum') || exhibitionId.includes('bm-collection')) return false;
                                  return true;
                              });
                            if (mapped.length === 0) return;
                            // For keyword (FTS5) results: those are already
                            // ordered by relevance/rank — ALL of them are
                            // valid name/title matches, no need to re-triage.
                            // For semantic results: triage by artist-name
                            // match so visual-only fillers stay below.
                            setFilteredArtworks((prev) => {
                                const merged = useKeyword
                                    ? (() => {
                                        // Keep local prev first, dedupe, then append keyword rows.
                                        const seen = new Set<string>();
                                        const out: SearchableArtwork[] = [];
                                        for (const item of prev) {
                                            const id = String(item.id || '');
                                            if (!id || seen.has(id)) continue;
                                            seen.add(id);
                                            out.push(item);
                                        }
                                        for (const item of mapped) {
                                            const id = String(item.id || '');
                                            if (!id || seen.has(id)) continue;
                                            seen.add(id);
                                            out.push(item);
                                        }
                                        return out;
                                    })()
                                    : mergeMobileServerAugment(prev, mapped, startedQuery);
                                return merged.slice(0, 50);
                            });
                        })();
                    }
                } else {
                    setFilteredArtworks([]);
                    setSuggestedArtists([]);
                }
            }

            // Also search museums locally (always)
            if (query.length >= 2 && museums.length > 0) {
                const q = query.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
                const matched = museums.filter(m => {
                    const name = m.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
                    const country = m.country?.toLowerCase() || '';
                    return name.includes(q) || country.includes(q);
                }).slice(0, 5);
                setFilteredMuseums(matched);
            } else {
                setFilteredMuseums([]);
            }
        }, isAIMode ? 450 : 200);  // 200ms (was 60) — protects iOS WebView from rapid-fire SEARCH postMessages overwhelming the worker thread mid-render. AI stays at 450ms (more expensive call).

        // Safety net: never let the loading state spin forever if the worker
        // somehow never answers.
        const pendingSafety = setTimeout(() => setSearchPending(false), 15000);
        return () => { clearTimeout(timer); clearTimeout(pendingSafety); };
        // `artistMap` is a dep so the search RE-RUNS once the (async, ~70KB)
        // artist i18n map finishes loading. Without it, a Korean artist query
        // typed before the map arrived ("고흐") resolves to null → the raw query
        // hits the keyword index and returns a handful of Hangul-title matches,
        // and never corrects itself. Re-firing on map-ready resolves it to
        // "Vincent van Gogh" and returns the full set. The debounce timer's
        // cleanup makes the extra run safe (no duplicate in-flight search).
    }, [query, museums, isAIMode, performSemanticSearch, ensureWorker, artistMap]);

    // videoEmbedIdsReady 변경시 검색 (중복 방지: query가 있고 AI모드일 때만)
    // 주의: 위 useEffect와 이중 실행 방지 위해 isAIMode && query 조건 엄격히
    useEffect(() => {
        if (!videoEmbedIdsReady || !isAIMode || query.length < 3) return;
        // debounce 없이 즉시 실행하면 위 useEffect와 중복 — 제거하고 위 useEffect에 의존
    }, [videoEmbedIdsReady, isAIMode]);  // query, performSemanticSearch 제거로 이중실행 방지



    // Click outside - collapse preview but keep query
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (lightboxArtwork) return;
            // On the dedicated /search page the results ARE the page, so clicking
            // elsewhere must leave them up. Only the floating inline dropdown (over
            // the map/nav) still collapses on outside click.
            if (isSearchPageMode) return;
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setIsExpanded(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [lightboxArtwork, isSearchPageMode]);

    // Dispatch events so GlobalNav can react + listen for collapse from GlobalNav
    useEffect(() => {
        if (inlineMode) {
            if (isExpanded) {
                window.dispatchEvent(new CustomEvent('global-search-expanded'));
            } else {
                window.dispatchEvent(new CustomEvent('global-search-collapsed'));
            }
        }
    }, [isExpanded, inlineMode]);

    useEffect(() => {
        if (!inlineMode) return;
        const onCloseSearch = () => setIsExpanded(false);
        window.addEventListener('global-nav-close-search', onCloseSearch);
        return () => window.removeEventListener('global-nav-close-search', onCloseSearch);
    }, [inlineMode]);

    useEffect(() => {
        if (!isSearchPageMode) return;
        setIsExpanded(true);
    }, [isSearchPageMode]);

    // Listen for search trigger from Navbar or other sources
    useEffect(() => {
        const onTrigger = (e: Event) => {
            const detail = (e as CustomEvent<{ query?: string }>).detail;
            const q = detail?.query || '';
            // Only set the query — the debounced search effect posts the SEARCH.
            // Posting it here too caused a duplicate search per trigger.
            setQuery(q);
            setIsExpanded(true);
            setTimeout(() => inputRef.current?.focus(), 50);
        };
        window.addEventListener('global-search-trigger', onTrigger);
        return () => window.removeEventListener('global-search-trigger', onTrigger);
    }, []);

    useEffect(() => {
        if (isExpanded && inputRef.current) inputRef.current.focus();
    }, [isExpanded]);

    const handleOpenInMuseum = useCallback((artworkInput: SearchableArtwork) => {
        // JIT Correction: Ensure we have the precise collection ID
        // This fixes cases where the loaded data still has generic Museum IDs
        const artwork = { ...artworkInput };
        if (artwork.id && (artwork.id.startsWith('mamcs-') || artwork.id.startsWith('mamcs_'))) {
            if (artwork.id.startsWith('mamcs-paintings-')) artwork.exhibitionId = 'mamcs-strasbourg-paintings-collection';
            else if (artwork.id.startsWith('mamcs-drawings-')) artwork.exhibitionId = 'mamcs-strasbourg-drawings-collection';
            else if (artwork.id.startsWith('mamcs-photography-')) artwork.exhibitionId = 'mamcs-strasbourg-photography-collection';
            else if (artwork.id.startsWith('mamcs-graphic-design-')) artwork.exhibitionId = 'mamcs-strasbourg-graphic-design-collection';
        }
        setLightboxArtwork(null);
        const searchValue = artwork.searchName || artwork.name || '';
        try {
            if (searchValue) {
                sessionStorage.setItem('pendingMuseumSearchQuery', JSON.stringify({ artworkTitle: searchValue }));
            } else {
                sessionStorage.removeItem('pendingMuseumSearchQuery');
            }
        } catch {
            // Silently ignore storage errors
        }
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('navbar:prefill-search', { detail: { query: searchValue } }));
        }

        setIsExpanded(false);

        const museumMatch = findMuseumForArtwork(artwork);

        const targetMuseum = museumMatch
            ? { id: museumMatch.id, name: museumMatch.name }
            : { id: artwork.exhibitionId || artwork.id || 'unknown', name: artwork.museumName || 'Museum' };

        const artCollectionToken = normalizeToken(artwork.exhibitionId);
        const collectionBelongsToMuseum = !!museumMatch && (museumMatch.permanentExhibitions || []).some((pe: any) => normalizeToken(pe?.id) === artCollectionToken);
        const needsResolver = !artwork.exhibitionId || !collectionBelongsToMuseum;
        const targetCollectionId = needsResolver
            ? resolveCollectionIdForMuseum(artwork, museumMatch)
            : artwork.exhibitionId;

        onNavigateToMuseum?.(targetMuseum, targetCollectionId || undefined, artwork);
    }, [findMuseumForArtwork, resolveCollectionIdForMuseum, onNavigateToMuseum]);

    const handleSelectArtwork = useCallback((artwork: SearchableArtwork) => {
        rememberSearchTerm(queryRef.current || artwork.artist || artwork.name);
        setLightboxArtwork(artwork);
    }, [rememberSearchTerm]);

    const buildQuickArtistDraft = useCallback((artist: string) => {
        const target = normalizeLookupText(artist);
        if (!target) return [] as SearchableArtwork[];
        // Match on the canonical artist key so a cleaned-up chip name
        // ("Henri Matisse") still finds works catalogued under a variant
        // ("MATISSE Henri"); fall back to plain text match if no key resolves.
        const targetKey = getArtistStaticFileKey(artist);
        const seen = new Set<string>();
        const exact = filteredArtworks.filter((art) => targetKey
            ? getArtistStaticFileKey(art.artist) === targetKey
            : normalizeLookupText(art.artist) === target);
        const source = exact.length > 0 ? exact : filteredArtworks.filter((art) => normalizeLookupText(art.artist).includes(target));
        const deduped = source.filter((art) => {
            const key = (art.id || `${art.name}-${art.artist}`).trim();
            if (!key || seen.has(key)) return false;
            seen.add(key);
            return true;
        });
        return deduped.slice(0, 360);
    }, [filteredArtworks]);

    const handleSelectArtist = useCallback((artist: string) => {
        rememberSearchTerm(queryRef.current || artist);
        const isSearchOverlayFlow = location.pathname.startsWith('/search');
        if (!isSearchOverlayFlow) {
            setIsExpanded(false);
        }
        setLightboxArtwork(null);
        const quickDraft = buildQuickArtistDraft(artist);
        let cachedWorks: SearchableArtwork[] = [];
        try {
            const cached = sessionStorage.getItem(getArtistGalleryCacheKey(artist));
            if (cached) {
                const parsed = JSON.parse(cached);
                if (Array.isArray(parsed?.artworks)) {
                    cachedWorks = parsed.artworks as SearchableArtwork[];
                }
            }
        } catch {
            // ignore
        }
        const warmGallery = { artist, artworks: cachedWorks.length > 0 ? cachedWorks : quickDraft, isLoading: true };
        setArtistGallery(warmGallery);
        try {
            if (queryRef.current) {
                sessionStorage.setItem('globalSearchQuery', queryRef.current);
            }
            sessionStorage.setItem('artistGallery', JSON.stringify(warmGallery));
        } catch {
            // ignore
        }

        pendingRouteArtistRef.current = artist;
        ensureWorker();
        workerRef.current?.postMessage({ type: 'GET_ARTIST_WORKS', query: artist });

        // On SearchPage, keep route unchanged so close returns to the same typed results/state instantly.
        if (isSearchOverlayFlow) {
            return;
        }

        const slug = toArtistSlug(artist);
        const params = new URLSearchParams();
        params.set('name', artist);
        if (drawingSkin) params.set('mode', 'drawing');
        if (location.pathname.startsWith('/search')) {
            params.set('from', 'search');
        }
        const qs = params.toString();
        const target = `/artist-gallery/${encodeURIComponent(slug)}${qs ? `?${qs}` : ''}`;
        const current = `${location.pathname}${location.search}`;
        if (current !== target) {
            navigate(target);
        }
    }, [buildQuickArtistDraft, drawingSkin, ensureWorker, location.pathname, location.search, navigate, rememberSearchTerm, toArtistSlug]);

    const handleSelectMuseum = useCallback((museum: Museum) => {
        rememberSearchTerm(queryRef.current || museum.name);
        setIsExpanded(false);
        setLightboxArtwork(null);
        setArtistGallery(null);
        try {
            sessionStorage.removeItem('artistGallery');
        } catch {
            // ignore
        }
        if (onNavigateToMuseum) {
            onNavigateToMuseum({ id: museum.id, name: museum.name }, museum.permanentExhibitions?.[0]?.id);
        } else {
            navigate(`/interactive/world/city/${encodeURIComponent(museum.id)}`);
        }
    }, [onNavigateToMuseum, rememberSearchTerm, navigate]);

    const handleSelectExhibition = useCallback((exhibitionId: string, exhibitionName: string) => {
        rememberSearchTerm(queryRef.current || exhibitionName);
        setIsExpanded(false);
        setLightboxArtwork(null);
        setArtistGallery(null);
        try {
            sessionStorage.removeItem('artistGallery');
        } catch {
            // ignore
        }
        navigate(`/interactive/world/city/${encodeURIComponent(exhibitionId)}`);
    }, [navigate, rememberSearchTerm]);

    const closeArtistGallery = useCallback(() => {
        setArtistGallery(null);
        setLightboxArtwork(null);

        pendingRouteArtistRef.current = null;
        try {
            sessionStorage.removeItem('artistGallery');
        } catch {
            // ignore
        }
        if (location.pathname.startsWith('/artist-gallery/')) {
            const params = new URLSearchParams(location.search);
            if (params.get('from') === 'search') {
                navigate('/search', { replace: true });
                return;
            }
            navigate('/', { replace: true });
        }
    }, [location.pathname, location.search, navigate]);

    const closeLightbox = useCallback(() => {
        setLightboxArtwork(null);
    }, []);

    const handleToggleAIMode = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
        e.stopPropagation();
        preloadEncoder();
        semanticSearchRequestSeqRef.current += 1;
        setIsAIMode((prev) => !prev);
        setAiResults([]);
        setIsRecommendMode(false);
        setAiPulsing(true);
        setTimeout(() => setAiPulsing(false), 600);
    }, []);

    const handleImageError = useCallback((e: React.SyntheticEvent<HTMLImageElement, Event>) => {
        const target = e.currentTarget;
        if (target.src === FALLBACK_IMG) {
            target.style.opacity = '1';
            target.style.transform = 'scale(1)';
            target.style.filter = 'blur(0)';
            return;
        }
        target.onerror = null;
        target.src = FALLBACK_IMG;
        target.style.opacity = '1';
        target.style.transform = 'scale(1)';
        target.style.filter = 'blur(0)';
    }, []);

    const resultRevealStyle = useCallback((index: number): CSSProperties => ({
        opacity: 0,
        transform: 'translateY(8px)',
        animation: 'search-result-reveal 0.32s cubic-bezier(0.22, 1, 0.36, 1) forwards',
        animationDelay: `${Math.min(index, 15) * 26}ms`,
    }), []);

    // Dropdown theme colors (derived from isNavDark)
    const drawingPalette = drawingSkin ? {
        dropBg: '#FFFFFF',
        dropShadow: '6px 8px 0 rgba(17,17,17,1)',
        dropBorder: '#111111',
        sectionBg: '#FFFFFF',
        sectionBorder: 'rgba(17,17,17,0.22)',
        labelColor: '#4B443B',
        pillText: '#1A1918',
        titleColor: '#1A1918',
        subColor: '#36312B',
        museumColor: '#4D4741',
        thumbBg: '#F2F2F2',
        divider: 'rgba(17,17,17,0.14)',
        hintColor: '#555047',
        itemHover: '#F6F6F6',
    } : null;

    const navDropBg       = drawingPalette?.dropBg ?? (isNavDark ? 'rgba(18,17,16,0.94)'     : 'rgba(255,255,255,0.92)');
    const navDropShadow   = drawingPalette?.dropShadow ?? (isNavDark ? '0 12px 40px rgba(0,0,0,0.45), inset 0 1px 1px rgba(255,255,255,0.04)'
                                      : '0 12px 40px rgba(0,0,0,0.12), inset 0 1px 1px rgba(255,255,255,0.7)');
    const navDropBorder   = drawingPalette?.dropBorder ?? (isNavDark ? 'rgba(255,255,255,0.06)'   : 'rgba(0,0,0,0.08)');
    const navSectionBg    = drawingPalette?.sectionBg ?? (isNavDark ? 'rgba(10,10,8,0.5)'        : 'rgba(245,242,237,0.75)');
    const navSectionBorder= drawingPalette?.sectionBorder ?? (isNavDark ? 'rgba(201,165,90,0.15)'    : 'rgba(180,155,100,0.2)');
    const navLabelColor   = drawingPalette?.labelColor ?? (isNavDark ? '#8a867d'                   : '#7a7268');
    const navPillText     = drawingPalette?.pillText ?? (isNavDark ? '#f0ede6'                   : '#1a1918');
    const navTitleColor   = drawingPalette?.titleColor ?? (isNavDark ? '#f0ede6'                   : '#1a1918');
    const navSubColor     = drawingPalette?.subColor ?? (isNavDark ? '#8a867d'                   : '#6b6560');
    const navMuseumColor  = drawingPalette?.museumColor ?? (isNavDark ? '#5a5650'                   : '#8a8278');
    const navThumbBg      = drawingPalette?.thumbBg ?? (isNavDark ? '#1a1918'                   : '#eae6df');
    const navDivider      = drawingPalette?.divider ?? (isNavDark ? 'rgba(201,165,90,0.12)'     : 'rgba(180,155,100,0.18)');
    const navHintColor    = drawingPalette?.hintColor ?? (isNavDark ? '#7a7570'                   : '#8a8278');
    const navItemHover    = drawingPalette?.itemHover ?? (isNavDark ? 'rgba(201,165,90,0.08)'     : 'rgba(180,155,100,0.1)');
    const drawingHumanFont = "'Courier Prime', 'Courier New', 'Lucida Console', monospace";

    return (
        <>
            {lightboxArtwork && createPortal(
                <ArtworkLightbox
                    artwork={lightboxArtwork}
                    onClose={closeLightbox}
                    isLiked={isArtworkLiked(lightboxArtwork.id)}
                    onToggleLike={(e, art) => {
                        // ArtworkLightbox intercepts the heart for guests and
                        // shows its own LoginSelectionModal above the lightbox,
                        // so we don't need to close + dispatch a global event
                        // here anymore. Stay on the artwork the user was viewing.
                        toggleLikeArtwork(e, art);
                    }}
                    onViewInMuseum={handleOpenInMuseum}
                    onPurchase={(art) => {
                        // ProductModal is at z-index 290000 — renders above lightbox (260021), no need to close
                        setProductArtwork(art as SearchableArtwork);
                    }}
                    onSaveToPlaylist={(art) => {
                        // PlaylistModal is at z-index 260200 — renders above lightbox (260021)
                        setPlaylistArtwork(art as SearchableArtwork);
                    }}
                    likedArtworksList={Array.from(likedArtworks).map(id => ({ id, artworkId: id }))}
                    onChangeArtwork={(art) => setLightboxArtwork(art as SearchableArtwork)}
                />,
                document.body
            )}




            <div
                ref={containerRef}
                onClick={() => setIsExpanded(true)}
                onWheel={(e) => e.stopPropagation()}
                onTouchMove={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
                style={{
                    display: 'flex',
                    flexDirection: 'column',
                    position: isSearchPageMode ? 'static' : (inlineMode ? (drawingSkin ? 'relative' : 'static') : 'fixed'),
                    zIndex: (!!artistGallery) && !lightboxArtwork && !isModalOpen ? 14000 : 5000,
                    transition: inlineMode
                        ? (drawingSkin ? 'width 260ms ease-out, opacity 180ms linear' : 'width 450ms ease, background 300ms ease, border-radius 350ms ease')
                        : 'height 600ms ease-in-out, bottom 600ms ease-in-out, transform 600ms ease-in-out, width 600ms ease-in-out, border-radius 600ms ease-in-out',

                    ...(isSearchPageMode ? {
                        width: forceWidth || '100%',
                        height: 'auto',
                        background: 'transparent',
                        borderRadius: 0,
                        boxShadow: 'none',
                        backdropFilter: 'none',
                        WebkitBackdropFilter: 'none',
                        border: 'none',
                        display: 'flex',
                        alignItems: 'stretch',
                        justifyContent: 'flex-start',
                        overflow: 'visible',
                    } : inlineMode ? {
                        // When collapsed: golden circle | When expanded: full-width transparent pill inside GlobalNav
                        width: forceWidth ? forceWidth : (isExpanded ? 'min(420px, 85vw)' : (drawingSkin ? '44px' : '48px')),
                        height: drawingSkin ? '44px' : '48px', // always fixed height; dropdown is separate
                        background: isExpanded ? 'transparent' : (drawingSkin ? '#111111' : '#e8fb36'),
                        borderRadius: isExpanded ? '100px' : '48px',
                        boxShadow: 'none',
                        backdropFilter: 'none',
                        WebkitBackdropFilter: 'none',
                        border: 'none',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        overflow: 'visible',
                    } : {
                        ...(isMobile ? {
                            top: 60,
                            bottom: 'auto',
                            left: '50%',
                            transform: (() => {
                                const isBottomMode = isModalOpen || !!artistGallery;
                                if (!isBottomMode || isExpanded) {
                                    return 'translateX(-50%) translateY(0)';
                                }
                                return 'translateX(-50%) translateY(calc(100dvh - 130px))';
                            })(),
                            width: isExpanded ? '94vw' : 'min(320px, 80vw)',
                            height: isExpanded ? `${containerHeight}px` : '50px',
                            borderRadius: isExpanded ? 20 : 30,
                            marginTop: 0,
                        } : {
                            top: 120,
                            bottom: 'auto',
                            left: '50%',
                            transform: isExpanded
                                ? 'translateX(-50%) translateY(0)'
                                : 'translateX(-50%) translateY(calc(100dvh - 120px - 50px - 20px))',
                            width: isExpanded ? 'min(600px, 94vw)' : 'min(320px, 80vw)',
                            borderRadius: isExpanded ? 16 : 30,
                            height: isExpanded ? `${containerHeight}px` : '50px',
                        }),
                        background: isExpanded ? 'rgba(10, 10, 8, 0.82)' : 'rgba(10, 10, 8, 0.72)',
                        backdropFilter: 'blur(30px) saturate(180%)',
                        WebkitBackdropFilter: 'blur(30px) saturate(180%)',
                        border: isExpanded ? '1px solid rgba(201,165,90,0.25)' : '1px solid rgba(201,165,90,0.2)',
                        boxShadow: isExpanded ? '0 8px 40px rgba(0,0,0,0.5)' : '0 4px 20px rgba(0,0,0,0.4)',
                        overflow: 'hidden',
                    }),
                    cursor: isSearchPageMode ? 'default' : (isExpanded ? 'default' : 'pointer'),
                }}
            >
                {/* Scrollbar Styles */}
                <style>{`
                    .interactive-dropdown-scrollbar::-webkit-scrollbar {
                        width: 6px;
                    }
                    .interactive-dropdown-scrollbar::-webkit-scrollbar-track {
                        background: transparent;
                        margin: 12px 0;
                    }
                    .interactive-dropdown-scrollbar::-webkit-scrollbar-thumb {
                        background: rgba(201,165,90,0.25);
                        border-radius: 10px;
                    }
                    .interactive-dropdown-scrollbar::-webkit-scrollbar-thumb:hover {
                        background: rgba(201,165,90,0.5);
                    }
                    .drawing-dropdown-scrollbar::-webkit-scrollbar {
                        width: 6px;
                    }
                    .drawing-dropdown-scrollbar::-webkit-scrollbar-track {
                        background: transparent;
                        margin: 12px 0;
                    }
                    .drawing-dropdown-scrollbar::-webkit-scrollbar-thumb {
                        background: #111111;
                        border-radius: 10px;
                    }
                    @keyframes ai-search-glow {
                        0% { opacity: 0; }
                        50% { opacity: 0.65; }
                        100% { opacity: 0; }
                    }
                    @keyframes ai-search-button-press {
                        0% { transform: scale(1); }
                        45% { transform: scale(1.15); }
                        100% { transform: scale(1); }
                    }
                    @keyframes ai-search-spark {
                        0% { transform: rotate(0deg) scale(1); }
                        50% { transform: rotate(8deg) scale(1.08); }
                        100% { transform: rotate(0deg) scale(1); }
                    }
                    @keyframes ai-search-border-pulse-dark {
                        0% {
                            border-color: #D4A547;
                            box-shadow: 0 0 0 0 rgba(212,165,71,0.00), 0 0 0 rgba(212,165,71,0.00);
                        }
                        50% {
                            border-color: #D8FF72;
                            box-shadow: 0 0 0 3px rgba(212,165,71,0.16), 0 0 22px rgba(212,165,71,0.24);
                        }
                        100% {
                            border-color: #D4A547;
                            box-shadow: 0 0 0 0 rgba(212,165,71,0.00), 0 0 0 rgba(212,165,71,0.00);
                        }
                    }
                    @keyframes ai-search-border-pulse-light {
                        0% {
                            border-color: #B89438;
                            box-shadow: 0 0 0 0 rgba(212,165,71,0.00), 0 0 0 rgba(153,204,0,0.00);
                        }
                        50% {
                            border-color: #B6E400;
                            box-shadow: 0 0 0 3px rgba(212,165,71,0.18), 0 0 20px rgba(120,160,0,0.22);
                        }
                        100% {
                            border-color: #B89438;
                            box-shadow: 0 0 0 0 rgba(212,165,71,0.00), 0 0 0 rgba(153,204,0,0.00);
                        }
                    }
                    @keyframes search-result-reveal {
                        0% { opacity: 0; transform: translateY(8px); }
                        100% { opacity: 1; transform: translateY(0); }
                    }
                    @keyframes armin-orbit-a {
                        from { stroke-dashoffset: 0; }
                        to { stroke-dashoffset: 1; }
                    }
                    @keyframes armin-orbit-b {
                        from { stroke-dashoffset: 0; }
                        to { stroke-dashoffset: -1; }
                    }
                `}</style>
                
                {/* Input */}
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    padding: isSearchPageMode
                        ? '0 12px'
                        : (isExpanded ? '0 12px' : (inlineMode ? '0' : '10px 16px')),
                    gap: 8,
                    width: '100%',
                    height: isSearchPageMode ? '48px' : (inlineMode ? (drawingSkin ? '44px' : '48px') : 'auto'),
                    position: (inlineMode && drawingSkin && isExpanded) ? 'relative' : 'static',
                    zIndex: (inlineMode && drawingSkin && isExpanded) ? 2 : 'auto',
                    justifyContent: (inlineMode && !isExpanded) ? 'center' : 'flex-start',
                    boxSizing: 'border-box' as const,
                    border: isSearchPageMode ? `1.5px solid ${isAIMode ? (isNavDark ? '#D4A547' : '#B89438') : (isNavDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)')}` : 'none',
                    borderRadius: isSearchPageMode ? 12 : 0,
                    background: isSearchPageMode
                        ? (isNavDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.05)')
                        : 'transparent',
                    boxShadow: isSearchPageMode && isAIMode
                        ? (isNavDark ? '0 0 0 3px rgba(212,165,71,0.10)' : '0 0 0 3px rgba(212,165,71,0.14)')
                        : 'none',
                    animation: isSearchPageMode && isAIMode
                        ? (isNavDark ? 'ai-search-border-pulse-dark 1.35s ease-in-out infinite' : 'ai-search-border-pulse-light 1.35s ease-in-out infinite')
                        : 'none',
                    transition: 'border-color 0.25s ease, box-shadow 0.25s ease',
                }}>
                    <svg width={inlineMode && drawingSkin ? 20 : 22} height={inlineMode && drawingSkin ? 20 : 22} viewBox="0 0 24 24" fill="none" stroke={isSearchPageMode ? (isNavDark ? 'rgba(255,255,255,0.36)' : 'rgba(0,0,0,0.36)') : (inlineMode && !isExpanded ? (drawingSkin ? "#FFFFFF" : "#000") : (drawingSkin ? "#000000" : "#c9a55a"))} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                    </svg>

                    {(isExpanded || !inlineMode) && (
                        <>
                            {/* AI Mode Toggle moved to left side */}
                            <button
                                onClick={handleToggleAIMode}
                                style={isSearchPageMode ? {
                                    background: isAIMode
                                        ? 'linear-gradient(135deg, #D4A547 0%, #A88735 100%)'
                                        : (isNavDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.08)'),
                                    border: 'none',
                                    borderRadius: 999,
                                    padding: '5px 10px',
                                    minWidth: 50,
                                    height: 28,
                                    fontSize: 10,
                                    fontWeight: 700,
                                    letterSpacing: '0.05em',
                                    color: isAIMode ? '#000000' : (isNavDark ? 'rgba(255,255,255,0.56)' : 'rgba(0,0,0,0.56)'),
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: 4,
                                    transition: 'background 0.2s, color 0.2s, transform 0.2s, box-shadow 0.2s',
                                    fontFamily: "'Space Grotesk', 'Pretendard', sans-serif",
                                    flexShrink: 0,
                                    position: 'relative',
                                    overflow: 'hidden',
                                    transform: 'scale(1)',
                                    animation: aiPulsing ? 'ai-search-button-press 0.4s ease-in-out 1' : 'none',
                                    boxShadow: isAIMode
                                        ? (isNavDark ? '0 0 0 1px rgba(212,165,71,0.45), 0 0 18px rgba(212,165,71,0.22)' : '0 0 0 1px rgba(138,107,31,0.45), 0 0 18px rgba(138,107,31,0.16)')
                                        : 'none',
                                    willChange: 'transform',
                                } : drawingSkin ? {
                                    background: isAIMode ? '#111111' : '#ffffff',
                                    border: '2px solid #111111',
                                    borderRadius: 999,
                                    width: 60,
                                    height: 30,
                                    fontSize: 12,
                                    fontWeight: 800,
                                    color: isAIMode ? '#ffffff' : '#111111',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: 4,
                                    transition: 'all 0.2s ease',
                                    fontFamily: "'Space Mono', 'Courier New', monospace",
                                    flexShrink: 0,
                                } : {
                                    background: isAIMode ? '#c9a55a' : 'rgba(255,255,255,0.05)',
                                    border: isAIMode ? 'none' : '1px solid rgba(255,255,255,0.15)',
                                    borderRadius: '50px',
                                    padding: '5px 12px',
                                    fontSize: 11,
                                    fontWeight: 600,
                                    color: isAIMode ? '#111111' : '#a3a3a3',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 4,
                                    transition: 'all 0.3s ease',
                                    fontFamily: "'Inter', Arial, sans-serif",
                                    flexShrink: 0,
                                }}
                                onMouseEnter={(e) => {
                                    preloadEncoder();
                                    if (isSearchPageMode) return;
                                    if (!isAIMode) {
                                        e.currentTarget.style.color = drawingSkin ? '#111111' : '#c9a55a';
                                        e.currentTarget.style.borderColor = drawingSkin ? '#111111' : 'rgba(201,165,90,0.3)';
                                        e.currentTarget.style.background = drawingSkin ? '#ffffff' : 'rgba(201,165,90,0.08)';
                                    }
                                }}
                                onMouseLeave={(e) => {
                                    if (isSearchPageMode) return;
                                    if (!isAIMode) {
                                        e.currentTarget.style.color = drawingSkin ? '#888' : '#a3a3a3';
                                        e.currentTarget.style.borderColor = drawingSkin ? '#ddd' : 'rgba(255,255,255,0.15)';
                                        e.currentTarget.style.background = drawingSkin ? 'transparent' : 'rgba(255,255,255,0.05)';
                                    }
                                }}
                                title={isAIMode ? 'Switch to text search' : 'Switch to AI semantic search'}
                            >
                                {isSearchPageMode && isAIMode && (
                                    <span
                                        style={{
                                            position: 'absolute',
                                            inset: 0,
                                            borderRadius: 999,
                                            pointerEvents: 'none',
                                            background: 'radial-gradient(ellipse at center, rgba(255,255,255,0.58) 0%, transparent 72%)',
                                            animation: 'ai-search-glow 1.2s ease-in-out infinite',
                                        }}
                                    />
                                )}
                                {isSearchPageMode ? (
                                    <>
                                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ position: 'relative', zIndex: 1, animation: isAIMode ? 'ai-search-spark 1.1s ease-in-out infinite' : 'none' }}>
                                            <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.937A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .962 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.582a.5.5 0 0 1 0 .962L15.5 14.063A2 2 0 0 0 14.063 15.5l-1.582 6.135a.5.5 0 0 1-.962 0z" />
                                            <path d="M20 3v4" />
                                            <path d="M22 5h-4" />
                                            <path d="M4 17v2" />
                                            <path d="M5 18H3" />
                                        </svg>
                                        <span style={{ position: 'relative', zIndex: 1 }}>AI</span>
                                    </>
                                ) : (
                                    drawingSkin ? 'A.I' : 'AI'
                                )}
                            </button>

                            {/* 정밀 검색 토글 (AI 모드 활성 시에만 표시).
                                기본 OFF = SigLIP (빠름, 영어 모델 + 번역)
                                ON = Jina v2 (한국어 native, 5초 정도 더 걸림) */}
                            {isAIMode && (isExpanded || !inlineMode) && (
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setIsPrecisionMode((prev) => !prev);
                                        semanticSearchRequestSeqRef.current += 1;
                                        setAiResults([]);
                                    }}
                                    title={isPrecisionMode
                                        ? '정밀 검색 ON — 한국어 native AI (약간 느림)'
                                        : '정밀 검색 OFF — 빠른 영어 기반 AI'}
                                    style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: 6,
                                        marginLeft: 6,
                                        padding: '4px 8px 4px 4px',
                                        height: 24,
                                        borderRadius: 999,
                                        border: isPrecisionMode
                                            ? '1px solid rgba(212,165,71,0.55)'
                                            : (isNavDark ? '1px solid rgba(255,255,255,0.18)' : '1px solid rgba(0,0,0,0.18)'),
                                        background: isPrecisionMode
                                            ? 'linear-gradient(135deg, rgba(212,165,71,0.18) 0%, rgba(168,135,53,0.10) 100%)'
                                            : 'transparent',
                                        cursor: 'pointer',
                                        transition: 'all 0.25s ease',
                                        flexShrink: 0,
                                        fontFamily: "'Space Grotesk', 'Pretendard', sans-serif",
                                    }}
                                >
                                    {/* 슬라이드 트랙 */}
                                    <span style={{
                                        position: 'relative',
                                        width: 22,
                                        height: 12,
                                        borderRadius: 999,
                                        background: isPrecisionMode
                                            ? 'linear-gradient(90deg, #D4A547 0%, #A88735 100%)'
                                            : (isNavDark ? 'rgba(255,255,255,0.20)' : 'rgba(0,0,0,0.20)'),
                                        transition: 'background 0.25s ease',
                                    }}>
                                        {/* 슬라이드 핸들 */}
                                        <span style={{
                                            position: 'absolute',
                                            top: 1,
                                            left: isPrecisionMode ? 11 : 1,
                                            width: 10,
                                            height: 10,
                                            borderRadius: '50%',
                                            background: '#FFFFFF',
                                            transition: 'left 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                                            boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
                                        }} />
                                    </span>
                                    <span style={{
                                        fontSize: 10,
                                        fontWeight: 700,
                                        letterSpacing: '0.04em',
                                        color: isPrecisionMode
                                            ? (isNavDark ? '#E5C880' : '#8A6B1F')
                                            : (isNavDark ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.55)'),
                                        whiteSpace: 'nowrap',
                                        transition: 'color 0.25s ease',
                                    }}>
                                        정밀
                                    </span>
                                </button>
                            )}

                            <input
                                ref={inputRef}
                                id="global-search-input"
                                name="globalSearch"
                                type="text"
                                autoComplete="off"
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        const typed = String(e.currentTarget.value || '').trim();
                                        if (typed.length >= 2) {
                                            rememberSearchTerm(typed);
                                        }
                                    }
                                }}
                                onFocus={() => {
                                    setIsExpanded(true);
                                    // Desktop tap-to-warm: spin up the SigLIP
                                    // encoder worker as soon as the user shows
                                    // intent to search. preloadEncoder() is a
                                    // no-op on mobile (which uses the worker
                                    // fallback for text encoding instead).
                                    preloadEncoder();
                                }}
                                placeholder={isLoading
                                    ? t({ ko: '불러오는 중...', en: 'Loading...' })
                                    : (isSearchPageMode && isAIMode
                                        ? t({ ko: 'AI에게 자연어로 자유롭게 물어보세요...', en: 'Ask AI in natural language...' })
                                        : (isExpanded ? t({ ko: '작품, 작가 검색...', en: 'Search artworks, artists...' }) : t({ ko: '작품 검색...', en: 'Search artworks...' })))}
                                style={{
                                    flex: 1,
                                    border: 'none',
                                    background: 'transparent',
                                    fontSize: 16,
                                    outline: 'none',
                                    color: isSearchPageMode
                                        ? (isNavDark ? 'rgba(255,255,255,0.9)' : 'rgba(0,0,0,0.9)')
                                        : (drawingSkin ? '#111111' : (inlineMode ? navTitleColor : '#f0ede6')),
                                    fontFamily: drawingSkin ? drawingHumanFont : 'inherit',
                                    letterSpacing: drawingSkin ? '0.01em' : 0,
                                    minWidth: 0,
                                    touchAction: 'manipulation',  // prevent double-tap zoom on iOS
                                }}
                                onClick={(e) => {
                                    e.stopPropagation();
                                }}
                            />

                            {query && (
                                <button
                                    onClick={(e) => { e.stopPropagation(); setQuery(''); inputRef.current?.focus(); }}
                                    style={isSearchPageMode ? {
                                        background: 'transparent',
                                        border: 'none',
                                        width: 22,
                                        height: 22,
                                        display: 'grid',
                                        placeItems: 'center',
                                        cursor: 'pointer',
                                        color: isNavDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)',
                                        flexShrink: 0,
                                        padding: 0,
                                        marginRight: 2,
                                        fontSize: 12,
                                    } : drawingSkin ? {
                                        background: 'transparent',
                                        border: 'none',
                                        width: 24,
                                        height: 24,
                                        display: 'grid',
                                        placeItems: 'center',
                                        cursor: 'pointer',
                                        flexShrink: 0,
                                        padding: 0,
                                        marginRight: 4,
                                    } : {
                                        background: 'rgba(201,165,90,0.15)',
                                        border: '1px solid rgba(201,165,90,0.25)',
                                        borderRadius: '50%',
                                        width: 20,
                                        height: 20,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        cursor: 'pointer',
                                        fontSize: 12,
                                        color: '#c9a55a',
                                        marginRight: drawingSkin ? 0 : 20, // Push X button much further left natively
                                        flexShrink: 0,
                                        transition: 'all 0.2s ease'
                                    }}
                                    onMouseEnter={(e) => {
                                        if (!drawingSkin) {
                                            e.currentTarget.style.background = 'rgba(201,165,90,0.3)';
                                            e.currentTarget.style.color = '#fff';
                                        }
                                    }}
                                    onMouseLeave={(e) => {
                                        if (!drawingSkin) {
                                            e.currentTarget.style.background = 'rgba(201,165,90,0.15)';
                                            e.currentTarget.style.color = '#c9a55a';
                                        }
                                    }}
                                >
                                    {drawingSkin ? (
                                        <span style={{ position: 'relative', width: 14, height: 14, display: 'block', pointerEvents: 'none' }}>
                                            <span style={{ position: 'absolute', top: '50%', left: '50%', width: 14, height: 2.3, background: '#111111', borderRadius: 2, transform: 'translate(-50%, -50%) rotate(45deg)', transformOrigin: 'center' }} />
                                            <span style={{ position: 'absolute', top: '50%', left: '50%', width: 14, height: 2.3, background: '#111111', borderRadius: 2, transform: 'translate(-50%, -50%) rotate(-45deg)', transformOrigin: 'center' }} />
                                        </span>
                                    ) : '✕'}
                                </button>
                            )}
                            {/* For You 버튼은 홈 지도 화면으로 이동됨 */}
                            {!isExpanded && !isMobile && !inlineMode && (
                                <span style={{ fontSize: 10, color: '#8a867d', marginLeft: 4, whiteSpace: 'nowrap', letterSpacing: '0.04em' }}>TAB</span>
                            )}
                            {isExpanded && !query && !isSearchPageMode && (
                                <button onClick={(e) => { e.stopPropagation(); setIsExpanded(false); }} style={{ background: 'transparent', border: 'none', padding: 4, cursor: 'pointer', color: '#8a867d', fontSize: 12, marginRight: drawingSkin ? 0 : 16 }}>▼</button>
                            )}
                            {/* KR|EN switch lives inside the bar on the search page (where the
                                full bar is always present); App.tsx hides its floating copy on
                                /search to avoid two switches stacking in the corner. */}
                            {isSearchPageMode && (
                                <div onClick={(e) => e.stopPropagation()} style={{ flexShrink: 0, display: 'flex', alignItems: 'center', marginLeft: 6 }}>
                                    <LanguageToggle light={!isNavDark} layoutId="language-toggle-pill-search" />
                                </div>
                            )}
                        </>
                    )}
                </div>

                {isSearchPageMode && isExpanded && (
                    <div
                        style={{
                            maxHeight: isAIMode ? 28 : 0,
                            opacity: isAIMode ? 1 : 0,
                            transform: isAIMode ? 'translateY(0)' : 'translateY(-4px)',
                            overflow: 'hidden',
                            transition: 'max-height 0.28s ease, opacity 0.22s ease, transform 0.22s ease',
                            pointerEvents: 'none',
                        }}
                    >
                        <div
                            style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            paddingTop: 8,
                            color: isNavDark ? 'rgba(255,255,255,0.36)' : 'rgba(0,0,0,0.36)',
                            }}
                        >
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={isNavDark ? '#D4A547' : '#8A6B1F'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.937A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .962 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.582a.5.5 0 0 1 0 .962L15.5 14.063A2 2 0 0 0 14.063 15.5l-1.582 6.135a.5.5 0 0 1-.962 0z" />
                            </svg>
                            <span style={{ fontSize: 11 }}>AI 검색 모드 활성화 - 자연어로 자유롭게 검색하세요</span>
                        </div>
                    </div>
                )}

                {/* Content Wrapper for smooth height measurement */}
                <div
                    ref={contentRef}
                    className={inlineMode ? (drawingSkin ? 'drawing-dropdown-scrollbar' : 'interactive-dropdown-scrollbar') : ''}
                    style={{
                        maxHeight: isSearchPageMode ? 'none' : 'calc(80vh - 60px)',
                        overflowY: isSearchPageMode ? 'visible' : 'auto',
                        overscrollBehavior: 'contain',
                        WebkitOverflowScrolling: 'touch',
                        ...(isSearchPageMode ? {
                            position: 'static' as const,
                            marginTop: 10,
                            background: 'transparent',
                            border: 'none',
                            boxShadow: 'none',
                            borderRadius: 0,
                            opacity: 1,
                            pointerEvents: 'auto' as const,
                            transform: 'none',
                            zIndex: 1,
                            minWidth: '100%',
                            width: '100%',
                        } : inlineMode ? (() => {
                            // 1. Drawing Skin (Interactive Globe Mode)
                            if (drawingSkin) {
                                return {
                                    position: 'absolute' as const,
                                    top: 'calc(100% + 16px)',
                                    left: '-6px', // Align with the left edge of the entire Pill (accounting for GlobalNav 6px padding)
                                    marginTop: 0,
                                    background: navDropBg,
                                    backdropFilter: 'none',
                                    WebkitBackdropFilter: 'none',
                                    boxShadow: '0 6px 0 rgba(17,17,17,0.95)',
                                    borderRadius: '14px',
                                    border: `2.5px solid ${navDropBorder}`,
                                    opacity: isExpanded ? 1 : 0,
                                    pointerEvents: isExpanded ? 'auto' as const : 'none' as const,
                                    transition: 'opacity 180ms linear, transform 190ms ease-out',
                                    transform: isExpanded ? 'translateY(0)' : 'translateY(-4px)',
                                    minWidth: '100%',
                                    width: 'calc(100% + 66px)', // Exactly span SearchInput (100%) + Hamburger(48) + gap(4) + margin(2) + Nav Padding Left/Right(12)
                                    maxWidth: 'calc(100vw - 64px)',
                                    zIndex: 1,
                                };
                            }
                            
                            // 2. Interactive Map (Normal Dark/Light Nav Pill Mode)
                            return {
                                position: 'absolute' as const,
                                top: '100%',
                                left: '0',
                                right: 'auto',
                                marginTop: 0,
                                background: navDropBg,
                                backdropFilter: 'blur(30px) saturate(200%)',
                                WebkitBackdropFilter: 'blur(30px) saturate(200%)',
                                boxShadow: navDropShadow,
                                borderRadius: '0 0 26px 26px',
                                borderTop: 'none',
                                opacity: isExpanded ? 1 : 0,
                                pointerEvents: isExpanded ? 'auto' as const : 'none' as const,
                                transition: 'opacity 180ms linear, transform 190ms ease-out',
                                transform: isExpanded ? 'translateY(0)' : 'translateY(-4px)',
                                zIndex: 1,
                                minWidth: '100%', // Naturally unify with the exact length of the Nav Pill container
                                width: '100%',
                            };
                        })() : {})
                    }}
                >
                    {isExpanded && isSearchPageMode && !isAIMode && !isRecommendMode && (() => {
                        const hasQuery = query.trim().length > 0;
                        const pageText = isNavDark ? 'rgba(255,255,255,0.94)' : 'rgba(0,0,0,0.90)';
                        const medText = isNavDark ? 'rgba(255,255,255,0.72)' : 'rgba(0,0,0,0.60)';
                        const lowText = isNavDark ? 'rgba(255,255,255,0.58)' : 'rgba(0,0,0,0.48)';
                        const faintText = isNavDark ? 'rgba(255,255,255,0.40)' : 'rgba(0,0,0,0.32)';
                        const divider = isNavDark ? 'rgba(255,255,255,0.11)' : 'rgba(0,0,0,0.09)';
                        const chipBg = isNavDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.06)';
                        const cardBg = isNavDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)';

                        const sectionLabel = (label: string, count: number, color?: string) => (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 7, paddingTop: 2, paddingBottom: 8, marginTop: 6 }}>
                                <div style={{ width: 3, height: 3, borderRadius: '50%', backgroundColor: color || faintText }} />
                                <span style={{ fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: faintText }}>{label}</span>
                                <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 9, color: faintText }}>{count}</span>
                            </div>
                        );

                        return (
                            <div style={{ paddingBottom: 26 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, overflowX: 'auto', paddingBottom: 10, scrollbarWidth: 'none' }}>
                                    {SEARCH_FILTER_TABS.map((tab) => {
                                        const active = searchFilter === tab.id;
                                        return (
                                            <button
                                                key={tab.id}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setSearchFilter(tab.id);
                                                }}
                                                style={{
                                                    padding: '5px 12px',
                                                    borderRadius: 999,
                                                    fontSize: 11,
                                                    fontWeight: active ? 600 : 400,
                                                    color: active ? '#000000' : medText,
                                                    backgroundColor: active ? '#D4A547' : chipBg,
                                                    border: `1px solid ${active ? '#D4A547' : divider}`,
                                                    cursor: 'pointer',
                                                    flexShrink: 0,
                                                    transition: 'all 0.15s',
                                                }}
                                            >
                                                {tab.label}
                                            </button>
                                        );
                                    })}
                                </div>

                                <div style={{ height: 1, backgroundColor: divider }} />

                                {!hasQuery && (
                                    <div style={{ padding: '14px 0 8px' }}>
                                        <div style={{ marginBottom: 20 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                    <span style={{ fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: faintText }}>최근 검색</span>
                                                </div>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        clearRecentSearches();
                                                    }}
                                                    style={{ fontSize: 10, color: faintText, background: 'none', border: 'none', cursor: 'pointer' }}
                                                >
                                                    전체 삭제
                                                </button>
                                            </div>
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                                                {recentSearches.map((kw) => (
                                                    <button
                                                        key={kw}
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setQuery(kw);
                                                            rememberSearchTerm(kw);
                                                            inputRef.current?.focus();
                                                        }}
                                                        style={{
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            gap: 5,
                                                            padding: '6px 12px',
                                                            borderRadius: 999,
                                                            fontSize: 12,
                                                            color: medText,
                                                            backgroundColor: chipBg,
                                                            border: `1px solid ${divider}`,
                                                            cursor: 'pointer',
                                                        }}
                                                    >
                                                        {kw}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                        <div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                                                <span style={{ fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: faintText }}>실시간 인기 검색</span>
                                                <span style={{
                                                    padding: '1px 6px',
                                                    borderRadius: 999,
                                                    fontSize: 7,
                                                    fontWeight: 700,
                                                    letterSpacing: '0.12em',
                                                    backgroundColor: isNavDark ? 'rgba(212,165,71,0.12)' : 'rgba(212,165,71,0.15)',
                                                    color: isNavDark ? '#D4A547' : '#8A6B1F',
                                                }}>LIVE</span>
                                            </div>
                                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                {liveTrendingTerms.map((item, idx) => (
                                                    <Fragment key={item.term}>
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setQuery(item.term);
                                                                rememberSearchTerm(item.term);
                                                                inputRef.current?.focus();
                                                            }}
                                                            style={{
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                gap: 12,
                                                                padding: '9px 0',
                                                                background: 'none',
                                                                border: 'none',
                                                                cursor: 'pointer',
                                                                textAlign: 'left',
                                                                width: '100%',
                                                            }}
                                                        >
                                                            <span style={{
                                                                fontFamily: "'Space Mono', monospace",
                                                                fontSize: 11,
                                                                color: idx < 3 ? (isNavDark ? '#D4A547' : '#8A6B1F') : faintText,
                                                                fontWeight: idx < 3 ? 700 : 400,
                                                                minWidth: 20,
                                                                textAlign: 'right',
                                                            }}>
                                                                {String(item.rank).padStart(2, '0')}
                                                            </span>
                                                            <span style={{ flex: 1, fontSize: 13, color: pageText }}>{item.term}</span>
                                                            <span style={{
                                                                fontSize: 9,
                                                                color: item.delta.startsWith('▲')
                                                                    ? (isNavDark ? '#D4A547' : '#8A6B1F')
                                                                    : item.delta.startsWith('▼')
                                                                        ? '#FF6B6B'
                                                                        : faintText,
                                                            }}>
                                                                {item.delta}
                                                            </span>
                                                        </button>
                                                        {idx < liveTrendingTerms.length - 1 && <div style={{ height: 1, backgroundColor: divider }} />}
                                                    </Fragment>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {hasQuery && (
                                    <div style={{ padding: '8px 0 4px' }}>
                                        {showArtistsInSearchMode && suggestedArtists.length > 0 && (
                                            <div style={{ marginBottom: 12 }}>
                                                {sectionLabel(t({ ko: '작가', en: 'Artists' }), suggestedArtists.length, isNavDark ? '#D4A547' : '#8A6B1F')}
                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                                                    {suggestedArtists.slice(0, artistCollapsedCount).map(({ artist, count, image }, idx) => {
                                                        const artistToken = normalizeLookupText(artist);
                                                        const previewPrimary = normalizeKnownBrokenImageUrl(image)
                                                            || artistPreviewImageByName.get(artistToken)
                                                            || artistPreviewImageAsyncByName[artistToken]
                                                            || artistPreviewFallbackByName.get(artistToken)
                                                            || '';
                                                        const previewFallback = artistPreviewFallbackByName.get(artistToken)
                                                            || artistPreviewImageAsyncByName[artistToken]
                                                            || '';
                                                        return (
                                                            <button
                                                                key={artist}
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    handleSelectArtist(artist);
                                                                }}
                                                                style={{
                                                                    display: 'flex',
                                                                    alignItems: 'center',
                                                                    gap: isMobile ? 8 : 10,
                                                                    padding: isMobile ? '7px 9px' : '8px 12px',
                                                                    borderRadius: 999,
                                                                    border: `1px solid ${divider}`,
                                                                    cursor: 'pointer',
                                                                    textAlign: 'left',
                                                                    background: isNavDark
                                                                        ? 'linear-gradient(140deg, rgba(255,255,255,0.08), rgba(255,255,255,0.03))'
                                                                        : 'linear-gradient(140deg, rgba(0,0,0,0.06), rgba(0,0,0,0.02))',
                                                                    flex: isMobile ? '1 1 calc(50% - 4px)' : '1 1 calc(50% - 4px)',
                                                                    minWidth: 0,
                                                                    animation: `search-result-reveal 0.26s ease both`,
                                                                    animationDelay: `${Math.min(220, idx * 24)}ms`,
                                                                }}
                                                            >
                                                                <div style={{
                                                                    width: isMobile ? 30 : 36,
                                                                    height: isMobile ? 30 : 36,
                                                                    borderRadius: '50%',
                                                                    overflow: 'hidden',
                                                                    flexShrink: 0,
                                                                    border: `1.5px solid ${isNavDark ? 'rgba(212,165,71,0.25)' : 'rgba(138,107,31,0.25)'}`,
                                                                    background: isNavDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
                                                                }}>
                                                                    <ArtistChipThumb
                                                                        primaryUrl={previewPrimary}
                                                                        fallbackUrl={previewFallback}
                                                                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                                                    />
                                                                </div>
                                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                                    <div style={{ fontSize: isMobile ? 10 : 11, color: pageText, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                                        {getArtistDisplayName(artist, language, artistMap)}
                                                                    </div>
                                                                    <div style={{ fontSize: isMobile ? 8 : 9, color: faintText, marginTop: 1 }}>{count.toLocaleString()}{t({ ko: '점', en: ' works' })}</div>
                                                                </div>
                                                            </button>
                                                        );
                                                    })}
                                                </div>

                                                {suggestedArtists.length > artistCollapsedCount && (
                                                    <>
                                                        <div
                                                            style={{
                                                                maxHeight: isArtistListExpanded
                                                                    ? `${Math.min(1200, suggestedArtists.length * (isMobile ? 56 : 68))}px`
                                                                    : 0,
                                                                opacity: isArtistListExpanded ? 1 : 0,
                                                                transform: isArtistListExpanded ? 'translateY(0)' : 'translateY(-8px)',
                                                                overflow: 'hidden',
                                                                transition: 'max-height 360ms ease, opacity 260ms ease, transform 260ms ease',
                                                            }}
                                                        >
                                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, paddingTop: 7 }}>
                                                                {suggestedArtists.slice(artistCollapsedCount).map(({ artist, count, image }, idx) => {
                                                                    const artistToken = normalizeLookupText(artist);
                                                                    const previewPrimary = normalizeKnownBrokenImageUrl(image)
                                                                        || artistPreviewImageByName.get(artistToken)
                                                                        || artistPreviewImageAsyncByName[artistToken]
                                                                        || artistPreviewFallbackByName.get(artistToken)
                                                                        || '';
                                                                    const previewFallback = artistPreviewFallbackByName.get(artistToken)
                                                                        || artistPreviewImageAsyncByName[artistToken]
                                                                        || '';
                                                                    return (
                                                                        <button
                                                                            key={artist}
                                                                            onClick={(e) => {
                                                                                e.stopPropagation();
                                                                                handleSelectArtist(artist);
                                                                            }}
                                                                            style={{
                                                                                display: 'flex',
                                                                                alignItems: 'center',
                                                                                gap: isMobile ? 8 : 10,
                                                                                padding: isMobile ? '7px 9px' : '8px 12px',
                                                                                borderRadius: 999,
                                                                                border: `1px solid ${divider}`,
                                                                                cursor: 'pointer',
                                                                                textAlign: 'left',
                                                                                background: isNavDark
                                                                                    ? 'linear-gradient(140deg, rgba(255,255,255,0.08), rgba(255,255,255,0.03))'
                                                                                    : 'linear-gradient(140deg, rgba(0,0,0,0.06), rgba(0,0,0,0.02))',
                                                                                flex: isMobile ? '1 1 calc(50% - 4px)' : '1 1 calc(50% - 4px)',
                                                                                minWidth: 0,
                                                                                animation: `search-result-reveal 0.26s ease both`,
                                                                                animationDelay: `${Math.min(220, idx * 20)}ms`,
                                                                            }}
                                                                        >
                                                                            <div style={{
                                                                                width: isMobile ? 30 : 36,
                                                                                height: isMobile ? 30 : 36,
                                                                                borderRadius: '50%',
                                                                                overflow: 'hidden',
                                                                                flexShrink: 0,
                                                                                border: `1.5px solid ${isNavDark ? 'rgba(212,165,71,0.25)' : 'rgba(138,107,31,0.25)'}`,
                                                                                background: isNavDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
                                                                            }}>
                                                                                <ArtistChipThumb
                                                                                    primaryUrl={previewPrimary}
                                                                                    fallbackUrl={previewFallback}
                                                                                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                                                                />
                                                                            </div>
                                                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                                                <div style={{ fontSize: isMobile ? 10 : 11, color: pageText, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                                                    {getArtistDisplayName(artist, language, artistMap)}
                                                                                </div>
                                                                                <div style={{ fontSize: isMobile ? 8 : 9, color: faintText, marginTop: 1 }}>{count.toLocaleString()}{t({ ko: '점', en: ' works' })}</div>
                                                                            </div>
                                                                        </button>
                                                                    );
                                                                })}
                                                            </div>
                                                        </div>

                                                        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 8 }}>
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    setIsArtistListExpanded((prev) => !prev);
                                                                }}
                                                                style={{
                                                                    display: 'inline-flex',
                                                                    alignItems: 'center',
                                                                    gap: 8,
                                                                    padding: '7px 14px',
                                                                    borderRadius: 999,
                                                                    border: `1px solid ${divider}`,
                                                                    background: isNavDark
                                                                        ? 'rgba(255,255,255,0.06)'
                                                                        : 'rgba(0,0,0,0.04)',
                                                                    color: pageText,
                                                                    fontSize: 11,
                                                                    letterSpacing: '0.04em',
                                                                    cursor: 'pointer',
                                                                    transition: 'transform 180ms ease, background 180ms ease',
                                                                }}
                                                            >
                                                                <span>{isArtistListExpanded ? '접기' : `더보기 +${Math.max(0, suggestedArtists.length - artistCollapsedCount)}`}</span>
                                                                <span style={{
                                                                    fontSize: 12,
                                                                    transform: isArtistListExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                                                                    transition: 'transform 200ms ease',
                                                                }}>⌄</span>
                                                            </button>
                                                        </div>
                                                    </>
                                                )}
                                            </div>
                                        )}

                                        {showMuseumsInSearchMode && filteredMuseums.length > 0 && (
                                            <div style={{ marginBottom: 12 }}>
                                                {sectionLabel(t({ ko: '미술관', en: 'Museums' }), filteredMuseums.length, '#6B9AFF')}
                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                                                    {filteredMuseums.slice(0, 6).map((museum) => {
                                                        return (
                                                            <button
                                                                key={museum.id}
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    handleSelectMuseum(museum);
                                                                }}
                                                                style={{
                                                                    display: 'flex',
                                                                    alignItems: 'center',
                                                                    gap: 9,
                                                                    padding: '7px 11px',
                                                                    borderRadius: 999,
                                                                    border: `1px solid ${divider}`,
                                                                    cursor: 'pointer',
                                                                    textAlign: 'left',
                                                                    backgroundColor: cardBg,
                                                                }}
                                                            >
                                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                                    <div style={{ fontSize: 11, color: pageText, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                                        {getMuseumDisplayName(museum, language)}
                                                                    </div>
                                                                    <div style={{ fontSize: 9, color: faintText, marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                                        {localizeCountryName(museum.country || '', language)}
                                                                    </div>
                                                                </div>
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        )}

                                        {showArtworksInSearchMode && filteredArtworks.length > 0 && (
                                            <div style={{ marginBottom: 12 }}>
                                                {sectionLabel(t({ ko: '작품', en: 'Artworks' }), filteredArtworks.length)}
                                                <div style={{ borderRadius: 10, overflow: 'hidden', border: `1px solid ${divider}` }}>
                                                    {filteredArtworks.slice(0, 50).map((art, idx) => (
                                                        <Fragment key={art.id}>
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    handleSelectArtwork(art);
                                                                }}
                                                                style={{
                                                                    width: '100%',
                                                                    display: 'flex',
                                                                    alignItems: 'center',
                                                                    gap: 12,
                                                                    padding: '10px 12px',
                                                                    background: cardBg,
                                                                    border: 'none',
                                                                    cursor: 'pointer',
                                                                    textAlign: 'left',
                                                                    ...resultRevealStyle(idx),
                                                                }}
                                                            >
                                                                <div style={{ width: 52, height: 52, borderRadius: 6, overflow: 'hidden', flexShrink: 0, background: chipBg }}>
                                                                    <ProgressiveThumb
                                                                        primaryUrl={art.image}
                                                                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                                                        loading="lazy"
                                                                    />
                                                                </div>
                                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                                    <div style={{ fontSize: 13, color: pageText, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{getArtworkTitle(art, language, titleMap)}</div>
                                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                                                                        <span style={{ fontSize: 11, color: lowText, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{getArtistDisplayName(art.artist, language, artistMap)}</span>
                                                                        {formatArtworkYear(art.date) && <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 9, color: faintText }}>{formatArtworkYear(art.date)}</span>}
                                                                    </div>
                                                                </div>
                                                                <span style={{ fontSize: 12, color: faintText }}>ⓘ</span>
                                                            </button>
                                                            {idx < Math.min(filteredArtworks.length, 50) - 1 && <div style={{ height: 1, backgroundColor: divider }} />}
                                                        </Fragment>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {showExhibitionsInSearchMode && matchedExhibitions.length > 0 && (
                                            <div style={{ marginBottom: 12 }}>
                                                {sectionLabel(t({ ko: '전시', en: 'Exhibitions' }), matchedExhibitions.length)}
                                                <div style={{ borderRadius: 10, overflow: 'hidden', border: `1px solid ${divider}` }}>
                                                    {matchedExhibitions.map((item, idx) => (
                                                        <Fragment key={item.exhibitionId}>
                                                            {(() => {
                                                                const fromSync = exhibitionPreviewImageById.get(item.exhibitionId);
                                                                const fromAsync = exhibitionPreviewImageAsyncById[item.exhibitionId];
                                                                const previewImage = fromSync || fromAsync;
                                                                const museumId = resolveMuseumId(item.museumName, item.country);
                                                                const museumBackup = museumId
                                                                    ? (
                                                                        museumPreviewImageById.get(museumId)
                                                                        || museumPreviewImageAsyncById[museumId]
                                                                        || normalizeKnownBrokenImageUrl(museums.find((m) => m.id === museumId)?.representativeImage)
                                                                    )
                                                                    : '';
                                                                const collectionFallback = exhibitionPreviewFallbackById[item.exhibitionId] || '';
                                                                const _wsrvDbg = previewImage ? getSearchThumbnail(getSafeImageUrl(previewImage)) : '';
                                                                console.log(`[IMG-DEBUG] Rendering "${item.exhibitionId}" | sync=${fromSync ? '✓' : '✗'} async=${fromAsync ? '✓' : '✗'} fb=${collectionFallback ? '✓' : '✗'} backup=${museumBackup ? '✓' : '✗'} | url=${previewImage || 'NONE'} | wsrv=${_wsrvDbg || 'NONE'}`);
                                                                return (
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    handleSelectExhibition(item.exhibitionId, item.exhibitionName);
                                                                }}
                                                                style={{
                                                                    width: '100%',
                                                                    display: 'flex',
                                                                    alignItems: 'center',
                                                                    gap: 12,
                                                                    padding: '10px 12px',
                                                                    background: cardBg,
                                                                    border: 'none',
                                                                    cursor: 'pointer',
                                                                    textAlign: 'left',
                                                                }}
                                                            >
                                                                <div style={{ width: 52, height: 38, borderRadius: 5, overflow: 'hidden', flexShrink: 0, background: chipBg }}>
                                                                        {previewImage ? (
                                                                            <ExhibitionThumb
                                                                                primaryUrl={previewImage}
                                                                                fallbackUrl={collectionFallback || undefined}
                                                                                backupUrl={museumBackup || undefined}
                                                                                exhibitionId={item.exhibitionId}
                                                                                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                                                            />
                                                                        ) : (
                                                                            <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center', color: faintText, fontSize: 10 }}>EXH</div>
                                                                        )}
                                                                </div>
                                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                                    <div style={{ fontSize: 12, color: pageText, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.exhibitionName}</div>
                                                                    <div style={{ fontSize: 10, color: lowText, marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                                        {item.museumNameDisplay || item.museumName}{item.country ? ` · ${localizeCountryName(item.country, language)}` : ''}
                                                                    </div>
                                                                </div>
                                                            </button>
                                                                );
                                                            })()}
                                                            {idx < matchedExhibitions.length - 1 && <div style={{ height: 1, backgroundColor: divider }} />}
                                                        </Fragment>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {showArtworksInSearchMode && showArtistsInSearchMode && showMuseumsInSearchMode && showExhibitionsInSearchMode &&
                                            filteredArtworks.length === 0 && suggestedArtists.length === 0 && filteredMuseums.length === 0 && matchedExhibitions.length === 0 && (
                                                searchPending && query.trim().length >= 2
                                                    ? <SearchWittyLoader dark={isNavDark} />
                                                    : <div style={{ textAlign: 'center', paddingTop: 56, color: faintText, fontSize: 13 }}>
                                                          검색 결과가 없습니다
                                                      </div>
                                            )}
                                    </div>
                                )}
                            </div>
                        );
                    })()}

                    {isExpanded && isSearchPageMode && isAIMode && !isRecommendMode && (() => {
                        const pageText = isNavDark ? 'rgba(255,255,255,0.88)' : 'rgba(0,0,0,0.88)';
                        const lowText = isNavDark ? 'rgba(255,255,255,0.36)' : 'rgba(0,0,0,0.36)';
                        const faintText = isNavDark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.18)';
                        const divider = isNavDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.07)';
                        const cardBg = isNavDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)';

                        return (
                            <div style={{ paddingBottom: 26 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 7, paddingBottom: 10 }}>
                                    <div style={{ width: 3, height: 3, borderRadius: '50%', backgroundColor: '#D4A547' }} />
                                    <span style={{ fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: faintText }}>AI Results</span>
                                    <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 9, color: faintText }}>{aiResults.length}</span>
                                </div>

                                {query.trim().length < aiSearchMinLen(query) && (
                                    <div style={{ fontSize: 12, color: lowText, padding: '10px 0 6px' }}>
                                        검색어를 {aiSearchMinLen(query)}글자 이상 입력하면 AI 시맨틱 검색이 시작됩니다
                                    </div>
                                )}

                                {(isAILoading || isClipLoading) && query.trim().length >= aiSearchMinLen(query) && (
                                    <SearchWittyLoader dark={isNavDark} />
                                )}

                                {query.length >= aiSearchMinLen(query) && !isAILoading && !isClipLoading && aiResults.length > 0 && (
                                    <div
                                        onWheel={(e) => e.stopPropagation()}
                                        onTouchMove={(e) => e.stopPropagation()}
                                        style={{ borderRadius: 10, overflow: 'hidden', border: `1px solid ${divider}` }}
                                    >
                                        {aiResults.map((art, idx) => (
                                            <Fragment key={`ai-search-${art.id}`}>
                                                <button
                                                    className="search-result-item"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleSelectArtwork(art);
                                                    }}
                                                    style={{
                                                        width: '100%',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: 12,
                                                        padding: '10px 12px',
                                                        border: 'none',
                                                        background: cardBg,
                                                        cursor: 'pointer',
                                                        textAlign: 'left',
                                                        ...resultRevealStyle(idx),
                                                    }}
                                                >
                                                    <div style={{ width: 52, height: 52, borderRadius: 6, overflow: 'hidden', flexShrink: 0, background: isNavDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)' }}>
                                                        <ProgressiveThumb
                                                            primaryUrl={art.image}
                                                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                                            loading="lazy"
                                                        />
                                                    </div>
                                                    <div style={{ flex: 1, minWidth: 0 }}>
                                                        <div style={{ fontSize: 13, color: pageText, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{getArtworkTitle(art, language, titleMap)}</div>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                                                            <span style={{ fontSize: 11, color: lowText, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{getArtistDisplayName(art.artist, language, artistMap)}</span>
                                                            <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 9, color: faintText }}>AI</span>
                                                        </div>
                                                        {art.museumName && (
                                                            <div style={{ fontSize: 10, color: faintText, marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                                {getMuseumDisplayName(museums.find(mm => mm.name === art.museumName) ?? { name: art.museumName }, language)}
                                                            </div>
                                                        )}
                                                    </div>
                                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={faintText} strokeWidth="1.8">
                                                        <circle cx="12" cy="12" r="9" />
                                                        <line x1="12" y1="10" x2="12" y2="16" />
                                                        <circle cx="12" cy="7" r="1" fill={faintText} stroke="none" />
                                                    </svg>
                                                </button>
                                                {idx < aiResults.length - 1 && <div style={{ height: 1, backgroundColor: divider }} />}
                                            </Fragment>
                                        ))}
                                    </div>
                                )}

                                {query.length >= aiSearchMinLen(query) && !isAILoading && !isClipLoading && aiResults.length === 0 && (
                                    <div style={{ textAlign: 'center', paddingTop: 44, color: faintText, fontSize: 13 }}>
                                        AI 검색 결과가 없습니다
                                    </div>
                                )}
                            </div>
                        );
                    })()}

                    {/* Artist suggestions */}
                    {isExpanded && !isSearchPageMode && suggestedArtists.length > 0 && (
                        <div style={{ padding: '8px 16px', borderTop: `1px solid ${navSectionBorder}`, background: navSectionBg }}>
                            <div style={{ fontSize: 10, color: navLabelColor, marginBottom: 8, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Artists</div>
                            <div style={{ display: 'flex', overflowX: 'auto', gap: 6, paddingBottom: 4, scrollbarWidth: 'none', msOverflowStyle: 'none', WebkitOverflowScrolling: 'touch' }}>
                                {suggestedArtists.map(({ artist, count }) => (
                                    <button
                                        key={artist}
                                        onClick={(e) => { e.stopPropagation(); handleSelectArtist(artist); }}
                                        style={{ background: 'rgba(201,165,90,0.12)', border: '1px solid rgba(201,165,90,0.3)', borderRadius: 16, padding: '5px 12px', fontSize: 12, color: navPillText, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, transition: 'all 150ms ease', whiteSpace: 'nowrap', flexShrink: 0 }}
                                        onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(201,165,90,0.25)'; e.currentTarget.style.borderColor = '#c9a55a'; }}
                                        onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(201,165,90,0.12)'; e.currentTarget.style.borderColor = 'rgba(201,165,90,0.3)'; }}
                                    >
                                        {getArtistDisplayName(artist, language, artistMap)} <span style={{ fontSize: 10, opacity: 0.5 }}>({count})</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Museum suggestions */}
                    {isExpanded && !isSearchPageMode && filteredMuseums.length > 0 && (
                        <div style={{ padding: '8px 16px', borderTop: `1px solid ${navSectionBorder}`, background: navSectionBg }}>
                            <div style={{ fontSize: 10, color: navLabelColor, marginBottom: 8, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{t({ ko: '미술관', en: 'Museums' })}</div>
                            <div style={{ display: 'flex', overflowX: 'auto', gap: 6, paddingBottom: 4, scrollbarWidth: 'none', msOverflowStyle: 'none', WebkitOverflowScrolling: 'touch' }}>
                                {filteredMuseums.map((museum) => (
                                    <button
                                        key={museum.id}
                                        onClick={(e) => { e.stopPropagation(); handleSelectMuseum(museum); }}
                                        style={{ background: 'rgba(201,165,90,0.08)', border: '1px solid rgba(201,165,90,0.25)', borderRadius: 16, padding: '5px 12px', fontSize: 12, color: '#c9a55a', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, transition: 'all 150ms ease', whiteSpace: 'nowrap', flexShrink: 0 }}
                                        onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(201,165,90,0.2)'; e.currentTarget.style.borderColor = '#c9a55a'; }}
                                        onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(201,165,90,0.08)'; e.currentTarget.style.borderColor = 'rgba(201,165,90,0.25)'; }}
                                    >
                                        🏛️ {getMuseumDisplayName(museum, language)} <span style={{ fontSize: 10, opacity: 0.6 }}>• {localizeCountryName(museum.country || '', language)}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* AI Mode Results */}
                    {isExpanded && !isSearchPageMode && isAIMode && (
                        <div style={{ padding: '8px 16px', borderTop: `1px solid ${navDivider}`, background: navSectionBg }}>
                            <div style={{ fontSize: 11, color: navLabelColor, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span>✨</span>
                                <span>
                                    {isAILoading
                                        ? (encoderStatus === 'loading' ? 'Loading AI model (~70MB, cached after first use)...' : 'Searching with SigLIP...')
                                        : `AI Semantic Search (${aiResults.length} results${aiFilteredCount > 0 ? `, filtered ${aiFilteredCount}` : ''})`}
                                </span>
                            </div>
                            {query.length >= aiSearchMinLen(query) && !isAILoading && !isClipLoading && aiResults.length === 0 && (
                                <div style={{ fontSize: 12, color: navSubColor, padding: '8px 0' }}>No AI results for "{query}". Try: "impressionist landscape", "portrait of woman", "religious painting"</div>
                            )}
                        </div>
                    )}

                    {/* AI Results Grid */}
                    {isExpanded && !isSearchPageMode && isAIMode && aiResults.length > 0 && (
                        <div
                            onWheel={(e) => e.stopPropagation()}
                            onTouchMove={(e) => e.stopPropagation()}
                            style={{
                                borderTop: `1px solid ${navDivider}`,
                            }}
                        >
                            {aiResults.map((art, idx) => (
                                <div
                                    key={`ai-${art.id}`}
                                    className="search-result-item"
                                    onClick={(e) => { e.stopPropagation(); handleSelectArtwork(art); }}
                                    style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 16px', cursor: 'pointer', borderBottom: idx < aiResults.length - 1 ? `1px solid ${navDivider}` : 'none', transition: 'background 150ms ease', ...resultRevealStyle(idx) }}
                                    onMouseEnter={(e) => e.currentTarget.style.background = navItemHover}
                                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                                >
                                    <div style={{ width: 44, height: 44, borderRadius: 6, overflow: 'hidden', flexShrink: 0, background: navThumbBg }}>
                                        <ProgressiveThumb
                                            primaryUrl={art.image}
                                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                            loading="lazy"
                                        />
                                    </div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize: 13, fontWeight: 600, color: navTitleColor, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{getArtworkTitle(art, language, titleMap)}</div>
                                        <div style={{ fontSize: 11, color: navSubColor, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{getArtistDisplayName(art.artist, language, artistMap)}</div>
                                        <div style={{ fontSize: 10, color: navMuseumColor }}>{art.museumName}</div>
                                    </div>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(201,165,90,0.4)" strokeWidth="2"><polyline points="9 18 15 12 9 6" /></svg>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Recommendation Mode Header */}
                    {isExpanded && isRecommendMode && (
                        <div style={{ padding: '8px 16px', borderTop: '1px solid #ffe4ef', background: 'linear-gradient(135deg, rgba(255,107,157,0.06) 0%, rgba(255,182,193,0.04) 100%)' }}>
                            <div style={{ fontSize: 11, color: '#c2185b', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span>♡</span>
                                <span>
                                    {isRecommendLoading
                                        ? 'Finding artworks tailored to your taste...'
                                        : `Personalized for you (${recommendResults.length} picks)`}
                                </span>
                                {!isRecommendLoading && recommendResults.length > 0 && (
                                    <button
                                        onClick={(e) => { e.stopPropagation(); if (currentUser) fetchRecommendations(currentUser.uid, Array.from(likedArtworks)); }}
                                        style={{ marginLeft: 'auto', background: 'transparent', border: '1px solid #ffb3d0', borderRadius: 100, padding: '2px 8px', fontSize: 10, color: '#c2185b', cursor: 'pointer' }}
                                    >↻ Refresh</button>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Recommendation Results Grid */}
                    {isExpanded && isRecommendMode && !isRecommendLoading && recommendResults.length > 0 && (
                        <div onWheel={(e) => e.stopPropagation()} onTouchMove={(e) => e.stopPropagation()} style={{ borderTop: '1px solid #ffe4ef' }}>
                            {recommendResults.map((art, idx) => (
                                <div
                                    key={`rec-${art.id}-${idx}`}
                                    className="search-result-item"
                                    onClick={(e) => { e.stopPropagation(); handleSelectArtwork(art); }}
                                    style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 16px', cursor: 'pointer', borderBottom: idx < recommendResults.length - 1 ? '1px solid #fff0f5' : 'none', transition: 'background 150ms ease' }}
                                    onMouseEnter={(e) => e.currentTarget.style.background = '#fff8fb'}
                                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                                >
                                    <div style={{ width: 44, height: 44, borderRadius: 6, overflow: 'hidden', flexShrink: 0, background: '#fce4ec' }}>
                                        <ProgressiveThumb
                                            primaryUrl={art.image}
                                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                            loading="lazy"
                                        />
                                    </div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize: 13, fontWeight: 600, color: '#222', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{getArtworkTitle(art, language, titleMap)}</div>
                                        <div style={{ fontSize: 11, color: '#666', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{getArtistDisplayName(art.artist, language, artistMap)}{art.date ? ` • ${art.date}` : ''}</div>
                                        <div style={{ fontSize: 10, color: '#999' }}>{art.museumName}</div>
                                    </div>
                                    <HeartOverlay
                                        isLiked={isArtworkLiked(art.id)}
                                        onToggle={(e) => toggleLikeArtwork(e, art)}
                                        size={16}
                                    />
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Recommendation loading skeleton */}
                    {isExpanded && isRecommendMode && isRecommendLoading && (
                        <div style={{ borderTop: '1px solid #ffe4ef' }}>
                            {[...Array(8)].map((_, idx) => (
                                <div key={`skel-${idx}`} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 16px', borderBottom: idx < 7 ? '1px solid #fff0f5' : 'none' }}>
                                    <div style={{ width: 44, height: 44, borderRadius: 6, background: 'linear-gradient(90deg, #fce4ec 25%, #ffeef4 50%, #fce4ec 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.5s infinite', flexShrink: 0 }} />
                                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                                        <div style={{ height: 12, width: '60%', borderRadius: 4, background: 'linear-gradient(90deg, #fce4ec 25%, #ffeef4 50%, #fce4ec 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.5s infinite' }} />
                                        <div style={{ height: 10, width: '40%', borderRadius: 4, background: 'linear-gradient(90deg, #fce4ec 25%, #ffeef4 50%, #fce4ec 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.5s infinite' }} />
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Recommendation empty state */}
                    {isExpanded && isRecommendMode && !isRecommendLoading && recommendResults.length === 0 && (
                        <div style={{ padding: '24px 16px', textAlign: 'center', borderTop: '1px solid #ffe4ef' }}>
                            <div style={{ fontSize: 24, marginBottom: 8 }}>♡</div>
                            <div style={{ fontSize: 13, color: '#c2185b', fontWeight: 600, marginBottom: 4 }}>Building your taste profile...</div>
                            <div style={{ fontSize: 12, color: '#888' }}>Like more artworks to get personalized recommendations</div>
                        </div>
                    )}

                    {/* Regular Results */}
                    {isExpanded && !isSearchPageMode && !isAIMode && !isRecommendMode && filteredArtworks.length > 0 && (
                        <div
                            onWheel={(e) => e.stopPropagation()}
                            onTouchMove={(e) => e.stopPropagation()}
                            style={{
                                borderTop: `1px solid ${navDivider}`,
                            }}
                        >
                            {filteredArtworks.map((art, idx) => (
                                <div
                                    key={art.id}
                                    className="search-result-item"
                                    onClick={(e) => { e.stopPropagation(); handleSelectArtwork(art); }}
                                    style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 16px', cursor: 'pointer', borderBottom: idx < filteredArtworks.length - 1 ? `1px solid ${navDivider}` : 'none', transition: 'background 150ms ease', ...resultRevealStyle(idx) }}
                                    onMouseEnter={(e) => e.currentTarget.style.background = navItemHover}
                                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                                >
                                    <div style={{ width: 44, height: 44, borderRadius: 4, overflow: 'hidden', flexShrink: 0, background: navThumbBg }}>
                                        <ProgressiveThumb
                                            primaryUrl={art.image}
                                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                            loading="lazy"
                                        />
                                    </div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{
                                            fontSize: drawingSkin ? 15 : 13,
                                            fontWeight: drawingSkin ? 700 : 600,
                                            color: navTitleColor,
                                            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                                            fontFamily: drawingSkin ? drawingHumanFont : 'inherit',
                                        }}>{getArtworkTitle(art, language, titleMap)}</div>
                                        {(() => {
                                            const yearLabel = formatArtworkYear(art.date);
                                            return (
                                                <div style={{
                                                    fontSize: drawingSkin ? 13 : 11,
                                                    color: navSubColor,
                                                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                                                    fontFamily: drawingSkin ? drawingHumanFont : 'inherit',
                                                }}>
                                                    {getArtistDisplayName(art.artist, language, artistMap)}{yearLabel ? ` • ${yearLabel}` : ''}
                                                </div>
                                            );
                                        })()}
                                        <div style={{
                                            fontSize: drawingSkin ? 12 : 11,
                                            color: navMuseumColor,
                                            fontFamily: drawingSkin ? drawingHumanFont : 'inherit',
                                        }}>
                                            {(() => {
                                                const m = museums.find(mm => mm.name === art.museumName);
                                                const nm = getMuseumDisplayName(m ?? { name: art.museumName }, language);
                                                return m?.country ? `${nm} • ${localizeCountryName(m.country, language)}` : nm;
                                            })()}
                                        </div>
                                    </div>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(201,165,90,0.4)" strokeWidth="2"><polyline points="9 18 15 12 9 6" /></svg>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Loading State */}
                    {isExpanded && !isSearchPageMode && isLoading && (
                        <div style={{ padding: '16px', textAlign: 'center', color: navSubColor, fontSize: 13, borderTop: `1px solid ${navDivider}` }}>
                            Loading search data...
                        </div>
                    )}

                    {/* No results / witty loading */}
                    {isExpanded && !isSearchPageMode && query.length >= 2 && !isAIMode && !isRecommendMode && filteredArtworks.length === 0 && suggestedArtists.length === 0 && (
                        searchPending
                            ? <div style={{ borderTop: `1px solid ${navDivider}` }}><SearchWittyLoader dark={isNavDark} /></div>
                            : <div style={{ padding: '16px', textAlign: 'center', color: navSubColor, fontSize: 13, borderTop: `1px solid ${navDivider}` }}>No results for "{query}"</div>
                    )}

                    {/* Hint */}
                    {isExpanded && !isSearchPageMode && query.length < 2 && !isLoading && !isRecommendMode && (
                        <div style={{ padding: '12px 16px', textAlign: 'center', color: navHintColor, fontSize: 12, borderTop: `1px solid ${navDivider}`, letterSpacing: '0.02em' }}>
                            {isAIMode
                                ? '✨ AI Search: Try "impressionist landscape" or "portrait of woman"'
                                : (totalCount > 0 ? `Search ${totalCount.toLocaleString()} artworks from world museums` : 'Type at least 2 characters')}
                        </div>
                    )}
                </div>
            </div>



            {/* Artist Gallery Modal */}
            {artistGallery && createPortal(
                (() => {
                    const isDark = !isDrawingGalleryMode; // always dark luxury; drawing mode uses light brutalist
                    const bg = isDrawingGalleryMode ? '#ffffff' : '#111111';
                    const cardBg = isDrawingGalleryMode ? '#ffffff' : '#181818';
                    const btnBg = isDrawingGalleryMode ? '#ffffff' : '#1e1e1e';
                    const textMain = isDrawingGalleryMode ? '#111111' : '#ffffff';
                    const textSub = isDrawingGalleryMode ? '#4d4740' : 'rgba(255,255,255,0.45)';
                    const accent = isDrawingGalleryMode ? '#d4a547' : '#d4a547';
                    const border = isDrawingGalleryMode ? '#111111' : 'rgba(255,255,255,0.08)';
                    const borderLight = isDrawingGalleryMode ? '#2f2f2f' : 'rgba(255,255,255,0.14)';
                    const borderWidth = isDrawingGalleryMode ? '2.5px' : '1px';
                    const asciiArt = galleryAsciiArt || buildFallbackAscii(artistGallery.artist);
                    const filteredCount = filteredGalleryArtworks.length;
                    const hasMoreGalleryArtworks = visibleGalleryArtworks.length < filteredGalleryArtworks.length;
                    return (
                        <div
                            style={{
                                position: 'fixed',
                                inset: 0,
                                zIndex: galleryZIndex,
                                background: isDrawingGalleryMode
                                    ? 'rgba(255,255,255,0.97)'
                                    : 'rgba(17,17,17,0.97)',
                                backdropFilter: 'blur(16px)',
                                WebkitBackdropFilter: 'blur(16px)',
                                overflowY: 'auto',
                                display: 'flex',
                                alignItems: 'flex-start',
                                justifyContent: 'center',
                                /* On mobile: no horizontal padding (edge-to-edge card) + 90px bottom for nav bar */
                                padding: isMobile ? '0 0 90px' : '48px 40px 60px',
                                transition: 'background 0.3s',
                                boxSizing: 'border-box',
                            }}
                            onWheel={(e) => e.stopPropagation()}
                            onScroll={handleGalleryScroll}
                        >
                            <div style={{
                                width: '100%', maxWidth: 1200,
                                display: 'flex', flexDirection: 'column',
                                overflowX: 'clip',
                                overflowY: 'visible',
                                /* No border-radius on mobile for full-width look */
                                borderRadius: isMobile ? 0 : 14,
                                border: isMobile ? 'none' : `${borderWidth} solid ${border}`,
                                background: bg,
                                marginBottom: isMobile ? 0 : 40,
                                boxShadow: isDrawingGalleryMode ? '10px 12px 0 rgba(17,17,17,1)' : 'none',
                                filter: isDrawingGalleryMode ? 'url(#dg-sketch-ui)' : 'none',
                                fontFamily: isDrawingGalleryMode ? "'Space Mono', 'SFMono-Regular', Menlo, Monaco, Consolas, monospace" : 'inherit',
                            }}>

                                {/* ── HERO ─────────────────────────────────────── */}
                                <header style={{
                                    /* iOS WebView no longer auto-adjusts content insets, so the
                                       ARTIST badge + name landed under the Dynamic Island. The
                                       env(safe-area-inset-top) addition pushes the whole hero
                                       block down by the notch height on devices that have one. */
                                    padding: isMobile
                                        ? 'calc(env(safe-area-inset-top, 0px) + 16px) 10px 14px'
                                        : '52px 60px 40px',
                                    borderBottom: `${borderWidth} solid ${border}`,
                                    background: bg,
                                    position: 'relative',
                                    overflow: 'hidden',
                                }}>
                                    {/* Ghost decorative text — last word of artist name, huge */}
                                    {!isMobile && !isDrawingGalleryMode && (
                                        <div
                                            aria-hidden
                                            style={{
                                                position: 'absolute',
                                                right: -20,
                                                top: '50%',
                                                transform: 'translateY(-50%)',
                                                fontFamily: "'Space Grotesk', system-ui, -apple-system, sans-serif",
                                                fontWeight: 700,
                                                fontSize: 'clamp(100px, 14vw, 180px)',
                                                color: 'rgba(255,255,255,0.035)',
                                                letterSpacing: '-0.05em',
                                                lineHeight: 1,
                                                pointerEvents: 'none',
                                                userSelect: 'none',
                                                whiteSpace: 'nowrap',
                                            }}
                                        >
                                            {artistGallery.artist.split(' ').pop()}
                                        </div>
                                    )}
                                    {/* Eyebrow row */}
                                    <div style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: isMobile ? 18 : 28 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                            <span style={{
                                                fontSize: 10, letterSpacing: '0.28em', textTransform: 'uppercase',
                                                color: '#111111', fontWeight: 700,
                                                background: accent,
                                                padding: '4px 12px',
                                                border: isDrawingGalleryMode ? '2px solid #111111' : 'none',
                                                borderRadius: 2, flexShrink: 0,
                                            }}>{t({ ko: '작가', en: 'Artist' })}</span>
                                            {(galleryFoundArtist?.nationality || galleryFoundArtist?.birthYear) && (
                                                <span style={{ fontSize: 12, color: textSub, letterSpacing: '0.04em' }}>
                                                    {[
                                                        galleryFoundArtist?.nationality ? localizeCountryName(galleryFoundArtist.nationality, language) : null,
                                                        galleryFoundArtist?.birthYear ? (language === 'ko' ? `${galleryFoundArtist.birthYear}년생` : `b. ${galleryFoundArtist.birthYear}`) : null,
                                                    ].filter(Boolean).join(' · ')}
                                                </span>
                                            )}
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <button
                                                onClick={closeArtistGallery}
                                                onMouseDown={(e) => {
                                                    if (!isDrawingGalleryMode) return;
                                                    e.currentTarget.style.transform = 'translate(2px, 2px)';
                                                    e.currentTarget.style.boxShadow = '1px 1px 0 rgba(17,17,17,0.95)';
                                                }}
                                                onMouseUp={(e) => {
                                                    if (!isDrawingGalleryMode) return;
                                                    e.currentTarget.style.transform = 'translate(0, 0)';
                                                    e.currentTarget.style.boxShadow = '3px 3px 0 rgba(17,17,17,0.95)';
                                                }}
                                                onMouseLeave={(e) => {
                                                    if (!isDrawingGalleryMode) return;
                                                    e.currentTarget.style.transform = 'translate(0, 0)';
                                                    e.currentTarget.style.boxShadow = '3px 3px 0 rgba(17,17,17,0.95)';
                                                }}
                                                style={{
                                                width: 36, height: 36, borderRadius: '50%', border: `${isDrawingGalleryMode ? '2.5px' : '1px'} solid ${border}`,
                                                background: btnBg, color: textSub, fontSize: 18,
                                                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                outline: 'none',
                                                boxShadow: isDrawingGalleryMode ? '3px 3px 0 rgba(17,17,17,0.95)' : 'none',
                                                transition: isDrawingGalleryMode ? 'transform 90ms ease, box-shadow 90ms ease, background 140ms ease' : 'background 140ms ease',
                                            }}>✕</button>
                                        </div>
                                    </div>

                                    {/* Artist name */}
                                    <h1 style={{
                                        position: 'relative', zIndex: 1,
                                        fontFamily: isDrawingGalleryMode
                                            ? "'Space Mono', 'SFMono-Regular', Menlo, Monaco, Consolas, monospace"
                                            : "'Space Grotesk', system-ui, -apple-system, sans-serif",
                                        fontSize: isMobile ? 'clamp(40px, 10vw, 56px)' : 'clamp(60px, 6vw, 96px)',
                                        fontWeight: 800,
                                        letterSpacing: '-0.03em',
                                        color: textMain,
                                        margin: '0 0 28px',
                                        lineHeight: 0.92,
                                    }}>{artistGallery.artist}</h1>

                                    {/* Footer row — Claude design: accent count + style tag + Follow Artist + Wikipedia */}
                                    <div style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', gap: isMobile ? 12 : 20, flexWrap: 'wrap' }}>
                                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                                            <span style={{
                                                fontFamily: "'Space Grotesk', system-ui, -apple-system, sans-serif",
                                                fontSize: isMobile ? 22 : 28,
                                                fontWeight: 700,
                                                color: accent,
                                                letterSpacing: '-0.03em',
                                                fontVariantNumeric: 'tabular-nums',
                                                lineHeight: 1,
                                            }}>
                                                {(artistGallery.isLoading && artistGallery.artworks.length === 0)
                                                    ? '...'
                                                    : artistGallery.artworks.length.toLocaleString()}
                                            </span>
                                            <span style={{
                                                fontFamily: "'Space Mono', monospace",
                                                fontSize: 11,
                                                color: textSub,
                                                letterSpacing: '0.12em',
                                                textTransform: 'uppercase',
                                            }}>{t({ ko: '점 소장', en: 'works in collection' })}</span>
                                        </div>
                                        {galleryCategories.length > 0 && (
                                            <>
                                                <div style={{ width: 1, height: 16, background: borderLight }} />
                                                <span style={{
                                                    display: 'inline-block',
                                                    padding: '3px 10px',
                                                    background: 'rgba(255,255,255,0.04)',
                                                    color: textSub,
                                                    fontFamily: "'Space Mono', monospace",
                                                    fontSize: 10,
                                                    letterSpacing: '0.12em',
                                                    textTransform: 'uppercase',
                                                    lineHeight: 1.6,
                                                }}>{getMediumKo(galleryCategories[0].cat, language)}</span>
                                            </>
                                        )}
                                        {artistGallery.isLoading && (
                                            <span style={{ fontSize: 11, color: textSub, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                                                {t({ ko: '전체 컬렉션 불러오는 중...', en: 'Syncing full collection...' })}
                                            </span>
                                        )}
                                        <div style={{ flex: 1 }} />
                                        <button
                                            type="button"
                                            onClick={toggleLikeArtist}
                                            style={{
                                                display: 'flex', alignItems: 'center', gap: 8,
                                                padding: '9px 18px',
                                                border: `1px solid ${artistGalleryIsLiked ? accent : borderLight}`,
                                                background: 'transparent',
                                                color: artistGalleryIsLiked ? accent : textMain,
                                                fontFamily: "'Space Mono', monospace",
                                                fontSize: 11,
                                                letterSpacing: '0.12em',
                                                textTransform: 'uppercase',
                                                cursor: 'pointer',
                                                transition: 'border-color 0.15s, color 0.15s',
                                            }}
                                            onMouseEnter={(e) => {
                                                if (artistGalleryIsLiked) return;
                                                e.currentTarget.style.borderColor = accent;
                                                e.currentTarget.style.color = accent;
                                            }}
                                            onMouseLeave={(e) => {
                                                if (artistGalleryIsLiked) return;
                                                e.currentTarget.style.borderColor = borderLight;
                                                e.currentTarget.style.color = textMain;
                                            }}
                                        >
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                                <path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z" fill={artistGalleryIsLiked ? accent : 'none'} />
                                            </svg>
                                            {artistGalleryIsLiked ? t({ ko: '팔로잉', en: 'Following' }) : t({ ko: '작가 팔로우', en: 'Follow artist' })}
                                        </button>
                                        {galleryWikiUrl && (
                                            <a href={galleryWikiUrl} target="_blank" rel="noreferrer"
                                                style={{
                                                    display: 'inline-flex', alignItems: 'center', gap: 6,
                                                    fontFamily: "'Space Mono', monospace",
                                                    fontSize: 11, color: textSub, letterSpacing: '0.12em',
                                                    textDecoration: 'none',
                                                    borderBottom: `1px solid ${borderLight}`,
                                                    paddingBottom: 2,
                                                    textTransform: 'uppercase',
                                                }}
                                                onMouseEnter={(e) => { e.currentTarget.style.color = accent; e.currentTarget.style.borderBottomColor = accent; }}
                                                onMouseLeave={(e) => { e.currentTarget.style.color = textSub; e.currentTarget.style.borderBottomColor = borderLight; }}
                                            >
                                                {t({ ko: '위키백과', en: 'Wikipedia' })}
                                                <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                                    <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
                                                    <polyline points="15 3 21 3 21 9" />
                                                    <line x1="10" y1="14" x2="21" y2="3" />
                                                </svg>
                                            </a>
                                        )}
                                    </div>
                                </header>

                                {/* ── BIO + MAP ────────────────────────────────── */}
                                <section style={{
                                    display: 'flex',
                                    flexDirection: isMobile ? 'column' : 'row',
                                    borderBottom: `${borderWidth} solid ${border}`,
                                    background: bg,
                                }}>
                                    {/* Bio column */}
                                    <div style={{
                                        flex: isMobile ? '1 1 auto' : '0 0 50%',
                                        minWidth: 0,
                                        padding: isMobile ? '16px 10px' : '28px 36px',
                                        borderRight: isMobile ? 'none' : `${borderWidth} solid ${border}`,
                                        borderBottom: isMobile ? `${borderWidth} solid ${border}` : 'none',
                                        // Editorial body font for long-form wiki text
                                        fontFamily: "'Inter', 'Apple SD Gothic Neo', 'Noto Sans KR', 'Helvetica Neue', Arial, sans-serif",
                                        color: isDark ? '#ECE8DE' : '#2A2622',
                                        boxSizing: 'border-box',
                                        fontSize: isMobile ? 13 : 14.5,
                                        lineHeight: 1.65,
                                        fontWeight: 400,
                                    }}>
                                        <p style={{
                                            fontSize: 10, letterSpacing: '0.3em', textTransform: 'uppercase',
                                            color: accent, fontWeight: 500, margin: '0 0 14px',
                                            fontFamily: "'Space Mono', 'SFMono-Regular', Menlo, Consolas, monospace",
                                        }}>{t({ ko: '인피니트 위키', en: 'Infinite Wiki' })}</p>
                                        <ArtistWikiPanel
                                            artistName={artistGallery.artist}
                                            imageUrl={undefined}
                                            fallbackDescription={artistFallbackDescription}
                                        />
                                        <pre style={{
                                            fontFamily: "'DM Mono', 'Courier New', monospace",
                                            fontSize: isMobile ? 7 : 9,
                                            color: isDrawingGalleryMode ? '#a4a097' : (isDark ? 'rgba(255,255,255,0.12)' : '#c8c3bb'),
                                            margin: '28px 0 0',
                                            lineHeight: 1.4,
                                            overflowX: 'auto',
                                            userSelect: 'none',
                                        }}>{asciiArt}</pre>
                                    </div>

                                    {/* Map column + Distribution slides — shown on all screen sizes */}
                                    {artistGallery.artworks.length > 0 && (() => {
                                        const allArtworks = artistGallery.artworks;
                                        const total = allArtworks.length;

                                        // Museum distribution
                                        const musMap_: Map<string, number> = new Map();
                                        for (const art of allArtworks) {
                                            if (art.museumName) musMap_.set(art.museumName, (musMap_.get(art.museumName) || 0) + 1);
                                        }
                                        const musArr_ = Array.from(musMap_.entries())
                                            .sort((a, b) => b[1] - a[1])
                                            .map(([name, count]) => {
                                                const mus = (museums || []).find(m => m.name === name);
                                                return { name, count, country: mus?.country || '', pct: Math.round(count / total * 100) };
                                            });

                                        // Country distribution
                                        const cntryMap_: Map<string, number> = new Map();
                                        for (const { country, count } of musArr_) {
                                            if (country) cntryMap_.set(country, (cntryMap_.get(country) || 0) + count);
                                        }
                                        const cntryArr_ = Array.from(cntryMap_.entries())
                                            .sort((a, b) => b[1] - a[1])
                                            .map(([name, count]) => ({ name, count, pct: Math.round(count / total * 100) }));

                                        // Gold/amber palette — donut segments + legend dots
                                        const DONUT_COLORS = ['#d4a547', '#f0c878', '#a07028', '#f5dca6', '#6b4514', '#e8b85f', '#fae8c4', '#3f2906'];

                                        const renderDonut = (data: { name: string; count: number }[], _centerLabel: string) => {
                                            const cx = 56, cy = 56, outerR = 44, innerR = 26;
                                            const bgStroke = isDark ? '#111111' : 'rgba(245,242,237,0.9)';
                                            const remainFill = isDark ? '#222222' : '#e0dbd3';
                                            const toXY = (angleDeg: number, r: number) => ({
                                                x: cx + r * Math.sin((angleDeg * Math.PI) / 180),
                                                y: cy - r * Math.cos((angleDeg * Math.PI) / 180),
                                            });
                                            const makeArc = (a1: number, a2: number): string => {
                                                const p1o = toXY(a1, outerR), p2o = toXY(a2, outerR);
                                                const p1i = toXY(a1, innerR), p2i = toXY(a2, innerR);
                                                const large = (a2 - a1) > 180 ? 1 : 0;
                                                const f = (n: number) => n.toFixed(2);
                                                return [
                                                    `M${f(p1o.x)},${f(p1o.y)}`,
                                                    `A${outerR},${outerR} 0 ${large} 1 ${f(p2o.x)},${f(p2o.y)}`,
                                                    `L${f(p2i.x)},${f(p2i.y)}`,
                                                    `A${innerR},${innerR} 0 ${large} 0 ${f(p1i.x)},${f(p1i.y)}`,
                                                    'Z'
                                                ].join(' ');
                                            };
                                            let cumAngle = 0;
                                            const segs = data.slice(0, 8).map((d, i) => {
                                                const span = (d.count / total) * 360;
                                                const a1 = cumAngle;
                                                const a2 = cumAngle + span;
                                                cumAngle += span;
                                                return { a1, a2, color: DONUT_COLORS[i % DONUT_COLORS.length] };
                                            });
                                            const remaining = 360 - cumAngle;
                                            // Single-segment full-circle case: a 360° arc is degenerate in SVG
                                            // (start and end point coincide), so the path draws nothing. When
                                            // we have exactly one segment that fills the entire ring, render
                                            // it as concentric <circle>s instead — visually identical.
                                            const isSingleFullRing = segs.length === 1 && Math.abs(segs[0].a2 - segs[0].a1 - 360) < 0.01;
                                            return (
                                                <svg width="112" height="112" style={{ flexShrink: 0 }}>
                                                    {isSingleFullRing ? (
                                                        <>
                                                            <circle cx={cx} cy={cy} r={outerR} fill={segs[0].color} stroke={bgStroke} strokeWidth="1.5" />
                                                            <circle cx={cx} cy={cy} r={innerR} fill={isDark ? '#0f0f0f' : 'rgb(245,242,237)'} stroke={bgStroke} strokeWidth="1.5" />
                                                        </>
                                                    ) : (
                                                        segs.map((seg, i) => (
                                                            <path key={i} d={makeArc(seg.a1, seg.a2)} fill={seg.color} stroke={bgStroke} strokeWidth="1.5" />
                                                        ))
                                                    )}
                                                    {!isSingleFullRing && remaining > 0.5 && (
                                                        <path d={makeArc(cumAngle, 360)} fill={remainFill} stroke={bgStroke} strokeWidth="1.5" />
                                                    )}
                                                    <text x={cx} y={cy + 5} textAnchor="middle" fontSize="16" fontWeight="700" fill={isDark ? '#ffffff' : '#2a2520'} fontFamily="system-ui,sans-serif">
                                                        {total >= 1000 ? `${(total / 1000).toFixed(1)}k` : total}
                                                    </text>
                                                </svg>
                                            );
                                        };

                                        return (
                                            <div style={{ flex: isMobile ? '1 1 auto' : '0 0 50%', minWidth: 0, boxSizing: 'border-box', padding: isMobile ? '16px' : '24px 32px' }}>
                                                <p style={{ fontSize: 10, letterSpacing: '0.3em', textTransform: 'uppercase', color: accent, fontWeight: 500, margin: '0 0 14px' }}>{t({ ko: '전 세계 분포', en: 'Global Distribution' })}</p>

                                                {/* Combined map + slides card */}
                                                <div style={{
                                                    width: '100%', borderRadius: 10, overflow: 'hidden',
                                                    border: `${borderWidth} solid ${border}`,
                                                    display: 'flex', flexDirection: 'column',
                                                    minHeight: isMobile ? 160 : 200,
                                                    boxShadow: isDrawingGalleryMode ? '5px 6px 0 rgba(17,17,17,0.9)' : 'none',
                                                }}>
                                                                    {/* amCharts map — lazy loaded on all platforms */}
                                                    <div style={{ flex: '1 1 0%', minHeight: 0, width: '100%', overflow: 'hidden' }}>
                                                        <Suspense fallback={<div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center', color: textSub, fontSize: 12 }}>{t({ ko: '지도 불러오는 중…', en: 'Loading map…' })}</div>}>
                                                            <ArtistDistributionMap
                                                                artworks={artistGallery.artworks as any}
                                                                isDark={isDark}
                                                                hideLegend
                                                                mapHeight={isMobile ? "120px" : "160px"}
                                                                drawingStyle={isDrawingGalleryMode ? 'drawing-flat' : 'default'}
                                                            />
                                                        </Suspense>
                                                    </div>

                                                    {/* Distribution slides — bottom of combined card */}
                                                    <div style={{
                                                        flexShrink: 0,
                                                        borderTop: `${borderWidth} solid ${border}`,
                                                        background: isDrawingGalleryMode ? '#ffffff' : (isDark ? '#0f0f0f' : 'rgb(245,242,237)'),
                                                        userSelect: 'none',
                                                    }}>
                                                        <style>{`._armin-slide-scroll::-webkit-scrollbar{display:none}@keyframes arminCardReveal{0%{opacity:0;transform:translateY(18px)}100%{opacity:1;transform:translateY(0)}}[data-art-card]{opacity:0;transform:translateY(18px);animation:arminCardReveal .56s ease-in-out forwards}`}</style>

                                                        {/* Grab area — CSS transform slide strip */}
                                                        <div
                                                            style={{ overflow: 'hidden', cursor: 'grab', touchAction: 'pan-y' }}
                                                            onPointerDown={(e) => {
                                                                slideDragPointerId.current = e.pointerId;
                                                                slideDragStartX.current = e.clientX;
                                                                e.currentTarget.setPointerCapture(e.pointerId);
                                                            }}
                                                            onPointerUp={(e) => {
                                                                if (slideDragPointerId.current !== e.pointerId) return;
                                                                if (slideDragStartX.current === null) return;
                                                                const delta = e.clientX - slideDragStartX.current;
                                                                slideDragStartX.current = null;
                                                                slideDragPointerId.current = null;
                                                                e.currentTarget.releasePointerCapture(e.pointerId);
                                                                moveGallerySlideByDelta(delta);
                                                            }}
                                                            onPointerCancel={(e) => {
                                                                if (slideDragPointerId.current === e.pointerId) {
                                                                    slideDragStartX.current = null;
                                                                    slideDragPointerId.current = null;
                                                                }
                                                            }}
                                                        >
                                                            {/* 3-slide strip — width:300%, CSS transform */}
                                                            <div style={{
                                                                display: 'flex',
                                                                width: '300%',
                                                                willChange: 'transform',
                                                                transition: 'transform 0.38s ease-in-out',
                                                                transform: `translateX(calc(-${galleryMapSlide * 33.3333}% + 0px))`,
                                                            }}>
                                                                {/* Slide 0: 국가별 소장 분포 */}
                                                                <div style={{ width: '33.3333%', flexShrink: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                                                                    <p style={{ fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: textSub, margin: '8px 16px 4px', fontWeight: 600, pointerEvents: 'none', flexShrink: 0 }}>{t({ ko: '국가별 소장 분포', en: 'By Country' })}</p>
                                                                    <div className="_armin-slide-scroll" style={{ width: '100%', maxHeight: 118, overflowY: 'auto', overflowX: 'hidden', scrollbarWidth: 'none', padding: '0 12px 8px', boxSizing: 'border-box' } as React.CSSProperties}>
                                                                        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                                                                            {renderDonut(cntryArr_.length > 0 ? cntryArr_ : musArr_, 'COUNTRY')}
                                                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                                                {(cntryArr_.length > 0 ? cntryArr_ : musArr_).slice(0, 6).map((d, i) => (
                                                                                    <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
                                                                                        <div style={{ width: 9, height: 9, borderRadius: 1, background: DONUT_COLORS[i % DONUT_COLORS.length], flexShrink: 0 }} />
                                                                                        <span style={{ flex: 1, minWidth: 0, fontSize: 10, color: textMain, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', opacity: Math.max(0.5, 1 - i * 0.08), lineHeight: 1.3 }}>{localizeCountryName(d.name, language)}</span>
                                                                                        <span style={{ fontSize: 11, color: accent, fontWeight: 700, fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>{d.pct}%</span>
                                                                                    </div>
                                                                                ))}
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                </div>

                                                                {/* Slide 1: 미술관별 소장 분포 */}
                                                                <div style={{ width: '33.3333%', flexShrink: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                                                                    <p style={{ fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: textSub, margin: '8px 16px 4px', fontWeight: 600, pointerEvents: 'none', flexShrink: 0 }}>{t({ ko: '미술관별 소장 분포', en: 'By Museum' })}</p>
                                                                    <div className="_armin-slide-scroll" style={{ width: '100%', maxHeight: 118, overflowY: 'auto', overflowX: 'hidden', scrollbarWidth: 'none', padding: '0 12px 8px', boxSizing: 'border-box' } as React.CSSProperties}>
                                                                        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                                                                            {renderDonut(musArr_, 'MUSEUM')}
                                                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                                                {musArr_.slice(0, 6).map((d, i) => (
                                                                                    <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
                                                                                        <div style={{ width: 9, height: 9, borderRadius: 1, background: DONUT_COLORS[i % DONUT_COLORS.length], flexShrink: 0 }} />
                                                                                        <span style={{ flex: 1, minWidth: 0, fontSize: 10, color: textMain, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', opacity: Math.max(0.5, 1 - i * 0.08), lineHeight: 1.3 }}>
                                                                                            {getMuseumDisplayName(museums.find(x => x.name === d.name) ?? { name: d.name }, language)}{(d as any).country ? <span style={{ color: textSub, fontWeight: 400 }}> · {localizeCountryName((d as any).country, language)}</span> : null}
                                                                                        </span>
                                                                                        <span style={{ fontSize: 11, color: accent, fontWeight: 700, fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>{d.pct}%</span>
                                                                                    </div>
                                                                                ))}
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                </div>

                                                                {/* Slide 2: TOP MUSEUMS */}
                                                                <div style={{ width: '33.3333%', flexShrink: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                                                                    <p style={{ fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: textSub, margin: '8px 16px 4px', fontWeight: 600, pointerEvents: 'none', flexShrink: 0 }}>{t({ ko: '인기 미술관', en: 'Top Museums' })}</p>
                                                                    <div className="_armin-slide-scroll" style={{ width: '100%', maxHeight: 118, overflowY: 'auto', overflowX: 'hidden', scrollbarWidth: 'none', padding: '0 12px 8px', boxSizing: 'border-box' } as React.CSSProperties}>
                                                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '7px 16px' }}>
                                                                            {musArr_.slice(0, 12).map((m, i) => {
                                                                                const pct = Math.round((m.count / (musArr_[0]?.count ?? 1)) * 100);
                                                                                return (
                                                                                    <div key={m.name} style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
                                                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 4 }}>
                                                                                            <span style={{ fontSize: 10, color: textMain, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0, opacity: Math.max(0.5, 1 - i * 0.04), lineHeight: 1.3 }}>
                                                                                                {getMuseumDisplayName(museums.find(x => x.name === m.name) ?? { name: m.name }, language)}{m.country ? <span style={{ color: textSub, fontWeight: 400 }}> · {localizeCountryName(m.country, language)}</span> : null}
                                                                                            </span>
                                                                                            <span style={{ fontSize: 11, color: accent, fontWeight: 700, fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>{m.count >= 1000 ? `${(m.count / 1000).toFixed(1)}k` : m.count}</span>
                                                                                        </div>
                                                                                        <div style={{ height: 2, background: border, borderRadius: 1, overflow: 'hidden' }}>
                                                                                            <div style={{ height: '100%', width: `${pct}%`, background: accent, opacity: Math.max(0.3, 0.85 - i * 0.05), borderRadius: 1 }} />
                                                                                        </div>
                                                                                    </div>
                                                                                );
                                                                            })}
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>

                                                        {/* Pagination dots */}
                                                        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 5, padding: '5px 0 7px' }}>
                                                            {[0, 1, 2].map(i => (
                                                                <button key={i} onClick={(e) => { e.stopPropagation(); setGalleryMapSlide(i); }} style={{
                                                                    width: i === galleryMapSlide ? 20 : 6,
                                                                    height: 6, borderRadius: 3,
                                                                    background: i === galleryMapSlide ? accent : border,
                                                                    border: 'none', outline: 'none', cursor: 'pointer', padding: 0,
                                                                    transition: 'all 0.2s ease',
                                                                }} />
                                                            ))}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })()}
                                </section>

                                {/* ── GALLERY ──────────────────────────────────── */}
                                <section style={{ flex: 1, background: bg, paddingBottom: isMobile ? 40 : 60 }}>
                                    {/* Gallery header */}
                                    <div style={{
                                        display: 'flex', alignItems: 'center', gap: 16,
                                        padding: isMobile ? '20px 20px 12px' : '32px 60px 20px',
                                    }}>
                                        <span style={{ fontSize: isMobile ? 20 : 28, fontWeight: 700, color: textMain, fontVariantNumeric: 'tabular-nums' }}>
                                            {filteredCount.toLocaleString()}
                                        </span>
                                        <span style={{ fontSize: 13, color: textSub }}>{t({ ko: '점', en: 'works' })}</span>
                                        <div style={{ flex: 1, height: 1, background: borderLight }} />
                                    </div>

                                    {/* Category pills */}
                                    {galleryCategories.length >= 1 && (
                                        <div style={{
                                            padding: isMobile ? '0 20px 16px' : '0 60px 20px',
                                            display: 'flex', flexWrap: 'wrap', gap: 6,
                                        }}>
                                            <button
                                                onClick={() => setGalleryCategory(null)}
                                                onMouseDown={(e) => {
                                                    if (!isDrawingGalleryMode) return;
                                                    e.currentTarget.style.transform = 'translate(2px, 2px)';
                                                    e.currentTarget.style.boxShadow = '1px 1px 0 rgba(17,17,17,0.95)';
                                                }}
                                                onMouseUp={(e) => {
                                                    if (!isDrawingGalleryMode) return;
                                                    e.currentTarget.style.transform = 'translate(0, 0)';
                                                    e.currentTarget.style.boxShadow = '3px 3px 0 rgba(17,17,17,0.95)';
                                                }}
                                                onMouseLeave={(e) => {
                                                    if (!isDrawingGalleryMode) return;
                                                    e.currentTarget.style.transform = 'translate(0, 0)';
                                                    e.currentTarget.style.boxShadow = '3px 3px 0 rgba(17,17,17,0.95)';
                                                }}
                                                style={{
                                                    padding: '4px 12px', borderRadius: 20,
                                                    border: `${isDrawingGalleryMode ? '2px' : '1px'} solid ${!galleryCategory ? accent : border}`,
                                                    background: !galleryCategory ? accent : 'transparent',
                                                    color: !galleryCategory ? '#111111' : textSub,
                                                    fontSize: 11, fontWeight: 700, cursor: 'pointer',
                                                    letterSpacing: '0.04em',
                                                    boxShadow: isDrawingGalleryMode ? '3px 3px 0 rgba(17,17,17,0.95)' : 'none',
                                                    transform: 'translate(0, 0)',
                                                    transition: isDrawingGalleryMode ? 'transform 90ms ease, box-shadow 90ms ease, background 150ms ease, color 150ms ease, border-color 150ms ease' : 'all 0.15s',
                                                }}
                                            >{t({ ko: '전체', en: 'All' })} · {artistGallery.artworks.length.toLocaleString()}</button>
                                            {galleryCategories.map(({ cat, cnt }) => {
                                                const active = galleryCategory === cat;
                                                return (
                                                    <button
                                                        key={cat}
                                                        onClick={() => setGalleryCategory(active ? null : cat)}
                                                        onMouseDown={(e) => {
                                                            if (!isDrawingGalleryMode) return;
                                                            e.currentTarget.style.transform = 'translate(2px, 2px)';
                                                            e.currentTarget.style.boxShadow = '1px 1px 0 rgba(17,17,17,0.95)';
                                                        }}
                                                        onMouseUp={(e) => {
                                                            if (!isDrawingGalleryMode) return;
                                                            e.currentTarget.style.transform = 'translate(0, 0)';
                                                            e.currentTarget.style.boxShadow = '3px 3px 0 rgba(17,17,17,0.95)';
                                                        }}
                                                        onMouseLeave={(e) => {
                                                            if (!isDrawingGalleryMode) return;
                                                            e.currentTarget.style.transform = 'translate(0, 0)';
                                                            e.currentTarget.style.boxShadow = '3px 3px 0 rgba(17,17,17,0.95)';
                                                        }}
                                                        style={{
                                                        padding: '4px 12px', borderRadius: 20,
                                                        border: `${isDrawingGalleryMode ? '2px' : '1px'} solid ${active ? accent : border}`,
                                                        background: active ? accent : 'transparent',
                                                        color: active ? '#111111' : textSub,
                                                        fontSize: 11, fontWeight: active ? 700 : 500,
                                                        cursor: 'pointer',
                                                        letterSpacing: '0.04em',
                                                        boxShadow: isDrawingGalleryMode ? '3px 3px 0 rgba(17,17,17,0.95)' : 'none',
                                                        transform: 'translate(0, 0)',
                                                        transition: isDrawingGalleryMode ? 'transform 90ms ease, box-shadow 90ms ease, background 150ms ease, color 150ms ease, border-color 150ms ease' : 'all 0.15s',
                                                    }}>{getMediumKo(cat, language)} · {cnt.toLocaleString()}</button>
                                                );
                                            })}
                                        </div>
                                    )}

                                    {/* Masonry grid */}
                                    <div style={{ padding: isMobile ? '0 6px' : '0 60px' }} ref={galleryContainerRef}>
                                        <div style={{ display: 'flex', gap: isMobile ? 6 : 20, alignItems: 'flex-start' }}>
                                            {artistGalleryColumns.map((column, columnIdx) => (
                                                <div key={`artist-column-${columnIdx}`} style={{ flex: 1, minWidth: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: isMobile ? 6 : 20 }}>
                                                    {column.map((art, idx) => {
                                                        const yearLabel = formatArtworkYear(art.date);
                                                        const displayTitle = yearLabel ? `${art.name} (${yearLabel})` : art.name;
                                                        const museumCountry = museumCountryMap.get(art.museumName) || '';
                                                        const museumNameLocalized = getMuseumDisplayName(museums.find(mm => mm.name === art.museumName) ?? { name: art.museumName }, language);
                                                        const museumCountryLocalized = museumCountry ? localizeCountryName(museumCountry, language) : '';
                                                        const museumDisplay = museumCountry ? `${art.museumName} (${museumCountry})` : art.museumName;
                                                        return (
                                                            <div
                                                                key={art.id || `art-${columnIdx}-${idx}`}
                                                                data-art-card={art.id || `${columnIdx}-${idx}`}
                                                                onClick={() => handleSelectArtwork(art)}
                                                                onMouseEnter={(e) => {
                                                                    const imgWrap = e.currentTarget.querySelector('[data-card-img-wrap]') as HTMLElement | null;
                                                                    if (imgWrap) imgWrap.style.boxShadow = `inset 0 0 0 1.5px ${accent}`;
                                                                    const title = e.currentTarget.querySelector('[data-card-title]') as HTMLElement | null;
                                                                    if (title) title.style.color = accent;
                                                                }}
                                                                onMouseLeave={(e) => {
                                                                    const imgWrap = e.currentTarget.querySelector('[data-card-img-wrap]') as HTMLElement | null;
                                                                    if (imgWrap) imgWrap.style.boxShadow = 'none';
                                                                    const title = e.currentTarget.querySelector('[data-card-title]') as HTMLElement | null;
                                                                    if (title) title.style.color = textMain;
                                                                }}
                                                                style={{
                                                                    cursor: 'pointer',
                                                                    position: 'relative',
                                                                    width: '100%',
                                                                    animationDelay: `${Math.min(700, (idx * 55) + (columnIdx * 90))}ms`,
                                                                }}
                                                            >
                                                                <div
                                                                    data-card-img-wrap
                                                                    style={{
                                                                        overflow: 'hidden',
                                                                        background: cardBg,
                                                                        border: isDrawingGalleryMode ? 'none' : `${borderWidth} solid ${border}`,
                                                                        borderRadius: isDrawingGalleryMode ? 10 : 6,
                                                                        transition: 'box-shadow 0.2s, border-color 0.2s',
                                                                        position: 'relative',
                                                                        boxShadow: 'none',
                                                                    }}>
                                                                    {(() => {
                                                                        const directUrl = resolveGalleryImageUrl(art);
                                                                        const isR2 = directUrl.includes('.r2.dev') || directUrl.includes('.r2.cloudflarestorage.com');
                                                                        const initialSrc = isR2
                                                                            ? directUrl
                                                                            : (directUrl ? getOptimizedImageUrl(directUrl, 400) : FALLBACK_IMG);
                                                                        return (
                                                                            <img
                                                                                src={initialSrc}
                                                                                data-direct-src={directUrl}
                                                                                style={{
                                                                                    width: '100%', height: 'auto', display: 'block',
                                                                                    transition: 'transform 750ms ease-in-out, opacity 0.45s ease, filter 0.45s ease',
                                                                                    transform: 'scale(1.02)',
                                                                                    opacity: 0,
                                                                                    filter: 'blur(4px)',
                                                                                }}
                                                                                loading="lazy"
                                                                                alt={art.name}
                                                                                referrerPolicy="no-referrer"
                                                                                onLoad={(e) => {
                                                                                    const target = e.currentTarget;
                                                                                    target.style.opacity = '1';
                                                                                    target.style.transform = 'scale(1)';
                                                                                    target.style.filter = 'blur(0)';
                                                                                }}
                                                                                onError={(e) => {
                                                                                    const target = e.currentTarget;
                                                                                    const direct = target.getAttribute('data-direct-src') || '';
                                                                                    // Attempt 1: if we were using wsrv, try direct URL
                                                                                    if (direct && target.src !== direct && target.src !== FALLBACK_IMG) {
                                                                                        target.src = direct;
                                                                                        return;
                                                                                    }
                                                                                    // Attempt 2: show translucent fallback
                                                                                    target.onerror = null;
                                                                                    target.src = FALLBACK_IMG;
                                                                                    target.style.opacity = '0.25';
                                                                                    target.style.transform = 'scale(1)';
                                                                                    target.style.filter = 'blur(0)';
                                                                                }}
                                                                            />
                                                                        );
                                                                    })()}
                                                                    {/* Action overlay — anchored to bottom-right of the
                                                                        artwork image so the icons can never be clipped
                                                                        by long titles below the card. Each icon sits
                                                                        on a small dark pill so it stays legible
                                                                        regardless of the underlying artwork colors. */}
                                                                    <div style={{
                                                                        position: 'absolute',
                                                                        right: isMobile ? 6 : 8,
                                                                        bottom: isMobile ? 6 : 8,
                                                                        display: 'flex',
                                                                        gap: isMobile ? 6 : 8,
                                                                        zIndex: 2,
                                                                    }}>
                                                                        {/* Buy as product — ShoppingBag */}
                                                                        <button
                                                                            type="button"
                                                                            onClick={(e) => { e.stopPropagation(); e.preventDefault(); setProductArtwork(art); }}
                                                                            title="상품으로 구매하기"
                                                                            aria-label="Buy as product"
                                                                            style={{
                                                                                width: isMobile ? 30 : 32,
                                                                                height: isMobile ? 30 : 32,
                                                                                borderRadius: '50%',
                                                                                background: 'rgba(0,0,0,0.55)',
                                                                                backdropFilter: 'blur(8px)',
                                                                                WebkitBackdropFilter: 'blur(8px)',
                                                                                border: 'none',
                                                                                color: '#fff',
                                                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                                                cursor: 'pointer',
                                                                                padding: 0,
                                                                                transition: 'transform 0.15s ease, background 0.15s ease',
                                                                            }}
                                                                            onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.08)'; e.currentTarget.style.background = 'rgba(0,0,0,0.75)'; }}
                                                                            onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.background = 'rgba(0,0,0,0.55)'; }}
                                                                        >
                                                                            <ShoppingBag size={isMobile ? 14 : 16} strokeWidth={2} />
                                                                        </button>
                                                                        {/* Save to playlist — BookmarkPlus */}
                                                                        <button
                                                                            type="button"
                                                                            onClick={(e) => { e.stopPropagation(); e.preventDefault(); setPlaylistArtwork(art); }}
                                                                            title="플레이리스트에 추가"
                                                                            aria-label="Save to playlist"
                                                                            style={{
                                                                                width: isMobile ? 30 : 32,
                                                                                height: isMobile ? 30 : 32,
                                                                                borderRadius: '50%',
                                                                                background: 'rgba(0,0,0,0.55)',
                                                                                backdropFilter: 'blur(8px)',
                                                                                WebkitBackdropFilter: 'blur(8px)',
                                                                                border: 'none',
                                                                                color: '#fff',
                                                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                                                cursor: 'pointer',
                                                                                padding: 0,
                                                                                transition: 'transform 0.15s ease, background 0.15s ease',
                                                                            }}
                                                                            onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.08)'; e.currentTarget.style.background = 'rgba(0,0,0,0.75)'; }}
                                                                            onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.background = 'rgba(0,0,0,0.55)'; }}
                                                                        >
                                                                            <BookmarkPlus size={isMobile ? 14 : 16} strokeWidth={2} />
                                                                        </button>
                                                                        {/* Like — HeartOverlay (already a button-like control) */}
                                                                        <div
                                                                            onClick={(e) => e.stopPropagation()}
                                                                            style={{
                                                                                width: isMobile ? 30 : 32,
                                                                                height: isMobile ? 30 : 32,
                                                                                borderRadius: '50%',
                                                                                background: 'rgba(0,0,0,0.55)',
                                                                                backdropFilter: 'blur(8px)',
                                                                                WebkitBackdropFilter: 'blur(8px)',
                                                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                                            }}
                                                                        >
                                                                            <HeartOverlay
                                                                                isLiked={isArtworkLiked(art.id)}
                                                                                onToggle={(e) => toggleLikeArtwork(e, art)}
                                                                                style={{ padding: 0, background: 'none' }}
                                                                                size={isMobile ? 14 : 16}
                                                                                color="#D4A547"
                                                                                emptyColor="#fff"
                                                                            />
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                                {/* Title + museum line — full width, no longer
                                                                    competing with the action icons for space. */}
                                                                <div style={{ marginTop: 10, paddingBottom: 4, display: 'flex', flexDirection: 'column', gap: 4 }}>
                                                                    <div
                                                                        data-card-title
                                                                        style={{
                                                                            fontFamily: "'Space Grotesk', system-ui, -apple-system, sans-serif",
                                                                            fontWeight: 500,
                                                                            fontSize: isMobile ? 12 : 13,
                                                                            color: textMain,
                                                                            lineHeight: 1.35,
                                                                            whiteSpace: 'normal',
                                                                            wordBreak: 'break-word',
                                                                            transition: 'color 0.18s',
                                                                        }}
                                                                    >
                                                                        {getArtworkTitle(art, language, titleMap)}
                                                                    </div>
                                                                    <div style={{
                                                                        fontFamily: "'Space Mono', monospace",
                                                                        fontSize: isMobile ? 9 : 10,
                                                                        color: textSub,
                                                                        letterSpacing: '0.06em',
                                                                        textTransform: 'uppercase',
                                                                        lineHeight: 1.5,
                                                                        whiteSpace: 'nowrap',
                                                                        overflow: 'hidden',
                                                                        textOverflow: 'ellipsis',
                                                                    }}>
                                                                        {yearLabel && <span>{yearLabel}</span>}
                                                                        {yearLabel && art.museumName && <span style={{ margin: '0 6px', opacity: 0.5 }}>·</span>}
                                                                        {art.museumName && <span>{museumNameLocalized}</span>}
                                                                        {museumCountryLocalized && <span style={{ opacity: 0.6 }}> ({museumCountryLocalized})</span>}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            ))}
                                        </div>
                                        {hasMoreGalleryArtworks && (
                                            <div style={{ display: 'flex', justifyContent: 'center', padding: isMobile ? '16px 0 8px' : '24px 0 8px' }}>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); loadMoreGalleryArtworks(); }}
                                                    onMouseDown={(e) => {
                                                        if (!isDrawingGalleryMode) return;
                                                        e.currentTarget.style.transform = 'translate(2px, 2px)';
                                                        e.currentTarget.style.boxShadow = '1px 1px 0 rgba(17,17,17,0.95)';
                                                    }}
                                                    onMouseUp={(e) => {
                                                        if (!isDrawingGalleryMode) return;
                                                        e.currentTarget.style.transform = 'translate(0, 0)';
                                                        e.currentTarget.style.boxShadow = '3px 3px 0 rgba(17,17,17,0.95)';
                                                    }}
                                                    onMouseLeave={(e) => {
                                                        if (!isDrawingGalleryMode) return;
                                                        e.currentTarget.style.transform = 'translate(0, 0)';
                                                        e.currentTarget.style.boxShadow = '3px 3px 0 rgba(17,17,17,0.95)';
                                                    }}
                                                    style={{
                                                        border: `${isDrawingGalleryMode ? '2px' : '1px'} solid ${border}`,
                                                        background: 'transparent',
                                                        color: textSub,
                                                        borderRadius: 999,
                                                        padding: '8px 14px',
                                                        fontSize: 12,
                                                        fontWeight: isDrawingGalleryMode ? 700 : 500,
                                                        cursor: 'pointer',
                                                        boxShadow: isDrawingGalleryMode ? '3px 3px 0 rgba(17,17,17,0.95)' : 'none',
                                                        transform: 'translate(0, 0)',
                                                        transition: isDrawingGalleryMode ? 'transform 90ms ease, box-shadow 90ms ease, background 150ms ease, color 150ms ease, border-color 150ms ease' : 'all 0.15s',
                                                    }}
                                                >
                                                    Load More ({visibleGalleryArtworks.length.toLocaleString()} / {filteredCount.toLocaleString()})
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </section>
                            </div>
                        </div>
                    );
                })(),
                document.body
            )}
            {/* POD Product Purchase Modal — portal to body (z-index 290000, above everything) */}
            {productArtwork && createPortal(
                <ProductModal
                    artwork={{
                        id: productArtwork.id,
                        name: productArtwork.name,
                        artist: productArtwork.artist,
                        image: productArtwork.image,
                        year: productArtwork.date || undefined
                    } as any}
                    onSelectArtwork={(nextArtwork) => setProductArtwork(nextArtwork as any)}
                    onClose={() => setProductArtwork(null)}
                />,
                document.body
            )}
            {/* Playlist Modal — portal to body (z-index 260200, above lightbox 260021) */}
            {playlistArtwork && createPortal(
                <PlaylistModal
                    isOpen={true}
                    onClose={() => setPlaylistArtwork(null)}
                    item={playlistArtwork}
                    itemType="artwork"
                    theme="dark"
                />,
                document.body
            )}
        </>
    );
}
