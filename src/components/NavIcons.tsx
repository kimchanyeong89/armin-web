import type { ReactNode } from "react";

/* Proposals for the tab bar's own pictograms (10/8: "이모지를 가져다 쓰지 말고… 우리 디자인스킴에
   맞게 시안"). Six sets, tried on the real bar with ?navicons=a…f (the choice is kept for the
   visit); without it the bar keeps its current icons. Once one is chosen, it becomes the bar's
   only set and the other two and this switch go.

   a  받침대 — each object stands on the short curved line the COLLY lotus stands on
   b  액자   — each mark sits in the cut-corner frame used across the app
   c  한 획  — the plainest: one continuous weight, no frame, drawn from circles and arcs
   d  채움   — solid shapes with a cut-out, the heaviest and clearest at a glance
   e  먹선   — open strokes that stop short of closing, as if drawn by hand in one breath
   f  점     — hairline geometry with one filled dot in each (a place, a person, a find) */
const ALL = ["a", "b", "c", "d", "e", "f"] as const;
export type NavIconSet = (typeof ALL)[number];
const isSet = (v: string | null): v is NavIconSet => (ALL as readonly string[]).includes(v || "");
/* how each set is drawn: line weight (resting / chosen tab), and whether shapes are filled */
const STYLE: Record<NavIconSet, { w: [number, number]; solid?: boolean }> = {
  a: { w: [1.45, 1.85] }, b: { w: [1.35, 1.7] }, c: { w: [1.5, 1.9] }, d: { w: [0, 0], solid: true }, e: { w: [1.7, 2.1] }, f: { w: [1.15, 1.5] },
};
export type NavIconId = "map" | "community" | "ai" | "profile" | "search";

const KEY = "colly:navicons";
export function readNavIconSet(): NavIconSet | null {
  if (typeof window === "undefined") return null;
  try {
    const asked = new URLSearchParams(window.location.search).get("navicons");
    if (isSet(asked)) { sessionStorage.setItem(KEY, asked); return asked; }
    if (asked === "off") { sessionStorage.removeItem(KEY); return null; }
    const kept = sessionStorage.getItem(KEY);
    return isSet(kept) ? kept : null;
  } catch { return null; }
}

/* the lotus's base line (SaveIcon), shared by set a */
const PLINTH = <path d="M5.2 20.6 C9 20.1 15 20.1 18.8 20.6" />;
/* the cut-corner frame, shared by set b */
const FRAME = <path d="M7 2.8 H17 L21.2 7 V17 L17 21.2 H7 L2.8 17 V7 Z" />;

const SETS: Record<NavIconSet, Record<NavIconId, ReactNode>> = {
  a: {
    map: <><circle cx="12" cy="10.2" r="6.6" /><ellipse cx="12" cy="10.2" rx="2.7" ry="6.6" /><path d="M5.4 10.2 H18.6" />{PLINTH}</>,
    community: <><path d="M4.6 17 V10.6 a3.6 3.6 0 0 1 7.2 0 V17" /><path d="M12.2 17 V8.4 a3.6 3.6 0 0 1 7.2 0 V17" />{PLINTH}</>,
    ai: <><ellipse cx="12" cy="10.2" rx="2.3" ry="6.6" /><ellipse cx="12" cy="10.2" rx="6.6" ry="2.3" /><circle cx="12" cy="10.2" r="0.6" fill="currentColor" stroke="none" />{PLINTH}</>,
    profile: <><circle cx="12" cy="7.4" r="3.1" /><path d="M6 17 C6 13.4 8.6 12.2 12 12.2 C15.4 12.2 18 13.4 18 17" />{PLINTH}</>,
    search: <><circle cx="11" cy="9.6" r="5.6" /><path d="M15 13.8 L18.2 17.2" />{PLINTH}</>,
  },
  b: {
    map: <>{FRAME}<circle cx="12" cy="12" r="5" /><path d="M7 12 H17" /><path d="M12 7 C9.6 9.4 9.6 14.6 12 17 C14.4 14.6 14.4 9.4 12 7" /></>,
    community: <>{FRAME}<circle cx="9.4" cy="10" r="1.9" /><circle cx="14.8" cy="10" r="1.9" /><path d="M6.6 16.2 C6.9 14.2 8 13.4 9.4 13.4 C10.6 13.4 11.5 13.9 12.1 14.9 C12.7 13.9 13.6 13.4 14.8 13.4 C16.2 13.4 17.2 14.2 17.4 16.2" /></>,
    ai: <>{FRAME}<path d="M12 6.6 C12.5 10 14 11.5 17.4 12 C14 12.5 12.5 14 12 17.4 C11.5 14 10 12.5 6.6 12 C10 11.5 11.5 10 12 6.6 Z" /></>,
    profile: <>{FRAME}<circle cx="12" cy="9.8" r="2.4" /><path d="M7.6 17.2 C7.8 14.6 9.6 13.6 12 13.6 C14.4 13.6 16.2 14.6 16.4 17.2" /></>,
    search: <>{FRAME}<circle cx="11.2" cy="11.2" r="3.9" /><path d="M14.1 14.1 L17 17" /></>,
  },
  c: {
    map: <><circle cx="12" cy="12" r="8.4" /><path d="M3.6 12 H20.4" /><path d="M12 3.6 C8.2 7.6 8.2 16.4 12 20.4" /><path d="M12 3.6 C15.8 7.6 15.8 16.4 12 20.4" /></>,
    community: <><circle cx="8.6" cy="12" r="5.4" /><circle cx="15.4" cy="12" r="5.4" /></>,
    ai: <><circle cx="12" cy="12" r="2.2" /><path d="M12 3.4 V6.6 M12 17.4 V20.6 M3.4 12 H6.6 M17.4 12 H20.6" /><path d="M6 6 L8 8 M16 16 L18 18 M18 6 L16 8 M8 16 L6 18" /></>,
    profile: <><circle cx="12" cy="8.2" r="3.8" /><path d="M4.8 20 C5.2 15.8 8 14.2 12 14.2 C16 14.2 18.8 15.8 19.2 20" /></>,
    search: <><circle cx="10.8" cy="10.8" r="6.6" /><path d="M15.6 15.6 L20.2 20.2" /></>,
  },
  d: {
    map: <path fillRule="evenodd" d="M12 3.4a8.6 8.6 0 1 0 0 17.2a8.6 8.6 0 0 0 0-17.2Z M12 5.8c-2.4 1.9-2.4 10.5 0 12.4c2.4-1.9 2.4-10.5 0-12.4Z" />,
    community: <><circle cx="8.6" cy="8.6" r="3.2" /><path d="M2.8 19.4c0-3.8 2.5-5.9 5.8-5.9s5.8 2.1 5.8 5.9Z" /><circle cx="16.8" cy="10" r="2.5" /><path d="M15.4 19.4c0-2-.5-3.6-1.4-4.7c.8-.7 1.7-1 2.8-1c2.7 0 4.5 2 4.5 5.7Z" /></>,
    ai: <path fillRule="evenodd" d="M12 3.2c2 0 3 4 3 8.8s-1 8.8-3 8.8s-3-4-3-8.8s1-8.8 3-8.8Z M3.2 12c0-2 4-3 8.8-3s8.8 1 8.8 3s-4 3-8.8 3s-8.8-1-8.8-3Z" />,
    profile: <><circle cx="12" cy="8" r="4.2" /><path d="M4 20.4c0-4.4 3.2-6.6 8-6.6s8 2.2 8 6.6Z" /></>,
    search: <><path fillRule="evenodd" d="M10.6 3.4a7.2 7.2 0 1 0 0 14.4a7.2 7.2 0 0 0 0-14.4Z M10.6 6a4.6 4.6 0 1 1 0 9.2a4.6 4.6 0 0 1 0-9.2Z" /><path d="M14.9 16.7l1.8-1.8l4.1 4.1a1.27 1.27 0 0 1-1.8 1.8Z" /></>,
  },
  e: {
    map: <><path d="M19.4 8A8.4 8.4 0 1 0 20.4 12.6" /><path d="M12.4 3.8C9 7.6 9 16.2 12 20.2" /><path d="M4.4 10.2C8.6 12.6 14.6 12.8 19.6 11.2" /></>,
    community: <><path d="M10.4 6.6A2.8 2.8 0 1 0 10.8 9.4" /><path d="M18.2 7.4A2.5 2.5 0 1 0 18.4 10" /><path d="M3.4 19C4.6 14.8 9.6 14.2 12 17C14 14.6 19 14.8 20.6 18.6" /></>,
    ai: <path d="M12.3 12.4a1.5 1.5 0 1 0-2.6-1.3a4 4 0 1 0 6.5-2.7a6.8 6.8 0 1 0 2.6 6.8" />,
    profile: <><path d="M14.8 5.4A3.8 3.8 0 1 0 15.6 9.2" /><path d="M4.8 19.8C5.8 15.6 8.8 14.2 12 14.2C15.8 14.2 18.6 16 19.4 19.4" /></>,
    search: <><path d="M16.8 7.6A6.6 6.6 0 1 0 15.2 15.4" /><path d="M15.6 15.8L20.2 20.4" /></>,
  },
  f: {
    map: <><circle cx="12" cy="12" r="8.4" /><path d="M4 13.6C8.6 15.6 15.4 15.6 20 13.6" /><circle cx="14.6" cy="8.8" r="1.7" fill="currentColor" stroke="none" /></>,
    community: <><path d="M12 6.4L6 17 H18 Z" /><circle cx="12" cy="6.4" r="1.9" fill="currentColor" stroke="none" /><circle cx="6" cy="17" r="1.9" fill="currentColor" stroke="none" /><circle cx="18" cy="17" r="1.9" fill="currentColor" stroke="none" /></>,
    ai: <><path d="M12 3.4L20.6 12L12 20.6L3.4 12Z" /><circle cx="12" cy="12" r="1.9" fill="currentColor" stroke="none" /></>,
    profile: <><path d="M5.6 20.4V11.2a6.4 6.4 0 0 1 12.8 0v9.2" /><circle cx="12" cy="11.4" r="2.1" fill="currentColor" stroke="none" /></>,
    search: <><circle cx="10.8" cy="10.8" r="6.6" /><path d="M15.6 15.6L20.2 20.2" /><circle cx="10.8" cy="10.8" r="1.7" fill="currentColor" stroke="none" /></>,
  },
};

export function NavIcon({ set, id, size = 22, active = false, className }: { set: NavIconSet; id: NavIconId; size?: number; active?: boolean; className?: string }) {
  const style = STYLE[set];
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={style.solid ? "currentColor" : "none"} stroke={style.solid ? "none" : "currentColor"}
      strokeWidth={style.w[active ? 1 : 0]} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      {SETS[set][id]}
    </svg>
  );
}
