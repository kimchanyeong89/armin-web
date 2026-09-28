import { useSyncExternalStore } from "react";

/* How far the wall is pulled out, in px - the one value the handle (at the
   top on a desktop, on the tab bar on a phone) and the drawer share. 0 is
   closed; the drawer is as tall as it was pulled. */

let height = 0;
const listeners = new Set<() => void>();

export const WALL_MIN = 220;

export function setWallHeight(next: number) {
  const max = Math.round(window.innerHeight * 0.88);
  /* a short pull that doesn't reach a usable wall closes it again */
  height = next < WALL_MIN * 0.6 ? 0 : Math.min(max, Math.max(WALL_MIN, Math.round(next)));
  listeners.forEach((fn) => fn());
}

/* while the finger or mouse is still moving, follow it exactly */
export function followWallHeight(next: number) {
  height = Math.max(0, Math.min(Math.round(window.innerHeight * 0.88), Math.round(next)));
  listeners.forEach((fn) => fn());
}

export function getWallHeight() {
  return height;
}

export function useWallHeight() {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => height,
  );
}
