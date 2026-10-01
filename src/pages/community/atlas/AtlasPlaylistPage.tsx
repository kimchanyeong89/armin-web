import { useEffect, useState, type ReactNode } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Check, Link2, Play } from "lucide-react";
import Slideshow from "../../../components/Slideshow";
import { RankAvatar } from "../../../components/RankAvatar";
import { useLanguage } from "../../../contexts/LanguageContext";
import { collectorPath } from "../../../features/collectors/publicCollection";
import { SHOW_PUBLIC_COLLECTIONS } from "../../../config/features";
import { usePublicProfiles } from "../../../features/community/publicProfile";
import {
  SHARED_ITEM_LIMIT,
  copyLink,
  readSharedPlaylist,
  sharedPlaylistUrl,
  type SharedPlaylist,
} from "../../../features/playlists/sharedPlaylists";
import { prettifyArtistName } from "../../../utils/canonicalArtist";
import { getOptimizedImageUrl } from "../../../utils/imageProxy";
import { ago, two, useHomeTheme } from "./shared";
import "./atlas.css";
/* the works' title lines are My Page's own */
import "../../../components/mypageRedesign.css";

/**
 * /community/playlist/:id — a playlist its owner made public, open to anyone
 * with the link: its name, whose it is, and its works in the grid My Page
 * draws. Pressing a work plays the playlist as a slideshow from that work.
 */
export default function AtlasPlaylistPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { language } = useLanguage();
  const ko = language === "ko";
  const isLight = useHomeTheme();
  /* undefined while loading; null when the playlist is private or gone */
  const [list, setList] = useState<SharedPlaylist | null | undefined>(undefined);
  const [playFrom, setPlayFrom] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let live = true;
    setList(undefined);
    readSharedPlaylist(id)
      .then((found) => { if (live) setList(found); })
      .catch(() => { if (live) setList(null); });
    return () => { live = false; };
  }, [id]);

  const owners = usePublicProfiles(list ? [list.ownerUid] : []);
  const owner = list ? owners[list.ownerUid] : undefined;

  /* back to wherever the reader came from; a link opened on its own goes to the shelf */
  const back = () => (location.key !== "default" ? navigate(-1) : navigate("/community?view=curation"));
  const copy = async () => {
    if (!(await copyLink(sharedPlaylistUrl(id)))) return;
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  const shell = (body: ReactNode) => (
    <div className="ca ca--app" data-light={isLight || undefined}>
      <main className="ca-main">
        <div className="ca-pl">
          <div className="ca-post__bar">
            <button type="button" className="ca-back" onClick={back}>
              <ArrowLeft size={12} strokeWidth={2} aria-hidden="true" />
              {ko ? "플레이리스트" : "PLAYLISTS"}
            </button>
          </div>
          {body}
        </div>
      </main>
    </div>
  );

  if (list === undefined) {
    return shell(<p className="ca-empty" role="status" aria-live="polite">{ko ? "불러오는 중…" : "Loading…"}</p>);
  }
  if (list === null) {
    return shell(
      <p className="ca-empty">{ko ? "비공개로 바뀌었거나 없는 플레이리스트예요." : "This playlist is private or no longer exists."}</p>,
    );
  }

  const name = owner?.name || (ko ? "익명" : "Unknown");
  const playing = playFrom === null ? null : [...list.items.slice(playFrom), ...list.items.slice(0, playFrom)];

  return shell(
    <>
      <section className="ca-pl__lead colly-rise">
        <p className="ca-pl__eyebrow">{ko ? "플레이리스트" : "PLAYLIST"}</p>
        <h1>{list.name}</h1>
        <div className="ca-pl__by">
          <RankAvatar rank={owner?.rank} name={name} src={owner?.photoURL} crop={owner?.photoCrop} size={22} />
          {SHOW_PUBLIC_COLLECTIONS
            ? <Link to={collectorPath(list.ownerUid)} className="ca-col__link"><b>{name}</b></Link>
            : <b>{name}</b>}
          <i aria-hidden="true" />
          <em>{two(list.itemCount)} {ko ? "작품" : list.itemCount === 1 ? "work" : "works"}</em>
          {list.updatedAt && (
            <>
              <i aria-hidden="true" />
              <em>{ago(list.updatedAt, ko)}</em>
            </>
          )}
        </div>
        {/* the slideshow as its circled mark alone, as on My Page, then the link
            to pass on — the top right belongs to the language switch */}
        <div className="ca-pl__acts">
          <button
            type="button"
            className="ca-pl__play"
            onClick={() => setPlayFrom(0)}
            disabled={list.items.length === 0}
            title={ko ? "슬라이드쇼 재생" : "Play slideshow"}
            aria-label={ko ? "슬라이드쇼 재생" : "Play slideshow"}
          >
            <Play size={13} strokeWidth={2.2} aria-hidden="true" />
          </button>
          <button type="button" className="ca-act" onClick={() => void copy()}>
            {copied ? <Check size={13} strokeWidth={1.8} aria-hidden="true" /> : <Link2 size={13} strokeWidth={1.8} aria-hidden="true" />}
            <span>{copied ? (ko ? "복사했어요" : "Copied") : ko ? "링크 복사" : "Copy link"}</span>
          </button>
        </div>
      </section>

      {list.items.length === 0 ? (
        <p className="ca-empty">{ko ? "아직 담긴 작품이 없어요." : "No works in this playlist yet."}</p>
      ) : (
        <ul className="ca-pl__grid">
          {list.items.map((item, index) => (
            <li key={`${item.id}-${index}`}>
              <button type="button" className="ca-pl__work" onClick={() => setPlayFrom(index)}>
                {item.image && (
                  <img src={getOptimizedImageUrl(item.image, 400)} alt={item.title} loading="lazy" decoding="async"
                    onError={(event) => { event.currentTarget.style.display = "none"; }} />
                )}
                <span className="ca-pl__shade" aria-hidden="true" />
                <span className="mp-name-line">
                  <b>{item.title}</b>
                  <small>{prettifyArtistName(item.artist) || item.museumName}</small>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {list.itemCount > list.items.length && (
        <p className="ca-pl__note">
          {ko ? `앞의 ${SHARED_ITEM_LIMIT}점만 보여요.` : `Showing the first ${SHARED_ITEM_LIMIT} works.`}
        </p>
      )}
      {playing && <Slideshow artworks={playing} onClose={() => setPlayFrom(null)} />}
    </>,
  );
}
