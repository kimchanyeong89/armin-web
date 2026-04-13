import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import artworks from "../data/artworks";
import { artists } from "../data/artists";
import { exhibitions } from "../data/exhibitions";
import type { Artwork } from "../types/Artwork";
import "../styles/ArtistPage.css";
import { ArtworkLightbox } from "../components/ArtworkLightbox";
import { auth, db } from "../firebase";
import { onAuthStateChanged } from 'firebase/auth';
import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  onSnapshot,
  serverTimestamp,
  getDocs,
} from 'firebase/firestore';
import { findMuseumForArtwork } from '../utils/museumUtils';
import { getWorkerNetworkMode, shouldLimitNetwork } from '../utils/network';
import { normalizeImageUrl } from '../utils/imageProxy';
import ArtistDistributionMap from '../components/ArtistDistributionMap';

type WorkerArtwork = {
  id: string;
  name: string;
  artist: string;
  image: string;
  date?: string;
  museumName?: string;
  exhibitionId?: string;
  category?: string;
  sourceUrl?: string;
  exhibitionTitle?: string;
};

// ── SVG icons ──────────────────────────────────────────────────────────────
const HeartIcon = () => (
  <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
  </svg>
);

const ExternalLinkIcon = () => (
  <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" xmlns="http://www.w3.org/2000/svg">
    <path d="M1 11L11 1M11 1H5M11 1v6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const FALLBACK_IMG = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect fill="%23151515" width="100" height="100"/><text x="50" y="55" text-anchor="middle" fill="%23909090" font-size="12">No Image</text></svg>';

// ── Helpers ─────────────────────────────────────────────────────────────────
/** Convert artist name to URL slug (matches GlobalSearchBar.toArtistSlug) */
function toArtistSlug(name: string): string {
  return (name || '')
    .replace(/[/\\#[\].*?]/g, '_')
    .trim()
    .replace(/[()]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .toLowerCase();
}

function buildFallbackAscii(name: string) {
  const clean = (name || "Artist").trim() || "Artist";
  const displayable = clean.length > 18 ? `${clean.slice(0, 15)}...` : clean;
  const padded = ` ${displayable} `;
  const border = "─".repeat(padded.length);
  return `┌${border}┐\n│${padded}│\n└${border}┘`;
}

const pickLargestVariantUrl = (variants: any): string => {
  if (!variants || typeof variants !== "object") return "";
  const pick = (record?: Record<string, string>) => {
    if (!record || typeof record !== "object") return "";
    const keys = Object.keys(record)
      .map((k) => Number(k))
      .filter((n) => Number.isFinite(n));
    if (keys.length === 0) return "";
    const max = Math.max(...keys);
    return String(record[String(max)] || "");
  };
  return pick(variants.jpg) || pick(variants.webp) || pick(variants.avif) || "";
};

const resolveArtworkImage = (art: any): string => {
  const direct = [
    art?.image,
    art?.imageUrl,
    art?.image_url,
    art?.thumbnail,
    art?.thumb,
    art?.originalImage,
    art?.lightboxImage,
    art?.src,
    art?.url,
  ].find((v) => typeof v === "string" && v.trim().length > 0) as string | undefined;
  return direct || pickLargestVariantUrl(art?.variants);
};

const normalizeKnownBrokenImageUrl = (value?: string): string => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (raw === 'default.jpg' || raw === '/default.jpg') return '';
  return normalizeImageUrl(raw);
};

const normalizeLookupText = (value?: string) =>
  String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

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

// ── Component ────────────────────────────────────────────────────────────────
export default function ArtistPage() {
  const { id } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const isDrawingSkinArtist = useMemo(() => {
    const p = new URLSearchParams(location.search);
    return p.get('mode') === 'drawing';
  }, [location.search]);

  const routeArtistName = useMemo(() => {
    const params = new URLSearchParams(location.search);
    const byQuery = params.get('name')?.trim();
    if (byQuery) return byQuery;
    if (!id) return '';
    return decodeURIComponent(id).replace(/[-_]+/g, ' ').trim();
  }, [id, location.search]);

  // Support both numeric id ("1") and slug/name route.
  const artist = useMemo(() => {
    const normalizedRoute = normalizeLookupText(routeArtistName);
    return artists.find((a) => (
      a.id === id ||
      toArtistSlug(a.name) === id ||
      (normalizedRoute && normalizeLookupText(a.name) === normalizedRoute)
    ));
  }, [id, routeArtistName]);

  const artistDisplayName = artist?.name || routeArtistName;
  const artistDescription = artist?.description || '';

  // Wiki
  const [wikiSummary, setWikiSummary] = useState<string>("");
  const [wikiSourceUrl, setWikiSourceUrl] = useState<string>("");
  const [wikiError, setWikiError] = useState<string>("");
  const [wikiLoading, setWikiLoading] = useState(false);
  const [asciiArt, setAsciiArt] = useState<string>("");

  // Gallery
  const [selectedArtwork, setSelectedArtwork] = useState<any>(null);
  const [likedArtworks, setLikedArtworks] = useState<any[]>([]);
  const [user, setUser] = useState<any>(null);
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    try { return localStorage.getItem('homeTheme') === 'light' ? 'light' : 'dark'; } catch { return 'dark'; }
  });
  const [visibleCount, setVisibleCount] = useState(120);
  const [brueckeR2Lookup, setBrueckeR2Lookup] = useState<Record<string, string>>({});
  const [indexArtistArtworks, setIndexArtistArtworks] = useState<Artwork[]>([]);
  const [indexLoading, setIndexLoading] = useState(false);

  const toggleTheme = useCallback(
    () => setTheme(t => (t === 'dark' ? 'light' : 'dark')),
    []
  );

  // ── Auth & Likes ──────────────────────────────────────────────────────────
  useEffect(() => {
    const applyNetworkConstraint = shouldLimitNetwork();
    let unsubLikes: (() => void) | null = null;
    const unsubAuth = onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (unsubLikes) { unsubLikes(); unsubLikes = null; }
      if (u) {
        if (applyNetworkConstraint) {
          getDocs(collection(db, `users/${u.uid}/liked_artworks`)).then((snap) => {
            setLikedArtworks(snap.docs.map(d => ({ ...d.data(), id: d.id })));
          }).catch(() => setLikedArtworks([]));
          return;
        }
        const unsub = onSnapshot(collection(db, `users/${u.uid}/liked_artworks`), (snap) => {
          setLikedArtworks(snap.docs.map(d => ({ ...d.data(), id: d.id })));
        });
        unsubLikes = () => unsub();
      } else {
        setLikedArtworks([]);
      }
    });
    return () => {
      if (unsubLikes) unsubLikes();
      unsubAuth();
    };
  }, []);

  const fallbackArtistArtworks = useMemo<Artwork[]>(() => {
    if (!artistDisplayName) return [];
    const normalizedTarget = normalizeLookupText(artistDisplayName);
    return artworks
      .filter((aw: any) => normalizeLookupText(aw.artist || "") === normalizedTarget)
      .map((aw: any) => ({
        ...aw,
        image: resolveArtworkImage(aw),
        museumName: aw.museumName || aw.museum || aw.source || "",
      })) as Artwork[];
  }, [artistDisplayName]);

  useEffect(() => {
    if (!artistDisplayName) {
      setIndexArtistArtworks([]);
      setIndexLoading(false);
      return;
    }

    let cancelled = false;
    let loadComplete = false;
    const requestedArtist = artistDisplayName;
    const worker = new Worker(new URL('../workers/search.worker.ts', import.meta.url), { type: 'module' });

    const requestWorks = () => {
      worker.postMessage({ type: 'GET_ARTIST_WORKS', query: requestedArtist });
    };

    // If fallback dataset already has entries, render immediately and load index in background.
    setIndexLoading(fallbackArtistArtworks.length === 0);
    setIndexArtistArtworks([]);

    worker.onmessage = (event) => {
      const { type, artist: responseArtist, works } = event.data || {};

      if (type === 'LOAD_COMPLETE') {
        loadComplete = true;
        requestWorks();
        return;
      }

      if (type === 'ARTIST_WORKS') {
        if (cancelled) return;
        const responseName = String(responseArtist || '');
        if (normalizeLookupText(responseName) !== normalizeLookupText(requestedArtist)) return;

        const mappedWorks: Artwork[] = ((works || []) as WorkerArtwork[])
          .map((aw: WorkerArtwork) => ({
            ...aw,
            id: aw.id,
            name: aw.name || 'Untitled',
            artist: aw.artist || requestedArtist,
            image: normalizeKnownBrokenImageUrl(resolveArtworkImage(aw)),
            museumName: aw.museumName || '',
            exhibitionId: aw.exhibitionId || '',
            sourceUrl: aw.sourceUrl || '',
            category: aw.category || '',
            exhibitionTitle: aw.exhibitionTitle || '',
            year: extractYearToken(aw.date),
          }))
          .filter((aw) => !!aw.id && !!aw.name);

        if (!loadComplete && mappedWorks.length === 0) {
          return;
        }

        setIndexArtistArtworks(mappedWorks);
        setIndexLoading(false);
        return;
      }

      if (type === 'ERROR' && !cancelled) {
        setIndexLoading(false);
      }
    };

    worker.postMessage({ type: 'SET_MODE', mode: getWorkerNetworkMode() });
    worker.postMessage({ type: 'LOAD' });
    requestWorks();

    return () => {
      cancelled = true;
      worker.terminate();
    };
  }, [artistDisplayName, fallbackArtistArtworks.length]);

  // Prefer full search-index result; fallback to static snapshot when unavailable.
  const artistArtworks = useMemo<Artwork[]>(() => {
    if (indexArtistArtworks.length > 0) return indexArtistArtworks;
    return fallbackArtistArtworks;
  }, [fallbackArtistArtworks, indexArtistArtworks]);

  const fallbackAscii = useMemo(
    () => buildFallbackAscii(artistDisplayName || "Artist"),
    [artistDisplayName]
  );

  const visibleArtistArtworks = useMemo(() => {
    return artistArtworks.slice(0, visibleCount);
  }, [artistArtworks, visibleCount]);

  // ── Wikipedia summary ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!artistDisplayName) {
      setWikiSummary("");
      setWikiSourceUrl("");
      return;
    }
    const controller = new AbortController();
    const encodedName = encodeURIComponent(artistDisplayName);

    const fetchWikiSummary = async () => {
      setWikiLoading(true);
      setWikiError("");
      try {
        const res = await fetch(
          `https://en.wikipedia.org/api/rest_v1/page/summary/${encodedName}`,
          { signal: controller.signal }
        );
        if (!res.ok) throw new Error(`Wiki failed (${res.status})`);
        const data = await res.json();
        setWikiSummary(data.extract || artistDescription || "");
        setWikiSourceUrl(data.content_urls?.desktop?.page || "");
      } catch (err) {
        if (controller.signal.aborted) return;
        console.warn("Wiki summary error", err);
        setWikiError("위키 설명을 불러오지 못했습니다.");
        setWikiSummary(artistDescription || "");
        setWikiSourceUrl("");
      } finally {
        if (!controller.signal.aborted) setWikiLoading(false);
      }
    };

    fetchWikiSummary();
    return () => controller.abort();
  }, [artistDescription, artistDisplayName]);

  // ── ASCII art ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!artistDisplayName) {
      setAsciiArt("");
      return;
    }
    // Keep local fallback only; remote artii endpoint frequently fails CORS in browser.
    setAsciiArt(fallbackAscii);
  }, [artistDisplayName, fallbackAscii]);

  useEffect(() => {
    setVisibleCount(120);
  }, [artistDisplayName]);

  useEffect(() => {
    const shouldLoadLookup = artistArtworks.some((aw: any) => {
      const museum = String(aw.museumName || aw.museum || '').toLowerCase();
      const image = String(aw.image || '').toLowerCase();
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
  }, [artistArtworks]);

  const resolveArtworkImageForCard = useCallback((art: any) => {
    const normalized = normalizeKnownBrokenImageUrl(resolveArtworkImage(art));
    const museum = String(art?.museumName || art?.museum || '').toLowerCase();
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

  // ── Like toggle ───────────────────────────────────────────────────────────
  const handleToggleLike = async (_e: React.MouseEvent, art: any) => {
    if (!user) return;
    const artId = art.artworkId || art.id;
    const isLiked = likedArtworks.some(a => (a.artworkId || a.id) === artId);
    const ref = doc(db, `users/${user.uid}/liked_artworks/${artId}`);
    if (isLiked) {
      await deleteDoc(ref);
    } else {
      const normalizedArt = {
        ...art,
        id: artId,
        image: art.image || art.i || '',
        title: art.title || art.n || art.name || 'Untitled',
        artist: art.artist || art.a || artistDisplayName || 'Unknown',
        museumName: art.museumName || art.m || '',
        url: art.url || art.u || '',
        exhibitionId: art.exhibitionId || art.e || '',
      };
      await setDoc(ref, {
        ...normalizedArt,
        likedAt: serverTimestamp(),
      });
    }
  };

  // ── Exhibition resolution ─────────────────────────────────────────────────
  const getExhibitionId = (art: any) => {
    if (art.exhibitionId) return art.exhibitionId;
    const match = findMuseumForArtwork(art, exhibitions);
    if (match) {
      if (match.permanentExhibitions?.length > 0) return match.permanentExhibitions[0].id;
      return match.id + '-collection';
    }
    const artId = art.artworkId || art.id || '';
    if (artId.startsWith('tate-')) return 'tm-perm-1';
    if (artId.startsWith('met-')) return 'met-permanent-1';
    if (artId.startsWith('moma-')) return 'moma-collection';
    return null;
  };

  const handleViewInMuseum = (art: any) => {
    let exhId = getExhibitionId(art);
    if (!exhId) {
      const match = findMuseumForArtwork(art, exhibitions);
      if (match) exhId = match.permanentExhibitions?.[0]?.id || (match.id + '-collection');
    }
    if (exhId) {
      sessionStorage.setItem('pendingMuseumSearchQuery', JSON.stringify({
        artworkTitle: art.title || art.name,
        artworkId: art.artworkId || art.id,
      }));
      setSelectedArtwork(null);
      navigate(`/collection/${exhId}`);
    } else {
      const match = findMuseumForArtwork(art, exhibitions);
      if (match?.permanentExhibitions?.length > 0) {
        setSelectedArtwork(null);
        navigate(`/collection/${match.permanentExhibitions[0].id}`);
      } else if (art.museumName) {
        alert(`${art.museumName} 페이지를 찾을 수 없습니다.`);
      }
    }
  };

  // ── Intersection Observer for card entrance ───────────────────────────────
  const gridRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    const cards = Array.from(grid.querySelectorAll('.artist-gallery__card'));
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            (entry.target as HTMLElement).classList.add('is-visible');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.08, rootMargin: '0px 0px -40px 0px' }
    );
    cards.forEach((card, i) => {
      (card as HTMLElement).style.transitionDelay = `${i * 40}ms`;
      observer.observe(card);
    });
    return () => observer.disconnect();
  }, [visibleArtistArtworks]);

  // ── Not found ─────────────────────────────────────────────────────────────
  if (!artistDisplayName) {
    return <div className="artist-page__not-found">Artist not found.</div>;
  }

  const isLiked = (art: any) =>
    likedArtworks.some(a => (a.artworkId || a.id) === (art.artworkId || art.id));

  // ── Render ─────────────────────────────────────────────────────────────────
  const isDark = isDrawingSkinArtist ? false : theme === 'dark';

  return (
    <div className={`artist-page${isDrawingSkinArtist ? ' artist-page--drawing' : ''}`} data-theme={isDrawingSkinArtist ? 'light' : theme}>

      {/* ── HERO ──────────────────────────────────────────────────────── */}
      <header className="artist-hero">
        <div className="artist-hero__eyebrow">
          <span className="artist-hero__tag">Artist</span>
          <span className="artist-hero__meta">
            {artist?.nationality || ''}
            {artist?.birthYear ? ` · b. ${artist.birthYear}` : ''}
          </span>
          {!isDrawingSkinArtist && (
            <div className="artist-hero__controls">
              <button
                className="artist-hero__theme-btn"
                onClick={toggleTheme}
                aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
                title={isDark ? 'Light mode' : 'Dark mode'}
              >
                {isDark ? '☀' : '☾'}
              </button>
            </div>
          )}
        </div>

        <h1 className="artist-hero__name">{artistDisplayName}</h1>

        <div className="artist-hero__footer">
          <span className="artist-hero__count">
            <strong>{artistArtworks.length.toLocaleString()}</strong> works in collection
          </span>
          {wikiSourceUrl && (
            <a
              href={wikiSourceUrl}
              className="artist-hero__wiki-link"
              target="_blank"
              rel="noreferrer"
            >
              Wikipedia
              <ExternalLinkIcon />
            </a>
          )}
        </div>
      </header>

      {/* ── BIO + MAP ─────────────────────────────────────────────────── */}
      <section className="artist-profile">

        {/* Bio */}
        <div className="artist-bio">
          <p className="artist-bio__label">Infinite Wiki</p>
          {wikiLoading && !wikiSummary ? (
            <p className="artist-bio__loading">Loading biography…</p>
          ) : (
            <p className="artist-bio__text">
              {wikiSummary || artistDescription}
            </p>
          )}
          {wikiError && <p className="artist-bio__error">{wikiError}</p>}

          {(asciiArt || fallbackAscii) && (
            <pre
              className="artist-bio__ascii"
              aria-label={`${artistDisplayName} ascii art`}
            >
              {asciiArt || fallbackAscii}
            </pre>
          )}
        </div>

        {/* Map */}
        <div className="artist-map-col">
          <p className="artist-map-col__label">Global Distribution</p>
          <ArtistDistributionMap artworks={artistArtworks} isDark={isDark} />
        </div>

      </section>

      {/* ── GALLERY ───────────────────────────────────────────────────── */}
      <section className="artist-gallery">
        <div className="artist-gallery__header">
          <span className="artist-gallery__header-count">
            {artistArtworks.length.toLocaleString()}
          </span>
          <span className="artist-gallery__header-label">
            {artistArtworks.length === 1 ? 'work' : 'works'}
          </span>
          <div className="artist-gallery__divider" />
        </div>

        <div className="artist-gallery__grid" ref={gridRef}>
          {artistArtworks.length === 0 ? (
            <div className="artist-gallery__empty">
              <div className="artist-gallery__empty-icon">◻</div>
              <p>{indexLoading ? '작품을 불러오는 중입니다…' : '아직 등록된 작품이 없습니다.'}</p>
            </div>
          ) : (
            visibleArtistArtworks.map((artwork, idx) => (
              <article
                  key={`${artwork.id || artwork.name || (artwork as any).museumName || 'art'}-${idx}`}
                className="artist-gallery__card"
                onClick={() => setSelectedArtwork(artwork)}
                draggable
                title="Drag to share in Community"
                onDragStart={(e) => {
                  const data = {
                    id: artwork.id,
                    image: artwork.image,
                    name: artwork.name,
                    artist: artwork.artist,
                    year: artwork.year,
                    museum: (artwork as any).museum || (artwork as any).museumName || '',
                    exhibition: (artwork as any).exhibitionTitle || '',
                    source: 'drag-drop-artist-page',
                  };
                  e.dataTransfer.setData('application/json', JSON.stringify(data));
                  e.dataTransfer.effectAllowed = 'copy';
                  const imgEl = e.currentTarget.querySelector('img');
                  if (imgEl) {
                    const rect = imgEl.getBoundingClientRect();
                    e.dataTransfer.setDragImage(imgEl, rect.width / 2, rect.height / 2);
                  }
                }}
              >
                <div className="artist-gallery__img-wrap">
                  <img
                    src={resolveArtworkImageForCard(artwork)}
                    alt={`${artwork.name} by ${artwork.artist || artistDisplayName}`}
                    loading="lazy"
                    draggable={false}
                    onLoad={(e) => {
                      e.currentTarget.classList.add('is-loaded');
                    }}
                    onError={(e) => {
                      const target = e.currentTarget;
                      if (target.src !== FALLBACK_IMG) {
                        target.onerror = null;
                        target.src = FALLBACK_IMG;
                      }
                      target.classList.add('is-loaded');
                    }}
                  />
                </div>

                {/* Like button */}
                <button
                  className={`artist-gallery__like${isLiked(artwork) ? ' artist-gallery__like--active' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleToggleLike(e, artwork);
                  }}
                  aria-label={isLiked(artwork) ? 'Unlike' : 'Like'}
                >
                  <HeartIcon />
                </button>

                {/* Info */}
                <div className="artist-gallery__info">
                  <h3 className="artist-gallery__title">{artwork.name}</h3>
                  <p className="artist-gallery__subtitle">
                    {[artwork.year, artwork.exhibitionTitle]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </div>
              </article>
            ))
          )}
        </div>
        {visibleArtistArtworks.length < artistArtworks.length && (
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: 20 }}>
            <button
              onClick={() => setVisibleCount((prev) => Math.min(artistArtworks.length, prev + 120))}
              style={{
                border: '1px solid rgba(255,255,255,0.24)',
                background: 'transparent',
                color: 'inherit',
                borderRadius: 999,
                padding: '8px 14px',
                cursor: 'pointer',
              }}
            >
              Load More ({visibleArtistArtworks.length.toLocaleString()} / {artistArtworks.length.toLocaleString()})
            </button>
          </div>
        )}
      </section>

      {/* ── LIGHTBOX ──────────────────────────────────────────────────── */}
      {selectedArtwork && (
        <ArtworkLightbox
          artwork={selectedArtwork}
          onClose={() => setSelectedArtwork(null)}
          isLiked={isLiked(selectedArtwork)}
          onToggleLike={handleToggleLike}
          onViewInMuseum={handleViewInMuseum}
          likedArtworksList={likedArtworks}
          onChangeArtwork={setSelectedArtwork}
        />
      )}
    </div>
  );
}
