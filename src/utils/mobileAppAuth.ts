type MobileAuthProvider = "google" | "apple" | "naver";

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
