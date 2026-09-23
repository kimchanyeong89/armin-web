import type {
  GlobeRenderProfile,
  GlobeVisualPalette,
} from "./globeVisualPresets";
import type { CollyGlobeVariantProfile } from "./collyGlobeVariants";

type GeoPath = (object: any) => void;

export type GlobeViewportDensity = "compact" | "regular";
export type CountryBoundaryStyle = "atlas-index";

export function resolveGlobeViewportDensity(width: number): GlobeViewportDensity {
  return width <= 900 ? "compact" : "regular";
}

export type GlobeCanvasStyleArgs = {
  ctx: CanvasRenderingContext2D;
  path: GeoPath;
  sphere: any;
  graticule: any;
  center: readonly [number, number];
  radius: number;
  palette: GlobeVisualPalette;
  profile: GlobeRenderProfile;
  collyProfile?: CollyGlobeVariantProfile | null;
  drillOpacity: number;
  density: GlobeViewportDensity;
};

type GlobeGeometryStyleArgs = GlobeCanvasStyleArgs & {
  geometry: any;
  isMobile?: boolean;
  boundaryStyle?: CountryBoundaryStyle;
  viewportWidth?: number;
};

const paperPatternCache = new WeakMap<CanvasRenderingContext2D, CanvasPattern>();

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function resolveAtlasBoundaryStyle(width: number): {
  alpha: number;
  width: number;
} {
  return width < 560
    ? { alpha: 0.2, width: 0.62 }
    : { alpha: 0.17, width: 0.55 };
}

function paperPattern(ctx: CanvasRenderingContext2D): CanvasPattern | null {
  const cached = paperPatternCache.get(ctx);
  if (cached) return cached;
  if (typeof document === "undefined") return null;

  const tile = document.createElement("canvas");
  tile.width = 10;
  tile.height = 10;
  const tileContext = tile.getContext("2d");
  if (!tileContext) return null;
  tileContext.fillStyle = "rgba(24,45,99,0.12)";
  tileContext.fillRect(1, 1, 1, 1);
  tileContext.fillRect(6, 6, 0.7, 0.7);
  const pattern = ctx.createPattern(tile, "repeat");
  if (pattern) paperPatternCache.set(ctx, pattern);
  return pattern;
}

function drawProjectedLine(
  ctx: CanvasRenderingContext2D,
  path: GeoPath,
  geometry: any,
  stroke: string,
  width: number,
  dash: number[] = [],
): void {
  ctx.save();
  ctx.beginPath();
  path(geometry);
  ctx.strokeStyle = stroke;
  ctx.lineWidth = width;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.setLineDash(dash);
  ctx.stroke();
  ctx.restore();
}

function drawBearingTicks(
  ctx: CanvasRenderingContext2D,
  center: readonly [number, number],
  radius: number,
  color: string,
  step: number,
  strongEvery: number,
): void {
  const [cx, cy] = center;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineCap = "round";
  for (let degree = 0; degree < 360; degree += step) {
    const angle = (degree - 90) * Math.PI / 180;
    const strong = degree % strongEvery === 0;
    const inner = radius + (strong ? 5 : 8);
    const outer = radius + (strong ? 15 : 12);
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner);
    ctx.lineTo(cx + Math.cos(angle) * outer, cy + Math.sin(angle) * outer);
    ctx.lineWidth = strong ? 1.2 : 0.55;
    ctx.stroke();
  }
  ctx.restore();
}

export function drawSphereSurface(args: GlobeCanvasStyleArgs): void {
  const { ctx, path, sphere, center, radius, palette, profile } = args;
  const [cx, cy] = center;
  let fill: string | CanvasGradient = palette.ocean;

  if (profile.renderStyle === "signal-radar") {
    const gradient = ctx.createRadialGradient(cx, cy, radius * 0.04, cx, cy, radius);
    gradient.addColorStop(0, "#0d2b27");
    gradient.addColorStop(0.62, "#071d1b");
    gradient.addColorStop(1, "#03110f");
    fill = gradient;
  } else if (profile.renderStyle === "nocturne-celestial") {
    const gradient = ctx.createRadialGradient(
      cx - radius * 0.36,
      cy - radius * 0.42,
      radius * 0.08,
      cx,
      cy,
      radius * 1.12,
    );
    gradient.addColorStop(0, "#263044");
    gradient.addColorStop(0.34, "#141927");
    gradient.addColorStop(1, "#06070d");
    fill = gradient;
  }

  ctx.save();
  ctx.beginPath();
  path(sphere);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = palette.atmosphere;
  ctx.lineWidth = 0.8 * palette.borderWidth;
  ctx.stroke();
  ctx.restore();

  if (profile.renderStyle === "editorial-plate") {
    const pattern = paperPattern(ctx);
    if (!pattern) return;
    ctx.save();
    ctx.beginPath();
    path(sphere);
    ctx.clip();
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = pattern;
    ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
    ctx.restore();
  }
}

export function drawGlobeFurniture(args: GlobeCanvasStyleArgs): void {
  const { ctx, path, sphere, graticule, center, radius, palette, profile, density } = args;
  const [cx, cy] = center;
  const compact = density === "compact";

  if (profile.furniture === "atlas") {
    drawProjectedLine(ctx, path, graticule, `rgba(${palette.border},0.22)`, 0.5, [1.5, 4]);
    drawBearingTicks(ctx, center, radius, `rgba(${palette.accentRgb},0.62)`, compact ? 30 : 15, 90);
    return;
  }

  if (profile.furniture === "radar") {
    ctx.save();
    ctx.beginPath();
    path(sphere);
    ctx.clip();

    ctx.strokeStyle = "rgba(66,217,208,0.19)";
    ctx.lineWidth = 0.7;
    for (const scale of compact ? [0.5] : [0.25, 0.5, 0.75]) {
      ctx.beginPath();
      ctx.arc(cx, cy, radius * scale, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(cx - radius, cy);
    ctx.lineTo(cx + radius, cy);
    ctx.moveTo(cx, cy - radius);
    ctx.lineTo(cx, cy + radius);
    ctx.stroke();

    const scanAngle = -0.72;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, radius, scanAngle - 0.22, scanAngle + 0.05);
    ctx.closePath();
    const scan = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
    scan.addColorStop(0, "rgba(66,217,208,0.16)");
    scan.addColorStop(1, "rgba(66,217,208,0.01)");
    ctx.fillStyle = scan;
    ctx.fill();
    ctx.restore();

    drawProjectedLine(ctx, path, graticule, "rgba(66,217,208,0.12)", 0.45);
    drawBearingTicks(ctx, center, radius, "rgba(255,119,78,0.72)", compact ? 20 : 10, 40);
    return;
  }

  if (profile.furniture === "sparse") {
    drawProjectedLine(ctx, path, graticule, `rgba(${palette.border},0.05)`, 0.4);
    return;
  }

  if (profile.furniture === "accessible") {
    drawProjectedLine(ctx, path, graticule, "rgba(15,53,74,0.24)", 0.7);
  }
}

export function drawStyledLand(args: GlobeGeometryStyleArgs): void {
  const {
    ctx,
    path,
    geometry,
    palette,
    profile,
    drillOpacity,
  } = args;
  if (!geometry) return;

  let fillAlpha = lerp(0.05, 0.02, drillOpacity) * palette.landOpacity;
  let coastAlpha = lerp(0.10, 0.035, drillOpacity) * palette.borderOpacity;
  let coastWidth = 0.6 * palette.borderWidth;
  let coastColor = palette.border;

  switch (profile.renderStyle) {
    case "editorial-plate":
      fillAlpha = lerp(0.18, 0.10, drillOpacity);
      coastAlpha = lerp(0.82, 0.52, drillOpacity);
      coastWidth = 1.05;
      coastColor = palette.accentRgb;
      break;
    case "signal-radar":
      fillAlpha = lerp(0.075, 0.035, drillOpacity);
      coastAlpha = lerp(0.68, 0.36, drillOpacity);
      coastWidth = 0.9;
      break;
    case "nocturne-celestial":
      fillAlpha = lerp(0.16, 0.08, drillOpacity);
      coastAlpha = lerp(0.24, 0.14, drillOpacity);
      coastWidth = 0.7;
      break;
    case "colly-focus":
      fillAlpha = lerp(0.115, 0.06, drillOpacity);
      coastAlpha = lerp(0.22, 0.12, drillOpacity);
      coastWidth = 0.72;
      break;
    case "accessible-atlas":
      fillAlpha = lerp(0.78, 0.64, drillOpacity);
      coastAlpha = 0.95;
      coastWidth = 1.3;
      coastColor = palette.land;
      break;
    default:
      break;
  }

  ctx.save();
  ctx.beginPath();
  path(geometry);
  ctx.fillStyle = `rgba(${palette.land},${fillAlpha})`;
  ctx.fill();
  ctx.beginPath();
  path(geometry);
  ctx.strokeStyle = `rgba(${coastColor},${coastAlpha})`;
  ctx.lineWidth = coastWidth;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.stroke();
  ctx.restore();
}

export function drawStyledBorders(args: GlobeGeometryStyleArgs): void {
  const {
    ctx,
    path,
    geometry,
    palette,
    profile,
    drillOpacity,
    isMobile = false,
    boundaryStyle,
    viewportWidth = 0,
  } = args;
  if (!geometry) return;

  if (boundaryStyle === "atlas-index") {
    const style = resolveAtlasBoundaryStyle(viewportWidth);
    drawProjectedLine(
      ctx,
      path,
      geometry,
      `rgba(${palette.label},${style.alpha})`,
      style.width,
    );
    return;
  }

  if (profile.renderStyle === "production") {
    if (isMobile) {
      ctx.save();
      ctx.beginPath();
      path(geometry);
      ctx.shadowBlur = 5;
      ctx.shadowColor = `rgba(${palette.border},${0.16 * palette.borderOpacity})`;
      ctx.strokeStyle = `rgba(${palette.border},${lerp(0.06, 0.022, drillOpacity) * palette.borderOpacity})`;
      ctx.lineWidth = 1.1 * palette.borderWidth;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.stroke();
      ctx.restore();
      drawProjectedLine(
        ctx,
        path,
        geometry,
        `rgba(${palette.border},${lerp(0.09, 0.035, drillOpacity) * palette.borderOpacity})`,
        0.35 * palette.borderWidth,
      );
      return;
    }
    drawProjectedLine(
      ctx,
      path,
      geometry,
      `rgba(${palette.border},${lerp(0.04, 0.015, drillOpacity) * palette.borderOpacity})`,
      0.3 * palette.borderWidth,
    );
    return;
  }

  const styles: Record<string, { alpha: number; width: number }> = {
    "editorial-plate": { alpha: 0.46, width: 0.62 },
    "signal-radar": { alpha: 0.24, width: 0.48 },
    "nocturne-celestial": { alpha: 0.075, width: 0.42 },
    "colly-focus": { alpha: 0.12, width: 0.42 },
    "accessible-atlas": { alpha: 0.82, width: 0.86 },
  };
  const style = styles[profile.renderStyle];
  drawProjectedLine(
    ctx,
    path,
    geometry,
    `rgba(${palette.border},${style.alpha * (1 - drillOpacity * 0.28)})`,
    style.width,
  );
}

export function drawAtmosphereFinish(args: GlobeCanvasStyleArgs): void {
  const { ctx, path, sphere, center, radius, palette, profile } = args;
  const [cx, cy] = center;

  ctx.save();
  if (profile.atmosphere === "plate") {
    ctx.beginPath();
    path(sphere);
    ctx.strokeStyle = `rgba(${palette.accentRgb},0.72)`;
    ctx.lineWidth = 1.15;
    ctx.stroke();
  } else if (profile.atmosphere === "radar") {
    ctx.beginPath();
    path(sphere);
    ctx.setLineDash([11, 7]);
    ctx.strokeStyle = "rgba(255,119,78,0.82)";
    ctx.lineWidth = 1.45;
    ctx.stroke();
  } else if (profile.atmosphere === "crescent") {
    ctx.beginPath();
    ctx.arc(cx, cy, radius + 0.5, -1.3, 1.05);
    ctx.strokeStyle = "rgba(224,231,244,0.72)";
    ctx.lineWidth = 1.35;
    ctx.shadowColor = "rgba(188,204,234,0.42)";
    ctx.shadowBlur = 14;
    ctx.stroke();
  } else if (profile.atmosphere === "depth") {
    ctx.beginPath();
    path(sphere);
    ctx.strokeStyle = `rgba(${palette.accentRgb},0.25)`;
    ctx.lineWidth = 1;
    ctx.stroke();
  } else if (profile.atmosphere === "accessible") {
    ctx.beginPath();
    path(sphere);
    ctx.strokeStyle = "rgba(15,53,74,0.94)";
    ctx.lineWidth = 2.25;
    ctx.stroke();
  }
  ctx.restore();
}

export function drawGlobeCrosshair(args: GlobeCanvasStyleArgs): void {
  const { ctx, center, palette, profile } = args;
  if (profile.renderStyle === "signal-radar" || profile.renderStyle === "nocturne-celestial") return;
  const [cx, cy] = center;
  const size = profile.renderStyle === "accessible-atlas" ? 14 : 12;
  const gap = profile.renderStyle === "accessible-atlas" ? 5 : 4;

  ctx.save();
  ctx.strokeStyle = profile.renderStyle === "editorial-plate"
    ? `rgba(${palette.accentRgb},0.52)`
    : palette.crosshair;
  ctx.lineWidth = profile.renderStyle === "accessible-atlas" ? 1 : 0.5;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(cx - size, cy); ctx.lineTo(cx - gap, cy);
  ctx.moveTo(cx + gap, cy); ctx.lineTo(cx + size, cy);
  ctx.moveTo(cx, cy - size); ctx.lineTo(cx, cy - gap);
  ctx.moveTo(cx, cy + gap); ctx.lineTo(cx, cy + size);
  ctx.stroke();
  ctx.restore();
}

export type ContinentLabelArgs = {
  ctx: CanvasRenderingContext2D;
  x: number;
  y: number;
  continentKey: string;
  label: string;
  total: number;
  language: "ko" | "en";
  hoverProgress: number;
  palette: GlobeVisualPalette;
  profile: GlobeRenderProfile;
  collyProfile?: CollyGlobeVariantProfile | null;
  density: GlobeViewportDensity;
};

export function resolveContinentLabelFontSize(
  profile: GlobeRenderProfile,
  continentKey: string,
  _collyProfile?: CollyGlobeVariantProfile | null,
): number {
  if (profile.labelMode === "accessible") return 14;
  if (profile.labelMode === "editorial") return 12;
  if (profile.labelMode === "minimal") return 11;
  if (profile.labelMode === "telemetry") return 10;
  const baseSize = continentKey === "Asia" ? 12 : 10;
  return baseSize;
}

export function resolveContinentLabelVisibility(
  profile: GlobeRenderProfile,
  total: number,
  density: GlobeViewportDensity,
  _collyProfile?: CollyGlobeVariantProfile | null,
): boolean {
  if (profile.labelMode === "minimal" && total < 10) return false;
  if (density === "compact" && profile.labelMode !== "accessible" && total < 10) return false;
  return true;
}

export function drawContinentLabel(args: ContinentLabelArgs): boolean {
  const {
    ctx,
    x,
    y,
    continentKey,
    label,
    total,
    language,
    hoverProgress,
    palette,
    profile,
    density,
    collyProfile,
  } = args;
  if (!resolveContinentLabelVisibility(profile, total, density, collyProfile)) return false;

  const fontSize = resolveContinentLabelFontSize(profile, continentKey, collyProfile);

  const displayLabel = language === "ko"
    ? label
    : (profile.labelMode === "telemetry" || profile.labelMode === "production"
      ? label.toUpperCase()
      : label);

  ctx.save();
  ctx.textBaseline = "middle";

  if (profile.labelMode === "editorial") {
    ctx.strokeStyle = `rgba(${palette.accentRgb},0.48)`;
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.moveTo(x - 7, y);
    ctx.lineTo(x + 5, y);
    ctx.stroke();
    ctx.textAlign = "left";
    ctx.font = `600 ${fontSize}px ${palette.labelFont}`;
    ctx.fillStyle = `rgba(${palette.label},0.9)`;
    ctx.fillText(displayLabel, x + 10, y - 4 - hoverProgress * 3);
    ctx.font = `500 9px ${palette.labelFont}`;
    ctx.fillStyle = `rgba(${palette.label},0.58)`;
    ctx.fillText(String(total), x + 10, y + 10 + hoverProgress);
  } else if (profile.labelMode === "telemetry") {
    ctx.textAlign = "left";
    ctx.font = `600 ${fontSize}px ${palette.labelFont}`;
    ctx.fillStyle = `rgba(${palette.label},0.82)`;
    ctx.fillText(displayLabel, x + 8, y - 4 - hoverProgress * 3);
    ctx.strokeStyle = `rgba(${palette.accentRgb},0.5)`;
    ctx.lineWidth = 0.65;
    ctx.beginPath();
    ctx.moveTo(x - 5, y - 1);
    ctx.lineTo(x + 4, y - 1);
    ctx.stroke();
    ctx.font = `500 8px ${palette.labelFont}`;
    ctx.fillStyle = `rgba(${palette.label},0.5)`;
    ctx.fillText(`SIG ${String(total).padStart(3, "0")}`, x + 8, y + 9 + hoverProgress);
  } else if (profile.labelMode === "minimal") {
    ctx.textAlign = "center";
    ctx.font = `500 ${fontSize}px ${palette.labelFont}`;
    ctx.lineWidth = 4;
    ctx.strokeStyle = "rgba(6,7,13,0.78)";
    ctx.strokeText(displayLabel, x, y - 3 - hoverProgress * 2);
    ctx.fillStyle = `rgba(${palette.label},0.82)`;
    ctx.fillText(displayLabel, x, y - 3 - hoverProgress * 2);
    ctx.font = `400 8px ${palette.labelFont}`;
    ctx.fillStyle = `rgba(${palette.label},0.42)`;
    ctx.fillText(String(total), x, y + 10);
  } else if (profile.labelMode === "accessible") {
    ctx.textAlign = "center";
    ctx.font = `700 ${fontSize}px ${palette.labelFont}`;
    ctx.lineWidth = 5;
    ctx.strokeStyle = "rgba(220,235,242,0.96)";
    ctx.strokeText(displayLabel, x, y - 5 - hoverProgress * 3);
    ctx.fillStyle = "rgba(9,45,68,0.98)";
    ctx.fillText(displayLabel, x, y - 5 - hoverProgress * 3);
    ctx.font = `700 10px ${palette.labelFont}`;
    ctx.lineWidth = 4;
    ctx.strokeText(String(total), x, y + 12);
    ctx.fillStyle = `rgba(${palette.accentRgb},0.96)`;
    ctx.fillText(String(total), x, y + 12);
  } else {
    ctx.textAlign = "center";
    ctx.font = `600 ${fontSize}px ${palette.labelFont}`;
    ctx.fillStyle = `rgba(${palette.label},0.85)`;
    ctx.fillText(displayLabel, x, y - hoverProgress * 4);
    ctx.font = `400 ${fontSize - 2}px ${palette.labelFont}`;
    ctx.fillStyle = `rgba(${palette.label},${0.45 + hoverProgress * 0.25})`;
    ctx.fillText(String(total), x, y + 12 + hoverProgress * 2);
  }

  ctx.restore();
  return true;
}

export function countryLabelRevealZoom(profile: GlobeRenderProfile): number {
  if (profile.labelMode === "editorial") return 1.9;
  if (profile.labelMode === "accessible") return 2;
  if (profile.labelMode === "minimal") return 2.65;
  return 2.35;
}

export type MuseumPreviewMarkerArgs = {
  ctx: CanvasRenderingContext2D;
  x: number;
  y: number;
  isMajor: boolean;
  alpha: number;
  palette: GlobeVisualPalette;
  profile: GlobeRenderProfile;
  sizeScale?: number;
  pulse?: boolean;
};

export function drawMuseumPreviewMarker(args: MuseumPreviewMarkerArgs): void {
  const { ctx, x, y, isMajor, alpha, palette, profile, sizeScale = 1, pulse = false } = args;
  const color = isMajor ? palette.majorMarker : palette.minorMarker;
  ctx.save();

  if (pulse && isMajor) {
    ctx.beginPath();
    ctx.arc(x, y, 5.6 * sizeScale, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(${palette.accentRgb},${Math.min(0.28, alpha * 0.7)})`;
    ctx.lineWidth = 0.55;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y, 8.4 * sizeScale, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(${palette.accentRgb},${Math.min(0.12, alpha * 0.32)})`;
    ctx.lineWidth = 0.4;
    ctx.stroke();
  }

  if (profile.previewMarker === "registration") {
    const half = (isMajor ? 1.8 : 1.15) * sizeScale;
    ctx.fillStyle = `rgba(${color},${Math.min(0.92, alpha * 1.9)})`;
    ctx.fillRect(x - half, y - half, half * 2, half * 2);
    if (isMajor) {
      ctx.strokeStyle = `rgba(${palette.accentRgb},${Math.min(0.9, alpha * 2.1)})`;
      ctx.lineWidth = 0.65;
      ctx.beginPath();
      ctx.moveTo(x - 4.5 * sizeScale, y); ctx.lineTo(x + 4.5 * sizeScale, y);
      ctx.moveTo(x, y - 4.5 * sizeScale); ctx.lineTo(x, y + 4.5 * sizeScale);
      ctx.stroke();
    }
  } else if (profile.previewMarker === "signal") {
    ctx.strokeStyle = `rgba(${color},${Math.min(0.95, alpha * 2)})`;
    ctx.lineWidth = isMajor ? 1.2 : 0.75;
    ctx.beginPath();
    ctx.moveTo(x, y - (isMajor ? 4 : 2.5) * sizeScale);
    ctx.lineTo(x, y + (isMajor ? 4 : 2.5) * sizeScale);
    ctx.stroke();
    if (isMajor) {
      ctx.beginPath();
      ctx.arc(x, y, 4.8 * sizeScale, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(${palette.accentRgb},${Math.min(0.42, alpha)})`;
      ctx.lineWidth = 0.55;
      ctx.stroke();
    }
  } else if (profile.previewMarker === "star") {
    const outer = (isMajor ? 2.9 : 1.65) * sizeScale;
    const inner = outer * 0.32;
    ctx.beginPath();
    for (let point = 0; point < 8; point += 1) {
      const angle = -Math.PI / 2 + point * Math.PI / 4;
      const length = point % 2 === 0 ? outer : inner;
      const px = x + Math.cos(angle) * length;
      const py = y + Math.sin(angle) * length;
      if (point === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = `rgba(${color},${Math.min(0.96, alpha * 2.4)})`;
    if (isMajor) {
      ctx.shadowColor = `rgba(${color},0.45)`;
      ctx.shadowBlur = 5;
    }
    ctx.fill();
  } else if (profile.previewMarker === "hierarchy") {
    const markerAlpha = isMajor ? Math.min(0.9, alpha * 2) : Math.min(0.52, alpha * 1.5);
    const markerRadius = (isMajor ? 1.8 : 0.9) * sizeScale;
    if (palette.markerStyle === "square") {
      ctx.fillStyle = `rgba(${color},${markerAlpha})`;
      ctx.fillRect(x - markerRadius, y - markerRadius, markerRadius * 2, markerRadius * 2);
    } else if (palette.markerStyle === "ring") {
      ctx.beginPath();
      ctx.arc(x, y, markerRadius * 1.12, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(${color},${markerAlpha})`;
      ctx.lineWidth = isMajor ? 0.9 : 0.65;
      ctx.stroke();
      if (isMajor) {
        ctx.beginPath();
        ctx.arc(x, y, markerRadius * 0.36, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${color},${Math.min(0.95, markerAlpha * 1.15)})`;
        ctx.fill();
      }
    } else {
      ctx.beginPath();
      ctx.moveTo(x, y - markerRadius * 1.2);
      ctx.lineTo(x + markerRadius, y);
      ctx.lineTo(x, y + markerRadius * 1.2);
      ctx.lineTo(x - markerRadius, y);
      ctx.closePath();
      ctx.fillStyle = `rgba(${color},${markerAlpha})`;
      ctx.fill();
    }
  } else if (profile.previewMarker === "outlined") {
    ctx.beginPath();
    ctx.arc(x, y, (isMajor ? 2.2 : 1.55) * sizeScale, 0, Math.PI * 2);
    if (isMajor) {
      ctx.fillStyle = `rgba(${palette.accentRgb},${Math.min(0.96, alpha * 2.5)})`;
      ctx.fill();
    } else {
      ctx.strokeStyle = `rgba(${palette.minorMarker},${Math.min(0.92, alpha * 2.7)})`;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  } else {
    ctx.beginPath();
    ctx.arc(x, y, (isMajor ? 1.25 : 0.95) * sizeScale, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${color},${alpha})`;
    ctx.fill();
  }

  ctx.restore();
}
