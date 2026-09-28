import React from "react";
import { Globe2 } from "lucide-react";

/* The one mark for "I like this", on every like button in the app. To try
   another glyph, change GLYPH (the outline) and LIKED_PATHS (its lines on the
   liked disc) here - every button follows.
   Now the map tab's globe: an outline when not liked; when liked, filled with
   the like colour and its meridians drawn in the ground colour, so it reads as
   a gold globe rather than a flat disc. */
const GLYPH = Globe2;
const LIKED_LINE = "#0b0b0b";
/* the continents of lucide's Earth (Globe2), without its circle */
const LIKED_PATHS = [
  "M21.54 15H17a2 2 0 0 0-2 2v4.54",
  "M7 3.34V5a3 3 0 0 0 3 3a2 2 0 0 1 2 2c0 1.1.9 2 2 2a2 2 0 0 0 2-2c0-1.1.9-2 2-2h3.17",
  "M11 21.95V18a2 2 0 0 0-2-2a2 2 0 0 1-2-2v-1a2 2 0 0 0-2-2H2.05",
];

export function LikeIcon({
  liked,
  size = 16,
  strokeWidth = 2,
  color = "currentColor",
  emptyColor = "currentColor",
  style,
  className,
}: {
  liked: boolean;
  size?: number;
  strokeWidth?: number;
  /** colour of a liked mark */
  color?: string;
  /** colour of the outline when not liked */
  emptyColor?: string;
  style?: React.CSSProperties;
  className?: string;
}) {
  if (!liked) {
    return <GLYPH size={size} strokeWidth={strokeWidth} color={emptyColor} style={style} className={className} aria-hidden="true" />;
  }
  /* liked: a gold disc with the continents drawn over it in the ground
     colour and no ring round it - the globe's own outline is left out */
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={LIKED_LINE} strokeWidth={strokeWidth}
      strokeLinecap="round" strokeLinejoin="round" style={style} className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="10.6" fill={color} stroke="none" />
      {LIKED_PATHS.map((d) => <path key={d} d={d} />)}
    </svg>
  );
}
