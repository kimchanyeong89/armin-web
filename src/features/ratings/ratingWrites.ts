import {
  collection,
  doc,
  increment,
  runTransaction,
  serverTimestamp,
  type Firestore,
  type Timestamp,
} from "firebase/firestore";

/**
 * Ratings (0.5 to 5 in half points) and one-line reviews for anything people
 * can rate: temporary exhibitions and weekly curations.
 *
 *   ratings/{subject}/reviews/{uid}
 *     { uid, rating, text: up to 60 chars, name, rank, createdAt, updatedAt }
 *   rating_stats/{subject}
 *     { ratingSum, totalRatings, updatedAt }
 *
 * `subject` is "<kind>:<id>", e.g. "exhibition:mmca-2026-detective". One review
 * per person per subject (the document id is the uid). A review and the running
 * totals change in one transaction that reads only the writer's previous review
 * and moves the totals with increment(), so people rating at the same moment add
 * up instead of one overwriting the other. firestore.rules checks that the
 * totals moved by exactly that review's change.
 *
 * Kept free of React and of the app's Firebase setup so the emulator test can
 * import it as is.
 */

export type RatingKind = "exhibition" | "curation";

export interface RatingSubject {
  kind: RatingKind;
  id: string;
}

export const RATING_MIN = 0.5;
export const RATING_MAX = 5;
export const REVIEW_TEXT_MAX = 60;
const NAME_MAX = 40;
const RANK_MAX = 32;

export interface RatingStats {
  ratingSum: number;
  totalRatings: number;
}

export interface Review {
  uid: string;
  rating: number;
  text: string;
  name: string;
  rank: string;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

/** Who is writing, as the review will show them. */
export interface ReviewAuthor {
  uid: string;
  name: string;
  rank: string;
}

/** "<kind>:<id>". Ids may contain "/", which Firestore reads as a path separator. */
export function subjectKey({ kind, id }: RatingSubject): string {
  return `${kind}:${String(id).replace(/\//g, "__")}`;
}

export const statsCollection = (db: Firestore) => collection(db, "rating_stats");
export const statsRef = (db: Firestore, subject: RatingSubject) => doc(db, "rating_stats", subjectKey(subject));
export const reviewsCollection = (db: Firestore, subject: RatingSubject) =>
  collection(db, "ratings", subjectKey(subject), "reviews");
export const reviewRef = (db: Firestore, subject: RatingSubject, uid: string) =>
  doc(reviewsCollection(db, subject), uid);

export function averageRating(stats: RatingStats | null | undefined): number | null {
  return stats && stats.totalRatings > 0 ? stats.ratingSum / stats.totalRatings : null;
}

/** The nearest half point, or null when it falls outside 0.5-5. */
export function toHalfPoint(value: number): number | null {
  const snapped = Math.round(value * 2) / 2;
  return snapped >= RATING_MIN && snapped <= RATING_MAX ? snapped : null;
}

/**
 * Trim to at most `max` UTF-16 units - the length both the rules' size() and an
 * input's maxLength count - without cutting an emoji in half.
 */
function clip(value: string, max: number): string {
  let out = "";
  for (const char of String(value || "").trim()) {
    if (out.length + char.length > max) break;
    out += char;
  }
  return out;
}

/**
 * Add or change this person's rating. Pass `text` to set the one-line review;
 * leave it out (a tap on the emblems) to keep the line they wrote before.
 */
export async function saveReview(
  db: Firestore,
  subject: RatingSubject,
  author: ReviewAuthor,
  rating: number,
  text?: string,
): Promise<void> {
  const score = toHalfPoint(rating);
  if (score === null) throw new Error(`rating must be 0.5-5 in half points, got ${rating}`);
  const mine = reviewRef(db, subject, author.uid);

  await runTransaction(db, async (tx) => {
    const previous = await tx.get(mine);
    const old = previous.exists() ? (previous.data() as Review) : null;

    tx.set(mine, {
      uid: author.uid,
      rating: score,
      text: clip(text ?? old?.text ?? "", REVIEW_TEXT_MAX),
      name: clip(author.name, NAME_MAX),
      rank: clip(author.rank, RANK_MAX),
      createdAt: old ? old.createdAt : serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    tx.set(
      statsRef(db, subject),
      {
        ratingSum: increment(score - (old ? old.rating : 0)),
        totalRatings: increment(old ? 0 : 1),
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  });
}

/** Remove this person's review and take it out of the totals. */
export async function deleteReview(db: Firestore, subject: RatingSubject, uid: string): Promise<void> {
  const mine = reviewRef(db, subject, uid);

  await runTransaction(db, async (tx) => {
    const previous = await tx.get(mine);
    if (!previous.exists()) return;
    const old = previous.data() as Review;

    tx.delete(mine);
    tx.set(
      statsRef(db, subject),
      { ratingSum: increment(-old.rating), totalRatings: increment(-1), updatedAt: serverTimestamp() },
      { merge: true },
    );
  });
}
