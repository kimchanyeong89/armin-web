import type { ExhibitionItem } from "../types/Exhibition";
import type { Artwork } from "../types/Artwork";
import { useNavigate } from 'react-router-dom';
import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { collection, query, where, onSnapshot, getDocs, deleteDoc, doc, setDoc, serverTimestamp, addDoc } from "firebase/firestore";
import { onAuthStateChanged, GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { db, auth } from "../firebase";
import { buildSourceSet, useProxy } from "../utils/imageProxy";
import { usePrefetchNeighbors } from "../hooks/usePrefetchNeighbors";
import { LoginButton } from "./LoginButton";
import { HeartOverlay } from "./HeartOverlay";
import { SubmissionForm } from "./SubmissionForm";

const RE_BC_CHECK = /\bBC\b|B\.C\.|BCE/i;
const RE_CENTURY = /(\d{1,2})(?:st|nd|rd|th)?\s*(?:century|c\b)/i;
const RE_YEAR_4 = /\b(\d{4})\b/g;
const RE_YEAR_3 = /\b(\d{3})\b/;

const CATEGORY_MAP: Record<string, string> = {
    "drawing": "Drawing",
    "drawings": "Drawing",
    "draw": "Drawing",
    "dibujo": "Drawing",
    "dibujos": "Drawing",
    "disegno": "Drawing",
    "engravings (prints)": "Graphic artwork",
    "engravings": "Graphic artwork",
    "engraving": "Graphic artwork",
    "prints": "Graphic artwork",
    "print": "Graphic artwork",
    "graphic artwork": "Graphic artwork",
    "graphic artworks": "Graphic artwork",
    "lithographs": "Graphic artwork",
    "lithograph": "Graphic artwork",
    "oil painting": "Painting",
    "paintings": "Painting",
    "painting": "Painting",
    "pintura": "Painting",
    "pinturas": "Painting",
    "pottery (visual works)": "Ceramics",
    "pottery": "Ceramics",
    "ceramic": "Ceramics",
    "ceramics": "Ceramics",
    "sculpture (visual work)": "Sculpture",
    "sculptures": "Sculpture",
    "sculpture": "Sculpture",
    "escultura": "Sculpture",
    "esculturas": "Sculpture",
    "sketchbooks": "Sketchbooks",
    "sketchbook": "Sketchbooks",
    "photography": "Photography",
    "photograph": "Photography",
    "photos": "Photography",
    "posters": "Posters",
    "poster": "Posters",
};
const CATEGORY_ENTRIES = Object.entries(CATEGORY_MAP);

const sortNumericKeys = (map?: Record<string, string>) => {
  if (!map) return [] as number[];
  return Object.keys(map)
    .map((k) => Number(k))
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b);
};

// Ensure HTTPS for image URLs (iOS Safari blocks mixed content)
const ensureHttps = (url: string | undefined | null): string => {
  if (!url) return '';
  if (url.startsWith('http://')) {
    return url.replace('http://', 'https://');
  }
  return url;
};

// Strip parenthesized years from artist names, e.g. "Greuze Jean-Baptiste (1725-1805)" -> "Greuze Jean-Baptiste"
// Also filters out copyright info that shouldn't be artist names
const cleanArtistName = (artist: string | undefined | null): string => {
  if (!artist) return '';

  // If the value is pure copyright info, return empty to show "Unknown"
  const lower = artist.toLowerCase();
  if (
    artist.includes('©') ||
    lower.includes('all rights reserved') ||
    lower.includes('adagp') ||
    lower.includes('sabam') ||
    lower.includes('vegap') ||
    lower.includes('dacs') ||
    lower.includes('siae') ||
    lower.includes('vg bild-kunst') ||
    lower === 'droits réservés' ||
    lower === 'tous droits réservés' ||
    lower === 'copyright'
  ) {
    return '';
  }

  // Remove patterns like (1725-1805), (1604-1692, 1603-1677), (born 1960), (1823-...), etc.
  return artist.replace(/\s*\([^)]*\d{4}[^)]*\)\s*/g, '').trim();
};

// Clean up date/year text by removing garbage data after century info
// Examples: "15th century, 199398" → "15th century"
//           "16th century, modern age, 199633" → "16th century, modern age"
//           "1765" → "1765"
//           -664 → "664 BC" (negative years = BC)
const cleanDateText = (dateStr: string | number | undefined | null): string => {
  if (dateStr === undefined || dateStr === null) return '';

  // Handle negative years (BC years stored as negative numbers)
  if (typeof dateStr === 'number') {
    if (dateStr < 0) {
      return `${Math.abs(dateStr)} BC`;
    }
    return String(dateStr);
  }

  // Ensure it's a string
  const str = String(dateStr);

  // Check if it's a negative number string
  if (/^-\d+$/.test(str.trim())) {
    return `${str.trim().slice(1)} BC`;
  }

  // If it's a simple 4-digit year, return as is
  if (/^\d{4}$/.test(str.trim())) {
    return str.trim();
  }

  // Remove trailing garbage numbers (6+ digits that look like IDs)
  let cleaned = str.replace(/,?\s*\d{6,}$/g, '').trim();

  // Remove trailing comma if any
  cleaned = cleaned.replace(/,\s*$/, '').trim();

  return cleaned || str;
};

// Normalize category names: unify similar categories (case-insensitive, handle variants)
const normalizeCategory = (cat: string | undefined | null): string => {
  if (!cat) return '';
  const lower = cat.toLowerCase().trim();

  // Check direct mapping first
  if (CATEGORY_MAP[lower]) {
    return CATEGORY_MAP[lower];
  }

  // Check partial matches
  for (const [key, value] of CATEGORY_ENTRIES) {
    if (lower.includes(key) || key.includes(lower)) {
      return value;
    }
  }

  // If no mapping found, return title-cased version (capitalize first letter of each word)
  return cat.split(/\s+/).map(word =>
    word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
  ).join(' ');
};

const pickLowPlaceholder = (artwork: Artwork) => {
  if (artwork.lq) return artwork.lq;
  if (artwork.thumb) return artwork.thumb;
  const jpgKeys = sortNumericKeys(artwork.variants?.jpg);
  if (jpgKeys.length) {
    const url = artwork.variants?.jpg?.[String(jpgKeys[0])];
    if (url) return url;
  }
  const webpKeys = sortNumericKeys(artwork.variants?.webp);
  if (webpKeys.length) {
    const url = artwork.variants?.webp?.[String(webpKeys[0])];
    if (url) return url;
  }
  // Avoid demo placeholder or suspicious '1' filenames
  const img = artwork.image || '';
  if (/exhibition1\.png$/i.test(img) || /\/(?:1|1\.jpg|1\.png)$/i.test(img) || img === '1' || img === '1.jpg' || img === '1.png') {
    return FALLBACK_ARTWORK_IMAGE;
  }
  return img;
};

const buildVariantSourceSet = (
  artwork: Artwork,
  format: keyof NonNullable<Artwork["variants"]>,
  widths: number[],
  fallbackQuality: number
) => {
  const map = artwork.variants?.[format];
  if (map) {
    const rows = widths.filter((w) => map[String(w)]).map((w) => `${map[String(w)]} ${w}w`);
    if (rows.length) return rows.join(", ");
  }
  if (!useProxy) return null;
  if (format === "avif" || format === "webp") {
    return buildSourceSet(artwork.image, widths, format, fallbackQuality);
  }
  return null;
};

// Use a transparent 1x1 PNG as the fallback so no visible '1' placeholder appears
const FALLBACK_ARTWORK_IMAGE = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMB/6XjVvcAAAAASUVORK5CYII=";

// R2 이미지 URL 확인 및 축소 버전 생성 헬퍼
const R2_DOMAIN = 'pub-396fad1f96754c2f816f260faf970e63.r2.dev';
const isR2Image = (url: string): boolean => url?.includes(R2_DOMAIN);

// Extract YouTube video ID from various URL formats
const extractYouTubeId = (text: string): string | null => {
  if (!text) return null;
  // Match various YouTube URL formats
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/)([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[1];
  }
  return null;
};

// Remove YouTube URLs from text for cleaner display
const removeYouTubeUrls = (text: string): string => {
  if (!text) return '';
  return text
    .replace(/(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/|youtube\.com\/shorts\/)[a-zA-Z0-9_-]{11}[^\s]*/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
};

// Helper to classify artwork into 2D or 3D based on metadata
// Supports: English, German, Italian, French, Spanish, Korean
const normalizeForMatch = (v: unknown): string => String(v ?? '').toLowerCase().trim();

const hasAnyMeaningfulTypeText = (a: any): boolean => {
  const t = normalizeForMatch(a?.type);
  const category = normalizeForMatch(a?.category);
  const artworkType = normalizeForMatch(a?.artworkType);
  const objectType = normalizeForMatch(a?.objectType);
  const classification = normalizeForMatch(a?.classification);
  const medium = normalizeForMatch(a?.medium);
  const technique = normalizeForMatch(a?.technique);
  const materials = normalizeForMatch(a?.materials);

  // Treat explicit 'unknown' as not meaningful
  const hasExplicitKnownType = t === '2d' || t === '3d';

  return Boolean(
    hasExplicitKnownType ||
    category || artworkType || objectType || classification ||
    medium || technique || materials
  );
};

// N should only represent truly uncollected/empty classification info (not “regex didn’t match”).
const isUncollectedArtwork = (a: any): boolean => {
  if (!a) return true;

  const t = normalizeForMatch(a.type);
  if (t === '2d' || t === '3d') return false;

  const category = normalizeForMatch(a.category);
  const artworkType = normalizeForMatch(a.artworkType);
  const objectType = normalizeForMatch(a.objectType);
  const classification = normalizeForMatch(a.classification);
  const medium = normalizeForMatch(a.medium);
  const technique = normalizeForMatch(a.technique);
  const materials = normalizeForMatch(a.materials);

  // If *any* of these exist, it’s not “uncollected”.
  return !(category || artworkType || objectType || classification || medium || technique || materials);
};

function inferArtworkType(a: any): '2D' | '3D' | null {
  if (a.type === '2D' || a.type === '3D') return a.type;

  // Treat only truly-empty cases as N (null). “Pattern didn’t match” should not become N.
  if (a.type === 'unknown' && !hasAnyMeaningfulTypeText(a)) return null;
  if (isUncollectedArtwork(a)) return null;

  const categoryText = [
    a.type,
    a.category,
    a.artworkType,
    a.objectType,
    a.classification,
  ].filter(Boolean).map(normalizeForMatch).join(' ');

  const mediumTechText = [
    a.medium,
    a.technique,
    a.materials,
  ].filter(Boolean).map(normalizeForMatch).join(' ');

  const anyText = `${categoryText} ${mediumTechText}`.trim();
  if (!anyText) return null;

  // Strong signals for physical objects (prefer 3D when explicit object forms appear)
  const has3DObjectCue = /\b(sculpture|sculptural|statue|statuette|bust|relief|object|vessel|coin|medal|weapon|armor|armour|mask|doll|furniture|jewelry|jewellery|installation|architecture|skulptur|plastik|statuette|b\.?ste|b\.?ste|relief|objekt|kunsthandwerk|skulptural|escultura|estatua|busto|relieve|objeto|scultura|busto|rilievo|objet)\b/i.test(categoryText);

  // Strong signals for flat works by category/genre
  const has2DCategoryCue = /\b(painting|drawing|print|prints|calligraphy|photography|graphic|collage|poster|sketch|watercolor|watercolour|lithograph|etching|engraving|woodcut|screen ?print|silkscreen|video|film|new media|multimedia|moving image|dipinto|disegno|incisione|stampa|fotografia|acquarello|litografia|xilografia|acquerello|pittura|peinture|dessin|estampe|gravure|photographie|aquarelle|lithographie|pintura|dibujo|grabado|fotograf[ií]a|acuarela|회화|사진|서예|드로잉|판화|평면|zeichnung|druck|radierung|holzschnitt|lithografie|gem[äa]lde)\b/i.test(categoryText);

  // Technique-first for 2D: if we see 2D techniques, treat as 2D even if materials like wood/textile appear.
  const has2DTechniqueCue = /\b(oil|óleo|olio|\b[öo]l\b|acrylic|acrilic|acrílico|acrilico|acryl|tempera|gouache|watercolor|watercolour|acuarela|acquarello|aquarell|ink|tinta|inchiostro|tusche|pencil|matita|l[áa]piz|bleistift|charcoal|carbone|carboncillo|kohle|pastel|kreide|crayon|radierung|lithograph|litograf|litografia|etching|aguafuerte|acquaforte|engraving|incisione|woodcut|xilograf|xilografia|monotype|serigraf|serigrafia|silkscreen|screen\s?print|feder|zeichnung)\b/i.test(mediumTechText);

  // Weaker 3D material cues (only used if no 2D technique/category cue exists)
  const has3DMaterialCue = /\b(ceramic|ceramics|cer[áa]mica|keramik|fayence|faience|pottery|terracotta|porcelain|porzellan|clay|argilla|barro|marble|marmo|m[áa]rmol|marmor|stone|pietra|piedra|kalkstein|sandstein|bronze|bronzo|bronce|wood|holz|legno|madera|textile|fabric|tapestry|wirkerei|seide|wolle|leinen)\b/i.test(mediumTechText);

  // Precedence: explicit 3D object -> 2D category -> 2D technique -> 3D material.
  if (has3DObjectCue) return '3D';
  if (has2DCategoryCue) return '2D';
  if (has2DTechniqueCue) return '2D';
  if (has3DMaterialCue) return '3D';

  // Fallback heuristics (avoid returning null for “unmatched” cases)
  const has2DSupportCue = /\b(canvas|paper|karton|cardboard|panel|parchment|papel|papier|carta|cartone|leinwand|toile|tela)\b/i.test(mediumTechText);
  if (has2DSupportCue) return '2D';

  const hasGenericObjectWord = /\b(object|objet|objekt|artefact|artifact)\b/i.test(categoryText);
  if (hasGenericObjectWord) return '3D';

  // Default: prefer 2D for “unknown-but-described” strings (keeps N reserved for truly uncollected items)
  return '2D';
}

type TechniqueFacetParent = '2D' | '3D';
type TechniqueFacet = { id: string; label: string; parent: TechniqueFacetParent; re: RegExp };

// 기법(Technique) 기반 하위 분류 - 모든 미술관에 적용
// "Oil on canvas"에서 중요한 건 oil(기법), canvas(지지체)는 분류에 영향 없음
const TECHNIQUE_FACETS: TechniqueFacet[] = [
  // 2D 기법 (Technique-based, not support-based) - EN/DE/IT/ES/FR
  { id: 'Oil', label: 'OIL', parent: '2D', re: /oil|óleo|olio|öl\b/i },
  { id: 'Acrylic', label: 'ACRYLIC', parent: '2D', re: /acrylic|acrílico|acrilico|acryl/i },
  { id: 'Print', label: 'PRINT', parent: '2D', re: /print|estampa|stampa|lithograph|litograf|etching|aguafuerte|acquaforte|engraving|grabado|incisione|woodcut|xilograf|xilografia|screen\s?print|serigraf|serigrafia|silkscreen|monotype|radierung|holzschnitt|druck/i },
  { id: 'Photo', label: 'PHOTO', parent: '2D', re: /photograph|foto|gelatin|silver|chromogenic|c-?print|daguerreotype/i },
  { id: 'Drawing', label: 'DRAW', parent: '2D', re: /ink|tinta|inchiostro|pencil|l[áa]piz|matita|charcoal|carboncillo|carbone|pastel|crayon|drawing|dibujo|disegno|tusche|feder|kohle|bleistift|kreide|zeichnung/i },
  { id: 'Collage', label: 'COLLAGE', parent: '2D', re: /collage|mixed media|técnica mixta|tecnica mista|papiers collés/i },
  { id: 'Tempera', label: 'TEMPERA', parent: '2D', re: /tempera|gouache|watercolor|acuarela|acquarello|aquarell|kleisterfarbe/i },
  { id: 'Fresco', label: 'FRESCO', parent: '2D', re: /fresco|affresco/i },

  // 3D 재료/기법 (Material/Technique-based for sculpture) - EN/DE/IT/ES/FR
  { id: 'Marble', label: 'MARBLE', parent: '3D', re: /marble|marmo|marmi|m[áa]rmol|marmor/i },
  { id: 'Stone', label: 'STONE', parent: '3D', re: /stone|pietra|piedra|calcare|calcarea|granito|granite|alabast|serpentin|kalkstein|sandstein|feuerstein|granodiorit|grauwacke|rosengranit|kalzit|travertin|quarzit|steatit/i },
  { id: 'Bronze', label: 'BRONZE', parent: '3D', re: /bronze|bronzo|bronce/i },
  { id: 'Ceramic', label: 'CERAMIC', parent: '3D', re: /ceramic|cer[áa]mica|keramik|fayence|faience|pottery|terracotta|porcelain|porzellan|stoneware|earthenware|majolica|maiolica|\bclay\b|\bargilla\b|\bbarro\b/i },
  { id: 'Wood3D', label: 'WOOD', parent: '3D', re: /\blegno\b|\bwood\b|\bmadera\b|\bholz\b|intaglio|intagliato|carving|tallado/i },
  { id: 'Metal', label: 'METAL', parent: '3D', re: /\bmetal\b|kupfer|gold\b|silber|elfenbein|horn\b|bein\b/i },
  { id: 'Textile', label: 'TEXTILE', parent: '3D', re: /textile|wirkerei|seide|wolle|leinen|fabric|tapestry/i },
  { id: 'Sculpture', label: 'SCULPT', parent: '3D', re: /sculpture|scultura|escultura|cast|getto|fundición|molding|modeling|modelado|modellato|skulptur|plastik/i },
  { id: 'Assemblage', label: 'ASSEMB', parent: '3D', re: /assemblage|ensamblaje|construction|construcción|costruzione/i },
  { id: 'Installation', label: 'INSTALL', parent: '3D', re: /installation|instalación|instalaci|installazione/i },
];

const matchesTechniqueFacet = (text: string, facetId: string): boolean => {
  const facet = TECHNIQUE_FACETS.find((f) => f.id === facetId);
  if (!facet) return false;
  return facet.re.test(text || '');
};

// Layout constants (original)
const LAYOUT_LEFT_BASE = 420; // px, push the two-line layout block to the right
const LAYOUT_RIGHT_PAD = 0; // px, stick to the right edge
const META_SHIFT = 205; // px, horizontal shift to move metadata area right
const META_BASE_MARGIN = 8; // px, margin above metadata (raised closer to top)
const META_VERTICAL_PAD = 24; // px, extra vertical space to allow wrapping
const META_HOR_SCALE = 2 / 3; // shrink horizontal allocation to 2/3

// Room type for floor plan boxes
// Room/editor features removed for viewer design

// Optimized Gallery Item Component to prevent re-renders of the entire grid
const GalleryItem = React.memo(({
  artwork,
  index,
  isMobile,
  isVeryNarrow,
  hoveredIndex,
  setHoveredIndex,
  galleryVideoReadyIdx,
  galleryThumbnailHiddenIdx,
  likedArtworks,
  toggleLike,
  hoverZoom,
  setHoverZoom,
  closeHoverZoomFromOverlay,
  exhibitionId,
  applyFallbackImage,
  useProxyVal
}: {
  artwork: Artwork,
  index: number,
  isMobile: boolean,
  isVeryNarrow: boolean,
  hoveredIndex: number | null,
  setHoveredIndex: (idx: number | null) => void,
  galleryVideoReadyIdx: number | null,
  galleryThumbnailHiddenIdx: number | null,
  likedArtworks: Set<string>,
  toggleLike: (e: React.MouseEvent, artwork: Artwork) => void,
  hoverZoom: any,
  setHoverZoom: React.Dispatch<React.SetStateAction<any>>,
  closeHoverZoomFromOverlay: () => void,
  exhibitionId: string,
  applyFallbackImage: (target: HTMLImageElement | null) => void,
  useProxyVal: boolean
}) => {
  const isVideo = artwork.youtubeId || artwork.mediaType === 'video';
  const isCurrentlyHovered = hoveredIndex === index;
  const showIframe = isCurrentlyHovered && isVideo && galleryVideoReadyIdx === index;

  return (
    <div
      className="group"
      style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}
    >
      <div
        style={{ width: isMobile ? '100%' : '60%', background: 'transparent', borderRadius: 0, position: 'relative', aspectRatio: isVideo ? '16/9' : undefined, overflow: 'hidden' }}
        onMouseEnter={() => setHoveredIndex(index)}
        onMouseLeave={() => setHoveredIndex(null)}
      >
        {isVideo && artwork.youtubeId ? (
          <div style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden' }}>
            {showIframe && (
              <iframe
                src={`https://www.youtube.com/embed/${artwork.youtubeId}?autoplay=1&mute=1&controls=0&showinfo=0&loop=1&playlist=${artwork.youtubeId}&modestbranding=1&rel=0&iv_load_policy=3&disablekb=1&fs=0&playsinline=1&cc_load_policy=0`}
                title={artwork.name}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                style={{
                  position: 'absolute',
                  top: '-60px',
                  left: '-10%',
                  width: '120%',
                  height: 'calc(100% + 120px)',
                  border: 'none',
                  pointerEvents: 'none',
                  zIndex: 1
                }}
              />
            )}
            {showIframe ? (
              <img
                src={`https://img.youtube.com/vi/${artwork.youtubeId}/mqdefault.jpg`}
                alt={artwork.name}
                loading="lazy"
                referrerPolicy="no-referrer"
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  zIndex: 2,
                  opacity: galleryThumbnailHiddenIdx === index ? 0 : 1,
                  transition: 'opacity 0.5s ease-out',
                  pointerEvents: 'none'
                }}
                onError={(e) => { e.currentTarget.src = artwork.image; }}
              />
            ) : (
              <img
                src={`https://img.youtube.com/vi/${artwork.youtubeId}/mqdefault.jpg`}
                alt={artwork.name}
                loading="lazy"
                referrerPolicy="no-referrer"
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                onError={(e) => { e.currentTarget.src = artwork.image; }}
              />
            )}
          </div>
        ) : (
          artwork.image && (() => {
            const widths = isVeryNarrow ? [320, 480, 640] : [360, 540, 720, 900];
            const avif = buildVariantSourceSet(artwork, 'avif', widths, 65);
            const webp = buildVariantSourceSet(artwork, 'webp', widths, 70);
            const sizes = '(max-width: 640px) 90vw, (max-width: 1024px) 55vw, 40vw';
            const imageUrl = (artwork as any).originalImage || artwork.image;
            const preview = (artwork as any).originalImage || pickLowPlaceholder(artwork);
            const isR2 = isR2Image(artwork.image);
            const isFLV = exhibitionId === 'flv-collection';
            const isNG = exhibitionId === 'ng-1';
            const needsScale = isR2 && !isNG;
            const useVariants = useProxyVal && !((artwork as any).originalImage);
            return (
              <div style={{ position: 'relative', overflow: 'hidden' }}>
                <picture>
                  {useVariants && avif && <source type="image/avif" srcSet={avif || undefined} sizes={sizes} />}
                  {useVariants && webp && <source type="image/webp" srcSet={webp || undefined} sizes={sizes} />}
                  <img
                    src={preview}
                    data-full={imageUrl}
                    alt={artwork.name}
                    loading="lazy"
                    decoding="async"
                    fetchPriority="low"
                    referrerPolicy="no-referrer"
                    style={{
                      width: needsScale ? '117.65%' : '100%',
                      height: 'auto',
                      display: 'block',
                      cursor: hoverZoom ? 'zoom-out' : 'zoom-in',
                      transform: needsScale ? 'scale(0.85)' : 'none',
                      transformOrigin: 'top left'
                    }}
                    onClick={() => {
                      if (hoverZoom) {
                        closeHoverZoomFromOverlay();
                      } else {
                        setHoverZoom({ artwork: artwork, imageUrl: artwork.image, animate: false });
                        requestAnimationFrame(() => {
                          requestAnimationFrame(() => {
                            setHoverZoom((s: any) => (s ? { ...s, animate: true } : s));
                          });
                        });
                      }
                    }}
                    onError={(e) => applyFallbackImage(e.currentTarget)}
                  />
                </picture>
                {isFLV && (
                  <div style={{
                    position: 'absolute',
                    bottom: 0,
                    left: 0,
                    right: 0,
                    height: '15%',
                    background: 'linear-gradient(to top, #fff 0%, #fff 60%, transparent 100%)',
                    pointerEvents: 'none'
                  }} />
                )}
              </div>
            );
          })()
        )}
      </div>
      <div style={{ marginTop: 10, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: isMobile ? 10 : 12, fontWeight: 400, color: '#222', display: 'flex', alignItems: 'center', gap: 6 }}>
            {String(index + 1).padStart(2, '0')}
            {isVideo && (
              <span style={{ fontSize: 10, color: '#e11d48' }}>▶</span>
            )}
            <div style={{ opacity: isMobile ? 1 : 0 }} className="gallery-heart-trigger">
              <HeartOverlay
                isLiked={likedArtworks.has(artwork.id)}
                onToggle={(e) => toggleLike(e, artwork)}
                style={{ padding: 0, background: 'none' }}
                size={isMobile ? 12 : 14}
                color="#e11d48"
                emptyColor="#888"
              />
            </div>
          </div>
          <div style={{ fontSize: isMobile ? 10 : 12, fontWeight: 700, color: '#222', marginTop: 2 }}>{artwork.name}{artwork.year ? ` (${cleanDateText(artwork.year)})` : (artwork.date && /^\d+c/.test(artwork.date) ? ` (${artwork.date})` : '')}</div>
          <div style={{ fontSize: isMobile ? 9 : 11, color: '#777', marginTop: 2 }}>{cleanArtistName(artwork.artist)}</div>
        </div>
      </div>
      <style>{`
      .group:hover .gallery-heart-trigger { opacity: 1 !important; }
    `}</style>
    </div>
  );
});

interface ExhibitionModalProps {
  exhibition: ExhibitionItem;
  onClose: () => void;
  initialSelectedIndex?: number;
}



// Room metadata for display exhibitions
interface RoomMeta {
  id: string;
  name: string;
  coverImage?: string;
  description?: string;
  location?: string;
  url?: string;
  hasArtworks: boolean;
}

const ExhibitionModal: React.FC<ExhibitionModalProps> = ({ exhibition, onClose, initialSelectedIndex = 0 }) => {
  const navigate = useNavigate();
  const [artworks, setArtworks] = useState<Artwork[]>([]);
  const [initialized, setInitialized] = useState<boolean>(false);
  // National Museum of Korea pagination state
  const [nmkTotalCount, setNmkTotalCount] = useState<number>(0);
  const [nmkCurrentChunk, setNmkCurrentChunk] = useState<number>(1);
  const [nmkTotalChunks, setNmkTotalChunks] = useState<number>(0);
  const [nmkLoading, setNmkLoading] = useState<boolean>(false);
  const [selectedIndex, setSelectedIndex] = useState<number>(initialSelectedIndex);
  const [selectedRoomId, setSelectedRoomId] = useState<string>('ALL');
  const [roomMetas, setRoomMetas] = useState<RoomMeta[]>([]);
  const [selectedYearRange, setSelectedYearRange] = useState<string>('ALL');
  // dateLevel state removed - simplified to toggle interactions

  const [selectedCentury, setSelectedCentury] = useState<string | null>(null); // '~17' -> ≤1699, '18' -> 1700s, '19' -> 1800s, etc.
  const [viewMode, setViewMode] = useState<'archive' | 'gallery' | 'panorama'>('gallery');
  // Virtualization state for archive mode
  const [archiveScrollTop, setArchiveScrollTop] = useState(0);
  const [archiveContainerHeight, setArchiveContainerHeight] = useState(600);
  // Liked artworks feature
  const [likedArtworks, setLikedArtworks] = useState<Set<string>>(new Set());
  const [currentUser, setCurrentUser] = useState<any>(null);
  // Submission form for temporary exhibitions
  const [showSubmissionForm, setShowSubmissionForm] = useState(false);
  // Exhibition description expanded state
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);
  // Enriched exhibition data (with descriptionHtml from JSON)
  const [_enrichedExhibition, setEnrichedExhibition] = useState<any>(null);
  // Hayward Gallery: toggle to show artworks only (hide archival documents)
  const [showArtworksOnly, setShowArtworksOnly] = useState(false);
  // Guggenheim Bilbao: toggle to show only "On view" artworks
  const [showOnViewOnly, setShowOnViewOnly] = useState(false);
  // Rijksmuseum: toggle to show only "On display" artworks
  const [showOnDisplayOnly, setShowOnDisplayOnly] = useState(false);
  // Picasso Barcelona: toggle to show only "Highlight" artworks
  const [showHighlightOnly, setShowHighlightOnly] = useState(false);
  // 2D/3D/N artwork type filter (N = no medium info)
  const [selectedTypes, setSelectedTypes] = useState<Set<'2D' | '3D' | 'N'>>(new Set());
  // Reina Sofía: 2D/3D sub-facet filter (Canvas/Paper/Photo/etc.)
  const [selectedMediumFacets, setSelectedMediumFacets] = useState<Set<string>>(new Set());
  // Search query for filtering artworks
  const [searchQuery, setSearchQuery] = useState('');
  // Category filter - multi-select for cumulative filtering (Korean category to English label)
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set());
  // Gallery view pagination limit to prevent rendering performance issues (start with 50)
  const [galleryLimit, setGalleryLimit] = useState(50);
  // NMK: Track if we're showing filtered results from full data
  const [nmkFilteredResults, setNmkFilteredResults] = useState<Artwork[] | null>(null);

  // Dynamic header height measurement for lightbox positioning
  const headerRef = useRef<HTMLDivElement | null>(null);
  const [headerHeight, setHeaderHeight] = useState(0);


  // If parent type changes (or exhibition changes), reset sub-facets
  useEffect(() => {
    setSelectedMediumFacets(new Set());
  }, [exhibition.id, selectedTypes]);

  // Check for pending search query from GlobalSearchBar (e.g. "View in Museum" button)
  useEffect(() => {
    try {
      const stored = sessionStorage.getItem('pendingMuseumSearchQuery');
      if (stored) {
        const { artworkTitle } = JSON.parse(stored);
        if (artworkTitle) {
          setSearchQuery(artworkTitle);
          // Optional: Clear it so it doesn't persist forever, or keep it for refreshing?
          // Clearing it is safer to avoid sticking filters when navigating back manually.
          sessionStorage.removeItem('pendingMuseumSearchQuery');
        }
      }
    } catch (e) {
      console.error('Failed to parse pendingMuseumSearchQuery', e);
    }
  }, []);

  // Load search query from sessionStorage when exhibition changes (from "view in museum" navigation)
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem('pendingMuseumSearchQuery');
      if (saved) {
        const data = JSON.parse(saved);
        if (data.artworkTitle) {
          setSearchQuery(data.artworkTitle);
          // Clear after reading to prevent re-applying
          sessionStorage.removeItem('pendingMuseumSearchQuery');
        }
      }
    } catch (e) {
      console.error('Failed to load search query from sessionStorage', e);
    }
  }, [exhibition.id]);

  // Handle initialArtwork - scroll to and select the specific artwork when navigating from global search
  const initialArtworkRef = useRef<any>((exhibition as any).initialArtwork);
  const autoOpenLightboxArtworkRef = useRef<Artwork | null>(null);

  useEffect(() => {
    const initArt = initialArtworkRef.current;
    if (!initArt || !artworks.length) return;

    // Find the artwork in the current list by id or name
    // Check both a.name and a.title to handle different data formats
    const idx = artworks.findIndex((a: any) =>
      a.id === initArt.id ||
      ((a.name === initArt.name || a.title === initArt.name) && a.artist === initArt.artist)
    );

    if (idx >= 0) {
      setSelectedIndex(idx);
      // Store the artwork to auto-open lightbox after render
      autoOpenLightboxArtworkRef.current = artworks[idx];
      // Clear initialArtwork to prevent re-triggering
      initialArtworkRef.current = null;
    }
  }, [artworks]);

  // Auto-open lightbox for initialArtwork after artworks are loaded
  useEffect(() => {
    const artwork = autoOpenLightboxArtworkRef.current;
    if (!artwork) return;

    // Small delay to ensure DOM is ready
    const timer = setTimeout(() => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const maxW = vw * 0.9;
      const maxH = vh * 0.8;

      // Open lightbox centered with default dimensions
      setLightbox({
        artwork,
        start: { left: vw / 2 - 100, top: vh / 2 - 100, width: 200, height: 200 },
        target: { left: (vw - maxW) / 2, top: (vh - maxH) / 2, width: maxW, height: maxH },
        animate: true,
      });

      autoOpenLightboxArtworkRef.current = null;
    }, 500);

    return () => clearTimeout(timer);
  }, [artworks]);

  // Korean historical period info: { start, end, mid (for filtering) }
  const KOREAN_PERIOD_INFO: Record<string, { start: number; end: number; mid: number }> = {
    // Prehistoric Korea
    '구석기': { start: -700000, end: -8000, mid: -10000 },
    '신석기': { start: -8000, end: -1500, mid: -5000 },
    '청동기': { start: -1500, end: -300, mid: -1000 },
    '초기철기': { start: -300, end: 0, mid: -150 },
    // Proto-Three Kingdoms & Three Kingdoms
    '원삼국': { start: 0, end: 300, mid: 150 },
    '삼국': { start: 57, end: 668, mid: 400 },
    '고구려': { start: -37, end: 668, mid: 300 },
    '백제': { start: -18, end: 660, mid: 300 },
    '신라': { start: -57, end: 935, mid: 500 },
    '가야': { start: 42, end: 562, mid: 300 },
    '낙랑': { start: -108, end: 313, mid: 100 },
    // Unified Silla
    '통일신라': { start: 668, end: 935, mid: 800 },
    // Goryeo Dynasty
    '고려': { start: 918, end: 1392, mid: 1150 },
    '려말선초': { start: 1351, end: 1450, mid: 1400 },
    // Joseon Dynasty
    '조선': { start: 1392, end: 1897, mid: 1650 },
    '대한제국': { start: 1897, end: 1910, mid: 1897 },
    // Modern Korea
    '일제강점': { start: 1910, end: 1945, mid: 1930 },
    '광복이후': { start: 1945, end: 2000, mid: 1970 },
    '근대': { start: 1876, end: 1945, mid: 1890 },
    // Chinese dynasties (for Chinese artifacts in collection)
    '전한': { start: -206, end: 8, mid: -100 },
    '후한': { start: 25, end: 220, mid: 120 },
    '당': { start: 618, end: 907, mid: 750 },
    '송': { start: 960, end: 1279, mid: 1100 },
    '원': { start: 1271, end: 1368, mid: 1320 },
    '명': { start: 1368, end: 1644, mid: 1500 },
    '청': { start: 1644, end: 1912, mid: 1780 },
    // Japanese periods
    '야요이': { start: -300, end: 300, mid: 0 },
    '고훈': { start: 250, end: 538, mid: 400 },
    '에도': { start: 1603, end: 1868, mid: 1735 },
  };

  // Helper: Format period with date range for display
  const formatPeriodWithDates = (period: string): string => {
    const info = KOREAN_PERIOD_INFO[period];
    if (!info) return period;
    const formatYear = (y: number) => y < 0 ? `BC ${Math.abs(y)}` : `${y}`;
    return `${period} (${formatYear(info.start)}~${formatYear(info.end)})`;
  };

  // Legacy mapping for compatibility (returns mid year)
  const KOREAN_PERIOD_TO_YEAR: Record<string, number> = Object.fromEntries(
    Object.entries(KOREAN_PERIOD_INFO).map(([k, v]) => [k, v.mid])
  );

  // Material-based 2D/3D classification for Korean museums
  // 2D: paper, silk, fabric (paintings, calligraphy, prints)
  // 3D: ceramics, metal, stone, wood, bone, glass (sculptures, crafts, artifacts)
  const MATERIAL_TO_TYPE: Record<string, '2D' | '3D'> = {
    // 2D materials
    '지': '2D',           // Paper
    '사직': '2D',         // Silk/Fabric
    '종이': '2D',         // Paper variant
    '섬유': '2D',         // Fiber/Textile
    // 3D materials - General
    '도자기': '3D',       // Ceramics
    '토제': '3D',         // Earthenware
    '금속': '3D',         // Metal
    '석': '3D',           // Stone
    '나무': '3D',         // Wood
    '유리/보석': '3D',    // Glass/Gems
    '골각패갑': '3D',     // Bone/Shell/Carapace
    '피모': '3D',         // Leather/Fur
    '초제': '3D',         // Plant-based
    '광물': '3D',         // Minerals
    '흙': '3D',           // Earth/Clay
    // 3D materials - Gyeongju Museum specific (ceramics)
    '경질': '3D',         // Hard-fired pottery
    '연질': '3D',         // Soft-fired pottery
    '와질': '3D',         // Tile-like pottery
    '청자': '3D',         // Celadon
    '백자': '3D',         // White porcelain
    '분청': '3D',         // Buncheong ware
    // 3D materials - Gyeongju Museum specific (metals)
    '철': '3D',           // Iron
    '청동': '3D',         // Bronze
    '동합금': '3D',       // Copper alloy
    '금동': '3D',         // Gilt-bronze
    '금': '3D',           // Gold
    '은': '3D',           // Silver
    // 3D materials - Gyeongju Museum specific (stone)
    '화강암': '3D',       // Granite
    '돌': '3D',           // Stone variant
    '옥': '3D',           // Jade
    // 3D materials - misc
    '기타': '3D',         // Other (assume 3D for artifacts)
    '칠기': '3D',         // Lacquerware
    '뼈/뿔/조개': '3D',   // Bone/horn/shell
  };

  const CATEGORY_LABEL_MAP: Record<string, string> = {
    // Korean categories (SeMA)
    '회화': 'Painting',
    '사진': 'Photography',
    '한국화': 'Korean Painting',
    '드로잉&판화': 'Drawing & Print',
    '조각': 'Sculpture',
    '뉴미디어': 'New Media',
    '설치': 'Installation',
    '공예': 'Craft',
    '서예': 'Calligraphy',
    '디자인': 'Design',
    // Add more category translations as needed for other museums
  };

  // National Museum of Korea: Load more from cached full data
  const loadMoreNmkArtworks = useCallback(async () => {
    if (nmkLoading || nmkCurrentChunk >= nmkTotalChunks) return;
    setNmkLoading(true);
    try {
      const ITEMS_PER_PAGE = 1000;
      const nextChunk = nmkCurrentChunk + 1;
      const fullData = (window as any).__nmkFullData;

      if (!fullData) {
        console.error('NMK full data not loaded');
        return;
      }

      const startIdx = nmkCurrentChunk * ITEMS_PER_PAGE;
      const endIdx = startIdx + ITEMS_PER_PAGE;
      const nextBatch = fullData.slice(startIdx, endIdx);

      const toYear = (yearText: string | number | undefined, period?: string) => {
        if (yearText) {
          const match = String(yearText).match(/(\d{4})/);
          if (match) return parseInt(match[1], 10);
        }
        if (period && KOREAN_PERIOD_TO_YEAR[period]) {
          return KOREAN_PERIOD_TO_YEAR[period];
        }
        return 0;
      };

      const detectReinaSofiaType = (technique: string): '2D' | '3D' | 'video' | 'unknown' => {
        const t = (technique || '').toLowerCase();
        if (/video|film|animation|projection/i.test(t)) return 'video';
        if (/sculpture|installation|object|assemblage|cast|bronze|marble|wood|metal|ceramic/i.test(t)) return '3D';
        if (/oil|painting|canvas|acrylic|watercolor|drawing|print|photograph|lithograph|etching|engraving|gouache|pastel|ink|collage/i.test(t)) return '2D';
        return '2D';
      };

      const newArtworks: Artwork[] = nextBatch.map((item: any, idx: number) => {
        if (exhibition.id === 'reina-sofia-collection') {
          const roomId = String(item.room || '').trim();
          return {
            id: item.id || `reina-sofia-${nextChunk}-${idx}`,
            name: item.title || 'Untitled',
            artist: item.artist || 'Unknown',
            year: toYear(item.date),
            date: item.date || '',
            image: ensureHttps(item.imageUrl || item.thumbnailUrl || ''),
            sourceUrl: item.sourceUrl || '',
            roomId: roomId || 'default',
            exhibitionName: exhibition.name,
            exhibitionTitle: 'Museo Reina Sofía Collection',
            description: item.description || '',
            medium: item.technique || '',
            dimensions: item.dimensions || '',
            category: item.category || 'Artwork',
            type: detectReinaSofiaType(item.technique),
          };
        }

        // Helper to get Korean title (prefer titleHanja which contains Korean, not Hanja)
        const getKoreanTitle = (item: any): string => {
          const titleHanja = item.titleHanja || '';
          const title = item.title || '';
          const hasKorean = (str: string) => /[\uAC00-\uD7AF]/.test(str);
          if (titleHanja && hasKorean(titleHanja)) return titleHanja;
          if (title && hasKorean(title)) return title;
          return title || titleHanja || item.name || 'Untitled';
        };

        return {
          id: item.id || `nmk-${nextChunk}-${idx}`,
          name: (exhibition.id === 'gyeongju-museum' || exhibition.id === 'buyeo-museum') ? getKoreanTitle(item) : (item.title || item.name || 'Untitled'),
          artist: item.artist || 'Unknown',
          year: toYear(item.year || item.date, item.period),
          date: item.period ? formatPeriodWithDates(item.period) : (item.date || ''),
          image: ensureHttps(item.imageUrl || item.thumbnailUrl || item.image || ''),
          sourceUrl: item.sourceUrl || '',
          roomId: 'default',
          exhibitionName: exhibition.name,
          exhibitionTitle: exhibition.title || 'National Museum of Korea Collection',
          description: item.description || '',
          medium: item.material || item.medium || '',
          category: item.material || '',  // Use material as category for NMK
          subcategory: item.category || '',  // Original category becomes subcategory
          excavationSite: item.excavationSite || '',
          type: MATERIAL_TO_TYPE[item.material] || '3D',
        };
      });

      setArtworks(prev => [...prev, ...newArtworks]);
      setNmkCurrentChunk(nextChunk);
    } catch (error) {
      console.error('Failed to load more NMK artworks:', error);
    } finally {
      setNmkLoading(false);
    }
  }, [nmkLoading, nmkCurrentChunk, nmkTotalChunks, exhibition.id, exhibition.name, exhibition.title]);

  // NMK/Gyeongju/Buyeo/Reina Sofía: Apply filters to full dataset when category/search/century/type changes
  useEffect(() => {
    if (exhibition.id !== 'nmk-collection' && exhibition.id !== 'gyeongju-museum' && exhibition.id !== 'buyeo-museum' && exhibition.id !== 'reina-sofia-collection') return;
    const fullData = (window as any).__nmkFullData;
    if (!fullData) return;

    const hasActiveFilter = selectedCategories.size > 0 || searchQuery.trim() ||
      selectedCentury !== null || selectedTypes.size > 0 || selectedRoomId !== 'ALL' || selectedMediumFacets.size > 0;

    if (!hasActiveFilter) {
      // No filter active - use paginated mode
      setNmkFilteredResults(null);
      return;
    }

    // Apply filters to full data
    const toYear = (yearText: string | number | undefined, period?: string) => {
      if (yearText) {
        const match = String(yearText).match(/(\d{4})/);
        if (match) return parseInt(match[1], 10);
      }
      if (period && KOREAN_PERIOD_TO_YEAR[period]) {
        return KOREAN_PERIOD_TO_YEAR[period];
      }
      return 0;
    };

    let filtered = fullData;

    // Room filter (Reina Sofía only)
    if (exhibition.id === 'reina-sofia-collection' && selectedRoomId !== 'ALL') {
      if (selectedRoomId === 'n') {
        filtered = filtered.filter((item: any) => !String(item.room || '').trim());
      } else {
        filtered = filtered.filter((item: any) => String(item.room || '').trim() === selectedRoomId);
      }
    }

    // Century filter
    if (selectedCentury) {
      if (selectedCentury === '~15') {
        filtered = filtered.filter((item: any) => {
          const y = toYear(item.year || item.date, item.period);
          return y !== 0 && y < 1500;
        });
      } else {
        const cNum = parseInt(selectedCentury);
        const cStart = (cNum - 1) * 100;
        const cEnd = cStart + 100;
        filtered = filtered.filter((item: any) => {
          const y = toYear(item.year || item.date, item.period);
          return y >= cStart && y < cEnd;
        });
      }
    }

    // Year range filter (decade or century subdivision)
    if (selectedYearRange !== 'ALL') {
      const startYear = parseInt(selectedYearRange);
      if (Number.isFinite(startYear)) {
        const dStart = startYear;
        const dEnd = (selectedCentury === '~15') ? dStart + 100 : dStart + 10;
        filtered = filtered.filter((item: any) => {
          const y = toYear(item.year || item.date, item.period);
          return y >= dStart && y < dEnd;
        });
      }
    }

    // Helper to detect type for Reina Sofía items
    // 기법(Technique) 중심 분류: "Oil on canvas"에서 중요한 건 oil(기법), canvas(지지체)는 분류에 영향 없음
    const detectReinaSofiaType = (technique: string): '2D' | '3D' | 'video' | 'unknown' => {
      const t = (technique || '').toLowerCase();
      if (/video|film|animation|projection/i.test(t)) return 'video';
      // 2D 기법: 표면에 무언가를 칠하거나 그리거나 인쇄하는 것
      if (/oil|óleo|acrylic|acrílico|tempera|gouache|watercolor|acuarela|enamel|lacquer|paint|pintura|ink|tinta|pencil|lápiz|charcoal|carboncillo|pastel|crayon|drawing|dibujo|sketch|print|estampa|lithograph|litograf|etching|aguafuerte|engraving|grabado|woodcut|xilograf|screen\s?print|serigraf|silkscreen|monotype|photograph|foto|gelatin|silver|chromogenic|c-?print|daguerreotype|collage|mixed media|técnica mixta/i.test(t)) return '2D';
      // 3D 기법: 입체적 형태를 만드는 것
      if (/sculpture|escultura|carving|tallado|cast|fundición|molding|modeling|modelado|installation|instalación|instalaci|assemblage|ensamblaje|construction|construcción|relief|relieve|mobile|móvil/i.test(t)) return '3D';
      return '2D';
    };

    // 2D/3D type filter
    if (selectedTypes.size > 0) {
      // Handle N separately
      if (selectedTypes.has('N')) {
        filtered = filtered.filter((item: any) => isUncollectedArtwork(item));
      } else {
        filtered = filtered.filter((item: any) => {
          let itemType: '2D' | '3D';
          if (exhibition.id === 'reina-sofia-collection') {
            const detected = detectReinaSofiaType(item.technique);
            itemType = (detected === '2D' || detected === '3D') ? detected : '2D';
          } else {
            itemType = MATERIAL_TO_TYPE[item.material] || '3D';
          }
          return selectedTypes.has(itemType);
        });
      }
    }

    // Category filter (for NMK, category = material; for Reina Sofía, use artist)
    if (selectedCategories.size > 0) {
      filtered = filtered.filter((item: any) => {
        if (exhibition.id === 'reina-sofia-collection') {
          const artist = item.artist || '';
          return selectedCategories.has(artist);
        }
        const cat = item.material || '';  // Use material for NMK filtering
        return selectedCategories.has(cat);
      });
    }

    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      filtered = filtered.filter((item: any) => {
        const title = String(item.title || item.name || '').toLowerCase();
        const category = String(item.category || '').toLowerCase();
        const subcategory = String(item.subcategory || '').toLowerCase();
        const material = String(item.material || '').toLowerCase();
        const period = String(item.period || '').toLowerCase();
        const excavationSite = String(item.excavationSite || '').toLowerCase();
        // Additional fields for Reina Sofía
        const artist = String(item.artist || '').toLowerCase();
        const technique = String(item.technique || '').toLowerCase();
        const room = String(item.room || '').toLowerCase();
        return title.includes(q) || category.includes(q) || subcategory.includes(q) ||
          material.includes(q) || period.includes(q) || excavationSite.includes(q) ||
          artist.includes(q) || technique.includes(q) || room.includes(q);
      });
    }

    // Helper to get Korean title for Buyeo museum items
    const getKoreanTitle = (item: any): string => {
      const titleHanja = item.titleHanja || '';
      const title = item.title || '';
      const hasKorean = (str: string) => /[\uAC00-\uD7AF]/.test(str);
      if (titleHanja && hasKorean(titleHanja)) return titleHanja;
      if (title && hasKorean(title)) return title;
      return title || titleHanja || item.name || 'Untitled';
    };

    // Convert to Artwork objects
    const results: Artwork[] = filtered.map((item: any, idx: number) => {
      // Handle Reina Sofía differently
      if (exhibition.id === 'reina-sofia-collection') {
        return {
          id: item.id || `reina-sofia-filtered-${idx}`,
          name: item.title || 'Untitled',
          artist: item.artist || 'Unknown',
          year: toYear(item.date),
          date: item.date || '',
          image: ensureHttps(item.imageUrl || item.thumbnailUrl || ''),
          sourceUrl: item.sourceUrl || '',
          roomId: item.room || 'default',
          exhibitionName: exhibition.name,
          exhibitionTitle: 'Museo Reina Sofía Collection',
          description: item.description || '',
          medium: item.technique || '',
          dimensions: item.dimensions || '',
          category: item.category || 'Artwork',
          type: detectReinaSofiaType(item.technique),
        };
      }
      // Default handling for NMK/Gyeongju/Buyeo
      return {
        id: item.id || `nmk-filtered-${idx}`,
        name: (exhibition.id === 'buyeo-museum' || exhibition.id === 'gyeongju-museum') ? getKoreanTitle(item) : (item.title || item.name || 'Untitled'),
        artist: item.artist || 'Unknown',
        year: toYear(item.year || item.date, item.period),
        date: item.period ? formatPeriodWithDates(item.period) : (item.date || ''),
        image: ensureHttps(item.imageUrl || item.thumbnailUrl || item.image || ''),
        sourceUrl: item.sourceUrl || '',
        roomId: 'default',
        exhibitionName: exhibition.name,
        exhibitionTitle: exhibition.title || 'National Museum of Korea Collection',
        description: item.description || '',
        medium: item.material || item.medium || '',
        category: item.material || '',  // Use material as category for NMK
        subcategory: item.category || '',  // Original category becomes subcategory
        excavationSite: item.excavationSite || '',
        type: MATERIAL_TO_TYPE[item.material] || '3D',
      };
    });

    setNmkFilteredResults(results);
  }, [exhibition.id, exhibition.name, selectedCategories, searchQuery, selectedCentury, selectedYearRange, selectedTypes, selectedRoomId, selectedMediumFacets]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      if (!user) {
        setLikedArtworks(new Set());
      }
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!currentUser) return;
    const q = collection(db, `users/${currentUser.uid}/liked_artworks`);
    // Subscribe to the whole collection of likes (assuming < 10k likes, this is fine for now)
    // Optimization: we could load only IDs.
    const unsub = onSnapshot(q, (snap) => {
      const s = new Set<string>();
      snap.forEach(doc => s.add(doc.id));
      setLikedArtworks(s);
    });
    return () => unsub();
  }, [currentUser]);

  const toggleLike = useCallback(async (e: React.MouseEvent, artwork: Artwork) => {
    e.stopPropagation();
    e.preventDefault();

    let userToUse = currentUser;

    // Prompt login if not logged in or is anonymous
    if (!currentUser || currentUser.isAnonymous) {
      try {
        const provider = new GoogleAuthProvider();
        provider.setCustomParameters({ prompt: 'select_account' });
        const result = await signInWithPopup(auth, provider);
        userToUse = result.user; // Use the newly signed-in user
      } catch (err) {
        console.error("Login failed", err);
        return; // Only return if login actually failed
      }
    }

    if (!userToUse) return; // Safety check

    const artworkId = artwork.id;
    const isLiked = likedArtworks.has(artworkId);
    const ref = doc(db, `users/${userToUse.uid}/liked_artworks/${artworkId}`);
    try {
      if (isLiked) {
        // Optimistic update
        setLikedArtworks(prev => {
          const next = new Set(prev);
          next.delete(artworkId);
          return next;
        });
        await deleteDoc(ref);
      } else {
        // Optimistic update
        setLikedArtworks(prev => {
          const next = new Set(prev);
          next.add(artworkId);
          return next;
        });
        await setDoc(ref, {
          likedAt: serverTimestamp(),
          artworkId,
          title: artwork.name || '',
          artist: artwork.artist || '',
          year: artwork.year || 0,
          image: artwork.image || '',
          youtubeId: artwork.youtubeId || null,
          mediaType: artwork.mediaType || 'image',
        });
      }
    } catch (error) {
      console.error("Failed to toggle like", error);
    }
  }, [currentUser, likedArtworks]);



  useEffect(() => {
    setViewMode((prev) => (prev === 'gallery' ? prev : 'gallery'));
  }, [exhibition.id]);

  // Reset selected index and gallery scroll when viewMode changes (archive mode scroll is handled separately)
  useEffect(() => {
    // Reset selected index to 0 for all modes
    setSelectedIndex(0);
    // Reset archive scroll position state
    setArchiveScrollTop(0);
    // Reset gallery scroll container
    const galleryContainer = document.querySelector('.gallery-scroll-container');
    if (galleryContainer) {
      galleryContainer.scrollTop = 0;
    }
  }, [viewMode]);

  const panelRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const infoPanelRef = useRef<HTMLDivElement | null>(null);
  const seededRef = useRef(false);

  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [lightbox, setLightbox] = useState<{
    artwork: Artwork;
    start: { left: number; top: number; width: number; height: number };
    target: { left: number; top: number; width: number; height: number };
    animate: boolean;
    natWidth?: number;
    natHeight?: number;
  } | null>(null);
  // Hover-based zoom overlay (blur background, fade-in large image)
  const [hoverZoom, setHoverZoom] = useState<{
    artwork: Artwork;
    imageUrl: string;
    animate: boolean;
  } | null>(null);
  // Track the hoverZoom during closing animation
  const [closingHoverZoom, setClosingHoverZoom] = useState<{
    artwork: Artwork;
    imageUrl: string;
  } | null>(null);
  const hoverZoomTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  // Progressive image loading state (Step 1): main stage / panorama
  const [mainLoaded, setMainLoaded] = useState(false);
  // Archive mode: control iframe and thumbnail visibility
  const [archiveVideoReady, setArchiveVideoReady] = useState(false);
  const [archiveThumbnailHidden, setArchiveThumbnailHidden] = useState(false);
  // Gallery mode: control iframe and thumbnail visibility on hover
  const [galleryVideoReadyIdx, setGalleryVideoReadyIdx] = useState<number | null>(null);
  const [galleryThumbnailHiddenIdx, setGalleryThumbnailHiddenIdx] = useState<number | null>(null);

  const mainImgRef = useRef<HTMLImageElement | null>(null);
  const idleDecodeHandlesRef = useRef<number[]>([]);
  // Representative image (from local feed or exhibition data)
  const [repImage, setRepImage] = useState<string | null>(null);
  // Close guards
  const isActiveRef = useRef(true);
  const closeGuardRef = useRef(false);
  useEffect(() => {
    return () => { isActiveRef.current = false; };
  }, []);
  const clearModalFlag = () => {
    try {
      const st = { ...(window.history.state || {}) } as any;
      delete st.modal;
      delete st.exhibitionId;
      delete st.selectedIndex;
      window.history.replaceState(st, document.title);
    } catch { }
  };

  // Responsive check for top bar layout
  const [isNarrow, setIsNarrow] = useState(() => typeof window !== "undefined" ? window.innerWidth < 1100 : false);
  // Very narrow detection (between mobile and narrow) for tighter layouts
  const [isVeryNarrow, setIsVeryNarrow] = useState(() => typeof window !== "undefined" ? window.innerWidth < 900 : false);
  // Mobile detection (for touch devices with narrow screens)
  const [isMobile, setIsMobile] = useState(() => typeof window !== "undefined" ? window.innerWidth < 768 : false);
  // Window width for dynamic gap calculation
  const [windowWidth, setWindowWidth] = useState(() => typeof window !== "undefined" ? window.innerWidth : 1200);
  // Store initial layout width to prevent iOS pinch zoom from triggering re-renders
  const initialLayoutWidthRef = useRef<number>(typeof window !== "undefined" ? window.innerWidth : 1200);
  const lastOrientationRef = useRef<string>(typeof window !== "undefined" ? (window.innerWidth > window.innerHeight ? 'landscape' : 'portrait') : 'portrait');

  useEffect(() => {
    let resizeTimeout: ReturnType<typeof setTimeout> | null = null;
    const onResize = () => {
      // Detect orientation change
      const currentOrientation = window.innerWidth > window.innerHeight ? 'landscape' : 'portrait';
      const orientationChanged = currentOrientation !== lastOrientationRef.current;

      const layoutWidth = document.documentElement.clientWidth;

      // Only update on orientation change or significant screen size change
      // Pinch zoom doesn't change orientation
      if (!orientationChanged) {
        const widthDiff = Math.abs(layoutWidth - initialLayoutWidthRef.current);
        if (widthDiff < 100) {
          return; // Ignore - likely pinch zoom
        }
      }

      // Debounce real resizes
      if (resizeTimeout) clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        lastOrientationRef.current = currentOrientation;
        initialLayoutWidthRef.current = layoutWidth;
        setIsNarrow(layoutWidth < 1100);
        setIsVeryNarrow(layoutWidth < 900);
        setIsMobile(layoutWidth < 768);
        setWindowWidth(layoutWidth);
      }, 200);
    };
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      if (resizeTimeout) clearTimeout(resizeTimeout);
    };
  }, []);

  // Allow adding simple rooms and compute a list of room buttons (ALL + defaults + custom + discovered)
  const [customRooms, setCustomRooms] = useState<string[]>([]);
  // Load/save custom rooms per exhibition to localStorage so rooms persist between opens
  useEffect(() => {
    try {
      const key = `rooms_${exhibition.id}`;
      const raw = localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw) as string[];
        if (Array.isArray(parsed)) setCustomRooms(parsed);
      }
    } catch { }
  }, [exhibition.id]);

  useEffect(() => {
    try {
      const key = `rooms_${exhibition.id}`;
      localStorage.setItem(key, JSON.stringify(customRooms));
    } catch { }
  }, [customRooms, exhibition.id]);

  const roomButtons = useMemo(() => {
    // Debug: log artworks for room detection
    if (exhibition.id === 'wallace-permanent') {
      console.log('[Wallace roomButtons] artworks count:', artworks.length);
      const roomIds = artworks.map(a => a.roomId).filter(Boolean);
      console.log('[Wallace roomButtons] unique roomIds:', [...new Set(roomIds)]);
    }

    // For display exhibitions (both Tate Britain and Tate Modern), use roomMetas to include all rooms
    const isTateBritainDisplay = exhibition.id.startsWith('tate-britain-display-');
    if ((isTateBritainDisplay || exhibition.id.startsWith('display-')) && roomMetas.length > 0) {
      const buttons: { label: string; id: string }[] = [{ label: 'ALL', id: 'ALL' }];
      for (const meta of roomMetas) {
        buttons.push({ label: meta.id, id: meta.id });
      }
      return buttons;
    }

    // For non-display exhibitions: only include rooms that actually have artworks
    // Reina Sofía: discover from full dataset so rooms aren\'t limited to the first 1000.
    let discovered: string[];
    let hasUnassigned = false;
    if (exhibition.id === 'reina-sofia-collection') {
      const fullData = (window as any).__nmkFullData as any[] | undefined;
      const roomIds = (fullData || []).map((item) => String(item?.room || '').trim());
      discovered = Array.from(new Set(roomIds.filter((id) => id && id.toLowerCase() !== 'default')));
      hasUnassigned = roomIds.some((id) => !id || id.toLowerCase() === 'default');
    } else {
      discovered = Array.from(new Set(
        artworks
          .map(a => (a.roomId || '').trim())
          .filter(id => id && id.toLowerCase() !== 'default')
      ));
      hasUnassigned = artworks.some(a => !a.roomId || a.roomId === 'default' || a.roomId.trim() === '');
    }

    // Pure numeric rooms (1, 2, 3...)
    const numeric = Array.from(new Set(discovered.filter(id => /^\d+$/.test(id))));
    numeric.sort((a, b) => parseInt(a, 10) - parseInt(b, 10));

    // Letter rooms (A-G for ground floor)
    const letters = Array.from(new Set(discovered.filter(id => /^[A-G]$/i.test(id))));
    letters.sort();

    // String rooms like "Room 1", "West Gallery", etc. - extract numbers or assign sequential numbers
    const stringRooms = discovered.filter(id => !(/^\d+$/.test(id)) && !(/^[A-G]$/i.test(id)) && id !== 'Not on display' && id !== 'n');

    // Sort string rooms: if they contain numbers (like "Room 1"), sort by number; otherwise alphabetically
    const sortedStringRooms = stringRooms.sort((a, b) => {
      const numA = a.match(/\d+/);
      const numB = b.match(/\d+/);
      if (numA && numB) {
        return parseInt(numA[0], 10) - parseInt(numB[0], 10);
      }
      return a.localeCompare(b);
    });

    const hasC = discovered.some(id => id.toUpperCase() === 'C');
    // Check for both 'n' and 'Not on display' as Archive, OR artworks with no room assignment (default)
    const hasArchive = discovered.some(id => id === 'Not on display' || id === 'n');
    // Check if there are artworks without room assignment (roomId is empty, null, or 'default')
    const buttons: { label: string; id: string }[] = [{ label: 'ALL', id: 'ALL' }];

    // If we have pure numeric rooms, add them first
    for (const id of numeric) buttons.push({ label: id, id });

    // If we have string rooms (like "Room 1", "West Gallery"), assign sequential numbers starting from 1
    // Only if there are no pure numeric rooms already
    if (sortedStringRooms.length > 0 && numeric.length === 0) {
      sortedStringRooms.forEach((roomId, index) => {
        buttons.push({ label: String(index + 1), id: roomId });
      });
    } else if (sortedStringRooms.length > 0) {
      // If we have both numeric and string rooms, add string rooms after numeric with sequential labels
      const startNum = numeric.length > 0 ? Math.max(...numeric.map(n => parseInt(n, 10))) + 1 : 1;
      sortedStringRooms.forEach((roomId, index) => {
        buttons.push({ label: String(startNum + index), id: roomId });
      });
    }

    // Add letter rooms
    for (const id of letters) {
      if (id.toUpperCase() !== 'C') buttons.push({ label: id.toUpperCase(), id }); // add letter rooms except C (handled separately)
    }
    if (hasC) buttons.push({ label: 'C', id: 'C' }); // append Central Hall
    // Only add archive (n) if there are actual rooms - not for collections without room data
    const hasActualRooms = buttons.length > 1; // More than just 'ALL'
    if (hasActualRooms && (hasArchive || hasUnassigned)) buttons.push({ label: 'n', id: 'n' }); // append Not assigned (n) at the end
    // Only return buttons if there are actual rooms (more than just ALL, and more than just ALL+n)
    if (buttons.length <= 1) return [];
    // If only ALL and n, also return empty (no meaningful room selection)
    if (buttons.length === 2 && buttons[1]?.id === 'n') return [];
    return buttons;
  }, [artworks, roomMetas, exhibition.id]);

  // Room-only filtered (for deriving century/decade availability)
  const roomFiltered = useMemo(() => {
    // NMK/Gyeongju/Buyeo/Reina Sofía: Use filtered results from full data if available
    if ((exhibition.id === 'nmk-collection' || exhibition.id === 'gyeongju-museum' || exhibition.id === 'buyeo-museum' || exhibition.id === 'reina-sofia-collection') && nmkFilteredResults !== null) {
      return nmkFilteredResults;
    }

    if (selectedRoomId === 'ALL') return artworks;
    // 'n' means not assigned - filter artworks with no room or default roomId
    if (selectedRoomId === 'n') {
      return artworks.filter(a => !a.roomId || a.roomId === 'default' || a.roomId.trim() === '' || a.roomId === 'Not on display' || a.roomId === 'n');
    }
    return artworks.filter(a => (a.roomId || 'default') === selectedRoomId);
  }, [artworks, selectedRoomId, exhibition.id, nmkFilteredResults]);

  // Apply date filter: if decade is selected, filter by that decade; otherwise if a century is selected (in decade view), filter by the whole century
  const filteredArtworks = useMemo(() => {
    let filtered = roomFiltered;

    // Filter out archival materials if toggle is on (generic for all collections with isArchival field)
    if (showArtworksOnly) {
      filtered = filtered.filter(a => !a.isArchival);
    }

    // Guggenheim Bilbao + KHM + Kunsthaus: filter "On view" artworks only
    if ((exhibition.id === 'guggenheim-bilbao-collection' || exhibition.id === 'khm-collection' || exhibition.id === 'kunsthaus-collection') && showOnViewOnly) {
      filtered = filtered.filter(a => {
        if (exhibition.id === 'kunsthaus-collection') return (a as any).onView === true;
        const categories = (a as any).categories || [];
        return categories.some((cat: string) => cat && cat.toLowerCase().includes('on view'));
      });
    }

    // Rijksmuseum: filter "On display" artworks only
    if ((exhibition.id === 'rijksmuseum-paintings' || exhibition.id === 'rijksmuseum-photography' || exhibition.id === 'rijksmuseum-drawings' || exhibition.id === 'rijksmuseum-prints' || exhibition.id === 'rijksmuseum-prints2') && showOnDisplayOnly) {
      filtered = filtered.filter(a => (a as any).onDisplay === true);
    }

    // Picasso Barcelona: filter "Highlight" artworks only
    if (exhibition.id === 'picasso-bcn-collection' && showHighlightOnly) {
      filtered = filtered.filter(a => {
        const categories = (a as any).categories || [];
        return categories.some((cat: string) => cat && cat.toLowerCase().includes('highlight'));
      });
    }

    // 2D/3D/N type filter (N = truly uncollected/empty classification info)
    if (selectedTypes.size > 0) {
      filtered = filtered.filter(a => {
        const t = inferArtworkType(a);
        // N이 선택되었으면 “미수집/분류 정보 없음”만
        if (selectedTypes.has('N')) {
          return isUncollectedArtwork(a);
        }
        return t && selectedTypes.has(t);
      });
    }

    // 기법 기반 하위 분류 필터 (모든 미술관에 적용)
    if (selectedMediumFacets.size > 0) {
      filtered = filtered.filter(a => {
        // Guggenheim Bilbao, Picasso Barcelona: artworkType/category 기반 필터링
        if (exhibition.id === 'guggenheim-bilbao-collection' || exhibition.id === 'picasso-bcn-collection') {
          const artworkType = (a as any).artworkType || (a as any).category || '';
          return selectedMediumFacets.has(artworkType);
        }
        // 다른 미술관: 기법 기반 필터링
        const text = `${String((a as any).medium || '')} ${String((a as any).technique || '')} ${String((a as any).materials || '')}`;
        for (const facetId of selectedMediumFacets) {
          if (matchesTechniqueFacet(text, facetId)) return true;
        }
        return false;
      });
    }

    // If a century is chosen, limit to that century
    if (selectedCentury) {
      if (selectedCentury === '~15') {
        // Pre-1500
        filtered = filtered.filter(a => (a.year || 0) > 0 && (a.year || 0) < 1500);
      } else {
        const cNum = parseInt(selectedCentury);
        const cStart = (cNum - 1) * 100;
        const cEnd = cStart + 100;
        filtered = filtered.filter(a => {
          const y = a.year || 0;
          return y >= cStart && y < cEnd;
        });
      }
    }

    // If a decade/century range is explicitly selected, further narrow
    if (selectedYearRange !== 'ALL') {
      const startYear = parseInt(selectedYearRange);
      if (Number.isFinite(startYear)) {
        const dStart = startYear;
        // For ~15c selections, use 100-year range; otherwise 10-year
        const dEnd = (selectedCentury === '~15') ? dStart + 100 : dStart + 10;
        filtered = filtered.filter(a => {
          const y = a.year || 0;
          return y >= dStart && y < dEnd;
        });
      }
    }

    // Apply category filter (cumulative - if any category selected, filter to those)
    if (selectedCategories.size > 0) {
      filtered = filtered.filter(a => {
        const cat = (a as Record<string, unknown>).category as string;
        if (!cat) return false;
        const normalized = normalizeCategory(cat);
        return normalized && selectedCategories.has(normalized);
      });
    }

    // Apply search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      filtered = filtered.filter(a => {
        const name = String(a.name || (a as any).title || '').toLowerCase();
        const artist = String(a.artist || '').toLowerCase();
        const year = String(a.year || '');
        const date = String(a.date || '').toLowerCase();
        const medium = String((a as Record<string, unknown>).medium || '').toLowerCase();
        const technique = String((a as Record<string, unknown>).technique || '').toLowerCase();
        const materials = String((a as Record<string, unknown>).materials || '').toLowerCase();
        const category = String((a as Record<string, unknown>).category || '').toLowerCase();
        const artworkType = String((a as Record<string, unknown>).artworkType || '').toLowerCase();
        const dimension = String(a.dimension || '').toLowerCase();
        return name.includes(q) || artist.includes(q) || year.includes(q) || date.includes(q) || medium.includes(q) || technique.includes(q) || materials.includes(q) || category.includes(q) || artworkType.includes(q) || dimension.includes(q);
      });
    }

    return filtered;
  }, [roomFiltered, selectedCentury, selectedYearRange, showArtworksOnly, showOnViewOnly, showOnDisplayOnly, showHighlightOnly, selectedTypes, searchQuery, selectedCategories, exhibition.id, selectedMediumFacets]);

  // Check if any artwork has categorizable data for showing 2D/3D buttons
  const hasCategorizedArtworks = useMemo(() => {
    // For Korean museums, check full data if available
    const isKoreanMuseum = exhibition.id === 'nmk-collection' || exhibition.id === 'gyeongju-museum' || exhibition.id === 'buyeo-museum';
    const fullData = isKoreanMuseum ? (window as any).__nmkFullData : null;

    const dataToCheck = (isKoreanMuseum && fullData && fullData.length > 0) ? fullData : artworks;
    const useRawMaterial = (isKoreanMuseum && fullData && fullData.length > 0);

    const result = dataToCheck.some((a: any) => {
      if (useRawMaterial) {
        // For raw data, check if material exists and is mappable
        return a.material && MATERIAL_TO_TYPE[a.material];
      } else {
        // For artworks, use inferArtworkType
        return inferArtworkType(a) !== null;
      }
    });

    return result;
  }, [artworks, exhibition.id, nmkTotalCount]);

  // Check if any artwork is truly “uncollected” (for N button)
  const hasUncategorizedArtworks = useMemo(() => {
    return artworks.some(a => isUncollectedArtwork(a));
  }, [artworks]);

  // Check if any artwork has isArchival field for showing artworks only button
  const hasArchivalArtworks = useMemo(() => {
    return artworks.some(a => a.isArchival === true);
  }, [artworks]);

  // 기법 기반 하위 분류 - 모든 미술관에 자동 적용 (구겐하임 빌바오, 피카소 바르셀로나는 카테고리를 하위항목으로 사용하므로 medium 하위 분류 제외)
  const availableTechniqueFacets = useMemo(() => {
    // 2D/3D 타입이 선택되어 있어야 하위 분류 표시
    const targetType = selectedTypes.has('2D') ? '2D' : (selectedTypes.has('3D') ? '3D' : null);
    if (!targetType) return [] as { id: string; label: string; count: number }[];

    // Guggenheim Bilbao, Picasso Barcelona: 카테고리를 하위항목으로 사용 (availableCategories에서 표시됨)
    // availableTechniqueFacets는 빈 배열 반환 (카테고리는 availableCategories로 표시)
    if (exhibition.id === 'guggenheim-bilbao-collection' || exhibition.id === 'picasso-bcn-collection') {
      return [] as { id: string; label: string; count: number }[];
    }

    // 다른 미술관: 기법 기반 하위 분류
    const facets = TECHNIQUE_FACETS.filter((f) => f.parent === targetType);
    const counts = facets.map((f) => {
      const count = roomFiltered.filter((a) => {
        if (inferArtworkType(a) !== targetType) return false;
        // medium + technique + materials에서 기법 매칭
        const text = `${String((a as any).medium || '')} ${String((a as any).technique || '')} ${String((a as any).materials || '')}`;
        return f.re.test(text);
      }).length;
      return { id: f.id, label: f.label, count };
    });

    counts.sort((a, b) => b.count - a.count);
    // count > 0인 항목만 표시, 최대 7개
    return counts.filter((c) => c.count > 0).slice(0, 7);
  }, [selectedTypes, roomFiltered, exhibition.id]);

  // Get available categories for filter buttons (works for all museums with category data)
  // Only show categories that belong to the selected Type (2D or 3D). If no type selected, show none (UNLESS 2D/3D is not applicable).
  const availableCategories = useMemo(() => {
    // Determine which type is selected (should be single select now)
    const targetType = selectedTypes.has('2D') ? '2D' : (selectedTypes.has('3D') ? '3D' : null);

    // If we have categorized artworks (2D/3D detectable), enforce hierarchy:
    // Don't show categories unless a parent type button is clicked.
    if (hasCategorizedArtworks) {
      if (!targetType) return [];
    }
    // If hasCategorizedArtworks is FALSE, we fallback to showing ALL categories (old behavior),
    // because 2D/3D buttons won't appear anyway.

    const cats = new Set<string>();

    // For NMK/Gyeongju/Buyeo, use full dataset to calculate categories
    const isKoreanMuseum = exhibition.id === 'nmk-collection' || exhibition.id === 'gyeongju-museum' || exhibition.id === 'buyeo-museum';
    const fullData = isKoreanMuseum ? (window as any).__nmkFullData : null;

    // Use full data if available, otherwise use roomFiltered (for Picasso, Guggenheim, etc.)
    // roomFiltered already applies room selection, so categories should reflect current room selection
    const dataSource = (isKoreanMuseum && fullData && fullData.length > 0) ? fullData : roomFiltered;
    const useRawMaterial = (isKoreanMuseum && fullData && fullData.length > 0);

    for (const item of dataSource) {
      // For Korean museums with full data: use material field directly
      // For artworks (mapped): use category field (which contains material value)
      const cat = useRawMaterial
        ? (item.material || '')
        : ((item as Record<string, unknown>).category as string);

      // Filter out empty, whitespace-only, and corrupted Unicode strings
      if (cat && cat.trim() && !cat.includes('\uFFFD')) {
        // Only classify if 2D/3D logic is active
        if (hasCategorizedArtworks) {
          // For full raw data, use MATERIAL_TO_TYPE directly
          // For artworks, use inferArtworkType (which checks type field)
          const itemType = useRawMaterial
            ? (MATERIAL_TO_TYPE[item.material] || '3D')
            : inferArtworkType(item);
          if (itemType === targetType) {
            // Normalize category before adding
            const normalized = normalizeCategory(cat);
            if (normalized) cats.add(normalized);
          }
        } else {
          // Fallback: add all valid categories (normalized)
          const normalized = normalizeCategory(cat);
          if (normalized) cats.add(normalized);
        }
      }
    }
    if (cats.size === 0) return [];
    // Sort by count from data source (use normalized categories for counting)
    // Optimization: Calculate counts in a single pass using a Map
    const countsMap = new Map<string, number>();
    const normCache = new Map<string, string>();

    const getNormalized = (c: string) => {
       if (normCache.has(c)) return normCache.get(c)!;
       const res = normalizeCategory(c);
       normCache.set(c, res);
       return res;
    };
    
    // We can reuse the loop logic or simpler: iterate all items and count valid ones
    for (const item of dataSource) {
        const cat = useRawMaterial
            ? (item.material || '')
            : ((item as Record<string, unknown>).category as string);
            
        if (cat && cat.trim() && !cat.includes('\uFFFD')) {
             if (hasCategorizedArtworks) {
                  const itemType = useRawMaterial
                    ? (MATERIAL_TO_TYPE[item.material] || '3D')
                    : inferArtworkType(item);
                  if (itemType !== targetType) continue; // Skip if not matching type
             }
             
             const normalized = getNormalized(cat);
             if (normalized) {
                 countsMap.set(normalized, (countsMap.get(normalized) || 0) + 1);
             }
        }
    }

    const counts = Array.from(countsMap.entries()).map(([cat, count]) => ({ cat, count }));
    
    counts.sort((a, b) => b.count - a.count);
    // Filter out categories with 3 or fewer items, and limit to top 15 for UI space
    return counts.filter(c => c.count > 3).slice(0, 15).map(c => c.cat);
  }, [artworks, selectedTypes, hasCategorizedArtworks, exhibition.id, nmkTotalCount, roomFiltered]);

  // Derive available centuries and decades from roomFiltered (or full NMK data)
  const availableCenturies = useMemo(() => {
    const set = new Set<string>();

    // For NMK/Gyeongju/Buyeo, calculate from full dataset to show all available centuries
    const isNmk = exhibition.id === 'nmk-collection' || exhibition.id === 'gyeongju-museum' || exhibition.id === 'buyeo-museum';
    const fullNmkData = isNmk ? (window as any).__nmkFullData : null;

    if (isNmk && fullNmkData) {
      // Calculate centuries from full NMK dataset
      for (const item of fullNmkData) {
        let y = 0;
        if (item.year) {
          const match = String(item.year).match(/(\d{4})/);
          if (match) y = parseInt(match[1], 10);
        }
        if (y === 0 && item.period && KOREAN_PERIOD_TO_YEAR[item.period]) {
          y = KOREAN_PERIOD_TO_YEAR[item.period];
        }
        if (y === 0) continue;
        if (y < 1500) set.add('~15');
        else if (y < 1600) set.add('16');
        else if (y < 1700) set.add('17');
        else if (y < 1800) set.add('18');
        else if (y < 1900) set.add('19');
        else if (y < 2000) set.add('20');
        else set.add('21');
      }
    } else {
      // For other exhibitions, use roomFiltered
      for (const a of roomFiltered) {
        const y = a.year || 0;
        if (y === 0) continue;
        if (y < 1500) set.add('~15');
        else if (y < 1600) set.add('16');
        else if (y < 1700) set.add('17');
        else if (y < 1800) set.add('18');
        else if (y < 1900) set.add('19');
        else if (y < 2000) set.add('20');
        else set.add('21');
      }
    }

    // Sort: ~15 first, then numeric ascending
    return Array.from(set).sort((a, b) => {
      if (a === '~15') return -1;
      if (b === '~15') return 1;
      return Number(a) - Number(b);
    });
  }, [roomFiltered, exhibition.id]);

  const availableDecades = useMemo(() => {
    if (!selectedCentury) return [] as number[];
    const present = new Set<number>();
    if (selectedCentury === '~15') {
      // Pre-1500: group by centuries (100-year intervals) instead of decades
      for (const a of roomFiltered) {
        const y = a.year || 0;
        if (y > 0 && y < 1500) {
          // Group by century: 1200-1299 -> 1200, 1300-1399 -> 1300, etc.
          const c = Math.floor(y / 100) * 100;
          present.add(c);
        }
      }
    } else {
      const cNum = parseInt(selectedCentury);
      const start = (cNum - 1) * 100;
      const end = start + 100;
      for (const a of roomFiltered) {
        const y = a.year || 0;
        if (y >= start && y < end) {
          const d = Math.floor(y / 10) * 10;
          present.add(d);
        }
      }
    }
    return Array.from(present).sort((a, b) => a - b);
  }, [roomFiltered, selectedCentury]);

  // Reset date drilldown when room or exhibition changes
  useEffect(() => {
    setSelectedCentury(null);
    setSelectedYearRange('ALL');
  }, [selectedRoomId, exhibition.id]);

  // Reset gallery pagination when filters change (filteredArtworks updates)
  useEffect(() => {
    setGalleryLimit(50);
  }, [filteredArtworks]);

  // Momentum scroll state
  const momentumRef = useRef<{ vel: number; raf: number }>({ vel: 0, raf: 0 });
  const applyMomentumRef = useRef<((delta: number) => void) | null>(null);
  // Alignment helpers for meta row under top controls
  const galleryRef = useRef<HTMLSpanElement | null>(null);
  const archiveRef = useRef<HTMLSpanElement | null>(null);
  const metaRowRef = useRef<HTMLDivElement | null>(null);
  const topBarRef = useRef<HTMLDivElement | null>(null);
  // descRef removed (description now in left header)
  const titleScrollRef = useRef<HTMLDivElement | null>(null);
  const titleRafRef = useRef<number | null>(null);
  const titleDirRef = useRef<number>(1);
  const didReseedRef = useRef(false);
  // gallerySeedRef removed (gallery extras no longer generated)
  // Fixed symmetric columns to keep metadata spread and avoid overlap
  const META_CREATOR_X = 250; // px
  const META_DATE_X = 500; // px
  const META_GAP = META_DATE_X - META_CREATOR_X; // 250px by default
  const FIXED_META_HEIGHT = 110; // px, lock meta row height to prevent layout shift (2 rows now)
  // Narrow screens: center metadata area by computing offset based on windowWidth
  const narrowMetaOffset = isMobile ? 12 : (isVeryNarrow ? Math.max(160, (windowWidth - 400) / 2) : (isNarrow ? Math.max(180, (windowWidth - 500) / 2) : 0));
  const metaPos = isVeryNarrow ? {
    title: narrowMetaOffset,
    creator: narrowMetaOffset,
    date: narrowMetaOffset + 120,
    dimension: narrowMetaOffset + 120
  } : isNarrow ? {
    title: narrowMetaOffset,
    creator: narrowMetaOffset,
    date: narrowMetaOffset + 160,
    dimension: narrowMetaOffset + 160
  } : {
    title: Math.max(0, META_CREATOR_X - META_GAP),
    creator: META_CREATOR_X,
    date: META_DATE_X,
    dimension: META_DATE_X + META_GAP,
  };
  const applyFallbackImage = useCallback((target: HTMLImageElement | null) => {
    if (!target) return;
    if (target.dataset.fallbackApplied === '1') return;
    target.dataset.fallbackApplied = '1';
    target.src = FALLBACK_ARTWORK_IMAGE;
    try {
      target.srcset = '';
    } catch { }
    target.removeAttribute('srcset');
  }, []);

  // Heuristic: try to upgrade known width-constrained URLs to larger sizes
  const upgradeImageUrl = useCallback((url?: string | null) => {
    if (!url) return '';
    let out = url;
    // Tate pattern: ...width-600.jpg → width-2000.jpg
    out = out.replace(/width-(\d+)(?=\.(?:jpg|jpeg|png|webp|avif)(?:$|\?))/i, 'width-2000');
    // Common query params: w= / width=
    out = out.replace(/([?&])(w|width)=(\d+)/i, (_, p1, p2) => `${p1}${p2}=2000`);
    // Heuristic: quality too low? bump q param if present
    out = out.replace(/([?&])(q|quality)=(\d+)/i, (_, p1, p2) => `${p1}${p2}=90`);
    return out;
  }, []);

  const parseIntendedWidth = useCallback((url?: string | null): number | undefined => {
    if (!url) return undefined;
    const m1 = url.match(/width-(\d+)(?=\.(?:jpg|jpeg|png|webp|avif)(?:$|\?))/i);
    if (m1) return parseInt(m1[1], 10);
    const m2 = url.match(/[?&](w|width)=(\d+)/i);
    if (m2) return parseInt(m2[2], 10);
    return undefined;
  }, []);

  const getLargestVariantUrl = useCallback((a: Artwork): { url: string; width: number } | null => {
    const pickMax = (rec?: Record<string, string> | undefined): { url: string; width: number } | null => {
      if (!rec) return null;
      const keys = Object.keys(rec).map((k) => Number(k)).filter((n) => Number.isFinite(n));
      if (keys.length === 0) return null;
      const maxW = Math.max(...keys);
      const url = rec[String(maxW)];
      return url ? { url, width: maxW } : null;
    };
    // Prefer jpg variants for original-like fidelity if available
    const jpg = pickMax(a.variants?.jpg);
    if (jpg) return jpg;
    // Otherwise try webp/avif largest (still better than tiny base)
    const webp = pickMax(a.variants?.webp);
    if (webp) return webp;
    const avif = pickMax(a.variants?.avif);
    if (avif) return avif;
    return null;
  }, []);

  const getBestFullUrl = useCallback((a: Artwork): { url: string; width?: number } => {
    // Use originalImage if available (National Gallery high-res)
    if ((a as any).originalImage) {
      return { url: ensureHttps((a as any).originalImage), width: undefined };
    }
    const v = getLargestVariantUrl(a);
    if (v) return { url: ensureHttps(v.url), width: v.width };
    const upgraded = upgradeImageUrl(a.image);
    const intended = parseIntendedWidth(upgraded) || parseIntendedWidth(a.image);
    return { url: ensureHttps(upgraded || a.image), width: intended };
  }, [getLargestVariantUrl, upgradeImageUrl, parseIntendedWidth]);
  const titleRef = useRef<HTMLDivElement | null>(null);
  const metaTitleValueRef = useRef<HTMLDivElement | null>(null);
  const creatorRef = useRef<HTMLDivElement | null>(null);
  const dateRef = useRef<HTMLDivElement | null>(null);
  const dimensionRef = useRef<HTMLDivElement | null>(null);
  // metaHeight locked; no state
  const [topBarHeight, setTopBarHeight] = useState<number>(36);
  const [metaMarginTop] = useState<number>(META_BASE_MARGIN);
  // description/positioning constants removed — layout now uses fixed left-top positions
  // Left positions now derive from metaPos.dimension
  // Vertical positions now follow the Archive line (top: 14)
  const stageMonitorRef = useRef<HTMLDivElement | null>(null);
  // Mobile archive horizontal scroll ref
  const mobileArchiveScrollRef = useRef<HTMLDivElement | null>(null);
  // Track if archive mode was already initialized (only init once per exhibition)
  const hasInitializedArchiveRef = useRef<boolean>(false);
  // Panorama drag state
  const [panoramaDragging, setPanoramaDragging] = useState(false);
  const panStartXRef = useRef<number>(0);
  const panStartIndexRef = useRef<number>(0);

  // Lock background scroll when modal is open
  useEffect(() => {
    const original = document.body.style.overflow;
    const prevModalOpen = document.body.dataset.modalOpen;
    document.body.style.overflow = "hidden";
    document.body.dataset.modalOpen = '1';
    return () => {
      document.body.style.overflow = original;
      if (prevModalOpen == null) delete document.body.dataset.modalOpen;
      else document.body.dataset.modalOpen = prevModalOpen;
    };
  }, []);

  // Load header image: prefer current artwork image, fallback to any local representativeImage
  useEffect(() => {
    let aborted = false;
    async function loadRep() {
      setRepImage(null);
      const preferItem = (exhibition as any)?.image && String((exhibition as any).image).trim();
      const localRep = (exhibition as any)?.representativeImage && String((exhibition as any).representativeImage).trim();
      const chosen = preferItem || localRep || null;
      if (!aborted && chosen) setRepImage(chosen);
    }
    loadRep();
    return () => { aborted = true; };
  }, [exhibition]);

  // Reset progressive state & load high-res when selected artwork changes
  useEffect(() => {
    const currentArt = (() => {
      if (!filteredArtworks.length) return null;
      return filteredArtworks[Math.min(selectedIndex, filteredArtworks.length - 1)];
    })();
    setMainLoaded(false);
    if (!currentArt || !currentArt.image) return;
    let cancelled = false;
    const hi = new Image();
    hi.decoding = 'async';
    hi.loading = 'eager';
    hi.src = currentArt.image;
    hi.onload = () => {
      if (cancelled) return;
      setMainLoaded(true);
      if (mainImgRef.current) {
        // Swap to full-res if still on low-res
        if (mainImgRef.current.getAttribute('data-hi') !== '1') {
          mainImgRef.current.src = currentArt.image;
          mainImgRef.current.setAttribute('data-hi', '1');
        }
      }
    };
    hi.onerror = () => { if (!cancelled) setMainLoaded(true); };
    return () => { cancelled = true; };
  }, [selectedIndex, filteredArtworks]);

  // History integration: when modal opens we push a modal state so refresh keeps modal
  // and back navigation can restore the underlying detail panel instead of navigating away.
  const didHistoryInitRef = useRef(false);
  useEffect(() => {
    if (didHistoryInitRef.current) return; // StrictMode-safe: run once per mount
    didHistoryInitRef.current = true;
    // Save the current history state as underlying state (hash/scroll) then push modal state
    try {
      const underlying = {
        hash: window.location.hash,
        scrollY: window.scrollY,
      };
      // merge underlying into current state
      const base = Object.assign({}, window.history.state || {});
      base.underlying = underlying;
      // replace current entry with one that contains underlying metadata
      window.history.replaceState(base, document.title);

      // push modal-specific state once; avoid duplicates to prevent double-close requirement
      const current = (window.history.state as any) || {};
      const guardKey = `modalGuard_${exhibition.id}`;
      const alreadyModal = !!(current.modal && current.exhibitionId === exhibition.id);
      const alreadyPushed = sessionStorage.getItem(guardKey) === '1';
      if (!alreadyModal && !alreadyPushed) {
        const modalState = { ...current, modal: true, exhibitionId: exhibition.id, selectedIndex } as any;
        window.history.pushState(modalState, document.title);
        try { sessionStorage.setItem(guardKey, '1'); } catch { }
      }

      // No extra dispatch here; HomePage reads history.state on mount to auto-open

      const onPop = (_e: PopStateEvent) => {
        // Always treat back like close while modal is mounted
        try { onClose(); } catch { /* ignore */ }
      };

      window.addEventListener('popstate', onPop);
      return () => {
        window.removeEventListener('popstate', onPop);
        try { sessionStorage.removeItem(guardKey); } catch { }
      };
    } catch (e) {
      // ignore any history errors (some browsers restrict replaceState in certain navigations)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep selection reflected in history so forward/back updates selection
  useEffect(() => {
    try {
      const st = Object.assign({}, window.history.state || {});
      st.selectedIndex = selectedIndex;
      window.history.replaceState(st, document.title);
    } catch (e) { }
  }, [selectedIndex]);

  // Subscribe to Firestore artworks for this exhibition
  useEffect(() => {
    // DEBUG: Log exhibition ID
    console.log('[ExhibitionModal] exhibition.id =', exhibition.id);

    // British Museum Rooms archive: load from local scraped JSON
    if (exhibition.id === 'bm-archive-rooms') {
      (async () => {
        try {
          const res = await fetch('/data/british-museum-galleries.json', { cache: 'no-store' });
          if (!res.ok) throw new Error('Missing british-museum-galleries.json');
          const data = await res.json();
          const rooms: Array<{ id: string; title: string; items: any[] }> = Array.isArray(data.rooms) ? data.rooms : [];
          const list = rooms.flatMap((room) => {
            const rid = (room.id || room.title || 'default').toString();
            return (Array.isArray(room.items) ? room.items : []).map((it: any) => ({
              id: it.id || `${rid}-${Math.random().toString(36).slice(2)}`,
              name: it.name || it.title || 'Object',
              artist: it.artist || '',
              year: typeof it.year === 'number' ? it.year : 0,
              image: it.image || it.thumb || it.thumbnail,
              url: it.url,
              roomId: rid,
              exhibitionName: exhibition.name,
              exhibitionTitle: exhibition.title,
            }));
          });
          // Keep only those with images to avoid empty tiles
          const withImages = list.filter((a) => !!a.image);
          setArtworks(withImages);
          setInitialized(true);
        } catch (e) {
          console.error('Failed to load BM galleries:', e);
          setInitialized(true);
        }
      })();
      return () => { };
    }
    // NPG Floor 3 Rooms archive: load from local scraped JSON
    if (exhibition.id === 'npg-floor3-rooms') {
      (async () => {
        try {
          const res = await fetch('/data/npg-floor3.json', { cache: 'no-store' });
          if (!res.ok) throw new Error('Missing npg-floor3.json');
          const data = await res.json();
          const rooms: Array<{ id: string; title: string; items: any[] }> = Array.isArray(data.rooms) ? data.rooms : [];
          const list = rooms.flatMap((room) => {
            const rid = (room.id || room.title || 'default').toString();
            return (Array.isArray(room.items) ? room.items : []).map((it: any, idx: number) => ({
              id: it.id || `${rid}-${idx}`,
              name: it.name || it.title || 'Artwork',
              artist: it.artist || '',
              year: typeof it.year === 'number' ? it.year : 0,
              image: it.image || it.thumb || it.thumbnail,
              url: it.url,
              roomId: rid,
              exhibitionName: exhibition.name,
              exhibitionTitle: exhibition.title,
            }));
          });
          const withImages = list.filter((a) => !!a.image);
          setArtworks(withImages);
          setInitialized(true);
        } catch (e) {
          console.error('Failed to load NPG rooms:', e);
          setInitialized(true);
        }
      })();
      return () => { };
    }
    // If a random image seed is requested via URL param, skip Firestore subscription and show 20 ephemeral images immediately
    const params = new URLSearchParams(window.location.search);
    const seedMode = params.get("seed");
    const allowSeed = exhibition.title?.trim() === "Korean Classical Art Collection" && (seedMode === "unsplash20" || seedMode === "picsum20");
    if (allowSeed) {
      const now = Date.now();
      const useUnsplash = seedMode === "unsplash20";
      const keywords = "art,antique,artifact,exhibition,museum,asian";
      const list: Artwork[] = Array.from({ length: 20 }, (_, i) => ({
        id: `ephemeral-${now}-${i}`,
        name: `Random ${i + 1}`,
        artist: "Random",
        year: 0,
        image: useUnsplash ? `https://source.unsplash.com/1200x900/?${keywords}&sig=${now + i}` : `https://picsum.photos/seed/${now + i}/1200/900`,
        roomId: "default",
        exhibitionName: exhibition.name,
        exhibitionTitle: exhibition.title,
      }));
      setArtworks(list);
      setInitialized(true);
      return () => { };
    }
    // Special case for Tate Collection feeds: load from local scraped JSON (bypass Firestore)
    if (exhibition.id === 'tm-perm-1' || exhibition.id === 'tm-perm-3') {
      (async () => {
        try {
          const dataFile = exhibition.id === 'tm-perm-1'
            ? '/data/tate-collection-highlights-artworks.json'
            : '/data/tate-artworks.json';
          const res = await fetch(dataFile, { cache: 'no-store' });
          if (!res.ok) throw new Error(`Failed to load ${dataFile}`);
          const data = await res.json();
          const toYear = (dateText: string | undefined) => {
            if (!dateText) return 0;
            const match = dateText.match(/(\d{4})/);
            return match ? parseInt(match[1], 10) : 0;
          };
          // Helper to convert URL-based ID to Firestore-compatible ID
          const sanitizeId = (rawId: string, idx: number) => {
            if (!rawId) return `tate-${idx}`;
            // If it's a URL, extract the accession number (e.g., "t15912" from the end)
            if (rawId.startsWith('http')) {
              const match = rawId.match(/([a-z]\d+)$/i);
              if (match) return `tate-${match[1]}`;
              // Fallback: use URL path slug
              const slug = rawId.split('/').pop() || '';
              return `tate-${slug.replace(/[^a-zA-Z0-9-_]/g, '')}`;
            }
            // Replace any invalid characters for Firestore document IDs
            return rawId.replace(/[\/\.#$\[\]]/g, '-');
          };
          const list: Artwork[] = Array.isArray(data.items)
            ? data.items.map((item: any, idx: number) => {
              const image = item.image || item.thumb || '';
              return {
                id: sanitizeId(item.id || item.url || '', idx),
                name: item.title || item.name || 'Untitled',
                artist: item.artist || item.creator || 'Unknown',
                year: toYear(item.dateText),
                date: item.dateText,
                image,
                thumb: item.thumb,
                dimension: item.dimensions,
                sourceUrl: item.url,
                roomId: 'default',
                exhibitionName: exhibition.name,
                exhibitionTitle: exhibition.title,
              };
            })
            : [];
          const withImages = list.filter((a) => !!a.image);
          setArtworks(withImages);
          setInitialized(true);
          try {
            localStorage.setItem(`artworks_${exhibition.id}`, JSON.stringify(withImages));
          } catch { }
        } catch (error) {
          console.error('Failed to load Tate artworks:', error);
          setInitialized(true);
        }
      })();
      return () => { };
    }
    // MFAB Collection (Duplicate handler removed - this was the old one pointing to test.json)
    // The correct handler is further down.
    /*
    if (exhibition.id === 'mfab-collection') {
       // Omitted old code that pointed to mfab-collection-test.json
       return () => { };
    }
    */

    // MNK Collection (National Museum in Krakow)
    if (exhibition.id === 'mnk-collection') {
      (async () => {
        try {
          const res = await fetch('/data/mnk-collection.json', { cache: 'no-store' });
          if (!res.ok) throw new Error('Failed to load MNK artworks');
          const data = await res.json();
          
          const toYear = (yearText: string | number | undefined) => {
            if (!yearText) return 0;
            const match = String(yearText).match(/(\d{4})/);
            return match ? parseInt(match[1], 10) : 0;
          };

          const normalizeAuthor = (authors: any[]) => {
            if (!authors || !authors.length) return 'Unknown';
            // clean clean name "Czajkowski, Józef (1872-1947)" -> "Józef Czajkowski"
            const author = authors[0].name || '';
            const clean = author.replace(/\s*\([^)]*\)/g, ''); // remove dates
            if (clean.includes(',')) {
              const [last, first] = clean.split(',').map((s: string) => s.trim());
              return first ? `${first} ${last}` : last;
            }
            return clean;
          };

          const getMNKCategory = (typeId: number) => {
             if (typeId === 100489 || typeId === 113913) return "Painting";
             if (typeId === 100566) return "Drawing";
             if (typeId === 99988) return "Posters"; // Use 'Posters' to match CATEGORY_MAP
             if (typeId === 100453) return "Photography";
             return "Artwork";
          };

          const list: Artwork[] = Array.isArray(data)
            ? data.map((item: any, idx: number) => ({
              id: String(item.id || item._id || `mnk-${idx}`),
              name: item.title || 'Untitled',
              artist: normalizeAuthor(item.authors),
              year: toYear(item.date),
              date: item.date || '',
              image: ensureHttps(item.image),
              sourceUrl: item.raw?.sourceUrl || `https://zbiory.mnk.pl/en/catalog/${item.id}`,
              roomId: 'default',
              exhibitionName: exhibition.name,
              exhibitionTitle: 'National Museum in Krakow Collection',
              description: '',
              medium: '',
              dimension: '',
              category: getMNKCategory(item.typeId),
              type: '2D', // Mostly 2D collection
            }))
            : [];
          
          const withImages = list.filter((a) => !!a.image);
          setArtworks(withImages);
          setInitialized(true);
        } catch (error) {
          console.error('Failed to load MNK artworks:', error);
          setInitialized(true);
        }
      })();
      return () => { };
    }

    // Museum of Fine Arts, Budapest Collection
    if (exhibition.id === 'mfab-collection') {
      (async () => {
        try {
          const res = await fetch('/data/mfab-collection.json', { cache: 'no-store' });
          if (!res.ok) throw new Error('Failed to load MFAB artworks');
          const data = await res.json();
          const items = data.artworks || [];
          
          const list: Artwork[] = items.map((item: any) => ({
             id: item.id,
             name: item.title,
             artist: item.artist,
             year: item.year || 0,
             date: item.dateStr || '',
             image: item.image,
             sourceUrl: item.url,
             roomId: 'default',
             exhibitionName: exhibition.name,
             exhibitionTitle: 'Museum of Fine Arts Collection',
             description: `Medium: ${item.medium}. Dimensions: ${item.dimensions}`,
             medium: item.medium,
             dimension: item.dimensions,
             category: item.classification || 'Artwork',
             type: '2D'
          }));
          
          setArtworks(list);
          setInitialized(true);
        } catch (err) {
            console.error('Failed to load MFAB artworks:', err);
            setInitialized(true);
        }
      })();
      return () => { };
    }

    // Royal Museums of Fine Arts of Belgium Collection
    if (exhibition.id === 'fine-arts-be-collection') {
      (async () => {
        try {
          const res = await fetch('/data/fine-arts-be-100.json', { cache: 'no-store' });
          if (!res.ok) throw new Error('Failed to load Fine Arts BE artworks');
          const data = await res.json();
          const items = data.items || [];
          
          const list: Artwork[] = items.map((item: any) => ({
             id: item.url,
             name: item.title,
             artist: item.artist,
             year: 0,
             date: item.meta?.['Date'] || '',
             image: item.image,
             sourceUrl: item.url,
             roomId: 'default',
             exhibitionName: exhibition.name,
             exhibitionTitle: 'Painting Collection Highlights',
             description: item.description,
             medium: item.meta?.['Technique'] || '',
             dimension: item.meta?.['Dimensions'] || '',
             category: item.objectType || 'Painting',
             type: '2D'
          }));
          
          setArtworks(list);
          setInitialized(true);
        } catch (err) {
            console.error('Failed to load Fine Arts BE artworks:', err);
            setInitialized(true);
        }
      })();
      return () => { };
    }

    // Gulbenkian Museum Collection
    if (exhibition.id === 'gulbenkian-collection') {
      (async () => {
        try {
          const res = await fetch('/data/gulbenkian-collection.json', { cache: 'no-store' });
          if (!res.ok) throw new Error('Failed to load Gulbenkian artworks');
          const data = await res.json();
          // Map to internal Artwork format
          const list: Artwork[] = Array.isArray(data) ? data.map((item: any) => {
            // Use scraped category or fallback to '2D' logic if still vague
            let category = item.category || 'Artwork';
            
            // Clean up some scraped values if they are too generic or wrong
            if (category === 'Purchased' || category === 'Gift' || category === 'Donation' || category === 'Unknown') {
                 // Re-run inference if the scraped "category" was actually Provenance/Credit Line (which seems to happen)
                 // The scraper picked up 'Purchased' likely from a wrong DL field or similar.
                 // Let's rely on our strong inference logic again here as a safety net.
                const t = (item.title || '').toLowerCase();
                const m = ((item.medium || '') + ' ' + (item.materials || '')).toLowerCase();

                if (m.includes('oil') || m.includes('canvas') || m.includes('tempera') || m.includes('painting') || t.includes('portrait')) category = 'Painting';
                else if (m.includes('sculpture') || m.includes('bronze') || m.includes('marble') || m.includes('statue') || m.includes('bust')) category = 'Sculpture';
                else if (m.includes('porcelain') || m.includes('ceramic') || m.includes('tile') || m.includes('glaze') || m.includes('stonepaste') || m.includes('faience')) category = 'Ceramics';
                else if (m.includes('textile') || m.includes('wool') || m.includes('silk') || m.includes('carpet') || m.includes('velvet') || m.includes('tapestry')) category = 'Textile';
                else if (m.includes('parchment') || m.includes('manuscript') || m.includes('vellum') || m.includes('book') || t.includes('quran') || t.includes('bible')) category = 'Manuscript';
                else if (m.includes('coin') || m.includes('medal') || m.includes('decadrachm') || m.includes('tetradrachm')) category = 'Numismatics';
                else if (m.includes('furniture') || m.includes('wood') || m.includes('chair') || m.includes('cabinet') || m.includes('commode') || m.includes('desk')) category = 'Furniture';
                else if (m.includes('glass') && !m.includes('enamel')) category = 'Glass';
                else if (m.includes('gold') || m.includes('silver') || m.includes('enamel') || m.includes('jewelry') || m.includes('gem')) category = 'Metalwork/Jewelry';
                else if (m.includes('drawing') || m.includes('pencil') || m.includes('chalk') || m.includes('pastel') || m.includes('watercolour')) category = 'Drawing';
                else if (m.includes('print') || m.includes('engraving') || m.includes('etching') || m.includes('lithograph')) category = 'Print';
                else category = 'Artwork';
            }

            return {
              id: item.id || Math.random().toString(36),
              name: item.title,
              artist: item.artist,
              year: item.date ? parseInt(item.date.match(/\d{4}/)?.[0] || '0') : 0,
              date: item.date,
              image: item.image,
              sourceUrl: item.url,
              medium: item.medium,
              dimension: item.dimensions,
              roomId: 'default',
              exhibitionName: exhibition.name,
              exhibitionTitle: 'Founder\'s Collection',
              category: category,
              type: '2D'
            };
          }) : [];

          const withImages = list.filter((a) => !!a.image);
          setArtworks(withImages);
          setInitialized(true);
        } catch (err) {
            console.error('Failed to load Gulbenkian artworks:', err);
            setInitialized(true);
        }
      })();
      return () => { };
    }

    // National Archaeological Museum (NAM) Collection
    if (exhibition.id === 'nam-collection') {
      (async () => {
        try {
          const res = await fetch('/data/nam-collection.json', { cache: 'no-store' });
          if (!res.ok) throw new Error('Failed to load NAM artworks');
          const data = await res.json();
          // Map to internal Artwork format
          const list: Artwork[] = Array.isArray(data) ? data.map((item: any) => {
            // Use scraped category (e.g. "Mycenaean Antiquities") as the Culture/Period
            // We'll try to infer a visual category (Sculpture, Metalwork, etc.) for the pill
            let visualCategory = 'Artifact';
            const m = ((item.medium || '') + ' ' + (item.description || '') + ' ' + (item.title || '')).toLowerCase();

            if (m.includes('sculpture') || m.includes('statue') || m.includes('bust') || m.includes('kouros') || m.includes('kore') || m.includes('stele') || m.includes('relief') || m.includes('marble head')) visualCategory = 'Sculpture';
            else if (m.includes('gold') || m.includes('silver') || m.includes('bronze') || m.includes('copper') || m.includes('jewelry') || m.includes('necklace') || m.includes('ring') || m.includes('dagger') || m.includes('mask')) visualCategory = 'Metalwork/Jewelry';
            else if (m.includes('ceramic') || m.includes('pottery') || m.includes('vase') || m.includes('amphora') || m.includes('krater') || m.includes('kylix') || m.includes('lekythos') || m.includes('clay') || m.includes('terracotta')) visualCategory = 'Ceramics';
            else if (m.includes('fresco') || m.includes('wall painting')) visualCategory = 'Fresco';
            else if (m.includes('figurine')) visualCategory = 'Figurine';
            
            // If we couldn't resolve a specific visual category, fallback to the scraped collection name
            if (visualCategory === 'Artifact') {
               visualCategory = item.category || 'Artifact';
            }

            return {
              id: item.id || Math.random().toString(36),
              name: item.title,
              artist: item.category || 'Unknown', // Use Period/Collection as "Artist"
              year: item.date ? parseInt(item.date.match(/\d{4}/)?.[0] || '0') : 0,
              date: item.date,
              image: item.image,
              sourceUrl: item.url,
              medium: item.medium,
              dimension: item.dimensions,
              roomId: 'default',
              exhibitionName: exhibition.name, // "National Archaeological Museum"
              exhibitionTitle: 'Collection Highlights',
              category: visualCategory,
              type: '2D'
            };
          }) : [];

          const withImages = list.filter((a) => !!a.image);
          setArtworks(withImages);
          setInitialized(true);
        } catch (err) {
            console.error('Failed to load NAM artworks:', err);
            setInitialized(true);
        }
      })();
      return () => { };
    }

    // Kunsthaus Zürich
    if (exhibition.id === 'kunsthaus-collection') {
       (async () => {
        try {
          const res = await fetch('/data/kunsthaus-collection.json', { cache: 'no-store' });
          if (!res.ok) throw new Error('Failed to load Kunsthaus artworks');
          const data = await res.json();
          const list: Artwork[] = Array.isArray(data) ? data.map((item: any) => ({
             id: item.id || `kh-${Math.random()}`,
             name: item.title,
             artist: item.artist,
             year: parseInt((item.date || '').match(/\d{4}/)?.[0] || '0'),
             date: item.date,
             image: item.image,
             sourceUrl: item.url,
             medium: item.medium,
             dimension: item.dimensions,
             roomId: 'default',
             exhibitionName: exhibition.name,
             exhibitionTitle: 'Collection Highlights',
             category: item.category || 'Artwork',
             type: '2D',
             onView: item.onView
          })) : [];
          setArtworks(list.filter(a => !!a.image));
          setInitialized(true);
        } catch (err) {
            console.error('Failed to load Kunsthaus artworks:', err);
            setInitialized(true);
        }
       })();
       return () => {};
    }

    // Tate St Ives Collection: load from local scraped JSON
    if (exhibition.id === 'tsi-perm-1') {
      (async () => {
        try {
          const res = await fetch('/data/tate-st-ives-artworks.json', { cache: 'no-store' });
          if (!res.ok) throw new Error('Failed to load Tate St Ives artworks');
          const data = await res.json();
          const toYear = (yearText: string | undefined) => {
            if (!yearText) return 0;
            const match = String(yearText).match(/(\d{4})/);
            return match ? parseInt(match[1], 10) : 0;
          };
          const list: Artwork[] = Array.isArray(data)
            ? data.map((item: any, idx: number) => ({
              id: item.id || `tsi-${idx}`,
              name: item.title || item.name || 'Untitled',
              artist: item.artist || 'Unknown',
              year: toYear(item.year),
              date: item.year,
              image: item.image,
              sourceUrl: item.url,
              roomId: 'default',
              exhibitionName: exhibition.name,
              exhibitionTitle: exhibition.title,
            }))
            : [];
          const withImages = list.filter((a) => !!a.image);
          setArtworks(withImages);
          setInitialized(true);
        } catch (error) {
          console.error('Failed to load Tate St Ives artworks:', error);
          setInitialized(true);
        }
      })();
      return () => { };
    }
    // Tate Britain Collection: load from local scraped JSON
    if (exhibition.id === 'tbc-perm-1') {
      (async () => {
        try {
          const res = await fetch('/data/tate-britain-artworks.json', { cache: 'no-store' });
          if (!res.ok) throw new Error('Failed to load Tate Britain artworks');
          const data = await res.json();
          const toYear = (yearText: string | number | undefined) => {
            if (!yearText) return 0;
            const match = String(yearText).match(/(\d{4})/);
            return match ? parseInt(match[1], 10) : 0;
          };
          const list: Artwork[] = Array.isArray(data)
            ? data.map((item: any, idx: number) => ({
              id: item.id || `tbc-${idx}`,
              name: item.title || item.name || 'Untitled',
              artist: item.artist || 'Unknown',
              year: toYear(item.year),
              date: item.year,
              image: item.image,
              sourceUrl: item.sourceUrl,
              roomId: 'default',
              exhibitionName: exhibition.name,
              exhibitionTitle: exhibition.title,
            }))
            : [];
          const withImages = list.filter((a) => !!a.image);
          setArtworks(withImages);
          setInitialized(true);
        } catch (error) {
          console.error('Failed to load Tate Britain artworks:', error);
          setInitialized(true);
        }
      })();
      return () => { };
    }

    // Kunsthistorisches Museum Vienna Collection
    if (exhibition.id === 'khm-collection') {
      (async () => {
        try {
          const res = await fetch('/data/khm-collection.json', { cache: 'no-store' });
          if (!res.ok) throw new Error('Failed to load KHM artworks');
          const data = await res.json();

          // Clean KHM artist names: remove "DNB", "DND" suffixes and "(?)" markers
          const cleanKHMArtist = (artist: string) => {
            if (!artist) return 'Unknown';
            let cleaned = artist.trim();
            // Remove "DNB" or "DND" at the end (case insensitive)
            cleaned = cleaned.replace(/\s*(?:DNB|DND)\s*$/i, '');
            // Remove "(?)" anywhere in the name (with surrounding spaces)
            cleaned = cleaned.replace(/\s*\(\?\)\s*/g, ' ');
            // Clean up extra spaces (multiple spaces to single space)
            cleaned = cleaned.replace(/\s+/g, ' ').trim();
            return cleaned || 'Unknown';
          };

          const list: Artwork[] = Array.isArray(data.objects)
            ? data.objects.map((item: any, idx: number) => ({
              id: item.id || `khm-${idx}`,
              name: item.title || 'Untitled',
              artist: cleanKHMArtist(item.artist),
              year: item.year || 0,
              date: item.dateStr || '',
              image: item.image || '',
              sourceUrl: item.url || '',
              roomId: item.room || 'default',
              exhibitionName: exhibition.name,
              exhibitionTitle: 'Kunsthistorisches Museum Collection',
              description: item.description || '',
              medium: item.medium || '',
              dimension: item.dimensions || '',
              category: item.classification || '',
              categories: item.onView ? ['On view'] : [],
              type: (item.classification === 'Painting' || item.classification === 'Relief') ? '2D' as const : '3D' as const,
            }))
            : [];

          const withImages = list.filter((a) => !!a.image);
          setArtworks(withImages);
          setInitialized(true);
        } catch (error) {
          console.error('Failed to load KHM artworks:', error);
          setInitialized(true);
        }
      })();
      return () => { };
    }

    // Belvedere Museum Collection
    if (exhibition.id === 'belvedere-collection') {
      (async () => {
        try {
          const res = await fetch('/data/belvedere-collection.json', { cache: 'no-store' });
          if (!res.ok) throw new Error('Failed to load Belvedere artworks');
          const data = await res.json();

          const list: Artwork[] = Array.isArray(data.artworks)
            ? data.artworks.map((item: any, idx: number) => ({
              id: item.id || `belvedere-${idx}`,
              name: item.name || 'Untitled',
              artist: item.artist || 'Unknown',
              year: item.year || 0,
              date: item.date || '',
              image: item.image || '',
              sourceUrl: item.sourceUrl || item.originalUrl || '',
              roomId: 'default',
              exhibitionName: exhibition.name,
              exhibitionTitle: 'Belvedere Collection',
              description: item.description || '',
              medium: item.medium || '',
              dimension: item.dimension || '',
              category: item.category || item.objectType || '',
              objectType: item.objectType || '',
              type: item.type || '3D' as const,
            }))
            : [];

          const withImages = list.filter((a) => !!a.image);
          setArtworks(withImages);
          setInitialized(true);
        } catch (error) {
          console.error('Failed to load Belvedere artworks:', error);
          setInitialized(true);
        }
      })();
      return () => { };
    }

    // ALBERTINA Museum Vienna – 5×100 sample groups (Refreshed 2026-01-14 with split Paintings/Sculpture)
    if (
      exhibition.id === 'albertina-paintings-100' ||
      exhibition.id === 'albertina-sculptures-100' ||
      exhibition.id === 'albertina-drawings-prints-100' ||
      exhibition.id === 'albertina-photography-100' ||
      exhibition.id === 'albertina-objects-installations-media-art-100' ||
      exhibition.id === 'albertina-poster-100'
    ) {
      (async () => {
        try {
          const jsonMap: Record<string, string> = {
            'albertina-paintings-100': '/data/albertina-paintings-100.json',
            'albertina-sculptures-100': '/data/albertina-sculptures-100.json',
            'albertina-drawings-prints-100': '/data/albertina-drawings-prints-100.json',
            'albertina-photography-100': '/data/albertina-photography-100.json',
            'albertina-objects-installations-media-art-100': '/data/albertina-objects-installations-media-art-100.json',
            'albertina-poster-100': '/data/albertina-poster-100.json',
          };
          const jsonFile = jsonMap[exhibition.id];
          if (!jsonFile) throw new Error('Unknown Albertina dataset id');

          const res = await fetch(jsonFile, { cache: 'no-store' });
          if (!res.ok) throw new Error(`Failed to load ${jsonFile}`);
          const data = await res.json();

          const toYear = (yearText: string | number | undefined) => {
            if (!yearText) return 0;
            const match = String(yearText).match(/(\d{4})/);
            return match ? parseInt(match[1], 10) : 0;
          };

          const items = Array.isArray(data.objects) ? data.objects : [];
          // Pre-calculate cleaner names and safe dates
          const list: Artwork[] = items.map((item: any, idx: number) => {
            // Albertina metadata often has date in metadata.Date
            const rawDate = item.date || (item.metadata && (item.metadata.Date || item.metadata['Date']));

            // Derive category and type from exhibition ID (since data doesn't have classification)
            let category = '';
            let type: '2D' | '3D' = '2D';

            if (exhibition.id.includes('paintings')) category = 'Painting';
            else if (exhibition.id.includes('sculptures')) { category = 'Sculpture'; type = '3D'; }
            else if (exhibition.id.includes('drawings')) category = 'Drawing & Print';
            else if (exhibition.id.includes('photography')) category = 'Photography';
            else if (exhibition.id.includes('objects')) { category = 'Object / Media Art'; type = '3D'; }
            else if (exhibition.id.includes('poster')) category = 'Poster';

            return {
              id: item.sourceId || item.id || `${exhibition.id}-${idx}`,
              name: item.title || item.name || 'Untitled',
              artist: cleanArtistName(item.artist || item.creator || ''),
              year: toYear(rawDate),
              date: cleanDateText(rawDate),
              image: ensureHttps(item.imageUrl),
              sourceUrl: item.url || item.sourceUrl || '',
              roomId: 'default',
              exhibitionName: exhibition.name,
              exhibitionTitle: exhibition.title,
              medium: item.medium || (item.metadata && (item.metadata.Medium || item.metadata['Medium'])) || '',
              dimension: item.dimensions || (item.metadata && (item.metadata.Dimensions || item.metadata['Dimensions'])) || '',
              category: category,
              metadata: item.metadata || undefined,
              type: type,
            };
          });

          const withImages = list.filter((a) => !!a.image);
          setArtworks(withImages);
          setInitialized(true);
          try {
            localStorage.setItem(`artworks_${exhibition.id}`, JSON.stringify(withImages));
          } catch { }
        } catch (error) {
          console.error('Failed to load Albertina artworks:', error);
          setInitialized(true);
        }
      })();
      return () => { };
    }

    // Leopold Museum Collection
    if (exhibition.id === 'leopold-museum-collection') {
      (async () => {
        try {
          // 전체 컬렉션 파일 우선 시도, 없으면 테스트 파일 사용
          let res = await fetch('/data/leopold-museum-collection.json', { cache: 'no-store' });
          if (!res.ok) {
            res = await fetch('/data/leopold-museum-collection-test.json', { cache: 'no-store' });
          }
          if (!res.ok) throw new Error('Failed to load Leopold Museum artworks');
          const data = await res.json();

          const toYear = (yearText: string | number | undefined) => {
            if (!yearText) return 0;
            const match = String(yearText).match(/(\d{4})/);
            return match ? parseInt(match[1], 10) : 0;
          };

          const items = Array.isArray(data.artworks) ? data.artworks : [];
          const list: Artwork[] = items.map((item: any, idx: number) => ({
            id: item.id || `leopold-${idx}`,
            name: item.name || 'Untitled',
            artist: cleanArtistName(item.artist || ''),
            year: toYear(item.year || item.date),
            date: cleanDateText(item.date || item.year),
            image: ensureHttps(item.image),
            sourceUrl: item.sourceUrl || item.originalUrl || '',
            roomId: 'default',
            exhibitionName: exhibition.name,
            exhibitionTitle: exhibition.title,
            description: item.description || '',
            medium: item.medium || '',
            dimension: item.dimension || '',
            category: item.category || item.objectType || '',
            type: (item.type as Artwork['type']) || '2D',
          }));

          const withImages = list.filter((a) => !!a.image);
          setArtworks(withImages);
          setInitialized(true);
        } catch (error) {
          console.error('Failed to load Leopold Museum artworks:', error);
          setInitialized(true);
        }
      })();
      return () => { };
    }

    // MMCA Seoul Collection: load from local scraped JSON
    if (exhibition.id === 'mmca-collection') {
      (async () => {
        try {
          const res = await fetch('/data/mmca-collection.json', { cache: 'no-store' });
          if (!res.ok) throw new Error('Failed to load MMCA artworks');
          const data = await res.json();
          const toYear = (yearText: string | number | undefined) => {
            if (!yearText) return 0;
            const match = String(yearText).match(/(\d{4})/);
            return match ? parseInt(match[1], 10) : 0;
          };

          const list: Artwork[] = Array.isArray(data.objects)
            ? data.objects.map((item: any, idx: number) => ({
              id: item.id || `mmca-${idx}`,
              name: item.title || item.name || 'Untitled',
              artist: item.artist || 'Unknown',
              year: toYear(item.year || item.date),
              date: item.date || '',
              image: item.image || '',
              sourceUrl: item.sourceUrl || '',
              roomId: 'default',
              exhibitionName: exhibition.name,
              exhibitionTitle: 'MMCA Collection',
              description: item.description || '',
              medium: item.medium || '',
              type: '2D' as const,
            }))
            : [];
          // MMCA API doesn't provide images, so show all items
          setArtworks(list);
          setInitialized(true);
        } catch (error) {
          console.error('Failed to load MMCA artworks:', error);
          setInitialized(true);
        }
      })();
      return () => { };
    }
    // Seoul Museum of Art (SeMA) Collection: load from local scraped JSON (6,167 artworks)
    if (exhibition.id === 'sema-collection') {
      (async () => {
        try {
          const res = await fetch('/data/seoul-museum-of-art-collection.json', { cache: 'no-store' });
          if (!res.ok) throw new Error('Failed to load Seoul Museum of Art artworks');
          const data = await res.json();
          const toYear = (yearText: string | number | undefined) => {
            if (!yearText) return 0;
            const match = String(yearText).match(/(\d{4})/);
            return match ? parseInt(match[1], 10) : 0;
          };

          // Category-based 2D/3D classification for SeMA
          const getSeMAType = (category: string): '2D' | '3D' => {
            if (!category) return '2D';
            const cat = category.toLowerCase();
            // 3D categories
            if (cat.includes('sculpture') || cat.includes('installation') ||
              cat.includes('craft') || cat.includes('조각') || cat.includes('설치') ||
              cat.includes('공예')) return '3D';
            // 2D categories (Painting, Photography, Korean Painting, Drawing & Print, Calligraphy, New Media, Design)
            return '2D';
          };

          const list: Artwork[] = Array.isArray(data)
            ? data.map((item: any, idx: number) => ({
              id: item.id || `sema-${idx}`,
              name: item.title || item.titleKorean || item.titleEnglish || 'Untitled',
              artist: item.artistName || 'Unknown',
              year: toYear(item.year),
              date: item.year || '',
              image: item.image ? (item.image.includes('size=') ? item.image.replace(/size=\d+/, 'size=1500') : (item.image.includes('?') ? item.image + '&size=1500' : item.image + '?size=1500')) : '',
              sourceUrl: item.sourceUrl || item.detailUrl || item.url || '',
              roomId: 'default',
              exhibitionName: exhibition.name,
              exhibitionTitle: 'Seoul Museum of Art Collection',
              description: '',
              medium: item.medium || '',
              dimension: item.dimensions || '',
              category: item.category || '',
              type: getSeMAType(item.category || ''),
            }))
            : [];
          const withImages = list.filter((a) => !!a.image);
          setArtworks(withImages);
          setInitialized(true);
        } catch (error) {
          console.error('Failed to load Seoul Museum of Art artworks:', error);
          setInitialized(true);
        }
      })();
      return () => { };
    }

    // National Museum of Korea Collection: load from split JSON files (bypass Cloudflare 25MB limit)
    if (exhibition.id === 'nmk-collection') {
      (async () => {
        try {
          // Load split parts (18 parts ~15MB each, 205,419 items total)
          const partCount = 18;
          const fetchPromises = Array.from({ length: partCount }, (_, i) =>
            fetch(`/data/national-museum-korea-part${i + 1}.json`, { cache: 'no-store' }).then(r => {
              if (!r.ok) throw new Error(`Failed to load part ${i + 1}`);
              return r.json();
            })
          );

          const parts = await Promise.all(fetchPromises);
          const data = parts.flat();

          // Set pagination state for "load more" functionality
          const ITEMS_PER_PAGE = 1000;
          setNmkTotalCount(data.length);
          setNmkTotalChunks(Math.ceil(data.length / ITEMS_PER_PAGE));
          setNmkCurrentChunk(1);

          const toYear = (yearText: string | number | undefined, period?: string) => {
            // First try to extract a 4-digit year
            if (yearText) {
              const match = String(yearText).match(/(\d{4})/);
              if (match) return parseInt(match[1], 10);
            }
            // For Korean museum items, map period names to approximate years
            if (period && KOREAN_PERIOD_TO_YEAR[period]) {
              return KOREAN_PERIOD_TO_YEAR[period];
            }
            return 0;
          };

          // Only load first batch for initial display
          const initialBatch = data.slice(0, ITEMS_PER_PAGE);
          const list: Artwork[] = initialBatch.map((item: any, idx: number) => ({
            id: item.id || `nmk-${idx}`,
            name: item.title || item.name || 'Untitled',
            artist: item.artist || 'Unknown',
            year: toYear(item.year || item.date, item.period),
            date: item.period ? formatPeriodWithDates(item.period) : (item.date || ''),
            image: ensureHttps(item.imageUrl || item.thumbnailUrl || item.image || ''),
            sourceUrl: item.sourceUrl || '',
            roomId: 'default',
            exhibitionName: exhibition.name,
            exhibitionTitle: 'National Museum of Korea Collection',
            description: item.description || '',
            medium: item.material || item.medium || '',
            category: item.material || '',  // Use material as category for NMK
            subcategory: item.category || '',  // Original category becomes subcategory
            excavationSite: item.excavationSite || '',
            type: MATERIAL_TO_TYPE[item.material] || '3D',  // Default to 3D for artifacts
          }));
          setArtworks(list);
          // Store full data for pagination
          (window as any).__nmkFullData = data;
          setInitialized(true);
        } catch (error) {
          console.error('Failed to load National Museum of Korea artworks:', error);
          setInitialized(true);
        }
      })();
      return () => { };
    }

    // Gyeongju National Museum Collection: load from split JSON files (bypass Cloudflare 25MB limit)
    if (exhibition.id === 'gyeongju-museum') {
      (async () => {
        try {
          // Load split parts (17 parts ~13MB each, 203,909 items total)
          const partCount = 17;
          const fetchPromises = Array.from({ length: partCount }, (_, i) =>
            fetch(`/data/gyeongju-museum-part${i + 1}.json`, { cache: 'no-store' }).then(r => {
              if (!r.ok) throw new Error(`Failed to load part ${i + 1}`);
              return r.json();
            })
          );

          const parts = await Promise.all(fetchPromises);
          const data = parts.flat();

          // Set pagination state for "load more" functionality
          const ITEMS_PER_PAGE = 1000;
          setNmkTotalCount(data.length);
          setNmkTotalChunks(Math.ceil(data.length / ITEMS_PER_PAGE));
          setNmkCurrentChunk(1);

          const toYear = (yearText: string | number | undefined, period?: string) => {
            if (yearText) {
              const match = String(yearText).match(/(\d{4})/);
              if (match) return parseInt(match[1], 10);
            }
            if (period && KOREAN_PERIOD_TO_YEAR[period]) {
              return KOREAN_PERIOD_TO_YEAR[period];
            }
            return 0;
          };

          // Only load first batch for initial display
          const initialBatch = data.slice(0, ITEMS_PER_PAGE);
          // Helper to get Korean title (prefer titleHanja which contains Korean, not Hanja)
          const getKoreanTitle = (item: any): string => {
            const titleHanja = item.titleHanja || '';
            const title = item.title || '';
            const hasKorean = (str: string) => /[\uAC00-\uD7AF]/.test(str);
            if (titleHanja && hasKorean(titleHanja)) return titleHanja;
            if (title && hasKorean(title)) return title;
            return title || titleHanja || item.name || 'Untitled';
          };

          const list: Artwork[] = initialBatch.map((item: any, idx: number) => ({
            id: item.id || `gyeongju-${idx}`,
            name: getKoreanTitle(item),
            artist: item.artist || 'Unknown',
            year: toYear(item.year || item.date, item.period),
            date: item.period ? formatPeriodWithDates(item.period) : (item.date || ''),
            image: ensureHttps(item.imageUrl || item.thumbnailUrl || item.image || ''),
            sourceUrl: item.sourceUrl || '',
            roomId: 'default',
            exhibitionName: exhibition.name,
            exhibitionTitle: 'Gyeongju National Museum Collection',
            description: item.description || '',
            medium: item.material || item.medium || '',
            category: item.material || '',
            subcategory: item.category || '',
            excavationSite: item.excavationSite || '',
            type: MATERIAL_TO_TYPE[item.material] || '3D',  // Default to 3D for artifacts
          }));
          setArtworks(list);
          // Store full data for pagination
          (window as any).__nmkFullData = data;
          setInitialized(true);
        } catch (error) {
          console.error('Failed to load Gyeongju National Museum artworks:', error);
          setInitialized(true);
        }
      })();
      return () => { };
    }
    // Buyeo National Museum Collection: load from split JSON files (bypass Cloudflare 25MB limit)
    if (exhibition.id === 'buyeo-museum') {
      (async () => {
        try {
          // Load split parts (14 parts ~5MB each, 68,091 items total)
          const partCount = 14;
          const fetchPromises = Array.from({ length: partCount }, (_, i) =>
            fetch(`/data/buyeo-museum-part${i + 1}.json`, { cache: 'no-store' }).then(r => {
              if (!r.ok) throw new Error(`Failed to load part ${i + 1}`);
              return r.json();
            })
          );

          const parts = await Promise.all(fetchPromises);
          const data = parts.flat();

          // Set pagination state for "load more" functionality
          const ITEMS_PER_PAGE = 1000;
          setNmkTotalCount(data.length);
          setNmkTotalChunks(Math.ceil(data.length / ITEMS_PER_PAGE));
          setNmkCurrentChunk(1);

          const toYear = (yearText: string | number | undefined, period?: string) => {
            if (yearText) {
              const match = String(yearText).match(/(\d{4})/);
              if (match) return parseInt(match[1], 10);
            }
            if (period && KOREAN_PERIOD_TO_YEAR[period]) {
              return KOREAN_PERIOD_TO_YEAR[period];
            }
            return 0;
          };

          // Helper to get Korean title - API has titleHanja field with Korean names for many items
          const getKoreanTitle = (item: any): string => {
            // Check if titleHanja is in Korean (not Hanja/Chinese characters)
            const titleHanja = item.titleHanja || '';
            const title = item.title || '';

            // Korean characters are in Unicode range AC00-D7AF (Hangul Syllables)
            const hasKorean = (str: string) => /[\uAC00-\uD7AF]/.test(str);

            // Prefer titleHanja if it contains Korean
            if (titleHanja && hasKorean(titleHanja)) {
              return titleHanja;
            }
            // Otherwise use title if it contains Korean
            if (title && hasKorean(title)) {
              return title;
            }
            // Fall back to title, then titleHanja, then default
            return title || titleHanja || item.name || 'Untitled';
          };

          // Only load first batch for initial display
          const initialBatch = data.slice(0, ITEMS_PER_PAGE);
          const list: Artwork[] = initialBatch.map((item: any, idx: number) => ({
            id: item.id || `buyeo-${idx}`,
            name: getKoreanTitle(item),
            artist: item.artist || 'Unknown',
            year: toYear(item.year || item.date, item.period),
            date: item.period ? formatPeriodWithDates(item.period) : (item.date || ''),
            image: ensureHttps(item.imageUrl || item.thumbnailUrl || item.image || ''),
            sourceUrl: item.sourceUrl || '',
            roomId: 'default',
            exhibitionName: exhibition.name,
            exhibitionTitle: 'Buyeo National Museum Collection',
            description: item.description || '',
            medium: item.material || item.medium || '',
            category: item.material || '',  // Use material as category
            subcategory: item.category || '',  // Original category becomes subcategory
            excavationSite: item.excavationSite || '',
            type: item.material ? (MATERIAL_TO_TYPE[item.material] || '3D') : '3D', // Default to 3D for artifacts
          }));
          setArtworks(list);
          // Store full data for pagination
          (window as any).__nmkFullData = data;
          setInitialized(true);
        } catch (error) {
          console.error('Failed to load Buyeo National Museum artworks:', error);
          setInitialized(true);
        }
      })();
      return () => { };
    }

    // Museo Reina Sofía Collection: load from split JSON files
    if (exhibition.id === 'reina-sofia-collection') {
      (async () => {
        try {
          // Load split parts (8 parts, 14,712 items total)
          const partCount = 8;
          const fetchPromises = Array.from({ length: partCount }, (_, i) =>
            fetch(`/data/reina-sofia-collection-part${i + 1}.json`, { cache: 'no-store' }).then(r => {
              if (!r.ok) throw new Error(`Failed to load part ${i + 1}`);
              return r.json();
            })
          );

          const parts = await Promise.all(fetchPromises);
          const data = parts.flat();

          // Set pagination state for "load more" functionality
          const ITEMS_PER_PAGE = 1000;
          setNmkTotalCount(data.length);
          setNmkTotalChunks(Math.ceil(data.length / ITEMS_PER_PAGE));
          setNmkCurrentChunk(1);

          const toYear = (dateText: string | undefined) => {
            if (!dateText) return 0;
            const match = String(dateText).match(/(\d{4})/);
            return match ? parseInt(match[1], 10) : 0;
          };

          // Detect artwork type from technique field
          const detectType = (technique: string): '2D' | '3D' | 'video' | 'unknown' => {
            const t = (technique || '').toLowerCase();
            if (/video|film|animation|projection/i.test(t)) return 'video';
            if (/sculpture|installation|object|assemblage|cast|bronze|marble|wood|metal|ceramic/i.test(t)) return '3D';
            if (/oil|painting|canvas|acrylic|watercolor|drawing|print|photograph|lithograph|etching|engraving|gouache|pastel|ink|collage/i.test(t)) return '2D';
            return '2D'; // Default to 2D for paintings gallery
          };

          // Only load first batch for initial display
          const initialBatch = data.slice(0, ITEMS_PER_PAGE);
          const list: Artwork[] = initialBatch.map((item: any, idx: number) => ({
            id: item.id || `reina-sofia-${idx}`,
            name: item.title || 'Untitled',
            artist: item.artist || 'Unknown',
            year: toYear(item.date),
            date: item.date || '',
            image: ensureHttps(item.imageUrl || item.thumbnailUrl || ''),
            sourceUrl: item.sourceUrl || '',
            roomId: String(item.room || '').trim() || 'default',
            exhibitionName: exhibition.name,
            exhibitionTitle: 'Museo Reina Sofía Collection',
            description: item.description || '',
            medium: item.technique || '',
            dimensions: item.dimensions || '',
            category: item.category || 'Artwork',
            type: detectType(item.technique),
          }));
          setArtworks(list);
          // Store full data for pagination
          (window as any).__nmkFullData = data;
          setInitialized(true);
        } catch (error) {
          console.error('Failed to load Museo Reina Sofía artworks:', error);
          setInitialized(true);
        }
      })();
      return () => { };
    }

    // Museo Nacional Thyssen-Bornemisza Collection 41: load from local scraped JSON
    if (exhibition.id === 'thyssen-collection-41') {
      (async () => {
        try {
          const res = await fetch('/data/museothyssen-collection-41.full.json', { cache: 'no-store' });
          if (!res.ok) throw new Error('Failed to load museothyssen-collection-41.full.json');
          const data = await res.json();

          const toYear = (dateText: string | undefined) => {
            if (!dateText) return 0;
            const match = String(dateText).match(/(\d{4})/);
            return match ? parseInt(match[1], 10) : 0;
          };

          const pickImage = (item: any): string => {
            const images = Array.isArray(item?.images) ? item.images : [];
            const candidates = images
              .map((im: any) => String(im?.url || ''))
              .filter(Boolean)
              .filter((url: string) => !/\.(pdf|svg)(\?|$)/i.test(url));
            const hi = candidates.find((url: string) => /\/sites\/default\/files\/imagen\//.test(url)) || candidates[0] || '';
            return ensureHttps(hi);
          };

          const detectType = (item: any): '2D' | '3D' | 'unknown' => {
            const t = String(item?.artworkType || item?.category || '').toLowerCase();
            if (/sculpt|object|installation|artifact/.test(t)) return '3D';
            if (/painting|drawing|print|photo|photograph/.test(t)) return '2D';
            return 'unknown';
          };

          const list: Artwork[] = Array.isArray(data)
            ? data.map((item: any, idx: number) => {
              const dateText = String(item?.dateCreated || item?.list?.dateText || '').trim();
              const roomName = String(item?.roomName || '').trim();
              const roomId = roomName || (item?.roomNumber != null ? `Sala ${item.roomNumber}` : 'default');
              return {
                id: String(item?.id || item?.detailUrl || `thyssen-${idx}`),
                name: String(item?.title || 'Untitled'),
                artist: String(item?.list?.artist || item?.artist || 'Unknown'),
                year: toYear(dateText),
                date: dateText,
                image: pickImage(item),
                sourceUrl: String(item?.detailUrl || item?.sourcePageUrl || ''),
                roomId,
                exhibitionName: exhibition.name,
                exhibitionTitle: exhibition.title,
                description: String(item?.description || ''),
                medium: String(item?.medium || ''),
                dimension: String(item?.dimension || ''),
                category: String(item?.artworkType || ''),
                type: detectType(item),
              };
            })
            : [];

          const withImages = list.filter((a) => !!a.image);
          setArtworks(withImages);
          setInitialized(true);
        } catch (error) {
          console.error('Failed to load Thyssen collection 41 artworks:', error);
          setInitialized(true);
        }
      })();
      return () => { };
    }

    // Dulwich Picture Gallery Collection: load from local scraped JSON
    if (exhibition.id === 'dpg-1') {
      (async () => {
        try {
          const res = await fetch('/data/dulwich-collection.json', { cache: 'no-store' });
          if (!res.ok) throw new Error('Failed to load Dulwich artworks');
          const data = await res.json();
          const toYear = (yearText: string | number | undefined) => {
            if (!yearText) return 0;
            const match = String(yearText).match(/(\d{4})/);
            return match ? parseInt(match[1], 10) : 0;
          };

          // Detect artwork type: paintings are 2D, sculptures/objects are 3D
          const detectType = (title: string): '2D' | '3D' | 'unknown' => {
            if (/sculpture|bust|statue|figure|relief/i.test(title)) return '3D';
            if (/painting|portrait|landscape|still life|view|scene/i.test(title)) return '2D';
            return '2D'; // Dulwich is primarily a paintings gallery
          };

          const list: Artwork[] = Array.isArray(data.objects)
            ? data.objects.map((item: any, idx: number) => ({
              id: item.id || `dpg-${idx}`,
              name: item.title || item.name || 'Untitled',
              artist: item.artist || 'Unknown',
              year: toYear(item.year),
              date: item.year,
              image: item.image,
              sourceUrl: item.url,
              roomId: 'default',
              exhibitionName: exhibition.name,
              exhibitionTitle: exhibition.title,
              type: detectType(item.title || ''),
            }))
            : [];
          const withImages = list.filter((a) => !!a.image);
          setArtworks(withImages);
          setInitialized(true);
        } catch (error) {
          console.error('Failed to load Dulwich artworks:', error);
          setInitialized(true);
        }
      })();
      return () => { };
    }
    // Hayward Gallery Collection: load from local scraped JSON
    if (exhibition.id === 'hayward-gallery-collection') {
      (async () => {
        try {
          const res = await fetch('/data/hayward-gallery-collection.json', { cache: 'no-store' });
          if (!res.ok) throw new Error('Failed to load Hayward Gallery artworks');
          const data = await res.json();
          const toYear = (yearText: string | number | undefined) => {
            if (!yearText) return 0;
            const match = String(yearText).match(/(\d{4})/);
            return match ? parseInt(match[1], 10) : 0;
          };

          // Patterns for archival/documentary materials (not actual artworks)
          const archivalPatterns = [
            /^installation view/i,
            /installation view:/i,
            /exterior view/i,
            /hayward exterior/i,
            /gallery exterior/i,
            /^maintenance information/i,
            /^letter /i,
            /^draft text/i,
            /^text for /i,
            /^text on /i,
            /^list of /i,
            /^document /i,
            /^sample letter/i,
            /^thank you letter/i,
            /^short exhibition description/i,
            /^exhibition guide/i,
            /^marketing leaflet/i,
            /^press cutting/i,
            /^press release/i,
            /^private view/i,
            /^exhibitions leaflet/i,
            /^diagram /i,
            /^floorplan /i,
            /^freesheet /i,
            /walk guide/i,
            /^notes on /i,
            /^note on /i,
            /^catalogue /i,
          ];

          const isArchival = (title: string) => {
            for (const pattern of archivalPatterns) {
              if (pattern.test(title)) return true;
            }
            return false;
          };

          // Detect artwork type for Hayward (contemporary art - mix of 2D/3D)
          const detectType = (title: string): '2D' | '3D' | 'unknown' => {
            if (/sculpture|installation|figure|object|astronomer|horse/i.test(title)) return '3D';
            if (/painting|drawing|print|photograph|portrait|canvas|paper/i.test(title)) return '2D';
            // Default to unknown for contemporary art
            return 'unknown';
          };

          const allObjects = Array.isArray(data.objects) ? data.objects : [];

          const list: Artwork[] = allObjects.map((item: any, idx: number) => ({
            id: item.id || `hayward-gac-${idx}`,
            name: item.title || item.name || 'Untitled',
            artist: item.artist === 'Additional Items' ? 'Unknown' : (item.artist || 'Unknown'),
            year: toYear(item.year),
            date: item.year,
            image: item.image,
            sourceUrl: item.url,
            roomId: 'default',
            exhibitionName: exhibition.name,
            exhibitionTitle: exhibition.title,
            isArchival: isArchival(item.title || ''),
            type: detectType(item.title || ''),
          }));
          const withImages = list.filter((a) => !!a.image);
          setArtworks(withImages);
          setInitialized(true);
        } catch (error) {
          console.error('Failed to load Hayward Gallery artworks:', error);
          setInitialized(true);
        }
      })();
      return () => { };
    }
    // Royal Academy Collection: load from local scraped JSON
    if (exhibition.id === 'ra-1') {
      (async () => {
        try {
          const res = await fetch('/data/royal-academy-collection.json', { cache: 'no-store' });
          if (!res.ok) throw new Error('Failed to load Royal Academy artworks');
          const data = await res.json();
          const toYear = (yearText: string | number | undefined) => {
            if (!yearText) return 0;
            const match = String(yearText).match(/(\d{4})/);
            return match ? parseInt(match[1], 10) : 0;
          };

          // Patterns for archival/documentary materials
          const archivalPatterns = [
            /^petition of/i,
            /^from '/i,
            /^students working/i,
            /^visitors queuing/i,
            /^working from life/i,
            /^record drawing/i,
            /^watercolour test paper/i,
            /^palette owned by/i,
            /exhibition room/i,
            /life class/i,
            /antique school/i,
            /painting school/i,
            /lecture on/i,
            /lecturing at/i,
            /sending in day/i,
            /photographed by/i,
            /on display with/i,
            /burlington house/i,
            /somerset house$/i,
            /^cast of/i,  // Casts of sculptures
          ];

          const isArchival = (title: string) => {
            for (const pattern of archivalPatterns) {
              if (pattern.test(title)) return true;
            }
            return false;
          };

          // Detect artwork type: paintings/drawings are 2D, sculptures are 3D
          const detectType = (title: string): '2D' | '3D' | 'unknown' => {
            if (/sculpture|bust|figure|statue|horse|rolling horse|cast of/i.test(title)) return '3D';
            if (/painting|portrait|landscape|seascape|study|drawing|watercolour|sketch/i.test(title)) return '2D';
            // Default to 2D for Royal Academy
            return '2D';
          };

          const allObjects = Array.isArray(data.objects) ? data.objects : [];

          const list: Artwork[] = allObjects.map((item: any, idx: number) => ({
            id: item.id || `ra-gac-${idx}`,
            name: item.title || item.name || 'Untitled',
            artist: item.artist || 'Unknown',
            year: toYear(item.year),
            date: item.year,
            image: item.image,
            sourceUrl: item.sourceUrl,
            roomId: 'default',
            exhibitionName: exhibition.name,
            exhibitionTitle: exhibition.title,
            isArchival: isArchival(item.title || ''),
            type: detectType(item.title || ''),
            youtubeId: item.youtubeId,
            mediaType: item.mediaType,
          }));
          const withImages = list.filter((a) => !!a.image);
          setArtworks(withImages);
          setInitialized(true);
        } catch (error) {
          console.error('Failed to load Royal Academy artworks:', error);
          setInitialized(true);
        }
      })();
      return () => { };
    }
    // Serpentine Gallery Collection: load from local scraped JSON
    if (exhibition.id === 'serp-collection') {
      (async () => {
        try {
          const res = await fetch('/data/serpentine-gallery-collection.json', { cache: 'no-store' });
          if (!res.ok) throw new Error('Failed to load Serpentine artworks');
          const data = await res.json();
          const toYear = (yearText: string | number | undefined) => {
            if (!yearText) return 0;
            const match = String(yearText).match(/(\d{4})/);
            return match ? parseInt(match[1], 10) : 0;
          };

          // Patterns for instructional/documentary materials (not visual artworks)
          const archivalPatterns = [
            /instruction/i,  // matches any "instruction" anywhere
            /do it/i,  // matches any "do it" title anywhere (including zero-width chars)
            /^screenshot/i,
            /^roundtable/i,
            /^recipe /i,
            /^untitled$/i,
            /^untitled \(/i,
            /^visas$/i,
            /report/i,
            /^mental floss/i,
            /^#faismoidanser$/i,
            /^cold$/i,
            /^treatment$/i,
            /^tear crystal$/i,
            /^shoot it$/i,
            /^delighted$/i,
            /^precedent piece$/i,
            /^homage to/i,
            /^xxl color/i,
            /^walk walk walk/i,
            /^three how to/i,
            /^how to /i,
            /^the masque-culotte$/i,
            /^what would/i,
            /^study for time$/i,
            /^dig a hole/i,
            /^to create sympathy/i,
            /^art as a generative/i,
            /^the potential for/i,
            /^potential deeper/i,
            /^deeper understanding/i,
            /^moving towards/i,
            /^consideration of/i,
            /^new connections/i,
            /^sheela \(na-gig\)/i,
            /^it's ok for/i,
            /^gilding the lily/i,
            /variations.*gionales/i,  // Variations régionales (handles Unicode normalization)
            /^park nights$/i,
            /^1993$/i,
            /^99 cents$/i,
            /^a snail walk/i,
            /^wish piece$/i,
            /^placing a dream/i,
            /^ten commandments/i,
            /les.*coliers/i,  // Les Écoliers (The Schoolchildren) - text piece
            /chatelet theatre/i,
            // French instruction texts (use flexible apostrophe matching)
            /^donne quelque/i,
            /^supprime un/i,
            /^changement de/i,
            /oublier l.instant/i,  // Oublier l'instant T
            /partage d.intimit/i,  // Partage d'intimité  
            /^vers new york/i,
            /^copier-coller$/i,
            /^protection au/i,
            /^rayon de soleil/i,
            /mesure$/i,  // À mesure, à mesure
            /^affiner la/i,
            /^cinq et cinq/i,
            // Roundtable/AI report illustrations by Jonny Glover
            /jonny glover/i,
          ];

          // Known artist-name-only entries (text/portrait cards) - title equals artist
          const artistNameOnlyTitles = [
            'Mohamed Bourouissa', 'Chino Amobi', 'Phillipe Parreno', 'Hans-Ulrich Obrist',
            'Anna Halprin', 'Simone Forti', 'Oscar Murillo', 'Rirkrit Tiravanija',
            'Christodoulos Panayiotou', 'Rachel Rose', 'Kwame Kwei-Armah', 'Evan Ifekoya',
            'Bertrand Lavier', 'Studio Formafantasma', 'Ian Cheng', 'Heman Chong',
            'Arca', 'ES Devlin', 'Aria Dean', 'David Lamelas', 'Geta Bratescu',
            'Rafael Bonachela', 'Carla Juaçaba', 'Edouard Glissant', 'Kelsey Lu',
            'Latai Taumoepeau', 'Saskia Havekes', 'Gerald Murnane', 'Dale Harding',
            'Megan Cope', 'James Bridle', 'Janet Laurence', 'Shilpa Gupta',
            'Nairy Baghramian', 'Complicité', 'Holly Herndon and Mat Dryhurst', 'BTS',
            'Precious Okoyomon, do it', 'Yue Yuan', 'Sophia Al Maria',
          ];

          // Detect text-based instruction pieces by checking artist field too
          const isArchival = (title: string, artist: string) => {
            // Check if title is just an artist name
            if (artistNameOnlyTitles.includes(title)) return true;
            // Check patterns
            for (const pattern of archivalPatterns) {
              if (pattern.test(title)) return true;
            }
            // If title equals artist name, it's likely a text card
            if (title === artist && title.length > 0) return true;
            // Check artist field for Jonny Glover illustrations
            if (/jonny glover/i.test(artist)) return true;
            return false;
          };

          // Detect artwork type: Pavilions are 3D, most others are 2D or unknown
          const detectType = (title: string): '2D' | '3D' | 'unknown' => {
            if (/pavilion/i.test(title) || /summer house/i.test(title)) return '3D';
            if (/tower/i.test(title) || /sculpture/i.test(title)) return '3D';
            // Zaha Hadid architectural works
            if (/tektonik/i.test(title) || /isometric/i.test(title)) return '2D';
            if (/earth perspectives/i.test(title)) return '2D';
            // Default to unknown for mixed collections
            return 'unknown';
          };

          const allObjects = Array.isArray(data.objects) ? data.objects : [];

          const list: Artwork[] = allObjects.map((item: any, idx: number) => ({
            id: item.id || `serp-gac-${idx}`,
            name: item.title || item.name || 'Untitled',
            artist: item.artist || 'Unknown',
            year: toYear(item.year),
            date: item.year,
            image: item.image,
            sourceUrl: item.sourceUrl,
            roomId: 'default',
            exhibitionName: exhibition.name,
            exhibitionTitle: exhibition.title,
            isArchival: isArchival(item.title || '', item.artist || ''),
            type: detectType(item.title || ''),
            youtubeId: item.youtubeId,
            mediaType: item.mediaType,
          }));
          const withImages = list.filter((a) => !!a.image);
          setArtworks(withImages);
          setInitialized(true);
        } catch (error) {
          console.error('Failed to load Serpentine artworks:', error);
          setInitialized(true);
        }
      })();
      return () => { };
    }
    // Courtauld Gallery Collection: load from local scraped JSON
    if (exhibition.id === 'cg-1') {
      (async () => {
        try {
          const res = await fetch('/data/courtauld-gallery-collection.json', { cache: 'no-store' });
          if (!res.ok) throw new Error('Failed to load Courtauld artworks');
          const data = await res.json();
          const toYear = (yearText: string | number | undefined) => {
            if (!yearText) return 0;
            const match = String(yearText).match(/(\d{4})/);
            return match ? parseInt(match[1], 10) : 0;
          };

          // Detect artwork type for Courtauld (mostly paintings, some decorative arts)
          const detectType = (title: string): '2D' | '3D' | 'unknown' => {
            // 3D objects
            if (/sculpture|bust|figure|statue|chest|bowl|dish|jar|jug|vase|pot|box|table|chair|kettle|burner|tile|bucket/i.test(title)) return '3D';
            // 2D works (paintings, drawings, prints)
            if (/painting|portrait|landscape|view|scene|study|drawing|print|album/i.test(title)) return '2D';
            // Default to 2D for Courtauld (primarily paintings)
            return '2D';
          };

          const allObjects = Array.isArray(data.objects) ? data.objects : [];

          const list: Artwork[] = allObjects.map((item: any, idx: number) => ({
            id: item.id || `cg-gac-${idx}`,
            name: item.title || item.name || 'Untitled',
            artist: item.artist || 'Unknown',
            year: toYear(item.year),
            date: item.year,
            image: item.image,
            sourceUrl: item.sourceUrl,
            roomId: 'default',
            exhibitionName: exhibition.name,
            exhibitionTitle: exhibition.title,
            type: detectType(item.title || ''),
            youtubeId: item.youtubeId,
            mediaType: item.mediaType,
          }));
          const withImages = list.filter((a) => !!a.image);
          setArtworks(withImages);
          setInitialized(true);
        } catch (error) {
          console.error('Failed to load Courtauld artworks:', error);
          setInitialized(true);
        }
      })();
      return () => { };
    }
    // Walker Art Gallery Collection: load from local scraped JSON
    if (exhibition.id === 'wag-collection') {
      (async () => {
        try {
          const res = await fetch('/data/walker-art-gallery-collection.json', { cache: 'no-store' });
          if (!res.ok) throw new Error('Failed to load Walker artworks');
          const data = await res.json();
          const toYear = (yearText: string | number | undefined) => {
            if (!yearText) return 0;
            const match = String(yearText).match(/(\d{4})/);
            return match ? parseInt(match[1], 10) : 0;
          };
          const allObjects = Array.isArray(data.objects) ? data.objects : [];
          const list: Artwork[] = allObjects.map((item: any, idx: number) => ({
            id: item.id || `wag-gac-${idx}`,
            name: item.title || item.name || 'Untitled',
            artist: item.artist || 'Unknown',
            year: toYear(item.year),
            date: item.year,
            image: item.image,
            sourceUrl: item.sourceUrl,
            roomId: 'default',
            exhibitionName: exhibition.name,
            exhibitionTitle: exhibition.title,
            type: '2D',
          }));
          const withImages = list.filter((a) => !!a.image);
          setArtworks(withImages);
          setInitialized(true);
        } catch (error) {
          console.error('Failed to load Walker artworks:', error);
          setInitialized(true);
        }
      })();
      return () => { };
    }
    // Scottish National Gallery Collection: load from local scraped JSON
    if (exhibition.id === 'sng-collection') {
      (async () => {
        try {
          const res = await fetch('/data/scottish-national-gallery-collection.json', { cache: 'no-store' });
          if (!res.ok) throw new Error('Failed to load Scottish National Gallery artworks');
          const data = await res.json();
          const toYear = (yearText: string | number | undefined) => {
            if (!yearText) return 0;
            const match = String(yearText).match(/(\d{4})/);
            return match ? parseInt(match[1], 10) : 0;
          };
          const allObjects = Array.isArray(data.objects) ? data.objects : [];
          const list: Artwork[] = allObjects.map((item: any, idx: number) => ({
            id: item.id || `sng-gac-${idx}`,
            name: item.title || item.name || 'Untitled',
            artist: item.artist || 'Unknown',
            year: toYear(item.year),
            date: item.year,
            image: item.image,
            sourceUrl: item.sourceUrl,
            roomId: 'default',
            exhibitionName: exhibition.name,
            exhibitionTitle: exhibition.title,
            type: '2D',
          }));
          const withImages = list.filter((a) => !!a.image);
          setArtworks(withImages);
          setInitialized(true);
        } catch (error) {
          console.error('Failed to load Scottish National Gallery artworks:', error);
          setInitialized(true);
        }
      })();
      return () => { };
    }
    // Scottish National Portrait Gallery Collection: load from local scraped JSON
    if (exhibition.id === 'snpg-collection') {
      (async () => {
        try {
          const res = await fetch('/data/scottish-national-portrait-gallery-collection.json', { cache: 'no-store' });
          if (!res.ok) throw new Error('Failed to load Scottish National Portrait Gallery artworks');
          const data = await res.json();
          const toYear = (yearText: string | number | undefined) => {
            if (!yearText) return 0;
            const match = String(yearText).match(/(\d{4})/);
            return match ? parseInt(match[1], 10) : 0;
          };
          const allObjects = Array.isArray(data.objects) ? data.objects : [];
          const list: Artwork[] = allObjects.map((item: any, idx: number) => ({
            id: item.id || `snpg-gac-${idx}`,
            name: item.title || item.name || 'Untitled',
            artist: item.artist || 'Unknown',
            year: toYear(item.year),
            date: item.year,
            image: item.image,
            sourceUrl: item.sourceUrl,
            roomId: 'default',
            exhibitionName: exhibition.name,
            exhibitionTitle: exhibition.title,
            type: '2D',
          }));
          const withImages = list.filter((a) => !!a.image);
          setArtworks(withImages);
          setInitialized(true);
        } catch (error) {
          console.error('Failed to load Scottish National Portrait Gallery artworks:', error);
          setInitialized(true);
        }
      })();
      return () => { };
    }
    // Scottish National Gallery of Modern Art Collection: load from local scraped JSON
    if (exhibition.id === 'sngma-collection') {
      (async () => {
        try {
          const res = await fetch('/data/scottish-national-gallery-of-modern-art-collection.json', { cache: 'no-store' });
          if (!res.ok) throw new Error('Failed to load Scottish National Gallery of Modern Art artworks');
          const data = await res.json();
          const toYear = (yearText: string | number | undefined) => {
            if (!yearText) return 0;
            const match = String(yearText).match(/(\d{4})/);
            return match ? parseInt(match[1], 10) : 0;
          };
          const allObjects = Array.isArray(data.objects) ? data.objects : [];
          const list: Artwork[] = allObjects.map((item: any, idx: number) => ({
            id: item.id || `sngma-gac-${idx}`,
            name: item.title || item.name || 'Untitled',
            artist: item.artist || 'Unknown',
            year: toYear(item.year),
            date: item.year,
            image: item.image,
            sourceUrl: item.sourceUrl,
            roomId: 'default',
            exhibitionName: exhibition.name,
            exhibitionTitle: exhibition.title,
            type: '2D',
          }));
          const withImages = list.filter((a) => !!a.image);
          setArtworks(withImages);
          setInitialized(true);
        } catch (error) {
          console.error('Failed to load Scottish National Gallery of Modern Art artworks:', error);
          setInitialized(true);
        }
      })();
      return () => { };
    }
    // British Museum Collection: load from local scraped JSON
    if (exhibition.id === 'bm-collection') {
      (async () => {
        try {
          const res = await fetch('/data/the-british-museum-collection.json', { cache: 'no-store' });
          if (!res.ok) throw new Error('Failed to load British Museum artworks');
          const data = await res.json();
          const toYear = (yearText: string | number | undefined) => {
            if (!yearText) return 0;
            const match = String(yearText).match(/(\d{4})/);
            return match ? parseInt(match[1], 10) : 0;
          };

          const allObjects = Array.isArray(data.objects) ? data.objects : [];

          const list: Artwork[] = allObjects.map((item: any, idx: number) => ({
            id: item.id || `bm-gac-${idx}`,
            name: item.title || item.name || 'Untitled',
            artist: item.artist === 'Additional Items' ? 'Unknown' : (item.artist || 'Unknown'),
            year: toYear(item.year),
            date: item.year,
            image: item.image,
            sourceUrl: item.sourceUrl,
            roomId: 'default',
            exhibitionName: exhibition.name,
            exhibitionTitle: exhibition.title,
            type: item.type || 'unknown',  // 2D, 3D, or unknown
          }));
          const withImages = list.filter((a) => !!a.image);
          setArtworks(withImages);
          setInitialized(true);
        } catch (error) {
          console.error('Failed to load British Museum artworks:', error);
          setInitialized(true);
        }
      })();
      return () => { };
    }
    // Musée d'Orsay Collection: load from local scraped JSON
    if (exhibition.id === 'orsay-collection') {
      (async () => {
        try {
          const res = await fetch('/data/orsay-collection.json', { cache: 'no-store' });
          if (!res.ok) throw new Error('Failed to load Orsay artworks');
          const data = await res.json();
          const toYear = (yearText: string | number | undefined) => {
            if (!yearText) return 0;
            const match = String(yearText).match(/(\d{4})/);
            return match ? parseInt(match[1], 10) : 0;
          };

          const allObjects = Array.isArray(data.objects) ? data.objects : [];

          const list: Artwork[] = allObjects.map((item: any, idx: number) => ({
            id: item.id || `orsay-${idx}`,
            name: item.title || item.name || 'Untitled',
            artist: item.artist || 'Unknown',
            year: toYear(item.year),
            date: item.year,
            image: item.image,
            dimension: item.dimensions,
            roomId: 'default',
            exhibitionName: exhibition.name,
            exhibitionTitle: exhibition.title,
          }));
          const withImages = list.filter((a) => !!a.image);
          setArtworks(withImages);
          setInitialized(true);
        } catch (error) {
          console.error('Failed to load Orsay artworks:', error);
          setInitialized(true);
        }
      })();
      return () => { };
    }
    // Musée de l'Orangerie Collection: load from local scraped JSON
    if (exhibition.id === 'orangerie-collection') {
      (async () => {
        try {
          const res = await fetch('/data/orangerie-collection.json', { cache: 'no-store' });
          if (!res.ok) throw new Error('Failed to load Orangerie artworks');
          const data = await res.json();
          const toYear = (yearText: string | number | undefined) => {
            if (!yearText) return 0;
            const match = String(yearText).match(/(\d{4})/);
            return match ? parseInt(match[1], 10) : 0;
          };

          const allObjects = Array.isArray(data.objects) ? data.objects : [];

          const list: Artwork[] = allObjects.map((item: any, idx: number) => ({
            id: item.id || `orangerie-${idx}`,
            name: item.title || item.name || 'Untitled',
            artist: item.artist || 'Unknown',
            year: toYear(item.year),
            date: item.year,
            image: item.image,
            dimension: item.dimensions,
            type: item.type || 'unknown',
            isArchival: item.isArchival || false,
            roomId: 'default',
            exhibitionName: exhibition.name,
            exhibitionTitle: exhibition.title,
          }));
          const withImages = list.filter((a) => !!a.image);
          setArtworks(withImages);
          setInitialized(true);
        } catch (error) {
          console.error('Failed to load Orangerie artworks:', error);
          setInitialized(true);
        }
      })();
      return () => { };
    }
    // Pinault Collection: load from local scraped JSON
    if (exhibition.id === 'pinault-collection') {
      (async () => {
        try {
          const res = await fetch('/data/pinault-collection.json', { cache: 'no-store' });
          if (!res.ok) throw new Error('Failed to load Pinault artworks');
          const data = await res.json();
          const toYear = (yearText: string | number | undefined) => {
            if (!yearText) return 0;
            const match = String(yearText).match(/(\d{4})/);
            return match ? parseInt(match[1], 10) : 0;
          };

          const allObjects = Array.isArray(data.objects) ? data.objects : [];

          const list: Artwork[] = allObjects.map((item: any, idx: number) => ({
            id: item.id || `pinault-${idx}`,
            name: item.title || item.name || 'Untitled',
            artist: item.artist || 'Unknown',
            year: toYear(item.year),
            date: item.year,
            image: item.image,
            dimension: item.dimensions,
            type: item.type || 'unknown',
            roomId: 'default',
            exhibitionName: exhibition.name,
            exhibitionTitle: exhibition.title,
          }));
          const withImages = list.filter((a) => !!a.image);
          setArtworks(withImages);
          setInitialized(true);
        } catch (error) {
          console.error('Failed to load Pinault artworks:', error);
          setInitialized(true);
        }
      })();
      return () => { };
    }
    // Centre Pompidou & MAM Paris & Louvre & Jacquemart-André & Marmottan & Picasso & Palais de Tokyo & Petit Palais & Rouen & Lille & MAMCS & Lyon & Grenoble & Bordeaux & Rodin & FLV & MAD Paris & Carnavalet & Condé & Versailles & Guimet & MAC/VAL & Mucem & Fabre & Chagall & La Piscine & Wallace & Soane & Vatican & Wales & Uffizi & Accademia & Palazzo Ducale & Doria Pamphilj Collections: load from local scraped JSON
    if (exhibition.id === 'pompidou-cinema-collection' || exhibition.id === 'pompidou-painting-collection' || exhibition.id === 'pompidou-drawing-collection' || exhibition.id === 'pompidou-newmedia-collection' || exhibition.id === 'pompidou-design-collection' || exhibition.id === 'mam-perm-painting' || exhibition.id === 'mam-perm-photography' || exhibition.id === 'louvre-painting-collection' || exhibition.id === 'jacquemart-andre-collection' || exhibition.id === 'marmottan-collection' || exhibition.id === 'picasso-drawings-collection' || exhibition.id === 'picasso-paintings-collection' || exhibition.id === 'picasso-sculptures-collection' || exhibition.id === 'picasso-prints-collection' || exhibition.id === 'palais-de-tokyo-collection' || exhibition.id === 'petit-palais-collection' || exhibition.id === 'petit-palais-drawings' || exhibition.id === 'rouen-mba-collection' || exhibition.id === 'lille-pba-collection' || exhibition.id.startsWith('mamcs-strasbourg-') || exhibition.id === 'lyon-collection' || exhibition.id === 'grenoble-paintings' || exhibition.id === 'grenoble-drawings' || exhibition.id === 'grenoble-photography' || exhibition.id === 'bordeaux-paintings' || exhibition.id === 'bordeaux-drawings' || exhibition.id === 'toulouse-lautrec-collection' || exhibition.id === 'granet-collection' || exhibition.id === 'rodin-peintures' || exhibition.id === 'rodin-sculptures' || exhibition.id === 'rodin-gravures' || exhibition.id === 'flv-collection' || exhibition.id === 'mad-paris-collection' || exhibition.id === 'carnavalet-collection' || exhibition.id === 'carnavalet-paintings' || exhibition.id === 'carnavalet-prints' || exhibition.id === 'musee-armee-peinture' || exhibition.id === 'musee-armee-photographie' || exhibition.id === 'musee-armee-dessin' || exhibition.id === 'conde-paintings' || exhibition.id === 'conde-drawings' || exhibition.id === 'versailles-collection' || exhibition.id === 'guimet-collection' || exhibition.id === 'macval-collection' || exhibition.id === 'mucem-prints' || exhibition.id === 'mucem-drawings' || exhibition.id === 'mucem-collection' || exhibition.id === 'fabre-collection' || exhibition.id === 'chagall-collection' || exhibition.id === 'piscine-collection' || exhibition.id === 'wallace-permanent' || exhibition.id === 'soane-paintings' || exhibition.id === 'vatican-collection' || exhibition.id === 'museum-wales-art' || exhibition.id === 'museum-wales-industry' || exhibition.id === 'uffizi-collection' || exhibition.id === 'uffizi-gallery-collection' || exhibition.id === 'pitti-palace-collection' || exhibition.id === 'accademia-collection' || exhibition.id === 'palazzo-ducale-collection' || exhibition.id === 'galleria-borghese-collection' || exhibition.id === 'borghese-arte-antica-collection' || exhibition.id === 'guggenheim-venice-collection' || exhibition.id === 'pinacoteca-brera-collection' || exhibition.id === 'gallerie-accademia-venice-collection' || exhibition.id === 'doria-pamphilj-collection' || exhibition.id === 'museo-egizio-collection' || exhibition.id === 'musei-capitolini-collection' || exhibition.id === 'novecento-della-ragione-collection' || exhibition.id === 'novecento-rosai-collection' || exhibition.id === 'ambrosiana-collection' || exhibition.id === 'museo-del-novecento-milan-collection' || exhibition.id === 'castello-di-rivoli-collection' || exhibition.id === 'museo-archeologico-napoli-collection' || exhibition.id === 'smb-humboldt-forum-collection' || exhibition.id === 'smb-altes-museum-collection' || exhibition.id === 'smb-neues-museum-collection' || exhibition.id === 'smb-gemaeldegalerie-collection' || exhibition.id === 'smb-alte-nationalgalerie-collection' || exhibition.id === 'smb-neue-nationalgalerie-collection' || exhibition.id === 'smb-bode-museum-collection' || exhibition.id === 'staedel-museum-collection' || exhibition.id === 'bruecke-museum-collection' || exhibition.id === 'alte-pinakothek-collection' || exhibition.id === 'neue-pinakothek-collection' || exhibition.id === 'pinakothek-moderne-collection' || exhibition.id === 'sammlung-schack-collection' || exhibition.id === 'staatsgalerien-collection' || exhibition.id === 'hamburger-kunsthalle-paintings' || exhibition.id === 'hamburger-kunsthalle-drawings' || exhibition.id === 'hamburger-kunsthalle-video' || exhibition.id === 'rijksmuseum-paintings' || exhibition.id === 'rijksmuseum-photography' || exhibition.id === 'rijksmuseum-drawings' || exhibition.id === 'rijksmuseum-prints' || exhibition.id === 'rijksmuseum-prints2-collection' || exhibition.id === 'vangogh-museum-collection' || exhibition.id === 'mauritshuis-collection' || exhibition.id === 'stedelijk-collection' || exhibition.id === 'kroller-muller-paintings' || exhibition.id === 'kroller-muller-film-video' || exhibition.id === 'kroller-muller-photography' || exhibition.id === 'wawel-collection') {
      const jsonFiles: Record<string, string> = {
        'pompidou-cinema-collection': '/data/pompidou-cinema-collection.json',
        'pompidou-painting-collection': '/data/pompidou-painting-collection.json',
        'pompidou-drawing-collection': '/data/pompidou-drawing-collection.json',
        'pompidou-newmedia-collection': '/data/pompidou-newmedia-collection.json',
        'pompidou-design-collection': '/data/pompidou-design-collection.json',
        'mam-perm-painting': '/data/mam-painting-collection.json',
        'mam-perm-photography': '/data/mam-photography-collection.json',
        'louvre-painting-collection': '/data/louvre-painting-collection.json',
        'jacquemart-andre-collection': '/data/jacquemart-andre-collection.json',
        'marmottan-collection': '/data/marmottan-collection.json',
        'picasso-drawings-collection': '/data/picasso-drawings-collection.json',
        'picasso-paintings-collection': '/data/picasso-paintings-collection.json',
        'picasso-sculptures-collection': '/data/picasso-sculptures-collection.json',
        'picasso-prints-collection': '/data/picasso-prints-collection.json',
        'picasso-bcn-collection': '/data/picasso-bcn-collection.json',
        'dali-foundation-collection': '/data/dali-foundation-collection.json',
        'caixaforum-collection': '/data/caixaforum-collection.json',
        'palais-de-tokyo-collection': '/data/palais-de-tokyo-collection.json',
        'petit-palais-collection': '/data/petit-palais-collection.json',
        'petit-palais-drawings': '/data/petit-palais-drawings.json',
        'rouen-mba-collection': '/data/rouen-mba.json',
        'lille-pba-collection': '/data/lille-pba.json',
        'mamcs-strasbourg-drawings-collection': '/data/mamcs-strasbourg-drawings-collection.json',
        'mamcs-strasbourg-paintings-collection': '/data/mamcs-strasbourg-paintings-collection.json',
        'mamcs-strasbourg-photography-collection': '/data/mamcs-strasbourg-photography-collection.json',
        'mamcs-strasbourg-graphic-design-collection': '/data/mamcs-strasbourg-graphic-design-collection.json',
        'lyon-collection': '/data/mba-lyon-collection.json',
        'grenoble-paintings': '/data/musee-grenoble-paintings-collection.json',
        'grenoble-drawings': '/data/musee-grenoble-drawings-collection.json',
        'grenoble-photography': '/data/musee-grenoble-photography-collection.json',
        'bordeaux-paintings': '/data/musba-bordeaux-paintings-collection.json',
        'bordeaux-drawings': '/data/musba-bordeaux-drawings-collection.json',
        'toulouse-lautrec-collection': '/data/toulouse-lautrec-collection.json',
        'granet-collection': '/data/musee-granet-collection.json',
        'rodin-peintures': '/data/rodin-peintures.json',
        'rodin-sculptures': '/data/rodin-sculptures.json',
        'rodin-gravures': '/data/rodin-gravures.json',
        'flv-collection': '/data/flv-collection.json',
        'mad-paris-collection': '/data/mad-paris-collection.json',
        'carnavalet-collection': '/data/carnavalet-collection.json',
        'carnavalet-paintings': '/data/carnavalet-paintings.json',
        'carnavalet-prints': '/data/carnavalet-prints.json',
        'musee-armee-peinture': '/data/musee-armee-peinture.json',
        'musee-armee-photographie': '/data/musee-armee-photographie.json',
        'musee-armee-dessin': '/data/musee-armee-dessin.json',
        'conde-paintings': '/data/musee-conde-paintings.json',
        'conde-drawings': '/data/musee-conde-drawings.json',
        'versailles-collection': '/data/versailles-collection.json',
        'guimet-collection': '/data/musee-guimet-collection.json',
        'macval-collection': '/data/macval-collection.json',
        'mucem-prints': '/data/mucem-prints.json',
        'mucem-drawings': '/data/mucem-drawings.json',
        'mucem-collection': '/data/mucem-collection.json',
        'fabre-collection': '/data/musee-fabre-collection.json',
        'chagall-collection': '/data/musee-chagall-collection.json',
        'piscine-collection': '/data/la-piscine-collection.json',
        'wallace-permanent': '/data/wallace-collection.json',
        'soane-paintings': '/data/soane-paintings.json',
        'vatican-collection': '/data/vatican-collection.json',
        'museum-wales-art': '/data/museum-wales-art.json',
        'museum-wales-industry': '/data/museum-wales-industry.json',
        'uffizi-collection': '/data/uffizi-collection.json',
        'uffizi-gallery-collection': '/data/uffizi-gallery-collection.json',
        'pitti-palace-collection': '/data/pitti-palace-collection.json',
        'accademia-collection': '/data/accademia-collection.json',
        'palazzo-ducale-collection': '/data/palazzo-ducale-collection.json',
        'galleria-borghese-collection': '/data/galleria-borghese-collection.json',
        'borghese-arte-antica-collection': '/data/borghese-arte-antica-collection.json',
        'guggenheim-venice-collection': '/data/guggenheim-venice-collection.json',
        'pinacoteca-brera-collection': '/data/pinacoteca-brera-collection.json',
        'gallerie-accademia-venice-collection': '/data/gallerie-accademia-venice-collection.json',
        'doria-pamphilj-collection': '/data/doria-pamphilj-collection.json',
        'museo-egizio-collection': '/data/museo-egizio-collection.json',
        'musei-capitolini-collection': '/data/musei-capitolini-collection.json',
        'novecento-della-ragione-collection': '/data/novecento-della-ragione-collection.json',
        'novecento-rosai-collection': '/data/novecento-rosai-collection.json',
        'ambrosiana-collection': '/data/ambrosiana-collection.json',
        'museo-del-novecento-milan-collection': '/data/museo-del-novecento-milan-collection.json',
        'castello-di-rivoli-collection': '/data/castello-di-rivoli-collection.json',
        'museo-archeologico-napoli-collection': '/data/museo-archeologico-napoli-collection.json',
        // Berlin - SMB Museums
        'smb-humboldt-forum-collection': '/data/smb-humboldt-forum-collection.json',
        'smb-altes-museum-collection': '/data/smb-altes-museum-collection.json',
        'smb-neues-museum-collection': '/data/smb-neues-museum-collection.json',
        'smb-gemaeldegalerie-collection': '/data/smb-gemaeldegalerie-collection.json',
        'smb-alte-nationalgalerie-collection': '/data/smb-alte-nationalgalerie-collection.json',
        'smb-neue-nationalgalerie-collection': '/data/smb-neue-nationalgalerie-collection.json',
        'smb-bode-museum-collection': '/data/smb-bode-museum-collection.json',
        // Frankfurt - Städel Museum
        'staedel-museum-collection': '/data/staedel-museum-collection.json',
        // Berlin - Brücke-Museum
        'bruecke-museum-collection': '/data/bruecke-museum-collection.json',
        // Munich - Pinakothek Collections
        'alte-pinakothek-collection': '/data/alte-pinakothek-collection.json',
        'neue-pinakothek-collection': '/data/neue-pinakothek-collection.json',
        'pinakothek-moderne-collection': '/data/pinakothek-moderne-collection.json',
        'sammlung-schack-collection': '/data/sammlung-schack-collection.json',
        'staatsgalerien-collection': '/data/staatsgalerien-collection.json',
        // Hamburg - Hamburger Kunsthalle
        'hamburger-kunsthalle-paintings': '/data/hamburger-kunsthalle-paintings.json',
        'hamburger-kunsthalle-drawings': '/data/hamburger-kunsthalle-drawings.json',
        'hamburger-kunsthalle-video': '/data/hamburger-kunsthalle-video.json',
        // Amsterdam - Rijksmuseum
        'rijksmuseum-paintings': '/data/rijksmuseum-paintings-collection.json',
        'rijksmuseum-photography': '/data/rijksmuseum-photography-collection.json',
        'rijksmuseum-drawings': '/data/rijksmuseum-drawings-collection.json',
        'rijksmuseum-prints': '/data/rijksmuseum-prints-collection.json',
        'rijksmuseum-prints2-collection': '/data/rijksmuseum-prints2-collection.json',
        // Amsterdam - Van Gogh Museum
        'vangogh-museum-collection': '/data/vangogh-museum-collection.json',
        // The Hague - Mauritshuis
        'mauritshuis-collection': '/data/mauritshuis-collection.json',
        // Amsterdam - Stedelijk Museum
        'stedelijk-collection': '/data/stedelijk-collection.json',
        // Otterlo - Kröller-Müller Museum
        'kroller-muller-paintings': '/data/kroller-muller-paintings.json',
        'kroller-muller-film-video': '/data/kroller-muller-film-video.json',
        'kroller-muller-photography': '/data/kroller-muller-photography.json',
        // Krakow - Wawel Royal Castle
        'wawel-collection': '/data/wawel-collection.json'
      };
      const jsonFile = jsonFiles[exhibition.id];
      (async () => {
        try {
          const res = await fetch(jsonFile, { cache: 'no-store' });
          if (!res.ok) throw new Error('Failed to load artworks');
          const data = await res.json();
          if (exhibition.id.startsWith('kroller-muller-')) {
            console.log(`[Kröller-Müller ${exhibition.id}] Data loaded:`, data);
            console.log(`[Kröller-Müller ${exhibition.id}] Items count:`, data.items?.length);
          }
          if (exhibition.id === 'wawel-collection') {
            console.log('[Wawel] Loaded data. Is array?', Array.isArray(data));
            if (Array.isArray(data) && data.length > 0) {
              console.log('[Wawel] First item sample:', data[0]);
            }
          }
          // Convert year text to number, handling BC years as negative
          const toYear = (yearText: string | number | undefined) => {
            if (!yearText) return 0;
            const str = String(yearText);
            // Check for BC indicator (BC, B.C., BCE)
            const isBC = RE_BC_CHECK.test(str);

            // Priority 1: Check for century patterns (e.g., "16th century" -> 1600, "16c" -> 1600)
            const centuryMatch = str.match(RE_CENTURY);
            if (centuryMatch) {
              const century = parseInt(centuryMatch[1], 10);
              // Convert century to year (16th century = 1500s -> return 1500)
              const year = (century - 1) * 100;
              return isBC ? -year : year;
            }

            // Priority 2: Look for valid 4-digit years (1000-2100 range)
            // Avoid matching 5+ digit numbers like "199654"
            const yearMatches = str.match(RE_YEAR_4);
            if (yearMatches) {
              for (const match of yearMatches) {
                const year = parseInt(match, 10);
                if (year >= 1000 && year <= 2100) {
                  return isBC ? -year : year;
                }
              }
            }

            // Priority 3: Try 3-digit years for ancient artifacts (e.g., "500 BC")
            const ancientMatch = str.match(RE_YEAR_3);
            if (ancientMatch) {
              const year = parseInt(ancientMatch[1], 10);
              return isBC ? -year : year;
            }

            return 0;
          };

          // Handle different JSON structures: array (Rouen/Lille/MAMCS) vs object with artworks/objects vs rooms structure (Wallace)
          const isArrayFormat = Array.isArray(data);
          let allObjects: any[] = [];
          if (isArrayFormat) {
            allObjects = data;
          } else if (Array.isArray(data.rooms)) {
            // Wallace Collection: rooms structure - flatten all artworks from all rooms with roomId
            allObjects = data.rooms.flatMap((room: any) =>
              (room.artworks || []).map((art: any) => ({
                ...art,
                roomName: room.originalName || room.name,
                roomId: room.name || room.id  // Use room name (Room 1, Room 2, etc.) as roomId
              }))
            );
          } else if (Array.isArray(data.items)) {
            allObjects = data.items;
          } else if (Array.isArray(data.artworks)) {
            allObjects = data.artworks;
          } else if (Array.isArray(data.objects)) {
            allObjects = data.objects;
          }
          if (exhibition.id.startsWith('kroller-muller-')) {
            console.log(`[Kröller-Müller ${exhibition.id}] allObjects count:`, allObjects.length);
            console.log(`[Kröller-Müller ${exhibition.id}] Sample item:`, allObjects[0]);
          }
          const is2D = exhibition.id === 'pompidou-painting' || exhibition.id === 'pompidou-drawing' || exhibition.id === 'pompidou-design' || exhibition.id === 'mam-perm-painting' || exhibition.id === 'mam-perm-photography' || exhibition.id === 'louvre-painting' || exhibition.id === 'jacquemart-collection' || exhibition.id === 'marmottan-collection' || exhibition.id === 'picasso-drawings' || exhibition.id === 'picasso-paintings' || exhibition.id === 'picasso-prints' || exhibition.id === 'palais-de-tokyo-collection' || exhibition.id === 'petit-palais-collection' || exhibition.id === 'rouen-mba-collection' || exhibition.id === 'lille-pba-collection' || exhibition.id.startsWith('mamcs-') || exhibition.id === 'lyon-collection' || exhibition.id.startsWith('grenoble-') || exhibition.id.startsWith('bordeaux-') || exhibition.id === 'toulouse-lautrec-collection' || exhibition.id === 'granet-collection' || exhibition.id === 'rodin-peintures' || exhibition.id === 'rodin-gravures' || exhibition.id === 'flv-collection' || exhibition.id.startsWith('musee-armee-') || exhibition.id.startsWith('conde-') || exhibition.id === 'versailles-collection' || exhibition.id === 'guimet-collection' || exhibition.id === 'macval-collection' || exhibition.id === 'wallace-permanent' || exhibition.id === 'brera-collection' || exhibition.id === 'hamburger-kunsthalle-paintings' || exhibition.id === 'hamburger-kunsthalle-drawings' || exhibition.id === 'rijksmuseum-paintings' || exhibition.id === 'rijksmuseum-photography' || exhibition.id === 'rijksmuseum-drawings' || exhibition.id === 'rijksmuseum-prints' || exhibition.id === 'rijksmuseum-prints2' || exhibition.id === 'vangogh-museum-collection' || exhibition.id === 'mauritshuis-collection' || exhibition.id === 'stedelijk-collection' || exhibition.id === 'kroller-muller-paintings' || exhibition.id === 'kroller-muller-photography' || exhibition.id === 'wawel-collection';
          const is3D = exhibition.id === 'picasso-sculptures' || exhibition.id === 'rodin-sculptures' || exhibition.id === 'borghese-arte-antica';
          const isVideo = exhibition.id === 'pompidou-cinema' || exhibition.id === 'hamburger-kunsthalle-video' || exhibition.id === 'kroller-muller-film-video';
          const isMAD = exhibition.id === 'mad-collection';
          const isCarnavalet = exhibition.id === 'carnavalet-collection';
          const isBorghese = exhibition.id === 'borghese-paintings' || exhibition.id === 'borghese-arte-antica';
          const isBrera = exhibition.id === 'brera-collection';

          // Borghese: clean up artist names - invalid entries like "art Roman" should show as Unknown
          const cleanBorgheseArtist = (artist: string) => {
            if (!artist) return 'Unknown';
            // Filter out invalid artist names
            const invalidPatterns = ['art Roman', 'art Greek', 'Unknown', 'unknown'];
            if (invalidPatterns.some(p => artist.trim().toLowerCase() === p.toLowerCase())) {
              return 'Unknown';
            }
            return artist.trim();
          };

          // Borghese/Brera: format century years - "3rd-4th century A.D." -> "4c", "2nd century B.C." -> "2c BC", "xviii secolo d c" -> "18c"
          const formatCenturyYear = (yearStr: string) => {
            if (!yearStr) return '';
            // If it's a regular year (4 digits), return as is
            if (/^\d{4}$/.test(yearStr.trim())) return yearStr.trim();

            // Brera format: "xviii secolo d c" (Roman numerals) -> convert to century
            const romanNumeralMatch = yearStr.toLowerCase().match(/^([ivxlcdm]+)\s*secolo/i);
            if (romanNumeralMatch) {
              const romanToArabic = (roman: string): number => {
                const romanMap: Record<string, number> = { i: 1, v: 5, x: 10, l: 50, c: 100, d: 500, m: 1000 };
                let result = 0;
                for (let i = 0; i < roman.length; i++) {
                  const current = romanMap[roman[i].toLowerCase()] || 0;
                  const next = romanMap[roman[i + 1]?.toLowerCase()] || 0;
                  result += current < next ? -current : current;
                }
                return result;
              };
              const century = romanToArabic(romanNumeralMatch[1]);
              const hasBC = /a\.?\s*c\.?|b\.?\s*c\.?/i.test(yearStr) && !/d\.?\s*c\.?/i.test(yearStr);
              return hasBC ? `${century}c BC` : `${century}c`;
            }

            // Match century patterns like "3rd-4th century", "2nd century", "1st-2nd century A.D."
            const centuryMatch = yearStr.match(/(\d+)(?:st|nd|rd|th)(?:-(\d+)(?:st|nd|rd|th))?\s*century/i);
            if (centuryMatch) {
              // Use the later century if range, otherwise the single century
              const century = centuryMatch[2] || centuryMatch[1];
              const hasBC = /B\.?C\.?/i.test(yearStr);
              return hasBC ? `${century}c BC` : `${century}c`;
            }

            // Return original if no century pattern found
            return yearStr;
          };

          // MAD Paris: clean up title and artist display
          const cleanMADTitle = (title: string) => {
            // "Cafetière à filtre - Cafetière-filtre" → "Cafetière à filtre"
            if (title.includes(' - ')) {
              return title.split(' - ')[0].trim();
            }
            return title;
          };
          const cleanMADArtist = (artist: string) => {
            // "Hoentschel, Georges (1855-1915) (céramiste)" → "Georges Hoentschel"
            // "Manufacture royale de porcelaine de Copenhague (1775- (fabricant)" → "Manufacture royale de porcelaine de Copenhague"
            // "1520/1530 (vers)" → "Unknown" (date-only entries)

            // Check if this is a date-only entry (starts with a number)
            if (/^\d/.test(artist)) {
              return 'Unknown';
            }

            // Step 1: Remove all parenthetical content (including malformed ones like "(1775-")
            let cleaned = artist
              .replace(/\s*\([^)]*\)\s*/g, '')  // Remove complete parentheses
              .replace(/\s*\([^)]*$/g, '')      // Remove unclosed parentheses at end
              .trim();

            // Step 2: Convert "Last, First" → "First Last" (only for simple 2-part names)
            if (cleaned.includes(', ')) {
              const parts = cleaned.split(', ');
              if (parts.length === 2 && !parts[0].includes(' ')) {
                // Only convert if last name is a single word (avoid "Company Name, Inc")
                cleaned = `${parts[1].trim()} ${parts[0].trim()}`;
              }
            }

            // Step 3: Remove trailing punctuation (dots, commas)
            cleaned = cleaned.replace(/[.,;:]+$/, '').trim();

            return cleaned || 'Unknown';
          };

          // Napoli Archaeological Museum: format BC dates and handle dynasty entries
          const isNapoli = exhibition.id === 'napoli-collection';
          const formatNapoliDate = (dateStr: string, title: string) => {
            // If no date but title contains dynasty info, extract from title
            if (!dateStr && title) {
              // Pattern: "19th Dynasty, (1295-1186 BC) inv. 2322"
              const dynastyMatch = title.match(/(\d+(?:st|nd|rd|th)\s+Dynasty.*?(?:\d{3,4}(?:-\d{3,4})?\s*BC)?)/i);
              if (dynastyMatch) {
                return dynastyMatch[1].replace(/\s*inv\.\s*\d+.*$/i, '').trim();
              }
            }
            return dateStr;
          };
          const cleanNapoliTitle = (title: string) => {
            // If title contains dynasty + inv number (date mistakenly used as title), return generic title
            if (/^\d+(?:st|nd|rd|th)\s+Dynasty.*inv\./i.test(title)) {
              return 'Egyptian Artifact';
            }
            return title;
          };

          // Kröller-Müller: clean title by removing year if it's already in the title
          const isKrollerMuller = exhibition.id.startsWith('kroller-muller-');
          const cleanKrollerMullerTitle = (title: string) => {
            if (!title) return title;
            // Remove patterns like ", 1882", ", c. 1900", ", 1886-1887" from the end
            // Keep "17th century" as it's descriptive, not just a year
            return title
              .replace(/,\s*c\.\s*\d{4}$/, '')  // ", c. 1882"
              .replace(/,\s*\d{4}-\d{4}$/, '')   // ", 1886-1887"
              .replace(/,\s*\d{4}$/, '')         // ", 1882"
              .trim();
          };

          const isWawel = exhibition.id === 'wawel-collection';

          const list: Artwork[] = allObjects.map((item: any, idx: number) => {
            let rawTitle = item.title || item.name || 'Untitled';
            let rawArtist = item.artist || item.artistName || 'Unknown';
            // Support both 'year' and 'date' field names (Uffizi/Accademia use 'date'), Brera uses 'dateStr'
            let yearOrDate = item.year || item.date || item.dateStr || '';
            // Support both 'medium' and 'technique' field names (Uffizi/Accademia use 'technique', Hamburger Kunsthalle uses 'material')
            let mediumOrTechnique = item.medium || item.material || item.technique || item.materials || '';
            // Support both 'dimensions' and 'size' field names (Uffizi uses 'size')
            const dimensionsOrSize = item.dimensions || item.size || '';
            // Category: support various field names (objectType for Städel, type for SMB Berlin, category for Borghese)
            let categoryValue = item.category || item.objectType || (typeof item.type === 'string' && !['2D', '3D', 'video', 'unknown'].includes(item.type) ? item.type : '') || '';

            if (isWawel) {
              // Wawel mapping
              // "tytul": title
              // "autor": array of objects [{ name: "Name (year)" }]
              // "creationDate": date string
              // "technika", "material": array of objects or MUSNET strings
              // "generated_image_url": image URL
              // "category": nested object { name: "..." }

              rawTitle = item.tytul || 'Untitled';

              if (item.autor && Array.isArray(item.autor) && item.autor.length > 0) {
                rawArtist = item.autor
                  .map((a: any) => a.name)
                  .filter((n: string) => n && !n.toLowerCase().includes('nieokreślony'))
                  .join(', ');
                if (!rawArtist) rawArtist = 'Unknown';
              } else {
                rawArtist = 'Unknown';
              }

              yearOrDate = item.creationDate || '';

              // Prefer MUSNET string fields as they are more reliable than the array fields
              const musnetParts = [];
              if (item.materialMUSNET) musnetParts.push(item.materialMUSNET);
              if (item.technikaMUSNET) musnetParts.push(item.technikaMUSNET);
              
              let mats = musnetParts.join(', ');

              // If MUSNET is empty, try the array fields (safely to avoid [object Object])
              if (!mats) {
                const techniques = (Array.isArray(item.technika) ? item.technika : []).map((t: any) => t.name || '');
                const materials = (Array.isArray(item.material) ? item.material : []).map((m: any) => m.name || '');
                mats = [...materials, ...techniques].filter(Boolean).join(', ');
              }

              // Update the variable used in return
              mediumOrTechnique = mats;
              
              // Map image
              item.image = item.generated_image_url;

              // Normalize category: use the last segment of the dash-separated path
              if (item.category && item.category.name) {
                const parts = item.category.name.split(' - ');
                categoryValue = parts[parts.length - 1].trim();
                // capitalize first letter
                categoryValue = categoryValue.charAt(0).toUpperCase() + categoryValue.slice(1);
              }
            }

            // Napoli special handling: fix titles that are actually dates
            if (isNapoli) {
              yearOrDate = formatNapoliDate(yearOrDate, rawTitle);
              rawTitle = cleanNapoliTitle(rawTitle);
            }

            // Kröller-Müller: clean title by removing year (year is already in title, so remove to avoid duplication)
            if (isKrollerMuller) {
              rawTitle = cleanKrollerMullerTitle(rawTitle);
            }

            return {
              id: item.id || `${exhibition.id}-${idx}`,
              name: isMAD ? cleanMADTitle(rawTitle) : rawTitle,
              artist: isMAD ? cleanMADArtist(rawArtist) : (isBorghese ? cleanBorgheseArtist(rawArtist) : rawArtist),
              year: toYear(yearOrDate),
              date: (isBorghese || isBrera) ? formatCenturyYear(yearOrDate) : yearOrDate,
              image: item.image || item.imageUrl || item.thumbnailUrl,  // Support image, imageUrl, and thumbnailUrl fields
              dimension: dimensionsOrSize,
              duration: item.duration,  // Video/film duration
              medium: mediumOrTechnique,
              technique: item.technique || '',
              materials: item.materials || '',
              type: isMAD ? '3D' : (isCarnavalet ? 'unknown' : (isVideo ? 'video' : (is2D ? (item.type || '2D') : (is3D ? (item.type || '3D') : (item.type || 'video'))))),
              roomId: item.room || item.roomId || item.exhibitionSpace || 'default',  // Brera uses 'room', Wallace uses 'roomId', SMB uses 'exhibitionSpace'
              category: categoryValue,
              exhibitionName: exhibition.name,
              exhibitionTitle: exhibition.title,
              // Source URL: support various field names (url for Pinakothek, sourceUrl for SMB, detailUrl for Städel/Brücke/Hamburger)
              sourceUrl: item.sourceUrl || item.detailUrl || item.url || '',
              // Rijksmuseum: onDisplay field
              ...(item.onDisplay !== undefined ? { onDisplay: item.onDisplay } : {}),
            };
          });
          // Debug: log Wallace Collection data
          if (exhibition.id === 'wallace-permanent') {
            console.log('[Wallace] allObjects:', allObjects.length);
            console.log('[Wallace] allObjects sample roomIds:', allObjects.slice(0, 5).map((o: any) => o.roomId));
            console.log('[Wallace] list:', list.length);
            console.log('[Wallace] list sample roomIds:', list.slice(0, 5).map((a: any) => a.roomId));
          }
          // Filter out items without images or with placeholder "no-image" URLs
          const withImages = list.filter((a) => !!a.image && !a.image.includes('no-image'));
          if (exhibition.id === 'wallace-permanent') {
            console.log('[Wallace] withImages:', withImages.length);
          }
          if (exhibition.id.startsWith('kroller-muller-')) {
            console.log(`[Kröller-Müller ${exhibition.id}] list count:`, list.length);
            console.log(`[Kröller-Müller ${exhibition.id}] withImages count:`, withImages.length);
            console.log(`[Kröller-Müller ${exhibition.id}] Sample list item:`, list[0]);
            console.log(`[Kröller-Müller ${exhibition.id}] Sample withImages item:`, withImages[0]);
          }
          setArtworks(withImages);
          setInitialized(true);
        } catch (error) {
          console.error('Failed to load artworks:', error);
          setInitialized(true);
        }
      })();
      return () => { };
    }
    // MEP Photography Collection: load from local scraped JSON
    if (exhibition.id === 'mep-photography') {
      (async () => {
        try {
          const res = await fetch('/data/mep-photography-collection.json', { cache: 'no-store' });
          if (!res.ok) throw new Error('Failed to load MEP artworks');
          const data = await res.json();
          const allObjects = Array.isArray(data.objects) ? data.objects : [];
          const list: Artwork[] = allObjects.map((item: any, idx: number) => {
            // 년도 범위인 경우 끝 년도만 사용 (1958-1960 → 1960)
            let yearStr = item.year || '';
            if (yearStr.includes('-')) {
              const parts = yearStr.split('-');
              yearStr = parts[parts.length - 1];
            }
            return {
              id: item.id || `mep-${idx}`,
              name: item.title || item.name || 'Untitled',
              artist: item.artist || 'Unknown',
              year: yearStr,
              date: yearStr,
              image: item.image,
              type: item.video ? 'video' : '2D',
              video: item.video || null,
              roomId: 'default',
              exhibitionName: exhibition.name,
              exhibitionTitle: exhibition.title,
            };
          });
          const withImages = list.filter((a) => !!a.image);
          setArtworks(withImages);
          setInitialized(true);
        } catch (error) {
          console.error('Failed to load MEP artworks:', error);
          setInitialized(true);
        }
      })();
      return () => { };
    }
    // Special case for V&A Painting collection: load from local JSON
    if (exhibition.id === 'vam-painting') {
      (async () => {
        try {
          const res = await fetch('/data/vam-paintings.json', { cache: 'no-store' });
          if (!res.ok) throw new Error('Failed to load local artworks');
          const data = await res.json();
          const list = (data.items || []).map((item: any) => ({
            id: item.id,
            name: item.name,
            artist: item.artist,
            year: item.year,
            image: item.image,
            roomId: "default",
            exhibitionName: exhibition.name,
            exhibitionTitle: exhibition.title,
          }));
          setArtworks(list);
          setInitialized(true);
        } catch (e) {
          console.error('Failed to load V&A paintings:', e);
          setInitialized(true);
        }
      })();
      return () => { };
    }
    // Special case for V&A Posters collection: load from local JSON
    if (exhibition.id === 'vam-posters') {
      (async () => {
        try {
          const res = await fetch('/data/vam-posters.json', { cache: 'no-store' });
          if (!res.ok) throw new Error('Failed to load local posters');
          const data = await res.json();
          const list = (data.items || []).map((item: any) => ({
            id: item.id,
            name: item.name,
            artist: item.artist,
            year: item.year,
            image: item.image,
            roomId: "default",
            exhibitionName: exhibition.name,
            exhibitionTitle: exhibition.title,
          }));
          setArtworks(list);
          setInitialized(true);
        } catch (e) {
          console.error('Failed to load V&A posters:', e);
          setInitialized(true);
        }
      })();
      return () => { };
    }
    // Special case for V&A Photographs collection: load from local JSON
    if (exhibition.id === 'vam-photographs') {
      (async () => {
        try {
          const res = await fetch('/data/vam-photographs.json', { cache: 'no-store' });
          if (!res.ok) throw new Error('Failed to load local photographs');
          const data = await res.json();
          const list = (data.items || []).map((item: any) => ({
            id: item.id,
            name: item.name,
            artist: item.artist,
            year: item.year,
            image: item.image,
            roomId: "default",
            exhibitionName: exhibition.name,
            exhibitionTitle: exhibition.title,
          }));
          setArtworks(list);
          setInitialized(true);
        } catch (e) {
          console.error('Failed to load V&A photographs:', e);
          setInitialized(true);
        }
      })();
      return () => { };
    }
    // Special case for V&A Portraits collection: load from local JSON
    if (exhibition.id === 'vam-portraits') {
      (async () => {
        try {
          const res = await fetch('/data/vam-portraits.json', { cache: 'no-store' });
          if (!res.ok) throw new Error('Failed to load local portraits');
          const data = await res.json();
          const list = (data.items || []).map((item: any) => ({
            id: item.id,
            name: item.name,
            artist: item.artist,
            year: item.year,
            image: item.image,
            roomId: "default",
            exhibitionName: exhibition.name,
            exhibitionTitle: exhibition.title,
          }));
          setArtworks(list);
          setInitialized(true);
        } catch (e) {
          console.error('Failed to load V&A portraits:', e);
          setInitialized(true);
        }
      })();
      return () => { };
    }

    // Guggenheim Bilbao Collection
    if (exhibition.id === 'guggenheim-bilbao-collection') {
      (async () => {
        try {
          const res = await fetch('/data/guggenheim-bilbao-collection.json', { cache: 'no-store' });
          if (!res.ok) throw new Error('Failed to load Guggenheim Bilbao data');
          const data = await res.json();
          const list = (data.artworks || []).map((item: any, idx: number) => {
            // Parse year
            const yearMatch = (item.date || '').match(/\d{4}/);
            const year = yearMatch ? parseInt(yearMatch[0], 10) : 0;
            const imageUrl = item.images && item.images.length > 0 ? item.images[0].url : '';

            // Convert artworkType to 2D/3D type
            const artworkType = item.artworkType || '';
            let type: '2D' | '3D' | undefined = undefined;
            if (artworkType) {
              const typeLower = artworkType.toLowerCase();
              if (['painting', 'drawing', 'photography', 'video', 'print', 'photograph'].includes(typeLower)) {
                type = '2D';
              } else if (['sculpture', 'installation'].includes(typeLower)) {
                type = '3D';
              }
            }

            // Use artworkType as roomId for filtering by type
            const roomId = artworkType || 'default';

            return {
              id: `gb-${idx}`,
              name: item.title,
              artist: item.artist,
              year,
              date: item.date,
              image: imageUrl,
              description: item.description,
              roomId: roomId,
              exhibitionName: exhibition.name,
              exhibitionTitle: exhibition.title,
              sourceUrl: item.detailUrl,
              location: item.metadata?.Location || item.location || '',
              medium: item.medium || '',
              dimensions: item.dimensions || '',
              artworkType: artworkType,
              category: artworkType,
              type: type,
              categories: item.categories || []
            };
          }).filter((item: any) => item.image);

          setArtworks(list);
          setInitialized(true);
        } catch (e) {
          console.error('Failed to load Guggenheim Bilbao data:', e);
          setInitialized(true);
        }
      })();
      return () => { };
    }

    // Picasso Museum Barcelona Collection
    if (exhibition.id === 'picasso-bcn-collection') {
      (async () => {
        try {
          const res = await fetch('/data/picasso-bcn-collection.json', { cache: 'no-store' });
          if (!res.ok) throw new Error('Failed to load Picasso Barcelona data');
          const data = await res.json();

          // Helper to check if URL is a valid artwork image (not an icon/logo)
          const isValidArtworkImage = (url: string) => {
            if (!url) return false;
            const lower = url.toLowerCase();
            if (lower.endsWith('.svg')) return false;
            if (/downloadficha|errorficha|icon|logo|placeholder|avatar|cookie|button|badge|arrow-left-circle/i.test(lower)) return false;
            return true;
          };

          const list = (data.artworks || []).map((item: any, idx: number) => {
            // Parse year
            const yearMatch = (item.date || '').match(/\d{4}/);
            const year = yearMatch ? parseInt(yearMatch[0], 10) : 0;
            // Filter out icon images and get the first valid image
            const validImages = (item.images || []).filter((img: any) => isValidArtworkImage(img.url || ''));
            const imageUrl = validImages.length > 0 ? validImages[0].url : '';

            // Convert objectType to 2D/3D type
            const objectType = item.objectType || item.category || '';
            let type: '2D' | '3D' | undefined = undefined;
            if (objectType) {
              const typeLower = objectType.toLowerCase();
              if (['drawing', 'engravings', 'lithographs', 'oil painting', 'linocut', 'print', 'photographs', 'collages'].includes(typeLower)) {
                type = '2D';
              } else if (['sculpture', 'pottery'].includes(typeLower)) {
                type = '3D';
              }
            }

            // Use objectType as roomId for filtering by type
            const roomId = objectType || 'default';

            return {
              id: `picasso-bcn-${idx}`,
              name: item.title,
              artist: item.artist,
              year,
              date: item.date,
              image: imageUrl,
              description: item.description,
              roomId: roomId,
              exhibitionName: exhibition.name,
              exhibitionTitle: exhibition.title,
              sourceUrl: item.detailUrl,
              location: item.location || '',
              medium: item.medium || '',
              dimensions: item.dimensions || '',
              artworkType: objectType,
              category: item.category || objectType,
              type: type,
              categories: item.categories || []
            };
          }).filter((item: any) => item.image);

          setArtworks(list);
          setInitialized(true);
        } catch (e) {
          console.error('Failed to load Picasso Barcelona data:', e);
          setInitialized(true);
        }
      })();
      return () => { };
    }

    // Salvador Dalí Foundation Collection
    if (exhibition.id === 'dali-foundation-collection') {
      (async () => {
        try {
          const res = await fetch('/data/dali-foundation-collection.json', { cache: 'no-store' });
          if (!res.ok) throw new Error('Failed to load Dalí Foundation data');
          const data = await res.json();

          const list = (data.artworks || []).map((item: any, idx: number) => {
            // Parse year from date
            const yearMatch = (item.date || '').match(/\d{4}/);
            const year = yearMatch ? parseInt(yearMatch[0], 10) : 0;

            // Get the first image (thumbnail from list page)
            const imageUrl = (item.images && item.images.length > 0) ? item.images[0].url : '';

            // Convert objectType/category to 2D/3D type (will be inferred by inferArtworkType if not set)
            const objectType = item.objectType || item.category || '';
            let type: '2D' | '3D' | undefined = undefined;
            if (objectType) {
              const typeLower = objectType.toLowerCase();
              if (['painting', 'drawing', 'print', 'photography', 'graphic'].some(t => typeLower.includes(t))) {
                type = '2D';
              } else if (['sculpture', 'object', 'installation', 'ceramic'].some(t => typeLower.includes(t))) {
                type = '3D';
              }
            }

            // Use objectType as roomId for filtering by type
            const roomId = objectType || 'default';

            return {
              id: `dali-foundation-${idx}`,
              name: item.title,
              artist: item.artist,
              year,
              date: item.date,
              image: imageUrl,
              description: item.description,
              roomId: roomId,
              exhibitionName: exhibition.name,
              exhibitionTitle: exhibition.title,
              sourceUrl: item.detailUrl,
              location: item.location || '',
              medium: item.medium || '',
              dimensions: item.dimensions || '',
              artworkType: objectType,
              category: item.category || objectType,
              type: type,
              categories: item.categories || []
            };
          }).filter((item: any) => item.image); // Filter out artworks with no image

          setArtworks(list);
          setInitialized(true);
        } catch (e) {
          console.error('Failed to load Dalí Foundation data:', e);
          setInitialized(true);
        }
      })();
      return () => { };
    }

    // CaixaForum Collection
    if (exhibition.id === 'caixaforum-collection') {
      (async () => {
        try {
          const res = await fetch('/data/caixaforum-collection.json', { cache: 'no-store' });
          if (!res.ok) throw new Error('Failed to load CaixaForum data');
          const data = await res.json();

          const list = (data.artworks || []).map((item: any, idx: number) => {
            // Parse year from date
            const yearMatch = (item.date || '').match(/\d{4}/);
            const year = yearMatch ? parseInt(yearMatch[0], 10) : 0;

            // Get the first image (thumbnail from list page)
            const imageUrl = (item.images && item.images.length > 0) ? item.images[0].url : '';

            // Use inferArtworkType for 2D/3D classification
            const objectType = item.objectType || item.category || '';

            return {
              id: `caixaforum-${idx}`,
              name: item.title,
              artist: item.artist,
              year,
              date: item.date,
              image: imageUrl,
              description: item.description,
              roomId: objectType || 'default',
              exhibitionName: exhibition.name,
              exhibitionTitle: exhibition.title,
              sourceUrl: item.detailUrl,
              location: item.location || '',
              medium: item.medium || '',
              dimensions: item.dimensions || '',
              artworkType: objectType,
              category: item.category || objectType,
              type: inferArtworkType(item), // Use inferArtworkType for 2D/3D classification
              categories: item.categories || []
            };
          }).filter((item: any) => item.image); // Filter out artworks with no valid image

          setArtworks(list);
          setInitialized(true);
        } catch (e) {
          console.error('Failed to load CaixaForum data:', e);
          setInitialized(true);
        }
      })();
      return () => { };
    }


    // National Gallery Permanent Collection: load from local JSON
    if (exhibition.id === 'ng-1') {
      (async () => {
        try {
          const res = await fetch('/data/national-gallery-permanent.json', { cache: 'no-store' });
          if (!res.ok) throw new Error('Failed to load National Gallery data');
          const data = await res.json();
          const list = (data.items || []).map((item: any) => ({
            id: item.id,
            name: item.name,
            artist: item.artist,
            year: item.year,
            image: item.image,
            originalImage: item.originalImage,
            roomId: item.roomId || "default",
            exhibitionName: exhibition.name,
            exhibitionTitle: exhibition.title,
            url: item.url
          }));
          setArtworks(list);
          setInitialized(true);
        } catch (e) {
          console.error('Failed to load National Gallery data:', e);
          setInitialized(true);
        }
      })();
      return () => { };
    }
    // Tate Britain Display exhibitions: load rooms and artworks from tate-britain.json
    if (exhibition.id.startsWith('tate-britain-display-')) {
      (async () => {
        try {
          const res = await fetch('/data/tate-britain.json', { cache: 'no-store' });
          if (!res.ok) throw new Error('Missing tate-britain.json');
          const data = await res.json();
          const items = Array.isArray(data.items) ? data.items : [];
          const displayExhibition = items.find((item: any) => item.id === exhibition.id);

          if (displayExhibition && Array.isArray(displayExhibition.rooms)) {
            const list: Artwork[] = [];
            const metas: RoomMeta[] = [];
            // Use sequential room numbers (1, 2, 3...) instead of actual building room numbers
            displayExhibition.rooms.forEach((room: any, roomIndex: number) => {
              const roomId = String(roomIndex + 1); // 1-based sequential numbering
              const hasArtworks = Array.isArray(room.artworks) && room.artworks.length > 0;

              // Store room metadata (including rooms without artworks)
              metas.push({
                id: roomId,
                name: room.name || `Room ${roomId}`,
                coverImage: room.coverImage,
                description: room.description,
                location: room.location,
                url: room.url,
                hasArtworks,
              });

              // Check if cover image represents the same artwork as any in the room
              // Compare by title (normalized) since cover and artwork may have different image URLs
              const coverTitle = room.coverTitle || '';
              const normalizedCoverTitle = coverTitle.toLowerCase().replace(/[^a-z0-9]/g, '');
              const isDuplicateCover = room.coverImage && hasArtworks &&
                room.artworks.some((a: any) => {
                  const artworkTitle = (a.title || '').toLowerCase().replace(/[^a-z0-9]/g, '');
                  return artworkTitle && normalizedCoverTitle && artworkTitle === normalizedCoverTitle;
                });

              // Add coverImage as the first artwork of each room (room intro/cover)
              // Only add if it's not a duplicate of an existing artwork
              if (room.coverImage && !isDuplicateCover) {
                const coverId = `room-cover-${roomId}-${list.length}`;
                // Use coverArtist/coverTitle/coverYear if available, otherwise fallback to room info
                const coverTitleFinal = room.coverTitle || room.name || `Room ${roomId}`;
                const coverArtist = room.coverArtist || room.location || 'Tate Britain';
                const coverYear = room.coverYear || 0;
                list.push({
                  id: coverId,
                  name: coverTitleFinal,
                  artist: coverArtist,
                  year: coverYear,
                  date: coverYear ? String(coverYear) : '',
                  image: room.coverImage,
                  roomId: roomId,
                  exhibitionName: exhibition.name,
                  exhibitionTitle: exhibition.title,
                  sourceUrl: room.url,
                });
              }

              if (hasArtworks) {
                for (const artwork of room.artworks) {
                  // Extract Tate work ID from URL
                  const urlMatch = artwork.url?.match(/([a-z]\d+)$/);
                  const tateId = urlMatch ? urlMatch[1] : null;

                  // Use image from JSON, or build from ID as fallback
                  let imageUrl = artwork.image || '';
                  if (!imageUrl && tateId) {
                    const idUpper = tateId.toUpperCase();
                    const prefix = idUpper.charAt(0);
                    const midPart = idUpper.substring(0, 3);
                    imageUrl = `https://media.tate.org.uk/art/images/work/${prefix}/${midPart}/${idUpper}_9.jpg`;
                  }

                  // Get year directly from JSON, or parse from year string if needed
                  let year = 0;
                  if (typeof artwork.year === 'number') {
                    year = artwork.year;
                  } else if (typeof artwork.year === 'string') {
                    const yearMatch = artwork.year.match(/\d{4}/);
                    year = yearMatch ? parseInt(yearMatch[0], 10) : 0;
                  }

                  // Use roomId + list index to ensure completely unique IDs
                  const uniqueId = `${tateId || 'artwork'}-room${roomId}-${list.length}`;
                  list.push({
                    id: uniqueId,
                    name: artwork.title || 'Untitled',
                    artist: artwork.artist || '',
                    year: year,
                    date: artwork.year ? String(artwork.year) : '',
                    image: imageUrl,
                    roomId: roomId,
                    exhibitionName: exhibition.name,
                    exhibitionTitle: exhibition.title,
                    sourceUrl: artwork.url,
                  });
                }
              }
            });
            setRoomMetas(metas);
            setArtworks(list);
            setInitialized(true);
          } else {
            console.error('Display exhibition not found:', exhibition.id);
            setInitialized(true);
          }
        } catch (e) {
          console.error('Failed to load Tate Britain display:', e);
          setInitialized(true);
        }
      })();
      return () => { };
    }
    // Tate Modern Display exhibitions: load rooms and artworks from tate-modern.json
    if (exhibition.id.startsWith('display-')) {
      (async () => {
        try {
          const res = await fetch('/data/tate-modern.json', { cache: 'no-store' });
          if (!res.ok) throw new Error('Missing tate-modern.json');
          const data = await res.json();
          const items = Array.isArray(data.items) ? data.items : [];
          const displayExhibition = items.find((item: any) => item.id === exhibition.id);

          if (displayExhibition && Array.isArray(displayExhibition.rooms)) {
            // Save enriched exhibition data (including descriptionHtml)
            setEnrichedExhibition(displayExhibition);
            const list: Artwork[] = [];
            const metas: RoomMeta[] = [];

            displayExhibition.rooms.forEach((room: any, roomIndex: number) => {
              const roomId = String(roomIndex + 1);
              const hasArtworks = Array.isArray(room.artworks) && room.artworks.length > 0;

              metas.push({
                id: roomId,
                name: room.name || `Room ${roomId}`,
                coverImage: room.coverImage,
                description: room.description,
                location: room.location,
                url: room.url,
                hasArtworks,
              });

              if (hasArtworks) {
                for (const artwork of room.artworks) {
                  const urlMatch = artwork.url?.match(/([a-z]\d+)$/i);
                  const tateId = urlMatch ? urlMatch[1] : null;

                  let imageUrl = artwork.image || '';
                  if (!imageUrl && tateId) {
                    const idUpper = tateId.toUpperCase();
                    const prefix = idUpper.charAt(0);
                    const midPart = idUpper.substring(0, 3);
                    imageUrl = `https://media.tate.org.uk/art/images/work/${prefix}/${midPart}/${idUpper}_9.jpg`;
                  }

                  let year = 0;
                  if (typeof artwork.year === 'number') {
                    year = artwork.year;
                  } else if (typeof artwork.year === 'string') {
                    const yearMatch = artwork.year.match(/\d{4}/);
                    year = yearMatch ? parseInt(yearMatch[0], 10) : 0;
                  }

                  const uniqueId = `${tateId || artwork.id || 'artwork'}-room${roomId}-${list.length}`;
                  list.push({
                    id: uniqueId,
                    name: artwork.title || 'Untitled',
                    artist: artwork.artist || '',
                    year: year,
                    date: artwork.year ? String(artwork.year) : '',
                    image: imageUrl,
                    roomId: roomId,
                    exhibitionName: exhibition.name,
                    exhibitionTitle: exhibition.title,
                    sourceUrl: artwork.url,
                  });
                }
              }
            });
            setRoomMetas(metas);
            setArtworks(list);
            setInitialized(true);
          } else {
            console.error('Tate Modern display exhibition not found:', exhibition.id);
            setInitialized(true);
          }
        } catch (e) {
          console.error('Failed to load Tate Modern display:', e);
          setInitialized(true);
        }
      })();
      return () => { };
    }
    // Temporary exhibitions with artworks array: use directly with proper metadata
    // Per Archive Rule 11 & 12: artworks need name, artist, year, image
    if (Array.isArray((exhibition as any).artworks) && (exhibition as any).artworks.length > 0) {
      const exhibitionArtworks = (exhibition as any).artworks as { id: string; name: string; artist: string; year: number; image: string }[];
      const list: Artwork[] = exhibitionArtworks.map((art) => ({
        id: art.id,
        name: art.name,
        artist: art.artist,
        year: art.year,
        image: art.image,
        roomId: 'gallery',
        exhibitionName: exhibition.name,
        exhibitionTitle: exhibition.title,
      }));
      setArtworks(list);
      setInitialized(true);
      return () => { };
    }
    // Fallback: Temporary exhibitions with galleryImages (legacy support)
    if (Array.isArray((exhibition as any).galleryImages) && (exhibition as any).galleryImages.length > 0) {
      const galleryImages = (exhibition as any).galleryImages as string[];
      const exhibitionName = exhibition.name || exhibition.title || 'Exhibition';
      const list: Artwork[] = galleryImages.map((imgUrl, idx) => {
        const filename = imgUrl.split('/').pop() || '';
        const nameFromFile = filename
          .replace(/\.(jpg|jpeg|png|webp|gif)$/i, '')
          .replace(/\.[a-z0-9]+\.(fill|width)-\d+x?\d*/i, '')
          .replace(/_/g, ' ')
          .replace(/-/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();

        return {
          id: `gallery-${exhibition.id}-${idx}`,
          name: nameFromFile || `${exhibitionName} - Image ${idx + 1}`,
          artist: (exhibition as any).artist || exhibitionName,
          year: 0,
          image: imgUrl,
          roomId: 'gallery',
          exhibitionName: exhibition.name,
          exhibitionTitle: exhibition.title,
        };
      });
      setArtworks(list);
      setInitialized(true);
      return () => { };
    }
    // 0) Prime from local cache immediately to avoid empty-state flash
    try {
      const cached = localStorage.getItem(`artworks_${exhibition.id}`);
      if (cached) {
        const cachedList = JSON.parse(cached) as Artwork[];
        const withImages = cachedList.filter(a => !!a.image);
        if (withImages.length > 0) {
          setArtworks(withImages);
          setInitialized(true);
        }
      }
    } catch { }
    // Subscribe to Firestore artworks for this exhibition
    const q = query(collection(db, "artworks"), where("exhibitionTitle", "==", exhibition.title));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: Artwork[] = [];
        snap.forEach((ds) => {
          const data = ds.data() as Artwork;
          // Ensure stable id exists; fall back to Firestore doc.id if missing
          const id = (data as any)?.id ? String((data as any).id) : ds.id;
          list.push({ ...data, id });
        });
        // Server truth: set directly from snapshot to avoid duplicates
        const withImages = list.filter(a => !!a.image);
        setArtworks(withImages);
        setInitialized(true);
        try {
          localStorage.setItem(`artworks_${exhibition.id}`, JSON.stringify(withImages));
        } catch { }
      },
      (error) => {
        console.error("Firestore onSnapshot error:", error);
        // Fallback to localStorage cache if available
        const cached = localStorage.getItem(`artworks_${exhibition.id}`);
        if (cached) {
          try {
            const cachedList = JSON.parse(cached) as Artwork[];
            setArtworks(cachedList.filter(a => !!a.image));
            setInitialized(true);
          } catch { setInitialized(true); }
        } else {
          setInitialized(true);
        }
      }
    );
    return () => {
      unsub();
    };
  }, [exhibition.id, exhibition.title]);

  // Load user-submitted artworks from exhibition_artworks collection
  useEffect(() => {
    const exhibitionId = exhibition.id;

    // Query exhibition_artworks where exhibitionId matches
    const q = query(
      collection(db, 'exhibition_artworks'),
      where('exhibitionId', '==', exhibitionId)
    );

    const unsub = onSnapshot(q, (snap) => {
      if (snap.empty) return;

      const userSubmissions: Artwork[] = [];
      snap.forEach((docSnap) => {
        const data = docSnap.data();
        userSubmissions.push({
          id: data.id || docSnap.id,
          name: data.name || data.title || 'User Submission',
          artist: data.artist || '',
          year: data.year || 0,
          image: data.image || '',
          dimensions: data.dimensions || '',
          materials: data.materials || '',
          roomId: 'user-submissions', // Default room for user submissions
          exhibitionName: data.exhibitionName || exhibition.name || '',
          exhibitionTitle: data.exhibitionName || exhibition.title || '',
        } as Artwork);
      });

      if (userSubmissions.length > 0) {
        setArtworks((prev) => {
          // Avoid duplicates by checking IDs
          const existingIds = new Set(prev.map(a => a.id));
          const newOnes = userSubmissions.filter(s => !existingIds.has(s.id));
          if (newOnes.length === 0) return prev;
          return [...prev, ...newOnes];
        });
      }
    }, (err) => {
      console.warn('Failed to load user submissions:', err);
    });

    return () => unsub();
  }, [exhibition.id, exhibition.name, exhibition.title]);

  // Ensure selected index is valid when artworks update
  useEffect(() => {
    if (filteredArtworks.length === 0) { setSelectedIndex(0); return; }
    setSelectedIndex((prev) => Math.min(prev, filteredArtworks.length - 1));
  }, [filteredArtworks.length]);

  // Prefetch neighbor images for smoother stage switching
  usePrefetchNeighbors(filteredArtworks as any[], selectedIndex, 1);


  useEffect(() => {
    if (typeof window === 'undefined') return;
    const supportsIdle = typeof (window as any).requestIdleCallback === 'function';
    const schedule: (cb: () => void) => number = supportsIdle
      ? (cb) => (window as any).requestIdleCallback(cb, { timeout: 800 })
      : (cb) => window.setTimeout(cb, 200);
    const cancel: (handle: number) => void = typeof (window as any).cancelIdleCallback === 'function'
      ? (handle) => (window as any).cancelIdleCallback(handle)
      : (handle) => window.clearTimeout(handle);

    idleDecodeHandlesRef.current.forEach(cancel);
    idleDecodeHandlesRef.current = [];

    const neighbors = [selectedIndex - 1, selectedIndex + 1];
    const seen = new Set<string>();
    neighbors.forEach((idx) => {
      if (idx < 0 || idx >= filteredArtworks.length) return;
      const url = filteredArtworks[idx]?.image;
      if (!url || seen.has(url)) return;
      seen.add(url);
      const handle = schedule(() => {
        try {
          const preload = new Image();
          preload.decoding = 'async';
          preload.loading = 'eager';
          preload.src = url;
          if (preload.decode) preload.decode().catch(() => { });
        } catch { }
      });
      idleDecodeHandlesRef.current.push(handle);
    });

    return () => {
      idleDecodeHandlesRef.current.forEach(cancel);
      idleDecodeHandlesRef.current = [];
    };
  }, [filteredArtworks, selectedIndex]);

  // Static columns; no DOM measurement needed

  // Meta row height locked; skip dynamic measurement to avoid jitter

  // Fix top bar height (stabilize baseline for meta/description Y calculations)
  useEffect(() => {
    const measureTopBar = () => {
      // Fix the top bar height so metadata can move up; description is absolute and won't be clipped
      setTopBarHeight(36);
    };
    const id = window.setTimeout(measureTopBar, 0);
    window.addEventListener('resize', measureTopBar);
    return () => {
      clearTimeout(id);
      window.removeEventListener('resize', measureTopBar);
    };
  }, [exhibition.title, exhibition.description, selectedIndex, metaPos]);

  // Description alignment simplified: using fixed left-top placement instead of dynamic computation.

  // Vertical alignment handled by static top values to match Archive line

  // No visible spacers; we'll clamp selection to first/last at extremes

  // Hover-based auto-scroll (marquee) for long titles: ping-pong left/right while hovered
  const startTitleAutoScroll = () => {
    const el = titleScrollRef.current;
    if (!el) return;
    const inner = el.firstElementChild as HTMLElement | null;
    if (!inner) return;
    const max = inner.scrollWidth - el.clientWidth;
    if (max <= 0) return;
    if (titleRafRef.current) cancelAnimationFrame(titleRafRef.current);
    titleDirRef.current = 1;
    let last = performance.now();
    const step = (now: number) => {
      const dt = Math.min(40, now - last); // cap dt for large frames
      last = now;
      const speedPxPerMs = 0.05; // ~50px/sec
      const delta = titleDirRef.current * speedPxPerMs * dt;
      el.scrollLeft = Math.max(0, Math.min(max, el.scrollLeft + delta));
      if (el.scrollLeft >= max - 0.5) {
        titleDirRef.current = -1;
      } else if (el.scrollLeft <= 0.5) {
        titleDirRef.current = 1;
      }
      titleRafRef.current = requestAnimationFrame(step);
    };
    titleRafRef.current = requestAnimationFrame(step);
  };

  const stopTitleAutoScroll = (reset = true) => {
    if (titleRafRef.current) {
      cancelAnimationFrame(titleRafRef.current);
      titleRafRef.current = null;
    }
    const el = titleScrollRef.current;
    if (el && reset) el.scrollLeft = 0;
  };

  // Optional seeding: add placeholder images for a specific exhibition if empty
  useEffect(() => {
    const title = exhibition.title?.trim();
    if (!title || seededRef.current) return;
    const storageKey = `seeded_${exhibition.id}`;
    if (localStorage.getItem(storageKey)) { seededRef.current = true; return; }
    if (title === "Korean Classical Art Collection" && artworks.length === 0) {
      (async () => {
        try {
          seededRef.current = true;
          const ids = [1011, 1025, 1035, 1043, 1050, 1067, 1074, 1084, 109, 110];
          const now = Date.now();
          const batch = ids.map((pid, i) => {
            const artId = `seed-${now}-${i}`;
            const docData = {
              id: artId,
              name: `Seed Image ${i + 1}`,
              artist: "Unknown",
              year: 0,
              image: `https://picsum.photos/id/${pid}/1200/900`,
              roomId: "default",
              exhibitionName: exhibition.name,
              exhibitionTitle: exhibition.title,
            } as Artwork;
            return addDoc(collection(db, "artworks"), docData);
          });
          await Promise.all(batch);
          localStorage.setItem(storageKey, "1");
        } catch (e) {
          // eslint-disable-next-line no-console
          console.warn("Seeding failed:", e);
        }
      })();
    }
  }, [artworks.length, exhibition.id, exhibition.name, exhibition.title]);

  // Reseed helper via URL param for Korean Classical Art Collection: ?seed=unsplash20 | picsum20
  useEffect(() => {
    const title = exhibition.title?.trim();
    if (!title) return;
    const params = new URLSearchParams(window.location.search);
    const seedMode = params.get("seed");
    if (!seedMode) return;
    if (title !== "Korean Classical Art Collection") return;
    if (didReseedRef.current) return; // prevent re-run (StrictMode/HMR)
    didReseedRef.current = true;

    (async () => {
      try {
        // 1) Delete existing artworks
        const qDel = query(collection(db, "artworks"), where("exhibitionTitle", "==", exhibition.title));
        const snap = await getDocs(qDel);
        const delJobs: Promise<void>[] = [];
        snap.forEach((ds) => delJobs.push(deleteDoc(doc(db, "artworks", ds.id))));
        await Promise.all(delJobs);

        // 2) Add 20 new images (Unsplash source or Picsum)
        const now = Date.now();
        const count = 20;
        const useUnsplash = seedMode === "unsplash20";
        const keywords = "art,antique,artifact,exhibition,museum,asian";
        const jobs: Promise<any>[] = [];
        for (let i = 0; i < count; i++) {
          const artId = `seed-${now}-${i}`;
          const image = useUnsplash
            ? `https://source.unsplash.com/1200x900/?${keywords}&sig=${now + i}`
            : `https://picsum.photos/seed/${now + i}/1200/900`;
          const docData = {
            id: artId,
            name: `Random ${i + 1}`,
            artist: "Random",
            year: 0,
            image,
            roomId: "default",
            exhibitionName: exhibition.name,
            exhibitionTitle: exhibition.title,
          } as Artwork;
          jobs.push(addDoc(collection(db, "artworks"), docData));
        }
        await Promise.all(jobs);
        // eslint-disable-next-line no-console
        console.info(`[seed] Replaced with ${count} images via ${useUnsplash ? "Unsplash" : "Picsum"}.`);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error("Reseed failed:", e);
      }
    })();
  }, [exhibition.name, exhibition.title]);

  // Viewer mode only; editing/upload removed

  const current = filteredArtworks[selectedIndex];

  // Archive mode: reset video when current artwork changes (force remount for animation)
  useEffect(() => {
    if (current?.youtubeId) {
      // iframe 바로 마운트, 썸네일은 보여줌
      setArchiveVideoReady(true);
      setArchiveThumbnailHidden(false);
      // 1초 후 썸네일 디졸브 시작
      const timer = setTimeout(() => {
        setArchiveThumbnailHidden(true);
      }, 1000);
      return () => clearTimeout(timer);
    } else {
      setArchiveVideoReady(false);
      setArchiveThumbnailHidden(false);
    }
  }, [current?.id, current?.youtubeId]);

  // Gallery mode: delay before showing YouTube iframe on hover
  useEffect(() => {
    if (hoveredIndex !== null) {
      const artwork = filteredArtworks[hoveredIndex];
      if (artwork?.youtubeId) {
        // iframe 바로 마운트, 썸네일은 보여줌
        setGalleryVideoReadyIdx(hoveredIndex);
        setGalleryThumbnailHiddenIdx(null);
        // 1초 후 썸네일 디졸브 시작
        const timer = setTimeout(() => {
          setGalleryThumbnailHiddenIdx(hoveredIndex);
        }, 1000);
        return () => clearTimeout(timer);
      }
    } else {
      setGalleryVideoReadyIdx(null);
      setGalleryThumbnailHiddenIdx(null);
    }
  }, [hoveredIndex, filteredArtworks]);

  const displayArtwork = useMemo(() => {
    // If lightbox is open, show that artwork's metadata
    if (hoverZoom?.artwork) {
      return hoverZoom.artwork;
    }
    if (viewMode === 'gallery') {
      if (hoveredIndex !== null && filteredArtworks[hoveredIndex]) {
        return filteredArtworks[hoveredIndex];
      }
      // No hover in gallery: show placeholders (—) by returning null
      return null as unknown as Artwork | null;
    }
    return current;
  }, [viewMode, hoveredIndex, current, filteredArtworks, hoverZoom]);

  // Open lightbox with simple scale/translate animation
  // On mobile, open source page directly to avoid Safari crashes
  const openLightbox = (e: React.MouseEvent<HTMLImageElement, MouseEvent>, artwork: Artwork) => {
    // Mobile: open lightbox with simpler animation
    const img = e.currentTarget;
    if (!img || !artwork) return;
    const best = getBestFullUrl(artwork);
    const rect = img.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const maxW = vw * 0.96;
    const maxH = vh * 0.96;
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const thumbAspect = rect.width > 0 && rect.height > 0 ? rect.width / rect.height : 4 / 3;
    const UPSCALE = isMobile ? 1.5 : 2.2; // Lower upscale on mobile to reduce memory

    // Preload to get natural dimensions and cap target appropriately
    const probe = new Image();
    probe.decoding = 'async';
    probe.src = best.url;
    const finalize = (natW?: number, natH?: number) => {
      const aspect = natW && natH && natW > 0 && natH > 0 ? natW / natH : thumbAspect;
      // Allowed display caps: permit modest upscale to make zoom noticeable
      const capWByNat = natW ? (natW / dpr) * UPSCALE : (best.width ? (best.width / dpr) * UPSCALE : Number.POSITIVE_INFINITY);
      const capHByNat = natH ? (natH / dpr) * UPSCALE : Number.POSITIVE_INFINITY;
      // Start from width cap
      let targetW = Math.min(maxW, capWByNat);
      let targetH = targetW / aspect;
      // Respect viewport height and natural height cap
      const heightCap = Math.min(maxH, capHByNat);
      if (targetH > heightCap) {
        targetH = heightCap;
        targetW = targetH * aspect;
      }
      // Re-check width against maxW
      if (targetW > maxW) {
        targetW = maxW;
        targetH = targetW / aspect;
      }
      const targetLeft = Math.round((vw - targetW) / 2);
      const targetTop = Math.round((vh - targetH) / 2);
      setLightbox({
        artwork,
        start: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
        target: { left: targetLeft, top: targetTop, width: targetW, height: targetH },
        animate: false,
        natWidth: natW,
        natHeight: natH,
      });
      requestAnimationFrame(() => setLightbox((s) => (s ? { ...s, animate: true } : s)));
    };
    probe.onload = () => finalize(probe.naturalWidth || undefined, probe.naturalHeight || undefined);
    probe.onerror = () => finalize(undefined, undefined);
  };

  const closeLightbox = () => {
    setLightbox((s) => (s ? { ...s, animate: false } : s));
    window.setTimeout(() => setLightbox(null), 300);
  };

  // Close zoom overlay with animation
  const closeHoverZoomFromOverlay = () => {
    if (hoverZoomTimeoutRef.current) {
      clearTimeout(hoverZoomTimeoutRef.current);
      hoverZoomTimeoutRef.current = null;
    }
    // Save current hoverZoom for rendering during close animation
    if (hoverZoom) {
      setClosingHoverZoom({ artwork: hoverZoom.artwork, imageUrl: hoverZoom.imageUrl });
    }
    setHoverZoom((s) => (s ? { ...s, animate: false } : s));
    setTimeout(() => {
      setHoverZoom(null);
      setClosingHoverZoom(null);
    }, 320);
  };

  // Cleanup hover zoom timeout on unmount
  useEffect(() => {
    return () => {
      if (hoverZoomTimeoutRef.current) {
        clearTimeout(hoverZoomTimeoutRef.current);
      }
    };
  }, []);

  // ESC to close lightbox or hover zoom
  useEffect(() => {
    if (!lightbox && !hoverZoom) return;
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') {
        if (lightbox) closeLightbox();
        if (hoverZoom) closeHoverZoomFromOverlay();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightbox, hoverZoom]);
  // Debug outlines disabled
  const DEBUG_LAYOUT = false;

  // Sync selected index from scroll - now handled inline in JSX onScroll
  // (Removed duplicate useEffect to avoid conflicts)

  // Scroll to first item when entering archive mode - ONLY on first time
  // For virtualized lists (500+), start at 0
  // For non-virtualized (3x loop), find the first item in middle section and scroll to it
  useEffect(() => {
    if (viewMode !== 'archive') return;
    // Only initialize once per exhibition session
    if (hasInitializedArchiveRef.current) return;

    const el = listRef.current;
    if (!el || filteredArtworks.length === 0) return;

    hasInitializedArchiveRef.current = true; // Mark as initialized

    // Use requestAnimationFrame to ensure DOM is rendered
    requestAnimationFrame(() => {
      // Always scroll to top for consistency
      el.scrollTop = 0;
      // Ensure selectedIndex is 0
      setSelectedIndex(0);
    });
  }, [viewMode, filteredArtworks.length]); // Run when entering archive or when artworks change

  // Mobile archive mode: initial scroll to middle section - ONLY on first archive entry
  useEffect(() => {
    if (!isMobile || viewMode !== 'archive') return;
    if (hasInitializedArchiveRef.current) return; // Skip if already initialized

    const el = mobileArchiveScrollRef.current;
    if (!el || filteredArtworks.length === 0) return;

    hasInitializedArchiveRef.current = true;

    requestAnimationFrame(() => {
      const items = el.querySelectorAll('[data-base="0"]');
      const middleItem = items[1] as HTMLElement | undefined;
      if (middleItem) {
        const containerWidth = el.clientWidth;
        const itemLeft = middleItem.offsetLeft;
        const itemWidth = middleItem.offsetWidth;
        const targetScroll = itemLeft + itemWidth / 2 - containerWidth / 2;
        el.scrollLeft = Math.max(0, targetScroll);
      }
      setSelectedIndex(0);
    });
  }, [isMobile, viewMode, filteredArtworks.length]); // NO selectedIndex dependency!

  // Sync scroll position when switching between PC and mobile
  const prevIsMobileRef = useRef<boolean | null>(null);
  useEffect(() => {
    if (viewMode !== 'archive') return;

    // First run - just record current state
    if (prevIsMobileRef.current === null) {
      prevIsMobileRef.current = isMobile;
      return;
    }

    // No change
    if (prevIsMobileRef.current === isMobile) return;

    prevIsMobileRef.current = isMobile;

    // Need multiple frames for DOM to be ready
    setTimeout(() => {
      requestAnimationFrame(() => {
        if (isMobile) {
          // Switched to mobile - scroll mobileArchiveScrollRef to current selectedIndex
          const el = mobileArchiveScrollRef.current;
          if (el) {
            const items = el.querySelectorAll(`[data-base="${selectedIndex}"]`);
            const middleItem = items[1] as HTMLElement | undefined;
            if (middleItem) {
              const containerWidth = el.clientWidth;
              const itemLeft = middleItem.offsetLeft;
              const itemWidth = middleItem.offsetWidth;
              const targetScroll = itemLeft + itemWidth / 2 - containerWidth / 2;
              el.scrollLeft = targetScroll;
            }
          }
        } else {
          // Switched to PC - scroll listRef to current selectedIndex
          const el = listRef.current;
          if (el) {
            const items = el.querySelectorAll(`[data-base="${selectedIndex}"]`);
            const middleItem = items[1] as HTMLElement | undefined;
            if (middleItem) {
              const containerHeight = el.clientHeight;
              const itemTop = middleItem.offsetTop;
              const itemHeight = middleItem.offsetHeight;
              const targetScroll = itemTop + itemHeight / 2 - containerHeight / 2;
              el.scrollTop = targetScroll;
            }
          }
        }
      });
    }, 100); // Wait 100ms for layout to stabilize
  }, [isMobile, viewMode, selectedIndex]);

  // Momentum scrolling setup (Archive only)
  // ... (Removed redundant effects if combined, but keep momentum separate if cleaner)

  // Route wheel events from the panel to the momentum scroller (archive mode only)
  useEffect(() => {
    if (viewMode !== 'archive') return; // disable in gallery mode so grid scrolls naturally
    const panel = panelRef.current;
    const scroller = listRef.current;
    if (!panel || !scroller || filteredArtworks.length === 0) return;
    const onWheel = (e: WheelEvent) => {
      if (!scroller) return;
      // If the wheel originated inside the scroller, let native scroll handle it
      if (scroller.contains(e.target as Node)) return;
      // Otherwise, route the wheel delta to the scroller to drive image navigation
      e.preventDefault();
      if (applyMomentumRef.current) {
        applyMomentumRef.current(e.deltaY);
      } else {
        scroller.scrollBy({ top: e.deltaY, behavior: 'auto' });
      }
    };
    panel.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      panel.removeEventListener('wheel', onWheel as any);
    };
  }, [filteredArtworks.length, selectedRoomId, viewMode]);

  // Apply inertia/momentum scrolling to the scroller itself (archive mode only)
  useEffect(() => {
    if (viewMode !== 'archive') return; // disable in gallery mode
    const el = listRef.current;
    if (!el || filteredArtworks.length === 0) return;
    const m = momentumRef.current;

    // Natural physics: no artificial acceleration, just friction decay
    const MAX_VEL = 35; // Max velocity (lower = slower)
    const GAIN = 0.15; // Response to wheel delta (lower = slower)
    const FRICTION = 0.93; // Smooth exponential decay
    const STOP_THRESHOLD = 0.4; // Stop when velocity is negligible

    const step = () => {
      // Apply friction (exponential decay like real physics)
      m.vel *= FRICTION;

      // Stop when velocity is very small
      if (Math.abs(m.vel) < STOP_THRESHOLD) {
        m.vel = 0;
        m.raf = 0;
        return;
      }

      const newScrollTop = el.scrollTop + m.vel;
      const maxScroll = el.scrollHeight - el.clientHeight;

      // Clamp to boundaries (no infinite loop for now)
      el.scrollTop = Math.max(0, Math.min(maxScroll, newScrollTop));

      m.raf = requestAnimationFrame(step);
    };

    const addVelocity = (delta: number) => {
      // Add velocity proportional to wheel input, clamped to max
      const newVel = m.vel + delta * GAIN;
      m.vel = Math.max(-MAX_VEL, Math.min(MAX_VEL, newVel));

      // Start animation if not running
      if (!m.raf) m.raf = requestAnimationFrame(step);
    };
    applyMomentumRef.current = addVelocity;

    const onWheel = (e: WheelEvent) => {
      // Prevent default scroll and handle via momentum logic
      e.preventDefault();
      addVelocity(e.deltaY);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      el.removeEventListener('wheel', onWheel as any);
      if (m.raf) cancelAnimationFrame(m.raf);
      m.raf = 0;
      applyMomentumRef.current = null;
    };
  }, [filteredArtworks.length, selectedRoomId, viewMode]);

  // Selection is driven purely by scroll position

  // Shared layout values for room selector + info text
  // Wide screen: center between thumbnails (~150px) and metadata (~500px) = ~325px
  // Narrow screen: same left margin as grid for alignment
  const selectorLeft = isMobile ? 12 : (isVeryNarrow ? 16 : (isNarrow ? 24 : 250));
  // Wide screen: same top margin as mode tabs (8px)
  // Narrow screen: align with metadata row Y position (after mode tabs)
  const selectorTop = isMobile ? 140 : (isVeryNarrow ? 50 : (isNarrow ? 50 : 8));
  // Info text position (same center as room selector on wide screen)
  const infoTextLeft = isMobile ? 12 : (isVeryNarrow ? 160 : (isNarrow ? 180 : 300));
  // Selector sizing constants: narrower on narrow screens
  const SELECTOR_COL_WIDTH = isVeryNarrow ? 12 : (isNarrow ? 14 : 18); // px
  const SELECTOR_COL_GAP = 0; // px (no gap between buttons)
  // Max 15 rooms per row
  const selectorCols = isMobile ? 10 : 15;
  const selectorWidth = selectorCols * SELECTOR_COL_WIDTH + Math.max(0, selectorCols - 1) * SELECTOR_COL_GAP;
  // Info text X within the info panel should align visually to the selector's X
  // Keep info text inset inside the info panel to avoid clipping; align visually with selector


  // Compute selector data outside JSX and replace the problematic IIFE-based room selector block with simpler JSX using this data to fix the syntax error
  const selectorData = useMemo(() => {
    // Get all room buttons except 'ALL'
    const allRoomButtons = roomButtons.filter(b => b.id !== 'ALL');

    // Separate by type:
    // 1. Pure numeric IDs (1, 2, 3...)
    const numericButtons = allRoomButtons.filter(b => /^\d+$/.test(b.id));

    // 2. String rooms with numeric labels (Room 1 → label "1", id "Room 1")
    const stringRoomButtons = allRoomButtons.filter(b =>
      !(/^\d+$/.test(b.id)) &&
      !(/^[A-G]$/i.test(b.id)) &&
      b.id !== 'C' &&
      b.id !== 'n' &&
      /^\d+$/.test(b.label)  // Label is numeric (like "1", "2", "3")
    );

    // 3. Letter rooms (A-G except C)
    const letterButtons = allRoomButtons.filter(b => /^[A-G]$/i.test(b.id) && b.id !== 'C');

    // 4. Central Hall (C)
    const central = allRoomButtons.find(b => b.id === 'C');

    // 5. Archive (n)
    const archive = allRoomButtons.find(b => b.id === 'n');

    // Build the nums array in order
    const nums: { id: string; label: string; exists: boolean }[] = [];

    // Add numeric buttons first
    for (const b of numericButtons) nums.push({ id: b.id, label: b.label, exists: true });

    // Add string room buttons (sorted by their numeric label)
    const sortedStringRooms = [...stringRoomButtons].sort((a, b) => parseInt(a.label, 10) - parseInt(b.label, 10));
    for (const b of sortedStringRooms) nums.push({ id: b.id, label: b.label, exists: true });

    // Add letter rooms
    for (const lb of letterButtons) nums.push({ id: lb.id, label: lb.label, exists: true });

    // Add Central Hall (C)
    if (central) nums.push({ id: central.id, label: central.label, exists: true });

    // Add Archive (n) at the end
    if (archive) nums.push({ id: archive.id, label: archive.label, exists: true });

    // Chunk for gallery rows of 15
    const rows: typeof nums[] = [];
    for (let i = 0; i < nums.length; i += 15) rows.push(nums.slice(i, i + 15));

    return { nums, rows };
  }, [roomButtons]);

  // Dynamic header height measurement for lightbox positioning
  useEffect(() => {
    const updateHeight = () => {
      let h = 0;
      // Prioritize metaRowRef (Desktop metadata row) as it is visually lower
      if (metaRowRef.current) {
        h = metaRowRef.current.offsetTop + metaRowRef.current.offsetHeight;
      }
      // Fallback to generic headerRef (Mobile top bar or Desktop mode bar)
      else if (headerRef.current) {
        h = headerRef.current.offsetTop + headerRef.current.offsetHeight;
      }
      setHeaderHeight(h);
    };

    // Initial measure - wait for layout to stabilize
    setTimeout(updateHeight, 0);

    // Use ResizeObserver for robust updates
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(updateHeight);
      if (headerRef.current) ro.observe(headerRef.current);
      if (metaRowRef.current) ro.observe(metaRowRef.current);
    }

    const onResize = () => updateHeight();
    window.addEventListener('resize', onResize);

    return () => {
      window.removeEventListener('resize', onResize);
      if (ro) ro.disconnect();
    };
  }, [isMobile, viewMode, isNarrow, isVeryNarrow, exhibition.id, selectedCategories.size, selectedTypes.size]);

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100vw",
        height: "100vh",
        backgroundColor: "rgba(0,0,0,0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 13000,
        overscrollBehavior: "contain",
        // Prevent layout thrashing on pinch zoom
        contain: 'layout style',
      }}
    >
      <div
        ref={panelRef}
        style={{
          position: "relative",
          backgroundColor: "#fff",
          width: "100%",
          height: "100%",
          padding: 0,
          borderRadius: 0,
          boxShadow: "0 12px 28px rgba(0,0,0,0.25)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          // Prevent layout recalculation on zoom
          contain: isMobile ? 'layout style paint' : undefined,
          ...(DEBUG_LAYOUT ? { outline: "1px solid #f0f" } : {})
        }}
      >
        {/* Old handle removed; the corner is now curled by default and interactive via the invisible zone above */}
        {/* Mobile: full-width top header bar - hide in archive mode */}
        {isMobile && viewMode !== 'archive' && (
          <div ref={headerRef} style={{ position: 'absolute', top: 0, left: 0, right: 0, background: '#fff', zIndex: 199, display: 'flex' }}>
            {/* Zone 1: Title + Description - exactly 1/3 of screen */}
            <div style={{ width: 'calc(100% / 3)', padding: '5px 8px', minWidth: 0, boxSizing: 'border-box' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#111827', lineHeight: 1.2, marginBottom: 2 }}>
                {exhibition.title || exhibition.name}
              </div>
              <div style={{ fontSize: 10, color: '#888', lineHeight: 1.3 }}>
                {exhibition.description}
              </div>
            </div>
            {/* Zone 2: Filters - exactly 1/3 of screen */}
            <div style={{ width: 'calc(100% / 3)', padding: '5px 8px', minWidth: 0, boxSizing: 'border-box' }}>
              {/* Row 1: ALL button with count outside */}
              <div style={{ marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                <button
                  onClick={() => { setSelectedCentury(null); setSelectedYearRange('ALL'); setSelectedTypes(new Set()); setSelectedCategories(new Set()); setSelectedIndex(0); }}
                  style={{ padding: '0 6px', height: 20, fontSize: 10.5, fontWeight: 400, borderRadius: 4, border: 'none', background: (selectedRoomId === 'ALL' && !selectedCentury && selectedTypes.size === 0 && selectedCategories.size === 0) ? '#111' : '#f2f2f2', color: (selectedRoomId === 'ALL' && !selectedCentury && selectedTypes.size === 0 && selectedCategories.size === 0) ? '#fff' : '#666', cursor: 'pointer', transition: 'all 0.1s ease' }}
                >
                  ALL
                </button>
                <span style={{ fontSize: 10, color: '#666' }}>
                  ({nmkFilteredResults !== null
                    ? `${nmkFilteredResults.length.toLocaleString()} 검색결과`
                    : nmkTotalCount > 0
                      ? `${filteredArtworks.length.toLocaleString()} / ${nmkTotalCount.toLocaleString()}`
                      : filteredArtworks.length.toLocaleString()})
                </span>
              </div>
              {/* Row 2: Century + 2D/3D filter buttons */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                {availableCenturies.length > 0 && availableCenturies.map((c) => (
                  <button
                    key={`mobile-c-${c}`}
                    onClick={() => {
                      if (selectedCentury === c) {
                        setSelectedCentury(null);
                        setSelectedYearRange('ALL');
                      } else {
                        setSelectedCentury(c);
                        setSelectedYearRange('ALL');
                      }
                      setSelectedIndex(0);
                    }}
                    style={{ padding: '0 6px', height: 20, fontSize: 10.5, fontWeight: selectedCentury === c ? 500 : 400, borderRadius: 4, border: 'none', background: selectedCentury === c ? '#111' : '#f2f2f2', color: selectedCentury === c ? '#fff' : '#666', cursor: 'pointer', transition: 'all 0.1s ease' }}
                  >
                    {`${c}c`}
                  </button>
                ))}
                {hasCategorizedArtworks && (['2D', '3D'] as const).map(t => (
                  <button
                    key={`mobile-${t}`}
                    onClick={() => {
                      setSelectedTypes(prev => {
                        if (prev.has(t)) return new Set();
                        return new Set([t]);
                      });
                      setSelectedMediumFacets(new Set());
                      setSelectedIndex(0);
                    }}
                    style={{ padding: '0 6px', height: 20, fontSize: 10.5, fontWeight: selectedTypes.has(t) ? 500 : 400, borderRadius: 4, border: 'none', background: selectedTypes.has(t) ? '#111' : '#f2f2f2', color: selectedTypes.has(t) ? '#fff' : '#666', cursor: 'pointer', transition: 'all 0.1s ease' }}
                  >
                    {t}
                  </button>
                ))}
                {hasUncategorizedArtworks && (
                  <button
                    key="mobile-N"
                    onClick={() => {
                      setSelectedTypes(prev => {
                        if (prev.has('N')) return new Set();
                        return new Set(['N']);
                      });
                      setSelectedMediumFacets(new Set());
                      setSelectedIndex(0);
                    }}
                    style={{ padding: '0 6px', height: 20, fontSize: 10.5, fontWeight: selectedTypes.has('N') ? 500 : 400, borderRadius: 4, border: 'none', background: selectedTypes.has('N') ? '#111' : '#f2f2f2', color: selectedTypes.has('N') ? '#fff' : '#666', cursor: 'pointer', transition: 'all 0.1s ease' }}
                  >
                    N
                  </button>
                )}
                {hasArchivalArtworks && (
                  <button
                    onClick={() => { setShowArtworksOnly(!showArtworksOnly); setSelectedIndex(0); }}
                    style={{ padding: '0 6px', height: 20, fontSize: 10.5, fontWeight: showArtworksOnly ? 500 : 400, borderRadius: 4, border: 'none', background: showArtworksOnly ? '#111' : '#f2f2f2', color: showArtworksOnly ? '#fff' : '#666', cursor: 'pointer', transition: 'all 0.1s ease' }}
                  >
                    ARTWORKS ONLY
                  </button>
                )}
                {(exhibition.id === 'guggenheim-bilbao-collection' || exhibition.id === 'khm-collection') && (
                  <button
                    onClick={() => { setShowOnViewOnly(!showOnViewOnly); setSelectedIndex(0); }}
                    style={{ padding: '0 6px', height: 20, fontSize: 10.5, fontWeight: showOnViewOnly ? 500 : 400, borderRadius: 4, border: 'none', background: showOnViewOnly ? '#111' : '#f2f2f2', color: showOnViewOnly ? '#fff' : '#666', cursor: 'pointer', transition: 'all 0.1s ease' }}
                  >
                    ON VIEW
                  </button>
                )}
                {exhibition.id === 'picasso-bcn-collection' && (
                  <button
                    onClick={() => { setShowHighlightOnly(!showHighlightOnly); setSelectedIndex(0); }}
                    style={{ padding: '0 6px', height: 20, fontSize: 10.5, fontWeight: showHighlightOnly ? 500 : 400, borderRadius: 4, border: 'none', background: showHighlightOnly ? '#111' : '#f2f2f2', color: showHighlightOnly ? '#fff' : '#666', cursor: 'pointer', transition: 'all 0.1s ease' }}
                  >
                    HIGHLIGHT
                  </button>
                )}
              </div>

              {/* Row 3: Reina Sofía medium sub-facets (shown only when 2D/3D selected) */}
              {hasCategorizedArtworks && selectedTypes.size > 0 && availableTechniqueFacets.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6, alignItems: 'center' }}>
                  {availableTechniqueFacets.map((f) => (
                    <button
                      key={`mobile-facet-${f.id}`}
                      onClick={() => {
                        setSelectedMediumFacets(prev => {
                          const next = new Set(prev);
                          if (next.has(f.id)) next.delete(f.id);
                          else next.add(f.id);
                          return next;
                        });
                        setSelectedIndex(0);
                      }}
                      style={{ padding: '0 6px', height: 20, fontSize: 10.5, fontWeight: selectedMediumFacets.has(f.id) ? 500 : 400, borderRadius: 4, border: 'none', background: selectedMediumFacets.has(f.id) ? '#111' : '#f2f2f2', color: selectedMediumFacets.has(f.id) ? '#fff' : '#666', cursor: 'pointer', transition: 'all 0.1s ease' }}
                      title={`${f.label} (${f.count.toLocaleString()})`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              )}

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                {/* Category Filter Buttons - cumulative multi-select */}
                {availableCategories.map(cat => (
                  <button
                    key={`mobile-cat-${cat}`}
                    onClick={() => { setSelectedCategories(prev => { const next = new Set(prev); if (next.has(cat)) next.delete(cat); else next.add(cat); return next; }); setSelectedIndex(0); }}
                    style={{ padding: '0 6px', height: 20, fontSize: 10.5, fontWeight: selectedCategories.has(cat) ? 500 : 400, borderRadius: 4, border: 'none', background: selectedCategories.has(cat) ? '#111' : '#f2f2f2', color: selectedCategories.has(cat) ? '#fff' : '#666', cursor: 'pointer', transition: 'all 0.1s ease' }}
                  >
                    {CATEGORY_LABEL_MAP[cat] || cat}
                  </button>
                ))}
              </div>
            </div>
            {/* Zone 3: Profile/heart/close buttons - exactly 1/3 of screen */}
            <div style={{ width: 'calc(100% / 3)', minWidth: 0, boxSizing: 'border-box' }} />
          </div>
        )}
        {/* Mobile Archive Mode: full-screen layout with horizontal scrolling thumbnails (same as PC but horizontal) */}
        {isMobile && viewMode === 'archive' && filteredArtworks.length > 0 && (() => {
          const total = filteredArtworks.length;
          const current = filteredArtworks[selectedIndex];
          const THUMB_SIZE = 48;
          const THUMB_GAP = 84; // Same gap as PC

          // 3x list for infinite loop (same as PC)
          const tripleList = [...filteredArtworks, ...filteredArtworks, ...filteredArtworks];

          const scrollToIndex = (realIdx: number) => {
            const el = mobileArchiveScrollRef.current;
            if (!el) return;

            const items = el.querySelectorAll('[data-base]');
            const targetItem = Array.from(items).find((item, idx) => {
              const base = parseInt(item.getAttribute('data-base') || '-1');
              return base === realIdx && idx >= total && idx < total * 2;
            }) as HTMLElement | null;

            if (targetItem) {
              const containerWidth = el.clientWidth;
              const itemLeft = targetItem.offsetLeft;
              const itemWidth = targetItem.offsetWidth;
              const targetScroll = itemLeft + itemWidth / 2 - containerWidth / 2;
              el.scrollTo({ left: targetScroll, behavior: 'smooth' });
            }
            setSelectedIndex(realIdx);
          };

          return (
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', flexDirection: 'column', background: '#fff', zIndex: 198 }}>
              {/* Top row: horizontal scrolling thumbnails with 3x infinite loop */}
              <div
                ref={mobileArchiveScrollRef}
                className="no-scrollbar"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: THUMB_GAP,
                  padding: '12px 16px',
                  overflowX: 'scroll',
                  overflowY: 'hidden',
                  WebkitOverflowScrolling: 'touch',
                  flexShrink: 0,
                  height: THUMB_SIZE + 24,
                  minHeight: THUMB_SIZE + 24,
                  scrollBehavior: 'auto',
                  overscrollBehavior: 'contain'
                }}
                onScroll={(e) => {
                  const el = e.currentTarget;
                  const currentScrollLeft = el.scrollLeft;
                  const containerWidth = el.clientWidth;
                  const centerX = currentScrollLeft + containerWidth / 2;

                  // Find closest item to center (exactly like PC)
                  const items = el.querySelectorAll('[data-base]');
                  let closestIdx = 0;
                  let closestDistance = Infinity;

                  items.forEach((item) => {
                    const htmlItem = item as HTMLElement;
                    const itemLeft = htmlItem.offsetLeft;
                    const itemWidth = htmlItem.offsetWidth;
                    const itemCenter = itemLeft + itemWidth / 2;
                    const distance = Math.abs(itemCenter - centerX);

                    if (distance < closestDistance) {
                      closestDistance = distance;
                      closestIdx = parseInt(item.getAttribute('data-base') || '0');
                    }
                  });

                  if (closestIdx !== selectedIndex) {
                    setSelectedIndex(closestIdx);
                  }

                  // Infinite loop (exactly like PC)
                  const totalWidth = el.scrollWidth;
                  const sectionWidth = totalWidth / 3;

                  if (currentScrollLeft < sectionWidth * 0.3) {
                    el.scrollLeft = currentScrollLeft + sectionWidth;
                  } else if (currentScrollLeft > sectionWidth * 1.7) {
                    el.scrollLeft = currentScrollLeft - sectionWidth;
                  }
                }}
              >
                {tripleList.map((a, idx) => {
                  const realIdx = idx % total;
                  return (
                    <div
                      key={`mobile-thumb-${idx}`}
                      data-base={realIdx}
                      onClick={() => scrollToIndex(realIdx)}
                      style={{
                        width: THUMB_SIZE,
                        height: THUMB_SIZE,
                        flexShrink: 0,
                        background: '#eee',
                        borderRadius: 0,
                        overflow: 'hidden',
                        cursor: 'pointer',
                        opacity: realIdx === selectedIndex ? 1 : 0.65
                      }}
                    >
                      <img
                        src={a.youtubeId ? `https://img.youtube.com/vi/${a.youtubeId}/mqdefault.jpg` : a.image}
                        alt={a.name}
                        loading="lazy"
                        referrerPolicy="no-referrer"
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        onError={(e) => applyFallbackImage(e.currentTarget)}
                      />
                    </div>
                  );
                })}
              </div>

              {/* Center: main image - touch swipe (up/down) scrolls thumbnails with momentum */}
              <div
                style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '8px 16px', minHeight: 0, overflow: 'hidden', touchAction: 'none' }}
                onWheel={(e) => {
                  e.preventDefault();
                  // Just scroll the thumbnails - let onScroll handle selectedIndex (like PC)
                  const el = mobileArchiveScrollRef.current;
                  if (el) {
                    el.scrollBy({ left: e.deltaY * 0.5, behavior: 'auto' });
                  }
                }}
                onTouchStart={(e) => {
                  const touch = e.touches[0];
                  const target = e.currentTarget as any;
                  target._touchStartY = touch.clientY;
                  target._touchLastY = touch.clientY;
                  target._touchStartTime = Date.now();
                  target._touchLastTime = Date.now();
                  target._velocityY = 0;
                }}
                onTouchMove={(e) => {
                  e.preventDefault();
                  const touch = e.touches[0];
                  const target = e.currentTarget as any;
                  const lastY = target._touchLastY;
                  if (lastY === undefined) return;

                  const deltaY = lastY - touch.clientY; // positive = swiping up
                  const now = Date.now();
                  const dt = now - (target._touchLastTime || now);

                  // Calculate velocity for momentum
                  if (dt > 0) {
                    target._velocityY = deltaY / dt * 16; // pixels per frame (~60fps)
                  }

                  target._touchLastY = touch.clientY;
                  target._touchLastTime = now;

                  // Scroll thumbnails in real-time (vertical swipe -> horizontal scroll)
                  const el = mobileArchiveScrollRef.current;
                  if (el) {
                    el.scrollBy({ left: deltaY, behavior: 'auto' });
                  }
                }}
                onTouchEnd={(e) => {
                  const target = e.currentTarget as any;
                  const velocity = target._velocityY || 0;

                  // Apply momentum scrolling
                  const el = mobileArchiveScrollRef.current;
                  if (el && Math.abs(velocity) > 1) {
                    let currentVelocity = velocity;
                    const friction = 0.95;

                    const animate = () => {
                      if (Math.abs(currentVelocity) < 0.5) return;
                      el.scrollBy({ left: currentVelocity, behavior: 'auto' });
                      currentVelocity *= friction;
                      requestAnimationFrame(animate);
                    };
                    requestAnimationFrame(animate);
                  }

                  // Cleanup
                  target._touchStartY = undefined;
                  target._touchLastY = undefined;
                  target._velocityY = undefined;
                }}
              >
                {current && (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', maxHeight: '100%', width: '100%' }}>
                    <div style={{ position: 'relative', display: 'inline-block' }}>
                      <img
                        src={current.youtubeId ? `https://img.youtube.com/vi/${current.youtubeId}/mqdefault.jpg` : ((current as any).originalImage || current.image)}
                        alt={current.name}
                        referrerPolicy="no-referrer"
                        style={{
                          maxWidth: '100%',
                          maxHeight: '50vh',
                          objectFit: 'contain',
                          display: 'block',
                          pointerEvents: 'none'
                        }}
                        onError={(e) => applyFallbackImage(e.currentTarget)}
                      />
                      <HeartOverlay
                        isLiked={likedArtworks.has(current.id)}
                        onToggle={(e) => toggleLike(e, current)}
                        style={{ position: 'absolute', bottom: 8, left: 8, zIndex: 30, padding: 0, background: 'none' }}
                        size={18}
                        color="#e11d48"
                        emptyColor="#fff"
                      />
                    </div>
                    <div style={{ marginTop: 10, textAlign: 'center', padding: '0 16px' }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#222' }}>{current.name}</div>
                      {/* Medium/Technique/Materials */}
                      {(() => {
                        const med = (current as Record<string, unknown>).medium || (current as Record<string, unknown>).technique || (current as Record<string, unknown>).materials;
                        return med ? <div style={{ fontSize: 10, color: '#888', marginTop: 2 }}>{String(med)}</div> : null;
                      })()}
                      <div style={{ fontSize: 11, color: '#666', marginTop: 3 }}>{cleanArtistName(current.artist)}{current.year ? ` (${cleanDateText(String(current.year))})` : ''}</div>
                      {/* Category/ArtworkType */}
                      {(() => {
                        const cat = (current as Record<string, unknown>).category || (current as Record<string, unknown>).artworkType;
                        return cat ? <div style={{ fontSize: 10, color: '#888', marginTop: 2 }}>{String(cat)}</div> : null;
                      })()}
                    </div>
                  </div>
                )}
              </div>

              {/* Index indicator - moved up to avoid overlap with mode tabs */}
              <div style={{ textAlign: 'center', fontSize: 10, color: '#888', padding: '6px 0 80px 0' }}>
                {selectedIndex + 1} / {total}
              </div>
            </div>
          );
        })()}
        {/* Absolute full-height exhibition info panel at far left (all modes) - hidden on mobile */}
        <div style={{ position: "absolute", top: 0, bottom: 0, left: 0, width: 150, background: "transparent", zIndex: 200, display: isMobile ? 'none' : 'flex', flexDirection: 'column', pointerEvents: 'none', ...(DEBUG_LAYOUT ? { outline: "1px solid #964B00" } : {}) }}>
          {/* Left header: title + description + room selector */}
          <div style={{ padding: '8px 8px', borderBottom: '0px solid transparent', pointerEvents: 'auto', background: '#fff' }}>
            {repImage && (
              <div style={{ width: '100%', marginBottom: 8, background: '#ddd', borderRadius: 4, overflow: 'hidden' }}>
                <img
                  src={repImage}
                  alt={(exhibition.title || exhibition.name) + ' cover'}
                  style={{ width: '100%', height: 'auto', display: 'block', objectFit: 'cover' }}
                  decoding="async"
                  loading="eager"
                  referrerPolicy="no-referrer"
                  onError={() => setRepImage(null)}
                />
              </div>
            )}
            <div
              ref={titleScrollRef}
              onMouseEnter={() => startTitleAutoScroll()}
              onMouseLeave={() => stopTitleAutoScroll(true)}
              style={{ fontSize: 12, fontWeight: 700, color: '#111827', whiteSpace: 'nowrap', overflowX: 'hidden', textOverflow: 'clip', cursor: 'default' }}
              title={exhibition.title || exhibition.name}
            >
              <span style={{ display: 'inline-block', paddingRight: 18 }}>{exhibition.title || exhibition.name}</span>
            </div>
            <div
              style={{
                marginTop: 6,
                fontSize: 10,
                color: '#666',
                lineHeight: 1.4,
                maxHeight: isDescriptionExpanded ? 'none' : 72,
                overflow: isDescriptionExpanded ? 'visible' : 'hidden',
                position: 'relative',
              }}
              onMouseEnter={(e) => {
                const el = e.currentTarget;
                // if content overflows, animate vertical scroll up/down
                const canScroll = el.scrollHeight > el.clientHeight + 2;
                if (!canScroll) return;
                // Prevent duplicate RAFs
                if ((el as any)._raf) cancelAnimationFrame((el as any)._raf);
                let dir = 1; // 1: down, -1: up
                const maxScroll = el.scrollHeight - el.clientHeight;
                let last = performance.now();
                const speed = 18; // px per second
                const step = (now: number) => {
                  const dt = Math.min(40, now - last);
                  last = now;
                  el.scrollTop += dir * (speed * (dt / 1000));
                  if (el.scrollTop <= 0) { el.scrollTop = 0; dir = 1; }
                  else if (el.scrollTop >= maxScroll) { el.scrollTop = maxScroll; dir = -1; }
                  (el as any)._raf = requestAnimationFrame(step);
                };
                (el as any)._raf = requestAnimationFrame(step);
              }}
              onMouseLeave={(e) => {
                const el = e.currentTarget;
                if ((el as any)._raf) {
                  cancelAnimationFrame((el as any)._raf);
                  (el as any)._raf = 0;
                }
                // Smoothly return to top so the first lines are visible next time
                el.scrollTo({ top: 0, behavior: 'smooth' });
              }}
            >
              {exhibition.description || `${(exhibition.title || exhibition.name)} — a short introduction to the exhibition.`}
            </div>
            {/* Description button - opens overlay with full exhibition details */}
            {((exhibition as any).detailedDescription || (exhibition as any).descriptionHtml || (exhibition as any).url || (exhibition as any).fullDescription || (Array.isArray((exhibition as any).galleryImages) && (exhibition as any).galleryImages.length > 0) || (Array.isArray((exhibition as any).videos) && (exhibition as any).videos.length > 0)) && (
              <button
                onClick={() => setIsDescriptionExpanded(true)}
                style={{
                  marginTop: 8,
                  fontSize: 10,
                  color: '#fff',
                  background: '#111827',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '4px 10px',
                  borderRadius: 4,
                  fontWeight: 600,
                  transition: 'all 0.1s ease'
                }}
              >
                Description
              </button>
            )}
            {/* room selector removed from left header; rendered between title/meta instead */}
          </div>
          {/* Centered placeholder area in the left column when no artworks (archive only) */}
          {initialized && filteredArtworks.length === 0 && viewMode === 'archive' && (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ color: '#888', fontSize: 13, textAlign: 'center', padding: '20px' }}>
                {((exhibition as any).detailedDescription || exhibition.description) ? (
                  <>SEE DESCRIPTION<br />→</>
                ) : (
                  <>NO ARTWORKS<br />YET .</>
                )}
              </div>
            </div>
          )}
          {/* Desktop: Scrollable thumbnail strip below header (archive mode only) */}
          {viewMode === 'archive' && filteredArtworks.length > 0 && !isMobile && (() => {
            const total = filteredArtworks.length;
            // const useVirtualization = total > 500; // Enable virtualization for large lists

            // Item dimensions for virtualization
            const ITEM_HEIGHT = 144; // ~60px thumbnail + 84px margin
            const BUFFER_COUNT = 10; // Extra items above/below viewport

            // Always enable virtualization for consistent performance

            // Scroll helper
            const scrollToIndex = (realIdx: number) => {
              const el = listRef.current;
              if (el) {
                // Virtualized scroll: calculate exact position
                const targetScroll = realIdx * ITEM_HEIGHT - el.clientHeight / 2 + ITEM_HEIGHT / 2;
                el.scrollTo({ top: targetScroll, behavior: 'smooth' });
              }
              setSelectedIndex(realIdx);
            };

            return (
              <div
                ref={(el) => {
                  (listRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
                  if (el) {
                    setArchiveContainerHeight(el.clientHeight);
                  }
                }}
                className="no-scrollbar"
                style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch", padding: "6px 8px", overscrollBehavior: "none", msOverflowStyle: "none", scrollbarWidth: "none" }}
                onScroll={(e) => {
                  const el = e.currentTarget;
                  const currentScrollTop = el.scrollTop;

                  setArchiveScrollTop(currentScrollTop);
                  // Calculate which item is at center
                  const centerY = currentScrollTop + el.clientHeight / 2;
                  const centerIdx = Math.floor(centerY / ITEM_HEIGHT);
                  const clampedIdx = Math.max(0, Math.min(centerIdx, total - 1));
                  if (clampedIdx !== selectedIndex) {
                    setSelectedIndex(clampedIdx);
                  }

                  // NMK/Reina Sofía infinite scroll: load more when near bottom
                  if ((exhibition.id === 'nmk-collection' || exhibition.id === 'gyeongju-museum' || exhibition.id === 'buyeo-museum' || exhibition.id === 'reina-sofia-collection') && nmkFilteredResults === null) {
                    const scrollBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
                    if (scrollBottom < 500 && !nmkLoading && nmkCurrentChunk < nmkTotalChunks) {
                      loadMoreNmkArtworks();
                    }
                  }
                }}
              >
                {/* Virtualized rendering - only render visible items */}
                <div style={{ height: total * ITEM_HEIGHT, position: 'relative' }}>
                  {(() => {
                    const startIdx = Math.max(0, Math.floor(archiveScrollTop / ITEM_HEIGHT) - BUFFER_COUNT);
                    const endIdx = Math.min(total, Math.ceil((archiveScrollTop + archiveContainerHeight) / ITEM_HEIGHT) + BUFFER_COUNT);
                    const visibleItems = [];

                    for (let i = startIdx; i < endIdx; i++) {
                      const a = filteredArtworks[i];
                      visibleItems.push(
                        <div
                          key={i}
                          data-base={i}
                          onClick={() => scrollToIndex(i)}
                          role="button"
                          tabIndex={0}
                          style={{
                            position: 'absolute',
                            top: i * ITEM_HEIGHT,
                            left: 0,
                            right: 0,
                            height: ITEM_HEIGHT,
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            justifyContent: "flex-start",
                            paddingTop: 0,
                            cursor: "pointer",
                            opacity: i === selectedIndex ? 1 : 0.65
                          }}
                        >
                          <div
                            style={{ width: "40%", aspectRatio: "1 / 1", background: "#eee", borderRadius: 0, overflow: "hidden" }}
                          >
                            {a.youtubeId ? (
                              <img
                                src={`https://img.youtube.com/vi/${a.youtubeId}/mqdefault.jpg`}
                                alt={a.name}
                                loading="lazy"
                                referrerPolicy="no-referrer"
                                style={{ width: "100%", height: "100%", display: "block", objectFit: "cover" }}
                                onError={(e) => { e.currentTarget.src = a.image; }}
                              />
                            ) : a.image && (
                              <img
                                src={a.image}
                                alt={a.name}
                                loading="lazy"
                                decoding="async"
                                fetchPriority="low"
                                referrerPolicy="no-referrer"
                                style={{ width: "100%", height: "100%", display: "block", objectFit: "cover" }}
                                onError={(e) => applyFallbackImage(e.currentTarget)}
                              />
                            )}
                          </div>
                        </div>
                      );
                    }
                    return visibleItems;
                  })()}
                </div>

                {/* Load More button for National Museum of Korea - hidden when filter is active */}
                {
                  nmkTotalCount > 0 && nmkCurrentChunk < nmkTotalChunks && nmkFilteredResults === null && (
                    <div style={{ display: 'flex', justifyContent: 'center', padding: '20px 0', marginTop: 20 }}>
                      <button
                        onClick={loadMoreNmkArtworks}
                        disabled={nmkLoading}
                        style={{
                          padding: '12px 32px',
                          fontSize: 14,
                          fontWeight: 600,
                          borderRadius: 6,
                          border: '1px solid #111',
                          background: nmkLoading ? '#eee' : '#fff',
                          color: '#111',
                          cursor: nmkLoading ? 'wait' : 'pointer',
                          transition: 'all 0.2s ease',
                        }}
                      >
                        {nmkLoading ? '로딩 중...' : `더 보기 (${artworks.length.toLocaleString()} / ${nmkTotalCount.toLocaleString()})`}
                      </button>
                    </div>
                  )
                }
              </div>
            );
          })()}
        </div>
        {/* Top bar: mode tabs + controls */}
        {/* Wide screen: absolute positions at metaPos, Narrow: flex centered with dynamic spacing */}
        {(() => {
          // Wide screen: use absolute positioning
          // Narrow screen: use flex centering
          // Hide mode tabs when hover zoom is active
          if (!isNarrow) {
            return (
              <div ref={(el) => { (topBarRef as any).current = el; (headerRef as any).current = el; }} style={{ position: "relative", padding: "8px 0", minHeight: topBarHeight, marginLeft: LAYOUT_LEFT_BASE + META_SHIFT, marginRight: 80, zIndex: 100, opacity: hoverZoom ? 0 : 1, transition: 'opacity 200ms ease', pointerEvents: hoverZoom ? 'none' : 'auto', ...(DEBUG_LAYOUT ? { outline: "1px dashed #00f" } : {}) }}>
                <span
                  onClick={() => { setViewMode('panorama'); setSelectedIndex(0); }}
                  style={{
                    fontSize: 12, lineHeight: 1, fontWeight: 700,
                    color: viewMode === 'panorama' ? "#000" : "#666",
                    cursor: "pointer", userSelect: "none", whiteSpace: "nowrap",
                    textDecoration: viewMode === 'panorama' ? 'underline' : 'none',
                    position: 'absolute',
                    left: metaPos.title,
                  }}
                >
                  PANORAMA
                </span>
                <span
                  ref={archiveRef}
                  onClick={() => { setViewMode('archive'); setSelectedIndex(0); }}
                  style={{
                    fontSize: 12, lineHeight: 1, fontWeight: 700,
                    color: viewMode === 'archive' ? "#000" : "#666",
                    cursor: "pointer", userSelect: "none", whiteSpace: "nowrap",
                    textDecoration: viewMode === 'archive' ? 'underline' : 'none',
                    position: 'absolute',
                    left: metaPos.creator,
                  }}
                >
                  ARCHIVE
                </span>
                <span
                  ref={galleryRef}
                  onClick={() => { setViewMode('gallery'); setSelectedIndex(0); }}
                  style={{
                    fontSize: 12, lineHeight: 1, fontWeight: 700,
                    color: viewMode === 'gallery' ? "#000" : "#666",
                    cursor: "pointer", userSelect: "none", whiteSpace: "nowrap",
                    textDecoration: viewMode === 'gallery' ? 'underline' : 'none',
                    position: 'absolute',
                    left: metaPos.date,
                  }}
                >
                  GALLERY
                </span>
                {exhibition.startDate && !String(exhibition.startDate).toLowerCase().includes('permanent') && (
                  <span
                    onClick={() => setShowSubmissionForm(true)}
                    style={{
                      fontSize: 12, lineHeight: 1, fontWeight: 700,
                      color: "#666",
                      cursor: "pointer", userSelect: "none", whiteSpace: "nowrap",
                      textDecoration: 'none',
                      position: 'absolute',
                      left: metaPos.dimension,
                      display: 'inline-block',
                      padding: '4px 8px',
                    }}
                  >
                    <svg
                      style={{ position: 'absolute', top: -8, left: -12, width: 'calc(100% + 24px)', height: 'calc(100% + 16px)', pointerEvents: 'none' }}
                      viewBox="0 0 100 40"
                      preserveAspectRatio="none"
                    >
                      <ellipse
                        cx="50" cy="20" rx="48" ry="18"
                        fill="none"
                        stroke="#333"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeDasharray="3,2"
                        style={{ transform: 'rotate(-2deg)', transformOrigin: 'center' }}
                      />
                    </svg>
                    + SUBMIT
                  </span>
                )}
              </div>
            );
          }

          // Narrow screen: 3-column grid layout
          // Column 1 (PANORAMA): Room selector + year filter
          // Column 2 (ARCHIVE): TITLE + CREATOR
          // Column 3 (GALLERY): DATE + DIMENSION
          // Left margin must clear the left panel (150px) + some padding
          const narrowMarginLeft = isMobile ? 12 : 160;
          const narrowMarginRight = isVeryNarrow ? 16 : 24;
          const titleText = displayArtwork?.name || "—";
          const creatorText = cleanArtistName(displayArtwork?.artist) || "—";
          const rawDate = displayArtwork?.date || (displayArtwork?.year ? String(displayArtwork.year) : "");
          const dateText = cleanDateText(rawDate) || "—";
          const dimensionText = displayArtwork?.dimension || "—";
          const durationText = displayArtwork?.duration || null;  // Video/film duration
          const mediumText = displayArtwork?.medium || displayArtwork?.technique || displayArtwork?.materials || "—";
          const rawCategory = displayArtwork?.category || displayArtwork?.artworkType || (displayArtwork as Record<string, unknown>)?.objectType;
          const categoryText = rawCategory && typeof rawCategory !== 'object' ? String(rawCategory) : "—";

          // Mobile: mode tabs at bottom, fixed position
          if (isMobile) {
            return (
              <>
                {/* Filter buttons - top left area (same style as full screen) */}
                <div ref={topBarRef} style={{ position: "relative", padding: "8px 12px", zIndex: 100 }}>
                  {/* ALL button with count outside - exactly like PC mode */}
                  <div style={{ marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button
                      onClick={() => { setSelectedRoomId('ALL'); setSelectedIndex(0); }}
                      style={{
                        padding: '0 6px',
                        height: 20,
                        fontSize: 10.5,
                        fontWeight: 400,
                        borderRadius: 4,
                        border: 'none',
                        background: selectedRoomId === 'ALL' ? '#111' : '#f2f2f2',
                        color: selectedRoomId === 'ALL' ? '#fff' : '#666',
                        cursor: 'pointer',
                        transition: 'all 0.1s ease'
                      }}
                    >
                      ALL
                    </button>
                    <span style={{ fontSize: 10, color: '#666' }}>
                      ({nmkTotalCount > 0 ? `${filteredArtworks.length.toLocaleString()} / ${nmkTotalCount.toLocaleString()}` : filteredArtworks.length.toLocaleString()})
                    </span>
                  </div>
                  {/* Year/Century buttons - toggle approach */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
                    {availableCenturies.map((c) => (
                      <button
                        key={`c-${c}`}
                        onClick={() => {
                          if (selectedCentury === c) {
                            setSelectedCentury(null);
                            setSelectedYearRange('ALL');
                          } else {
                            setSelectedCentury(c);
                            setSelectedYearRange('ALL');
                          }
                          setSelectedIndex(0);
                        }}
                        style={{
                          padding: '0 6px',
                          height: 20,
                          fontSize: 10.5,
                          fontWeight: selectedCentury === c ? 500 : 400,
                          borderRadius: 4,
                          border: 'none',
                          background: selectedCentury === c ? '#111' : '#f2f2f2',
                          color: selectedCentury === c ? '#fff' : '#666',
                          cursor: 'pointer',
                          transition: 'all 0.1s ease'
                        }}
                      >
                        {`${c}c`}
                      </button>
                    ))}
                  </div>
                  {/* Decade buttons - show when century selected */}
                  {selectedCentury && availableDecades.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
                      {availableDecades.map((d) => (
                        <button
                          key={`d-${d}`}
                          onClick={() => {
                            if (selectedYearRange === String(d)) {
                              setSelectedYearRange('ALL');
                            } else {
                              setSelectedYearRange(String(d));
                            }
                            setSelectedIndex(0);
                          }}
                          style={{
                            padding: '0 6px',
                            height: 20,
                            fontSize: 10.5,
                            fontWeight: selectedYearRange === String(d) ? 500 : 400,
                            borderRadius: 4,
                            border: 'none',
                            background: selectedYearRange === String(d) ? '#111' : '#f2f2f2',
                            color: selectedYearRange === String(d) ? '#fff' : '#666',
                            cursor: 'pointer',
                            transition: 'all 0.1s ease'
                          }}
                        >
                          {d}
                        </button>
                      ))}
                    </div>
                  )}
                  {/* 2D/3D buttons and Special Filters */}
                  {(hasCategorizedArtworks || hasArchivalArtworks || exhibition.id === 'guggenheim-bilbao-collection' || exhibition.id === 'kunsthaus-collection' || exhibition.id === 'khm-collection' || exhibition.id === 'picasso-bcn-collection') && (
                    <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                      {/* 2D/3D Type Buttons */}
                      {hasCategorizedArtworks && (['2D', '3D'] as const).map(t => (
                        <button
                          key={t}
                          onClick={() => {
                            setSelectedTypes(prev => {
                              if (prev.has(t)) return new Set();
                              return new Set([t]);
                            });
                            setSelectedMediumFacets(new Set());
                            setSelectedIndex(0);
                          }}
                          style={{
                            padding: '0 6px',
                            height: 20,
                            fontSize: 10.5,
                            fontWeight: selectedTypes.has(t) ? 500 : 400,
                            borderRadius: 4,
                            border: 'none',
                            background: selectedTypes.has(t) ? '#111' : '#f2f2f2',
                            color: selectedTypes.has(t) ? '#fff' : '#666',
                            cursor: 'pointer',
                            transition: 'all 0.1s ease'
                          }}
                        >
                          {t}
                        </button>
                      ))}
                      
                      {/* N Button (Uncategorized) */}
                      {hasCategorizedArtworks && hasUncategorizedArtworks && (
                        <button
                          key="N"
                          onClick={() => {
                            setSelectedTypes(prev => {
                              if (prev.has('N')) return new Set();
                              return new Set(['N']);
                            });
                            setSelectedMediumFacets(new Set());
                            setSelectedIndex(0);
                          }}
                          style={{
                            padding: '0 6px',
                            height: 20,
                            fontSize: 10.5,
                            fontWeight: selectedTypes.has('N') ? 500 : 400,
                            borderRadius: 4,
                            border: 'none',
                            background: selectedTypes.has('N') ? '#111' : '#f2f2f2',
                            color: selectedTypes.has('N') ? '#fff' : '#666',
                            cursor: 'pointer',
                            transition: 'all 0.1s ease'
                          }}
                        >
                          N
                        </button>
                      )}

                      {/* Special Filters */}
                      {hasArchivalArtworks && (
                        <button
                          onClick={() => { setShowArtworksOnly(!showArtworksOnly); setSelectedIndex(0); }}
                          style={{ padding: '0 6px', height: 20, fontSize: 10.5, fontWeight: showArtworksOnly ? 500 : 400, borderRadius: 4, border: 'none', background: showArtworksOnly ? '#111' : '#f2f2f2', color: showArtworksOnly ? '#fff' : '#666', cursor: 'pointer', transition: 'all 0.1s ease' }}
                        >
                          ARTWORKS ONLY
                        </button>
                      )}
                      {(exhibition.id === 'guggenheim-bilbao-collection' || exhibition.id === 'kunsthaus-collection' || exhibition.id === 'khm-collection') && (
                        <button
                          key="on-view-btn"
                          onClick={() => { setShowOnViewOnly(!showOnViewOnly); setSelectedIndex(0); }}
                          style={{ padding: '0 6px', height: 20, fontSize: 10.5, fontWeight: showOnViewOnly ? 500 : 400, borderRadius: 4, border: 'none', background: showOnViewOnly ? '#111' : '#f2f2f2', color: showOnViewOnly ? '#fff' : '#666', cursor: 'pointer', transition: 'all 0.1s ease', display: 'inline-block' }}
                        >
                          ON VIEW
                        </button>
                      )}
                      {exhibition.id === 'picasso-bcn-collection' && (
                        <button
                          onClick={() => { setShowHighlightOnly(!showHighlightOnly); setSelectedIndex(0); }}
                          style={{ padding: '0 6px', height: 20, fontSize: 10.5, fontWeight: showHighlightOnly ? 500 : 400, borderRadius: 4, border: 'none', background: showHighlightOnly ? '#111' : '#f2f2f2', color: showHighlightOnly ? '#fff' : '#666', cursor: 'pointer', transition: 'all 0.1s ease' }}
                        >
                          HIGHLIGHT
                        </button>
                      )}
                    </div>
                  )}
                  {hasCategorizedArtworks && selectedTypes.size > 0 && availableTechniqueFacets.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
                      {availableTechniqueFacets.map((f) => (
                        <button
                          key={`pc-facet-${f.id}`}
                          onClick={() => { setSelectedMediumFacets(prev => { const next = new Set(prev); if (next.has(f.id)) next.delete(f.id); else next.add(f.id); return next; }); setSelectedIndex(0); }}
                          style={{ padding: '0 6px', height: 20, fontSize: 10.5, fontWeight: selectedMediumFacets.has(f.id) ? 500 : 400, borderRadius: 4, border: 'none', background: selectedMediumFacets.has(f.id) ? '#111' : '#f2f2f2', color: selectedMediumFacets.has(f.id) ? '#fff' : '#666', cursor: 'pointer', transition: 'all 0.1s ease' }}
                          title={`${f.label} (${f.count.toLocaleString()})`}
                        >
                          {f.label}
                        </button>
                      ))}
                    </div>
                  )}
                  {/* Category Filter Buttons - cumulative multi-select */}
                  {availableCategories.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
                      {availableCategories.map(cat => (
                        <button
                          key={`pc-cat-${cat}`}
                          onClick={() => { setSelectedCategories(prev => { const next = new Set(prev); if (next.has(cat)) next.delete(cat); else next.add(cat); return next; }); setSelectedIndex(0); }}
                          style={{
                            padding: '0 6px',
                            height: 20,
                            fontSize: 10.5,
                            fontWeight: selectedCategories.has(cat) ? 500 : 400,
                            borderRadius: 4,
                            border: 'none',
                            background: selectedCategories.has(cat) ? '#111' : '#f2f2f2',
                            color: selectedCategories.has(cat) ? '#fff' : '#666',
                            cursor: 'pointer',
                            transition: 'all 0.1s ease'
                          }}
                        >
                          {CATEGORY_LABEL_MAP[cat] || cat}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {/* SEARCH - positioned below top right buttons (hidden in archive mode) */}
                {viewMode !== 'archive' && (
                  <div style={{ position: 'absolute', top: 35, right: 19, zIndex: 200 }}>
                    <div style={{ fontSize: 10, letterSpacing: 1.2, color: "#888", marginBottom: -10 }}>SEARCH</div>
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => { setSearchQuery(e.target.value); setSelectedIndex(0); }}
                      placeholder=""
                      style={{
                        width: 100,
                        fontSize: 11,
                        color: '#222',
                        border: 'none',
                        borderBottom: '1px solid #ccc',
                        outline: 'none',
                        background: 'transparent',
                        padding: 0,
                        lineHeight: 1.3,
                      }}
                    />
                  </div>
                )}
                {/* Mode tabs - fixed at bottom, transparent */}
                <div style={{
                  position: 'fixed',
                  bottom: 0,
                  left: 0,
                  right: 0,
                  display: 'flex',
                  justifyContent: 'space-around',
                  alignItems: 'center',
                  padding: '8px 0 12px 0',
                  background: 'transparent',
                  zIndex: 300
                }}>
                  <span
                    onClick={() => { setViewMode('panorama'); setSelectedIndex(0); }}
                    style={{
                      fontSize: 10, fontWeight: 700,
                      color: viewMode === 'panorama' ? '#000' : '#888',
                      cursor: 'pointer', userSelect: 'none',
                      textDecoration: viewMode === 'panorama' ? 'underline' : 'none',
                      textShadow: '0 0 4px rgba(255,255,255,0.9)'
                    }}
                  >
                    PANORAMA
                  </span>
                  <span
                    onClick={() => { setViewMode('archive'); setSelectedIndex(0); }}
                    style={{
                      fontSize: 10, fontWeight: 700,
                      color: viewMode === 'archive' ? '#000' : '#888',
                      cursor: 'pointer', userSelect: 'none',
                      textDecoration: viewMode === 'archive' ? 'underline' : 'none',
                      textShadow: '0 0 4px rgba(255,255,255,0.9)'
                    }}
                  >
                    ARCHIVE
                  </span>
                  <span
                    onClick={() => { setViewMode('gallery'); setSelectedIndex(0); }}
                    style={{
                      fontSize: 10, fontWeight: 700,
                      color: viewMode === 'gallery' ? '#000' : '#888',
                      cursor: 'pointer', userSelect: 'none',
                      textDecoration: viewMode === 'gallery' ? 'underline' : 'none',
                      textShadow: '0 0 4px rgba(255,255,255,0.9)'
                    }}
                  >
                    GALLERY
                  </span>
                </div>
              </>
            );
          }

          return (
            <div ref={(el) => { (topBarRef as any).current = el; (headerRef as any).current = el; }} style={{ position: "relative", padding: "8px 0", marginLeft: narrowMarginLeft, marginRight: narrowMarginRight, zIndex: 100, ...(DEBUG_LAYOUT ? { outline: "1px dashed #00f" } : {}) }}>
              {/* Row 1: Mode tabs */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 12 }}>
                <span
                  onClick={() => { setViewMode('panorama'); setSelectedIndex(0); }}
                  style={{
                    fontSize: 12, lineHeight: 1, fontWeight: 700,
                    color: viewMode === 'panorama' ? "#000" : "#666",
                    cursor: "pointer", userSelect: "none", whiteSpace: "nowrap",
                    textDecoration: viewMode === 'panorama' ? 'underline' : 'none',
                  }}
                >
                  PANORAMA
                </span>
                <span
                  ref={archiveRef}
                  onClick={() => { setViewMode('archive'); setSelectedIndex(0); }}
                  style={{
                    fontSize: 12, lineHeight: 1, fontWeight: 700,
                    color: viewMode === 'archive' ? "#000" : "#666",
                    cursor: "pointer", userSelect: "none", whiteSpace: "nowrap",
                    textDecoration: viewMode === 'archive' ? 'underline' : 'none',
                  }}
                >
                  ARCHIVE
                </span>
                <span
                  ref={galleryRef}
                  onClick={() => { setViewMode('gallery'); setSelectedIndex(0); }}
                  style={{
                    fontSize: 12, lineHeight: 1, fontWeight: 700,
                    color: viewMode === 'gallery' ? "#000" : "#666",
                    cursor: "pointer", userSelect: "none", whiteSpace: "nowrap",
                    textDecoration: viewMode === 'gallery' ? 'underline' : 'none',
                  }}
                >
                  GALLERY
                </span>
              </div>

              {/* Row 2: Content under each tab - 3 columns */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, alignItems: "start" }}>
                {/* Column 1: Room selector + Year filter + SEARCH (under PANORAMA) */}
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {/* ALL button - interaction updated */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <button
                      onClick={() => { setSelectedCentury(null); setSelectedYearRange('ALL'); setSelectedTypes(new Set()); setSelectedCategories(new Set()); setSelectedIndex(0); }}
                      style={{ padding: '0 6px', height: 20, fontSize: 10.5, fontWeight: 400, borderRadius: 4, border: 'none', background: (selectedRoomId === 'ALL' && !selectedCentury && selectedTypes.size === 0 && selectedCategories.size === 0) ? '#111' : '#f2f2f2', color: (selectedRoomId === 'ALL' && !selectedCentury && selectedTypes.size === 0 && selectedCategories.size === 0) ? '#fff' : '#666', cursor: 'pointer', transition: 'all 0.1s ease' }}
                    >ALL</button>
                    <span style={{ fontSize: 10, color: '#666' }}>({nmkTotalCount > 0 ? `${filteredArtworks.length.toLocaleString()} / ${nmkTotalCount.toLocaleString()}` : filteredArtworks.length.toLocaleString()})</span>
                  </div>
                  {/* Year/Century buttons - toggle approach */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {availableCenturies.map((c) => (
                      <button
                        key={`c-${c}`}
                        onClick={() => {
                          if (selectedCentury === c) {
                            setSelectedCentury(null);
                            setSelectedYearRange('ALL');
                          } else {
                            setSelectedCentury(c);
                            setSelectedYearRange('ALL');
                          }
                          setSelectedIndex(0);
                        }}
                        style={{ padding: '0 6px', height: 20, fontSize: 10.5, fontWeight: selectedCentury === c ? 500 : 400, borderRadius: 4, border: 'none', background: selectedCentury === c ? '#111' : '#f2f2f2', color: selectedCentury === c ? '#fff' : '#666', cursor: 'pointer', transition: 'all 0.1s ease' }}
                      >
                        {`${c}c`}
                      </button>
                    ))}
                  </div>
                  {/* Decade buttons - show when century selected */}
                  {selectedCentury && availableDecades.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {availableDecades.map((d) => (
                        <button
                          key={`d-${d}`}
                          onClick={() => {
                            if (selectedYearRange === String(d)) {
                              setSelectedYearRange('ALL');
                            } else {
                              setSelectedYearRange(String(d));
                            }
                            setSelectedIndex(0);
                          }}
                          style={{ padding: '0 6px', height: 20, fontSize: 10.5, fontWeight: selectedYearRange === String(d) ? 500 : 400, borderRadius: 4, border: 'none', background: selectedYearRange === String(d) ? '#111' : '#f2f2f2', color: selectedYearRange === String(d) ? '#fff' : '#666', cursor: 'pointer', transition: 'all 0.1s ease' }}
                        >
                          {d}
                        </button>
                      ))}
                    </div>
                  )}
                  {/* 2D/3D buttons - only show if artworks have type field */}
                  {/* 2D/3D buttons - only show if artworks have type field */}
                  {hasCategorizedArtworks && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {(['2D', '3D'] as const).map(t => (
                        <button
                          key={t}
                          onClick={() => {
                            setSelectedTypes(prev => {
                              if (prev.has(t)) return new Set();
                              return new Set([t]);
                            });
                            setSelectedMediumFacets(new Set());
                            setSelectedIndex(0);
                          }}
                          style={{ padding: '0 6px', height: 20, fontSize: 10.5, fontWeight: selectedTypes.has(t) ? 500 : 400, borderRadius: 4, border: 'none', background: selectedTypes.has(t) ? '#111' : '#f2f2f2', color: selectedTypes.has(t) ? '#fff' : '#666', cursor: 'pointer', transition: 'all 0.1s ease' }}
                        >
                          {t}
                        </button>
                      ))}
                      {hasUncategorizedArtworks && (
                        <button
                          key="N"
                          onClick={() => {
                            setSelectedTypes(prev => {
                              if (prev.has('N')) return new Set();
                              return new Set(['N']);
                            });
                            setSelectedMediumFacets(new Set());
                            setSelectedIndex(0);
                          }}
                          style={{ padding: '0 6px', height: 20, fontSize: 10.5, fontWeight: selectedTypes.has('N') ? 500 : 400, borderRadius: 4, border: 'none', background: selectedTypes.has('N') ? '#111' : '#f2f2f2', color: selectedTypes.has('N') ? '#fff' : '#666', cursor: 'pointer', transition: 'all 0.1s ease' }}
                        >
                          N
                        </button>
                      )}
                      {hasArchivalArtworks && (
                        <button
                          onClick={() => { setShowArtworksOnly(!showArtworksOnly); setSelectedIndex(0); }}
                          style={{ padding: '0 6px', height: 20, fontSize: 10.5, fontWeight: showArtworksOnly ? 500 : 400, borderRadius: 4, border: 'none', background: showArtworksOnly ? '#111' : '#f2f2f2', color: showArtworksOnly ? '#fff' : '#666', cursor: 'pointer', transition: 'all 0.1s ease' }}
                        >
                          ARTWORKS ONLY
                        </button>
                      )}
                      {exhibition.id === 'guggenheim-bilbao-collection' && (
                        <button
                          onClick={() => { setShowOnViewOnly(!showOnViewOnly); setSelectedIndex(0); }}
                          style={{ padding: '0 6px', height: 20, fontSize: 10.5, fontWeight: showOnViewOnly ? 500 : 400, borderRadius: 4, border: 'none', background: showOnViewOnly ? '#111' : '#f2f2f2', color: showOnViewOnly ? '#fff' : '#666', cursor: 'pointer', transition: 'all 0.1s ease' }}
                        >
                          ON VIEW
                        </button>
                      )}
                      {(exhibition.id === 'rijksmuseum-paintings' || exhibition.id === 'rijksmuseum-photography') && (
                        <button
                          onClick={() => { setShowOnDisplayOnly(!showOnDisplayOnly); setSelectedIndex(0); }}
                          style={{ padding: '0 6px', height: 20, fontSize: 10.5, fontWeight: showOnDisplayOnly ? 500 : 400, borderRadius: 4, border: 'none', background: showOnDisplayOnly ? '#111' : '#f2f2f2', color: showOnDisplayOnly ? '#fff' : '#666', cursor: 'pointer', transition: 'all 0.1s ease' }}
                        >
                          ON DISPLAY
                        </button>
                      )}
                      {exhibition.id === 'picasso-bcn-collection' && (
                        <button
                          onClick={() => { setShowHighlightOnly(!showHighlightOnly); setSelectedIndex(0); }}
                          style={{ padding: '0 6px', height: 20, fontSize: 10.5, fontWeight: showHighlightOnly ? 500 : 400, borderRadius: 4, border: 'none', background: showHighlightOnly ? '#111' : '#f2f2f2', color: showHighlightOnly ? '#fff' : '#666', cursor: 'pointer', transition: 'all 0.1s ease' }}
                        >
                          HIGHLIGHT
                        </button>
                      )}
                    </div>
                  )}
                  {hasCategorizedArtworks && selectedTypes.size > 0 && availableTechniqueFacets.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                      {availableTechniqueFacets.map((f) => (
                        <button
                          key={`narrow-facet-${f.id}`}
                          onClick={() => { setSelectedMediumFacets(prev => { const next = new Set(prev); if (next.has(f.id)) next.delete(f.id); else next.add(f.id); return next; }); setSelectedIndex(0); }}
                          style={{ padding: '0 6px', height: 20, fontSize: 10.5, fontWeight: selectedMediumFacets.has(f.id) ? 500 : 400, borderRadius: 4, border: 'none', background: selectedMediumFacets.has(f.id) ? '#111' : '#f2f2f2', color: selectedMediumFacets.has(f.id) ? '#fff' : '#666', cursor: 'pointer', transition: 'all 0.1s ease' }}
                          title={`${f.label} (${f.count.toLocaleString()})`}
                        >
                          {f.label}
                        </button>
                      ))}
                    </div>
                  )}
                  {/* Category Filter Buttons */}
                  {availableCategories.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {availableCategories.map(cat => (
                        <button
                          key={`narrow-cat-${cat}`}
                          onClick={() => { setSelectedCategories(prev => { const next = new Set(prev); if (next.has(cat)) next.delete(cat); else next.add(cat); return next; }); setSelectedIndex(0); }}
                          style={{ padding: '0 6px', height: 20, fontSize: 10.5, fontWeight: selectedCategories.has(cat) ? 500 : 400, borderRadius: 4, border: 'none', background: selectedCategories.has(cat) ? '#111' : '#f2f2f2', color: selectedCategories.has(cat) ? '#fff' : '#666', cursor: 'pointer', transition: 'all 0.1s ease' }}
                        >
                          {CATEGORY_LABEL_MAP[cat] || cat}
                        </button>
                      ))}
                    </div>
                  )}
                  {/* SEARCH */}
                  <div style={{ marginTop: 45 }}>
                    <div style={{ fontSize: 10, letterSpacing: 1.2, color: "#888", marginBottom: -10 }}>SEARCH</div>
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => { setSearchQuery(e.target.value); setSelectedIndex(0); }}
                      placeholder=""
                      style={{
                        width: '100%',
                        maxWidth: 100,
                        fontSize: 11,
                        color: '#222',
                        border: 'none',
                        borderBottom: '1px solid #ccc',
                        outline: 'none',
                        background: 'transparent',
                        padding: 0,
                        lineHeight: 1.3,
                      }}
                    />
                  </div>
                </div>

                {/* Column 2: TITLE + CREATOR + MEDIUM (under ARCHIVE) */}
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <div>
                    <div style={{ fontSize: 10, letterSpacing: 1.2, color: "#888", marginBottom: 2 }}>TITLE</div>
                    <div style={{ fontSize: 11, color: "#222", fontWeight: 700, lineHeight: 1.3, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{titleText}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10, letterSpacing: 1.2, color: "#888", marginBottom: 2 }}>CREATOR</div>
                    <div style={{ fontSize: 11, color: "#222", lineHeight: 1.3, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{creatorText}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10, letterSpacing: 1.2, color: "#888", marginBottom: 2 }}>MEDIUM</div>
                    <div style={{ fontSize: 11, color: "#222", lineHeight: 1.3, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{mediumText}</div>
                  </div>
                </div>

                {/* Column 3: DATE + DIMENSION/DURATION + CATEGORY + SEARCH (under GALLERY) */}
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <div>
                    <div style={{ fontSize: 10, letterSpacing: 1.2, color: "#888", marginBottom: 2 }}>DATE</div>
                    <div style={{ fontSize: 11, color: "#222", lineHeight: 1.3, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{dateText}</div>
                  </div>
                  {durationText ? (
                    <div>
                      <div style={{ fontSize: 10, letterSpacing: 1.2, color: "#888", marginBottom: 2 }}>DURATION</div>
                      <div style={{ fontSize: 11, color: "#222", lineHeight: 1.3, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{durationText}</div>
                    </div>
                  ) : (
                    <div>
                      <div style={{ fontSize: 10, letterSpacing: 1.2, color: "#888", marginBottom: 2 }}>DIMENSION</div>
                      <div style={{ fontSize: 11, color: "#222", lineHeight: 1.3, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{dimensionText}</div>
                    </div>
                  )}
                  <div>
                    <div style={{ fontSize: 10, letterSpacing: 1.2, color: "#888", marginBottom: 2 }}>CATEGORY</div>
                    <div style={{ fontSize: 11, color: "#222", lineHeight: 1.3, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{categoryText}</div>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}
        {/* Room selector: placed between top bar and meta row (chunked rows of 5) */}
        {/* Room selector: absolute so it doesn't push down the metadata; wraps when it runs out of width */}
        {/* Hide on narrow screens - included in the 3-column layout above */}
        {!isNarrow && (
          <div style={{ position: 'absolute', left: selectorLeft, top: selectorTop, width: selectorWidth, zIndex: 110 }}>
            {/* Always show ALL button with count for collections */}
            <div style={{ marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
              <button
                onClick={() => { setSelectedRoomId('ALL'); setSelectedCentury(null); setSelectedYearRange('ALL'); setSelectedTypes(new Set()); setSelectedCategories(new Set()); setSelectedIndex(0); }}
                style={{ padding: '0 6px', height: 20, fontSize: 10.5, fontWeight: 400, borderRadius: 4, border: 'none', background: (selectedRoomId === 'ALL' && !selectedCentury && selectedTypes.size === 0 && selectedCategories.size === 0) ? '#111' : '#f2f2f2', color: (selectedRoomId === 'ALL' && !selectedCentury && selectedTypes.size === 0 && selectedCategories.size === 0) ? '#fff' : '#666', cursor: 'pointer', transition: 'all 0.1s ease' }}
              >ALL</button>
              <span style={{ fontSize: 10, color: '#666' }}>({nmkTotalCount > 0 ? `${filteredArtworks.length.toLocaleString()} / ${nmkTotalCount.toLocaleString()}` : filteredArtworks.length.toLocaleString()})</span>
            </div>
            {/* Room selector - only show if rooms exist */}
            {roomButtons.length > 0 && (
              <div style={{ width: '100%' }}>
                {/* Unified gallery-style room selector for all modes */}
                {(selectorData.rows.length > 0 ? selectorData.rows : []).map((row, rIdx) => (
                  <div key={`row-${rIdx}`} style={{ display: 'grid', gridTemplateColumns: `repeat(${row.length}, ${SELECTOR_COL_WIDTH}px)`, columnGap: SELECTOR_COL_GAP, rowGap: 2, justifyContent: 'start', marginBottom: 1 }}>
                    {row.map((btn) => (
                      <button key={btn.id} onClick={() => { if (btn.exists) { setSelectedRoomId(prev => (prev === btn.id ? 'ALL' : btn.id)); setSelectedIndex(0); } }} disabled={!btn.exists} style={{ width: '100%', height: 18, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 0, fontSize: 9.5, fontWeight: selectedRoomId === btn.id ? 500 : 400, borderRadius: 4, border: btn.exists ? 'none' : '1px dashed rgba(0,0,0,0.18)', background: btn.exists ? (selectedRoomId === btn.id ? '#111' : '#f2f2f2') : 'rgba(0,0,0,0.03)', color: btn.exists ? (selectedRoomId === btn.id ? '#fff' : '#666') : 'rgba(0,0,0,0.38)', opacity: btn.exists ? 1 : 0.75, cursor: btn.exists ? 'pointer' : 'default', boxSizing: 'border-box', transition: 'all 0.1s ease' }}>
                        {btn.label}
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            )}

            {/* Year filtering buttons - toggle-based approach */}
            <div style={{ marginTop: 6, padding: '2px 0' }}>
              {/* Century buttons - always show, click to toggle */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {availableCenturies.map((c) => (
                  <button
                    key={`c-${c}`}
                    onClick={() => {
                      if (selectedCentury === c) {
                        // Toggle off - deselect century and decade
                        setSelectedCentury(null);
                        setSelectedYearRange('ALL');
                      } else {
                        // Select century
                        setSelectedCentury(c);
                        setSelectedYearRange('ALL');
                      }
                      setSelectedIndex(0);
                    }}
                    style={{
                      padding: '0 6px',
                      height: 20,
                      fontSize: 10.5,
                      fontWeight: selectedCentury === c ? 500 : 400,
                      borderRadius: 4,
                      border: 'none',
                      background: selectedCentury === c ? '#111' : '#f2f2f2',
                      color: selectedCentury === c ? '#fff' : '#666',
                      cursor: 'pointer',
                      transition: 'all 0.1s ease'
                    }}
                  >
                    {`${c}c`}
                  </button>
                ))}
              </div>
              {/* Decade buttons - show only when a century is selected */}
              {selectedCentury && availableDecades.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                  {availableDecades.map((d) => (
                    <button
                      key={`d-${d}`}
                      onClick={() => {
                        // Toggle decade
                        if (selectedYearRange === String(d)) {
                          setSelectedYearRange('ALL');
                        } else {
                          setSelectedYearRange(String(d));
                        }
                        setSelectedIndex(0);
                      }}
                      style={{
                        padding: '0 6px',
                        height: 20,
                        fontSize: 10.5,
                        fontWeight: selectedYearRange === String(d) ? 500 : 400,
                        borderRadius: 4,
                        border: 'none',
                        background: selectedYearRange === String(d) ? '#111' : '#f2f2f2',
                        color: selectedYearRange === String(d) ? '#fff' : '#666',
                        cursor: 'pointer',
                        transition: 'all 0.1s ease'
                      }}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              )}
              {/* 2D/3D type filter + ARTWORKS ONLY - shown when relevant */}
              {(hasCategorizedArtworks || hasArchivalArtworks) && (
                <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {hasCategorizedArtworks && (['2D', '3D'] as const).map(t => (
                    <button
                      key={t}
                      onClick={() => {
                        setSelectedTypes(prev => {
                          // Single select toggle behavior
                          if (prev.has(t)) {
                            // Deselect (show nothing)
                            return new Set();
                          }
                          // Select only this typ (show sub-categories)
                          return new Set([t]);
                        });
                        setSelectedMediumFacets(new Set());
                        setSelectedIndex(0);
                      }}
                      style={{
                        padding: '0 6px',
                        height: 20,
                        fontSize: 10.5,
                        fontWeight: selectedTypes.has(t) ? 500 : 400,
                        borderRadius: 4,
                        border: 'none',
                        background: selectedTypes.has(t) ? '#111' : '#f2f2f2',
                        color: selectedTypes.has(t) ? '#fff' : '#666',
                        cursor: 'pointer',
                        transition: 'all 0.1s ease'
                      }}
                    >
                      {t}
                    </button>
                  ))}
                  {hasUncategorizedArtworks && (
                    <button
                      key="N"
                      onClick={() => {
                        setSelectedTypes(prev => {
                          if (prev.has('N')) return new Set();
                          return new Set(['N']);
                        });
                        setSelectedMediumFacets(new Set());
                        setSelectedIndex(0);
                      }}
                      style={{
                        padding: '0 6px',
                        height: 20,
                        fontSize: 10.5,
                        fontWeight: selectedTypes.has('N') ? 500 : 400,
                        borderRadius: 4,
                        border: 'none',
                        background: selectedTypes.has('N') ? '#111' : '#f2f2f2',
                        color: selectedTypes.has('N') ? '#fff' : '#666',
                        cursor: 'pointer',
                        transition: 'all 0.1s ease'
                      }}
                    >
                      N
                    </button>
                  )}
                  {hasArchivalArtworks && (
                    <button
                      onClick={() => { setShowArtworksOnly(!showArtworksOnly); setSelectedIndex(0); }}
                      style={{
                        padding: '0 6px',
                        height: 20,
                        fontSize: 10.5,
                        fontWeight: showArtworksOnly ? 500 : 400,
                        borderRadius: 4,
                        border: 'none',
                        background: showArtworksOnly ? '#111' : '#f2f2f2',
                        color: showArtworksOnly ? '#fff' : '#666',
                        cursor: 'pointer',
                        transition: 'all 0.1s ease'
                      }}
                    >
                      ARTWORKS ONLY
                    </button>
                  )}
                  {(exhibition.id === 'guggenheim-bilbao-collection' || exhibition.id === 'khm-collection') && (
                    <button
                      onClick={() => { setShowOnViewOnly(!showOnViewOnly); setSelectedIndex(0); }}
                      style={{
                        padding: '0 6px',
                        height: 20,
                        fontSize: 10.5,
                        fontWeight: showOnViewOnly ? 500 : 400,
                        borderRadius: 4,
                        border: 'none',
                        background: showOnViewOnly ? '#111' : '#f2f2f2',
                        color: showOnViewOnly ? '#fff' : '#666',
                        cursor: 'pointer',
                        transition: 'all 0.1s ease'
                      }}
                    >
                      ON VIEW
                    </button>
                  )}
                  {(exhibition.id === 'rijksmuseum-paintings' || exhibition.id === 'rijksmuseum-photography') && (
                    <button
                      onClick={() => { setShowOnDisplayOnly(!showOnDisplayOnly); setSelectedIndex(0); }}
                      style={{
                        padding: '0 6px',
                        height: 20,
                        fontSize: 10.5,
                        fontWeight: showOnDisplayOnly ? 500 : 400,
                        borderRadius: 4,
                        border: 'none',
                        background: showOnDisplayOnly ? '#111' : '#f2f2f2',
                        color: showOnDisplayOnly ? '#fff' : '#666',
                        cursor: 'pointer',
                        transition: 'all 0.1s ease'
                      }}
                    >
                      ON DISPLAY
                    </button>
                  )}
                </div>
              )}
              {/* Reina Sofía medium sub-facets - separate row below 2D/3D */}
              {hasCategorizedArtworks && selectedTypes.size > 0 && availableTechniqueFacets.length > 0 && (
                <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {availableTechniqueFacets.map((f) => (
                    <button
                      key={`wide-facet-${f.id}`}
                      onClick={() => { setSelectedMediumFacets(prev => { const next = new Set(prev); if (next.has(f.id)) next.delete(f.id); else next.add(f.id); return next; }); setSelectedIndex(0); }}
                      style={{ padding: '0 6px', height: 20, fontSize: 10.5, fontWeight: selectedMediumFacets.has(f.id) ? 500 : 400, borderRadius: 4, border: 'none', background: selectedMediumFacets.has(f.id) ? '#111' : '#f2f2f2', color: selectedMediumFacets.has(f.id) ? '#fff' : '#666', cursor: 'pointer', transition: 'all 0.1s ease' }}
                      title={`${f.label} (${f.count.toLocaleString()})`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Wide screen Panorama filters - above meta row */}
        {!isNarrow && viewMode === 'panorama' && (
          <div style={{ marginLeft: LAYOUT_LEFT_BASE, marginRight: 80, marginBottom: 8, display: 'flex', flexDirection: 'column', gap: 6, opacity: hoverZoom ? 0 : 1, transition: 'opacity 200ms ease', pointerEvents: hoverZoom ? 'none' : 'auto' }}>
            {/* ALL button */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <button
                onClick={() => { setSelectedCentury(null); setSelectedYearRange('ALL'); setSelectedTypes(new Set()); setSelectedCategories(new Set()); setSelectedIndex(0); }}
                style={{ padding: '0 6px', height: 20, fontSize: 10.5, fontWeight: 400, borderRadius: 4, border: 'none', background: (selectedRoomId === 'ALL' && !selectedCentury && selectedTypes.size === 0 && selectedCategories.size === 0) ? '#111' : '#f2f2f2', color: (selectedRoomId === 'ALL' && !selectedCentury && selectedTypes.size === 0 && selectedCategories.size === 0) ? '#fff' : '#666', cursor: 'pointer', transition: 'all 0.1s ease' }}
              >ALL</button>
              <span style={{ fontSize: 10, color: '#666' }}>({nmkTotalCount > 0 ? `${filteredArtworks.length.toLocaleString()} / ${nmkTotalCount.toLocaleString()}` : filteredArtworks.length.toLocaleString()})</span>
            </div>
            {/* Century buttons */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {availableCenturies.map((c) => (
                <button
                  key={`wide-c-${c}`}
                  onClick={() => {
                    if (selectedCentury === c) {
                      setSelectedCentury(null);
                      setSelectedYearRange('ALL');
                    } else {
                      setSelectedCentury(c);
                      setSelectedYearRange('ALL');
                    }
                    setSelectedIndex(0);
                  }}
                  style={{ padding: '0 6px', height: 20, fontSize: 10.5, fontWeight: selectedCentury === c ? 500 : 400, borderRadius: 4, border: 'none', background: selectedCentury === c ? '#111' : '#f2f2f2', color: selectedCentury === c ? '#fff' : '#666', cursor: 'pointer', transition: 'all 0.1s ease' }}
                >
                  {`${c}c`}
                </button>
              ))}
            </div>
            {/* Decade buttons */}
            {selectedCentury && availableDecades.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {availableDecades.map((d) => (
                  <button
                    key={`wide-d-${d}`}
                    onClick={() => {
                      if (selectedYearRange === String(d)) {
                        setSelectedYearRange('ALL');
                      } else {
                        setSelectedYearRange(String(d));
                      }
                      setSelectedIndex(0);
                    }}
                    style={{ padding: '0 6px', height: 20, fontSize: 10.5, fontWeight: selectedYearRange === String(d) ? 500 : 400, borderRadius: 4, border: 'none', background: selectedYearRange === String(d) ? '#111' : '#f2f2f2', color: selectedYearRange === String(d) ? '#fff' : '#666', cursor: 'pointer', transition: 'all 0.1s ease' }}
                  >
                    {d}
                  </button>
                ))}
              </div>
            )}
            {/* 2D/3D buttons */}
            {hasCategorizedArtworks && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {(['2D', '3D'] as const).map(t => (
                  <button
                    key={`wide-pano-${t}`}
                    onClick={() => {
                      setSelectedTypes(prev => {
                        if (prev.has(t)) return new Set();
                        return new Set([t]);
                      });
                      setSelectedMediumFacets(new Set());
                      setSelectedIndex(0);
                    }}
                    style={{ padding: '0 6px', height: 20, fontSize: 10.5, fontWeight: selectedTypes.has(t) ? 500 : 400, borderRadius: 4, border: 'none', background: selectedTypes.has(t) ? '#111' : '#f2f2f2', color: selectedTypes.has(t) ? '#fff' : '#666', cursor: 'pointer', transition: 'all 0.1s ease' }}
                  >
                    {t}
                  </button>
                ))}
                {hasUncategorizedArtworks && (
                  <button
                    key="wide-pano-N"
                    onClick={() => {
                      setSelectedTypes(prev => {
                        if (prev.has('N')) return new Set();
                        return new Set(['N']);
                      });
                      setSelectedMediumFacets(new Set());
                      setSelectedIndex(0);
                    }}
                    style={{ padding: '0 6px', height: 20, fontSize: 10.5, fontWeight: selectedTypes.has('N') ? 500 : 400, borderRadius: 4, border: 'none', background: selectedTypes.has('N') ? '#111' : '#f2f2f2', color: selectedTypes.has('N') ? '#fff' : '#666', cursor: 'pointer', transition: 'all 0.1s ease' }}
                  >
                    N
                  </button>
                )}
                {hasArchivalArtworks && (
                  <button
                    onClick={() => { setShowArtworksOnly(!showArtworksOnly); setSelectedIndex(0); }}
                    style={{ padding: '0 6px', height: 20, fontSize: 10.5, fontWeight: showArtworksOnly ? 500 : 400, borderRadius: 4, border: 'none', background: showArtworksOnly ? '#111' : '#f2f2f2', color: showArtworksOnly ? '#fff' : '#666', cursor: 'pointer', transition: 'all 0.1s ease' }}
                  >
                    ARTWORKS ONLY
                  </button>
                )}
                {exhibition.id === 'guggenheim-bilbao-collection' && (
                  <button
                    onClick={() => { setShowOnViewOnly(!showOnViewOnly); setSelectedIndex(0); }}
                    style={{ padding: '0 6px', height: 20, fontSize: 10.5, fontWeight: showOnViewOnly ? 500 : 400, borderRadius: 4, border: 'none', background: showOnViewOnly ? '#111' : '#f2f2f2', color: showOnViewOnly ? '#fff' : '#666', cursor: 'pointer', transition: 'all 0.1s ease' }}
                  >
                    ON VIEW
                  </button>
                )}
                {(exhibition.id === 'rijksmuseum-paintings' || exhibition.id === 'rijksmuseum-photography' || exhibition.id === 'rijksmuseum-drawings' || exhibition.id === 'rijksmuseum-prints' || exhibition.id === 'rijksmuseum-prints2') && (
                  <button
                    onClick={() => { setShowOnDisplayOnly(!showOnDisplayOnly); setSelectedIndex(0); }}
                    style={{ padding: '0 6px', height: 20, fontSize: 10.5, fontWeight: showOnDisplayOnly ? 500 : 400, borderRadius: 4, border: 'none', background: showOnDisplayOnly ? '#111' : '#f2f2f2', color: showOnDisplayOnly ? '#fff' : '#666', cursor: 'pointer', transition: 'all 0.1s ease' }}
                  >
                    ON DISPLAY
                  </button>
                )}
                {exhibition.id === 'picasso-bcn-collection' && (
                  <button
                    onClick={() => { setShowHighlightOnly(!showHighlightOnly); setSelectedIndex(0); }}
                    style={{ padding: '0 6px', height: 20, fontSize: 10.5, fontWeight: showHighlightOnly ? 500 : 400, borderRadius: 4, border: 'none', background: showHighlightOnly ? '#111' : '#f2f2f2', color: showHighlightOnly ? '#fff' : '#666', cursor: 'pointer', transition: 'all 0.1s ease' }}
                  >
                    HIGHLIGHT
                  </button>
                )}
              </div>
            )}
            {/* Category buttons */}
            {availableCategories.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {availableCategories.map(cat => (
                  <button
                    key={`wide-pano-cat-${cat}`}
                    onClick={() => {
                      setSelectedCategories(prev => {
                        const next = new Set(prev);
                        if (next.has(cat)) next.delete(cat);
                        else next.add(cat);
                        return next;
                      });
                      setSelectedIndex(0);
                    }}
                    style={{ padding: '0 6px', height: 20, fontSize: 10.5, fontWeight: selectedCategories.has(cat) ? 500 : 400, borderRadius: 4, border: 'none', background: selectedCategories.has(cat) ? '#111' : '#f2f2f2', color: selectedCategories.has(cat) ? '#fff' : '#666', cursor: 'pointer', transition: 'all 0.1s ease' }}
                  >
                    {CATEGORY_LABEL_MAP[cat] || cat}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Artwork meta info (below the top bar, aligned to Gallery/Archive; dynamic per selected artwork) */}
        {/* Hide on narrow screens - included in the 3-column layout above */}
        {/* When zoomed, inner content animates up to top position (replace mode tabs), but container stays in place */}
        {!isNarrow && (viewMode === 'archive' || viewMode === 'gallery' || viewMode === 'panorama') && (
          <div ref={metaRowRef} style={{
            position: "relative",
            padding: "12px 12px 0 0",
            marginLeft: LAYOUT_LEFT_BASE + META_SHIFT,
            marginTop: metaMarginTop,
            marginRight: LAYOUT_RIGHT_PAD,
            minHeight: FIXED_META_HEIGHT + META_VERTICAL_PAD,
            overflow: 'visible',
            ...(DEBUG_LAYOUT ? { outline: "1px solid #f00" } : {})
          }}>
            {(() => {
              // When zoom is active, show the zoomed artwork's info
              const activeArtwork = hoverZoom ? hoverZoom.artwork : displayArtwork;
              const titleText = activeArtwork?.name || "—";
              const creatorText = cleanArtistName(activeArtwork?.artist) || "—";
              const rawDate = activeArtwork?.date || (activeArtwork?.year ? String(activeArtwork.year) : "");
              const dateText = cleanDateText(rawDate) || "—";
              const dimensionText = activeArtwork?.dimension || "—";
              const durationText = activeArtwork?.duration || null;  // Video/film duration
              // Medium/Technique/Materials
              const mediumText = (activeArtwork as Record<string, unknown>)?.medium || (activeArtwork as Record<string, unknown>)?.technique || (activeArtwork as Record<string, unknown>)?.materials || null;
              // Category/ArtworkType
              const categoryText = (activeArtwork as Record<string, unknown>)?.category || (activeArtwork as Record<string, unknown>)?.artworkType || (activeArtwork as Record<string, unknown>)?.objectType || null;
              const gap = Math.max(160, Math.min(360, metaPos.date - metaPos.creator - 12));
              // shrink horizontal allocation to avoid cramped columns; allow content to wrap vertically
              const shrunk = Math.max(80, Math.floor(gap * META_HOR_SCALE));
              const titleW = shrunk;
              const creatorW = shrunk;
              const dateW = shrunk;
              // Calculate the Y offset for zoom animation
              const zoomYOffset = hoverZoom ? -(topBarHeight + metaMarginTop + 16) : 0;
              // Wide screens: use absolute positioning
              return (
                <>
                  {/* TITLE */}
                  <div ref={titleRef} style={{ position: "absolute", left: metaPos.title, top: 12, maxWidth: titleW, transform: `translateY(${zoomYOffset}px)`, transition: 'transform 300ms ease', zIndex: hoverZoom ? 200 : undefined, ...(DEBUG_LAYOUT ? { outline: "1px dashed #f66" } : {}) }}>
                    <div style={{ fontSize: 10, letterSpacing: 1.2, color: "#888", marginBottom: 4 }}>TITLE</div>
                    <div ref={metaTitleValueRef} style={{ fontSize: 12, color: "#222", fontWeight: 700, lineHeight: 1.3, whiteSpace: "normal", wordBreak: "break-word", overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', maxHeight: 36 }}>{titleText}</div>
                  </div>
                  {/* MEDIUM (below TITLE) */}
                  <div style={{ position: "absolute", left: metaPos.title, top: 70, maxWidth: titleW, transform: `translateY(${zoomYOffset}px)`, transition: 'transform 300ms ease', zIndex: hoverZoom ? 200 : undefined }}>
                    <div style={{ fontSize: 10, letterSpacing: 1.2, color: "#888", marginBottom: 4 }}>MEDIUM</div>
                    <div style={{ fontSize: 12, color: "#222", lineHeight: 1.3, whiteSpace: "normal", wordBreak: "break-word", overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', maxHeight: 36 }}>{mediumText ? String(mediumText) : "—"}</div>
                  </div>
                  {/* CREATOR */}
                  <div ref={creatorRef} style={{ position: "absolute", left: metaPos.creator, top: 12, maxWidth: creatorW, transform: `translateY(${zoomYOffset}px)`, transition: 'transform 300ms ease', zIndex: hoverZoom ? 200 : undefined, ...(DEBUG_LAYOUT ? { outline: "1px dashed #6f6" } : {}) }}>
                    <div style={{ fontSize: 10, letterSpacing: 1.2, color: "#888", marginBottom: 4 }}>CREATOR</div>
                    <div style={{ fontSize: 12, color: "#222", lineHeight: 1.3, whiteSpace: "normal", wordBreak: "break-word", overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', maxHeight: 36 }}>{creatorText}</div>
                  </div>
                  {/* CATEGORY (below CREATOR) */}
                  <div style={{ position: "absolute", left: metaPos.creator, top: 70, maxWidth: creatorW, transform: `translateY(${zoomYOffset}px)`, transition: 'transform 300ms ease', zIndex: hoverZoom ? 200 : undefined }}>
                    <div style={{ fontSize: 10, letterSpacing: 1.2, color: "#888", marginBottom: 4 }}>CATEGORY</div>
                    <div style={{ fontSize: 12, color: "#222", lineHeight: 1.3, whiteSpace: "normal", wordBreak: "break-word", overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', maxHeight: 36 }}>{categoryText ? String(categoryText) : "—"}</div>
                  </div>
                  {/* SEARCH (next to CATEGORY) */}
                  <div style={{ position: "absolute", left: metaPos.date, top: 70, width: 140, transform: `translateY(${zoomYOffset}px)`, transition: 'transform 300ms ease', zIndex: hoverZoom ? 200 : undefined }}>
                    <div style={{ fontSize: 10, letterSpacing: 1.2, color: "#888", marginBottom: -4 }}>SEARCH</div>
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder=""
                      style={{
                        width: '100%',
                        fontSize: 12,
                        color: '#222',
                        border: 'none',
                        borderBottom: '1px solid #ccc',
                        outline: 'none',
                        background: 'transparent',
                        padding: '0',
                        lineHeight: 1,
                        marginTop: -2,
                      }}
                    />
                  </div>
                  {/* DATE */}
                  <div ref={dateRef} style={{ position: "absolute", left: metaPos.date, top: 12, maxWidth: dateW, transform: `translateY(${zoomYOffset}px)`, transition: 'transform 300ms ease', zIndex: hoverZoom ? 200 : undefined, ...(DEBUG_LAYOUT ? { outline: "1px dashed #66f" } : {}) }}>
                    <div style={{ fontSize: 10, letterSpacing: 1.2, color: "#888", marginBottom: 4 }}>DATE</div>
                    <div style={{ fontSize: 12, color: "#222", lineHeight: 1.3, whiteSpace: "normal", wordBreak: "break-word", overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', maxHeight: 36 }}>{dateText}</div>
                  </div>
                  {/* DIMENSION or DURATION */}
                  <div ref={dimensionRef} style={{ position: "absolute", left: metaPos.dimension, right: 0, top: 12, transform: `translateY(${zoomYOffset}px)`, transition: 'transform 300ms ease', zIndex: hoverZoom ? 200 : undefined, ...(DEBUG_LAYOUT ? { outline: "1px dashed #f6f" } : {}) }}>
                    <div style={{ fontSize: 10, letterSpacing: 1.2, color: "#888", marginBottom: 4 }}>{durationText ? 'DURATION' : 'DIMENSION'}</div>
                    <div style={{ fontSize: 12, color: "#222", lineHeight: 1.3, whiteSpace: "normal", wordBreak: "break-word", overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', maxHeight: 36 }}>{durationText || dimensionText}</div>
                  </div>
                </>
              );
            })()}
          </div>
        )}

        {/* Top Right Controls Group: Heart, Login, Close - aligned with mode tabs */}
        <div style={{ position: "absolute", top: 7, right: 0, display: "flex", alignItems: "center", gap: 20, paddingRight: 16, zIndex: 200 }}>
          {/* Heart button to navigate to MyPage */}
          <button
            onClick={() => navigate('/mypage')}
            aria-label="Go to My Page"
            title="Go to My Page"
            style={{
              padding: 0,
              border: "none",
              background: "transparent",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#000",
              fontSize: 14,
              lineHeight: 1,
            }}
          >
            ♡
          </button>

          {/* Login Button */}
          <LoginButton />

          {/* Close Button */}
          <button
            onClick={() => {
              if (closeGuardRef.current) return;
              clearModalFlag();
              closeGuardRef.current = true;
              onClose();
            }}
            aria-label="Close"
            style={{
              padding: 0,
              border: "none",
              background: "transparent",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#333",
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: 0.4,
              textTransform: "lowercase",
              lineHeight: 1,
            }}
          >
            close
          </button>
        </div>

        {/* Content area */}
        <div style={{
          flex: 1,
          display: "flex",
          flexDirection: viewMode === 'gallery' ? 'column' : 'row',
          minHeight: 0,
          maxHeight: '100%',
          paddingLeft: viewMode === 'archive' ? 150 : 0,
          position: 'relative',
          overflow: viewMode === 'gallery' ? 'hidden' : undefined
        }}>

          {viewMode === 'archive' ? (
            <>
              {/* Middle info panel (floats next to selected thumbnail position) */}
              <div ref={infoPanelRef} style={{ width: 260, background: "#fff", padding: "12px 10px 12px 12px", position: "relative" }}>
                {current ? (
                  <div style={{ position: "fixed", top: "50%", left: infoTextLeft, width: 240, transform: "translateY(-50%)", color: "#222", lineHeight: 1.5, zIndex: 10 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={current.name}>{current.name}</div>
                    {/* Medium/Technique/Materials */}
                    {(() => {
                      const med = (current as Record<string, unknown>).medium || (current as Record<string, unknown>).technique || (current as Record<string, unknown>).materials;
                      return med ? <div style={{ fontSize: 10.5, color: '#888', marginBottom: 2 }}>{String(med)}</div> : null;
                    })()}
                    <div style={{ fontSize: 11.5, color: "#666" }}>{cleanArtistName(current.artist)}{current.year ? ` (${cleanDateText(String(current.year))})` : ""}</div>
                    {/* Category/ArtworkType */}
                    {(() => {
                      const cat = (current as Record<string, unknown>).category || (current as Record<string, unknown>).artworkType;
                      return cat ? <div style={{ fontSize: 10.5, color: '#888', marginTop: 2 }}>{String(cat)}</div> : null;
                    })()}
                  </div>
                ) : (initialized && filteredArtworks.length === 0 ? (
                  <div style={{ position: 'fixed', top: "50%", left: infoTextLeft, width: 240, transform: 'translateY(-50%)', color: '#999', fontSize: 12, fontWeight: 700, zIndex: 10 }}>
                    update soon
                  </div>
                ) : null)}
              </div>
              {/* Right stage */}
              <div style={{ flex: 1, position: "relative", background: "transparent", display: "flex", alignItems: "center", justifyContent: "center" }}>
                {/* Constrain image so it won't overlap metadata/top rows (reserve ~260px) */}
                <div
                  ref={stageMonitorRef}
                  style={{ width: "72%", maxHeight: "calc(100vh - 260px)", background: "transparent", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", position: "relative", overflow: "visible" }}
                >
                  {(current ? (
                    current.youtubeId ? (
                      // YouTube 영상인 경우 - iframe 아래, 썸네일 위에서 디졸브
                      <div style={{
                        width: '100%',
                        maxWidth: 'calc(100vh - 260px) * 16 / 9',
                        aspectRatio: '16/9',
                        background: '#000',
                        overflow: 'hidden',
                        position: 'relative'
                      }}>
                        {/* iframe - 아래 레이어 (z-index: 1) */}
                        {archiveVideoReady && (
                          <iframe
                            src={`https://www.youtube.com/embed/${current.youtubeId}?autoplay=1&mute=1&controls=0&showinfo=0&loop=1&playlist=${current.youtubeId}&modestbranding=1&rel=0&iv_load_policy=3&disablekb=1&fs=0&playsinline=1&cc_load_policy=0&origin=${window.location.origin}`}
                            title={current.name}
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                            style={{
                              position: 'absolute',
                              top: '-60px',
                              left: 0,
                              width: '100%',
                              height: 'calc(100% + 120px)',
                              border: 'none',
                              pointerEvents: 'none',
                              zIndex: 1
                            }}
                          />
                        )}
                        {/* 썸네일 - 위 레이어 (z-index: 2), 1초 후 디졸브로 사라짐 */}
                        {archiveVideoReady && (
                          <img
                            src={`https://img.youtube.com/vi/${current.youtubeId}/maxresdefault.jpg`}
                            alt={current.name}
                            style={{
                              position: 'absolute',
                              top: 0,
                              left: 0,
                              width: '100%',
                              height: '100%',
                              objectFit: 'cover',
                              zIndex: 2,
                              opacity: archiveThumbnailHidden ? 0 : 1,
                              transition: 'opacity 0.5s ease-out',
                              pointerEvents: 'none'
                            }}
                            onError={(e) => {
                              e.currentTarget.src = `https://img.youtube.com/vi/${current.youtubeId}/mqdefault.jpg`;
                            }}
                          />
                        )}
                        {/* 초기 썸네일 (영상 준비 전) */}
                        {!archiveVideoReady && (
                          <img
                            src={`https://img.youtube.com/vi/${current.youtubeId}/maxresdefault.jpg`}
                            alt={current.name}
                            style={{
                              position: 'absolute',
                              top: 0,
                              left: 0,
                              width: '100%',
                              height: '100%',
                              objectFit: 'cover'
                            }}
                            onError={(e) => {
                              e.currentTarget.src = `https://img.youtube.com/vi/${current.youtubeId}/mqdefault.jpg`;
                            }}
                          />
                        )}
                      </div>
                    ) : (() => {
                      // Mobile: use simple img to prevent memory issues on zoom
                      const lowSrc = (current as any).originalImage || pickLowPlaceholder(current);
                      const isR2 = isR2Image(current.image);
                      // National Gallery 이미지는 scale 처리 제외
                      const isNG = exhibition?.id === 'ng-1';
                      const needsScale = isR2 && !isNG;

                      // Mobile: simple img without srcset to reduce memory and computation
                      if (isMobile) {
                        const sourceUrl = (current as any).sourceUrl;
                        return (
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                            <img
                              ref={mainImgRef}
                              src={lowSrc}
                              alt={current.name}
                              decoding="async"
                              referrerPolicy="no-referrer"
                              style={{
                                width: "auto",
                                maxWidth: "100%",
                                maxHeight: "calc(100vh - 360px)",
                                objectFit: "contain",
                                display: "block",
                                background: '#f5f5f5',
                                cursor: exhibition.id === 'reina-sofia-collection' && sourceUrl ? 'pointer' : undefined,
                              }}
                              onClick={(e) => {
                                // Reina Sofía: open sourceUrl directly instead of lightbox
                                if (exhibition.id === 'reina-sofia-collection' && sourceUrl) {
                                  window.open(sourceUrl, '_blank', 'noopener,noreferrer');
                                  return;
                                }
                                openLightbox(e, current);
                              }}
                              onError={(e) => applyFallbackImage(e.currentTarget)}
                            />
                            {/* SOURCE link below image */}
                            {sourceUrl && (
                              <a
                                href={sourceUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 5,
                                  padding: '6px 12px',
                                  background: 'transparent',
                                  border: '1px solid #222',
                                  borderRadius: 4,
                                  color: '#222',
                                  fontSize: 11,
                                  fontWeight: 500,
                                  textDecoration: 'none',
                                  zIndex: 100,
                                  transition: 'background 200ms ease, color 200ms ease',
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.background = '#222';
                                  e.currentTarget.style.color = '#fff';
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.background = 'transparent';
                                  e.currentTarget.style.color = '#222';
                                }}
                              >
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                                  <polyline points="15 3 21 3 21 9" />
                                  <line x1="10" y1="14" x2="21" y2="3" />
                                </svg>
                                View on Museum Website
                              </a>
                            )}
                          </div>
                        );
                      }

                      // Desktop: use picture with srcset
                      const widths = isVeryNarrow ? [480, 720, 960] : [640, 960, 1280, 1600];
                      const avif = buildVariantSourceSet(current, 'avif', widths, 70);
                      const webp = buildVariantSourceSet(current, 'webp', widths, 75);
                      const sizes = '(max-width: 640px) 100vw, (max-width: 1024px) 82vw, 75vw';
                      // National Gallery with originalImage - don't use R2 variants
                      const useVariants = useProxy && !((current as any).originalImage);
                      const sourceUrl = (current as any).sourceUrl;
                      return (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                          <picture>
                            {useVariants && avif && <source type="image/avif" srcSet={avif || undefined} sizes={sizes} />}
                            {useVariants && webp && <source type="image/webp" srcSet={webp || undefined} sizes={sizes} />}
                            <img
                              ref={mainImgRef}
                              src={lowSrc}
                              alt={current.name}
                              decoding="async"
                              fetchPriority="high"
                              referrerPolicy="no-referrer"
                              data-hi={lowSrc === current.image ? '1' : '0'}
                              style={{
                                width: "auto",
                                maxWidth: needsScale ? "117.65%" : "100%",
                                maxHeight: "calc(100vh - 360px)",
                                objectFit: "contain",
                                cursor: exhibition.id === 'reina-sofia-collection' && sourceUrl ? 'pointer' : 'zoom-in',
                                display: "block",
                                filter: mainLoaded ? 'none' : 'blur(14px)',
                                transition: 'filter 420ms ease, opacity 420ms ease',
                                opacity: mainLoaded ? 1 : 0.88,
                                background: '#f5f5f5',
                                transform: needsScale ? 'scale(0.85)' : 'none',
                                transformOrigin: 'center center'
                              }}
                              onClick={(e) => {
                                // Reina Sofía: open sourceUrl directly instead of lightbox
                                if (exhibition.id === 'reina-sofia-collection' && sourceUrl) {
                                  window.open(sourceUrl, '_blank', 'noopener,noreferrer');
                                  return;
                                }
                                openLightbox(e, current);
                              }}
                              onLoad={(e) => {
                                if ((e.currentTarget.getAttribute('data-hi') === '1') && !mainLoaded) {
                                  setMainLoaded(true);
                                }
                              }}
                              onError={(e) => {
                                applyFallbackImage(e.currentTarget);
                                if (!mainLoaded) setMainLoaded(true);
                              }}
                            />
                          </picture>
                          {/* SOURCE link below image */}
                          {sourceUrl && (
                            <a
                              href={sourceUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 5,
                                padding: '6px 12px',
                                background: 'transparent',
                                border: '1px solid #222',
                                borderRadius: 4,
                                color: '#222',
                                fontSize: 11,
                                fontWeight: 500,
                                textDecoration: 'none',
                                zIndex: 100,
                                transition: 'background 200ms ease, color 200ms ease',
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.background = '#222';
                                e.currentTarget.style.color = '#fff';
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.background = 'transparent';
                                e.currentTarget.style.color = '#222';
                              }}
                            >
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                                <polyline points="15 3 21 3 21 9" />
                                <line x1="10" y1="14" x2="21" y2="3" />
                              </svg>
                              View on Museum Website
                            </a>
                          )}
                        </div>
                      );
                    })()
                  ) : (
                    initialized && filteredArtworks.length === 0 ? (
                      // Show description and YouTube embed when no artworks
                      (() => {
                        const desc = (exhibition as any).detailedDescription || exhibition.description || '';
                        const youtubeId = extractYouTubeId(desc);
                        const cleanDesc = removeYouTubeUrls(desc);

                        return (
                          <div style={{
                            width: '100%',
                            maxWidth: 700,
                            padding: '40px 32px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 24,
                            alignItems: 'center'
                          }}>
                            {/* YouTube embed if found */}
                            {youtubeId && (
                              <div style={{
                                width: '100%',
                                maxWidth: 640,
                                aspectRatio: '16/9',
                                borderRadius: 8,
                                overflow: 'hidden',
                                boxShadow: '0 4px 20px rgba(0,0,0,0.1)'
                              }}>
                                <iframe
                                  width="100%"
                                  height="100%"
                                  src={`https://www.youtube.com/embed/${youtubeId}?rel=0`}
                                  title="Exhibition Video"
                                  frameBorder="0"
                                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                                  allowFullScreen
                                  style={{ display: 'block' }}
                                />
                              </div>
                            )}
                            {/* Description text */}
                            {cleanDesc ? (
                              <div style={{
                                fontSize: 14,
                                lineHeight: 1.8,
                                color: '#333',
                                textAlign: 'left',
                                maxWidth: 580,
                                whiteSpace: 'pre-wrap'
                              }}>
                                {cleanDesc}
                              </div>
                            ) : (
                              <div style={{ color: '#999', fontWeight: 700 }}>update soon</div>
                            )}
                          </div>
                        );
                      })()
                    ) : (
                      <div style={{ color: "#bbb", margin: "auto" }}>No image</div>
                    )
                  ))}
                  {current && (
                    <div style={{ position: "absolute", bottom: 16, right: 16, zIndex: 30 }} className="hover-trigger">
                      <HeartOverlay
                        isLiked={likedArtworks.has(current.id)}
                        onToggle={(e) => toggleLike(e, current)}
                        style={{
                          background: 'none',
                          padding: 0,
                          opacity: 0, // initially hidden
                          transition: 'opacity 0.2s'
                        }}
                        size={20}
                        color="#e11d48"
                        emptyColor="#fff"
                      />
                      <style>{`
                        .hover-trigger:hover .heart-btn { opacity: 1 !important; transform: scale(1.1); }
                        div:hover > .hover-trigger .heart-btn { opacity: 1 !important; }
                      `}</style>
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : viewMode === 'gallery' ? (
            // Gallery grid mode - use absolute positioning with explicit dimensions for reliable scroll
            <div className="no-scrollbar gallery-scroll-container"
              style={{
                flex: 1,
                minHeight: 0,
                width: '100%',
                overflowY: 'auto',
                overflowX: 'hidden',
                WebkitOverflowScrolling: 'touch',
                overscrollBehavior: 'contain'
              }}
              onScroll={(e) => {
                const el = e.currentTarget;
                // Reduce threshold from 1000px to 400px to trigger less aggressively
                // Increase batch size to 100 to reduce frequency of updates
                if (el.scrollHeight - el.scrollTop - el.clientHeight < 400) {
                  if (galleryLimit < filteredArtworks.length) {
                    setGalleryLimit(prev => Math.min(prev + 100, filteredArtworks.length));
                  }
                }
              }}
            >
              {(() => {
                const items: Artwork[] = filteredArtworks.slice(0, galleryLimit);
                // Mobile: 3 columns with smaller images, Desktop: 5 columns
                const gridColumns = isMobile ? 'repeat(3, 1fr)' : 'repeat(5, 1fr)';
                const gridGap = isMobile ? 8 : 64;
                // Narrow screens need more top padding to avoid overlapping with room/century selectors
                // Symmetric padding on narrow screens, left padding on wide to clear left panel
                // Mobile: increased top padding for header+filters, minimal bottom for transparent tabs
                const gridPadding = isMobile ? '160px 8px 32px 8px' : (isVeryNarrow ? '200px 16px 96px 16px' : (isNarrow ? '200px 24px 96px 24px' : '192px 48px 96px 160px'));
                return (
                  <div style={{ display: 'grid', gridTemplateColumns: gridColumns, gap: gridGap, padding: gridPadding }}>
                    {items.map((a, idx) => (
                      <GalleryItem
                        key={a.id ?? `${idx}`}
                        artwork={a}
                        index={idx}
                        isMobile={isMobile}
                        isVeryNarrow={isVeryNarrow}
                        hoveredIndex={hoveredIndex}
                        setHoveredIndex={setHoveredIndex}
                        galleryVideoReadyIdx={galleryVideoReadyIdx}
                        galleryThumbnailHiddenIdx={galleryThumbnailHiddenIdx}
                        likedArtworks={likedArtworks}
                        toggleLike={toggleLike}
                        hoverZoom={hoverZoom}
                        setHoverZoom={setHoverZoom}
                        closeHoverZoomFromOverlay={closeHoverZoomFromOverlay}
                        exhibitionId={exhibition.id}
                        applyFallbackImage={applyFallbackImage}
                        useProxyVal={exhibition.id === 'mnk-collection' ? true : useProxy}
                      />
                    ))}
                  </div>
                );
              })()}
            </div>
          ) : (
            // Panorama mode
            <div style={{ flex: 1, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', userSelect: panoramaDragging ? 'none' : 'auto', cursor: 'ew-resize', touchAction: 'none' }}
              onMouseDown={(e) => {
                e.preventDefault();
                if (filteredArtworks.length === 0) return;
                setPanoramaDragging(true);
                panStartXRef.current = e.clientX;
                panStartIndexRef.current = selectedIndex;
                const onMove = (ev: MouseEvent) => {
                  const dx = ev.clientX - panStartXRef.current;
                  const n = Math.max(1, filteredArtworks.length);
                  const pxPerImage = Math.max(12, Math.min(160, 480 / n));
                  const delta = Math.round(-dx / pxPerImage);
                  const next = Math.max(0, Math.min(n - 1, panStartIndexRef.current + delta));
                  setSelectedIndex(next);
                };
                const onUp = () => {
                  setPanoramaDragging(false);
                  window.removeEventListener('mousemove', onMove);
                  window.removeEventListener('mouseup', onUp);
                };
                window.addEventListener('mousemove', onMove);
                window.addEventListener('mouseup', onUp);
              }}
              onTouchStart={(e) => {
                if (filteredArtworks.length === 0) return;
                const t = e.touches[0];
                setPanoramaDragging(true);
                panStartXRef.current = t.clientX;
                panStartIndexRef.current = selectedIndex;
              }}
              onTouchMove={(e) => {
                if (!panoramaDragging) return;
                const t = e.touches[0];
                const dx = t.clientX - panStartXRef.current;
                const n = Math.max(1, filteredArtworks.length);
                const pxPerImage = Math.max(12, Math.min(160, 480 / n));
                const delta = Math.round(-dx / pxPerImage);
                const next = Math.max(0, Math.min(n - 1, panStartIndexRef.current + delta));
                setSelectedIndex(next);
              }}
              onTouchEnd={() => setPanoramaDragging(false)}
            >
              {current ? (
                (() => {
                  const widths = isVeryNarrow ? [800, 1200] : [960, 1280, 1600, 1920];
                  const avif = buildVariantSourceSet(current, 'avif', widths, 70);
                  const webp = buildVariantSourceSet(current, 'webp', widths, 75);
                  const sizes = '(max-width: 640px) 100vw, (max-width: 1024px) 95vw, 90vw';
                  const lowSrc = pickLowPlaceholder(current);
                  return (
                    <div style={{ position: 'relative', width: 'fit-content' }}>
                      <picture>
                        {useProxy && avif && <source type="image/avif" srcSet={avif || undefined} sizes={sizes} />}
                        {useProxy && webp && <source type="image/webp" srcSet={webp || undefined} sizes={sizes} />}
                        <img
                          ref={mainImgRef}
                          src={lowSrc}
                          alt={current.name}
                          decoding="async"
                          fetchPriority="high"
                          draggable={false}
                          referrerPolicy="no-referrer"
                          data-hi={lowSrc === current.image ? '1' : '0'}
                          style={{
                            width: 'auto',
                            maxWidth: 'calc(100vw - 40px)',
                            maxHeight: 'calc(100vh - 200px)',
                            objectFit: 'contain',
                            display: 'block',
                            margin: '0 auto',
                            filter: mainLoaded ? 'none' : 'blur(14px)',
                            transition: 'filter 420ms ease, opacity 420ms ease',
                            opacity: mainLoaded ? 1 : 0.88,
                            background: '#111'
                          }}
                          onError={(e) => {
                            applyFallbackImage(e.currentTarget);
                            if (!mainLoaded) setMainLoaded(true);
                          }}
                        />
                      </picture>
                      {current && (
                        <HeartOverlay
                          isLiked={likedArtworks.has(current.id)}
                          onToggle={(e) => toggleLike(e, current)}
                          style={{ position: "absolute", bottom: 16, left: 16, zIndex: 30, padding: 0, background: 'none' }}
                          size={20}
                          color="#e11d48"
                          emptyColor="#fff"
                        />
                      )}
                    </div>
                  );
                })()
              ) : (
                initialized && filteredArtworks.length === 0 ? (
                  <div aria-label="update soon" role="img" title="update soon" style={{ color: '#999', margin: 'auto', fontWeight: 700 }}>update soon</div>
                ) : (
                  <div style={{ color: '#bbb', margin: 'auto' }}>No image</div>
                )
              )}
            </div>
          )}
        </div>
      </div>

      {/* Animated lightbox - simplified for mobile */}
      {
        lightbox && (
          <>
            {/* Top transparent area - desktop only */}
            {!isMobile && (
              <div
                onClick={closeLightbox}
                style={{
                  position: 'fixed',
                  top: 0,
                  height: headerHeight > 0 ? `${headerHeight}px` : '260px',
                  left: 0,
                  right: 0,
                  zIndex: 13000,
                  cursor: 'zoom-out',
                  background: 'transparent'
                }}
              />
            )}
            <div
              onClick={closeLightbox}
              style={{
                position: 'fixed',
                top: headerHeight > 0 ? `${headerHeight}px` : (isMobile ? 0 : '260px'),
                left: 0,
                right: 0,
                bottom: 0,
                background: lightbox.animate ? 'rgba(0,0,0,0.95)' : 'rgba(0,0,0,0)',
                transition: isMobile ? 'none' : 'background 300ms ease',
                zIndex: 11000,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
                // Prevent layout recalculation during zoom
                contain: 'layout style paint',
              }}
            >
              {/* Image container - simple on mobile, no custom zoom */}
              <div
                onClick={(e) => e.stopPropagation()}
                style={{
                  maxWidth: isMobile ? '100vw' : '80vw',
                  maxHeight: isMobile ? 'calc(100vh - 160px)' : 'calc(100vh - 300px)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transform: lightbox.animate ? 'scale(1)' : 'scale(0.8)',
                  opacity: lightbox.animate ? 1 : 0,
                  transition: isMobile ? 'none' : 'transform 300ms cubic-bezier(0.22, 0.61, 0.36, 1), opacity 300ms ease',
                  contain: 'layout style paint',
                }}
              >
                {(() => {
                  const a = lightbox.artwork;
                  const best = getBestFullUrl(a);
                  const full = best.url;
                  return (
                    <img
                      src={full}
                      alt={a.name}
                      style={{
                        maxWidth: isMobile ? '92vw' : '80vw',
                        maxHeight: isMobile ? 'calc(100vh - 180px)' : 'calc(100vh - 300px)',
                        objectFit: 'contain',
                        display: 'block',
                        cursor: a.sourceUrl ? 'pointer' : 'default',
                      }}
                      draggable={false}
                      referrerPolicy="no-referrer"
                      onClick={(e) => {
                        e.stopPropagation();
                        const url = (a as any).sourceUrl as string | undefined;
                        if (url) window.open(url, '_blank', 'noopener,noreferrer');
                      }}
                      onError={(e) => {
                        applyFallbackImage(e.currentTarget);
                      }}
                    />
                  );
                })()}
              </div>
              {/* Metadata below image */}
              <div
                onClick={(e) => e.stopPropagation()}
                style={{
                  marginTop: 16,
                  padding: '10px 20px',
                  color: '#fff',
                  textAlign: 'center',
                  opacity: lightbox.animate ? 1 : 0,
                  transition: 'opacity 300ms ease',
                  background: 'rgba(0,0,0,0.6)',
                  borderRadius: 8,
                  maxWidth: '90vw',
                }}
              >
                <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>
                  {lightbox.artwork.name}
                  {(() => {
                    const yr = String(lightbox.artwork.year || (lightbox.artwork as Record<string, unknown>)?.dateStr || '');
                    return yr ? ` (${yr})` : (lightbox.artwork.date && /^\d+c/.test(lightbox.artwork.date) ? ` (${lightbox.artwork.date})` : '');
                  })()}
                </div>
                <div style={{ fontSize: 12, color: '#ddd' }}>
                  {cleanArtistName(lightbox.artwork.artist)}
                </div>
                {/* Open original page link for high-res image */}
                {(() => {
                  const a = lightbox.artwork as any;
                  const linkUrl = a.sourceUrl || a.images?.[0]?.sourcePageUrl;
                  if (!linkUrl) return null;
                  return (
                    <a
                      href={linkUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 5,
                        marginTop: 12,
                        padding: '6px 12px',
                        background: 'transparent',
                        border: '1px solid rgba(255, 255, 255, 0.7)',
                        borderRadius: 4,
                        color: 'rgba(255, 255, 255, 0.9)',
                        fontSize: 11,
                        fontWeight: 500,
                        textDecoration: 'none',
                        transition: 'background 200ms ease, color 200ms ease, border-color 200ms ease',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = '#fff';
                        e.currentTarget.style.color = '#222';
                        e.currentTarget.style.borderColor = '#fff';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'transparent';
                        e.currentTarget.style.color = 'rgba(255, 255, 255, 0.9)';
                        e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.7)';
                      }}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                        <polyline points="15 3 21 3 21 9" />
                        <line x1="10" y1="14" x2="21" y2="3" />
                      </svg>
                      View on Museum Website
                    </a>
                  );
                })()}
              </div>
              {/* Mobile close button */}
              {isMobile && (
                <button
                  onClick={(e) => { e.stopPropagation(); closeLightbox(); }}
                  style={{
                    position: 'absolute',
                    top: 16,
                    right: 16,
                    width: 44,
                    height: 44,
                    borderRadius: '50%',
                    background: 'rgba(0,0,0,0.6)',
                    border: 'none',
                    color: '#fff',
                    fontSize: 28,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 11001,
                  }}
                >
                  ×
                </button>
              )}
            </div>
          </>
        )
      }

      {/* Click-based zoom overlay with white background */}
      {
        (hoverZoom || closingHoverZoom) && (
          <>
            {/* Full-screen backdrop - covers everything below header */}
            <div
              onClick={closeHoverZoomFromOverlay}
              style={{
                position: 'fixed',
                top: headerHeight > 0 ? `${headerHeight}px` : (isMobile ? '60px' : '100px'),  // Below header
                left: 0,
                right: 0,
                bottom: 0,
                zIndex: 10500,
                cursor: 'zoom-out',
                background: hoverZoom?.animate ? 'rgba(255, 255, 255, 0.95)' : 'rgba(255, 255, 255, 0)',
                transition: 'background 300ms ease',
              }}
            />
            {/* Container for the zoomed image */}
            <div
              style={{
                position: 'fixed',
                top: headerHeight > 0 ? `${headerHeight}px` : (isMobile ? '60px' : '100px'),  // Same as backdrop
                left: 0,
                right: 0,
                bottom: 0,
                zIndex: 10501,
                pointerEvents: 'none',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
              }}
            >
              {/* Large zoomed image - click to close */}
              <div
                onClick={closeHoverZoomFromOverlay}
                style={{
                  position: 'relative',
                  maxWidth: '80vw',
                  pointerEvents: 'auto',
                  cursor: 'zoom-out',
                  opacity: hoverZoom?.animate ? 1 : 0,
                  transform: hoverZoom?.animate ? 'scale(1) translateY(0)' : 'scale(0.95) translateY(-10px)',
                  transition: 'opacity 300ms ease, transform 300ms ease',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                }}
              >
                {(() => {
                  const zoomData = hoverZoom || closingHoverZoom;
                  if (!zoomData) return null;
                  const a = zoomData.artwork;
                  const best = getBestFullUrl(a);
                  const widths = isVeryNarrow ? [960, 1280] : [1280, 1600, 1920, 2560];
                  const avif = useProxy ? buildSourceSet(best.url, widths, 'avif', 75) : null;
                  const webp = useProxy ? buildSourceSet(best.url, widths, 'webp', 80) : null;
                  const sizes = '(max-width: 640px) 100vw, (max-width: 1024px) 90vw, 85vw';
                  return (
                    <picture>
                      {useProxy && avif && <source type="image/avif" srcSet={avif || undefined} sizes={sizes} />}
                      {useProxy && webp && <source type="image/webp" srcSet={webp || undefined} sizes={sizes} />}
                      <img
                        src={best.url}
                        alt={a.name}
                        style={{
                          maxWidth: '80vw',
                          maxHeight: 'calc(100vh - 480px)', // Reduced height to make room for metadata
                          objectFit: 'contain',
                          display: 'block',
                          borderRadius: 4,
                          boxShadow: '0 8px 40px rgba(0,0,0,0.3)',
                        }}
                        draggable={false}
                        referrerPolicy="no-referrer"
                        onError={(e) => applyFallbackImage(e.currentTarget)}
                      />
                    </picture>
                  );
                })()}
                {/* SOURCE link below zoomed image */}
                {(() => {
                  const zoomData = hoverZoom || closingHoverZoom;
                  if (!zoomData) return null;
                  const sourceUrl = (zoomData.artwork as any).sourceUrl;
                  if (!sourceUrl) return null;
                  return (
                    <a
                      href={sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="source-link-btn"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 5,
                        marginTop: 12,
                        padding: '6px 12px',
                        background: 'transparent',
                        border: '1px solid #222',
                        borderRadius: 4,
                        color: '#222',
                        fontSize: 11,
                        fontWeight: 500,
                        textDecoration: 'none',
                        cursor: 'pointer',
                        zIndex: 1000,
                        pointerEvents: 'auto',
                        transition: 'background 200ms ease, color 200ms ease',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = '#222';
                        e.currentTarget.style.color = '#fff';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'transparent';
                        e.currentTarget.style.color = '#222';
                      }}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                        <polyline points="15 3 21 3 21 9" />
                        <line x1="10" y1="14" x2="21" y2="3" />
                      </svg>
                      View on Museum Website
                    </a>
                  );
                })()}
                {/* Metadata below zoomed image - mobile only */}
                {/* Metadata below zoomed image - mobile only */}
                {isMobile && (() => {
                  const zoomData = hoverZoom || closingHoverZoom;
                  if (!zoomData) return null;
                  const a = zoomData.artwork;

                  // Helper to safe string
                  const safeStr = (s: any) => s ? String(s) : '';
                  const yr = safeStr(a.year || (a as any).dateStr || '');
                  const dateDisplay = yr || (a.date && /^\d+c/.test(a.date) ? a.date : '');

                  return (
                    <div
                      style={{
                        marginTop: 16,
                        marginLeft: 80,
                        opacity: hoverZoom?.animate ? 1 : 0,
                        transition: 'opacity 300ms ease',
                        maxHeight: '180px',
                        overflowY: 'auto',
                        paddingBottom: 16,
                        width: '320px',
                        maxWidth: '85vw',
                      }}
                      className="no-scrollbar"
                    >
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 64px', textAlign: 'left' }}>
                        {/* TITLE */}
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 9.5, fontWeight: 500, letterSpacing: '0.05em', color: '#888', marginBottom: 1, textTransform: 'uppercase' }}>TITLE</div>
                          <div style={{ fontSize: 12, fontWeight: 600, color: '#111', lineHeight: '1.35', wordBreak: 'break-word' }}>{a.name || '-'}</div>
                        </div>

                        {/* DATE */}
                        <div>
                          <div style={{ fontSize: 9.5, fontWeight: 500, letterSpacing: '0.05em', color: '#888', marginBottom: 1, textTransform: 'uppercase' }}>DATE</div>
                          <div style={{ fontSize: 12, fontWeight: 500, color: '#111' }}>{dateDisplay || '-'}</div>
                        </div>

                        {/* CREATOR */}
                        <div>
                          <div style={{ fontSize: 9.5, fontWeight: 500, letterSpacing: '0.05em', color: '#888', marginBottom: 1, textTransform: 'uppercase' }}>CREATOR</div>
                          <div style={{ fontSize: 12, fontWeight: 500, color: '#111', lineHeight: '1.35' }}>{cleanArtistName(a.artist) || '-'}</div>
                        </div>

                        {/* DIMENSION */}
                        <div>
                          <div style={{ fontSize: 9.5, fontWeight: 500, letterSpacing: '0.05em', color: '#888', marginBottom: 1, textTransform: 'uppercase' }}>DIMENSION</div>
                          <div style={{ fontSize: 12, fontWeight: 500, color: '#111' }}>{(a as any).dimensions || '-'}</div>
                        </div>

                        {/* MEDIUM */}
                        <div>
                          <div style={{ fontSize: 9.5, fontWeight: 500, letterSpacing: '0.05em', color: '#888', marginBottom: 1, textTransform: 'uppercase' }}>MEDIUM</div>
                          <div style={{ fontSize: 12, fontWeight: 500, color: '#111', lineHeight: '1.3' }}>{(a as any).medium || '-'}</div>
                        </div>

                        {/* CATEGORY */}
                        <div>
                          <div style={{ fontSize: 9.5, fontWeight: 500, letterSpacing: '0.05em', color: '#888', marginBottom: 1, textTransform: 'uppercase' }}>CATEGORY</div>
                          <div style={{ fontSize: 12, fontWeight: 500, color: '#111' }}>
                            {(a as any).category ? (CATEGORY_LABEL_MAP[(a as any).category] || (a as any).category) : '-'}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
          </>
        )
      }

      {/* Upload overlay removed in viewer mode */}
      {/* Hide scrollbars for filmstrip + ensure gallery scroll works */}
      <style>
        {`
          .no-scrollbar::-webkit-scrollbar { width: 0; height: 0; display: none; }
          .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
          .gallery-scroll-container { 
            overflow-y: scroll !important; 
            -webkit-overflow-scrolling: touch !important;
          }
        `}
      </style>

      {/* Submission Form Modal */}
      {
        showSubmissionForm && (
          <SubmissionForm
            exhibitionId={exhibition.id}
            exhibitionName={exhibition.name || exhibition.title || 'Exhibition'}
            museumName={(exhibition as any).museumName || (exhibition as any).parentMuseum || ''}
            onClose={() => setShowSubmissionForm(false)}
            onSuccess={() => setShowSubmissionForm(false)}
          />
        )
      }

      {/* Description Overlay Panel */}
      {
        isDescriptionExpanded && (
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(0,0,0,0.7)',
              zIndex: 20000,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            onClick={() => setIsDescriptionExpanded(false)}
          >
            <div
              style={{
                background: '#fff',
                width: '90%',
                maxWidth: 600,
                maxHeight: '85vh',
                borderRadius: 8,
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div style={{ padding: '16px 20px', borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#111' }}>{exhibition.title || exhibition.name}</h2>
                  {(exhibition as any).startDate && (exhibition as any).endDate && (
                    <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
                      {(exhibition as any).startDate} – {(exhibition as any).endDate}
                    </div>
                  )}
                  {(exhibition as any).pricing && (
                    <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>{(exhibition as any).pricing}</div>
                  )}
                </div>
                <button
                  onClick={() => setIsDescriptionExpanded(false)}
                  style={{
                    background: 'none',
                    border: 'none',
                    fontSize: 20,
                    cursor: 'pointer',
                    color: '#666',
                    padding: '0 4px',
                  }}
                >
                  ×
                </button>
              </div>
              {/* Content - scrollable area including cover image */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '0' }}>
                {/* Cover Image - use coverImage first, then image, then first artwork */}
                {(() => {
                  const coverImage = (exhibition as any).coverImage;
                  const exhibitionImage = (exhibition as any).image;
                  const fallbackImage = artworks.length > 0 ? artworks[0].image : null;
                  const imageToShow = coverImage || exhibitionImage || fallbackImage;

                  if (!imageToShow) return null;
                  return (
                    <div style={{ width: '100%', background: '#f5f5f5' }}>
                      <img
                        src={imageToShow}
                        alt={exhibition.title || exhibition.name}
                        style={{ width: '100%', height: 'auto', display: 'block', objectFit: 'contain' }}
                        referrerPolicy="no-referrer"
                      />
                    </div>
                  );
                })()}
                {/* Description content */}
                <div style={{ padding: '20px' }}>
                  {/* Gallery Images - horizontal scroll */}
                  {Array.isArray((exhibition as any).galleryImages) && (exhibition as any).galleryImages.length > 0 && (
                    <div style={{ marginBottom: 20 }}>
                      <h4 style={{ margin: '0 0 12px 0', fontSize: 12, fontWeight: 700, color: '#666', textTransform: 'uppercase' }}>Gallery</h4>
                      <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 8 }}>
                        {(exhibition as any).galleryImages.map((img: string, idx: number) => (
                          <img
                            key={idx}
                            src={img}
                            alt={`Gallery ${idx + 1}`}
                            style={{ height: 150, width: 'auto', borderRadius: 4, flexShrink: 0, objectFit: 'cover' }}
                            referrerPolicy="no-referrer"
                          />
                        ))}
                      </div>
                    </div>
                  )}
                  {/* Videos */}
                  {Array.isArray((exhibition as any).videos) && (exhibition as any).videos.length > 0 && (
                    <div style={{ marginBottom: 20 }}>
                      <h4 style={{ margin: '0 0 12px 0', fontSize: 12, fontWeight: 700, color: '#666', textTransform: 'uppercase' }}>Videos</h4>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        {(exhibition as any).videos.map((videoUrl: string, idx: number) => (
                          <div key={idx} style={{ aspectRatio: '16/9', borderRadius: 6, overflow: 'hidden' }}>
                            <iframe
                              width="100%"
                              height="100%"
                              src={videoUrl}
                              title={`Video ${idx + 1}`}
                              frameBorder="0"
                              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                              allowFullScreen
                              style={{ display: 'block' }}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {/* Description text - support fullDescription */}
                  {(exhibition as any).descriptionHtml ? (
                    <div
                      style={{ fontSize: 14, lineHeight: 1.7, color: '#333' }}
                      className="exhibition-description-html"
                      dangerouslySetInnerHTML={{ __html: (exhibition as any).descriptionHtml }}
                    />
                  ) : (
                    <div style={{ fontSize: 14, lineHeight: 1.7, color: '#333', whiteSpace: 'pre-wrap' }}>
                      {(exhibition as any).fullDescription || (exhibition as any).detailedDescription || exhibition.description || 'No description available.'}
                    </div>
                  )}
                  {/* Date range */}
                  {(exhibition as any).dateRange && (
                    <div style={{ marginTop: 24, paddingTop: 16, borderTop: '1px solid #eee' }}>
                      <h4 style={{ margin: '0 0 8px 0', fontSize: 12, fontWeight: 700, color: '#666', textTransform: 'uppercase' }}>Date</h4>
                      <div style={{ fontSize: 13, color: '#333' }}>{(exhibition as any).dateRange}</div>
                    </div>
                  )}
                  {/* External link - hidden but preserved */}
                  {false && (exhibition as any).url && (
                    <div style={{ marginTop: 16 }}>
                      <a
                        href={(exhibition as any).url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ fontSize: 13, color: '#3b82f6', textDecoration: 'none' }}
                      >
                        Visit official page →
                      </a>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )
      }
    </div >
  );
};

export default ExhibitionModal;