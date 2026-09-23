import { useEffect, useId, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import { useLanguage } from "../contexts/LanguageContext";
import { COMMUNITY_RANKS, rankForScore, rankLevel } from "../utils/communityRank";
import { RankIcon } from "./RankIcon";
import "./rankInfo.css";

const levelName = (label: string) => label.replace(/^Lv\.?\s*\d+\s*/i, "");

/**
 * The owner's level on My Page: the laurel mark with a small question mark beside it. The mark
 * carries no "Lv.N"; the question mark opens the level guide — this level and score, what the next
 * level needs, how points are earned, and all ten marks. A mouse opens it by hovering, touch and the
 * keyboard by pressing; Escape or a press outside closes it. The guide is portalled to <body>
 * because the name row it sits in clips its overflow.
 */
export function RankInfo({ score, size = 26, light = false, showMark = true }: { score: number; size?: number; light?: boolean; /** 사진에 이미 관이 둘러져 있으면 마크는 빼고 물음표만 둔다 */ showMark?: boolean }) {
  const { language } = useLanguage();
  const ko = language === "ko";
  const panelId = "rk-guide-" + useId().replace(/[^\w-]/g, "");
  const anchor = useRef<HTMLSpanElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<number | undefined>(undefined);
  const [hover, setHover] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const open = hover || pinned;

  const label = rankForScore(score);
  const level = rankLevel(label);
  const current = COMMUNITY_RANKS[level - 1];
  const next = COMMUNITY_RANKS[level] ?? null;

  /* A mouse opens it by hovering; the short wait lets the pointer cross the gap to the guide. */
  const enter = (e: ReactPointerEvent) => {
    if (e.pointerType !== "mouse") return;
    window.clearTimeout(closeTimer.current);
    setHover(true);
  };
  const leave = (e: ReactPointerEvent) => {
    if (e.pointerType !== "mouse") return;
    closeTimer.current = window.setTimeout(() => setHover(false), 140);
  };
  useEffect(() => () => window.clearTimeout(closeTimer.current), []);

  useEffect(() => {
    if (!open) return;
    const shut = () => { setPinned(false); setHover(false); };
    const away = (e: PointerEvent) => {
      const target = e.target as Node;
      if (!anchor.current?.contains(target) && !card.current?.contains(target)) shut();
    };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") shut(); };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  /* Below the name row; above it when the screen runs out below, pushed left when it runs out on the right. */
  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    const place = () => {
      const a = anchor.current?.getBoundingClientRect();
      const c = card.current;
      if (!a || !c) return;
      const gap = 8, edge = 12, w = c.offsetWidth, h = c.offsetHeight;
      const left = Math.max(edge, Math.min(a.left, window.innerWidth - w - edge));
      const fitsBelow = a.bottom + gap + h <= window.innerHeight - edge;
      const top = fitsBelow || a.top - gap - h < edge ? a.bottom + gap : a.top - gap - h;
      setPos({ left, top });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  const toNext = next ? Math.max(0, next.threshold - score) : 0;
  const progress = next ? Math.min(1, Math.max(0, (score - current.threshold) / (next.threshold - current.threshold))) : 1;

  return (
    <span ref={anchor} className="rk-info" data-light={light || undefined} onPointerEnter={enter} onPointerLeave={leave}>
      {showMark && (
        <span className="rk-info__mark" role="img" aria-label={label}>
          <RankIcon level={level} size={size} />
        </span>
      )}
      <button
        type="button"
        className="rk-info__q"
        aria-label={ko ? "등급 안내" : "About levels"}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setPinned((p) => !p)}
      >
        ?
      </button>
      {open && createPortal(
        <div
          ref={card}
          id={panelId}
          role="dialog"
          aria-label={ko ? "등급 안내" : "Levels"}
          className="rk-card"
          data-light={light || undefined}
          style={pos ? { left: pos.left, top: pos.top } : { left: -9999, top: 0, visibility: "hidden" }}
          onPointerEnter={enter}
          onPointerLeave={leave}
        >
          <div className="rk-card__now">
            <RankIcon level={level} size={40} />
            <div>
              <b>{levelName(label)}</b>
              <small>Lv.{level} · {score.toLocaleString()}{ko ? "점" : " pts"}</small>
            </div>
          </div>
          <p className="rk-card__next">
            {next
              ? ko
                ? `다음 등급 ${levelName(next.label)}까지 ${toNext.toLocaleString()}점`
                : `${toNext.toLocaleString()} pts to ${levelName(next.label)}`
              : ko
                ? "가장 높은 등급입니다."
                : "This is the highest level."}
          </p>
          {next && (
            <div className="rk-card__bar" aria-hidden="true">
              <i style={{ width: `${Math.round(progress * 100)}%` }} />
            </div>
          )}
          <p className="rk-card__rule">
            {ko ? "작품 좋아요 1점 · 전시 좋아요 2점 · 커뮤니티 글 5점" : "Liked artwork 1 · liked exhibition 2 · community post 5"}
          </p>
          <ol className="rk-card__list">
            {COMMUNITY_RANKS.map((rank, i) => (
              <li key={rank.label} data-state={i + 1 === level ? "now" : i + 1 < level ? "done" : "ahead"}>
                <RankIcon level={i + 1} size={16} />
                <span>{levelName(rank.label)}</span>
                <em>{rank.threshold.toLocaleString()}{ko ? "점" : ""}</em>
              </li>
            ))}
          </ol>
        </div>,
        document.body,
      )}
    </span>
  );
}
