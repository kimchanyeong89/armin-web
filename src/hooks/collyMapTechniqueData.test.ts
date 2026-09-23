import { describe, expect, it } from "vitest";
import * as collyMapTechniqueData from "../components/InteractiveGlobeMap/collyMapTechniqueData";
import {
  aggregateMuseumsByCountry,
  aggregateMuseumsByCity,
  placeAtlasEdgeLabels,
  placeAtlasLocalLabels,
  placeMarginLedgerLabels,
  placeRadialRegisterLabels,
  resolveCompactAnchorTickLength,
  resolveAtlasLabelLimit,
  resolveAtlasLabelTextAlign,
  type ProjectedMuseumDatum,
} from "../components/InteractiveGlobeMap/collyMapTechniqueData";

const points: ProjectedMuseumDatum[] = [
  {
    id: "paris-a",
    city: "Paris",
    country: "France",
    coordinates: [2.35, 48.86],
    artworkCount: 120,
    isMajor: true,
    x: 100,
    y: 100,
    visible: true,
  },
  {
    id: "paris-b",
    city: "Paris",
    country: "France",
    coordinates: [2.36, 48.87],
    artworkCount: 30,
    x: 108,
    y: 104,
    visible: true,
  },
  {
    id: "london-a",
    city: "London",
    country: "United Kingdom",
    coordinates: [-0.12, 51.5],
    artworkCount: 90,
    x: 170,
    y: 92,
    visible: true,
  },
  {
    id: "new-york-a",
    city: "New York",
    country: "United States",
    coordinates: [-73.98, 40.76],
    artworkCount: 240,
    isMajor: true,
    x: 30,
    y: 125,
    visible: true,
  },
];

describe("COLLY map technique data", () => {
  it("resolves a smooth Atlas zoom morph with a reduced-motion snap", () => {
    const resolveAtlasZoomMorph = (collyMapTechniqueData as unknown as {
      resolveAtlasZoomMorph?: (
        scale: number,
        reducedMotion: boolean,
      ) => { progress: number; leaderAlpha: number; extraLabelAlpha: number };
    }).resolveAtlasZoomMorph;

    expect(typeof resolveAtlasZoomMorph).toBe("function");
    if (!resolveAtlasZoomMorph) return;
    expect(resolveAtlasZoomMorph(1, false).progress).toBe(0);
    expect(resolveAtlasZoomMorph(1.75, false).progress).toBeCloseTo(0.5, 1);
    expect(resolveAtlasZoomMorph(2.25, false)).toMatchObject({
      progress: 1,
      leaderAlpha: 0,
      extraLabelAlpha: 1,
    });
    expect(resolveAtlasZoomMorph(2.2, true).progress).toBe(0);
    expect(resolveAtlasZoomMorph(2.25, true).progress).toBe(1);
  });

  it("interpolates Atlas label positions without changing their endpoints", () => {
    const interpolateAtlasLabelPosition = (collyMapTechniqueData as unknown as {
      interpolateAtlasLabelPosition?: (
        from: readonly [number, number],
        to: readonly [number, number],
        progress: number,
      ) => [number, number];
    }).interpolateAtlasLabelPosition;

    expect(typeof interpolateAtlasLabelPosition).toBe("function");
    if (!interpolateAtlasLabelPosition) return;
    expect(interpolateAtlasLabelPosition([10, 20], [30, 40], 0)).toEqual([10, 20]);
    expect(interpolateAtlasLabelPosition([10, 20], [30, 40], 0.5)).toEqual([20, 30]);
    expect(interpolateAtlasLabelPosition([10, 20], [30, 40], 1)).toEqual([30, 40]);
  });

  it("places atlas labels inside the canvas with deterministic vertical separation", () => {
    const labels = placeAtlasEdgeLabels([
      { id: "a", label: "France", anchorX: 420, anchorY: 200, weight: 90 },
      { id: "b", label: "Italy", anchorX: 430, anchorY: 204, weight: 80 },
      { id: "c", label: "Spain", anchorX: 410, anchorY: 207, weight: 70 },
      { id: "d", label: "Canada", anchorX: 180, anchorY: 205, weight: 60 },
    ], {
      center: [300, 250],
      radius: 190,
      width: 600,
      height: 500,
      gap: 18,
      inset: 16,
      limit: 4,
    });

    expect(placeAtlasEdgeLabels([
      { id: "a", label: "France", anchorX: 420, anchorY: 200, weight: 90 },
      { id: "b", label: "Italy", anchorX: 430, anchorY: 204, weight: 80 },
      { id: "c", label: "Spain", anchorX: 410, anchorY: 207, weight: 70 },
      { id: "d", label: "Canada", anchorX: 180, anchorY: 205, weight: 60 },
    ], {
      center: [300, 250],
      radius: 190,
      width: 600,
      height: 500,
      gap: 18,
      inset: 16,
      limit: 4,
    })).toEqual(labels);
    expect(labels).toHaveLength(4);
    expect(labels.every((label) => (
      label.labelX >= 16
      && label.labelX <= 584
      && label.labelY >= 16
      && label.labelY <= 484
    ))).toBe(true);
    const right = labels.filter((label) => label.side === "right").sort((a, b) => a.labelY - b.labelY);
    expect(right[1].labelY - right[0].labelY).toBeGreaterThanOrEqual(18);
    expect(right[2].labelY - right[1].labelY).toBeGreaterThanOrEqual(18);
  });

  it("keeps atlas labels legible inside narrow canvases", () => {
    expect(resolveAtlasLabelLimit(390, 18)).toBe(7);
    expect(resolveAtlasLabelLimit(1440, 18)).toBe(18);
    expect(resolveAtlasLabelTextAlign("left", 390)).toBe("left");
    expect(resolveAtlasLabelTextAlign("right", 390)).toBe("right");
    expect(resolveAtlasLabelTextAlign("left", 1440)).toBe("right");
    expect(resolveAtlasLabelTextAlign("right", 1440)).toBe("left");
  });

  it("aggregates countries without changing country keys or totals", () => {
    const aggregates = aggregateMuseumsByCountry(points);

    expect(aggregates.map((aggregate) => aggregate.country)).toEqual([
      "United States",
      "France",
      "United Kingdom",
    ]);
    expect(aggregates.reduce((sum, aggregate) => sum + aggregate.museumCount, 0)).toBe(4);
    expect(aggregates.reduce((sum, aggregate) => sum + aggregate.artworkCount, 0)).toBe(480);
    expect(aggregates.find((aggregate) => aggregate.country === "France")).toMatchObject({
      museumCount: 2,
      artworkCount: 150,
      sourceIds: ["paris-a", "paris-b"],
    });
  });

  it("aggregates real museum cities deterministically", () => {
    const first = aggregateMuseumsByCity(points);
    const second = aggregateMuseumsByCity([...points].reverse());

    expect(first).toEqual(second);
    expect(first.map((aggregate) => aggregate.id)).toEqual([
      "New York|United States",
      "Paris|France",
      "London|United Kingdom",
    ]);
    expect(first.find((aggregate) => aggregate.city === "Paris")).toMatchObject({
      museumCount: 2,
      artworkCount: 150,
      sourceIds: ["paris-a", "paris-b"],
    });
  });

  it("caps local Atlas callouts and uses compact horizontal anchor ticks", () => {
    const labels = placeAtlasLocalLabels([
      { id: "a", label: "France", anchorX: 210, anchorY: 180, weight: 150 },
      { id: "b", label: "Belgium", anchorX: 218, anchorY: 186, weight: 80 },
      { id: "c", label: "Spain", anchorX: 198, anchorY: 232, weight: 70 },
    ], {
      width: 420,
      height: 360,
      inset: 14,
      limit: 2,
      maxLeader: 48,
    });

    expect(labels).toHaveLength(2);
    expect(labels.every((label) => (
      Math.hypot(label.labelX - label.anchorX, label.labelY - label.anchorY) <= 48
      && label.labelX >= 14
      && label.labelX <= 406
      && label.labelY >= 14
      && label.labelY <= 346
    ))).toBe(true);
    expect(resolveCompactAnchorTickLength(1)).toBeGreaterThanOrEqual(4);
    expect(resolveCompactAnchorTickLength(500)).toBeLessThanOrEqual(13);
  });

  it("aligns margin-ledger labels into stable left and right rows", () => {
    const labels = placeMarginLedgerLabels([
      { id: "a", label: "France", anchorX: 390, anchorY: 190, weight: 90 },
      { id: "b", label: "Italy", anchorX: 420, anchorY: 210, weight: 80 },
      { id: "c", label: "Canada", anchorX: 120, anchorY: 140, weight: 70 },
      { id: "d", label: "Mexico", anchorX: 160, anchorY: 240, weight: 60 },
    ], {
      center: [300, 240],
      radius: 190,
      width: 600,
      height: 480,
      inset: 16,
      limit: 4,
    });

    const left = labels.filter((label) => label.side === "left");
    const right = labels.filter((label) => label.side === "right");
    expect(new Set(left.map((label) => label.labelX))).toHaveLength(1);
    expect(new Set(right.map((label) => label.labelX))).toHaveLength(1);
    expect(labels.map((label) => label.row).sort((a, b) => a - b)).toEqual([0, 0, 1, 1]);
  });

  it("places radial-register labels inside the canvas by angular sector", () => {
    const labels = placeRadialRegisterLabels([
      { id: "east-a", label: "A", anchorX: 420, anchorY: 250, weight: 100 },
      { id: "east-b", label: "B", anchorX: 415, anchorY: 255, weight: 80 },
      { id: "north", label: "C", anchorX: 300, anchorY: 120, weight: 70 },
      { id: "west", label: "D", anchorX: 170, anchorY: 250, weight: 60 },
    ], {
      center: [300, 250],
      radius: 160,
      width: 600,
      height: 500,
      inset: 18,
      limit: 4,
      minAngularGap: 0.25,
    });

    expect(labels).toHaveLength(4);
    expect(labels.every((label) => (
      label.labelX >= 18
      && label.labelX <= 582
      && label.labelY >= 18
      && label.labelY <= 482
      && Number.isFinite(label.angle)
    ))).toBe(true);
    const eastLabels = labels.filter((label) => label.id.startsWith("east"));
    expect(eastLabels).toHaveLength(2);
    expect(new Set(eastLabels.map((label) => label.angle))).toHaveLength(2);
  });

  it("returns safe empty aggregate structures", () => {
    expect(aggregateMuseumsByCountry([])).toEqual([]);
    expect(aggregateMuseumsByCity([])).toEqual([]);
  });
});
