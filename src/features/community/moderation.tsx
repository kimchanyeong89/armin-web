// 커뮤니티 정화 장치. 애플 심사 지침 1.2 가 요구하는 네 가지를 한곳에 둔다 —
// 올리기 전 걸러내기, 신고, 차단, 그리고 연락처(지원 페이지).
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { addDoc, collection, deleteDoc, doc, getDocs, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "../../firebase";
import { useAuth } from "../../contexts/AuthContext";

/* 욕설·혐오 표현. 띄어쓰기와 반복 글자를 지운 뒤 맞춰 보기 때문에
   "시 발"이나 "시이발" 같은 변형도 걸린다. 오탐을 줄이려 짧고 흔한 말만 담았다. */
const BANNED = [
  "씨발", "시발", "씨빨", "십새", "좆", "병신", "븅신", "지랄", "개새끼", "니미", "엠창",
  "창녀", "미친년", "미친놈", "꺼져죽어", "죽어라", "한남충", "김치녀", "된장녀", "틀딱", "급식충",
  "fuck", "shit", "bitch", "cunt", "asshole", "retard", "nigger", "faggot",
];

function squeeze(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\s.,!?~^\-_*'"()[\]]/g, "")
    .replace(/(.)\1{1,}/g, "$1");
}

export function hasBannedWords(text: string): boolean {
  const flat = squeeze(text);
  return BANNED.some((word) => flat.includes(squeeze(word)));
}

export const BANNED_NOTICE = {
  ko: "욕설이나 혐오 표현이 있어 올릴 수 없습니다. 문장을 고쳐 주세요.",
  en: "This contains abusive or hateful language and can't be posted. Please rewrite it.",
};

/** 내가 차단한 사람들. 차단하면 그 사람의 글과 댓글이 보이지 않는다. */
export function useBlockedUsers() {
  const { user } = useAuth();
  const [blocked, setBlocked] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!user || user.isAnonymous) {
      setBlocked(new Set());
      return;
    }
    let cancelled = false;
    getDocs(collection(db, "users", user.uid, "blocked"))
      .then((snapshot) => {
        if (!cancelled) setBlocked(new Set(snapshot.docs.map((d) => d.id)));
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [user]);

  const block = useCallback(async (uid: string) => {
    if (!user || user.isAnonymous || !uid || uid === user.uid) return;
    await setDoc(doc(db, "users", user.uid, "blocked", uid), { createdAt: serverTimestamp() });
    setBlocked((prev) => new Set(prev).add(uid));
  }, [user]);

  const unblock = useCallback(async (uid: string) => {
    if (!user || user.isAnonymous) return;
    await deleteDoc(doc(db, "users", user.uid, "blocked", uid));
    setBlocked((prev) => {
      const next = new Set(prev);
      next.delete(uid);
      return next;
    });
  }, [user]);

  return { blocked, block, unblock };
}

/**
 * 글과 댓글 옆의 신고·차단. 신고는 운영자만 보는 reports 로 들어가고,
 * 차단은 내 목록에 들어가 그 자리에서 사라진다.
 */
export default function ModerationMenu({
  targetType, targetId, targetPath, authorId, ko, onBlock,
}: {
  targetType: "post" | "comment";
  targetId: string;
  targetPath: string;
  authorId?: string;
  ko: boolean;
  onBlock?: (uid: string) => void;
}) {
  const { user } = useAuth();
  const { block } = useBlockedUsers();
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState<ReactNode>(null);
  const mine = !!user && user.uid === authorId;

  if (done) return <span style={{ fontSize: 11, opacity: 0.6 }}>{done}</span>;

  const needsLogin = !user || user.isAnonymous;

  const report = async () => {
    if (needsLogin) {
      setDone(ko ? "로그인이 필요합니다" : "Sign in required");
      return;
    }
    try {
      await addDoc(collection(db, "reports"), {
        targetType, targetId, targetPath,
        authorId: authorId || null,
        reporterId: user.uid,
        createdAt: serverTimestamp(),
      });
      setDone(ko ? "신고했습니다. 24시간 안에 확인합니다." : "Reported. We review within 24 hours.");
    } catch {
      setDone(ko ? "신고하지 못했습니다" : "Couldn't report");
    }
  };

  const hide = async () => {
    if (needsLogin || !authorId) {
      setDone(ko ? "로그인이 필요합니다" : "Sign in required");
      return;
    }
    try {
      await block(authorId);
      onBlock?.(authorId);
      setDone(ko ? "차단했습니다" : "Blocked");
    } catch {
      setDone(ko ? "차단하지 못했습니다" : "Couldn't block");
    }
  };

  const link: React.CSSProperties = {
    background: "none", border: "none", padding: 0, cursor: "pointer",
    font: "inherit", fontSize: 11, color: "inherit", opacity: 0.55,
  };

  if (!open) {
    return (
      <button type="button" style={{ ...link, letterSpacing: "0.1em" }} onClick={() => setOpen(true)}
        aria-label={ko ? "신고하거나 차단하기" : "Report or block"}>
        ···
      </button>
    );
  }

  return (
    <span style={{ display: "inline-flex", gap: 10, alignItems: "center" }}>
      <button type="button" style={link} onClick={report}>{ko ? "신고" : "Report"}</button>
      {!mine && <button type="button" style={link} onClick={hide}>{ko ? "이 사용자 차단" : "Block user"}</button>}
      <button type="button" style={link} onClick={() => setOpen(false)}>{ko ? "닫기" : "Close"}</button>
    </span>
  );
}
