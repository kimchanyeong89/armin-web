import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { Building2, Calendar, Image, Palette, X } from "lucide-react";
import { db } from "../../firebase";
import HeaderSelector, { type HeaderItem } from "../../components/Community/HeaderSelector";
import { exhibitions } from "../../data/exhibitions";
import { getOptimizedImageUrl } from "../../utils/imageProxy";
import { getWorkerNetworkMode } from "../../utils/network";
import { DEFAULT_COMMUNITY_RANK } from "../../utils/communityRank";
import { useLanguage } from "../../contexts/LanguageContext";

type FontSizeMode = "small" | "body" | "large";
type SubjectType = "all" | HeaderItem["type"];

interface MentionItem extends HeaderItem {
  year?: string | number;
  museum?: string;
  exhibition?: string;
  startDate?: string;
  endDate?: string;
}

const CATEGORIES = ["리뷰", "뉴스", "토론", "인터뷰", "소식", "질문"];

const CATEGORY_LABELS: Record<string, { ko: string; en: string }> = {
  리뷰: { ko: "리뷰", en: "Review" },
  뉴스: { ko: "뉴스", en: "News" },
  토론: { ko: "토론", en: "Discussion" },
  인터뷰: { ko: "인터뷰", en: "Interview" },
  소식: { ko: "소식", en: "Updates" },
  질문: { ko: "질문", en: "Questions" },
};

const CATEGORY_COLORS: Record<string, string> = {
  리뷰: "#D4A547",
  뉴스: "#60A5FA",
  토론: "#F97316",
  인터뷰: "#A78BFA",
  소식: "#34D399",
  질문: "#FB7185",
};

const SUBJECT_TYPES: Array<{ id: SubjectType; label: string; Icon: typeof Image }> = [
  { id: "all", label: "전체", Icon: Image },
  { id: "museum", label: "미술관", Icon: Building2 },
  { id: "artist", label: "작가", Icon: Palette },
  { id: "artwork", label: "작품", Icon: Image },
  { id: "exhibition", label: "전시", Icon: Calendar },
];

const SUBJECT_TYPE_LABELS: Record<SubjectType, { ko: string; en: string }> = {
  all: { ko: "전체", en: "All" },
  museum: { ko: "미술관", en: "Museum" },
  artist: { ko: "작가", en: "Artist" },
  artwork: { ko: "작품", en: "Artwork" },
  exhibition: { ko: "전시", en: "Exhibition" },
};

const FONT_SIZE_TO_EXEC: Record<FontSizeMode, string> = {
  small: "2",
  body: "3",
  large: "5",
};

const FONT_SIZE_MAP: Record<FontSizeMode, number> = {
  small: 13,
  body: 15,
  large: 19,
};

function extractBodyTextWithoutAttachment(rawHtml: string): string {
  if (!rawHtml) return "";

  if (typeof window !== "undefined" && typeof DOMParser !== "undefined") {
    const doc = new DOMParser().parseFromString(rawHtml, "text/html");
    doc.querySelectorAll(".post-image-container, .att-title, .att-artist, .att-meta, img, figure, figcaption, [data-attachment-id]").forEach((node) => {
      node.remove();
    });
    return (doc.body.textContent || "").replace(/\u200B/g, " ").replace(/\s+/g, " ").trim();
  }

  return rawHtml
    .replace(/<div[^>]*class=["'][^"']*(post-image-container|att-title|att-artist|att-meta)[^"']*["'][\s\S]*?<\/div>/gi, " ")
    .replace(/<img[^>]*>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/\u200B/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasMeaningfulEditorContent(rawHtml: string): boolean {
  if (!rawHtml) return false;
  const normalized = rawHtml
    .replace(/\u200B/g, "")
    .replace(/&nbsp;/gi, "")
    .replace(/<br\s*\/?>/gi, "")
    .trim();

  if (!normalized) return false;
  const withoutTags = normalized.replace(/<[^>]*>/g, "").trim();
  return withoutTags.length > 0 || /post-image-container|<img/i.test(normalized);
}

const WritePostPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { t } = useLanguage();

  const [title, setTitle] = useState("");
  const [header, setHeader] = useState<HeaderItem | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [category, setCategory] = useState("리뷰");
  const [subjectType, setSubjectType] = useState<SubjectType>("all");
  const [fontSize, setFontSize] = useState<FontSizeMode>("body");
  const [bold, setBold] = useState(false);
  const [italic, setItalic] = useState(false);

  const [editorHtml, setEditorHtml] = useState("");
  const [editorText, setEditorText] = useState("");
  const [hasEditorContent, setHasEditorContent] = useState(false);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionResults, setMentionResults] = useState<MentionItem[]>([]);
  const [mentionRange, setMentionRange] = useState<Range | null>(null);
  const [mentionPosition, setMentionPosition] = useState<{ top: number; left: number } | null>(null);

  const editorRef = useRef<HTMLDivElement>(null);
  const workerRef = useRef<Worker | null>(null);
  const localMentionBaseRef = useRef<MentionItem[]>([]);

  const ensureEditorCaretReady = () => {
    const editor = editorRef.current;
    if (!editor) return;

    const hasTextNode = Array.from(editor.childNodes).some((node) => node.nodeType === Node.TEXT_NODE || node.nodeType === Node.ELEMENT_NODE);
    if (!hasTextNode) {
      editor.appendChild(document.createTextNode("\u200B"));
    }

    const selection = window.getSelection();
    if (!selection) return;
    if (selection.rangeCount > 0 && editor.contains(selection.anchorNode)) return;

    const range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
  };

  const focusEditorFromTouch = () => {
    const active = document.activeElement;
    if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) {
      active.blur();
    }

    requestAnimationFrame(() => {
      editorRef.current?.focus();
      ensureEditorCaretReady();
    });
  };

  const [isLightTheme, setIsLightTheme] = useState<boolean>(() => {
    try {
      return localStorage.getItem("homeTheme") === "light";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    const syncTheme = () => {
      try {
        setIsLightTheme(localStorage.getItem("homeTheme") === "light");
      } catch {
        setIsLightTheme(false);
      }
    };

    window.addEventListener("theme-changed", syncTheme);
    window.addEventListener("storage", syncTheme);
    return () => {
      window.removeEventListener("theme-changed", syncTheme);
      window.removeEventListener("storage", syncTheme);
    };
  }, []);

  const colors = isLightTheme
    ? {
        pageBg: "#f6f6f6",
        shellBg: "#fbfbfb",
        text: "#111",
        medText: "#666",
        lowText: "#8a8a8a",
        divider: "rgba(0,0,0,0.10)",
        panelBg: "rgba(0,0,0,0.04)",
        panelBgStrong: "rgba(0,0,0,0.07)",
        mentionBg: "#fff",
      }
    : {
        pageBg: "#050505",
        shellBg: "#080808",
        text: "rgba(255,255,255,0.92)",
        medText: "rgba(255,255,255,0.62)",
        lowText: "rgba(255,255,255,0.42)",
        divider: "rgba(255,255,255,0.10)",
        panelBg: "rgba(255,255,255,0.05)",
        panelBgStrong: "rgba(255,255,255,0.10)",
        mentionBg: "#101010",
      };

  const initWorker = () => {
    if (workerRef.current) return;

    workerRef.current = new Worker(new URL("../../workers/search.worker.ts", import.meta.url), { type: "module" });
    workerRef.current.onmessage = (event) => {
      const { type, results } = event.data || {};
      if (type !== "RESULTS") return;

      const workerItems: MentionItem[] = [
        ...(results || []).slice(0, 80).map((art: any) => ({
          id: String(art.id),
          type: "artwork" as const,
          name: art.name || art.n,
          image: art.image || art.i,
          subtext: art.artist || art.a,
          year: art.year || art.d,
          museum: art.museumName || art.m,
          exhibition: art.exhibitionName || art.exhibitionTitle || art.exhibitionId || art.e,
          startDate: art.startDate,
          endDate: art.endDate,
        })),
      ];

      const merged = [...localMentionBaseRef.current, ...workerItems].filter(
        (item, index, arr) => index === arr.findIndex((candidate) => candidate.id === item.id && candidate.type === item.type),
      );

      setMentionResults(merged.slice(0, 18));
    };

    workerRef.current.postMessage({ type: "SET_MODE", mode: getWorkerNetworkMode() });
    workerRef.current.postMessage({ type: "LOAD" });
  };

  useEffect(() => {
    return () => {
      workerRef.current?.terminate();
    };
  }, []);

  useEffect(() => {
    if (category !== "리뷰") {
      setSubjectType("all");
      setHeader(null);
    }
  }, [category]);

  const buildLocalMentionResults = (queryText: string): MentionItem[] => {
    const q = queryText.toLowerCase();
    const results: MentionItem[] = [];
    const seen = new Set<string>();

    for (const museum of exhibitions) {
      for (const exhibition of museum.permanentExhibitions || []) {
        const exhibitionName = ((exhibition as any).name || (exhibition as any).title || "").toLowerCase();
        if (exhibitionName.includes(q)) {
          const exhibitionId = `exhibition-${(exhibition as any).id}`;
          if (!seen.has(exhibitionId)) {
            const startDate = String((exhibition as any).startDate || "").trim();
            const endDate = String((exhibition as any).endDate || "").trim();
            const period = startDate || endDate ? `${startDate || "?"} - ${endDate || "?"}` : "";
            results.push({
              id: String((exhibition as any).id),
              type: "exhibition",
              name: (exhibition as any).name || (exhibition as any).title,
              image: (exhibition as any).image,
              subtext: period ? `${museum.name} · ${period}` : museum.name,
              museum: museum.name,
              startDate,
              endDate,
            });
            seen.add(exhibitionId);
          }
        }
      }
    }

    return results.slice(0, 18);
  };

  useEffect(() => {
    if (!mentionQuery || mentionQuery.trim().length < 1) {
      setMentionResults([]);
      return;
    }

    const local = buildLocalMentionResults(mentionQuery.trim());
    localMentionBaseRef.current = local;
    setMentionResults(local);

    initWorker();
    workerRef.current?.postMessage({ type: "SEARCH", query: mentionQuery.trim() });
  }, [mentionQuery]);

  const applyCommand = (command: string, value?: string) => {
    editorRef.current?.focus();
    if (value !== undefined) {
      document.execCommand(command, false, value);
    } else {
      document.execCommand(command, false);
    }
  };

  const applyFontSize = (mode: FontSizeMode) => {
    setFontSize(mode);
    applyCommand("fontSize", FONT_SIZE_TO_EXEC[mode]);
  };

  const handleEditorInput = () => {
    if (!editorRef.current) return;

    const currentHtml = editorRef.current.innerHTML;
    setEditorHtml(currentHtml);
    setEditorText(extractBodyTextWithoutAttachment(currentHtml));
    setHasEditorContent(hasMeaningfulEditorContent(currentHtml));

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      setMentionQuery(null);
      return;
    }

    const range = selection.getRangeAt(0);
    const node = range.startContainer;

    if (node.nodeType === Node.TEXT_NODE && node.textContent) {
      const text = node.textContent;
      const cursor = range.startOffset;
      const textBefore = text.slice(0, cursor);
      const atIndex = textBefore.lastIndexOf("@");

      if (atIndex !== -1) {
        const beforeAt = atIndex > 0 ? textBefore[atIndex - 1] : " ";
        if (beforeAt === " " || beforeAt === "\n" || beforeAt === "\u00A0") {
          const queryText = textBefore.slice(atIndex + 1);
          if (!queryText.includes("\n")) {
            const mentionSearchRange = document.createRange();
            mentionSearchRange.setStart(node, atIndex);
            mentionSearchRange.setEnd(node, cursor);
            setMentionRange(mentionSearchRange);
            setMentionQuery(queryText);

            const rect = mentionSearchRange.getBoundingClientRect();
            const editorRect = editorRef.current.getBoundingClientRect();
            setMentionPosition({
              top: rect.bottom - editorRect.top + 6,
              left: rect.left - editorRect.left,
            });
            return;
          }
        }
      }
    }

    setMentionQuery(null);
    setMentionRange(null);
    setMentionPosition(null);
  };

  const insertMentionBlock = (item: MentionItem) => {
    if (!editorRef.current) return;

    const wrapper = document.createElement("div");
    wrapper.className = "post-image-container";
    wrapper.contentEditable = "false";
    wrapper.style.margin = "10px 0 14px";
    wrapper.style.maxWidth = "320px";
    wrapper.style.display = "flex";
    wrapper.style.flexDirection = "column";
    wrapper.style.gap = "7px";

    const img = document.createElement("img");
    img.src = item.image ? getOptimizedImageUrl(item.image, 680) : "";
    img.alt = item.name;
    img.style.width = "100%";
    img.style.maxWidth = "320px";
    img.style.height = "auto";
    img.style.borderRadius = "9px";
    img.style.display = "block";
    img.style.border = `1px solid ${colors.divider}`;
    if (item.image) wrapper.appendChild(img);

    const caption = document.createElement("div");
    caption.style.display = "flex";
    caption.style.flexDirection = "column";
    caption.style.gap = "2px";

    const titleDiv = document.createElement("div");
    titleDiv.className = "att-title";
    titleDiv.style.fontSize = "20px";
    titleDiv.style.fontWeight = "700";
    titleDiv.style.lineHeight = "1.25";
    titleDiv.style.color = colors.text;
    titleDiv.textContent = item.year ? `${item.name} (${item.year})` : item.name;

    const artistDiv = document.createElement("div");
    artistDiv.className = "att-artist";
    artistDiv.style.fontSize = "15px";
    artistDiv.style.color = colors.medText;
    artistDiv.textContent = item.subtext || "";

    const metaDiv = document.createElement("div");
    metaDiv.className = "att-meta";
    metaDiv.style.fontSize = "14px";
    metaDiv.style.fontWeight = "600";
    metaDiv.style.color = colors.medText;
    const period = item.startDate || item.endDate ? `${item.startDate || "?"} - ${item.endDate || "?"}` : "";
    const metaParts = [item.museum, item.exhibition, period].filter(Boolean);
    metaDiv.textContent = metaParts.join(" • ");

    caption.appendChild(titleDiv);
    if (artistDiv.textContent) caption.appendChild(artistDiv);
    if (metaDiv.textContent) caption.appendChild(metaDiv);
    wrapper.appendChild(caption);

    const insertRange = mentionRange;
    if (insertRange) {
      insertRange.deleteContents();
      insertRange.insertNode(wrapper);
      const spacer = document.createTextNode("\u200B");
      wrapper.after(spacer);

      const selection = window.getSelection();
      if (selection) {
        const nextRange = document.createRange();
        nextRange.setStartAfter(spacer);
        nextRange.collapse(true);
        selection.removeAllRanges();
        selection.addRange(nextRange);
      }
    } else {
      editorRef.current.appendChild(wrapper);
      editorRef.current.appendChild(document.createTextNode("\u200B"));
    }

    const nextHtml = editorRef.current.innerHTML;
    setEditorHtml(nextHtml);
    setEditorText(extractBodyTextWithoutAttachment(nextHtml));
    setHasEditorContent(hasMeaningfulEditorContent(nextHtml));
    setMentionQuery(null);
    setMentionRange(null);
    setMentionPosition(null);
    setMentionResults([]);
  };

  const plainText = editorText;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!user) {
      alert(t({ ko: "로그인이 필요합니다.", en: "Login is required." }));
      return;
    }

    if (!title.trim() || !plainText) {
      alert(t({ ko: "제목과 내용을 입력해주세요.", en: "Please enter both title and content." }));
      return;
    }

    const requiresHeader = category === "리뷰";

    if (requiresHeader && !header) {
      alert(t({ ko: "머릿글(주제)을 선택해주세요. (미술관/작가/작품/전시)", en: "Please choose a header topic (museum/artist/artwork/exhibition)." }));
      return;
    }

    setIsSubmitting(true);

    try {
      const html = editorRef.current?.innerHTML || editorHtml;
      const contentText = extractBodyTextWithoutAttachment(html);

      await addDoc(collection(db, "community_posts"), {
        title,
        content: html,
        contentSnippet: contentText.slice(0, 220),
        category,
        style: { fontSize, bold, italic },
        header: header
          ? {
              id: header.id,
              type: header.type,
              name: header.name,
              image: header.image || null,
            }
          : null,
        headerTypePreference: category === "리뷰" ? subjectType : "all",
        authorId: user.uid,
        authorName: user.displayName || "Anonymous",
        authorPhotoURL: user.photoURL || null,
        authorPhoto: user.photoURL || null,
        authorRank: DEFAULT_COMMUNITY_RANK,
        createdAt: serverTimestamp(),
        likes: 0,
        commentCount: 0,
      });

      navigate("/community");
    } catch (error) {
      console.error("Error creating post:", error);
      alert(t({ ko: "게시글 작성 중 오류가 발생했습니다.", en: "An error occurred while creating the post." }));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!user) {
    return (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: colors.pageBg, color: colors.text }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 22, marginBottom: 10 }}>{t({ ko: "로그인이 필요합니다.", en: "Login is required." })}</div>
          <button
            onClick={() => navigate("/login")}
            style={{ border: "none", borderRadius: 999, padding: "10px 18px", background: "#D4A547", color: "#000", cursor: "pointer", fontWeight: 700 }}
          >
            {t({ ko: "로그인하기", en: "Go to Login" })}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        overflowY: "auto",
        background: colors.pageBg,
        color: colors.text,
        fontFamily: "'Space Grotesk', 'Apple SD Gothic Neo', sans-serif",
      }}
    >
      <div style={{ maxWidth: 1240, minHeight: "100%", margin: "0 auto", background: colors.shellBg }}>
        <form onSubmit={handleSubmit} style={{ minHeight: "100%" }}>
          <div
            style={{
              position: "sticky",
              top: 0,
              zIndex: 12,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "12px 14px",
              borderBottom: `1px solid ${colors.divider}`,
              backdropFilter: "blur(16px)",
              WebkitBackdropFilter: "blur(16px)",
              background: isLightTheme ? "rgba(251,251,251,0.95)" : "rgba(8,8,8,0.95)",
            }}
          >
            <button type="button" onClick={() => navigate(-1)} style={{ border: "none", background: "none", cursor: "pointer", color: colors.medText, display: "flex", alignItems: "center", gap: 5, fontSize: 12 }}>
              <X size={14} strokeWidth={2.3} /> {t({ ko: "취소", en: "Cancel" })}
            </button>

            <span style={{ fontSize: 12, color: colors.lowText, letterSpacing: "0.08em" }}>{t({ ko: "새 글 작성", en: "New Post" })}</span>

            <button
              type="submit"
              disabled={isSubmitting || !title.trim() || !plainText || (category === "리뷰" && !header)}
              style={{
                border: "none",
                borderRadius: 999,
                height: 30,
                padding: "0 14px",
                fontSize: 12,
                fontWeight: 700,
                cursor: isSubmitting || !title.trim() || !plainText || (category === "리뷰" && !header) ? "not-allowed" : "pointer",
                background: isSubmitting || !title.trim() || !plainText || (category === "리뷰" && !header) ? colors.panelBgStrong : "#D4A547",
                color: isSubmitting || !title.trim() || !plainText || (category === "리뷰" && !header) ? colors.lowText : "#000",
              }}
            >
              {isSubmitting ? t({ ko: "등록 중...", en: "Publishing..." }) : t({ ko: "등록", en: "Publish" })}
            </button>
          </div>

          <div style={{ padding: "18px 14px 110px", display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {CATEGORIES.map((cat) => {
                const active = category === cat;
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setCategory(cat)}
                    style={{
                      border: "none",
                      borderRadius: 999,
                      padding: "6px 11px",
                      cursor: "pointer",
                      background: active ? CATEGORY_COLORS[cat] : colors.panelBg,
                      color: active ? "#000" : colors.medText,
                      fontSize: 11,
                      fontWeight: active ? 700 : 500,
                    }}
                  >
                    {t(CATEGORY_LABELS[cat])}
                  </button>
                );
              })}
            </div>

            {category === "리뷰" ? (
              <div>
                <div style={{ fontSize: 12, color: colors.medText, marginBottom: 8 }}>{t({ ko: "리뷰 하위 주제", en: "Review Subtopics" })}</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 6, marginBottom: 10 }}>
                  {SUBJECT_TYPES.map(({ id, Icon }) => {
                    const active = subjectType === id;
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setSubjectType(id)}
                        style={{
                          border: `1px solid ${active ? "#D4A547" : colors.divider}`,
                          borderRadius: 8,
                          background: active ? "rgba(212,165,71,0.12)" : colors.panelBg,
                          padding: "9px 6px",
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          gap: 4,
                          cursor: "pointer",
                        }}
                      >
                        <Icon size={12} strokeWidth={1.9} color={active ? "#D4A547" : colors.lowText} />
                        <span style={{ fontSize: 10, color: active ? colors.text : colors.lowText }}>
                          {t(SUBJECT_TYPE_LABELS[id])}
                        </span>
                      </button>
                    );
                  })}
                </div>

                <HeaderSelector
                  selectedItem={header}
                  onSelect={setHeader}
                  variant={isLightTheme ? "light" : "dark"}
                />
              </div>
            ) : (
              <div style={{ fontSize: 12, color: colors.lowText }}>
                {t({ ko: "현재 카테고리는 머릿글 선택 없이 바로 작성할 수 있습니다.", en: "You can write directly in this category without choosing a header." })}
              </div>
            )}

            <div style={{ display: "flex", alignItems: "center", gap: 4, borderBottom: `1px solid ${colors.divider}`, paddingBottom: 8 }}>
              {(["small", "body", "large"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => applyFontSize(mode)}
                  style={{
                    border: "none",
                    borderRadius: 6,
                    padding: "4px 8px",
                    background: fontSize === mode ? "#D4A547" : "transparent",
                    color: fontSize === mode ? "#000" : colors.lowText,
                    cursor: "pointer",
                    fontSize: mode === "small" ? 10 : mode === "body" ? 11 : 13,
                    fontWeight: 700,
                  }}
                >
                  A
                </button>
              ))}

              <button
                type="button"
                onClick={() => {
                  setBold((prev) => !prev);
                  applyCommand("bold");
                }}
                style={{
                  border: "none",
                  borderRadius: 6,
                  padding: "4px 8px",
                  background: bold ? "#D4A547" : "transparent",
                  color: bold ? "#000" : colors.lowText,
                  cursor: "pointer",
                  fontSize: 12,
                  fontWeight: 900,
                }}
              >
                B
              </button>

              <button
                type="button"
                onClick={() => {
                  setItalic((prev) => !prev);
                  applyCommand("italic");
                }}
                style={{
                  border: "none",
                  borderRadius: 6,
                  padding: "4px 8px",
                  background: italic ? "#D4A547" : "transparent",
                  color: italic ? "#000" : colors.lowText,
                  cursor: "pointer",
                  fontSize: 12,
                  fontStyle: "italic",
                  fontWeight: 700,
                }}
              >
                I
              </button>
            </div>

            <input
              type="text"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="sentences"
              enterKeyHint="next"
              placeholder={t({ ko: "제목을 입력하세요", en: "Enter a title" })}
              style={{
                width: "100%",
                border: "none",
                borderBottom: `1px solid ${colors.divider}`,
                background: "transparent",
                outline: "none",
                padding: "0 0 12px",
                color: colors.text,
                fontSize: 34,
                fontWeight: 700,
                letterSpacing: "-0.012em",
              }}
            />

            <div style={{ position: "relative", minHeight: 420 }}>
              <div
                ref={editorRef}
                contentEditable
                suppressContentEditableWarning
                onInput={handleEditorInput}
                onFocus={ensureEditorCaretReady}
                onTouchStart={focusEditorFromTouch}
                onMouseDown={focusEditorFromTouch}
                style={{
                  minHeight: 420,
                  outline: "none",
                  color: colors.medText,
                  fontSize: FONT_SIZE_MAP[fontSize],
                  fontWeight: 400,
                  lineHeight: 1.9,
                  whiteSpace: "pre-wrap",
                }}
              />

              {!hasEditorContent && (
                <div style={{ position: "absolute", top: 0, left: 0, pointerEvents: "none", color: colors.lowText, fontSize: 15 }}>
                  {t({ ko: "내용을 입력하세요... (@작품/전시 검색)", en: "Write your content... (@search artwork/exhibition)" })}
                </div>
              )}

              {mentionQuery !== null && mentionResults.length > 0 && (
                <div
                  style={{
                    position: "absolute",
                    top: mentionPosition ? mentionPosition.top : 36,
                    left: mentionPosition ? Math.min(mentionPosition.left, (editorRef.current?.offsetWidth || 320) - 290) : 0,
                    width: 290,
                    maxHeight: 260,
                    overflowY: "auto",
                    border: `1px solid ${colors.divider}`,
                    background: colors.mentionBg,
                    borderRadius: 10,
                    zIndex: 20,
                    boxShadow: isLightTheme ? "0 6px 18px rgba(0,0,0,0.10)" : "0 8px 18px rgba(0,0,0,0.42)",
                  }}
                >
                  {mentionResults.map((item) => (
                    <button
                      key={`${item.type}-${item.id}`}
                      type="button"
                      onClick={() => insertMentionBlock(item)}
                      style={{
                        width: "100%",
                        border: "none",
                        borderBottom: `1px solid ${colors.divider}`,
                        background: "transparent",
                        color: "inherit",
                        padding: "9px 10px",
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        textAlign: "left",
                        cursor: "pointer",
                      }}
                    >
                      {item.image ? (
                        <img src={getOptimizedImageUrl(item.image, 80)} alt="" style={{ width: 30, height: 30, borderRadius: 6, objectFit: "cover", flexShrink: 0 }} />
                      ) : (
                        <div style={{ width: 30, height: 30, borderRadius: 6, background: colors.panelBgStrong, flexShrink: 0 }} />
                      )}
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: colors.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.name}</div>
                        <div style={{ fontSize: 11, color: colors.lowText, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {item.subtext || t(SUBJECT_TYPE_LABELS[item.type as SubjectType] || { ko: item.type, en: item.type })}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </form>
      </div>

    </div>
  );
};

export default WritePostPage;
