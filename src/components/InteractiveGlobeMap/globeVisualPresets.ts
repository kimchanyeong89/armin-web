import type { Theme } from "./types";

export const GLOBE_VISUAL_PRESET_IDS = [
  "editorial-atlas",
  "signal-observatory",
  "nocturne",
  "colly-evolved",
  "accessible-atlas",
] as const;

export type GlobeVisualPresetId = (typeof GLOBE_VISUAL_PRESET_IDS)[number];

export type GlobeRenderStyle =
  | "production"
  | "editorial-plate"
  | "signal-radar"
  | "nocturne-celestial"
  | "colly-focus"
  | "accessible-atlas";

export type GlobeRenderProfile = {
  renderStyle: GlobeRenderStyle;
  scaleRatio: number;
  offset: readonly [number, number];
  labelMode: "production" | "editorial" | "telemetry" | "minimal" | "accessible";
  previewMarker: "dot" | "registration" | "signal" | "star" | "hierarchy" | "outlined";
  furniture: "none" | "atlas" | "radar" | "sparse" | "accessible";
  atmosphere: "flat" | "plate" | "radar" | "crescent" | "depth" | "accessible";
};

const PRODUCTION_RENDER_PROFILE: GlobeRenderProfile = {
  renderStyle: "production",
  scaleRatio: 0.38,
  offset: [0, 0],
  labelMode: "production",
  previewMarker: "dot",
  furniture: "none",
  atmosphere: "flat",
};

export const GLOBE_RENDER_PROFILES: Record<GlobeVisualPresetId, GlobeRenderProfile> = {
  "editorial-atlas": {
    renderStyle: "editorial-plate",
    scaleRatio: 0.5,
    offset: [0.16, 0.06],
    labelMode: "editorial",
    previewMarker: "registration",
    furniture: "atlas",
    atmosphere: "plate",
  },
  "signal-observatory": {
    renderStyle: "signal-radar",
    scaleRatio: 0.4,
    offset: [-0.12, 0.06],
    labelMode: "telemetry",
    previewMarker: "signal",
    furniture: "radar",
    atmosphere: "radar",
  },
  nocturne: {
    renderStyle: "nocturne-celestial",
    scaleRatio: 0.56,
    offset: [0.18, 0.14],
    labelMode: "minimal",
    previewMarker: "star",
    furniture: "none",
    atmosphere: "crescent",
  },
  "colly-evolved": {
    renderStyle: "colly-focus",
    scaleRatio: 0.44,
    offset: [0.04, 0.05],
    labelMode: "production",
    previewMarker: "hierarchy",
    furniture: "sparse",
    atmosphere: "depth",
  },
  "accessible-atlas": {
    renderStyle: "accessible-atlas",
    scaleRatio: 0.42,
    offset: [0, 0.04],
    labelMode: "accessible",
    previewMarker: "outlined",
    furniture: "accessible",
    atmosphere: "accessible",
  },
};

export function resolveGlobeRenderProfile(
  preset: GlobeVisualPresetId | undefined,
): GlobeRenderProfile {
  return preset ? GLOBE_RENDER_PROFILES[preset] : PRODUCTION_RENDER_PROFILE;
}

export function resolveGlobeScaleRatio(preset: GlobeVisualPresetId | undefined): number {
  return resolveGlobeRenderProfile(preset).scaleRatio;
}

export type GlobeVisualPalette = {
  ocean: string;
  atmosphere: string;
  land: string;
  border: string;
  label: string;
  accent: string;
  accentRgb: string;
  majorMarker: string;
  minorMarker: string;
  crosshair: string;
  landOpacity: number;
  borderOpacity: number;
  borderWidth: number;
  labelFont: string;
  markerStyle: "bevel" | "ring" | "diamond" | "square";
};

const PRODUCTION_VISUALS: Record<Theme, GlobeVisualPalette> = {
  dark: {
    ocean: "rgba(255,255,255,0.012)",
    atmosphere: "rgba(255,255,255,0.08)",
    land: "255,255,255",
    border: "255,255,255",
    label: "255,255,255",
    accent: "#D4A547",
    accentRgb: "212,165,71",
    majorMarker: "212,165,71",
    minorMarker: "255,255,255",
    crosshair: "rgba(255,255,255,0.04)",
    landOpacity: 1,
    borderOpacity: 1,
    borderWidth: 1,
    labelFont: '"Space Grotesk", sans-serif',
    markerStyle: "bevel",
  },
  light: {
    ocean: "rgba(0,0,0,0.006)",
    atmosphere: "rgba(0,0,0,0.06)",
    land: "0,0,0",
    border: "0,0,0",
    label: "0,0,0",
    accent: "#8A6B1F",
    accentRgb: "138,107,31",
    majorMarker: "138,107,31",
    minorMarker: "0,0,0",
    crosshair: "rgba(0,0,0,0.04)",
    landOpacity: 1,
    borderOpacity: 1,
    borderWidth: 1,
    labelFont: '"Space Grotesk", sans-serif',
    markerStyle: "bevel",
  },
};

export const GLOBE_VISUAL_PRESETS: Record<GlobeVisualPresetId, GlobeVisualPalette> = {
  "editorial-atlas": {
    ocean: "#e9ebdf",
    atmosphere: "rgba(24,45,99,0.48)",
    land: "24,45,99",
    border: "24,45,99",
    label: "24,45,99",
    accent: "#B93120",
    accentRgb: "185,49,32",
    majorMarker: "185,49,32",
    minorMarker: "24,45,99",
    crosshair: "rgba(24,45,99,0.14)",
    landOpacity: 1.55,
    borderOpacity: 1.7,
    borderWidth: 1.2,
    labelFont: '"Avenir Next Condensed", "Noto Sans KR", sans-serif',
    markerStyle: "square",
  },
  "signal-observatory": {
    ocean: "#061713",
    atmosphere: "rgba(255,119,78,0.52)",
    land: "66,217,208",
    border: "66,217,208",
    label: "195,235,228",
    accent: "#FF774E",
    accentRgb: "255,119,78",
    majorMarker: "255,119,78",
    minorMarker: "66,217,208",
    crosshair: "rgba(255,138,91,0.18)",
    landOpacity: 1.1,
    borderOpacity: 1.45,
    borderWidth: 1.15,
    labelFont: '"Space Mono", "SFMono-Regular", monospace',
    markerStyle: "diamond",
  },
  nocturne: {
    ocean: "#070810",
    atmosphere: "rgba(210,220,240,0.25)",
    land: "171,183,207",
    border: "205,214,232",
    label: "235,239,247",
    accent: "#DCE4F2",
    accentRgb: "220,228,242",
    majorMarker: "220,228,242",
    minorMarker: "129,146,180",
    crosshair: "rgba(220,228,242,0.08)",
    landOpacity: 1.15,
    borderOpacity: 1.3,
    borderWidth: 0.9,
    labelFont: '"Iowan Old Style", "Times New Roman", serif',
    markerStyle: "ring",
  },
  "colly-evolved": {
    ocean: "#10100d",
    atmosphere: "rgba(215,170,85,0.18)",
    land: "238,233,223",
    border: "238,233,223",
    label: "238,233,223",
    accent: "#D7AA55",
    accentRgb: "215,170,85",
    majorMarker: "215,170,85",
    minorMarker: "238,233,223",
    crosshair: "rgba(238,233,223,0.07)",
    landOpacity: 1.15,
    borderOpacity: 1.15,
    borderWidth: 1,
    labelFont: '"Space Grotesk", sans-serif',
    markerStyle: "bevel",
  },
  "accessible-atlas": {
    ocean: "#dcebf2",
    atmosphere: "rgba(15,53,74,0.92)",
    land: "18,59,86",
    border: "248,250,252",
    label: "9,45,68",
    accent: "#D95D24",
    accentRgb: "217,93,36",
    majorMarker: "217,93,36",
    minorMarker: "18,59,86",
    crosshair: "rgba(18,59,86,0.16)",
    landOpacity: 1.75,
    borderOpacity: 2,
    borderWidth: 1.45,
    labelFont: '"Avenir Next", "Noto Sans KR", sans-serif',
    markerStyle: "ring",
  },
};

export function resolveGlobeVisualPalette(
  preset: GlobeVisualPresetId | undefined,
  theme: Theme,
): GlobeVisualPalette {
  return preset ? GLOBE_VISUAL_PRESETS[preset] : PRODUCTION_VISUALS[theme];
}
