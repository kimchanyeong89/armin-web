import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { RankAvatar } from "../../../components/RankAvatar";
import { collectorPath, listCollectors, type Collector } from "../../../features/collectors/publicCollection";
import { useBlockedUsers } from "../../../features/community/moderation";
import { getOptimizedImageUrl } from "../../../utils/imageProxy";
import { two } from "./shared";

/**
 * The people whose collections are open, whoever liked a work most recently
 * first: their photo and name, how many works they liked, and the latest four.
 * Each opens the collector's page.
 */
export default function CollectorShelf({ ko }: { ko: boolean }) {
  /* null while loading */
  const [people, setPeople] = useState<Collector[] | null>(null);
  const { blocked } = useBlockedUsers();

  useEffect(() => {
    let live = true;
    listCollectors()
      .then((found) => { if (live) setPeople(found); })
      .catch(() => { if (live) setPeople([]); });
    return () => { live = false; };
  }, []);

  if (!people) {
    return <p className="ca-empty" role="status" aria-live="polite">{ko ? "불러오는 중…" : "Loading…"}</p>;
  }
  const shown = people.filter((p) => !blocked.has(p.uid));
  if (shown.length === 0) return null;

  return (
    <section className="ca-shelf" aria-label={ko ? "사람들의 컬렉션" : "Collections"}>
      <header className="ca-shelf__cap">
        <span>{ko ? "사람들의 컬렉션" : "COLLECTIONS"}</span>
        <i aria-hidden="true" />
        <em>{two(shown.length)}</em>
      </header>
      <ul className="ca-shelf__grid ca-col__people">
        {shown.map((p) => {
          const name = p.card.name || (ko ? "익명" : "Unknown");
          return (
            <li key={p.uid}>
              <Link to={collectorPath(p.uid)} className="ca-plcard ca-col__card">
                <span className="ca-col__mosaic">
                  {Array.from({ length: 4 }, (_, i) => p.recent[i]).map((w, i) => (
                    <span key={i}>
                      {w?.image && (
                        <img src={getOptimizedImageUrl(w.image, 240)} alt="" loading="lazy" decoding="async"
                          onError={(event) => { event.currentTarget.style.display = "none"; }} />
                      )}
                    </span>
                  ))}
                </span>
                <span className="ca-plcard__text">
                  <span className="ca-plcard__by">
                    <RankAvatar rank={p.card.rank} name={name} src={p.card.photoURL} crop={p.card.photoCrop} size={18} />
                    <b>{name}</b>
                  </span>
                  <small>{ko ? "좋아요" : "LIKES"} {two(p.likeCount)}</small>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
