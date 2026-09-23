export type MuseumMapDatum = {
  id: string;
  city: string;
  country: string;
  coordinates: readonly [number, number];
  artworkCount: number;
  isMajor?: boolean;
};

export type ProjectedMuseumDatum = MuseumMapDatum & {
  x: number;
  y: number;
  visible?: boolean;
};

export type CountryMuseumAggregate = {
  country: string;
  coordinates: [number, number];
  museumCount: number;
  artworkCount: number;
  sourceIds: string[];
};

export type CityMuseumAggregate = CountryMuseumAggregate & {
  id: string;
  city: string;
};

export type AtlasLabelCandidate = {
  id: string;
  label: string;
  anchorX: number;
  anchorY: number;
  weight: number;
};

export type AtlasEdgeLabel = AtlasLabelCandidate & {
  labelX: number;
  labelY: number;
  side: "left" | "right";
};

export type AtlasLocalLabel = AtlasEdgeLabel;

export type MarginLedgerLabel = AtlasEdgeLabel & {
  row: number;
};

export type RadialRegisterLabel = AtlasLabelCandidate & {
  angle: number;
  labelX: number;
  labelY: number;
  tickX: number;
  tickY: number;
  textAlign: "left" | "right";
};

export type AtlasZoomMorph = {
  progress: number;
  leaderAlpha: number;
  extraLabelAlpha: number;
};

function clampUnit(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function smoothstep(value: number): number {
  const clamped = clampUnit(value);
  return clamped * clamped * (3 - 2 * clamped);
}

export function resolveAtlasZoomMorph(
  scale: number,
  reducedMotion: boolean,
): AtlasZoomMorph {
  const progress = reducedMotion
    ? (scale >= 2.25 ? 1 : 0)
    : smoothstep((scale - 1.25) / (2.25 - 1.25));
  return {
    progress,
    leaderAlpha: (1 - progress) ** 2,
    extraLabelAlpha: smoothstep((progress - 0.45) / 0.55),
  };
}

export function interpolateAtlasLabelPosition(
  from: readonly [number, number],
  to: readonly [number, number],
  progress: number,
): [number, number] {
  const clamped = clampUnit(progress);
  return [
    from[0] + (to[0] - from[0]) * clamped,
    from[1] + (to[1] - from[1]) * clamped,
  ];
}

export function selectRankedAtlasCandidates(
  source: readonly AtlasLabelCandidate[],
  limit: number,
): AtlasLabelCandidate[] {
  return source
    .filter((candidate) => (
      Number.isFinite(candidate.anchorX)
      && Number.isFinite(candidate.anchorY)
      && Number.isFinite(candidate.weight)
    ))
    .slice()
    .sort((a, b) => b.weight - a.weight || a.id.localeCompare(b.id))
    .slice(0, Math.max(0, Math.floor(limit)));
}

export function resolveCompactAnchorTickLength(weight: number): number {
  return Math.min(13, Math.max(4, 4 + Math.log2(Math.max(0, weight) + 1) * 1.15));
}

export function resolveAtlasLabelLimit(width: number, configuredLimit: number): number {
  const safeLimit = Math.max(0, Math.floor(configuredLimit));
  return width < 560 ? Math.min(7, safeLimit) : safeLimit;
}

export function resolveAtlasLabelTextAlign(
  side: AtlasEdgeLabel["side"],
  width: number,
): "left" | "right" {
  if (width < 560) return side;
  return side === "left" ? "right" : "left";
}

export function placeAtlasEdgeLabels(
  source: readonly AtlasLabelCandidate[],
  options: {
    center: readonly [number, number];
    radius: number;
    width: number;
    height: number;
    gap: number;
    inset: number;
    limit: number;
  },
): AtlasEdgeLabel[] {
  const [centerX, centerY] = options.center;
  const minY = Math.max(options.inset, centerY - options.radius * 0.74);
  const maxY = Math.min(options.height - options.inset, centerY + options.radius * 0.74);
  const selected = selectRankedAtlasCandidates(source, options.limit);

  const placeSide = (side: "left" | "right"): AtlasEdgeLabel[] => {
    const candidates = selected
      .filter((candidate) => (
        side === "left" ? candidate.anchorX < centerX : candidate.anchorX >= centerX
      ))
      .sort((a, b) => a.anchorY - b.anchorY || a.id.localeCompare(b.id));
    const labels: AtlasEdgeLabel[] = [];

    candidates.forEach((candidate, index) => {
      const previousY = labels[index - 1]?.labelY ?? (minY - options.gap);
      const labelY = Math.min(maxY, Math.max(minY, candidate.anchorY, previousY + options.gap));
      const desiredX = centerX + (side === "left" ? -1 : 1) * (options.radius + 24);
      labels.push({
        ...candidate,
        side,
        labelX: Math.min(options.width - options.inset, Math.max(options.inset, desiredX)),
        labelY,
      });
    });

    const overflow = (labels[labels.length - 1]?.labelY ?? maxY) - maxY;
    if (overflow > 0) labels.forEach((label) => { label.labelY -= overflow; });
    return labels;
  };

  return [...placeSide("left"), ...placeSide("right")];
}

export function placeAtlasLocalLabels(
  source: readonly AtlasLabelCandidate[],
  options: {
    width: number;
    height: number;
    inset: number;
    limit: number;
    maxLeader: number;
  },
): AtlasLocalLabel[] {
  const selected = selectRankedAtlasCandidates(source, options.limit);
  const maxLeader = Math.max(0, options.maxLeader);
  const placed: AtlasLocalLabel[] = [];

  selected.forEach((candidate) => {
    const side = candidate.anchorX < options.width / 2 ? "left" : "right";
    const distance = Math.min(
      maxLeader,
      22 + Math.log2(Math.max(0, candidate.weight) + 1) * 2.2,
    );
    const baseAngle = side === "left" ? Math.PI : 0;
    const offsets = [-0.25, 0.25, -0.55, 0.55, -0.85, 0.85, 0];
    const position = offsets
      .map((offset) => {
        const angle = baseAngle + offset;
        const labelX = Math.min(
          options.width - options.inset,
          Math.max(options.inset, candidate.anchorX + Math.cos(angle) * distance),
        );
        const labelY = Math.min(
          options.height - options.inset,
          Math.max(options.inset, candidate.anchorY + Math.sin(angle) * distance),
        );
        const collisionScore = placed.reduce((score, label) => {
          const deltaX = Math.abs(label.labelX - labelX);
          const deltaY = Math.abs(label.labelY - labelY);
          if (deltaX >= 120 || deltaY >= 12) return score;
          return score + (120 - deltaX) + (12 - deltaY) * 10;
        }, 0);
        return { labelX, labelY, score: collisionScore + Math.abs(offset) * 0.01 };
      })
      .sort((a, b) => a.score - b.score || a.labelY - b.labelY)[0];

    placed.push({ ...candidate, side, labelX: position.labelX, labelY: position.labelY });
  });

  return placed;
}

export function placeMarginLedgerLabels(
  source: readonly AtlasLabelCandidate[],
  options: {
    center: readonly [number, number];
    radius: number;
    width: number;
    height: number;
    inset: number;
    limit: number;
  },
): MarginLedgerLabel[] {
  const selected = selectRankedAtlasCandidates(source, options.limit);
  const [centerX, centerY] = options.center;
  const minY = Math.max(options.inset, centerY - options.radius * 0.62);
  const maxY = Math.min(options.height - options.inset, centerY + options.radius * 0.62);

  const placeSide = (side: "left" | "right"): MarginLedgerLabel[] => {
    const candidates = selected
      .filter((candidate) => (
        side === "left" ? candidate.anchorX < centerX : candidate.anchorX >= centerX
      ))
      .sort((a, b) => a.anchorY - b.anchorY || a.id.localeCompare(b.id));
    const labelX = side === "left"
      ? Math.max(options.inset, centerX - options.radius - 32)
      : Math.min(options.width - options.inset, centerX + options.radius + 32);

    return candidates.map((candidate, row) => ({
      ...candidate,
      side,
      row,
      labelX,
      labelY: candidates.length === 1
        ? centerY
        : minY + (maxY - minY) * row / (candidates.length - 1),
    }));
  };

  return [...placeSide("left"), ...placeSide("right")];
}

export function placeRadialRegisterLabels(
  source: readonly AtlasLabelCandidate[],
  options: {
    center: readonly [number, number];
    radius: number;
    width: number;
    height: number;
    inset: number;
    limit: number;
    minAngularGap: number;
  },
): RadialRegisterLabel[] {
  const [centerX, centerY] = options.center;
  const gap = Math.max(0.05, options.minAngularGap);
  const sectorCount = Math.max(1, Math.floor((Math.PI * 2) / gap));
  const occupiedSectors = new Set<number>();
  const selected = selectRankedAtlasCandidates(source, source.length)
    .flatMap((candidate) => {
      const desiredAngle = Math.atan2(
        candidate.anchorY - centerY,
        candidate.anchorX - centerX,
      );
      const desiredSector = Math.round(
        (desiredAngle + Math.PI) / (Math.PI * 2) * sectorCount,
      ) % sectorCount;
      let sector: number | null = null;
      for (let distance = 0; distance < sectorCount; distance += 1) {
        const offsets = distance === 0 ? [0] : [distance, -distance];
        const available = offsets
          .map((offset) => (desiredSector + offset + sectorCount) % sectorCount)
          .find((candidateSector) => !occupiedSectors.has(candidateSector));
        if (available !== undefined) {
          sector = available;
          break;
        }
      }
      if (sector === null) return [];
      occupiedSectors.add(sector);
      const angle = -Math.PI + sector / sectorCount * Math.PI * 2;
      return [{ candidate, angle }];
    })
    .slice(0, Math.max(0, Math.floor(options.limit)))
    .sort((a, b) => a.angle - b.angle || a.candidate.id.localeCompare(b.candidate.id));

  return selected.map(({ candidate, angle }) => {
    const tickRadius = options.radius + 7;
    const labelRadius = options.radius + 25;
    const rawLabelX = centerX + Math.cos(angle) * labelRadius;
    const rawLabelY = centerY + Math.sin(angle) * labelRadius;
    return {
      ...candidate,
      angle,
      tickX: centerX + Math.cos(angle) * tickRadius,
      tickY: centerY + Math.sin(angle) * tickRadius,
      labelX: Math.min(options.width - options.inset, Math.max(options.inset, rawLabelX)),
      labelY: Math.min(options.height - options.inset, Math.max(options.inset, rawLabelY)),
      textAlign: Math.cos(angle) < 0 ? "right" : "left",
    };
  });
}

function byId<T extends { id: string }>(a: T, b: T): number {
  return a.id.localeCompare(b.id);
}

function sourceWeight(point: MuseumMapDatum): number {
  return Math.max(1, point.artworkCount);
}

export function aggregateMuseumsByCountry(
  source: readonly MuseumMapDatum[],
): CountryMuseumAggregate[] {
  const grouped = new Map<string, MuseumMapDatum[]>();
  source.slice().sort(byId).forEach((point) => {
    grouped.set(point.country, [...(grouped.get(point.country) ?? []), point]);
  });

  return [...grouped.entries()]
    .map(([country, members]): CountryMuseumAggregate => {
      const totalWeight = members.reduce((sum, member) => sum + sourceWeight(member), 0);
      return {
        country,
        coordinates: [
          members.reduce((sum, member) => sum + member.coordinates[0] * sourceWeight(member), 0)
            / totalWeight,
          members.reduce((sum, member) => sum + member.coordinates[1] * sourceWeight(member), 0)
            / totalWeight,
        ],
        museumCount: members.length,
        artworkCount: members.reduce((sum, member) => sum + member.artworkCount, 0),
        sourceIds: members.map((member) => member.id).sort(),
      };
    })
    .sort((a, b) => b.artworkCount - a.artworkCount || a.country.localeCompare(b.country));
}

export function aggregateMuseumsByCity(
  source: readonly MuseumMapDatum[],
): CityMuseumAggregate[] {
  const grouped = new Map<string, MuseumMapDatum[]>();
  source.slice().sort(byId).forEach((point) => {
    const id = `${point.city}|${point.country}`;
    grouped.set(id, [...(grouped.get(id) ?? []), point]);
  });

  return [...grouped.entries()]
    .map(([id, members]): CityMuseumAggregate => {
      const totalWeight = members.reduce((sum, member) => sum + sourceWeight(member), 0);
      return {
        id,
        city: members[0].city,
        country: members[0].country,
        coordinates: [
          members.reduce((sum, member) => sum + member.coordinates[0] * sourceWeight(member), 0)
            / totalWeight,
          members.reduce((sum, member) => sum + member.coordinates[1] * sourceWeight(member), 0)
            / totalWeight,
        ],
        museumCount: members.length,
        artworkCount: members.reduce((sum, member) => sum + member.artworkCount, 0),
        sourceIds: members.map((member) => member.id).sort(),
      };
    })
    .sort((a, b) => b.artworkCount - a.artworkCount || a.id.localeCompare(b.id));
}
