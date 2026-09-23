/** Ten levels. Every threshold doubled on 2026-09-16: the top was reachable too soon, so it now sits at 2,000.
 *  Stored "Lv.N" strings in old posts keep their words; a level is recomputed from the score whenever it is read. */
export const COMMUNITY_RANKS = [
  { threshold: 0, label: "Lv.1 Observer" },
  { threshold: 10, label: "Lv.2 Seeker" },
  { threshold: 30, label: "Lv.3 Collector" },
  { threshold: 60, label: "Lv.4 Curator" },
  { threshold: 120, label: "Lv.5 Gallerist" },
  { threshold: 200, label: "Lv.6 Patron" },
  { threshold: 400, label: "Lv.7 Visionary" },
  { threshold: 700, label: "Lv.8 Connoisseur" },
  { threshold: 1200, label: "Lv.9 Luminary" },
  { threshold: 2000, label: "Lv.10 Laureate" },
];

/** The level number a label carries ("Lv.10 Laureate" → 10), kept inside the table; anything else is level 1. */
export function rankLevel(label: unknown): number {
  const n = Number(/Lv\.?\s*(\d+)/i.exec(String(label ?? ""))?.[1]);
  return Number.isFinite(n) ? Math.min(COMMUNITY_RANKS.length, Math.max(1, n)) : 1;
}

export const DEFAULT_COMMUNITY_RANK = COMMUNITY_RANKS[0].label;

export function resolveCommunityRank(explicitRank: unknown, likes = 0, comments = 0): string {
  if (typeof explicitRank === "string" && explicitRank.trim()) {
    return explicitRank.trim();
  }

  const safeLikes = Number.isFinite(Number(likes)) ? Math.max(0, Number(likes)) : 0;
  const safeComments = Number.isFinite(Number(comments)) ? Math.max(0, Number(comments)) : 0;
  return rankForScore(safeLikes + safeComments * 2);
}

/** The level a score reaches; My Page, the community card and the post fallback read this one table. */
export function rankForScore(score: number): string {
  const safe = Number.isFinite(score) ? Math.max(0, score) : 0;
  let current = COMMUNITY_RANKS[0].label;
  for (let i = COMMUNITY_RANKS.length - 1; i >= 0; i -= 1) {
    if (safe >= COMMUNITY_RANKS[i].threshold) {
      current = COMMUNITY_RANKS[i].label;
      break;
    }
  }
  return current;
}

/** What earns a level: a liked artwork counts 1, a liked exhibition 2, a community post 5. */
export function userActivityScore({
  likedArtworks = 0,
  likedExhibitions = 0,
  posts = 0,
}: {
  likedArtworks?: number;
  likedExhibitions?: number;
  posts?: number;
}): number {
  return likedArtworks + likedExhibitions * 2 + posts * 5;
}
