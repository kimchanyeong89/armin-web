export const MOBILE_CHROME_TWEAK_IDS = [
  "museum-ticket",
  "editorial-accordion",
  "double-bezel",
  "adaptive-ledger",
  "accessible-tray",
  "colly-hybrid",
] as const;

export type MobileChromeTweakId = (typeof MOBILE_CHROME_TWEAK_IDS)[number];

export type MobileChromeTweak = {
  id: MobileChromeTweakId;
  name: string;
  nameKo: string;
  skill: string;
  url: string;
};

const TWEAK_META: ReadonlyArray<Omit<MobileChromeTweak, "url">> = [
  { id: "museum-ticket", name: "Index Rail", nameKo: "인덱스 레일", skill: "frontend-design" },
  { id: "editorial-accordion", name: "Compass Dial", nameKo: "컴퍼스 다이얼", skill: "design-taste-frontend" },
  { id: "double-bezel", name: "Folded Ledger", nameKo: "폴디드 레저", skill: "high-end-visual-design" },
  { id: "adaptive-ledger", name: "Museum Ribbon", nameKo: "뮤지엄 리본", skill: "redesign-existing-projects" },
  { id: "accessible-tray", name: "Coordinate Deck", nameKo: "코디네이트 덱", skill: "ui-ux-pro-max" },
  { id: "colly-hybrid", name: "Command Strip", nameKo: "커맨드 스트립", skill: "design-system-builder" },
];

export const MOBILE_CHROME_TWEAKS: readonly MobileChromeTweak[] = TWEAK_META.map((tweak) => ({
  ...tweak,
  url: `/interactive?tweak=${tweak.id}`,
}));

const MOBILE_CHROME_TWEAK_ID_SET = new Set<string>(MOBILE_CHROME_TWEAK_IDS);

export function resolveMobileChromeTweak(
  value: string | null | undefined,
): MobileChromeTweakId | undefined {
  return value && MOBILE_CHROME_TWEAK_ID_SET.has(value)
    ? value as MobileChromeTweakId
    : undefined;
}
