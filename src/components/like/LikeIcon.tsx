import React from "react";
import { Globe2 } from "lucide-react";

/* The one mark for "I like this", on every like button in the app. To try
   another glyph, change GLYPH here - every button follows.
   Now the map tab's globe: an outline when not liked; when liked, filled with
   the like colour and its meridians drawn in the ground colour, so it reads as
   a gold globe rather than a flat disc. */
const GLYPH = Globe2;
const LIKED_LINE = "#0b0b0b";

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
  /* the glyph's own circle is drawn over its continents, so filling it would
     leave a flat disc; the fill goes on a disc underneath instead */
  return (
    <span className={className} style={{ display: "inline-grid", flex: "none", width: size, height: size, ...style }} aria-hidden="true">
      <svg width={size} height={size} viewBox="0 0 24 24" style={{ gridArea: "1 / 1" }}>
        <circle cx="12" cy="12" r="10" fill={color} />
      </svg>
      <GLYPH size={size} strokeWidth={strokeWidth} color={LIKED_LINE} style={{ gridArea: "1 / 1" }} />
    </span>
  );
}
