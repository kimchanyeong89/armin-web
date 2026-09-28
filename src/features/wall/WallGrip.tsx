import React, { useRef } from "react";
import { followWallHeight, getWallHeight, setWallHeight } from "./wallPull";

/* The handle the wall is pulled out by. On a desktop it hangs from the top of
   the screen and pulls the wall down; on a phone it sits on the tab bar and
   pulls the wall up. The wall comes out exactly as far as it is pulled; a tap
   opens it halfway, or closes it. */
export default function WallGrip({ edge, ko, className }: { edge: "top" | "bottom"; ko: boolean; className?: string }) {
  const drag = useRef<{ y: number; from: number; moved: boolean } | null>(null);

  const onPointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { y: event.clientY, from: getWallHeight(), moved: false };
  };
  const onPointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d) return;
    const dy = event.clientY - d.y;
    if (Math.abs(dy) > 4) d.moved = true;
    if (d.moved) followWallHeight(d.from + (edge === "top" ? dy : -dy));
  };
  const onPointerUp = () => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (d.moved) setWallHeight(getWallHeight());
    else setWallHeight(getWallHeight() > 0 ? 0 : window.innerHeight * 0.55);
  };

  return (
    <button
      type="button"
      className={`wall-grip wall-grip--${edge}${className ? ` ${className}` : ""}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      aria-label={ko ? "벽 꾸미기 - 끌어서 열기" : "My wall - pull to open"}
      title={ko ? "끌어서 벽 꾸미기" : "Pull out your wall"}
    >
      <i aria-hidden="true" />
      <span>{ko ? "벽" : "WALL"}</span>
    </button>
  );
}
