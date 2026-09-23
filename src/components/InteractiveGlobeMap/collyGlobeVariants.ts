import type { CollyGlobeVariantSlug } from "../../globe-lab/model";

export type CollyMapTechnique =
  | "atlas-index"
  | "margin-ledger"
  | "radial-register"
  | "country-folio"
  | "coordinate-index"
  | "city-gazetteer";

export type CollyGeometrySoftness = "balanced" | "soft" | "atlas";

export type CollyGlobeVariantProfile = {
  technique: CollyMapTechnique;
  scaleRatio: 0.38;
  offset: readonly [0, 0];
  geometrySoftness: CollyGeometrySoftness;
  detail: Readonly<Record<string, number | boolean>>;
};

export type CollyMuseumEmphasis = {
  level: "primary" | "secondary" | "trace";
  alphaScale: number;
  sizeScale: number;
};

export const COLLY_GLOBE_VARIANT_PROFILES: Record<
  CollyGlobeVariantSlug,
  CollyGlobeVariantProfile
> = {
  "atlas-index": {
    technique: "atlas-index",
    scaleRatio: 0.38,
    offset: [0, 0],
    geometrySoftness: "atlas",
    detail: { aggregateLimit: 18, labelGap: 16, localLeaderMax: 58 },
  },
  "margin-ledger": {
    technique: "margin-ledger",
    scaleRatio: 0.38,
    offset: [0, 0],
    geometrySoftness: "atlas",
    detail: { aggregateLimit: 16, labelGap: 18 },
  },
  "radial-register": {
    technique: "radial-register",
    scaleRatio: 0.38,
    offset: [0, 0],
    geometrySoftness: "atlas",
    detail: { aggregateLimit: 14, angularGap: 0.14 },
  },
  "country-folio": {
    technique: "country-folio",
    scaleRatio: 0.38,
    offset: [0, 0],
    geometrySoftness: "atlas",
    detail: { aggregateLimit: 9, boundaryWeight: 1.7 },
  },
  "coordinate-index": {
    technique: "coordinate-index",
    scaleRatio: 0.38,
    offset: [0, 0],
    geometrySoftness: "atlas",
    detail: { aggregateLimit: 6, localLeaderMax: 46 },
  },
  "city-gazetteer": {
    technique: "city-gazetteer",
    scaleRatio: 0.38,
    offset: [0, 0],
    geometrySoftness: "atlas",
    detail: { cityLimit: 12 },
  },
};

export function resolveCollyGlobeVariantProfile(
  variant: CollyGlobeVariantSlug | undefined,
): CollyGlobeVariantProfile {
  return COLLY_GLOBE_VARIANT_PROFILES[variant ?? "atlas-index"];
}

export function resolveCollyMuseumEmphasis(
  _variant: CollyGlobeVariantSlug | undefined,
  artworkCount: number,
  isMajor: boolean,
): CollyMuseumEmphasis {
  const score = Math.max(0, artworkCount) + (isMajor ? 900 : 0);

  if (score >= 700) {
    return { level: "primary", alphaScale: 1.55, sizeScale: 1.28 };
  }
  if (score >= 80 || isMajor) {
    return { level: "secondary", alphaScale: 1.1, sizeScale: 1 };
  }
  return { level: "trace", alphaScale: 0.5, sizeScale: 0.72 };
}
