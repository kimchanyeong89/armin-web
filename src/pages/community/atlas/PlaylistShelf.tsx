import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { RankAvatar } from "../../../components/RankAvatar";
import { usePublicProfiles } from "../../../features/community/publicProfile";
import { listSharedPlaylists, sharedPlaylistPath, type SharedPlaylist } from "../../../features/playlists/sharedPlaylists";
import { getOptimizedImageUrl } from "../../../utils/imageProxy";
import { ago, two } from "./shared";

/**
 * The community's playlist shelf: the playlists their owners made public, the
 * most recently changed first. Each is its cover with softened corners, its
 * name, whose it is and how many works it holds.
 */
export default function PlaylistShelf({ ko }: { ko: boolean }) {
  /* null while loading */
  const [lists, setLists] = useState<SharedPlaylist[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    listSharedPlaylists()
      .then((found) => { if (live) setLists(found); })
      .catch(() => {
        if (!live) return;
        setFailed(true);
        setLists([]);
      });
    return () => { live = false; };
  }, []);

  const owners = usePublicProfiles((lists || []).map((list) => list.ownerUid));

  if (!lists) {
    return <p className="ca-empty" role="status" aria-live="polite">{ko ? "불러오는 중…" : "Loading…"}</p>;
  }
  if (lists.length === 0) {
    return (
      <div className="ca-empty">
        <p>
          {failed
            ? (ko ? "플레이리스트를 불러오지 못했어요." : "Couldn't load the playlists.")
            : (ko ? "아직 공개된 플레이리스트가 없어요." : "No public playlists yet.")}
        </p>
        <div className="ca-empty__acts">
          <Link to="/mypage">{ko ? "마이페이지에서 공개하기" : "Share one from My Page"}</Link>
        </div>
      </div>
    );
  }

  return (
    <section className="ca-shelf" aria-label={ko ? "공개된 플레이리스트" : "Public playlists"}>
      <header className="ca-shelf__cap">
        <span>{ko ? "공개된 플레이리스트" : "PUBLIC PLAYLISTS"}</span>
        <i aria-hidden="true" />
        <em>{two(lists.length)}</em>
      </header>
      <ul className="ca-shelf__grid">
        {lists.map((list) => {
          const owner = owners[list.ownerUid];
          const name = owner?.name || (ko ? "익명" : "Unknown");
          return (
            <li key={list.id}>
              <Link to={sharedPlaylistPath(list.id)} className="ca-plcard">
                <span className="ca-plcard__cover">
                  {list.coverImage && (
                    <img src={getOptimizedImageUrl(list.coverImage, 480)} alt="" loading="lazy" decoding="async"
                      onError={(event) => { event.currentTarget.style.display = "none"; }} />
                  )}
                </span>
                <span className="ca-plcard__text">
                  <b>{list.name}</b>
                  <span className="ca-plcard__by">
                    <RankAvatar rank={owner?.rank} name={name} src={owner?.photoURL} crop={owner?.photoCrop} size={16} />
                    <span>{name}</span>
                  </span>
                  <small>
                    {two(list.itemCount)} {ko ? "작품" : list.itemCount === 1 ? "work" : "works"}
                    {list.updatedAt && ` · ${ago(list.updatedAt, ko)}`}
                  </small>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
