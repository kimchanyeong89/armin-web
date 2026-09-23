import { useEffect, useState, type ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";
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
import { db } from "../../../firebase";
import { useAuth } from "../../../contexts/AuthContext";
import { useLanguage } from "../../../contexts/LanguageContext";
import { shouldLimitNetwork } from "../../../utils/network";
import { resolveCommunityRank } from "../../../utils/communityRank";
import {
  shownAuthor,
  storedAuthor,
  syncPublicProfile,
  usePublicProfiles,
  type PublicProfile,
} from "../../../features/community/publicProfile";
import { getSampleCommunityPost, isSampleCommunityPostId } from "../../../data/sampleCommunityPosts";
import { ErrorBoundary } from "../../../components/ErrorBoundary";
import PostArticle from "./PostArticle";
import ModerationMenu, { BANNED_NOTICE, hasBannedWords, useBlockedUsers } from "../../../features/community/moderation";
import { useHomeTheme } from "./shared";
import "./atlas.css";

const LOAD_TIMEOUT_MS = 8000;

interface Comment {
  id: string;
  text: string;
  authorId?: string;
  authorName?: string;
  authorPhotoURL?: string | null;
  authorRank?: string;
  createdAt?: any;
}

function toDate(value: any): Date | null {
  if (!value) return null;
  if (typeof value?.toDate === "function") return value.toDate();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * /community/post/:id — the live post page's reading and writing, drawn by
 * the shared PostArticle: the same live subscription (a single read on a
 * slow network, an error after eight seconds), the same like transaction and
 * the same optimistic comment.
 */
function AtlasPostPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { language, t } = useLanguage();
  const ko = language === "ko";
  const isLight = useHomeTheme();
  const isSample = isSampleCommunityPostId(id);
  const constrained = shouldLimitNetwork();

  const [post, setPost] = useState<any>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [liked, setLiked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [sending, setSending] = useState(false);
  const { blocked } = useBlockedUsers();

  useEffect(() => {
    if (!id) return;
    setLoadError(false);
    if (isSample) {
      setPost(getSampleCommunityPost(id));
      setComments([]);
      setLoading(false);
      return;
    }

    const postRef = doc(db, "community_posts", id);
    const commentsQ = query(collection(db, "community_posts", id, "comments"), orderBy("createdAt", "desc"));
    let cancelled = false;
    const timeoutId = window.setTimeout(() => {
      if (cancelled) return;
      setLoading((was) => {
        if (was) setLoadError(true);
        return false;
      });
    }, LOAD_TIMEOUT_MS);
    const finish = () => {
      if (cancelled) return;
      window.clearTimeout(timeoutId);
      setLoading(false);
    };

    if (constrained) {
      void (async () => {
        try {
          const snap = await getDoc(postRef);
          if (cancelled) return;
          setPost(snap.exists() ? { id: snap.id, ...snap.data() } : null);
          const list = await getDocs(commentsQ);
          if (cancelled) return;
          setComments(list.docs.map((d) => ({ id: d.id, ...d.data() } as Comment)));
        } catch {
          if (!cancelled) setLoadError(true);
        } finally {
          finish();
        }
      })();
      return () => {
        cancelled = true;
        window.clearTimeout(timeoutId);
      };
    }

    const offPost = onSnapshot(
      postRef,
      (snap) => {
        if (cancelled) return;
        setPost(snap.exists() ? { id: snap.id, ...snap.data() } : null);
        finish();
      },
      () => {
        if (!cancelled) {
          setLoadError(true);
          finish();
        }
      },
    );
    const offComments = onSnapshot(commentsQ, (list) => {
      if (cancelled) return;
      setComments(list.docs.map((d) => ({ id: d.id, ...d.data() } as Comment)));
    });
    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
      offPost();
      offComments();
    };
  }, [id, constrained, isSample]);

  useEffect(() => {
    if (!id || !user) {
      setLiked(false);
      return;
    }
    let cancelled = false;
    getDoc(doc(db, "community_posts", id, "likes", user.uid))
      .then((snap) => { if (!cancelled) setLiked(snap.exists()); })
      .catch(() => { if (!cancelled) setLiked(false); });
    return () => { cancelled = true; };
  }, [id, user]);

  /* the reader's own card: a comment stores its name, photo and level */
  const [myCard, setMyCard] = useState<PublicProfile | null>(null);
  useEffect(() => {
    if (!user || user.isAnonymous) {
      setMyCard(null);
      return;
    }
    let cancelled = false;
    syncPublicProfile(user)
      .then((card) => { if (!cancelled) setMyCard(card); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [user]);
  /* everyone on the page as their public cards show them now */
  const cards = usePublicProfiles([post?.authorId, ...comments.map((c) => c.authorId)]);

  const onLike = async () => {
    if (isSample) {
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
      const now = await runTransaction(db, async (tx) => {
        const likeDoc = await tx.get(likeRef);
        if (likeDoc.exists()) {
          tx.delete(likeRef);
          tx.update(postRef, { likes: increment(-1) });
          return false;
        }
        tx.set(likeRef, { userId: user.uid, createdAt: serverTimestamp() });
        tx.update(postRef, { likes: increment(1) });
        return true;
      });
      setLiked(now);
      /* the live subscription brings the new count; only the one-off read needs it set by hand */
      if (constrained) {
        setPost((prev: any) => (prev ? { ...prev, likes: Math.max(0, Number(prev.likes || 0) + (now ? 1 : -1)) } : prev));
      }
    } catch (error) {
      console.error("Error updating likes", error);
    }
  };

  const onComment = async (text: string): Promise<boolean> => {
    if (!user || !id || isSample) return false;
    if (hasBannedWords(text)) {
      window.alert(t(BANNED_NOTICE));
      return false;
    }
    setSending(true);
    const author = storedAuthor(myCard, user);
    const optimistic: Comment = {
      id: `local-${Date.now()}`,
      text,
      authorId: user.uid,
      ...author,
      createdAt: new Date(),
    };
    setComments((prev) => [optimistic, ...prev]);
    setPost((prev: any) => (prev ? { ...prev, commentCount: Number(prev.commentCount || 0) + 1 } : prev));
    try {
      await addDoc(collection(db, "community_posts", id, "comments"), {
        text,
        authorId: user.uid,
        ...author,
        createdAt: serverTimestamp(),
      });
      await updateDoc(doc(db, "community_posts", id), { commentCount: increment(1) });
      return true;
    } catch (error) {
      console.error("Error adding comment", error);
      setComments((prev) => prev.filter((c) => !String(c.id).startsWith("local-")));
      setPost((prev: any) => (prev ? { ...prev, commentCount: Math.max(0, Number(prev.commentCount || 0) - 1) } : prev));
      return false;
    } finally {
      setSending(false);
    }
  };

  const shell = (body: ReactNode) => (
    <div className="ca ca--app" data-light={isLight || undefined}>
      <main className="ca-main">{body}</main>
    </div>
  );

  if (loading) {
    return shell(<p className="ca-empty" role="status" aria-live="polite">{t({ ko: "불러오는 중...", en: "Loading..." })}</p>);
  }
  if (loadError && !post) {
    return shell(
      <div className="ca-empty" role="alert">
        <p>{t({ ko: "게시글을 불러오지 못했습니다.", en: "Couldn't load this post." })}</p>
        <div className="ca-empty__acts">
          <button type="button" onClick={() => navigate("/community")}>{t({ ko: "목록으로", en: "Back to list" })}</button>
          <button type="button" onClick={() => window.location.reload()}>{t({ ko: "다시 시도", en: "Retry" })}</button>
        </div>
      </div>,
    );
  }
  if (!post) {
    return shell(<p className="ca-empty">{t({ ko: "게시글을 찾을 수 없습니다.", en: "Post not found." })}</p>);
  }

  const author = shownAuthor(post.authorId ? cards[post.authorId] : undefined, {
    name: post.authorName || t({ ko: "익명", en: "Unknown" }),
    photo: post.authorPhotoURL || post.authorPhoto || null,
    rank: resolveCommunityRank(post.authorRank, post.likes, post.commentCount),
  });

  return shell(
    <PostArticle
      post={{
        title: post.title,
        category: post.category,
        header: post.header,
        authorName: author.name,
        authorPhoto: author.photo,
        authorPhotoCrop: author.crop,
        authorRank: author.rank,
        createdAt: toDate(post.createdAt),
        likes: Number(post.likes || 0),
        content: post.content,
      }}
      ko={ko}
      comments={comments.filter((c) => !c.authorId || !blocked.has(c.authorId)).map((c) => {
        const by = shownAuthor(c.authorId ? cards[c.authorId] : undefined, {
          name: c.authorName,
          photo: c.authorPhotoURL,
          rank: c.authorRank,
        });
        return { id: c.id, authorId: c.authorId, name: by.name, photo: by.photo, crop: by.crop, rank: by.rank, text: c.text, at: toDate(c.createdAt) };
      })}
      commentCount={Number(post.commentCount || 0)}
      liked={liked}
      onLike={onLike}
      onComment={onComment}
      sending={sending}
      commentBlocked={
        !user
          ? t({ ko: "로그인이 필요합니다.", en: "Login is required." })
          : isSample
            ? t({ ko: "예시 게시글에는 댓글을 달 수 없습니다.", en: "Sample posts don't accept comments." })
            : undefined
      }
      onBack={() => navigate("/community")}
      postMenu={!isSample && id
        ? <ModerationMenu targetType="post" targetId={id} targetPath={`community_posts/${id}`} authorId={post.authorId} ko={ko} />
        : undefined}
      commentMenu={!isSample && id
        ? (c) => <ModerationMenu targetType="comment" targetId={c.id} targetPath={`community_posts/${id}/comments/${c.id}`} authorId={c.authorId} ko={ko} />
        : undefined}
    />,
  );
}

export default function AtlasPostPageWithBoundary() {
  return (
    <ErrorBoundary label="게시글">
      <AtlasPostPage />
    </ErrorBoundary>
  );
}
