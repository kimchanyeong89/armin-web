export const COMMUNITY_STUDY_SLUGS = [
  "living-archive",
  "salon-stream",
  "critics-index",
  "afterimage-gallery",
  "civic-forum",
  "collection-grid",
] as const;

export type CommunityStudySlug = (typeof COMMUNITY_STUDY_SLUGS)[number];

export interface CommunityStudy {
  slug: CommunityStudySlug;
  title: string;
  skill: string;
  note: string;
}

export const COMMUNITY_STUDIES: CommunityStudy[] = [
  {
    slug: "living-archive",
    title: "Living Archive",
    skill: "redesign-existing-projects",
    note: "A familiar feed recut as an active museum archive.",
  },
  {
    slug: "salon-stream",
    title: "Salon Stream",
    skill: "frontend-design",
    note: "A conversational salon with one story holding the room.",
  },
  {
    slug: "critics-index",
    title: "Critics' Index",
    skill: "design-taste-frontend",
    note: "A dense editorial register for quick comparison.",
  },
  {
    slug: "afterimage-gallery",
    title: "Afterimage Gallery",
    skill: "high-end-visual-design",
    note: "An image-led field where discussion follows the artwork.",
  },
  {
    slug: "civic-forum",
    title: "Civic Forum",
    skill: "ui-ux-pro-max",
    note: "A calm, legible forum designed for every input method.",
  },
  {
    slug: "collection-grid",
    title: "Collection Grid",
    skill: "design-system-builder",
    note: "A modular system for scanning different kinds of voices.",
  },
];

export function buildCommunityStudyPath(slug: CommunityStudySlug): string {
  return `/redesign/community/${slug}`;
}

export function getCommunityStudy(value?: string): CommunityStudy {
  return COMMUNITY_STUDIES.find((study) => study.slug === value) || COMMUNITY_STUDIES[0];
}
