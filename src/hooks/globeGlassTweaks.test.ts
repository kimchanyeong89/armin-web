import { describe, expect, it } from "vitest";
import {
  GLOBE_GLASS_TWEAKS,
  GLOBE_GLASS_TWEAK_IDS,
  glassZoomFade,
  resolveGlobeGlassProfile,
  resolveGlobeGlassTweak,
} from "../components/InteractiveGlobeMap/globeGlassTweaks";

describe("globe glass tweaks", () => {
  it("keeps the six variations in a stable order", () => {
    expect(GLOBE_GLASS_TWEAK_IDS).toEqual([
      "halo-frost",
      "aurora-veil",
      "soft-bezel",
      "moon-wash",
      "depth-fog",
      "candle-frost",
    ]);
  });

  it("resolves only supported tweak ids", () => {
    expect(resolveGlobeGlassTweak("halo-frost")).toBe("halo-frost");
    expect(resolveGlobeGlassTweak("unknown")).toBeUndefined();
    expect(resolveGlobeGlassTweak(null)).toBeUndefined();
  });

  it("attributes every variation to a design skill and exposes its preview URL", () => {
    expect(GLOBE_GLASS_TWEAKS).toHaveLength(6);
    for (const tweak of GLOBE_GLASS_TWEAKS) {
      expect(tweak.skill.length).toBeGreaterThan(0);
      expect(tweak.url).toBe(`/interactive?glass=${tweak.id}`);
    }
  });

  it("has a render profile for every tweak and none by default", () => {
    expect(resolveGlobeGlassProfile(undefined)).toBeNull();
    for (const id of GLOBE_GLASS_TWEAK_IDS) {
      const profile = resolveGlobeGlassProfile(id);
      expect(profile).not.toBeNull();
      // Every variant must model depth somehow.
      expect(
        Boolean(profile!.glows || profile!.shade || profile!.rims || profile!.fog),
      ).toBe(true);
    }
  });

  it("fades the glass out while drilling in", () => {
    expect(glassZoomFade(1)).toBe(1);
    expect(glassZoomFade(2.35)).toBeGreaterThan(0);
    expect(glassZoomFade(2.35)).toBeLessThan(1);
    expect(glassZoomFade(3)).toBe(0);
  });
});
