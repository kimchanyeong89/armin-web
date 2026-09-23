// Glass finish tweaks for the interactive globe — the user kept "halo-frost"
// from round 1, so every other variant is a fresh take on that soft, frosted
// language (no hard diagonal sheens, no hard rings), each through a different
// design skill's lens. Preview locally with /interactive?glass=<id>; without
// the param nothing changes.

export const GLOBE_GLASS_TWEAK_IDS = [
  "halo-frost",
  "aurora-veil",
  "soft-bezel",
  "moon-wash",
  "depth-fog",
  "candle-frost",
] as const;

export type GlobeGlassTweakId = (typeof GLOBE_GLASS_TWEAK_IDS)[number];

export type GlobeGlassTweak = {
  id: GlobeGlassTweakId;
  name: string;
  nameKo: string;
  skill: string;
  url: string;
};

const TWEAK_META: ReadonlyArray<Omit<GlobeGlassTweak, "url">> = [
  { id: "halo-frost", name: "Halo Frost", nameKo: "헤일로 프로스트", skill: "ui-ux-pro-max" },
  { id: "aurora-veil", name: "Aurora Veil", nameKo: "오로라 베일", skill: "frontend-design" },
  { id: "soft-bezel", name: "Soft Bezel", nameKo: "소프트 베젤", skill: "design-system-builder" },
  { id: "moon-wash", name: "Moon Wash", nameKo: "문 워시", skill: "canvas-design" },
  { id: "depth-fog", name: "Depth Fog", nameKo: "뎁스 포그", skill: "web-design-guidelines" },
  { id: "candle-frost", name: "Candle Frost", nameKo: "캔들 프로스트", skill: "theme-factory" },
];

export const GLOBE_GLASS_TWEAKS: readonly GlobeGlassTweak[] = TWEAK_META.map((tweak) => ({
  ...tweak,
  url: `/interactive?glass=${tweak.id}`,
}));

const GLOBE_GLASS_TWEAK_ID_SET = new Set<string>(GLOBE_GLASS_TWEAK_IDS);

export function resolveGlobeGlassTweak(
  value: string | null | undefined,
): GlobeGlassTweakId | undefined {
  return value && GLOBE_GLASS_TWEAK_ID_SET.has(value)
    ? value as GlobeGlassTweakId
    : undefined;
}

// ─── Render profiles ───────────────────────────────────────
// All offsets/radii are fractions of the projected sphere radius so every
// variant scales with viewport and zoom. Arc angles are canvas radians
// (0 = right, -PI/2 = top). Arcs hug the inside of the limb; `width` is in
// px for hairlines, `widthR` (fraction of R) for soft crescent bands.

type GlassArc = {
  from: number;
  to: number;
  color: string;
  width?: number;
  widthR?: number;
  blur?: number;
};

export type GlobeGlassProfile = {
  /** Vertical smoked-glass body tint, stops at 0 / 0.5 / 1. */
  tint?: { top: string; mid: string; bottom: string };
  /** Soft radial glows — offset (dx,dy) and radius as fractions of R. */
  glows?: ReadonlyArray<{ dx: number; dy: number; r: number; color: string }>;
  /** Spherical form shadow radiating away from the light point. */
  shade?: { dx: number; dy: number; inner: number; outer: number; color: string };
  /** Inner limb arcs — hairline borders or wide frosted crescents. */
  rims?: readonly GlassArc[];
  /** Atmospheric haze rising from the bottom limb. */
  fog?: { reach: number; color: string };
  /** Ambient glow just outside the silhouette. */
  halo?: { spread: number; color: string };
  /** Soft contact shadow under the sphere. */
  contactShadow?: { dy: number; rx: number; ry: number; color: string };
};

const GLASS_PROFILES: Record<GlobeGlassTweakId, GlobeGlassProfile> = {
  // ui-ux-pro-max — the keeper from round 1: frosted veil, 1px light border,
  // ambient white halo, gentle depth; contrast-safe alphas.
  "halo-frost": {
    tint: { top: "rgba(255,255,255,0.022)", mid: "rgba(255,255,255,0.011)", bottom: "rgba(255,255,255,0.005)" },
    glows: [{ dx: 0, dy: -0.55, r: 0.8, color: "rgba(255,255,255,0.055)" }],
    shade: { dx: 0, dy: -0.55, inner: 0.55, outer: 1.6, color: "rgba(0,0,0,0.22)" },
    rims: [{ from: -Math.PI, to: 0, width: 1, color: "rgba(255,255,255,0.14)" }],
    halo: { spread: 1.12, color: "rgba(255,255,255,0.055)" },
    contactShadow: { dy: 0.08, rx: 0.8, ry: 0.14, color: "rgba(0,0,0,0.32)" },
  },
  // frontend-design — duotone atmosphere: cool moonlight breathing on one
  // limb, warm champagne on the other, under a cool ambient halo.
  "aurora-veil": {
    tint: { top: "rgba(255,255,255,0.02)", mid: "rgba(255,255,255,0.01)", bottom: "rgba(255,255,255,0)" },
    glows: [
      { dx: -0.45, dy: -0.4, r: 0.75, color: "rgba(160,200,255,0.11)" },
      { dx: 0.45, dy: 0.35, r: 0.7, color: "rgba(255,205,150,0.09)" },
    ],
    shade: { dx: 0, dy: -0.3, inner: 0.6, outer: 1.7, color: "rgba(0,0,0,0.18)" },
    halo: { spread: 1.16, color: "rgba(170,200,255,0.09)" },
    contactShadow: { dy: 0.08, rx: 0.8, ry: 0.14, color: "rgba(0,0,0,0.28)" },
  },
  // design-system-builder — the --bpn nav tokens as a soft neumorphic emboss:
  // blurred inset top highlight, blurred inset bottom shadow, smoked body.
  "soft-bezel": {
    tint: { top: "rgba(20,20,18,0.1)", mid: "rgba(20,20,18,0.16)", bottom: "rgba(20,20,18,0.24)" },
    rims: [
      { from: -2.8, to: -0.35, widthR: 0.05, color: "rgba(255,255,255,0.16)" },
      { from: 0.35, to: 2.8, widthR: 0.07, color: "rgba(0,0,0,0.3)" },
    ],
    halo: { spread: 1.1, color: "rgba(255,255,255,0.07)" },
    contactShadow: { dy: 0.1, rx: 0.85, ry: 0.16, color: "rgba(0,0,0,0.38)" },
  },
  // canvas-design — a lunar study instead of hard chiaroscuro: one broad
  // moonlight wash, faint earthshine along the dark lower limb.
  "moon-wash": {
    glows: [{ dx: -0.15, dy: -0.6, r: 1, color: "rgba(235,240,250,0.12)" }],
    shade: { dx: -0.15, dy: -0.6, inner: 0.5, outer: 1.8, color: "rgba(5,8,16,0.3)" },
    rims: [{ from: 0.4, to: 2.7, widthR: 0.09, color: "rgba(190,205,230,0.1)" }],
    halo: { spread: 1.18, color: "rgba(200,215,240,0.08)" },
    contactShadow: { dy: 0.08, rx: 0.78, ry: 0.13, color: "rgba(0,0,0,0.3)" },
  },
  // web-design-guidelines — depth from atmosphere, not shading: a horizon
  // haze rising off the lower limb, whisper-quiet everywhere else.
  "depth-fog": {
    glows: [{ dx: 0, dy: -0.55, r: 0.9, color: "rgba(255,255,255,0.05)" }],
    shade: { dx: 0, dy: -0.5, inner: 0.6, outer: 1.8, color: "rgba(0,0,0,0.14)" },
    fog: { reach: 1.1, color: "rgba(150,170,200,0.11)" },
    halo: { spread: 1.1, color: "rgba(255,255,255,0.06)" },
  },
  // theme-factory — halo-frost's warm sibling: candlelit veil, champagne
  // halo, one soft gold breath along the top limb.
  "candle-frost": {
    tint: { top: "rgba(255,235,200,0.035)", mid: "rgba(255,235,200,0.012)", bottom: "rgba(20,14,6,0.18)" },
    glows: [{ dx: 0, dy: -0.5, r: 0.8, color: "rgba(255,240,215,0.1)" }],
    shade: { dx: 0, dy: -0.5, inner: 0.55, outer: 1.6, color: "rgba(12,8,2,0.22)" },
    rims: [{ from: -2.7, to: -0.5, widthR: 0.035, color: "rgba(235,195,120,0.18)" }],
    halo: { spread: 1.15, color: "rgba(240,205,140,0.12)" },
    contactShadow: { dy: 0.08, rx: 0.8, ry: 0.14, color: "rgba(0,0,0,0.32)" },
  },
};

export function resolveGlobeGlassProfile(
  tweak: GlobeGlassTweakId | undefined,
): GlobeGlassProfile | null {
  return tweak ? GLASS_PROFILES[tweak] : null;
}

// ─── Canvas rendering ──────────────────────────────────────

export type GlobeGlassRenderArgs = {
  ctx: CanvasRenderingContext2D;
  center: readonly [number, number];
  radius: number;
  currentScale: number;
};

/** The glass reads as an object at overview zoom; fade it out while drilling
 *  in so glow/shadow never smear across a country-level close-up. */
export function glassZoomFade(currentScale: number): number {
  return Math.min(1, Math.max(0, 1 - (currentScale - 1.9) / 0.9));
}

function clipInsideDisc(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
}

function clipOutsideDisc(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  const pad = r * 4;
  ctx.beginPath();
  ctx.rect(cx - pad, cy - pad, pad * 2, pad * 2);
  ctx.arc(cx, cy, r, 0, Math.PI * 2, true);
  ctx.clip();
}

/** Halo + contact shadow, painted before the sphere surface. Clipped to the
 *  outside of the disc because the production ocean fill is near-transparent
 *  and anything underneath would bleed through the globe face. */
export function drawGlassUnderlay(args: GlobeGlassRenderArgs, profile: GlobeGlassProfile): void {
  const { ctx, center, radius } = args;
  const fade = glassZoomFade(args.currentScale);
  if (fade <= 0 || (!profile.halo && !profile.contactShadow)) return;
  const [cx, cy] = center;

  ctx.save();
  ctx.globalAlpha = fade;
  clipOutsideDisc(ctx, cx, cy, radius);

  if (profile.contactShadow) {
    const s = profile.contactShadow;
    const sy = cy + radius * (1 + s.dy);
    const gradient = ctx.createRadialGradient(cx, sy, 0, cx, sy, radius * s.rx);
    gradient.addColorStop(0, s.color);
    gradient.addColorStop(1, "rgba(0,0,0,0)");
    ctx.save();
    ctx.translate(cx, sy);
    ctx.scale(1, s.ry / s.rx);
    ctx.translate(-cx, -sy);
    ctx.fillStyle = gradient;
    ctx.fillRect(cx - radius * s.rx, sy - radius * s.rx, radius * s.rx * 2, radius * s.rx * 2);
    ctx.restore();
  }

  if (profile.halo) {
    const gradient = ctx.createRadialGradient(cx, cy, radius * 0.98, cx, cy, radius * profile.halo.spread);
    gradient.addColorStop(0, profile.halo.color);
    gradient.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = gradient;
    const spread = radius * profile.halo.spread;
    ctx.fillRect(cx - spread, cy - spread, spread * 2, spread * 2);
  }

  ctx.restore();
}

/** Body tint, glows, form shadow, fog and limb arcs over the drawn globe
 *  (labels/markers are painted later, so they stay readable on top). */
export function drawGlassOverlay(args: GlobeGlassRenderArgs, profile: GlobeGlassProfile): void {
  const { ctx, center, radius } = args;
  const fade = glassZoomFade(args.currentScale);
  if (fade <= 0) return;
  const [cx, cy] = center;

  ctx.save();
  ctx.globalAlpha = fade;
  clipInsideDisc(ctx, cx, cy, radius);

  if (profile.tint) {
    const gradient = ctx.createLinearGradient(cx, cy - radius, cx, cy + radius);
    gradient.addColorStop(0, profile.tint.top);
    gradient.addColorStop(0.5, profile.tint.mid);
    gradient.addColorStop(1, profile.tint.bottom);
    ctx.fillStyle = gradient;
    ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
  }

  if (profile.shade) {
    const s = profile.shade;
    const lx = cx + s.dx * radius;
    const ly = cy + s.dy * radius;
    const gradient = ctx.createRadialGradient(lx, ly, radius * s.inner, lx, ly, radius * s.outer);
    gradient.addColorStop(0, "rgba(0,0,0,0)");
    gradient.addColorStop(1, s.color);
    ctx.fillStyle = gradient;
    ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
  }

  if (profile.fog) {
    const fy = cy + radius;
    const reach = radius * profile.fog.reach;
    const gradient = ctx.createRadialGradient(cx, fy, 0, cx, fy, reach);
    gradient.addColorStop(0, profile.fog.color);
    gradient.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
  }

  if (profile.glows) {
    for (const glow of profile.glows) {
      const lx = cx + glow.dx * radius;
      const ly = cy + glow.dy * radius;
      const gradient = ctx.createRadialGradient(lx, ly, 0, lx, ly, radius * glow.r);
      gradient.addColorStop(0, glow.color);
      gradient.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = gradient;
      ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
    }
  }

  if (profile.rims) {
    for (const rim of profile.rims) {
      const lineWidth = rim.widthR ? rim.widthR * radius : (rim.width ?? 1);
      const blur = rim.blur ?? (rim.widthR ? lineWidth : 0);
      ctx.save();
      ctx.strokeStyle = rim.color;
      ctx.lineWidth = lineWidth;
      ctx.lineCap = "round";
      if (blur > 0) {
        ctx.shadowColor = rim.color;
        ctx.shadowBlur = blur;
      }
      ctx.beginPath();
      ctx.arc(cx, cy, radius - lineWidth / 2, rim.from, rim.to);
      ctx.stroke();
      ctx.restore();
    }
  }

  ctx.restore();
}
