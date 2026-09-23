/**
 * AI tab redesign — settled.
 *
 * No studies left to choose between:
 *   · a left-aligned title block
 *   · the two curations as one bordered switch, split in half, centred,
 *     stuck to the top of the window as you scroll. A gold dot marks the
 *     chosen half; no counts.
 *   · the match reads as a figure with a gold point in front of it. Point
 *     at the card and the point draws itself out into a short bar.
 *   · Paperlogy sets the headings and the large type, Wanted Sans the small
 *     type; both come from the community board's font table.
 *   · like and playlist ride the artwork's lower right.
 */
export const GRID_COLUMNS = 5;

export const AI_COPY = {
  kicker: { ko: "COLLY AI · 개인 맞춤 추천", en: "COLLY AI · Personal picks" },
  title: { ko: "당신의 취향을 읽는 큐레이션.", en: "Curation that reads your taste." },
  body: {
    ko: "좋아요와 컬렉션 기록을 바탕으로, 세계 미술관 소장품 가운데 지금 당신에게 맞는 작품을 골라 보여드립니다.",
    en: "Built from your likes and collections, picked from museum holdings around the world.",
  },
  foot: { ko: "작품 세 점을 고르면 추천이 시작됩니다", en: "Pick three works and the picks begin" },
};
