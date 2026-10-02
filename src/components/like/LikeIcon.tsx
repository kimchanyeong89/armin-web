import React from "react";
import { SaveIcon } from "./SaveIcon";

/* The one mark for "I like this", on every like button in the app. Since
   2026-10-02 it is the COLLY lotus, the same drawing as SaveIcon - the shape
   lives there, so changing it changes likes and saves together. Not liked: the
   outline in emptyColor. Liked: the petals filled in color.
   (Before: a heart, then the map tab's globe on 9/28.) */

/* the lotus is drawn with finer lines than lucide's icons; the heavier strokes
   callers chose for the globe would clog its petals at button size */
const MAX_STROKE = 1.9;

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
  return (
    <SaveIcon
      saved={liked}
      size={size}
      strokeWidth={Math.min(strokeWidth, MAX_STROKE)}
      color={liked ? color : emptyColor}
      /* drawn larger in the same place: the button and its circle keep their size, the lotus fills
         more of it (10/2 "too small to read") - a transform takes no room, so nothing around it moves */
      style={{ transform: "scale(1.35)", ...style }}
      className={className}
      /* cropped to the lotus itself: it fills more of its button's circle (10/2, "a little larger") */
      viewBox="1.5 2 21 21"
    />
  );
}
