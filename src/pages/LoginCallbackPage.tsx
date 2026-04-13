
import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth } from '../firebase';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { getFirestore, doc, setDoc, getDoc } from 'firebase/firestore';

/** 모바일 앱 WebView 또는 외부 브라우저 flow에서 실행되는지 확인 */
function isMobileAppFlow(): boolean {
  if (typeof window === 'undefined') return false;
  const q = new URLSearchParams(window.location.search);
  if (q.get('mobileApp') === '1') return true;
  if (document.documentElement.getAttribute('data-mobile-app') === '1') return true;
  const bridge = (window as { ReactNativeWebView?: { postMessage?: unknown } }).ReactNativeWebView;
  return !!(bridge?.postMessage);
}

declare global {
    interface Window {
        naver: any;
    }
}

const LoginCallbackPage: React.FC = () => {
    const navigate = useNavigate();

    const processed = React.useRef(false);

    useEffect(() => {
        if (processed.current) return;
        processed.current = true;

        const processLogin = async () => {
            const location = window.location;

            // Naver returns access_token in the hash
            if (!location.hash.includes('access_token')) {
                // If no token and not redirected, it's just a direct visit
                console.error("No access token found");
                navigate('/login');
                return;
            }

            if (!window.naver) {
                alert("네이버 SDK 로드 실패. 다시 시도해주세요.");
                navigate('/login');
                return;
            }

            const naverLogin = new window.naver.LoginWithNaverId({
                clientId: import.meta.env.VITE_NAVER_CLIENT_ID || "aZtMPBM1Qh_Os83uR3TG",
                callbackUrl: window.location.origin + "/login/callback",
                isPopup: false,
                callbackHandle: true
            });

            naverLogin.init();

            // FIX: Manually parse token and inject if SDK missed it
            const currentToken = location.href.match(/access_token=([^&]*)/)?.[1];
            if (currentToken) {
                // Determine if SDK stored it. If not, force it.
                // The SDK stores it in this.oauthParams.access_token usually.
                // We access it via the public property or internal structure.
                if (!naverLogin.accessToken) {
                    naverLogin.accessToken = {};
                }
                if (!naverLogin.accessToken.accessToken) {
                    naverLogin.accessToken.accessToken = currentToken;
                }
            }

            console.log("Naver SDK Initialized. Token:", currentToken);

            naverLogin.getLoginStatus(async (status: boolean) => {
                console.log("Naver Login Status:", status);
                console.log("Naver User Data:", naverLogin.user);

                // Strict status check usually fails if State doesn't match or permissions are missing.
                // However, sometimes user data is retrieved even if status is technically false (e.g. partial agreement).
                // We will try to proceed if we have the critical 'email' field.
                if (status || (naverLogin.user && naverLogin.user.email)) {
                    const naverUser = naverLogin.user;
                    console.log("Proceeding with Naver User:", naverUser);

                    const email = naverUser.email;
                    const name = naverUser.name || "User"; // Fallback
                    const id = naverUser.id;

                    if (!email || !id) {
                        alert("네이버 로그인으로 이메일 또는 고유 ID를 가져올 수 없습니다. 정보 제공 동의를 확인해주세요.");
                        navigate('/login');
                        return;
                    }

                    const pwd = `naver_login_${id}_secure_!`;

                    try {
                        const existingUser = await signInWithEmailAndPassword(auth, email, pwd)
                            .catch(async (e) => {
                                if (e.code === 'auth/user-not-found' || e.code === 'auth/invalid-credential' || e.code === 'auth/wrong-password') {
                                    const cred = await createUserWithEmailAndPassword(auth, email, pwd);
                                    return cred;
                                }
                                throw e;
                            });

                        const user = existingUser.user;
                        const db = getFirestore();

                        const userDoc = await getDoc(doc(db, "users", user.uid));
                        if (!userDoc.exists()) {
                            await setDoc(doc(db, "users", user.uid), {
                                email: email,
                                naverId: id,
                                nickname: name,
                                displayName: name,
                                provider: 'naver',
                                photoURL: naverUser.profile_image || "",
                                createdAt: new Date(),
                                isOnboarded: false
                            });
                            try {
                                await updateProfile(user, { displayName: name, photoURL: naverUser.profile_image || "" });
                            } catch (e) { }
                        }

                        // 모바일 앱에서 외부 브라우저로 실행된 경우, deep link로 앱으로 복귀
                        if (isMobileAppFlow()) {
                            const q = new URLSearchParams(window.location.search);
                            const provider = q.get('provider') || 'naver';
                            const deepLink = `com.armin.mobile://auth-complete?provider=${encodeURIComponent(provider)}&alreadySignedIn=1`;
                            window.location.replace(deepLink);
                        } else {
                            navigate('/');
                        }
                    } catch (error: any) {
                        console.error("Firebase Login Error", error);
                        alert("로그인 처리 중 오류 발생: " + error.message);
                        navigate('/login');
                    }
                } else {
                    console.error("Naver Login Failed. Status:", status, "User:", naverLogin.user);

                    // const token = location.href.match(/access_token=([^&]*)/)?.[1];
                    alert(`네이버 로그인 실패.\n\n[확인 사항]\n1. 네이버 개발자 센터 > API 설정에서 'Callback URL'이 정확한지 확인하세요.\n현재 설정된 URL: ${window.location.origin}/login/callback\n\n2. '멤버관리 > 사용 API' 탭에서 '이메일(Email)'과 '이름(Name)'이 '필수(Required)'로 체크되어 있어야 합니다.\n\n3. (중요) 브라우저 시크릿 모드나 팝업 차단이 원인일 수 있습니다.\n\n다시 시도해주세요.`);

                    navigate('/login');
                }
            });
        };

        processLogin();
    }, [navigate]);

    return (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', flexDirection: 'column' }}>
            <h2>네이버 로그인 처리 중...</h2>
            <div className="spinner" style={{ marginTop: 20, width: 40, height: 40, borderStyle: 'solid', borderWidth: '4px', borderColor: '#f3f3f3', borderTopColor: '4px solid #03C75A', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
            <style>{`
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
      `}</style>
        </div>
    );
};

export default LoginCallbackPage;
