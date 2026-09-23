/**
 * My Page redesign — six compositions, one style.
 *
 * The style is fixed and is the home globe's: #080808 ground, gold
 * #d4a547, Space Mono numerals, hairlines, padded counts, Paperlogy for
 * headings and Wanted Sans for the small type. No study touches it.
 *
 * The parts are fixed too, and are the profile page's own: a cover, the
 * avatar, the name with its rank, the account line, the action, a tabbed
 * menu of six counted collections, and the grid.
 *
 * What each study changes is the composition — where those parts sit,
 * how the tab menu is shaped, and how the grid is set.
 */
export const MY_SLUGS = ["front", "side", "column", "plate", "strip", "lead"] as const;
export type MySlug = (typeof MY_SLUGS)[number];

export interface MyStudy {
  slug: MySlug;
  title: string; titleKo: string;
  noteKo: string;
}

export const MY_STUDIES: MyStudy[] = [
  { slug: "front", title: "Front", titleKo: "정면",
    noteKo: "커버가 화면 폭을 다 쓰고 아바타가 그 아래 경계에 걸칩니다. 탭은 여섯 칸 가로, 격자는 3열." },
  { slug: "side", title: "Side", titleKo: "측면",
    noteKo: "커버를 세로로 세워 왼쪽에 두고 프로필을 그 옆에 붙입니다. 탭은 두 블록 아래를 가로지르고, 격자는 4열." },
  { slug: "column", title: "Column", titleKo: "기둥",
    noteKo: "탭을 세로 메뉴로 세워 왼쪽 기둥에 두고 격자가 오른쪽을 씁니다. 번호와 개수가 함께 섭니다." },
  { slug: "plate", title: "Plate", titleKo: "표제",
    noteKo: "커버를 크게 쓰고 이름을 그 위에 얹습니다. 우하단에 좌표 리드아웃, 탭은 테두리 안 여섯 칸." },
  { slug: "strip", title: "Strip", titleKo: "띠",
    noteKo: "커버를 얇은 띠로 줄이고 프로필을 한 줄로 눕힙니다. 탭은 옆으로 흐르는 칩 줄, 격자는 5열." },
  { slug: "lead", title: "Lead", titleKo: "선두",
    noteKo: "격자의 첫 칸을 네 배로 키워 선두를 세웁니다. 탭은 밑줄 한 줄, 나머지는 그 주위를 흐릅니다." },
];

export function buildMyPath(slug: MySlug): string { return `/redesign/mypage/${slug}`; }
export function getMyStudy(value?: string): MyStudy {
  return MY_STUDIES.find((s) => s.slug === value) || MY_STUDIES[0];
}

/** The six tabs My Page already has, in its own order. */
export const TABS = [
  { key: "artworks", ko: "작품", en: "Artworks", count: 214 },
  { key: "exhibitions", ko: "전시", en: "Exhibitions", count: 37 },
  { key: "museums", ko: "미술관", en: "Museums", count: 26 },
  { key: "artists", ko: "작가", en: "Artists", count: 58 },
  { key: "playlists", ko: "재생목록", en: "Playlists", count: 9 },
  { key: "curations", ko: "큐레이션", en: "Curations", count: 12 },
] as const;
export type TabKey = (typeof TABS)[number]["key"];
