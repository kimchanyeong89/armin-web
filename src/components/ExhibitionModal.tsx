import type { ExhibitionItem } from "../types/Exhibition";
import type { Artwork } from "../types/Artwork";
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { ArtworkRecommendations } from './ArtworkRecommendations';
import { SearchInputWithSuggestions } from "./SearchInputWithSuggestions";
import { collection, query, where, onSnapshot, getDocs, deleteDoc, doc, setDoc, serverTimestamp, addDoc, increment, documentId } from "firebase/firestore";
import { onAuthStateChanged, GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { db, auth } from "../firebase";
import { buildSourceSet, useProxy, getOptimizedImageUrl, getWeservUrl, tuneWeservUrl } from "../utils/imageProxy";
import { normalizeSearchText } from "../utils/textNormalize";
import { usePrefetchNeighbors } from "../hooks/usePrefetchNeighbors";
import { HeartOverlay } from "./HeartOverlay";
import { SubmissionForm } from "./SubmissionForm";
import { ProductModal } from "./ProductModal";
import CommentModal from "./CommentModal";

const ADMIN_EMAILS = ['kietzland@gmail.com'];

const RE_BC_CHECK = /\bBC\b|B\.C\.|BCE/i;
const RE_CENTURY = /(\d{1,2})(?:st|nd|rd|th)?\s*(?:century|c\b)/i;
const RE_YEAR_4 = /\b(\d{4})\b/g;
const RE_YEAR_3 = /\b(\d{3})\b/;

const CATEGORY_MAP: Record<string, string> = {
  "drawings, prints, and paintings": "Drawings, Prints, and Paintings",
  "objects & media art": "Objects & Media Art",
  "photography": "Photography",
  "posters": "Posters",
  "sculptures": "Sculpture",
  "drawing": "Drawing",
  "drawings": "Drawing",
  "draw": "Drawing",
  "dibujo": "Drawing",
  "dibujos": "Drawing",
  "disegno": "Drawing",
  "engravings (prints)": "Print",
  "engravings": "Print",
  "engraving": "Print",
  "lithographs": "Print",
  "lithograph": "Print",
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
  "sculpture": "Sculpture",
  "escultura": "Sculpture",
  "esculturas": "Sculpture",
  "sketchbooks": "Sketchbooks",
  "sketchbook": "Sketchbooks",
  "photograph": "Photography",
  "photos": "Photography",
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

import { getCanonicalName as cleanArtistName } from "../utils/canonicalArtist";

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

// AIC (Art Institute of Chicago) IIIF images can be hotlink/challenge-protected.
// Preferred approach: mirror once to R2 and serve from there.
// If the object doesn't exist yet, <img> onError falls back to LQIP.
const buildAicR2Url = (iiifUrl: string, width: number = 900): string => {
  if (!iiifUrl || typeof iiifUrl !== 'string') return '';
  const m = iiifUrl.match(/\/iiif\/2\/([^/]+)\//);
  const imageId = m?.[1] || '';
  if (!imageId) return '';
  return `https://${R2_DOMAIN}/aic/${imageId}_${width}.webp`;
};

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

  // 1. Explicitly 2D Categories (Strongest precedence, so "Contemporary Painting" is 2D, not 3D)
  const has2DCategoryCue = /\b(painting|paintings|drawing|print|prints|calligraphy|photography|graphic|collage|poster|sketch|watercolor|watercolour|lithograph|etching|engraving|woodcut|screen ?print|silkscreen|video|film|dipinto|disegno|incisione|stampa|fotografia|acquarello|litografia|xilografia|acquerello|pittura|peinture|dessin|estampe|gravure|photographie|aquarelle|lithographie|pintura|dibujo|grabado|fotograf[ií]a|acuarela|회화|사진|서예|드로잉|판화|평면|zeichnung|druck|radierung|holzschnitt|lithografie|gem[äa]lde|design)\b/i.test(categoryText);

  // 2. Explicitly 3D or Generic/Physical Categories (Will apply only if not explicitly 2D)
  const has3DCategoryCue = /\b(sculpture|sculptural|statue|statuette|bust|relief|object|vessel|coin|medal|weapon|armor|armour|mask|doll|furniture|jewelry|jewellery|installation|architecture|skulptur|plastik|statuette|b\.?ste|b\.?ste|relief|objekt|kunsthandwerk|skulptural|escultura|estatua|busto|relieve|objeto|scultura|busto|rilievo|objet|mixed media|assemblage|contemporary art|conceptual art|new media|multimedia|moving image)\b/i.test(categoryText);

  // 3. Technique-first for 2D (if we see 2D techniques, treat as 2D even if materials like wood/textile appear)
  const has2DTechniqueCue = /\b(oil|óleo|olio|\b[öo]l\b|acrylic(?! glass)|acrilic|acrílico|acrilico|acryl|tempera|gouache|watercolor|watercolour|acuarela|acquarello|aquarell|ink|tinta|inchiostro|tusche|pencil|matita|l[áa]piz|bleistift|charcoal|carbone|carboncillo|kohle|pastel|kreide|crayon|radierung|lithograph|litograf|litografia|etching|aguafuerte|acquaforte|engraving|incisione|woodcut|xilograf|xilografia|monotype|serigraf|serigrafia|silkscreen|screen\s?print|feder|zeichnung)\b/i.test(mediumTechText);

  // 4. Weaker 3D material cues (only used if no 2D technique/category cue exists)
  const has3DMaterialCue = /\b(ceramic|ceramics|cer[áa]mica|keramik|fayence|faience|pottery|terracotta|porcelain|porzellan|clay|argilla|barro|marble|marmo|m[áa]rmol|marmor|stone|pietra|piedra|kalkstein|sandstein|bronze|bronzo|bronce|wood|holz|legno|madera|textile|fabric|tapestry|wirkerei|seide|wolle|leinen|glass|plaster|wax|cast|polyurethane|pewter|earthenware|resin|acrylic glass|plastic|metal|brass|copper|iron|steel|aluminum)\b/i.test(mediumTechText);

  // Precedence evaluation
  if (has2DCategoryCue) return '2D';
  if (has3DCategoryCue) return '3D';
  if (has2DTechniqueCue) return '2D';
  if (has3DMaterialCue) return '3D';

  // Fallback heuristics
  const has2DSupportCue = /\b(canvas|paper|karton|cardboard|panel|parchment|papel|papier|carta|cartone|leinwand|toile|tela)\b/i.test(mediumTechText);
  if (has2DSupportCue) return '2D';

  const hasGenericObjectWord = /\b(object|objet|objekt|artefact|artifact)\b/i.test(categoryText);
  if (hasGenericObjectWord) return '3D';

  // Default: prefer 2D for “unknown-but-described” strings
  return '2D';
}

// Firestore document IDs cannot contain '/'. For artwork-linked docs (stats, likes),
// normalize IDs by replacing '/' with a safe separator. Existing IDs without '/' stay unchanged.
const normalizeArtworkIdForFirestore = (id: string | number): string => String(id).replace(/\//g, '__');

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
  exhibition,
  applyFallbackImage,
  useProxyVal,
  onOpenProduct,
  onOpenComments,
  stats,
  museumName
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
  exhibition: ExhibitionItem,
  applyFallbackImage: (target: HTMLImageElement | null, fallbackImages?: string[]) => void,
  useProxyVal: boolean,
  onOpenProduct: (artwork: Artwork) => void,
  onOpenComments: (artwork: Artwork) => void,
  stats?: { likeCount: number; commentCount: number },
  museumName?: string
}) => {
  const exhibitionId = exhibition.id;
  const isVideo = artwork.youtubeId || artwork.mediaType === 'video';
  const isCurrentlyHovered = hoveredIndex === index;
  const showIframe = isCurrentlyHovered && isVideo && galleryVideoReadyIdx === index;

  const isNPG = exhibitionId === 'npg-london-collection' || exhibitionId === 'snpg-collection'; // Fix layout for portrait galleries

  return (
    <div
      className="group"
      draggable={true}
      title="Drag to share in Community"
      onDragStart={(e) => {
        const data = {
          id: artwork.id,
          image: artwork.image,
          name: artwork.name,
          artist: artwork.artist,
          year: artwork.year || artwork.date,
          museum: museumName || exhibition.name,
          exhibition: exhibition.title,
          source: 'drag-drop'
        };
        e.dataTransfer.setData('application/json', JSON.stringify(data));
        e.dataTransfer.setData('text/plain', artwork.name); // Fallback for text editors or if JSON is stripped
        e.dataTransfer.effectAllowed = 'copy';

        // Custom Drag Image (User requested container-like movement visual)
        const imgEl = e.currentTarget.querySelector('img');
        if (imgEl) {
          const rect = imgEl.getBoundingClientRect();
          e.dataTransfer.setDragImage(imgEl, rect.width / 2, rect.height / 2);
        }
      }}
      style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", cursor: 'grab' }}
    >
      <div
        style={{ width: '100%', background: 'transparent', borderRadius: 0, position: 'relative', aspectRatio: isVideo ? '16/9' : undefined, overflow: 'hidden' }}
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
                    src={useProxyVal ? getOptimizedImageUrl(preview, 600) : preview}
                    data-full={imageUrl}
                    alt={artwork.name}
                    loading="lazy"
                    decoding="async"
                    fetchPriority="low"
                    referrerPolicy="no-referrer"
                    style={{
                      width: '100%',
                      height: 'auto',
                      maxHeight: isNPG ? '450px' : undefined,
                      objectFit: isNPG ? 'contain' : undefined,
                      objectPosition: isNPG ? 'left bottom' : undefined,
                      display: 'block',
                      cursor: hoverZoom ? 'zoom-out' : 'zoom-in',
                    }}
                    onClick={() => {
                      if (hoverZoom) {
                        closeHoverZoomFromOverlay();
                      } else {
                        const zoomUrl = (artwork as any).lightboxImage || (artwork as any).originalImage || artwork.image;
                        setHoverZoom({ artwork: artwork, imageUrl: zoomUrl, animate: false });
                        requestAnimationFrame(() => {
                          requestAnimationFrame(() => {
                            setHoverZoom((s: any) => (s ? { ...s, animate: true } : s));
                          });
                        });
                      }
                    }}
                    onLoad={(e) => {
                      const el = e.currentTarget;
                      // If we already swapped to high-res, stop.
                      if (el.dataset.hi === '1') return;
                      const full = el.getAttribute('data-full') || '';
                      if (!full) return;
                      // Only do progressive swap when we're showing a low placeholder.
                      // (AIC LQIP is typically a data: URL.)
                      const isLow = typeof preview === "string" && preview !== full;
                      if (!isLow) return;
                      if (el.dataset.hiLoading === '1') return;
                      el.dataset.hiLoading = '1';

                      const hi = new Image();
                      hi.decoding = 'async' as any;
                      hi.src = full;

                      const swap = () => {
                        if (!el.isConnected) return;
                        // If element already changed away from preview, don't fight it.
                        if (el.src !== preview && el.src !== (useProxyVal ? getOptimizedImageUrl(preview, 600) : preview)) {
                          el.dataset.hiLoading = '0';
                          return;
                        }
                        el.src = hi.src;
                        el.setAttribute('data-full', hi.src);
                        el.setAttribute('data-hi', '1');
                        el.dataset.hi = '1';
                        el.dataset.hiLoading = '0';
                      };

                      hi.onload = swap;
                      hi.onerror = () => {
                        const fallbacks = artwork.fallbackImages || [];
                        const currentTry = parseInt(hi.dataset.tryIdx || '0', 10);
                        if (currentTry < fallbacks.length) {
                          hi.dataset.tryIdx = String(currentTry + 1);
                          hi.src = fallbacks[currentTry];
                        } else {
                          el.dataset.hiLoading = '0';
                        }
                      };

                      // Some browsers support decode() for smoother swaps.
                      try {
                        if ((hi as any).decode) (hi as any).decode().then(swap).catch(() => { });
                      } catch { }
                    }}
                    onError={(e) => {
                      const currentSrc = e.currentTarget.src;
                      const el = e.currentTarget;
                      const isFallback = !!el.dataset.fallbackIdx || el.dataset.fallbackApplied === '1';

                      if (!isFallback && preview) {
                        const targetPrev = useProxyVal ? getOptimizedImageUrl(preview, 600) : preview;

                        if (el.dataset.triedTargetPrev !== '1') {
                          el.dataset.triedTargetPrev = '1';
                          if (!currentSrc.endsWith(targetPrev) && currentSrc !== targetPrev) {
                            el.src = targetPrev;
                            return;
                          }
                        }

                        if (useProxyVal && el.dataset.triedRawPreview !== '1') {
                          el.dataset.triedRawPreview = '1';
                          if (!currentSrc.endsWith(preview) && currentSrc !== preview) {
                            el.src = preview;
                            return;
                          }
                        }
                      }

                      applyFallbackImage(el, artwork.fallbackImages);
                    }}
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
          <div style={{ fontSize: isMobile ? 10 : 12, fontWeight: 400, color: '#222', display: 'flex', alignItems: 'center', gap: "6px 6px" }}>
            {String(index + 1).padStart(2, '0')}
            {isVideo && (
              <span style={{ fontSize: 10, color: '#e11d48' }}>▶</span>
            )}
            <div style={{ opacity: isMobile ? 1 : 0, display: 'flex', alignItems: 'center', gap: "6px 6px" }} className="gallery-heart-trigger">
              {/* POD Product Purchase Button - Left */}
              <div
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  onOpenProduct(artwork);
                }}
                style={{
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'transform 0.15s ease',
                  zIndex: 20
                }}
                title="상품으로 구매하기"
                onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.1)'}
                onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
              >
                <svg
                  width={isMobile ? 12 : 14}
                  height={isMobile ? 12 : 14}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#888"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{ filter: 'drop-shadow(0 0 1px rgba(0,0,0,0.2))' }}
                >
                  {/* Frame icon */}
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                  <rect x="7" y="7" width="10" height="10" />
                </svg>
              </div>

              {/* Comment Button - Middle */}
              <div
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  onOpenComments(artwork);
                }}
                style={{
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'transform 0.15s ease',
                  zIndex: 20
                }}
                title="댓글 남기기"
                onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.1)'}
                onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
              >
                <svg
                  width={isMobile ? 12 : 14}
                  height={isMobile ? 12 : 14}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#888"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{ filter: 'drop-shadow(0 0 1px rgba(0,0,0,0.2))' }}
                >
                  <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                </svg>
                {(stats?.commentCount ?? 0) > 0 && (
                  <span style={{
                    marginLeft: 4,
                    fontSize: isMobile ? 10 : 11,
                    color: '#888',
                    fontFamily: 'Inter, sans-serif',
                    lineHeight: 1
                  }}>
                    {stats?.commentCount}
                  </span>
                )}
              </div>

              {/* Heart - Right */}
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <HeartOverlay
                  isLiked={likedArtworks.has(String(artwork.id))}
                  onToggle={(e) => toggleLike(e, artwork)}
                  style={{ padding: 0, background: 'none' }}
                  size={isMobile ? 12 : 14}
                  color="#e11d48"
                  emptyColor="#888"
                />
                {(stats?.likeCount ?? 0) > 0 && (
                  <span style={{
                    marginLeft: 4,
                    fontSize: isMobile ? 10 : 11,
                    color: '#888',
                    fontFamily: 'Inter, sans-serif',
                    lineHeight: 1
                  }}>
                    {stats?.likeCount}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div style={{ fontSize: isMobile ? 10 : 12, fontWeight: 700, color: '#222', marginTop: 2 }}>{artwork.name}{artwork.year ? ` (${cleanDateText(artwork.year)})` : (artwork.date && /^\d+c/.test(artwork.date) ? ` (${artwork.date})` : '')}</div>
          {(() => {
            const artistStr = cleanArtistName(artwork.artist);
            const isUnknown = !artistStr || artistStr.toLowerCase() === 'unknown artist' || artistStr.toLowerCase() === 'unknown';
            return (
              <div style={{ fontSize: isMobile ? 9 : 11, color: '#777', marginTop: 2 }}>
                {isUnknown ? (artistStr || '') : (
                  <span
                    onClick={(e) => { e.stopPropagation(); window.dispatchEvent(new CustomEvent('open-artist-gallery', { detail: { artist: artistStr } })); }}
                    style={{ cursor: 'pointer', borderBottom: '1px solid rgba(0,0,0,0.15)', transition: 'color 0.2s, border-color 0.2s' }}
                    onMouseEnter={e => { e.currentTarget.style.color = '#c9a55a'; e.currentTarget.style.borderColor = '#c9a55a'; }}
                    onMouseLeave={e => { e.currentTarget.style.color = '#777'; e.currentTarget.style.borderColor = 'rgba(0,0,0,0.15)'; }}
                    title="View Artist Page"
                  >{artistStr}</span>
                )}
              </div>
            );
          })()}
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
  museumName?: string;
  onClose: () => void;
  initialSelectedIndex?: number;
  inline?: boolean;
  variant?: 'sketch' | 'default';
  theme?: 'dark' | 'light';
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

const ExhibitionModal: React.FC<ExhibitionModalProps> = ({ exhibition, museumName, onClose, initialSelectedIndex = 0, inline = false, variant = 'default', theme = 'light' }) => {
  const [artworks, setArtworks] = useState<Artwork[]>([]);
  const [initialized, setInitialized] = useState<boolean>(false);

  // Dark theme color tokens
  const isDark = theme === 'dark';
  const isSketch = variant === 'sketch';
  const EM_BG = isSketch ? '#ffffff' : (isDark ? '#111111' : '#ffffff');
  const _EM_BG2 = isSketch ? '#f6f6f6' : (isDark ? '#1c1c1c' : '#f2f2f2'); void _EM_BG2;
  const EM_TEXT = isSketch ? '#111111' : (isDark ? 'rgba(255,255,255,0.88)' : '#222222');
  const EM_SUB = isSketch ? 'rgba(17,17,17,0.48)' : (isDark ? 'rgba(255,255,255,0.50)' : '#666666');
  const EM_BORDER = isSketch ? 'rgba(17,17,17,0.18)' : (isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)');
  const EM_BTN_ACTIVE_BG = isSketch ? '#ccff00' : (isDark ? '#ffffff' : '#111111');
  const EM_BTN_ACTIVE_FG = isSketch ? '#111111' : (isDark ? '#111111' : '#ffffff');
  const EM_BTN_INACTIVE_BG = isSketch ? '#ffffff' : (isDark ? 'rgba(255,255,255,0.08)' : '#f2f2f2');
  const EM_BTN_INACTIVE_FG = isSketch ? '#111111' : (isDark ? 'rgba(255,255,255,0.5)' : '#666666');
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

  // Sorting state: default | random | year_asc | year_desc | like_desc
  const [sortBy, setSortBy] = useState<'default' | 'random' | 'year_asc' | 'year_desc' | 'like_desc'>('default');

  const [selectedCentury, setSelectedCentury] = useState<string | null>(null); // '~17' -> ≤1699, '18' -> 1700s, '19' -> 1800s, etc.
  const [viewMode, setViewMode] = useState<'archive' | 'gallery' | 'panorama'>('gallery');
  // Virtualization refs for archive mode — using refs to avoid React state lag during fast scroll
  const archiveScrollTopRef = useRef(0);
  const archiveContainerHeightRef = useRef(600);
  // Also keep a state tick to force re-render of virtualized list when scroll changes
  const [archiveVirtualTick, setArchiveVirtualTick] = React.useState(0);
  const archiveVirtualRafRef = useRef<number>(0);
  // Liked artworks feature
  const [likedArtworks, setLikedArtworks] = useState<Set<string>>(new Set());
  const [currentUser, setCurrentUser] = useState<any>(null);
  // Artwork Stats (Likes, Comments) - Keyed by artwork ID
  // Artwork Stats (Likes, Comments) - Keyed by artwork ID
  const [artworkStats, setArtworkStats] = useState<Record<string, { likeCount: number; commentCount: number }>>({});



  // Recommended search terms based on artwork artists
  const recommendedTerms = useMemo(() => {
    const artistCounts = new Map<string, number>();
    artworks.forEach(art => {
      const artist = cleanArtistName(art.artist);
      if (artist && artist !== 'Unknown' && artist !== 'Anonymous') {
        artistCounts.set(artist, (artistCounts.get(artist) || 0) + 1);
      }
    });
    return Array.from(artistCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(entry => entry[0]);
  }, [artworks]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      if (user && ADMIN_EMAILS.includes(user.email || '')) {
        setIsAdmin(true);
      } else {
        setIsAdmin(false);
      }
    });
    return () => unsub();
  }, []);
  const handleDeleteArtwork = async (artworkId: string, firestoreId?: string) => {
    if (!confirm('Are you sure you want to delete this artwork? This action cannot be undone.')) return;
    try {
      // Use firestoreId if available (for exhibition_artworks), otherwise artworkId (for artworks collection)
      const docId = firestoreId || artworkId;
      // Try deleting from exhibition_artworks first
      await deleteDoc(doc(db, 'exhibition_artworks', docId));
      // Also try deleting from artworks collection just in case
      try {
        await deleteDoc(doc(db, 'artworks', docId));
      } catch (e) {
        // Ignore if not found in artworks
      }

      // Also remove from local state
      setArtworks(prev => prev.filter(a => a.id !== artworkId));
      alert('Artwork deleted successfully.');
    } catch (err) {
      console.error('Failed to delete artwork:', err);
      alert('Failed to delete artwork: ' + (err as Error).message);
    }
  };

  // Submission form for temporary exhibitions
  const [showSubmissionForm, setShowSubmissionForm] = useState(false);
  // POD Product Modal state
  const [productArtwork, setProductArtwork] = useState<Artwork | null>(null);
  const [commentArtwork, setCommentArtwork] = useState<Artwork | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  // Exhibition description expanded state
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);
  // Enriched exhibition data (with descriptionHtml from JSON)
  const [_enrichedExhibition, setEnrichedExhibition] = useState<any>(null);
  // Hayward Gallery: toggle to show artworks only (hide archival documents)
  const [showArtworksOnly, setShowArtworksOnly] = useState(false);
  // Guggenheim Bilbao: toggle to show only "On view" artworks
  const [showOnViewOnly, setShowOnViewOnly] = useState(exhibition?.id === 'cma' || exhibition?.id?.startsWith('cma-'));
  const [showMasterpieceOnly, setShowMasterpieceOnly] = useState(false);
  // Rijksmuseum: toggle to show only "On display" artworks
  const [showOnDisplayOnly, setShowOnDisplayOnly] = useState(false);
  // Picasso Barcelona: toggle to show only "Highlight" artworks
  const [showHighlightOnly, setShowHighlightOnly] = useState(false);
  // Ateneum / Public Domain: toggle to show only "Public Domain" artworks
  const [showPublicDomainOnly, setShowPublicDomainOnly] = useState(false);
  // NGA: toggle to show only "Open Access" (downloadable) artworks
  const [showOpenAccessOnly, setShowOpenAccessOnly] = useState(false);
  // Getty: toggle to show only "Open Content" artworks
  const [showOpenContentOnly, setShowOpenContentOnly] = useState(false);
  // 2D/3D/N artwork type filter (N = no medium info)
  const [selectedTypes, setSelectedTypes] = useState<Set<'2D' | '3D' | 'N'>>(new Set());
  // Reina Sofía: 2D/3D sub-facet filter (Canvas/Paper/Photo/etc.)
  const [selectedMediumFacets, setSelectedMediumFacets] = useState<Set<string>>(new Set());
  // Search query for filtering artworks
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState(''); // Actual query used for filtering (delayed)

  // Debounce search query to prevent lag on every keystroke
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 300); // 300ms delay
    return () => clearTimeout(handler);
  }, [searchQuery]);

  // Category filter - multi-select for cumulative filtering (Korean category to English label)
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set());
  // Gallery view pagination limit to prevent rendering performance issues
  // Start with fewer items on mobile to reduce memory pressure
  const [galleryLimit, setGalleryLimit] = useState(() =>
    typeof window !== 'undefined' && window.innerWidth < 768 ? 20 : 50
  );
  // NMK: Track if we're showing filtered results from full data
  const [nmkFilteredResults, setNmkFilteredResults] = useState<Artwork[] | null>(null);

  // Dynamic header height measurement for lightbox positioning
  const headerRef = useRef<HTMLDivElement | null>(null);
  const [headerHeight, setHeaderHeight] = useState(0);

  // Archive Navigation Refs
  const wheelAccumulator = useRef(0);
  const touchStartRef = useRef<{ x: number, y: number } | null>(null);

  // Debounce wheel accumulator reset to prevent stagnation
  useEffect(() => {
    const timer = setInterval(() => {
      wheelAccumulator.current = 0;
    }, 200);
    return () => clearInterval(timer);
  }, []);


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
      } else {
        // Reset search query if no pending query exists (fixes persistent search issue)
        setSearchQuery('');
      }
    } catch (e) {
      console.error('Failed to load search query from sessionStorage', e);
      setSearchQuery('');
    }
  }, [exhibition.id]);

  // Default ON VIEW filter for M+ collections on open
  useEffect(() => {
    const isMplus =
      exhibition.id === 'mplus-collection' ||
      exhibition.id === 'mplus-collection-mplus' ||
      exhibition.id === 'mplus-collection-sigg' ||
      exhibition.id === 'mplus';
    const isAustralian = ['agnsw', 'art-gallery-nsw', 'agnsw-collection', 'qagoma', 'qagoma-collection', 'mca-australia', 'mca-collection', 'ngv', 'ngv-collection'].includes(exhibition.id);
    const isCma = exhibition.id === 'cma' || exhibition.id?.startsWith('cma-');

    const isNGA = exhibition.id === 'nga-collection';
    setShowOnViewOnly(isMplus || isAustralian || isCma || isNGA);
    if (isMplus || isAustralian || isCma || isNGA) setSelectedIndex(0);
  }, [exhibition.id]);

  // Default ON DISPLAY filter for Reina Sofía on open
  useEffect(() => {
    // Reina sofia has 'Unlabeled Room' instead of empty.
    // If we want it ON DISPLAY by default, we just leave showOnDisplayOnly false because it filters out 'Unlabeled Room' otherwise.
    const isReina = exhibition.id === 'reina-sofia-collection';
    setShowOnDisplayOnly(false); // We want ALL to show, so false
    if (isReina) setSelectedIndex(0);
  }, [exhibition.id]);

  // Default "Painting" category filter for PSA on open
  useEffect(() => {
    if (exhibition.id === 'psa-collection-all' || exhibition.id === 'power-station-of-art') {
      setSelectedCategories(new Set(['Painting']));
      setSelectedIndex(0);
    } else {
      setSelectedCategories(new Set());
    }
  }, [exhibition.id]);

  // Reset highlight-only toggle when switching exhibitions
  useEffect(() => {
    setShowHighlightOnly(false);
  }, [exhibition.id]);

  // Reset open-content-only toggle when switching exhibitions
  useEffect(() => {
    setShowOpenContentOnly(false);
  }, [exhibition.id]);

  // Handle initialArtwork - scroll to and select the specific artwork when navigating from global search
  const initialArtworkRef = useRef<any>((exhibition as any).initialArtwork);

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
      // Clear initialArtwork to prevent re-triggering
      initialArtworkRef.current = null;
    }
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
      // Use smaller chunk size on mobile to prevent memory issues
      const ITEMS_PER_PAGE = typeof window !== 'undefined' && window.innerWidth < 768 ? 500 : 1000;
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



        return {
          id: item.id || `nmk-${nextChunk}-${idx}`,
          name: (item.title || item.name || 'Untitled'),
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
    if (exhibition.id !== 'nmk-collection' && exhibition.id !== 'reina-sofia-collection') return;
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
    const normalizedRawQuery = normalizeSearchText(searchQuery);
    if (normalizedRawQuery) {
      const includesQuery = (value: unknown) => {
        if (value === undefined || value === null) return false;
        const normalizedValue = normalizeSearchText(String(value));
        return normalizedValue.includes(normalizedRawQuery);
      };

      filtered = filtered.filter((item: any) => (
        includesQuery(item.title || item.name) ||
        includesQuery(item.category) ||
        includesQuery(item.subcategory) ||
        includesQuery(item.material) ||
        includesQuery(item.period) ||
        includesQuery(item.excavationSite) ||
        includesQuery(item.artist) ||
        includesQuery(item.technique) ||
        includesQuery(item.room)
      ));
    }



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
          roomId: String(item.room || '').trim() || 'Unlabeled Room',
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
        name: (item.title || item.name || 'Untitled'),
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exhibition.id, exhibition.name, selectedCategories.size, searchQuery, selectedCentury, selectedYearRange, selectedTypes.size, selectedRoomId, selectedMediumFacets.size]);

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

    // On mobile: one-time fetch to avoid persistent WebChannel connection that drains battery
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      getDocs(q).then((snap) => {
        const s = new Set<string>();
        snap.forEach(doc => {
          const data = doc.data() as any;
          const originalId = typeof data.artworkId === 'string' && data.artworkId.trim().length > 0
            ? data.artworkId.trim()
            : doc.id;
          s.add(originalId);
        });
        setLikedArtworks(s);
      }).catch((err) => {
        console.warn("Failed to fetch liked artworks (mobile):", err);
      });
      return;
    }

    // Desktop: real-time subscription
    const unsub = onSnapshot(q, (snap) => {
      const s = new Set<string>();
      snap.forEach(doc => {
        const data = doc.data() as any;
        const originalId = typeof data.artworkId === 'string' && data.artworkId.trim().length > 0
          ? data.artworkId.trim()
          : doc.id;
        s.add(originalId);
      });
      setLikedArtworks(s);
    }, (error) => {
      console.warn("Failed to subscribe to liked artworks:", error);
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

    const artworkId = String(artwork.id);
    const statsDocId = normalizeArtworkIdForFirestore(artworkId);
    // Check using normalized ID because likedArtworks set contains document IDs (which are normalized)
    const isLiked = likedArtworks.has(statsDocId) || likedArtworks.has(artworkId);

    const ref = doc(db, `users/${userToUse.uid}/liked_artworks/${statsDocId}`);
    const statsRef = doc(db, 'artwork_stats', statsDocId);

    try {
      if (isLiked) {
        // Optimistic update
        setLikedArtworks(prev => {
          const next = new Set(prev);
          next.delete(artworkId);
          return next;
        });
        // Optimistic stats update
        setArtworkStats(prev => {
          const old = prev[statsDocId] || { likeCount: 0, commentCount: 0 };
          return {
            ...prev,
            [statsDocId]: { ...old, likeCount: Math.max(0, old.likeCount - 1) }
          };
        });

        await deleteDoc(ref);
        // Decrement global count
        await setDoc(statsRef, { likeCount: increment(-1), artworkId }, { merge: true });
      } else {
        // Optimistic update
        setLikedArtworks(prev => {
          const next = new Set(prev);
          next.add(artworkId);
          return next;
        });
        // Optimistic stats update
        setArtworkStats(prev => {
          const old = prev[statsDocId] || { likeCount: 0, commentCount: 0 };
          return {
            ...prev,
            [statsDocId]: { ...old, likeCount: old.likeCount + 1 }
          };
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
          museum: museumName || '',
          exhibitionId: exhibition.id || '',
          exhibitionName: exhibition.name || '',
        });
        // Increment global count
        await setDoc(statsRef, { likeCount: increment(1), artworkId }, { merge: true });
      }
    } catch (error) {
      console.error("Failed to toggle like", error);
    }
  }, [currentUser, likedArtworks, museumName, exhibition]);



  useEffect(() => {
    setViewMode((prev) => (prev === 'gallery' ? prev : 'gallery'));
  }, [exhibition.id]);

  // Reset selected index and gallery scroll when viewMode changes (archive mode scroll is handled separately)
  useEffect(() => {
    // Reset selected index to 0 for all modes
    setSelectedIndex(0);
    // Reset archive scroll position ref
    archiveScrollTopRef.current = 0;
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
    fullUrl: string;
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
  const [mainNatural, setMainNatural] = useState<{ w: number; h: number } | null>(null);
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
    return () => {
      isActiveRef.current = false;
      // MEMORY CLEANUP: Clear large data structures on unmount to prevent memory bloat
      // This is critical for mobile Safari/Chrome which have limited memory
      try {
        // Clear cached full data for NMK/Gyeongju/Buyeo/Reina Sofia
        if ((window as any).__nmkFullData) {
          (window as any).__nmkFullData = null;
        }
        // Cancel any pending idle decode handles
        if (idleDecodeHandlesRef.current.length > 0) {
          const cancel = typeof (window as any).cancelIdleCallback === 'function'
            ? (handle: number) => (window as any).cancelIdleCallback(handle)
            : (handle: number) => window.clearTimeout(handle);
          idleDecodeHandlesRef.current.forEach(cancel);
          idleDecodeHandlesRef.current = [];
        }
        // Cancel momentum animation frame
        if (momentumRef.current?.raf) {
          cancelAnimationFrame(momentumRef.current.raf);
          momentumRef.current.raf = 0;
        }
        // Cancel title auto-scroll animation
        if (titleRafRef.current) {
          cancelAnimationFrame(titleRafRef.current);
          titleRafRef.current = null;
        }
      } catch (e) {
        console.warn('[ExhibitionModal] Cleanup error:', e);
      }
    };
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
    // Track if we're in a pinch zoom state
    let isPinchZooming = false;

    const onResize = () => {
      // PINCH ZOOM DETECTION: Use visualViewport API (available on mobile browsers)
      // When pinch zooming, visualViewport.scale > 1
      const vv = (window as any).visualViewport;
      if (vv && vv.scale > 1.05) {
        isPinchZooming = true;
        return; // Ignore resize during pinch zoom
      }

      // Also check if layout viewport differs significantly from visual viewport
      // This indicates zoom is active
      if (vv && Math.abs(vv.width - window.innerWidth) > 50) {
        isPinchZooming = true;
        return;
      }

      // Reset pinch zoom flag when scale returns to normal
      if (vv && vv.scale <= 1.05) {
        isPinchZooming = false;
      }

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
        // Double-check we're not in pinch zoom state before updating
        if (isPinchZooming) return;

        lastOrientationRef.current = currentOrientation;
        initialLayoutWidthRef.current = layoutWidth;
        setIsNarrow(layoutWidth < 1100);
        setIsVeryNarrow(layoutWidth < 900);
        setIsMobile(layoutWidth < 768);
        setWindowWidth(layoutWidth);
      }, 200);
    };

    // Listen to both resize and visualViewport resize for better pinch zoom detection
    window.addEventListener('resize', onResize);
    const vv = (window as any).visualViewport;
    if (vv) {
      vv.addEventListener('resize', onResize);
    }

    return () => {
      window.removeEventListener('resize', onResize);
      if (vv) {
        vv.removeEventListener('resize', onResize);
      }
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
    // Reina Sofía: discover from full dataset so rooms\'t limited to the first 1000.
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
    if ((exhibition.id === 'nmk-collection' || exhibition.id === 'reina-sofia-collection') && nmkFilteredResults !== null) {
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

    // Filter "On view" artworks only
    if (showOnViewOnly) {
      filtered = filtered.filter(a => {
        if ((a as any).onView === true || (a as any).isOnView === true || (a as any).onDisplay === true || (a as any).isOnDisplay === true) return true;
        const categories = (a as any).categories || [];
        return categories.some((cat: string) => cat && cat.toLowerCase().includes('on view'));
      });
    }

    // Public Domain filter
    if ((exhibition.id === 'ateneum-collection' || exhibition.id === 'met-ny-collection' || exhibition.id === 'met-ny-on-view-paintings' || exhibition.id === 'aic-highlights') && showPublicDomainOnly) {
      filtered = filtered.filter(a => (a as any).publicDomain === true || (a as any).isPublicDomain === true);
    }

    // NGA Open Access filter
    if (exhibition.id === 'nga-collection' && showOpenAccessOnly) {
      filtered = filtered.filter(a => (a as any).openAccessLikely === true);
    }

    // Getty Open Content filter
    if ((exhibition.id === 'getty-collection' || exhibition.id === 'getty') && showOpenContentOnly) {
      filtered = filtered.filter(a => (a as any).openContent === true || (a as any).open_content === true);
    }

    // Filter "On display" artworks only
    if (showOnDisplayOnly) {
      filtered = filtered.filter(a => (a as any).onView === true || (a as any).isOnView === true || (a as any).onDisplay === true || (a as any).isOnDisplay === true);
    }

    // Highlight filter (generic when dataset provides isHighlight/highlight/categories)
    if (showHighlightOnly) {
      filtered = filtered.filter(a => {
        if ((a as any).isHighlight === true || (a as any).highlight === true) return true;
        const categories = (a as any).categories || [];
        return categories.some((cat: string) => cat && cat.toLowerCase().includes('highlight'));
      });
    }

    // Pushkin: filter "Masterpiece" artworks only
    if (exhibition.id === 'pushkin-collection' && showMasterpieceOnly) {
      filtered = filtered.filter(a => (a as any).isMasterpiece === true);
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
    const normalizedModalQuery = normalizeSearchText(debouncedQuery);
    if (normalizedModalQuery) {
      filtered = filtered.filter(a => {
        // Optimization: if pre-computed search string exists, use it
        if ((a as any)._searchStr) {
          return (a as any)._searchStr.includes(normalizedModalQuery);
        }

        // Fallback: real-time normalization
        const includesQuery = (value: unknown) => {
          if (value === undefined || value === null) return false;
          const normalizedValue = normalizeSearchText(String(value));
          return normalizedValue.includes(normalizedModalQuery);
        };

        return (
          includesQuery(a.name || (a as any).title) ||
          includesQuery(a.artist) ||
          includesQuery(a.year) ||
          includesQuery(a.date) ||
          includesQuery((a as Record<string, unknown>).medium) ||
          includesQuery((a as Record<string, unknown>).technique) ||
          includesQuery((a as Record<string, unknown>).materials) ||
          includesQuery((a as Record<string, unknown>).category) ||
          includesQuery((a as Record<string, unknown>).artworkType) ||
          includesQuery(a.dimension)
        );
      });
    }

    return filtered;
  }, [roomFiltered, selectedCentury, selectedYearRange, showArtworksOnly, showOnViewOnly, showMasterpieceOnly, showOnDisplayOnly, showHighlightOnly, showPublicDomainOnly, selectedTypes, debouncedQuery, selectedCategories, exhibition.id, selectedMediumFacets]);

  const randomOrderMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const art of filteredArtworks) {
      map.set(art.id, Math.random());
    }
    return map;
  }, [filteredArtworks]);

  const sortedArtworks = useMemo(() => {
    const list = [...filteredArtworks];
    if (sortBy === 'default') {
      return list;
    } else if (sortBy === 'random') {
      // Use stable random order
      return list.sort((a, b) => {
        const ra = randomOrderMap.get(a.id) ?? 0;
        const rb = randomOrderMap.get(b.id) ?? 0;
        return ra - rb;
      });
    } else if (sortBy === 'year_asc') {
      return list.sort((a, b) => {
        const valA = a.year !== undefined ? a.year : 9999;
        const valB = b.year !== undefined ? b.year : 9999;
        return valA - valB;
      });
    } else if (sortBy === 'year_desc') {
      return list.sort((a, b) => {
        const valA = a.year !== undefined ? a.year : -9999;
        const valB = b.year !== undefined ? b.year : -9999;
        return valB - valA;
      });
    } else if (sortBy === 'like_desc') {
      return list.sort((a, b) => {
        // Prioritize items liked by user
        const isLikedA = likedArtworks.has(a.id);
        const isLikedB = likedArtworks.has(b.id);
        if (isLikedA && !isLikedB) return -1;
        if (!isLikedA && isLikedB) return 1;

        // Fallback to 0 if count unavailable
        const countA = Number((a as any).metadata?.saveCount || (a as any).saveCount || 0);
        const countB = Number((b as any).metadata?.saveCount || (b as any).saveCount || 0);
        return countB - countA;
      });
    }
    return list;
  }, [filteredArtworks, sortBy, likedArtworks, randomOrderMap]);

  // Check if any artwork has categorizable data for showing 2D/3D buttons
  const hasCategorizedArtworks = useMemo(() => {
    // For Korean museums, check full data if available
    const isKoreanMuseum = exhibition.id === 'nmk-collection';
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

  // Check if any artwork is Masterpiece (Pushkin)
  const hasMasterpieceArtworks = useMemo(() => {
    return artworks.some(a => (a as any).isMasterpiece === true);
  }, [artworks]);

  // Helpers for Mobile Filter Visibility Checks
  const has2DArtworks = useMemo(() => artworks.some(a => (a as any).type === '2D' || inferArtworkType(a) === '2D'), [artworks]);
  const has3DArtworks = useMemo(() => artworks.some(a => (a as any).type === '3D' || inferArtworkType(a) === '3D'), [artworks]);

  const hasOnViewArtworks = useMemo(() => {
    return artworks.some(a => {
      if ((a as any).onView === true || (a as any).isOnView === true || (a as any).onDisplay === true || (a as any).isOnDisplay === true) return true;
      const cats = (a as any).categories || [];
      return cats.some((c: string) => c && c.toLowerCase().includes('on view'));
    });
  }, [artworks]);

  const hasPublicDomainArtworks = useMemo(() => artworks.some(a => (a as any).publicDomain === true || (a as any).isPublicDomain === true), [artworks]);
  const hasOpenContentArtworks = useMemo(() => artworks.some(a => (a as any).openContent === true || (a as any).open_content === true), [artworks]);

  const hasHighlightArtworks = useMemo(() => {
    return artworks.some(a => {
      if ((a as any).isHighlight === true || (a as any).highlight === true) return true;
      const cats = (a as any).categories || [];
      return cats.some((c: string) => c && c.toLowerCase().includes('highlight'));
    });
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
    // MODIFIED: Sub-items are only accessible through the 2D and 3D buttons.
    if (hasCategorizedArtworks) {
      if (!targetType) return [];
    }
    // If hasCategorizedArtworks is FALSE, we fallback to showing ALL categories (old behavior),
    // because 2D/3D buttons won't appear anyway.

    const cats = new Set<string>();

    // For NMK/Gyeongju/Buyeo, use full dataset to calculate categories
    const isKoreanMuseum = exhibition.id === 'nmk-collection';
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
          if (!targetType || itemType === targetType) {
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
          if (targetType && itemType !== targetType) continue; // Skip if not matching type
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
    const isNmk = exhibition.id === 'nmk-collection';
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

  // PERF: Use a stable string dep (serialized IDs) instead of sortedArtworks object.
  // sortedArtworks is a new array every render → the old dep caused onSnapshot to
  // re-subscribe continuously, creating a Firestore stream storm that overheated mobile devices.
  const visibleStatsIds = useMemo(() => {
    if (viewMode !== 'gallery') return '';
    // Skip on mobile entirely - stats aren't worth the connection overhead
    if (typeof window !== 'undefined' && window.innerWidth < 768) return '';
    return sortedArtworks
      .slice(0, galleryLimit)
      .map(a => String((a as any)?.id ?? '').trim())
      .filter(Boolean)
      .join(',');
  }, [viewMode, sortedArtworks, galleryLimit]);

  useEffect(() => {
    if (!visibleStatsIds) return;

    const ids = visibleStatsIds.split(',').filter(Boolean);
    if (ids.length === 0) return;

    // Firestore documentId() cannot contain '/', so use normalized IDs for stats docs.
    const statsDocIds = ids.map(normalizeArtworkIdForFirestore);

    // Firestore 'in' query supports max 30 items. We need to chunk.
    const chunks: string[][] = [];
    for (let i = 0; i < statsDocIds.length; i += 30) {
      chunks.push(statsDocIds.slice(i, i + 30));
    }

    const unsubs: (() => void)[] = [];

    chunks.forEach((chunkIds) => {
      const safeIds = chunkIds.filter((id): id is string => typeof id === 'string' && id.trim().length > 0);
      if (safeIds.length === 0) return;
      const q = query(collection(db, 'artwork_stats'), where(documentId(), 'in', safeIds));
      const unsub = onSnapshot(q, {
        next: (snap) => {
          setArtworkStats(prev => {
            const next = { ...prev };
            snap.docs.forEach(doc => {
              const data = doc.data();
              // Always use doc.id (normalized ID) as the key to ensure consistency
              const key = doc.id;
              next[key] = {
                likeCount: data.likeCount || 0,
                commentCount: data.commentCount || 0
              };
            });
            return next;
          });
        },
        error: (err) => {
          console.warn("Artwork stats listener error (permission or network):", err);
          // Don't crash, just ignore
        }
      });
      unsubs.push(unsub);
    });

    return () => {
      unsubs.forEach(u => u());
    };
  }, [visibleStatsIds]);

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

  // Reset gallery pagination when filters change (use length to avoid infinite loop)
  const filteredArtworksLengthForReset = filteredArtworks.length;
  useEffect(() => {
    // Use smaller initial limit on mobile to prevent memory issues
    setGalleryLimit(typeof window !== 'undefined' && window.innerWidth < 768 ? 20 : 50);
  }, [filteredArtworksLengthForReset]);

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
    dimension: narrowMetaOffset + 120 + 90 // Shift right to avoid overlap
  } : isNarrow ? {
    title: narrowMetaOffset,
    creator: narrowMetaOffset,
    date: narrowMetaOffset + 160,
    dimension: narrowMetaOffset + 160 + 90 // Shift right to avoid overlap
  } : {
    title: Math.max(0, META_CREATOR_X - META_GAP),
    creator: META_CREATOR_X,
    date: META_DATE_X,
    dimension: META_DATE_X + META_GAP,
  };
  const applyFallbackImage = useCallback((target: HTMLImageElement | null, fallbackImages?: string[]) => {
    if (!target) return;

    // SFMOMA or similar specific fallbacks
    if (fallbackImages && fallbackImages.length > 0) {
      const fbIdx = parseInt(target.dataset.fallbackIdx || '0', 10);
      if (fbIdx < fallbackImages.length) {
        target.dataset.fallbackIdx = (fbIdx + 1).toString();
        target.src = fallbackImages[fbIdx];
        try { target.srcset = ''; } catch { }
        target.removeAttribute('srcset');
        return;
      }
    }

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
    // Dulwich: 'width-1800' is the max; do not upgrade to 'width-2000' or it 404s
    if (out.includes('dulwich-gallery')) return out;

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
    // Prefer an explicit lightbox-only override if present (e.g., NJMuseum water/zoom images)
    if ((a as any).lightboxImage) {
      return { url: ensureHttps((a as any).lightboxImage), width: undefined };
    }
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
    setMainNatural(null);
    if (!currentArt || !currentArt.image) {
      setMainLoaded(true);
      return;
    }

    // Check browser cache: if already loaded, skip blur to avoid flicker
    const probe = new Image();
    probe.src = currentArt.image;
    if (probe.complete && probe.naturalWidth > 0) {
      setMainLoaded(true);
      if (mainImgRef.current) {
        mainImgRef.current.src = currentArt.image;
        mainImgRef.current.setAttribute('data-hi', '1');
      }
      return;
    }

    // Not in cache yet — apply blur-to-sharp transition
    setMainLoaded(false);
    let cancelled = false;
    const hi = new Image();
    hi.decoding = 'async';
    hi.loading = 'eager';
    hi.src = currentArt.image;
    hi.onload = () => {
      if (cancelled) return;
      setMainLoaded(true);
      if (mainImgRef.current && mainImgRef.current.getAttribute('data-hi') !== '1') {
        mainImgRef.current.src = currentArt.image;
        mainImgRef.current.setAttribute('data-hi', '1');
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
      const isRouteModal = (() => {
        try { return window.location.pathname.startsWith('/collection/'); } catch { return false; }
      })();

      const underlying = {
        hash: window.location.hash,
        scrollY: window.scrollY,
      };
      // merge underlying into current state
      const base = Object.assign({}, window.history.state || {});
      base.underlying = underlying;
      // replace current entry with one that contains underlying metadata
      window.history.replaceState(base, document.title);

      const current = (window.history.state as any) || {};
      const guardKey = `modalGuard_${exhibition.id}`;

      if (isRouteModal) {
        // When opened via /collection/:id, the URL already adds a history entry.
        // Do NOT push an extra state, otherwise back requires two presses.
        const st = { ...current, modal: true, exhibitionId: exhibition.id, selectedIndex } as any;
        window.history.replaceState(st, document.title);
        return;
      }

      // Non-route modal: push modal-specific state once so browser back closes the modal.
      const alreadyModal = !!(current.modal && current.exhibitionId === exhibition.id);
      const alreadyPushed = sessionStorage.getItem(guardKey) === '1';
      if (!alreadyModal && !alreadyPushed) {
        const modalState = { ...current, modal: true, exhibitionId: exhibition.id, selectedIndex } as any;
        window.history.pushState(modalState, document.title);
        try { sessionStorage.setItem(guardKey, '1'); } catch { }
      }

      // No extra dispatch here; HomePage reads history.state on mount to auto-open

      const onPop = (_e: PopStateEvent) => {
        // 브라우저 뒤로/앞으로 이동 시, 새 state가 여전히 현재 ExhibitionModal을 가리키는 범위라면
        // (예: 자식 오버레이인 Artist Gallery가 닫히면서 원래 모달 state로 돌아온 경우) 모달을 닫지 않습니다.
        if (_e.state && _e.state.modal === true && _e.state.exhibitionId === exhibition.id) {
          return;
        }
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
          const res = await fetch('/data/british-museum-galleries.json', { cache: 'force-cache' });
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
          const isTateFeed = exhibition.id.startsWith('tm-') || exhibition.id.startsWith('tbc-') || exhibition.id.startsWith('tsi-');
          const withImages = isTateFeed ? list : list.filter((a) => !!a.image);
          setArtworks(withImages);
          setInitialized(true);
        } catch (e) {
          console.error('Failed to load BM galleries:', e);
          setInitialized(true);
        }
      })();
      return () => { };
    }
    // Skagens Museum - Handle BOTH id variants here
    if (exhibition.id.includes('skagens')) {
      (async () => {
        try {
          console.log('[ExhibitionModal] Fetching Skagens data for id:', exhibition.id);
          const res = await fetch('/data/skagens-collection.json', { cache: 'force-cache' });
          if (!res.ok) {
            console.error('[ExhibitionModal] Fetch failed:', res.status, res.statusText);
            throw new Error(`Failed to load Skagens artworks: ${res.status} ${res.statusText}`);
          }
          const data = await res.json();
          const _itemsToMap = Array.isArray(data) ? data : (data.items || data.objects || data.data || data.artworks || []);
          const list: Artwork[] = _itemsToMap.map((item: any) => {
            return {
              id: item.id,
              name: item.title || 'Untitled',
              artist: item.artist || 'Unknown',
              year: parseInt(String(item.date || '').match(/\d{4}/)?.[0] || '0'),
              date: item.date,
              image: item.image,
              sourceUrl: item.sourceUrl,
              medium: item.medium || '',
              dimension: item.dimensions || '',
              roomId: 'default',
              exhibitionName: exhibition.name,
              exhibitionTitle: exhibition.title,
              category: item.category || 'Fine Arts',
              type: item.is3D ? '3D' : '2D'
            };
          });

          const filtered = list.filter(a => !!a.image);
          console.log('[ExhibitionModal] Set artworks state done. Count:', filtered.length);
          setArtworks(filtered);
          setInitialized(true);
        } catch (err) {
          console.error('[ExhibitionModal] Failed to load Skagens artworks:', err);
          setInitialized(true);
        }
      })();
      return () => { };
    }

    // National Gallery Singapore
    if (exhibition.id === 'ngs-collection-all') {
      (async () => {
        try {
          const res = await fetch('/data/ngs-all.json', { cache: 'force-cache' });
          if (!res.ok) throw new Error('Failed to load NGS data');
          const data = await res.json();
          // Map to internal Artwork type
          const mapped = data.map((item: any) => ({
            id: item.id,
            name: item.title,
            artist: item.artist,
            year: parseInt(String(item.date).match(/\d{4}/)?.[0] || '0'),
            date: item.date,
            image: item.imageUrl,
            medium: item.medium,
            dimension: item.dimensions,
            category: item.category,
            sourceUrl: item.sourceUrl, // Ensure this property is passed
            isHighlight: !!item.isHighlight,
            exhibitionName: exhibition.name,
            exhibitionTitle: exhibition.title,
            roomId: 'default'
          }));
          const filtered = mapped.filter((a: any) => !!a.image && !a.image.includes('images.grandpalaisrmn.fr/thumb.php'));
          setArtworks(filtered);
          setInitialized(true);
        } catch (e) {
          console.error('[ExhibitionModal] NGS load error:', e);
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
            ? '/data/tate-modern-collection.json'
            : '/data/tate-artworks.json';
          const res = await fetch(dataFile, { cache: 'force-cache' });
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
          const itemsArray = Array.isArray(data.items) ? data.items : (Array.isArray(data) ? data : []);
          const list: Artwork[] = itemsArray.map((item: any, idx: number) => {
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
            });
          const isTateFeed = exhibition.id.startsWith('tm-') || exhibition.id.startsWith('tbc-') || exhibition.id.startsWith('tsi-');
          const withImages = isTateFeed ? list : list.filter((a) => !!a.image);
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
          const res = await fetch('/data/mnk-collection.json', { cache: 'force-cache' });
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

          const isTateFeed = exhibition.id.startsWith('tm-') || exhibition.id.startsWith('tbc-') || exhibition.id.startsWith('tsi-');
          const withImages = isTateFeed ? list : list.filter((a) => !!a.image);
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
          const res = await fetch('/data/mfab-collection.json', { cache: 'force-cache' });
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
          const res = await fetch('/data/fine-arts-be-complete.json', { cache: 'force-cache' });
          if (!res.ok) throw new Error('Failed to load Fine Arts BE artworks');
          const data = await res.json();
          const items = Array.isArray(data) ? data : data.items || [];

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
          const res = await fetch('/data/gulbenkian-collection.json', { cache: 'force-cache' });
          if (!res.ok) throw new Error('Failed to load Gulbenkian artworks');
          const data = await res.json();
          // Map to internal Artwork format
          const _itemsToMap = Array.isArray(data) ? data : (data.items || data.objects || data.data || data.artworks || []);
          const list: Artwork[] = _itemsToMap.map((item: any) => {
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
          });

          const isTateFeed = exhibition.id.startsWith('tm-') || exhibition.id.startsWith('tbc-') || exhibition.id.startsWith('tsi-');
          const withImages = isTateFeed ? list : list.filter((a) => !!a.image);
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
          const res = await fetch('/data/nam-collection.json', { cache: 'force-cache' });
          if (!res.ok) throw new Error('Failed to load NAM artworks');
          const data = await res.json();
          // Map to internal Artwork format
          const _itemsToMap = Array.isArray(data) ? data : (data.items || data.objects || data.data || data.artworks || []);
          const list: Artwork[] = _itemsToMap.map((item: any) => {
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
          });

          const isTateFeed = exhibition.id.startsWith('tm-') || exhibition.id.startsWith('tbc-') || exhibition.id.startsWith('tsi-');
          const withImages = isTateFeed ? list : list.filter((a) => !!a.image);
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
          const res = await fetch('/data/kunsthaus-collection.json', { cache: 'force-cache' });
          if (!res.ok) throw new Error('Failed to load Kunsthaus artworks');
          const data = await res.json();
          const _itemsToMap = Array.isArray(data) ? data : (data.items || data.objects || data.data || data.artworks || []);
          const list: Artwork[] = _itemsToMap.map((item: any) => ({
            id: item.id || `kh-${Math.random()}`,
            name: item.title,
            artist: item.artist,
            year: parseInt(String(item.date || '').match(/\d{4}/)?.[0] || '0'),
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
          }));
          setArtworks(list.filter(a => !!a.image));
          setInitialized(true);
        } catch (err) {
          console.error('Failed to load Kunsthaus artworks:', err);
          setInitialized(true);
        }
      })();
      return () => { };
    }

    // Kunstmuseum Basel
    if (exhibition.id === 'basel-collection') {
      (async () => {
        try {
          const res = await fetch('/data/basel-collection.json', { cache: 'force-cache' });
          if (!res.ok) throw new Error('Failed to load Basel artworks');
          const data = await res.json();
          const _itemsToMap = Array.isArray(data) ? data : (data.items || data.objects || data.data || data.artworks || []);
          const list: Artwork[] = _itemsToMap.map((item: any) => ({
            id: item.id || `basel-${Math.random()}`,
            name: item.title,
            artist: item.artist,
            year: parseInt(String(item.date || '').match(/\d{4}/)?.[0] || '0'),
            date: item.date,
            image: item.image,
            sourceUrl: item.url, // eMuseumPlus deep link is valid? Yes, based on scraper.
            medium: item.medium,
            dimension: item.dimensions,
            roomId: 'default',
            exhibitionName: exhibition.name,
            exhibitionTitle: 'Painting Collection',
            category: 'Painting',
            type: '2D'
          }));
          setArtworks(list.filter(a => !!a.image));
          setInitialized(true);
        } catch (err) {
          console.error('Failed to load Basel artworks:', err);
          setInitialized(true);
        }
      })();
      return () => { };
    }

    // Zhejiang Art Museum (ZJAM)
    if (exhibition.id === 'zjam-collection') {
      (async () => {
        try {
          const res = await fetch('/data/zjam-collection.json', { cache: 'force-cache' });
          if (!res.ok) throw new Error('Failed to load ZJAM artworks');
          const data = await res.json();
          const _itemsToMap = Array.isArray(data) ? data : (data.items || data.objects || data.data || data.artworks || []);
          const list: Artwork[] = _itemsToMap.map((item: any) => {
            let cat = 'Painting';
            if (item.category === 'Engraving') cat = 'Print';
            if (item.category === 'Illustration and Cartoon') cat = 'Illustration';
            if (item.category === 'Sketch') cat = 'Drawing';

            return {
              id: item.id,
              name: item.title,
              artist: item.artist,
              year: parseInt(String(item.date || '').match(/\d{4}/)?.[0] || '0'),
              date: item.date,
              image: item.image, // Already HTTPS
              sourceUrl: item.sourceUrl,
              medium: item.medium,
              dimension: item.dimensions,
              roomId: 'default',
              exhibitionName: exhibition.name,
              exhibitionTitle: item.category,
              category: cat,
              type: '2D'
            };
          });
          setArtworks(list.filter(a => !!a.image));
          setInitialized(true);
        } catch (err) {
          console.error('Failed to load ZJAM artworks:', err);
          setInitialized(true);
        }
      })();
      return () => { };
    }

    // Hong Kong Museum of Art (HKMoA)
    if (exhibition.id === 'hkmoa' || exhibition.id === 'hkmoa-collection') {
      (async () => {
        try {
          const res = await fetch('/data/hkmoa-collection.json', { cache: 'force-cache' });
          if (!res.ok) throw new Error('Failed to load HKMoA artworks');
          const data = await res.json();
          const _itemsToMap = Array.isArray(data) ? data : (data.items || data.objects || data.data || data.artworks || []);
          const list: Artwork[] = _itemsToMap.map((item: any) => {
            const catLower = (item.category || '').toLowerCase();
            const medLower = (item.medium || '').toLowerCase();

            let type: Artwork['type'] = '2D';
            if (catLower.includes('antiquities') || catLower.includes('tea ware') || catLower.includes('fuyun xuan') ||
              medLower.includes('ceramic') || medLower.includes('bronze') || medLower.includes('sculpture')) {
              type = '3D';
            }

            return {
              id: item.id,
              name: item.title,
              artist: item.artist,
              year: parseInt(String(item.date || '').match(/\d{4}/)?.[0] || '0'),
              date: item.date,
              image: item.image,
              sourceUrl: item.sourceUrl,
              medium: item.medium,
              dimension: item.dimensions,
              roomId: 'default',
              exhibitionName: exhibition.name,
              exhibitionTitle: item.category,
              category: item.category,
              type
            };
          });
          setArtworks(list.filter(a => !!a.image));
          setInitialized(true);
        } catch (err) {
          console.error('Failed to load HKMoA artworks:', err);
          setInitialized(true);
        }
      })();
      return () => { };
    }

    // Tokyo National Museum (NICH ColBase)
    if (exhibition.id === 'nich-tnm' || exhibition.id === 'tnm-painting-collection') {
      (async () => {
        try {
          const res = await fetch('/data/nich-collection.json', { cache: 'force-cache' });
          if (!res.ok) throw new Error('Failed to load TNM artworks');
          const data = await res.json();
          const _itemsToMap = Array.isArray(data) ? data : (data.items || data.objects || data.data || data.artworks || []);
          const list: Artwork[] = _itemsToMap.map((item: any) => {
            return {
              id: item.id,
              name: item.title,
              artist: item.artist,
              year: parseInt(String(item.date || '').match(/\d{4}/)?.[0] || '0'),
              date: item.date,
              image: item.image,
              sourceUrl: item.source_id
                ? `https://colbase.nich.go.jp/collection_items/tnm/${item.source_id}`
                : undefined,
              medium: item.medium,
              dimension: undefined,
              roomId: 'default',
              exhibitionName: exhibition.name,
              exhibitionTitle: item.category,
              category: item.category,
              type: '2D'
            };
          });
          setArtworks(list.filter(a => !!a.image));
          setInitialized(true);
        } catch (err) {
          console.error('Failed to load TNM artworks:', err);
          setInitialized(true);
        }
      })();
      return () => { };
    }

    // Tokyo Metropolitan Art Museum
    if (exhibition.id === 'tobikan-collection') {
      (async () => {
        try {
          const res = await fetch('/data/tobikan-collection.json', { cache: 'force-cache' });
          if (!res.ok) throw new Error('Failed to load Tobikan artworks');
          const data = await res.json();
          const _itemsToMap = Array.isArray(data) ? data : (data.items || data.objects || data.data || data.artworks || []);
          const list: Artwork[] = _itemsToMap.map((item: any) => {
            // Check category for 3D
            const catLower = (item.category || '').toLowerCase();
            const type = (catLower.includes('sculpture') || catLower.includes('relief')) ? '3D' : '2D';

            return {
              id: item.id,
              name: item.title,
              artist: item.artist,
              year: parseInt(String(item.date || '').match(/\d{4}/)?.[0] || '0'),
              date: item.date,
              image: item.imageUrl,
              sourceUrl: 'https://www.tobikan.jp/en/archives/collection.html',
              medium: item.material,
              dimension: undefined,
              roomId: 'default',
              exhibitionName: exhibition.name,
              exhibitionTitle: item.category,
              category: item.category,
              type
            };
          });
          setArtworks(list.filter(a => !!a.image));
          setInitialized(true);
        } catch (err) {
          console.error('Failed to load Tobikan artworks:', err);
          setInitialized(true);
        }
      })();
      return () => { };
    }

    // Mori Art Museum
    if (exhibition.id === 'mori-collection') {
      (async () => {
        try {
          const res = await fetch('/data/mori-collection.json', { cache: 'force-cache' });
          if (!res.ok) throw new Error('Failed to load Mori artworks');
          const data = await res.json();
          const _itemsToMap = Array.isArray(data) ? data : (data.items || data.objects || data.data || data.artworks || []);
          const list: Artwork[] = _itemsToMap.map((item: any) => {
            let type: '2D' | '3D' | 'video' = inferArtworkType(item) || '2D';

            return {
              id: item.id,
              name: item.title,
              artist: item.artist,
              year: parseInt(String(item.date || '').match(/\d{4}/)?.[0] || '0'),
              date: item.date,
              image: item.imageUrl,
              sourceUrl: item.sourceUrl,
              medium: item.medium,
              dimension: item.dimensions,
              roomId: 'default',
              exhibitionName: exhibition.name,
              exhibitionTitle: item.category,
              category: item.category,
              type
            };
          });
          setArtworks(list.filter((a: any) => !!a.image));
          setInitialized(true);
        } catch (err) {
          console.error('Failed to load Mori artworks:', err);
          setInitialized(true);
        }
      })();
      return () => { };
    }

    // SFMOMA Collection
    if (exhibition.id === 'sfmoma-collection') {
      (async () => {
        try {
          const res = await fetch('/data/sfmoma-collection.json', { cache: 'force-cache' });
          if (!res.ok) throw new Error('Failed to load SFMOMA artworks');
          const data = await res.json();
          const _itemsToMap = Array.isArray(data) ? data : (data.items || data.objects || data.data || data.artworks || []);
          const list: Artwork[] = _itemsToMap.map((item: any) => {
            return {
              id: item.id,
              name: item.title,
              artist: item.artist,
              year: parseInt(String(item.date || '').match(/\d{4}/)?.[0] || '0'),
              date: item.date,
              image: item.image,
              sourceUrl: item.detailUrl,
              medium: item.medium,
              dimension: '',
              roomId: 'default',
              exhibitionName: exhibition.name,
              exhibitionTitle: item.classification,
              category: item.classification,
              type: '2D', // Mostly 2D/3D mixed, default to 2D
              onView: item.isOnView === true,
              isOnView: item.isOnView === true
            };
          });
          setArtworks(list.filter((a: any) => !!a.image));
          setInitialized(true);
        } catch (err) {
          console.error('Failed to load SFMOMA artworks:', err);
          setInitialized(true);
        }
      })();
      return () => { };
    }

    // Cleveland Museum of Art (CMA)
    if (exhibition.id === 'cma-collection') {
      (async () => {
        try {
          const res = await fetch('/data/cma-collection.json', { cache: 'force-cache' });
          if (!res.ok) throw new Error('Failed to load CMA artworks');
          const data = await res.json();
          const _itemsToMap = Array.isArray(data) ? data : (data.items || data.objects || data.data || data.artworks || []);
          const list: Artwork[] = _itemsToMap.map((item: any) => {
            return {
              id: item.id,
              name: item.title,
              artist: item.artist,
              year: parseInt(String(item.date || '').match(/\d{4}/)?.[0] || '0'),
              date: item.date,
              image: item.imageUrl,
              sourceUrl: `https://clevelandart.org/art/${item.accessionNumber}`,
              medium: item.medium,
              dimension: item.dimensions,
              roomId: 'default',
              exhibitionName: exhibition.name,
              exhibitionTitle: item.category,
              category: item.category,
              type: '2D',
              onView: item.onView === true,
              isOnView: item.onView === true
            };
          });
          setArtworks(list.filter((a: any) => !!a.image));
          setInitialized(true);
        } catch (err) {
          console.error('Failed to load CMA artworks:', err);
          setInitialized(true);
        }
      })();
      return () => { };
    }

    // Philadelphia Museum of Art
    if (exhibition.id === 'philadelphia-collection') {
      (async () => {
        try {
          const res = await fetch('/data/philadelphia-collection.json', { cache: 'force-cache' });
          if (!res.ok) throw new Error('Failed to load Philadelphia artworks');
          const data = await res.json();
          const _itemsToMap = Array.isArray(data) ? data : (data.items || data.objects || data.data || data.artworks || []);
          const list: Artwork[] = _itemsToMap.map((item: any) => {
            return {
              id: item.id,
              name: item.title,
              artist: item.artist,
              year: parseInt(String(item.date || '').match(/\d{4}/)?.[0] || '0'),
              date: item.date,
              image: item.image,
              sourceUrl: item.url,
              medium: item.medium,
              dimension: '',
              roomId: 'default',
              exhibitionName: exhibition.name,
              exhibitionTitle: item.classification,
              category: item.classification,
              type: '2D'
            };
          });
          setArtworks(list.filter((a: any) => !!a.image));
          setInitialized(true);
        } catch (err) {
          console.error('Failed to load Philadelphia artworks:', err);
          setInitialized(true);
        }
      })();
      return () => { };
    }

    // Detroit Institute of Arts (DIA)
    if (exhibition.id === 'dia-collection') {
      (async () => {
        try {
          const res = await fetch('/data/dia-collection.json', { cache: 'force-cache' });
          if (!res.ok) throw new Error('Failed to load DIA artworks');
          const data = await res.json();
          const _itemsToMap = Array.isArray(data) ? data : (data.items || data.objects || data.data || data.artworks || []);
          const list: Artwork[] = _itemsToMap.map((item: any) => {
            return {
              id: item.id,
              name: item.title,
              artist: item.artist,
              year: parseInt(String(item.date || '').match(/\d{4}/)?.[0] || '0'),
              date: item.date,
              image: item.image,
              sourceUrl: item.url,
              medium: item.medium,
              dimension: '',
              roomId: 'default',
              exhibitionName: exhibition.name,
              exhibitionTitle: item.classification,
              category: item.classification,
              type: '2D',
              onView: false,
              isOnView: false
            };
          });
          setArtworks(list.filter((a: any) => !!a.image));
          setInitialized(true);
        } catch (err) {
          console.error('Failed to load DIA artworks:', err);
          setInitialized(true);
        }
      })();
      return () => { };
    }

    // National Museum of Western Art, Tokyo
    if (exhibition.id === 'nmwa-collection') {
      (async () => {
        try {
          const res = await fetch('/data/nmwa-collection.json', { cache: 'force-cache' });
          if (!res.ok) throw new Error('Failed to load NMWA artworks');
          const data = await res.json();
          const list: Artwork[] = Array.isArray(data)
            ? data.map((item: any) => {
              return {
                id: item.id,
                name: item.title,
                artist: item.artist,
                year: parseInt(String(item.date || '').match(/\d{4}/)?.[0] || '0'),
                date: item.date,
                image: item.imageUrl,
                sourceUrl: item.sourceUrl,
                medium: item.medium,
                dimension: item.dimensions,
                roomId: 'default',
                exhibitionName: exhibition.name,
                exhibitionTitle: item.category,
                category: item.category,
                type: '2D',
                onDisplay: item.onDisplay === true
              };
            })
            : [];
          setArtworks(list.filter((a: any) => !!a.image && !a.image.includes('NoImage')));
          setInitialized(true);
        } catch (err) {
          console.error('Failed to load NMWA artworks:', err);
          setInitialized(true);
        }
      })();
      return () => { };
    }

    // Adachi Museum of Art
    if (exhibition.id === 'adachi-collection') {
      (async () => {
        try {
          const res = await fetch('/data/adachi-collection.json', { cache: 'force-cache' });
          if (!res.ok) throw new Error('Failed to load Adachi artworks');
          const data = await res.json();
          const list: Artwork[] = Array.isArray(data)
            ? data.map((item: any) => {
              const isHighlight = item.category === 'Exhibition Highlight';
              return {
                id: item.id,
                name: item.title,
                artist: item.artist,
                year: parseInt(String(item.year || '').match(/\d{4}/)?.[0] || '0'),
                date: item.year,
                image: item.imageUrl,
                thumb: item.imageUrl,
                sourceUrl: item.sourceUrl,
                medium: isHighlight ? '' : item.category,
                dimension: item.dimensions,
                description: item.description,
                roomId: 'default',
                exhibitionName: exhibition.name,
                exhibitionTitle: isHighlight ? '' : item.category,
                category: isHighlight ? '' : item.category,
                type: '2D',
                isHighlight: isHighlight
              };
            })
            : [];
          setArtworks(list);
          setInitialized(true);
        } catch (err) {
          console.error('Failed to load Adachi artworks:', err);
          setInitialized(true);
        }
      })();
      return () => { };
    }

    // Kanazawa 21st Century Museum
    // The Metropolitan Museum of Art (Met)
    if (exhibition.id === 'met-ny-collection' || exhibition.id === 'met-ny-on-view-paintings') {
      (async () => {
        try {
          // met-ny-collection.json for the primary "Collection Highlights" exhibition
          const file = '/data/met-ny-collection.json';
          const res = await fetch(file, { cache: 'force-cache' });
          if (!res.ok) throw new Error('Failed to load Met artworks');
          const data = await res.json();
          const list: Artwork[] = Array.isArray(data)
            ? data.map((item: any) => {
              const objectId = String(item.objectID ?? item.objectId ?? item.id ?? '').trim();
              const id = objectId ? `met-${objectId}` : `met-${Math.random().toString(36).slice(2)}`;
              const image = String(item.primaryImageSmall || item.primaryImage || item.imageUrl || item.image || '').trim();
              const objectDate = String(item.objectDate || item.date || '').trim();
              const year = parseInt(objectDate.match(/\d{4}/)?.[0] || '0', 10) || 0;
              const isOnView = !!item.gallery || item.isOnView === true;

              return {
                id,
                name: String(item.title || '').trim(),
                artist: String(item.artistDisplayName || item.artist || '').trim() || 'Unknown',
                year,
                date: objectDate,
                image,
                thumb: image,
                sourceUrl: String(item.objectURL || item.url || '').trim(),
                medium: String(item.medium || '').trim(),
                dimension: String(item.dimensions || '').trim(),
                description: [
                  String(item.department || '').trim(),
                  String(item.classification || item.objectName || '').trim(),
                ].filter(Boolean).join('\n'),
                roomId: 'default',
                exhibitionName: exhibition.name,
                exhibitionTitle: String(item.objectName || item.classification || 'Artwork').trim(),
                category: String(item.objectName || item.classification || 'Artwork').trim(),
                type: '2D' as const,
                onView: isOnView,
                isOnView: isOnView
              };
            })
            : [];
          setArtworks(list.filter(a => !!a.image));
          setInitialized(true);
        } catch (err) {
          console.error('Failed to load Met artworks:', err);
          setInitialized(true);
        }
      })();
      return () => { };
    }

    if (exhibition.id === 'kanazawa-collection') {
      (async () => {
        try {
          const res = await fetch('/data/kanazawa-all.json', { cache: 'force-cache' });
          if (!res.ok) throw new Error('Failed to load Kanazawa artworks');
          const data = await res.json();
          const list: Artwork[] = Array.isArray(data)
            ? data.map((item: any) => {
              return {
                id: item.id,
                name: item.title,
                artist: item.artist,
                year: parseInt(String(item.date || '').match(/\d{4}/)?.[0] || '0'),
                date: item.date,
                image: item.imageUrl,
                thumb: item.imageUrl,
                sourceUrl: item.url,
                medium: item.medium,
                dimension: item.dimensions,
                description: item.creditLine,
                roomId: 'default',
                exhibitionName: exhibition.name,
                exhibitionTitle: item.medium, // fallback for grouping
                category: item.medium,
                type: inferArtworkType(item) || '2D'
              };
            }).filter((item: any) => item.image) // Filter out items with no image
            : [];
          setArtworks(list);
          setInitialized(true);
        } catch (err) {
          console.error('Failed to load Kanazawa artworks:', err);
          setInitialized(true);
        }
      })();
      return () => { };
    }

    // Fondation Beyeler
    if (exhibition.id === 'beyeler-collection') {
      (async () => {
        try {
          const res = await fetch('/data/beyeler-collection.json', { cache: 'force-cache' });
          if (!res.ok) throw new Error('Failed to load Beyeler artworks');
          const data = await res.json();
          const _itemsToMap = Array.isArray(data) ? data : (data.items || data.objects || data.data || data.artworks || []);
          const list: Artwork[] = _itemsToMap.map((item: any) => {
            // Parse description for Metadata
            const descLines = (item.description || '').split('\n').map((s: string) => s.trim()).filter(Boolean);
            let medium = '';
            let dimensions = '';

            for (const line of descLines) {
              if (/cm/i.test(line) && /\d/.test(line)) {
                dimensions = line;
              } else if (/(oil|canvas|wood|paper|bronze|gouache|pencil|ink|pastel|sculpture|marble|acrylic|aquarel|tempera)/i.test(line)) {
                if (!medium) medium = line;
              }
            }
            if (!medium && descLines.length > 0 && descLines[0].length < 100) medium = descLines[0];

            let type: '2D' | '3D' = '2D';
            if (/sculpture|bronze|marble|wood|installation|plastik/i.test(medium) || /sculpture/i.test(item.description)) type = '3D';

            return {
              id: item.id,
              name: item.title || 'Untitled',
              artist: item.artist || 'Unknown',
              year: parseInt(String(item.date || '').match(/\d{4}/)?.[0] || '0'),
              date: item.date,
              image: item.image,
              sourceUrl: item.url,
              medium: medium,
              dimension: dimensions,
              roomId: 'default',
              exhibitionName: exhibition.name,
              exhibitionTitle: exhibition.title,
              category: 'Modern & Contemporary',
              type: type
            };
          });
          setArtworks(list.filter(a => !!a.image));
          setInitialized(true);
        } catch (err) {
          console.error('Failed to load Beyeler artworks:', err);
          setInitialized(true);
        }
      })();
      return () => { };
    }

    // Nasjonalmuseet
    if (exhibition.id === 'nasjonal-collection') {
      (async () => {
        try {
          const res = await fetch('/data/nasjonal-collection.json', { cache: 'force-cache' });
          if (!res.ok) throw new Error('Failed to load Nasjonalmuseet artworks');
          const data = await res.json();
          const _itemsToMap = Array.isArray(data) ? data : (data.items || data.objects || data.data || data.artworks || []);
          const list: Artwork[] = _itemsToMap.map((item: any, idx: number) => ({
            id: item.id ? `nasjonal-${item.id}` : `nasjonal-${idx}`,
            name: item.title || 'Untitled',
            artist: item.artist || 'Unknown',
            year: parseInt(String(item.date || '').match(/\d{4}/)?.[0] || '0'),
            date: item.date,
            image: item.image,
            sourceUrl: item.url,
            medium: item.medium || item.material || '',
            dimension: item.dimensions || item.dimension || '',
            roomId: 'default',
            exhibitionName: exhibition.name,
            exhibitionTitle: exhibition.title,
            category: item.category || 'Painting',
            type: item.type || '2D'
          }));
          setArtworks(list.filter(a => !!a.image));
          setInitialized(true);
        } catch (err) {
          console.error('Failed to load Nasjonalmuseet artworks:', err);
          setInitialized(true);
        }
      })();
      return () => { };
    }

    // The Broad
    if (exhibition.id === 'thebroad-collection' || exhibition.id.startsWith('thebroad-')) {
      (async () => {
        try {
          console.log('[ExhibitionModal] Fetching The Broad data...');
          const res = await fetch('/data/thebroad-collection.json');
          if (!res.ok) throw new Error(`Failed to load The Broad artworks: ${res.status}`);
          const data = await res.json();

          const _itemsToMap = Array.isArray(data) ? data : (data.items || data.objects || data.data || data.artworks || []);
          const list: Artwork[] = _itemsToMap.map((item: any) => ({
            id: String(item.id),
            name: item.title || 'Untitled',
            artist: item.artist || 'Unknown',
            year: parseInt(String(item.date || '').match(/\d{4}/)?.[0] || '0'),
            date: item.date,
            image: item.image,
            sourceUrl: item.url,
            medium: item.medium || '',
            dimensions: item.dimensions || '',
            roomId: 'default',
            exhibitionName: exhibition.name,
            exhibitionTitle: exhibition.title,
            category: 'Contemporary Art',
            type: '2D' // Most items are 2D, but could refine this based on medium later
          }));

          const filtered = list.filter(a => !!a.image);
          console.log('[ExhibitionModal] The Broad filtered count:', filtered.length);
          setArtworks(filtered);
          setInitialized(true);
        } catch (err) {
          console.error('Failed to load The Broad artworks:', err);
          setInitialized(true);
        }
      })();
      return () => { };
    }

    // Crystal Bridges
    if (exhibition.id === 'crystalbridges-collection' || exhibition.id.startsWith('crystalbridges-')) {
      (async () => {
        try {
          console.log('[ExhibitionModal] Fetching Crystal Bridges data...');
          const res = await fetch('/data/crystal-bridges-gac.json');
          if (!res.ok) throw new Error(`Failed to load Crystal Bridges artworks: ${res.status}`);
          const data = await res.json();

          const _itemsToMap = Array.isArray(data) ? data : (data.items || data.objects || data.data || data.artworks || []);
          const list: Artwork[] = _itemsToMap.map((item: any) => ({
            id: String(item.id),
            name: item.title || 'Untitled',
            artist: item.artist || 'Unknown',
            year: parseInt(String(item.date || '').match(/\d{4}/)?.[0] || '0'),
            date: item.date,
            image: item.image,
            sourceUrl: item.url,
            medium: '',
            dimensions: '',
            roomId: 'default',
            exhibitionName: exhibition.name,
            exhibitionTitle: exhibition.title,
            category: 'American Art',
            type: '2D'
          }));

          const filtered = list.filter(a => !!a.image);
          console.log('[ExhibitionModal] Crystal Bridges filtered count:', filtered.length);
          setArtworks(filtered);
          setInitialized(true);
        } catch (err) {
          console.error('Failed to load Crystal Bridges artworks:', err);
          setInitialized(true);
        }
      })();
      return () => { };
    }

    // LACMA (Combined Collection)
    if (exhibition.id === 'lacma-paintings' || exhibition.id.startsWith('lacma-')) {
      (async () => {
        try {
          // Load Paintings, Drawings, and Japanese Prints concurrently to form one large collection
          const [resPaintings, resDrawings, resPrints] = await Promise.all([
            fetch('/data/lacma-classification-22.json', { cache: 'force-cache' }),
            fetch('/data/lacma-drawings-51.json', { cache: 'force-cache' }),
            fetch('/data/lacma-japanese-prints.json', { cache: 'force-cache' })
          ]);

          let dataDetails: any[] = [];
          if (resPaintings.ok) {
            const d = await resPaintings.json();
            if (Array.isArray(d)) dataDetails = dataDetails.concat(d);
          }
          if (resDrawings.ok) {
            const d = await resDrawings.json();
            if (Array.isArray(d)) dataDetails = dataDetails.concat(d);
          }
          if (resPrints.ok) {
            const d = await resPrints.json();
            if (Array.isArray(d)) dataDetails = dataDetails.concat(d);
          }

          const seen = new Set();
          const list: Artwork[] = [];

          dataDetails.forEach((item: any) => {
            if (!item.id || seen.has(item.id)) return;
            seen.add(item.id);

            let imageUrl = item.image || item.thumbnail;
            if (!imageUrl) return;

            // Normalize category if possible
            let cat = item.category || item.classification || 'Painting';
            // Simple mapping improvement
            if (/drawing/i.test(cat)) cat = 'Drawing';
            if (/print/i.test(cat)) cat = 'Print';

            list.push({
              id: `lacma-${item.id}`,
              name: item.title || 'Untitled',
              artist: item.artist || 'Unknown',
              year: parseInt(String(item.date || '').match(/\d{4}/)?.[0] || '0'),
              date: item.date,
              image: imageUrl,
              sourceUrl: item.url || '',
              medium: item.medium || '',
              dimension: item.dimensions || '',
              roomId: 'default',
              exhibitionName: exhibition.name,
              exhibitionTitle: exhibition.title,
              category: cat,
              type: '2D'
            });
          });

          setArtworks(list);
          setInitialized(true);
        } catch (err) {
          console.error('Failed to load LACMA artworks:', err);
          setInitialized(true);
        }
      })();
      return () => { };
    }

    // Den Hirschsprungske Samling
    if (exhibition.id === 'hirschsprung-collection' || exhibition.id === 'hirschsprung-perm') {
      (async () => {
        try {
          console.log('[ExhibitionModal] Fetching Hirschsprung data...');
          const res = await fetch('/data/hirschsprung-collection.json');
          if (!res.ok) throw new Error(`Failed to load Hirschsprung artworks: ${res.status}`);
          const data = await res.json();
          console.log('[ExhibitionModal] Hirschsprung data items:', Array.isArray(data) ? data.length : 'Not array');

          const _itemsToMap = Array.isArray(data) ? data : (data.items || data.objects || data.data || data.artworks || []);
          const list: Artwork[] = _itemsToMap.map((item: any) => ({
            id: String(item.id),
            name: item.title || 'Untitled',
            artist: item.artist || 'Unknown',
            year: parseInt(String(item.date || '').match(/\d{4}/)?.[0] || '0'),
            date: item.date,
            image: item.image,
            sourceUrl: item.sourceUrl,
            medium: item.medium || '',
            dimension: item.dimensions || '',
            roomId: 'default',
            exhibitionName: exhibition.name,
            exhibitionTitle: exhibition.title,
            category: item.category || 'Painting',
            type: (item.is3D === true || (String(item.is3D) === 'true')) ? '3D' : '2D'
          }));

          const filtered = list.filter(a => !!a.image);
          console.log('[ExhibitionModal] Hirschsprung filtered count:', filtered.length);
          setArtworks(filtered);
          setInitialized(true);
        } catch (err) {
          console.error('Failed to load Hirschsprung artworks:', err);
          setInitialized(true);
        }
      })();
      return () => { };
    }

    // Nationalmuseum Sweden
    if (exhibition.id === 'nationalmuseum-sweden-collection') {
      (async () => {
        try {
          const res = await fetch('/data/sweden-collection.json', { cache: 'force-cache' });
          if (!res.ok) throw new Error('Failed to load Nationalmuseum Sweden artworks');
          const data = await res.json();
          const _itemsToMap = Array.isArray(data) ? data : (data.items || data.objects || data.data || data.artworks || []);
          const list: Artwork[] = _itemsToMap.map((item: any) => {
            let artType: '2D' | '3D' = '2D';
            const t = (item.type || '').toLowerCase();
            const m = (item.medium || '').toLowerCase();
            // Enhance detection with technique and materials if available
            const technique = item._raw?.technique || '';

            if (
              t.includes('sculpture') ||
              t.includes('ceramic') ||
              t.includes('furniture') ||
              t.includes('applied art') ||
              t.includes('craft') ||
              m.includes('sculpture') ||
              m.includes('ceramic') ||
              m.includes('porcelain') ||
              m.includes('bronze') ||
              m.includes('marble') ||
              technique.includes('Sculpture')
            ) {
              artType = '3D';
            }

            // Normalize category (prefer collection field, fallback to type or Artwork)
            const rawCat = item.collection || item.type || 'Artwork';
            const category = rawCat.charAt(0).toUpperCase() + rawCat.slice(1);

            // Proxy image through wsrv.nl to bypass hotlinking protection (Reference: https://wsrv.nl/)
            // Note: Nationalmuseum blocks requests with 'Referer' other than their own, even on wsrv.nl if we pass full URL with https:// because wsrv forwards everything?
            // Actually, wsrv.nl works best if we strip the protocol or let it handle it.
            // Manual test: curl "https://wsrv.nl/?url=collection.nationalmuseum.se/..." works, but "https://wsrv.nl/?url=https://..." failed with 404.
            const rawImage = item.image || '';
            const cleanUrl = rawImage.replace(/^https?:\/\//, '');
            const imageUrl = cleanUrl ? `https://wsrv.nl/?url=${cleanUrl}` : '';

            return {
              id: item.id || `nms-${Math.random()}`,
              name: item.title || 'Untitled',
              artist: item.artist || 'Unknown',
              year: parseInt(String(item.date || '').match(/\d{4}/)?.[0] || '0'),
              date: item.date || '',
              image: imageUrl,
              sourceUrl: item.url,
              medium: item.medium || '',
              dimension: item.dimensions || '',
              roomId: 'default',
              exhibitionName: exhibition.name,
              exhibitionTitle: exhibition.title,
              category: category,
              type: artType
            };
          });
          setArtworks(list.filter((a: any) => !!a.image));
          setInitialized(true);
        } catch (err) {
          console.error('Failed to load Nationalmuseum Sweden artworks:', err);
          setInitialized(true);
        }
      })();
      return () => { };
    }

    // MAH Geneva
    if (exhibition.id === 'mah-collection') {
      (async () => {
        try {
          const res = await fetch('/data/mah-collection.json', { cache: 'force-cache' });
          if (!res.ok) throw new Error('Failed to load MAH artworks');
          const data = await res.json();
          const itemsToMap = Array.isArray(data) ? data : (data.items || data.objects || data.data || data.artworks || []);
          const list: Artwork[] = itemsToMap.map((item: any, idx: number) => {
            // Inferred type
            let type: '2D' | '3D' = '2D';
            const combinedText = (item.medium || '') + ' ' + (item.objectType || '');
            if (/sculpture|bronze|marbre|bois|installation|plâtre|céramique|statue/i.test(combinedText)) {
              type = '3D';
            }

            return {
              id: `mah-${idx}`,
              name: item.title || 'Untitled',
              artist: item.artist || 'Unknown',
              year: parseInt(String(item.date || '').match(/\d{4}/)?.[0] || '0'),
              date: item.date,
              image: item.image,
              sourceUrl: item.source,
              medium: item.medium || '',
              dimension: item.dimensions || '',
              roomId: 'default',
              exhibitionName: exhibition.name,
              exhibitionTitle: exhibition.title,
              category: item.objectType || 'Fine Arts',
              type: type
            };
          });
          setArtworks(list.filter(a => !!a.image));
          setInitialized(true);
        } catch (err) {
          console.error('Failed to load MAH artworks:', err);
          setInitialized(true);
        }
      })();
      return () => { };
    }

    // M+ (Hong Kong)
    if (exhibition.id === 'mplus-collection-mplus' || exhibition.id === 'mplus-collection-sigg' || exhibition.id === 'mplus') {
      (async () => {
        try {
          let file = '/data/mplus-collection-mplus.json';
          if (exhibition.id === 'mplus-collection-sigg') file = '/data/mplus-collection-sigg.json';

          const res = await fetch(file, { cache: 'force-cache' });
          if (!res.ok) throw new Error('Failed to load M+ artworks');
          const data = await res.json();
          const _itemsToMap = Array.isArray(data) ? data : (data.items || data.objects || data.data || data.artworks || []);
          const list: Artwork[] = _itemsToMap.map((item: any, idx: number) => {
            const dateText = String(item.date || '');
            const year = parseInt(dateText.match(/\b\d{4}\b/)?.[0] || '0', 10);
            const categoryText = String(item.category || item.classification || '');
            const mediumText = String(item.medium || '');
            const combined = `${categoryText} ${mediumText}`;
            const type: '2D' | '3D' | 'unknown' = /sculpture|installation|ceramic|bronze|stone|wood/i.test(combined) ? '3D' : '2D';

            return {
              id: `mplus-${item.id || idx}`,
              name: item.title || 'Untitled',
              artist: item.artist || 'Unknown',
              year,
              date: item.date,
              image: ensureHttps(item.image || (Array.isArray(item.images) ? item.images[0] : '') || ''),
              sourceUrl: item.detailUrl || item.sourceUrl || '',
              medium: item.medium || '',
              dimension: item.dimensions || item.dimension || '',
              roomId: 'default',
              exhibitionName: exhibition.name,
              exhibitionTitle: exhibition.title,
              category: item.category || '',
              onView: !!item.onView,
              type,
            };
          });
          setArtworks(list.filter(a => !!a.image));
          setInitialized(true);
        } catch (err) {
          console.error('Failed to load M+ artworks:', err);
          setInitialized(true);
        }
      })();
      return () => { };
    }

    // TFAM (Taipei Fine Arts Museum)
    if (exhibition.id === 'tfam' || exhibition.id === 'tfam-collection-100' || exhibition.id === 'tfam-collection-all') {
      (async () => {
        try {
          // Always use the full collection as default source
          const collectionFile = 'tfam-collection-all.json';
          console.log('[TFAM] Loading', collectionFile);
          const res = await fetch(`/data/${collectionFile}`, { cache: 'force-cache' });
          if (!res.ok) throw new Error(`Failed to load TFAM artworks: ${res.status}`);
          const data = await res.json();
          const _itemsToMap = Array.isArray(data) ? data : (data.items || data.objects || data.data || data.artworks || []);
          const list: Artwork[] = _itemsToMap.map((item: any, idx: number) => {
            const dateText = String(item.date || '');
            const year = parseInt(dateText.match(/\b\d{4}\b/)?.[0] || '0', 10);

            const title = item.title || item.name || 'Untitled';
            const artist = cleanArtistName(item.artist || item.creator || '') || 'Unknown';
            const mediumText = String(item.medium || item.technique || '');
            const categoryText = String(item.category || item.artworkType || item.type || '');
            const combined = `${categoryText} ${mediumText}`.toLowerCase();

            let type: Artwork['type'] = inferArtworkType({ category: categoryText, medium: mediumText, type: item.type }) || '2D';
            if (type === '2D' && /video|single-channel|multi-channel|channel|film|moving image/.test(combined)) type = 'video';

            return {
              id: `tfam-${item.id || idx}`,
              name: title,
              artist,
              year,
              date: item.date,
              image: ensureHttps(item.image || (Array.isArray(item.images) ? item.images[0] : '') || ''),
              sourceUrl: item.detailUrl || item.sourceUrl || '',
              medium: item.medium || '',
              dimension: item.dimensions || item.dimension || '',
              roomId: 'default',
              exhibitionName: exhibition.name,
              exhibitionTitle: exhibition.title,
              category: item.category || '',
              isHighlight: !!item.isHighlight,
              type,
            };
          });
          setArtworks(list.filter(a => !!a.image));
          setInitialized(true);
        } catch (err) {
          console.error('Failed to load TFAM artworks:', err);
          setInitialized(true);
        }
      })();
      return () => { };
    }

    // Seogwipo Museums + Chinese Museums + American Museums + Aus/NZ Museums + Korean + European + Others
    if (['lee-jung-seop-museum', 'ljs-collection', 'gidang-art-museum', 'gidang-collection', 'soam-memorial-hall', 'soam-collection', 'jeju-museum-of-art', 'jmoa-collection', 'kim-tschang-yeul-art-museum', 'kimtschang-yeul-collection', 'dumoak', 'dumoak-collection', 'palace-museum-intl', 'dpm-intl-paintings', 'national-museum-of-china', 'nmc-highlights-all', 'shenzhen-museum', 'shenzhenmuseum-l0303-all', 'nanjing-museum', 'njmuseum-collection-all', 'shanghai-museum', 'shanghaimuseum-paintings-all', 'guangdong-museum-of-art', 'gdmoa-online-collection', 'national-palace-museum-taipei', 'npm-selection-painting', 'ntmofa', 'ntmofa-collection', 'china-art-museum', 'china-art-museum-collection', 'namoc', 'namoc-collection', 'power-station-of-art', 'psa-collection-all', 'long-museum', 'long-museum-collection', 'smithsonian-american-art-museum', 'saam-paintings', 'smithsonian-asian-art', 'si-asian-art-collection', 'smithsonian-national-portrait-gallery', 'si-npg-collection', 'moma-collection', 'moma-highlights', 'art-institute-of-chicago', 'aic-highlights', 'getty', 'getty-collection', 'high-museum', 'high-museum-collection', 'qagoma', 'qagoma-collection', 'mca-australia', 'mca-collection', 'agnsw', 'art-gallery-nsw', 'agnsw-collection', 'ngv', 'ngv-collection', 'tepapa', 'tepapa-collection', 'tepapa-paintings', 'frida-timeline', 'frida-kahlo-museum', 'masp', 'masp-collection',
      // Korean national museums
      'jeonju-collection', 'gwangju-collection', 'folk-collection', 'busan-collection',
      // Taiwanese museums
      'tfam-collection-all', 'taipei-fine-arts-museum', 'm-plus-collection', 'm-plus-collection-sigg', 'mplus-collection-sigg', 'hkmoa-collection', 'hong-kong-museum-of-art',
      // Japanese museums
      'tnm-painting-collection', 'tokyo-national-museum', 'kanazawa-collection', 'kanazawa-21st-century',
      // UK - Victoria and Albert
      'vam-permanent',
      // Europe - Leopold, Glyptotek, etc.
      'leopold-museum-collection', 'leopold-museum',
      'mnk-collection', 'national-museum-krakow',
      'glyptoteket-collection', 'ny-carlsberg-glyptotek',
      'skagens-collection', 'skagens-museum',
      'hirschsprung-perm', 'hirschsprung-collection',
      // France - French museums with collectionFiles but no loader
      'mad-collection', 'mad-paris', 'musee-arts-decoratifs',
      'napoli-collection', 'museo-archeologico-napoli',
      // MBAM Canada
      'mbam-collection', 'montreal-museum'
    ].includes(exhibition.id)) {
      (async () => {
        try {
          // If accessing via collection ID, we might need to find the parent exhibition or fallback to known filenames
          let collectionFile = (exhibition as any).collectionFile; // Direct property if passed as exhibition item (cast to any for safety)

          // Fallback map if collectionFile is missing from the passed object
          if (!collectionFile) {
            if (exhibition.id === 'ljs-collection' || exhibition.id === 'lee-jung-seop-museum') collectionFile = 'lee-jung-seop-collection.json';
            else if (exhibition.id === 'gidang-collection' || exhibition.id === 'gidang-art-museum') collectionFile = 'gidang-collection.json';
            else if (exhibition.id === 'soam-collection' || exhibition.id === 'soam-memorial-hall') collectionFile = 'soam-memorial-collection.json';
            else if (exhibition.id === 'jmoa-collection' || exhibition.id === 'jeju-museum-of-art') collectionFile = 'jmoa-collection-all.json';
            else if (exhibition.id === 'kimtschang-yeul-collection' || exhibition.id === 'kim-tschang-yeul-art-museum') collectionFile = 'kimtschang-yeul-collection-all.json';
            else if (exhibition.id === 'dumoak-collection' || exhibition.id === 'dumoak') collectionFile = 'dumoak-kim-work-all.json';
            else if (exhibition.id === 'dpm-intl-paintings' || exhibition.id === 'palace-museum-intl') collectionFile = 'dpm-intl-paintings-all.json';
            else if (exhibition.id === 'nmc-highlights-all' || exhibition.id === 'national-museum-of-china') collectionFile = 'nmc-highlights-all.json';
            else if (exhibition.id === 'shenzhenmuseum-l0303-all' || exhibition.id === 'shenzhen-museum') collectionFile = 'shenzhenmuseum-l0303-all.json';
            else if (exhibition.id === 'njmuseum-collection-all' || exhibition.id === 'nanjing-museum') collectionFile = 'njmuseum-collection-all.json';
            else if (exhibition.id === 'shanghaimuseum-paintings-all' || exhibition.id === 'shanghai-museum') collectionFile = 'shanghaimuseum-paintings-all.json';
            else if (exhibition.id === 'gdmoa-online-collection' || exhibition.id === 'guangdong-museum-of-art') collectionFile = 'gdmoa-online-collection-all.json';
            else if (exhibition.id === 'psa-collection-all' || exhibition.id === 'power-station-of-art') collectionFile = 'psa-collection-all.json';
            else if (exhibition.id === 'long-museum-collection' || exhibition.id === 'long-museum') collectionFile = 'long-museum-collection.json';
            else if (exhibition.id === 'saam-paintings' || exhibition.id === 'smithsonian-american-art-museum') collectionFile = 'saam-paintings-full.json';
            else if (exhibition.id === 'si-asian-art-collection' || exhibition.id === 'smithsonian-asian-art') collectionFile = 'si-asian-art.json';
            else if (exhibition.id === 'si-npg-collection' || exhibition.id === 'smithsonian-national-portrait-gallery') collectionFile = 'si-npg.json';
            else if (exhibition.id === 'moma-highlights' || exhibition.id === 'moma-collection') collectionFile = 'moma-collection.json';
            else if (exhibition.id === 'aic-highlights' || exhibition.id === 'art-institute-of-chicago') collectionFile = 'aic-collection.json';
            else if (exhibition.id === 'getty-collection' || exhibition.id === 'getty') collectionFile = 'getty-collection.json';
            else if (exhibition.id === 'masp-collection' || exhibition.id === 'masp') collectionFile = 'masp-collection.json';
            else if (exhibition.id === 'high-museum-collection' || exhibition.id === 'high-museum') collectionFile = 'high-collection.json';
          }

          const permanentExhibitions = (exhibition as any).permanentExhibitions as any[] | undefined;
          if (!collectionFile && permanentExhibitions && permanentExhibitions.length > 0) {
            // Try to look up from permanentExhibitions if it's the parent object
            collectionFile = permanentExhibitions[0]?.collectionFile;
          }

          if (!collectionFile) {
            // Hard fallback just in case
            if (exhibition.id.includes('lee-jung')) collectionFile = 'lee-jung-seop-collection.json';
            else if (exhibition.id.includes('gidang')) collectionFile = 'gidang-collection.json';
            else if (exhibition.id.includes('soam')) collectionFile = 'soam-memorial-collection.json';
            else if (exhibition.id.includes('jmoa') || exhibition.id.includes('jeju-museum-of-art')) collectionFile = 'jmoa-collection-all.json';
            else if (exhibition.id.includes('kimtschang') || exhibition.id.includes('tschang') || exhibition.id.includes('kim-tschang')) collectionFile = 'kimtschang-yeul-collection-all.json';
            else if (exhibition.id.includes('dumoak')) collectionFile = 'dumoak-kim-work-all.json';
            else if (exhibition.id.includes('palace-museum') || exhibition.id.includes('dpm-intl')) collectionFile = 'dpm-intl-paintings-all.json';
            else if (exhibition.id.includes('national-museum-of-china') || exhibition.id.includes('nmc-highlights')) collectionFile = 'nmc-highlights-all.json';
            else if (exhibition.id.includes('shenzhen')) collectionFile = 'shenzhenmuseum-l0303-all.json';
            else if (exhibition.id.includes('nanjing') || exhibition.id.includes('njmuseum')) collectionFile = 'njmuseum-collection-all.json';
            else if (exhibition.id.includes('shanghai') || exhibition.id.includes('shanghaimuseum')) collectionFile = 'shanghaimuseum-paintings-all.json';
            else if (exhibition.id.includes('gdmoa') || exhibition.id.includes('guangdong-museum-of-art')) collectionFile = 'gdmoa-online-collection-all.json';
            else if (exhibition.id.includes('national-palace-museum-taipei') || exhibition.id.includes('npm-selection')) collectionFile = 'npm-selection-painting.json';
            else if (exhibition.id === 'ntmofa' || exhibition.id === 'ntmofa-collection') collectionFile = 'ntmofa-collection.json';
            else if (exhibition.id === 'china-art-museum' || exhibition.id === 'china-art-museum-collection') collectionFile = 'china-art-museum-collection.json';
            else if (exhibition.id === 'namoc' || exhibition.id === 'namoc-collection') collectionFile = 'namoc-collection.json';
            else if (exhibition.id === 'long-museum' || exhibition.id === 'long-museum-collection') collectionFile = 'long-museum-collection.json';
            else if (exhibition.id.includes('smithsonian') || exhibition.id.includes('saam')) collectionFile = 'saam-paintings-full.json';
            else if (exhibition.id.includes('moma')) collectionFile = 'moma-collection.json';
            else if (exhibition.id.includes('aic-highlights') || exhibition.id.includes('art-institute')) collectionFile = 'aic-collection.json';
            else if (exhibition.id.includes('getty')) collectionFile = 'getty-collection.json';
            else if (exhibition.id.includes('qagoma')) collectionFile = 'qagoma-collection.json';
            else if (exhibition.id.includes('masp')) collectionFile = 'masp-collection.json';
            else if (exhibition.id.includes('high-museum')) collectionFile = 'high-collection.json';
            else if (exhibition.id.includes('mca-australia') || exhibition.id.includes('mca-collection')) collectionFile = 'mca-collection.json';
            else if (exhibition.id.includes('agnsw') || exhibition.id.includes('art-gallery-nsw')) collectionFile = 'agnsw-collection.json';
            else if (exhibition.id.includes('ngv')) collectionFile = 'ngv-collection.json';
            else if (exhibition.id.includes('tepapa')) collectionFile = 'tepapa-collection.json';
            else if (exhibition.id.includes('frida-timeline') || exhibition.id.includes('frida-kahlo')) collectionFile = 'frida-timeline.json';
            // Korean national museums
            else if (exhibition.id === 'jeonju-collection') collectionFile = 'jeonju-museum.json';
            else if (exhibition.id === 'gwangju-collection') collectionFile = 'gwangju-museum.json';
            else if (exhibition.id === 'folk-collection') collectionFile = 'folk-museum.json';
            else if (exhibition.id === 'busan-collection') collectionFile = 'busan-museum.json';
            // Taiwanese
            else if (exhibition.id === 'tfam-collection-all' || exhibition.id === 'taipei-fine-arts-museum') collectionFile = 'tfam-collection-all.json';
            else if (exhibition.id === 'mplus-collection-sigg' || exhibition.id === 'm-plus-collection-sigg' || exhibition.id === 'm-plus-collection') collectionFile = 'mplus-collection-sigg.json';
            else if (exhibition.id === 'hkmoa-collection' || exhibition.id === 'hong-kong-museum-of-art') collectionFile = 'hkmoa-collection.json';
            // Japanese
            else if (exhibition.id === 'tnm-painting-collection' || exhibition.id === 'tokyo-national-museum') collectionFile = 'nich-collection.json';
            else if (exhibition.id === 'kanazawa-collection' || exhibition.id === 'kanazawa-21st-century') collectionFile = 'kanazawa-all.json';
            // UK
            else if (exhibition.id === 'vam-permanent') collectionFile = 'vam-permanent-exhibitions.json';
            // Europe
            else if (exhibition.id === 'leopold-museum-collection' || exhibition.id === 'leopold-museum') collectionFile = 'leopold-museum-collection.json';
            else if (exhibition.id === 'mnk-collection' || exhibition.id === 'national-museum-krakow') collectionFile = 'mnk-collection.json';
            else if (exhibition.id === 'glyptoteket-collection' || exhibition.id === 'ny-carlsberg-glyptotek') collectionFile = 'glyptoteket-collection.json';
            else if (exhibition.id === 'skagens-collection' || exhibition.id === 'skagens-museum') collectionFile = 'skagens-collection.json';
            else if (exhibition.id === 'hirschsprung-perm' || exhibition.id === 'hirschsprung-collection') collectionFile = 'hirschsprung-collection.json';
            // France
            else if (exhibition.id === 'mad-collection' || exhibition.id === 'mad-paris' || exhibition.id === 'musee-arts-decoratifs') collectionFile = 'mad-paris-collection.json';
            // Italy
            else if (exhibition.id === 'napoli-collection' || exhibition.id === 'museo-archeologico-napoli') collectionFile = 'museo-archeologico-napoli-collection.json';
            // Canada
            else if (exhibition.id === 'mbam-collection' || exhibition.id === 'montreal-museum') collectionFile = 'mbam-collection.json';
          }

          if (!collectionFile) throw new Error('No collection file specified');

          console.log(`[Seogwipo] Loading ${collectionFile} for ${exhibition.id}`);

          const res = await fetch(`/data/${collectionFile}`, { cache: 'force-cache' });
          if (!res.ok) throw new Error(`Failed to load ${exhibition.name} artworks: ${res.status}`);
          const data = await res.json();
          const _itemsToMap = Array.isArray(data) ? data : (data.items || data.objects || data.data || data.artworks || []);
          const list: Artwork[] = _itemsToMap.map((item: any, idx: number) => {
            const aicLqip = typeof item?.thumbnail?.lqip === 'string' ? item.thumbnail.lqip : '';
            // Seogwipo thumbnail endpoints return 500 without a proper Referer.
            // wsrv.nl can fetch them successfully, but it expects the URL WITHOUT protocol.
            const rawImg = item.imageUrl || item.image || '';
            let img = rawImg;

            // Local dev helper: optionally serve AIC images from a local cache folder.
            // This avoids Cloudflare hotlink challenges during development.
            const isLocalHost = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
            if (isLocalHost && rawImg.includes('artic.edu/iiif/2/')) {
              const m = rawImg.match(/\/iiif\/2\/([^/]+)\//);
              const imageId = m?.[1] || '';
              if (imageId) {
                // If file doesn't exist, the <img> onError path will fall back to LQIP.
                img = `/aic-cache/${imageId}_900.jpg`;
              }
            } else if (rawImg.includes('artic.edu/iiif/2/')) {
              // AIC: prefer R2-mirrored images (sharp + reliable). Falls back via <img> onError.
              const r2Aic = buildAicR2Url(rawImg, 900);
              if (r2Aic) img = r2Aic;
            }
            if (img.includes('seogwipo.go.kr')) {
              const cleanUrl = img.replace(/^https?:\/\//, '');
              img = cleanUrl ? `https://wsrv.nl/?url=${cleanUrl}` : '';
            }
            // JMOA thumbnails can be hotlink-protected or flaky across environments.
            // Always proxy through wsrv.nl with explicit width/format.
            if (img.includes('onlinejmoa.or.kr/cmm/fms/getImage.do')) {
              img = getWeservUrl(img, 900, 80);
            }

            // Kim Tschang-Yeul museum images: also proxy (consistent caching + avoids occasional hotlink/CORS quirks).
            if (img.includes('kimtschang-yeul.jeju.go.kr/cmm/fms/getImage.do')) {
              img = getWeservUrl(img, 900, 80);
            }

            // Dumoak (dumoak.co.kr) is HTTP-only; proxy to HTTPS via wsrv to avoid mixed-content blocking.
            if (img.includes('dumoak.co.kr/')) {
              img = getWeservUrl(img, 900, 80);
            }

            // Long Museum (thelongmuseum.org) is HTTP-only, but proxies like allorigins timeout. Local/HTTP loading is most reliable.

            // AIC: prefer using embedded LQIP thumbnails for previews.
            // Avoid forcing proxying here (local dev often sees 403 via /aic-image).

            // Proxy MoMA (moma.org) to avoid potential Referer/hotlink issues
            if (img.includes('moma.org/media')) {
              img = getWeservUrl(img, 900, 80);
            }

            // Dictionary of Smithsonian ID checks
            const isSmithsonian = [
              'smithsonian-american-art-museum', 'saam-paintings',
              'smithsonian-asian-art', 'si-asian-art-collection',
              'smithsonian-national-portrait-gallery', 'si-npg-collection'
            ].includes(exhibition.id);

            if (isSmithsonian) {
              // Use native IDS resizing for better performance
              if (img.includes('ids.si.edu') && !img.includes('max=')) {
                img = img.includes('?') ? `${img}&max=1000` : `${img}?max=1000`;
              }
            }

            // NJMuseum: keep gallery image as-is, but use water/zoom image only for lightbox/zoom overlays.
            const isNJMuseum = exhibition.id === 'nanjing-museum' || exhibition.id === 'njmuseum-collection-all';
            const isShanghaiMuseum = exhibition.id === 'shanghai-museum' || exhibition.id === 'shanghaimuseum-paintings-all';
            const abs = (u: any) => ensureHttps(String(u || ''));
            const pickFromArray = (arr: any, pred: (s: string) => boolean) => {
              if (!Array.isArray(arr)) return '';
              const found = arr.map((x: any) => String(x || '')).find((s: string) => pred(s));
              return found ? abs(found) : '';
            };

            if (isSmithsonian) {
              return {
                id: item.id || `si-${idx}`,
                name: item.title || 'Untitled',
                artist: item.artist || 'Unknown',
                year: parseInt(String(item.date || '').match(/\d{4}/)?.[0] || '0'),
                date: item.date || '',
                image: img,
                sourceUrl: item.sourceUrl,
                medium: item.medium || '',
                dimension: item.dimensions || '',
                roomId: 'default',
                exhibitionName: exhibition.name,
                exhibitionTitle: (exhibition as any).permanentExhibitions?.[0]?.title || 'Collection Highlights',
                category: item.category || 'Painting',
                type: '2D',
                description: item.creditLine
              };
            }

            if (isNJMuseum) {
              const galleryImg = (
                pickFromArray(item.images, (s) => s.includes('/collection/modify/')) ||
                abs(item.imageUrl || item.image)
              );
              const lightboxImg = (
                pickFromArray(item.waterImages, (s) => !!s) ||
                pickFromArray(item.images, (s) => s.includes('/collection/water/')) ||
                (galleryImg ? galleryImg.replace('/collection/modify/', '/collection/water/') : '')
              );

              return {
                id: item.id || (item.detailUrl ? item.detailUrl.split('/').pop() : `${exhibition.id}-${idx}`),
                name: item.title || 'Untitled',
                artist: item.artist || 'Unknown',
                year: parseInt(String(item.date || '').match(/\d{4}/)?.[0] || '0'),
                date: item.date || '',
                image: galleryImg,
                // Lightbox-only high-res override (do not affect thumbnails)
                lightboxImage: lightboxImg && lightboxImg !== galleryImg ? lightboxImg : undefined,
                sourceUrl: item.url || item.detailUrl || item.sourceUrl,
                medium: item.medium || '',
                dimension: item.dimensions || '',
                roomId: 'default',
                exhibitionName: exhibition.name,
                exhibitionTitle: (exhibition as any).title || exhibition.name || 'Permanent Collection',
                category: item.category || (item.medium?.includes('캔버스') || item.medium?.includes('종이') ? 'Painting' : 'Artwork'),
                type: '2D',
                description: item.description
              } as any;
            }

            if (exhibition.id === 'saam-paintings' || exhibition.id === 'smithsonian-american-art-museum') collectionFile = 'saam-paintings-full.json';

            if (isShanghaiMuseum) {
              const galleryImg = abs(item.imageUrl || item.image);
              const lightboxImg = pickFromArray(item.waterImages, (s) => !!s);

              return {
                id: item.id || (item.raw?.code ? `shanghaimuseum-${item.raw.code}` : `${exhibition.id}-${idx}`),
                name: item.title || 'Untitled',
                artist: item.artist || 'Unknown',
                year: parseInt(String(item.date || '').match(/\d{4}/)?.[0] || '0'),
                date: item.date || '',
                image: galleryImg,
                lightboxImage: lightboxImg && lightboxImg !== galleryImg ? lightboxImg : undefined,
                sourceUrl: item.url || item.detailUrl || item.sourceUrl,
                medium: item.medium || '',
                dimension: item.dimensions || '',
                roomId: 'default',
                exhibitionName: exhibition.name,
                exhibitionTitle: (exhibition as any).title || exhibition.name || 'Permanent Collection',
                category: item.category || 'Paintings',
                type: '2D',
                description: item.description
              } as any;
            }

            let fallbackImages: string[] | undefined = undefined;
            if (img.includes('d1hhug17qm51in.cloudfront.net') || img.includes('sfmoma.org')) {
              const base = img.replace(/-scaled-scaled\.jpg$/i, '.jpg').replace(/-scaled\.jpg$/i, '.jpg');
              fallbackImages = [
                base,
                base.replace(/\.jpg$/i, '-scaled.jpg'),
                img
              ].filter((v, i, a) => a.indexOf(v) === i && v !== img);
            } else if (rawImg.includes('artic.edu/iiif/2/')) {
              // AIC Fallback
              const base = 'https://www.artic.edu/iiif/2/';
              const rest = rawImg.slice(base.length);
              // Provide local proxy directly or raw IIIF scaled
              const proxyUrl = `/aic-image/${rest.replace(/\/full\/(\d+),\//, '/full/900,/')}`;
              const directHiRes = `https://www.artic.edu/iiif/2/${rest.replace(/\/full\/(\d+),\//, '/full/843,/')}`;
              fallbackImages = [proxyUrl, directHiRes, rawImg].filter(v => v !== img);
            }

            return {
              id: item.id || (item.detailUrl ? item.detailUrl.split('/').pop() : `${exhibition.id}-${idx}`),
              name: item.title || item.name || 'Untitled',
              artist: item.artist || 'Unknown',
              year: Number(item.year) || parseInt(String(item.date || '').match(/\d{4}/)?.[0] || '0'),
              date: item.date || (item.year ? String(item.year) : ''),
              image: img.includes('media.tepapa.govt.nz') ? img.replace(/\/full\/?$/, '/preview') : img, // ImageUrl from JSON
              fallbackImages: fallbackImages,
              lq: aicLqip || undefined,
              thumb: img.includes('media.tepapa.govt.nz') ? img.replace(/\/full\/?$/, '/preview') : (aicLqip || undefined),
              sourceUrl: (item.url || item.detailUrl || item.sourceUrl || '').replace('https://collections.tepapa.govt.nzhttps://data.tepapa.govt.nz/collection/', 'https://collections.tepapa.govt.nz/'),
              medium: item.medium || '',
              dimension: item.dimensions || '',
              roomId: item.roomId || 'default',
              exhibitionName: item.exhibitionName || exhibition.name,
              exhibitionTitle: (exhibition as any).title || exhibition.name || 'Permanent Collection',
              category: item.category || (item.medium?.includes('캔버스') || item.medium?.includes('종이') ? 'Painting' : 'Artwork'),
              type: inferArtworkType({ ...item, type: undefined }) || '2D',
              description: item.description,
              onView: item.onDisplay, // Ensure onView tracks the boolean value
              isOnView: item.onView,
              isOnDisplay: item.isOnDisplay,
              publicDomain: item.publicDomain,
              openContent: item.openContent,
            };
          });
          setArtworks(list.filter((a: any) => !!a.image));
          setInitialized(true);
        } catch (err) {
          console.error(`Failed to load ${exhibition.name} artworks:`, err);
          setInitialized(true);
        }
      })();
      return () => { };
    }

    // Ny Carlsberg Glyptotek
    if (exhibition.id === 'glyptoteket-collection') {
      (async () => {
        try {
          const res = await fetch('/data/glyptoteket-collection.json', { cache: 'force-cache' });
          if (!res.ok) throw new Error('Failed to load Glyptoteket artworks');
          const data = await res.json();
          const _itemsToMap = Array.isArray(data) ? data : (data.items || data.objects || data.data || data.artworks || []);
          const list: Artwork[] = _itemsToMap.map((item: any) => {
            return {
              id: item.id,
              name: item.title || 'Untitled',
              artist: item.artist || 'Unknown',
              year: parseInt(String(item.date || '').match(/\d{4}/)?.[0] || '0'),
              date: item.date,
              image: item.image,
              sourceUrl: item.sourceUrl,
              medium: item.medium || '',
              dimension: item.dimensions || '',
              roomId: 'default',
              exhibitionName: exhibition.name,
              exhibitionTitle: exhibition.title,
              category: item.type || 'Fine Arts',
              type: '2D'
            };
          });
          setArtworks(list.filter(a => !!a.image));
          setInitialized(true);
        } catch (err) {
          console.error('Failed to load Glyptoteket artworks:', err);
          setInitialized(true);
        }
      })();
      return () => { };
    }

    // ARoS Aarhus Kunstmuseum
    if (exhibition.id === 'aros-collection') {
      (async () => {
        try {
          const res = await fetch('/data/aros-collection.json', { cache: 'force-cache' });
          if (!res.ok) throw new Error('Failed to load ARoS artworks');
          const data = await res.json();
          const _itemsToMap = Array.isArray(data) ? data : (data.items || data.objects || data.data || data.artworks || []);
          const list: Artwork[] = _itemsToMap.map((item: any) => {
            return {
              id: item.id,
              name: item.title || 'Untitled',
              artist: item.artist || 'Unknown',
              year: parseInt(String(item.date || '').match(/\d{4}/)?.[0] || '0'),
              date: item.date,
              image: item.image,
              sourceUrl: item.sourceUrl,
              medium: item.medium || '',
              dimension: item.dimensions || '',
              roomId: 'default',
              exhibitionName: exhibition.name,
              exhibitionTitle: exhibition.title,
              category: item.category || 'Fine Arts',
              type: item.is3D ? '3D' : '2D'
            };
          });
          setArtworks(list.filter(a => !!a.image));
          setInitialized(true);
        } catch (err) {
          console.error('Failed to load ARoS artworks:', err);
          setInitialized(true);
        }
      })();
      return () => { };
    }
    // Louisiana Museum of Modern Art
    if (exhibition.id === 'louisiana-collection') {
      (async () => {
        try {
          const res = await fetch('/data/louisiana-test.json', { cache: 'force-cache' });
          if (!res.ok) throw new Error('Failed to load Louisiana artworks');
          const data = await res.json();
          const _itemsToMap = Array.isArray(data) ? data : (data.items || data.objects || data.data || data.artworks || []);
          const list: Artwork[] = _itemsToMap.map((item: any, idx: number) => {
            const parts = (item.title || '').split(' - ');
            const artist = parts.length > 1 ? parts[0].trim() : 'Unknown';
            const title = parts.length > 1 ? parts.slice(1).join(' - ').trim() : item.title || 'Untitled';
            return {
              id: `louisiana-${item.id || idx}`,
              name: title,
              artist: artist,
              year: 0,
              date: '',
              image: item.image,
              sourceUrl: item.image,
              medium: '',
              dimension: '',
              roomId: 'default',
              exhibitionName: exhibition.name,
              exhibitionTitle: exhibition.title,
              category: 'Modern Art',
              type: '2D'
            };
          });
          setArtworks(list.filter(a => !!a.image));
          setInitialized(true);
        } catch (err) {
          console.error('Failed to load Louisiana artworks:', err);
          setInitialized(true);
        }
      })();
      return () => { };
    }
    // Tate St Ives
    if (exhibition.id === 'tate-st-ives-artworks') {
      (async () => {
        try {
          const res = await fetch('/data/tate-st-ives-artworks.json', { cache: 'force-cache' });
          if (!res.ok) throw new Error('Failed to load Tate St Ives artworks');
          const data = await res.json();
          const _itemsToMap = Array.isArray(data) ? data : (data.items || data.objects || data.data || data.artworks || []);
          const list: Artwork[] = _itemsToMap.map((item: any, idx: number) => ({
            id: item.id || `ts-${idx}`,
            name: item.title,
            artist: item.artist,
            year: parseInt(String(item.date || '').match(/\d{4}/)?.[0] || '0'),
            date: item.date,
            image: item.image,
            sourceUrl: item.url,
            roomId: 'default',
            exhibitionName: exhibition.name,
            exhibitionTitle: exhibition.title,
            category: 'Artwork',
            type: '2D'
          }));
          setArtworks(list.filter(a => !!a.image));
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
          const res = await fetch('/data/tate-britain-artworks.json', { cache: 'force-cache' });
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
          const isTateFeed = exhibition.id.startsWith('tm-') || exhibition.id.startsWith('tbc-') || exhibition.id.startsWith('tsi-');
          const withImages = isTateFeed ? list : list.filter((a) => !!a.image);
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
          const res = await fetch('/data/khm-collection.json', { cache: 'force-cache' });
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

          const isTateFeed = exhibition.id.startsWith('tm-') || exhibition.id.startsWith('tbc-') || exhibition.id.startsWith('tsi-');
          const withImages = isTateFeed ? list : list.filter((a) => !!a.image);
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
          const res = await fetch('/data/belvedere-collection.json', { cache: 'force-cache' });
          if (!res.ok) throw new Error('Failed to load Belvedere artworks');
          const data = await res.json();

          const items = Array.isArray(data) ? data : (Array.isArray(data.artworks) ? data.artworks : []);
          const list: Artwork[] = items.map((item: any, idx: number) => ({
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
            }));

          const isTateFeed = exhibition.id.startsWith('tm-') || exhibition.id.startsWith('tbc-') || exhibition.id.startsWith('tsi-');
          const withImages = isTateFeed ? list : list.filter((a) => !!a.image);
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
      exhibition.id === 'albertina-poster-100' || exhibition.id === 'albertina-permanent-collection'
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
            'albertina-permanent-collection': '/data/albertina-permanent-collection.json',
          };
          const jsonFile = jsonMap[exhibition.id];
          if (!jsonFile) throw new Error('Unknown Albertina dataset id');

          const res = await fetch(jsonFile, { cache: 'force-cache' });
          if (!res.ok) throw new Error(`Failed to load ${jsonFile} `);
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
            let category = item.category || '';
            let type: '2D' | '3D' = '2D';

            if (!category) {
              if (exhibition.id.includes('paintings')) category = 'Painting';
              else if (exhibition.id.includes('sculptures')) { category = 'Sculpture'; type = '3D'; }
              else if (exhibition.id.includes('drawings')) category = 'Drawing & Print';
              else if (exhibition.id.includes('photography')) category = 'Photography';
              else if (exhibition.id.includes('objects')) { category = 'Object / Media Art'; type = '3D'; }
              else if (exhibition.id.includes('poster')) category = 'Poster';
            } else {
              if (category === 'Sculptures' || category.includes('Objects')) type = '3D';
            }

            return {
              id: item.sourceId || item.id || `${exhibition.id} -${idx} `,
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

          const isTateFeed = exhibition.id.startsWith('tm-') || exhibition.id.startsWith('tbc-') || exhibition.id.startsWith('tsi-');
          const withImages = isTateFeed ? list : list.filter((a) => !!a.image);
          setArtworks(withImages);
          setInitialized(true);
          try {
            localStorage.setItem(`artworks_${exhibition.id} `, JSON.stringify(withImages));
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
          let res = await fetch('/data/leopold-museum-collection.json', { cache: 'force-cache' });
          if (!res.ok) {
            res = await fetch('/data/leopold-museum-collection-test.json', { cache: 'force-cache' });
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

          const isTateFeed = exhibition.id.startsWith('tm-') || exhibition.id.startsWith('tbc-') || exhibition.id.startsWith('tsi-');
          const withImages = isTateFeed ? list : list.filter((a) => !!a.image);
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
          const res = await fetch('/data/mmca-collection.json', { cache: 'force-cache' });
          if (!res.ok) throw new Error('Failed to load MMCA artworks');
          const data = await res.json();
          const toYear = (yearText: string | number | undefined) => {
            if (!yearText) return 0;
            const match = String(yearText).match(/(\d{4})/);
            return match ? parseInt(match[1], 10) : 0;
          };

          const list: Artwork[] = Array.isArray(data.objects)
            ? data.objects.map((item: any, idx: number) => {
              const cat = (item.category || '').toLowerCase();
              // Infer 2D vs 3D based on category or medium
              let type: '2D' | '3D' = '2D';
              if (/sculpture|조각|installation|설치|craft|공예|object|오브제/.test(cat)) {
                type = '3D';
              }

              return {
                id: item.id || `mmca-${idx}`,
                name: item.title || item.name || 'Untitled',
                artist: item.artist || 'Unknown',
                year: toYear(item.year || item.date),
                date: item.date || '',
                image: item.image || '',
                sourceUrl: item.detailUrl || item.sourceUrl || '',
                roomId: 'default',
                exhibitionName: exhibition.name,
                exhibitionTitle: 'MMCA Collection',
                description: item.description || '',
                medium: item.medium || '',
                dimension: item.dimensions || '',
                category: item.category || '',
                onView: item.ondisplay === true,
                type: type,
              };
            })
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
          const res = await fetch('/data/seoul-museum-of-art-collection.json', { cache: 'force-cache' });
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
          const isTateFeed = exhibition.id.startsWith('tm-') || exhibition.id.startsWith('tbc-') || exhibition.id.startsWith('tsi-');
          const withImages = isTateFeed ? list : list.filter((a) => !!a.image);
          setArtworks(withImages);
          setInitialized(true);
        } catch (error) {
          console.error('Failed to load Seoul Museum of Art artworks:', error);
          setInitialized(true);
        }
      })();
      return () => { };
    }

    // National Museum of Korea Collection: load from single JSON file (filtered paintings only)
    if (exhibition.id === 'nmk-collection') {
      (async () => {
        try {
          // Load single filtered file (~4,137 paintings)
          const response = await fetch('/data/national-museum-korea.json', { cache: 'force-cache' });
          if (!response.ok) throw new Error('Failed to load NMK data');
          const data = await response.json();

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
            type: MATERIAL_TO_TYPE[item.material] || '2D',  // Default to 2D for paintings
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

    // Korean Regional Museums: Jeonju, Gwangju, Folk, Busan - load from single JSON file
    const KOREAN_MUSEUM_CONFIG: Record<string, { file: string; title: string }> = {
      'jeonju-collection': { file: 'jeonju-museum.json', title: 'Jeonju National Museum Collection' },
      'gwangju-collection': { file: 'gwangju-museum.json', title: 'Gwangju National Museum Collection' },
      'folk-collection': { file: 'folk-museum.json', title: 'National Folk Museum Collection' },
      'busan-collection': { file: 'busan-museum.json', title: 'Busan Museum Collection' },
    };

    if (KOREAN_MUSEUM_CONFIG[exhibition.id]) {
      const config = KOREAN_MUSEUM_CONFIG[exhibition.id];
      (async () => {
        try {
          const response = await fetch(`/data/${config.file}`, { cache: 'force-cache' });
          if (!response.ok) throw new Error(`Failed to load ${config.file}`);
          const data = await response.json();

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

          const initialBatch = data.slice(0, ITEMS_PER_PAGE);
          const list: Artwork[] = initialBatch.map((item: any, idx: number) => ({
            id: item.id || `${exhibition.id}-${idx}`,
            name: item.title || item.name || 'Untitled',
            artist: item.artist || 'Unknown',
            year: toYear(item.year || item.date, item.period),
            date: item.period ? formatPeriodWithDates(item.period) : (item.date || ''),
            image: ensureHttps(item.imageUrl || item.thumbnailUrl || item.image || ''),
            sourceUrl: item.sourceUrl || '',
            roomId: 'default',
            exhibitionName: exhibition.name,
            exhibitionTitle: config.title,
            description: item.description || '',
            medium: item.material || item.medium || '',
            category: item.material || '',
            subcategory: item.category || '',
            excavationSite: item.excavationSite || '',
            type: MATERIAL_TO_TYPE[item.material] || '2D',
          }));
          setArtworks(list);
          (window as any).__nmkFullData = data;
          setInitialized(true);
        } catch (error) {
          console.error(`Failed to load ${config.file}:`, error);
          setInitialized(true);
        }
      })();
      return () => { };
    }

    // Museo Reina Sofía Collection: load from single JSON file
    if (exhibition.id === 'reina-sofia-collection') {
      (async () => {
        try {
          // Load single part directly
          const r = await fetch(`/data/reina-sofia-collection.json`, { cache: 'force-cache' });
          if (!r.ok) throw new Error(`Failed to load reina-sofia-collection.json`);
          const data = await r.json();

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
            roomId: String(item.room || '').trim() || 'Unlabeled Room',
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
          const res = await fetch('/data/museothyssen-collection-41.full.json', { cache: 'force-cache' });
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
              const roomId = roomName || (item?.roomNumber != null ? `Sala ${item.roomNumber} ` : 'default');
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

          const isTateFeed = exhibition.id.startsWith('tm-') || exhibition.id.startsWith('tbc-') || exhibition.id.startsWith('tsi-');
          const withImages = isTateFeed ? list : list.filter((a) => !!a.image);
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
          const res = await fetch('/data/dulwich-collection.json', { cache: 'force-cache' });
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
              type: detectType(item.title || '' + (item.materials || '')),
              dimension: item.dimensions || '',
              medium: item.materials || '',
              category: item.category || '',
              onView: item.ondisplay !== undefined ? item.ondisplay : !!item.room,
            }))
            : [];
          const isTateFeed = exhibition.id.startsWith('tm-') || exhibition.id.startsWith('tbc-') || exhibition.id.startsWith('tsi-');
          const withImages = isTateFeed ? list : list.filter((a) => !!a.image);
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
          const res = await fetch('/data/hayward-gallery-collection.json', { cache: 'force-cache' });
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
            image: getOptimizedImageUrl(item.image),
            sourceUrl: item.url,
            roomId: 'default',
            exhibitionName: exhibition.name,
            exhibitionTitle: exhibition.title,
            isArchival: isArchival(item.title || ''),
            type: detectType(item.title || ''),
          }));
          const isTateFeed = exhibition.id.startsWith('tm-') || exhibition.id.startsWith('tbc-') || exhibition.id.startsWith('tsi-');
          const withImages = isTateFeed ? list : list.filter((a) => !!a.image);
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
          const res = await fetch('/data/royal-academy-collection.json', { cache: 'force-cache' });
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
            image: getOptimizedImageUrl(item.image),
            sourceUrl: item.sourceUrl,
            roomId: 'default',
            exhibitionName: exhibition.name,
            exhibitionTitle: exhibition.title,
            isArchival: isArchival(item.title || ''),
            type: detectType(item.title || ''),
            youtubeId: item.youtubeId,
            mediaType: item.mediaType,
          }));
          const isTateFeed = exhibition.id.startsWith('tm-') || exhibition.id.startsWith('tbc-') || exhibition.id.startsWith('tsi-');
          const withImages = isTateFeed ? list : list.filter((a) => !!a.image);
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
    if (exhibition.id === 'serp-collection' || exhibition.id === 'serpentine-gallery') {
      (async () => {
        try {
          const res = await fetch('/data/serpentine-gallery-collection.json', { cache: 'force-cache' });
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
            image: getOptimizedImageUrl(item.image),
            sourceUrl: item.sourceUrl,
            roomId: 'default',
            exhibitionName: exhibition.name,
            exhibitionTitle: exhibition.title,
            isArchival: isArchival(item.title || '', item.artist || ''),
            type: detectType(item.title || ''),
            youtubeId: item.youtubeId,
            mediaType: item.mediaType,
          }));
          const isTateFeed = exhibition.id.startsWith('tm-') || exhibition.id.startsWith('tbc-') || exhibition.id.startsWith('tsi-');
          const withImages = isTateFeed ? list : list.filter((a) => !!a.image);
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
          const res = await fetch('/data/courtauld-gallery-collection.json', { cache: 'force-cache' });
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
          const isTateFeed = exhibition.id.startsWith('tm-') || exhibition.id.startsWith('tbc-') || exhibition.id.startsWith('tsi-');
          const withImages = isTateFeed ? list : list.filter((a) => !!a.image);
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
          const res = await fetch('/data/walker-art-gallery-collection.json', { cache: 'force-cache' });
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
          const isTateFeed = exhibition.id.startsWith('tm-') || exhibition.id.startsWith('tbc-') || exhibition.id.startsWith('tsi-');
          const withImages = isTateFeed ? list : list.filter((a) => !!a.image);
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
          const res = await fetch('/data/scottish-national-gallery-collection.json', { cache: 'force-cache' });
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
            name: item.itemTitle || item.title || item.name || 'Untitled',
            artist: item.artist || 'Unknown',
            year: toYear(item.year),
            date: item.year,
            image: item.image,
            sourceUrl: item.source ? `https://commons.wikimedia.org/wiki/${item.source}` : item.sourceUrl,
            roomId: 'default',
            dimension: item.dimensions,
            medium: item.medium,
            category: item.category || (item.categories && item.categories[0]),
            exhibitionName: exhibition.name,
            exhibitionTitle: exhibition.title,
            type: '2D',
          }));
          const isTateFeed = exhibition.id.startsWith('tm-') || exhibition.id.startsWith('tbc-') || exhibition.id.startsWith('tsi-');
          const withImages = isTateFeed ? list : list.filter((a) => !!a.image);
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
          const res = await fetch('/data/scottish-national-portrait-gallery-collection.json', { cache: 'force-cache' });
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
            name: item.itemTitle || item.title || item.name || 'Untitled',
            artist: item.artist || 'Unknown',
            year: toYear(item.year),
            date: item.year,
            image: item.image,
            sourceUrl: item.source ? `https://commons.wikimedia.org/wiki/${item.source}` : item.sourceUrl,
            roomId: 'default',
            dimension: item.dimensions,
            medium: item.medium,
            category: item.category || (item.categories && item.categories[0]),
            exhibitionName: exhibition.name,
            exhibitionTitle: exhibition.title,
            type: '2D',
          }));
          const isTateFeed = exhibition.id.startsWith('tm-') || exhibition.id.startsWith('tbc-') || exhibition.id.startsWith('tsi-');
          const withImages = isTateFeed ? list : list.filter((a) => !!a.image);
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
          const res = await fetch('/data/scottish-national-gallery-of-modern-art-collection.json', { cache: 'force-cache' });
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
            name: item.itemTitle || item.title || item.name || 'Untitled',
            artist: item.artist || 'Unknown',
            year: toYear(item.year),
            date: item.year,
            image: item.image,
            sourceUrl: item.source ? `https://commons.wikimedia.org/wiki/${item.source}` : item.sourceUrl,
            roomId: 'default',
            dimension: item.dimensions,
            medium: item.medium,
            category: item.category || (item.categories && item.categories[0]),
            exhibitionName: exhibition.name,
            exhibitionTitle: exhibition.title,
            type: '2D',
          }));
          const isTateFeed = exhibition.id.startsWith('tm-') || exhibition.id.startsWith('tbc-') || exhibition.id.startsWith('tsi-');
          const withImages = isTateFeed ? list : list.filter((a) => !!a.image);
          setArtworks(withImages);
          setInitialized(true);
        } catch (error) {
          console.error('Failed to load Scottish National Gallery of Modern Art artworks:', error);
          setInitialized(true);
        }
      })();
      return () => { };
    }
    // National Portrait Gallery London Collection: load from local scraped JSON
    if (exhibition.id === 'npg-london-collection') {
      (async () => {
        try {
          const res = await fetch('/data/national-portrait-gallery-london-collection.json', { cache: 'force-cache' });
          if (!res.ok) throw new Error('Failed to load National Portrait Gallery artworks');
          const data = await res.json();
          const toYear = (yearText: string | number | undefined) => {
            if (!yearText) return 0;
            const match = String(yearText).match(/(\d{4})/);
            return match ? parseInt(match[1], 10) : 0;
          };
          const allObjects = Array.isArray(data.objects) ? data.objects : [];
          const list: Artwork[] = allObjects.map((item: any, idx: number) => ({
            id: item.id || `npg-london-${idx}`,
            name: item.itemTitle || item.title || item.name || 'Untitled',
            artist: item.artist || 'Unknown',
            year: toYear(item.year),
            date: item.year,
            image: getOptimizedImageUrl(item.image),
            sourceUrl: item.source ? `https://commons.wikimedia.org/wiki/${item.source}` : item.sourceUrl,
            roomId: 'default',
            dimension: item.dimensions,
            medium: item.medium,
            category: item.category || (item.categories && item.categories[0]),
            exhibitionName: exhibition.name,
            exhibitionTitle: exhibition.title,
            type: '2D',
          }));
          const isTateFeed = exhibition.id.startsWith('tm-') || exhibition.id.startsWith('tbc-') || exhibition.id.startsWith('tsi-');
          const withImages = isTateFeed ? list : list.filter((a) => !!a.image);
          setArtworks(withImages);
          setInitialized(true);
        } catch (error) {
          console.error('Failed to load National Portrait Gallery artworks:', error);
          setInitialized(true);
        }
      })();
      return () => { };
    }
    // Today Art Museum
    if (exhibition.id === 'today-art-museum-collection') {
      (async () => {
        try {
          const res = await fetch('/data/today-art-museum.json', { cache: 'force-cache' });
          if (!res.ok) throw new Error('Failed to load Today Art Museum artworks');
          const data = await res.json();

          const clean = (s: string) => (s || '').replace(/[\n\r]+/g, ' ').replace(/\s+/g, ' ').trim();

          const _itemsToMap = Array.isArray(data) ? data : (data.items || data.objects || data.data || data.artworks || []);
          const list: Artwork[] = _itemsToMap.map((item: any, idx: number) => {
            // Clean title: take only the first line or up to "Artist:"
            let name = item.title || 'Untitled';
            if (name.includes('\n')) name = name.split('\n')[0];
            if (name.includes('Artist:')) name = name.split('Artist:')[0];
            name = clean(name);

            // Clean artist: take up to "Form:" or newline
            let artist = item.artist || 'Unknown';
            if (artist.includes('Artist:')) artist = artist.split('Artist:')[1];
            if (artist.includes('\n')) artist = artist.split('\n')[0];
            if (artist.includes('Form:')) artist = artist.split('Form:')[0];
            artist = clean(artist);

            const year = parseInt((item.year || '').replace(/[^0-9]/g, '').substring(0, 4), 10) || 0;

            return {
              id: item.id || `tam-${idx}`,
              name: name,
              artist: artist,
              image: item.image,
              year: year,
              date: item.year || '',
              medium: clean(item.medium),
              dimension: clean(item.dimensions),
              roomId: 'default',
              exhibitionName: exhibition.name,
              exhibitionTitle: exhibition.title,
              category: item.category || 'Artwork',
              type: '2D', // Mostly paintings/photography
              sourceUrl: item.sourceUrl
            };
          });

          setArtworks(list.filter(a => !!a.image));
          setInitialized(true);
        } catch (error) {
          console.error('Failed to load TAM artworks', error);
          setInitialized(true);
        }
      })();
      return () => { };
    }
    // Today Art Museum loading block REMOVED (or not present).
    // I will act on generate-search-index.cjs instead.
    if (exhibition.id === 'bm-collection') {
      (async () => {
        try {
          const res = await fetch('/data/the-british-museum-collection.json', { cache: 'force-cache' });
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
          const isTateFeed = exhibition.id.startsWith('tm-') || exhibition.id.startsWith('tbc-') || exhibition.id.startsWith('tsi-');
          const withImages = isTateFeed ? list : list.filter((a) => !!a.image);
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
          const res = await fetch('/data/orsay-collection.json', { cache: 'force-cache' });
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
          const isTateFeed = exhibition.id.startsWith('tm-') || exhibition.id.startsWith('tbc-') || exhibition.id.startsWith('tsi-');
          const withImages = isTateFeed ? list : list.filter((a) => !!a.image);
          setArtworks(withImages);
          setInitialized(true);
        } catch (error) {
          console.error('Failed to load Orsay artworks:', error);
          setInitialized(true);
        }
      })();
      return () => { };
    }

    // Acropolis Museum Collection
    if (exhibition.id === 'acropolis-highlights' || exhibition.id === 'acropolis-museum') {
      (async () => {
        try {
          const res = await fetch('/data/acropolis-museum-collection.json', { cache: 'force-cache' });
          if (!res.ok) throw new Error('Failed to load Acropolis Museum artworks');
          const data = await res.json();

          // Current scraper saves array directly
          const allObjects = Array.isArray(data) ? data : (data.objects || []);

          const toYear = (yearText: string | number | undefined) => {
            if (!yearText) return 0;
            const match = String(yearText).match(/(\d{4})/);
            return match ? parseInt(match[1], 10) : 0;
          };

          const list: Artwork[] = allObjects.map((item: any, idx: number) => ({
            id: item.id || `acropolis-${idx}`,
            name: item.title || 'Untitled',
            artist: item.artist || 'Unknown',
            year: toYear(item.year || item.metadata?.Date),
            date: item.year ? String(item.year) : (item.metadata?.Date || ''),
            image: item.image,
            description: item.description,
            medium: item.metadata?.Material,
            dimension: item.metadata?.Dimensions,
            category: item.metadata?.Category || 'Artifact',
            roomId: 'default',
            exhibitionName: exhibition.name,
            exhibitionTitle: exhibition.title,
            type: '3D', // Acropolis is mostly sculptures/artifacts
          }));
          const isTateFeed = exhibition.id.startsWith('tm-') || exhibition.id.startsWith('tbc-') || exhibition.id.startsWith('tsi-');
          const withImages = isTateFeed ? list : list.filter((a) => !!a.image);
          setArtworks(withImages);
          setInitialized(true);
        } catch (error) {
          console.error('Failed to load Acropolis Museum artworks:', error);
          setInitialized(true);
        }
      })();
      return () => { };
    }

    // National Gallery Prague
    if (exhibition.id === 'ngprague-collection') {
      (async () => {
        try {
          const res = await fetch('/data/ngprague-collection.json', { cache: 'force-cache' });
          if (!res.ok) throw new Error('Failed to load NG Prague artworks');
          const data = await res.json();

          const _itemsToMap = Array.isArray(data) ? data : (data.items || data.objects || data.data || data.artworks || []);
          const list: Artwork[] = _itemsToMap.map((item: any, idx: number) => ({
            id: item.id || `ngprague-${idx}`,
            name: item.title,
            artist: item.artist,
            year: parseInt(String(item.year || '').match(/\d{4}/)?.[0] || '0'),
            date: item.year || item.metadata?.date || '',
            image: item.image,
            medium: item.medium, // Now correctly populated with technique
            dimension: item.dimensions,
            description: item.metadata?.description || '',
            roomId: 'default',
            exhibitionName: exhibition.name,
            exhibitionTitle: exhibition.title,
            category: 'Artwork',
            type: '2D'
          }));

          setArtworks(list.filter(a => !!a.image));
          setInitialized(true);
        } catch (error) {
          console.error('Failed to load NG Prague artworks:', error);
          setInitialized(true);
        }
      })();
      return () => { };
    }

    // Musée Matisse Nice
    if (exhibition.id === 'matisse-nice-collection') {
      (async () => {
        try {
          const res = await fetch('/data/matisse-nice-collection.json', { cache: 'force-cache' });
          if (!res.ok) throw new Error('Failed to load Matisse artworks');
          const data = await res.json();

          const _itemsToMap = Array.isArray(data) ? data : (data.items || data.objects || data.data || data.artworks || []);
          const list: Artwork[] = _itemsToMap.map((item: any, idx: number) => ({
            id: item.id || `matisse-${idx}`,
            name: item.title,
            artist: item.artist,
            year: parseInt(String(item.year || '').match(/\d{4}/)?.[0] || '0'),
            date: item.year || '',
            image: item.image,
            medium: item.medium,
            dimension: item.dimensions,
            description: '', // Could use item.metadata?.notes if I scraped it separately
            roomId: 'default',
            exhibitionName: exhibition.name,
            exhibitionTitle: exhibition.title,
            category: item.category || 'Artwork',
            type: (item.category && item.category.toLowerCase().includes('sculpture')) ? '3D' : '2D'
          }));

          setArtworks(list.filter(a => !!a.image));
          setInitialized(true);
        } catch (error) {
          console.error('Failed to load Matisse artworks:', error);
          setInitialized(true);
        }
      })();
      return () => { };
    }

    // Munchmuseet
    if (exhibition.id === 'munch-collection') {
      (async () => {
        try {
          const res = await fetch('/data/munch-collection.json', { cache: 'force-cache' });
          if (!res.ok) throw new Error('Failed to load Munch artworks');
          const data = await res.json();

          const _itemsToMap = Array.isArray(data) ? data : (data.items || data.objects || data.data || data.artworks || []);
          const list: Artwork[] = _itemsToMap.map((item: any, idx: number) => ({
            id: item.id || `munch-${idx}`,
            name: item.title,
            artist: item.artist,
            year: parseInt(String(item.year || '').match(/\d{4}/)?.[0] || '0'),
            date: item.year || '',
            image: item.image,
            medium: item.medium,
            dimension: item.dimensions,
            description: '',
            roomId: 'default',
            exhibitionName: exhibition.name,
            exhibitionTitle: exhibition.title,
            category: item.category || 'Painting',
            type: item.type || '2D'
          }));

          setArtworks(list.filter(a => !!a.image));
          setInitialized(true);
        } catch (error) {
          console.error('Failed to load Munch artworks:', error);
          setInitialized(true);
        }
      })();
      return () => { };
    }

    // SMK – Statens Museum for Kunst (Denmark's National Gallery)
    if (exhibition.id === 'smk-collection') {
      (async () => {
        try {
          const res = await fetch('/data/smk-collection.json', { cache: 'force-cache' });
          if (!res.ok) throw new Error('Failed to load SMK artworks');
          const data = await res.json();

          const _itemsToMap = Array.isArray(data) ? data : (data.items || data.objects || data.data || data.artworks || []);
          const list: Artwork[] = _itemsToMap.map((item: any, idx: number) => ({
            id: item.id || `smk-${idx}`,
            name: item.title || 'Untitled',
            artist: item.artist || 'Unknown',
            year: item.year || 0,
            date: item.date || '',
            image: item.image,
            sourceUrl: item.url,
            medium: item.medium || '',
            dimension: item.dimensions || '',
            description: '',
            roomId: 'default',
            exhibitionName: exhibition.name,
            exhibitionTitle: exhibition.title,
            category: item.category || 'Painting',
            type: item.type || '2D',
            onView: item.onDisplay || false,
            publicDomain: item.publicDomain || false,
            rights: item.rights || ''
          }));

          setArtworks(list.filter(a => !!a.image));
          setInitialized(true);
        } catch (error) {
          console.error('Failed to load SMK artworks:', error);
          setInitialized(true);
        }
      })();
      return () => { };
    }

    // Ateneum Art Museum (Finland)
    if (exhibition.id === 'ateneum-collection') {
      (async () => {
        try {
          const res = await fetch('/data/ateneum-collection.json', { cache: 'force-cache' });
          if (!res.ok) throw new Error('Failed to load Ateneum artworks');
          const data = await res.json();

          const _itemsToMap = Array.isArray(data) ? data : (data.items || data.objects || data.data || data.artworks || []);
          const list: Artwork[] = _itemsToMap.map((item: any, idx: number) => ({
            id: item.id || `ateneum-${idx}`,
            name: item.title || 'Untitled',
            artist: item.artist || 'Unknown',
            year: item.year || 0,
            date: item.date || '',
            image: item.image,
            sourceUrl: item.url,
            medium: item.medium || '',
            dimension: item.dimensions || '',
            description: '',
            roomId: 'default',
            exhibitionName: exhibition.name,
            exhibitionTitle: exhibition.title,
            category: item.category || 'Painting',
            type: item.type || '2D',
            onView: item.onDisplay || false,
            publicDomain: item.publicDomain || false,
            rights: item.rights || ''
          }));

          setArtworks(list.filter(a => !!a.image));
          setInitialized(true);
        } catch (error) {
          console.error('Failed to load Ateneum artworks:', error);
          setInitialized(true);
        }
      })();
      return () => { };
    }

    // Kiasma (FNG)
    if (exhibition.id === 'kiasma-collection') {
      (async () => {
        try {
          const res = await fetch('/data/kiasma-collection.json', { cache: 'force-cache' });
          if (!res.ok) throw new Error('Failed to load Kiasma artworks');
          const data = await res.json();

          const _itemsToMap = Array.isArray(data) ? data : (data.items || data.objects || data.data || data.artworks || []);
          const list: Artwork[] = _itemsToMap.map((item: any, idx: number) => ({
            id: item.id || `kiasma-${idx}`,
            name: item.title || 'Untitled',
            artist: item.artist || 'Unknown',
            year: item.year || 0,
            date: item.date || '',
            image: item.image,
            sourceUrl: item.url,
            medium: item.medium || '',
            dimension: item.dimensions || '',
            description: '',
            roomId: 'default',
            exhibitionName: exhibition.name,
            exhibitionTitle: exhibition.title,
            category: item.category || 'Painting',
            type: item.type || '2D',
            onView: item.onDisplay || false,
            publicDomain: item.publicDomain || false,
            rights: item.rights || ''
          }));

          setArtworks(list.filter(a => !!a.image));
          setInitialized(true);
        } catch (error) {
          console.error('Failed to load Kiasma artworks:', error);
          setInitialized(true);
        }
      })();
      return () => { };
    }

    // Sinebrychoff (FNG)
    if (exhibition.id === 'sinebrychoff-collection') {
      (async () => {
        try {
          const res = await fetch('/data/sinebrychoff-collection.json', { cache: 'force-cache' });
          if (!res.ok) throw new Error('Failed to load Sinebrychoff artworks');
          const data = await res.json();

          const _itemsToMap = Array.isArray(data) ? data : (data.items || data.objects || data.data || data.artworks || []);
          const list: Artwork[] = _itemsToMap.map((item: any, idx: number) => ({
            id: item.id || `sinebrychoff-${idx}`,
            name: item.title || 'Untitled',
            artist: item.artist || 'Unknown',
            year: item.year || 0,
            date: item.date || '',
            image: item.image,
            sourceUrl: item.url,
            medium: item.medium || '',
            dimension: item.dimensions || '',
            description: '',
            roomId: 'default',
            exhibitionName: exhibition.name,
            exhibitionTitle: exhibition.title,
            category: item.category || 'Painting',
            type: item.type || '2D',
            onView: item.onDisplay || false,
            publicDomain: item.publicDomain || false,
            rights: item.rights || ''
          }));

          setArtworks(list.filter(a => !!a.image));
          setInitialized(true);
        } catch (error) {
          console.error('Failed to load Sinebrychoff artworks:', error);
          setInitialized(true);
        }
      })();
      return () => { };
    }

    // Brücke-Museum (Berlin)
    if (exhibition.id === 'bruecke-collection') {
      (async () => {
        try {
          const res = await fetch('/data/bruecke-museum-collection.json', { cache: 'force-cache' });
          if (!res.ok) throw new Error('Failed to load Brücke artworks');
          const data = await res.json();

          const _itemsToMap = Array.isArray(data) ? data : (data.items || data.objects || data.data || data.artworks || []);
          const list: Artwork[] = _itemsToMap.map((item: any, idx: number) => {
            // Parse Year
            let year = 0;
            if (item.date) {
              const m = String(item.date).match(/(\d{4})/);
              if (m) year = parseInt(m[1], 10);
            }

            const cat = (item.category || '').toLowerCase();
            const med = (item.medium || '').toLowerCase();
            let type: '2D' | '3D' = '2D';
            if (cat.includes('skulptur') || cat.includes('plastik') || cat.includes('objekt') ||
              med.includes('skulptur') || med.includes('plastik')) {
              type = '3D';
            }

            return {
              id: item.id || `bruecke-${idx}`,
              name: item.title || 'Untitled',
              artist: item.artist || 'Unknown',
              year,
              date: item.date || '',
              image: item.imageUrl || item.thumbnailUrl || '',
              medium: item.medium,
              dimension: item.dimensions,
              description: item.description || '',
              roomId: 'default',
              exhibitionName: exhibition.name,
              exhibitionTitle: exhibition.title,
              category: item.category || 'Artwork',
              type,
              sourceUrl: `https://www.bruecke-museum.de/en/sammlung`
            };
          });

          setArtworks(list.filter(a => !!a.image));
          setInitialized(true);
        } catch (error) {
          console.error('Failed to load Brücke artworks:', error);
          setInitialized(true);
        }
      })();
      return () => { };
    }

    // Musée de l'Orangerie Collection: load from local scraped JSON
    if (exhibition.id === 'orangerie-collection') {
      (async () => {
        try {
          const res = await fetch('/data/orangerie-collection.json', { cache: 'force-cache' });
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
          const isTateFeed = exhibition.id.startsWith('tm-') || exhibition.id.startsWith('tbc-') || exhibition.id.startsWith('tsi-');
          const withImages = isTateFeed ? list : list.filter((a) => !!a.image);
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
          const res = await fetch('/data/pinault-collection.json', { cache: 'force-cache' });
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
          const isTateFeed = exhibition.id.startsWith('tm-') || exhibition.id.startsWith('tbc-') || exhibition.id.startsWith('tsi-');
          const withImages = isTateFeed ? list : list.filter((a) => !!a.image);
          setArtworks(withImages);
          setInitialized(true);
        } catch (error) {
          console.error('Failed to load Pinault artworks:', error);
          setInitialized(true);
        }
      })();
      return () => { };
    }
    // Centre Pompidou & MAM Paris & Louvre & Jacquemart-André & Marmottan & Picasso & Palais de Tokyo & Petit Palais & Rouen & Lille & MAMCS & Lyon & Grenoble & Bordeaux & Rodin & FLV & MAD Paris & Carnavalet & Condé & Versailles & Guimet & MAC/VAL & Mucem & Fabre & Chagall & La Piscine & Wallace & Soane & Vatican & Wales & Uffizi & Accademia & Palazzo Ducale & Doria Pamphilj & State Russian Museum Collections & Guggenheim (Venice/NY): load from local scraped JSON
    if (exhibition.id === 'pompidou-cinema-collection' || exhibition.id === 'pompidou-painting-collection' || exhibition.id === 'pompidou-drawing-collection' || exhibition.id === 'pompidou-newmedia-collection' || exhibition.id === 'pompidou-design-collection' || exhibition.id === 'mam-perm-painting' || exhibition.id === 'mam-perm-photography' || exhibition.id === 'louvre-painting-collection' || exhibition.id === 'jacquemart-andre-collection' || exhibition.id === 'marmottan-collection' || exhibition.id === 'picasso-drawings-collection' || exhibition.id === 'picasso-paintings-collection' || exhibition.id === 'picasso-sculptures-collection' || exhibition.id === 'picasso-prints-collection' || exhibition.id === 'palais-de-tokyo-collection' || exhibition.id === 'petit-palais-collection' || exhibition.id === 'petit-palais-drawings' || exhibition.id === 'rouen-mba-collection' || exhibition.id === 'lille-pba-collection' || exhibition.id.startsWith('mamcs-strasbourg-') || exhibition.id === 'lyon-collection' || exhibition.id === 'grenoble-paintings' || exhibition.id === 'grenoble-drawings' || exhibition.id === 'grenoble-photography' || exhibition.id === 'bordeaux-paintings' || exhibition.id === 'bordeaux-drawings' || exhibition.id === 'toulouse-lautrec-collection' || exhibition.id === 'granet-collection' || exhibition.id === 'rodin-peintures' || exhibition.id === 'rodin-sculptures' || exhibition.id === 'rodin-gravures' || exhibition.id === 'flv-collection' || exhibition.id === 'mad-paris-collection' || exhibition.id === 'carnavalet-collection' || exhibition.id === 'carnavalet-paintings' || exhibition.id === 'carnavalet-prints' || exhibition.id === 'musee-armee-peinture' || exhibition.id === 'musee-armee-photographie' || exhibition.id === 'musee-armee-dessin' || exhibition.id === 'conde-paintings' || exhibition.id === 'conde-drawings' || exhibition.id === 'versailles-collection' || exhibition.id === 'guimet-collection' || exhibition.id === 'macval-collection' || exhibition.id === 'mucem-prints' || exhibition.id === 'mucem-drawings' || exhibition.id === 'mucem-collection' || exhibition.id === 'fabre-collection' || exhibition.id === 'chagall-collection' || exhibition.id === 'piscine-collection' || exhibition.id === 'wallace-permanent' || exhibition.id === 'soane-paintings' || exhibition.id === 'vatican-collection' || exhibition.id === 'museum-wales-art' || exhibition.id === 'museum-wales-industry' || exhibition.id === 'uffizi-collection' || exhibition.id === 'uffizi-gallery-collection' || exhibition.id === 'pitti-palace-collection' || exhibition.id === 'accademia-collection' || exhibition.id === 'palazzo-ducale-collection' || exhibition.id === 'galleria-borghese-collection' || exhibition.id === 'borghese-arte-antica-collection' || exhibition.id === 'guggenheim-venice-collection' || exhibition.id === 'guggenheim-ny-collection' || exhibition.id === 'whitney-collection' || exhibition.id === 'pinacoteca-brera-collection' || exhibition.id === 'gallerie-accademia-venice-collection' || exhibition.id === 'doria-pamphilj-collection' || exhibition.id === 'museo-egizio-collection' || exhibition.id === 'musei-capitolini-collection' || exhibition.id === 'novecento-della-ragione-collection' || exhibition.id === 'novecento-rosai-collection' || exhibition.id === 'ambrosiana-collection' || exhibition.id === 'museo-del-novecento-milan-collection' || exhibition.id === 'castello-di-rivoli-collection' || exhibition.id === 'museo-archeologico-napoli-collection' || exhibition.id === 'smb-humboldt-forum-collection' || exhibition.id === 'smb-altes-museum-collection' || exhibition.id === 'smb-neues-museum-collection' || exhibition.id === 'smb-gemaeldegalerie-collection' || exhibition.id === 'smb-alte-nationalgalerie-collection' || exhibition.id === 'smb-neue-nationalgalerie-collection' || exhibition.id === 'smb-bode-museum-collection' || exhibition.id === 'staedel-museum-collection' || exhibition.id === 'bruecke-museum-collection' || exhibition.id === 'alte-pinakothek-collection' || exhibition.id === 'neue-pinakothek-collection' || exhibition.id === 'pinakothek-moderne-collection' || exhibition.id === 'sammlung-schack-collection' || exhibition.id === 'staatsgalerien-collection' || exhibition.id === 'hamburger-kunsthalle-paintings' || exhibition.id === 'hamburger-kunsthalle-drawings' || exhibition.id === 'hamburger-kunsthalle-video' || exhibition.id === 'rijksmuseum-paintings' || exhibition.id === 'rijksmuseum-photography' || exhibition.id === 'rijksmuseum-drawings' || exhibition.id === 'rijksmuseum-prints' || exhibition.id === 'rijksmuseum-prints2-collection' || exhibition.id === 'vangogh-museum-collection' || exhibition.id === 'mauritshuis-collection' || exhibition.id === 'stedelijk-collection' || exhibition.id === 'kroller-muller-paintings' || exhibition.id === 'kroller-muller-film-video' || exhibition.id === 'kroller-muller-photography' || exhibition.id === 'conde-paintings' || exhibition.id === 'rusmuseum-collection' || exhibition.id === 'hermitage-collection' || exhibition.id === 'tretyakov-collection' || exhibition.id === 'pushkin-collection' || exhibition.id === 'kremlin-collection' || exhibition.id === 'topkapi-collection' || exhibition.id === 'erick-oh-retrospective' || exhibition.id === 'borghese-paintings' || exhibition.id === 'borghese-arte-antica' || exhibition.id === 'brera-collection' || exhibition.id === 'museo-novecento-milan-collection' || exhibition.id === 'nga-collection' || exhibition.id === 'huntington-collection' || exhibition.id === 'famsf-collections' || exhibition.id === 'gem-collection' || exhibition.id === 'hamburger-kunsthalle-collection' || exhibition.id === 'kroller-muller-collection' || exhibition.id === 'mam-collection' || exhibition.id === 'carnavalet-the-collection' || exhibition.id === 'museum-wales-paintings' || exhibition.id === 'rijksmuseum-cartoon' || exhibition.id === 'rijksmuseum-design' || exhibition.id === 'rijksmuseum-poster' || exhibition.id === 'rijksmuseum-docphotos' || exhibition.id === 'tsi-perm-1' || exhibition.id === 'tbc-perm-1' || exhibition.id === 'tm-perm-3' || exhibition.id === 'jacquemart-collection' || exhibition.id === 'grenoble-collection' || exhibition.id === 'bordeaux-collection' || exhibition.id === 'rodin-collection' || exhibition.id === 'musee-armee-collection' || exhibition.id === 'mucem-fine-arts-collection' || exhibition.id === 'conde-collection' || exhibition.id === 'picasso-paris-collection' || exhibition.id === 'mad-collection' || exhibition.id === 'egyptian-museum-cairo-collection' || exhibition.id === 'collection-fine-arts-be-complete' || exhibition.id === 'fine-arts-be-complete' || exhibition.id === 'egyptian-museum-cairo-collection') {
      const jsonFiles: Record<string, string> = {
        'pompidou-cinema-collection': '/data/pompidou-cinema-collection.json',
        'pompidou-painting-collection': '/data/pompidou-painting-collection.json',
        'pompidou-drawing-collection': '/data/pompidou-drawing-collection.json',
        'pompidou-newmedia-collection': '/data/pompidou-newmedia-collection.json',
        'pompidou-design-collection': '/data/pompidou-design-collection.json',
        'mam-perm-painting': '/data/mam-painting-collection.json',
        'mam-perm-photography': '/data/mam-photography-collection.json',
        'mam-collection': '/data/mam-collection.json',
        'louvre-painting-collection': '/data/louvre-painting-collection.json',
        'jacquemart-andre-collection': '/data/jacquemart-andre-collection.json',
        'marmottan-collection': '/data/marmottan-collection.json',
        'picasso-drawings-collection': '/data/picasso-drawings-collection.json',
        'picasso-paintings-collection': '/data/picasso-paintings-collection.json',
        'picasso-sculptures-collection': '/data/picasso-sculptures-collection.json',
        'picasso-prints-collection': '/data/picasso-prints-collection.json',
        'picasso-paris-collection': '/data/picasso-paris-collection.json',
        'picasso-bcn-collection': '/data/picasso-bcn-collection.json',
        'dali-foundation-collection': '/data/dali-foundation-collection.json',
        'caixaforum-collection': '/data/caixaforum-collection.json',
        'jacquemart-collection': '/data/jacquemart-andre-collection.json',
        'palais-de-tokyo-collection': '/data/palais-de-tokyo-collection.json',
        'petit-palais-collection': '/data/petit-palais-collection.json',
        'petit-palais-drawings': '/data/petit-palais-drawings.json',
        'rouen-mba-collection': '/data/rouen-mba-collection.json',
        'lille-pba-collection': '/data/lille-pba-collection.json',
        'mamcs-strasbourg-drawings-collection': '/data/mamcs-strasbourg-drawings-collection.json',
        'mamcs-strasbourg-paintings-collection': '/data/mamcs-strasbourg-paintings-collection.json',
        'mamcs-strasbourg-photography-collection': '/data/mamcs-strasbourg-photography-collection.json',
        'mamcs-strasbourg-graphic-design-collection': '/data/mamcs-strasbourg-graphic-design-collection.json',
        'mamcs-strasbourg-collection': '/data/mamcs-strasbourg-collection.json',
        'lyon-collection': '/data/mba-lyon-collection.json',
        'grenoble-collection': '/data/musee-grenoble-collection.json',
        'grenoble-paintings': '/data/musee-grenoble-paintings-collection.json',
        'grenoble-drawings': '/data/musee-grenoble-drawings-collection.json',
        'grenoble-photography': '/data/musee-grenoble-photography-collection.json',
        'bordeaux-collection': '/data/bordeaux-collection.json',
        'bordeaux-paintings': '/data/musba-bordeaux-paintings-collection.json',
        'bordeaux-drawings': '/data/musba-bordeaux-drawings-collection.json',
        'toulouse-lautrec-collection': '/data/toulouse-lautrec-collection.json',
        'granet-collection': '/data/musee-granet-collection.json',
        'rodin-collection': '/data/rodin-collection.json',
        'rodin-peintures': '/data/rodin-peintures.json',
        'rodin-sculptures': '/data/rodin-sculptures.json',
        'rodin-gravures': '/data/rodin-gravures.json',
        'flv-collection': '/data/flv-collection.json',
        'mad-paris-collection': '/data/mad-paris-collection.json',
        'mad-collection': '/data/mad-paris-collection.json',
        'egyptian-museum-cairo-collection': '/data/egyptian-museum-cairo-collection.json',
        'collection-fine-arts-be-complete': '/data/fine-arts-be-complete.json',
        'fine-arts-be-complete': '/data/fine-arts-be-complete.json',

        
        

        
        

        
        

        
        
        'carnavalet-collection': '/data/carnavalet-collection.json',
        'carnavalet-the-collection': '/data/carnavalet-the-collection.json',
        'carnavalet-paintings': '/data/carnavalet-paintings.json',
        'carnavalet-prints': '/data/carnavalet-prints.json',
        'musee-armee-collection': '/data/musee-armee-collection.json',
        'musee-armee-peinture': '/data/musee-armee-peinture.json',
        'musee-armee-photographie': '/data/musee-armee-photographie.json',
        'musee-armee-dessin': '/data/musee-armee-dessin.json',
        'conde-collection': '/data/musee-conde-collection.json',
        'conde-paintings': '/data/musee-conde-collection.json',
        'conde-drawings': '/data/musee-conde-drawings.json',
        'versailles-collection': '/data/versailles-collection.json',
        'guimet-collection': '/data/musee-guimet-collection.json',
        'macval-collection': '/data/macval-collection.json',
        'mucem-prints': '/data/mucem-prints.json',
        'mucem-drawings': '/data/mucem-drawings.json',
        'mucem-collection': '/data/mucem-collection.json',
        'mucem-fine-arts-collection': '/data/mucem-fine-arts-collection.json',
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
        'guggenheim-bilbao-collection': '/data/guggenheim-bilbao-collection.json',
        'guggenheim-ny-collection': '/data/guggenheim-ny-collection.json',
        'whitney-collection': '/data/whitney-collection.json',
        'huntington-collection': '/data/huntington-collection.json',
        'famsf-collections': '/data/famsf-collections.json',
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
        // St. Petersburg - State Russian Museum
        'rusmuseum-collection': '/data/rusmuseum-collection.json',
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
        'kroller-muller-paintings': '/data/kroller-muller-permanent.json',
        'kroller-muller-film-video': '/data/kroller-muller-film-video.json',
        'kroller-muller-photography': '/data/kroller-muller-photography.json',
        // St. Petersburg - Hermitage
        'hermitage-collection': '/data/hermitage-highlights.json',
        'pushkin-collection': '/data/pushkin-paintings.json',
        'kremlin-collection': '/data/kremlin-collection.json',
        'topkapi-collection': '/data/topkapi-collection.json',
        'erick-oh-retrospective': '/data/house-of-refuge-collection.json',
        'borghese-paintings': '/data/galleria-borghese-collection.json',
        'borghese-arte-antica': '/data/borghese-arte-antica-collection.json',
        'brera-collection': '/data/pinacoteca-brera-collection.json',
        'museo-novecento-milan-collection': '/data/museo-del-novecento-milan-collection.json',
        // Moscow - Tretyakov
        'tretyakov-collection': '/data/tretyakov-wikidata.json',
        // Washington, D.C. - National Gallery of Art (Open Data)
        'nga-collection': '/data/nga-collection.json',
        // Egypt - Grand Egyptian Museum
        'gem-collection': '/data/gem-collection.json',
        // Hamburg - Hamburger Kunsthalle (full collection ID from exhibitions.js)
        'hamburger-kunsthalle-collection': '/data/hamburger-kunsthalle-paintings.json',
        // Netherlands - Kröller-Müller (full collection ID from exhibitions.js)
        'kroller-muller-collection': '/data/kroller-muller-permanent.json',
        // UK - National Museum Wales
        'museum-wales-paintings': '/data/museum-wales-paintings.json',
        // Netherlands - Rijksmuseum extra collections
        'rijksmuseum-cartoon': '/data/rijksmuseum-cartoon-collection.json',
        'rijksmuseum-design': '/data/rijksmuseum-design-collection.json',
        'rijksmuseum-poster': '/data/rijksmuseum-poster-collection.json',
        'rijksmuseum-docphotos': '/data/rijksmuseum-docphotos-collection.json',
        // UK - Tate St Ives
        'tsi-perm-1': '/data/tate-st-ives-artworks.json',
        // UK - Tate Britain
        'tbc-perm-1': '/data/tate-britain-artworks.json',
        // UK - Tate Modern (extra perm)
        'tm-perm-3': '/data/tate-modern-collection.json'
      };
      const jsonFile = jsonFiles[exhibition.id];
      (async () => {
        try {
          const res = await fetch(jsonFile, { cache: 'no-cache' });
          if (!res.ok) throw new Error('Failed to load artworks');
          const data = await res.json();
          if (exhibition.id.startsWith('kroller-muller-')) {
            console.log(`[Kröller - Müller ${exhibition.id}] Data loaded: `, data);
            console.log(`[Kröller - Müller ${exhibition.id}] Items count: `, data.items?.length);
          }
          if (exhibition.id === 'conde-paintings') {
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
            console.log(`[Kröller - Müller ${exhibition.id}] allObjects count: `, allObjects.length);
            console.log(`[Kröller - Müller ${exhibition.id}] Sample item: `, allObjects[0]);
          }
          const is2D = exhibition.id === 'pompidou-painting' || exhibition.id === 'pompidou-drawing' || exhibition.id === 'pompidou-design' || exhibition.id === 'mam-perm-painting' || exhibition.id === 'mam-perm-photography' || exhibition.id === 'mam-collection' || exhibition.id === 'louvre-painting' || exhibition.id === 'jacquemart-collection' || exhibition.id === 'marmottan-collection' || exhibition.id === 'picasso-drawings' || exhibition.id === 'picasso-paintings' || exhibition.id === 'picasso-prints' || exhibition.id === 'picasso-paris-collection' || exhibition.id === 'palais-de-tokyo-collection' || exhibition.id === 'petit-palais-collection' || exhibition.id === 'rouen-mba-collection' || exhibition.id === 'lille-pba-collection' || exhibition.id.startsWith('mamcs-') || exhibition.id === 'lyon-collection' || exhibition.id.startsWith('grenoble-') || exhibition.id.startsWith('bordeaux-') || exhibition.id === 'toulouse-lautrec-collection' || exhibition.id === 'granet-collection' || exhibition.id === 'rodin-peintures' || exhibition.id === 'rodin-gravures' || exhibition.id === 'rodin-collection' || exhibition.id === 'flv-collection' || exhibition.id.startsWith('musee-armee-') || exhibition.id.startsWith('conde-') || exhibition.id === 'versailles-collection' || exhibition.id === 'guimet-collection' || exhibition.id === 'macval-collection' || exhibition.id === 'wallace-permanent' || exhibition.id === 'brera-collection' || exhibition.id === 'hamburger-kunsthalle-paintings' || exhibition.id === 'hamburger-kunsthalle-drawings' || exhibition.id === 'rijksmuseum-paintings' || exhibition.id === 'rijksmuseum-photography' || exhibition.id === 'rijksmuseum-drawings' || exhibition.id === 'rijksmuseum-prints' || exhibition.id === 'rijksmuseum-prints2' || exhibition.id === 'vangogh-museum-collection' || exhibition.id === 'mauritshuis-collection' || exhibition.id === 'stedelijk-collection' || exhibition.id === 'kroller-muller-paintings' || exhibition.id === 'kroller-muller-photography' || exhibition.id === 'conde-paintings' || exhibition.id === 'rusmuseum-collection' || exhibition.id === 'hermitage-collection' || exhibition.id === 'tretyakov-collection' || exhibition.id === 'mad-collection' || exhibition.id === 'fine-arts-be-complete' || exhibition.id === 'egyptian-museum-cairo-collection' || exhibition.id.startsWith('carnavalet-') || exhibition.id.startsWith('mucem-');
          const is3D = exhibition.id === 'picasso-sculptures' || exhibition.id === 'rodin-sculptures' || exhibition.id === 'borghese-arte-antica' || exhibition.id === 'kremlin-collection' || exhibition.id === 'topkapi-collection';
          const isVideo = exhibition.id === 'pompidou-cinema' || exhibition.id === 'hamburger-kunsthalle-video' || exhibition.id === 'kroller-muller-film-video';
          const isHuntington = exhibition.id === 'huntington-collection';
          const isFAMSF = exhibition.id === 'famsf-collections';
          const isMAD = exhibition.id === 'mad-collection';
          const isCarnavalet = exhibition.id === 'carnavalet-collection';
          const isBorghese = exhibition.id === 'borghese-paintings' || exhibition.id === 'borghese-arte-antica';
          const isBrera = exhibition.id === 'brera-collection';
          const isSMB = exhibition.id.startsWith('smb-');

          const getSMBType = (type: string, medium: string) => {
            const t = (type || '').toLowerCase();
            const m = (medium || '').toLowerCase();

            if (m.includes('audio') || m.includes('video') || m.includes('film')) return 'video';

            // Explicit 3D types/mediums
            if (t.includes('skulptur') || t.includes('plastik') || t.includes('büste') ||
              t.includes('relief') || t.includes('installation') || t.includes('modell') ||
              m.includes('bronze') || m.includes('gips') || m.includes('marmor') ||
              m.includes('terrakotta') || m.includes('ton') || m.includes('stahl') ||
              m.includes('messing') || m.includes('eisen') || m.includes('stein') ||
              m === 'holz' || m.includes('plaster') || m.includes('sculpture')) {
              return '3D';
            }

            return '2D';
          };


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
              return hasBC ? `${century}c BC` : `${century} c`;
            }

            // Match century patterns like "3rd-4th century", "2nd century", "1st-2nd century A.D."
            const centuryMatch = yearStr.match(/(\d+)(?:st|nd|rd|th)(?:-(\d+)(?:st|nd|rd|th))?\s*century/i);
            if (centuryMatch) {
              // Use the later century if range, otherwise the single century
              const century = centuryMatch[2] || centuryMatch[1];
              const hasBC = /B\.?C\.?/i.test(yearStr);
              return hasBC ? `${century}c BC` : `${century} c`;
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
                cleaned = `${parts[1].trim()} ${parts[0].trim()} `;
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

          const isWawel = exhibition.id.startsWith('wawel-');

          const list: Artwork[] = allObjects.map((item: any, idx: number) => {
            let rawTitle = item.title || item.name || item.shortName || 'Untitled';
            let rawArtist = item.artist || item.artistName || item.shortDescription || 'Unknown';
            // Support both 'year' and 'date' field names (Uffizi/Accademia use 'date'), Brera uses 'dateStr'
            let yearOrDate = item.displayDate || item.year || item.date || item.dateStr || '';
            // Support both 'medium' and 'technique' field names (Uffizi/Accademia use 'technique', Hamburger Kunsthalle uses 'material')
            let mediumOrTechnique = item.medium || item.material || item.technique || item.materials || '';
            // Support both 'dimensions' and 'size' field names (Uffizi uses 'size')
            const dimensionsOrSize = item.dimensions || item.size || '';
            // Category: support various field names (objectType for Städel, type for SMB Berlin, category for Borghese)
            let categoryValue = item.category || item.objectType || (typeof item.type === 'string' && !['2D', '3D', 'video', 'unknown'].includes(item.type) ? item.type : '') || '';

            // FAMSF specific mapping
            if (isFAMSF) {
              categoryValue = item.classification || categoryValue;
              // Ensure date/year is present if possible (item.date is standard)
              // Ensure artist (item.artist is standard)
              // item.isOnView is specific
              if (item.isOnView !== undefined) item.onView = item.isOnView;
            }

            // NGA Open Data: normalize fields into the generic mapping.
            if (exhibition.id === 'nga-collection' || exhibition.id.startsWith('nga-awtype-')) {
              rawTitle = item.title || 'Untitled';
              rawArtist = item.attribution || item.artist || item.artistName || 'Unknown';
              yearOrDate = item.displayDate || item.year || item.date || '';
              mediumOrTechnique = item.medium || mediumOrTechnique;
              categoryValue = item.classification || categoryValue;
              item.type = item.type || '2D';
              item.onView = item.location?.onView ?? false;
              item.openAccessLikely = item.openAccessLikely ?? false;
              if (!item.image) {
                item.image = item.primaryImage?.iiifFull || item.primaryImage?.iiifUrl || item.primaryImage?.iiifThumbUrl || '';
              }
            }

            // State Russian Museum: fall back to section/collection for category so metadata is visible
            if (exhibition.id === 'rusmuseum-collection' && !categoryValue) {
              categoryValue = item.section || item.collection || 'Painting';
            }

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

              // Map image - prioritize existing R2 image from 'image' property, then fallback
              item.image = item.image || item.generated_image_url;

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

            // Hermitage: Pack extra metadata into description and metadata field
            let extraDesc = '';
            let extraMeta: Record<string, string> = {};
            if (exhibition.id === 'hermitage-collection') {
              if (item.place) extraMeta['Place'] = item.place;
              if (item.inventoryNumber) extraMeta['Inventory Number'] = item.inventoryNumber;
              if (item.acquisition) extraMeta['Acquisition'] = item.acquisition;
              if (item.series) extraMeta['Series'] = item.series;
              if (item.category) extraMeta['Category'] = item.category;

              const parts = [];
              if (item.place) parts.push(`Place: ${item.place}`);
              if (item.inventoryNumber) parts.push(`Inventory: ${item.inventoryNumber}`);
              if (item.acquisition) parts.push(`Acquisition: ${item.acquisition}`);
              if (item.series) parts.push(`Series: ${item.series}`);
              if (parts.length > 0) extraDesc = parts.join('\n');
            }

            // Pushkin: Add Masterpiece/Display info to metadata
            if (exhibition.id === 'pushkin-collection') {
              if (item.isMasterpiece) extraMeta['Masterpiece'] = 'Yes';
              if (item.isOnDisplay) extraMeta['On Display'] = 'Yes';
              if (item.metadata?.originalTitle) extraMeta['Original Title'] = item.metadata.originalTitle;
              if (item.metadata?.school) extraMeta['School'] = item.metadata.school;
              if (item.metadata?.inventoryNumber) extraMeta['Inventory Number'] = item.metadata.inventoryNumber;
            }

            let finalImage = item.image || item.imageUrl || item.thumbnailUrl || item.primaryImage || '';
            if (!finalImage && Array.isArray(item.images) && item.images.length > 0) {
              const firstImg = item.images[0];
              finalImage = firstImg.url || firstImg.iiifthumburl || firstImg.thumbnailUrl || firstImg.primaryImage || '';
            }
            // Huntington: Append IIIF parameters to base URL
            // Optimize: request 400px wide image for list view
            if (isHuntington && finalImage && finalImage.includes('/IIIF3/Image/') && !finalImage.includes('/full/')) {
              finalImage = `https://wsrv.nl/?url=${encodeURIComponent(finalImage + '/full/400,/0/default.jpg')}&output=webp`;
            }
            // FAMSF: route through local proxy (famsf.emuseum.com blocks direct requests without Referer)
            if (isFAMSF && finalImage && finalImage.includes('famsf.emuseum.com')) {
              const famsf_base = 'https://famsf.emuseum.com';
              const famsf_path = finalImage.startsWith(famsf_base) ? finalImage.slice(famsf_base.length) : finalImage;
              finalImage = `/famsf-image${famsf_path.startsWith('/') ? famsf_path : '/' + famsf_path}`;
            }

            // MCA Collection Artworks: "Artwork" usually denotes 3D installations
            const isMCA = exhibition.id === 'mca-australia' || exhibition.id === 'mca-collection';
            let finalType = isMAD ? '3D' : (isCarnavalet || isHuntington ? 'unknown' : (isSMB ? getSMBType(item.type, mediumOrTechnique) : (isVideo ? 'video' : (is2D ? (item.type || '2D') : (is3D ? (item.type || '3D') : (item.type || 'unknown'))))));
            if (isMCA && (categoryValue.toLowerCase() === 'artwork')) {
              finalType = '3D';
            }

            // Base object construction
            const mappedItem: Artwork = {
              description: extraDesc || item.description,
              metadata: Object.keys(extraMeta).length > 0 ? extraMeta : item.metadata,
              id: item.id || `${exhibition.id}-${idx}`,
              name: isMAD ? cleanMADTitle(rawTitle) : rawTitle,
              artist: isMAD ? cleanMADArtist(rawArtist) : (isBorghese ? cleanBorgheseArtist(rawArtist) : rawArtist),
              year: toYear(yearOrDate),
              date: (isBorghese || isBrera) ? formatCenturyYear(yearOrDate) : yearOrDate,
              onView: item.onView,
              image: finalImage,
              dimension: dimensionsOrSize,
              duration: item.duration,  // Video/film duration
              medium: mediumOrTechnique,
              technique: item.technique || '',
              materials: item.materials || '',
              type: finalType,
              roomId: item.room || item.roomId || item.exhibitionSpace || 'default',  // Brera uses 'room', Wallace uses 'roomId', SMB uses 'exhibitionSpace'
              category: normalizeCategory(categoryValue),
              exhibitionName: exhibition.name,
              exhibitionTitle: exhibition.title,
              // Source URL: support various field names (url for Pinakothek, sourceUrl for SMB, detailUrl for Städel/Brücke/Hamburger)
              sourceUrl: exhibition.id === 'pushkin-collection' && item.id
                ? `https://collection.pushkinmuseum.art/entity/OBJECT/${item.id.replace('pushkin-', '')}`
                : exhibition.id === 'huntington-collection' && item.objectID
                  ? `https://www.huntington.org/collections/${item.objectID}`
                  : (exhibition.id === 'nga-collection' || exhibition.id.startsWith('nga-awtype-'))
                    ? (item.urls?.artworkPage || item.sourceUrl || item.url || '')
                    : (item.sourceUrl || item.detailUrl || item.url || ''),
              // Display/View fields
              ...(item.onDisplay !== undefined ? { onDisplay: item.onDisplay } : {}),
              ...(item.isOnDisplay !== undefined ? { isOnDisplay: item.isOnDisplay } : {}),
              ...(item.isOnView !== undefined ? { isOnView: item.isOnView } : {}),
              // Pushkin: isMasterpiece field
              ...(exhibition.id === 'pushkin-collection' ? { isMasterpiece: item.isMasterpiece } : {}),
              // NGA: openAccessLikely flag for Open Access filter
              ...(item.openAccessLikely !== undefined ? { openAccessLikely: item.openAccessLikely } : {}),
            };

            // Run inference once on load for generic collections (like Whitney) that don't have explicit type
            if (mappedItem.type === 'unknown' && !is2D && !is3D && !isVideo) {
              const inferred = inferArtworkType(mappedItem);
              if (inferred) mappedItem.type = inferred;
              else mappedItem.type = '2D'; // Default fallback
            }

            // Pre-compute search string for optimization (join all searchable fields normalized)
            (mappedItem as any)._searchStr = normalizeSearchText([
              mappedItem.name,
              mappedItem.artist,
              mappedItem.year,
              mappedItem.medium,
              mappedItem.technique,
              mappedItem.materials,
              mappedItem.category,
              mappedItem.dimension,
              mappedItem.artworkType,
              // Add any other searchable fields
              (mappedItem.metadata && Object.values(mappedItem.metadata).join(' '))
            ].filter(Boolean).join(' '));

            return mappedItem;
          });
          // Debug: log Wallace Collection data
          if (exhibition.id === 'wallace-permanent') {
            console.log('[Wallace] allObjects:', allObjects.length);
            console.log('[Wallace] allObjects sample roomIds:', allObjects.slice(0, 5).map((o: any) => o.roomId));
            console.log('[Wallace] list:', list.length);
            console.log('[Wallace] list sample roomIds:', list.slice(0, 5).map((a: any) => a.roomId));
          }
          // Filter out items without images or with placeholder "no-image" URLs
          const withImages = list.filter((a) => !!a.image && !a.image.includes('no-image') && !a.image.includes('images.grandpalaisrmn.fr/thumb.php'));
          if (exhibition.id === 'wallace-permanent') {
            console.log('[Wallace] withImages:', withImages.length);
          }
          if (exhibition.id.startsWith('kroller-muller-')) {
            console.log(`[Kröller - Müller ${exhibition.id}] list count: `, list.length);
            console.log(`[Kröller - Müller ${exhibition.id}] withImages count: `, withImages.length);
            console.log(`[Kröller - Müller ${exhibition.id}] Sample list item: `, list[0]);
            console.log(`[Kröller - Müller ${exhibition.id}] Sample withImages item: `, withImages[0]);
          }
          // Push letter/text type artworks to the end
          const isTextOrLetter = (a: any) => {
            const name = String(a.name || '').toLowerCase();
            const cat = String(a.category || '').toLowerCase();
            const med = String(a.medium || a.technique || a.materials || '').toLowerCase();
            const id = String(a.id || '').toLowerCase();
            return /\bletter[s]?\b|\blettre[s]?\b|\bbrief[e]?\b|\bcorrespondence\b|\bmanuscript\b/.test(name)
              || /\bletter[s]?\b|\blettre[s]?\b|\bbrief[e]?\b/.test(cat)
              || /\bletter[s]?\b|\blettre[s]?\b|\bbrief[e]?\b/.test(med)
              || /^b\d+v\d{4}/.test(id);
          };
          const sortedWithImages = [...withImages].sort((a, b) => (isTextOrLetter(a) ? 1 : 0) - (isTextOrLetter(b) ? 1 : 0));
          setArtworks((prev) => {
            const preservedUserSubmissions = prev.filter(p => p.source === 'user_submission');
            return [...sortedWithImages, ...preservedUserSubmissions];
          });
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
          const res = await fetch('/data/mep-photography-collection.json', { cache: 'force-cache' });
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
          const isTateFeed = exhibition.id.startsWith('tm-') || exhibition.id.startsWith('tbc-') || exhibition.id.startsWith('tsi-');
          const withImages = isTateFeed ? list : list.filter((a) => !!a.image);
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
          const res = await fetch('/data/vam-paintings.json', { cache: 'force-cache' });
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
          const res = await fetch('/data/vam-posters-display.json', { cache: 'force-cache' });
          if (!res.ok) throw new Error('Failed to load local posters');
          const data = await res.json();
          const itemsArray = Array.isArray(data) ? data : (data.items || []);
          const list = itemsArray.map((item: any) => ({
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
          const res = await fetch('/data/vam-photographs.json', { cache: 'force-cache' });
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
          const res = await fetch('/data/vam-portraits.json', { cache: 'force-cache' });
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
          const res = await fetch('/data/guggenheim-bilbao-collection.json', { cache: 'force-cache' });
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
          const res = await fetch('/data/picasso-bcn-collection.json', { cache: 'force-cache' });
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
          const res = await fetch('/data/dali-foundation-collection.json', { cache: 'force-cache' });
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
          const res = await fetch('/data/caixaforum-collection.json', { cache: 'force-cache' });
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
          const res = await fetch('/data/national-gallery-permanent.json', { cache: 'force-cache' });
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
            sourceUrl: item.url,
            onView: !!item.roomId && item.roomId !== 'default' && item.roomId !== '' && item.roomId.toLowerCase() !== 'n', // On view if assigned a specific room (excluding 'n')
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
          const res = await fetch('/data/tate-britain.json', { cache: 'force-cache' });
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
                name: room.name || `Room ${roomId} `,
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
          const res = await fetch('/data/tate-modern.json', { cache: 'force-cache' });
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
    // Generic Fallback for dynamically injected static files
    // If it has collectionFile but bypassed all previous specific handlers.
    if ((exhibition as any).collectionFile) {
      (async () => {
        try {
          const file = (exhibition as any).collectionFile;
          console.log('[ExhibitionModal] Using generic collectionFile fallback for:', file);
          const res = await fetch(`/data/${file}`, { cache: 'force-cache' });
          if (!res.ok) throw new Error(`Missing ${file}`);
          const rawData = await res.json();
          let arr = Array.isArray(rawData) ? rawData : (rawData.items || rawData.objects || rawData.data || rawData.artworks || []);
          if (arr.length === 0 && typeof rawData === 'object' && !Array.isArray(rawData) && Object.keys(rawData).length > 0 && !rawData.items && !rawData.objects) {
            arr = Object.values(rawData);
          }
          
          const list: any[] = arr.map((item: any, idx: number) => {
            const dateText = String(item.date || item.dateText || item.year || item.creationDate || '');
            const yearMatch = dateText.match(/\b\d{4}\b/);
            const year = parseInt(yearMatch?.[0] || '0', 10);
            
            const title = item.title || item.name || item.nameEn || 'Untitled';
            const artist = item.artist || item.artistName || item.creator || item.maker || item.author || (exhibition as any).artist || 'Unknown';
            const imageUrl = item.image || item.imageUrl || item.image_url || item.thumbnail || item.thumb || item.primaryImage || item.img || '';
            const itemId = item.id || item.objectID || item.guid || `exh-${exhibition.id}-${idx}`;
            
            return {
              id: String(itemId),
              name: title,
              artist: artist,
              year: year,
              image: imageUrl,
              url: item.url || item.sourceUrl || item.link || item.objectUrl || '',
              roomId: 'gallery',
              exhibitionName: exhibition.name,
              exhibitionTitle: exhibition.title,
            };
          }).filter((a: any) => !!a.image && !a.image.includes('images.grandpalaisrmn.fr/thumb.php'));
          
          setArtworks(list);
          setInitialized(true);
        } catch (e) {
          console.error('[ExhibitionModal] Failed generic load:', e);
          setInitialized(true);
        }
      })();
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

    // EXCLUSION: If we are using a static file for this exhibition, do NOT subscribe to Firestore
    // (otherwise an empty Firestore query will overwrite our static data)
    console.log(`[ExhibitionModal] Checking inclusion for id: '${exhibition.id}'`);
    const STATIC_ONLY_IDS = [
      'skagens-collection',
      'skagens-museum',
      'aros-collection',
      'aros-museum',
      'tate-st-ives-artworks', // Example, check others if needed
      'louisiana-collection',
      'glyptoteket-collection',
      'rusmuseum-collection',
      'lee-jung-seop-museum', 'ljs-collection', 'gidang-art-museum', 'gidang-collection', 'soam-memorial-hall', 'soam-collection', 'jeju-museum-of-art', 'jmoa-collection', 'kim-tschang-yeul-art-museum', 'kimtschang-yeul-collection', 'dumoak', 'dumoak-collection', 'palace-museum-intl', 'dpm-intl-paintings', 'national-museum-of-china', 'nmc-highlights-all', 'shenzhen-museum', 'shenzhenmuseum-l0303-all', 'nanjing-museum', 'njmuseum-collection-all', 'shanghai-museum', 'shanghaimuseum-paintings-all', 'guangdong-museum-of-art', 'gdmoa-online-collection', 'national-palace-museum-taipei', 'npm-selection-painting', 'ntmofa', 'ntmofa-collection', 'china-art-museum', 'china-art-museum-collection', 'namoc', 'namoc-collection', 'power-station-of-art', 'psa-collection-all', 'long-museum', 'long-museum-collection', 'smithsonian-american-art-museum', 'saam-paintings', 'smithsonian-asian-art', 'si-asian-art-collection', 'smithsonian-national-portrait-gallery', 'si-npg-collection', 'moma-collection', 'moma-highlights', 'art-institute-of-chicago', 'aic-highlights', 'getty', 'getty-collection', 'high-museum', 'high-museum-collection', 'qagoma', 'qagoma-collection', 'mca-australia', 'mca-collection', 'agnsw', 'art-gallery-nsw', 'agnsw-collection', 'ngv', 'ngv-collection', 'tepapa', 'tepapa-collection', 'tepapa-paintings', 'masp', 'masp-collection'
    ];
    // Trim id just in case
    const cleanId = (exhibition.id || '').trim();
    // Use loose check for Skagens
    const shouldSkip = STATIC_ONLY_IDS.includes(cleanId) || cleanId.includes('skagens');
    console.log(`[ExhibitionModal] Should skip Firestore? ${shouldSkip} (cleanId: '${cleanId}')`);

    if (shouldSkip) {
      console.log('[ExhibitionModal] Skipping Firestore subscription for static exhibition.');
      return () => { };
    }

    // Subscribe to Firestore artworks for this exhibition
    // EXCLUSION: If we are using a static file for this exhibition, do NOT subscribe to Firestore
    if (exhibition.id.includes('skagens')) {
      console.log('[ExhibitionModal] Skipping Firestore subscription for Skagens (handled above).');
      return () => { };
    }

    const q = query(
      collection(db, "artworks"),
      where("exhibitionId", "==", exhibition.id)
    );

    // Subscribe to Firestore artworks for this exhibition
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: Artwork[] = [];
        snap.forEach((ds) => {
          const data = ds.data() as Artwork;
          // Ensure stable id exists; fall back to Firestore doc.id if missing
          const id = (data as any)?.id ? String((data as any).id) : ds.id;
          list.push({ ...data, id, firestoreId: ds.id });
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
    // Skip for static-only exhibitions (to avoid permission errors and mixed data)
    if (exhibition.id.includes('skagens')) return;
    const STATIC_ONLY_IDS = [
      'skagens-collection',
      'skagens-museum',
      'aros-collection',
      'aros-museum',
      'louisiana-collection',
      'glyptoteket-collection',
      'rusmuseum-collection',
      'lee-jung-seop-museum', 'ljs-collection', 'gidang-art-museum', 'gidang-collection', 'soam-memorial-hall', 'soam-collection', 'jeju-museum-of-art', 'jmoa-collection', 'kim-tschang-yeul-art-museum', 'kimtschang-yeul-collection', 'dumoak', 'dumoak-collection', 'palace-museum-intl', 'dpm-intl-paintings', 'national-museum-of-china', 'nmc-highlights-all', 'shenzhen-museum', 'shenzhenmuseum-l0303-all', 'nanjing-museum', 'njmuseum-collection-all', 'shanghai-museum', 'shanghaimuseum-paintings-all', 'guangdong-museum-of-art', 'gdmoa-online-collection', 'national-palace-museum-taipei', 'npm-selection-painting', 'ntmofa', 'ntmofa-collection', 'china-art-museum', 'china-art-museum-collection', 'namoc', 'namoc-collection', 'power-station-of-art', 'psa-collection-all', 'long-museum', 'long-museum-collection', 'smithsonian-american-art-museum', 'saam-paintings', 'smithsonian-asian-art', 'si-asian-art-collection', 'smithsonian-national-portrait-gallery', 'si-npg-collection', 'moma-collection', 'moma-highlights', 'art-institute-of-chicago', 'aic-highlights', 'getty', 'getty-collection', 'high-museum', 'high-museum-collection', 'qagoma', 'qagoma-collection', 'mca-australia', 'mca-collection', 'agnsw', 'art-gallery-nsw', 'agnsw-collection', 'ngv', 'ngv-collection', 'tepapa', 'tepapa-collection', 'tepapa-paintings', 'masp', 'masp-collection'
    ];
    if (STATIC_ONLY_IDS.includes(exhibition.id)) return;

    const exhibitionId = exhibition.id;

    // Query exhibition_artworks where exhibitionId matches
    const q = query(
      collection(db, 'exhibition_artworks'),
      where('exhibitionId', '==', exhibitionId)
    );

    const unsub = onSnapshot(q, (snap) => {
      // if (snap.empty) return; // Don't return early, or we can't clear deletions

      const userSubmissions: Artwork[] = [];
      snap.forEach((docSnap) => {
        const data = docSnap.data();
        userSubmissions.push({
          id: data.id || docSnap.id,
          firestoreId: docSnap.id,
          source: 'user_submission',
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

      setArtworks((prev) => {
        // 1. Remove all existing user submissions (to ensure we sync deletions/updates)
        //    and effectively "reset" the user submission portion.
        const staticArtworks = prev.filter(a => a.source !== 'user_submission');

        // 2. Sort user submissions by submittedAt (oldest first -> newest last)
        //    If 'submittedAt' is missing (pending write), treat it as Future/Now (MAX_VALUE) so it goes to the end.
        userSubmissions.sort((a: any, b: any) => {
          const tA = a.submittedAt?.seconds ?? Number.MAX_SAFE_INTEGER;
          const tB = b.submittedAt?.seconds ?? Number.MAX_SAFE_INTEGER;
          return tA - tB; // Oldest first, Newest last
        });

        return [...staticArtworks, ...userSubmissions];
      });
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
  // DISABLED on mobile to save memory
  usePrefetchNeighbors(isMobile ? [] : (filteredArtworks as any[]), selectedIndex, 1);


  // Preload neighbor images with idle callback - DISABLED on mobile to prevent memory issues
  const preloadImagesRef = useRef<HTMLImageElement[]>([]);
  useEffect(() => {
    // Skip on mobile to prevent memory bloat
    if (isMobile || typeof window === 'undefined') return;

    const supportsIdle = typeof (window as any).requestIdleCallback === 'function';
    const schedule: (cb: () => void) => number = supportsIdle
      ? (cb) => (window as any).requestIdleCallback(cb, { timeout: 800 })
      : (cb) => window.setTimeout(cb, 200);
    const cancel: (handle: number) => void = typeof (window as any).cancelIdleCallback === 'function'
      ? (handle) => (window as any).cancelIdleCallback(handle)
      : (handle) => window.clearTimeout(handle);

    idleDecodeHandlesRef.current.forEach(cancel);
    idleDecodeHandlesRef.current = [];

    // Clear previous preload images to allow garbage collection
    preloadImagesRef.current = [];

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
          // Store reference for cleanup
          preloadImagesRef.current.push(preload);
          // Limit stored references to prevent memory bloat
          if (preloadImagesRef.current.length > 4) {
            preloadImagesRef.current.shift();
          }
          if (preload.decode) preload.decode().catch(() => { });
        } catch { }
      });
      idleDecodeHandlesRef.current.push(handle);
    });

    return () => {
      idleDecodeHandlesRef.current.forEach(cancel);
      idleDecodeHandlesRef.current = [];
      // Clear preload images on cleanup
      preloadImagesRef.current = [];
    };
  }, [isMobile, filteredArtworks.length, selectedIndex]);

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
      const artwork = sortedArtworks[hoveredIndex];
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
      if (hoveredIndex !== null && sortedArtworks[hoveredIndex]) {
        return sortedArtworks[hoveredIndex];
      }
      // No hover in gallery: show placeholders (—) by returning null
      return null as unknown as Artwork | null;
    }
    return current;
  }, [viewMode, hoveredIndex, current, filteredArtworks, sortedArtworks, hoverZoom]);

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

    // Use a viewport-sized proxy URL for lightbox to avoid huge original downloads.
    const desiredW = Math.round(Math.min(
      (best.width ? best.width : Number.POSITIVE_INFINITY),
      Math.max(900, vw * dpr * 1.25),
      2600,
    ));

    // Some sources (notably NJMuseum) can block server-side image proxy fetches.
    // In those cases, load the original URL directly for reliability.
    const bypassWeserv = (() => {
      try {
        const host = new URL(best.url).hostname;
        return host === 'www.njmuseum.org.cn' || host === 'njmuseum.org.cn';
      } catch {
        return best.url.includes('njmuseum.org.cn');
      }
    })();

    const fullUrl = bypassWeserv
      ? best.url
      : (best.url.includes('wsrv.nl') || best.url.includes('images.weserv.nl'))
        ? tuneWeservUrl(best.url, desiredW, 85)
        : getWeservUrl(best.url, desiredW, 85);

    // Preload to get natural dimensions and cap target appropriately (probe the resized URL)
    const probe = new Image();
    probe.decoding = 'async';
    probe.src = fullUrl;
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
        fullUrl,
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

  // Sync scroll position ONLY when switching between PC and mobile (not on every selectedIndex change)
  const prevIsMobileRef = useRef<boolean | null>(null);
  const prevViewModeRef = useRef<string | null>(null);
  useEffect(() => {
    if (viewMode !== 'archive') return;

    // First run - just record current state
    if (prevIsMobileRef.current === null) {
      prevIsMobileRef.current = isMobile;
      prevViewModeRef.current = viewMode;
      return;
    }

    // Only act when isMobile or viewMode actually changed
    const mobileChanged = prevIsMobileRef.current !== isMobile;
    const viewChanged = prevViewModeRef.current !== viewMode;
    if (!mobileChanged && !viewChanged) return;

    prevIsMobileRef.current = isMobile;
    prevViewModeRef.current = viewMode;

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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMobile, viewMode]); // NOTE: selectedIndex intentionally removed — causes feedback loop

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
  const selectorLeft = isMobile ? 12 : (isVeryNarrow ? 16 : (isNarrow || variant === 'sketch' ? 24 : 250));
  // Wide screen: same top margin as mode tabs (8px)
  // Narrow screen: align with metadata row Y position (after mode tabs)
  const selectorTop = isMobile ? 140 : (isVeryNarrow ? 50 : (isNarrow ? 50 : 8));
  // Info text position (same center as room selector on wide screen)
  const infoTextLeft = isMobile ? 12 : (isVeryNarrow ? 160 : (isNarrow || variant === 'sketch' ? 180 : 300));
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
      className={`${variant === 'sketch' ? 'sketch-modal-theme' : ''} ${isDark ? 'em-dark-panel' : ''}`}
      style={{
        position: inline ? "absolute" : "fixed",
        top: 0,
        left: 0,
        width: inline ? "100%" : "100vw",
        height: inline ? "100%" : "100vh",
        backgroundColor: inline ? "transparent" : "rgba(0,0,0,0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: inline ? 1 : 13000,
        overscrollBehavior: "contain",
        // Prevent layout thrashing on pinch zoom
        contain: 'layout style',
      }}
    >
      {isDark && (
        <style>{`
          /* ── Root & broad inheritance ── */
          .em-dark-panel { color: rgba(255,255,255,0.88) !important; }

          /* ── Force all non-button text elements to use light colors ── */
          .em-dark-panel div:not([class*="sketch"]),
          .em-dark-panel span,
          .em-dark-panel p,
          .em-dark-panel label,
          .em-dark-panel td,
          .em-dark-panel th,
          .em-dark-panel li,
          .em-dark-panel h1, .em-dark-panel h2, .em-dark-panel h3 {
            color: rgba(255,255,255,0.88) !important;
          }

          /* ── Dim text: elements that use secondary/hint colors ── */
          .em-dark-panel [style*="color: rgb(102, 102, 102)"],
          .em-dark-panel [style*="color: rgb(119, 119, 119)"],
          .em-dark-panel [style*="color: rgb(128, 128, 128)"] { color: rgba(255,255,255,0.55) !important; }
          .em-dark-panel [style*="color: rgb(136, 136, 136)"],
          .em-dark-panel [style*="color: rgb(153, 153, 153)"],
          .em-dark-panel [style*="color: rgb(170, 170, 170)"],
          .em-dark-panel [style*="color: rgb(187, 187, 187)"] { color: rgba(255,255,255,0.38) !important; }

          /* ── Backgrounds ── */
          .em-dark-panel [style*="background: rgb(255, 255, 255)"],
          .em-dark-panel [style*="background-color: rgb(255, 255, 255)"] { background: #111111 !important; background-color: #111111 !important; }
          .em-dark-panel [style*="background: rgb(242, 242, 242)"],
          .em-dark-panel [style*="background-color: rgb(242, 242, 242)"],
          .em-dark-panel [style*="background: rgb(245, 245, 245)"],
          .em-dark-panel [style*="background: rgb(250, 250, 250)"],
          .em-dark-panel [style*="background: rgb(240, 240, 240)"] { background: rgba(255,255,255,0.08) !important; background-color: rgba(255,255,255,0.08) !important; }

          /* ── Borders ── */
          .em-dark-panel [style*="border-bottom: 1px solid rgb("],
          .em-dark-panel [style*="border: 1px solid rgb(2"],
          .em-dark-panel [style*="border: 1px solid rgb(0"] { border-color: rgba(255,255,255,0.12) !important; }

          /* ── Keep active button text dark (white bg button in dark mode) ── */
          .em-dark-panel button[style*="color: rgb(17, 17, 17)"],
          .em-dark-panel button[style*="color: rgb(0, 0, 0)"] { color: #111111 !important; }

          /* ── Images stay normal ── */
          .em-dark-panel img { filter: none !important; }
        `}</style>
      )}
      <style>{`
        @keyframes em-gallery-reveal {
          from { opacity: 0; filter: blur(6px); transform: translateY(8px); }
          to   { opacity: 1; filter: blur(0px); transform: translateY(0px); }
        }
        .em-gallery-item {
          animation: em-gallery-reveal 0.5s cubic-bezier(0.22,1,0.36,1) both;
        }
      `}</style>
      <div
        ref={panelRef}
        style={{
          position: "relative",
          backgroundColor: EM_BG,
          color: EM_TEXT,
          width: "100%",
          height: "100%",
          padding: 0,
          borderRadius: 0,
          boxShadow: isSketch ? "none" : "0 12px 28px rgba(0,0,0,0.25)",
          borderTop: isSketch ? '3px solid #111111' : 'none',
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
          <div ref={headerRef} style={{ position: 'absolute', top: 0, left: 0, right: 0, background: EM_BG, zIndex: 199, display: 'flex' }}>
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
              <div style={{ marginBottom: 4, display: 'flex', alignItems: 'center', gap: "6px 6px" }}>
                <button
                  onClick={() => { setSelectedCentury(null); setSelectedYearRange('ALL'); setSelectedTypes(new Set()); setSelectedCategories(new Set()); setSelectedIndex(0); }}
                  style={{ padding: '0 6px', minHeight: 22, fontSize: 10.5, fontWeight: 400, borderRadius: 4, border: 'none', background: (selectedRoomId === 'ALL' && !selectedCentury && selectedTypes.size === 0 && selectedCategories.size === 0) ? EM_BTN_ACTIVE_BG : EM_BTN_INACTIVE_BG, color: (selectedRoomId === 'ALL' && !selectedCentury && selectedTypes.size === 0 && selectedCategories.size === 0) ? EM_BTN_ACTIVE_FG : EM_BTN_INACTIVE_FG, cursor: 'pointer', transition: 'all 0.1s ease' }}
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
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: "6px 6px", alignItems: 'center' }}>
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
                    style={{ padding: '0 6px', minHeight: 22, fontSize: 10.5, fontWeight: selectedCentury === c ? 500 : 400, borderRadius: 4, border: 'none', background: selectedCentury === c ? EM_BTN_ACTIVE_BG : EM_BTN_INACTIVE_BG, color: selectedCentury === c ? EM_BTN_ACTIVE_FG : EM_BTN_INACTIVE_FG, cursor: 'pointer', transition: 'all 0.1s ease' }}
                  >
                    {`${c}c`}
                  </button>
                ))}
                {hasCategorizedArtworks && has2DArtworks && (
                  <button
                    key="mobile-2D"
                    onClick={() => {
                      setSelectedTypes(prev => {
                        if (prev.has('2D')) return new Set();
                        return new Set(['2D']);
                      });
                      setSelectedMediumFacets(new Set());
                      setSelectedIndex(0);
                    }}
                    style={{ padding: '0 6px', minHeight: 22, fontSize: 10.5, fontWeight: selectedTypes.has('2D') ? 500 : 400, borderRadius: 4, border: 'none', background: selectedTypes.has('2D') ? EM_BTN_ACTIVE_BG : EM_BTN_INACTIVE_BG, color: selectedTypes.has('2D') ? EM_BTN_ACTIVE_FG : EM_BTN_INACTIVE_FG, cursor: 'pointer', transition: 'all 0.1s ease' }}
                  >
                    2D
                  </button>
                )}
                {hasCategorizedArtworks && has3DArtworks && (
                  <button
                    key="mobile-3D"
                    onClick={() => {
                      setSelectedTypes(prev => {
                        if (prev.has('3D')) return new Set();
                        return new Set(['3D']);
                      });
                      setSelectedMediumFacets(new Set());
                      setSelectedIndex(0);
                    }}
                    style={{ padding: '0 6px', minHeight: 22, fontSize: 10.5, fontWeight: selectedTypes.has('3D') ? 500 : 400, borderRadius: 4, border: 'none', background: selectedTypes.has('3D') ? EM_BTN_ACTIVE_BG : EM_BTN_INACTIVE_BG, color: selectedTypes.has('3D') ? EM_BTN_ACTIVE_FG : EM_BTN_INACTIVE_FG, cursor: 'pointer', transition: 'all 0.1s ease' }}
                  >
                    3D
                  </button>
                )}
                {hasCategorizedArtworks && hasUncategorizedArtworks && (
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
                    style={{ padding: '0 6px', minHeight: 22, fontSize: 10.5, fontWeight: selectedTypes.has('N') ? 500 : 400, borderRadius: 4, border: 'none', background: selectedTypes.has('N') ? EM_BTN_ACTIVE_BG : EM_BTN_INACTIVE_BG, color: selectedTypes.has('N') ? EM_BTN_ACTIVE_FG : EM_BTN_INACTIVE_FG, cursor: 'pointer', transition: 'all 0.1s ease' }}
                  >
                    N
                  </button>
                )}
                {hasArchivalArtworks && (
                  <button
                    onClick={() => { setShowArtworksOnly(!showArtworksOnly); setSelectedIndex(0); }}
                    style={{ padding: '0 6px', minHeight: 22, fontSize: 10.5, fontWeight: showArtworksOnly ? 500 : 400, borderRadius: 4, border: 'none', background: showArtworksOnly ? EM_BTN_ACTIVE_BG : EM_BTN_INACTIVE_BG, color: showArtworksOnly ? EM_BTN_ACTIVE_FG : EM_BTN_INACTIVE_FG, cursor: 'pointer', transition: 'all 0.1s ease' }}
                  >
                    ARTWORKS ONLY
                  </button>
                )}
                {(hasOnViewArtworks || exhibition.id === 'guggenheim-bilbao-collection' || exhibition.id === 'kunsthaus-collection' || exhibition.id === 'khm-collection' || exhibition.id === 'ateneum-collection' || exhibition.id === 'mplus-collection-mplus' || exhibition.id === 'mplus-collection-sigg' || exhibition.id === 'mplus' || exhibition.id === 'met-ny-collection' || exhibition.id === 'moma-highlights' || exhibition.id === 'aic-highlights' || exhibition.id === 'getty-collection' || exhibition.id === 'getty' || exhibition.id === 'sfmoma-collection' || exhibition.id === 'cma-collection' || exhibition.id.includes('agnsw') || exhibition.id.includes('qagoma') || exhibition.id.includes('mca-australia') || exhibition.id.includes('mca-collection')) && (
                  <button
                    onClick={() => { setShowOnViewOnly(!showOnViewOnly); setSelectedIndex(0); }}
                    style={{ padding: '0 6px', minHeight: 22, fontSize: 10.5, fontWeight: showOnViewOnly ? 500 : 400, borderRadius: 4, border: 'none', background: showOnViewOnly ? EM_BTN_ACTIVE_BG : EM_BTN_INACTIVE_BG, color: showOnViewOnly ? EM_BTN_ACTIVE_FG : EM_BTN_INACTIVE_FG, cursor: 'pointer', transition: 'all 0.1s ease' }}
                  >
                    ON VIEW
                  </button>
                )}
                {exhibition.id === 'pushkin-collection' && hasMasterpieceArtworks && (
                  <button
                    onClick={() => { setShowMasterpieceOnly(!showMasterpieceOnly); setSelectedIndex(0); }}
                    style={{ padding: '0 6px', minHeight: 22, fontSize: 10.5, fontWeight: showMasterpieceOnly ? 500 : 400, borderRadius: 4, border: 'none', background: showMasterpieceOnly ? EM_BTN_ACTIVE_BG : EM_BTN_INACTIVE_BG, color: showMasterpieceOnly ? EM_BTN_ACTIVE_FG : EM_BTN_INACTIVE_FG, cursor: 'pointer', transition: 'all 0.1s ease' }}
                  >
                    MASTERPIECE
                  </button>
                )}
                {(exhibition.id === 'ateneum-collection' || exhibition.id === 'met-ny-collection' || exhibition.id === 'aic-highlights') && hasPublicDomainArtworks && (
                  <button
                    onClick={() => { setShowPublicDomainOnly(!showPublicDomainOnly); setSelectedIndex(0); }}
                    style={{ padding: '0 6px', minHeight: 22, fontSize: 10.5, fontWeight: showPublicDomainOnly ? 500 : 400, borderRadius: 4, border: 'none', background: showPublicDomainOnly ? EM_BTN_ACTIVE_BG : EM_BTN_INACTIVE_BG, color: showPublicDomainOnly ? EM_BTN_ACTIVE_FG : EM_BTN_INACTIVE_FG, cursor: 'pointer', transition: 'all 0.1s ease' }}
                  >
                    PUBLIC DOMAIN
                  </button>
                )}
                {exhibition.id === 'nga-collection' && (
                  <>
                    <button
                      onClick={() => { setShowOnViewOnly(!showOnViewOnly); setShowOpenAccessOnly(false); setSelectedIndex(0); }}
                      style={{ padding: '0 6px', minHeight: 22, fontSize: 10.5, fontWeight: showOnViewOnly ? 500 : 400, borderRadius: 4, border: 'none', background: showOnViewOnly ? EM_BTN_ACTIVE_BG : EM_BTN_INACTIVE_BG, color: showOnViewOnly ? EM_BTN_ACTIVE_FG : EM_BTN_INACTIVE_FG, cursor: 'pointer', transition: 'all 0.1s ease' }}
                    >
                      ON VIEW
                    </button>
                    <button
                      onClick={() => { setShowOpenAccessOnly(!showOpenAccessOnly); setShowOnViewOnly(false); setSelectedIndex(0); }}
                      style={{ padding: '0 6px', minHeight: 22, fontSize: 10.5, fontWeight: showOpenAccessOnly ? 500 : 400, borderRadius: 4, border: 'none', background: showOpenAccessOnly ? EM_BTN_ACTIVE_BG : EM_BTN_INACTIVE_BG, color: showOpenAccessOnly ? EM_BTN_ACTIVE_FG : EM_BTN_INACTIVE_FG, cursor: 'pointer', transition: 'all 0.1s ease' }}
                    >
                      OPEN ACCESS
                    </button>
                  </>
                )}
                {(exhibition.id === 'getty-collection' || exhibition.id === 'getty') && hasOpenContentArtworks && (
                  <button
                    onClick={() => { setShowOpenContentOnly(!showOpenContentOnly); setSelectedIndex(0); }}
                    style={{ padding: '0 6px', minHeight: 22, fontSize: 10.5, fontWeight: showOpenContentOnly ? 500 : 400, borderRadius: 4, border: 'none', background: showOpenContentOnly ? EM_BTN_ACTIVE_BG : EM_BTN_INACTIVE_BG, color: showOpenContentOnly ? EM_BTN_ACTIVE_FG : EM_BTN_INACTIVE_FG, cursor: 'pointer', transition: 'all 0.1s ease' }}
                  >
                    OPEN CONTENT
                  </button>
                )}
                {(hasHighlightArtworks || exhibition.id === 'adachi-collection') && (
                  <button
                    onClick={() => { setShowHighlightOnly(!showHighlightOnly); setSelectedIndex(0); }}
                    style={{ padding: '0 6px', minHeight: 22, fontSize: 10.5, fontWeight: showHighlightOnly ? 500 : 400, borderRadius: 4, border: 'none', background: showHighlightOnly ? EM_BTN_ACTIVE_BG : EM_BTN_INACTIVE_BG, color: showHighlightOnly ? EM_BTN_ACTIVE_FG : EM_BTN_INACTIVE_FG, cursor: 'pointer', transition: 'all 0.1s ease' }}
                  >
                    HIGHLIGHT
                  </button>
                )}
              </div>

              {/* Row 3: Sub-items (Categories OR Medium) - prioritized */}
              {hasCategorizedArtworks && selectedTypes.size > 0 && (
                <>
                  {availableCategories.length > 0 ? (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: "6px 6px", marginTop: 10, alignItems: 'center' }}>
                      {availableCategories.map(cat => (
                        <button
                          key={`mobile-cat-${cat}`}
                          onClick={() => { setSelectedCategories(prev => { const next = new Set(prev); if (next.has(cat)) next.delete(cat); else next.add(cat); return next; }); setSelectedIndex(0); }}
                          style={{ padding: '0 6px', minHeight: 22, fontSize: 10.5, fontWeight: selectedCategories.has(cat) ? 500 : 400, borderRadius: 4, border: 'none', background: selectedCategories.has(cat) ? EM_BTN_ACTIVE_BG : EM_BTN_INACTIVE_BG, color: selectedCategories.has(cat) ? EM_BTN_ACTIVE_FG : EM_BTN_INACTIVE_FG, cursor: 'pointer', transition: 'all 0.1s ease' }}
                        >
                          {CATEGORY_LABEL_MAP[cat] || cat}
                        </button>
                      ))}
                    </div>
                  ) : (
                    availableTechniqueFacets.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: "6px 6px", marginTop: 10, alignItems: 'center' }}>
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
                            style={{ padding: '0 6px', minHeight: 22, fontSize: 10.5, fontWeight: selectedMediumFacets.has(f.id) ? 500 : 400, borderRadius: 4, border: 'none', background: selectedMediumFacets.has(f.id) ? EM_BTN_ACTIVE_BG : EM_BTN_INACTIVE_BG, color: selectedMediumFacets.has(f.id) ? EM_BTN_ACTIVE_FG : EM_BTN_INACTIVE_FG, cursor: 'pointer', transition: 'all 0.1s ease' }}
                            title={`${f.label} (${f.count.toLocaleString()})`}
                          >
                            {f.label}
                          </button>
                        ))}
                      </div>
                    )
                  )}
                </>
              )}
            </div>
            {/* Zone 3: Sort Button - aligned right */}
            <div style={{ width: 'calc(100% / 3)', minWidth: 0, boxSizing: 'border-box', display: 'flex', justifyContent: 'flex-end', paddingRight: 4 }}>
              <select
                value={sortBy}
                onChange={(e) => {
                  setSortBy(e.target.value as any);
                  setSelectedIndex(0);
                }}
                style={{
                  appearance: 'none',
                  background: EM_BTN_INACTIVE_BG,
                  border: 'none',
                  borderRadius: 4,
                  padding: '0 16px 0 6px',
                  fontSize: 10.5,
                  color: EM_BTN_INACTIVE_FG,
                  minHeight: 22,
                  outline: 'none',
                  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='8' viewBox='0 0 24 24' fill='none' stroke='%23666' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
                  backgroundRepeat: 'no-repeat',
                  backgroundPosition: 'right 4px center',
                  maxWidth: '100%'
                }}
              >
                <option value="year_asc">Date: Oldest</option>
                <option value="year_desc">Date: Newest</option>
                <option value="like_desc">Most Liked</option>
                <option value="default">Default</option>
                <option value="random">Random</option>
              </select>
            </div>
          </div>
        )}
        {/* Mobile Archive Mode: full-screen layout with horizontal scrolling thumbnails (same as PC but horizontal) */}
        {isMobile && viewMode === 'archive' && sortedArtworks.length > 0 && (() => {
          const total = sortedArtworks.length;
          const current = sortedArtworks[selectedIndex];
          const THUMB_SIZE = 48;
          const THUMB_GAP = 84; // Same gap as PC

          // 3x list for infinite loop (same as PC)
          const tripleList = [...sortedArtworks, ...sortedArtworks, ...sortedArtworks];

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
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', flexDirection: 'column', background: EM_BG, zIndex: 198 }}>
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
                        onError={(e) => applyFallbackImage(e.currentTarget, a.fallbackImages)}
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
                        onError={(e) => applyFallbackImage(e.currentTarget, current.fallbackImages)}
                      />
                      <HeartOverlay
                        isLiked={likedArtworks.has(String(current.id))}
                        onToggle={(e) => toggleLike(e, current)}
                        style={{ position: 'absolute', bottom: 8, left: 8, zIndex: 30, padding: 0, background: 'none' }}
                        size={18}
                        color="#e11d48"
                        emptyColor="#fff"
                      />
                      {isAdmin && ((current as any).firestoreId || (current as any).source === 'user_submission') && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteArtwork(current.id, (current as any).firestoreId);
                          }}
                          style={{
                            position: 'absolute',
                            bottom: 8,
                            left: 40,
                            zIndex: 35,
                            padding: 0,
                            background: 'rgba(255, 255, 255, 0.8)',
                            borderRadius: '50%',
                            border: 'none',
                            cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            width: 24, height: 24, fontSize: 12
                          }}
                          title="Delete (Admin)"
                        >
                          🗑️
                        </button>
                      )}
                    </div>
                    <div style={{ marginTop: 10, textAlign: 'center', padding: '0 16px' }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#222' }}>{current.name}</div>
                      {/* Medium/Technique/Materials */}
                      {(() => {
                        const med = (current as Record<string, unknown>).medium || (current as Record<string, unknown>).technique || (current as Record<string, unknown>).materials;
                        return med ? <div style={{ fontSize: 10, color: '#888', marginTop: 2 }}>{String(med)}</div> : null;
                      })()}
                      <div style={{ fontSize: 11, color: '#666', marginTop: 3 }}>{(() => {
                        const artistStr = cleanArtistName(current.artist);
                        const isUnknown = !artistStr || artistStr.toLowerCase() === 'unknown artist' || artistStr.toLowerCase() === 'unknown';
                        return isUnknown ? (artistStr || '') : (
                          <span
                            onClick={(e) => { e.stopPropagation(); window.dispatchEvent(new CustomEvent('open-artist-gallery', { detail: { artist: artistStr } })); }}
                            style={{ cursor: 'pointer', borderBottom: '1px solid rgba(100,100,100,0.25)', transition: 'color 0.2s, border-color 0.2s' }}
                            onMouseEnter={e => { e.currentTarget.style.color = '#c9a55a'; e.currentTarget.style.borderColor = '#c9a55a'; }}
                            onMouseLeave={e => { e.currentTarget.style.color = '#666'; e.currentTarget.style.borderColor = 'rgba(100,100,100,0.25)'; }}
                            title="View Artist Page"
                          >{artistStr}</span>
                        );
                      })()}{current.year ? ` (${cleanDateText(String(current.year))})` : ''}</div>
                      {/* Category/ArtworkType */}
                      {(() => {
                        const cat = (current as Record<string, unknown>).category || (current as Record<string, unknown>).artworkType;
                        return cat ? <div style={{ fontSize: 10, color: '#888', marginTop: 2 }}>{String(cat)}</div> : null;
                      })()}
                      {/* Metadata: dynamic fields */}
                      {(current as any).metadata && Object.entries((current as any).metadata).map(([key, value]) => (
                        <div key={key} style={{ fontSize: 10, color: '#888', marginTop: 2 }}>
                          <span style={{ fontWeight: 600, textTransform: 'capitalize' }}>{key.replace(/([A-Z])/g, ' $1').replace(/^./, (str) => str.toUpperCase()).trim()}:</span> {String(value)}
                        </div>
                      ))}
                      {/* Admin Delete Button */}
                      {isAdmin && (current as any).source === 'user_submission' && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteArtwork(current.id, (current as any).firestoreId);
                          }}
                          style={{
                            marginTop: 8,
                            padding: '4px 8px',
                            background: '#fee2e2',
                            color: '#991b1b',
                            border: '1px solid #f87171',
                            borderRadius: 4,
                            fontSize: 10,
                            cursor: 'pointer'
                          }}
                        >
                          Delete (Admin)
                        </button>
                      )}
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
        <div style={{ position: "absolute", top: 0, bottom: 0, left: 0, width: 150, background: viewMode === 'gallery' ? 'transparent' : EM_BG, zIndex: 200, display: isMobile ? 'none' : 'flex', flexDirection: 'column', pointerEvents: 'auto', ...(DEBUG_LAYOUT ? { outline: "1px solid #964B00" } : {}) }}>
          {/* Left header: title + description + room selector */}
          <div style={{ padding: '8px 8px', borderBottom: '0px solid transparent', pointerEvents: 'auto', background: EM_BG }}>
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
              title={(exhibition as any)._exhibitionTitle || exhibition.title || exhibition.name}
            >
              <span style={{ display: 'inline-block', paddingRight: 18 }}>{(exhibition as any)._exhibitionTitle || exhibition.title || exhibition.name}</span>
            </div>
            <div
              style={{
                marginTop: 10,
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
              {(exhibition as any)._exhibitionDescription || exhibition.description || `${((exhibition as any)._exhibitionTitle || exhibition.title || exhibition.name)} — a short introduction to the exhibition.`}
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
                    archiveContainerHeightRef.current = el.clientHeight;
                  }
                }}
                className="no-scrollbar"
                style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch", padding: "6px 8px", overscrollBehavior: "none", msOverflowStyle: "none", scrollbarWidth: "none" }}
                onScroll={(e) => {
                  const el = e.currentTarget;
                  const currentScrollTop = el.scrollTop;

                  // Write to ref immediately — no React state lag
                  archiveScrollTopRef.current = currentScrollTop;

                  // Calculate which item is at center — immediate, no batching
                  const centerY = currentScrollTop + el.clientHeight / 2;
                  const centerIdx = Math.floor(centerY / ITEM_HEIGHT);
                  const clampedIdx = Math.max(0, Math.min(centerIdx, total - 1));
                  if (clampedIdx !== selectedIndex) {
                    setSelectedIndex(clampedIdx);
                  }

                  // Trigger virtualization re-render via RAF (throttled, not every scroll event)
                  if (archiveVirtualRafRef.current) cancelAnimationFrame(archiveVirtualRafRef.current);
                  archiveVirtualRafRef.current = requestAnimationFrame(() => {
                    setArchiveVirtualTick(t => t + 1);
                  });

                  // NMK/Reina Sofía infinite scroll: load more when near bottom
                  if ((exhibition.id === 'nmk-collection' || exhibition.id === 'reina-sofia-collection') && nmkFilteredResults === null) {
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
                    const startIdx = Math.max(0, Math.floor(archiveScrollTopRef.current / ITEM_HEIGHT) - BUFFER_COUNT);
                    const endIdx = Math.min(total, Math.ceil((archiveScrollTopRef.current + archiveContainerHeightRef.current) / ITEM_HEIGHT) + BUFFER_COUNT);
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
                            ) : (a.image || pickLowPlaceholder(a)) && (
                              <img
                                src={a.image || pickLowPlaceholder(a)}
                                alt={a.name}
                                loading="lazy"
                                decoding="async"
                                fetchPriority="low"
                                referrerPolicy="no-referrer"
                                style={{ width: "100%", height: "100%", display: "block", objectFit: "cover" }}
                                onError={(e) => applyFallbackImage(e.currentTarget, a.fallbackImages)}
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
          if (!isNarrow && variant !== 'sketch') {
            return (
              <div ref={(el) => { (topBarRef as any).current = el; (headerRef as any).current = el; }} style={{ position: "relative", padding: "8px 0", minHeight: topBarHeight, marginLeft: LAYOUT_LEFT_BASE + META_SHIFT, marginRight: 80, zIndex: 100, opacity: hoverZoom ? 0 : 1, transition: 'opacity 200ms ease', pointerEvents: hoverZoom ? 'none' : 'auto', ...(DEBUG_LAYOUT ? { outline: "1px dashed #00f" } : {}) }}>
                <span
                  onClick={() => { setViewMode('panorama'); setSelectedIndex(0); }}
                  style={{
                    fontSize: 12, lineHeight: 1, fontWeight: 700,
                    color: viewMode === 'panorama' ? EM_TEXT : EM_SUB,
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
                    color: viewMode === 'archive' ? EM_TEXT : EM_SUB,
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
                    color: viewMode === 'gallery' ? EM_TEXT : EM_SUB,
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
                      color: viewMode === 'panorama' ? EM_TEXT : EM_SUB,
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
                      color: viewMode === 'archive' ? EM_TEXT : EM_SUB,
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
                      color: viewMode === 'gallery' ? EM_TEXT : EM_SUB,
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
            <div ref={(el) => { (topBarRef as any).current = el; (headerRef as any).current = el; }} style={{ position: "relative", padding: variant === 'sketch' ? "14px 20px 12px 16px" : "8px 0", marginLeft: narrowMarginLeft, marginRight: narrowMarginRight, zIndex: 100, borderBottom: 'none', ...(DEBUG_LAYOUT ? { outline: "1px dashed #00f" } : {}) }}>
              {/* Row 1: Mode tabs */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: variant === 'sketch' ? 10 : 12, paddingBottom: 0, borderBottom: 'none' }}>
                <span
                  onClick={() => { setViewMode('panorama'); setSelectedIndex(0); }}
                  style={{
                    fontSize: 12, lineHeight: 1, fontWeight: 700,
                    color: viewMode === 'panorama' ? EM_TEXT : EM_SUB,
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
                    color: viewMode === 'archive' ? EM_TEXT : EM_SUB,
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
                    color: viewMode === 'gallery' ? EM_TEXT : EM_SUB,
                    cursor: "pointer", userSelect: "none", whiteSpace: "nowrap",
                    textDecoration: viewMode === 'gallery' ? 'underline' : 'none',
                  }}
                >
                  GALLERY
                </span>
              </div>

              {/* Row 2: Content under each tab - 3 columns */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, alignItems: "start", marginTop: variant === 'sketch' ? 2 : 0 }}>
                {/* Column 1: Room selector + Year filter + SEARCH (under PANORAMA) */}
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {/* ALL button - interaction updated */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: "6px 6px", flexWrap: 'wrap' }}>
                    <button
                      onClick={() => { setSelectedRoomId('ALL'); setSelectedCentury(null); setSelectedYearRange('ALL'); setSelectedTypes(new Set()); setSelectedCategories(new Set()); setSelectedIndex(0); }}
                      style={{ padding: '0 6px', minHeight: 22, fontSize: 10.5, fontWeight: 400, borderRadius: 4, border: 'none', background: (selectedRoomId === 'ALL' && !selectedCentury && selectedTypes.size === 0 && selectedCategories.size === 0) ? EM_BTN_ACTIVE_BG : EM_BTN_INACTIVE_BG, color: (selectedRoomId === 'ALL' && !selectedCentury && selectedTypes.size === 0 && selectedCategories.size === 0) ? EM_BTN_ACTIVE_FG : EM_BTN_INACTIVE_FG, cursor: 'pointer', transition: 'all 0.1s ease' }}
                    >ALL</button>
                    <span style={{ fontSize: 10, color: '#666' }}>({nmkTotalCount > 0 ? `${filteredArtworks.length.toLocaleString()} / ${nmkTotalCount.toLocaleString()}` : filteredArtworks.length.toLocaleString()})</span>
                  </div>
                  {/* Year/Century buttons - toggle approach */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: "6px 6px" }}>
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
                        style={{ padding: '0 6px', minHeight: 22, fontSize: 10.5, fontWeight: selectedCentury === c ? 500 : 400, borderRadius: 4, border: 'none', background: selectedCentury === c ? EM_BTN_ACTIVE_BG : EM_BTN_INACTIVE_BG, color: selectedCentury === c ? EM_BTN_ACTIVE_FG : EM_BTN_INACTIVE_FG, cursor: 'pointer', transition: 'all 0.1s ease' }}
                      >
                        {`${c}c`}
                      </button>
                    ))}
                  </div>
                  {/* Decade buttons - show when century selected */}
                  {selectedCentury && availableDecades.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: "6px 6px" }}>
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
                          style={{ padding: '0 6px', minHeight: 22, fontSize: 10.5, fontWeight: selectedYearRange === String(d) ? 500 : 400, borderRadius: 4, border: 'none', background: selectedYearRange === String(d) ? EM_BTN_ACTIVE_BG : EM_BTN_INACTIVE_BG, color: selectedYearRange === String(d) ? EM_BTN_ACTIVE_FG : EM_BTN_INACTIVE_FG, cursor: 'pointer', transition: 'all 0.1s ease' }}
                        >
                          {d}
                        </button>
                      ))}
                    </div>
                  )}
                  {/* 2D/3D buttons - only show if artworks have type field */}
                  {/* 2D/3D buttons - only show if artworks have type field */}
                  {hasCategorizedArtworks && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: "6px 6px" }}>
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
                          style={{ padding: '0 6px', minHeight: 22, fontSize: 10.5, fontWeight: selectedTypes.has(t) ? 500 : 400, borderRadius: 4, border: 'none', background: selectedTypes.has(t) ? EM_BTN_ACTIVE_BG : EM_BTN_INACTIVE_BG, color: selectedTypes.has(t) ? EM_BTN_ACTIVE_FG : EM_BTN_INACTIVE_FG, cursor: 'pointer', transition: 'all 0.1s ease' }}
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
                          style={{ padding: '0 6px', minHeight: 22, fontSize: 10.5, fontWeight: selectedTypes.has('N') ? 500 : 400, borderRadius: 4, border: 'none', background: selectedTypes.has('N') ? EM_BTN_ACTIVE_BG : EM_BTN_INACTIVE_BG, color: selectedTypes.has('N') ? EM_BTN_ACTIVE_FG : EM_BTN_INACTIVE_FG, cursor: 'pointer', transition: 'all 0.1s ease' }}
                        >
                          N
                        </button>
                      )}
                      {hasArchivalArtworks && (
                        <button
                          onClick={() => { setShowArtworksOnly(!showArtworksOnly); setSelectedIndex(0); }}
                          style={{ padding: '0 6px', minHeight: 22, fontSize: 10.5, fontWeight: showArtworksOnly ? 500 : 400, borderRadius: 4, border: 'none', background: showArtworksOnly ? EM_BTN_ACTIVE_BG : EM_BTN_INACTIVE_BG, color: showArtworksOnly ? EM_BTN_ACTIVE_FG : EM_BTN_INACTIVE_FG, cursor: 'pointer', transition: 'all 0.1s ease' }}
                        >
                          ARTWORKS ONLY
                        </button>
                      )}
                      {(hasOnViewArtworks || exhibition.id === 'guggenheim-bilbao-collection' || exhibition.id === 'kunsthaus-collection' || exhibition.id === 'khm-collection' || exhibition.id === 'ateneum-collection' || exhibition.id === 'mplus-collection-mplus' || exhibition.id === 'mplus-collection-sigg' || exhibition.id === 'mplus' || exhibition.id === 'met-ny-collection' || exhibition.id === 'nga-collection' || exhibition.id === 'getty-collection' || exhibition.id === 'getty' || exhibition.id === 'sfmoma-collection' || exhibition.id === 'cma-collection' || exhibition.id.includes('agnsw') || exhibition.id.includes('qagoma') || exhibition.id.includes('mca-australia') || exhibition.id.includes('mca-collection')) && (
                        <button
                          onClick={() => { setShowOnViewOnly(!showOnViewOnly); if (exhibition.id === 'nga-collection') setShowOpenAccessOnly(false); setSelectedIndex(0); }}
                          style={{ padding: '0 6px', minHeight: 22, fontSize: 10.5, fontWeight: showOnViewOnly ? 500 : 400, borderRadius: 4, border: 'none', background: showOnViewOnly ? EM_BTN_ACTIVE_BG : EM_BTN_INACTIVE_BG, color: showOnViewOnly ? EM_BTN_ACTIVE_FG : EM_BTN_INACTIVE_FG, cursor: 'pointer', transition: 'all 0.1s ease' }}
                        >
                          ON VIEW
                        </button>
                      )}
                      {exhibition.id === 'nga-collection' && (
                        <button
                          onClick={() => { setShowOpenAccessOnly(!showOpenAccessOnly); setShowOnViewOnly(false); setSelectedIndex(0); }}
                          style={{ padding: '0 6px', minHeight: 22, fontSize: 10.5, fontWeight: showOpenAccessOnly ? 500 : 400, borderRadius: 4, border: 'none', background: showOpenAccessOnly ? EM_BTN_ACTIVE_BG : EM_BTN_INACTIVE_BG, color: showOpenAccessOnly ? EM_BTN_ACTIVE_FG : EM_BTN_INACTIVE_FG, cursor: 'pointer', transition: 'all 0.1s ease' }}
                        >
                          OPEN ACCESS
                        </button>
                      )}
                      {(exhibition.id === 'getty-collection' || exhibition.id === 'getty') && hasOpenContentArtworks && (
                        <button
                          onClick={() => { setShowOpenContentOnly(!showOpenContentOnly); setSelectedIndex(0); }}
                          style={{ padding: '0 6px', minHeight: 22, fontSize: 10.5, fontWeight: showOpenContentOnly ? 500 : 400, borderRadius: 4, border: 'none', background: showOpenContentOnly ? EM_BTN_ACTIVE_BG : EM_BTN_INACTIVE_BG, color: showOpenContentOnly ? EM_BTN_ACTIVE_FG : EM_BTN_INACTIVE_FG, cursor: 'pointer', transition: 'all 0.1s ease' }}
                        >
                          OPEN CONTENT
                        </button>
                      )}
                      {hasMasterpieceArtworks && (
                        <button
                          onClick={() => { setShowMasterpieceOnly(!showMasterpieceOnly); setSelectedIndex(0); }}
                          style={{ padding: '0 6px', minHeight: 22, fontSize: 10.5, fontWeight: showMasterpieceOnly ? 500 : 400, borderRadius: 4, border: 'none', background: showMasterpieceOnly ? EM_BTN_ACTIVE_BG : EM_BTN_INACTIVE_BG, color: showMasterpieceOnly ? EM_BTN_ACTIVE_FG : EM_BTN_INACTIVE_FG, cursor: 'pointer', transition: 'all 0.1s ease' }}
                        >
                          MASTERPIECE
                        </button>
                      )}
                      {(hasPublicDomainArtworks || exhibition.id === 'ateneum-collection') && exhibition.id !== 'getty-collection' && exhibition.id !== 'getty' && (
                        <button
                          onClick={() => { setShowPublicDomainOnly(!showPublicDomainOnly); setSelectedIndex(0); }}
                          style={{ padding: '0 6px', minHeight: 22, fontSize: 10.5, fontWeight: showPublicDomainOnly ? 500 : 400, borderRadius: 4, border: 'none', background: showPublicDomainOnly ? EM_BTN_ACTIVE_BG : EM_BTN_INACTIVE_BG, color: showPublicDomainOnly ? EM_BTN_ACTIVE_FG : EM_BTN_INACTIVE_FG, cursor: 'pointer', transition: 'all 0.1s ease' }}
                        >
                          PUBLIC DOMAIN
                        </button>
                      )}
                      {(exhibition.id === 'dpg-1' || exhibition.id === 'mmca-collection' || exhibition.id === 'rijksmuseum-paintings' || exhibition.id === 'rijksmuseum-photography' || exhibition.id === 'rijksmuseum-drawings' || exhibition.id === 'rijksmuseum-prints' || exhibition.id === 'rijksmuseum-prints2') && (
                        <button
                          onClick={() => { setShowOnDisplayOnly(!showOnDisplayOnly); setSelectedIndex(0); }}
                          style={{ padding: '0 6px', minHeight: 22, fontSize: 10.5, fontWeight: showOnDisplayOnly ? 500 : 400, borderRadius: 4, border: 'none', background: showOnDisplayOnly ? EM_BTN_ACTIVE_BG : EM_BTN_INACTIVE_BG, color: showOnDisplayOnly ? EM_BTN_ACTIVE_FG : EM_BTN_INACTIVE_FG, cursor: 'pointer', transition: 'all 0.1s ease' }}
                        >
                          ON DISPLAY
                        </button>
                      )}
                      {(hasHighlightArtworks || exhibition.id === 'adachi-collection') && (
                        <button
                          onClick={() => { setShowHighlightOnly(!showHighlightOnly); setSelectedIndex(0); }}
                          style={{ padding: '0 6px', minHeight: 22, fontSize: 10.5, fontWeight: showHighlightOnly ? 500 : 400, borderRadius: 4, border: 'none', background: showHighlightOnly ? EM_BTN_ACTIVE_BG : EM_BTN_INACTIVE_BG, color: showHighlightOnly ? EM_BTN_ACTIVE_FG : EM_BTN_INACTIVE_FG, cursor: 'pointer', transition: 'all 0.1s ease' }}
                        >
                          HIGHLIGHT
                        </button>
                      )}
                    </div>
                  )}
                  {hasCategorizedArtworks && selectedTypes.size > 0 && (
                    <>
                      {availableCategories.length > 0 ? (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: "6px 6px", marginTop: 10 }}>
                          {availableCategories.map(cat => (
                            <button
                              key={`narrow-cat-${cat}`}
                              onClick={() => { setSelectedCategories(prev => { const next = new Set(prev); if (next.has(cat)) next.delete(cat); else next.add(cat); return next; }); setSelectedIndex(0); }}
                              style={{ padding: '0 6px', minHeight: 22, fontSize: 10.5, fontWeight: selectedCategories.has(cat) ? 500 : 400, borderRadius: 4, border: 'none', background: selectedCategories.has(cat) ? EM_BTN_ACTIVE_BG : EM_BTN_INACTIVE_BG, color: selectedCategories.has(cat) ? EM_BTN_ACTIVE_FG : EM_BTN_INACTIVE_FG, cursor: 'pointer', transition: 'all 0.1s ease' }}
                            >
                              {CATEGORY_LABEL_MAP[cat] || cat}
                            </button>
                          ))}
                        </div>
                      ) : (
                        availableTechniqueFacets.length > 0 && (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: "6px 6px", marginTop: 10 }}>
                            {availableTechniqueFacets.map((f) => (
                              <button
                                key={`narrow-facet-${f.id}`}
                                onClick={() => { setSelectedMediumFacets(prev => { const next = new Set(prev); if (next.has(f.id)) next.delete(f.id); else next.add(f.id); return next; }); setSelectedIndex(0); }}
                                style={{ padding: '0 6px', minHeight: 22, fontSize: 10.5, fontWeight: selectedMediumFacets.has(f.id) ? 500 : 400, borderRadius: 4, border: 'none', background: selectedMediumFacets.has(f.id) ? EM_BTN_ACTIVE_BG : EM_BTN_INACTIVE_BG, color: selectedMediumFacets.has(f.id) ? EM_BTN_ACTIVE_FG : EM_BTN_INACTIVE_FG, cursor: 'pointer', transition: 'all 0.1s ease' }}
                                title={`${f.label} (${f.count.toLocaleString()})`}
                              >
                                {f.label}
                              </button>
                            ))}
                          </div>
                        )
                      )}
                    </>
                  )}
                  {/* SEARCH */}
                  <div style={{ marginTop: 45 }}>
                    {!searchQuery && <div style={{ fontSize: 10, letterSpacing: 1.2, color: "#888", marginBottom: -10 }}>SEARCH</div>}
                    <SearchInputWithSuggestions
                      value={searchQuery}
                      onChange={(val) => { setSearchQuery(val); setSelectedIndex(0); }}
                      suggestions={recommendedTerms}
                      placeholder=""
                      style={{
                        width: '100%',
                        maxWidth: 100,
                      }}
                      inputStyle={{
                        fontSize: 11,
                        color: EM_TEXT,
                        border: 'none',
                        borderBottom: `1px solid ${EM_BORDER}`,
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
                    <div style={{ fontSize: 11, color: "#222", lineHeight: 1.3, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{(() => {
                      const isUnknown = !creatorText || creatorText === '—' || creatorText.toLowerCase() === 'unknown artist' || creatorText.toLowerCase() === 'unknown';
                      return isUnknown ? creatorText : (
                        <span
                          onClick={(e) => { e.stopPropagation(); window.dispatchEvent(new CustomEvent('open-artist-gallery', { detail: { artist: creatorText } })); }}
                          style={{ cursor: 'pointer', borderBottom: '1px solid rgba(0,0,0,0.15)', transition: 'color 0.2s, border-color 0.2s' }}
                          onMouseEnter={e => { e.currentTarget.style.color = '#c9a55a'; e.currentTarget.style.borderColor = '#c9a55a'; }}
                          onMouseLeave={e => { e.currentTarget.style.color = '#222'; e.currentTarget.style.borderColor = 'rgba(0,0,0,0.15)'; }}
                          title="View Artist Page"
                        >{creatorText}</span>
                      );
                    })()}</div>
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
        {!isNarrow && variant !== 'sketch' && (
          <div style={{ position: 'absolute', left: selectorLeft, top: selectorTop, width: selectorWidth, zIndex: 110 }}>
            {/* Always show ALL button with count for collections */}
            <div style={{ marginBottom: 4, display: 'flex', alignItems: 'center', gap: "6px 6px" }}>
              <button
                onClick={() => { setSelectedRoomId('ALL'); setSelectedCentury(null); setSelectedYearRange('ALL'); setSelectedTypes(new Set()); setSelectedCategories(new Set()); setSelectedIndex(0); }}
                style={{ padding: '0 6px', minHeight: 22, fontSize: 10.5, fontWeight: 400, borderRadius: 4, border: 'none', background: (selectedRoomId === 'ALL' && !selectedCentury && selectedTypes.size === 0 && selectedCategories.size === 0) ? EM_BTN_ACTIVE_BG : EM_BTN_INACTIVE_BG, color: (selectedRoomId === 'ALL' && !selectedCentury && selectedTypes.size === 0 && selectedCategories.size === 0) ? EM_BTN_ACTIVE_FG : EM_BTN_INACTIVE_FG, cursor: 'pointer', transition: 'all 0.1s ease' }}
              >ALL</button>
              <span style={{ fontSize: 10, color: '#666' }}>({nmkTotalCount > 0 ? `${filteredArtworks.length.toLocaleString()} / ${nmkTotalCount.toLocaleString()}` : filteredArtworks.length.toLocaleString()})</span>
            </div>
            {/* Room selector - only show if rooms exist */}
            {roomButtons.length > 0 && (
              <div style={{ width: '100%' }}>
                {/* Unified gallery-style room selector for all modes */}
                {(selectorData.rows.length > 0 ? selectorData.rows : []).map((row, rIdx) => (
                  <div key={`row-${rIdx}`} style={{ display: 'grid', gridTemplateColumns: `repeat(${row.length}, ${SELECTOR_COL_WIDTH}px)`, columnGap: SELECTOR_COL_GAP, rowGap: 6, justifyContent: 'start', marginBottom: 1 }}>
                    {row.map((btn) => (
                      <button key={btn.id} onClick={() => { if (btn.exists) { setSelectedRoomId(prev => (prev === btn.id ? 'ALL' : btn.id)); setSelectedIndex(0); } }} disabled={!btn.exists} style={{ width: '100%', minHeight: 22, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 0, fontSize: 9.5, fontWeight: selectedRoomId === btn.id ? 500 : 400, borderRadius: 4, border: btn.exists ? 'none' : `1px dashed ${EM_BORDER}`, background: btn.exists ? (selectedRoomId === btn.id ? EM_BTN_ACTIVE_BG : EM_BTN_INACTIVE_BG) : (isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)'), color: btn.exists ? (selectedRoomId === btn.id ? EM_BTN_ACTIVE_FG : EM_BTN_INACTIVE_FG) : (isDark ? 'rgba(255,255,255,0.38)' : 'rgba(0,0,0,0.38)'), opacity: btn.exists ? 1 : 0.75, cursor: btn.exists ? 'pointer' : 'default', boxSizing: 'border-box', transition: 'all 0.1s ease' }}>
                        {btn.label}
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            )}

            {/* Year filtering buttons - toggle-based approach */}
            <div style={{ marginTop: 10, padding: '2px 0' }}>
              {/* Century buttons - always show, click to toggle */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: "6px 6px" }}>
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
                      minHeight: 22,
                      fontSize: 10.5,
                      fontWeight: selectedCentury === c ? 500 : 400,
                      borderRadius: 4,
                      border: 'none',
                      background: selectedCentury === c ? EM_BTN_ACTIVE_BG : EM_BTN_INACTIVE_BG,
                      color: selectedCentury === c ? EM_BTN_ACTIVE_FG : EM_BTN_INACTIVE_FG,
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
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: "6px 6px", marginTop: 10 }}>
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
                        minHeight: 22,
                        fontSize: 10.5,
                        fontWeight: selectedYearRange === String(d) ? 500 : 400,
                        borderRadius: 4,
                        border: 'none',
                        background: selectedYearRange === String(d) ? EM_BTN_ACTIVE_BG : EM_BTN_INACTIVE_BG,
                        color: selectedYearRange === String(d) ? EM_BTN_ACTIVE_FG : EM_BTN_INACTIVE_FG,
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
              {/* 2D/3D type filter + Status Filters + ARTWORKS ONLY - shown when relevant */}
              {/* Desktop (Gallery/Archive) Filter Row */}
              <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: "6px 6px" }}>
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
                    style={{ padding: '0 6px', minHeight: 22, fontSize: 10.5, fontWeight: selectedTypes.has(t) ? 500 : 400, borderRadius: 4, border: 'none', background: selectedTypes.has(t) ? EM_BTN_ACTIVE_BG : EM_BTN_INACTIVE_BG, color: selectedTypes.has(t) ? EM_BTN_ACTIVE_FG : EM_BTN_INACTIVE_FG, cursor: 'pointer', transition: 'all 0.1s ease' }}
                  >
                    {t}
                  </button>
                ))}
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
                    style={{ padding: '0 6px', minHeight: 22, fontSize: 10.5, fontWeight: selectedTypes.has('N') ? 500 : 400, borderRadius: 4, border: 'none', background: selectedTypes.has('N') ? EM_BTN_ACTIVE_BG : EM_BTN_INACTIVE_BG, color: selectedTypes.has('N') ? EM_BTN_ACTIVE_FG : EM_BTN_INACTIVE_FG, cursor: 'pointer', transition: 'all 0.1s ease' }}
                  >
                    N
                  </button>
                )}
                {hasArchivalArtworks && (
                  <button
                    onClick={() => { setShowArtworksOnly(!showArtworksOnly); setSelectedIndex(0); }}
                    style={{ padding: '0 6px', minHeight: 22, fontSize: 10.5, fontWeight: showArtworksOnly ? 500 : 400, borderRadius: 4, border: 'none', background: showArtworksOnly ? EM_BTN_ACTIVE_BG : EM_BTN_INACTIVE_BG, color: showArtworksOnly ? EM_BTN_ACTIVE_FG : EM_BTN_INACTIVE_FG, cursor: 'pointer', transition: 'all 0.1s ease' }}
                  >
                    ARTWORKS ONLY
                  </button>
                )}
                {(hasOnViewArtworks || exhibition.id === 'guggenheim-bilbao-collection' || exhibition.id === 'kunsthaus-collection' || exhibition.id === 'khm-collection' || exhibition.id === 'ateneum-collection' || exhibition.id === 'ng-1' || exhibition.id.includes('agnsw') || exhibition.id.includes('qagoma') || exhibition.id.includes('mca-australia') || exhibition.id.includes('mca-collection')) && (
                  <button
                    onClick={() => { setShowOnViewOnly(!showOnViewOnly); setSelectedIndex(0); }}
                    style={{ padding: '0 6px', minHeight: 22, fontSize: 10.5, fontWeight: showOnViewOnly ? 500 : 400, borderRadius: 4, border: 'none', background: showOnViewOnly ? EM_BTN_ACTIVE_BG : EM_BTN_INACTIVE_BG, color: showOnViewOnly ? EM_BTN_ACTIVE_FG : EM_BTN_INACTIVE_FG, cursor: 'pointer', transition: 'all 0.1s ease' }}
                  >
                    ON VIEW
                  </button>
                )}
                {hasMasterpieceArtworks && (
                  <button
                    onClick={() => { setShowMasterpieceOnly(!showMasterpieceOnly); setSelectedIndex(0); }}
                    style={{ padding: '0 6px', minHeight: 22, fontSize: 10.5, fontWeight: showMasterpieceOnly ? 500 : 400, borderRadius: 4, border: 'none', background: showMasterpieceOnly ? EM_BTN_ACTIVE_BG : EM_BTN_INACTIVE_BG, color: showMasterpieceOnly ? EM_BTN_ACTIVE_FG : EM_BTN_INACTIVE_FG, cursor: 'pointer', transition: 'all 0.1s ease' }}
                  >
                    MASTERPIECE
                  </button>
                )}
                {(hasPublicDomainArtworks || exhibition.id === 'ateneum-collection') && (
                  <button
                    onClick={() => { setShowPublicDomainOnly(!showPublicDomainOnly); setSelectedIndex(0); }}
                    style={{ padding: '0 6px', minHeight: 22, fontSize: 10.5, fontWeight: showPublicDomainOnly ? 500 : 400, borderRadius: 4, border: 'none', background: showPublicDomainOnly ? EM_BTN_ACTIVE_BG : EM_BTN_INACTIVE_BG, color: showPublicDomainOnly ? EM_BTN_ACTIVE_FG : EM_BTN_INACTIVE_FG, cursor: 'pointer', transition: 'all 0.1s ease' }}
                  >
                    PUBLIC DOMAIN
                  </button>
                )}
                {(exhibition.id === 'dpg-1' || exhibition.id === 'mmca-collection' || exhibition.id === 'rijksmuseum-paintings' || exhibition.id === 'rijksmuseum-photography') && (
                  <button
                    onClick={() => { setShowOnDisplayOnly(!showOnDisplayOnly); setSelectedIndex(0); }}
                    style={{ padding: '0 6px', minHeight: 22, fontSize: 10.5, fontWeight: showOnDisplayOnly ? 500 : 400, borderRadius: 4, border: 'none', background: showOnDisplayOnly ? EM_BTN_ACTIVE_BG : EM_BTN_INACTIVE_BG, color: showOnDisplayOnly ? EM_BTN_ACTIVE_FG : EM_BTN_INACTIVE_FG, cursor: 'pointer', transition: 'all 0.1s ease' }}
                  >
                    ON DISPLAY
                  </button>
                )}
                {(hasHighlightArtworks || exhibition.id === 'adachi-collection') && (
                  <button
                    onClick={() => { setShowHighlightOnly(!showHighlightOnly); setSelectedIndex(0); }}
                    style={{ padding: '0 6px', minHeight: 22, fontSize: 10.5, fontWeight: showHighlightOnly ? 500 : 400, borderRadius: 4, border: 'none', background: showHighlightOnly ? EM_BTN_ACTIVE_BG : EM_BTN_INACTIVE_BG, color: showHighlightOnly ? EM_BTN_ACTIVE_FG : EM_BTN_INACTIVE_FG, cursor: 'pointer', transition: 'all 0.1s ease' }}
                  >
                    HIGHLIGHT
                  </button>
                )}
              </div>

              {/* Sub-items (Categories OR Medium) - prioritized */}
              {hasCategorizedArtworks && selectedTypes.size > 0 && (
                <>
                  {availableCategories.length > 0 ? (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: "6px 6px", marginTop: 10 }}>
                      {availableCategories.map(cat => (
                        <button
                          key={`cat-${cat}`}
                          onClick={() => { setSelectedCategories(prev => { const next = new Set(prev); if (next.has(cat)) next.delete(cat); else next.add(cat); return next; }); setSelectedIndex(0); }}
                          style={{ padding: '0 6px', minHeight: 22, fontSize: 10.5, fontWeight: selectedCategories.has(cat) ? 500 : 400, borderRadius: 4, border: 'none', background: selectedCategories.has(cat) ? EM_BTN_ACTIVE_BG : EM_BTN_INACTIVE_BG, color: selectedCategories.has(cat) ? EM_BTN_ACTIVE_FG : EM_BTN_INACTIVE_FG, cursor: 'pointer', transition: 'all 0.1s ease' }}
                        >
                          {CATEGORY_LABEL_MAP[cat] || cat}
                        </button>
                      ))}
                    </div>
                  ) : (
                    availableTechniqueFacets.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: "6px 6px", marginTop: 10 }}>
                        {availableTechniqueFacets.map((f) => (
                          <button
                            key={`facet-${f.id}`}
                            onClick={() => { setSelectedMediumFacets(prev => { const next = new Set(prev); if (next.has(f.id)) next.delete(f.id); else next.add(f.id); return next; }); setSelectedIndex(0); }}
                            style={{ padding: '0 6px', minHeight: 22, fontSize: 10.5, fontWeight: selectedMediumFacets.has(f.id) ? 500 : 400, borderRadius: 4, border: 'none', background: selectedMediumFacets.has(f.id) ? EM_BTN_ACTIVE_BG : EM_BTN_INACTIVE_BG, color: selectedMediumFacets.has(f.id) ? EM_BTN_ACTIVE_FG : EM_BTN_INACTIVE_FG, cursor: 'pointer', transition: 'all 0.1s ease' }}
                            title={`${f.label} (${f.count.toLocaleString()})`}
                          >
                            {f.label}
                          </button>
                        ))}
                      </div>
                    )
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {/* Artwork meta info (below the top bar, aligned to Gallery/Archive; dynamic per selected artwork) */}
        {/* Hide on narrow screens - included in the 3-column layout above */}
        {/* When zoomed, inner content animates up to top position (replace mode tabs), but container stays in place */}
        {!isNarrow && variant !== 'sketch' && (viewMode === 'archive' || viewMode === 'gallery' || viewMode === 'panorama') && (
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

              // Helper to clean dimensions to "N x M" format
              const cleanDimensions = (txt: string | undefined): string => {
                if (!txt) return "—";
                // Extract first occurrence of "number x number" (optionally 3rd number)
                // Normalize '×' to 'x'
                const match = txt.match(/(\d+(?:\.\d+)?\s*[x×]\s*\d+(?:\.\d+)?(?:\s*[x×]\s*\d+(?:\.\d+)?)?)/);
                if (match) return match[1].replace(/\s*[x×]\s*/g, ' x ');
                return txt;
              };

              const dimensionText = cleanDimensions(activeArtwork?.dimension);
              const durationText = activeArtwork?.duration || null;  // Video/film duration
              // Medium/Technique/Materials
              const mediumRaw = (activeArtwork as Record<string, unknown>)?.medium || (activeArtwork as Record<string, unknown>)?.technique || (activeArtwork as Record<string, unknown>)?.materials || null;
              // Category/ArtworkType
              const categoryRaw = (activeArtwork as Record<string, unknown>)?.category || (activeArtwork as Record<string, unknown>)?.artworkType || (activeArtwork as Record<string, unknown>)?.objectType || null;

              // Heuristic: some datasets put a genre/category term (e.g. "书法") into `medium`.
              // If category is missing/generic, promote medium->category.
              let mediumText = mediumRaw ? String(mediumRaw) : '';
              let categoryText = categoryRaw ? String(categoryRaw) : '';
              const categoryIsGeneric = !categoryText || categoryText === 'Artwork' || categoryText === '—';
              const mediumLooksLikeCategory = /\b(painting|drawing|print|prints|calligraphy|photography|sculpture|installation|video|film|new\s*media)\b/i.test(mediumText)
                || /[\u4e00-\u9fff]/.test(mediumText) && /(\u4e66\u6cd5|\u7ed8\u753b|\u7248\u753b|\u6444\u5f71|\u6cb9\u753b|\u6c34\u58a8|\u56fd\u753b|\u7d20\u63cf|\u96d5\u5851|\u88c5\u7f6e|\u5f71\u50cf)/.test(mediumText);
              if (categoryIsGeneric && mediumText && mediumLooksLikeCategory) {
                categoryText = mediumText;
                mediumText = '';
              }
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
                    <div style={{ fontSize: 12, color: "#222", lineHeight: 1.3, whiteSpace: "normal", wordBreak: "break-word", overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', maxHeight: 36 }}>{(() => {
                      const isUnknown = !creatorText || creatorText === '—' || creatorText.toLowerCase() === 'unknown artist' || creatorText.toLowerCase() === 'unknown';
                      return isUnknown ? creatorText : (
                        <span
                          onClick={(e) => { e.stopPropagation(); window.dispatchEvent(new CustomEvent('open-artist-gallery', { detail: { artist: creatorText } })); }}
                          style={{ cursor: 'pointer', borderBottom: '1px solid rgba(0,0,0,0.15)', transition: 'color 0.2s, border-color 0.2s' }}
                          onMouseEnter={e => { e.currentTarget.style.color = '#c9a55a'; e.currentTarget.style.borderColor = '#c9a55a'; }}
                          onMouseLeave={e => { e.currentTarget.style.color = '#222'; e.currentTarget.style.borderColor = 'rgba(0,0,0,0.15)'; }}
                          title="View Artist Page"
                        >{creatorText}</span>
                      );
                    })()}</div>
                  </div>
                  {/* CATEGORY (below CREATOR) */}
                  <div style={{ position: "absolute", left: metaPos.creator, top: 70, maxWidth: creatorW, transform: `translateY(${zoomYOffset}px)`, transition: 'transform 300ms ease', zIndex: hoverZoom ? 200 : undefined }}>
                    <div style={{ fontSize: 10, letterSpacing: 1.2, color: "#888", marginBottom: 4 }}>CATEGORY</div>
                    <div style={{ fontSize: 12, color: "#222", lineHeight: 1.3, whiteSpace: "normal", wordBreak: "break-word", overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', maxHeight: 36 }}>{categoryText ? String(categoryText) : "—"}</div>
                  </div>
                  {/* SEARCH (next to CATEGORY) */}
                  <div style={{ position: "absolute", left: metaPos.date, top: 70, width: 140, transform: `translateY(${zoomYOffset}px)`, transition: 'transform 300ms ease', zIndex: hoverZoom ? 200 : undefined }}>
                    {!searchQuery && <div style={{ fontSize: 10, letterSpacing: 1.2, color: "#888", marginBottom: -4 }}>SEARCH</div>}
                    <SearchInputWithSuggestions
                      value={searchQuery}
                      onChange={(val) => { setSearchQuery(val); setSelectedIndex(0); }}
                      suggestions={recommendedTerms}
                      placeholder=""
                      style={{
                        width: '100%',
                        marginTop: -2,
                      }}
                      inputStyle={{
                        fontSize: 12,
                        color: '#222',
                        border: 'none',
                        borderBottom: '1px solid #ccc',
                        outline: 'none',
                        background: 'transparent',
                        padding: '0',
                        lineHeight: 1,
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
                    <div style={{ fontSize: 10, letterSpacing: 1.2, color: "#888", marginBottom: 4 }}>{durationText ? 'DURATION' : 'DIMENSIONS'}</div>
                    <div style={{ fontSize: 12, color: "#222", lineHeight: 1.3, whiteSpace: "normal", wordBreak: "break-word", overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', maxHeight: 36 }}>{durationText || dimensionText}</div>
                  </div>
                </>
              );
            })()}
          </div>
        )}

        {/* Top Right Controls Group: Heart, Login, Close - aligned with mode tabs */}
        <div style={{ position: "absolute", top: (!isMobile && variant !== 'sketch') ? 14 : 7, right: 0, display: "flex", alignItems: "center", gap: 20, paddingRight: 16, zIndex: 220 }}>
          {/* Close Button */}
          {!inline && (<button
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
          </button>)}
        </div>



        {/* Content area */}
        <div style={{
          flex: 1,
          display: "flex",
          flexDirection: viewMode === 'gallery' ? 'column' : 'row',
          minHeight: 0,
          maxHeight: '100%',
          paddingLeft: viewMode === 'archive' && variant !== 'sketch' ? 150 : 0,
          position: 'relative',
          overflow: viewMode === 'gallery' ? 'hidden' : undefined
        }}>

          {viewMode === 'archive' ? (
            <>
              {/* Middle info panel (floats next to selected thumbnail position) */}
              <div ref={infoPanelRef} style={{ width: 260, background: "#fff", padding: "12px 10px 12px 12px", position: "relative" }}>
                {current ? (
                  <div style={{ position: "fixed", top: "50%", left: infoTextLeft, width: 240, transform: "translateY(-50%)", color: "#222", lineHeight: 1.5, zIndex: 10 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={current.name}>
                      {current.name}{current.year ? ` (${cleanDateText(String(current.year))})` : ""}
                    </div>
                    {/* Medium/Technique/Materials */}
                    {(() => {
                      const med = (current as Record<string, unknown>).medium || (current as Record<string, unknown>).technique || (current as Record<string, unknown>).materials;
                      return med ? <div style={{ fontSize: 10.5, color: '#888', marginBottom: 2 }}>{String(med)}</div> : null;
                    })()}
                    <div style={{ fontSize: 11.5, color: "#666" }}>{(() => {
                      const artistStr = cleanArtistName(current.artist);
                      const isUnknown = !artistStr || artistStr.toLowerCase() === 'unknown artist' || artistStr.toLowerCase() === 'unknown';
                      return isUnknown ? (artistStr || '') : (
                        <span
                          onClick={(e) => { e.stopPropagation(); window.dispatchEvent(new CustomEvent('open-artist-gallery', { detail: { artist: artistStr } })); }}
                          style={{ cursor: 'pointer', borderBottom: '1px solid rgba(100,100,100,0.25)', transition: 'color 0.2s, border-color 0.2s' }}
                          onMouseEnter={e => { e.currentTarget.style.color = '#c9a55a'; e.currentTarget.style.borderColor = '#c9a55a'; }}
                          onMouseLeave={e => { e.currentTarget.style.color = '#666'; e.currentTarget.style.borderColor = 'rgba(100,100,100,0.25)'; }}
                          title="View Artist Page"
                        >{artistStr}</span>
                      );
                    })()}</div>
                    {/* Category/ArtworkType */}
                    {(() => {
                      const cat = (current as Record<string, unknown>).category || (current as Record<string, unknown>).artworkType;
                      return cat ? <div style={{ fontSize: 10.5, color: '#888', marginTop: 2 }}>{String(cat)}</div> : null;
                    })()}
                    {/* Metadata: dynamic fields */}
                    {(current as any).metadata && Object.entries((current as any).metadata).map(([key, value]) => (
                      <div key={key} style={{ fontSize: 10.5, color: '#888', marginTop: 2 }}>
                        <span style={{ fontWeight: 600, textTransform: 'capitalize' }}>{key.replace(/([A-Z])/g, ' $1').replace(/^./, (str) => str.toUpperCase()).trim()}:</span> {String(value)}
                      </div>
                    ))}
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
                  onWheel={(e) => {
                    wheelAccumulator.current += e.deltaY;
                    if (Math.abs(wheelAccumulator.current) > 60) {
                      const direction = Math.sign(wheelAccumulator.current);
                      // direction 1 -> deltaY > 0 -> Scroll Down -> Next Item
                      // direction -1 -> deltaY < 0 -> Scroll Up -> Prev Item
                      const next = selectedIndex + direction;
                      if (next >= 0 && next < filteredArtworks.length) {
                        setSelectedIndex(next);
                        wheelAccumulator.current = 0;
                      }
                    }
                  }}
                  onTouchStart={(e) => {
                    touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
                  }}
                  onTouchEnd={(e) => {
                    if (!touchStartRef.current) return;
                    const diff = touchStartRef.current.x - e.changedTouches[0].clientX;
                    if (Math.abs(diff) > 50) {
                      const direction = diff > 0 ? 1 : -1;
                      const next = selectedIndex + direction;
                      if (next >= 0 && next < filteredArtworks.length) {
                        setSelectedIndex(next);
                      }
                    }
                    touchStartRef.current = null;
                  }}
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
                      const isPanorama = !!(mainNatural && mainNatural.w > 0 && mainNatural.h > 0 && (mainNatural.w / mainNatural.h) > 3);
                      const stageMaxH = "calc(100vh - 360px)";

                      // Mobile: simple img without srcset to reduce memory and computation
                      if (isMobile) {
                        const sourceUrl = (current as any).sourceUrl;
                        return (
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                            <div
                              className={isPanorama ? 'no-scrollbar' : undefined}
                              style={{
                                maxWidth: '100%',
                                overflowX: 'visible',
                                overflowY: 'visible',
                              }}
                            >
                              <img
                                ref={mainImgRef}
                                src={lowSrc}
                                alt={current.name}
                                decoding="async"
                                referrerPolicy="no-referrer"
                                style={{
                                  width: 'auto',
                                  height: isPanorama ? stageMaxH : 'auto',
                                  maxWidth: isPanorama ? 'none' : '100%',
                                  maxHeight: stageMaxH,
                                  objectFit: 'contain',
                                  display: 'block',
                                  background: 'transparent',
                                  cursor: exhibition.id === 'reina-sofia-collection' && sourceUrl ? 'pointer' : undefined,
                                }}
                                onLoad={(e) => {
                                  const w = e.currentTarget.naturalWidth || 0;
                                  const h = e.currentTarget.naturalHeight || 0;
                                  if (w > 0 && h > 0) setMainNatural({ w, h });
                                }}
                                onClick={() => {
                                  // Reina Sofía: open sourceUrl directly instead of lightbox
                                  if (exhibition.id === 'reina-sofia-collection' && sourceUrl) {
                                    window.open(sourceUrl, '_blank', 'noopener,noreferrer');
                                    return;
                                  }
                                  if (hoverZoom) {
                                    closeHoverZoomFromOverlay();
                                  } else {
                                    const zoomUrl = (current as any).lightboxImage || (current as any).originalImage || current.image || pickLowPlaceholder(current);
                                    setHoverZoom({ artwork: current, imageUrl: zoomUrl, animate: false });
                                    requestAnimationFrame(() => {
                                      requestAnimationFrame(() => {
                                        setHoverZoom((s: any) => (s ? { ...s, animate: true } : s));
                                      });
                                    });
                                  }
                                }}
                                onError={(e) => applyFallbackImage(e.currentTarget, current.fallbackImages)}
                              />
                            </div>
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
                          <div
                            className={isPanorama ? 'no-scrollbar' : undefined}
                            style={{
                              maxWidth: '100%',
                              overflowX: isPanorama ? 'auto' : 'visible',
                              overflowY: 'visible',
                            }}
                          >
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
                                  height: isPanorama ? stageMaxH : "auto",
                                  maxWidth: "100%",
                                  maxHeight: stageMaxH,
                                  objectFit: "contain",
                                  cursor: exhibition.id === 'reina-sofia-collection' && sourceUrl ? 'pointer' : 'zoom-in',
                                  display: "block",
                                  filter: mainLoaded ? 'none' : 'blur(14px)',
                                  transition: 'filter 420ms ease, opacity 420ms ease',
                                  opacity: mainLoaded ? 1 : 0.88,
                                  background: 'transparent',
                                }}
                                onClick={() => {
                                  // Reina Sofía: open sourceUrl directly instead of lightbox
                                  if (exhibition.id === 'reina-sofia-collection' && sourceUrl) {
                                    window.open(sourceUrl, '_blank', 'noopener,noreferrer');
                                    return;
                                  }
                                  if (hoverZoom) {
                                    closeHoverZoomFromOverlay();
                                  } else {
                                    const zoomUrl = (current as any).lightboxImage || (current as any).originalImage || current.image || pickLowPlaceholder(current);
                                    setHoverZoom({ artwork: current, imageUrl: zoomUrl, animate: false });
                                    requestAnimationFrame(() => {
                                      requestAnimationFrame(() => {
                                        setHoverZoom((s: any) => (s ? { ...s, animate: true } : s));
                                      });
                                    });
                                  }
                                }}
                                onLoad={(e) => {
                                  const w = e.currentTarget.naturalWidth || 0;
                                  const h = e.currentTarget.naturalHeight || 0;
                                  if (w > 0 && h > 0) setMainNatural({ w, h });
                                  if ((e.currentTarget.getAttribute('data-hi') === '1') && !mainLoaded) {
                                    setMainLoaded(true);
                                  }
                                }}
                                onError={(e) => {
                                  applyFallbackImage(e.currentTarget, current.fallbackImages);
                                  if (!mainLoaded) setMainLoaded(true);
                                }}
                              />
                            </picture>
                          </div>
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
                    <div style={{ position: "absolute", bottom: 16, right: 16, zIndex: 30, display: 'flex', gap: 8 }} className="hover-trigger">
                      {/* POD Product Purchase Button - Left */}
                      <div
                        className="product-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          setProductArtwork(current);
                        }}
                        style={{
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          transition: 'opacity 0.2s, transform 0.15s ease',
                          zIndex: 20,
                          opacity: 0
                        }}
                        title="상품으로 구매하기"
                      >
                        <svg
                          width={20}
                          height={20}
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="#fff"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          style={{ filter: 'drop-shadow(0 0 2px rgba(0,0,0,0.5))' }}
                        >
                          <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                          <rect x="7" y="7" width="10" height="10" />
                        </svg>
                      </div>
                      {/* Comment Button */}
                      <div
                        className="comment-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          setCommentArtwork(current);
                        }}
                        style={{
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          transition: 'opacity 0.2s, transform 0.15s ease',
                          zIndex: 20,
                          opacity: 0,
                          color: '#fff'
                        }}
                        title="Comments"
                      >
                        <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ filter: 'drop-shadow(0 0 2px rgba(0,0,0,0.5))' }}>
                          <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                        </svg>
                      </div>
                      {/* Heart - Right */}
                      <HeartOverlay
                        isLiked={likedArtworks.has(String(current.id))}
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
                        .hover-trigger:hover .heart-btn, .hover-trigger:hover .product-btn, .hover-trigger:hover .comment-btn { opacity: 1 !important; transform: scale(1.1); }
                        div:hover > .hover-trigger .heart-btn, div:hover > .hover-trigger .product-btn, div:hover > .hover-trigger .comment-btn { opacity: 1 !important; }
                      `}</style>
                    </div>
                  )}
                  {current && isAdmin && ((current as any).firestoreId || (current as any).source === 'user_submission') && (
                    <div style={{ position: "absolute", bottom: 16, right: 56, zIndex: 30 }}>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteArtwork(current.id, (current as any).firestoreId);
                        }}
                        style={{
                          background: 'rgba(255,255,255,0.8)',
                          padding: 0,
                          borderRadius: '50%',
                          border: 'none',
                          cursor: 'pointer',
                          width: 32, height: 32,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 16
                        }}
                        title="Delete (Admin)"
                      >
                        🗑️
                      </button>
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
                  if (galleryLimit < sortedArtworks.length) {
                    setGalleryLimit(prev => Math.min(prev + 100, sortedArtworks.length));
                  }
                }
              }}
            >
              {(() => {
                const items: Artwork[] = sortedArtworks.slice(0, galleryLimit);
                const gridColumns = isMobile ? 'repeat(3, 1fr)' : 'repeat(5, 1fr)';
                const gridColumnGap = isMobile ? 8 : 64;
                const gridRowGap = isMobile ? 8 : 80;
                // Left panel (150px) shows on all non-mobile screens
                // gridPadding: compact top so artworks use the space below the left panel header
                const gridPadding = isMobile
                  ? '160px 8px 32px 8px'
                  : isVeryNarrow
                  ? '160px 16px 96px 10px'
                  : isNarrow
                  ? '160px 24px 96px 10px'
                  : '120px 48px 96px 10px';
                return (
                  <div style={{ padding: gridPadding }}>
                    {/* Modern Sort UI - Above Grid */}
                    <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', marginBottom: isMobile ? 12 : 24, paddingRight: isMobile ? 4 : 8 }}>
                      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                        <span style={{ fontSize: 12, color: '#999', marginRight: 8, fontWeight: 500, letterSpacing: 0.5 }}>SORT BY</span>
                        <select
                          value={sortBy}
                          onChange={(e) => {
                            setSortBy(e.target.value as any);
                            setSelectedIndex(0);
                          }}
                          className="modern-select"
                          style={{
                            appearance: 'none',
                            background: 'transparent',
                            border: 'none',
                            fontSize: 13,
                            color: '#333',
                            fontWeight: 600,
                            cursor: 'pointer',
                            paddingRight: 20,
                            outline: 'none',
                            textAlign: 'right'
                          }}
                        >
                          <option value="default">Default</option>
                          <option value="random">Random</option>
                          <option value="year_asc">Year: Oldest</option>
                          <option value="year_desc">Year: Newest</option>
                          <option value="like_desc">Most Liked</option>
                        </select>
                        <div style={{ position: 'absolute', right: 0, top: '55%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#333" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M6 9l6 6 6-6" />
                          </svg>
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: gridColumns, columnGap: gridColumnGap, rowGap: gridRowGap, alignItems: 'start' }}>
                      {items.map((a, idx) => (
                        <div key={a.id ?? `${idx}`} className="em-gallery-item" style={{ animationDelay: `${Math.min(idx * 0.04, 0.6)}s` }}>
                          <GalleryItem
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
                            exhibition={exhibition}
                            applyFallbackImage={applyFallbackImage}
                            useProxyVal={exhibition.id === 'mnk-collection' || exhibition.id === 'louisiana-collection' || exhibition.id.startsWith('smb-') ? true : useProxy}
                            onOpenProduct={(art) => setProductArtwork(art)}
                            onOpenComments={(art) => setCommentArtwork(art)}
                            stats={artworkStats[normalizeArtworkIdForFirestore(a.id)]}
                            museumName={museumName}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>
          ) : (
            // Panorama mode
            <div style={{ flex: 1, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', userSelect: panoramaDragging ? 'none' : 'auto', cursor: 'ew-resize', touchAction: 'none' }}
              onMouseDown={(e) => {
                e.preventDefault();
                if (sortedArtworks.length === 0) return;
                setPanoramaDragging(true);
                panStartXRef.current = e.clientX;
                panStartIndexRef.current = selectedIndex;
                const onMove = (ev: MouseEvent) => {
                  const dx = ev.clientX - panStartXRef.current;
                  const n = Math.max(1, sortedArtworks.length);
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
                            applyFallbackImage(e.currentTarget, current.fallbackImages);
                            if (!mainLoaded) setMainLoaded(true);
                          }}
                        />
                      </picture>
                      {current && (
                        <div style={{ position: "absolute", bottom: 16, left: 16, zIndex: 30, display: 'flex', gap: 8 }}>
                          {/* POD Product Purchase Button - Left */}
                          <div
                            onClick={(e) => {
                              e.stopPropagation();
                              e.preventDefault();
                              setProductArtwork(current);
                            }}
                            style={{
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              transition: 'transform 0.15s ease',
                              zIndex: 20
                            }}
                            title="상품으로 구매하기"
                            onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.1)'}
                            onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
                          >
                            <svg
                              width={20}
                              height={20}
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="#fff"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              style={{ filter: 'drop-shadow(0 0 2px rgba(0,0,0,0.5))' }}
                            >
                              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                              <rect x="7" y="7" width="10" height="10" />
                            </svg>
                          </div>
                          {/* Comment Button */}
                          <div
                            onClick={(e) => {
                              e.stopPropagation();
                              e.preventDefault();
                              setCommentArtwork(current);
                            }}
                            style={{
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              transition: 'transform 0.15s ease',
                              zIndex: 20
                            }}
                            title="Comments"
                            onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.1)'}
                            onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
                          >
                            <svg
                              width={20}
                              height={20}
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="#fff"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              style={{ filter: 'drop-shadow(0 0 2px rgba(0,0,0,0.5))' }}
                            >
                              <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                            </svg>
                          </div>
                          {/* Heart - Right */}
                          <HeartOverlay
                            isLiked={likedArtworks.has(String(current.id))}
                            onToggle={(e) => toggleLike(e, current)}
                            style={{ padding: 0, background: 'none' }}
                            size={20}
                            color="#e11d48"
                            emptyColor="#fff"
                          />
                        </div>
                      )}
                      {current && isAdmin && ((current as any).firestoreId || (current as any).source === 'user_submission') && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteArtwork(current.id, (current as any).firestoreId);
                          }}
                          style={{
                            position: 'absolute',
                            bottom: 16,
                            left: 56,
                            zIndex: 35,
                            padding: 0,
                            background: 'rgba(255, 255, 255, 0.8)',
                            borderRadius: '50%',
                            border: 'none',
                            cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            width: 32, height: 32, fontSize: 16
                          }}
                          title="Delete (Admin)"
                        >
                          🗑️
                        </button>
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
                  position: 'relative',
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
                  const full = lightbox.fullUrl || getBestFullUrl(a).url;
                  const natW = lightbox.natWidth;
                  const natH = lightbox.natHeight;
                  const isPanorama = !!(natW && natH && natW > 0 && natH > 0 && (natW / natH) > 3);
                  const maxH = isMobile ? 'calc(100vh - 180px)' : 'calc(100vh - 300px)';
                  return (
                    <div
                      className={isPanorama ? 'no-scrollbar' : undefined}
                      style={{
                        maxWidth: isMobile ? '92vw' : (isPanorama ? '92vw' : '80vw'),
                        maxHeight: maxH,
                        overflowX: isPanorama ? 'auto' : 'visible',
                        overflowY: 'hidden',
                        WebkitOverflowScrolling: 'touch',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <img
                        src={full}
                        alt={a.name}
                        style={{
                          width: 'auto',
                          height: isPanorama ? maxH : undefined,
                          maxWidth: isPanorama ? 'none' : (isMobile ? '92vw' : '80vw'),
                          maxHeight: maxH,
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
                          // If a lightbox-only high-res URL fails (common for some NJMuseum /water/ links),
                          // retry with the gallery image before showing the fallback placeholder.
                          const fallback = ensureHttps((a as any).originalImage || a.image);
                          const currentSrc = e.currentTarget.currentSrc || e.currentTarget.src;
                          if (fallback && currentSrc && currentSrc !== fallback) {
                            e.currentTarget.src = fallback;
                            return;
                          }
                          applyFallbackImage(e.currentTarget, a.fallbackImages);
                        }}
                      />
                    </div>
                  );
                })()}
                {/* Heart and Product buttons inside image - bottom right */}
                <div style={{
                  position: 'absolute',
                  bottom: isMobile ? 8 : 16,
                  right: isMobile ? 8 : 16,
                  display: 'flex',
                  gap: 12,
                  zIndex: 12000
                }}>
                  {/* POD Product Purchase Button - Left */}
                  <div
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      setProductArtwork(lightbox.artwork);
                    }}
                    style={{
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'transform 0.15s ease',
                      zIndex: 20
                    }}
                    title="상품으로 구매하기"
                    onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.15)'}
                    onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
                  >
                    <svg
                      width={24}
                      height={24}
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#fff"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      style={{ filter: 'drop-shadow(0 0 3px rgba(0,0,0,0.6))' }}
                    >
                      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                      <rect x="7" y="7" width="10" height="10" />
                    </svg>
                  </div>
                  {/* Comment Button */}
                  <div
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      setCommentArtwork(lightbox.artwork);
                    }}
                    style={{
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'transform 0.15s ease',
                      zIndex: 20
                    }}
                    title="Comments"
                    onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.15)'}
                    onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
                  >
                    <svg
                      width={24}
                      height={24}
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#fff"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      style={{ filter: 'drop-shadow(0 0 3px rgba(0,0,0,0.6))' }}
                    >
                      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                    </svg>
                  </div>
                  {/* Heart - Right */}
                  <HeartOverlay
                    isLiked={likedArtworks.has(String(lightbox.artwork.id))}
                    onToggle={(e) => toggleLike(e, lightbox.artwork)}
                    style={{ padding: 0, background: 'none' }}
                    size={24}
                    color="#e11d48"
                    emptyColor="#fff"
                  />
                </div>
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
                  {(() => {
                    const artistStr = cleanArtistName(lightbox.artwork.artist);
                    const isUnknown = !artistStr || artistStr.toLowerCase() === 'unknown artist' || artistStr.toLowerCase() === 'unknown';
                    return isUnknown ? (artistStr || '') : (
                      <span
                        onClick={(e) => { e.stopPropagation(); window.dispatchEvent(new CustomEvent('open-artist-gallery', { detail: { artist: artistStr } })); }}
                        style={{ cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,0.25)', transition: 'color 0.2s, border-color 0.2s' }}
                        onMouseEnter={e => { e.currentTarget.style.color = '#c9a55a'; e.currentTarget.style.borderColor = '#c9a55a'; }}
                        onMouseLeave={e => { e.currentTarget.style.color = '#ddd'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.25)'; }}
                        title="View Artist Page"
                      >{artistStr}</span>
                    );
                  })()}
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
              className="zoom-scroll-container"
              onClick={(e) => {
                if (e.target === e.currentTarget) closeHoverZoomFromOverlay();
              }}
              style={{
                position: 'fixed',
                top: headerHeight > 0 ? `${headerHeight}px` : (isMobile ? '60px' : '100px'),
                left: 0,
                right: 0,
                bottom: 0,
                zIndex: 10501,
                pointerEvents: 'auto',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'flex-start',
                overflowY: 'auto',
                WebkitOverflowScrolling: 'touch',
                paddingTop: '5vh',
                paddingBottom: '10vh'
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
                    <div style={{ position: 'relative', display: 'inline-block' }}>
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
                          onError={(e) => {
                            const fallback = ensureHttps((a as any).originalImage || a.image);
                            const currentSrc = e.currentTarget.currentSrc || e.currentTarget.src;
                            if (fallback && currentSrc && currentSrc !== fallback) {
                              e.currentTarget.src = fallback;
                              return;
                            }
                            applyFallbackImage(e.currentTarget, a.fallbackImages);
                          }}
                        />
                      </picture>
                      <div style={{
                        position: 'absolute',
                        bottom: isMobile ? 8 : 12,
                        right: isMobile ? 8 : 12,
                        display: 'flex',
                        gap: isMobile ? 8 : 10,
                        zIndex: 100
                      }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {/* POD Product Purchase Button - Left */}
                        <div
                          onClick={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            setProductArtwork(a);
                          }}
                          style={{
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            transition: 'transform 0.15s ease'
                          }}
                          title="상품으로 구매하기"
                          onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.15)'}
                          onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
                        >
                          <svg
                            width={isMobile ? 18 : 20}
                            height={isMobile ? 18 : 20}
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="#fff"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            style={{ filter: 'drop-shadow(0 0 2px rgba(0,0,0,0.6))' }}
                          >
                            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                            <rect x="7" y="7" width="10" height="10" />
                          </svg>
                        </div>
                        {/* Comment Button - Middle */}
                        <div
                          onClick={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            setCommentArtwork(a);
                          }}
                          style={{
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            transition: 'transform 0.15s ease'
                          }}
                          title="댓글 남기기"
                          onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.15)'}
                          onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
                        >
                          <svg
                            width={isMobile ? 18 : 20}
                            height={isMobile ? 18 : 20}
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="#fff"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            style={{ filter: 'drop-shadow(0 0 2px rgba(0,0,0,0.6))' }}
                          >
                            <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                          </svg>
                        </div>
                        {/* Heart - Right */}
                        <HeartOverlay
                          isLiked={likedArtworks.has(String(a.id))}
                          onToggle={(e) => toggleLike(e, a)}
                          style={{ padding: 0, background: 'none' }}
                          size={isMobile ? 18 : 20}
                          color="#e11d48"
                          emptyColor="#fff"
                        />
                      </div>
                    </div>
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
                          <div style={{ fontSize: 12, fontWeight: 500, color: '#111', lineHeight: '1.35' }}>{(() => {
                            const artistStr = cleanArtistName(a.artist);
                            const isUnknown = !artistStr || artistStr.toLowerCase() === 'unknown artist' || artistStr.toLowerCase() === 'unknown';
                            return isUnknown ? (artistStr || '-') : (
                              <span
                                onClick={(e) => { e.stopPropagation(); window.dispatchEvent(new CustomEvent('open-artist-gallery', { detail: { artist: artistStr } })); }}
                                style={{ cursor: 'pointer', borderBottom: '1px solid rgba(0,0,0,0.15)', transition: 'color 0.2s, border-color 0.2s' }}
                                onMouseEnter={e => { e.currentTarget.style.color = '#c9a55a'; e.currentTarget.style.borderColor = '#c9a55a'; }}
                                onMouseLeave={e => { e.currentTarget.style.color = '#111'; e.currentTarget.style.borderColor = 'rgba(0,0,0,0.15)'; }}
                                title="View Artist Page"
                              >{artistStr}</span>
                            );
                          })()}</div>
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

              {/* Recommendation Section below Zoomed Image */}
              {(() => {
                const zoomData = hoverZoom || closingHoverZoom;
                if (!zoomData) return null;
                return (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      width: '100%',
                      maxWidth: 1200,
                      marginTop: 64,
                      padding: '0 24px',
                      opacity: hoverZoom?.animate ? 1 : 0,
                      transition: 'opacity 300ms ease 100ms',
                      flexShrink: 0,
                      pointerEvents: 'auto'
                    }}
                  >
                    <ArtworkRecommendations
                      artwork={zoomData.artwork}
                      relatedArtworks={artworks.filter(a => a.artist === zoomData.artwork.artist && a.id !== zoomData.artwork.id).slice(0, 12)}
                      onSelectArtwork={(art) => {
                        setHoverZoom({ artwork: art, imageUrl: art.image, animate: true });
                        const container = document.querySelector('.zoom-scroll-container');
                        if (container) container.scrollTop = 0;
                      }}
                      mode="grid"
                      likedArtworks={likedArtworks}
                      onToggleLike={toggleLike}
                      onOpenProduct={setProductArtwork}
                    />
                  </div>
                );
              })()}
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
                background: EM_BG,
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
                  const coverImage = (exhibition as any)._exhibitionCoverImage || (exhibition as any).coverImage;
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
      {/* POD Product Purchase Modal */}
      {productArtwork && (
        <ProductModal
          key={productArtwork.id}
          artwork={productArtwork}
          relatedArtworks={artworks.filter(a => a.artist === productArtwork.artist && a.id !== productArtwork.id).slice(0, 10)}
          onSelectArtwork={setProductArtwork}
          onClose={() => setProductArtwork(null)}
        />
      )}
      {/* Comment Modal */}
      {commentArtwork && (
        <CommentModal
          isOpen={true}
          artworkId={commentArtwork.id}
          onClose={() => setCommentArtwork(null)}
        />
      )}
    </div >
  );
};

export default ExhibitionModal;