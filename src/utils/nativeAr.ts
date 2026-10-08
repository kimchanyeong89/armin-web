import { getLightboxImage } from "./imageProxy";

/**
 * AR in the COLLY app: the artwork hung on a real surface (apps/mobile
 * modules/colly-ar, iOS and Android). The app marks the page when its build has
 * that screen and the phone can run it; browsers and older builds get no AR button.
 */
export function hasNativeAr(): boolean {
  return typeof document !== "undefined" && document.documentElement.getAttribute("data-native-ar") === "2";
}

export function openNativeAr(imageUrl: string, language: string): void {
  const bridge = (window as unknown as { ReactNativeWebView?: { postMessage: (data: string) => void } }).ReactNativeWebView;
  // The resized copy first (quick to fetch), the museum's own file if that fails.
  bridge?.postMessage(JSON.stringify({ type: "OPEN_AR", images: [getLightboxImage(imageUrl), imageUrl], korean: language === "ko" }));
}
