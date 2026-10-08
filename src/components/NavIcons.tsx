import type { ReactNode } from "react";

/* The tab bar's own pictograms (chosen 10/8 from six proposals: "e 먹선이 제일 좋다"), in place of the
   stock icon set every AI site wears. 먹선: open strokes that stop short of closing, as if drawn by
   hand in one breath - a globe, two people, a swirl for the AI's reading of taste, a figure, a lens. */
export type NavIconId = "map" | "community" | "ai" | "profile" | "search";

const MARKS: Record<NavIconId, ReactNode> = {
  map: <><path d="M19.4 8A8.4 8.4 0 1 0 20.4 12.6" /><path d="M12.4 3.8C9 7.6 9 16.2 12 20.2" /><path d="M4.4 10.2C8.6 12.6 14.6 12.8 19.6 11.2" /></>,
  community: <><path d="M10.4 6.6A2.8 2.8 0 1 0 10.8 9.4" /><path d="M18.2 7.4A2.5 2.5 0 1 0 18.4 10" /><path d="M3.4 19C4.6 14.8 9.6 14.2 12 17C14 14.6 19 14.8 20.6 18.6" /></>,
  ai: <path d="M12.3 12.4a1.5 1.5 0 1 0-2.6-1.3a4 4 0 1 0 6.5-2.7a6.8 6.8 0 1 0 2.6 6.8" />,
  profile: <><path d="M14.8 5.4A3.8 3.8 0 1 0 15.6 9.2" /><path d="M4.8 19.8C5.8 15.6 8.8 14.2 12 14.2C15.8 14.2 18.6 16 19.4 19.4" /></>,
  search: <><path d="M16.8 7.6A6.6 6.6 0 1 0 15.2 15.4" /><path d="M15.6 15.8L20.2 20.4" /></>,
};

export function NavIcon({ id, size = 22, active = false, className }: { id: NavIconId; size?: number; active?: boolean; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.1 : 1.7}
      strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      {MARKS[id]}
    </svg>
  );
}
