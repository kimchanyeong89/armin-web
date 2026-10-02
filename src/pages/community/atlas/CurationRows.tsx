import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { RankAvatar } from "../../../components/RankAvatar";
import { useAuth } from "../../../contexts/AuthContext";
import { SHOW_PUBLIC_COLLECTIONS } from "../../../config/features";
import {
  collectorPath, listCollectors, readCollection, type CollectedWork,
} from "../../../features/collectors/publicCollection";
import {
  curationKey, followCuration, unfollowCuration, useFollowedCurations, type CurationRef,
} from "../../../features/collectors/followCuration";
import { usePublicProfiles, type PublicProfile } from "../../../features/community/publicProfile";
import { useBlockedUsers } from "../../../features/community/moderation";
import { listSharedPlaylists, sharedPlaylistPath } from "../../../features/playlists/sharedPlaylists";
import { getOptimizedImageUrl } from "../../../utils/imageProxy";
import { two } from "./shared";

const STRIP = 12;

interface Row extends CurationRef {
  key: string;
  count: number;
  works: CollectedWork[];
  /** every work, when the row already holds them (a shared playlist carries its copy) */
  all: CollectedWork[] | null;
  path: string;
  card?: PublicProfile;
  at: number;
}

const when = (value: any): number =>
  typeof value?.toMillis === "function" ? value.toMillis() : value instanceof Date ? value.getTime() : typeof value === "number" ? value : 0;

/**
 * The community's curation, one row each: whose it is and what it is at the
 * left with a follow switch, its works sliding to the right, and at the end
 * "more", which opens the whole of it under the row. People's liked works
 * (when they put them on show) and their shared playlists are rows alike;
 * the ones the reader follows come first.
 */
export default function CurationRows({ ko }: { ko: boolean }) {
  const { user } = useAuth();
  const followed = useFollowedCurations(user?.uid);
  const { blocked } = useBlockedUsers();
  const [rows, setRows] = useState<Row[] | null>(null);

  /* the reader putting their own curation on show (CurationInvite) redraws the rows */
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const again = () => setTick((n) => n + 1);
    window.addEventListener("colly:curation", again);
    return () => window.removeEventListener("colly:curation", again);
  }, []);

  useEffect(() => {
    let live = true;
    Promise.all([
      SHOW_PUBLIC_COLLECTIONS ? listCollectors(36, STRIP).catch(() => []) : Promise.resolve([]),
      listSharedPlaylists().catch(() => []),
    ]).then(([people, lists]) => {
      if (!live) return;
      const likeRows: Row[] = people.map((p) => ({
        kind: "likes", ownerUid: p.uid, title: ko ? "좋아요한 작품" : "Liked works",
        key: curationKey({ kind: "likes", ownerUid: p.uid }), count: p.likeCount, works: p.recent, all: null,
        path: collectorPath(p.uid), card: p.card, at: when(p.recent[0]?.likedAt),
      }));
      const listRows: Row[] = lists.filter((l) => l.items.length > 0).map((l) => ({
        kind: "playlist", ownerUid: l.ownerUid, playlistId: l.id, title: l.name || (ko ? "이름 없는 큐레이션" : "Untitled"),
        key: curationKey({ kind: "playlist", ownerUid: l.ownerUid, playlistId: l.id }), count: l.itemCount || l.items.length,
        works: l.items.slice(0, STRIP) as CollectedWork[], all: l.items as CollectedWork[], path: sharedPlaylistPath(l.id), at: when(l.updatedAt),
      }));
      setRows([...likeRows, ...listRows].sort((a, b) => b.at - a.at));
    });
    return () => { live = false; };
  }, [tick, ko]);

  const cards = usePublicProfiles((rows || []).filter((r) => !r.card).map((r) => r.ownerUid));
  const shown = useMemo(() => {
    const list = (rows || []).filter((r) => !blocked.has(r.ownerUid));
    /* followed first, each group newest first */
    return [...list.filter((r) => followed.has(r.key)), ...list.filter((r) => !followed.has(r.key))];
  }, [rows, blocked, followed]);

  if (!rows) return <p className="ca-empty" role="status" aria-live="polite">{ko ? "불러오는 중…" : "Loading…"}</p>;
  if (shown.length === 0) {
    return <div className="ca-empty"><p>{ko ? "아직 올라온 큐레이션이 없어요." : "No curations yet."}</p></div>;
  }

  return (
    <section className="ca-shelf" aria-label={ko ? "큐레이션" : "Curations"}>
      <header className="ca-shelf__cap">
        <span>{ko ? "사람들의 큐레이션" : "CURATIONS"}</span>
        <i aria-hidden="true" />
        <em>{two(shown.length)}</em>
      </header>
      <ul className="ca-crows">
        {shown.map((r) => (
          <CurationRow key={r.key} row={r} card={r.card ?? cards[r.ownerUid]} ko={ko}
            uid={user && !user.isAnonymous ? user.uid : null} following={followed.has(r.key)} />
        ))}
      </ul>
    </section>
  );
}

function CurationRow({ row, card, ko, uid, following }: {
  row: Row; card?: PublicProfile; ko: boolean; uid: string | null; following: boolean;
}) {
  const strip = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [all, setAll] = useState<CollectedWork[] | null>(row.all);
  const [busy, setBusy] = useState(false);
  const name = card?.name || (ko ? "익명" : "Unknown");
  const mine = uid === row.ownerUid;

  const more = async () => {
    setOpen(true);
    if (all) return;
    /* liked works load whole only when asked for */
    const collection = await readCollection(row.ownerUid, uid).catch(() => null);
    setAll(collection?.likes ?? row.works);
  };

  const toggleFollow = async () => {
    if (!uid) {
      window.alert(ko ? "로그인하면 큐레이션을 팔로우할 수 있어요." : "Sign in to follow a curation.");
      return;
    }
    setBusy(true);
    try {
      if (following) await unfollowCuration(uid, row);
      else await followCuration(uid, row);
    } catch {
      window.alert(ko ? "저장하지 못했어요. 잠시 후 다시 해 주세요." : "Couldn't save that. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const slide = (dir: 1 | -1) => strip.current?.scrollBy({ left: dir * strip.current.clientWidth * 0.8, behavior: "smooth" });
  const tile = (w: CollectedWork, i: number) => (
    <Link key={`${w.id}-${i}`} to={row.path} className="ca-crow__work" title={[w.title, w.artist].filter(Boolean).join(" — ")}>
      {w.image && (
        <img src={getOptimizedImageUrl(String(w.image), 240)} alt="" loading="lazy" decoding="async"
          onError={(event) => { event.currentTarget.style.visibility = "hidden"; }} />
      )}
    </Link>
  );

  return (
    <li className={following ? "ca-crow is-following" : "ca-crow"}>
      <div className="ca-crow__head">
        <Link to={row.path} className="ca-crow__who">
          <RankAvatar rank={card?.rank} name={name} src={card?.photoURL} crop={card?.photoCrop} size={30} />
          <span>
            <b>{row.title}</b>
            <small>{name} · {two(row.count)}{ko ? "점" : ""}</small>
          </span>
        </Link>
        {!mine && (
          <button type="button" className="ca-follow" aria-pressed={following} disabled={busy} onClick={() => void toggleFollow()}>
            {following ? (ko ? "팔로잉" : "Following") : (ko ? "팔로우" : "Follow")}
          </button>
        )}
      </div>

      {!open ? (
        <div className="ca-crow__lane">
          <button type="button" className="ca-crow__nav ca-crow__nav--prev" onClick={() => slide(-1)} aria-label={ko ? "앞으로" : "Back"}>
            <ChevronLeft size={16} strokeWidth={1.8} />
          </button>
          <div className="ca-crow__strip" ref={strip}>
            {row.works.map(tile)}
            <button type="button" className="ca-crow__more" onClick={() => void more()}>
              <span>{ko ? "더보기" : "More"}</span>
              <small>{two(row.count)}</small>
            </button>
          </div>
          <button type="button" className="ca-crow__nav ca-crow__nav--next" onClick={() => slide(1)} aria-label={ko ? "더 보기" : "Next"}>
            <ChevronRight size={16} strokeWidth={1.8} />
          </button>
        </div>
      ) : (
        <div className="ca-crow__all">
          {all ? <div className="ca-crow__grid">{all.map(tile)}</div> : <p className="ca-empty" role="status">{ko ? "불러오는 중…" : "Loading…"}</p>}
          <button type="button" className="ca-cact ca-crow__fold" onClick={() => setOpen(false)}>{ko ? "접기" : "Fold"}</button>
        </div>
      )}
    </li>
  );
}
