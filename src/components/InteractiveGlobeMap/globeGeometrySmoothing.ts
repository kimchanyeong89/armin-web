import type { CollyGeometrySoftness } from "./collyGlobeVariants";

type Position = number[];

type RoundingProfile = {
  fraction: number;
  maxCut: number;
  samples: number;
};

const ROUNDING_PROFILES: Record<CollyGeometrySoftness, RoundingProfile> = {
  balanced: { fraction: 0.18, maxCut: 1.4, samples: 2 },
  soft: { fraction: 0.26, maxCut: 2.4, samples: 3 },
  atlas: { fraction: 0.46, maxCut: 5.5, samples: 8 },
};

export function getMainlandFeature(feature: any): any {
  if (feature.geometry?.type !== "MultiPolygon") return feature;
  const polygons = feature.geometry.coordinates;
  if (polygons.length <= 1) return feature;

  let largestIndex = 0;
  let largestArea = 0;
  polygons.forEach((polygon: Position[][], index: number) => {
    const ring = polygon[0];
    if (!ring || ring.length < 3) return;
    let minLongitude = Infinity;
    let maxLongitude = -Infinity;
    let minLatitude = Infinity;
    let maxLatitude = -Infinity;
    ring.forEach(([longitude, latitude]) => {
      minLongitude = Math.min(minLongitude, longitude);
      maxLongitude = Math.max(maxLongitude, longitude);
      minLatitude = Math.min(minLatitude, latitude);
      maxLatitude = Math.max(maxLatitude, latitude);
    });
    const area = (maxLongitude - minLongitude) * (maxLatitude - minLatitude);
    if (area > largestArea) {
      largestArea = area;
      largestIndex = index;
    }
  });

  return {
    ...feature,
    geometry: {
      type: "Polygon",
      coordinates: polygons[largestIndex],
    },
  };
}

function normalizeLongitude(longitude: number): number {
  const normalized = ((longitude + 180) % 360 + 360) % 360 - 180;
  return Object.is(normalized, -0) ? 0 : normalized;
}

function unwrapLongitude(reference: number, longitude: number): number {
  let unwrapped = longitude;
  while (unwrapped - reference > 180) unwrapped -= 360;
  while (reference - unwrapped > 180) unwrapped += 360;
  return unwrapped;
}

function segmentLength(from: Position, to: Position): number {
  const meanLatitude = ((from[1] + to[1]) / 2) * Math.PI / 180;
  const longitudeDistance = (to[0] - from[0]) * Math.cos(meanLatitude);
  return Math.hypot(longitudeDistance, to[1] - from[1]);
}

function roundedCorner(
  previousSource: Position,
  cornerSource: Position,
  nextSource: Position,
  profile: RoundingProfile,
  perimeter: number,
): Position[] {
  const corner = [cornerSource[0], cornerSource[1]];
  const previous = [
    unwrapLongitude(corner[0], previousSource[0]),
    previousSource[1],
  ];
  const next = [
    unwrapLongitude(corner[0], nextSource[0]),
    nextSource[1],
  ];
  const incomingLength = segmentLength(corner, previous);
  const outgoingLength = segmentLength(corner, next);

  if (incomingLength < 1e-6 || outgoingLength < 1e-6) {
    return [[normalizeLongitude(corner[0]), corner[1]]];
  }

  const smallIslandFraction = perimeter < 0.6
    ? Math.min(profile.fraction, 0.18)
    : profile.fraction;
  const cut = Math.min(
    incomingLength * smallIslandFraction,
    outgoingLength * smallIslandFraction,
    profile.maxCut,
  );
  const incomingRatio = cut / incomingLength;
  const outgoingRatio = cut / outgoingLength;
  const entry = [
    corner[0] + (previous[0] - corner[0]) * incomingRatio,
    corner[1] + (previous[1] - corner[1]) * incomingRatio,
  ];
  const exit = [
    corner[0] + (next[0] - corner[0]) * outgoingRatio,
    corner[1] + (next[1] - corner[1]) * outgoingRatio,
  ];
  const rounded: Position[] = [[normalizeLongitude(entry[0]), entry[1]]];

  for (let sample = 1; sample <= profile.samples; sample += 1) {
    const t = sample / profile.samples;
    const inverse = 1 - t;
    rounded.push([
      normalizeLongitude(
        inverse * inverse * entry[0]
        + 2 * inverse * t * corner[0]
        + t * t * exit[0],
      ),
      inverse * inverse * entry[1]
        + 2 * inverse * t * corner[1]
        + t * t * exit[1],
    ]);
  }

  return rounded;
}

function unwrappedSegmentLength(from: Position, to: Position): number {
  return segmentLength(from, [unwrapLongitude(from[0], to[0]), to[1]]);
}

function linePerimeter(coordinates: Position[], closed: boolean): number {
  let perimeter = 0;
  for (let index = 0; index < coordinates.length - 1; index += 1) {
    perimeter += unwrappedSegmentLength(coordinates[index], coordinates[index + 1]);
  }
  if (closed && coordinates.length > 1) {
    perimeter += unwrappedSegmentLength(coordinates.at(-1)!, coordinates[0]);
  }
  return perimeter;
}

function roundClosedRing(
  coordinates: Position[],
  profile: RoundingProfile,
): Position[] {
  if (coordinates.length < 3) return coordinates.map((point) => [...point]);
  const isClosed = coordinates[0][0] === coordinates.at(-1)?.[0]
    && coordinates[0][1] === coordinates.at(-1)?.[1];
  const points = (isClosed ? coordinates.slice(0, -1) : coordinates)
    .map((point) => [...point]);
  if (points.length < 3) return coordinates.map((point) => [...point]);
  const perimeter = linePerimeter(points, true);
  const rounded = points.flatMap((corner, index) => roundedCorner(
    points[(index + points.length - 1) % points.length],
    corner,
    points[(index + 1) % points.length],
    profile,
    perimeter,
  ));

  if (rounded.length > 0) rounded.push([...rounded[0]]);
  return rounded;
}

function roundOpenLine(
  coordinates: Position[],
  profile: RoundingProfile,
): Position[] {
  if (coordinates.length < 3) return coordinates.map((point) => [...point]);
  const perimeter = linePerimeter(coordinates, false);
  const rounded: Position[] = [[...coordinates[0]]];

  for (let index = 1; index < coordinates.length - 1; index += 1) {
    rounded.push(...roundedCorner(
      coordinates[index - 1],
      coordinates[index],
      coordinates[index + 1],
      profile,
      perimeter,
    ));
  }
  rounded.push([...coordinates.at(-1)!]);
  return rounded;
}

export function smoothGlobeGeometry(
  geometry: any,
  softness: CollyGeometrySoftness,
): any {
  if (!geometry) return geometry;
  const profile = ROUNDING_PROFILES[softness];

  if (geometry.type === "Polygon") {
    return {
      ...geometry,
      coordinates: geometry.coordinates.map((ring: Position[]) => roundClosedRing(ring, profile)),
    };
  }
  if (geometry.type === "MultiPolygon") {
    return {
      ...geometry,
      coordinates: geometry.coordinates.map((polygon: Position[][]) => (
        polygon.map((ring: Position[]) => roundClosedRing(ring, profile))
      )),
    };
  }
  if (geometry.type === "LineString") {
    return { ...geometry, coordinates: roundOpenLine(geometry.coordinates, profile) };
  }
  if (geometry.type === "MultiLineString") {
    return {
      ...geometry,
      coordinates: geometry.coordinates.map((line: Position[]) => roundOpenLine(line, profile)),
    };
  }
  return geometry;
}
