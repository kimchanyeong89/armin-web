import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MoreVertical } from "lucide-react";
import { useLanguage } from "../contexts/LanguageContext";

/**
 * A playlist's other actions behind one ⋮ mark: share, and delete (asked once
 * more in the same menu). The menu opens on the page itself, under the mark,
 * so a scrolling row of playlists cannot clip it.
 */
const MENU_WIDTH = 160;

export default function PlaylistMenu({ shared, onShare, onDelete, className, style }: {
  shared?: boolean;
  onShare: () => void;
  onDelete: () => Promise<void>;
  className?: string;
  style?: React.CSSProperties;
}) {
  const { t } = useLanguage();
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState<{ top: number; left: number } | null>(null);
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);

  const close = () => {
    setAt(null);
    setAsking(false);
  };

  useEffect(() => {
    if (!at) return;
    const outside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!menu.current?.contains(target) && !button.current?.contains(target)) close();
    };
    const esc = (event: KeyboardEvent) => event.key === "Escape" && close();
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("keydown", esc);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("keydown", esc);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [at]);

  const toggle = (event: React.MouseEvent) => {
    event.stopPropagation();
    if (at) return close();
    const r = button.current!.getBoundingClientRect();
    /* under the mark, its right edge at the mark's - but never off either side of the screen */
    setAt({ top: r.bottom + 6, left: Math.min(Math.max(8, r.right - MENU_WIDTH), window.innerWidth - MENU_WIDTH - 8) });
  };

  return (
    <>
      <button
        ref={button}
        type="button"
        className={className}
        style={style}
        aria-haspopup="menu"
        aria-expanded={!!at}
        aria-label={t({ ko: "플레이리스트 메뉴", en: "Playlist menu" })}
        title={t({ ko: "공유 · 삭제", en: "Share · Delete" })}
        onClick={toggle}
      >
        <MoreVertical size={13} strokeWidth={2.2} aria-hidden="true" />
      </button>
      {at &&
        createPortal(
          <div
            ref={menu}
            className="pl-menu"
            role="menu"
            style={{ top: at.top, left: at.left, width: MENU_WIDTH }}
            onClick={(event) => event.stopPropagation()}
          >
            {asking ? (
              <>
                <p>{t({ ko: "이 플레이리스트를 삭제할까요?", en: "Delete this playlist?" })}</p>
                <div className="pl-menu__row">
                  <button
                    type="button"
                    role="menuitem"
                    className="pl-menu__yes"
                    disabled={busy}
                    onClick={async () => {
                      setBusy(true);
                      try {
                        await onDelete();
                      } finally {
                        setBusy(false);
                        close();
                      }
                    }}
                  >
                    {busy ? t({ ko: "삭제 중", en: "Deleting" }) : t({ ko: "삭제", en: "Delete" })}
                  </button>
                  <button type="button" role="menuitem" onClick={() => setAsking(false)}>{t({ ko: "취소", en: "Cancel" })}</button>
                </div>
              </>
            ) : (
              <>
                <button type="button" role="menuitem" onClick={() => { close(); onShare(); }}>
                  {shared ? t({ ko: "공유 중", en: "Shared" }) : t({ ko: "공유", en: "Share" })}
                </button>
                <button type="button" role="menuitem" onClick={() => setAsking(true)}>{t({ ko: "삭제", en: "Delete" })}</button>
              </>
            )}
          </div>,
          document.body,
        )}
    </>
  );
}
