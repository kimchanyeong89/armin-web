import { useState, type KeyboardEvent, type MouseEvent, type PointerEvent } from "react";

/*
 * A rating is drawn with the map's own mark, a point. Empty, it is a hairline
 * ring; rated, it fills with gold (a half point fills half of one); the point
 * under the pointer takes the halo a globe marker gets when it is picked. Five
 * points score an exhibition or a curation.
 */

export const GOLD = "#D4A547";

const gapFor = (size: number) => Math.max(2, Math.round(size * 0.3));

/** Room kept around the rater so a host's overflow does not cut the halo. */
const HALO_ROOM = 3;

/** Width of five points in a row, so a host can tell whether they fit. */
export const dotRowWidth = (size: number) => size * 5 + gapFor(size) * 4;

/** `count` points filled in gold up to `value`; a fraction fills part of one. Display only. */
export function RatingDots({
  value,
  size,
  color = "currentColor",
  count = 5,
  halo = -1,
}: {
  value: number;
  /** Diameter of one point in px. */
  size: number;
  /** Colour an empty point's ring is drawn from. */
  color?: string;
  count?: number;
  /** Index of the point wearing the halo, or -1. */
  halo?: number;
}) {
  const ring = size >= 18 ? 1.5 : 1;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: gapFor(size), flexShrink: 0, lineHeight: 0 }}>
      {Array.from({ length: count }, (_, i) => {
        const fill = Math.max(0, Math.min(1, value - i));
        return (
          <span
            key={i}
            style={{
              position: "relative",
              width: size,
              height: size,
              flexShrink: 0,
              boxSizing: "border-box",
              borderRadius: "50%",
              overflow: "hidden",
              border: `${ring}px solid ${fill > 0 ? GOLD : `color-mix(in srgb, ${color} 42%, transparent)`}`,
              // A box-shadow is not clipped by the point's own overflow, so the halo can sit outside it.
              boxShadow: i === halo ? `0 0 0 ${Math.max(3, Math.round(size * 0.22))}px rgba(212,165,71,0.2)` : "none",
              transition: "box-shadow .24s cubic-bezier(.16,1,.3,1), border-color .15s ease",
            }}
          >
            {fill > 0 && (
              <span style={{ position: "absolute", top: 0, bottom: 0, left: 0, width: `${fill * 100}%`, background: GOLD }} />
            )}
          </span>
        );
      })}
    </span>
  );
}

const ARROW_STEP: Record<string, number> = { ArrowRight: 0.5, ArrowUp: 0.5, ArrowLeft: -0.5, ArrowDown: -0.5 };

/**
 * Five points to rate with. Moving over them previews a score - the left half
 * of a point is the half point - and a click or a tap hands it to `onRate` at
 * once. From the keyboard, arrows preview and Enter rates.
 *
 * A span, not a button: hosts place it inside clickable cards, and it stops its
 * clicks so the card underneath does not open.
 */
export function DotRater({
  value,
  onRate,
  size,
  color,
  label,
  valueText,
  onPreview,
}: {
  /** The score to show when nothing is being previewed; 0 for none. */
  value: number;
  onRate: (score: number) => void;
  size: number;
  color?: string;
  label: string;
  valueText: (score: number) => string;
  onPreview?: (score: number | null) => void;
}) {
  const [preview, setPreviewState] = useState<number | null>(null);
  const setPreview = (score: number | null) => {
    setPreviewState(score);
    onPreview?.(score);
  };
  const shown = preview ?? value;

  const scoreAt = (event: MouseEvent<HTMLSpanElement> | PointerEvent<HTMLSpanElement>) => {
    const pitch = size + gapFor(size);
    const x = event.clientX - event.currentTarget.getBoundingClientRect().left - HALO_ROOM;
    const index = Math.max(0, Math.min(4, Math.floor(x / pitch)));
    return index + (x - index * pitch < size / 2 ? 0.5 : 1);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLSpanElement>) => {
    const step = ARROW_STEP[event.key];
    if (step !== undefined) {
      setPreview(Math.max(0.5, Math.min(5, (preview ?? value) + step)));
    } else if (event.key === "Enter" || event.key === " ") {
      if (preview !== null) onRate(preview);
      setPreview(null);
    } else {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
  };

  return (
    <span
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={0.5}
      aria-valuemax={5}
      aria-valuenow={shown || undefined}
      aria-valuetext={shown ? valueText(shown) : undefined}
      onPointerMove={(event) => {
        // A finger has no hover; its tap goes straight to the click below.
        if (event.pointerType !== "touch") setPreview(scoreAt(event));
      }}
      onPointerLeave={() => setPreview(null)}
      onBlur={() => setPreview(null)}
      onClick={(event) => {
        event.stopPropagation();
        event.preventDefault();
        onRate(scoreAt(event));
      }}
      onKeyDown={onKeyDown}
      style={{
        display: "inline-flex",
        flexShrink: 0,
        cursor: "pointer",
        touchAction: "manipulation",
        borderRadius: 999,
        padding: HALO_ROOM,
        margin: -HALO_ROOM,
      }}
    >
      <RatingDots value={shown} size={size} color={color} halo={preview === null ? -1 : Math.ceil(preview) - 1} />
    </span>
  );
}
