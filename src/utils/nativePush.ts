// App push notifications (iOS shell, apps/mobile). The shell asks for permission on first launch and
// holds the Expo push token; the web owns the Firebase session, so the web is the one that files the
// token under the signed-in user (users/{uid}.pushTokens). scripts/push/send.mjs reads those to send.
import { arrayUnion, doc, setDoc } from "firebase/firestore";
import { db } from "../firebase";

const TOKEN = /^Expo(nent)?PushToken\[[\w-]+\]$/;

/** The shell marks the page when this build can deliver notifications (older builds lack the module). */
export function hasNativePush(): boolean {
  return typeof document !== "undefined" && document.documentElement.getAttribute("data-native-push") === "1";
}

/**
 * Keep this device's token on the signed-in user's document. The shell dispatches `colly:push-token`
 * when it has one (after the permission prompt, and whenever we ask) — we ask once here because the
 * prompt may have been answered before the page loaded. Returns an unsubscribe.
 */
export function watchNativePush(uid: string): () => void {
  if (!hasNativePush()) return () => {};
  const onToken = (event: Event) => {
    const token = String((event as CustomEvent<string>).detail || "");
    if (!TOKEN.test(token)) return;
    setDoc(doc(db, "users", uid), { pushTokens: arrayUnion(token), pushUpdatedAt: new Date().toISOString() }, { merge: true })
      .catch((e) => console.warn("[push] could not save token", e));
  };
  window.addEventListener("colly:push-token", onToken);
  (window as { ReactNativeWebView?: { postMessage?: (m: string) => void } }).ReactNativeWebView
    ?.postMessage?.(JSON.stringify({ type: "PUSH_TOKEN" }));
  return () => window.removeEventListener("colly:push-token", onToken);
}
