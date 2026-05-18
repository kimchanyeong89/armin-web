import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth } from '../firebase';
import { GoogleAuthProvider, OAuthProvider, signInWithPopup, signInWithRedirect, signOut, onAuthStateChanged } from 'firebase/auth';
import type { User } from 'firebase/auth';
import { getFirestore, doc, getDoc } from 'firebase/firestore';
import { isMobileAppContainer, requestExternalMobileLogin } from '../utils/mobileAppAuth';

// 인앱 브라우저 감지 (카카오톡, 인스타그램, 페이스북 등)
const isInAppBrowser = (): boolean => {
    const ua = navigator.userAgent || navigator.vendor || '';
    // 카카오톡, 인스타그램, 페이스북, 라인, 네이버 등 인앱 브라우저 감지
    return /KAKAOTALK|Instagram|FBAN|FBAV|Line|NAVER|Snapchat|Twitter/i.test(ua) ||
        // iOS WebView 감지
        (/(iPhone|iPod|iPad).*AppleWebKit(?!.*Safari)/i.test(ua)) ||
        // Android WebView 감지
        (/wv\)/.test(ua) && /Android/.test(ua));
};

export const LoginButton: React.FC<{ style?: React.CSSProperties }> = ({ style }) => {
    const navigate = useNavigate();
    const mobileAppContainer = isMobileAppContainer();
    const [user, setUser] = useState<User | null>(null);
    const [profileData, setProfileData] = useState<any>(null);
    const [showBrowserAlert, setShowBrowserAlert] = useState(false);
    const [showLoginModal, setShowLoginModal] = useState(false);
    const [isLandscape, setIsLandscape] = useState(true);

    useEffect(() => {
        let mounted = true;
        const unsub = onAuthStateChanged(auth, (u) => {
            if (mounted) setUser(u);
        });
        return () => {
            mounted = false;
            unsub();
        };
    }, []);

    // Fetch profile data when user is set
    useEffect(() => {
        if (!user) {
            setProfileData(null);
            return;
        }
        const fetchProfile = async () => {
            try {
                const db = getFirestore();
                const snap = await getDoc(doc(db, "users", user.uid));
                if (snap.exists()) {
                    setProfileData(snap.data());
                }
            } catch (e) {
                console.error("Failed to fetch profile for LoginButton", e);
            }
        };
        fetchProfile();
    }, [user]);

    const handleLoginWithProvider = async (providerType: 'google' | 'apple') => {
        if (mobileAppContainer) {
            setShowLoginModal(false);
            // Skip the intermediate in-WebView /login page — open the
            // external browser auth session directly. /login in the
            // external browser auto-triggers signInWithRedirect on Android,
            // so the user only sees Google's account picker.
            requestExternalMobileLogin(providerType);
            return;
        }

        // 인앱 브라우저인 경우 외부 브라우저 유도
        if (isInAppBrowser()) {
            setShowLoginModal(false);
            setShowBrowserAlert(true);
            return;
        }

        try {
            let provider;
            if (providerType === 'google') {
                provider = new GoogleAuthProvider();
                provider.setCustomParameters({ prompt: 'select_account' });
            } else {
                provider = new OAuthProvider('apple.com');
                provider.addScope('email');
                provider.addScope('name');
            }

            await signInWithPopup(auth, provider);
            setShowLoginModal(false);
        } catch (error: unknown) {
            // disallowed_useragent 에러 시 redirect 방식으로 폴백
            if (error && typeof error === 'object' && 'code' in error &&
                (error as { code: string }).code === 'auth/operation-not-supported-in-this-environment') {
                if (mobileAppContainer) {
                    window.dispatchEvent(new Event('auth:request-login'));
                    return;
                }

                let provider;
                provider = providerType === 'google'
                    ? new GoogleAuthProvider()
                    : new OAuthProvider('apple.com');
                await signInWithRedirect(auth, provider);
            } else {
                console.error("Login failed", error);
                alert('로그인에 실패했습니다. 다시 시도해주세요.');
            }
        }
    };

    const handleLogin = async () => {
        if (mobileAppContainer) {
            navigate('/login?mobileApp=1');
            return;
        }

        // 인앱 브라우저인 경우 외부 브라우저 유도
        if (isInAppBrowser()) {
            setShowBrowserAlert(true);
            return;
        }

        // 로그인 옵션 모달 표시
        setShowLoginModal(true);
    };

    const handleLogout = async () => {
        await signOut(auth);
    };

    const [showDropdown, setShowDropdown] = useState(false);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        const handleLoginRequest = () => {
            if (user) return;
            if (mobileAppContainer) {
                navigate('/login?mobileApp=1');
                return;
            }
            if (isInAppBrowser()) {
                setShowBrowserAlert(true);
                return;
            }
            setShowLoginModal(true);
        };
        window.addEventListener('auth:request-login', handleLoginRequest);
        return () => {
            window.removeEventListener('auth:request-login', handleLoginRequest);
        };
    }, [mobileAppContainer, navigate, user]);

    // 인앱 브라우저 알림 모달
    if (showBrowserAlert) {
        return (
            <div style={{ position: 'relative', ...style }}>
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: 'rgba(0,0,0,0.5)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 25000
                }}>
                    <div style={{
                        background: 'white',
                        padding: '24px',
                        borderRadius: '12px',
                        maxWidth: '320px',
                        textAlign: 'center',
                        boxShadow: '0 4px 20px rgba(0,0,0,0.2)'
                    }}>
                        <p style={{ fontSize: 14, marginBottom: 16, lineHeight: 1.5 }}>
                            Google 로그인은 외부 브라우저에서만 가능합니다.<br />
                            <strong>Safari</strong> 또는 <strong>Chrome</strong>에서 열어주세요.
                        </p>
                        <button
                            onClick={() => {
                                // URL 복사
                                navigator.clipboard?.writeText(window.location.href);
                                alert('URL이 복사되었습니다. 브라우저에 붙여넣기 해주세요.');
                            }}
                            style={{
                                padding: '10px 20px',
                                background: '#4285f4',
                                color: 'white',
                                border: 'none',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                marginRight: 8
                            }}
                        >
                            URL 복사
                        </button>
                        <button
                            onClick={() => setShowBrowserAlert(false)}
                            style={{
                                padding: '10px 20px',
                                background: '#eee',
                                border: 'none',
                                borderRadius: '6px',
                                cursor: 'pointer'
                            }}
                        >
                            닫기
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // 로그인 옵션 모달
    if (showLoginModal) {
        return (
            <div style={{ position: 'relative', ...style }}>
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: 'rgba(0,0,0,0.5)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 25000
                }} onClick={() => setShowLoginModal(false)}>
                    <div style={{
                        background: 'white',
                        padding: '28px 32px',
                        borderRadius: '16px',
                        maxWidth: '340px',
                        width: '90%',
                        textAlign: 'center',
                        boxShadow: '0 8px 32px rgba(0,0,0,0.2)'
                    }} onClick={e => e.stopPropagation()}>
                        <h3 style={{ margin: '0 0 20px', fontSize: 18, fontWeight: 600 }}>로그인</h3>

                        {/* Google 로그인 */}
                        <button
                            onClick={() => handleLoginWithProvider('google')}
                            style={{
                                width: '100%',
                                padding: '12px 16px',
                                marginBottom: 10,
                                background: 'white',
                                border: '1px solid #ddd',
                                borderRadius: '8px',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: 10,
                                fontSize: 14,
                                fontWeight: 500,
                                transition: 'background 0.2s'
                            }}
                            onMouseOver={e => (e.currentTarget.style.background = '#f5f5f5')}
                            onMouseOut={e => (e.currentTarget.style.background = 'white')}
                        >
                            <svg width="18" height="18" viewBox="0 0 24 24">
                                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                            </svg>
                            Google로 계속하기
                        </button>

                        {/* Apple 로그인 */}
                        <button
                            onClick={() => handleLoginWithProvider('apple')}
                            style={{
                                width: '100%',
                                padding: '12px 16px',
                                marginBottom: 16,
                                background: 'black',
                                border: 'none',
                                borderRadius: '8px',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: 10,
                                fontSize: 14,
                                fontWeight: 500,
                                color: 'white',
                                transition: 'opacity 0.2s'
                            }}
                            onMouseOver={e => (e.currentTarget.style.opacity = '0.85')}
                            onMouseOut={e => (e.currentTarget.style.opacity = '1')}
                        >
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
                                <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
                            </svg>
                            Apple로 계속하기
                        </button>

                        {/* Naver Login */}
                        <button
                            onClick={() => {
                                if (mobileAppContainer) {
                                    setShowLoginModal(false);
                                    requestExternalMobileLogin('naver');
                                    return;
                                }

                                const clientId = import.meta.env.VITE_NAVER_CLIENT_ID || "aZtMPBM1Qh_Os83uR3TG";
                                const callbackUrl = window.location.origin + "/login/callback";
                                console.log("Naver Login Callback URL:", callbackUrl); // For debugging
                                const state = Math.random().toString(36).substring(7);
                                const naverAuthUrl = `https://nid.naver.com/oauth2.0/authorize?response_type=token&client_id=${clientId}&redirect_uri=${encodeURIComponent(callbackUrl)}&state=${state}`;
                                window.location.href = naverAuthUrl;
                            }}
                            style={{
                                width: '100%',
                                padding: '12px 16px',
                                marginBottom: 16,
                                background: '#03C75A',
                                border: 'none',
                                borderRadius: '8px',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: 10,
                                fontSize: 14,
                                fontWeight: 500,
                                color: 'white',
                                transition: 'opacity 0.2s'
                            }}
                            onMouseOver={e => (e.currentTarget.style.opacity = '0.9')}
                            onMouseOut={e => (e.currentTarget.style.opacity = '1')}
                        >
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
                                <path d="M16.273 12.845L7.376 0H0v24h7.726V11.156L16.624 24H24V0h-7.727v12.845z" />
                            </svg>
                            네이버로 계속하기
                        </button>

                        <button
                            onClick={() => setShowLoginModal(false)}
                            style={{
                                background: 'none',
                                border: 'none',
                                color: '#888',
                                cursor: 'pointer',
                                fontSize: 13
                            }}
                        >
                            취소
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    if (!user) {
        return (
            <button
                onClick={handleLogin}
                style={{
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                    background: 'none',
                    border: 'none',
                    color: '#333',
                    fontFamily: 'inherit',
                    textTransform: 'lowercase',
                    letterSpacing: 0.4,
                    padding: 0,
                    ...style
                }}
            >
                login
            </button>
        );
    }

    return (
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', ...style }}>
            <div
                onClick={() => setShowDropdown(!showDropdown)}
                style={{
                    display: 'flex', alignItems: 'center', cursor: 'pointer',
                    width: 24, height: 24, borderRadius: '50%', border: '1px solid #ddd',
                    position: 'relative', overflow: 'hidden', background: '#ccc'
                }}
            >
                {(() => {
                    const photoURL = profileData?.photoURL || user?.photoURL;
                    if (photoURL) {
                        // Only apply the saved crop when we are showing the
                        // user-uploaded custom photo. If we fell back to the
                        // OAuth provider photo (user.photoURL), the crop was
                        // saved for a different image and would shift this
                        // one off-screen.
                        const isCustom = !!profileData?.photoURL;
                        const crop = isCustom
                            ? (profileData?.profileImageCrop || { x: 0, y: 0, scale: 1 })
                            : { x: 0, y: 0, scale: 1 };
                        // Icon size is 24px, original crop was 240px. Ratio = 24 / 240 = 0.1
                        const ratio = 24 / 240;

                        return (
                            <img
                                src={photoURL}
                                alt="Profile"
                                loading="eager"
                                referrerPolicy="no-referrer"
                                onLoad={(e) => {
                                    const { naturalWidth, naturalHeight } = e.currentTarget;
                                    setIsLandscape(naturalWidth >= naturalHeight);
                                }}
                                style={{
                                    position: 'absolute',
                                    top: '50%', left: '50%',
                                    width: isLandscape ? 'auto' : 24,
                                    height: isLandscape ? 24 : 'auto',
                                    minWidth: 24, minHeight: 24,
                                    maxWidth: 'none', maxHeight: 'none',
                                    // Apply same transform logic as modal, scaled down to 24px
                                    transform: `translate(-50%, -50%) translate(${crop.x * ratio}px, ${crop.y * ratio}px) scale(${crop.scale})`,
                                    objectFit: 'contain'
                                }}
                            />
                        );
                    }
                    return (
                        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#fff' }}>
                            {user?.email?.[0]?.toUpperCase() || 'U'}
                        </div>
                    );
                })()}
            </div>

            {showDropdown && (
                <div style={{
                    position: 'absolute',
                    top: '100%',
                    right: 0,
                    marginTop: 8,
                    background: '#fff',
                    boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
                    borderRadius: 8,
                    padding: '8px 0',
                    zIndex: 1000,
                    minWidth: 120
                }}>
                    <button
                        onClick={() => {
                            setShowDropdown(false);
                            navigate('/mypage');
                        }}
                        style={{
                            display: 'block',
                            width: '100%',
                            textAlign: 'left',
                            padding: '8px 16px',
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            fontSize: 12,
                            color: '#333',
                            fontWeight: 600
                        }}
                        onMouseOver={e => e.currentTarget.style.background = '#f5f5f5'}
                        onMouseOut={e => e.currentTarget.style.background = 'none'}
                    >
                        마이페이지
                    </button>
                    <button
                        onClick={() => {
                            setShowDropdown(false);
                            navigate('/onboarding');
                        }}
                        style={{
                            display: 'block',
                            width: '100%',
                            textAlign: 'left',
                            padding: '8px 16px',
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            fontSize: 12,
                            color: '#333',
                            fontWeight: 600
                        }}
                        onMouseOver={e => e.currentTarget.style.background = '#f5f5f5'}
                        onMouseOut={e => e.currentTarget.style.background = 'none'}
                    >
                        프로필 수정
                    </button>
                    <div style={{ height: 1, background: '#eee', margin: '4px 0' }} />
                    <button
                        onClick={handleLogout}
                        style={{
                            display: 'block',
                            width: '100%',
                            textAlign: 'left',
                            padding: '8px 16px',
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            fontSize: 12,
                            color: '#333',
                            fontWeight: 600
                        }}
                    >
                        Logout
                    </button>
                </div>
            )}
        </div>
    );
};
