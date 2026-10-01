import React from "react";

/* The one mark for "keep this" (save to a playlist, follow an artist), drawn
   from the COLLY lotus: five petals opening from one point over a base line,
   the mark's own shape at icon size. Not kept: an outline. Kept: the petals
   filled. Like LikeIcon, every save button uses it, so changing the shape
   here changes it everywhere. */
const PETALS = [-58, -29, 0, 29, 58];

export function SaveIcon({
  saved = false,
  size = 16,
  strokeWidth = 1.8,
  color = "currentColor",
  style,
  className,
}: {
  saved?: boolean;
  size?: number;
  strokeWidth?: number;
  color?: string;
  style?: React.CSSProperties;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
      className={className}
      aria-hidden="true"
    >
      {PETALS.map((angle) => (
        <ellipse
          key={angle}
          cx="12"
          cy="10.2"
          rx="2.3"
          ry="5.1"
          transform={`rotate(${angle} 12 15.6)`}
          fill={saved ? color : "none"}
          fillOpacity={saved ? (angle === 0 ? 1 : 0.85) : undefined}
        />
      ))}
      <path d="M5.2 19.6 C9 19.1 15 19.1 18.8 19.6" />
    </svg>
  );
}
