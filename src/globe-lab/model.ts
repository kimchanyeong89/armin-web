import {
  GLOBE_VISUAL_PRESET_IDS,
  type GlobeVisualPresetId,
} from "../components/InteractiveGlobeMap/globeVisualPresets";

export const GLOBE_LAB_SLUGS = GLOBE_VISUAL_PRESET_IDS;

export type GlobeLabSlug = GlobeVisualPresetId;

export type GlobeLabCandidate = {
  slug: GlobeLabSlug;
  name: string;
  nameKo: string;
  skill: string;
  headline: string;
  headlineKo: string;
  summary: string;
  summaryKo: string;
  accent: string;
  theme: "light" | "dark";
  palette: readonly [string, string, string];
};

export const COLLY_GLOBE_VARIANT_SLUGS = [
  "atlas-index",
  "margin-ledger",
  "radial-register",
  "country-folio",
  "coordinate-index",
  "city-gazetteer",
] as const;

export type CollyGlobeVariantSlug = (typeof COLLY_GLOBE_VARIANT_SLUGS)[number];

export type CollyGlobeVariant = {
  slug: CollyGlobeVariantSlug;
  name: string;
  nameKo: string;
  skill: string;
  summary: string;
  summaryKo: string;
};

export const COLLY_GLOBE_VARIANTS: readonly CollyGlobeVariant[] = [
  {
    slug: "atlas-index",
    name: "Atlas Index",
    nameKo: "아틀라스 인덱스",
    skill: "design-taste-frontend",
    summary: "Zoom until each museum count settles above its country. Drag across borders to compare neighboring regions.",
    summaryKo: "확대하면 미술관 수가 국가명 위에 자리 잡습니다. 국경을 따라 드래그하며 이웃 지역을 비교해 보세요.",
  },
  {
    slug: "margin-ledger",
    name: "Margin Ledger",
    nameKo: "마진 레저",
    skill: "design-taste-frontend",
    summary: "Countries resolve into aligned editorial margins with a separate numeric ledger.",
    summaryKo: "국가 라벨을 정돈된 양쪽 여백과 별도의 숫자 열로 구성한 에디토리얼 지도입니다.",
  },
  {
    slug: "radial-register",
    name: "Radial Register",
    nameKo: "레이디얼 레지스터",
    skill: "design-taste-frontend",
    summary: "Countries on the visible face are named in place. Countries beyond the horizon remain indexed around the rim.",
    summaryKo: "보이는 면의 국가는 영토 위에 표시됩니다. 지평선 너머의 국가는 외곽 레지스터에서 계속 찾을 수 있습니다.",
  },
  {
    slug: "country-folio",
    name: "Country Folio",
    nameKo: "컨트리 폴리오",
    skill: "design-taste-frontend",
    summary: "Museum density edits the country boundaries themselves into a measured geographic folio.",
    summaryKo: "미술관 밀도에 따라 국가 경계 자체의 굵기를 편집한 절제된 지리 폴리오입니다.",
  },
  {
    slug: "coordinate-index",
    name: "Coordinate Index",
    nameKo: "코디네이트 인덱스",
    skill: "design-taste-frontend",
    summary: "Six high-signal countries become a sparse field of coordinates, codes, and counts.",
    summaryKo: "핵심 6개 국가를 좌표와 코드, 집계만 남긴 희소한 인덱스로 보여줍니다.",
  },
  {
    slug: "city-gazetteer",
    name: "City Gazetteer",
    nameKo: "시티 개저티어",
    skill: "design-taste-frontend",
    summary: "Real museum cities replace countries in a compact ranked geographic directory.",
    summaryKo: "실제 미술관 도시를 국가 대신 집계해 컴팩트한 순위형 지리 사전으로 구성합니다.",
  },
] as const;

export const GLOBE_LAB_CANDIDATES: readonly GlobeLabCandidate[] = [
  {
    slug: "editorial-atlas",
    name: "Editorial Atlas",
    nameKo: "에디토리얼 아틀라스",
    skill: "design-taste-frontend",
    headline: "The world, edited by art.",
    headlineKo: "예술로 세계를 편집합니다.",
    summary: "An asymmetric field guide where the globe behaves like an annotated plate.",
    summaryKo: "글로브를 주석이 달린 도판처럼 다루는 비대칭 필드 가이드입니다.",
    accent: "#b93120",
    theme: "light",
    palette: ["#dfe3d8", "#1d315f", "#b93120"],
  },
  {
    slug: "signal-observatory",
    name: "Signal Observatory",
    nameKo: "시그널 옵저버토리",
    skill: "frontend-design",
    headline: "Culture leaves a signal.",
    headlineKo: "문화는 하나의 신호를 남깁니다.",
    summary: "A calibrated night instrument for reading museums, cities, and collection density.",
    summaryKo: "미술관과 도시, 소장품의 밀도를 읽는 정밀한 야간 관측 장비입니다.",
    accent: "#ff8a5b",
    theme: "dark",
    palette: ["#07110f", "#ff8a5b", "#42d9d0"],
  },
  {
    slug: "nocturne",
    name: "Nocturne",
    nameKo: "녹턴",
    skill: "high-end-visual-design",
    headline: "Collections become constellations.",
    headlineKo: "컬렉션이 별자리가 됩니다.",
    summary: "A cinematic museum-night view in black lacquer and champagne light.",
    summaryKo: "블랙 래커와 샴페인 빛으로 완성한 시네마틱한 미술관의 밤입니다.",
    accent: "#d7b56d",
    theme: "dark",
    palette: ["#090708", "#5f1622", "#d7b56d"],
  },
  {
    slug: "colly-evolved",
    name: "COLLY Evolved",
    nameKo: "콜리 이볼브드",
    skill: "redesign-existing-projects",
    headline: "The globe, brought into focus.",
    headlineKo: "글로브를 더 선명하게.",
    summary: "A focused product evolution with clearer hierarchy and calmer controls.",
    summaryKo: "명확한 위계와 차분한 컨트롤로 현재 제품을 자연스럽게 발전시켰습니다.",
    accent: "#d7aa55",
    theme: "dark",
    palette: ["#0c0c0a", "#eee9df", "#d7aa55"],
  },
  {
    slug: "accessible-atlas",
    name: "Accessible Atlas",
    nameKo: "액세서블 아틀라스",
    skill: "ui-ux-pro-max",
    headline: "Every place, easier to find.",
    headlineKo: "모든 장소를 더 쉽게.",
    summary: "A clear atlas with explicit states, generous targets, and readable geography.",
    summaryKo: "분명한 상태와 넉넉한 터치 영역, 읽기 쉬운 지명을 갖춘 아틀라스입니다.",
    accent: "#b44218",
    theme: "light",
    palette: ["#edf1ee", "#123b56", "#d95d24"],
  },
] as const;

export function isGlobeLabPath(pathname: string): boolean {
  return pathname === "/globe-lab" || pathname.startsWith("/globe-lab/");
}

export function getGlobeLabCandidate(slug: string | undefined): GlobeLabCandidate | null {
  return GLOBE_LAB_CANDIDATES.find((candidate) => candidate.slug === slug) ?? null;
}

export function buildGlobeLabPath(slug?: GlobeLabSlug): string {
  return slug ? `/globe-lab/${slug}` : "/globe-lab";
}

export function getCollyGlobeVariant(
  slug: string | undefined,
): CollyGlobeVariant | null {
  if (!slug) return COLLY_GLOBE_VARIANTS[0];
  if (slug === "floating-glass") return COLLY_GLOBE_VARIANTS[0];
  return COLLY_GLOBE_VARIANTS.find((variant) => variant.slug === slug) ?? null;
}

export function buildCollyGlobePath(variant?: CollyGlobeVariantSlug): string {
  return variant && variant !== "atlas-index"
    ? `/globe-lab/colly-evolved/${variant}`
    : "/globe-lab/colly-evolved";
}
