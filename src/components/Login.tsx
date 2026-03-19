
import React, { useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { GoogleAuthProvider, OAuthProvider, signInWithPopup, signInWithRedirect } from 'firebase/auth';
import { auth } from "../firebase";

const Login: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (user) {
      navigate("/");
    }
  }, [user, navigate]);

  // Initialize Naver Login SDK to use its proper authorization method (handling state/CSRF)
  useEffect(() => {
    const initNaver = () => {
      if (!window.naver) return;

      const clientId = import.meta.env.VITE_NAVER_CLIENT_ID || "aZtMPBM1Qh_Os83uR3TG";
      const callbackUrl = window.location.origin + "/login/callback";

      const naverLogin = new window.naver.LoginWithNaverId({
        clientId: clientId,
        callbackUrl: callbackUrl,
        isPopup: false,
        loginButton: { color: "green", type: 3, height: 60 } // We will hide this
      });

      naverLogin.init();
    };

    initNaver();
  }, []);

  const handleNaverLogin = () => {
    // Instead of manual URL, find the hidden Naver button and click it
    // This ensures state is saved correctly for the callback verification
    const naverButton = document.querySelector('#naverIdLogin > a') as HTMLElement;
    if (naverButton) {
      naverButton.click();
    } else {
      // Fallback if SDK fails to render
      alert("네이버 로그인 초기화 중... 잠시 후 다시 시도해주세요.");
      // Try to re-init?
    }
  };

  const handleLoginWithProvider = async (providerType: 'google' | 'apple') => {
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
      // navigate handled by AuthContext or useEffect
    } catch (error: unknown) {
      if (error && typeof error === 'object' && 'code' in error &&
        (error as { code: string }).code === 'auth/operation-not-supported-in-this-environment') {
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

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      height: "100vh",
      paddingTop: "60px", // space for navbar
      background: "#fff"
    }}>
      {/* Hidden container for official Naver button */}
      <div id="naverIdLogin" style={{ display: 'none' }} />

      <div style={{
        padding: "40px",
        borderRadius: "16px",
        boxShadow: "0 4px 24px rgba(0,0,0,0.1)",
        textAlign: "center",
        width: "100%",
        maxWidth: "400px"
      }}>
        <h2 style={{ marginBottom: "24px", fontSize: "24px", fontWeight: "bold" }}>로그인</h2>
        <p style={{ marginBottom: "32px", color: "#666" }}>
          아르민 갤러리에 오신 것을 환영합니다.<br />
          로그인 후 다양한 전시를 즐겨보세요.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {/* Naver */}
          <button
            type="button"
            onClick={handleNaverLogin}
            style={{
              width: '100%',
              padding: '12px 16px',
              background: '#03C75A',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontSize: '15px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '10px'
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
              <path d="M16.273 12.845L7.376 0H0v24h7.726V11.156L16.624 24H24V0h-7.727v12.845z" />
            </svg>
            네이버로 계속하기
          </button>

          {/* Google */}
          <button
            onClick={() => handleLoginWithProvider('google')}
            style={{
              width: '100%',
              padding: '12px 16px',
              background: 'white',
              color: '#333',
              border: '1px solid #ddd',
              borderRadius: '8px',
              fontSize: '15px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '10px'
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
            onClick={() => handleLoginWithProvider('apple')}
            style={{
              width: '100%',
              padding: '12px 16px',
              background: 'black',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontSize: '15px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '10px'
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
              <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
            </svg>
            Apple로 계속하기
          </button>

        </div>
      </div>
    </div>
  );
};

export default Login;