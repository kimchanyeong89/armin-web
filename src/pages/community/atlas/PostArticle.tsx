import { useMemo, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { collectorPath } from "../../../features/collectors/publicCollection";
import { SHOW_PUBLIC_COLLECTIONS } from "../../../config/features";
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
  authorId?: string;
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
  /** a reply names the comment it answers; replies go one level deep */
  parentId?: string | null;
  edited?: boolean;
}

/** What the reader may do with their own comment — handed to the page's comment menu. */
export interface OwnCommentActions {
  edit: () => void;
  remove: () => void;
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
  postMenu, commentMenu, myUid, onEditComment, onDeleteComment,
}: {
  post: ArticlePost;
  ko: boolean;
  comments: ArticleComment[];
  commentCount: number;
  liked: boolean;
  onLike: () => void;
  /** resolves true once the comment is taken, so the field can clear; a reply carries its parent's id */
  onComment: (text: string, parentId?: string) => boolean | Promise<boolean>;
  /** set when commenting is not possible here — the field says why */
  commentBlocked?: string;
  sending?: boolean;
  onBack: () => void;
  onDelete?: () => void;
  /** 글의 신고·차단 — 페이지가 넘겨준다 */
  postMenu?: ReactNode;
  /** 댓글마다의 신고·차단 — 내 댓글이면 수정·삭제(own) */
  commentMenu?: (comment: ArticleComment, own: OwnCommentActions | null) => ReactNode;
  /** the reader, so their own comments can be edited and deleted */
  myUid?: string | null;
  onEditComment?: (id: string, text: string) => boolean | Promise<boolean>;
  onDeleteComment?: (comment: ArticleComment) => void;
}) {
  const [text, setText] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  /* top-level comments newest first; each one's replies under it, oldest first.
     A reply whose comment was deleted stays, under a line saying so. */
  const threads = useMemo(() => {
    const ids = new Set(comments.map((c) => c.id));
    const replies = new Map<string, ArticleComment[]>();
    const roots: ArticleComment[] = [];
    for (const c of comments) {
      if (c.parentId) replies.set(c.parentId, [...(replies.get(c.parentId) ?? []), c]);
      else roots.push(c);
    }
    const lost = [...replies.keys()].filter((pid) => !ids.has(pid));
    const asc = (a: ArticleComment, b: ArticleComment) => (a.at?.getTime() ?? 0) - (b.at?.getTime() ?? 0);
    return [
      ...roots.map((c) => ({ root: c as ArticleComment | null, rootId: c.id, replies: (replies.get(c.id) ?? []).sort(asc) })),
      ...lost.map((pid) => ({ root: null, rootId: pid, replies: (replies.get(pid) ?? []).sort(asc) })),
    ];
  }, [comments]);
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
  const sendReply = async (e: FormEvent | KeyboardEvent, parentId: string) => {
    e.preventDefault();
    const body = replyText.trim();
    if (!body || sending || commentBlocked) return;
    if (await onComment(body, parentId)) { setReplyText(""); setReplyTo(null); }
  };
  const saveEdit = async (e: FormEvent | KeyboardEvent, id: string) => {
    e.preventDefault();
    const body = draft.trim();
    if (!body || !onEditComment) return;
    if (await onEditComment(id, body)) setEditing(null);
  };

  const renderComment = (c: ArticleComment, isReply: boolean) => {
    const mine = !!myUid && c.authorId === myUid;
    const own: OwnCommentActions | null = mine
      ? { edit: () => { setEditing(c.id); setDraft(c.text); }, remove: () => onDeleteComment?.(c) }
      : null;
    return (
      <div className="ca-c">
        <RankAvatar rank={c.rank} name={c.name || "?"} src={c.photo} crop={c.crop} size={isReply ? 22 : 26} />
        <div>
          <p className="ca-c__by">
            {SHOW_PUBLIC_COLLECTIONS && c.authorId
              ? <Link to={collectorPath(c.authorId)} className="ca-col__link"><b>{c.name || (ko ? "익명" : "Unknown")}</b></Link>
              : <b>{c.name || (ko ? "익명" : "Unknown")}</b>}
            {c.at && <time>{ago(c.at, ko)}</time>}
            {c.edited && <small className="ca-c__edited">{ko ? "수정됨" : "edited"}</small>}
            {commentMenu && <span style={{ marginLeft: "auto" }}>{commentMenu(c, own)}</span>}
          </p>
          {editing === c.id ? (
            <form className="ca-cbox ca-cbox--reply" onSubmit={(e) => void saveEdit(e, c.id)}>
              <textarea rows={2} autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} aria-label={ko ? "댓글 수정" : "Edit comment"}
                onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void saveEdit(e, c.id); }} />
              <span className="ca-cbox__acts">
                <button type="button" className="ca-cact" onClick={() => setEditing(null)}>{ko ? "취소" : "Cancel"}</button>
                <button type="submit" className="ca-send" disabled={!draft.trim() || draft.trim() === c.text}>{ko ? "저장" : "Save"}</button>
              </span>
            </form>
          ) : (
            <p className="ca-c__text">{c.text}</p>
          )}
          {!isReply && !commentBlocked && editing !== c.id && (
            <button type="button" className="ca-cact ca-c__reply" onClick={() => { setReplyTo(c.id); setReplyText(""); }}>
              {ko ? "답글" : "Reply"}
            </button>
          )}
        </div>
      </div>
    );
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
          {SHOW_PUBLIC_COLLECTIONS && post.authorId
            ? <Link to={collectorPath(post.authorId)} className="ca-col__link"><b>{post.authorName}</b></Link>
            : <b>{post.authorName}</b>}
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
        {threads.length > 0 && (
          <ul className="ca-clist">
            {threads.map(({ root, rootId, replies }) => (
              <li key={rootId} className="ca-thread">
                {root ? renderComment(root, false) : <p className="ca-c__gone">{ko ? "삭제된 댓글입니다." : "This comment was deleted."}</p>}
                {(replies.length > 0 || replyTo === rootId) && (
                  <ul className="ca-replies">
                    {replies.map((r) => <li key={r.id}>{renderComment(r, true)}</li>)}
                    {replyTo === rootId && (
                      <li>
                        <form className="ca-cbox ca-cbox--reply" onSubmit={(e) => void sendReply(e, rootId)}>
                          <textarea rows={2} autoFocus value={replyText} onChange={(e) => setReplyText(e.target.value)}
                            placeholder={ko ? "답글을 입력하세요…" : "Write a reply…"} aria-label={ko ? "답글" : "Reply"}
                            onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void sendReply(e, rootId); }} />
                          <span className="ca-cbox__acts">
                            <button type="button" className="ca-cact" onClick={() => { setReplyTo(null); setReplyText(""); }}>{ko ? "취소" : "Cancel"}</button>
                            <button type="submit" className="ca-send" disabled={!replyText.trim() || !!sending}>{ko ? "등록" : "Post"}</button>
                          </span>
                        </form>
                      </li>
                    )}
                  </ul>
                )}
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
