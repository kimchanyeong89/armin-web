import * as d3 from "d3";
import type {
  CollyGlobeVariantProfile,
  CollyMapTechnique,
} from "./collyGlobeVariants";
import type {
  AtlasLabelCandidate,
  CountryMuseumAggregate,
  MuseumMapDatum,
  ProjectedMuseumDatum,
} from "./collyMapTechniqueData";
import {
  aggregateMuseumsByCity,
  aggregateMuseumsByCountry,
  interpolateAtlasLabelPosition,
  placeAtlasEdgeLabels,
  placeAtlasLocalLabels,
  placeMarginLedgerLabels,
  placeRadialRegisterLabels,
  resolveAtlasLabelLimit,
  resolveAtlasLabelTextAlign,
  resolveAtlasZoomMorph,
  resolveCompactAnchorTickLength,
  selectRankedAtlasCandidates,
} from "./collyMapTechniqueData";
import type { GlobeVisualPalette } from "./globeVisualPresets";
import { getMainlandFeature } from "./globeGeometrySmoothing";
import { resolveAtlasBoundaryStyle } from "./globeCanvasStyles";

export { resolveAtlasBoundaryStyle } from "./globeCanvasStyles";

type GeoPath = (object: any) => void;
type GlobeProjection = (
  coordinates: [number, number],
) => [number, number] | null;

export type CollyMapTechniqueRenderArgs = {
  ctx: CanvasRenderingContext2D;
  path: GeoPath;
  projection: GlobeProjection;
  sphere: any;
  land: any;
  borders: any;
  countryFeatures: Array<{ name: string; feature: any }>;
  palette: GlobeVisualPalette;
  profile: CollyGlobeVariantProfile;
  museums: MuseumMapDatum[];
  projectedMuseums: ProjectedMuseumDatum[];
  activeContinent: string | null;
  currentScale: number;
  drilled: boolean;
  focusedMuseumId: string | null;
  reducedMotion: boolean;
  width: number;
  height: number;
  center: readonly [number, number];
  radius: number;
  viewCenter: readonly [number, number];
};

type TechniqueLayer = (args: CollyMapTechniqueRenderArgs) => void;

export type CollyMapTechniqueRenderer = {
  drawUnderlay: TechniqueLayer;
  drawOverlay: TechniqueLayer;
  replacesProductionPreviewMarkers: boolean;
};

type CountryRenderCandidate = AtlasLabelCandidate & {
  aggregate: CountryMuseumAggregate;
  feature: any;
};

type CountryFeatureCandidate = CountryRenderCandidate & {
  centroid: [number, number];
};

const noop: TechniqueLayer = () => undefined;

function detailNumber(
  profile: CollyGlobeVariantProfile,
  key: string,
  fallback: number,
): number {
  const value = profile.detail[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function deriveCountryFeatureCandidates(
  museums: MuseumMapDatum[],
  countryFeatures: Array<{ name: string; feature: any }>,
): CountryFeatureCandidate[] {
  const featuresByCountry = new Map(
    countryFeatures.map(({ name, feature }) => [name, feature]),
  );
  const aggregates = aggregateMuseumsByCountry(museums);
  const aggregatesByCountry = new Map(
    aggregates.map((aggregate) => [aggregate.country, aggregate]),
  );
  const orderedAggregates = [
    ...countryFeatures.flatMap(({ name }) => {
      const aggregate = aggregatesByCountry.get(name);
      return aggregate ? [aggregate] : [];
    }),
    ...aggregates.filter((aggregate) => !featuresByCountry.has(aggregate.country)),
  ];

  return orderedAggregates.map((aggregate) => {
    const feature = featuresByCountry.get(aggregate.country) ?? null;
    let anchorFeature = feature ? getMainlandFeature(feature) : null;
    if (feature?.geometry?.type === "MultiPolygon") {
      const containingPolygon = feature.geometry.coordinates.find((coordinates: any) => (
        d3.geoContains(
          { type: "Polygon", coordinates },
          aggregate.coordinates,
        )
      ));
      if (containingPolygon) {
        anchorFeature = { type: "Feature", geometry: { type: "Polygon", coordinates: containingPolygon } };
      }
    }
    const centroid = anchorFeature
      ? d3.geoCentroid(anchorFeature) as [number, number]
      : aggregate.coordinates;
    return {
      id: aggregate.country,
      label: aggregate.country,
      anchorX: 0,
      anchorY: 0,
      weight: aggregate.museumCount * 1000 + aggregate.artworkCount,
      aggregate,
      feature,
      centroid,
    };
  });
}

export function deriveCountryCandidates({
  projection,
  museums,
  countryFeatures,
  viewCenter,
  width,
  height,
}: Pick<
  CollyMapTechniqueRenderArgs,
  "projection" | "museums" | "countryFeatures" | "viewCenter" | "width" | "height"
>): CountryRenderCandidate[] {
  const mutableViewCenter: [number, number] = [viewCenter[0], viewCenter[1]];
  return deriveCountryFeatureCandidates(museums, countryFeatures).flatMap((candidate) => {
    if (d3.geoDistance(candidate.centroid, mutableViewCenter) > Math.PI / 2) return [];
    const point = projection(candidate.centroid);
    if (!point) return [];
    if (point[0] < -32 || point[0] > width + 32) return [];
    if (point[1] < -32 || point[1] > height + 32) return [];
    return [{ ...candidate, anchorX: point[0], anchorY: point[1] }];
  });
}

function resolveScreenBearing(
  from: readonly [number, number],
  to: readonly [number, number],
): number {
  const longitudeDelta = (to[0] - from[0]) * Math.PI / 180;
  const fromLatitude = from[1] * Math.PI / 180;
  const toLatitude = to[1] * Math.PI / 180;
  const bearing = Math.atan2(
    Math.sin(longitudeDelta) * Math.cos(toLatitude),
    Math.cos(fromLatitude) * Math.sin(toLatitude)
      - Math.sin(fromLatitude) * Math.cos(toLatitude) * Math.cos(longitudeDelta),
  );
  return bearing - Math.PI / 2;
}

export function deriveRadialCountryCandidates({
  projection,
  museums,
  countryFeatures,
  viewCenter,
  width,
  height,
  center,
  radius,
}: Pick<
  CollyMapTechniqueRenderArgs,
  | "projection"
  | "museums"
  | "countryFeatures"
  | "viewCenter"
  | "width"
  | "height"
  | "center"
  | "radius"
>): { visible: CountryRenderCandidate[]; hidden: CountryRenderCandidate[] } {
  const visible: CountryRenderCandidate[] = [];
  const hidden: CountryRenderCandidate[] = [];
  const mutableViewCenter: [number, number] = [viewCenter[0], viewCenter[1]];

  deriveCountryFeatureCandidates(museums, countryFeatures).forEach((candidate) => {
    if (d3.geoDistance(candidate.centroid, mutableViewCenter) <= Math.PI / 2) {
      const point = projection(candidate.centroid);
      if (!point) return;
      if (point[0] < -32 || point[0] > width + 32) return;
      if (point[1] < -32 || point[1] > height + 32) return;
      visible.push({ ...candidate, anchorX: point[0], anchorY: point[1] });
      return;
    }

    const angle = resolveScreenBearing(viewCenter, candidate.centroid);
    hidden.push({
      ...candidate,
      anchorX: center[0] + Math.cos(angle) * radius,
      anchorY: center[1] + Math.sin(angle) * radius,
    });
  });

  return { visible, hidden };
}

function drawCompactAnchor(
  ctx: CanvasRenderingContext2D,
  palette: GlobeVisualPalette,
  candidate: Pick<AtlasLabelCandidate, "anchorX" | "anchorY" | "weight">,
  direction: -1 | 1,
  alpha = 0.9,
): void {
  const tickLength = resolveCompactAnchorTickLength(candidate.weight);
  ctx.beginPath();
  ctx.moveTo(candidate.anchorX + direction * 3.5, candidate.anchorY);
  ctx.lineTo(candidate.anchorX + direction * (3.5 + tickLength), candidate.anchorY);
  ctx.strokeStyle = `rgba(${palette.accentRgb},${alpha * 0.72})`;
  ctx.lineWidth = 0.8;
  ctx.lineCap = "round";
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(candidate.anchorX, candidate.anchorY, 1.9, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(${palette.accentRgb},${alpha})`;
  ctx.fill();
}

function drawLeader(
  ctx: CanvasRenderingContext2D,
  palette: GlobeVisualPalette,
  from: readonly [number, number],
  to: readonly [number, number],
  direction: -1 | 1,
  alpha = 0.2,
): void {
  const elbowX = from[0] + direction * Math.min(24, Math.abs(to[0] - from[0]) * 0.45);
  ctx.beginPath();
  ctx.moveTo(from[0], from[1]);
  ctx.lineTo(elbowX, to[1]);
  ctx.lineTo(to[0], to[1]);
  ctx.strokeStyle = `rgba(${palette.label},${alpha})`;
  ctx.lineWidth = 0.55;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.stroke();
}

function capLeaderEndpoint(
  anchor: readonly [number, number],
  desired: readonly [number, number],
  maxLength: number,
): [number, number] {
  const deltaX = desired[0] - anchor[0];
  const deltaY = desired[1] - anchor[1];
  const distance = Math.hypot(deltaX, deltaY);
  if (distance <= maxLength || distance < 0.001) return [desired[0], desired[1]];
  const ratio = maxLength / distance;
  return [anchor[0] + deltaX * ratio, anchor[1] + deltaY * ratio];
}

function configureLabelText(
  ctx: CanvasRenderingContext2D,
  palette: GlobeVisualPalette,
  align: CanvasTextAlign,
  width: number,
  alpha = 0.78,
): void {
  ctx.textAlign = align;
  ctx.textBaseline = "middle";
  ctx.font = `600 ${width < 560 ? 7 : 8}px ${palette.labelFont}`;
  ctx.fillStyle = `rgba(${palette.label},${alpha})`;
}

function drawStackedCountryLabel(
  ctx: CanvasRenderingContext2D,
  palette: GlobeVisualPalette,
  label: string,
  count: number,
  position: readonly [number, number],
  width: number,
  alpha: number,
): void {
  const compact = width < 560;
  const gap = compact ? 4.5 : 5.5;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `500 ${compact ? 7 : 8}px ${palette.labelFont}`;
  ctx.fillStyle = `rgba(${palette.accentRgb},${alpha * 0.86})`;
  ctx.fillText(String(count).padStart(2, "0"), position[0], position[1] - gap);
  ctx.font = `650 ${compact ? 8 : 9}px ${palette.labelFont}`;
  ctx.fillStyle = `rgba(${palette.label},${alpha})`;
  ctx.fillText(label.toUpperCase(), position[0], position[1] + gap);
}

function drawAtlasIndexBoundaries(args: CollyMapTechniqueRenderArgs): void {
  const { borders, ctx, palette, path, width } = args;
  if (!borders) return;
  const style = resolveAtlasBoundaryStyle(width);

  ctx.beginPath();
  path(borders);
  ctx.strokeStyle = `rgba(${palette.label},${style.alpha})`;
  ctx.lineWidth = style.width;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.stroke();
}

const drawAtlasIndex: TechniqueLayer = (args) => {
  drawAtlasIndexBoundaries(args);
  if (args.drilled) return;
  const {
    ctx, palette, profile, width, height, center, radius, currentScale,
  } = args;
  const countries = deriveCountryCandidates(args);
  const configuredLimit = resolveAtlasLabelLimit(
    width,
    detailNumber(profile, "aggregateLimit", 18),
  );
  const morph = resolveAtlasZoomMorph(currentScale, args.reducedMotion);
  const edgeLabels = placeAtlasEdgeLabels(countries, {
    center,
    radius,
    width,
    height,
    gap: detailNumber(profile, "labelGap", 16),
    inset: 14,
    limit: configuredLimit,
  });
  const edgeLabelsById = new Map(edgeLabels.map((label) => [label.id, label]));

  (selectRankedAtlasCandidates(
    countries,
    countries.length,
  ) as CountryRenderCandidate[]).forEach((country) => {
    const edgeLabel = edgeLabelsById.get(country.id);
    if (!edgeLabel) {
      drawStackedCountryLabel(
        ctx,
        palette,
        country.label,
        country.aggregate.museumCount,
        [country.anchorX, country.anchorY],
        width,
        0.4 + 0.42 * morph.extraLabelAlpha,
      );
      return;
    }

    const direction = edgeLabel.side === "left" ? -1 : 1;
    const desired: [number, number] = [
      edgeLabel.labelX - direction * 5,
      edgeLabel.labelY,
    ];
    const endpoint = capLeaderEndpoint(
      [edgeLabel.anchorX, edgeLabel.anchorY],
      desired,
      width < 560 ? 64 : 96,
    );
    const fontSize = width < 560 ? 7 : 8;
    const edgeTextCenter: [number, number] = [
      endpoint[0] + direction * (5 + country.label.length * fontSize * 0.29),
      endpoint[1],
    ];
    const directPosition: [number, number] = [country.anchorX, country.anchorY];
    const labelPosition = interpolateAtlasLabelPosition(
      edgeTextCenter,
      directPosition,
      morph.progress,
    );
    if (morph.leaderAlpha > 0.01) {
      const leaderEnd = interpolateAtlasLabelPosition(
        endpoint,
        directPosition,
        morph.progress,
      );
      drawLeader(
        ctx,
        palette,
        [country.anchorX, country.anchorY],
        leaderEnd,
        direction,
        0.16 * morph.leaderAlpha,
      );
      drawCompactAnchor(ctx, palette, country, direction, 0.9 * morph.leaderAlpha);
    }
    drawStackedCountryLabel(
      ctx,
      palette,
      country.label,
      country.aggregate.museumCount,
      labelPosition,
      width,
      0.78 + 0.08 * morph.progress,
    );
  });
};

const drawMarginLedger: TechniqueLayer = (args) => {
  if (args.drilled) return;
  const { ctx, palette, profile, width, height, center, radius } = args;
  const countries = deriveCountryCandidates(args);
  const aggregates = new Map(countries.map((country) => [country.id, country.aggregate]));
  const labels = placeMarginLedgerLabels(countries, {
    center,
    radius,
    width,
    height,
    inset: 14,
    limit: resolveAtlasLabelLimit(width, detailNumber(profile, "aggregateLimit", 16)),
  });

  labels.forEach((label) => {
    const aggregate = aggregates.get(label.id);
    if (!aggregate) return;
    const direction = label.side === "left" ? -1 : 1;
    const numericX = label.labelX;
    const nameX = numericX + direction * 18;
    drawLeader(
      ctx,
      palette,
      [label.anchorX, label.anchorY],
      [numericX - direction * 6, label.labelY],
      direction,
      0.17,
    );
    drawCompactAnchor(ctx, palette, label, direction, 0.78);

    configureLabelText(ctx, palette, direction < 0 ? "right" : "left", width, 0.72);
    ctx.fillText(label.label.toUpperCase(), nameX, label.labelY);
    ctx.font = `500 ${width < 560 ? 7 : 8}px ${palette.labelFont}`;
    ctx.fillStyle = `rgba(${palette.accentRgb},0.72)`;
    ctx.textAlign = direction < 0 ? "left" : "right";
    ctx.fillText(String(aggregate.museumCount).padStart(2, "0"), numericX, label.labelY);
  });
};

const drawRadialRegister: TechniqueLayer = (args) => {
  if (args.drilled) return;
  const { ctx, palette, profile, width, height, center, radius } = args;
  const countries = deriveRadialCountryCandidates(args);
  const visibleCountries = selectRankedAtlasCandidates(
    countries.visible,
    countries.visible.length,
  ) as CountryRenderCandidate[];
  const localLabels = placeAtlasLocalLabels(visibleCountries, {
    width,
    height,
    inset: 16,
    limit: visibleCountries.length,
    maxLeader: 36,
  });
  const visibleById = new Map(visibleCountries.map((country) => [country.id, country]));
  const labels = placeRadialRegisterLabels(countries.hidden, {
    center,
    radius,
    width,
    height,
    inset: 16,
    limit: countries.hidden.length,
    minAngularGap: detailNumber(profile, "angularGap", 0.14),
  });

  localLabels.forEach((label) => {
    const country = visibleById.get(label.id);
    if (!country) return;
    const direction = label.side === "left" ? -1 : 1;
    drawLeader(
      ctx,
      palette,
      [country.anchorX, country.anchorY],
      [label.labelX, label.labelY],
      direction,
      0.11,
    );
    ctx.beginPath();
    ctx.arc(country.anchorX, country.anchorY, 1.4, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${palette.accentRgb},0.66)`;
    ctx.fill();
    drawStackedCountryLabel(
      ctx,
      palette,
      country.label,
      country.aggregate.museumCount,
      [label.labelX, label.labelY],
      width,
      0.72,
    );
  });

  labels.forEach((label) => {
    const country = countries.hidden.find((candidate) => candidate.id === label.id);
    if (!country) return;
    const innerX = center[0] + Math.cos(label.angle) * (radius - 3);
    const innerY = center[1] + Math.sin(label.angle) * (radius - 3);
    ctx.beginPath();
    ctx.moveTo(innerX, innerY);
    ctx.lineTo(label.tickX, label.tickY);
    ctx.strokeStyle = `rgba(${palette.accentRgb},0.52)`;
    ctx.lineWidth = 0.8;
    ctx.lineCap = "round";
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(label.anchorX, label.anchorY, 1.5, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${palette.accentRgb},0.68)`;
    ctx.fill();

    configureLabelText(ctx, palette, label.textAlign, width, 0.72);
    const offset = label.textAlign === "left" ? 4 : -4;
    ctx.fillText(
      `${label.label.toUpperCase()}  ${String(country.aggregate.museumCount).padStart(2, "0")}`,
      label.labelX + offset,
      label.labelY,
    );
  });
};

const drawCountryFolio: TechniqueLayer = (args) => {
  if (args.drilled) return;
  const {
    ctx, path, palette, profile, width, height,
  } = args;
  const countries = deriveCountryCandidates(args);
  const maxCount = Math.max(1, ...countries.map((country) => country.aggregate.museumCount));

  countries.forEach((country) => {
    if (!country.feature) return;
    const strength = Math.log2(country.aggregate.museumCount + 1) / Math.log2(maxCount + 1);
    ctx.beginPath();
    path(country.feature);
    ctx.strokeStyle = `rgba(${palette.label},${0.1 + strength * 0.26})`;
    ctx.lineWidth = 0.45 + strength * detailNumber(profile, "boundaryWeight", 1.7);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();
  });

  const labels = placeAtlasLocalLabels(countries, {
    width,
    height,
    inset: 14,
    limit: resolveAtlasLabelLimit(width, detailNumber(profile, "aggregateLimit", 9)),
    maxLeader: 48,
  });
  const aggregates = new Map(countries.map((country) => [country.id, country.aggregate]));
  labels.forEach((label) => {
    const aggregate = aggregates.get(label.id);
    if (!aggregate) return;
    const direction = label.side === "left" ? -1 : 1;
    const ruleLength = resolveCompactAnchorTickLength(aggregate.museumCount * 12);
    drawLeader(
      ctx,
      palette,
      [label.anchorX, label.anchorY],
      [label.labelX, label.labelY],
      direction,
      0.14,
    );
    ctx.beginPath();
    ctx.moveTo(label.anchorX, label.anchorY);
    ctx.lineTo(label.anchorX + direction * ruleLength, label.anchorY);
    ctx.strokeStyle = `rgba(${palette.accentRgb},0.82)`;
    ctx.lineWidth = 1.35;
    ctx.lineCap = "round";
    ctx.stroke();

    configureLabelText(ctx, palette, direction < 0 ? "right" : "left", width, 0.7);
    ctx.fillText(
      `${label.label.toUpperCase()}  ${aggregate.museumCount}`,
      label.labelX + direction * 4,
      label.labelY,
    );
  });
};

function resolveIndexCode(country: string): string {
  const words = country.toUpperCase().match(/[A-Z]+/g) ?? [];
  if (words.length > 1) return words.map((word) => word[0]).join("").slice(0, 3);
  return (words[0] ?? "MAP").slice(0, 3);
}

function formatCoordinate(value: number, positive: string, negative: string): string {
  return `${Math.abs(value).toFixed(1)}°${value >= 0 ? positive : negative}`;
}

const drawCoordinateIndex: TechniqueLayer = (args) => {
  if (args.drilled) return;
  const { ctx, palette, profile, width, height } = args;
  const countries = deriveCountryCandidates(args);
  const selected = selectRankedAtlasCandidates(
    countries,
    resolveAtlasLabelLimit(width, detailNumber(profile, "aggregateLimit", 6)),
  );
  const labels = placeAtlasLocalLabels(selected, {
    width,
    height,
    inset: 14,
    limit: selected.length,
    maxLeader: detailNumber(profile, "localLeaderMax", 46),
  });
  const aggregates = new Map(countries.map((country) => [country.id, country.aggregate]));

  labels.forEach((label) => {
    const aggregate = aggregates.get(label.id);
    if (!aggregate) return;
    const direction = label.side === "left" ? -1 : 1;
    drawLeader(
      ctx,
      palette,
      [label.anchorX, label.anchorY],
      [label.labelX, label.labelY],
      direction,
      0.2,
    );
    ctx.beginPath();
    ctx.arc(label.anchorX, label.anchorY, 3.1, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(${palette.accentRgb},0.72)`;
    ctx.lineWidth = 0.8;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(label.anchorX, label.anchorY, 1.1, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${palette.accentRgb},0.9)`;
    ctx.fill();

    configureLabelText(ctx, palette, direction < 0 ? "right" : "left", width, 0.72);
    ctx.fillText(
      `${resolveIndexCode(label.label)}  ${formatCoordinate(aggregate.coordinates[1], "N", "S")}  ${formatCoordinate(aggregate.coordinates[0], "E", "W")}  ${aggregate.museumCount}`,
      label.labelX + direction * 4,
      label.labelY,
    );
  });
};

const drawCityGazetteer: TechniqueLayer = (args) => {
  if (args.drilled) return;
  const {
    ctx, projection, palette, profile, projectedMuseums, museums,
    width, height, center, radius,
  } = args;
  const visibleCities = new Set(
    projectedMuseums.map((museum) => `${museum.city}|${museum.country}`),
  );
  const cities = aggregateMuseumsByCity(museums).flatMap((aggregate) => {
    if (!visibleCities.has(aggregate.id)) return [];
    const point = projection(aggregate.coordinates);
    if (!point) return [];
    return [{
      id: aggregate.id,
      label: aggregate.city,
      anchorX: point[0],
      anchorY: point[1],
      weight: aggregate.museumCount * 1000 + aggregate.artworkCount,
      aggregate,
    }];
  });
  const limit = resolveAtlasLabelLimit(width, detailNumber(profile, "cityLimit", 14));
  const ranked = selectRankedAtlasCandidates(cities, limit);
  const rankById = new Map(ranked.map((city, index) => [city.id, index + 1]));
  const cityById = new Map(cities.map((city) => [city.id, city.aggregate]));
  const labels = placeAtlasEdgeLabels(ranked, {
    center,
    radius,
    width,
    height,
    gap: width < 560 ? 12 : 14,
    inset: 14,
    limit: ranked.length,
  });

  labels.forEach((label) => {
    const aggregate = cityById.get(label.id);
    const rank = rankById.get(label.id);
    if (!aggregate || !rank) return;
    const direction = label.side === "left" ? -1 : 1;
    ctx.beginPath();
    ctx.arc(label.anchorX, label.anchorY, 2.6, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(${palette.accentRgb},0.76)`;
    ctx.lineWidth = 0.8;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(label.anchorX, label.anchorY, 0.9, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${palette.accentRgb},0.92)`;
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(label.labelX - direction * 5, label.labelY);
    ctx.lineTo(label.labelX - direction * 12, label.labelY);
    ctx.strokeStyle = `rgba(${palette.accentRgb},0.58)`;
    ctx.lineWidth = 0.8;
    ctx.lineCap = "round";
    ctx.stroke();

    configureLabelText(
      ctx,
      palette,
      resolveAtlasLabelTextAlign(label.side, width),
      width,
      0.74,
    );
    ctx.fillText(
      `${String(rank).padStart(2, "0")}  ${aggregate.city.toUpperCase()}  / ${aggregate.museumCount}`,
      label.labelX,
      label.labelY,
    );
  });
};

export const COLLY_MAP_TECHNIQUE_RENDERERS: Record<
  CollyMapTechnique,
  CollyMapTechniqueRenderer
> = {
  "atlas-index": {
    drawUnderlay: noop,
    drawOverlay: drawAtlasIndex,
    replacesProductionPreviewMarkers: true,
  },
  "margin-ledger": {
    drawUnderlay: noop,
    drawOverlay: drawMarginLedger,
    replacesProductionPreviewMarkers: true,
  },
  "radial-register": {
    drawUnderlay: noop,
    drawOverlay: drawRadialRegister,
    replacesProductionPreviewMarkers: true,
  },
  "country-folio": {
    drawUnderlay: noop,
    drawOverlay: drawCountryFolio,
    replacesProductionPreviewMarkers: true,
  },
  "coordinate-index": {
    drawUnderlay: noop,
    drawOverlay: drawCoordinateIndex,
    replacesProductionPreviewMarkers: true,
  },
  "city-gazetteer": {
    drawUnderlay: noop,
    drawOverlay: drawCityGazetteer,
    replacesProductionPreviewMarkers: true,
  },
};

function drawTechniqueLayer(
  layer: TechniqueLayer,
  args: CollyMapTechniqueRenderArgs,
): boolean {
  args.ctx.save();
  try {
    layer(args);
    return true;
  } catch {
    return false;
  } finally {
    args.ctx.restore();
  }
}

export function drawTechniqueUnderlay(args: CollyMapTechniqueRenderArgs): boolean {
  return drawTechniqueLayer(
    COLLY_MAP_TECHNIQUE_RENDERERS[args.profile.technique].drawUnderlay,
    args,
  );
}

export function drawTechniqueOverlay(args: CollyMapTechniqueRenderArgs): boolean {
  return drawTechniqueLayer(
    COLLY_MAP_TECHNIQUE_RENDERERS[args.profile.technique].drawOverlay,
    args,
  );
}

export function shouldDrawProductionPreviewMarkers(
  technique: CollyMapTechnique,
  state: { drilled: boolean; derivedDataAvailable: boolean },
): boolean {
  if (state.drilled || !state.derivedDataAvailable) return true;
  return !COLLY_MAP_TECHNIQUE_RENDERERS[technique].replacesProductionPreviewMarkers;
}
