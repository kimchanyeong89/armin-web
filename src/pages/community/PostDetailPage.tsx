import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, collection, addDoc, query, orderBy, onSnapshot, updateDoc, increment, serverTimestamp, getDoc, getDocs } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';
import { shouldLimitNetwork } from '../../utils/network';

interface Comment {
    id: string;
    text: string;
    authorName: string;
    createdAt: any;
}

const PostDetailPage: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { user } = useAuth();
    const [post, setPost] = useState<any>(null);
    const [comments, setComments] = useState<Comment[]>([]);
    const [newComment, setNewComment] = useState('');
    const [loading, setLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const isNetworkConstrained = shouldLimitNetwork();

    // Fetch Post
    useEffect(() => {
        if (!id) return;
        const postRef = doc(db, 'community_posts', id);

        // Constrained/mobile: one-shot reads
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

            const commentsRef = collection(db, 'community_posts', id, 'comments');
            const q = query(commentsRef, orderBy('createdAt', 'desc'));
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

        // Listen to post updates (likes/comments count)
        const unsubscribePost = onSnapshot(postRef, (docSnap) => {
            if (docSnap.exists()) {
                setPost({ id: docSnap.id, ...docSnap.data() });
            } else {
                setPost(null);
            }
            setLoading(false);
        });

        // Listen to comments
        const commentsRef = collection(db, 'community_posts', id, 'comments');
        const q = query(commentsRef, orderBy('createdAt', 'desc'));
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
    }, [id, isNetworkConstrained]);

    const handleLike = async () => {
        if (!user) {
            alert('로그인이 필요합니다.');
            return;
        }
        if (!id) return;

        // Simple increment for now
        const postRef = doc(db, 'community_posts', id);
        await updateDoc(postRef, {
            likes: increment(1)
        });
    };

    const handleCommentSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user) {
            alert('로그인이 필요합니다.');
            return;
        }
        if (!newComment.trim()) return;

        setIsSubmitting(true);
        try {
            if (!id) return;

            // Add comment
            await addDoc(collection(db, 'community_posts', id, 'comments'), {
                text: newComment,
                authorId: user.uid,
                authorName: user.displayName || 'Anonymous',
                createdAt: serverTimestamp()
            });

            // Update comment count
            const postRef = doc(db, 'community_posts', id);
            await updateDoc(postRef, {
                commentCount: increment(1)
            });

            setNewComment('');
        } catch (error) {
            console.error("Error adding comment:", error);
        } finally {
            setIsSubmitting(false);
        }
    };

    if (loading) return <div style={{ padding: '100px', textAlign: 'center' }}>Loading...</div>;
    if (!post) return <div style={{ padding: '100px', textAlign: 'center' }}>Board not found.</div>;

    return (
        <div style={{ maxWidth: '800px', margin: '0 auto', padding: '100px 20px' }}>
            {/* Back Button */}
            <button
                onClick={() => navigate('/community')}
                style={{ background: 'none', border: 'none', cursor: 'pointer', marginBottom: '20px', fontSize: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}
            >
                ← 목록으로
            </button>

            {/* Header Badge */}
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '16px' }}>
                <span style={{
                    fontSize: '13px',
                    fontWeight: '600',
                    padding: '6px 12px',
                    borderRadius: '20px',
                    background: '#f0f0f0',
                    color: '#333',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                }}>
                    {post.header?.type === 'museum' && '🏛️'}
                    {post.header?.type === 'artist' && '🎨'}
                    {post.header?.type === 'artwork' && '🖼️'}
                    {post.header?.type === 'exhibition' && '🎫'}
                    {post.header?.name || 'Unknown'}
                </span>
                <span style={{ fontSize: '14px', color: '#888' }}>
                    {post.createdAt?.toDate ? post.createdAt.toDate().toLocaleString() : ''}
                </span>
            </div>

            {/* Title */}
            <h1 style={{ fontSize: '32px', fontWeight: 'bold', marginBottom: '24px', lineHeight: '1.3' }}>
                {post.title}
            </h1>

            {/* Author */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '40px', paddingBottom: '20px', borderBottom: '1px solid #eee' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: '#eee', overflow: 'hidden' }}>
                    {post.authorPhotoURL && <img src={post.authorPhotoURL} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                </div>
                <div>
                    <div style={{ fontWeight: '600' }}>{post.authorName}</div>
                    <div style={{ fontSize: '12px', color: '#888' }}>Author</div>
                </div>
            </div>

            {/* Content */}
            <div
                style={{ fontSize: '18px', lineHeight: '1.8', marginBottom: '60px' }}
                dangerouslySetInnerHTML={{ __html: post.content }}
            />

            {/* Interactions */}
            <div style={{ display: 'flex', justifyContent: 'center', gap: '20px', marginBottom: '60px' }}>
                <button
                    onClick={handleLike}
                    style={{
                        padding: '12px 32px',
                        borderRadius: '30px',
                        border: '1px solid #ddd',
                        background: '#fff',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        fontSize: '16px',
                        fontWeight: '600',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.05)'
                    }}
                >
                    ❤️ 추천 {post.likes || 0}
                </button>
            </div>

            {/* Comments Section */}
            <div style={{ borderTop: '1px solid #eee', paddingTop: '40px' }}>
                <h3 style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '20px' }}>댓글 {post.commentCount || 0}</h3>

                {/* Comment Form */}
                <form onSubmit={handleCommentSubmit} style={{ marginBottom: '40px', display: 'flex', gap: '12px' }}>
                    <input
                        type="text"
                        value={newComment}
                        onChange={(e) => setNewComment(e.target.value)}
                        placeholder={user ? "댓글을 입력하세요..." : "로그인이 필요합니다."}
                        disabled={!user}
                        style={{
                            flex: 1,
                            padding: '12px 16px',
                            borderRadius: '8px',
                            border: '1px solid #ddd',
                            fontSize: '15px'
                        }}
                    />
                    <button
                        type="submit"
                        disabled={isSubmitting || !user}
                        style={{
                            padding: '12px 24px',
                            borderRadius: '8px',
                            background: '#000',
                            color: '#fff',
                            border: 'none',
                            cursor: 'pointer',
                            fontWeight: '600',
                            opacity: (isSubmitting || !user) ? 0.5 : 1
                        }}
                    >
                        등록
                    </button>
                </form>

                {/* Comment List */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                    {comments.map(comment => (
                        <div key={comment.id} style={{ display: 'flex', gap: '12px' }}>
                            <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#eee', flexShrink: 0 }} />
                            <div>
                                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '4px' }}>
                                    <span style={{ fontWeight: '600', fontSize: '14px' }}>{comment.authorName}</span>
                                    <span style={{ fontSize: '12px', color: '#999' }}>
                                        {comment.createdAt?.toDate ? comment.createdAt.toDate().toLocaleDateString() : ''}
                                    </span>
                                </div>
                                <div style={{ fontSize: '15px', lineHeight: '1.5', color: '#333' }}>
                                    {comment.text}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default PostDetailPage;
