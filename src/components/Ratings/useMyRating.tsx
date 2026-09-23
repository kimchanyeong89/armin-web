import { useEffect, useRef, useState, type SyntheticEvent } from "react";
import { createPortal } from "react-dom";
import type { User } from "firebase/auth";
import { db } from "../../firebase";
import { useAuth } from "../../contexts/AuthContext";
import { useLanguage } from "../../contexts/LanguageContext";
import { storedAuthor, syncPublicProfile } from "../../features/community/publicProfile";
import {
  deleteReview,
  saveReview,
  toHalfPoint,
  type RatingSubject,
  type ReviewAuthor,
} from "../../features/ratings/ratingWrites";
import { useMyReview } from "../../features/ratings/useRatings";
import LoginSelectionModal from "../LoginSelectionModal";

const LOGIN_PROMPT_ATTR = "data-rating-login";

/** The writer's name and level as their reviews keep them, looked up once a session. */
const authors = new Map<string, Promise<ReviewAuthor>>();

function authorOf(user: User): Promise<ReviewAuthor> {
  let author = authors.get(user.uid);
  if (!author) {
    author = syncPublicProfile(user)
      .catch(() => null)
      .then((card) => {
        const { authorName, authorRank } = storedAuthor(card, user);
        return { uid: user.uid, name: authorName, rank: authorRank };
      });
    authors.set(user.uid, author);
  }
  return author;
}

/** A write waiting its turn: a score (with the line, when one is given), or null to clear the rating. */
type Write = { rating: number; text?: string } | null;

/**
 * The signed-in user's rating of one subject, and the actions on it. A tapped
 * score shows at once; when taps come faster than writes, the last one wins.
 * Signed out, any action opens the sign-in prompt instead.
 */
export function useMyRating(subject: RatingSubject) {
  const { user } = useAuth();
  const { language } = useLanguage();
  const ko = language === "ko";
  const signedInUser = user && !user.isAnonymous ? user : null;
  const mine = useMyReview(subject, signedInUser?.uid);

  // The score shown ahead of the database: a score, 0 while a clear is on its way, or null.
  const [pending, setPending] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [askLogin, setAskLogin] = useState(false);
  const next = useRef<{ write: Write } | null>(null);
  const writing = useRef<Promise<boolean> | null>(null);

  // Once the saved review arrives it replaces the score shown ahead of it.
  useEffect(() => {
    if (!writing.current) setPending(null);
  }, [mine]);

  const myRating = pending ?? mine?.rating ?? 0;

  const queue = (write: Write): Promise<boolean> => {
    if (!signedInUser) {
      setAskLogin(true);
      return Promise.resolve(false);
    }
    setPending(write ? write.rating : 0);
    setError("");
    next.current = { write };
    if (!writing.current) {
      setBusy(true);
      writing.current = (async () => {
        try {
          while (next.current) {
            const { write: current } = next.current;
            next.current = null;
            if (current) await saveReview(db, subject, await authorOf(signedInUser), current.rating, current.text);
            else await deleteReview(db, subject, signedInUser.uid);
          }
          return true;
        } catch {
          next.current = null;
          setPending(null);
          setError(ko ? "반영하지 못했어요. 잠시 뒤 다시 시도해 주세요." : "Couldn't update. Please try again.");
          return false;
        } finally {
          writing.current = null;
          setBusy(false);
        }
      })();
    }
    return writing.current;
  };

  /** Save a score; pass `text` to set the one-line review too, or leave it out to keep the old line. */
  const save = (rating: number, text?: string): Promise<boolean> => {
    const score = toHalfPoint(rating);
    return score === null ? Promise.resolve(false) : queue({ rating: score, text });
  };

  /**
   * A tap on the points: gives that score, or clears the rating when it is the
   * score already given. Clearing removes the line too, so it asks first when
   * there is one; `lineAtRisk` lets the panel count a line still being typed.
   */
  const rate = (rating: number, lineAtRisk = !!mine?.text): Promise<boolean> => {
    const score = toHalfPoint(rating);
    if (score === null) return Promise.resolve(false);
    if (score !== myRating) return queue({ rating: score });
    if (
      lineAtRisk &&
      !window.confirm(ko ? "평점을 지우면 한줄평도 함께 지워져요. 지울까요?" : "Clearing the rating also deletes your review. Clear it?")
    ) {
      return Promise.resolve(false);
    }
    return queue(null);
  };

  /** Remove the rating and the line, after asking. */
  const remove = (): Promise<boolean> => {
    if (!signedInUser || !myRating) return Promise.resolve(false);
    if (!window.confirm(ko ? "내 평점과 한줄평을 지울까요?" : "Delete your rating and review?")) return Promise.resolve(false);
    return queue(null);
  };

  // A portal still bubbles React events to the card it was opened from.
  const keep = (event: SyntheticEvent) => event.stopPropagation();
  const loginPrompt = askLogin
    ? createPortal(
        <div {...{ [LOGIN_PROMPT_ATTR]: "" }} onClick={keep} onMouseDown={keep} onPointerDown={keep} onKeyDown={keep}>
          <LoginSelectionModal onClose={() => setAskLogin(false)} />
        </div>,
        document.body,
      )
    : null;

  return {
    signedInUser,
    mine,
    /** The score to show: the one just tapped, else the saved one, else 0. */
    myRating,
    busy,
    error,
    save,
    rate,
    remove,
    requestLogin: () => setAskLogin(true),
    /** Render this; it is null unless a signed-out action asked for sign-in. */
    loginPrompt,
  };
}

/** Close on Escape, unless a sign-in prompt opened from a rating is the thing on top. */
export function useCloseOnEscape(onClose: () => void) {
  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape" && !document.querySelector(`[${LOGIN_PROMPT_ATTR}]`)) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
}
