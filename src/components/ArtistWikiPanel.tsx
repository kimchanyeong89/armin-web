import { useEffect, useState, type ReactNode } from "react";
import { getDataFetchOptions } from "../utils/network";
import "../styles/ArtistWikiPanel.css";

type ArtistWikiPanelProps = {
  artistName: string;
  fallbackDescription?: string;
  imageUrl?: string;
  headerSlot?: ReactNode;
};

const shouldSkipWikiFetchOnMobile = () => {
  if (typeof window === "undefined") return false;
  try {
    const ua = navigator.userAgent || "";
    const mobileUa = /Mobi|Android|iPhone|iPad|iPod|Opera Mini|IEMobile/i.test(ua);
    const coarsePointer = typeof window.matchMedia === "function"
      ? window.matchMedia("(pointer: coarse)").matches
      : false;
    const narrowViewport = window.innerWidth < 1024;
    const saveData = (navigator as any)?.connection?.saveData === true;
    return mobileUa || (coarsePointer && narrowViewport) || saveData;
  } catch {
    return window.innerWidth < 768;
  }
};

const shouldUseGeminiWikiApi = () => {
  if (typeof window === "undefined") return false;
  // Enable explicitly via Vite env in environments where /api/artist-wiki exists.
  const enabledByEnv = String((import.meta as any)?.env?.VITE_ENABLE_ARTIST_WIKI_API || "").toLowerCase() === "true";
  if (!enabledByEnv) return false;
  return true;
};

/* const FACE_TEMPLATES = [
  [
    "   .-''''-.",
    "  /  o  o  \\",
    " |    ^     |",
    " |  \\___/   |",
    "  \\       /",
    "   '-.__.-'",
  ],
  [
    "    .----.",
    "  /  .--. \\",
    " |  (o  o) |",
    " |   /\\   |",
    "  \\ '--' /",
    "   '----'",
  ],
  [
    "   .------.",
    "  /  o  o  \\",
    " |    __    |",
    " |   (__)   |",
    "  \\  --  /",
    "   '----'",
  ],
  [
    "    .----.",
    "  /  --  \\",
    " |  o  o  |",
    " |   /\\   |",
    "  \\  ==  /",
    "   '----'",
  ],
];

const mulberry32 = (seed: number) => () => {
  let t = (seed += 0x6d2b79f5);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

function buildFaceAscii(seed: number) {
  const rand = mulberry32(seed);
  const template = FACE_TEMPLATES[Math.floor(rand() * FACE_TEMPLATES.length)];
  const eyeVariants = ["o", "•", "0", "·"];
  const mouthVariants = ["__", "--", "..", "~~"];
  const eye = eyeVariants[Math.floor(rand() * eyeVariants.length)];
  const mouth = mouthVariants[Math.floor(rand() * mouthVariants.length)];

  return template
    .map((line) => line.replace(/o/g, eye).replace(/__|--/g, mouth))
    .join("\n");
} */

export default function ArtistWikiPanel({
  artistName,
  fallbackDescription,
  imageUrl,
  headerSlot,
}: ArtistWikiPanelProps) {
  const [wikiSummary, setWikiSummary] = useState<string>("");
  const [wikiSourceUrl, setWikiSourceUrl] = useState<string>("");
  const [wikiError, setWikiError] = useState<string>("");
  const [wikiLoading, setWikiLoading] = useState(false);
  /* const [asciiArt, setAsciiArt] = useState<string>(""); */
  /* const [visibleAscii, setVisibleAscii] = useState<string>("");
  const [isTyping, setIsTyping] = useState(false); */
  const [asciiSeed, setAsciiSeed] = useState<number>(() => Date.now());
  /* const [imageAscii, setImageAscii] = useState<string>(""); */

  const safeFallbackDescription =
    fallbackDescription || "설명이 아직 준비되지 않았습니다. 곧 업데이트할게요.";

  /* const faceAscii = useMemo(() => buildFaceAscii(asciiSeed), [asciiSeed]); */

  useEffect(() => {
    if (!artistName) {
      return;
    }
    setAsciiSeed(Date.now() + artistName.length * 997);
  }, [artistName]);

  useEffect(() => {
    if (!artistName) {
      return undefined;
    }

    const controller = new AbortController();
    const encodedName = encodeURIComponent(artistName);
    const normalizedName = artistName.trim().toLowerCase();

    const cacheKey = `artist-wiki:${normalizedName}`;
    const fromCache = () => {
      try {
        const raw = sessionStorage.getItem(cacheKey);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as { summary?: string; sourceUrl?: string; ts?: number };
        if (parsed?.summary) return parsed;
      } catch {
        // ignore cache errors
      }
      return null;
    };

    const saveCache = (summary: string, sourceUrl: string) => {
      try {
        sessionStorage.setItem(cacheKey, JSON.stringify({ summary, sourceUrl, ts: Date.now() }));
      } catch {
        // ignore cache errors
      }
    };

    const cached = fromCache();
    if (cached) {
      setWikiSummary(cached.summary || safeFallbackDescription);
      setWikiSourceUrl(cached.sourceUrl || "");
      setWikiLoading(false);
      return () => controller.abort();
    }

    const fetchGeminiWiki = async () => {
      setWikiLoading(true);
      setWikiError("");
      setWikiSourceUrl("");
      try {
        const response = await fetch("/api/artist-wiki", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ topic: artistName }),
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`Gemini API failed (${response.status})`);
        }

        const data = await response.json();
        setWikiSummary(data.summary || safeFallbackDescription);
        if (data.ascii) {
          // setAsciiArt(data.ascii);
        }
        setWikiSourceUrl(data.sourceUrl || "");
        if (data.summary) saveCache(data.summary, data.sourceUrl || "");
        return true;
      } catch (error) {
        if (!controller.signal.aborted) {
          console.warn("Gemini wiki error", error);
        }
        return false;
      }
    };

    const fetchWikipediaFallback = async () => {
      // Try multiple Wikipedia language editions in priority order. Many of
      // the artists in the index (e.g. "Tor Refsum", a Norwegian painter)
      // only have a Wikipedia article in their native language — English
      // alone returns 404 and the user sees the error banner. Falling
      // through ko → no → de → fr → it → es covers the most common cases
      // for European/Nordic/Asian artists in the dataset.
      const langs = ["en", "ko", "no", "de", "fr", "it", "es", "ru"];
      for (const lang of langs) {
        if (controller.signal.aborted) return;
        try {
          const response = await fetch(
            `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodedName}`,
            { signal: controller.signal, mode: "cors", ...getDataFetchOptions() }
          );

          if (!response.ok) continue;

          const data = await response.json();
          // Disambiguation / "no such page" pages return 200 but with a
          // non-standard type. Skip those — they're not real artist pages.
          if (data.type && data.type !== "standard") continue;
          if (!data.extract || data.extract.trim().length < 30) continue;

          setWikiSummary(data.extract);
          setWikiSourceUrl(data.content_urls?.desktop?.page || "");
          saveCache(data.extract, data.content_urls?.desktop?.page || "");
          return true;
        } catch (error) {
          if (controller.signal.aborted) return;
          // Try the next language
          console.warn(`Wikipedia ${lang} fallback error`, error);
        }
      }

      // All language editions exhausted — show the fallback description
      // but DON'T flash a network-error banner; this is just an artist
      // without a Wikipedia page (or whose name doesn't match a page
      // title). The default safe-fallback copy is acceptable on its own.
      if (!controller.signal.aborted) {
        setWikiSummary(safeFallbackDescription);
        setWikiSourceUrl("");
      }
      return false;
    };

    const run = async () => {
      // Always fetch Wikipedia — skip Gemini API only (requires server env var)
      const geminiOk = shouldUseGeminiWikiApi() ? await fetchGeminiWiki() : false;
      if (!geminiOk && !controller.signal.aborted) {
        await fetchWikipediaFallback();
      }
      // Never show the "설명을 생성하지 못했어요. 네트워크 또는 API 설정을 확인해 주세요"
      // banner — for niche artists missing from every Wikipedia language
      // edition the safeFallbackDescription is enough, and the banner
      // implied a setup-error to the user that wasn't actually present.
      if (!controller.signal.aborted) {
        setWikiError("");
        setWikiLoading(false);
      }
    };

    run();
    return () => controller.abort();
  }, [artistName, fallbackDescription]);

  /* useEffect(() => {
    const resolvedAscii = asciiArt || imageAscii || faceAscii;
    const fullText = resolvedAscii.trimEnd();
    if (!fullText) {
      setVisibleAscii("");
      setIsTyping(false);
      return undefined;
    }

    let index = 0;
    setVisibleAscii("");
    setIsTyping(true);

    const interval = window.setInterval(() => {
      const nextChar = fullText[index];
      if (nextChar === undefined) {
        window.clearInterval(interval);
        setIsTyping(false);
        return;
      }
      setVisibleAscii((prev) => prev + nextChar);
      index += 1;
    }, 5);

    return () => window.clearInterval(interval);
  }, [asciiArt, imageAscii, faceAscii, artistName]); */

  /* useEffect(() => {
    if (!imageUrl) {
      setImageAscii("");
      return;
    }

    let cancelled = false;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = imageUrl;

    img.onload = () => {
      if (cancelled) return;
      const targetWidth = 32;
      const aspect = img.height / img.width;
      const targetHeight = Math.max(10, Math.round(targetWidth * aspect * 0.55));
      const canvas = document.createElement("canvas");
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
      const { data } = ctx.getImageData(0, 0, targetWidth, targetHeight);
      const chars = " .:-=+*#%@";
      const lines: string[] = [];
      for (let y = 0; y < targetHeight; y += 1) {
        let row = "";
        for (let x = 0; x < targetWidth; x += 1) {
          const idx = (y * targetWidth + x) * 4;
          const r = data[idx];
          const g = data[idx + 1];
          const b = data[idx + 2];
          const a = data[idx + 3];
          const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) * (a / 255);
          const charIndex = Math.floor((luminance / 255) * (chars.length - 1));
          row += chars[chars.length - 1 - charIndex];
        }
        lines.push(row);
      }
      setImageAscii(lines.join("\n"));
    };

    img.onerror = () => {
      if (!cancelled) {
        setImageAscii("");
      }
    };

    return () => {
      cancelled = true;
    };
  }, [imageUrl]); */

  // Silence unused vars due to commented out ASCII features
  void wikiSourceUrl;
  void imageUrl;
  void asciiSeed;
  void setAsciiSeed;

  return (
    <>
      {headerSlot && <div className="infinite-wiki__header-slot">{headerSlot}</div>}
      {wikiLoading && !wikiSummary ? (
        <p className="artist-bio__loading">Loading biography…</p>
      ) : (
        <p className="artist-bio__text">
          {wikiSummary || safeFallbackDescription}
        </p>
      )}
      {wikiError && <p className="artist-bio__error">{wikiError}</p>}
    </>
  );
}
