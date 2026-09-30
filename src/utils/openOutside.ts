import { isMobileAppContainer } from "./mobileAppAuth";

/**
 * Opens a museum's own page outside COLLY. In a browser the link's own
 * target="_blank" already does that, so nothing is done here (false). Inside
 * the COLLY app a new window would replace the app's page, and getting back
 * was hard, so the page is sent out instead:
 * - iPhone / iPad: the x-safari-https scheme (iOS 17+) - the app hands any
 *   non-web scheme to the system, which opens Safari.
 * - Android: the app's browser sheet (the one login already uses); closing it
 *   returns to the same page.
 * Returns true when it took over, so the caller stops the link's default.
 */
export function openOutside(url: string): boolean {
  if (typeof window === "undefined" || !isMobileAppContainer() || !/^https?:\/\//i.test(url)) return false;
  const ios = /iPhone|iPad|iPod/.test(navigator.platform) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (ios) {
    window.location.href = `x-safari-${url}`;
    return true;
  }
  const bridge = (window as unknown as { ReactNativeWebView?: { postMessage: (data: string) => void } }).ReactNativeWebView;
  if (!bridge?.postMessage) return false;
  bridge.postMessage(JSON.stringify({ type: "OPEN_EXTERNAL_LOGIN", url }));
  return true;
}
