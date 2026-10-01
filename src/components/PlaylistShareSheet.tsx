import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Copy, Share2 } from "lucide-react";
import CloseButton from "./CloseButton";
import { useLanguage } from "../contexts/LanguageContext";
import { copyLink, sharePlaylist, sharedPlaylistUrl, unsharePlaylist } from "../features/playlists/sharedPlaylists";
import "./playlistShare.css";

/**
 * Sharing one of the owner's playlists. Making it public puts it at a link
 * anyone can open and on the community's playlist shelf; making it private
 * takes it off both.
 */
export default function PlaylistShareSheet({ uid, playlist, light, onClose, onChange }: {
  uid: string;
  playlist: { id: string; name?: string; shared?: boolean };
  light?: boolean;
  onClose: () => void;
  onChange: (shared: boolean) => void;
}) {
  const { t } = useLanguage();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [copied, setCopied] = useState(false);
  const shared = playlist.shared === true;
  const url = sharedPlaylistUrl(playlist.id);
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  useEffect(() => {
    const esc = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [onClose]);

  const change = async (next: boolean) => {
    setBusy(true);
    setFailed(false);
    try {
      await (next ? sharePlaylist(uid, playlist.id) : unsharePlaylist(uid, playlist.id));
      onChange(next);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (!(await copyLink(url))) return;
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  return createPortal(
    <div
      className="pls"
      data-light={light || undefined}
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="pls__card" role="dialog" aria-modal="true" aria-labelledby="pls-title">
        <CloseButton placement="corner" onClick={onClose} label={t({ ko: "닫기", en: "Close" })} light={!!light} />
        <header>
          <span>{t({ ko: "플레이리스트 공유", en: "SHARE PLAYLIST" })}</span>
        </header>
        <h2 id="pls-title">{playlist.name}</h2>
        <p className="pls__body">
          {shared
            ? t({
                ko: "공유 중이에요. 링크를 받은 누구나 바로 열어 볼 수 있고, 커뮤니티의 플레이리스트 선반에도 올라가 있어요.",
                en: "Shared: anyone with the link can open it, and it sits on the community's playlist shelf.",
              })
            : t({
                ko: "링크를 만들면 받은 사람 누구나 이 플레이리스트를 바로 열어 볼 수 있어요. 커뮤니티의 플레이리스트 선반에도 올라가요.",
                en: "With a link, anyone you send it to can open this playlist straight away, and it goes on the community's playlist shelf.",
              })}
        </p>
        {shared && <p className="pls__url">{url.replace(/^https?:\/\//, "")}</p>}
        <footer>
          {shared ? (
            <>
              <button type="button" className="pls__act pls__act--gold" onClick={() => void copy()}>
                {copied ? <Check size={14} strokeWidth={2} aria-hidden="true" /> : <Copy size={14} strokeWidth={1.8} aria-hidden="true" />}
                {copied ? t({ ko: "복사했어요", en: "Copied" }) : t({ ko: "링크 복사", en: "Copy link" })}
              </button>
              {canShare && (
                <button
                  type="button"
                  className="pls__act"
                  onClick={() => void navigator.share({ title: playlist.name, url }).catch(() => {})}
                >
                  <Share2 size={14} strokeWidth={1.8} aria-hidden="true" />
                  {t({ ko: "공유하기", en: "Share" })}
                </button>
              )}
              <button type="button" className="pls__act pls__act--quiet" disabled={busy} onClick={() => void change(false)}>
                {t({ ko: "공유 그만두기", en: "Stop sharing" })}
              </button>
            </>
          ) : (
            <button type="button" className="pls__cta" disabled={busy} onClick={() => void change(true)}>
              <span aria-hidden="true"><Share2 size={12} strokeWidth={2.2} /></span>
              {busy ? t({ ko: "공유하는 중…", en: "Sharing…" }) : t({ ko: "공유하고 링크 만들기", en: "Share and get the link" })}
            </button>
          )}
        </footer>
        {failed && (
          <p className="pls__error" role="alert">
            {t({ ko: "저장하지 못했어요. 잠시 후 다시 해 주세요.", en: "Couldn't save that. Please try again." })}
          </p>
        )}
      </div>
    </div>,
    document.body,
  );
}
