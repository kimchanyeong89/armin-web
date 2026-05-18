import React, { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  increment,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { ArrowLeft, Heart, MessageCircle, Send } from "lucide-react";
import { db } from "../../firebase";
import { useAuth } from "../../contexts/AuthContext";
import { shouldLimitNetwork } from "../../utils/network";
import { getOptimizedImageUrl } from "../../utils/imageProxy";
import { DEFAULT_COMMUNITY_RANK, resolveCommunityRank } from "../../utils/communityRank";
import { useLanguage } from "../../contexts/LanguageContext";
import type { CommunityComment, CommunityUserProfile } from "../../types/Community";
import { getSampleCommunityPost, isSampleCommunityPostId } from "../../data/sampleCommunityPosts";
import { ErrorBoundary } from "../../components/ErrorBoundary";
import { LiveAvatar, LiveName } from "../../components/LiveAuthor";

const FIRESTORE_LOAD_TIMEOUT_MS = 8000;

type Comment = CommunityComment;
type UserProfile = CommunityUserProfile;

function getDate(value: any): Date | null {
  if (!value) return null;
  if (typeof value?.toDate === "function") return value.toDate();
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function normalizeContentHtml(raw?: string, emptyLabel = "No content available."): string {
  const source = (raw || "").trim();
  if (!source) return `<p>${escapeHtml(emptyLabel)}</p>`;

  const noScript = source
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .trim();

  const noEditorControls = noScript
    .replace(/<button[^>]*class=["'][^"']*(remove-attachment-trigger|crop-trigger|edit-meta-trigger)[^"']*["'][\s\S]*?<\/button>/gi, "")
    .replace(/<div[^>]*class=["'][^"']*crop-trigger[^"']*["'][\s\S]*?<\/div>/gi, "")
    .replace(/<span[^>]*class=["'][^"']*edit-meta-trigger[^"']*["'][\s\S]*?<\/span>/gi, "")
    .replace(/data-attachment-id=["'][^"']*["']/gi, "")
    .replace(/data-attachment-type=["'][^"']*["']/gi, "");

  const hasHtmlTag = /<\s*[a-z][^>]*>/i.test(noEditorControls);
  if (hasHtmlTag) return noEditorControls;

  return noEditorControls
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, "<br/>")}</p>`)
    .join("");
}

function resolveCoverImage(post: any): string {
  if (post?.header?.image) return post.header.image;

  const content = String(post?.content || "");
  const imgTagMatch = content.match(/<img[^>]+src=["']([^"']+)["']/i);
  if (imgTagMatch?.[1]) return imgTagMatch[1];

  const urlMatch = content.match(/https?:\/\/[^\s"'>]+\.(jpg|jpeg|png|webp|gif)(\?[^\s"'>]*)?/i);
  if (urlMatch?.[0]) return urlMatch[0];

  return "https://images.unsplash.com/photo-1768726455594-b89f03126ebd?w=1400&q=80";
}

const PostDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { language, t } = useLanguage();

  const isSamplePost = isSampleCommunityPostId(id);

  const [post, setPost] = useState<any>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState("");
  const [hasLiked, setHasLiked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [authorProfile, setAuthorProfile] = useState<UserProfile | null>(null);
  const [commentProfiles, setCommentProfiles] = useState<Record<string, UserProfile>>({});

  const [isLightTheme, setIsLightTheme] = useState<boolean>(() => {
    try {
      return localStorage.getItem("homeTheme") === "light";
    } catch {
      return false;
    }
  });

  const isNetworkConstrained = shouldLimitNetwork();

  useEffect(() => {
    const syncTheme = () => {
      try {
        setIsLightTheme(localStorage.getItem("homeTheme") === "light");
      } catch {
        setIsLightTheme(false);
      }
    };

    window.addEventListener("theme-changed", syncTheme);
    window.addEventListener("storage", syncTheme);
    return () => {
      window.removeEventListener("theme-changed", syncTheme);
      window.removeEventListener("storage", syncTheme);
    };
  }, []);

  useEffect(() => {
    if (!id) return;

    setLoadError(false);

    if (isSamplePost) {
      const sample = getSampleCommunityPost(id);
      setPost(sample);
      setComments([]);
      setLoading(false);
      return;
    }

    const postRef = doc(db, "community_posts", id);
    let cancelled = false;
    const timeoutId = window.setTimeout(() => {
      if (cancelled) return;
      setLoading((wasLoading) => {
        if (wasLoading) setLoadError(true);
        return false;
      });
    }, FIRESTORE_LOAD_TIMEOUT_MS);

    const finishLoading = () => {
      if (cancelled) return;
      window.clearTimeout(timeoutId);
      setLoading(false);
    };

    if (isNetworkConstrained) {
      void (async () => {
        try {
          const docSnap = await getDoc(postRef);
          if (cancelled) return;
          setPost(docSnap.exists() ? { id: docSnap.id, ...docSnap.data() } : null);

          const commentsRef = collection(db, "community_posts", id, "comments");
          const commentsQ = query(commentsRef, orderBy("createdAt", "desc"));
          const snapshot = await getDocs(commentsQ);
          if (cancelled) return;
          setComments(snapshot.docs.map((commentDoc) => ({ id: commentDoc.id, ...commentDoc.data() } as Comment)));
        } catch {
          if (!cancelled) setLoadError(true);
        } finally {
          finishLoading();
        }
      })();

      return () => {
        cancelled = true;
        window.clearTimeout(timeoutId);
      };
    }

    const unsubscribePost = onSnapshot(
      postRef,
      (docSnap) => {
        if (cancelled) return;
        setPost(docSnap.exists() ? { id: docSnap.id, ...docSnap.data() } : null);
        finishLoading();
      },
      () => {
        if (!cancelled) {
          setLoadError(true);
          finishLoading();
        }
      },
    );

    const commentsRef = collection(db, "community_posts", id, "comments");
    const commentsQ = query(commentsRef, orderBy("createdAt", "desc"));
    const unsubscribeComments = onSnapshot(commentsQ, (snapshot) => {
      if (cancelled) return;
      setComments(snapshot.docs.map((commentDoc) => ({ id: commentDoc.id, ...commentDoc.data() } as Comment)));
    });

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
      unsubscribePost();
      unsubscribeComments();
    };
  }, [id, isNetworkConstrained, isSamplePost]);

  useEffect(() => {
    if (!post?.authorId) {
      setAuthorProfile(null);
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const profileDoc = await getDoc(doc(db, "users", post.authorId));
        if (!cancelled) {
          setAuthorProfile(profileDoc.exists() ? (profileDoc.data() as UserProfile) : null);
        }
      } catch {
        if (!cancelled) setAuthorProfile(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [post?.authorId]);

  useEffect(() => {
    const authorIds = Array.from(new Set(comments.map((comment) => comment.authorId).filter(Boolean) as string[]));
    if (authorIds.length === 0) {
      setCommentProfiles({});
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const entries = await Promise.all(
          authorIds.map(async (uid) => {
            const profileDoc = await getDoc(doc(db, "users", uid));
            return [uid, profileDoc.exists() ? (profileDoc.data() as UserProfile) : {}] as const;
          }),
        );

        if (!cancelled) {
          setCommentProfiles(Object.fromEntries(entries));
        }
      } catch {
        if (!cancelled) setCommentProfiles({});
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [comments]);

  useEffect(() => {
    if (!id || !user) {
      setHasLiked(false);
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const likeSnap = await getDoc(doc(db, "community_posts", id, "likes", user.uid));
        if (!cancelled) setHasLiked(likeSnap.exists());
      } catch {
        if (!cancelled) setHasLiked(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [id, user]);

  const handleLike = async () => {
    if (isSamplePost) {
      alert(t({ ko: "예시 게시글은 좋아요를 누를 수 없습니다.", en: "Sample posts can't be liked." }));
      return;
    }
    if (!user) {
      alert(t({ ko: "로그인이 필요합니다.", en: "Login is required." }));
      return;
    }
    if (!id) return;

    try {
      const postRef = doc(db, "community_posts", id);
      const likeRef = doc(db, "community_posts", id, "likes", user.uid);

      const liked = await runTransaction(db, async (transaction) => {
        const likeDoc = await transaction.get(likeRef);
        if (likeDoc.exists()) {
          transaction.delete(likeRef);
          transaction.update(postRef, { likes: increment(-1) });
          return false;
        }

        transaction.set(likeRef, { userId: user.uid, createdAt: serverTimestamp() });
        transaction.update(postRef, { likes: increment(1) });
        return true;
      });

      setHasLiked(liked);
      setPost((prev: any) => {
        if (!prev) return prev;
        const nextLikes = Math.max(0, Number(prev.likes || 0) + (liked ? 1 : -1));
        return { ...prev, likes: nextLikes };
      });
    } catch (error) {
      console.error("Error updating likes", error);
    }
  };

  const handleCommentSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (isSamplePost) {
      alert(t({ ko: "예시 게시글에는 댓글을 달 수 없습니다.", en: "Sample posts don't accept comments." }));
      return;
    }
    if (!user) {
      alert(t({ ko: "로그인이 필요합니다.", en: "Login is required." }));
      return;
    }
    if (!newComment.trim() || !id) return;

    setIsSubmitting(true);
    try {
      const optimisticComment: Comment = {
        id: `local-${Date.now()}`,
        text: newComment,
        authorId: user.uid,
        authorName: user.displayName || "Anonymous",
        authorPhotoURL: user.photoURL || null,
        authorRank: DEFAULT_COMMUNITY_RANK,
        createdAt: new Date(),
      };

      setComments((prev) => [optimisticComment, ...prev]);
      setPost((prev: any) => {
        if (!prev) return prev;
        return { ...prev, commentCount: Number(prev.commentCount || 0) + 1 };
      });

      await addDoc(collection(db, "community_posts", id, "comments"), {
        text: newComment,
        authorId: user.uid,
        authorName: user.displayName || "Anonymous",
        authorPhotoURL: user.photoURL || null,
        authorRank: DEFAULT_COMMUNITY_RANK,
        createdAt: serverTimestamp(),
      });

      await updateDoc(doc(db, "community_posts", id), {
        commentCount: increment(1),
      });

      setNewComment("");
    } catch (error) {
      console.error("Error adding comment", error);
      setComments((prev) => prev.filter((comment) => !String(comment.id).startsWith("local-")));
      setPost((prev: any) => {
        if (!prev) return prev;
        return { ...prev, commentCount: Math.max(0, Number(prev.commentCount || 0) - 1) };
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const colors = isLightTheme
    ? {
        pageBg: "#f6f6f6",
        shellBg: "#fbfbfb",
        text: "#111",
        medText: "#666",
        lowText: "#888",
        divider: "rgba(0,0,0,0.10)",
        panelBg: "rgba(0,0,0,0.04)",
        heroMask: "linear-gradient(to top, rgba(251,251,251,0.98) 0%, rgba(251,251,251,0.40) 55%, rgba(251,251,251,0.06) 100%)",
      }
    : {
        pageBg: "#050505",
        shellBg: "#080808",
        text: "rgba(255,255,255,0.92)",
        medText: "rgba(255,255,255,0.62)",
        lowText: "rgba(255,255,255,0.42)",
        divider: "rgba(255,255,255,0.10)",
        panelBg: "rgba(255,255,255,0.05)",
        heroMask: "linear-gradient(to top, rgba(8,8,8,0.98) 0%, rgba(8,8,8,0.42) 58%, rgba(8,8,8,0.05) 100%)",
      };

  const date = getDate(post?.createdAt);
  const contentHtml = useMemo(
    () => normalizeContentHtml(post?.content, t({ ko: "내용이 없습니다.", en: "No content available." })),
    [post?.content, t],
  );
  const coverImage = resolveCoverImage(post);
  const authorRank = resolveCommunityRank(post?.authorRank, post?.likes, post?.commentCount);
  const authorName = authorProfile?.nickname || authorProfile?.displayName || post?.authorName || t({ ko: "익명", en: "Unknown" });
  const authorPhoto = authorProfile?.photoURL || post?.authorPhotoURL || post?.authorPhoto || null;

  // Outer wrapper for ALL early-return states. Without this, the loading/
  // error divs inherit a transparent background — which on iOS WebView
  // composites against the app shell's white default and looks like a
  // pure-white "frozen" screen.
  const overlayWrap = (children: React.ReactNode) => (
    <div
      style={{
        width: "100%",
        height: "100%",
        background: colors.pageBg,
        color: colors.text,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 14,
        padding: "0 24px",
        textAlign: "center",
        fontFamily: "'Space Grotesk', 'Apple SD Gothic Neo', sans-serif",
      }}
    >
      {children}
    </div>
  );

  if (loading) {
    return overlayWrap(
      <>
        <div
          style={{
            width: 28, height: 28, borderRadius: "50%",
            border: `2px solid ${colors.divider}`,
            borderTopColor: "#D4A547",
            animation: "post-detail-spin 0.9s linear infinite",
          }}
        />
        <div style={{ color: colors.medText, fontSize: 13 }}>
          {t({ ko: "불러오는 중...", en: "Loading..." })}
        </div>
        <style>{`@keyframes post-detail-spin { to { transform: rotate(360deg); } }`}</style>
      </>,
    );
  }

  if (loadError && !post) {
    return overlayWrap(
      <>
        <div style={{ color: colors.text, fontSize: 14 }}>
          {t({ ko: "게시글을 불러오지 못했습니다.", en: "Couldn't load this post." })}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() => navigate("/community")}
            style={{ border: `1px solid ${colors.divider}`, background: colors.panelBg, color: colors.text, borderRadius: 999, padding: "8px 14px", fontSize: 12, cursor: "pointer" }}
          >
            {t({ ko: "목록으로", en: "Back to list" })}
          </button>
          <button
            onClick={() => window.location.reload()}
            style={{ border: "none", background: "#D4A547", color: "#000", borderRadius: 999, padding: "8px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
          >
            {t({ ko: "다시 시도", en: "Retry" })}
          </button>
        </div>
      </>,
    );
  }

  if (!post) {
    return overlayWrap(
      <div style={{ color: colors.medText, fontSize: 13 }}>
        {t({ ko: "게시글을 찾을 수 없습니다.", en: "Post not found." })}
      </div>,
    );
  }

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        overflowY: "auto",
        background: colors.pageBg,
        color: colors.text,
        fontFamily: "'Space Grotesk', 'Apple SD Gothic Neo', sans-serif",
      }}
    >
      <div style={{ maxWidth: 1240, margin: "0 auto", minHeight: "100%", background: colors.shellBg }}>
        <div
          style={{
            position: "sticky",
            top: 0,
            zIndex: 12,
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-start",
            padding: "14px 14px",
            paddingTop: "calc(env(safe-area-inset-top, 0px) + 14px)",
            borderBottom: `1px solid ${colors.divider}`,
            backdropFilter: "blur(16px)",
            WebkitBackdropFilter: "blur(16px)",
            background: isLightTheme ? "rgba(251,251,251,0.95)" : "rgba(8,8,8,0.95)",
          }}
        >
          <button
            onClick={() => navigate("/community")}
            style={{
              border: "none",
              background: "none",
              color: colors.medText,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 5,
              fontSize: 12,
            }}
          >
            <ArrowLeft size={14} strokeWidth={2.2} /> {t({ ko: "목록", en: "Back" })}
          </button>
        </div>

        <div style={{ position: "relative", height: 240, overflow: "hidden" }}>
          <img
            src={getOptimizedImageUrl(coverImage, 1400)}
            alt=""
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", filter: isLightTheme ? "saturate(0.72)" : "saturate(0.44) brightness(0.86)" }}
          />
          <div style={{ position: "absolute", inset: 0, background: colors.heroMask }} />
        </div>

        <div style={{ maxWidth: 920, margin: "0 auto", padding: "0 14px 90px" }}>
          <div style={{ marginTop: -24, position: "relative" }}>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                borderRadius: 999,
                padding: "4px 10px",
                background: isLightTheme ? "rgba(0,0,0,0.08)" : "rgba(255,255,255,0.12)",
                color: colors.medText,
                fontSize: 10,
                fontWeight: 600,
              }}
            >
              {post.header?.name || t({ ko: "알 수 없음", en: "Unknown" })}
            </span>
            <span style={{ marginLeft: 8, fontSize: 11, color: colors.lowText }}>
              {date ? date.toLocaleString(language === "ko" ? "ko-KR" : "en-US") : ""}
            </span>
          </div>

          <h1 style={{ margin: "16px 0 10px", fontSize: "clamp(30px, 5vw, 44px)", lineHeight: 1.15, letterSpacing: "-0.018em" }}>{post.title}</h1>

          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
            <LiveAvatar uid={post.authorId} fallbackName={authorName} fallbackPhoto={authorPhoto || undefined} size={34} style={{ borderRadius: "50%", overflow: "hidden", background: colors.panelBg }} />
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: colors.text }}><LiveName uid={post.authorId} fallbackName={authorName} /></div>
              <div style={{ fontSize: 10, color: colors.lowText }}>{authorRank}</div>
            </div>
          </div>

          <div style={{ height: 1, background: colors.divider, marginBottom: 18 }} />

          <div
            className="post-detail-content"
            style={{ color: colors.medText, fontSize: 14, lineHeight: 1.9 }}
            dangerouslySetInnerHTML={{ __html: contentHtml }}
          />

          <div style={{ marginTop: 20, borderTop: `1px solid ${colors.divider}`, borderBottom: `1px solid ${colors.divider}`, padding: "10px 0", display: "flex", alignItems: "center", gap: 16 }}>
            <button
              onClick={handleLike}
              style={{ border: "none", background: "none", color: colors.medText, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 5, padding: 0, fontSize: 12 }}
            >
              <Heart size={14} strokeWidth={2} fill={hasLiked ? "currentColor" : "none"} /> {post.likes || 0}
            </button>
            <span style={{ color: colors.medText, display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12 }}>
              <MessageCircle size={14} strokeWidth={2} /> {post.commentCount || comments.length || 0}
            </span>
          </div>

          <div style={{ marginTop: 20 }}>
            <div style={{ fontSize: 13, color: colors.text, fontWeight: 600, marginBottom: 12 }}>
              {t({ ko: "댓글", en: "Comments" })} {comments.length}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {comments.map((comment) => {
                const commentDate = getDate(comment.createdAt);
                const commentRank = resolveCommunityRank(comment.authorRank, 0, 0);
                const profile = comment.authorId ? commentProfiles[comment.authorId] : undefined;
                const commentName =
                  profile?.nickname || profile?.displayName || comment.authorName || t({ ko: "익명", en: "Anonymous" });
                const commentPhoto = profile?.photoURL || comment.authorPhotoURL || null;
                return (
                  <div key={comment.id} style={{ display: "flex", gap: 10 }}>
                    <div style={{ width: 28, height: 28, borderRadius: "50%", overflow: "hidden", background: colors.panelBg, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", color: colors.lowText, fontSize: 9 }}>
                      {commentPhoto ? (
                        <img src={commentPhoto} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      ) : (
                        commentName.slice(0, 2).toUpperCase()
                      )}
                    </div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                        <span style={{ fontSize: 11, color: colors.text, fontWeight: 600 }}>{commentName}</span>
                        <span style={{ fontSize: 10, color: colors.lowText }}>{commentRank}</span>
                        <span style={{ fontSize: 10, color: colors.lowText }}>
                          {commentDate ? commentDate.toLocaleDateString(language === "ko" ? "ko-KR" : "en-US") : ""}
                        </span>
                      </div>
                      <div style={{ fontSize: 12, color: colors.medText, lineHeight: 1.7 }}>{comment.text}</div>
                    </div>
                  </div>
                );
              })}
            </div>

            <form onSubmit={handleCommentSubmit} style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 8 }}>
              <input
                type="text"
                value={newComment}
                onChange={(event) => setNewComment(event.target.value)}
                placeholder={
                  user
                    ? t({ ko: "댓글을 입력하세요...", en: "Write a comment..." })
                    : t({ ko: "로그인이 필요합니다.", en: "Login is required." })
                }
                disabled={!user || isSubmitting}
                style={{
                  flex: 1,
                  borderRadius: 10,
                  border: `1px solid ${colors.divider}`,
                  background: colors.panelBg,
                  color: colors.text,
                  outline: "none",
                  fontSize: 12,
                  padding: "10px 12px",
                }}
              />
              <button
                type="submit"
                disabled={!user || isSubmitting || !newComment.trim()}
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 999,
                  border: "none",
                  background: newComment.trim() && user ? "#D4A547" : colors.panelBg,
                  color: newComment.trim() && user ? "#000" : colors.lowText,
                  cursor: newComment.trim() && user ? "pointer" : "not-allowed",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: 0,
                }}
              >
                <Send size={14} strokeWidth={2.1} />
              </button>
            </form>
          </div>
        </div>
      </div>

      <style>{`
        .post-detail-content p {
          margin: 0 0 14px;
        }
        .post-detail-content .post-image-container {
          max-width: min(100%, 520px) !important;
          margin: 12px 0 14px !important;
          gap: 4px !important;
        }
        .post-detail-content img {
          width: 100% !important;
          max-width: 520px !important;
          max-height: none !important;
          height: auto !important;
          object-fit: cover;
          border-radius: 10px;
          border: 1px solid ${colors.divider};
        }
        .post-detail-content .remove-attachment-trigger,
        .post-detail-content .crop-trigger,
        .post-detail-content .edit-meta-trigger {
          display: none !important;
        }
        .post-detail-content .att-title {
          font-size: 18px !important;
          font-weight: 700 !important;
          line-height: 1.3 !important;
          color: ${colors.text} !important;
          margin-top: 2px !important;
        }
        .post-detail-content .att-artist {
          font-size: 14px !important;
          font-weight: 600 !important;
          color: ${colors.medText} !important;
          margin-top: 2px !important;
        }
        .post-detail-content .att-meta {
          font-size: 13px !important;
          font-weight: 500 !important;
          color: ${colors.lowText} !important;
          margin-top: 3px !important;
        }
      `}</style>
    </div>
  );
};

const PostDetailPageWithBoundary: React.FC = () => (
  <ErrorBoundary label="게시글">
    <PostDetailPage />
  </ErrorBoundary>
);

export default PostDetailPageWithBoundary;
