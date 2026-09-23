import { Fragment, useEffect, useState, type KeyboardEvent as KeyEvent, type ReactNode, type RefObject } from "react";

/* What the three detail proposals share. The record's wording, the links
   and the like and save marks come from WorkDetail itself (recordOf,
   artistPath, museumPath, Acts), so a proposal changes how the detail looks,
   never what it says. */

/** Escape closes. While the detail is open the page behind holds still and
    the flag the app's own overlays raise on <html> is set — in the app it
    hides the KO | EN switch the detail would otherwise sit under. */
export function useOverlay(onClose: () => void) {
  useEffect(() => {
    const esc = (e: globalThis.KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);
  useEffect(() => {
    const root = document.documentElement;
    const was = root.style.overflow;
    const flagged = root.dataset.overlayPanel !== undefined;
    root.style.overflow = "hidden";
    if (!flagged) root.dataset.overlayPanel = "1";
    return () => {
      root.style.overflow = was;
      if (!flagged) delete root.dataset.overlayPanel;
    };
  }, []);
}

/** Likes kept while the detail is open; the study has no account behind it. */
export function useLiked() {
  const [liked, setLiked] = useState<string[]>([]);
  const toggle = (k: string) => setLiked((p) => (p.includes(k) ? p.filter((x) => x !== k) : [...p, k]));
  return { liked, toggle };
}

/** A work picked from a rail opens from its top: the detail's own scroller
    and anything in it marked data-scroll go back up. */
export function useScrollTop(ref: RefObject<HTMLElement | null>, key: string) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.scrollTop = 0;
    el.querySelectorAll<HTMLElement>("[data-scroll]").forEach((s) => { s.scrollTop = 0; });
  }, [ref, key]);
}

/** Enter and Space open a row or a card — only while it holds the focus
    itself, so the like and save marks inside it keep their own keys. */
export const onActivate = (fn: () => void) => (e: KeyEvent<HTMLElement>) => {
  if (e.target !== e.currentTarget) return;
  if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fn(); }
};

/** Counts as the tabs set them, in two digits. */
export const two = (n: number) => String(n).padStart(2, "0");

/** A line of parts split by short hairline ticks, as the tabs split their
    meta lines. Empty parts drop out. */
export function Meta({ parts, className = "dd-meta" }: { parts: ReactNode[]; className?: string }) {
  const shown = parts.filter((p) => p !== undefined && p !== null && p !== false && p !== "");
  if (shown.length === 0) return null;
  return (
    <p className={className}>
      {shown.map((p, i) => (
        <Fragment key={i}>{i > 0 && <i aria-hidden="true" />}<span>{p}</span></Fragment>
      ))}
    </p>
  );
}
