import React, { useEffect, useMemo, useRef, useState } from "react";
import { collection, deleteDoc, doc, getCountFromServer, getFirestore, increment, serverTimestamp, setDoc } from "firebase/firestore";
import { getOptimizedImageUrl } from "../../utils/imageProxy";
import { normalizeArtworkIdForFirestore } from "../../hooks/useLikedArtworkSet";
import { LikeIcon } from "../../components/like/LikeIcon";

/* The last onboarding step: works other members liked, mixed with paintings
   drawn at random, one at a time. Each like is saved as it is given - to the
   member's likes (so the works are on My Page from the start) and to the
   shared like count. Only the globe likes; moving left or right just looks.
   The page's own "완료" opens at TASTE_GOAL likes.

   TASTE_GOAL is the worker's cluster size (TASTE_K_PER_LIKES = 8 in
   workers/semantic-search): the fewest likes that make one whole taste
   cluster, at which a score keeps 8/(8+4) = 2/3 of its distance from neutral. */
export const TASTE_GOAL = 8;

interface Pick {
  id: string;
  t: string;
  a: string;
  y: string;
  m: string;
  e: string;
  i: string;
  likes?: number;
}

/* The order a member sees: mostly paintings drawn at random from many
   collections, with a work other members liked every fourth card - enough
   to meet what others chose without the few early likers setting the taste.
   Each pool is shuffled so two members don't meet the same first cards. */
function deal(popular: Pick[], random: Pick[]): Pick[] {
  const shuffle = <T,>(list: T[]) => {
    const out = [...list];
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  };
  const liked = shuffle(popular);
  const drawn = shuffle(random);
  const out: Pick[] = [];
  let l = 0;
  for (let d = 0; d < drawn.length || l < liked.length; d++) {
    if (d % 3 === 2 && l < liked.length) out.push(liked[l++]);
    if (d < drawn.length) out.push(drawn[d]);
    else if (l < liked.length) out.push(liked[l++]);
  }
  return out;
}

export default function TasteStep({ uid, ko, meta, onCount }: { uid: string; ko: boolean; meta: string; onCount: (count: number) => void }) {
  const t = (copy: { ko: string; en: string }) => (ko ? copy.ko : copy.en);
  const [deck, setDeck] = useState<Pick[] | null>(null);
  const [at, setAt] = useState(0);
  const [earlier, setEarlier] = useState(0); // likes given before this visit
  const [liked, setLiked] = useState<Set<string>>(() => new Set());
  const [failed, setFailed] = useState(false);
  const drag = useRef<{ x: number; dx: number } | null>(null);
  const [dx, setDx] = useState(0);

  useEffect(() => {
    let live = true;
    fetch("/data/onboarding-picks.json")
      .then((res) => (res.ok ? res.json() : Promise.reject(res.status)))
      .then((data: { popular: Pick[]; random: Pick[] }) => live && setDeck(deal(data.popular || [], data.random || [])))
      .catch(() => live && setFailed(true));
    /* a member who left midway keeps the likes already given */
    getCountFromServer(collection(getFirestore(), `users/${uid}/liked_artworks`))
      .then((snap) => live && setEarlier(snap.data().count))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [uid]);

  const count = earlier + liked.size;
  useEffect(() => onCount(count), [count, onCount]);
  /* two works at a time: `at` is the first of the pair on screen */
  const pair = deck ? (deck.slice(at, at + 2) as Pick[]) : [];
  /* the pairs either side load while this one is looked at */
  const around = useMemo(() => (deck ? [...deck.slice(Math.max(0, at - 2), at), ...deck.slice(at + 2, at + 6)] : []), [deck, at]);

  /* only the globe likes a work; pressing it again takes the like back */
  const toggleLike = (card: Pick) => {
    const db = getFirestore();
    const docId = normalizeArtworkIdForFirestore(card.id);
    const likeRef = doc(db, `users/${uid}/liked_artworks/${docId}`);
    const statsRef = doc(db, "artwork_stats", docId);
    if (liked.has(card.id)) {
      setLiked((prev) => { const next = new Set(prev); next.delete(card.id); return next; });
      void deleteDoc(likeRef).catch((err) => console.error("[TasteStep] unlike failed", err));
      void setDoc(statsRef, { likeCount: increment(-1), artworkId: card.id }, { merge: true }).catch(() => {});
      return;
    }
    setLiked((prev) => new Set(prev).add(card.id));
    void setDoc(likeRef, {
      likedAt: serverTimestamp(),
      artworkId: card.id,
      id: card.id,
      title: card.t,
      name: card.t,
      artist: card.a,
      year: card.y,
      image: card.i,
      i: card.i,
      imageUrl: card.i,
      mediaType: "image",
      museum: card.m,
      museumName: card.m,
      exhibitionId: card.e,
      sourceCollection: card.e,
      source: "onboarding",
    }).catch((err) => console.error("[TasteStep] like failed", err));
    void setDoc(statsRef, { likeCount: increment(1), artworkId: card.id }, { merge: true }).catch(() => {});
  };

  /* left and right only move between pairs - nothing is liked by moving */
  const canBack = at > 0;
  const canOn = !!deck && at + 2 < deck.length;
  const move = (step: -1 | 1) => {
    if ((step < 0 && !canBack) || (step > 0 && !canOn)) return;
    setDx(0);
    setAt((i) => Math.max(0, i + step * 2));
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight") move(1);
      if (event.key === "ArrowLeft") move(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  /* the pair pushed left shows the next two, pushed right the two before */
  const onPointerDown = (event: React.PointerEvent) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if ((event.target as Element).closest("button")) return;
    drag.current = { x: event.clientX, dx: 0 };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: React.PointerEvent) => {
    if (!drag.current) return;
    drag.current.dx = event.clientX - drag.current.x;
    setDx(drag.current.dx);
  };
  const onPointerUp = () => {
    const moved = drag.current?.dx || 0;
    drag.current = null;
    if (moved < -70 && canOn) move(1);
    else if (moved > 70 && canBack) move(-1);
    else setDx(0);
  };

  const enough = count >= TASTE_GOAL;

  return (
    <div className="ob-taste">
      <section className="ob-statement ob-statement--tight">
        <p className="ob-statement__meta">{meta}</p>
        <h1>{t({ ko: "마음에 드는 작품을\n골라 주세요.", en: "Pick the works\nyou like." })}</h1>
        <p>{enough
          ? t({ ko: "다 골랐습니다. 더 골라도 되고, 아래 완료를 누르면 끝납니다.", en: "That's enough. Keep choosing, or press Done below." })
          : t({
            ko: `작품 아래 지구본을 눌러 ${TASTE_GOAL}점을 고르면 끝납니다. 고른 작품은 마이페이지에 저장됩니다.`,
            en: `Tap the globe under ${TASTE_GOAL} works to finish. They are saved to My Page.`,
          })}</p>
      </section>

      <div className="ob-taste__count" aria-live="polite">
        <ol aria-hidden="true">
          {Array.from({ length: TASTE_GOAL }, (_, i) => <li key={i} className={i < count ? "is-on" : ""} />)}
        </ol>
        <span>{String(count).padStart(2, "0")} / {String(TASTE_GOAL).padStart(2, "0")}</span>
      </div>

      <div className="ob-taste__stage">
        {failed && <p className="ob-taste__note">{t({ ko: "작품을 불러오지 못했습니다. 잠시 뒤 다시 열어 주세요.", en: "Couldn't load the works. Try again shortly." })}</p>}
        {!failed && !pair.length && <p className="ob-taste__note">{t({ ko: "작품을 불러오는 중", en: "Loading works" })}</p>}
        {pair.length > 0 && (
          <div
            key={at}
            className="ob-pair"
            style={{ transform: `translateX(${dx}px)` }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            {pair.map((card) => {
              const on = liked.has(card.id);
              return (
                <figure key={card.id} className={on ? "ob-card is-on" : "ob-card"}>
                  <img src={getOptimizedImageUrl(card.i, 700)} alt={card.t} draggable={false} />
                  <figcaption>
                    <b>{card.t}</b>
                    <span>{[card.a, card.y].filter(Boolean).join(", ")}</span>
                  </figcaption>
                  <button
                    type="button"
                    className={on ? "ob-like is-on" : "ob-like"}
                    onClick={() => toggleLike(card)}
                    aria-pressed={on}
                    aria-label={t({ ko: `좋아요: ${card.t}`, en: `Like: ${card.t}` })}
                  >
                    <LikeIcon liked={on} size={22} strokeWidth={1.8} color="#d4a547" emptyColor="#d4a547" />
                  </button>
                </figure>
              );
            })}
          </div>
        )}
        <div className="ob-taste__preload" aria-hidden="true">
          {around.map((pick) => <img key={pick.id} src={getOptimizedImageUrl(pick.i, 700)} alt="" />)}
        </div>
      </div>

      <div className="ob-taste__acts">
        <button type="button" className="ob-arrow" onClick={() => move(-1)} disabled={!canBack} aria-label={t({ ko: "이전 두 점", en: "Previous two" })}>‹</button>
        <span className="ob-taste__page">{t({ ko: "밀어서 넘기기", en: "Swipe for more" })}</span>
        <button type="button" className="ob-arrow" onClick={() => move(1)} disabled={!canOn} aria-label={t({ ko: "다음 두 점", en: "Next two" })}>›</button>
      </div>
    </div>
  );
}
