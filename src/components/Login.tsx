
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useLocation, useNavigate } from "react-router-dom";
import { GoogleAuthProvider, OAuthProvider, browserLocalPersistence, getRedirectResult, setPersistence, signInWithPopup, signInWithRedirect, signInWithCredential } from 'firebase/auth';
import { auth } from "../firebase";
import { useLanguage } from "../contexts/LanguageContext";
import { isMobileAppContainer, requestExternalMobileLogin } from "../utils/mobileAppAuth";

const AUTO_START_KEY_PREFIX = "auth:auto-start:";
const REDIRECT_LOCK_PREFIX = "auth:redirect-lock:";
const POPUP_FALLBACK_PREFIX = "auth:popup-fallback:";
const NETWORK_RETRY_PREFIX = "auth:network-retry:";

const Login: React.FC = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { language, t } = useLanguage();
  const [loginHint, setLoginHint] = useState<string | null>(null);
  const [pendingProvider, setPendingProvider] = useState<"google" | "apple" | "naver" | null>(null);

  const query = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const isExternalBrowserFlow = query.get("externalBrowser") === "1";
  const isMobileContainer = useMemo(() => isMobileAppContainer(), [query]);
  const externalProvider = query.get("provider");
  const shouldAutoStartProvider =
    query.get("start") === "1" &&
    (externalProvider === "google" || externalProvider === "apple" || externalProvider === "naver");
  const autoStartProvider = useMemo(() => {
    if (!shouldAutoStartProvider) return null;
    if (externalProvider === "google" || externalProvider === "apple" || externalProvider === "naver") {
      return externalProvider;
    }
    return null;
  }, [externalProvider, shouldAutoStartProvider]);
  const autoStartKey = useMemo(() => {
    if (!autoStartProvider) return null;
    return `${AUTO_START_KEY_PREFIX}${autoStartProvider}`;
  }, [autoStartProvider]);

  const cleanLoginQuery = useCallback(() => {
    try {
      const cleanUrl = new URL(window.location.href);
      const hadProviderParams =
        cleanUrl.searchParams.has("provider") ||
        cleanUrl.searchParams.has("start") ||
        cleanUrl.searchParams.has("externalBrowser");
      if (!hadProviderParams) return;
      cleanUrl.searchParams.delete("provider");
      cleanUrl.searchParams.delete("start");
      cleanUrl.searchParams.delete("externalBrowser");
      window.history.replaceState({}, "", `${cleanUrl.pathname}${cleanUrl.search}${cleanUrl.hash}`);
    } catch {
      // Ignore URL normalization failures.
    }
  }, []);

  const postAuthFlowLog = useCallback((level: "info" | "warn" | "error", message: string, code?: string) => {
    try {
      const bridge = (window as { ReactNativeWebView?: { postMessage?: (payload: string) => void } }).ReactNativeWebView;
      if (!bridge?.postMessage) return;
      bridge.postMessage(
        JSON.stringify({
          type: "AUTH_FLOW_LOG",
          level,
          message,
          code: code || "",
        }),
      );
    } catch {
      // Ignore bridge logging issues.
    }
  }, []);

  const redirectTarget = useMemo(() => {
    const state = location.state as { from?: string } | null;
    if (state?.from && typeof state.from === "string") return state.from;
    return "/";
  }, [location.state]);

  useEffect(() => {
    if (user && !user.isAnonymous) {
      if (isMobileContainer && query.get("returnToApp") === "1") {
        return;
      }
      sessionStorage.removeItem(`${REDIRECT_LOCK_PREFIX}google`);
      sessionStorage.removeItem(`${REDIRECT_LOCK_PREFIX}apple`);
      sessionStorage.removeItem(`${NETWORK_RETRY_PREFIX}google`);
      sessionStorage.removeItem(`${NETWORK_RETRY_PREFIX}apple`);
      navigate(redirectTarget, { replace: true });
    }
  }, [user, navigate, redirectTarget, isMobileContainer, query]);

  // Initialize Naver Login SDK to use its proper authorization method (handling state/CSRF)
  useEffect(() => {
    const initNaver = () => {
      if (!window.naver) return;

      const clientId = import.meta.env.VITE_NAVER_CLIENT_ID || "aZtMPBM1Qh_Os83uR3TG";
      // 모바일 앱 external browser flow인 경우 callbackUrl에 mobileApp 파라미터 포함
      // (네이버 개발자 센터에 이 URL도 등록 필요)
      let callbackUrl = window.location.origin + "/login/callback";
      if (isExternalBrowserFlow) {
        callbackUrl += "?mobileApp=1&provider=naver";
      }

      const naverLogin = new window.naver.LoginWithNaverId({
        clientId: clientId,
        callbackUrl: callbackUrl,
        isPopup: false,
        loginButton: { color: "green", type: 3, height: 60 } // We will hide this
      });

      naverLogin.init();
    };

    initNaver();
  }, [isExternalBrowserFlow]);

  useEffect(() => {
    const handleMobileCredential = async (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail?.provider) return;
      const idToken = typeof detail.idToken === "string" ? detail.idToken : "";
      const accessToken = typeof detail.accessToken === "string" ? detail.accessToken : "";
      if (detail.provider === "google" && !idToken && !accessToken) return;
      if (detail.provider === "apple" && !idToken) return;

      setLoginHint(t({ ko: "로그인 정보를 확인 중입니다...", en: "Verifying login information..." }));
      try {
        let cred;
        if (detail.provider === "google") {
          cred = GoogleAuthProvider.credential(idToken || null, accessToken || null);
        } else if (detail.provider === "apple") {
          cred = new OAuthProvider("apple.com").credential({ idToken, rawNonce: detail.rawNonce || undefined });
        }
        if (cred) {
          await signInWithCredential(auth, cred);
          postAuthFlowLog("info", "Mobile credential sign in successful", detail.provider);
        }
      } catch (err: unknown) {
        const code = err && typeof err === "object" && "code" in err ? (err as { code: string }).code : "";
        console.error("Mobile credential login failed", err);
        postAuthFlowLog("error", "Mobile credential sign in failed", code);
      }
    };

    window.addEventListener("auth:mobile-credential", handleMobileCredential);
    return () => window.removeEventListener("auth:mobile-credential", handleMobileCredential);
  }, [t, postAuthFlowLog]);

  const requestExternalAuth = useCallback(
    (provider: "google" | "apple" | "naver") => {
      const opened = requestExternalMobileLogin(provider);
      if (opened) {
        setLoginHint(
          t({
            ko: "로그인 화면으로 이동 중입니다.",
            en: "Moving to the login flow.",
          }),
        );
      }
    },
    [t],
  );

  const handleNaverLogin = useCallback((options?: { fromAutoStart?: boolean; silent?: boolean; attempt?: number }) => {
    const fromAutoStart = options?.fromAutoStart === true;
    const silent = options?.silent === true;
    const attempt = options?.attempt ?? 0;

    if (isMobileContainer && !isExternalBrowserFlow && !fromAutoStart && !shouldAutoStartProvider) {
      requestExternalAuth("naver");
      return;
    }

    const naverButton = document.querySelector('#naverIdLogin > a') as HTMLElement;
    if (naverButton) {
      naverButton.click();
    } else {
      if (fromAutoStart && attempt < 10) {
        window.setTimeout(() => {
          handleNaverLogin({ fromAutoStart: true, silent: true, attempt: attempt + 1 });
        }, 180);
        return;
      }

      if (!silent) {
        alert(t({ ko: "네이버 로그인 초기화 중입니다. 잠시 후 다시 시도해주세요.", en: "Naver login is initializing. Please try again shortly." }));
      }
    }
  }, [isExternalBrowserFlow, isMobileContainer, requestExternalAuth, shouldAutoStartProvider, t]);

  const handleLoginWithProvider = useCallback(async (providerType: 'google' | 'apple', forceRedirect = false) => {
    // Determine whether to use redirect or popup:
    // - Apple: always redirect (Apple Sign-In popup not supported in WKWebView)
    // - Google in external browser (ASWebAuthenticationSession): always redirect
    // - Google in WebView (isMobileContainer && !isExternalBrowserFlow): use POPUP
    //   (WKWebView handles window.open via onOpenWindow → App.tsx manages the auth session)
    // - Google normal web: popup unless forceRedirect
    const googleInWebView = providerType === 'google' && isMobileContainer && !isExternalBrowserFlow;
    const shouldUseRedirect =
      providerType === 'apple'
      || (isExternalBrowserFlow && !googleInWebView)
      || (forceRedirect && !googleInWebView);

    if (pendingProvider && !shouldUseRedirect) {
      postAuthFlowLog("info", `Skip duplicate auth tap for ${providerType}`);
      return;
    }

    try {
      setPendingProvider(providerType);
      let provider;
      if (providerType === 'google') {
        provider = new GoogleAuthProvider();
        provider.setCustomParameters({ prompt: 'select_account' });
      } else {
        provider = new OAuthProvider('apple.com');
        provider.addScope('email');
        provider.addScope('name');
      }

      // In WebView (mobile container but NOT external browser):
      // - Google: use signInWithPopup directly in the WebView.
      //   WKWebView fires onOpenWindow for the popup → App.tsx handles navigation.
      //   Firebase completes the OAuth and updates auth state directly.
      // - Apple: delegate to external browser (Apple Sign-In requires ASWebAuthenticationSession).
      if (isMobileContainer && !isExternalBrowserFlow) {
        if (providerType === 'apple') {
          requestExternalAuth(providerType);
          return;
        }
        // Google: fall through to signInWithPopup below (don't redirect to external browser)
      }

      if (shouldUseRedirect) {
        // Keep redirect query params for external flows so returnToApp intent is preserved after redirect.
        if (!isExternalBrowserFlow) {
          cleanLoginQuery();
        }

        const redirectLockKey = `${REDIRECT_LOCK_PREFIX}${providerType}`;
        if (sessionStorage.getItem(redirectLockKey) === "1") {
          sessionStorage.removeItem(redirectLockKey);
        }

        sessionStorage.setItem(redirectLockKey, "1");
        sessionStorage.removeItem(`${POPUP_FALLBACK_PREFIX}${providerType}`);
        try {
          await setPersistence(auth, browserLocalPersistence);
        } catch {
          // Keep redirect flow even if persistence API fails in this environment.
        }
        postAuthFlowLog("info", `Starting redirect auth for ${providerType} (externalBrowser=${isExternalBrowserFlow})`);
        await signInWithRedirect(auth, provider);
        return;
      }

      const result = await signInWithPopup(auth, provider);

      if (isMobileContainer && query.get("returnToApp") === "1") {
        const providerParam = query.get("provider") || providerType;
        let credIdToken = "";
        let credAccessToken = "";
        let credRawNonce = "";

        const providerId = (result as any).credential?.providerId || result.user?.providerData?.[0]?.providerId;
        if (providerId?.includes("google")) {
          const c = GoogleAuthProvider.credentialFromResult(result);
          if (c) {
            credIdToken = c.idToken || (result as any)._tokenResponse?.oauthIdToken || "";
            credAccessToken = c.accessToken || (result as any)._tokenResponse?.oauthAccessToken || "";
          }
        } else if (providerId?.includes("apple")) {
          const c = OAuthProvider.credentialFromResult(result);
          if (c) {
            credIdToken = c.idToken || (result as any)._tokenResponse?.oauthIdToken || "";
            credAccessToken = c.accessToken || "";
          }
        }

        postAuthFlowLog("info", `Auth complete, returning to app via deep link for ${providerParam}`);

        let buildUrl = `com.armin.mobile://auth-complete?provider=${encodeURIComponent(providerParam)}`;
        if (credIdToken) buildUrl += `&idToken=${encodeURIComponent(credIdToken)}`;
        if (credAccessToken) buildUrl += `&accessToken=${encodeURIComponent(credAccessToken)}`;
        if (credRawNonce) buildUrl += `&rawNonce=${encodeURIComponent(credRawNonce)}`;

        window.location.replace(buildUrl);
        return;
      }

      // navigate handled by AuthContext or useEffect
      setPendingProvider(null);
    } catch (error: unknown) {
      const code = error && typeof error === 'object' && 'code' in error ? (error as { code: string }).code : '';

      if (code === 'auth/network-request-failed' && (isMobileContainer || isExternalBrowserFlow)) {
        const retryKey = `${NETWORK_RETRY_PREFIX}${providerType}`;
        if (sessionStorage.getItem(retryKey) !== '1') {
          sessionStorage.setItem(retryKey, '1');
          postAuthFlowLog('warn', `Retry redirect auth after network failure for ${providerType}`, code);
          const retryProvider = providerType === 'google'
            ? new GoogleAuthProvider()
            : new OAuthProvider('apple.com');
          if (providerType === 'google') {
            (retryProvider as GoogleAuthProvider).setCustomParameters({ prompt: 'select_account' });
          } else {
            (retryProvider as OAuthProvider).addScope('email');
            (retryProvider as OAuthProvider).addScope('name');
          }
          await signInWithRedirect(auth, retryProvider);
          return;
        }
        sessionStorage.removeItem(retryKey);
      }

      if (code === 'auth/operation-not-supported-in-this-environment' || code === 'auth/popup-blocked') {
        if (isMobileContainer && !isExternalBrowserFlow) {
          // In WebView: do NOT call signInWithRedirect here — it navigates the WebView to Google,
          // then back, but getRedirectResult fails in localhost dev environment (cross-origin iframe issue).
          // Instead, delegate to external browser which handles the OAuth flow properly.
          postAuthFlowLog("warn", `Popup blocked in WebView, delegating to external browser for ${providerType}`);
          requestExternalAuth(providerType);
          return;
        }
        // In external browser or regular web: fallback to redirect
        const fallbackProvider = providerType === 'google'
          ? new GoogleAuthProvider()
          : new OAuthProvider('apple.com');
        postAuthFlowLog("warn", `Popup unsupported, fallback redirect for ${providerType}`, code);
        await signInWithRedirect(auth, fallbackProvider);
        return;
      } else {
        console.error("Login failed", error);
        postAuthFlowLog("error", `Login failed for ${providerType}`, code);
        sessionStorage.removeItem(`${REDIRECT_LOCK_PREFIX}${providerType}`);
        sessionStorage.removeItem(`${NETWORK_RETRY_PREFIX}${providerType}`);
        setPendingProvider(null);
        alert(
          t({
            ko: `로그인 실패: ${code || 'unknown'}`,
            en: `Login failed: ${code || 'unknown'}`,
          }),
        );
      }
    }
  }, [cleanLoginQuery, isExternalBrowserFlow, isMobileContainer, pendingProvider, postAuthFlowLog, query, requestExternalAuth, t]);

  useEffect(() => {
    if (shouldAutoStartProvider) return;
    if (!query.get("provider") && !query.get("start") && !query.get("externalBrowser")) return;
    cleanLoginQuery();
  }, [cleanLoginQuery, query, shouldAutoStartProvider]);

  useEffect(() => {
    let cancelled = false;
    const benignRedirectCodes = new Set([
      "auth/no-auth-event",
      "auth/popup-closed-by-user",
      "auth/cancelled-popup-request",
      "auth/web-storage-unsupported",
      "auth/timeout",
    ]);

    const resolveAnyRedirectResult = async () => {
      try {
        const result = await getRedirectResult(auth);
        if (cancelled) return;

        const authStateReady = (auth as unknown as { authStateReady?: () => Promise<void> }).authStateReady;
        if (typeof authStateReady === "function") {
          await authStateReady();
        }

        sessionStorage.removeItem(`${AUTO_START_KEY_PREFIX}google`);
          sessionStorage.removeItem(`${AUTO_START_KEY_PREFIX}apple`);
          sessionStorage.removeItem(`${REDIRECT_LOCK_PREFIX}google`);
          sessionStorage.removeItem(`${REDIRECT_LOCK_PREFIX}apple`);
          sessionStorage.removeItem(`${NETWORK_RETRY_PREFIX}google`);
          sessionStorage.removeItem(`${NETWORK_RETRY_PREFIX}apple`);
          
          const resolvedUser = result?.user || auth.currentUser;
          if (!resolvedUser || resolvedUser.isAnonymous) return;
        postAuthFlowLog("info", "Redirect result resolved", "ok");

        if (isMobileContainer && query.get("returnToApp") === "1") {
          const providerParam = query.get("provider") || "google";
          let credIdToken = "";
          let credAccessToken = "";
          let credRawNonce = "";

          if (result) {
            const providerId = (result as any).credential?.providerId || result.user?.providerData?.[0]?.providerId;
            postAuthFlowLog("info", `Redirect result has providerId: ${providerId || "none"}`);
            if (providerId?.includes("google")) {
              const c = GoogleAuthProvider.credentialFromResult(result);
              if (c) {
                credIdToken = c.idToken || (result as any)._tokenResponse?.oauthIdToken || "";
                credAccessToken = c.accessToken || (result as any)._tokenResponse?.oauthAccessToken || "";
              }
              postAuthFlowLog("info", `Google credential: idToken=${credIdToken ? "present" : "MISSING"}, accessToken=${credAccessToken ? "present" : "MISSING"}`);
            } else if (providerId?.includes("apple")) {
              const c = OAuthProvider.credentialFromResult(result);
              if (c) {
                credIdToken = c.idToken || "";
                credAccessToken = c.accessToken || "";
              }
              postAuthFlowLog("info", `Apple credential: idToken=${credIdToken ? "present" : "MISSING"}`);
            }
          }

          // Always send deep link when user is authenticated.
          // App.tsx handles: with idToken → signInWithCredential, without → triggerReAuth.
          let buildUrl = `com.armin.mobile://auth-complete?provider=${encodeURIComponent(providerParam)}`;
          if (credIdToken) buildUrl += `&idToken=${encodeURIComponent(credIdToken)}`;
          if (credAccessToken) buildUrl += `&accessToken=${encodeURIComponent(credAccessToken)}`;
          if (credRawNonce) buildUrl += `&rawNonce=${encodeURIComponent(credRawNonce)}`;
          // If no OAuth tokens, signal that Firebase web session is authenticated
          // so App.tsx triggers in-WebView Google sign-in directly
          if (!credIdToken && !credAccessToken) {
            buildUrl += `&signedInOnWeb=1`;
          }

          postAuthFlowLog("info", `Sending deep link (hasTokens=${!!(credIdToken || credAccessToken)})`);

          // Clear the autoStart key so the next session can start fresh
          sessionStorage.removeItem(`${AUTO_START_KEY_PREFIX}google`);
          sessionStorage.removeItem(`${AUTO_START_KEY_PREFIX}apple`);

          window.location.replace(buildUrl);
          return;
        }

        navigate(redirectTarget, { replace: true });
      } catch (error: unknown) {
        if (cancelled) return;

        const code = error && typeof error === "object" && "code" in error
          ? String((error as { code?: string }).code || "")
          : "";

        const hasPendingRedirectLock =
          sessionStorage.getItem(`${REDIRECT_LOCK_PREFIX}google`) === "1" ||
          sessionStorage.getItem(`${REDIRECT_LOCK_PREFIX}apple`) === "1";
        const queryProvider = query.get("provider");
        const pendingRedirectProvider = sessionStorage.getItem(`${REDIRECT_LOCK_PREFIX}google`) === "1"
          ? "google"
          : sessionStorage.getItem(`${REDIRECT_LOCK_PREFIX}apple`) === "1"
            ? "apple"
            : null;
        const effectiveRedirectProvider =
          pendingRedirectProvider ||
          (queryProvider === "google" || queryProvider === "apple" ? queryProvider : null);
        const hasRedirectQueryIntent =
          query.get("provider") !== null ||
          query.get("start") !== null ||
          query.get("externalBrowser") !== null ||
          query.get("returnToApp") === "1";
        const shouldTreatAsRealError = hasPendingRedirectLock || hasRedirectQueryIntent;

        if (!shouldTreatAsRealError) {
            sessionStorage.removeItem(`${REDIRECT_LOCK_PREFIX}google`);
            sessionStorage.removeItem(`${REDIRECT_LOCK_PREFIX}apple`);
            sessionStorage.removeItem(`${AUTO_START_KEY_PREFIX}google`);
            sessionStorage.removeItem(`${AUTO_START_KEY_PREFIX}apple`);
            return;
          }

        if (!code || benignRedirectCodes.has(code)) {
          if (
            isMobileContainer &&
            effectiveRedirectProvider === "google" &&
            sessionStorage.getItem(`${POPUP_FALLBACK_PREFIX}google`) !== "1"
          ) {
            sessionStorage.setItem(`${POPUP_FALLBACK_PREFIX}google`, "1");
            try {
              const popupProvider = new GoogleAuthProvider();
              popupProvider.setCustomParameters({ prompt: "select_account" });
              await signInWithPopup(auth, popupProvider);
              if (cancelled) return;

              sessionStorage.removeItem(`${POPUP_FALLBACK_PREFIX}google`);
              sessionStorage.removeItem(`${REDIRECT_LOCK_PREFIX}google`);
              postAuthFlowLog("info", "Recovered auth with popup after empty redirect", "google");
              navigate(redirectTarget, { replace: true });
              return;
            } catch (popupRecoveryError: unknown) {
              const popupRecoveryCode = popupRecoveryError && typeof popupRecoveryError === "object" && "code" in popupRecoveryError
                ? String((popupRecoveryError as { code?: string }).code || "")
                : "";
              postAuthFlowLog("warn", "Popup recovery after redirect failed", popupRecoveryCode || "none");
            }
          }

          postAuthFlowLog("warn", "Redirect result empty/benign", code || "none");
          sessionStorage.removeItem(`${REDIRECT_LOCK_PREFIX}google`);
          sessionStorage.removeItem(`${REDIRECT_LOCK_PREFIX}apple`);
          setPendingProvider(null);
          return;
        }

        sessionStorage.removeItem(`${REDIRECT_LOCK_PREFIX}google`);
        sessionStorage.removeItem(`${REDIRECT_LOCK_PREFIX}apple`);
        setPendingProvider(null);
        postAuthFlowLog("error", "Redirect result error", code);
        alert(
          t({
            ko: `로그인 실패: ${code || "unknown"}`,
            en: `Login failed: ${code || "unknown"}`,
          }),
        );
      }
    };

    void resolveAnyRedirectResult();

    return () => {
      cancelled = true;
    };
  }, [isMobileContainer, navigate, postAuthFlowLog, query, redirectTarget, t]);

  useEffect(() => {
    if (!shouldAutoStartProvider) {
      sessionStorage.removeItem(`${AUTO_START_KEY_PREFIX}naver`);
    }
  }, [shouldAutoStartProvider]);

  useEffect(() => {
    if (!shouldAutoStartProvider) return;
    if (loading) return;
    if (!autoStartProvider) return;

    // If user is already authenticated, handle navigation and exit.
    if (user && !user.isAnonymous) {
      if (isExternalBrowserFlow && query.get("returnToApp") === "1") {
        // User is signed in inside the external browser session.
        // resolveAnyRedirectResult already ran (or is running) and will send the deep link.
        // Do NOT re-trigger signInWithRedirect — that causes the loop.
        return;
      }
      navigate(redirectTarget, { replace: true });
      return;
    }

    // Guard: only fire the auth redirect ONCE per external browser session.
    // Never clear this key — clearing it causes infinite redirect loops.
    if (autoStartKey && sessionStorage.getItem(autoStartKey) === "1") {
      return;
    }

    if (autoStartKey) {
      sessionStorage.setItem(autoStartKey, "1");
    }

    if (autoStartProvider === "google" || autoStartProvider === "apple") {
      const forceRedirect = true; // always use signInWithRedirect in these flows
      void handleLoginWithProvider(autoStartProvider, forceRedirect);
      return;
    }

    if (autoStartProvider === "naver") {
      cleanLoginQuery();
      handleNaverLogin({ fromAutoStart: true, silent: true });
    }
  }, [autoStartKey, autoStartProvider, cleanLoginQuery, handleLoginWithProvider, handleNaverLogin, loading, navigate, postAuthFlowLog, redirectTarget, shouldAutoStartProvider, user]);

  

  return (
    <div style={{
      width: "100%",
      minHeight: "100dvh",
      background: "radial-gradient(1200px 420px at 50% -200px, rgba(191,255,10,0.12), transparent 70%), #050505",
      color: "rgba(255,255,255,0.92)",
      fontFamily: "'Space Grotesk', 'Apple SD Gothic Neo', sans-serif",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "20px 14px",
      boxSizing: "border-box",
    }}>
      <div id="naverIdLogin" style={{ display: 'none' }} />

      <div style={{
        position: "relative",
        width: "100%",
        maxWidth: "520px",
        borderRadius: "22px",
        border: "1px solid rgba(255,255,255,0.12)",
        background: "linear-gradient(160deg, rgba(18,18,18,0.90), rgba(10,10,10,0.95))",
        boxShadow: "0 28px 56px rgba(0,0,0,0.52), inset 0 1px 0 rgba(255,255,255,0.08)",
        overflow: "hidden",
      }}>
        <div style={{
          padding: "26px 24px 20px",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
          background: "linear-gradient(180deg, rgba(191,255,10,0.08), transparent 55%)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 10 }}>
            <span style={{ width: 6, height: 6, borderRadius: 999, background: "#BFFF0A", display: "inline-block" }} />
            <span style={{ fontSize: 10, letterSpacing: "0.22em", color: "rgba(255,255,255,0.46)", textTransform: language === "ko" ? "none" : "uppercase" }}>
              {t({ ko: "아르민 계정", en: "Armin Account" })}
            </span>
          </div>

          <h2 style={{ margin: 0, fontSize: "clamp(30px, 6vw, 38px)", lineHeight: 1.1, letterSpacing: "-0.02em" }}>
            {t({ ko: "로그인", en: "Sign In" })}
          </h2>

          <p style={{ margin: "12px 0 0", fontSize: 13, color: "rgba(255,255,255,0.56)", lineHeight: 1.7 }}>
            {t({
              ko: "온보딩에서 만든 취향 프로필과 좋아요, 플레이리스트를 이어서 볼 수 있어요.",
              en: "Continue with your onboarding profile, likes, and playlists across devices.",
            })}
          </p>
        </div>

        <div style={{ padding: "18px 24px 24px", display: "flex", flexDirection: "column", gap: 11 }}>
          <button
            type="button"
            onClick={() => handleNaverLogin()}
            style={{
              width: '100%',
              height: 48,
              background: '#03C75A',
              color: 'white',
              border: 'none',
              borderRadius: '12px',
              fontSize: '14px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '10px',
              boxShadow: '0 10px 24px rgba(3,199,90,0.28)'
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
              <path d="M16.273 12.845L7.376 0H0v24h7.726V11.156L16.624 24H24V0h-7.727v12.845z" />
            </svg>
            {t({ ko: "네이버로 계속하기", en: "Continue with Naver" })}
          </button>

          <button
            onClick={() => handleLoginWithProvider('google', isExternalBrowserFlow)}
            disabled={pendingProvider !== null}
            style={{
              width: '100%',
              height: 48,
              background: 'rgba(255,255,255,0.94)',
              color: '#222',
              border: '1px solid rgba(255,255,255,0.75)',
              borderRadius: '12px',
              fontSize: '14px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '10px',
              opacity: pendingProvider ? 0.75 : 1,
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            {t({ ko: "Google로 계속하기", en: "Continue with Google" })}
          </button>

          <button
            onClick={() => handleLoginWithProvider('apple', true)}
            disabled={pendingProvider !== null}
            style={{
              width: '100%',
              height: 48,
              background: 'linear-gradient(180deg, #121212, #080808)',
              color: 'white',
              border: '1px solid rgba(255,255,255,0.18)',
              borderRadius: '12px',
              fontSize: '14px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '10px',
              opacity: pendingProvider ? 0.75 : 1,
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
              <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
            </svg>
            {t({ ko: "Apple로 계속하기", en: "Continue with Apple" })}
          </button>

          {loginHint ? (
            <div
              style={{
                fontSize: 12,
                lineHeight: 1.6,
                color: "rgba(255,255,255,0.78)",
                border: "1px solid rgba(191,255,10,0.35)",
                background: "rgba(191,255,10,0.08)",
                borderRadius: 10,
                padding: "8px 10px",
              }}
            >
              {loginHint}
            </div>
          ) : null}

          <div style={{
            marginTop: 4,
            fontSize: 11,
            color: "rgba(255,255,255,0.36)",
            textAlign: "center",
            lineHeight: 1.6,
          }}>
            {t({
              ko: "로그인을 진행하면 서비스 약관 및 개인정보 처리방침에 동의한 것으로 간주됩니다.",
              en: "By continuing, you agree to our Terms of Service and Privacy Policy.",
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;