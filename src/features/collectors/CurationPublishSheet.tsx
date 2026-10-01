import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import CloseButton from "../../components/CloseButton";
import { useLanguage } from "../../contexts/LanguageContext";
import { sharePlaylist, unsharePlaylist } from "../playlists/sharedPlaylists";
import { collectorPath, readCollection, readLikesPublic, setLikesPublic, type CollectorPlaylist } from "./publicCollection";
import { getOptimizedImageUrl } from "../../utils/imageProxy";
import "../../components/playlistShare.css";
import "./curationPublish.css";

/**
 * What the member puts on the community's Curation page, chosen by them and
 * nothing else: their liked works as one collection, and any of their
 * playlists, each with its own switch. Each switch saves at once.
 * Opened from the Curation page, My Page and their own collection page.
 */
export default function CurationPublishSheet({ uid, onClose, onChange }: {
  uid: string;
  onClose: () => void;
  /** after any switch: the caller may refresh what it shows */
  onChange?: () => void;
}) {
  const { t } = useLanguage();
  const [likes, setLikes] = useState<number | null>(null);
  const [likesOn, setLikesOn] = useState(false);
  const [lists, setLists] = useState<(CollectorPlaylist & { shared: boolean })[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    Promise.all([readCollection(uid, uid), readLikesPublic(uid)])
      .then(([mine, on]) => {
        if (!live) return;
        setLikes(mine.likes.length);
        setLikesOn(on);
        setLists(mine.playlists.map((p) => ({ ...p, shared: p.shared === true })));
      })
      .catch(() => { if (live) { setLikes(0); setLists([]); } });
    const esc = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", esc);
    return () => { live = false; document.removeEventListener("keydown", esc); };
  }, [uid, onClose]);

  const run = async (key: string, job: () => Promise<void>) => {
    setBusy(key);
    setFailed(false);
    try {
      await job();
      onChange?.();
    } catch {
      setFailed(true);
    } finally {
      setBusy(null);
    }
  };

  const switchRow = (key: string, on: boolean, label: string, sub: string, cover: string | undefined, flip: () => void) => (
    <li key={key}>
      <button type="button" className="cps-row" role="switch" aria-checked={on} disabled={busy === key} onClick={flip}>
        <span className="cps-row__shot">{cover && <img src={getOptimizedImageUrl(cover, 120)} alt="" loading="lazy" />}</span>
        <span className="cps-row__name"><b>{label}</b><small>{sub}</small></span>
        <i className="cps-switch" aria-hidden="true" />
      </button>
    </li>
  );

  const shownCount = (likesOn ? 1 : 0) + (lists?.filter((l) => l.shared).length ?? 0);

  return createPortal(
    <div className="pls cps" onPointerDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="pls__card" role="dialog" aria-modal="true" aria-labelledby="cps-title">
        <CloseButton placement="corner" onClick={onClose} label={t({ ko: "닫기", en: "Close" })} />
        <header><span>{t({ ko: "큐레이션에 올리기", en: "ON CURATION" })}</span></header>
        <h2 id="cps-title">{t({ ko: "무엇을 보여 줄까요?", en: "What will you show?" })}</h2>
        <p className="pls__body">
          {t({
            ko: "켠 것만 커뮤니티 큐레이션에 올라가고, 끄면 바로 내려갑니다. 이메일은 보이지 않아요.",
            en: "Only what you switch on goes on the community's Curation page, and comes off when you switch it off. Your email is never shown.",
          })}
        </p>

        {lists === null ? (
          <p className="pls__body">{t({ ko: "불러오는 중…", en: "Loading…" })}</p>
        ) : (
          <ul className="cps-list">
            {switchRow(
              "likes",
              likesOn,
              t({ ko: "좋아요한 작품", en: "Works I liked" }),
              t({ ko: `${likes ?? 0}점 · 한 묶음으로`, en: `${likes ?? 0} works, as one collection` }),
              undefined,
              () => void run("likes", async () => { await setLikesPublic(uid, !likesOn); setLikesOn(!likesOn); }),
            )}
            {lists.map((list) =>
              switchRow(
                list.id,
                list.shared,
                list.name || t({ ko: "이름 없는 플레이리스트", en: "Untitled playlist" }),
                t({ ko: `플레이리스트 · ${list.items.length}점`, en: `Playlist · ${list.items.length} works` }),
                list.coverImage,
                () => void run(list.id, async () => {
                  await (list.shared ? unsharePlaylist(uid, list.id) : sharePlaylist(uid, list.id));
                  setLists((prev) => prev && prev.map((l) => (l.id === list.id ? { ...l, shared: !l.shared } : l)));
                }),
              ),
            )}
          </ul>
        )}

        <footer>
          <span className="cps-count">{t({ ko: `${shownCount}개 올라가 있음`, en: `${shownCount} on show` })}</span>
          <Link className="pls__act pls__act--gold" to={collectorPath(uid)} onClick={onClose}>
            {t({ ko: "내 큐레이션 보기", en: "See my curation" })}
            <ArrowRight size={13} strokeWidth={2} aria-hidden="true" />
          </Link>
        </footer>
        {failed && (
          <p className="pls__error" role="alert">{t({ ko: "저장하지 못했어요. 잠시 후 다시 해 주세요.", en: "Couldn't save that. Please try again." })}</p>
        )}
      </div>
    </div>,
    document.body,
  );
}
