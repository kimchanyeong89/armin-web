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
  curationKey, followCuration, unfollowCuration, useFollowedCurationList, useFollowedCurations, type CurationRef,
} from "../../../features/collectors/followCuration";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../../../firebase";
import { usePublicProfiles, type PublicProfile } from "../../../features/community/publicProfile";
import { useBlockedUsers } from "../../../features/community/moderation";
import { listSharedPlaylists, sharedPlaylistPath } from "../../../features/playlists/sharedPlaylists";
import { getOptimizedImageUrl } from "../../../utils/imageProxy";
import { ArtworkLightbox } from "../../../components/ArtworkLightbox";
import { PlaylistModal } from "../../../components/PlaylistModal";
import { useLikedArtworkSet } from "../../../hooks/useLikedArtworkSet";
import { getArtistDisplayName, useArtistI18n } from "../../../i18n/artistLocalization";
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
        /* a person's liked works read as their curation: its title is drawn with their name (CurationRow) */
        kind: "likes", ownerUid: p.uid, title: "",
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

/** A work's detail, as everywhere in the app: like, save, and on to the next work of the same curation.
    Mounted only while a work is open, so a page of rows keeps no like listeners of its own. */
function WorkDetail({ work, works, onChange, onClose }: {
  work: CollectedWork; works: CollectedWork[]; onChange: (next: CollectedWork | null) => void; onClose: () => void;
}) {
  const { isLiked, toggleLike } = useLikedArtworkSet();
  const [saving, setSaving] = useState<CollectedWork | null>(null);
  return (
    <>
      <ArtworkLightbox
        artwork={work}
        onClose={onClose}
        isLiked={isLiked(work.id)}
        onToggleLike={(_event, artwork) => void toggleLike(artwork)}
        onSaveToPlaylist={(artwork) => setSaving(artwork)}
        hideMuseumAction
        hidePurchaseAction
        likedArtworksList={works}
        onChangeArtwork={onChange}
      />
      {saving && <PlaylistModal isOpen onClose={() => setSaving(null)} item={saving} itemType="artwork" />}
    </>
  );
}

function CurationRow({ row, card, ko, uid, following }: {
  row: Row; card?: PublicProfile; ko: boolean; uid: string | null; following: boolean;
}) {
  const strip = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [all, setAll] = useState<CollectedWork[] | null>(row.all);
  const [busy, setBusy] = useState(false);
  const [viewing, setViewing] = useState<CollectedWork | null>(null);
  const name = card?.name || (ko ? "익명" : "Unknown");
  const mine = uid === row.ownerUid;
  /* liked works are "<name>'s curation"; a shared playlist keeps its own name */
  const title = row.kind === "likes" ? (ko ? `${name}의 큐레이션` : `${name}'s curation`) : row.title;

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
      else await followCuration(uid, { ...row, title });
    } catch {
      window.alert(ko ? "저장하지 못했어요. 잠시 후 다시 해 주세요." : "Couldn't save that. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const slide = (dir: 1 | -1) => strip.current?.scrollBy({ left: dir * strip.current.clientWidth * 0.8, behavior: "smooth" });
  const artistMap = useArtistI18n();
  const picture = (w: CollectedWork, width: number) => w.image && (
    <img src={getOptimizedImageUrl(String(w.image), width)} alt="" loading="lazy" decoding="async"
      onError={(event) => { event.currentTarget.style.visibility = "hidden"; }} />
  );
  const words = (w: CollectedWork) => (
    <span className="ca-crow__cap">
      <b>{String(w.title || (ko ? "제목 없음" : "Untitled"))}</b>
      {w.artist && <small>{getArtistDisplayName(String(w.artist), ko ? "ko" : "en", artistMap)}</small>}
    </span>
  );
  /* in the strip: the picture, then its title and artist under it. Pressing a work opens its detail. */
  const tile = (w: CollectedWork, i: number) => (
    <button type="button" key={`${w.id}-${i}`} className="ca-crow__work" onClick={() => setViewing(w)}>
      <span className="ca-crow__shot">{picture(w, 240)}</span>
      {words(w)}
    </button>
  );
  /* opened whole: My Page's grid - the picture filling its square, title and artist on it at the lower left */
  const card5 = (w: CollectedWork, i: number) => (
    <button type="button" key={`${w.id}-${i}`} className="ca-crow__card" onClick={() => setViewing(w)}>
      {picture(w, 400)}
      {words(w)}
    </button>
  );

  return (
    <li className={following ? "ca-crow is-following" : "ca-crow"}>
      <div className="ca-crow__head">
        <Link to={row.path} className="ca-crow__who">
          <RankAvatar rank={card?.rank} name={name} src={card?.photoURL} crop={card?.photoCrop} size={30} />
          <span>
            <b>{title}</b>
            <small>{name} · {two(row.count)}{ko ? "점" : ""}</small>
          </span>
        </Link>
        {mine ? (
          <span className="ca-follow ca-follow--mine">{ko ? "내 큐레이션" : "Yours"}</span>
        ) : (
          <button type="button" className="ca-follow" aria-pressed={following} disabled={busy} onClick={() => void toggleFollow()}>
            {/* the mark turns: a plus spins away as the circle fills and a check draws in */}
            <svg className="ca-follow__mark" viewBox="0 0 20 20" aria-hidden="true">
              <circle cx="10" cy="10" r="8.5" />
              <path className="ca-follow__plus" d="M10 6.2v7.6M6.2 10h7.6" />
              <path className="ca-follow__check" d="M6.3 10.3l2.5 2.5 4.9-5.2" />
            </svg>
            <span>{following ? (ko ? "팔로잉" : "Following") : (ko ? "팔로우" : "Follow")}</span>
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
          {all ? <div className="ca-crow__grid">{all.map(card5)}</div> : <p className="ca-empty" role="status">{ko ? "불러오는 중…" : "Loading…"}</p>}
          <button type="button" className="ca-cact ca-crow__fold" onClick={() => setOpen(false)}>{ko ? "접기" : "Fold"}</button>
        </div>
      )}
      {viewing && <WorkDetail work={viewing} works={all ?? row.works} onChange={setViewing} onClose={() => setViewing(null)} />}
    </li>
  );
}

/**
 * The curations the reader follows, as the same rows - shown on My Page
 * under their own curations. A playlist whose owner stopped sharing it, or
 * liked works taken off show, simply drop out.
 */
export function FollowedCurations({ ko, uid }: { ko: boolean; uid: string }) {
  const refs = useFollowedCurationList(uid);
  const [rows, setRows] = useState<Row[] | null>(null);
  const refKey = refs.map((r) => r.key).join("|");

  useEffect(() => {
    let live = true;
    Promise.all(refs.map(async (r): Promise<Row | null> => {
      try {
        if (r.kind === "playlist" && r.playlistId) {
          const snap = await getDoc(doc(db, "public_playlists", r.playlistId));
          if (!snap.exists()) return null;
          const data = snap.data();
          const items = (Array.isArray(data.items) ? data.items : []) as CollectedWork[];
          return { ...r, title: String(data.name || r.title), count: Number(data.itemCount || items.length), works: items.slice(0, STRIP),
            all: items, path: sharedPlaylistPath(r.playlistId), at: 0 };
        }
        const collection = await readCollection(r.ownerUid, uid);
        if (!collection.likes.length) return null;
        return { ...r, title: "", count: collection.likes.length, works: collection.likes.slice(0, STRIP),
          all: collection.likes, path: collectorPath(r.ownerUid), card: collection.card ?? undefined, at: 0 };
      } catch {
        return null;
      }
    })).then((found) => { if (live) setRows(found.filter((x): x is Row => !!x)); });
    return () => { live = false; };
    // refKey stands for the list
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refKey, uid, ko]);

  const cards = usePublicProfiles((rows || []).filter((r) => !r.card).map((r) => r.ownerUid));
  if (!rows) return null;

  return (
    <section className="ca-shelf" aria-label={ko ? "팔로우한 큐레이션" : "Following"}>
      <header className="ca-shelf__cap">
        <span>{ko ? "팔로우한 큐레이션" : "FOLLOWING"}</span>
        <i aria-hidden="true" />
        <em>{two(rows.length)}</em>
      </header>
      {rows.length === 0 ? (
        <p className="ca-empty">{ko ? "커뮤니티 큐레이션 칸에서 마음에 드는 큐레이션을 팔로우하면 여기에 모입니다." : "Follow curations in the community to gather them here."}</p>
      ) : (
        <ul className="ca-crows">
          {rows.map((r) => <CurationRow key={r.key} row={r} card={r.card ?? cards[r.ownerUid]} ko={ko} uid={uid} following />)}
        </ul>
      )}
    </section>
  );
}
