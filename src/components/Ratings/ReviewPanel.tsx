import { useEffect, useState, type SyntheticEvent } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import type { Timestamp } from "firebase/firestore";
import { useLanguage } from "../../contexts/LanguageContext";
import { shownAuthor, usePublicProfiles } from "../../features/community/publicProfile";
import { averageRating, REVIEW_TEXT_MAX, type RatingSubject } from "../../features/ratings/ratingWrites";
import { useRatingStats, useReviews } from "../../features/ratings/useRatings";
import { RankAvatar } from "../RankAvatar";
import { DotRater, RatingDots } from "./RatingDots";
import { useCloseOnEscape, useMyRating } from "./useMyRating";
import "../collyGlass.css";
import "./ratings.css";

/**
 * Ratings and one-line reviews for one subject: the live average, the signed-in
 * user's own points and line, and everyone's reviews with their name and level
 * mark. The review sheet and the exhibition modals all show this same panel.
 */
export function ReviewPanel({ subject, isLight = false }: { subject: RatingSubject; isLight?: boolean }) {
  const { language } = useLanguage();
  const ko = language === "ko";

  const stats = useRatingStats(subject);
  const reviews = useReviews(subject);
  const cards = usePublicProfiles((reviews || []).map((review) => review.uid));
  const { signedInUser, mine, myRating, busy, error, save, rate, remove, requestLogin, loginPrompt } = useMyRating(subject);

  const [text, setText] = useState("");
  const [editing, setEditing] = useState(false);
  const [preview, setPreview] = useState<number | null>(null);

  // Show the saved line in the field until the user starts changing it.
  useEffect(() => {
    if (!editing) setText(mine?.text || "");
  }, [mine, editing]);

  const average = averageRating(stats);
  const lineChanged = text.trim() !== (mine?.text || "");
  const canPost = !busy && myRating > 0 && lineChanged;
  const shownScore = preview ?? myRating;

  // A new score also saves a line being typed; the same score again clears the rating.
  const onRate = async (score: number) => {
    const typing = editing && !!text.trim();
    const done =
      editing && score !== myRating ? await save(score, text) : await rate(score, !!mine?.text || typing);
    if (done) setEditing(false);
  };

  const post = async () => {
    if (canPost && (await save(myRating, text))) setEditing(false);
  };

  return (
    <div className="rt" data-light={isLight || undefined}>
      <div className="rt-cap">
        <span>{ko ? "평점" : "RATING"}</span>
        <i />
      </div>
      <div className="rt-read">
        <b>{average === null ? "–" : average.toFixed(1)}</b>
        <div>
          <RatingDots value={average ?? 0} size={12} color="var(--ink)" />
          {average === null && <small>{ko ? "아직 평가가 없어요" : "No ratings yet"}</small>}
        </div>
      </div>

      <div className="rt-mine">
        <div className="rt-mine__head">
          <b>{ko ? "내 평점" : "Your rating"}</b>
          <small>
            {signedInUser
              ? ko ? "누르면 바로 저장돼요 · 같은 점수를 다시 누르면 지워져요" : "Tap to save · tap the same score to clear"
              : ko ? "로그인하면 평점과 한줄평을 남길 수 있어요" : "Sign in to rate and review"}
          </small>
        </div>
        <div className="rt-rater">
          <DotRater
            value={myRating}
            onRate={onRate}
            onPreview={setPreview}
            size={22}
            color="var(--ink)"
            label={ko ? "내 평점" : "Your rating"}
            valueText={(score) => (ko ? `${score}점` : `${score} of 5`)}
          />
          <output data-state={preview !== null ? "preview" : myRating ? "set" : undefined}>
            {shownScore ? shownScore.toFixed(1) : "–"}
          </output>
        </div>
        <div className="rt-line">
          <input
            value={text}
            maxLength={REVIEW_TEXT_MAX}
            placeholder={ko ? "한줄평을 남겨 주세요 (선택)" : "Add a one-line review (optional)"}
            onFocus={() => {
              if (!signedInUser) requestLogin();
            }}
            onChange={(event) => {
              setEditing(true);
              setText(event.target.value);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                post();
              }
            }}
          />
          <button type="button" className="rt-send" disabled={!canPost} onClick={post}>
            {mine?.text ? (ko ? "수정" : "Update") : ko ? "등록" : "Post"}
          </button>
        </div>
        <div className="rt-foot">
          <span>
            {signedInUser && !myRating && text.trim()
              ? ko ? "평점을 먼저 매겨 주세요" : "Rate it first"
              : `${text.length}/${REVIEW_TEXT_MAX}`}
          </span>
          {mine && (
            <button
              type="button"
              className="rt-del"
              disabled={busy}
              onClick={async () => {
                if (await remove()) setEditing(false);
              }}
            >
              {ko ? "삭제" : "Delete"}
            </button>
          )}
        </div>
        {error && <p className="rt-err">{error}</p>}
      </div>

      <div className="rt-list">
        <div className="rt-cap">
          <span>{ko ? "평가" : "REVIEWS"}</span>
          <i />
        </div>
        {reviews === null ? (
          <p className="rt-empty">{ko ? "불러오는 중…" : "Loading…"}</p>
        ) : reviews.length === 0 ? (
          <p className="rt-empty">{ko ? "첫 평점을 남겨 주세요." : "Be the first to rate it."}</p>
        ) : (
          <ul className="rt-rows">
            {reviews.map((review) => {
              const author = shownAuthor(cards[review.uid], { name: review.name, rank: review.rank });
              return (
                <li key={review.uid}>
                  <div className="rt-by">
                    <RatingDots value={review.rating} size={8} color="var(--ink)" />
                    <em>{review.rating.toFixed(1)}</em>
                    <RankAvatar rank={author.rank} name={author.name || ""} src={author.photo} crop={author.crop} size={20} />
                    <b>{author.name || (ko ? "익명" : "Anonymous")}</b>
                    <time>{formatDate(review.updatedAt)}</time>
                  </div>
                  {review.text && <p>{review.text}</p>}
                </li>
              );
            })}
          </ul>
        )}
      </div>
      {loginPrompt}
    </div>
  );
}

/** The review panel in its own sheet, for places too small to hold it. */
export function ReviewSheet({
  subject,
  title,
  subtitle,
  onClose,
}: {
  subject: RatingSubject;
  title: string;
  subtitle?: string;
  onClose: () => void;
}) {
  const { language } = useLanguage();
  useCloseOnEscape(onClose);

  // A portal still bubbles React events to the host card, which would open it.
  const keep = (event: SyntheticEvent) => event.stopPropagation();

  return createPortal(
    <div
      className="rt-backdrop"
      onClick={(event) => {
        keep(event);
        if (event.target === event.currentTarget) onClose();
      }}
      onMouseDown={keep}
      onPointerDown={keep}
      onKeyDown={keep}
    >
      <div role="dialog" aria-modal="true" aria-label={title} className="rt rt-sheet colly-glass">
        <header className="rt-sheet__head">
          <div className="rt-sheet__name">
            {subtitle && <span>{subtitle}</span>}
            <h2>{title}</h2>
          </div>
          <button type="button" className="rt-close" onClick={onClose} aria-label={language === "ko" ? "닫기" : "Close"}>
            <X size={15} strokeWidth={2} />
          </button>
        </header>
        <div className="rt-sheet__body">
          <ReviewPanel subject={subject} />
        </div>
      </div>
    </div>,
    document.body,
  );
}

function formatDate(value: Timestamp | null): string {
  if (!value || typeof value.toDate !== "function") return "";
  const d = value.toDate();
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}
