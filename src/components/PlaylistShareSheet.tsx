import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Copy, Share2, X } from "lucide-react";
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
        <header>
          <span>{t({ ko: "플레이리스트 공유", en: "SHARE PLAYLIST" })}</span>
          <button type="button" className="pls__close" onClick={onClose} aria-label={t({ ko: "닫기", en: "Close" })}>
            <X size={16} strokeWidth={1.8} aria-hidden="true" />
          </button>
        </header>
        <h2 id="pls-title">{playlist.name}</h2>
        <p className="pls__body">
          {shared
            ? t({
                ko: "공개 중이에요. 링크를 받은 누구나 볼 수 있고, 커뮤니티의 플레이리스트에도 보여요.",
                en: "Public: anyone with the link can see it, and it shows in the community's playlists.",
              })
            : t({
                ko: "공개하면 링크를 받은 누구나 이 플레이리스트를 볼 수 있어요. 커뮤니티의 플레이리스트에도 올라가요.",
                en: "Once public, anyone with the link can see this playlist, and it shows in the community's playlists.",
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
                {t({ ko: "비공개로 돌리기", en: "Make private" })}
              </button>
            </>
          ) : (
            <button type="button" className="pls__cta" disabled={busy} onClick={() => void change(true)}>
              <span aria-hidden="true"><Share2 size={12} strokeWidth={2.2} /></span>
              {busy ? t({ ko: "공개하는 중…", en: "Making it public…" }) : t({ ko: "공개하고 링크 만들기", en: "Make public and get the link" })}
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
