import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { ArrowLeft, MessageSquare, Trash2 } from "lucide-react";
import { LikeIcon } from "../../../components/like/LikeIcon";
import { normalizeCommunityCategory, normalizeCommunityHeaderType } from "../../../features/community/communityFeed";
import { getOptimizedImageUrl } from "../../../utils/imageProxy";
import { toProse } from "./prose";
import { CATEGORY_LABEL, TARGET_LABEL, ago, catStyle, two } from "./shared";
import { RankAvatar } from "../../../components/RankAvatar";
import type { ProfileImageCrop } from "../../../types/Profile";

export interface ArticlePost {
  title: string;
  category?: string;
  header?: { id?: string; type?: string; name?: string; image?: string | null } | null;
  authorName: string;
  authorPhoto?: string | null;
  authorPhotoCrop?: ProfileImageCrop | null;
  authorRank?: string;
  createdAt: Date | null;
  likes: number;
  content?: string;
}

export interface ArticleComment {
  id: string;
  authorId?: string;
  name: string;
  photo?: string | null;
  crop?: ProfileImageCrop | null;
  rank?: string;
  text: string;
  at: Date | null;
}

const stamp = (d: Date) =>
  `${d.getFullYear()}.${two(d.getMonth() + 1)}.${two(d.getDate())} ${two(d.getHours())}:${two(d.getMinutes())}`;

/**
 * The post as the artwork detail reads: the subject shown whole, a mono line
 * of record, the title, then one reading column, then likes and comments.
 * It only draws — the page around it decides where a like or a comment goes.
 */
export default function PostArticle({
  post, ko, comments, commentCount, liked, onLike, onComment, commentBlocked, sending, onBack, onDelete,
  postMenu, commentMenu,
}: {
  post: ArticlePost;
  ko: boolean;
  comments: ArticleComment[];
  commentCount: number;
  liked: boolean;
  onLike: () => void;
  /** resolves true once the comment is taken, so the field can clear */
  onComment: (text: string) => boolean | Promise<boolean>;
  /** set when commenting is not possible here — the field says why */
  commentBlocked?: string;
  sending?: boolean;
  onBack: () => void;
  onDelete?: () => void;
  /** 글의 신고·차단 — 페이지가 넘겨준다 */
  postMenu?: ReactNode;
  /** 댓글마다의 신고·차단 */
  commentMenu?: (comment: ArticleComment) => ReactNode;
}) {
  const [text, setText] = useState("");
  const html = useMemo(() => toProse(post.content || ""), [post.content]);
  const k = ko ? "ko" : "en";
  const cat = normalizeCommunityCategory(post.category);
  const h = post.header;
  const header = h && h.name && h.name !== "Unknown" && h.id !== "none" ? h : null;
  const headerType = header ? normalizeCommunityHeaderType(header.type) : null;

  const send = async (e: FormEvent) => {
    e.preventDefault();
    const body = text.trim();
    if (!body || sending || commentBlocked) return;
    if (await onComment(body)) setText("");
  };

  return (
    <article className="ca-post">
      <div className="ca-post__bar">
        <button type="button" className="ca-back" onClick={onBack}>
          <ArrowLeft size={13} strokeWidth={1.8} />{ko ? "목록" : "Back"}
        </button>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 12 }}>
          {postMenu}
          {onDelete && (
            <button type="button" className="ca-del" onClick={onDelete}>
              <Trash2 size={12} strokeWidth={1.8} />{ko ? "삭제" : "Delete"}
            </button>
          )}
        </span>
      </div>

      {header?.image && (
        <figure className="ca-post__cover">
          <img src={getOptimizedImageUrl(header.image, 1400)} alt={header.name || ""} />
        </figure>
      )}

      <header className="ca-post__head">
        <p className="ca-post__kicker" style={catStyle(cat)}>
          <b>{CATEGORY_LABEL[cat][k]}</b>
          {header && headerType && (
            <>
              <i aria-hidden="true" />
              <span>{TARGET_LABEL[headerType][k]} · {header.name}</span>
            </>
          )}
          {post.createdAt && (
            <>
              <i aria-hidden="true" />
              <time dateTime={post.createdAt.toISOString()}>{stamp(post.createdAt)}</time>
            </>
          )}
        </p>
        <h1>{post.title}</h1>
        <div className="ca-post__by">
          <RankAvatar rank={post.authorRank} name={post.authorName} src={post.authorPhoto} crop={post.authorPhotoCrop} size={30} />
          <b>{post.authorName}</b>
        </div>
      </header>

      {html
        ? <div className="ca-prose" dangerouslySetInnerHTML={{ __html: html }} />
        : <div className="ca-prose"><p>{ko ? "내용이 없습니다." : "No content available."}</p></div>}

      <div className="ca-post__acts">
        <button type="button" className="ca-like" aria-pressed={liked} onClick={onLike} aria-label={ko ? "좋아요" : "Like"}>
          <LikeIcon liked={liked} size={15} strokeWidth={1.8} />{post.likes}
        </button>
        <span className="ca-count"><MessageSquare size={14} strokeWidth={1.8} />{commentCount}</span>
      </div>

      <section className="ca-comments" aria-label={ko ? "댓글" : "Comments"}>
        <header className="ca-cap"><span>{ko ? "댓글" : "Comments"}</span><i /><b>{two(comments.length)}</b></header>
        {comments.length > 0 && (
          <ul className="ca-clist">
            {comments.map((c) => (
              <li key={c.id}>
                <RankAvatar rank={c.rank} name={c.name || "?"} src={c.photo} crop={c.crop} size={26} />
                <div>
                  <p className="ca-c__by">
                    <b>{c.name || (ko ? "익명" : "Unknown")}</b>
                    {c.at && <time>{ago(c.at, ko)}</time>}
                    {commentMenu && <span style={{ marginLeft: "auto" }}>{commentMenu(c)}</span>}
                  </p>
                  <p className="ca-c__text">{c.text}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
        <form className="ca-cbox" onSubmit={send}>
          <textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} disabled={!!commentBlocked}
            placeholder={commentBlocked || (ko ? "댓글을 입력하세요…" : "Write a comment…")}
            aria-label={ko ? "댓글" : "Comment"}
            onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void send(e); }} />
          <button type="submit" className="ca-send" disabled={!text.trim() || !!sending || !!commentBlocked}>
            {ko ? "등록" : "Post"}
          </button>
        </form>
      </section>
    </article>
  );
}
