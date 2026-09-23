/**
 * Refinement studies for the community board.
 *
 * All five keep the composition that is now live: category rail on the left,
 * sort under the tabs, review-target row, then the post list. They differ in
 * element sizing and where each piece of a row sits - nothing else.
 */
export const COMMUNITY_BOARD_SLUGS = [
  "tight",
  "gallery",
  "aligned",
  "quiet",
  "signal",
] as const;

export type CommunityBoardSlug = (typeof COMMUNITY_BOARD_SLUGS)[number];

export interface CommunityBoardStudy {
  slug: CommunityBoardSlug;
  title: string;
  titleKo: string;
  skills: string;
  note: string;
  noteKo: string;
}

export const COMMUNITY_BOARD_STUDIES: CommunityBoardStudy[] = [
  {
    slug: "tight",
    title: "Tight",
    titleKo: "조밀",
    skills: "ui-ux-pro-max + web-design-guidelines",
    note: "36px thumb, 48px rows, the category reduced to a dot. Most posts per screen.",
    noteKo: "썸네일 36px, 행 48px, 분류는 점 하나로. 한 화면에 가장 많이 담습니다.",
  },
  {
    slug: "gallery",
    title: "Gallery",
    titleKo: "갤러리",
    skills: "frontend-design + ui-ux-pro-max",
    note: "72px thumb and a 92px row, with the excerpt kept. The image leads.",
    noteKo: "썸네일 72px, 행 92px, 요약문 유지. 이미지가 앞장섭니다.",
  },
  {
    slug: "aligned",
    title: "Aligned",
    titleKo: "정렬",
    skills: "design-system-builder + web-design-guidelines",
    note: "Author, date and counts break into fixed columns under micro headers.",
    noteKo: "글쓴이·날짜·반응을 작은 열 제목 아래 고정 열로 정렬합니다.",
  },
  {
    slug: "quiet",
    title: "Quiet",
    titleKo: "여백",
    skills: "frontend-design + tailwind-design-system",
    note: "No chip - the rail already says the category. Small thumb, roomy leading.",
    noteKo: "칩 없음 — 분류는 레일이 이미 말합니다. 작은 썸네일과 넉넉한 행간.",
  },
  {
    slug: "signal",
    title: "Signal",
    titleKo: "반응",
    skills: "ui-ux-pro-max + design-system-builder",
    note: "Likes and replies merge into one activity figure with a proportional bar.",
    noteKo: "좋아요와 댓글을 하나의 반응 수치로 합치고 비율 막대를 붙입니다.",
  },
];

export function buildCommunityBoardPath(slug: CommunityBoardSlug): string {
  return `/redesign/community-board/${slug}`;
}

export function getCommunityBoardStudy(value?: string): CommunityBoardStudy {
  return COMMUNITY_BOARD_STUDIES.find((study) => study.slug === value) || COMMUNITY_BOARD_STUDIES[0];
}
