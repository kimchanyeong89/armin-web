// Builds the Korean description every artist page shows a Korean reader.
//
//   node scripts/build-artist-bios-ko.mjs              # everyone in public/artists/_index.json
//   node scripts/build-artist-bios-ko.mjs --limit 60   # a trial
//   node scripts/build-artist-bios-ko.mjs --skip-translate --merge  <dir>  # translations written elsewhere
//   node scripts/build-artist-bios-ko.mjs --skip-translate --polish <dir>  # rewrites of texts already kept
//   node scripts/build-artist-bios-ko.mjs --skip-translate --tidy          # today's rules over every text
//
// --merge and --polish read every out-*.json in the directory they are given,
// so give each round a directory of its own: a folder holding both a text and
// an older version of it would put the older one back.
//
// For each artist: the English Wikipedia summary, checked to be about an artist
// of that name (so a namesake's article is never used). When the article has a
// Korean counterpart, that text is kept as written; otherwise the English is put
// into Korean by Gemini, in batches, in the voice of a Korean art encyclopedia.
//
// Output: public/data/artist-bios/<shard>.json — { key: { t, s, o } }, the text,
// its source article and whether it was written in Korean ("ko") or translated
// ("en"). Shards use the artist key helper the app reads them with. Progress is
// kept in .cache/artist-bios-progress.json, so a stopped run picks up where it was.
//
// Needs VITE_GEMINI_API_KEY in .env.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { artistShardOf } from "../src/utils/artistKey.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "public/data/artist-bios");
const PROGRESS = path.join(ROOT, ".cache/artist-bios-progress.json");
const UA = "COLLY-art-app/1.0 (artist descriptions build; contact: kietzland@gmail.com)";
const MODEL = "gemini-3.6-flash";
const BATCH = 20;

const env = fs.readFileSync(path.join(ROOT, ".env"), "utf8");
const GEMINI_KEY = (env.match(/^VITE_GEMINI_API_KEY=(.*)$/m) || [])[1]?.trim().replace(/^['"]|['"]$/g, "");
if (!GEMINI_KEY && !process.argv.includes("--skip-translate")) throw new Error("VITE_GEMINI_API_KEY is missing from .env");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const index = JSON.parse(fs.readFileSync(path.join(ROOT, "public/artists/_index.json"), "utf8"));
const limitArg = process.argv.indexOf("--limit");
/* --merge <dir>: Korean made elsewhere (JSON arrays of {k, ko}) is checked and kept;
   --skip-translate: no Gemini calls, just articles, merge and shards */
const mergeArg = process.argv.indexOf("--merge");
/* --polish <dir>: the same texts, rewritten to read as Korean; facts must not move */
const polishArg = process.argv.indexOf("--polish");
const SKIP_TRANSLATE = process.argv.includes("--skip-translate");
const artists = limitArg > -1 ? index.slice(0, Number(process.argv[limitArg + 1]) || 50) : index;

fs.mkdirSync(path.dirname(PROGRESS), { recursive: true });
const progress = fs.existsSync(PROGRESS) ? JSON.parse(fs.readFileSync(PROGRESS, "utf8")) : {};
const saveProgress = () => fs.writeFileSync(PROGRESS, JSON.stringify(progress));

/* the art trades a Wikipedia description names — so "Ian Smith, Rhodesian
   politician" is never taken for the Ian Smith in our collection */
const ARTIST_WORDS = /painter|artist|sculptor|photograph|printmaker|illustrator|architect|designer|engraver|draughts|drafts|potter|ceramic|calligraph|cartoonist|lithograph|etcher|woodblock|ukiyo|craft|goldsmith|silversmith|weaver|textile|filmmaker|glass|furniture|miniaturist|muralist|watercolo|animator|caricaturist|iconographer|medallist|mosaic|\bart\b/i;

const fold = (value) => String(value || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const tokens = (value) => fold(value).split(/[^\p{L}\p{N}]+/u).filter((t) => t.length > 1);
function sameName(a, b) {
  const x = new Set(tokens(a));
  const y = new Set(tokens(b));
  if (x.size === 0 || y.size === 0) return false;
  const [small, large] = x.size <= y.size ? [x, y] : [y, x];
  for (const t of small) if (!large.has(t)) return false;
  return true;
}

async function getJson(url, tries = 3) {
  for (let attempt = 0; attempt < tries; attempt += 1) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA, "Api-User-Agent": UA } });
      if (res.status === 429) { await sleep(3000 * (attempt + 1)); continue; }
      if (!res.ok) return null;
      return await res.json();
    } catch {
      await sleep(800 * (attempt + 1));
    }
  }
  return null;
}

/* ── 1: the articles ─────────────────────────────────────────────── */
/* The action API answers twenty titles at a time (the extracts limit) with the
   intro, the short description and the Korean counterpart's title, following
   redirects — one request where the summary endpoint took three per artist. */
const firstParagraph = (text) => {
  const para = String(text || "").split(/\n+/).map((p) => p.trim()).find((p) => p.length >= 40) || "";
  if (para.length <= 700) return para;
  const cut = para.slice(0, 700);
  const stop = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("다. "));
  return stop > 200 ? cut.slice(0, stop + 1) : cut;
};

async function queryTitles(lang, titles, extraProps = "") {
  const url = `https://${lang}.wikipedia.org/w/api.php?action=query&format=json&formatversion=2&redirects=1`
    + `&prop=extracts|description${extraProps}&exintro=1&explaintext=1&exlimit=20&titles=${encodeURIComponent(titles.join("|"))}`;
  const data = await getJson(url);
  const home = new Map(titles.map((t) => [t, t]));
  for (const step of [...(data?.query?.normalized || []), ...(data?.query?.redirects || [])]) {
    home.set(step.to, home.get(step.from) || step.from);
  }
  const byInput = new Map();
  for (const page of data?.query?.pages || []) {
    if (page.missing || page.invalid) continue;
    const input = home.get(page.title) || page.title;
    byInput.set(input, page);
  }
  return byInput;
}

const pending = artists.filter((row) => !progress[row.k.replace(/ /g, "_")]);
const chunks = [];
for (let i = 0; i < pending.length; i += 20) chunks.push(pending.slice(i, i + 20));
let done = 0;
const chunkQueue = [...chunks];
await Promise.all(Array.from({ length: 4 }, async () => {
  while (chunkQueue.length) {
    const chunk = chunkQueue.shift();
    const pages = await queryTitles("en", chunk.map((row) => row.a), "|langlinks&lllang=ko&lllimit=max");
    const koAsk = [];
    for (const row of chunk) {
      const key = row.k.replace(/ /g, "_");
      const page = pages.get(row.a);
      const extract = firstParagraph(page?.extract);
      const title = page?.title || "";
      /* the same name, or a name Wikipedia itself sends to that article — "Vasily
         Kandinsky" arrives at "Wassily Kandinsky" — and an article about an artist */
      const shared = tokens(row.a).some((t) => t.length >= 4 && tokens(title).includes(t));
      const named = page && (sameName(title, row.a) || (fold(title) !== fold(row.a) && shared));
      const aboutArt = ARTIST_WORDS.test(page?.description || "") || ARTIST_WORDS.test(extract.split(". ")[0]);
      if (!page || extract.length < 40 || !named || !aboutArt || /may refer to/i.test(extract)) {
        progress[key] = { none: 1 };
        continue;
      }
      const url = `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`;
      progress[key] = { en: extract, s: url };
      const koTitle = page.langlinks?.find((l) => l.lang === "ko")?.title;
      if (koTitle) koAsk.push({ key, koTitle });
    }
    if (koAsk.length) {
      const koPages = await queryTitles("ko", koAsk.map((k) => k.koTitle));
      for (const { key, koTitle } of koAsk) {
        const koText = firstParagraph(koPages.get(koTitle)?.extract);
        if (koText.length >= 20 && /[가-힣]/.test(koText)) {
          progress[key] = { t: koText, s: `https://ko.wikipedia.org/wiki/${encodeURIComponent(koTitle.replace(/ /g, "_"))}`, o: "ko" };
        }
      }
    }
    done += chunk.length;
    saveProgress();
    const values = Object.values(progress);
    process.stdout.write(`\r  articles: ${done}/${pending.length} · Korean ${values.filter((v) => v.o === "ko").length} · to translate ${values.filter((v) => v.en).length} · none ${values.filter((v) => v.none).length}`);
    await sleep(100);
  }
}));
saveProgress();
console.log();

/* ── 2: into Korean ──────────────────────────────────────────────── */
const PROMPT = `너는 한국어 미술 백과사전의 편집자다. 아래 JSON 배열의 각 영어 문단(t)을 한국어로 옮겨, 같은 k를 가진 {"k","ko"} 객체의 JSON 배열로만 답하라.

지킬 것:
- 백과사전 평서체(~이다, ~했다). 한국어로 처음 쓴 글처럼 읽혀야 한다.
- 사실을 더하거나 빼지 않는다. 연도·지명·기관명·작품명은 그대로 옮긴다.
- 번역투를 쓰지 않는다: 문장마다 '그는/그녀는'을 되풀이하지 않고, '및', '~에 대해', '~를 통해', '~로서의', '~적인' 남발, '가장 ~한 것 중 하나'를 피한다.
- 인명·지명은 국립국어원 외래어 표기법을 따른다. 작가 이름은 첫 문장에서만 한국어 표기 뒤 괄호에 원어를 쓴다. 예: "쿠노 아미에(Cuno Amiet)는 스위스의 화가이다."
- 작품명은 널리 쓰이는 한국어 제목이 있으면 쓰고, 없으면 원제를 그대로 둔다.
- 한 문장이 너무 길면 나눈다.`;

async function translate(items) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_KEY}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `${PROMPT}\n\n${JSON.stringify(items)}` }] }],
          generationConfig: { responseMimeType: "application/json", temperature: 0.2 },
        }),
      });
      if (res.status === 429 || res.status >= 500) { await sleep(8000 * (attempt + 1)); continue; }
      if (!res.ok) { console.warn(`\n  gemini ${res.status}: ${(await res.text()).slice(0, 160)}`); return []; }
      const data = await res.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "[]";
      const rows = JSON.parse(text);
      return Array.isArray(rows) ? rows : [];
    } catch (error) {
      await sleep(4000 * (attempt + 1));
    }
  }
  return [];
}

/* "(1868년 3월 28일 – 1961년 7월 6일, Cuno Amiet)" is how a translation renders
   "Cuno Amiet (28 March 1868 – 6 July 1961)": the dates first, in full, the name
   pushed behind them. Korean puts the name first and keeps the years alone. */
const FLIPPED_PAREN = /^([^(]{0,40})\(\s*(\d[^)A-Za-z]*?)\s*,\s*([^)]*\p{Lu}[^)]*)\)/u;
const yearsOf = (dates) => {
  const years = [...dates.matchAll(/\d{3,4}/g)].map((m) => m[0]);
  if (years.length === 0) return "";
  if (years.length === 1) return /생|출생|태생/.test(dates) ? `${years[0]}년생` : `${years[0]}년`;
  return `${years[0]}\u2013${years[years.length - 1]}`;
};
const nameFirst = (text) => String(text).replace(FLIPPED_PAREN, (whole, before, dates, name) => {
  const years = yearsOf(dates);
  return years ? `${before}(${name.trim().replace(/\s+/g, " ")}, ${years})` : whole;
});

/* "및" belongs to notices and contracts, not to prose; Korean joins two nouns
   with 와 after a vowel and 과 after a consonant. Left alone where the word
   after it already carries one ("멕시코와"), which would give two in a row. */
const JOINED_BY_MIT = /([\uac00-\ud7a3]+)\s및\s(?=[\uac00-\ud7a3])/g;
const plainJoin = (text) => String(text).replace(JOINED_BY_MIT, (whole, before, offset, full) => {
  const after = (full.slice(offset + whole.length).match(/^[\uac00-\ud7a3]+/) || [""])[0];
  const code = (before.at(-1) || "").charCodeAt(0) - 0xac00;
  if (code < 0 || code >= 11172 || /[와과]$/.test(after)) return whole;
  return `${before}${code % 28 ? "과" : "와"} `;
});

/* The app writes a life span as "1840–1926" and a living artist as "1964년생"
   (the line under the name in GlobalSearchBar). A translation writes the same
   thing a dozen ways — full dates, a birthplace, a tilde, a hyphen, and now and
   then a sentence that was cut off mid-date — so the first parenthesis is put
   into that form: whatever names the artist, then the years and nothing else. */
/* one level of nesting: "(Bertalan Székely, 1835년 클루지(현 루마니아) 태생…)" */
const FIRST_PAREN = /^([^(]{0,40}\()((?:[^()]|\([^()]*\))*)(\))/;
/* 경 only counts after a year — "1530년경", not the 경 in "풍경" */
const CIRCA = /\bc\.|\bca\.|circa|\d\s*년?\s*경|무렵/;
const plainYears = (text) => String(text).replace(FIRST_PAREN, (whole, open, inside, close) => {
  const split = inside.match(/^(.*?)((?:c\.\s*|ca\.\s*|약\s*)?\d{3,4}\D.*)$/s);
  if (!split) return whole;
  const [, named, dated] = split;
  /* a name may not end mid-word: "Alex Katz, " yes, "1927" no */
  if (named && !/[,(]\s*$/.test(named)) return whole;
  const years = [...dated.matchAll(/\d{3,4}/g)].map((m) => m[0]).filter((y) => Number(y) <= new Date().getFullYear());
  if (years.length === 0) return whole;
  /* "?-1896" is a death year with no birth: one year, but not a birth year */
  if (years.length === 1 && /[?？]|[-–—~]\s*\d{3,4}/.test(dated)) return whole;
  const circa = CIRCA.test(dated) ? "년경" : "";
  const span = years.length > 1
    ? `${years[0]}${circa}–${years[years.length - 1]}`
    : `${years[0]}${circa ? `${circa}생` : "년생"}`;
  return `${open}${named}${span}${close}`;
});

/* The first parenthesis carries the name as the artist's own language writes
   it — "쿠노 아미에트(Cuno Amiet, 1868–1961)". A rewrite sometimes drops it and
   leaves the years alone; the article the text came from has it. */
const YEARS_ONLY = /^([^(]{0,40}\()(\d(?:[^()]|\([^()]*\))*)(\))/;
const titleOf = (source) => {
  const last = String(source || "").split("/").pop() || "";
  let name = last;
  try { name = decodeURIComponent(last); } catch { /* keep as is */ }
  return name.replace(/_/g, " ").replace(/\s*\([^)]*\)\s*$/, "").trim();
};
const nameInParen = (text, source) => {
  const name = titleOf(source);
  if (!name || !/[A-Za-z]/.test(name)) return text;
  return String(text).replace(YEARS_ONLY, (whole, open, years, close) =>
    (/[A-Za-z]/.test(years) ? whole : `${open}${name}, ${years}${close}`));
};


/* the habits a translation carries over that a Korean reader would not write */
const tidy = (text, source) => nameInParen(plainYears(plainJoin(nameFirst(text))), source);

/* Korean from elsewhere: the same checks the Gemini answers get */
const accept = (key, ko) => {
  const entry = progress[key];
  const text = String(ko || "").trim();
  if (!entry?.en || !/[가-힣]/.test(text) || text.length < entry.en.length * 0.25) return false;
  progress[key] = { t: tidy(text, entry.s), s: entry.s, o: "en" };
  return true;
};
if (mergeArg > -1) {
  const dir = process.argv[mergeArg + 1];
  let kept = 0;
  let refused = 0;
  const walk = (folder) => {
    for (const name of fs.readdirSync(folder)) {
      const full = path.join(folder, name);
      if (fs.statSync(full).isDirectory()) { walk(full); continue; }
      if (!/out-.*\.json$/.test(name)) continue;
      let rows = [];
      try { rows = JSON.parse(fs.readFileSync(full, "utf8")); } catch { console.warn(`  unreadable ${full}`); continue; }
      for (const row of Array.isArray(rows) ? rows : []) (accept(row?.k, row?.ko) ? kept += 1 : refused += 1);
    }
  };
  walk(dir);
  saveProgress();
  console.log(`merged ${kept} translations from ${dir} (${refused} refused or already done)`);
}

if (polishArg > -1) {
  const dir = process.argv[polishArg + 1];
  let kept = 0;
  let refused = 0;
  for (const name of fs.readdirSync(dir)) {
    if (!/^out-.*\.json$/.test(name)) continue;
    let rows = [];
    try { rows = JSON.parse(fs.readFileSync(path.join(dir, name), "utf8")); } catch { continue; }
    for (const row of Array.isArray(rows) ? rows : []) {
      const entry = progress[row?.k];
      const text = String(row?.ko || "").trim();
      /* an edit of the same paragraph, not a summary of it and not a new one */
      const sane = entry?.t && /[가-힣]/.test(text) && text.length > entry.t.length * 0.6 && text.length < entry.t.length * 1.8;
      if (!sane) { refused += 1; continue; }
      progress[row.k] = { ...entry, t: tidy(text, entry.s) };
      kept += 1;
    }
  }
  saveProgress();
  console.log(`polished ${kept} texts from ${dir} (${refused} left as they were)`);
}

/* tidy() only runs as a text is stored, so a rule added later would reach the
   ones written before it. This puts every translation through the current rules. */
if (process.argv.includes("--tidy")) {
  let changed = 0;
  for (const entry of Object.values(progress)) {
    if (entry?.o !== "en" || !entry.t) continue;
    const after = tidy(entry.t, entry.s);
    if (after === entry.t) continue;
    entry.t = after;
    changed += 1;
  }
  saveProgress();
  console.log(`tidied ${changed} texts`);
}


const waiting = SKIP_TRANSLATE ? [] : Object.entries(progress).filter(([, v]) => v.en).map(([k, v]) => ({ k, t: v.en }));
const batches = [];
for (let i = 0; i < waiting.length; i += BATCH) batches.push(waiting.slice(i, i + BATCH));
let translated = 0;
let rejected = 0;
const batchQueue = [...batches];
await Promise.all(Array.from({ length: 4 }, async () => {
  while (batchQueue.length) {
    const batch = batchQueue.shift();
    const rows = await translate(batch);
    for (const row of rows) {
      /* Korean, and about as long as what it came from — not a summary of it */
      if (accept(row?.k, row?.ko)) translated += 1; else rejected += 1;
    }
    saveProgress();
    process.stdout.write(`\r  translated ${translated}/${waiting.length} · rejected ${rejected}`);
  }
}));
console.log();

/* ── 3: the shards the app reads ─────────────────────────────────── */
fs.mkdirSync(OUT, { recursive: true });
const shards = new Map();
for (const [key, value] of Object.entries(progress)) {
  if (!value.t) continue;
  const shard = artistShardOf(key);
  if (!shards.has(shard)) shards.set(shard, {});
  shards.get(shard)[key] = { t: value.t, s: value.s, o: value.o };
}
for (const file of fs.readdirSync(OUT)) fs.unlinkSync(path.join(OUT, file));
for (const [shard, content] of shards) fs.writeFileSync(path.join(OUT, `${shard}.json`), JSON.stringify(content));
const values = Object.values(progress);
console.log(`artists ${values.length}: Korean article ${values.filter((v) => v.o === "ko").length}, translated ${values.filter((v) => v.o === "en").length}, still English ${values.filter((v) => v.en).length}, no article ${values.filter((v) => v.none).length}; ${shards.size} shard files`);
