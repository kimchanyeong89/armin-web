import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import CloseButton from "./CloseButton";
import { getLightboxImage } from "../utils/imageProxy";
import { useLanguage } from "../contexts/LanguageContext";

/**
 * The artwork held over the live camera, inside the COLLY app only (see
 * hasNativeAr). One finger moves it, two fingers resize it; the shutter draws
 * the camera frame and the artwork onto one canvas, and the app saves that
 * picture to Photos (SAVE_PHOTO → apps/mobile App.tsx, answered by ar:photo-saved).
 */

const WORKER_URL = "https://armin-semantic-search.armin-art.workers.dev";
const LAYER_Z = 260030; // under CloseButton's screen placement (260040)
const MIN_W = 48;

type Art = { x: number; y: number; w: number }; // centre and width, in screen px
type SaveState = "idle" | "saving" | "saved" | "failed";

export default function ArCapture({ imageUrl, title, onClose }: { imageUrl: string; title: string; onClose: () => void }) {
  const { language } = useLanguage();
  const L = (ko: string, en: string) => (language === "ko" ? ko : en);

  const videoRef = useRef<HTMLVideoElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const artImgRef = useRef<HTMLImageElement | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const base = useRef<{ art: Art; mx: number; my: number; dist: number } | null>(null);

  const [art, setArt] = useState<Art | null>(null);
  const [artSrc, setArtSrc] = useState("");
  const [cameraError, setCameraError] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [shot, setShot] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");

  // Camera: the back lens, stopped when the screen closes.
  useEffect(() => {
    let stream: MediaStream | null = null;
    let alive = true;
    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false })
      .then((s) => {
        if (!alive) { s.getTracks().forEach((tr) => tr.stop()); return; }
        stream = s;
        if (videoRef.current) videoRef.current.srcObject = s;
      })
      .catch(() => { if (alive) setCameraError(true); });
    if (!navigator.mediaDevices) setCameraError(true);
    return () => {
      alive = false;
      stream?.getTracks().forEach((tr) => tr.stop());
    };
  }, []);

  // Artwork: it must be CORS-readable or the canvas cannot be exported, so a
  // host that refuses is retried through the worker's image proxy.
  useEffect(() => {
    let alive = true;
    const sources = [getLightboxImage(imageUrl), `${WORKER_URL}/image-proxy?url=${encodeURIComponent(imageUrl)}`];
    const tryLoad = (i: number) => {
      if (i >= sources.length) { if (alive) setImageError(true); return; }
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        if (!alive) return;
        artImgRef.current = img;
        setArtSrc(sources[i]);
        const stage = stageRef.current;
        const sw = stage?.clientWidth || window.innerWidth;
        const sh = stage?.clientHeight || window.innerHeight;
        setArt({ x: sw / 2, y: sh * 0.42, w: Math.min(sw * 0.6, (sh * 0.5 * img.naturalWidth) / img.naturalHeight) });
      };
      img.onerror = () => tryLoad(i + 1);
      img.src = sources[i];
    };
    tryLoad(0);
    return () => { alive = false; };
  }, [imageUrl]);

  useEffect(() => {
    const onSaved = (e: Event) => setSaveState((e as CustomEvent<{ ok?: boolean }>).detail?.ok ? "saved" : "failed");
    window.addEventListener("ar:photo-saved", onSaved);
    return () => window.removeEventListener("ar:photo-saved", onSaved);
  }, []);

  // Every time a finger lands or lifts, the gesture restarts from where the artwork is now.
  const rebase = (current: Art | null) => {
    const pts = [...pointers.current.values()];
    if (!current || pts.length === 0) { base.current = null; return; }
    const mx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
    const my = pts.reduce((s, p) => s + p.y, 0) / pts.length;
    const dist = pts.length > 1 ? Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) : 0;
    base.current = { art: current, mx, my, dist };
  };
  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    rebase(art);
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(e.pointerId) || !base.current) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = [...pointers.current.values()];
    const b = base.current;
    const mx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
    const my = pts.reduce((s, p) => s + p.y, 0) / pts.length;
    const dist = pts.length > 1 ? Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) : 0;
    const scale = b.dist > 0 && dist > 0 ? dist / b.dist : 1;
    const maxW = (stageRef.current?.clientWidth || window.innerWidth) * 3;
    setArt({ x: b.art.x + mx - b.mx, y: b.art.y + my - b.my, w: Math.min(maxW, Math.max(MIN_W, b.art.w * scale)) });
  };
  const onPointerEnd = (e: ReactPointerEvent<HTMLDivElement>) => {
    pointers.current.delete(e.pointerId);
    rebase(art);
  };

  const capture = () => {
    const video = videoRef.current;
    const stage = stageRef.current;
    const img = artImgRef.current;
    if (!video || !stage || !img || !art || !video.videoWidth) return;
    // The video fills the screen the way object-fit: cover does; take the same
    // crop from the full-resolution frame so the photo matches what was seen.
    const sw = stage.clientWidth;
    const sh = stage.clientHeight;
    const cover = Math.max(sw / video.videoWidth, sh / video.videoHeight);
    const k = 1 / cover; // screen px → frame px
    const cw = Math.round(sw * k);
    const ch = Math.round(sh * k);
    const canvas = document.createElement("canvas");
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, (video.videoWidth - cw) / 2, (video.videoHeight - ch) / 2, cw, ch, 0, 0, cw, ch);
    const w = art.w * k;
    const h = (w * img.naturalHeight) / img.naturalWidth;
    ctx.shadowColor = "rgba(0,0,0,0.35)";
    ctx.shadowBlur = 24 * k;
    ctx.shadowOffsetY = 8 * k;
    ctx.drawImage(img, art.x * k - w / 2, art.y * k - h / 2, w, h);
    try {
      setShot(canvas.toDataURL("image/jpeg", 0.92));
      setSaveState("idle");
    } catch {
      setImageError(true);
    }
  };

  const save = () => {
    const bridge = (window as unknown as { ReactNativeWebView?: { postMessage: (data: string) => void } }).ReactNativeWebView;
    if (!shot || !bridge?.postMessage) { setSaveState("failed"); return; }
    setSaveState("saving");
    bridge.postMessage(JSON.stringify({ type: "SAVE_PHOTO", data: shot.slice(shot.indexOf(",") + 1) }));
  };

  const message = cameraError
    ? L("카메라를 열 수 없습니다. 설정에서 COLLY의 카메라 접근을 허용해 주세요.", "The camera could not be opened. Allow camera access for COLLY in Settings.")
    : imageError
      ? L("이 작품은 이미지를 불러올 수 없어 촬영할 수 없습니다.", "This artwork's image could not be loaded.")
      : "";
  const ready = !message && !!art && !!artSrc;
  const artH = art && artImgRef.current ? (art.w * artImgRef.current.naturalHeight) / artImgRef.current.naturalWidth : 0;

  return createPortal(
    <div style={S.root} onClick={(e) => e.stopPropagation()}>
      <video ref={videoRef} autoPlay playsInline muted style={S.fill} />
      <div
        ref={stageRef}
        style={S.stage}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
      >
        {ready && art && (
          <img
            src={artSrc}
            alt={title}
            draggable={false}
            style={{ ...S.art, left: art.x - art.w / 2, top: art.y - artH / 2, width: art.w, height: artH }}
          />
        )}
      </div>

      {shot && <img src={shot} alt="" style={S.fill} />}
      {message && <div style={S.message}>{message}</div>}

      <div style={S.bar}>
        {shot ? (
          <div key="review" style={S.review}>
            <button type="button" style={S.textButton} onClick={() => setShot(null)}>
              {L("다시 찍기", "Retake")}
            </button>
            <button
              type="button"
              style={{ ...S.textButton, color: saveState === "saved" ? "#D4A547" : "#fff" }}
              disabled={saveState === "saving" || saveState === "saved"}
              onClick={save}
            >
              {saveState === "saved"
                ? L("사진 앱에 저장했습니다", "Saved to Photos")
                : saveState === "saving"
                  ? L("저장하는 중", "Saving")
                  : saveState === "failed"
                    ? L("저장하지 못했습니다. 다시 시도", "Could not save. Try again")
                    : L("저장", "Save")}
            </button>
          </div>
        ) : (
          ready && (
            <>
              <div style={S.hint}>{L("한 손가락으로 옮기고, 두 손가락으로 크기를 바꿉니다", "Drag to move, pinch to resize")}</div>
              <button type="button" style={S.shutter} onClick={capture} aria-label={L("촬영", "Take photo")} />
            </>
          )
        )}
      </div>

      <CloseButton onClick={onClose} label={L("닫기", "Close")} zIndex={LAYER_Z + 10} />
    </div>,
    document.body,
  );
}

const S = {
  root: { position: "fixed", inset: 0, zIndex: LAYER_Z, background: "#000", overflow: "hidden", userSelect: "none", WebkitUserSelect: "none" },
  fill: { position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" },
  stage: { position: "absolute", inset: 0, touchAction: "none" },
  art: { position: "absolute", maxWidth: "none", pointerEvents: "none", boxShadow: "0 8px 24px rgba(0,0,0,0.35)" },
  message: { position: "absolute", left: 32, right: 32, top: "40%", color: "#fff", fontSize: 14, lineHeight: 1.6, textAlign: "center" },
  bar: {
    position: "absolute", left: 0, right: 0, bottom: 0,
    padding: "16px 28px calc(env(safe-area-inset-bottom, 0px) + 28px)",
    display: "flex", flexDirection: "column", alignItems: "center", gap: 16,
    background: "linear-gradient(to top, rgba(0,0,0,0.55), rgba(0,0,0,0))",
  },
  review: { width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between" },
  hint: { color: "rgba(255,255,255,0.85)", fontSize: 12, textAlign: "center" },
  shutter: { width: 68, height: 68, borderRadius: 34, background: "#fff", border: "4px solid rgba(255,255,255,0.45)", backgroundClip: "padding-box", padding: 0, cursor: "pointer" },
  textButton: { background: "none", border: "none", color: "#fff", fontSize: 15, padding: "10px 8px", cursor: "pointer" },
} satisfies Record<string, React.CSSProperties>;
