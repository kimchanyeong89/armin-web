import { hasNativeAppleSignIn } from "./mobileAppAuth";

// 버그 신고 창은 app-desk 워커가 내려준다(스케네·일록·콜리 공용). 누를 때만 불러온다.
const WIDGET = "https://app-desk.armin-art.workers.dev/widget.js";

type AppDesk = { open: (o: { app: string; accent?: string; lang?: string; context?: Record<string, unknown> }) => void };

export function openBugReport(uid: string | null | undefined, lang: string) {
  const w = window as unknown as { AppDesk?: AppDesk };
  const marks = document.documentElement.dataset;
  const go = () => w.AppDesk!.open({
    app: "colly", accent: "#b8862b", lang,
    // 콜리 앱은 사파리 UA 를 쓰므로 앱 여부는 앱이 붙이는 표식으로 본다
    context: { uid: uid || null, native: Boolean(marks.nativeAr || hasNativeAppleSignIn() || marks.nativePush) },
  });
  if (w.AppDesk) return go();
  const s = document.createElement("script");
  s.src = WIDGET;
  s.onload = go;
  document.head.appendChild(s);
}
