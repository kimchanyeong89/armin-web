/**
 * Search tab redesign — two studies.
 *
 * Style: the map tab's — #080808 ground, gold #d4a547, Space Mono
 * numerals, hairlines, padded counts, Paperlogy for headings and
 * Wanted Sans for the small type.
 *
 * Both studies share one field, one AI control (the switch), one
 * recent-query line and one trending index. What differs is the frame
 * underneath — a board or a drawer.
 *
 * The AI control carries what the real field carries: semantic search
 * on or off, and which engine is behind it — 빠름 (SigLIP) or 정밀
 * (Jina). That is how GlobalSearchBar behaves on this page.
 */
export const SEARCH_SLUGS = ["board", "drawer"] as const;
export type SearchSlug = (typeof SEARCH_SLUGS)[number];

export interface SearchStudy {
  slug: SearchSlug;
  title: string; titleKo: string;
  noteKo: string;
}

export const SEARCH_STUDIES: SearchStudy[] = [
  { slug: "board", title: "Board", titleKo: "괘판",
    noteKo: "장르를 왼쪽에 세우고 미술관을 오른쪽에 놓습니다. 고른 장르는 금색 세로선 하나로만 표시합니다." },
  { slug: "drawer", title: "Drawer", titleKo: "서랍",
    noteKo: "장르를 모두 접어두고 필요한 것만 엽니다. 열 장르가 한 화면에 들어옵니다." },
];

export function buildSearchPath(slug: SearchSlug): string { return `/redesign/search/${slug}`; }
export function getSearchStudy(value?: string): SearchStudy {
  return SEARCH_STUDIES.find((s) => s.slug === value) || SEARCH_STUDIES[0];
}

/** the viewer's own last queries - stand-in values for the studies.
    `ago` is carried because two studies date the row rather than
    numbering it. */
export interface RecentQuery { term: string; agoKo: string; agoEn: string }
export const RECENT: RecentQuery[] = [
  { term: "빈센트 반 고흐", agoKo: "14분 전", agoEn: "14m ago" },
  { term: "청기사", agoKo: "1시간 전", agoEn: "1h ago" },
  { term: "정물화", agoKo: "3시간 전", agoEn: "3h ago" },
  { term: "MoMA", agoKo: "어제", agoEn: "yesterday" },
  { term: "수련", agoKo: "이틀 전", agoEn: "2d ago" },
];

/** what is being searched right now.
    `move` is the direction, `delta` how many places it moved (null for a
    new entry) and `heat` the relative volume, 0-100. Studies use one or
    two of the three - an arrow, a signed number, or a bar. */
export interface TrendingTerm {
  term: string;
  move: "up" | "down" | "same" | "new";
  delta: number | null;
  heat: number;
}
export const TRENDING: TrendingTerm[] = [
  { term: "구스타프 클림트", move: "up", delta: 2, heat: 100 },
  { term: "겨울 풍경", move: "new", delta: null, heat: 88 },
  { term: "이중섭", move: "up", delta: 4, heat: 81 },
  { term: "베르메르", move: "same", delta: 0, heat: 74 },
  { term: "판화·드로잉", move: "down", delta: -2, heat: 66 },
  { term: "쿠사마 야요이", move: "up", delta: 1, heat: 58 },
  { term: "루브르 박물관", move: "same", delta: 0, heat: 51 },
  { term: "인상주의", move: "down", delta: -5, heat: 44 },
  { term: "한국 근대회화", move: "new", delta: null, heat: 37 },
  { term: "자화상", move: "same", delta: 0, heat: 30 },
];
