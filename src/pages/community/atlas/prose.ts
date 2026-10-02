/**
 * A post body is HTML — the composer writes it with contentEditable — so it
 * is cleaned before it is shown or saved. Only what a post can carry
 * survives: paragraphs, a subhead, quotes, lists, emphasis, links, images and
 * attached works. Anything else is unwrapped to its text, script-like
 * elements go with their contents, and every attribute but a link's href
 * and an image's src/alt is dropped — an onerror or a javascript: link
 * cannot ride along.
 */
const ALLOWED = new Set([
  "P", "H2", "H3", "BLOCKQUOTE", "UL", "OL", "LI", "STRONG", "B", "EM", "I", "U",
  "A", "IMG", "FIGURE", "FIGCAPTION", "HR", "BR",
]);
const DROPPED = new Set(["SCRIPT", "STYLE", "IFRAME", "OBJECT", "EMBED", "TEMPLATE", "NOSCRIPT", "BUTTON", "INPUT", "TEXTAREA", "SELECT"]);
const BLOCK = /^(P|DIV|H[1-6]|BLOCKQUOTE|UL|OL|FIGURE|HR)$/;

function clean(node: Element) {
  [...node.children].forEach((el) => {
    const tag = el.tagName;
    if (DROPPED.has(tag)) { el.remove(); return; }
    /* contentEditable wraps each line in a div; a div holding only inline
       content is a paragraph, not a wrapper to throw away */
    if (tag === "DIV" && ![...el.children].some((c) => BLOCK.test(c.tagName))) {
      const p = el.ownerDocument.createElement("p");
      p.append(...el.childNodes);
      el.replaceWith(p);
      clean(p);
      return;
    }
    if (!ALLOWED.has(tag)) {
      clean(el);
      el.replaceWith(...el.childNodes);
      return;
    }
    [...el.attributes].forEach((a) => {
      const keep = (tag === "A" && a.name === "href") || (tag === "IMG" && (a.name === "src" || a.name === "alt"))
        /* what an attachment is, so an exhibition can be drawn as a compact card */
        || (tag === "FIGURE" && a.name === "data-kind" && /^(artwork|exhibition|museum|artist)$/.test(a.value));
      if (!keep) el.removeAttribute(a.name);
    });
    if (tag === "A") {
      if (/^(https?:|mailto:|\/)/i.test(el.getAttribute("href") || "")) {
        el.setAttribute("target", "_blank");
        el.setAttribute("rel", "noopener noreferrer");
      } else el.removeAttribute("href");
    }
    if (tag === "IMG" && !/^(https?:|data:image\/|\/)/i.test(el.getAttribute("src") || "")) {
      el.remove();
      return;
    }
    clean(el);
  });
}

/* An attached work is a locked div of divs. The live composer names the
   lines (.att-title, .att-artist, .att-meta); the oldest posts carry no
   classes at all — a picture, then one div per line. Read as a figure either
   keeps its picture and its record instead of collapsing into one run of text. */
function liftAttachments(root: Element) {
  const doc = root.ownerDocument;
  root.querySelectorAll('.post-image-container, div[contenteditable="false"]').forEach((box) => {
    box.querySelectorAll(".remove-attachment-trigger, .crop-trigger, .edit-meta-trigger, button").forEach((n) => n.remove());
    const img = box.querySelector("img");
    const named = [".att-title", ".att-artist", ".att-meta"].map((s) => box.querySelector(s)?.textContent?.trim() || "");
    const lines = named.some(Boolean)
      ? named
      : [...box.querySelectorAll("div")].filter((d) => !d.querySelector("div, img")).map((d) => d.textContent?.trim() || "");
    if (!img && !lines.some(Boolean)) return;
    const fig = doc.createElement("figure");
    if (img) fig.append(img);
    const [title, ...rest] = lines;
    if (title || rest.some(Boolean)) {
      const cap = doc.createElement("figcaption");
      if (title) { const b = doc.createElement("b"); b.textContent = title; cap.append(b); }
      const line = rest.filter(Boolean).join(" · ");
      if (line) cap.append(doc.createTextNode(line));
      fig.append(cap);
    }
    box.replaceWith(fig);
  });
}

const escapeText = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Clean HTML for a post body. Older posts are plain text; blank lines become paragraphs. */
export function toProse(content = ""): string {
  const looksHtml = /<\/?[a-z][^>]*>/i.test(content);
  const html = looksHtml
    ? content
    : content.trim().split(/\n{2,}/).map((b) => `<p>${escapeText(b).replace(/\n/g, "<br>")}</p>`).join("");
  const root = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html").body.firstElementChild;
  if (!root) return "";
  liftAttachments(root);
  clean(root);
  /* an empty paragraph, or a bare line break between blocks, only adds a gap
     the spacing already gives */
  [...root.children].forEach((c) => { if (c.tagName === "BR") c.remove(); });
  root.querySelectorAll("p").forEach((p) => {
    if (!(p.textContent || "").replace(/​/g, "").trim() && !p.querySelector("img")) p.remove();
  });
  return root.innerHTML.trim();
}

/** The words of a post without its attachments or links — the board's excerpt and the composer's count. */
export function textOf(content = "", max = Infinity): string {
  const root = new DOMParser().parseFromString(`<div>${content}</div>`, "text/html").body;
  root.querySelectorAll(".post-image-container, figure, button").forEach((n) => n.remove());
  /* the editor writes blocks with no whitespace between them, and their words
     would otherwise run together */
  root.querySelectorAll("p, div, h2, h3, li, blockquote").forEach((n) => n.append(" "));
  root.querySelectorAll("br").forEach((n) => n.replaceWith(" "));
  return (root.textContent || "").replace(/https?:\/\/\S+/g, " ").replace(/[\s​]+/g, " ").trim().slice(0, max);
}
