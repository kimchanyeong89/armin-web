import React, { useState, useEffect } from 'react';
import { db, auth } from '../firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

interface BugReportModalProps {
    onClose: () => void;
}

const BugReportModal: React.FC<BugReportModalProps> = ({ onClose }) => {
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isAnimating, setIsAnimating] = useState(false);

    useEffect(() => {
        // Trigger entrance animation for the dropdown effect
        requestAnimationFrame(() => setIsAnimating(true));
    }, []);

    const handleClose = () => {
        setIsAnimating(false);
        setTimeout(onClose, 250); // wait for exit animation
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!title.trim() || !description.trim()) {
            alert('제목과 내용을 모두 입력해주세요.');
            return;
        }

        setIsSubmitting(true);
        try {
            const user = auth.currentUser;
            const email = user ? user.email : 'Unknown Guest';
            const uid = user ? user.uid : 'guest';

            await addDoc(collection(db, 'bug_reports'), {
                title, description, status: 'open',
                userEmail: email, userId: uid, createdAt: serverTimestamp(),
            });

            await addDoc(collection(db, 'mail'), {
                to: 'kietzland@gmail.com',
                message: {
                    subject: `[Bug Report] ${title}`,
                    html: `<p><strong>From:</strong> ${email}</p><p><strong>Title:</strong> ${title}</p><p>${description}</p>`,
                }
            });

            alert('버그 리포트가 성공적으로 접수되었습니다. 감사합니다.');
            handleClose();
        } catch (error) {
            console.error('Error submitting bug report:', error);
            alert('전송에 실패했습니다. 관리자에게 문의해주세요.');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <>
            {/* Invisible backdrop to capture clicks outside the dropdown panel */}
            <div
                style={{ position: 'fixed', inset: 0, zIndex: 999998 }}
                onClick={handleClose}
            />

            {/* Dropdown Panel Container - Smooth popup attached directly to nav bar */}
            <div style={{
                position: 'relative',
                zIndex: 999999,
                background: 'rgba(255, 255, 255, 0.98)',
                width: '420px',
                borderRadius: '24px',
                padding: '32px',
                boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
                border: '1px solid rgba(0,0,0,0.05)',
                // Transition mechanics designed to match the 'selected state dropdown' feel
                opacity: isAnimating ? 1 : 0,
                transform: isAnimating ? 'translateY(0) scale(1)' : 'translateY(-10px) scale(0.98)',
                transition: 'opacity 0.25s cubic-bezier(0.2, 0.8, 0.2, 1), transform 0.25s cubic-bezier(0.2, 0.8, 0.2, 1)',
                transformOrigin: 'top center',
            }} onClick={e => e.stopPropagation()}>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                    <h2 style={{
                        margin: 0,
                        fontSize: 22,
                        fontWeight: 800,
                        letterSpacing: '-0.3px',
                        color: '#000',
                        fontFamily: "'Inter', sans-serif"
                    }}>
                        Report an Issue
                    </h2>
                    <button
                        onClick={handleClose}
                        style={{
                            background: '#f1f0e9',
                            border: 'none',
                            width: 32, height: 32,
                            borderRadius: '50%',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            cursor: 'pointer',
                            color: '#000',
                            transition: 'background 0.2s ease',
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = '#e5e3d8'}
                        onMouseLeave={e => e.currentTarget.style.background = '#f1f0e9'}
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                            <path d="M18 6L6 18M6 6l12 12"></path>
                        </svg>
                    </button>
                </div>

                <p style={{ fontSize: 14, color: '#555', marginBottom: 24, lineHeight: 1.5, letterSpacing: '-0.1px', fontFamily: "'Inter', sans-serif" }}>
                    홈페이지 이용 중 발생한 문제나 개선사항을 알려주세요.<br />빠르게 확인 후 조치하겠습니다.
                </p>

                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <div>
                        <input
                            type="text"
                            value={title}
                            onChange={e => setTitle(e.target.value)}
                            placeholder="어떤 문제가 발생했나요?"
                            style={{
                                width: '100%',
                                padding: '16px',
                                border: '1px solid #e0e0e0',
                                fontSize: 15,
                                fontFamily: "'Inter', sans-serif",
                                outline: 'none',
                                borderRadius: '12px',
                                background: '#fcfcfc',
                                transition: 'border-color 0.2s',
                                boxSizing: 'border-box'
                            }}
                            autoFocus
                            onFocus={e => e.target.style.borderColor = '#000'}
                            onBlur={e => e.target.style.borderColor = '#e0e0e0'}
                        />
                    </div>

                    <div>
                        <textarea
                            value={description}
                            onChange={e => setDescription(e.target.value)}
                            placeholder="상황을 구체적으로 설명해주세요."
                            rows={4}
                            style={{
                                width: '100%',
                                padding: '16px',
                                border: '1px solid #e0e0e0',
                                fontSize: 15,
                                fontFamily: "'Inter', sans-serif",
                                outline: 'none',
                                borderRadius: '12px',
                                background: '#fcfcfc',
                                resize: 'none',
                                transition: 'border-color 0.2s',
                                boxSizing: 'border-box'
                            }}
                            onFocus={e => e.target.style.borderColor = '#000'}
                            onBlur={e => e.target.style.borderColor = '#e0e0e0'}
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={isSubmitting}
                        style={{
                            marginTop: 8,
                            padding: '16px',
                            background: isSubmitting ? '#999' : '#000',
                            border: 'none',
                            color: '#fff',
                            fontSize: 15,
                            fontWeight: 700,
                            letterSpacing: '0.5px',
                            fontFamily: "'Inter', sans-serif",
                            cursor: isSubmitting ? 'not-allowed' : 'pointer',
                            borderRadius: '12px',
                            transition: 'transform 0.1s, opacity 0.2s',
                            opacity: (isSubmitting || !title || !description) ? 0.7 : 1,
                        }}
                        onMouseDown={e => { if (!isSubmitting) e.currentTarget.style.transform = 'scale(0.98)' }}
                        onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}
                    >
                        {isSubmitting ? 'Submitting...' : 'Submit Report'}
                    </button>
                </form>
            </div>
        </>
    );
};

export default BugReportModal;
