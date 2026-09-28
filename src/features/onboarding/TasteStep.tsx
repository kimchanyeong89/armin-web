import React, { useEffect, useMemo, useRef, useState } from "react";
import { collection, doc, getCountFromServer, getFirestore, increment, serverTimestamp, setDoc } from "firebase/firestore";
import { getOptimizedImageUrl } from "../../utils/imageProxy";
import { normalizeArtworkIdForFirestore } from "../../hooks/useLikedArtworkSet";
import { LikeIcon } from "../../components/like/LikeIcon";

/* The last onboarding step: works other members liked, mixed with paintings
   drawn at random, one at a time. Each like is saved as it is given - to the
   member's likes (so the works are on My Page from the start) and to the
   shared like count - and the step ends at TASTE_GOAL likes.

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

/* the order a member sees: liked and random works in turn, each pool
   shuffled so two members don't meet the same first cards */
function deal(popular: Pick[], random: Pick[]): Pick[] {
  const shuffle = <T,>(list: T[]) => {
    const out = [...list];
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  };
  /* the most liked stay near the front: shuffled within the top forty, then the rest */
  const liked = [...shuffle(popular.slice(0, 40)), ...shuffle(popular.slice(40))];
  const drawn = shuffle(random);
  const out: Pick[] = [];
  for (let i = 0; i < Math.max(liked.length, drawn.length); i++) {
    if (liked[i]) out.push(liked[i]);
    if (drawn[i]) out.push(drawn[i]);
  }
  return out;
}

export default function TasteStep({ uid, ko, meta, onDone }: { uid: string; ko: boolean; meta: string; onDone: () => void }) {
  const t = (copy: { ko: string; en: string }) => (ko ? copy.ko : copy.en);
  const [deck, setDeck] = useState<Pick[] | null>(null);
  const [at, setAt] = useState(0);
  const [earlier, setEarlier] = useState(0); // likes given before this visit
  const [liked, setLiked] = useState<Pick[]>([]);
  const [failed, setFailed] = useState(false);
  const [leaving, setLeaving] = useState<"like" | "pass" | null>(null);
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

  const count = earlier + liked.length;
  const done = count >= TASTE_GOAL;
  const card = deck?.[at] || null;
  const upcoming = useMemo(() => deck?.slice(at + 1, at + 4) || [], [deck, at]);

  const save = (pick: Pick) => {
    const db = getFirestore();
    const docId = normalizeArtworkIdForFirestore(pick.id);
    void setDoc(doc(db, `users/${uid}/liked_artworks/${docId}`), {
      likedAt: serverTimestamp(),
      artworkId: pick.id,
      id: pick.id,
      title: pick.t,
      name: pick.t,
      artist: pick.a,
      year: pick.y,
      image: pick.i,
      i: pick.i,
      imageUrl: pick.i,
      mediaType: "image",
      museum: pick.m,
      museumName: pick.m,
      exhibitionId: pick.e,
      sourceCollection: pick.e,
      source: "onboarding",
    }).catch((err) => console.error("[TasteStep] like failed", err));
    void setDoc(doc(db, "artwork_stats", docId), { likeCount: increment(1), artworkId: pick.id }, { merge: true }).catch(() => {});
  };

  const answer = (kind: "like" | "pass") => {
    if (!card || leaving || done) return;
    if (kind === "like") {
      save(card);
      setLiked((prev) => [...prev, card]);
    }
    setLeaving(kind);
    /* the card leaves before the next one comes in */
    window.setTimeout(() => {
      setLeaving(null);
      setDx(0);
      setAt((i) => i + 1);
    }, 220);
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight") answer("like");
      if (event.key === "ArrowLeft") answer("pass");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  /* a card thrown right is liked, left is passed */
  const onPointerDown = (event: React.PointerEvent) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
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
    if (moved > 90) answer("like");
    else if (moved < -90) answer("pass");
    else setDx(0);
  };

  if (done) {
    return (
      <div className="ob-taste ob-taste--done">
        <section className="ob-statement">
          <p className="ob-statement__meta">{t({ ko: "COLLY · 취향 저장됨", en: "COLLY · Taste saved" })}</p>
          <h1>{t({ ko: "이제 시작할 수 있습니다.", en: "You're ready." })}</h1>
          <p>{t({
            ko: "고른 작품은 마이페이지에 저장했습니다. 작품 추천과 전시 취향 점수는 이 작품들을 바탕으로 정해지고, 좋아요를 더 누를수록 정확해집니다.",
            en: "The works you chose are on My Page, and recommendations and exhibition matches now start from them. More likes make them sharper.",
          })}</p>
        </section>
        {liked.length > 0 && (
          <ul className="ob-taste__chosen">
            {liked.slice(-TASTE_GOAL).map((pick) => (
              <li key={pick.id}>
                <img src={getOptimizedImageUrl(pick.i, 200)} alt={pick.t} />
              </li>
            ))}
          </ul>
        )}
        <button type="button" className="ob-next" onClick={onDone}>
          <span>{t({ ko: "마이페이지로", en: "Go to My Page" })}</span>
          <span className="ob-next__go" aria-hidden="true"><i /></span>
        </button>
      </div>
    );
  }

  return (
    <div className="ob-taste">
      <section className="ob-statement ob-statement--tight">
        <p className="ob-statement__meta">{meta}</p>
        <h1>{t({ ko: "마음에 드는 작품을\n골라 주세요.", en: "Pick the works\nyou like." })}</h1>
        <p>{t({
          ko: `${TASTE_GOAL}점을 고르면 끝납니다. 고른 작품은 마이페이지에 저장됩니다.`,
          en: `Choose ${TASTE_GOAL} to finish. They are saved to My Page.`,
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
        {!failed && !card && <p className="ob-taste__note">{t({ ko: "작품을 불러오는 중", en: "Loading works" })}</p>}
        {card && (
          <figure
            key={card.id}
            className={`ob-card${leaving ? ` is-${leaving}` : ""}`}
            style={leaving ? undefined : { transform: `translateX(${dx}px) rotate(${dx / 30}deg)` }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            <img src={getOptimizedImageUrl(card.i, 900)} alt={card.t} draggable={false} />
            <figcaption>
              <b>{card.t}</b>
              <span>{[card.a, card.y].filter(Boolean).join(", ")}</span>
              <small>{card.m}</small>
            </figcaption>
          </figure>
        )}
        {/* the next pictures load while this one is judged */}
        <div className="ob-taste__preload" aria-hidden="true">
          {upcoming.map((pick) => <img key={pick.id} src={getOptimizedImageUrl(pick.i, 900)} alt="" />)}
        </div>
      </div>

      <div className="ob-taste__acts">
        <button type="button" className="ob-pass" onClick={() => answer("pass")} disabled={!card}>
          {t({ ko: "넘기기", en: "Skip" })}
        </button>
        <button type="button" className="ob-like" onClick={() => answer("like")} disabled={!card} aria-label={t({ ko: "좋아요", en: "Like" })}>
          <LikeIcon liked size={26} strokeWidth={1.8} color="#d4a547" />
        </button>
        <span className="ob-taste__hint">{t({ ko: "밀어서도 고를 수 있어요", en: "or swipe" })}</span>
      </div>
    </div>
  );
}
