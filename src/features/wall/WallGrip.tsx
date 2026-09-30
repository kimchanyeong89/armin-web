import React, { useRef, useState } from "react";
import { followWallHeight, getWallHeight, setWallHeight, useWallHeight } from "./wallPull";

/* The handle the wall is pulled up by. Closed, it rises out of the tab bar's
   top edge as one piece with it; open, it stands on the wall's top edge, so
   the same handle pulls the wall further, lowers it or closes it. The wall
   comes out exactly as far as it is pulled; a tap opens it halfway, or closes it.
   Its outline is one curve - flaring into its base on both sides - drawn as
   the clip of its glass and again as a hairline, with no line along the foot. */
const SHAPE = "M0,24 C8,24 13.6,19.2 13.6,12 C13.6,4.8 18.4,0 25.6,0 L86.4,0 C93.6,0 98.4,4.8 98.4,12 C98.4,19.2 104,24 112,24";

export default function WallGrip({ ko, place = "bar" }: { ko: boolean; place?: "bar" | "sheet" }) {
  const drag = useRef<{ y: number; from: number; moved: boolean } | null>(null);
  const open = useWallHeight() > 0;
  const [dragging, setDragging] = useState(false);
  /* one handle at a time: on the bar while closed, on the wall while open. The
     one being dragged stays in place, unseen, until it is let go - taking it
     away mid-pull would drop the pull. */
  const away = (place === "bar") === open;
  if (away && !dragging) return null;

  const onPointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { y: event.clientY, from: getWallHeight(), moved: false };
    setDragging(true);
  };
  const onPointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d) return;
    const dy = event.clientY - d.y;
    if (Math.abs(dy) > 4) d.moved = true;
    if (d.moved) followWallHeight(d.from - dy);
  };
  const onPointerUp = () => {
    const d = drag.current;
    drag.current = null;
    setDragging(false);
    if (!d) return;
    if (d.moved) setWallHeight(getWallHeight());
    else setWallHeight(getWallHeight() > 0 ? 0 : window.innerHeight * 0.55);
  };

  return (
    <button
      type="button"
      className={`wall-grip wall-grip--${place}${away ? " is-away" : ""}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      aria-label={ko ? "벽 꾸미기 - 끌어서 열기" : "My wall - pull to open"}
      title={ko ? "끌어서 벽 꾸미기" : "Pull out your wall"}
    >
      <svg className="wall-grip__edge" viewBox="0 0 112 25" preserveAspectRatio="none" aria-hidden="true">
        <path d={SHAPE} />
      </svg>
      <i aria-hidden="true" />
      <span>{open ? (ko ? "내리기" : "LOWER") : ko ? "벽 꾸미기" : "MY WALL"}</span>
    </button>
  );
}
