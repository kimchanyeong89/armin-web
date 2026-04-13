
import React, { useEffect } from 'react';
import { auth } from '../firebase';
import { GoogleAuthProvider, signInWithPopup, signInAnonymously } from 'firebase/auth';
import { getFirestore, doc, getDoc, setDoc } from 'firebase/firestore';
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

const LoginSelectionModal: React.FC<LoginSelectionModalProps> = ({ onClose }) => {
    const navigate = useNavigate();
    const mobileAppContainer = isMobileAppContainer();

    // Initialize Naver Login
    useEffect(() => {
        if (mobileAppContainer) return;
        if (!window.naver) return;

        const naverLogin = new window.naver.LoginWithNaverId({
            clientId: "YOUR_NAVER_CLIENT_ID", // Replace with actual Client ID
            callbackUrl: window.location.origin, // Redirect to same page to handle callback
            isPopup: false, // Use redirect style
            loginButton: { color: "green", type: 3, height: 50 }, // Standard Green Button
            callbackHandle: true
        });

        naverLogin.init();

        // Check if we are in the callback state
        naverLogin.getLoginStatus(async (status: boolean) => {
            if (status) {
                const { email, nickname, id, profile_image, birthday, birthyear } = naverLogin.user;
                console.log("Naver Login Success:", naverLogin.user);

                // Since we don't have a backend to mint a proper Firebase token,
                // we will sign in anonymously to Firebase to get a UID, 
                // and then link/store the Naver profile data.
                try {
                    const userCred = await signInAnonymously(auth);
                    const uid = userCred.user.uid;

                    // Check if profile exists
                    const db = getFirestore();
                    const userRef = doc(db, 'users', uid);
                    const userSnap = await getDoc(userRef);

                    if (!userSnap.exists() || !userSnap.data().isProfileComplete) {
                        // Save Naver data as initial data
                        await setDoc(userRef, {
                            email,
                            nickname,
                            provider: 'naver',
                            naverId: id,
                            photoURL: profile_image,
                            birthDate: birthyear && birthday ? `${birthyear}-${birthday}` : '',
                            createdAt: new Date(),
                            isProfileComplete: false // Force onboarding to confirm/edit fields
                        }, { merge: true });

                        navigate('/onboarding');
                    } else {
                        // Profile exists
                        navigate('/mypage');
                        // Or handle "Restore" logic if using persistent IDs (requires backend)
                    }
                    onClose();
                } catch (error) {
                    console.error("Firebase Anon Auth Error", error);
                }
            }
        });

    }, [mobileAppContainer, navigate, onClose]);

    const handleGoogleLogin = async () => {
        try {
            if (mobileAppContainer) {
                window.dispatchEvent(new Event('auth:request-login'));
                onClose();
                return;
            }

            const provider = new GoogleAuthProvider();
            const result = await signInWithPopup(auth, provider);
            const user = result.user;
            console.log("Google Login Success, UID:", user.uid);

            // Check profile
            const db = getFirestore();
            const userRef = doc(db, 'users', user.uid);
            const userSnap = await getDoc(userRef);

            console.log("User Doc Exists:", userSnap.exists());
            if (userSnap.exists()) {
                console.log("User Data:", userSnap.data());
            }

            if (!userSnap.exists() || !userSnap.data()?.isProfileComplete) {
                console.log("Redirecting to onboarding...");
                navigate('/onboarding');
            } else {
                console.log("Profile complete, staying on page.");
                // Ensure Navbar updates
            }
            onClose();
        } catch (error) {
            console.error("Google Login Error", error);
            alert("Google Login Failed");
        }
    };

    return (
        <div style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 6000
        }} onClick={onClose}>
            <div style={{
                background: 'white',
                padding: '32px',
                borderRadius: '16px',
                width: '90%',
                maxWidth: '400px',
                textAlign: 'center',
                boxShadow: '0 10px 40px rgba(0,0,0,0.2)'
            }} onClick={e => e.stopPropagation()}>
                <h2 style={{ marginBottom: 24, fontSize: 24, fontWeight: 'bold' }}>로그인</h2>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {/* Google Button */}
                    <button
                        onClick={handleGoogleLogin}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 12,
                            padding: '12px',
                            borderRadius: '6px',
                            border: '1px solid #ddd',
                            background: 'white',
                            fontSize: 16,
                            cursor: 'pointer',
                            fontWeight: 500
                        }}
                    >
                        <img src="https://upload.wikimedia.org/wikipedia/commons/c/c1/Google_%22G%22_logo.svg" alt="Google" width="20" />
                        Google로 계속하기
                    </button>

                    {/* Naver Button Container - SDK renders button here */}
                    {/* We hide the default button and style our own, checking Naver docs? 
              Actually, the SDK renders an image button inside the div id.
              We can style a custom button and trigger the click on the hidden SDK button 
              OR just use the SDK button. 
              Let's use the SDK button container for simplicity first. 
          */}
                    <div id="naverIdLogin" style={{ display: 'none' }}></div>

                    <button
                        onClick={() => {
                            if (mobileAppContainer) {
                                requestExternalMobileLogin('naver');
                                onClose();
                                return;
                            }

                            const btn = document.getElementById('naverIdLogin')?.firstChild as HTMLElement;
                            if (btn) btn.click();
                        }}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 12,
                            padding: '12px',
                            borderRadius: '6px',
                            border: 'none',
                            background: '#03C75A',
                            color: 'white',
                            fontSize: 16,
                            cursor: 'pointer',
                            fontWeight: 500
                        }}
                    >
                        <span style={{ fontWeight: 900 }}>N</span>
                        네이버로 계속하기
                    </button>

                </div>

                <button
                    onClick={onClose}
                    style={{
                        marginTop: 20,
                        background: 'none',
                        border: 'none',
                        color: '#888',
                        cursor: 'pointer',
                        fontSize: 14
                    }}
                >
                    취소
                </button>

                <p style={{ fontSize: 11, color: '#999', marginTop: 12 }}>
                    {mobileAppContainer
                        ? '* 앱에서는 내부 로그인 화면으로 이동해 인증을 진행합니다.'
                        : '* 네이버 로그인을 위해서는 Client ID 설정이 필요합니다.'}
                </p>
            </div>
        </div>
    );
};

export default LoginSelectionModal;
