import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, query, orderBy, limit, getDocs } from 'firebase/firestore';
import { db } from '../../firebase';
import { getOptimizedImageUrl } from '../../utils/imageProxy';
import { GlobalNav } from '../../components/GlobalNav';

interface Post {
    id: string;
    title: string;
    authorName: string;
    createdAt: any;
    likes: number;
    commentCount: number;
    header: {
        id: string;
        type: string;
        name: string;
        image?: string;
    };
    contentSnippet?: string;
}

const CommunityPage: React.FC = () => {
    const navigate = useNavigate();
    const [posts, setPosts] = useState<Post[]>([]);
    const [loading, setLoading] = useState(true);
    const [tab, setTab] = useState<'latest' | 'popular'>('latest');

    const fetchPosts = async () => {
        setLoading(true);
        try {
            const postsRef = collection(db, 'community_posts');
            let q;

            if (tab === 'popular') {
                q = query(postsRef, orderBy('likes', 'desc'), limit(50));
            } else {
                q = query(postsRef, orderBy('createdAt', 'desc'), limit(50));
            }

            const snapshot = await getDocs(q);
            const loadedPosts = snapshot.docs.map(doc => {
                const data = doc.data();
                return {
                    id: doc.id,
                    ...data,
                    header: data.header || { name: 'Unknown', type: 'note', id: 'unknown' },
                    createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(data.createdAt || Date.now())
                } as Post;
            });

            setPosts(loadedPosts);
        } catch (error) {
            console.error("Error fetching posts:", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchPosts();
    }, [tab]);

    const formatDate = (date: Date) => {
        const now = new Date();
        const diff = now.getTime() - date.getTime();
        const minutes = Math.floor(diff / (1000 * 60));
        const hours = Math.floor(diff / (1000 * 60 * 60));


        if (minutes < 60) return `${minutes}분 전`;
        if (hours < 24) return `${hours}시간 전`;
        return date.toLocaleDateString();
    };

    return (
        <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '20px 16px', paddingTop: '100px' }}>
            {/* Top Bar */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <h1 style={{ fontSize: '28px', fontWeight: '800', margin: 0, letterSpacing: '-0.5px' }}>Community</h1>

                </div>
                <button
                    onClick={() => navigate('/community/write')}
                    style={{
                        padding: '10px 24px',
                        background: '#000',
                        color: '#fff',
                        borderRadius: '30px',
                        border: 'none',
                        cursor: 'pointer',
                        fontWeight: '600',
                        fontSize: '14px'
                    }}
                >
                    글쓰기
                </button>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: '2px', marginBottom: '20px', borderBottom: '1px solid #eee' }}>
                <button
                    onClick={() => setTab('latest')}
                    style={{
                        padding: '12px 16px',
                        background: 'none',
                        border: 'none',
                        borderBottom: tab === 'latest' ? '2px solid #000' : '2px solid transparent',
                        fontWeight: tab === 'latest' ? '700' : '400',
                        cursor: 'pointer',
                        color: tab === 'latest' ? '#000' : '#888',
                        fontSize: '15px'
                    }}
                >
                    최신순
                </button>
                <button
                    onClick={() => setTab('popular')}
                    style={{
                        padding: '12px 16px',
                        background: 'none',
                        border: 'none',
                        borderBottom: tab === 'popular' ? '2px solid #000' : '2px solid transparent',
                        fontWeight: tab === 'popular' ? '700' : '400',
                        cursor: 'pointer',
                        color: tab === 'popular' ? '#000' : '#888',
                        fontSize: '15px'
                    }}
                >
                    인기글
                </button>
            </div>

            {/* List Header (Desktop Only) */}
            <div style={{
                display: 'flex',
                padding: '12px 8px',
                borderBottom: '1px solid #ddd',
                fontSize: '13px',
                color: '#888',
                fontWeight: '500'
            }}>
                <div style={{ width: '120px' }}>머릿글</div>
                <div style={{ flex: 1 }}>제목</div>
                <div style={{ width: '80px', textAlign: 'center' }}>작성자</div>
                <div style={{ width: '80px', textAlign: 'center' }}>작성일</div>
                <div style={{ width: '60px', textAlign: 'center' }}>추천</div>
            </div>

            {/* Post List */}
            {loading ? (
                <div style={{ padding: '40px', textAlign: 'center', color: '#888' }}>Loading...</div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                    {posts.length === 0 && <div style={{ padding: '60px 0', textAlign: 'center', color: '#999' }}>아직 등록된 게시글이 없습니다.</div>}

                    {posts.map(post => (
                        <div
                            key={post.id}
                            onClick={() => navigate(`/community/post/${post.id}`)}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                padding: '14px 8px',
                                borderBottom: '1px solid #f0f0f0',
                                cursor: 'pointer',
                                transition: 'background 0.2s',
                                fontSize: '14px'
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.background = '#f9f9f9'}
                            onMouseLeave={(e) => e.currentTarget.style.background = '#fff'}
                        >
                            {/* Header Column */}
                            <div style={{ width: '120px', display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden', paddingRight: '12px' }}>
                                <span style={{
                                    fontSize: '12px',
                                    color: '#666',
                                    fontWeight: '500',
                                    whiteSpace: 'nowrap',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    backgroundColor: '#f5f5f5',
                                    padding: '4px 8px',
                                    borderRadius: '4px'
                                }}>
                                    {post.header?.name || 'Unknown'}
                                </span>
                            </div>

                            {/* Title Column */}
                            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                                {post.header?.image && (
                                    <img
                                        src={getOptimizedImageUrl(post.header.image, 50)}
                                        alt=""
                                        style={{ width: '28px', height: '28px', objectFit: 'cover', borderRadius: '4px', border: '1px solid #eee' }}
                                    />
                                )}
                                <span style={{
                                    fontWeight: '600',
                                    whiteSpace: 'nowrap',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    color: '#222'
                                }}>
                                    {post.title}
                                </span>
                                {post.commentCount > 0 && (
                                    <span style={{
                                        fontSize: '12px',
                                        color: '#ff4d4f',
                                        fontWeight: '700',
                                        marginLeft: '-4px'
                                    }}>
                                        [{post.commentCount}]
                                    </span>
                                )}
                            </div>

                            {/* Metadata Columns */}
                            <div style={{ width: '80px', textAlign: 'center', color: '#666', fontSize: '13px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {post.authorName}
                            </div>
                            <div style={{ width: '80px', textAlign: 'center', color: '#999', fontSize: '12px' }}>
                                {formatDate(post.createdAt)}
                            </div>
                            <div style={{ width: '60px', textAlign: 'center', color: '#ff4d4f', fontWeight: post.likes > 0 ? '600' : '400', fontSize: '13px' }}>
                                {post.likes > 0 ? `♥ ${post.likes}` : '-'}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Global Navigation */}
            <div style={{ position: "fixed", top: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 10001 }}>
                <GlobalNav isAdmin={false} />
            </div>
        </div>
    );
};

export default CommunityPage;
