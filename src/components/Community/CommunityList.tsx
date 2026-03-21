import React, { useState, useEffect } from 'react';

import { collection, query, orderBy, limit, getDocs } from 'firebase/firestore';
import { db } from '../../firebase';
import { getOptimizedImageUrl } from '../../utils/imageProxy';

interface CommunityListProps {
    onPostClick: (postId: string) => void;
    onWriteClick: () => void;
    isDark?: boolean;
    isSketch?: boolean;
}

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

const CommunityList: React.FC<CommunityListProps> = ({ onPostClick, onWriteClick, isDark = false, isSketch = false }) => {
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

    // ── Color tokens ───────────────────────────────────────────────────
    const bg         = isDark ? 'rgba(8,8,7,0)' : isSketch ? '#FFFFFF' : '#FFFFFF';
    const textPrim   = isDark ? 'rgba(220,210,195,0.92)' : '#111111';
    const textSec    = isDark ? 'rgba(180,165,140,0.6)' : '#888888';
    const accentBg   = isDark ? 'rgba(201,165,90,0.12)' : isSketch ? '#CCFF00' : '#111111';
    const accentText = isDark ? '#c9a55a' : isSketch ? '#111111' : '#ffffff';
    const divider    = isDark ? 'rgba(201,165,90,0.1)' : isSketch ? 'rgba(17,17,17,0.12)' : '#f0f0f0';
    const headerBg   = isDark ? 'rgba(201,165,90,0.08)' : isSketch ? '#f5f5f5' : '#f5f5f5';
    const hoverBg    = isDark ? 'rgba(201,165,90,0.06)' : isSketch ? '#f9f9f9' : '#f9f9f9';
    const hoverReset = isDark ? 'transparent' : 'transparent';
    const tabActive  = isDark ? '#c9a55a' : isSketch ? '#CCFF00' : '#000';
    const tabBorder  = isDark ? '#c9a55a' : isSketch ? '#111111' : '#000';
    const tabBg      = isDark ? 'rgba(8,8,7,0)' : 'none';

    return (
        <div style={{
            maxWidth: '1000px',
            margin: '0 auto',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            background: bg,
            fontFamily: isSketch ? "'Space Mono', 'Courier New', monospace" : 'inherit',
        }}>
            {/* Write Button */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', marginBottom: '16px' }}>
                <button
                    onClick={onWriteClick}
                    style={{
                        padding: isSketch ? '8px 18px' : '8px 20px',
                        background: accentBg,
                        color: accentText,
                        borderRadius: isSketch ? 0 : isDark ? '4px' : '30px',
                        border: isSketch ? '2px solid #111111' : isDark ? '1px solid rgba(201,165,90,0.3)' : 'none',
                        cursor: 'pointer',
                        fontWeight: isSketch ? 700 : 600,
                        fontSize: isSketch ? '10px' : '13px',
                        letterSpacing: isSketch ? '0.15em' : 'normal',
                        textTransform: isSketch ? 'uppercase' : 'none',
                        fontFamily: isSketch ? "'Space Mono', monospace" : 'inherit',
                        boxShadow: isSketch ? '2px 2px 0 #111111' : isDark ? '0 2px 10px rgba(0,0,0,0.4)' : 'none',
                        transition: 'all 0.15s',
                    }}
                    onMouseEnter={(e) => {
                        if (isSketch) { e.currentTarget.style.boxShadow = '0px 0px 0 #111111'; e.currentTarget.style.transform = 'translate(2px,2px)'; }
                        else if (isDark) { e.currentTarget.style.borderColor = 'rgba(201,165,90,0.6)'; }
                    }}
                    onMouseLeave={(e) => {
                        if (isSketch) { e.currentTarget.style.boxShadow = '2px 2px 0 #111111'; e.currentTarget.style.transform = 'none'; }
                        else if (isDark) { e.currentTarget.style.borderColor = 'rgba(201,165,90,0.3)'; }
                    }}
                >
                    {isSketch ? 'WRITE' : '글쓰기'}
                </button>
            </div>

            {/* Tabs */}
            <div style={{
                display: 'flex',
                gap: '2px',
                marginBottom: '20px',
                borderBottom: isDark ? '1px solid rgba(201,165,90,0.12)' : isSketch ? '2px solid #111111' : '1px solid #eee',
            }}>
                {(['latest', 'popular'] as const).map((t) => {
                    const isActive = tab === t;
                    return (
                        <button
                            key={t}
                            onClick={() => setTab(t)}
                            style={{
                                padding: '10px 16px',
                                background: tabBg,
                                border: 'none',
                                borderBottom: isActive
                                    ? `2px solid ${tabBorder}`
                                    : '2px solid transparent',
                                fontWeight: isActive ? 700 : 400,
                                cursor: 'pointer',
                                color: isActive ? tabActive : textSec,
                                fontSize: isSketch ? '10px' : '15px',
                                letterSpacing: isSketch ? '0.15em' : 'normal',
                                textTransform: isSketch ? 'uppercase' : 'none',
                                fontFamily: isSketch ? "'Space Mono', monospace" : 'inherit',
                                transition: 'color 0.15s',
                            }}
                        >
                            {t === 'latest' ? (isSketch ? 'LATEST' : '최신순') : (isSketch ? 'POPULAR' : '인기글')}
                        </button>
                    );
                })}
            </div>

            {/* List Header */}
            <div style={{
                display: 'flex',
                padding: '10px 8px',
                borderBottom: `1px solid ${divider}`,
                fontSize: isSketch ? '9px' : '12px',
                color: textSec,
                fontWeight: isSketch ? 700 : 500,
                letterSpacing: isSketch ? '0.15em' : 'normal',
                textTransform: isSketch ? 'uppercase' : 'none',
                fontFamily: isSketch ? "'Space Mono', monospace" : 'inherit',
            }}>
                <div style={{ width: '120px' }}>{isSketch ? 'TAG' : '머릿글'}</div>
                <div style={{ flex: 1 }}>{isSketch ? 'TITLE' : '제목'}</div>
                <div style={{ width: '80px', textAlign: 'center' }}>{isSketch ? 'AUTHOR' : '작성자'}</div>
                <div style={{ width: '80px', textAlign: 'center' }}>{isSketch ? 'DATE' : '작성일'}</div>
                <div style={{ width: '60px', textAlign: 'center' }}>{isSketch ? 'LIKE' : '추천'}</div>
            </div>

            {/* Post List */}
            {loading ? (
                <div style={{
                    padding: '40px',
                    textAlign: 'center',
                    color: textSec,
                    fontFamily: isSketch ? "'Space Mono', monospace" : 'inherit',
                    fontSize: isSketch ? '10px' : '14px',
                    letterSpacing: isSketch ? '0.15em' : 'normal',
                }}>
                    {isSketch ? 'LOADING...' : 'Loading...'}
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                    {posts.length === 0 && (
                        <div style={{
                            padding: '60px 0',
                            textAlign: 'center',
                            color: textSec,
                            fontFamily: isSketch ? "'Space Mono', monospace" : 'inherit',
                            fontSize: isSketch ? '10px' : '14px',
                        }}>
                            {isSketch ? 'NO POSTS YET.' : '아직 등록된 게시글이 없습니다.'}
                        </div>
                    )}

                    {posts.map(post => (
                        <div
                            key={post.id}
                            onClick={() => onPostClick(post.id)}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                padding: '13px 8px',
                                borderBottom: `1px solid ${divider}`,
                                cursor: 'pointer',
                                transition: 'background 0.15s',
                                fontSize: isSketch ? '11px' : '14px',
                                fontFamily: isSketch ? "'Space Mono', monospace" : 'inherit',
                                background: 'transparent',
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.background = hoverBg}
                            onMouseLeave={(e) => e.currentTarget.style.background = hoverReset}
                        >
                            {/* Header tag */}
                            <div style={{ width: '120px', display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden', paddingRight: '12px' }}>
                                <span style={{
                                    fontSize: isSketch ? '9px' : '12px',
                                    color: isDark ? 'rgba(201,165,90,0.7)' : textPrim,
                                    fontWeight: isSketch ? 700 : 500,
                                    whiteSpace: 'nowrap',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    backgroundColor: headerBg,
                                    padding: isSketch ? '3px 7px' : '4px 8px',
                                    borderRadius: isSketch ? 0 : '4px',
                                    border: isSketch ? '1px solid rgba(17,17,17,0.2)' : isDark ? '1px solid rgba(201,165,90,0.15)' : 'none',
                                    letterSpacing: isSketch ? '0.1em' : 'normal',
                                    textTransform: isSketch ? 'uppercase' : 'none',
                                }}>
                                    {post.header?.name || 'Unknown'}
                                </span>
                            </div>

                            {/* Title */}
                            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                                {post.header?.image && (
                                    <img
                                        src={getOptimizedImageUrl(post.header.image, 50)}
                                        alt=""
                                        style={{
                                            width: '26px',
                                            height: '26px',
                                            objectFit: 'cover',
                                            borderRadius: isSketch ? 0 : '4px',
                                            border: isDark ? '1px solid rgba(201,165,90,0.2)' : isSketch ? '1px solid #111' : '1px solid #eee',
                                        }}
                                    />
                                )}
                                <span style={{
                                    fontWeight: 600,
                                    whiteSpace: 'nowrap',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    color: textPrim,
                                }}>
                                    {post.title}
                                </span>
                                {post.commentCount > 0 && (
                                    <span style={{
                                        fontSize: '12px',
                                        color: isDark ? 'rgba(201,165,90,0.8)' : '#ff4d4f',
                                        fontWeight: 700,
                                        marginLeft: '-4px',
                                    }}>
                                        [{post.commentCount}]
                                    </span>
                                )}
                            </div>

                            {/* Author */}
                            <div style={{ width: '80px', textAlign: 'center', color: textSec, fontSize: isSketch ? '10px' : '13px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {post.authorName}
                            </div>
                            {/* Date */}
                            <div style={{ width: '80px', textAlign: 'center', color: textSec, fontSize: isSketch ? '9px' : '12px' }}>
                                {formatDate(post.createdAt)}
                            </div>
                            {/* Likes */}
                            <div style={{
                                width: '60px',
                                textAlign: 'center',
                                color: post.likes > 0 ? (isDark ? '#c9a55a' : '#ff4d4f') : textSec,
                                fontWeight: post.likes > 0 ? 600 : 400,
                                fontSize: isSketch ? '10px' : '13px',
                            }}>
                                {post.likes > 0 ? `♥ ${post.likes}` : '—'}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default CommunityList;
