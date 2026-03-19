import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase';
import HeaderSelector, { type HeaderItem } from '../../components/Community/HeaderSelector';

const WritePostPage: React.FC = () => {
    const { user } = useAuth();
    const navigate = useNavigate();

    const [title, setTitle] = useState('');
    const [content, setContent] = useState('');
    const [header, setHeader] = useState<HeaderItem | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!user) {
            alert('로그인이 필요합니다.');
            return;
        }

        if (!title.trim() || !content.trim()) {
            alert('제목과 내용을 입력해주세요.');
            return;
        }

        if (!header) {
            alert('머릿글(주제)을 선택해주세요. (박물관, 작가, 작품 등)');
            return;
        }

        setIsSubmitting(true);

        try {
            await addDoc(collection(db, 'community_posts'), {
                title,
                content,
                header: {
                    id: header.id,
                    type: header.type,
                    name: header.name,
                    image: header.image || null
                },
                authorId: user.uid,
                authorName: user.displayName || 'Anonymous',
                authorPhotoURL: user.photoURL || null,
                createdAt: serverTimestamp(),
                likes: 0,
                commentCount: 0
            });

            navigate('/community');
        } catch (error) {
            console.error('Error creating post:', error);
            alert('게시글 작성 중 오류가 발생했습니다.');
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!user) {
        return (
            <div style={{ padding: '100px 20px', textAlign: 'center' }}>
                <h2>로그인이 필요합니다.</h2>
                <button onClick={() => navigate('/login')} style={{ marginTop: '20px', padding: '10px 20px', cursor: 'pointer' }}>로그인하기</button>
            </div>
        );
    }

    return (
        <div style={{ maxWidth: '800px', margin: '0 auto', padding: '100px 20px' }}>
            <h1 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '32px' }}>새 게시글 작성</h1>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

                {/* Header Selection Section */}
                <div>
                    <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600' }}>머릿글 (주제) 선택 <span style={{ color: 'red' }}>*</span></label>
                    <div style={{ fontSize: '13px', color: '#666', marginBottom: '8px' }}>
                        작성하려는 글과 관련된 박물관, 미술관, 작가, 혹은 작품을 검색하여 선택해주세요.
                    </div>
                    <HeaderSelector
                        selectedItem={header}
                        onSelect={setHeader}
                    />
                </div>

                {/* Title */}
                <div>
                    <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600' }}>제목</label>
                    <input
                        type="text"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="제목을 입력하세요"
                        style={{
                            width: '100%',
                            padding: '14px',
                            borderRadius: '8px',
                            border: '1px solid #ddd',
                            fontSize: '16px'
                        }}
                    />
                </div>

                {/* Content */}
                <div>
                    <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600' }}>내용</label>
                    <textarea
                        value={content}
                        onChange={(e) => setContent(e.target.value)}
                        placeholder="자유롭게 이야기를 나누어보세요."
                        style={{
                            width: '100%',
                            minHeight: '400px',
                            padding: '14px',
                            borderRadius: '8px',
                            border: '1px solid #ddd',
                            fontSize: '16px',
                            lineHeight: '1.6',
                            resize: 'vertical'
                        }}
                    />
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                    <button
                        type="button"
                        onClick={() => navigate(-1)}
                        style={{
                            padding: '12px 24px',
                            borderRadius: '8px',
                            border: '1px solid #ddd',
                            background: '#fff',
                            cursor: 'pointer',
                            color: '#666',
                            fontWeight: '500'
                        }}
                    >
                        취소
                    </button>
                    <button
                        type="submit"
                        disabled={isSubmitting}
                        style={{
                            padding: '12px 32px',
                            borderRadius: '8px',
                            border: 'none',
                            background: '#000',
                            color: '#fff',
                            cursor: isSubmitting ? 'not-allowed' : 'pointer',
                            fontWeight: '600',
                            opacity: isSubmitting ? 0.7 : 1
                        }}
                    >
                        {isSubmitting ? '등록 중...' : '등록하기'}
                    </button>
                </div>

            </form>
        </div>
    );
};

export default WritePostPage;
