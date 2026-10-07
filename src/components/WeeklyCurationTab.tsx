// Weekly Curation — editor-curated online exhibition, refreshed every week.
// Sub-tab of the AI section alongside My Curation & Nearby Exhibition.

import React, { useState, useEffect, useCallback, lazy, Suspense } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronRight, ArrowUpRight } from "lucide-react";
import { LikeIcon } from "./like/LikeIcon";
import {
  fetchCurrentCuration,
  fetchArchiveList,
  fetchSpecialList,
  type ArchiveEntry,
  type SpecialEntry,
} from "../lib/weekly";
import { fetchProposal, fetchPublished } from "../lib/weeklyStore";
import { isoWeek, weekLabel } from "../lib/iso-week";
import { artistPath } from "../redesign/artwork/WorkDetail";
import { getArtistDisplayName, useArtistI18n } from "../i18n/artistLocalization";
import type { WeeklyPublishedFile, PersonaId } from "../types/weekly";
import SubscribeModal from "./SubscribeModal";
import { ArtworkLightbox } from "./ArtworkLightbox";
import { PlaylistModal } from "./PlaylistModal";
import { useLikedArtworkSet } from "../hooks/useLikedArtworkSet";
import SaveCurationButton from "./SaveCurationButton";
import RatingEmblems from "./Ratings/RatingEmblems";
import { museumDisplayName } from "../lib/museum-names";
import { useSubscription } from "../hooks/useSubscription";
import {
  likeArtwork,
  unlikeArtwork,
  useLikedArtworks,
  type ArtworkLikePayload,
  type LikeSource,
} from "../hooks/useLikedArtworks";
import { auth } from "../firebase";
import {
  findExhibitionByCollectionSlug,
  type ExhibitionLookupResult,
} from "../lib/find-exhibition";

// 주간 큐레이션은 전부 무료다. 유료 구독은 쓰지 않기로 했으니 잠금을 끈다.
// 나중에 유료화한다면 이 값 하나만 true 로 되돌리면 된다.
const PAYWALL_ENABLED = false;

// Lazy so the curation tab doesn't drag in the full modal bundle unless a
// user actually clicks a museum link.
//
// IMPORTANT: this is InteractiveGlobeRealModal — the interactive overlay
// the rest of the app uses for "view a collection in place." It is NOT
// `./ExhibitionModal.tsx` (that one is the older static modal and is
// deprecated for new code; see the header in that file).
const InteractiveGlobeRealModal = lazy(() =>
  import("./InteractiveGlobeMap/InteractiveGlobeRealModal").then((m) => ({
    default: m.InteractiveGlobeRealModal,
  })),
);

// ── Types ──────────────────────────────────────────────────────────────────

export type WeeklyWork = {
  id: string;
  seed: string;
  idx: number;
  title: string;
  titleKo: string;
  artist: string;
  artistKo: string;
  year: string;
  medium: string;
  mediumKo: string;
  dimensions: string;
  museum: string;
  museumCity: string;
  description: string;
  descriptionKo: string;
  aspect: number;
  highlight?: boolean;
  imageUrl?: string;   // real artwork image (R2 URL). When absent, ArtworkPlaceholder renders gradient only.
  sourceUrl?: string;  // the museum's own page for the work
};

export type WeeklyEdition = {
  id: string;
  /** ISO week ("2026-W41"); a special keeps the week its card came from. */
  weekId: string;
  /** a special, not a week's exhibition */
  special: boolean;
  date: string;
  dateKo: string;
  title: string;
  titleKo: string;
  editorName: string;
  editorNameKo: string;
  editorRole: string;
  intro: string;
  introKo: string;
  theme: string;
  themeKo: string;
  workCount: number;
  works: WeeklyWork[];
};


const PERSONA_NAMES: Record<PersonaId, { en: string; ko: string; role: string }> = {
  'yuna-choi':     { en: 'Yuna Choi',     ko: '최유나',  role: 'Senior Editor, Colly' },
  'marco-rinaldi': { en: 'Marco Rinaldi', ko: '마르코 리날디', role: 'Editor at Large, Colly' },
  'anika-voss':    { en: 'Anika Voss',    ko: '아니카 보스', role: 'Contributing Editor, Colly' },
};

function formatPublishedDate(isoTimestamp: string, langKo: 'ko' | 'en'): string {
  const d = new Date(isoTimestamp);
  if (isNaN(d.getTime())) return '';
  if (langKo === 'ko') {
    return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
  }
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

/** A curation's work in the shape the app's artwork detail reads. */
function toArtwork(work: WeeklyWork) {
  return {
    id: work.id,
    title: work.title,
    artist: work.artist,
    image: work.imageUrl ?? '',
    museumName: museumDisplayName(work.museum),
    year: work.year,
    sourceUrl: work.sourceUrl,
  };
}

export function adaptPublishedToEdition(file: WeeklyPublishedFile): WeeklyEdition {
  const persona = PERSONA_NAMES[file.persona_id] ?? { en: file.persona_id, ko: file.persona_id, role: 'Editor, Colly' };

  return {
    id: file.id,
    weekId: file.week ?? (file as unknown as { source_week?: string }).source_week ?? '',
    special: !!(file as unknown as { slug?: string }).slug,
    date: formatPublishedDate(file.published_at, 'en'),
    dateKo: formatPublishedDate(file.published_at, 'ko'),
    title: file.title_en,
    titleKo: file.title_ko,
    editorName: persona.en,
    editorNameKo: persona.ko,
    editorRole: persona.role,
    intro: file.intro_en,
    introKo: file.intro_ko,
    theme: file.subtitle_chip,
    themeKo: file.subtitle_chip,
    workCount: file.works.length,
    works: file.works.map((w) => ({
      id: w.artwork_ref,
      seed: w.artwork_ref,
      idx: w.position,
      title: w.title,
      titleKo: w.title,            // published file has no KO title — fall back to EN
      artist: w.artist,
      artistKo: w.artist,          // published file has no KO artist — fall back
      year: w.year,
      medium: '',
      mediumKo: '',
      dimensions: '',
      museum: w.source_collection,
      museumCity: '',
      description: w.caption_en,
      descriptionKo: w.caption_ko,
      aspect: 1.2,
      highlight: w.role === 'hero',
      imageUrl: w.image_url,
      sourceUrl: w.source_url,
    })),
  };
}

// ── Design tokens ─────────────────────────────────────────────────────────

const LABEL: React.CSSProperties = {
  fontFamily: "'Space Mono', monospace",
  fontWeight: 700,
  textTransform: 'uppercase' as const,
  letterSpacing: '0.12em',
};

const BODY: React.CSSProperties = {
  fontFamily: "'Inter', 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif",
  fontWeight: 400,
};

const HEADING: React.CSSProperties = {
  fontFamily: "'Inter', 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif",
  fontWeight: 700,
};

// ── Deterministic art placeholder ─────────────────────────────────────────

function seedHash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function artGradient(seed: string): string {
  const h1 = seedHash(seed) % 360;
  const h2 = (h1 + 20 + seedHash(seed + '_b') % 40) % 360;
  const s = 8 + (seedHash(seed + '_s') % 14);
  const l1 = 18 + (seedHash(seed + '_l1') % 18);
  const l2 = l1 + 8 + (seedHash(seed + '_l2') % 10);
  return `linear-gradient(145deg, hsl(${h1},${s}%,${l1}%), hsl(${h2},${s + 4}%,${l2}%))`;
}

// ── Utility components ─────────────────────────────────────────────────────

// Clickable museum/collection name. Used in every work-card variant so the
// rendered text and click behavior stay identical (DRY). Renders nothing
// clickable when collectionId is blank (e.g. the hardcoded sample edition
// where museum is "Rijksmuseum" not a slug).
function MuseumLink({
  collectionId, suffix, onClick, color, size,
}: {
  collectionId: string;
  suffix?: string;       // optional ", City" appended after the pretty name
  onClick?: (id: string) => void;
  color: string;
  size: number;
}) {
  // Full museum name (e.g. "Statens Museum for Kunst, Copenhagen") — the
  // earlier "SMK" abbreviation was unreadable for users. `suffix` is now
  // rarely needed since museumDisplayName already embeds the city.
  const display = museumDisplayName(collectionId) + (suffix ? `, ${suffix}` : '');
  if (!onClick) return <>{display}</>;
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(collectionId); }}
      style={{
        background: 'transparent',
        border: 'none',
        padding: 0,
        margin: 0,
        color,
        cursor: 'pointer',
        textDecoration: 'underline',
        textDecorationColor: 'rgba(244,241,234,0.25)',
        textUnderlineOffset: 3,
        font: 'inherit',
        fontSize: size,
        letterSpacing: 'inherit',
        textTransform: 'inherit',
      }}
    >
      {display}
    </button>
  );
}

function ArtworkPlaceholder({
  seed,
  aspect,
  style,
  onClick,
  imageUrl,
  alt,
}: {
  seed: string;
  aspect: number;
  style?: React.CSSProperties;
  onClick?: () => void;
  imageUrl?: string;
  alt?: string;
}) {
  // Box ratio defaults to the caller's hint, then snaps to the image's true
  // intrinsic ratio once it loads — so the artwork is shown uncropped.
  const [naturalAspect, setNaturalAspect] = useState<number | null>(null);
  const boxAspect = naturalAspect ?? aspect;
  return (
    <div
      onClick={onClick}
      style={{
        position: 'relative',
        width: '100%',
        paddingTop: `${(1 / boxAspect) * 100}%`,
        background: artGradient(seed),   // shows during image load + as fallback if load fails
        overflow: 'hidden',
        ...style,
      }}
    >
      {imageUrl ? (
        <img
          src={imageUrl}
          alt={alt ?? ''}
          loading="lazy"
          style={{
            position: 'absolute', inset: 0,
            width: '100%', height: '100%',
            objectFit: 'cover',
            display: 'block',
          }}
          // Snap the box to the image's true aspect ratio so nothing is cropped.
          onLoad={(e) => {
            const img = e.currentTarget as HTMLImageElement;
            if (img.naturalWidth > 0 && img.naturalHeight > 0) {
              setNaturalAspect(img.naturalWidth / img.naturalHeight);
            }
          }}
          // If the image fails (404, CORS, etc.) hide it and let the gradient show.
          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
        />
      ) : (
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            width: 32, height: 32, opacity: 0.12,
            border: '1px solid currentColor',
            borderRadius: 0,
          }} />
        </div>
      )}
    </div>
  );
}

function SectionRule({ label, divider }: { label?: string; divider: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      {label && (
        <span style={{ ...LABEL, fontSize: 9, color: 'rgba(244,241,234,0.55)', whiteSpace: 'nowrap' }}>
          {label}
        </span>
      )}
      <div style={{ flex: 1, height: '0.5px', background: divider }} />
    </div>
  );
}

// ── Edition header ─────────────────────────────────────────────────────────

function EditionHeader({
  edition, langKo, t, fg, fgMed, fgLow, fgFaint, divider,
}: {
  edition: WeeklyEdition;
  langKo: boolean;
  t: boolean;
  fg: string;
  fgMed: string;
  fgLow: string;
  fgFaint: string;
  divider: string;
}) {
  const bg2 = t ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.02)';
  const surface = t ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.04)';
  const accent = '#D4A547';
  const accentText = t ? '#8A6B1F' : '#D4A547';

  return (
    <div style={{
      borderBottom: `1px solid ${divider}`,
      padding: 'clamp(32px,4vw,56px) clamp(20px,4vw,56px) clamp(28px,4vw,48px)',
      display: 'grid',
      gridTemplateColumns: 'minmax(0,1fr) clamp(260px,32%,420px)',
      gap: 'clamp(24px,4vw,64px)',
      alignItems: 'start',
    }}>
      {/* Left: title + intro */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
          <span style={{
            ...LABEL, fontSize: 9,
            background: accent, color: '#000',
            padding: '3px 9px',
          }}>{edition.special ? (langKo ? '특집 전시' : 'Special Exhibition') : (langKo ? '주간 전시' : 'Weekly Exhibition')}</span>
          <span style={{ ...LABEL, fontSize: 9, color: fgFaint }}>{edition.dateKo}</span>
        </div>

        <h1 style={{
          ...HEADING,
          fontSize: 'clamp(1.6rem,3.2vw,3rem)',
          color: fg,
          lineHeight: 1.05,
          letterSpacing: '-0.03em',
          marginBottom: 8,
        }}>
          {langKo ? edition.titleKo : edition.title}
        </h1>
        <p style={{ ...BODY, fontSize: 13, color: fgFaint, marginBottom: 22, letterSpacing: '-0.005em' }}>
          {langKo ? edition.title : edition.titleKo}
        </p>

        <p style={{
          ...BODY,
          fontSize: 'clamp(13px,1.3vw,15px)',
          color: fgMed,
          lineHeight: 1.9,
          maxWidth: 580,
        }}>
          {langKo ? edition.introKo : edition.intro}
        </p>
      </div>

      {/* Right: editor card + meta */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Editor card */}
        <div style={{
          background: bg2,
          border: `1px solid ${divider}`,
          padding: '18px 20px',
        }}>
          <div style={{ ...LABEL, fontSize: 9, color: fgFaint, marginBottom: 14 }}>Editor · 에디터</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 40, height: 40, flexShrink: 0,
              background: surface,
              border: `1px solid ${divider}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              ...HEADING, fontSize: 16, color: fgLow,
            }}>
              {edition.editorName[0]}
            </div>
            <div>
              <div style={{ ...HEADING, fontSize: 15, color: fg }}>{edition.editorName}</div>
              <div style={{ ...BODY, fontSize: 12, color: fgFaint, marginTop: 1 }}>{edition.editorNameKo}</div>
              <div style={{ ...LABEL, fontSize: 9, color: fgFaint, marginTop: 3 }}>{edition.editorRole}</div>
            </div>
          </div>
        </div>

        {/* Meta grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, background: divider }}>
          {([
            ['Theme', edition.themeKo],
            ['Works', `${edition.workCount}점`],
            ['Period', '4 Centuries'],
            ['Edition', weekLabel(edition.weekId, langKo)],
          ] as [string, string][]).map(([k, v]) => (
            <div key={k} style={{ background: t ? '#FAFAFA' : '#080808', padding: '13px 16px' }}>
              <div style={{ ...LABEL, fontSize: 9, color: fgFaint, marginBottom: 5 }}>{k}</div>
              <div style={{ ...BODY, fontSize: 13, color: fg, fontWeight: 500 }}>{v}</div>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* Live indicator */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
            <div style={{ width: 5, height: 5, background: accentText, animation: 'wk-pulse 2s ease-in-out infinite' }} />
            <span style={{ ...LABEL, fontSize: 9, color: fgFaint }}>{weekLabel(edition.weekId, langKo)}</span>
          </div>
        </div>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes wk-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.35; transform: scale(0.65); }
        }
      `}} />
    </div>
  );
}

// ── Hero work ──────────────────────────────────────────────────────────────

function HeroWork({
  work, total, langKo, saved, onSave, onClick, onMuseumClick,
  fg, fgMed, fgFaint, divider,
}: {
  work: WeeklyWork;
  total: number;
  langKo: boolean;
  saved: boolean;
  onSave: () => void;
  onClick: () => void;
  onMuseumClick?: (collectionId: string) => void;
  t: boolean;
  fg: string;
  fgMed: string;
  fgLow: string;
  fgFaint: string;
  divider: string;
}) {
  const [hov, setHov] = useState(false);
  const accent = '#D4A547';

  return (
    <div style={{ padding: '40px clamp(20px,4vw,56px) 0', maxWidth: 1080, margin: '0 auto' }}>
      <div style={{ marginBottom: 24 }}>
        <SectionRule label={`§ 01 — Hero Work · 주요 작품`} divider={divider} />
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr clamp(240px,28%,360px)',
        gap: 36,
        alignItems: 'start',
        paddingBottom: 48,
        borderBottom: `1px solid ${divider}`,
      }}>
        {/* Image */}
        <div
          style={{ position: 'relative', cursor: 'pointer' }}
          onMouseEnter={() => setHov(true)}
          onMouseLeave={() => setHov(false)}
          onClick={onClick}
        >
          <ArtworkPlaceholder
            seed={work.seed}
            aspect={work.aspect}
            imageUrl={work.imageUrl}
            alt={`${work.artist} — ${work.title}`}
            style={{
              outline: hov ? `1.5px solid ${accent}` : '1.5px solid transparent',
              transition: 'outline 0.2s',
            }}
          />
          <div style={{
            position: 'absolute', top: 14, left: 14,
            background: accent, color: '#0c0c0a',
            padding: '3px 9px',
            ...LABEL, fontSize: 10,
          }}>
            01 / {String(total).padStart(2, '0')}
          </div>
          {hov && (
            <div style={{
              position: 'absolute', bottom: 14, right: 14,
              background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)',
              padding: '5px 12px',
              display: 'flex', alignItems: 'center', gap: 6,
              ...LABEL, fontSize: 10, color: 'rgba(255,255,255,0.8)',
            }}>
              View detail <ChevronRight size={11} />
            </div>
          )}
        </div>

        {/* Info panel */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <WorkRecord work={work} langKo={langKo} size="lg" onMuseumClick={onMuseumClick} fg={fg} fgMed={fgMed} fgFaint={fgFaint} />
          <p style={{ ...BODY, fontSize: 14.5, color: fgMed, lineHeight: 1.85, margin: 0 }}>
            {langKo ? work.descriptionKo : work.description}
          </p>
          <WorkActions langKo={langKo} saved={saved} onSave={onSave} onOpen={onClick} fgFaint={fgFaint} />
        </div>
      </div>
    </div>
  );
}

// ── Work record + actions (shared by the four work layouts) ─────────────────
// Stated the way the artwork detail states a work (redesign/artwork/WorkDetail):
// title, then the artist and the museum as links, the year on its own line,
// no field labels and no all-caps mono. Actions are plain text, no boxes.

function RecordLink({ children, to, href, onClick, fg }: {
  children: React.ReactNode; to?: string; href?: string; onClick?: () => void; fg: string;
}) {
  const [hov, setHov] = useState(false);
  const style: React.CSSProperties = {
    color: hov ? '#D4A547' : fg, background: 'none', border: 'none', padding: 0, font: 'inherit', cursor: 'pointer',
    textDecoration: 'underline', textUnderlineOffset: 3, textDecorationThickness: 1,
    textDecorationColor: hov ? '#D4A547' : 'rgba(244,241,234,0.28)', transition: 'color .15s',
  };
  const events = {
    onMouseEnter: () => setHov(true),
    onMouseLeave: () => setHov(false),
  };
  if (to) return <Link to={to} style={style} {...events} onClick={(e) => e.stopPropagation()}>{children}</Link>;
  if (href) return <a href={href} target="_blank" rel="noopener noreferrer" style={style} {...events} onClick={(e) => e.stopPropagation()}>{children}</a>;
  return <button type="button" style={style} {...events} onClick={(e) => { e.stopPropagation(); onClick?.(); }}>{children}</button>;
}

function WorkRecord({ work, langKo, size, onMuseumClick, fg, fgMed, fgFaint }: {
  work: WeeklyWork; langKo: boolean; size: 'lg' | 'md' | 'sm';
  onMuseumClick?: (collectionId: string) => void;
  fg: string; fgMed: string; fgFaint: string;
}) {
  const artistMap = useArtistI18n();
  const artist = getArtistDisplayName(work.artist, langKo ? 'ko' : 'en', artistMap);
  const titleSize = size === 'lg' ? 'clamp(1.35rem,1.9vw,1.85rem)' : size === 'md' ? 'clamp(1.08rem,1.45vw,1.32rem)' : 15;
  const lineSize = size === 'sm' ? 12.5 : 14;
  return (
    <div>
      <h3 style={{
        ...HEADING, fontSize: titleSize, color: fg, lineHeight: 1.22, letterSpacing: '-0.018em', margin: 0,
        ...(size === 'sm' ? { display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const, overflow: 'hidden' } : {}),
      }}>
        {work.title}
      </h3>
      {work.artist && (
        <p style={{ ...BODY, fontSize: lineSize, color: fgMed, margin: '7px 0 0' }}>
          <RecordLink to={artistPath(work.artist)} fg={fgMed}>{artist}</RecordLink>
        </p>
      )}
      {work.year && (
        <p style={{ fontFamily: "'Space Mono', monospace", fontSize: size === 'sm' ? 10.5 : 11.5, letterSpacing: '0.03em', color: fgFaint, margin: '6px 0 0' }}>
          {work.year}
        </p>
      )}
      <p style={{ ...BODY, fontSize: lineSize - 1, color: fgFaint, margin: '4px 0 0', display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '2px 14px' }}>
        {onMuseumClick
          ? <RecordLink onClick={() => onMuseumClick(work.museum)} fg={fgFaint}>{museumDisplayName(work.museum)}</RecordLink>
          : <span>{museumDisplayName(work.museum)}</span>}
        {work.sourceUrl && size !== 'sm' && (
          <RecordLink href={work.sourceUrl} fg={fgFaint}>
            {langKo ? '원본 페이지' : 'Museum page'} <ArrowUpRight size={11} strokeWidth={2} style={{ verticalAlign: '-1px' }} />
          </RecordLink>
        )}
      </p>
    </div>
  );
}

function WorkActions({ langKo, saved, onSave, onOpen, fgFaint, size = 13 }: {
  langKo: boolean; saved: boolean; onSave: () => void; onOpen: () => void; fgFaint: string; size?: number;
}) {
  const btn = (on: boolean): React.CSSProperties => ({
    ...BODY, fontSize: size - 0.5, background: 'none', border: 'none', padding: 0, cursor: 'pointer',
    color: on ? '#D4A547' : fgFaint, display: 'inline-flex', alignItems: 'center', gap: 6, transition: 'color .15s',
  });
  const hover = (e: React.MouseEvent<HTMLButtonElement>, on: boolean, keep: boolean) => {
    e.currentTarget.style.color = on || keep ? '#D4A547' : fgFaint;
  };
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 22 }}>
      <button type="button" style={btn(saved)}
        onClick={(e) => { e.stopPropagation(); onSave(); }}
        onMouseEnter={(e) => hover(e, true, saved)} onMouseLeave={(e) => hover(e, false, saved)}>
        <LikeIcon liked={saved} size={size} />
        {saved ? (langKo ? '저장됨' : 'Saved') : (langKo ? '저장' : 'Save')}
      </button>
      <button type="button" style={btn(false)}
        onClick={(e) => { e.stopPropagation(); onOpen(); }}
        onMouseEnter={(e) => hover(e, true, false)} onMouseLeave={(e) => hover(e, false, false)}>
        {langKo ? '크게 보기' : 'View'} <ChevronRight size={size - 1} />
      </button>
    </div>
  );
}

// ── Work row (alternating layout) ─────────────────────────────────────────

function WorkRow({
  work, index, langKo, saved, onSave, onClick, onMuseumClick,
  fg, fgMed, fgFaint, divider,
}: {
  work: WeeklyWork;
  index: number;
  langKo: boolean;
  saved: boolean;
  onSave: () => void;
  onClick: () => void;
  onMuseumClick?: (collectionId: string) => void;
  t: boolean;
  fg: string;
  fgMed: string;
  fgLow: string;
  fgFaint: string;
  divider: string;
}) {
  const [hov, setHov] = useState(false);
  const accent = '#D4A547';
  const isEven = index % 2 === 0;

  return (
    <article
      style={{
        display: 'grid',
        gridTemplateColumns: isEven ? 'clamp(240px,33%,380px) 1fr' : '1fr clamp(240px,33%,380px)',
        gap: 36,
        alignItems: 'center',
        padding: '44px 0',
        borderBottom: `0.5px solid ${divider}`,
        cursor: 'pointer',
      }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      onClick={onClick}
    >
      {/* Image */}
      <div style={{ order: isEven ? 0 : 1, position: 'relative' }}>
        <ArtworkPlaceholder
          seed={work.seed}
          aspect={work.aspect}
          imageUrl={work.imageUrl}
          alt={`${work.artist} — ${work.title}`}
          style={{
            outline: hov ? `1.5px solid ${accent}` : '1.5px solid transparent',
            transition: 'outline 0.2s',
          }}
        />
        <div style={{
          position: 'absolute', top: 10, left: 10,
          ...LABEL, fontSize: 10, color: 'rgba(255,255,255,0.4)',
          background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(6px)',
          padding: '3px 7px',
        }}>
          {String(index).padStart(2, '0')}
        </div>
      </div>

      {/* Info */}
      <div style={{ order: isEven ? 1 : 0, display: 'flex', flexDirection: 'column', gap: 18 }}>
        <WorkRecord work={work} langKo={langKo} size="md" onMuseumClick={onMuseumClick} fg={fg} fgMed={fgMed} fgFaint={fgFaint} />
        <p style={{ ...BODY, fontSize: 'clamp(13.5px,1.1vw,14.5px)', color: fgMed, lineHeight: 1.85, margin: 0 }}>
          {langKo ? work.descriptionKo : work.description}
        </p>
        <WorkActions langKo={langKo} saved={saved} onSave={onSave} onOpen={onClick} fgFaint={fgFaint} />
      </div>
    </article>
  );
}

// ── Mobile edition header ──────────────────────────────────────────────────

function MobileEditionHeader({
  edition, langKo,
  t, fg, fgMed, fgLow, fgFaint, divider,
}: {
  edition: WeeklyEdition;
  langKo: boolean;
  t: boolean; fg: string; fgMed: string; fgLow: string; fgFaint: string; divider: string;
}) {
  const accent = '#D4A547';
  const accentText = t ? '#8A6B1F' : '#D4A547';
  const bg2 = t ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.025)';
  const surface = t ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.06)';

  return (
    <div style={{ padding: '16px 16px 14px', borderBottom: `1px solid ${divider}`, background: bg2 }}>
      {/* Eyebrow */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{ ...LABEL, fontSize: 9, background: accent, color: '#0c0c0a', padding: '2px 8px' }}>
          {edition.special ? (langKo ? '특집 전시' : 'Special Exhibition') : (langKo ? '주간 전시' : 'Weekly Exhibition')}
        </span>
        <span style={{ ...LABEL, fontSize: 9, color: fgFaint }}>{edition.dateKo}</span>
      </div>

      {/* Title */}
      <h1 style={{ ...HEADING, fontSize: 22, color: fg, lineHeight: 1.1, letterSpacing: '-0.03em', marginBottom: 4 }}>
        {langKo ? edition.titleKo : edition.title}
      </h1>
      <p style={{ ...BODY, fontSize: 12, color: fgFaint, marginBottom: 12 }}>
        {langKo ? edition.title : edition.titleKo}
      </p>

      {/* Intro — 3-line clamp */}
      <p style={{
        ...BODY, fontSize: 13, color: fgMed, lineHeight: 1.75,
        display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden',
      }}>
        {langKo ? edition.introKo : edition.intro}
      </p>

      {/* Editor row */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        marginTop: 14, paddingTop: 14, borderTop: `0.5px solid ${divider}`,
      }}>
        <div style={{
          width: 28, height: 28, flexShrink: 0,
          background: surface, border: `1px solid ${divider}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          ...HEADING, fontSize: 13, color: fgLow,
        }}>{edition.editorName[0]}</div>
        <div>
          <span style={{ ...BODY, fontSize: 12, color: fgMed, fontWeight: 500 }}>{edition.editorName}</span>
          <span style={{ ...LABEL, fontSize: 9, color: fgFaint, marginLeft: 8 }}>{edition.editorRole}</span>
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ ...LABEL, fontSize: 9, color: fgFaint, textAlign: 'right' }}>
          <div>{edition.workCount} works</div>
          <div style={{ color: accentText, marginTop: 1 }}>{edition.themeKo}</div>
        </div>
      </div>
    </div>
  );
}

// ── Mobile hero work ───────────────────────────────────────────────────────

function MobileHeroWork({
  work, total, langKo, saved, onSave, onClick, onMuseumClick,
  fg, fgMed, fgFaint, divider,
}: {
  work: WeeklyWork; total: number; langKo: boolean;
  saved: boolean; onSave: () => void; onClick: () => void;
  onMuseumClick?: (collectionId: string) => void;
  t: boolean; fg: string; fgMed: string; fgLow: string; fgFaint: string; divider: string;
}) {
  const accent = '#D4A547';

  return (
    <div style={{ padding: '14px 16px 0' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{ ...LABEL, fontSize: 9, color: fgFaint, whiteSpace: 'nowrap' }}>§ 01 — HERO WORK</span>
        <div style={{ flex: 1, height: '0.5px', background: divider }} />
      </div>

      {/* Image */}
      <div style={{ position: 'relative', cursor: 'pointer' }} onClick={onClick}>
        <ArtworkPlaceholder seed={work.seed} aspect={work.aspect} imageUrl={work.imageUrl} alt={`${work.artist} — ${work.title}`} style={{ width: '100%' }} />
        <div style={{
          position: 'absolute', top: 10, left: 10,
          background: accent, color: '#0c0c0a',
          padding: '3px 8px', ...LABEL, fontSize: 9,
        }}>01 / {total}</div>
        <div style={{
          position: 'absolute', bottom: 10, right: 10,
          background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)',
          padding: '4px 10px',
          display: 'flex', alignItems: 'center', gap: 5,
          ...LABEL, fontSize: 9, color: 'rgba(255,255,255,0.75)',
        }}>
          View <ChevronRight size={10} color="currentColor" />
        </div>
      </div>

      {/* Info */}
      <div style={{ paddingTop: 14, paddingBottom: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <WorkRecord work={work} langKo={langKo} size="md" onMuseumClick={onMuseumClick} fg={fg} fgMed={fgMed} fgFaint={fgFaint} />
        <p style={{ ...BODY, fontSize: 14, color: fgMed, lineHeight: 1.8, margin: 0 }}>
          {langKo ? work.descriptionKo : work.description}
        </p>
        <WorkActions langKo={langKo} saved={saved} onSave={onSave} onOpen={onClick} fgFaint={fgFaint} />
      </div>
    </div>
  );
}

// ── Mobile work card ───────────────────────────────────────────────────────

function MobileWorkCard({
  work, index, langKo, saved, onSave, onClick, onMuseumClick,
  t, fg, fgMed, fgFaint, divider,
}: {
  work: WeeklyWork; index: number; langKo: boolean;
  saved: boolean; onSave: () => void; onClick: () => void;
  onMuseumClick?: (collectionId: string) => void;
  t: boolean; fg: string; fgMed: string; fgLow: string; fgFaint: string; divider: string;
}) {
  const [pressed, setPressed] = useState(false);
  const pressedBg = t ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.04)';

  return (
    <article
      style={{ padding: '14px 16px', borderBottom: `0.5px solid ${divider}`, background: pressed ? pressedBg : 'transparent', transition: 'background 0.1s' }}
      onTouchStart={() => setPressed(true)}
      onTouchEnd={() => setPressed(false)}
      onMouseEnter={() => setPressed(true)}
      onMouseLeave={() => setPressed(false)}
    >
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        {/* Thumbnail */}
        <div style={{ position: 'relative', flexShrink: 0, width: 84, height: 84, cursor: 'pointer', overflow: 'hidden' }} onClick={onClick}>
          <div style={{ position: 'absolute', inset: 0, background: artGradient(work.seed) }} />
          {work.imageUrl && (
            <img
              src={work.imageUrl}
              alt={`${work.artist} — ${work.title}`}
              loading="lazy"
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
            />
          )}
          <div style={{
            position: 'absolute', top: 4, left: 4,
            fontFamily: "'Space Mono', monospace", fontSize: 8,
            color: 'rgba(255,255,255,0.5)',
            background: 'rgba(0,0,0,0.55)', padding: '2px 5px',
          }}>{String(index).padStart(2, '0')}</div>
        </div>

        {/* Info */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <WorkRecord work={work} langKo={langKo} size="sm" onMuseumClick={onMuseumClick} fg={fg} fgMed={fgMed} fgFaint={fgFaint} />
          <p style={{
            ...BODY, fontSize: 13, color: fgMed, lineHeight: 1.7, margin: 0,
            display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden',
          }}>
            {langKo ? work.descriptionKo : work.description}
          </p>
          <WorkActions langKo={langKo} saved={saved} onSave={onSave} onOpen={onClick} fgFaint={fgFaint} size={12} />
        </div>
      </div>
    </article>
  );
}

// ── Top navigation strip ──────────────────────────────────────────────────

type WeeklyMode = 'this-week' | 'archive' | 'special';

function WeeklyTopNav({
  mode, setMode, langKo,
  fg, fgLow, divider,
}: {
  mode: WeeklyMode;
  setMode: (m: WeeklyMode) => void;
  langKo: boolean;
  fg: string;
  fgLow: string;
  divider: string;
}) {
  const accent = '#D4A547';
  const tabs: Array<{ id: WeeklyMode; label: string; labelKo: string }> = [
    // weekly covers this week and any earlier week picked from the strip ('archive')
    { id: 'this-week', label: 'Weekly',  labelKo: '주간' },
    { id: 'special',   label: 'Special', labelKo: '특집' },
  ];
  const fgFaint = 'rgba(244,241,234,0.55)';

  return (
    <div style={{
      padding: 'clamp(18px, 3vw, 26px) clamp(20px, 4vw, 56px)',
      borderBottom: `0.5px solid ${divider}`,
      display: 'flex',
      flexDirection: 'column',
      gap: 12,
    }}>
      {/* Editorial eyebrow — matches EditionHeader / SectionRule voice */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ ...LABEL, fontSize: 9, color: fgFaint, whiteSpace: 'nowrap' }}>
          § Section · 섹션
        </span>
        <div style={{ flex: 1, height: '0.5px', background: divider }} />
      </div>

      {/* Pill segmented control */}
      <div
        role="tablist"
        style={{
          display: 'inline-flex',
          flexWrap: 'wrap',
          alignSelf: 'flex-start',
          gap: 4,
          padding: 4,
          border: `0.5px solid ${divider}`,
          background: 'rgba(255,255,255,0.02)',
          borderRadius: 999,
        }}
      >
        {tabs.map(tab => {
          const active = (mode === 'special') === (tab.id === 'special');
          return (
            <button
              key={tab.id}
              role="tab"
              aria-selected={active}
              onClick={() => setMode(tab.id)}
              style={{
                position: 'relative',
                ...LABEL,
                fontSize: 10,
                background: 'transparent',
                border: 'none',
                color: active ? '#000' : fgLow,
                padding: '8px 16px',
                cursor: 'pointer',
                borderRadius: 999,
                transition: 'color 0.2s ease',
                WebkitTapHighlightColor: 'transparent',
                zIndex: 1,
              }}
              onMouseEnter={e => { if (!active) e.currentTarget.style.color = fg; }}
              onMouseLeave={e => { if (!active) e.currentTarget.style.color = fgLow; }}
            >
              {active && (
                <motion.span
                  layoutId="weekly-topnav-pill"
                  aria-hidden
                  style={{
                    position: 'absolute',
                    inset: 0,
                    background: accent,
                    borderRadius: 999,
                    zIndex: -1,
                  }}
                  transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                />
              )}
              <span style={{ position: 'relative' }}>
                {langKo ? tab.labelKo : tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Curation strip ─────────────────────────────────────────────────────────

/** The tab's exhibitions, newest first, as small thumbnails to slide through: picture, name, week.
 *  `id` is a week for a weekly exhibition and a slug for a special. */
function CurationStrip({ entries, activeId, langKo, onSelect, fg, fgFaint }: {
  entries: { id: string; week: string; title_en: string; title_ko: string; hero_image_url: string }[];
  activeId: string;
  langKo: boolean;
  onSelect: (id: string) => void;
  fg: string;
  fgFaint: string;
}) {
  if (entries.length === 0) return null;
  return (
    <div style={{
      display: 'flex', gap: 12, overflowX: 'auto', scrollSnapType: 'x mandatory', scrollbarWidth: 'none',
      overscrollBehaviorX: 'contain', padding: '16px clamp(20px,4vw,56px) 4px', scrollPaddingInline: 'clamp(20px,4vw,56px)',
    }}>
      {entries.map((entry) => {
        const active = entry.id === activeId;
        return (
          <button
            key={entry.id}
            type="button"
            onClick={() => onSelect(entry.id)}
            style={{
              flex: 'none', width: 'clamp(132px, 34vw, 176px)', scrollSnapAlign: 'start',
              background: 'none', border: 'none', padding: 0, textAlign: 'left', cursor: 'pointer',
            }}
          >
            <div style={{ aspectRatio: '4 / 3', overflow: 'hidden', background: '#111', outline: active ? '1px solid #D4A547' : 'none' }}>
              {entry.hero_image_url && (
                <img src={entry.hero_image_url} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
              )}
            </div>
            <div style={{
              ...BODY, fontSize: 13, fontWeight: 500, color: active ? '#D4A547' : fg, marginTop: 8,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {langKo ? entry.title_ko : entry.title_en}
            </div>
            <div style={{ ...BODY, fontSize: 11, color: fgFaint, marginTop: 2 }}>{weekLabel(entry.week, langKo)}</div>
          </button>
        );
      })}
    </div>
  );
}

// ── Main exported component ────────────────────────────────────────────────

export type WeeklyCurationTabProps = {
  t: boolean;
  fg: string;
  fgMed: string;
  fgLow: string;
  fgFaint: string;
  divider: string;
  language: string;
  tr: (copy: { ko: string; en: string }) => string;
  // When true, suppress the This Week / Archive / Special top nav strip.
  // Used by AdminWeeklyPreviewPage to render a single candidate standalone.
  chromeless?: boolean;
};

export default function WeeklyCurationTab({
  t, fg, fgMed, fgLow, fgFaint, divider, language, chromeless = false,
}: WeeklyCurationTabProps) {
  // Fetched on mount. Start with null (showing skeleton) rather than the
  // hardcoded WEEKLY_EDITIONS[0] — otherwise stale React state can survive
  // a Vite HMR cycle and we keep rendering an old adapter's output (which is
  // what caused the "imageUrl missing → gradient-only" bug). Falling back to
  // hardcoded is now explicit: only if fetch resolves to null.
  const [current, setCurrent] = useState<WeeklyEdition | null>(null);
  // Keep the raw published file alongside the adapted edition so the
  // "Save this curation" button can persist the canonical shape without
  // needing to refetch.
  const [currentFile, setCurrentFile] = useState<WeeklyPublishedFile | null>(null);
  // True once this week's lookup has answered (with a curation or with none).
  const [currentLoaded, setCurrentLoaded] = useState(false);
  // A past week or special opened from its list; shown under that tab, never under "this week".
  const [pastPick, setPastPick] = useState<{ edition: WeeklyEdition; file: WeeklyPublishedFile } | null>(null);
  // The work whose detail is open: the app's own artwork detail, so it may move on to a similar work outside this curation.
  const [viewing, setViewing] = useState<any | null>(null);
  const [savingToPlaylist, setSavingToPlaylist] = useState<any | null>(null);
  const { toggleLike } = useLikedArtworkSet();
  const langKo = language === 'ko';
  // Per-work saves persist to Firestore (users/{uid}/liked_artworks). The
  // local Set used to live here was non-persistent and shared no state with
  // the rest of the app; now we subscribe to the user's likes via the hook
  // and dispatch real writes on save/unsave.
  const { ids: likedIds } = useLikedArtworks();
  const [authedNote, setAuthedNote] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768);

  // Top-nav mode + archive/special data (kept above the early return below
  // so hook order stays stable across renders).
  const [mode, setMode] = useState<WeeklyMode>('this-week');
  const edition = mode === 'this-week' ? current : pastPick?.edition ?? null;
  const editionFile = mode === 'this-week' ? currentFile : pastPick?.file ?? null;
  const [archiveEntries, setArchiveEntries] = useState<ArchiveEntry[]>([]);
  const [archiveLoading, setArchiveLoading] = useState(true);
  const [specialEntries, setSpecialEntries] = useState<SpecialEntry[]>([]);
  const [specialLoading, setSpecialLoading] = useState(true);

  // Paywall modal state. `subscribeContext` shapes copy in SubscribeModal.
  const [subscribeModalOpen, setSubscribeModalOpen] = useState(false);
  const [subscribeContext, setSubscribeContext] = useState<'archive' | 'special'>('archive');

  // Museum click → mount the real ExhibitionModal as an in-place overlay so
  // the user stays on the curation page and returns to their exact scroll
  // position when the modal closes. Previously this used navigate() to
  // /collection/<slug>, which left the AI tab entirely and dropped the user
  // on the homepage when the modal's X was clicked.
  const [exhibitionOverlay, setExhibitionOverlay] =
    useState<ExhibitionLookupResult | null>(null);
  const openMuseum = useCallback((collectionId: string) => {
    const entry = findExhibitionByCollectionSlug(collectionId);
    if (entry) setExhibitionOverlay(entry);
  }, []);
  const closeExhibitionOverlay = useCallback(() => {
    setExhibitionOverlay(null);
  }, []);

  // Subscription status drives the lock rule below. Hook order matters,
  // so this stays above any early return.
  const { isSubscriber } = useSubscription();

  // Deep-link support: ?weekly=2026-W20 / ?special=<slug>. If neither is
  // present we fall back to the current week. A 404 on the deep-linked file
  // also falls back gracefully.
  const [searchParams] = useSearchParams();
  const weeklyParam = searchParams.get('weekly');
  const specialParam = searchParams.get('special');
  // Admin preview: ?preview=<cardId>&week=<YYYY-Www> renders a not-yet-published
  // candidate card straight from the proposal JSON, so admins can see exactly
  // what the curation would look like before clicking Publish.
  const previewCardId = searchParams.get('preview');
  const previewWeek = searchParams.get('week');

  useEffect(() => {
    let cancelled = false;

    const applyFile = (file: WeeklyPublishedFile) => {
      if (cancelled) return;
      setCurrent(adaptPublishedToEdition(file));
      setCurrentFile(file);
      setCurrentLoaded(true);
    };

    const loadCurrent = () => {
      fetchCurrentCuration()
        .then((file: WeeklyPublishedFile | null) => {
          if (cancelled) return;
          if (file) applyFile(file);
          else setCurrentLoaded(true);
        })
        .catch(() => { if (!cancelled) setCurrentLoaded(true); });
    };

    const openPast = (file: WeeklyPublishedFile, tab: WeeklyMode) => {
      if (cancelled) return;
      setPastPick({ edition: adaptPublishedToEdition(file), file });
      setMode(tab);
    };

    const tryPreview = async (cardId: string, week: string): Promise<boolean> => {
      try {
        const proposal = await fetchProposal(week);
        if (!proposal) return false;
        const card = (proposal.cards ?? []).find((c) => c.id === cardId);
        if (!card) return false;
        // Synthesise the same shape as a published file so the rendering
        // path is identical.
        applyFile({
          ...card,
          week,
          published_at: new Date().toISOString(),
          published_by: 'preview',
        } as WeeklyPublishedFile);
        return true;
      } catch {
        return false;
      }
    };

    (async () => {
      if (previewCardId && previewWeek) {
        const ok = await tryPreview(previewCardId, previewWeek);
        if (!ok) { console.warn(`[WeeklyCurationTab] preview ?preview=${previewCardId}&week=${previewWeek} not found; falling back`); loadCurrent(); }
        return;
      }
      loadCurrent();
      // Deep links to a past week or a special open it under its own tab.
      if (weeklyParam && weeklyParam !== isoWeek(new Date())) {
        const file = await fetchPublished(weeklyParam);
        if (file) openPast(file, 'archive');
      }
      if (specialParam) {
        try {
          const res = await fetch(`/data/special-series/${specialParam}.json`);
          if (res.ok) openPast(await res.json() as WeeklyPublishedFile, 'special');
        } catch { /* stay on this week */ }
      }
    })();

    return () => { cancelled = true; };
  }, [weeklyParam, specialParam, previewCardId, previewWeek]);

  // Lazy-load archive + special lists on mount. Both helpers handle 404s
  // and network errors gracefully.
  useEffect(() => {
    let cancelled = false;
    fetchArchiveList()
      .then((rows) => { if (!cancelled) setArchiveEntries(rows); })
      .catch(() => { /* keep empty */ })
      .finally(() => { if (!cancelled) setArchiveLoading(false); });
    fetchSpecialList()
      .then((rows) => { if (!cancelled) setSpecialEntries(rows); })
      .catch(() => { /* keep empty */ })
      .finally(() => { if (!cancelled) setSpecialLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const handleLockedClick = useCallback((context: 'archive' | 'special') => {
    setSubscribeContext(context);
    setSubscribeModalOpen(true);
  }, []);

  const handleSelectArchiveWeek = useCallback(async (week: string) => {
    try {
      const file = await fetchPublished(week);
      if (!file) return;
      setPastPick({ edition: adaptPublishedToEdition(file), file });
      if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch {
      // Silent failure: leave the user on archive view.
    }
  }, []);

  const handleSelectSpecial = useCallback(async (slug: string) => {
    try {
      const res = await fetch(`/data/special-series/${slug}.json`);
      if (!res.ok) return;
      // Special-series files extend the WeeklyCard shape with the same
      // published-file fields adaptPublishedToEdition expects.
      const file = await res.json() as WeeklyPublishedFile;
      setPastPick({ edition: adaptPublishedToEdition(file), file });
      if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch {
      // Silent failure.
    }
  }, []);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // Auto-clear the "sign in to save" toast after a beat. Lives next to the
  // toggleSave callback so the lifecycle is obvious.
  useEffect(() => {
    if (!authedNote) return;
    const id = window.setTimeout(() => setAuthedNote(null), 2400);
    return () => window.clearTimeout(id);
  }, [authedNote]);

  // toggleSave maps the locally-shaped WeeklyWork back to the canonical
  // ArtworkLikePayload (the in-file type renames image_url → imageUrl etc.).
  // `source` distinguishes weekly vs special saves so Mypage can group them.
  const toggleSave = useCallback(
    async (work: WeeklyWork) => {
      // eslint-disable-next-line no-console
      console.debug('[WeeklyCurationTab] toggleSave click', { id: work.id, signedIn: !!auth.currentUser });
      const user = auth.currentUser;
      if (!user) {
        setAuthedNote(langKo ? '로그인하면 저장됩니다 · Sign in to save' : 'Sign in to save · 로그인하면 저장됩니다');
        window.dispatchEvent(new CustomEvent('auth:request-login'));
        return;
      }
      const payload: ArtworkLikePayload = {
        artwork_ref: work.id,
        artist: work.artist,
        title: work.title,
        year: work.year,
        image_url: work.imageUrl ?? '',
        source_collection: work.museum,
      };
      const isSpecial = !!(editionFile && (editionFile as unknown as { slug?: string }).slug);
      const source: LikeSource = isSpecial ? 'special_curation' : 'weekly_curation';
      try {
        if (likedIds.has(work.id)) await unlikeArtwork(work.id);
        else await likeArtwork(payload, source);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('[WeeklyCurationTab] like/unlike failed', err);
      }
    },
    [editionFile, langKo, likedIds],
  );

  // A work's detail, as everywhere in the app (like, save to a playlist, the museum's page, similar works).
  const workDetail = viewing && (
    <>
      <ArtworkLightbox
        artwork={viewing}
        onClose={() => setViewing(null)}
        isLiked={likedIds.has(viewing.id)}
        onToggleLike={(_event, artwork) => {
          const work = edition?.works.find((w) => w.id === artwork.id);
          void (work ? toggleSave(work) : toggleLike(artwork));
        }}
        onSaveToPlaylist={setSavingToPlaylist}
        hideMuseumAction
        hidePurchaseAction
        likedArtworksList={edition?.works.map(toArtwork) ?? []}
        onChangeArtwork={setViewing}
      />
      {savingToPlaylist && <PlaylistModal isOpen onClose={() => setSavingToPlaylist(null)} item={savingToPlaylist} itemType="artwork" />}
    </>
  );

  const tokens = { t, fg, fgMed, fgLow, fgFaint, divider };

  // Everyone's rating of this curation, under the top save button: the same
  // emblems My Page shows on the saved card.
  const curationRating = editionFile ? (
    <div style={{ maxWidth: 1080, margin: '0 auto', padding: '0 clamp(20px,4vw,56px) 24px', display: 'flex', alignItems: 'center', gap: 14 }}>
      <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: fgLow, flexShrink: 0 }}>
        {langKo ? '평점' : 'Rating'}
      </span>
      <RatingEmblems
        subject={{ kind: 'curation', id: editionFile.id }}
        title={(langKo ? editionFile.title_ko : editionFile.title_en) || editionFile.title_en || editionFile.title_ko}
        subtitle={(editionFile as unknown as { slug?: string }).slug
          ? (langKo ? '특집 전시' : 'Special exhibition')
          : (langKo ? '주간 전시' : 'Weekly exhibition')}
        size={14}
        color={fgMed}
      />
    </div>
  ) : null;

  // When chromeless (standalone preview from /admin/weekly/preview), the
  // This Week / Archive / Special strip is suppressed — the page caller
  // already has its own header chrome (back button etc.).
  const currentHero = currentFile?.works.find((w) => w.role === 'hero') ?? currentFile?.works[0];
  const topNav = chromeless ? null : (
    <>
      <WeeklyTopNav
        mode={mode}
        setMode={(m) => { setMode(m); setPastPick(null); }}
        langKo={langKo}
        fg={fg}
        fgLow={fgLow}
        divider={divider}
      />
      {/* the specials tab slides through specials only; the other tabs through the weekly exhibitions */}
      <CurationStrip
        entries={mode === 'special'
          ? specialEntries.map((e) => ({ ...e, id: e.slug, week: e.source_week }))
          : [
            ...(currentFile ? [{ id: currentFile.week, week: currentFile.week, title_en: currentFile.title_en, title_ko: currentFile.title_ko, hero_image_url: currentHero?.image_url ?? '' }] : []),
            ...archiveEntries.map((e) => ({ ...e, id: e.week })),
          ]}
        activeId={mode === 'special' ? (pastPick?.file as unknown as { slug?: string } | undefined)?.slug ?? '' : edition?.weekId ?? ''}
        langKo={langKo}
        onSelect={(id) => {
          if (mode === 'special') void handleSelectSpecial(id);
          else if (id === currentFile?.week) { setMode('this-week'); setPastPick(null); }
          else { setMode('archive'); void handleSelectArchiveWeek(id); }
        }}
        fg={fg}
        fgFaint={fgFaint}
      />
    </>
  );

  // The specials tab has no list page (the strip above is the list): the newest special opens by itself.
  useEffect(() => {
    if (mode === 'special' && !pastPick && specialEntries.length > 0) void handleSelectSpecial(specialEntries[0].slug);
  }, [mode, pastPick, specialEntries, handleSelectSpecial]);

  // Rendered alongside every layout branch so it's available regardless
  // of where the click came from.
  const subscribeModal = (
    <SubscribeModal
      open={subscribeModalOpen}
      onClose={() => setSubscribeModalOpen(false)}
      triggerContext={subscribeContext}
    />
  );

  // Museum overlay — clicks on museum names mount InteractiveGlobeRealModal
  // in place on top of the current curation view. This is the same
  // interactive modal the Globe tab uses (full toolbar, filters, lightbox,
  // saved-state etc.) — NOT the older static ExhibitionModal. Shared across
  // mobile and desktop layouts and across all top-nav modes. Theme is fixed
  // to 'dark' because the AI tab itself is the dark luxury surface.
  const museumOverlay = (
    <AnimatePresence>
      {exhibitionOverlay && (
        <Suspense fallback={null}>
          <InteractiveGlobeRealModal
            exhibition={exhibitionOverlay.exhibition as any}
            theme="dark"
            onClose={closeExhibitionOverlay}
          />
        </Suspense>
      )}
    </AnimatePresence>
  );

  // Inline toast for sign-in feedback when a per-work save is clicked while
  // signed out. The web build has no global handler that opens a login modal
  // — without this toast the button looked dead.
  const authToast = authedNote ? (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        bottom: 'calc(env(safe-area-inset-bottom, 0px) + 24px)',
        left: '50%',
        transform: 'translateX(-50%)',
        padding: '12px 18px',
        background: '#F4F1EA',
        color: '#0c0c0a',
        fontFamily: "'Space Mono', monospace",
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
        zIndex: 20000,
        maxWidth: '90vw',
        whiteSpace: 'nowrap',
        pointerEvents: 'none',
      }}
    >
      {authedNote}
    </div>
  ) : null;

  // Nothing to show as an edition: a tab's list, this week still loading, or no curation this week.
  if (!edition) {
    const quiet: React.CSSProperties = { padding: 'clamp(40px,6vw,80px)', textAlign: 'center' };
    const body = mode === 'archive' ? (
        <div style={{ ...quiet, ...LABEL, fontSize: 11, color: fgFaint }}>{langKo ? '불러오는 중…' : 'Loading…'}</div>
      )
      : mode === 'special' ? (
        <div style={{ ...quiet, ...LABEL, fontSize: 11, color: fgFaint }}>
          {specialLoading || specialEntries.length > 0 ? (langKo ? '불러오는 중…' : 'Loading…') : (langKo ? '아직 특집 전시가 없습니다.' : 'No specials yet.')}
        </div>
      )
      : !currentLoaded ? (
        <div style={{ ...quiet, ...LABEL, fontSize: 11, color: fgFaint }}>
          {langKo ? '이번 주 전시를 불러오는 중…' : "Loading this week's exhibition…"}
        </div>
      ) : (
        <div style={quiet}>
          <p style={{ ...BODY, fontSize: 15, color: fgMed, margin: 0 }}>
            {langKo ? '이번 주 전시는 준비 중입니다.' : "This week's exhibition is on its way."}
          </p>
        </div>
      );
    return <div style={{ paddingBottom: 80 }}>{topNav}{body}{subscribeModal}{authToast}{museumOverlay}</div>;
  }

  // ── Mobile layout ────────────────────────────────────────────────────────
  if (isMobile) {
    return (
      <div style={{ paddingBottom: 80 }}>
        {topNav}
        <MobileEditionHeader edition={edition} langKo={langKo} {...tokens} />

        {/* Top Save-Curation button — same component as the footer below.
            The user asked for it at BOTH ends so the CTA is reachable without
            scrolling through the full 12-work list. */}
        {editionFile && (
          <SaveCurationButton file={editionFile} langKo={langKo} />
        )}
        {curationRating}

        <MobileHeroWork
          work={edition.works[0]}
          total={edition.workCount}
          langKo={langKo}
          saved={likedIds.has(edition.works[0].id)}
          onSave={() => toggleSave(edition.works[0])}
          onClick={() => setViewing(toArtwork(edition.works[0]))}
          onMuseumClick={openMuseum}
          {...tokens}
        />

        {/* Works list header */}
        <div style={{ padding: '18px 16px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ ...LABEL, fontSize: 9, color: fgFaint, whiteSpace: 'nowrap' }}>
              § 02 — {edition.workCount} WORKS
            </span>
            <div style={{ flex: 1, height: '0.5px', background: divider }} />
          </div>
        </div>

        {/* Work cards */}
        <div style={{ padding: '10px 0 32px' }}>
          {edition.works.slice(1).map((work, i) => (
            <MobileWorkCard
              key={work.id}
              work={work}
              index={i + 2}
              langKo={langKo}
              saved={likedIds.has(work.id)}
              onSave={() => toggleSave(work)}
              onClick={() => setViewing(toArtwork(work))}
              onMuseumClick={openMuseum}
              {...tokens}
            />
          ))}
        </div>

        {editionFile && (
          <SaveCurationButton file={editionFile} langKo={langKo} />
        )}

        {workDetail}
        {subscribeModal}

        {authToast}
        {museumOverlay}
      </div>
    );
  }

  // ── Desktop layout ───────────────────────────────────────────────────────

  return (
    <div style={{ paddingBottom: 80 }}>
      {topNav}
      <EditionHeader
        edition={edition}
        langKo={langKo}
        {...tokens}
      />

      {/* Top Save-Curation button — same component as the footer below. The
          user asked for it at BOTH ends so the CTA is reachable without
          scrolling through the works list. */}
      {editionFile && (
        <SaveCurationButton file={editionFile} langKo={langKo} />
      )}
      {curationRating}

      <HeroWork
        work={edition.works[0]}
        total={edition.workCount}
        langKo={langKo}
        saved={likedIds.has(edition.works[0].id)}
        onSave={() => toggleSave(edition.works[0])}
        onClick={() => setViewing(toArtwork(edition.works[0]))}
        onMuseumClick={openMuseum}
        {...tokens}
      />

      <div style={{ maxWidth: 1080, margin: '0 auto', padding: '48px clamp(20px,4vw,56px) 0' }}>
        <SectionRule label={`§ 02 — ${edition.workCount} Works · ${edition.workCount}점`} divider={divider} />
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {edition.works.slice(1).map((work, i) => (
            <WorkRow
              key={work.id}
              work={work}
              index={i + 2}
              langKo={langKo}
              saved={likedIds.has(work.id)}
              onSave={() => toggleSave(work)}
              onClick={() => setViewing(toArtwork(work))}
              onMuseumClick={openMuseum}
              {...tokens}
            />
          ))}
        </div>
      </div>

      {editionFile && (
        <SaveCurationButton file={editionFile} langKo={langKo} />
      )}

        {workDetail}
      {subscribeModal}

      {authToast}
      {museumOverlay}
    </div>
  );
}
