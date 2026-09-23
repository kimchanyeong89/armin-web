/**
 * My Page — five proposals for everything above the artwork grid.
 *
 * The grid is the live page's and stays as it is. Above it every proposal
 * carries the parts the live page has: the cover, the avatar, the nickname
 * with its level mark and the level help, the email, the score, editing, the
 * slideshow, My Playlists, the six counted tabs and the sort. What changes is
 * the arrangement, and each proposal takes it from one of the app's own tabs.
 */
import { rankForScore } from "../../utils/communityRank";
import { WORKS as ARTIST_WORKS } from "../artist/model";

export const PROFILE_STUDIES = [
  { slug: "band", letter: "A", ko: "작가 페이지형", en: "Artist band" },
  { slug: "stage", letter: "B", ko: "글로브 무대형", en: "Globe stage" },
  { slug: "statement", letter: "C", ko: "AI 탭형", en: "AI tab" },
  { slug: "board", letter: "D", ko: "커뮤니티형", en: "Community board" },
  { slug: "panel", letter: "E", ko: "지도 패널형", en: "Map panel" },
] as const;
export type ProfileSlug = (typeof PROFILE_STUDIES)[number]["slug"];

/** The account the proposals show — the same kinds of values the live page
    reads, with a stand-in name and address. */
export const ME = {
  name: "김채영",
  email: "chaeyoung@colly.art",
  score: 1065,
  /* a portrait that fills the round frame — a random work can be a small
     print on a wide mount and read as an empty circle */
  avatar: ARTIST_WORKS[4]?.image,
};
export const MY_RANK = rankForScore(ME.score);

/** The six tabs My Page has, in its own order, with the counts of the
    account in the review screenshot. */
export const TABS = [
  { key: "artworks", ko: "작품", en: "Artworks", count: 818 },
  { key: "exhibitions", ko: "전시", en: "Exhibitions", count: 36 },
  { key: "museums", ko: "미술관", en: "Museums", count: 12 },
  { key: "artists", ko: "작가", en: "Artists", count: 11 },
  { key: "playlists", ko: "플레이리스트", en: "Playlists", count: 2 },
  { key: "curations", ko: "큐레이션", en: "Curations", count: 1 },
] as const;
export type TabKey = (typeof TABS)[number]["key"];

/** The live page's three sorts, with its own words. */
export const SORTS = [
  { key: "recent", ko: "최신", en: "Latest" },
  { key: "oldest", ko: "오래된 순", en: "Oldest" },
  { key: "year", ko: "최신 연도", en: "Newest" },
] as const;
export type SortKey = (typeof SORTS)[number]["key"];

/** My Playlists as the screenshot has them: a name and how many works. */
export const PLAYLISTS = [
  { id: "new", title: "New", items: 2 },
  { id: "test", title: "test", items: 11 },
];
