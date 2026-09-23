import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "../../../firebase";
import { useAuth } from "../../../contexts/AuthContext";
import { useLanguage } from "../../../contexts/LanguageContext";
import { storedAuthor, syncPublicProfile, type PublicProfile } from "../../../features/community/publicProfile";
import Composer, { type ComposedPost } from "./Composer";
import { BANNED_NOTICE, hasBannedWords } from "../../../features/community/moderation";
import { useHomeTheme } from "./shared";
import "./atlas.css";

/** /community/write — the shared composer, saving the fields the live composer saved. */
export default function AtlasWritePage() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const { language, t } = useLanguage();
  const isLight = useHomeTheme();
  const [card, setCard] = useState<PublicProfile | null>(null);

  /* the composer's bar holds the window's top right, so the app's KO | EN
     switch steps aside while writing (index.css, data-overlay-panel) */
  useEffect(() => {
    document.documentElement.dataset.overlayPanel = "1";
    return () => {
      delete document.documentElement.dataset.overlayPanel;
    };
  }, []);

  /* the writer as they are now: the post stores this card's name, photo and level */
  useEffect(() => {
    if (!user || user.isAnonymous) return;
    let cancelled = false;
    syncPublicProfile(user)
      .then((next) => { if (!cancelled) setCard(next); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [user]);

  /* while sign-in is still being checked, show nothing rather than the gate */
  if (loading) return <div className="ca ca--app" data-light={isLight || undefined} />;
  if (!user) {
    return (
      <div className="ca ca--app ca-gate" data-light={isLight || undefined}>
        <div>
          <p>{t({ ko: "로그인이 필요합니다.", en: "Login is required." })}</p>
          <button type="button" className="ca-publish" onClick={() => navigate("/login")}>
            {t({ ko: "로그인하기", en: "Go to Login" })}
          </button>
        </div>
      </div>
    );
  }

  const publish = async (p: ComposedPost) => {
    if (hasBannedWords(`${p.title} ${p.text}`)) {
      window.alert(t(BANNED_NOTICE));
      return;
    }
    try {
      const author = storedAuthor(card, user);
      const ref = await addDoc(collection(db, "community_posts"), {
        title: p.title,
        content: p.content,
        contentSnippet: p.text.slice(0, 220),
        category: p.category,
        /* the live composer's whole-post type setting; nothing reads it now,
           but the field keeps every post the same shape */
        style: { fontSize: "body", bold: false, italic: false },
        header: p.header
          ? { id: p.header.id, type: p.header.type, name: p.header.name, image: p.header.image || null }
          : null,
        headerTypePreference: p.category === "리뷰" ? p.subject : "all",
        authorId: user.uid,
        authorName: author.authorName,
        authorPhotoURL: author.authorPhotoURL,
        authorPhoto: author.authorPhotoURL,
        authorRank: author.authorRank,
        createdAt: serverTimestamp(),
        likes: 0,
        commentCount: 0,
      });
      /* one more post can lift the writer's level */
      syncPublicProfile(user).catch(() => {});
      navigate(`/community/post/${ref.id}`, { replace: true });
    } catch (error) {
      console.error("Error creating post:", error);
      alert(t({ ko: "게시글 작성 중 오류가 발생했습니다.", en: "An error occurred while creating the post." }));
    }
  };

  return (
    <div className="ca ca--app" data-light={isLight || undefined}>
      <main className="ca-main">
        <Composer ko={language === "ko"} onPublish={publish} onCancel={() => navigate(-1)} />
      </main>
    </div>
  );
}
