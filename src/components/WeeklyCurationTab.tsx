// Weekly Curation — editor-curated online exhibition, refreshed every week.
// Sub-tab of the AI section alongside My Curation & Nearby Exhibition.

import React, { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { BookmarkPlus, Check, X, ChevronLeft, ChevronRight, Lock } from "lucide-react";
import {
  fetchCurrentCuration,
  fetchArchiveList,
  fetchSpecialList,
  type ArchiveEntry,
  type SpecialEntry,
} from "../lib/weekly";
import type { WeeklyPublishedFile, PersonaId } from "../types/weekly";
import SubscribeModal from "./SubscribeModal";
import { useSubscription } from "../hooks/useSubscription";

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
};

export type WeeklyEdition = {
  id: string;
  week: number;
  year: number;
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

// ── Sample data ────────────────────────────────────────────────────────────

export const WEEKLY_EDITIONS: WeeklyEdition[] = [
  {
    id: 'wk-2026-19',
    week: 19,
    year: 2026,
    date: 'May 5 – May 11, 2026',
    dateKo: '2026년 5월 5일 — 5월 11일',
    title: 'Things That Glow in Quiet Rooms',
    titleKo: '조용한 방에서 빛나는 것들',
    editorName: 'Yuna Choi',
    editorNameKo: '최유나',
    editorRole: 'Senior Editor, Armin',
    intro: `There is a particular quality of light that painters have always chased — not the blazing noon, not the dramatic storm, but the in-between: the lamp left on in an empty room, the last sliver of afternoon, the glow that has nowhere urgent to go. This week's curation gathers twelve works across four centuries that share that quality. They ask you to slow down. To let your eyes rest. To notice the warmth in a painted shadow.`,
    introKo: `화가들이 늘 쫓아온 특별한 빛이 있습니다. 타오르는 정오도, 극적인 폭풍도 아닌 그 사이 어딘가 — 빈 방에 홀로 켜진 등, 오후의 마지막 조각, 서두르지 않아도 되는 빛. 이번 주 큐레이션은 4세기에 걸쳐 그 질감을 공유하는 열두 점의 작품을 모았습니다.`,
    theme: 'Light & Interior',
    themeKo: '빛과 실내',
    workCount: 10,
    works: [
      {
        id: 'wk1', seed: 'weekly-vermeer-1', idx: 1,
        title: 'Woman Reading a Letter',
        titleKo: '편지를 읽는 여인',
        artist: 'Johannes Vermeer',
        artistKo: '요하네스 페르메이르',
        year: '1663',
        medium: 'Oil on canvas',
        mediumKo: '캔버스에 유화',
        dimensions: '46.5 × 39 cm',
        museum: 'Rijksmuseum',
        museumCity: 'Amsterdam',
        description: 'A woman stands at a window, absorbed in a letter, her face softly lit from the left. Vermeer catches the room in suspension — a moment so private it feels almost wrong to look. The pale blue of her jacket, the pearls, the map on the wall: everything holds its breath.',
        descriptionKo: '창가에 선 여인이 편지에 빠져 있고, 그녀의 얼굴은 왼쪽에서 오는 빛으로 부드럽게 밝혀집니다. 페르메이르는 방 전체를 정지 상태로 포착합니다. 너무도 사적인 순간이라 바라보는 것조차 미안할 것 같습니다.',
        aspect: 1.19,
        highlight: true,
      },
      {
        id: 'wk2', seed: 'weekly-hammershoi', idx: 2,
        title: 'Interior, Strandgade 30',
        titleKo: '실내, 스트란가데 30번지',
        artist: 'Vilhelm Hammershøi',
        artistKo: '빌헬름 함메르쇼이',
        year: '1901',
        medium: 'Oil on canvas',
        mediumKo: '캔버스에 유화',
        dimensions: '55.8 × 46.5 cm',
        museum: 'Tate Modern',
        museumCity: 'London',
        description: 'Hammershøi painted the same Copenhagen apartment over and over, each time finding a different quality of grey. Here a woman stands with her back to us. The door is slightly open. Whether she is arriving or leaving is uncertain — and that uncertainty is the whole point.',
        descriptionKo: '함메르쇼이는 코펜하겐의 같은 아파트를 반복해서 그리며, 매번 회색의 다른 질을 발견했습니다. 여기서 한 여인이 우리에게 등을 돌리고 서 있고, 문은 살짝 열려 있습니다.',
        aspect: 1.2,
      },
      {
        id: 'wk3', seed: 'weekly-hopper', idx: 3,
        title: 'Morning Sun',
        titleKo: '아침 햇살',
        artist: 'Edward Hopper',
        artistKo: '에드워드 호퍼',
        year: '1952',
        medium: 'Oil on canvas',
        mediumKo: '캔버스에 유화',
        dimensions: '71.4 × 101.9 cm',
        museum: 'Columbus Museum of Art',
        museumCity: 'Columbus',
        description: 'A woman sits upright on a bed, legs stretched out, eyes fixed on a window we cannot see. The light is sharp and unforgiving, casting her in clarity. Hopper finds loneliness not in darkness but in too much light — the exposure of an ordinary morning.',
        descriptionKo: '한 여인이 침대에 꼿꼿이 앉아 우리가 볼 수 없는 창문을 응시합니다. 빛은 날카롭고 가차 없이 그녀를 선명하게 드러냅니다. 호퍼는 어둠이 아닌 너무 많은 빛 속에서 고독을 발견합니다.',
        aspect: 1.43,
      },
      {
        id: 'wk4', seed: 'weekly-de-hooch', idx: 4,
        title: 'A Woman and Her Maid in a Courtyard',
        titleKo: '안뜰의 여인과 하녀',
        artist: 'Pieter de Hooch',
        artistKo: '피터르 더 호흐',
        year: '1660–1661',
        medium: 'Oil on canvas',
        mediumKo: '캔버스에 유화',
        dimensions: '73.7 × 62.6 cm',
        museum: 'National Gallery',
        museumCity: 'London',
        description: 'Light passes through an archway and spills into a shaded courtyard, where two women pause mid-task. De Hooch was a master of thresholds — the moment between inside and out, between shade and sun, between motion and stillness.',
        descriptionKo: '빛이 아치 너머로 그늘진 안뜰에 쏟아지고, 두 여인이 일을 멈추고 잠시 서 있습니다. 더 호흐는 경계의 순간—안과 밖, 그늘과 햇빛, 움직임과 정지—의 대가였습니다.',
        aspect: 1.18,
      },
      {
        id: 'wk5', seed: 'weekly-vuillard', idx: 5,
        title: 'The Suitor',
        titleKo: '구혼자',
        artist: 'Édouard Vuillard',
        artistKo: '에두아르 뷔야르',
        year: '1893',
        medium: 'Oil on board',
        mediumKo: '보드에 유화',
        dimensions: '46 × 55 cm',
        museum: "Musée d'Orsay",
        museumCity: 'Paris',
        description: 'Vuillard dissolves his figures into patterned wallpaper and textile. A standing figure — the suitor — merges with the striped wall behind him. The room swallows the people. It is decoration as portraiture, intimacy as camouflage.',
        descriptionKo: '뷔야르는 인물들을 무늬 있는 벽지와 직물 속으로 용해시킵니다. 서 있는 인물—구혼자—은 뒤의 줄무늬 벽과 합쳐집니다. 방이 사람들을 삼킵니다.',
        aspect: 1.2,
      },
      {
        id: 'wk6', seed: 'weekly-bonnard', idx: 6,
        title: 'The Bathroom',
        titleKo: '욕실',
        artist: 'Pierre Bonnard',
        artistKo: '피에르 보나르',
        year: '1932',
        medium: 'Oil on canvas',
        mediumKo: '캔버스에 유화',
        dimensions: '121 × 118 cm',
        museum: 'Museum of Modern Art',
        museumCity: 'New York',
        description: "Bonnard's palette here is hallucinatory — yellows and greens that seem to radiate warmth from inside the paint itself. His wife Marthe is a small figure in a very large light. The room seems more alive than anyone in it.",
        descriptionKo: '보나르의 팔레트는 환각적입니다 — 물감 자체에서 온기가 발산되는 것 같은 황색과 녹색. 그의 아내 마르트는 광활한 빛 속의 작은 형상입니다. 방이 그 안의 누구보다 더 살아 있는 듯합니다.',
        aspect: 1.03,
      },
      {
        id: 'wk7', seed: 'weekly-gwen-john', idx: 7,
        title: "A Corner of the Artist's Room in Paris",
        titleKo: '파리의 작업실 한 모퉁이',
        artist: 'Gwen John',
        artistKo: '그웬 존',
        year: '1907–1909',
        medium: 'Oil on canvas',
        mediumKo: '캔버스에 유화',
        dimensions: '31.7 × 26.7 cm',
        museum: 'Sheffield Museums',
        museumCity: 'Sheffield',
        description: 'A tiny painting of an almost-empty room: a wicker chair, a window, diffuse light. Gwen John spent years in this room, and she painted it as if it were enough. It is enough. The restraint here is a kind of devotion.',
        descriptionKo: '거의 비어있는 방의 작은 그림 — 등나무 의자 하나, 창문, 퍼진 빛. 그웬 존은 이 방에서 수년을 보내며, 그것으로 충분하다는 듯 그렸습니다. 그것으로 충분합니다.',
        aspect: 1.19,
      },
      {
        id: 'wk8', seed: 'weekly-morandi', idx: 8,
        title: 'Still Life with Objects in Tones of Grey',
        titleKo: '회색 조의 정물',
        artist: 'Giorgio Morandi',
        artistKo: '조르조 모란디',
        year: '1953',
        medium: 'Oil on canvas',
        mediumKo: '캔버스에 유화',
        dimensions: '30 × 40 cm',
        museum: 'Museo Morandi',
        museumCity: 'Bologna',
        description: 'Morandi spent a lifetime painting bottles. The same bottles, over and over, in different lights. By 1953 the distinctions between them had almost dissolved — the bottles lean on each other like old friends who no longer need to speak.',
        descriptionKo: '모란디는 평생 병을 그렸습니다. 같은 병들을, 반복해서, 다른 빛 속에서. 1953년이 되자 그것들의 구분이 거의 사라졌습니다 — 병들은 더 이상 말이 필요 없는 오랜 친구들처럼 서로에게 기대어 있습니다.',
        aspect: 1.33,
      },
      {
        id: 'wk9', seed: 'weekly-diebenkorn', idx: 9,
        title: 'Interior with View of the Ocean',
        titleKo: '바다가 보이는 실내',
        artist: 'Richard Diebenkorn',
        artistKo: '리처드 디벤코른',
        year: '1957',
        medium: 'Oil on canvas',
        mediumKo: '캔버스에 유화',
        dimensions: '132.4 × 140.3 cm',
        museum: 'Phillips Collection',
        museumCity: 'Washington D.C.',
        description: 'A room in California, a window, a chair, a table. Beyond the frame, the Pacific. Diebenkorn makes architecture of sunlight — the walls are not walls but fields of colour in conversation with the sky. Interior painting at its most expanded.',
        descriptionKo: '캘리포니아의 방 하나, 창문, 의자, 탁자. 프레임 너머 태평양. 디벤코른은 햇빛으로 건축을 만듭니다 — 벽은 벽이 아니라 하늘과 대화하는 색의 평원입니다.',
        aspect: 0.94,
      },
      {
        id: 'wk10', seed: 'weekly-martin', idx: 10,
        title: 'Untitled #7',
        titleKo: '무제 #7',
        artist: 'Agnes Martin',
        artistKo: '아그네스 마틴',
        year: '1990',
        medium: 'Acrylic and graphite on canvas',
        mediumKo: '캔버스에 아크릴과 흑연',
        dimensions: '182.9 × 182.9 cm',
        museum: 'Pace Gallery',
        museumCity: 'New York',
        description: 'Six horizontal bands of pale colour — pink, white, again — separated by graphite lines you can barely see. Martin called this painting "happiness." It is not a painting about light. It is light, if light could be made to last.',
        descriptionKo: '거의 보이지 않는 흑연 선으로 구분된 여섯 개의 옅은 색 가로 띠 — 분홍, 흰색, 다시. 마틴은 이 그림을 "행복"이라 불렀습니다. 빛에 관한 그림이 아닙니다. 빛이 지속될 수 있다면, 그것 자체입니다.',
        aspect: 1,
      },
    ],
  },
];

// ── Adapter: WeeklyPublishedFile → WeeklyEdition ──────────────────────────
// The internal WeeklyEdition shape has richer fields (medium, dimensions,
// museumCity, aspect, korean translations of artist/medium) than the
// published file carries. We fill missing fields with safe defaults so the
// existing JSX renders without modification.

const PERSONA_NAMES: Record<PersonaId, { en: string; ko: string; role: string }> = {
  'yuna-choi':     { en: 'Yuna Choi',     ko: '최유나',  role: 'Senior Editor, Armin' },
  'marco-rinaldi': { en: 'Marco Rinaldi', ko: '마르코 리날디', role: 'Editor at Large, Armin' },
  'anika-voss':    { en: 'Anika Voss',    ko: '아니카 보스', role: 'Contributing Editor, Armin' },
};

function parseIsoWeek(weekStr: string): { year: number; week: number } {
  // e.g. "2026-W19" → { year: 2026, week: 19 }
  const m = /^(\d{4})-W(\d{1,2})$/.exec(weekStr);
  if (!m) return { year: new Date().getFullYear(), week: 1 };
  return { year: parseInt(m[1], 10), week: parseInt(m[2], 10) };
}

function formatPublishedDate(isoTimestamp: string, langKo: 'ko' | 'en'): string {
  const d = new Date(isoTimestamp);
  if (isNaN(d.getTime())) return '';
  if (langKo === 'ko') {
    return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
  }
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

export function adaptPublishedToEdition(file: WeeklyPublishedFile): WeeklyEdition {
  const { year, week } = parseIsoWeek(file.week);
  const persona = PERSONA_NAMES[file.persona_id] ?? { en: file.persona_id, ko: file.persona_id, role: 'Editor, Armin' };

  return {
    id: file.id,
    week,
    year,
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
  return (
    <div
      onClick={onClick}
      style={{
        position: 'relative',
        width: '100%',
        paddingTop: `${(1 / aspect) * 100}%`,
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
  edition, langKo, setLangKo, t, fg, fgMed, fgLow, fgFaint, divider,
}: {
  edition: WeeklyEdition;
  langKo: boolean;
  setLangKo: (v: boolean) => void;
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
          }}>Weekly Curation</span>
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
            ['Edition', `Week ${edition.week}`],
          ] as [string, string][]).map(([k, v]) => (
            <div key={k} style={{ background: t ? '#FAFAFA' : '#080808', padding: '13px 16px' }}>
              <div style={{ ...LABEL, fontSize: 9, color: fgFaint, marginBottom: 5 }}>{k}</div>
              <div style={{ ...BODY, fontSize: 13, color: fg, fontWeight: 500 }}>{v}</div>
            </div>
          ))}
        </div>

        {/* Language toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ ...LABEL, fontSize: 9, color: fgFaint }}>Language</span>
          <div style={{ display: 'flex', border: `1px solid ${divider}` }}>
            {([['EN', false], ['한국어', true]] as [string, boolean][]).map(([label, isKo]) => (
              <button key={label} onClick={() => setLangKo(isKo)} style={{
                padding: '5px 12px',
                background: langKo === isKo ? accent : 'transparent',
                color: langKo === isKo ? '#0c0c0a' : fgFaint,
                border: 'none',
                cursor: 'pointer',
                ...LABEL, fontSize: 9,
                transition: 'background 0.12s, color 0.12s',
              }}>{label}</button>
            ))}
          </div>
          {/* Live indicator */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
            <div style={{ width: 5, height: 5, background: accentText, animation: 'wk-pulse 2s ease-in-out infinite' }} />
            <span style={{ ...LABEL, fontSize: 9, color: fgFaint }}>WEEK {edition.week} · {edition.year}</span>
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
  work, total, langKo, saved, onSave, onClick,
  t, fg, fgMed, fgLow, fgFaint, divider,
}: {
  work: WeeklyWork;
  total: number;
  langKo: boolean;
  saved: boolean;
  onSave: () => void;
  onClick: () => void;
  t: boolean;
  fg: string;
  fgMed: string;
  fgLow: string;
  fgFaint: string;
  divider: string;
}) {
  const [hov, setHov] = useState(false);
  const accent = '#D4A547';
  const accentText = t ? '#8A6B1F' : '#D4A547';

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
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ ...LABEL, fontSize: 10, color: accentText, marginBottom: 12 }}>
            {work.artist} · {work.year}
          </div>
          <h2 style={{
            ...HEADING,
            fontSize: 'clamp(1.4rem,2vw,2.1rem)',
            color: fg,
            lineHeight: 1.06,
            letterSpacing: '-0.028em',
            marginBottom: 6,
          }}>
            {langKo ? work.titleKo : work.title}
          </h2>
          <p style={{ ...BODY, fontSize: 12, color: fgFaint, marginBottom: 20 }}>
            {langKo ? work.title : work.titleKo}
          </p>

          <div style={{ height: '0.5px', background: divider, marginBottom: 18 }} />

          <p style={{ ...BODY, fontSize: 13, color: fgMed, lineHeight: 1.9, marginBottom: 20 }}>
            {langKo ? work.descriptionKo : work.description}
          </p>

          <div style={{ height: '0.5px', background: divider, marginBottom: 18 }} />

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
            {([
              ['Artist', `${work.artist} (${work.artistKo})`],
              ['Year', work.year],
              ['Medium', langKo ? work.mediumKo : work.medium],
              ['Size', work.dimensions],
              ['Museum', `${work.museum}, ${work.museumCity}`],
            ] as [string, string][]).map(([k, v]) => (
              <div key={k} style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                <span style={{ ...LABEL, fontSize: 9, color: fgFaint, minWidth: 50, paddingTop: 2, flexShrink: 0 }}>{k}</span>
                <span style={{ ...BODY, fontSize: 13, color: fgMed, lineHeight: 1.5 }}>{v}</span>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={(e) => { e.stopPropagation(); onSave(); }} style={{
              flex: 1, padding: '11px 0',
              border: `1px solid ${saved ? accent : divider}`,
              background: 'transparent',
              color: saved ? accentText : fgLow,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
              cursor: 'pointer',
              ...LABEL, fontSize: 10,
              transition: 'border-color 0.15s, color 0.15s',
            }}>
              {saved ? <Check size={13} color="currentColor" /> : <BookmarkPlus size={13} color="currentColor" />}
              {saved ? 'Saved' : 'Save'}
            </button>
            <button onClick={onClick} style={{
              flex: 2, padding: '11px 0',
              background: accent, color: '#0c0c0a',
              border: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
              ...LABEL, fontSize: 10,
            }}>
              View detail <ChevronRight size={12} color="#0c0c0a" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Work row (alternating layout) ─────────────────────────────────────────

function WorkRow({
  work, index, langKo, saved, onSave, onClick,
  t, fg, fgMed, fgLow, fgFaint, divider,
}: {
  work: WeeklyWork;
  index: number;
  langKo: boolean;
  saved: boolean;
  onSave: () => void;
  onClick: () => void;
  t: boolean;
  fg: string;
  fgMed: string;
  fgLow: string;
  fgFaint: string;
  divider: string;
}) {
  const [hov, setHov] = useState(false);
  const accent = '#D4A547';
  const accentText = t ? '#8A6B1F' : '#D4A547';
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
      <div style={{ order: isEven ? 1 : 0, display: 'flex', flexDirection: 'column' }}>
        <div style={{ ...LABEL, fontSize: 9, color: accentText, marginBottom: 10 }}>
          {work.artist} · {work.year}
        </div>
        <h3 style={{
          ...HEADING,
          fontSize: 'clamp(1rem,1.6vw,1.5rem)',
          color: fg,
          lineHeight: 1.1,
          letterSpacing: '-0.022em',
          marginBottom: 4,
        }}>
          {langKo ? work.titleKo : work.title}
        </h3>
        <p style={{ ...BODY, fontSize: 12, color: fgFaint, marginBottom: 18 }}>
          {langKo ? work.title : work.titleKo}
        </p>

        <p style={{
          ...BODY,
          fontSize: 'clamp(12px,1.1vw,14px)',
          color: fgMed,
          lineHeight: 1.85,
          marginBottom: 20,
        }}>
          {langKo ? work.descriptionKo : work.description}
        </p>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 16px', marginBottom: 16 }}>
          {[langKo ? work.mediumKo : work.medium, work.dimensions, `${work.museum}, ${work.museumCity}`].map((v, i) => (
            <span key={i} style={{ ...LABEL, fontSize: 9, color: fgFaint }}>{v}</span>
          ))}
        </div>

        <div style={{ height: '0.5px', background: divider, marginBottom: 14 }} />

        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={(e) => { e.stopPropagation(); onSave(); }} style={{
            padding: '7px 14px',
            border: `1px solid ${saved ? accent : divider}`,
            background: 'transparent',
            color: saved ? accentText : fgFaint,
            display: 'flex', alignItems: 'center', gap: 6,
            cursor: 'pointer',
            ...LABEL, fontSize: 9,
            transition: 'border-color 0.15s, color 0.15s',
          }}>
            {saved ? <Check size={11} color="currentColor" /> : <BookmarkPlus size={11} color="currentColor" />}
            {saved ? 'Saved' : 'Save'}
          </button>
          <button onClick={(e) => { e.stopPropagation(); onClick(); }} style={{
            padding: '7px 14px',
            border: `1px solid ${hov ? accent : divider}`,
            background: 'transparent',
            color: hov ? accentText : fgFaint,
            display: 'flex', alignItems: 'center', gap: 6,
            cursor: 'pointer',
            ...LABEL, fontSize: 9,
            transition: 'border-color 0.15s, color 0.15s',
          }}>
            View detail <ChevronRight size={10} color="currentColor" />
          </button>
        </div>
      </div>
    </article>
  );
}

// ── Weekly Lightbox ────────────────────────────────────────────────────────

function WeeklyLightbox({
  work, edition, langKo, saved, onSave, onClose, onPrev, onNext,
}: {
  work: WeeklyWork;
  edition: WeeklyEdition;
  langKo: boolean;
  saved: boolean;
  onSave: () => void;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
}) {
  const currentIdx = edition.works.findIndex(w => w.id === work.id);
  const accent = '#D4A547';

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') onPrev();
      if (e.key === 'ArrowRight') onNext();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose, onPrev, onNext]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      style={{
        position: 'fixed', inset: 0, zIndex: 9000,
        background: 'rgba(6,6,5,0.97)',
        backdropFilter: 'blur(16px)',
        display: 'flex', flexDirection: 'column',
      }}
    >
      {/* Top bar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 24px', borderBottom: '1px solid rgba(255,255,255,0.07)',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <button onClick={onClose} style={{
            color: 'rgba(255,255,255,0.5)',
            display: 'flex', alignItems: 'center', gap: 7,
            background: 'none', border: 'none', cursor: 'pointer',
            ...LABEL, fontSize: 10,
          }}>
            <X size={15} color="currentColor" /> Close
          </button>
          <div style={{ width: 1, height: 14, background: 'rgba(255,255,255,0.1)' }} />
          <span style={{ ...LABEL, fontSize: 10, color: 'rgba(244,241,234,0.55)' }}>
            Weekly Curation · Week {edition.week}
          </span>
          <div style={{ width: 1, height: 14, background: 'rgba(255,255,255,0.1)' }} />
          <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, color: 'rgba(244,241,234,0.55)' }}>
            {String(currentIdx + 1).padStart(2, '0')} / {String(edition.workCount).padStart(2, '0')}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onPrev} disabled={currentIdx === 0} style={{
            width: 34, height: 34,
            border: '1px solid rgba(255,255,255,0.12)',
            background: 'none', cursor: currentIdx === 0 ? 'default' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'rgba(255,255,255,0.5)',
            opacity: currentIdx === 0 ? 0.3 : 1,
          }}>
            <ChevronLeft size={15} />
          </button>
          <button onClick={onNext} disabled={currentIdx === edition.works.length - 1} style={{
            width: 34, height: 34,
            border: '1px solid rgba(255,255,255,0.12)',
            background: 'none', cursor: currentIdx === edition.works.length - 1 ? 'default' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'rgba(255,255,255,0.5)',
            opacity: currentIdx === edition.works.length - 1 ? 0.3 : 1,
          }}>
            <ChevronRight size={15} />
          </button>
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 400px', overflow: 'hidden' }}>
        {/* Artwork */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 40, overflow: 'hidden',
        }}>
          <div style={{
            maxHeight: '80vh',
            width: `min(${Math.round(work.aspect * 560)}px, 90%)`,
          }}>
            <ArtworkPlaceholder seed={work.seed} aspect={work.aspect} imageUrl={work.imageUrl} alt={`${work.artist} — ${work.title}`} style={{ width: '100%' }} />
          </div>
        </div>

        {/* Info panel */}
        <div style={{
          borderLeft: '1px solid rgba(255,255,255,0.07)',
          display: 'flex', flexDirection: 'column', overflowY: 'auto',
          background: 'rgba(255,255,255,0.02)',
        }}>
          <div style={{ padding: '28px 24px', flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18 }}>
              <span style={{ ...LABEL, fontSize: 9, background: accent, color: '#000', padding: '3px 8px' }}>
                Week {edition.week}
              </span>
              <span style={{ ...LABEL, fontSize: 9, color: 'rgba(244,241,234,0.55)' }}>{edition.dateKo}</span>
            </div>

            <div style={{ ...LABEL, fontSize: 10, color: accent, marginBottom: 10 }}>
              {work.artist} ({work.artistKo}) · {work.year}
            </div>

            <h2 style={{ ...HEADING, fontSize: 22, color: 'rgba(244,241,234,0.96)', lineHeight: 1.1, marginBottom: 5 }}>
              {langKo ? work.titleKo : work.title}
            </h2>
            <p style={{ ...BODY, fontSize: 12, color: 'rgba(244,241,234,0.55)', marginBottom: 22 }}>
              {langKo ? work.title : work.titleKo}
            </p>

            <div style={{ height: '0.5px', background: 'rgba(255,255,255,0.07)', marginBottom: 18 }} />

            <p style={{ ...BODY, fontSize: 13, color: 'rgba(244,241,234,0.80)', lineHeight: 1.9, marginBottom: 22 }}>
              {langKo ? work.descriptionKo : work.description}
            </p>

            <div style={{ height: '0.5px', background: 'rgba(255,255,255,0.07)', marginBottom: 18 }} />

            {([
              ['Medium', langKo ? work.mediumKo : work.medium],
              ['Size', work.dimensions],
              ['Museum', work.museum],
              ['City', work.museumCity],
            ] as [string, string][]).map(([k, v]) => (
              <div key={k} style={{ marginBottom: 12 }}>
                <div style={{ ...LABEL, fontSize: 9, color: 'rgba(244,241,234,0.55)', marginBottom: 3 }}>{k}</div>
                <div style={{ ...BODY, fontSize: 13, color: 'rgba(244,241,234,0.80)' }}>{v}</div>
              </div>
            ))}

            <div style={{ height: '0.5px', background: 'rgba(255,255,255,0.07)', margin: '16px 0' }} />

            <button onClick={onSave} style={{
              width: '100%',
              display: 'flex', alignItems: 'center', gap: 9, padding: '11px 14px',
              border: `1px solid ${saved ? accent : 'rgba(255,255,255,0.12)'}`,
              background: 'transparent', cursor: 'pointer',
              color: saved ? accent : 'rgba(244,241,234,0.80)',
              ...LABEL, fontSize: 10,
              transition: 'border-color 0.15s, color 0.15s',
            }}>
              {saved ? <Check size={14} color="currentColor" /> : <BookmarkPlus size={14} color="currentColor" />}
              {saved ? 'Saved to collection' : 'Save to collection'}
            </button>
          </div>

          {/* Progress dots */}
          <div style={{
            borderTop: '1px solid rgba(255,255,255,0.07)',
            padding: '14px 18px',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <span style={{ ...LABEL, fontSize: 9, color: 'rgba(244,241,234,0.55)' }}>
              {String(currentIdx + 1).padStart(2, '0')} of {edition.workCount} works
            </span>
            <div style={{ display: 'flex', gap: 4 }}>
              {edition.works.map((_, i) => (
                <div key={i} style={{
                  width: i === currentIdx ? 14 : 4,
                  height: 4,
                  background: i === currentIdx ? accent : 'rgba(255,255,255,0.18)',
                  transition: 'width 0.22s, background 0.22s',
                }} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </motion.div>
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
          Weekly Curation
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
  work, total, langKo, saved, onSave, onClick,
  t, fg, fgMed, fgLow, fgFaint, divider,
}: {
  work: WeeklyWork; total: number; langKo: boolean;
  saved: boolean; onSave: () => void; onClick: () => void;
  t: boolean; fg: string; fgMed: string; fgLow: string; fgFaint: string; divider: string;
}) {
  const accent = '#D4A547';
  const accentText = t ? '#8A6B1F' : '#D4A547';

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
      <div style={{ paddingTop: 12, paddingBottom: 14 }}>
        <div style={{ ...LABEL, fontSize: 10, color: accentText, marginBottom: 6 }}>
          {work.artist} · {work.year}
        </div>
        <h2 style={{ ...HEADING, fontSize: 18, color: fg, lineHeight: 1.1, letterSpacing: '-0.02em', marginBottom: 4 }}>
          {langKo ? work.titleKo : work.title}
        </h2>
        <p style={{ ...BODY, fontSize: 12, color: fgFaint, marginBottom: 10 }}>
          {langKo ? work.title : work.titleKo}
        </p>
        <p style={{ ...BODY, fontSize: 13, color: fgMed, lineHeight: 1.75, marginBottom: 12 }}>
          {langKo ? work.descriptionKo : work.description}
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', marginBottom: 14 }}>
          {[work.museum, work.museumCity, work.dimensions].map((v, i) => (
            <span key={i} style={{ ...LABEL, fontSize: 9, color: fgFaint }}>{v}</span>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onSave} style={{
            flex: 1, padding: '9px 0',
            border: `1px solid ${saved ? accent : divider}`,
            background: 'transparent', cursor: 'pointer',
            color: saved ? accentText : fgLow,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            ...LABEL, fontSize: 10,
          }}>
            {saved ? <Check size={13} color="currentColor" /> : <BookmarkPlus size={13} color="currentColor" />}
            {saved ? 'Saved' : 'Save'}
          </button>
          <button onClick={onClick} style={{
            flex: 2, padding: '9px 0',
            background: accent, color: '#0c0c0a',
            border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            ...LABEL, fontSize: 10,
          }}>
            View detail <ChevronRight size={11} color="#0c0c0a" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Mobile work card ───────────────────────────────────────────────────────

function MobileWorkCard({
  work, index, langKo, saved, onSave, onClick,
  t, fg, fgMed, fgLow, fgFaint, divider,
}: {
  work: WeeklyWork; index: number; langKo: boolean;
  saved: boolean; onSave: () => void; onClick: () => void;
  t: boolean; fg: string; fgMed: string; fgLow: string; fgFaint: string; divider: string;
}) {
  const [pressed, setPressed] = useState(false);
  const accent = '#D4A547';
  const accentText = t ? '#8A6B1F' : '#D4A547';
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
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ ...LABEL, fontSize: 9, color: accentText, marginBottom: 4 }}>
            {work.artist} · {work.year}
          </div>
          <h3 style={{
            ...HEADING, fontSize: 14, color: fg, lineHeight: 1.2, letterSpacing: '-0.015em',
            marginBottom: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {langKo ? work.titleKo : work.title}
          </h3>
          <p style={{
            ...BODY, fontSize: 11, color: fgFaint, marginBottom: 7,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {langKo ? work.title : work.titleKo}
          </p>
          <p style={{
            ...BODY, fontSize: 12, color: fgMed, lineHeight: 1.65,
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
            marginBottom: 8,
          }}>
            {langKo ? work.descriptionKo : work.description}
          </p>
          <div style={{ ...LABEL, fontSize: 9, color: fgFaint, marginBottom: 9 }}>
            {work.museum} · {work.museumCity}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={(e) => { e.stopPropagation(); onSave(); }} style={{
              padding: '6px 10px',
              border: `1px solid ${saved ? accent : divider}`,
              background: 'transparent', cursor: 'pointer',
              color: saved ? accentText : fgFaint,
              display: 'flex', alignItems: 'center', gap: 5,
              ...LABEL, fontSize: 9,
            }}>
              {saved ? <Check size={11} color="currentColor" /> : <BookmarkPlus size={11} color="currentColor" />}
              {saved ? 'Saved' : 'Save'}
            </button>
            <button onClick={onClick} style={{
              padding: '6px 10px',
              border: `1px solid ${divider}`,
              background: 'transparent', cursor: 'pointer',
              color: fgFaint,
              display: 'flex', alignItems: 'center', gap: 5,
              ...LABEL, fontSize: 9,
            }}>
              Detail <ChevronRight size={10} color="currentColor" />
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}

// ── Mobile work detail (full-screen) ──────────────────────────────────────

function MobileWorkDetail({
  work, edition, langKo, saved, onSave, onClose, onPrev, onNext, currentIdx,
  t, fg, fgMed, fgLow, fgFaint, divider,
}: {
  work: WeeklyWork; edition: WeeklyEdition; langKo: boolean;
  saved: boolean; onSave: () => void; onClose: () => void;
  onPrev: () => void; onNext: () => void; currentIdx: number;
  t: boolean; fg: string; fgMed: string; fgLow: string; fgFaint: string; divider: string;
}) {
  const accent = '#D4A547';
  const accentText = t ? '#8A6B1F' : '#D4A547';
  const bg = t ? '#FAFAFA' : '#080808';
  const bg2 = t ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.025)';
  const total = edition.works.length;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') onPrev();
      if (e.key === 'ArrowRight') onNext();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose, onPrev, onNext]);

  return (
    <motion.div
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '100%' }}
      transition={{ type: 'spring', stiffness: 380, damping: 36 }}
      style={{
        position: 'fixed', inset: 0, zIndex: 9000,
        background: bg,
        display: 'flex', flexDirection: 'column',
        overflowY: 'auto',
      }}
    >
      {/* Top bar — safe-area-aware so Back/Save clear the notch */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        paddingTop: 'calc(env(safe-area-inset-top, 0px) + 10px)',
        paddingBottom: 10,
        paddingLeft: 16,
        paddingRight: 16,
        borderBottom: `1px solid ${divider}`,
        background: bg2,
        flexShrink: 0,
        position: 'sticky', top: 0, zIndex: 10,
      }}>
        <button onClick={onClose} style={{
          display: 'flex', alignItems: 'center', gap: 6,
          background: 'none', border: 'none', cursor: 'pointer',
          ...LABEL, fontSize: 10, color: fgLow,
        }}>
          <ChevronLeft size={14} color="currentColor" /> Back
        </button>
        <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, color: fgFaint }}>
          {String(currentIdx + 1).padStart(2, '0')} / {String(total).padStart(2, '0')}
        </span>
        <button onClick={onSave} style={{
          background: 'none', border: 'none', cursor: 'pointer',
          ...LABEL, fontSize: 10,
          color: saved ? accentText : fgLow,
          display: 'flex', alignItems: 'center', gap: 5,
        }}>
          {saved ? <Check size={14} color="currentColor" /> : <BookmarkPlus size={14} color="currentColor" />}
          {saved ? 'Saved' : 'Save'}
        </button>
      </div>

      {/* Artwork image with prev/next arrows */}
      <div style={{ position: 'relative', background: t ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.03)' }}>
        <ArtworkPlaceholder seed={work.seed} aspect={work.aspect} imageUrl={work.imageUrl} alt={`${work.artist} — ${work.title}`} style={{ width: '100%' }} />
        <button onClick={onPrev} disabled={currentIdx === 0} style={{
          position: 'absolute', left: 0, top: 0, bottom: 0, width: 48,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'none', border: 'none', cursor: currentIdx === 0 ? 'default' : 'pointer',
          opacity: currentIdx === 0 ? 0.2 : 0.75,
        }}>
          <ChevronLeft size={22} color={fg} />
        </button>
        <button onClick={onNext} disabled={currentIdx === total - 1} style={{
          position: 'absolute', right: 0, top: 0, bottom: 0, width: 48,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'none', border: 'none', cursor: currentIdx === total - 1 ? 'default' : 'pointer',
          opacity: currentIdx === total - 1 ? 0.2 : 0.75,
        }}>
          <ChevronRight size={22} color={fg} />
        </button>
      </div>

      {/* Progress dots */}
      <div style={{
        display: 'flex', justifyContent: 'center', gap: 4, padding: '10px 0',
        background: t ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.03)',
      }}>
        {Array.from({ length: total }).map((_, i) => (
          <div key={i} style={{
            width: i === currentIdx ? 14 : 4, height: 4,
            background: i === currentIdx ? accent : (t ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.18)'),
            transition: 'width 0.22s',
          }} />
        ))}
      </div>

      {/* Info */}
      <div style={{ padding: '18px 16px', paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 48px)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <span style={{ ...LABEL, fontSize: 9, background: accent, color: '#0c0c0a', padding: '3px 8px' }}>
            Week {edition.week}
          </span>
          <span style={{ ...LABEL, fontSize: 9, color: fgFaint }}>{edition.dateKo}</span>
        </div>

        <div style={{ ...LABEL, fontSize: 11, color: accentText, marginBottom: 8 }}>
          {work.artist} ({work.artistKo}) · {work.year}
        </div>
        <h2 style={{ ...HEADING, fontSize: 20, color: fg, lineHeight: 1.1, letterSpacing: '-0.02em', marginBottom: 4 }}>
          {langKo ? work.titleKo : work.title}
        </h2>
        <p style={{ ...BODY, fontSize: 12, color: fgFaint, marginBottom: 16 }}>
          {langKo ? work.title : work.titleKo}
        </p>

        <div style={{ height: '0.5px', background: divider, marginBottom: 16 }} />

        <p style={{ ...BODY, fontSize: 14, color: fgMed, lineHeight: 1.85, marginBottom: 18 }}>
          {langKo ? work.descriptionKo : work.description}
        </p>

        <div style={{ height: '0.5px', background: divider, marginBottom: 16 }} />

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 24 }}>
          {([
            ['Medium', langKo ? work.mediumKo : work.medium],
            ['Size', work.dimensions],
            ['Museum', work.museum],
            ['City', work.museumCity],
          ] as [string, string][]).map(([k, v]) => (
            <div key={k} style={{ display: 'flex', gap: 12 }}>
              <span style={{ ...LABEL, fontSize: 9, color: fgFaint, minWidth: 50, paddingTop: 2 }}>{k}</span>
              <span style={{ ...BODY, fontSize: 13, color: fgMed, flex: 1, lineHeight: 1.4 }}>{v}</span>
            </div>
          ))}
        </div>

        <button onClick={onSave} style={{
          width: '100%', padding: '13px 0',
          border: `1px solid ${saved ? accent : divider}`,
          background: 'transparent', cursor: 'pointer',
          color: saved ? accentText : fgMed,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          ...LABEL, fontSize: 11,
          transition: 'border-color 0.15s, color 0.15s',
        }}>
          {saved ? <Check size={15} color="currentColor" /> : <BookmarkPlus size={15} color="currentColor" />}
          {saved ? 'Saved to collection' : 'Save to collection'}
        </button>
      </div>
    </motion.div>
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
    { id: 'this-week', label: 'This Week',  labelKo: '이번 주' },
    { id: 'archive',   label: 'Archive',    labelKo: '지난 주' },
    { id: 'special',   label: 'Special',    labelKo: '특집' },
  ];

  return (
    <div style={{
      display: 'flex', gap: 24,
      padding: 'clamp(16px, 3vw, 24px) clamp(20px, 4vw, 56px)',
      borderBottom: `0.5px solid ${divider}`,
    }}>
      {tabs.map(tab => {
        const active = mode === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => setMode(tab.id)}
            style={{
              ...LABEL,
              fontSize: 10,
              background: 'transparent',
              border: 'none',
              color: active ? fg : fgLow,
              borderBottom: active ? `1px solid ${accent}` : '1px solid transparent',
              padding: '4px 0',
              cursor: 'pointer',
              transition: 'color 0.15s, border-color 0.15s',
            }}
          >
            {langKo ? tab.labelKo : tab.label}
          </button>
        );
      })}
    </div>
  );
}

// ── Grid card (shared by Archive + Special) ───────────────────────────────

function GridCard({
  imageUrl, eyebrow, titlePrimary, titleSecondary, locked, onClick,
  fg, fgMed, fgFaint, divider,
}: {
  imageUrl: string;
  eyebrow: string;
  titlePrimary: string;
  titleSecondary: string;
  locked: boolean;
  onClick: () => void;
  fg: string;
  fgMed: string;
  fgFaint: string;
  divider: string;
}) {
  const accent = '#D4A547';
  const [hov, setHov] = useState(false);

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        position: 'relative',
        cursor: 'pointer',
        border: `0.5px solid ${divider}`,
        background: 'rgba(255,255,255,0.02)',
        overflow: 'hidden',
        outline: hov ? `1px solid ${accent}` : '1px solid transparent',
        transition: 'outline 0.15s',
      }}
    >
      <div style={{ position: 'relative', aspectRatio: '4/3', overflow: 'hidden', background: 'rgba(255,255,255,0.03)' }}>
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={titlePrimary}
            loading="lazy"
            style={{
              width: '100%', height: '100%', objectFit: 'cover', display: 'block',
              filter: locked ? 'grayscale(0.6) brightness(0.5)' : 'none',
              transition: 'filter 0.2s',
            }}
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
          />
        ) : null}
        {locked && (
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            pointerEvents: 'none',
          }}>
            <Lock size={28} color="rgba(255,255,255,0.9)" />
          </div>
        )}
      </div>
      <div style={{ padding: 16 }}>
        <div style={{ ...LABEL, fontSize: 9, color: accent, marginBottom: 6 }}>
          {eyebrow}
        </div>
        <h3 style={{
          ...HEADING, fontSize: 16, lineHeight: 1.25, color: fg,
          letterSpacing: '-0.018em', marginBottom: 4,
        }}>
          {titlePrimary}
        </h3>
        <p style={{ ...BODY, fontSize: 11, color: fgMed, marginTop: 0 }}>
          {titleSecondary}
        </p>
        {locked && (
          <div style={{
            marginTop: 10,
            ...LABEL, fontSize: 8, color: fgFaint,
          }}>
            구독자 전용 · Subscribers only
          </div>
        )}
      </div>
    </div>
  );
}

// ── Archive grid ──────────────────────────────────────────────────────────

function ArchiveGrid({
  entries, loading, langKo, onSelectWeek, onLockedClick, isSubscriber,
  fg, fgMed, fgFaint, divider,
}: {
  entries: ArchiveEntry[];
  loading: boolean;
  langKo: boolean;
  onSelectWeek: (week: string) => void;
  onLockedClick: () => void;
  isSubscriber: boolean;
  fg: string;
  fgMed: string;
  fgFaint: string;
  divider: string;
}) {
  if (loading) {
    return (
      <div style={{
        padding: 'clamp(40px,6vw,80px)', textAlign: 'center',
        ...LABEL, fontSize: 11, color: fgFaint,
      }}>
        Loading archive…
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div style={{
        padding: 'clamp(40px,6vw,80px)', textAlign: 'center',
        ...LABEL, fontSize: 11, color: fgFaint,
      }}>
        No archived editions yet.
      </div>
    );
  }

  // Most-recent 4 unlocked; everything older is locked.
  const UNLOCKED_COUNT = 4;

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
      gap: 16,
      padding: 'clamp(20px, 4vw, 32px)',
    }}>
      {entries.map((entry, i) => {
        // Subscribers see everything; otherwise the position-based rule applies.
        const locked = !isSubscriber && i >= UNLOCKED_COUNT;
        const weekLabel = entry.week.replace('-W', ' · WEEK ');
        const worksCount = entry.works_count;
        return (
          <GridCard
            key={entry.week}
            imageUrl={entry.hero_image_url}
            eyebrow={weekLabel}
            titlePrimary={langKo ? entry.title_ko : entry.title_en}
            titleSecondary={`${entry.persona_id} · ${worksCount}${langKo ? '점' : ' works'}`}
            locked={locked}
            onClick={locked ? onLockedClick : () => onSelectWeek(entry.week)}
            fg={fg}
            fgMed={fgMed}
            fgFaint={fgFaint}
            divider={divider}
          />
        );
      })}
    </div>
  );
}

// ── Special series grid ───────────────────────────────────────────────────

function SpecialGrid({
  entries, loading, langKo, onSelectSpecial, onLockedClick, isSubscriber,
  fg, fgMed, fgFaint, divider,
}: {
  entries: SpecialEntry[];
  loading: boolean;
  langKo: boolean;
  onSelectSpecial: (slug: string) => void;
  onLockedClick: () => void;
  isSubscriber: boolean;
  fg: string;
  fgMed: string;
  fgFaint: string;
  divider: string;
}) {
  if (loading) {
    return (
      <div style={{
        padding: 'clamp(40px,6vw,80px)', textAlign: 'center',
        ...LABEL, fontSize: 11, color: fgFaint,
      }}>
        Loading specials…
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div style={{
        padding: 'clamp(40px,6vw,80px)', textAlign: 'center',
        ...LABEL, fontSize: 11, color: fgFaint,
      }}>
        {langKo ? '특집이 곧 공개됩니다.' : 'Special editions coming soon.'}
      </div>
    );
  }

  // Most-recent 1 unlocked.
  const UNLOCKED_COUNT = 1;

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
      gap: 16,
      padding: 'clamp(20px, 4vw, 32px)',
    }}>
      {entries.map((entry, i) => {
        const locked = !isSubscriber && i >= UNLOCKED_COUNT;
        return (
          <GridCard
            key={entry.slug}
            imageUrl={entry.hero_image_url}
            eyebrow={`SPECIAL · ${entry.lens.toUpperCase()}`}
            titlePrimary={langKo ? entry.title_ko : entry.title_en}
            titleSecondary={`${entry.persona_id} · ${entry.source_week}`}
            locked={locked}
            onClick={locked ? onLockedClick : () => onSelectSpecial(entry.slug)}
            fg={fg}
            fgMed={fgMed}
            fgFaint={fgFaint}
            divider={divider}
          />
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
};

export default function WeeklyCurationTab({
  t, fg, fgMed, fgLow, fgFaint, divider, language,
}: WeeklyCurationTabProps) {
  // Fetched on mount. Start with null (showing skeleton) rather than the
  // hardcoded WEEKLY_EDITIONS[0] — otherwise stale React state can survive
  // a Vite HMR cycle and we keep rendering an old adapter's output (which is
  // what caused the "imageUrl missing → gradient-only" bug). Falling back to
  // hardcoded is now explicit: only if fetch resolves to null.
  const [edition, setEdition] = useState<WeeklyEdition | null>(null);
  const [selectedWork, setSelectedWork] = useState<WeeklyWork | null>(null);
  const [langKo, setLangKo] = useState(language === 'ko');
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768);

  // Top-nav mode + archive/special data (kept above the early return below
  // so hook order stays stable across renders).
  const [mode, setMode] = useState<WeeklyMode>('this-week');
  const [archiveEntries, setArchiveEntries] = useState<ArchiveEntry[]>([]);
  const [archiveLoading, setArchiveLoading] = useState(true);
  const [specialEntries, setSpecialEntries] = useState<SpecialEntry[]>([]);
  const [specialLoading, setSpecialLoading] = useState(true);

  // Paywall modal state. `subscribeContext` shapes copy in SubscribeModal.
  const [subscribeModalOpen, setSubscribeModalOpen] = useState(false);
  const [subscribeContext, setSubscribeContext] = useState<'archive' | 'special'>('archive');

  // Subscription status drives the lock rule below. Hook order matters,
  // so this stays above any early return.
  const { isSubscriber } = useSubscription();

  useEffect(() => {
    let cancelled = false;
    fetchCurrentCuration()
      .then((file: WeeklyPublishedFile | null) => {
        if (cancelled) return;
        if (file) {
          const adapted = adaptPublishedToEdition(file);
          // Diagnostic: confirms the new adapter ran and wired imageUrl through.
          // Look for this in the browser console to verify a fresh module load.
          // eslint-disable-next-line no-console
          console.log('[WeeklyCurationTab] adapted live curation', {
            week: file.week, id: file.id, works: adapted.works.length,
            firstImageUrl: adapted.works[0]?.imageUrl,
          });
          setEdition(adapted);
        } else {
          setEdition(WEEKLY_EDITIONS[0]);
        }
      })
      .catch(() => { setEdition(WEEKLY_EDITIONS[0]); });
    return () => { cancelled = true; };
  }, []);

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
      const res = await fetch(`/data/weekly-curations/${week}.json`);
      if (!res.ok) return;
      const file = await res.json() as WeeklyPublishedFile;
      setEdition(adaptPublishedToEdition(file));
      setMode('this-week');
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
      setEdition(adaptPublishedToEdition(file));
      setMode('this-week');
      if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch {
      // Silent failure.
    }
  }, []);

  // Skeleton: brief flash while fetching. Acceptable for V1.
  if (!edition) {
    return (
      <div style={{
        padding: 'clamp(40px,6vw,80px)',
        textAlign: 'center',
        color: 'rgba(244,241,234,0.4)',
        fontFamily: "'Space Mono', monospace",
        fontSize: 11,
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
      }}>
        Loading this week's curation…
      </div>
    );
  }

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const toggleSave = useCallback((id: string) => {
    setSavedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const currentIdx = selectedWork ? edition.works.findIndex(w => w.id === selectedWork.id) : -1;

  const tokens = { t, fg, fgMed, fgLow, fgFaint, divider };

  const topNav = (
    <WeeklyTopNav
      mode={mode}
      setMode={setMode}
      langKo={langKo}
      fg={fg}
      fgLow={fgLow}
      divider={divider}
    />
  );

  const archiveView = (
    <ArchiveGrid
      entries={archiveEntries}
      loading={archiveLoading}
      langKo={langKo}
      onSelectWeek={handleSelectArchiveWeek}
      onLockedClick={() => handleLockedClick('archive')}
      isSubscriber={isSubscriber}
      fg={fg}
      fgMed={fgMed}
      fgFaint={fgFaint}
      divider={divider}
    />
  );

  const specialView = (
    <SpecialGrid
      entries={specialEntries}
      loading={specialLoading}
      langKo={langKo}
      onSelectSpecial={handleSelectSpecial}
      onLockedClick={() => handleLockedClick('special')}
      isSubscriber={isSubscriber}
      fg={fg}
      fgMed={fgMed}
      fgFaint={fgFaint}
      divider={divider}
    />
  );

  // Rendered alongside every layout branch so it's available regardless
  // of where the click came from.
  const subscribeModal = (
    <SubscribeModal
      open={subscribeModalOpen}
      onClose={() => setSubscribeModalOpen(false)}
      triggerContext={subscribeContext}
    />
  );

  // ── Mobile layout ────────────────────────────────────────────────────────
  if (isMobile) {
    if (mode === 'archive') {
      return <div style={{ paddingBottom: 80 }}>{topNav}{archiveView}{subscribeModal}</div>;
    }
    if (mode === 'special') {
      return <div style={{ paddingBottom: 80 }}>{topNav}{specialView}{subscribeModal}</div>;
    }
    return (
      <div style={{ paddingBottom: 80 }}>
        {topNav}
        <MobileEditionHeader edition={edition} langKo={langKo} {...tokens} />

        <MobileHeroWork
          work={edition.works[0]}
          total={edition.workCount}
          langKo={langKo}
          saved={savedIds.has(edition.works[0].id)}
          onSave={() => toggleSave(edition.works[0].id)}
          onClick={() => setSelectedWork(edition.works[0])}
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
              saved={savedIds.has(work.id)}
              onSave={() => toggleSave(work.id)}
              onClick={() => setSelectedWork(work)}
              {...tokens}
            />
          ))}
        </div>

        <AnimatePresence>
          {selectedWork && (
            <MobileWorkDetail
              work={selectedWork}
              edition={edition}
              langKo={langKo}
              saved={savedIds.has(selectedWork.id)}
              onSave={() => toggleSave(selectedWork.id)}
              onClose={() => setSelectedWork(null)}
              onPrev={() => { if (currentIdx > 0) setSelectedWork(edition.works[currentIdx - 1]); }}
              onNext={() => { if (currentIdx < edition.works.length - 1) setSelectedWork(edition.works[currentIdx + 1]); }}
              currentIdx={currentIdx}
              {...tokens}
            />
          )}
        </AnimatePresence>
        {subscribeModal}
      </div>
    );
  }

  // ── Desktop layout ───────────────────────────────────────────────────────
  if (mode === 'archive') {
    return <div style={{ paddingBottom: 80 }}>{topNav}{archiveView}{subscribeModal}</div>;
  }
  if (mode === 'special') {
    return <div style={{ paddingBottom: 80 }}>{topNav}{specialView}{subscribeModal}</div>;
  }

  return (
    <div style={{ paddingBottom: 80 }}>
      {topNav}
      <EditionHeader
        edition={edition}
        langKo={langKo}
        setLangKo={setLangKo}
        {...tokens}
      />

      <HeroWork
        work={edition.works[0]}
        total={edition.workCount}
        langKo={langKo}
        saved={savedIds.has(edition.works[0].id)}
        onSave={() => toggleSave(edition.works[0].id)}
        onClick={() => setSelectedWork(edition.works[0])}
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
              saved={savedIds.has(work.id)}
              onSave={() => toggleSave(work.id)}
              onClick={() => setSelectedWork(work)}
              {...tokens}
            />
          ))}
        </div>
      </div>

      <AnimatePresence>
        {selectedWork && (
          <WeeklyLightbox
            work={selectedWork}
            edition={edition}
            langKo={langKo}
            saved={savedIds.has(selectedWork.id)}
            onSave={() => toggleSave(selectedWork.id)}
            onClose={() => setSelectedWork(null)}
            onPrev={() => {
              if (currentIdx > 0) setSelectedWork(edition.works[currentIdx - 1]);
            }}
            onNext={() => {
              if (currentIdx < edition.works.length - 1) setSelectedWork(edition.works[currentIdx + 1]);
            }}
          />
        )}
      </AnimatePresence>
      {subscribeModal}
    </div>
  );
}
