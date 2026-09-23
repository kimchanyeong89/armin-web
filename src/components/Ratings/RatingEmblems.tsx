import { useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type MouseEvent } from "react";
import { useLanguage } from "../../contexts/LanguageContext";
import { averageRating, type RatingSubject } from "../../features/ratings/ratingWrites";
import { useRatingStats } from "../../features/ratings/useRatings";
import { DotRater, dotRowWidth, GOLD, RatingDots } from "./RatingDots";
import { ReviewSheet } from "./ReviewPanel";
import { useMyRating } from "./useMyRating";

export interface RatingEmblemsProps {
  subject: RatingSubject;
  /** Names the subject in the review sheet and to screen readers. */
  title: string;
  /** The venue, or what kind of curation it is. */
  subtitle?: string;
  /** Diameter of one point in px. */
  size?: number;
  /** Colour of the empty points and the average; defaults to the surrounding text. */
  color?: string;
  /** "overlay" sits on a picture as a dark pill; "plain" fills its line. */
  tone?: "plain" | "overlay";
}

/**
 * The one rating control for an exhibition or a curation, used wherever one is
 * shown: five points holding the signed-in user's score - hover to preview in
 * half points, click to save, click the same score again to clear it - then the
 * live average, which opens everyone's one-line reviews.
 *
 * On a line too narrow for five points (a poster in a five-column grid on a
 * phone) it shows one point with the average, which opens the same reviews.
 */
export default function RatingEmblems({ subject, title, subtitle, size = 12, color, tone = "plain" }: RatingEmblemsProps) {
  const { language } = useLanguage();
  const ko = language === "ko";
  const stats = useRatingStats(subject);
  const { myRating, error, rate, loginPrompt } = useMyRating(subject);
  const [preview, setPreview] = useState<number | null>(null);
  const [open, setOpen] = useState(false);

  const box = useRef<HTMLSpanElement>(null);
  const [compact, setCompact] = useState(false);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el || tone === "overlay") return;
    const fit = () => setCompact(el.clientWidth < dotRowWidth(size));
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(el);
    return () => observer.disconnect();
  }, [size, tone]);

  const average = averageRating(stats);
  const averageText = average === null ? null : average.toFixed(1);

  const openReviews = (event: MouseEvent | KeyboardEvent) => {
    event.stopPropagation();
    event.preventDefault();
    setOpen(true);
  };
  const reviewsButton = {
    role: "button",
    tabIndex: 0,
    "aria-label":
      averageText === null
        ? ko ? `${title} 한줄평 보기` : `Reviews of ${title}`
        : ko ? `평균 ${averageText}점. 한줄평 보기` : `Average ${averageText}. Open reviews`,
    onClick: openReviews,
    onKeyDown: (event: KeyboardEvent) => {
      if (event.key === "Enter" || event.key === " ") openReviews(event);
    },
  } as const;

  const fontSize = Math.max(tone === "overlay" ? 11 : 9.5, size - 2);
  const rootStyle: CSSProperties =
    tone === "overlay"
      ? { ...S.root, ...S.overlay, fontSize }
      : { ...S.root, width: "100%", fontSize, color: color || "inherit" };

  return (
    <span ref={box} style={rootStyle}>
      {compact ? (
        // Room for the average alone.
        <span {...reviewsButton} style={S.compact}>
          <RatingDots value={averageText === null ? 0 : 1} count={1} size={size} color={color} />
          <span style={S.ellipsis}>
            {averageText === null ? (
              <span style={S.muted}>{ko ? "평가" : "Rate"}</span>
            ) : (
              <b style={S.value}>{averageText}</b>
            )}
          </span>
        </span>
      ) : (
        <>
          <DotRater
            value={myRating}
            onRate={(score) => void rate(score)}
            onPreview={setPreview}
            size={size}
            color={color}
            label={ko ? `${title} 평점 매기기` : `Rate ${title}`}
            valueText={(score) => (ko ? `${score}점` : `${score} of 5`)}
          />
          <span {...reviewsButton} style={S.ellipsis}>
            {preview !== null ? (
              <b style={{ ...S.value, color: GOLD }}>{preview.toFixed(1)}</b>
            ) : error ? (
              <span style={S.error}>{ko ? "반영 실패" : "Not saved"}</span>
            ) : averageText !== null ? (
              <b style={S.value}>{averageText}</b>
            ) : (
              <span style={S.muted}>{ko ? "한줄평" : "Reviews"}</span>
            )}
          </span>
        </>
      )}
      {open && <ReviewSheet subject={subject} title={title} subtitle={subtitle} onClose={() => setOpen(false)} />}
      {loginPrompt}
    </span>
  );
}

const S: Record<string, CSSProperties> = {
  root: {
    display: "inline-flex",
    alignItems: "center",
    gap: 7,
    minWidth: 0,
    maxWidth: "100%",
    lineHeight: 1.2,
    whiteSpace: "nowrap",
    userSelect: "none",
    verticalAlign: "middle",
  },
  overlay: {
    padding: "6px 11px 6px 9px",
    borderRadius: 999,
    background: "rgba(0,0,0,0.56)",
    backdropFilter: "blur(6px)",
    WebkitBackdropFilter: "blur(6px)",
    color: "#fff",
  },
  compact: { display: "inline-flex", alignItems: "center", gap: 4, minWidth: 0, cursor: "pointer" },
  ellipsis: { minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", cursor: "pointer" },
  value: { fontWeight: 700, fontFamily: "'Space Mono', monospace" },
  muted: { opacity: 0.75 },
  error: { color: "#ff8a7a" },
};
