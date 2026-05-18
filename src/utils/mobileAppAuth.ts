type MobileAuthProvider = "google" | "apple" | "naver";

// Firebase project's Google OAuth Web client ID. Discovered via
// identitytoolkit.googleapis.com/v1/accounts:createAuthUri. Used for the
// custom OAuth flow that bypasses Firebase's signInWithRedirect — that
// flow drops state across the Chrome Custom Tabs round trip on Android
// and ASWebAuthenticationSession on iOS, so getRedirectResult returns
// null even after a successful Google sign-in.
//
// REQUIRED ONE-TIME GOOGLE CLOUD CONSOLE SETUP:
//   1. Open Google Cloud Console → APIs & Services → Credentials
//   2. Find OAuth 2.0 Client ID:
//      380952034390-gl4fkh824mp9qcimd0m1kutmp5s0csk8.apps.googleusercontent.com
//   3. Edit → "Authorized redirect URIs" → Add:
//      https://armin-web.pages.dev/login/callback
//   4. Save
// Without this entry, Google returns "redirect_uri_mismatch" and the
// custom flow falls back to Firebase signInWithRedirect.
export const GOOGLE_OAUTH_CLIENT_ID =
  "380952034390-gl4fkh824mp9qcimd0m1kutmp5s0csk8.apps.googleusercontent.com";

function randomToken(): string {
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36) + Math.random().toString(36).slice(2);
}

export function startGoogleCustomOAuth(opts: { returnToApp: boolean; mobileApp: boolean }): void {
  if (typeof window === "undefined") return;
  const clientId = GOOGLE_OAUTH_CLIENT_ID;
  const redirectUri = `${window.location.origin}/login/callback`;
  const nonce = randomToken();
  const state = randomToken();
  try {
    sessionStorage.setItem("auth:google-oauth:state", state);
    sessionStorage.setItem("auth:google-oauth:nonce", nonce);
    sessionStorage.setItem(
      "auth:google-oauth:ctx",
      JSON.stringify({ returnToApp: !!opts.returnToApp, mobileApp: !!opts.mobileApp }),
    );
  } catch {
    // sessionStorage failure shouldn't block auth; CSRF check will fail safely.
  }
  const url = new URL("https://accounts.google.com/o/oauth2/auth");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "id_token");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("nonce", nonce);
  url.searchParams.set("state", state);
  url.searchParams.set("prompt", "select_account");
  window.location.href = url.toString();
}

type WebViewBridge = {
  postMessage?: (message: string) => void;
};

function getBridge(): WebViewBridge | null {
  if (typeof window === "undefined") return null;
  const bridge = (window as { ReactNativeWebView?: WebViewBridge }).ReactNativeWebView;
  if (!bridge || typeof bridge.postMessage !== "function") return null;
  return bridge;
}

export function isMobileAppContainer(): boolean {
  if (typeof window === "undefined") return false;

  const query = new URLSearchParams(window.location.search);
  if (query.get("mobileApp") === "1") return true;

  if (document.documentElement.getAttribute("data-mobile-app") === "1") return true;

  return !!getBridge();
}

const PRODUCTION_WEB_URL = "https://armin-web.pages.dev";

export function buildExternalLoginUrl(provider: MobileAuthProvider): string {
  // IMPORTANT: Always use production URL for external browser OAuth.
  // Firebase's auth handler (armin-web.firebaseapp.com) cannot reach localhost
  // via cross-origin iframe, which causes getRedirectResult() to always return null.
  // Production URL (armin-web.pages.dev) is publicly accessible and works correctly.
  const baseOrigin = typeof window !== "undefined" && window.location.hostname !== "localhost"
    ? window.location.origin
    : PRODUCTION_WEB_URL;

  const url = new URL("/login", baseOrigin);
  url.searchParams.set("mobileApp", "1");
  url.searchParams.set("externalBrowser", "1");
  url.searchParams.set("provider", provider);
  url.searchParams.set("start", "1");
  url.searchParams.set("returnToApp", "1");
  return url.toString();
}

export function requestExternalMobileLogin(provider: MobileAuthProvider): boolean {
  if (typeof window === "undefined") return false;
  if (!isMobileAppContainer()) return false;

  const url = buildExternalLoginUrl(provider);
  const bridge = getBridge();

  if (bridge?.postMessage) {
    bridge.postMessage(
      JSON.stringify({
        type: "OPEN_EXTERNAL_LOGIN",
        provider,
        url,
      }),
    );
    return true;
  }

  window.location.href = url;
  return true;
}
