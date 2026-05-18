import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Linking, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import * as WebBrowser from "expo-web-browser";
import { StatusBar } from "expo-status-bar";
import { WebView } from "react-native-webview";
import type { ShouldStartLoadRequest, WebViewMessageEvent } from "react-native-webview/lib/WebViewTypes";

const DEFAULT_WEB_URL = "https://armin-web.pages.dev";
const DEV_WEB_URL = "http://localhost:5181";
const IOS_SAFARI_USER_AGENT =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const IN_APP_AUTH_HOSTS = new Set([
  "armin-web.firebaseapp.com",
  "accounts.google.com",
  "apis.google.com",
  "ssl.gstatic.com",
  "www.gstatic.com",
  "accounts.youtube.com",
  "youtube.com",
  "www.youtube.com",
]);

function isInAppAuthHost(hostname: string): boolean {
  if (IN_APP_AUTH_HOSTS.has(hostname)) return true;
  if (hostname.endsWith(".google.com")) return true;
  if (hostname.endsWith(".gstatic.com")) return true;
  if (hostname.endsWith(".googleusercontent.com")) return true;
  if (hostname.endsWith(".youtube.com")) return true;
  return false;
}

const RESPONSIVE_INJECTION = `
(function() {
  var meta = document.querySelector('meta[name="viewport"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.setAttribute('name', 'viewport');
    document.head.appendChild(meta);
  }
  // Note: we DO NOT set user-scalable=no / maximum-scale=1 here.
  // iOS WebView swallows 2-finger pinch gestures when those are set, which
  // breaks the D3 globe's custom pinch-to-zoom. Each interactive component
  // uses touch-action CSS to prevent double-tap zoom where needed.
  meta.setAttribute('content', 'width=device-width, initial-scale=1, viewport-fit=cover');

  var sync = function() {
    var vw = Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0);
    var vh = Math.max(document.documentElement.clientHeight || 0, window.innerHeight || 0);
    document.documentElement.style.setProperty('--app-vw', vw + 'px');
    document.documentElement.style.setProperty('--app-vh', vh + 'px');
  };

  document.documentElement.classList.add('mobile-app-host');
  if (document.body) document.body.classList.add('mobile-app-host');
  document.documentElement.setAttribute('data-mobile-app', '1');
  if (document.body) document.body.setAttribute('data-mobile-app', '1');

  if (!document.getElementById('rn-mobile-host-style')) {
    var style = document.createElement('style');
    style.id = 'rn-mobile-host-style';
    style.innerHTML = [
      'html.mobile-app-host, body.mobile-app-host, #root { width: 100% !important; max-width: 100% !important; overflow-x: hidden !important; }',
      'html.mobile-app-host, body.mobile-app-host { min-height: var(--app-vh, 100vh) !important; }',
      '.mobile-app-host * { box-sizing: border-box; }',
      'html.mobile-app-host, body.mobile-app-host { background: #050505 !important; }',
      '.mobile-app-host img, .mobile-app-host video, .mobile-app-host canvas, .mobile-app-host svg { max-width: 100% !important; }',
      '.mobile-app-host [style*="100vh"] { height: var(--app-vh, 100vh) !important; }',
      '.mobile-app-host [style*="position: fixed"] { max-width: 100vw !important; }',
      '.mobile-app-host { -webkit-text-size-adjust: 100% !important; text-size-adjust: 100% !important; }'
    ].join('\\n');
    document.head.appendChild(style);
  }

  sync();
  window.addEventListener('resize', sync);
  window.addEventListener('orientationchange', sync);

  // ── Console + error forwarder for native logcat (DEBUG_BRIDGE) ──
  try {
    var post = function(level, args) {
      try {
        var msg = Array.prototype.slice.call(args).map(function(a){
          if (a instanceof Error) return a.stack || a.message;
          if (typeof a === 'object') { try { return JSON.stringify(a); } catch(_) { return String(a); } }
          return String(a);
        }).join(' ');
        if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'DEBUG_BRIDGE', level: level, message: msg.slice(0, 4000) }));
        }
      } catch(_) {}
    };
    ['log','warn','error'].forEach(function(level) {
      var orig = console[level];
      console[level] = function() { post(level, arguments); if (orig) orig.apply(console, arguments); };
    });
    window.addEventListener('error', function(e) { post('error', ['[window.error]', e.message, e.filename + ':' + e.lineno]); });
    window.addEventListener('unhandledrejection', function(e) { post('error', ['[unhandledrejection]', e.reason && (e.reason.stack || e.reason.message || e.reason)]); });
  } catch(_) {}
})();
true;
`;

export default function App() {
  const webViewRef = useRef<WebView>(null);
  const authFlowInProgressRef = useRef(false);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  // Android WebView fires onLoadStart for sub-frame loads (Firebase auth
  // iframes, image-proxy redirects, etc.) but the matching onLoadEnd is
  // unreliable, leaving the cream-colored ActivityIndicator overlay stuck
  // forever the moment the user opens the InteractiveGlobeRealModal. iOS
  // only fires these for the main frame, so it's not affected. Track
  // first-load completion and ignore subsequent loadStart events on Android.
  const hasCompletedFirstLoadRef = useRef(false);
  const loadEndTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // On Android, the OAuth deep link return fires BOTH the OS-level Linking
  // listener AND the WebBrowser.openAuthSessionAsync resolution, so without
  // dedupe both inject the same credential and signInWithCredential runs
  // twice — the second sign-in transiently flips Firebase auth state to
  // null, which makes the Login route remount and the user lands back on
  // Sign In. iOS doesn't fire OS deep links during ASWebAuthenticationSession
  // so it's not affected. We dedupe by deep-link URL within a short window.
  const lastConsumedAuthUrlRef = useRef<{ url: string; at: number } | null>(null);

  const webAppUrl = useMemo(() => {
    const raw = (process.env.EXPO_PUBLIC_WEB_APP_URL || "").trim();
    const devDefault = typeof __DEV__ !== "undefined" && __DEV__ ? DEV_WEB_URL : DEFAULT_WEB_URL;
    // By default in dev, use localhost to ensure local changes from Vite are immediately visible in the app
    const base = (typeof __DEV__ !== "undefined" && __DEV__) ? devDefault : (raw.length > 0 ? raw : devDefault);
    try {
      const url = new URL(base);
      url.searchParams.set("mobileApp", "1");
      return url.toString();
    } catch {
      return base;
    }
  }, []);

  const webAppOrigin = useMemo(() => {
    try {
      return new URL(webAppUrl).origin;
    } catch {
      return "";
    }
  }, [webAppUrl]);

  const handleRetry = () => {
    setLoadError(false);
    setIsLoading(true);
    // Reset first-load flag so the overlay is allowed to show again on the
    // retried load (then the same Android-specific guard takes over after).
    hasCompletedFirstLoadRef.current = false;
    webViewRef.current?.reload();
  };

  const handleOpenExternal = async () => {
    try {
      await Linking.openURL(webAppUrl);
    } catch {
      // Keep the UI simple: retry path is already available on-screen.
    }
  };

  const handleShouldStart = (request: ShouldStartLoadRequest) => {
    const url = String(request.url || "").trim();
    if (!url) return false;

    if (url === "about:blank") return true;

    if (url.startsWith("com.armin.mobile://")) {
      void Linking.openURL(url);
      return false;
    }

    if (url.startsWith("mailto:") || url.startsWith("tel:")) {
      void Linking.openURL(url);
      return false;
    }

    try {
      const parsed = new URL(url);
      if (parsed.protocol === "about:" || parsed.protocol === "data:" || parsed.protocol === "blob:") {
        return true;
      }

      const isHttp = parsed.protocol === "http:" || parsed.protocol === "https:";
      if (!isHttp) {
        void Linking.openURL(url);
        return false;
      }

      if (isInAppAuthHost(parsed.hostname)) {
        authFlowInProgressRef.current = true;
      }
    } catch {
      return false;
    }

    return true;
  };

  const consumeAuthDeepLink = (url: string): boolean => {
    const last = lastConsumedAuthUrlRef.current;
    const now = Date.now();
    if (last && last.url === url && now - last.at < 10000) {
      return false;
    }
    lastConsumedAuthUrlRef.current = { url, at: now };
    return true;
  };

  const handleWebMessage = (event: WebViewMessageEvent) => {
    const raw = String(event.nativeEvent.data || "").trim();
    if (!raw) return;

    try {
      const payload = JSON.parse(raw) as {
        type?: string;
        url?: string;
        provider?: string;
        level?: string;
        message?: string;
        code?: string;
      };

      if (payload.type === "DEBUG_BRIDGE") {
        console.log("[WV:" + (payload.level || "log") + "]", payload.message || "");
        return;
      }

      if (payload.type === "OPEN_EXTERNAL_LOGIN") {
        authFlowInProgressRef.current = true;
        const externalUrl = String(payload.url || "").trim();
        if (!externalUrl) return;

        WebBrowser.openAuthSessionAsync(externalUrl, "com.armin.mobile://auth-complete").then((result) => {
          authFlowInProgressRef.current = false;

          if (result.type === "success" && result.url) {
            try {
              if (!consumeAuthDeepLink(result.url)) {
                console.log("[AUTH] WebBrowser deep link already consumed by Linking listener — skipping");
                return;
              }

              // Parse the deep link query params
              const urlObj = new URL(result.url);
              const map: Record<string, string> = {};
              urlObj.searchParams.forEach((v, k) => { map[k] = v; });

              console.log("[AUTH] Deep link received:", result.url);
              console.log("[AUTH] Parsed params:", JSON.stringify(map));

              // Google/Apple/Naver: inject credential into WebView via custom event
              if (map.provider && (map.idToken || (map.email && map.credential))) {
                console.log("[AUTH] Injecting OAuth credential for provider:", map.provider);
                const ev = `window.dispatchEvent(new CustomEvent('auth:mobile-credential', { detail: ${JSON.stringify(map)} })); true;`;
                webViewRef.current?.injectJavaScript(ev);
                return;
              }

              // Naver / signedInOnWeb: reload to pick up auth state
              // (Naver uses Firebase email/pw and already signed in on web side,
              //  so reload will detect the auth state change via AuthContext)
              console.log("[AUTH] No idToken in deep link, reloading WebView. signedInOnWeb=", map.signedInOnWeb);
              webViewRef.current?.reload();
              return;
            } catch (e) {
              console.error("[AUTH] Deep link parse error", e);
            }
          }

          // Cancelled or error: reload to restore app state cleanly
          webViewRef.current?.reload();
        }).catch((err) => {
          console.warn("WebBrowser error", err);
          authFlowInProgressRef.current = false;
          webViewRef.current?.reload();
        });
        return;
      }

      if (payload.type === "AUTH_FLOW_LOG") {
        const level = String(payload.level || "info").toLowerCase();
        const message = String(payload.message || "auth flow");
        const code = String(payload.code || "");
        const line = `[AUTH_FLOW][${level}] ${message}${code ? ` (${code})` : ""}`;

        if (message.toLowerCase().includes("completed") || level === "error") {
          authFlowInProgressRef.current = false;
        }

        if (level === "error") {
          console.error(line);
        } else if (level === "warn") {
          console.warn(line);
        } else {
          console.log(line);
        }
      }
    } catch {
      // Ignore malformed messages from web content.
    }
  };

  useEffect(() => {
    const sub = Linking.addEventListener("url", ({ url }) => {
      if (!url.startsWith("com.armin.mobile://auth-complete")) return;
      if (!consumeAuthDeepLink(url)) {
        console.log("[AUTH] Linking deep link already consumed by WebBrowser callback — skipping");
        return;
      }
      try {
        const urlObj = new URL(url);
        const map: Record<string, string> = {};
        urlObj.searchParams.forEach((v, k) => { map[k] = v; });

        if (map.provider && (map.idToken || (map.email && map.credential))) {
          console.log("[AUTH] Linking listener injecting OAuth credential for provider:", map.provider);
          const ev = `window.dispatchEvent(new CustomEvent('auth:mobile-credential', { detail: ${JSON.stringify(map)} })); true;`;
          webViewRef.current?.injectJavaScript(ev);
        } else {
          webViewRef.current?.reload();
        }
      } catch {
        webViewRef.current?.reload();
      }
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    return () => {
      if (loadEndTimeoutRef.current) {
        clearTimeout(loadEndTimeoutRef.current);
        loadEndTimeoutRef.current = null;
      }
    };
  }, []);

  return (
    <View style={styles.container}>
      <View style={styles.webContainer}>
        <WebView
          ref={webViewRef}
          source={{ uri: webAppUrl }}
          style={styles.webView}
          userAgent={IOS_SAFARI_USER_AGENT}
          injectedJavaScriptBeforeContentLoaded={RESPONSIVE_INJECTION}
          onShouldStartLoadWithRequest={handleShouldStart}
          onMessage={handleWebMessage}
          onLoadStart={() => {
            // After the very first successful load, ignore loadStart events.
            // On Android these fire for sub-frame loads with no matching
            // loadEnd, which would lock the overlay on top of the modal.
            if (Platform.OS === "android" && hasCompletedFirstLoadRef.current) {
              return;
            }
            setIsLoading(true);
            setLoadError(false);
            // Safety net: if loadEnd never fires (Android sub-frame quirk),
            // force-clear the overlay after 6s so the user is never stuck.
            if (loadEndTimeoutRef.current) clearTimeout(loadEndTimeoutRef.current);
            loadEndTimeoutRef.current = setTimeout(() => {
              setIsLoading(false);
              hasCompletedFirstLoadRef.current = true;
            }, 6000);
          }}
          onLoadEnd={() => {
            if (loadEndTimeoutRef.current) {
              clearTimeout(loadEndTimeoutRef.current);
              loadEndTimeoutRef.current = null;
            }
            setIsLoading(false);
            hasCompletedFirstLoadRef.current = true;
          }}
          onNavigationStateChange={(state) => {
            const currentUrl = String(state.url || "");
            try {
              const parsed = new URL(currentUrl);
              if (webAppOrigin && parsed.origin === webAppOrigin && !parsed.pathname.startsWith("/login")) {
                authFlowInProgressRef.current = false;
              }
            } catch {
              // Ignore URL parsing errors for transient states.
            }
          }}
          onOpenWindow={(event: any) => {
            const targetUrl = String(event?.nativeEvent?.targetUrl || "").trim();
            if (!targetUrl) return;
            if (targetUrl === 'about:blank') return;
            // For security: only allow navigation within the app (not arbitrary popups)
            const safe = JSON.stringify(targetUrl);
            webViewRef.current?.injectJavaScript(`window.location.href = ${safe}; true;`);
          }}
          onError={() => {
            setLoadError(true);
            setIsLoading(false);
          }}
          javaScriptEnabled
          javaScriptCanOpenWindowsAutomatically
          domStorageEnabled
          sharedCookiesEnabled
          thirdPartyCookiesEnabled
          webviewDebuggingEnabled
          // Android: don't override the layer type. Tried "hardware" and
          // "software" — neither resolved the dim/spinner ghost in the
          // emulator, and "software" introduced visible stutter. Leaving
          // it at the platform default while the underlying compositor
          // issue is investigated at the page level.
          // iOS: do NOT auto-adjust scroll insets. The "automatic" behavior
          // dynamically resizes the WebView viewport as iOS shows/hides the
          // home-indicator zone during scroll, which made the entire web app
          // (top header, globe, bottom tab bar) shake up and down. We let the
          // web side manage its own safe-area padding via env(safe-area-inset-*)
          // CSS variables — that gives a stable viewport and stable layout.
          contentInsetAdjustmentBehavior="never"
          automaticallyAdjustContentInsets={false}
          startInLoadingState
          // Disabled: iOS edge swipe-to-go-back/forward translates the entire
          // WebView horizontally, which causes the Lightbox / ProductModal to
          // slide off-screen mid-gesture and (when the gesture is canceled
          // partway) leaves the modal stuck in a shifted position.
          allowsBackForwardNavigationGestures={false}
          setSupportMultipleWindows
        />

        {isLoading && !loadError ? (
          <View style={styles.overlay}>
            <ActivityIndicator size="large" color="#1f2937" />
          </View>
        ) : null}

        {loadError ? (
          <View style={styles.errorCard}>
            <Text style={styles.errorTitle}>앱 페이지를 불러오지 못했습니다</Text>
            <Text style={styles.errorBody}>네트워크 상태를 확인한 뒤 다시 시도해주세요.</Text>

            <Pressable style={styles.primaryButton} onPress={handleRetry}>
              <Text style={styles.primaryButtonLabel}>다시 시도</Text>
            </Pressable>

            <Pressable style={styles.secondaryButton} onPress={handleOpenExternal}>
              <Text style={styles.secondaryButtonLabel}>브라우저에서 열기</Text>
            </Pressable>
          </View>
        ) : null}

      </View>
      <StatusBar style="light" translucent={false} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#050505",
  },
  webContainer: {
    flex: 1,
  },
  webView: {
    flex: 1,
    backgroundColor: "#050505",
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(247,243,234,0.85)",
  },
  errorCard: {
    position: "absolute",
    left: 20,
    right: 20,
    top: 120,
    backgroundColor: "#ffffff",
    borderColor: "#e5e7eb",
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    gap: 10,
  },
  errorTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#111827",
  },
  errorBody: {
    fontSize: 13,
    lineHeight: 19,
    color: "#4b5563",
  },
  primaryButton: {
    marginTop: 4,
    backgroundColor: "#bfff0a",
    borderRadius: 12,
    alignItems: "center",
    paddingVertical: 12,
  },
  primaryButtonLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: "#111827",
  },
  secondaryButton: {
    backgroundColor: "#111827",
    borderRadius: 12,
    alignItems: "center",
    paddingVertical: 12,
  },
  secondaryButtonLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: "#f9fafb",
  },
});
