import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Bold, Italic, List, X } from "lucide-react";
import { exhibitions } from "../../../data/exhibitions";
import { COMMUNITY_CATEGORIES, type CommunityCategory, type CommunityHeaderType } from "../../../features/community/communityFeed";
import { getOptimizedImageUrl } from "../../../utils/imageProxy";
import { getWorkerNetworkMode } from "../../../utils/network";
import { textOf, toProse } from "./prose";
import { CATEGORY_LABEL, TARGET_LABEL, catStyle, type PostHeader } from "./shared";

type HeaderType = PostHeader["type"];

/** a subject's picture; a missing or broken image leaves the plain square, not the browser's broken icon */
function Thumb({ image }: { image?: string }) {
  const [failed, setFailed] = useState(false);
  return image && !failed
    ? <img src={getOptimizedImageUrl(image, 80)} alt="" loading="lazy" onError={() => setFailed(true)} />
    : <span className="ca-menu__ph" />;
}

/** what the composer hands back — the page decides where it is saved */
export interface ComposedPost {
  title: string;
  category: CommunityCategory;
  /** the review's subject tab (the live composer saves it as headerTypePreference) */
  subject: CommunityHeaderType;
  header: PostHeader | null;
  /** cleaned HTML — see prose.ts */
  content: string;
  /** the words without attachments, for the snippet */
  text: string;
}

interface Found {
  key: string;
  id: string;
  type: HeaderType;
  name: string;
  image?: string;
  sub?: string;
  count?: number;
  artist?: string;
  year?: string;
  museum?: string;
  period?: string;
}

const SUBJECTS: CommunityHeaderType[] = ["all", "museum", "artist", "artwork", "exhibition"];

/* Museums and their permanent exhibitions, from the app's own data — the live
   header search reads the same list. Korean names are matched as well, so a
   museum can be found by the name people type here. */
function findLocal(q: string, ko: boolean, kinds: HeaderType[] | null): Found[] {
  const needle = q.trim().toLowerCase();
  if (!needle) return [];
  const out: Found[] = [];
  for (const m of exhibitions as any[]) {
    const names = [m.name, m.name_ko, m.nameKo].filter(Boolean).map((s: string) => String(s).toLowerCase());
    if ((!kinds || kinds.includes("museum")) && names.some((n: string) => n.includes(needle))) {
      out.push({
        key: `museum-${m.id}`, id: String(m.id), type: "museum",
        name: (ko && (m.name_ko || m.nameKo)) || m.name, image: m.representativeImage, sub: String(m.location || ""),
      });
    }
    if (!kinds || kinds.includes("exhibition")) {
      for (const e of m.permanentExhibitions || []) {
        const title = String(e.name || e.title || "");
        if (!title.toLowerCase().includes(needle)) continue;
        const period = e.startDate || e.endDate ? `${e.startDate || "?"} – ${e.endDate || "?"}` : "";
        out.push({
          key: `exhibition-${e.id}`, id: String(e.id), type: "exhibition", name: title, image: e.image,
          sub: [m.name, period].filter(Boolean).join(" · "), museum: m.name, period,
        });
      }
    }
  }
  const starts = (f: Found) => (f.name.toLowerCase().startsWith(needle) ? 0 : 1);
  return out.sort((a, b) => starts(a) - starts(b));
}

/**
 * The live composer's fields, in the live order — category, the review's
 * subject and header, title, body, @ attachments — in the shared language.
 * The three type sizes become paragraph styles (본문 · 소제목 · 인용) so a
 * post's hierarchy reads the same in every post, and the editor wears the
 * post's own typography: what is typed is what is published.
 */
export default function Composer({ ko, onPublish, onCancel }: {
  ko: boolean;
  onPublish: (post: ComposedPost) => void | Promise<void>;
  onCancel: () => void;
}) {
  const [category, setCategory] = useState<CommunityCategory>("리뷰");
  const [subject, setSubject] = useState<CommunityHeaderType>("all");
  const [header, setHeader] = useState<PostHeader | null>(null);
  const [hq, setHq] = useState("");
  const [hOpen, setHOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [count, setCount] = useState(0);
  const [empty, setEmpty] = useState(true);
  const [busy, setBusy] = useState(false);
  const [fmt, setFmt] = useState({ block: "p", bold: false, italic: false, list: false });
  const [mention, setMention] = useState<{ q: string; range: Range; top: number; left: number } | null>(null);
  const [mi, setMi] = useState(0);
  const editorRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const k = ko ? "ko" : "en";

  /* one search worker for both the header field and @ — the same worker and
     the same messages the live header search uses */
  const workerRef = useRef<Worker | null>(null);
  const asked = useRef<{ header?: string; mention?: string }>({});
  const [found, setFound] = useState<{ header: Found[]; mention: Found[] }>({ header: [], mention: [] });
  const [hLoading, setHLoading] = useState(false);
  const [indexReady, setIndexReady] = useState(false);
  useEffect(() => {
    const w = new Worker(new URL("../../../workers/search.worker.ts", import.meta.url), { type: "module" });
    w.onmessage = (e: MessageEvent) => {
      const { type, results, artists, query: q, pending } = (e.data || {}) as any;
      /* Until every title has loaded (~20s) the worker answers from a small
         early set and a word-only server match, so part of a title finds
         little. When the whole index is in, ask again — the full scan
         matches any part of a title — rather than keep the early answer. */
      if (type === "LOAD_COMPLETE") {
        setIndexReady(true);
        (["header", "mention"] as const).forEach((purpose) => {
          const again = asked.current[purpose];
          if (again?.trim()) w.postMessage({ type: "SEARCH", query: again });
        });
        return;
      }
      if (type !== "RESULTS") return;
      /* some records carry line breaks and runs of spaces inside their fields */
      const tidy = (v: unknown) => (v == null ? undefined : String(v).replace(/\s+/g, " ").trim() || undefined);
      const works: Found[] = (results || []).slice(0, 80).map((a: any) => ({
        key: `artwork-${a.id}`, id: String(a.id), type: "artwork" as const,
        name: tidy(a.name || a.n || a.title) || "Untitled", image: a.image || a.i || undefined,
        artist: tidy(a.artist || a.a), year: tidy(a.year || a.d), museum: tidy(a.museumName || a.m),
      }));
      const people: Found[] = (artists || []).slice(0, 12).map((x: any) => ({
        key: `artist-${String(x.artist || "").toLowerCase()}`, id: `artist-${String(x.artist || "").toLowerCase()}`,
        type: "artist" as const, name: String(x.artist || ""), count: Number(x.count || 0),
      }));
      setFound((prev) => ({
        header: q === asked.current.header ? [...people, ...works] : prev.header,
        mention: q === asked.current.mention ? works : prev.mention,
      }));
      if (q === asked.current.header && !pending) setHLoading(false);
    };
    w.postMessage({ type: "SET_MODE", mode: getWorkerNetworkMode() });
    w.postMessage({ type: "LOAD" });
    workerRef.current = w;
    return () => w.terminate();
  }, []);
  const ask = (purpose: "header" | "mention", q: string) => {
    asked.current[purpose] = q;
    if (q.trim()) workerRef.current?.postMessage({ type: "SEARCH", query: q });
  };

  useEffect(() => { window.scrollTo(0, 0); }, []);
  useEffect(() => {
    const ed = editorRef.current;
    if (!ed) return;
    ed.innerHTML = "<p><br></p>";
    /* Enter makes a paragraph, not the div Chrome uses by default */
    try { document.execCommand("defaultParagraphSeparator", false, "p"); } catch { /* older engines */ }
  }, []);
  /* the tools show what is in force where the caret is */
  useEffect(() => {
    const read = () => {
      const ed = editorRef.current;
      const sel = window.getSelection();
      if (!ed || !sel?.rangeCount || !ed.contains(sel.anchorNode)) return;
      setFmt({
        block: String(document.queryCommandValue("formatBlock") || "p").toLowerCase(),
        bold: document.queryCommandState("bold"),
        italic: document.queryCommandState("italic"),
        list: document.queryCommandState("insertUnorderedList"),
      });
    };
    document.addEventListener("selectionchange", read);
    return () => document.removeEventListener("selectionchange", read);
  }, []);

  useEffect(() => {
    setHLoading(!!hq.trim());
    ask("header", hq);
  }, [hq]);
  const kinds = subject === "all" ? null : [subject as HeaderType];
  const headerResults = useMemo(() => {
    if (!hq.trim()) return [];
    const local = findLocal(hq, ko, kinds).slice(0, 16);
    const remote = found.header.filter((f) => !kinds || kinds.includes(f.type));
    const seen = new Set<string>();
    return [...local, ...remote].filter((f) => (seen.has(f.key) ? false : (seen.add(f.key), true))).slice(0, 30);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hq, ko, subject, found.header]);

  const mq = mention?.q ?? "";
  useEffect(() => { if (mq.trim()) ask("mention", mq); }, [mq]);
  /* a few exhibitions, then works — up to fifty, in a list that scrolls */
  const mentionResults = useMemo(
    () => (mq.trim() ? [...findLocal(mq, ko, ["exhibition"]).slice(0, 8), ...found.mention].slice(0, 50) : []),
    [mq, ko, found.mention],
  );

  const subOf = (f: Found) =>
    f.type === "artist" ? (ko ? `작품 ${f.count || 0}개` : `${f.count || 0} artworks`)
      : f.sub || [f.artist, f.museum].filter(Boolean).join(" · ");

  /* after every change: the count, the placeholder, and whether an @ is being typed */
  const sync = () => {
    const ed = editorRef.current;
    if (!ed) return;
    const words = textOf(ed.innerHTML);
    setCount(words.length);
    setEmpty(!words && !ed.querySelector("figure"));
    const sel = window.getSelection();
    const r = sel?.rangeCount ? sel.getRangeAt(0) : null;
    const node = r?.startContainer;
    if (r && node && node.nodeType === Node.TEXT_NODE && ed.contains(node)) {
      const before = (node.textContent || "").slice(0, r.startOffset);
      const at = before.lastIndexOf("@");
      const q = at === -1 ? "" : before.slice(at + 1);
      if (at !== -1 && (at === 0 || /\s/.test(before[at - 1])) && !q.includes("\n") && q.length <= 40) {
        const range = document.createRange();
        range.setStart(node, at);
        range.setEnd(node, r.startOffset);
        const rect = range.getBoundingClientRect();
        const wrap = wrapRef.current!.getBoundingClientRect();
        setMention({
          q, range,
          top: rect.bottom - wrap.top + 8,
          left: Math.max(0, Math.min(rect.left - wrap.left, wrap.width - 340)),
        });
        setMi(0);
        return;
      }
    }
    setMention(null);
  };

  const run = (cmd: string, value?: string) => {
    editorRef.current?.focus();
    document.execCommand(cmd, false, value);
    sync();
  };
  const block = (tag: "p" | "h3" | "blockquote") => run("formatBlock", fmt.block === tag && tag !== "p" ? "p" : tag);

  /* an attached work sits between paragraphs — never inside one — and the
     caret moves to a fresh paragraph under it */
  const attach = (f: Found) => {
    const ed = editorRef.current;
    if (!ed || !mention) return;
    const fig = document.createElement("figure");
    fig.contentEditable = "false";
    if (f.image) {
      const img = document.createElement("img");
      img.src = getOptimizedImageUrl(f.image, 900);
      img.alt = f.name;
      fig.append(img);
    }
    const cap = document.createElement("figcaption");
    const b = document.createElement("b");
    b.textContent = f.year ? `${f.name} (${f.year})` : f.name;
    cap.append(b);
    const line = [f.artist, f.museum, f.period].filter(Boolean).join(" · ");
    if (line) cap.append(document.createTextNode(line));
    fig.append(cap);

    mention.range.deleteContents();
    let top: Node = mention.range.startContainer;
    while (top.parentNode && top.parentNode !== ed) top = top.parentNode;
    if (top.parentNode === ed) {
      const hollow = !(top.textContent || "").replace(/​/g, "").trim();
      if (hollow && top instanceof Element) top.replaceWith(fig);
      else (top as ChildNode).after(fig);
    } else ed.append(fig);
    const next = document.createElement("p");
    next.append(document.createElement("br"));
    fig.after(next);
    const sel = window.getSelection();
    const caret = document.createRange();
    caret.setStart(next, 0);
    caret.collapse(true);
    sel?.removeAllRanges();
    sel?.addRange(caret);
    setMention(null);
    sync();
  };

  const startAttach = () => {
    const ed = editorRef.current;
    if (!ed) return;
    ed.focus();
    const sel = window.getSelection();
    if (!sel) return;
    if (!sel.rangeCount || !ed.contains(sel.anchorNode)) {
      const end = document.createRange();
      end.selectNodeContents(ed.lastChild || ed);
      end.collapse(false);
      sel.removeAllRanges();
      sel.addRange(end);
    }
    const r = sel.getRangeAt(0);
    const prev = r.startContainer.nodeType === Node.TEXT_NODE ? (r.startContainer.textContent || "").slice(0, r.startOffset).slice(-1) : "";
    document.execCommand("insertText", false, prev && !/\s/.test(prev) ? " @" : "@");
    sync();
  };

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!mention) return;
    if (e.key === "Escape") { e.preventDefault(); setMention(null); return; }
    if (!mentionResults.length) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setMi((i) => (i + 1) % mentionResults.length); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setMi((i) => (i - 1 + mentionResults.length) % mentionResults.length); }
    else if (e.key === "Enter") { e.preventDefault(); attach(mentionResults[mi]); }
  };

  const pickCategory = (c: CommunityCategory) => {
    setCategory(c);
    if (c !== "리뷰") { setHeader(null); setSubject("all"); }
  };

  const ready = !!title.trim() && count > 0 && (category !== "리뷰" || !!header);
  const hint = !title.trim() || count === 0
    ? (ko ? "제목과 본문을 입력해 주세요" : "Add a title and some text")
    : category === "리뷰" && !header ? (ko ? "리뷰는 머릿글을 골라야 합니다" : "A review needs a header") : "";
  const publish = async () => {
    if (!ready || busy || !editorRef.current) return;
    const content = toProse(editorRef.current.innerHTML);
    setBusy(true);
    try {
      await onPublish({
        title: title.trim(), category, subject, header: category === "리뷰" ? header : null,
        content, text: textOf(content),
      });
    } finally {
      setBusy(false);
    }
  };
  const cancel = () => {
    const dirty = !!title.trim() || count > 0 || !!header;
    if (!dirty || window.confirm(ko ? "작성 중인 내용이 사라집니다. 나갈까요?" : "Discard this draft?")) onCancel();
  };

  const tool = (on: boolean, label: string, act: () => void, face: ReactNode) => (
    <button type="button" className="ca-tool" aria-pressed={on} aria-label={label} title={label}
      onMouseDown={(e) => e.preventDefault()} onClick={act}>{face}</button>
  );
  return (
    <div className="ca-write">
      <div className="ca-wbar">
        <button type="button" className="ca-cancel" onClick={cancel}>{ko ? "취소" : "Cancel"}</button>
        <span className="ca-wbar__title">{ko ? "새 글 작성" : "New post"}</span>
        <button type="button" className="ca-publish" disabled={!ready || busy} onClick={publish}>
          {busy ? (ko ? "등록 중..." : "Publishing…") : (ko ? "등록" : "Publish")}
        </button>
      </div>

      <div className="ca-field">
        <span>{ko ? "분류" : "Category"}</span>
        <div className="ca-tabs">
          {COMMUNITY_CATEGORIES.map((c) => (
            <button key={c} type="button" aria-pressed={category === c} style={catStyle(c)} onClick={() => pickCategory(c)}>
              {CATEGORY_LABEL[c][k]}
            </button>
          ))}
        </div>
      </div>

      {category === "리뷰" ? (
        <>
          <div className="ca-field">
            <span>{ko ? "대상" : "Subject"}</span>
            <div className="ca-tabs ca-tabs--small">
              {SUBJECTS.map((s) => (
                <button key={s} type="button" aria-pressed={subject === s} onClick={() => setSubject(s)}>{TARGET_LABEL[s][k]}</button>
              ))}
            </div>
          </div>
          <div className={header ? "ca-field ca-field--card" : "ca-field"}>
            <span>{ko ? "머릿글" : "Header"}</span>
            {header ? (
              <div className="ca-chosen">
                <Thumb image={header.image} />
                <div><b>{header.name}</b><small>{TARGET_LABEL[header.type][k]}</small></div>
                <button type="button" onClick={() => setHeader(null)} aria-label={ko ? "머릿글 지우기" : "Clear header"}>
                  <X size={14} strokeWidth={1.8} />
                </button>
              </div>
            ) : (
              <div className="ca-pick">
                <input value={hq} onChange={(e) => { setHq(e.target.value); setHOpen(true); }}
                  onFocus={() => setHOpen(true)} onBlur={() => setHOpen(false)}
                  placeholder={ko ? "머릿글 설정 (미술관/작가/작품/전시 검색)" : "Set header (search museum/artist/artwork/exhibition)"}
                  aria-label={ko ? "머릿글 검색" : "Search header"} />
                {hOpen && hq.trim() && (
                  <div className="ca-menu" role="listbox">
                    {headerResults.map((f) => (
                      <button key={f.key} type="button" role="option" aria-selected={false}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => { setHeader({ id: f.id, type: f.type, name: f.name, image: f.image }); setHq(""); setHOpen(false); }}>
                        <Thumb image={f.image} />
                        <span><b>{f.name}</b><small><em>{TARGET_LABEL[f.type][k]}</em>{subOf(f)}</small></span>
                      </button>
                    ))}
                    {hLoading && <p>{ko ? "작가/작품 결과를 불러오는 중..." : "Loading artists and artworks…"}</p>}
                    {!hLoading && headerResults.length === 0 && <p>{ko ? "검색 결과가 없습니다" : "No results"}</p>}
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="ca-field">
          <span>{ko ? "머릿글" : "Header"}</span>
          <p className="ca-note">{ko ? "현재 카테고리는 머릿글 선택 없이 바로 작성할 수 있습니다." : "This category needs no header — write straight away."}</p>
        </div>
      )}

      <input className="ca-title" value={title} onChange={(e) => setTitle(e.target.value)}
        placeholder={ko ? "제목을 입력하세요" : "Enter a title"} aria-label={ko ? "제목" : "Title"} />

      <div className="ca-tools" role="toolbar" aria-label={ko ? "서식" : "Formatting"}>
        {tool(fmt.block === "p" || fmt.block === "div" || fmt.block === "", ko ? "본문" : "Body", () => block("p"), ko ? "본문" : "Body")}
        {tool(fmt.block === "h3", ko ? "소제목" : "Subhead", () => block("h3"), ko ? "소제목" : "Subhead")}
        {tool(fmt.block === "blockquote", ko ? "인용" : "Quote", () => block("blockquote"), ko ? "인용" : "Quote")}
        <i aria-hidden="true" />
        {tool(fmt.bold, ko ? "굵게" : "Bold", () => run("bold"), <Bold size={14} strokeWidth={2.2} />)}
        {tool(fmt.italic, ko ? "기울임" : "Italic", () => run("italic"), <Italic size={14} strokeWidth={2.2} />)}
        {tool(fmt.list, ko ? "목록" : "List", () => run("insertUnorderedList"), <List size={15} strokeWidth={1.9} />)}
        <button type="button" className="ca-tool ca-tool--attach" onMouseDown={(e) => e.preventDefault()} onClick={startAttach}>
          @ {ko ? "첨부" : "Attach"}
        </button>
      </div>

      <div className="ca-editwrap" ref={wrapRef}>
        <div ref={editorRef} className="ca-prose ca-editor" contentEditable suppressContentEditableWarning
          role="textbox" aria-multiline="true" aria-label={ko ? "본문" : "Body"}
          data-placeholder={ko ? "내용을 입력하세요... (@작품/전시 검색)" : "Write here… (@ to attach a work or exhibition)"}
          data-empty={empty || undefined}
          onInput={sync} onKeyUp={(e) => { if (e.key.startsWith("Arrow") && !mention) sync(); }} onKeyDown={onKey}
          onBlur={() => setMention(null)}
          onPaste={(e) => {
            /* pasted text comes in plain, so it takes the post's type, not the source page's */
            e.preventDefault();
            document.execCommand("insertText", false, e.clipboardData.getData("text/plain"));
          }} />
        {mention && (
          <div className="ca-mention" style={{ top: mention.top, left: mention.left }}>
            <div className="ca-menu" role="listbox" aria-label={ko ? "첨부할 작품·전시" : "Works and exhibitions"}>
              {!mq.trim() && <p>{ko ? "작품이나 전시 이름을 입력하세요" : "Type a work or an exhibition"}</p>}
              {mq.trim() && mentionResults.length === 0 && <p>{ko ? "검색 결과가 없습니다" : "No results"}</p>}
              {mentionResults.map((f, i) => (
                <button key={f.key} type="button" role="option" aria-selected={i === mi}
                  onMouseDown={(e) => { e.preventDefault(); attach(f); }}>
                  <Thumb image={f.image} />
                  <span><b>{f.year ? `${f.name} (${f.year})` : f.name}</b><small><em>{TARGET_LABEL[f.type][k]}</em>{subOf(f)}</small></span>
                </button>
              ))}
              {mq.trim() && !indexReady && (
                <p className="ca-menu__note">{ko ? "전체 작품을 불러오는 중이라 아직 일부만 보입니다" : "Still loading every work — more will appear"}</p>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="ca-wfoot">
        <span>{ko ? `${count.toLocaleString()}자` : `${count.toLocaleString()} chars`}</span>
        <span>{hint}</span>
      </div>
    </div>
  );
}
