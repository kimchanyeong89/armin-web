const COMMUNITY_RANKS = [
  { threshold: 0, label: "Lv.1 Observer" },
  { threshold: 5, label: "Lv.2 Seeker" },
  { threshold: 15, label: "Lv.3 Collector" },
  { threshold: 30, label: "Lv.4 Curator" },
  { threshold: 60, label: "Lv.5 Gallerist" },
  { threshold: 100, label: "Lv.6 Patron" },
  { threshold: 200, label: "Lv.7 Visionary" },
];

export const DEFAULT_COMMUNITY_RANK = COMMUNITY_RANKS[0].label;

export function resolveCommunityRank(explicitRank: unknown, likes = 0, comments = 0): string {
  if (typeof explicitRank === "string" && explicitRank.trim()) {
    return explicitRank.trim();
  }

  const safeLikes = Number.isFinite(Number(likes)) ? Math.max(0, Number(likes)) : 0;
  const safeComments = Number.isFinite(Number(comments)) ? Math.max(0, Number(comments)) : 0;
  const score = safeLikes + safeComments * 2;

  let current = COMMUNITY_RANKS[0].label;
  for (let i = COMMUNITY_RANKS.length - 1; i >= 0; i -= 1) {
    if (score >= COMMUNITY_RANKS[i].threshold) {
      current = COMMUNITY_RANKS[i].label;
      break;
    }
  }
  return current;
}
