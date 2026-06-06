
import React, { useState } from 'react';
import { auth } from '../firebase';
import {
    GoogleAuthProvider,
    OAuthProvider,
    signInWithPopup,
    signInWithRedirect,
} from 'firebase/auth';
import { getFirestore, doc, getDoc } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { isMobileAppContainer, requestExternalMobileLogin } from '../utils/mobileAppAuth';

interface LoginSelectionModalProps {
    onClose: () => void;
}

declare global {
    interface Window {
        naver: any;
    }
}

// Render above ArtworkLightbox (z-index 260021) so the user sees the
// modal without us having to close whatever is underneath.
const MODAL_Z_INDEX = 270000;

const LoginSelectionModal: React.FC<LoginSelectionModalProps> = ({ onClose }) => {
    const navigate = useNavigate();
    const mobileAppContainer = isMobileAppContainer();
    const [pendingProvider, setPendingProvider] = useState<'google' | 'apple' | 'naver' | null>(null);

    const handleGoogleLogin = async () => {
        if (pendingProvider) return;
        try {
            setPendingProvider('google');

            if (mobileAppContainer) {
                requestExternalMobileLogin('google');
                onClose();
                return;
            }

            const provider = new GoogleAuthProvider();
            provider.setCustomParameters({ prompt: 'select_account' });
            const result = await signInWithPopup(auth, provider);
            const user = result.user;

            const db = getFirestore();
            const userRef = doc(db, 'users', user.uid);
            const userSnap = await getDoc(userRef);

            if (!userSnap.exists() || !userSnap.data()?.isProfileComplete) {
                navigate('/onboarding');
            }
            onClose();
        } catch (error: unknown) {
            const code = error && typeof error === 'object' && 'code' in error
                ? (error as { code: string }).code
                : '';
            // Popup blocked / unsupported → fall back to redirect.
            if (code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-this-environment') {
                try {
                    const provider = new GoogleAuthProvider();
                    provider.setCustomParameters({ prompt: 'select_account' });
                    await signInWithRedirect(auth, provider);
                    return;
                } catch (redirectErr) {
                    console.error('Google redirect fallback failed', redirectErr);
                }
            }
            // User-cancelled popups are not an error to surface.
            if (code !== 'auth/popup-closed-by-user' && code !== 'auth/cancelled-popup-request') {
                console.error('Google Login Error', error);
                alert('Google 로그인에 실패했습니다.');
            }
            setPendingProvider(null);
        }
    };

    const handleAppleLogin = async () => {
        if (pendingProvider) return;
        try {
            setPendingProvider('apple');

            if (mobileAppContainer) {
                requestExternalMobileLogin('apple');
                onClose();
                return;
            }

            const provider = new OAuthProvider('apple.com');
            provider.addScope('email');
            provider.addScope('name');

            // Popup first (matches LoginButton.tsx). If the popup is blocked or
            // unsupported (Safari ITP, etc.), fall back to signInWithRedirect.
            try {
                await signInWithPopup(auth, provider);
                onClose();
                return;
            } catch (popupErr: unknown) {
                const code = popupErr && typeof popupErr === 'object' && 'code' in popupErr
                    ? (popupErr as { code: string }).code
                    : '';
                if (
                    code === 'auth/popup-blocked' ||
                    code === 'auth/operation-not-supported-in-this-environment' ||
                    code === 'auth/popup-closed-by-user' ||
                    code === 'auth/cancelled-popup-request'
                ) {
                    // popup-closed-by-user just means the user dismissed Apple's
                    // popup — surface that gracefully rather than auto-redirecting.
                    if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
                        setPendingProvider(null);
                        return;
                    }
                    await signInWithRedirect(auth, provider);
                    return;
                }
                throw popupErr;
            }
        } catch (error) {
            console.error('Apple Login Error', error);
            alert('Apple 로그인에 실패했습니다.');
            setPendingProvider(null);
        }
    };

    const handleNaverLogin = () => {
        if (pendingProvider) return;
        setPendingProvider('naver');

        if (mobileAppContainer) {
            requestExternalMobileLogin('naver');
            onClose();
            return;
        }

        // Direct OAuth2 redirect — bypasses the Naver JS SDK's button-click
        // requirement, which was the source of the "YOUR_NAVER_CLIENT_ID"
        // failure when the SDK was initialized with a placeholder. The
        // returned access_token lands on /login/callback, which
        // LoginCallbackPage exchanges for a Firebase session.
        const clientId = import.meta.env.VITE_NAVER_CLIENT_ID || 'aZtMPBM1Qh_Os83uR3TG';
        const callbackUrl = window.location.origin + '/login/callback';
        const state = Math.random().toString(36).substring(2, 12);
        // `auth_type=reauthenticate` forces Naver to show the login screen
        // every time, even when a Naver session already exists in the
        // browser. Without it, returning users get silently logged into
        // whichever Naver account they were last using, with no chance to
        // switch accounts.
        const naverAuthUrl =
            `https://nid.naver.com/oauth2.0/authorize?response_type=token` +
            `&client_id=${encodeURIComponent(clientId)}` +
            `&redirect_uri=${encodeURIComponent(callbackUrl)}` +
            `&state=${encodeURIComponent(state)}` +
            `&auth_type=reauthenticate`;
        window.location.href = naverAuthUrl;
    };

    return (
        <div style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: MODAL_Z_INDEX
        }} onClick={onClose}>
            <div style={{
                background: 'white',
                padding: '32px',
                borderRadius: '16px',
                width: '90%',
                maxWidth: '400px',
                textAlign: 'center',
                boxShadow: '0 10px 40px rgba(0,0,0,0.3)'
            }} onClick={e => e.stopPropagation()}>
                <h2 style={{ marginBottom: 8, fontSize: 22, fontWeight: 700 }}>로그인</h2>
                <p style={{ marginTop: 0, marginBottom: 24, fontSize: 13, color: '#666' }}>
                    좋아요와 플레이리스트를 저장하려면 로그인하세요.
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {/* Google */}
                    <button
                        onClick={handleGoogleLogin}
                        disabled={pendingProvider !== null}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 10,
                            padding: '12px',
                            borderRadius: '8px',
                            border: '1px solid #ddd',
                            background: 'white',
                            fontSize: 15,
                            cursor: pendingProvider ? 'default' : 'pointer',
                            fontWeight: 500,
                            opacity: pendingProvider && pendingProvider !== 'google' ? 0.6 : 1,
                        }}
                    >
                        <svg width="18" height="18" viewBox="0 0 24 24">
                            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                        </svg>
                        Google로 계속하기
                    </button>

                    {/* Apple */}
                    <button
                        onClick={handleAppleLogin}
                        disabled={pendingProvider !== null}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 10,
                            padding: '12px',
                            borderRadius: '8px',
                            border: 'none',
                            background: '#000',
                            color: 'white',
                            fontSize: 15,
                            cursor: pendingProvider ? 'default' : 'pointer',
                            fontWeight: 500,
                            opacity: pendingProvider && pendingProvider !== 'apple' ? 0.6 : 1,
                        }}
                    >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
                            <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
                        </svg>
                        Apple로 계속하기
                    </button>

                    {/* Naver */}
                    <button
                        onClick={handleNaverLogin}
                        disabled={pendingProvider !== null}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 10,
                            padding: '12px',
                            borderRadius: '8px',
                            border: 'none',
                            background: '#03C75A',
                            color: 'white',
                            fontSize: 15,
                            cursor: pendingProvider ? 'default' : 'pointer',
                            fontWeight: 500,
                            opacity: pendingProvider && pendingProvider !== 'naver' ? 0.6 : 1,
                        }}
                    >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
                            <path d="M16.273 12.845L7.376 0H0v24h7.726V11.156L16.624 24H24V0h-7.727v12.845z" />
                        </svg>
                        네이버로 계속하기
                    </button>
                </div>

                <button
                    onClick={onClose}
                    disabled={pendingProvider !== null}
                    style={{
                        marginTop: 20,
                        background: 'none',
                        border: 'none',
                        color: '#888',
                        cursor: pendingProvider ? 'default' : 'pointer',
                        fontSize: 14
                    }}
                >
                    취소
                </button>
            </div>
        </div>
    );
};

export default LoginSelectionModal;
