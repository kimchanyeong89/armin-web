import { describe, expect, it } from "vitest";
import * as globeGeometrySmoothing from "../components/InteractiveGlobeMap/globeGeometrySmoothing";
import { smoothGlobeGeometry } from "../components/InteractiveGlobeMap/globeGeometrySmoothing";

describe("smoothGlobeGeometry", () => {
  it("selects the largest polygon as a multipart country's mainland", () => {
    const getMainlandFeature = (globeGeometrySmoothing as unknown as {
      getMainlandFeature?: (feature: any) => any;
    }).getMainlandFeature;
    const overseas = [[-54, 2], [-54, 6], [-50, 6], [-50, 2], [-54, 2]];
    const mainland = [[-5, 42], [-5, 51], [8, 51], [8, 42], [-5, 42]];
    const source = {
      type: "Feature",
      properties: { name: "France" },
      geometry: {
        type: "MultiPolygon",
        coordinates: [[[...overseas]], [[...mainland]]],
      },
    };

    expect(typeof getMainlandFeature).toBe("function");
    if (!getMainlandFeature) return;
    const selected = getMainlandFeature(source);
    expect(selected.geometry).toEqual({
      type: "Polygon",
      coordinates: [[...mainland]],
    });
    expect(source.geometry.type).toBe("MultiPolygon");
  });

  it("replaces square vertices with sampled curves without mutating its source", () => {
    const ring = [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]];
    const source = { type: "Polygon", coordinates: [ring] };
    const rounded = smoothGlobeGeometry(source, "atlas");
    const output = rounded.coordinates[0];

    expect(output[0]).toEqual(output.at(-1));
    expect(output.length).toBeGreaterThan(ring.length * 3);
    expect(output).not.toContainEqual([10, 0]);
    expect(output.some(([x, y]: number[]) => x > 9 && y > 0 && y < 3.5)).toBe(true);
    expect(source.coordinates[0]).toHaveLength(5);
    expect(source.coordinates[0][1]).toEqual([10, 0]);
  });

  it("keeps open-line endpoints and makes soft geometry denser", () => {
    const line = {
      type: "MultiLineString",
      coordinates: [[[0, 0], [8, 6], [16, 0]]],
    };
    const balanced = smoothGlobeGeometry(line, "balanced");
    const soft = smoothGlobeGeometry(line, "soft");
    const atlas = smoothGlobeGeometry(line, "atlas");

    expect(balanced.coordinates[0][0]).toEqual([0, 0]);
    expect(balanced.coordinates[0].at(-1)).toEqual([16, 0]);
    expect(soft.coordinates[0].length).toBeGreaterThan(balanced.coordinates[0].length);
    expect(atlas.coordinates[0].length).toBeGreaterThan(soft.coordinates[0].length);
    expect(atlas.coordinates[0]).not.toContainEqual([8, 6]);
  });

  it("rounds every polygon in a multipolygon", () => {
    const first = [[0, 0], [4, 0], [4, 4], [0, 4], [0, 0]];
    const second = [[8, 0], [12, 0], [12, 4], [8, 4], [8, 0]];
    const rounded = smoothGlobeGeometry({
      type: "MultiPolygon",
      coordinates: [[[...first]], [[...second]]],
    }, "soft");

    expect(rounded.coordinates[0][0].length).toBeGreaterThan(first.length);
    expect(rounded.coordinates[1][0].length).toBeGreaterThan(second.length);
  });

  it("rounds antimeridian corners without interpolating across the world", () => {
    const ring = [[179, 0], [-179, 0], [-179, 2], [179, 2], [179, 0]];
    const rounded = smoothGlobeGeometry({
      type: "Polygon",
      coordinates: [ring],
    }, "atlas");

    expect(rounded.coordinates[0][0]).toEqual(rounded.coordinates[0].at(-1));
    expect(rounded.coordinates[0].every(([longitude]: number[]) => (
      Number.isFinite(longitude) && Math.abs(longitude) > 170
    ))).toBe(true);
  });
});
