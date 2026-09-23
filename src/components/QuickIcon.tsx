import type { ReactElement } from "react";

/**
 * Marks for the floating quick menu. Geometric and hairline, in the map tab's
 * language, but drawn at 1.4 rather than 1.1 - at 20px the thinner stroke read
 * as smudges rather than shapes.
 *
 * `theme` is a disc with one half filled instead of a sun and a moon: at this
 * size a ringed disc and a crescent are hard to tell apart, while a half-filled
 * circle reads as light/dark on its own. Each mark is paired with a Space Mono
 * label in the menu, so the icon carries recognition and the word carries
 * meaning.
 */
export type QuickIconName = "user" | "theme" | "logout" | "cart";

const PATHS: Record<QuickIconName, ReactElement> = {
  // a head over the arc of a shoulder line
  user: (
    <>
      <circle cx="10" cy="7.6" r="3.2" />
      <path d="M3.8 16.9a6.2 6.2 0 0 1 12.4 0" />
    </>
  ),
  // a disc with one half inked: the light/dark division itself
  theme: (
    <>
      <circle cx="10" cy="10" r="6.6" />
      <path d="M10 3.4a6.6 6.6 0 0 1 0 13.2z" fill="currentColor" stroke="none" />
    </>
  ),
  // a door left open, and the arrow going through it
  logout: (
    <>
      <path d="M8.6 3.4H4.9a1.5 1.5 0 0 0-1.5 1.5v10.2a1.5 1.5 0 0 0 1.5 1.5h3.7" />
      <path d="M13 6.7 16.4 10 13 13.3" />
      <path d="M16.4 10H7.5" />
    </>
  ),
  cart: (
    <>
      <path d="M2.7 3.7h2.1l2 8.7h8l1.5-6.1H5.5" />
      <circle cx="7.7" cy="15.5" r="1.2" />
      <circle cx="14.1" cy="15.5" r="1.2" />
    </>
  ),
};

export default function QuickIcon({ name, size = 20 }: { name: QuickIconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  );
}
