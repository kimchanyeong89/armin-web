import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useLanguage } from "../../contexts/LanguageContext";
import { deleteAccount } from "./deleteAccount";

// 계정 삭제. 프로필 편집 화면의 '계정 관리' 안에 둔다 — 실수로 누르기 어렵게,
// 그래도 찾을 수는 있게(스토어 심사가 앱 안에서의 경로를 확인한다).
// 한 번 더 묻고, 그다음엔 끝까지 지운다(본인 확인이 필요하면 그것부터).
export default function DeleteAccountSection({ light = false }: { light?: boolean }) {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const mute = light ? "rgba(0,0,0,0.42)" : "rgba(255,255,255,0.42)";
  const text = light ? "rgba(0,0,0,0.72)" : "rgba(255,255,255,0.72)";
  const border = light ? "rgba(0,0,0,0.12)" : "rgba(255,255,255,0.14)";

  const run = async () => {
    setBusy(true);
    setNotice(null);
    try {
      const result = await deleteAccount();
      if (result === "done") {
        navigate("/", { replace: true });
        return;
      }
      setNotice(t({
        ko: "로그인한 지 오래되어 본인 확인이 필요합니다. 아직 아무것도 지우지 않았습니다. 로그아웃 후 다시 로그인하고 바로 이 화면에서 한 번 더 눌러 주세요.",
        en: "It's been a while since you signed in, so we need to confirm it's you. Nothing was deleted. Sign out, sign in again and tap this straight away.",
      }));
      setOpen(false);
    } catch {
      setNotice(t({
        ko: "지우지 못했습니다. 잠시 뒤 다시 시도하거나 kietzland@gmail.com 으로 알려 주세요.",
        en: "Deletion failed. Try again shortly, or email kietzland@gmail.com.",
      }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ padding: "8px 0 4px", textAlign: "left" }}>
      {!open ? (
        <button
          onClick={() => setOpen(true)}
          style={{ background: "none", border: "none", color: mute, fontSize: 12, textDecoration: "underline", cursor: "pointer" }}
        >
          {t({ ko: "계정 삭제", en: "Delete account" })}
        </button>
      ) : (
        <div style={{ maxWidth: 380, margin: "0 auto", border: `1px solid ${border}`, borderRadius: 12, padding: 16 }}>
          <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.75, color: text }}>
            {t({
              ko: "계정을 지우면 프로필과 좋아요, 플레이리스트, 저장한 큐레이션, 장바구니, 커뮤니티에 남긴 글과 댓글이 함께 사라집니다. 되돌릴 수 없습니다.",
              en: "Deleting your account also removes your profile, likes, playlists, saved curations, cart, and community posts and comments. This cannot be undone.",
            })}
          </p>
          <div style={{ marginTop: 14, display: "flex", gap: 8, justifyContent: "center" }}>
            <button
              onClick={() => setOpen(false)}
              disabled={busy}
              style={{ padding: "8px 14px", borderRadius: 999, border: `1px solid ${border}`, background: "transparent", color: text, fontSize: 12, cursor: "pointer" }}
            >
              {t({ ko: "취소", en: "Cancel" })}
            </button>
            <button
              onClick={run}
              disabled={busy}
              style={{ padding: "8px 14px", borderRadius: 999, border: "none", background: "#c0392b", color: "#fff", fontSize: 12, fontWeight: 700, cursor: busy ? "default" : "pointer", opacity: busy ? 0.6 : 1 }}
            >
              {busy ? t({ ko: "지우는 중…", en: "Deleting…" }) : t({ ko: "계정 지우기", en: "Delete account" })}
            </button>
          </div>
        </div>
      )}
      {notice && (
        <p style={{ margin: "12px auto 0", maxWidth: 380, fontSize: 12, lineHeight: 1.7, color: text }}>{notice}</p>
      )}
    </div>
  );
}
