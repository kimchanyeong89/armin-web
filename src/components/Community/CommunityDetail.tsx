import React, { useState, useEffect, useRef } from 'react';
import { doc, collection, addDoc, query, orderBy, onSnapshot, updateDoc, increment, serverTimestamp, getDoc, getDocs, runTransaction, writeBatch, arrayRemove, arrayUnion } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';
import { getOptimizedImageUrl } from '../../utils/imageProxy';
import { shouldLimitNetwork } from '../../utils/network';
import type { CommunityUserProfile } from '../../types/Community';

interface Comment {
    id: string;
    text: string;
    userId: string;
    userName: string;
    userPhotoURL?: string;
    createdAt: any;
    parentId?: string | null;
    likes?: string[];
    authorName?: string;
    authorId?: string;
}

type UserProfile = CommunityUserProfile;

interface CommunityDetailProps {
    postId: string;
    onBack: () => void;
}



const formatDate = (date: any) => {
    if (!date) return '';
    const d = date.toDate ? date.toDate() : new Date(date);
    const now = new Date();
    const diff = (now.getTime() - d.getTime()) / 1000;

    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return d.toLocaleDateString();
};

const CommunityDetail: React.FC<CommunityDetailProps> = ({ postId, onBack }) => {
    const { user } = useAuth();
    const [post, setPost] = useState<any>(null);
    const [comments, setComments] = useState<Comment[]>([]);
    const [userProfiles, setUserProfiles] = useState<Record<string, UserProfile>>({});

    const [newComment, setNewComment] = useState('');
    const [loading, setLoading] = useState(true);
    const [hasLiked, setHasLiked] = useState(false);

    const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
    const [editText, setEditText] = useState('');
    const [replyingToId, setReplyingToId] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const commentsEndRef = useRef<HTMLDivElement>(null);
    const isNetworkConstrained = shouldLimitNetwork();

    // Fetch Post and Likes
    useEffect(() => {
        if (!postId) return;
        const postRef = doc(db, 'community_posts', postId);

        // Constrained/mobile: one-shot reads to avoid persistent WebSockets
        if (isNetworkConstrained) {
            (async () => {
                try {
                    const docSnap = await getDoc(postRef);
                    if (docSnap.exists()) {
                        setPost({ id: docSnap.id, ...docSnap.data() });
                    } else {
                        setPost(null);
                    }
                } finally {
                    setLoading(false);
                }
            })();

            if (user) {
                const likeRef = doc(db, 'community_posts', postId, 'likes', user.uid);
                getDoc(likeRef).then(snap => {
                    setHasLiked(snap.exists());
                });
            }

            const commentsRef = collection(db, 'community_posts', postId, 'comments');
            const q = query(commentsRef, orderBy('createdAt', 'asc'));
            getDocs(q).then((snapshot) => {
                const loadedComments = snapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                } as Comment));
                setComments(loadedComments);
            }).catch(() => {
                setComments([]);
            });

            return () => { };
        }

        // Listen to post updates
        const unsubscribePost = onSnapshot(postRef, (docSnap) => {
            if (docSnap.exists()) {
                setPost({ id: docSnap.id, ...docSnap.data() });
            } else {
                setPost(null);
            }
            setLoading(false);
        });

        // Check if user liked the post
        if (user) {
            const likeRef = doc(db, 'community_posts', postId, 'likes', user.uid);
            getDoc(likeRef).then(snap => {
                setHasLiked(snap.exists());
            });
        }

        // Listen to comments
        const commentsRef = collection(db, 'community_posts', postId, 'comments');
        const q = query(commentsRef, orderBy('createdAt', 'asc'));

        const unsubscribeComments = onSnapshot(q, (snapshot) => {
            const loadedComments = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            } as Comment));
            setComments(loadedComments);
        });

        return () => {
            unsubscribePost();
            unsubscribeComments();
        };
    }, [postId, user, isNetworkConstrained]);

    // Fetch user profiles for comments
    useEffect(() => {
        if (comments.length === 0) return;

        const uniqueIds = new Set(comments.map(c => c.userId));
        if (user) uniqueIds.add(user.uid);
        const idsToFetch = Array.from(uniqueIds).filter(uid => uid && !userProfiles[uid]);
        if (idsToFetch.length === 0) return;

        let cancelled = false;
        void (async () => {
            try {
                const results = await Promise.all(
                    idsToFetch.map(async (uid) => {
                        try {
                            const snap = await getDoc(doc(db, 'users', uid));
                            if (!snap.exists()) return null;
                            const d = snap.data();
                            return [uid, { nickname: d.nickname, photoURL: d.photoURL } as UserProfile] as const;
                        } catch (err) {
                            console.error("Error fetching profile", uid, err);
                            return null;
                        }
                    })
                );

                if (cancelled) return;
                const updates = results.filter((entry): entry is readonly [string, UserProfile] => Boolean(entry));
                if (updates.length === 0) return;
                setUserProfiles(prev => {
                    const next = { ...prev };
                    for (const [uid, profile] of updates) next[uid] = profile;
                    return next;
                });
            } catch (err) {
                if (!cancelled) console.error("Error fetching profiles", err);
            }
        })();

        return () => { cancelled = true; };
    }, [comments, user, userProfiles]);

    const handleLikeToggle = async () => {
        if (!user) {
            alert('로그인이 필요합니다.');
            return;
        }
        if (!post) return;

        const postRef = doc(db, 'community_posts', postId);
        const likeRef = doc(db, 'community_posts', postId, 'likes', user.uid);

        try {
            const nextLiked = await runTransaction(db, async (transaction) => {
                const likeDoc = await transaction.get(likeRef);
                if (likeDoc.exists()) {
                    transaction.delete(likeRef);
                    transaction.update(postRef, { likes: increment(-1) });
                    return false;
                } else {
                    transaction.set(likeRef, { userId: user.uid, createdAt: serverTimestamp() });
                    transaction.update(postRef, { likes: increment(1) });
                    return true;
                }
            });

            setHasLiked(nextLiked);
            setPost((prev: any) => {
                if (!prev) return prev;
                const delta = nextLiked ? 1 : -1;
                return { ...prev, likes: Math.max(0, Number(prev.likes || 0) + delta) };
            });
        } catch (e) {
            console.error("Error toggling like:", e);
        }
    };

    const handleCommentSubmit = async (parentId: string | null = null, textOverride?: string) => {
        if (!user) {
            alert('로그인이 필요합니다.');
            return;
        }

        const textToSend = (textOverride !== undefined ? textOverride : newComment) || '';
        if (!textToSend.trim()) return;

        setIsSubmitting(true);
        const optimisticCommentId = `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const optimisticComment: Comment = {
            id: optimisticCommentId,
            text: textToSend.trim(),
            userId: user.uid,
            authorId: user.uid,
            userName: user.displayName || 'Anonymous',
            authorName: user.displayName || 'Anonymous',
            userPhotoURL: user.photoURL || undefined,
            createdAt: new Date(),
            parentId: parentId || null,
            likes: [],
        };

        if (isNetworkConstrained) {
            setComments((prev) => [...prev, optimisticComment]);
            setPost((prev: any) => {
                if (!prev) return prev;
                return { ...prev, commentCount: Number(prev.commentCount || 0) + 1 };
            });
        }

        try {
            // Flatten replies to 1 level if nesting is too deep, or just use parentId directly
            // Match CommentModal logic: if parent has parent, use grandparent
            let effectiveParentId = parentId;
            if (parentId) {
                const parentComment = comments.find(c => c.id === parentId);
                if (parentComment && parentComment.parentId) {
                    effectiveParentId = parentComment.parentId;
                }
            }

            await addDoc(collection(db, 'community_posts', postId, 'comments'), {
                text: textToSend.trim(),
                authorId: user.uid, // Legacy field
                userId: user.uid,   // New field for consistency
                authorName: user.displayName || 'Anonymous', // Legacy
                userName: user.displayName || 'Anonymous',   // New
                userPhotoURL: user.photoURL || null,
                createdAt: serverTimestamp(),
                parentId: effectiveParentId || null,
                likes: []
            });

            // Update comment count
            const postRef = doc(db, 'community_posts', postId);
            await updateDoc(postRef, {
                commentCount: increment(1)
            });

            if (effectiveParentId) {
                setReplyingToId(null);
            } else {
                setNewComment('');
                setTimeout(() => commentsEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
            }
        } catch (error) {
            console.error("Error adding comment:", error);
            if (isNetworkConstrained) {
                setComments((prev) => prev.filter((comment) => comment.id !== optimisticCommentId));
                setPost((prev: any) => {
                    if (!prev) return prev;
                    return { ...prev, commentCount: Math.max(0, Number(prev.commentCount || 0) - 1) };
                });
            }
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDeleteComment = async (commentId: string) => {
        if (!confirm("댓글을 삭제하시겠습니까?")) return;
        try {
            const batch = writeBatch(db);

            // Delete target comment
            batch.delete(doc(db, 'community_posts', postId, 'comments', commentId));

            // Delete replies
            const replies = comments.filter(c => c.parentId === commentId);
            replies.forEach(r => {
                batch.delete(doc(db, 'community_posts', postId, 'comments', r.id));
            });

            // Update count
            const countRef = doc(db, 'community_posts', postId);
            // We can't batch decrement easily without reading first if we want strict accuracy, 
            // but increment(-N) is safe enough here
            batch.update(countRef, { commentCount: increment(-(1 + replies.length)) });

            await batch.commit();

        } catch (e) {
            console.error("Failed to delete comment", e);
            alert("댓글 삭제 실패");
        }
    };

    const handleLikeComment = async (comment: Comment) => {
        if (!user) {
            alert("로그인이 필요합니다.");
            return;
        }
        const isLiked = comment.likes?.includes(user.uid);
        const ref = doc(db, 'community_posts', postId, 'comments', comment.id);

        setComments((prev) => prev.map((entry) => {
            if (entry.id !== comment.id) return entry;
            const likes = Array.isArray(entry.likes) ? [...entry.likes] : [];
            if (isLiked) {
                return { ...entry, likes: likes.filter((uid) => uid !== user.uid) };
            }
            if (!likes.includes(user.uid)) likes.push(user.uid);
            return { ...entry, likes };
        }));

        try {
            if (isLiked) {
                await updateDoc(ref, { likes: arrayRemove(user.uid) });
            } else {
                await updateDoc(ref, { likes: arrayUnion(user.uid) });
            }
        } catch (e) {
            console.error("Failed to like comment", e);
            setComments((prev) => prev.map((entry) => {
                if (entry.id !== comment.id) return entry;
                const likes = Array.isArray(entry.likes) ? [...entry.likes] : [];
                if (isLiked) {
                    if (!likes.includes(user.uid)) likes.push(user.uid);
                    return { ...entry, likes };
                }
                return { ...entry, likes: likes.filter((uid) => uid !== user.uid) };
            }));
        }
    };

    const handleSaveEdit = async (commentId: string) => {
        if (!editText.trim()) return;
        try {
            await updateDoc(doc(db, 'community_posts', postId, 'comments', commentId), {
                text: editText.trim()
            });
            setEditingCommentId(null);
            setEditText('');
        } catch (e) {
            console.error("Failed to edit comment", e);
        }
    };

    const renderComment = (c: Comment, isReply = false) => {
        const isOwner = user && (user.uid === c.userId || user.uid === (c as any).authorId);
        const isEditing = editingCommentId === c.id;
        const isReplying = replyingToId === c.id;

        const ownerId = c.userId || (c as any).authorId;
        const profile = userProfiles[ownerId] || {};
        const displayName = profile.nickname || c.userName || c.authorName || 'Anonymous';

        // Profile Photo Logic (Same as CommentModal)
        const displayPhoto = (isOwner && user?.photoURL)
            ? user.photoURL
            : (profile.photoURL || c.userPhotoURL || "https://www.gravatar.com/avatar/00000000000000000000000000000000?d=mp&f=y");

        const likeCount = c.likes?.length || 0;
        const isLiked = user ? c.likes?.includes(user.uid) : false;

        return (
            <div key={c.id} style={{
                marginBottom: 12, display: 'flex', gap: 10, paddingLeft: isReply ? 30 : 0
            }}>
                <img
                    src={displayPhoto}
                    alt={displayName}
                    title={displayName}
                    onError={(e) => {
                        const target = e.currentTarget;
                        if (target.src !== "https://www.gravatar.com/avatar/00000000000000000000000000000000?d=mp&f=y") {
                            target.src = "https://www.gravatar.com/avatar/00000000000000000000000000000000?d=mp&f=y";
                        }
                    }}
                    style={{
                        width: isReply ? 24 : 32, height: isReply ? 24 : 32,
                        borderRadius: '50%', objectFit: 'cover', flexShrink: 0,
                        border: '1px solid #eee',
                        backgroundColor: '#f0f0f0'
                    }}
                />
                <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontSize: 13, fontWeight: 700, color: '#333' }}>{displayName}</span>
                            <span style={{ fontSize: 11, fontWeight: 400, color: '#999' }}>
                                {formatDate(c.createdAt)}
                            </span>
                            {/* Heart */}
                            <button
                                onClick={() => handleLikeComment(c)}
                                style={{
                                    background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                                    display: 'flex', alignItems: 'center', gap: 3,
                                    color: isLiked ? '#ff4444' : '#ccc', marginLeft: 6
                                }}
                            >
                                <svg width="12" height="12" viewBox="0 0 24 24" fill={isLiked ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2">
                                    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
                                </svg>
                                {likeCount > 0 && <span style={{ fontSize: 10, color: '#999' }}>{likeCount}</span>}
                            </button>
                        </div>
                        {isOwner && !isEditing && (
                            <div style={{ display: 'flex', gap: 8 }}>
                                <button onClick={() => { setEditingCommentId(c.id); setEditText(c.text); setReplyingToId(null); }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: '#999', fontSize: 11 }}>Edit</button>
                                <button onClick={() => handleDeleteComment(c.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: '#ff4444', fontSize: 11 }}>Del</button>
                            </div>
                        )}
                    </div>

                    {isEditing ? (
                        <div style={{ marginTop: 4 }}>
                            <textarea
                                value={editText}
                                onChange={(e) => setEditText(e.target.value)}
                                style={{ width: '100%', padding: 8, borderRadius: 4, border: '1px solid #ddd', fontSize: 13, resize: 'none', minHeight: 60 }}
                            />
                            <div style={{ display: 'flex', gap: 6, marginTop: 4, justifyContent: 'flex-end' }}>
                                <button onClick={() => { setEditingCommentId(null); setEditText(''); }} style={{ padding: '4px 8px', fontSize: 11, background: '#f0f0f0', border: '1px solid #ccc', borderRadius: 4, cursor: 'pointer' }}>Cancel</button>
                                <button onClick={() => handleSaveEdit(c.id)} style={{ padding: '4px 8px', fontSize: 11, background: '#0095f6', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>Save</button>
                            </div>
                        </div>
                    ) : (
                        <>
                            <div style={{ fontSize: 13, color: '#444', lineHeight: 1.3, whiteSpace: 'pre-wrap', marginTop: 2 }}>{c.text}</div>
                            {/* Reply Button */}
                            <div style={{ marginTop: 2 }}>
                                <button
                                    onClick={() => {
                                        if (!user) { alert("로그인이 필요합니다."); return; }
                                        setReplyingToId(isReplying ? null : c.id);
                                        setEditingCommentId(null);
                                    }}
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: '#999', fontSize: 11, fontWeight: 500 }}
                                >
                                    Reply
                                </button>
                            </div>
                        </>
                    )}

                    {/* Reply Input */}
                    {isReplying && (
                        <div style={{ marginTop: 6, display: 'flex', gap: 8 }}>
                            <input
                                autoFocus
                                placeholder={`Reply to ${displayName}...`}
                                type="text"
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        handleCommentSubmit(c.id, (e.target as HTMLInputElement).value);
                                    }
                                }}
                                style={{ flex: 1, padding: '6px 10px', borderRadius: 16, border: '1px solid #ddd', outline: 'none', fontSize: 12 }}
                            />
                        </div>
                    )}
                </div>
            </div>
        );
    };

    if (loading) return <div style={{ padding: '40px', textAlign: 'center' }}>Loading...</div>;
    if (!post) return <div style={{ padding: '40px', textAlign: 'center' }}>삭제된 게시글입니다.</div>;

    const topLevelComments = comments.filter(c => !c.parentId);
    const getReplies = (parentId: string) => comments.filter(c => c.parentId === parentId);

    return (
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            {/* Header / Nav */}
            <div style={{ padding: '12px 16px', borderBottom: '1px solid #eee', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button
                    onClick={onBack}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px', padding: '4px' }}
                >
                    ←
                </button>
                <div style={{ flex: 1, fontWeight: '600', fontSize: '14px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {post.header?.name || 'Unknown'}
                </div>
            </div>

            {/* Content Scrollable Area */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
                {/* Header Badge */}
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '16px' }}>
                    {post.header?.image && (
                        <img src={getOptimizedImageUrl(post.header.image, 50)} alt="" style={{ width: 40, height: 40, borderRadius: 4, objectFit: 'cover' }} />
                    )}
                    <div>
                        <div style={{ fontSize: '12px', color: '#888', marginBottom: '2px' }}>
                            {post.header?.type === 'museum' ? '🏛️ Museum' : post.header?.type === 'artist' ? '🎨 Artist' : '📝 Note'}
                        </div>
                        <div style={{ fontWeight: '600', fontSize: '14px' }}>{post.header?.name || 'Unknown'}</div>
                    </div>
                </div>

                <h2 style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '12px', lineHeight: '1.4' }}>{post.title}</h2>

                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#999', marginBottom: '24px', paddingBottom: '12px', borderBottom: '1px solid #f5f5f5' }}>
                    <span>{post.authorName}</span>
                    <span>{post.createdAt?.toDate ? post.createdAt.toDate().toLocaleString() : ''}</span>
                </div>

                <div
                    style={{ fontSize: '15px', lineHeight: '1.6', marginBottom: '40px', color: '#333' }}
                >
                    {post.isHtml !== false ? (
                        <div
                            dangerouslySetInnerHTML={{ __html: post.content }}
                            className="post-content-html"
                        />
                    ) : (
                        <div style={{ whiteSpace: 'pre-wrap' }}>{post.content}</div>
                    )}
                </div>
                <style>{`
                    .post-content-html img {
                        max-width: 100%;
                        height: auto;
                        border-radius: 8px;
                        margin: 12px 0;
                        display: block;
                    }
                `}</style>


                {/* Like Button */}
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '32px' }}>
                    <button
                        onClick={handleLikeToggle}
                        style={{
                            padding: '8px 20px',
                            borderRadius: '20px',
                            border: hasLiked ? '1px solid #ff4d4f' : '1px solid #ddd',
                            background: hasLiked ? '#fff1f0' : '#fff',
                            color: hasLiked ? '#ff4d4f' : '#333',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            fontSize: '14px',
                            fontWeight: '600',
                            transition: 'all 0.2s'
                        }}
                    >
                        {hasLiked ? '♥' : '♡'} {post.likes || 0}
                    </button>
                </div>

                {/* Comments List */}
                <div style={{ marginTop: '20px' }}>
                    <h3 style={{ fontSize: '15px', fontWeight: 'bold', marginBottom: '16px' }}>댓글 {comments.length}</h3>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                        {comments.length === 0 ? (
                            <div style={{ color: '#999', fontSize: 13, textAlign: 'center', padding: '20px' }}>첫 댓글을 남겨보세요!</div>
                        ) : (
                            topLevelComments.map(c => (
                                <div key={c.id}>
                                    {renderComment(c)}
                                    {getReplies(c.id).map(r => renderComment(r, true))}
                                </div>
                            ))
                        )}
                        <div ref={commentsEndRef} />
                    </div>
                </div>
            </div>

            {/* Comment Input Footer */}
            <div style={{ padding: '12px', borderTop: '1px solid #eee', background: '#fff' }}>
                <form onSubmit={(e) => { e.preventDefault(); handleCommentSubmit(null); }} style={{ display: 'flex', gap: '8px' }}>
                    {(userProfiles[user?.uid || '']?.photoURL || user?.photoURL) && (
                        <img
                            src={userProfiles[user?.uid || '']?.photoURL || user?.photoURL || ''}
                            alt="me"
                            loading="eager"
                            referrerPolicy="no-referrer"
                            style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover', border: '1px solid #eee' }}
                        />
                    )}
                    <input
                        type="text"
                        value={newComment}
                        onChange={(e) => setNewComment(e.target.value)}
                        placeholder={user ? "댓글을 입력하세요..." : "로그인 필요"}
                        disabled={!user}
                        style={{
                            flex: 1,
                            padding: '10px 12px',
                            borderRadius: '20px',
                            border: '1px solid #ddd',
                            fontSize: '14px',
                            outline: 'none',
                            background: user ? '#fff' : '#f9f9f9'
                        }}
                    />
                    <button
                        type="submit"
                        disabled={isSubmitting || !user || !newComment.trim()}
                        style={{
                            padding: '0 16px',
                            borderRadius: '20px',
                            background: '#000',
                            color: '#fff',
                            border: 'none',
                            cursor: 'pointer',
                            fontWeight: '600',
                            fontSize: '13px',
                            opacity: (isSubmitting || !user || !newComment.trim()) ? 0.3 : 1
                        }}
                    >
                        등록
                    </button>
                </form>
            </div>
        </div>
    );
};

export default CommunityDetail;
