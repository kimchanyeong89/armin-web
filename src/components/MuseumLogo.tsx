import type { CSSProperties } from "react";
import museumLogos from "../data/museumLogos.json";
import { exhibitions as museumRecords } from "../data/exhibitions.js";

// A museum's identity mark.
// Official logos are one-colour ink masks (public/images/museum-logos/<id>.png, listed in
// src/data/museumLogos.json) painted in the theme's text colour. In the detail modal hero, museums
// without an official logo get a COLLY text logo: the museum's own name in the Marcellus wordmark
// face with a gold rule.

type LogoEntry = { src: string; w: number; h: number };

const LOGOS = museumLogos as Record<string, LogoEntry>;
const GOLD = "#D4A547";
// Largest CSS px per mask px. Some museums only publish small raster logos; at 0.5 a retina screen
// shows the mask about 1:1 and the edges stay sharp (vector masks are 1600px, so this rarely binds).
const MAX_SCALE = 0.5;

export function getMuseumLogo(museumId: string): LogoEntry | null {
  return LOGOS[museumId] ?? null;
}

// Root-absolute like the app's other /images paths: publicUrl() resolves against the current route
// (/interactive/<country>/<city>/…) in dev and would miss the file.
function inkStyle(logo: LogoEntry, color: string): CSSProperties {
  const mask = `url("${logo.src}")`;
  return {
    backgroundColor: color,
    WebkitMaskImage: mask,
    maskImage: mask,
    WebkitMaskSize: "contain",
    maskSize: "contain",
    WebkitMaskRepeat: "no-repeat",
    maskRepeat: "no-repeat",
    WebkitMaskPosition: "center",
    maskPosition: "center",
  };
}

// The modal gets a localized copy whose `name` may already be Korean; a logo keeps the museum's own name.
function officialName(museumId: string, fallback: string): string {
  const record = (museumRecords as Array<{ id: string; name?: string }>).find((m) => m.id === museumId);
  return record?.name || fallback;
}

// Small official mark beside a museum name that is already on screen (venue panel header, venue list
// rows): decorative, and nothing at all for museums without an official logo.
export function MuseumLogoMark({
  museumId,
  color,
  maxWidth,
  maxHeight,
  area,
  style,
}: {
  museumId: string;
  color: string;
  maxWidth: number;
  maxHeight: number;
  // Optional target area in CSS px², so wide wordmarks and square emblems read at a similar size.
  area?: number;
  style?: CSSProperties;
}) {
  const logo = getMuseumLogo(museumId);
  if (!logo) return null;
  const byArea = area ? Math.sqrt(area / (logo.w * logo.h)) : Infinity;
  const scale = Math.min(maxWidth / logo.w, maxHeight / logo.h, byArea, MAX_SCALE);
  return (
    <div
      aria-hidden="true"
      style={{ flexShrink: 0, width: Math.round(logo.w * scale), height: Math.round(logo.h * scale), ...inkStyle(logo, color), ...style }}
    />
  );
}

export default function MuseumLogo({
  museumId,
  fallbackName,
  color,
  compact,
}: {
  museumId: string;
  fallbackName: string;
  color: string;
  compact: boolean;
}) {
  const logo = getMuseumLogo(museumId);
  const name = officialName(museumId, fallbackName);

  if (logo) {
    // Same optical area for every mark, so a long wordmark and a square emblem carry equal weight.
    const side = compact ? 40 : 26; // vmin
    return (
      <div
        role="img"
        aria-label={name}
        style={{
          width: `min(${(side * Math.sqrt(logo.w / logo.h)).toFixed(2)}vmin, ${Math.round(logo.w * MAX_SCALE)}px, 100%)`,
          aspectRatio: `${logo.w} / ${logo.h}`,
          maxHeight: "100%",
          ...inkStyle(logo, color),
        }}
      />
    );
  }

  // Balance the name over one to three lines and size the type to the longest line.
  const perLine = name.length <= 14 ? name.length : Math.ceil(name.length / (name.length <= 32 ? 2 : 3));
  const fontSize = `min(${((compact ? 96 : 56) / Math.max(perLine, 6)).toFixed(2)}vw, ${compact ? 34 : 46}px)`;
  return (
    <div role="img" aria-label={name} style={{ maxWidth: "100%", color, textAlign: "center" }}>
      <div
        style={{
          fontFamily: "'Marcellus', 'Times New Roman', serif",
          fontSize,
          lineHeight: 1.12,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          textWrap: "balance",
          wordBreak: "keep-all",
        } as CSSProperties}
      >
        {name}
      </div>
      <div aria-hidden="true" style={{ width: 28, height: 1, margin: "0.9em auto 0", background: GOLD }} />
    </div>
  );
}
