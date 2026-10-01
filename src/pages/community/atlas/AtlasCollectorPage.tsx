import { useEffect, useState, type ReactNode } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Play } from "lucide-react";
import { ArtworkLightbox } from "../../../components/ArtworkLightbox";
import { PlaylistModal } from "../../../components/PlaylistModal";
import Slideshow from "../../../components/Slideshow";
import { RankAvatar } from "../../../components/RankAvatar";
import { useAuth } from "../../../contexts/AuthContext";
import { useLanguage } from "../../../contexts/LanguageContext";
import {
  readCollection,
  setCollectionHidden,
  type CollectedWork,
  type Collection,
  type CollectorPlaylist,
} from "../../../features/collectors/publicCollection";
import { useLikedArtworkSet } from "../../../hooks/useLikedArtworkSet";
import { prettifyArtistName } from "../../../utils/canonicalArtist";
import { getOptimizedImageUrl } from "../../../utils/imageProxy";
import { two, useHomeTheme } from "./shared";
import "./atlas.css";
/* the works' title lines are My Page's own */
import "../../../components/mypageRedesign.css";

/**
 * /community/u/:uid — someone's collection as anyone sees it: the works they
 * liked and their playlists. A work opens large, where the reader can like it
 * or put it in a playlist of their own. The owner sees the same page, with the
 * switch that hides it from everyone else.
 */
export default function AtlasCollectorPage() {
  const { uid = "" } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { language } = useLanguage();
  const ko = language === "ko";
  const isLight = useHomeTheme();
  const { isLiked, toggleLike } = useLikedArtworkSet();
  /* undefined while loading; null when it could not be read */
  const [found, setFound] = useState<Collection | null | undefined>(undefined);
  const [tab, setTab] = useState<"likes" | "playlists">("likes");
  const [openList, setOpenList] = useState<CollectorPlaylist | null>(null);
  const [viewing, setViewing] = useState<CollectedWork | null>(null);
  const [saving, setSaving] = useState<CollectedWork | null>(null);
  const [playFrom, setPlayFrom] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const own = !!user && !user.isAnonymous && user.uid === uid;

  useEffect(() => {
    let live = true;
    setFound(undefined);
    setOpenList(null);
    readCollection(uid, user?.uid)
      .then((c) => { if (live) setFound(c); })
      .catch(() => { if (live) setFound(null); });
    return () => { live = false; };
  }, [uid, user?.uid]);

  const back = () => (location.key !== "default" ? navigate(-1) : navigate("/community?view=curation"));

  const toggleHidden = async () => {
    if (!found || !own) return;
    setBusy(true);
    try {
      await setCollectionHidden(uid, !found.hidden);
      setFound({ ...found, hidden: !found.hidden });
    } catch {
      /* the switch stays where it was */
    } finally {
      setBusy(false);
    }
  };

  const shell = (body: ReactNode) => (
    <div className="ca ca--app" data-light={isLight || undefined}>
      <main className="ca-main">
        <div className="ca-pl">
          <div className="ca-post__bar">
            <button type="button" className="ca-back" onClick={back}>
              <ArrowLeft size={12} strokeWidth={2} aria-hidden="true" />
              {ko ? "큐레이션" : "CURATION"}
            </button>
          </div>
          {body}
        </div>
      </main>
    </div>
  );

  if (found === undefined) {
    return shell(<p className="ca-empty" role="status" aria-live="polite">{ko ? "불러오는 중…" : "Loading…"}</p>);
  }
  if (found === null) {
    return shell(<p className="ca-empty">{ko ? "컬렉션을 불러오지 못했어요." : "Couldn't load this collection."}</p>);
  }

  const name = found.card?.name || (ko ? "익명" : "Unknown");
  if (found.hidden && !own) {
    return shell(<p className="ca-empty">{ko ? `${name} 님은 컬렉션을 숨겨 두었어요.` : `${name} keeps their collection hidden.`}</p>);
  }

  const works = openList ? openList.items : found.likes;
  const playing = playFrom === null ? null : [...works.slice(playFrom), ...works.slice(0, playFrom)];

  const grid = (list: CollectedWork[]) =>
    list.length === 0 ? (
      <p className="ca-empty">{ko ? "아직 담긴 작품이 없어요." : "Nothing here yet."}</p>
    ) : (
      <ul className="ca-pl__grid">
        {list.map((item, index) => (
          <li key={`${item.id}-${index}`}>
            <button type="button" className="ca-pl__work" onClick={() => setViewing(item)}>
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
    );

  return shell(
    <>
      <section className="ca-pl__lead colly-rise">
        <p className="ca-pl__eyebrow">{ko ? "컬렉션" : "COLLECTION"}</p>
        <h1 className="ca-col__name">
          <RankAvatar rank={found.card?.rank} name={name} src={found.card?.photoURL} crop={found.card?.photoCrop} size={40} />
          <span>{name}</span>
        </h1>
        <div className="ca-pl__by">
          {found.card?.rank && (<><b>{found.card.rank}</b><i aria-hidden="true" /></>)}
          <em>{ko ? "좋아요" : "LIKES"} {two(found.likes.length)}</em>
          <i aria-hidden="true" />
          <em>{ko ? "플레이리스트" : "PLAYLISTS"} {two(found.playlists.length)}</em>
        </div>
        {own && (
          <p className="ca-col__own">
            {found.hidden
              ? (ko ? "숨겨 두었어요. 지금은 나만 볼 수 있어요." : "Hidden. Only you can see this page.")
              : (ko ? "다른 사람에게 이렇게 보여요." : "This is how others see your collection.")}
            <button type="button" disabled={busy} onClick={() => void toggleHidden()}>
              {found.hidden ? (ko ? "다시 공개하기" : "Show it again") : (ko ? "숨기기" : "Hide it")}
            </button>
          </p>
        )}
      </section>

      {openList ? (
        <>
          <div className="ca-col__list">
            <button type="button" className="ca-back" onClick={() => setOpenList(null)}>
              <ArrowLeft size={12} strokeWidth={2} aria-hidden="true" />
              {ko ? "플레이리스트" : "PLAYLISTS"}
            </button>
            <h2>{openList.name}</h2>
            <button
              type="button"
              className="ca-pl__play"
              onClick={() => setPlayFrom(0)}
              disabled={openList.items.length === 0}
              title={ko ? "슬라이드쇼 재생" : "Play slideshow"}
              aria-label={ko ? "슬라이드쇼 재생" : "Play slideshow"}
            >
              <Play size={13} strokeWidth={2.2} aria-hidden="true" />
            </button>
          </div>
          {grid(openList.items)}
        </>
      ) : (
        <>
          <div className="ca-sort ca-sort--wide" role="group" aria-label={ko ? "보기" : "View"} data-i={tab === "playlists" ? 1 : 0}>
            <button type="button" aria-pressed={tab === "likes"} onClick={() => setTab("likes")}>
              {ko ? "좋아요" : "Likes"}
            </button>
            <button type="button" aria-pressed={tab === "playlists"} onClick={() => setTab("playlists")}>
              {ko ? "플레이리스트" : "Playlists"}
            </button>
            <i className="ca-sort__bar" aria-hidden="true" />
          </div>
          {tab === "likes" ? (
            grid(found.likes)
          ) : found.playlists.length === 0 ? (
            <p className="ca-empty">{ko ? "아직 만든 플레이리스트가 없어요." : "No playlists yet."}</p>
          ) : (
            <ul className="ca-shelf__grid ca-col__shelf">
              {found.playlists.map((list) => (
                <li key={list.id}>
                  <button type="button" className="ca-plcard" onClick={() => setOpenList(list)}>
                    <span className="ca-plcard__cover">
                      {list.coverImage && (
                        <img src={getOptimizedImageUrl(list.coverImage, 480)} alt="" loading="lazy" decoding="async"
                          onError={(event) => { event.currentTarget.style.display = "none"; }} />
                      )}
                    </span>
                    <span className="ca-plcard__text">
                      <b>{list.name}</b>
                      <small>{two(list.items.length)} {ko ? "작품" : list.items.length === 1 ? "work" : "works"}</small>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {viewing && (
        <ArtworkLightbox
          artwork={viewing}
          onClose={() => setViewing(null)}
          isLiked={isLiked(viewing.id)}
          onToggleLike={(_event, artwork) => void toggleLike(artwork)}
          onSaveToPlaylist={(artwork) => setSaving(artwork)}
          hideMuseumAction
          hidePurchaseAction
          likedArtworksList={works}
          onChangeArtwork={setViewing}
        />
      )}
      {saving && <PlaylistModal isOpen onClose={() => setSaving(null)} item={saving} itemType="artwork" />}
      {playing && <Slideshow artworks={playing} onClose={() => setPlayFrom(null)} />}
    </>,
  );
}
