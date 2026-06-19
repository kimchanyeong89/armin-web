import { useEffect, useRef, useState, lazy, Suspense, type ReactNode } from "react";
import { geoOrthographic, geoDistance } from "d3-geo";
import { Search as SearchIcon, Palette, Calendar, MapPin, User, ListMusic, Bookmark, Sparkles } from "lucide-react";
import { onAuthStateChanged } from "firebase/auth";
import { collection, getCountFromServer, getDocs, limit, orderBy, query } from "firebase/firestore";
import { exhibitions } from "../data/exhibitions";
import { auth, db } from "../firebase";
import BottomPageNavigator from "./BottomPageNavigator";
// The artist page's distribution uses the REAL world map (lazy, same component the live page renders).
const ArtistDistributionMap = lazy(() => import("./ArtistDistributionMap"));
// Donut palette + chart, lifted verbatim from the live artist page so the design framework matches.
const DONUT_COLORS = ["#d4a547", "#f0c878", "#a07028", "#f5dca6", "#6b4514", "#e8b85f", "#fae8c4", "#3f2906"];
function Donut({ data }: { data: { name: string; count: number }[] }) {
  const cx = 56, cy = 56, outerR = 44, innerR = 26;
  const total = data.reduce((s, d) => s + d.count, 0) || 1;
  const toXY = (a: number, r: number) => ({ x: cx + r * Math.sin((a * Math.PI) / 180), y: cy - r * Math.cos((a * Math.PI) / 180) });
  const arc = (a1: number, a2: number) => {
    const p1o = toXY(a1, outerR), p2o = toXY(a2, outerR), p1i = toXY(a1, innerR), p2i = toXY(a2, innerR);
    const large = a2 - a1 > 180 ? 1 : 0, f = (n: number) => n.toFixed(2);
    return `M${f(p1o.x)},${f(p1o.y)} A${outerR},${outerR} 0 ${large} 1 ${f(p2o.x)},${f(p2o.y)} L${f(p2i.x)},${f(p2i.y)} A${innerR},${innerR} 0 ${large} 0 ${f(p1i.x)},${f(p1i.y)} Z`;
  };
  let cum = 0;
  const segs = data.slice(0, 8).map((d, i) => { const span = (d.count / total) * 360, a1 = cum, a2 = cum + span; cum += span; return { a1, a2, color: DONUT_COLORS[i % DONUT_COLORS.length] }; });
  const single = segs.length === 1 && Math.abs(segs[0].a2 - segs[0].a1 - 360) < 0.01;
  return (
    <svg width="92" height="92" viewBox="0 0 112 112" style={{ flexShrink: 0 }}>
      {single
        ? (<><circle cx={cx} cy={cy} r={outerR} fill={segs[0].color} stroke="#111" strokeWidth="1.5" /><circle cx={cx} cy={cy} r={innerR} fill="#0f0f0f" stroke="#111" strokeWidth="1.5" /></>)
        : segs.map((s, i) => <path key={i} d={arc(s.a1, s.a2)} fill={s.color} stroke="#111" strokeWidth="1.5" />)}
      {!single && 360 - cum > 0.5 && <path d={arc(cum, 360)} fill="#222" stroke="#111" strokeWidth="1.5" />}
      <text x={cx} y={cy + 5} textAnchor="middle" fontSize="16" fontWeight="700" fill="#fff" fontFamily="system-ui,sans-serif">{total >= 1000 ? `${(total / 1000).toFixed(1)}k` : total}</text>
    </svg>
  );
}

// Wordmark font — single source of truth. Marcellus = refined classical caps.
const FONT = "'Marcellus', 'Times New Roman', serif";
const GOLD = "#D4A547";

// `kind` selects which built design-mockup of the real tab to show behind the caption.
export type IntroStep = { kind: "community" | "ai" | "weekly" | "profile" | "search" | "artist"; title: string; body: string };

// ── lightweight design-mockups of each tab (instead of screenshots): the real layout,
//    placeholder art, real type/colour tokens — recognisable at a glance, never overlapping
//    the caption (they live in the clear band below it). ──
const CREAM = "#f4eeda", MUT = "#cbc3b0", DIM = "rgba(203,195,176,0.5)";
const CARD = { background: "rgba(255,255,255,0.035)", border: "1px solid rgba(212,165,71,0.14)", borderRadius: 14 } as const;
const ART = { background: "linear-gradient(135deg, rgba(212,165,71,0.18), rgba(255,255,255,0.05) 55%, rgba(212,165,71,0.05))", borderRadius: 10 } as const;
const MONO = { fontFamily: "'Space Mono', monospace", letterSpacing: ".13em" } as const;
// Real artwork images (R2). AI grid = recognisable, popular pieces; weekly = Hodler's Lake Thun
// series for the real "호수와 평행" (lake & parallel) curation.
const R2 = "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/artworks/";
const AI_ART: { k: string; pct?: number }[] = [
  { k: "aic-collection/20545-4aca4e10-imageUrl.webp", pct: 96 },               // Monet — Belle-Île
  { k: "met-ny-collection/437880-3e464bc6-image.webp", pct: 92 },              // Vermeer — Woman with a Lute
  { k: "famsf-collections/yoshida-on-the-tokaido-from-th-483821f5-imageUrl.webp", pct: 89 }, // Hokusai
  { k: "vangogh-museum-collection/d0425V1962-60ee14d5-imageUrl.webp" },        // Van Gogh
  { k: "munch-collection/munch-MM-M-00295-7924fb1b-image.webp" },              // Munch
  { k: "agnsw-collection/agnsw-1721985-8c8cde13-image.webp" },                 // Klimt
];
const WK_ART: { k: string; tag: string; title: string }[] = [
  { k: "mah-collection/176649-007f0aef-image.webp", tag: "2026 · WEEK 21", title: "끝까지 바라본 호수" },
  { k: "mah-collection/91269-c1aed9b2-image.webp", tag: "2026 · WEEK 20", title: "겨울의 슈토크호른" },
  { k: "mah-collection/89389-c0fa32f0-image.webp", tag: "SPECIAL", title: "호숫가의 샬레" },
];
// Artist page (reached from search): a real artist + their works, for the "artist" tour step.
const ARTIST = {
  name: "Claude Monet",
  meta: "1840–1926 · 프랑스 · 인상주의",
  bio: "빛과 대기의 순간을 평생 좇은 인상주의의 창시자. 같은 풍경을 시간과 계절에 따라 반복해 그리며, 빛의 변화 그 자체를 화폭에 기록했습니다.",
  works: 294, museums: 48,
  dist: [["The Art Institute of Chicago", 46], ["National Gallery of Art", 29], ["Philadelphia Museum of Art", 23], ["National Gallery", 20]] as [string, number][],
  imgs: [
    "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/artworks/aic-collection/20545-4aca4e10-imageUrl.webp",
    "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/artworks/kunsthaus-collection/kunsthaus-586962-96a82d53-image.webp",
    "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/national-gallery/collection/claude-monet-bathers-at-la-grenouillere.webp",
    "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/artworks/philadelphia-collection/W1921-1-5-e61ff486-image.webp",
    "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/artworks/rouen-mba-collection/rouen-133-3c5d3d97-imageUrl.webp",
    "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/artworks/vangogh-museum-collection/s0530N2012-01e4f426-imageUrl.webp",
  ],
};
function Chip({ children, on }: { children: ReactNode; on?: boolean }) {
  return <span style={{ ...MONO, fontSize: 11, padding: "6px 13px", borderRadius: 999, whiteSpace: "nowrap", background: on ? GOLD : "rgba(255,255,255,0.05)", color: on ? "#19130a" : "rgba(243,238,223,0.6)", border: on ? "none" : "1px solid rgba(255,255,255,0.08)" }}>{children}</span>;
}
function TabMock({ kind, likedImgs, profile, artistData }: { kind: IntroStep["kind"]; likedImgs: string[]; profile: { stats: Record<string, number>; playlists: { name: string; count: number }[] } | null; artistData: { artworks: { museumName: string }[]; musArr: { name: string; count: number; pct: number }[] } | null }) {
  if (kind === "community") {
    const posts = [["보스턴에서 본 사전트", "빛을 다루는 방식이 달랐다 · 미술관찬"], ["전시 후기 — 모네와 빛", "워싱턴 내셔널 갤러리 · 김세아"], ["요즘 다시 보는 페르메이르", "고요함의 정체에 대하여 · 기체"]];
    return (
      <div style={{ width: "100%", maxWidth: 760, display: "flex", flexDirection: "column", gap: 13 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{["리뷰", "뉴스", "토론", "인터뷰", "질문"].map((c, i) => <Chip key={c} on={i === 0}>{c}</Chip>)}</div>
        {posts.map((p, i) => (
          <div key={i} style={{ ...CARD, display: "flex", gap: 14, padding: 13, alignItems: "center" }}>
            <div style={{ ...ART, width: 58, height: 58, flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ ...MONO, fontSize: 9.5, color: GOLD, marginBottom: 5 }}>REVIEW</div>
              <div style={{ fontFamily: FONT, fontSize: 16, color: CREAM, marginBottom: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p[0]}</div>
              <div style={{ fontSize: 12, color: DIM, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p[1]}</div>
            </div>
            <div style={{ ...MONO, fontSize: 11, color: DIM, display: "flex", gap: 11, flexShrink: 0 }}><span>♡ {3 + i * 4}</span><span>☐ {i}</span></div>
          </div>
        ))}
      </div>
    );
  }
  if (kind === "ai") {
    // Recommendations consistent with the viewer's taste — the signed-in user's own likes when available,
    // else a curated set. EVERY cell carries a match score so the grid reads as AI recommendations.
    const PCT = [98, 95, 93, 90, 87, 84];
    const srcs = (likedImgs.length >= 3 ? likedImgs : AI_ART.map((a) => R2 + a.k)).slice(0, 6);
    return (
      <div style={{ width: "100%", maxWidth: 560, display: "flex", flexDirection: "column", gap: 16, alignItems: "center" }}>
        <div style={{ ...MONO, fontSize: 11, color: GOLD }}>✦ FOR YOU · 취향 기반 추천</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 11, width: "100%" }}>
          {srcs.map((src, i) => (
            <div key={i} style={{ ...ART, aspectRatio: "1 / 1", position: "relative", overflow: "hidden" }}>
              <img src={src} alt="" loading="eager" onError={(e) => { e.currentTarget.style.display = "none"; }} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
              <span style={{ position: "absolute", top: 7, right: 7, ...MONO, fontSize: 9, padding: "3px 7px", borderRadius: 999, background: "rgba(12,11,9,0.78)", color: GOLD, border: "1px solid rgba(212,165,71,0.5)" }}>{PCT[i]}% 매치</span>
            </div>
          ))}
        </div>
        <div style={{ width: "100%", textAlign: "center", padding: "13px", borderRadius: 999, background: GOLD, fontFamily: FONT, fontSize: 15, color: "#19130a" }}>이 취향에 맞는 작품 더 보기 →</div>
      </div>
    );
  }
  if (kind === "weekly") {
    return (
      <div style={{ width: "100%", maxWidth: 820, display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", gap: 10 }}>
          {WK_ART.map((c, i) => (
            <div key={i} style={{ ...CARD, flex: 1, padding: 0, overflow: "hidden", outline: i === 0 ? `1px solid ${GOLD}` : "none" }}>
              <div style={{ ...ART, height: 84, borderRadius: 0, position: "relative", overflow: "hidden" }}>
                <img src={R2 + c.k} alt="" loading="eager" onError={(e) => { e.currentTarget.style.display = "none"; }} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
              </div>
              <div style={{ padding: "9px 11px" }}><div style={{ ...MONO, fontSize: 9, color: GOLD, marginBottom: 4 }}>{c.tag}</div><div style={{ fontFamily: FONT, fontSize: 13.5, color: CREAM }}>{c.title}</div></div>
            </div>
          ))}
        </div>
        <div style={{ ...CARD, display: "flex", gap: 16, padding: 16 }}>
          <div style={{ width: 132, flexShrink: 0, ...ART, borderRadius: 8, position: "relative", overflow: "hidden", alignSelf: "stretch", minHeight: 132 }}>
            <img src={R2 + WK_ART[0].k} alt="" loading="eager" onError={(e) => { e.currentTarget.style.display = "none"; }} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <span style={{ ...MONO, fontSize: 10, color: "#19130a", background: GOLD, padding: "3px 8px", borderRadius: 4 }}>WEEKLY CURATION</span>
            <div style={{ fontFamily: FONT, fontSize: 24, color: CREAM, margin: "11px 0 6px" }}>그가 끝까지 바라본 호수</div>
            <div style={{ fontSize: 12.5, color: MUT, lineHeight: 1.65 }}>페르디낭 호들러가 죽음을 앞두고 매일 같은 자리에서 그린 레만 호수. 물과 먼 산이 수평의 운율로 포개진 연작을 한자리에 모았습니다.</div>
          </div>
          <div style={{ width: 132, flexShrink: 0, borderLeft: "1px solid rgba(212,165,71,0.14)", paddingLeft: 16, display: "flex", flexDirection: "column", gap: 11 }}>
            {[["에디터", "최유나"], ["테마", "호수와 평행"], ["작품", "12점"]].map((r) => (
              <div key={r[0]}><div style={{ ...MONO, fontSize: 9, color: DIM, marginBottom: 3 }}>{r[0]}</div><div style={{ fontFamily: FONT, fontSize: 14, color: CREAM }}>{r[1]}</div></div>
            ))}
          </div>
        </div>
      </div>
    );
  }
  if (kind === "profile") {
    const imgs = likedImgs.length >= 3 ? likedImgs : AI_ART.map((a) => R2 + a.k);
    const gridImgs = imgs.length >= 11 ? imgs.slice(6, 11) : imgs.slice(0, 5); // differ from the AI grid
    // Mirror the REAL MyPage: the same 6 saved categories WITH their icons, the user's real playlists when signed in.
    const stats: [typeof Palette, string, number | string][] = profile
      ? [[Palette, "작품", profile.stats.작품], [Calendar, "전시", profile.stats.전시], [MapPin, "미술관", profile.stats.미술관], [User, "작가", profile.stats.작가], [ListMusic, "플레이리스트", profile.stats.플레이리스트], [Bookmark, "큐레이션", profile.stats.큐레이션]]
      : [[Palette, "작품", 724], [Calendar, "전시", 36], [MapPin, "미술관", 9], [User, "작가", 11], [ListMusic, "플레이리스트", 2], [Bookmark, "큐레이션", 1]];
    const pls = (profile && profile.playlists.length ? profile.playlists : [{ name: "내 플레이리스트", count: 12 }, { name: "다시 보고 싶은", count: 8 }]).slice(0, 2);
    return (
      <div style={{ width: "100%", maxWidth: 760, display: "flex", flexDirection: "column", gap: 16 }}>
        {/* My Playlists — square cover + name + items below, exactly like the real page */}
        <div>
          <div style={{ ...MONO, fontSize: 10, color: GOLD, marginBottom: 11 }}>MY PLAYLISTS · 내 플레이리스트</div>
          <div style={{ display: "flex", gap: 14 }}>
            {pls.map((p, i) => (
              <div key={i} style={{ width: 132, display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ ...ART, width: 132, height: 132, position: "relative", overflow: "hidden", borderRadius: 12 }}>
                  <img src={imgs[i % imgs.length]} alt="" loading="eager" onError={(e) => { e.currentTarget.style.display = "none"; }} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
                  <span style={{ position: "absolute", right: 8, bottom: 8, width: 26, height: 26, borderRadius: 999, background: "rgba(12,11,9,0.7)", color: CREAM, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10 }}>▶</span>
                </div>
                <div><div style={{ fontFamily: FONT, fontSize: 15, color: CREAM, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</div><div style={{ ...MONO, fontSize: 9, color: DIM, marginTop: 2 }}>{p.count} ITEMS</div></div>
              </div>
            ))}
          </div>
        </div>
        {/* the 6 saved-category tabs WITH icons, as on the real MyPage */}
        <div style={{ ...CARD, display: "flex", justifyContent: "space-around", padding: "14px 4px" }}>
          {stats.map(([Ic, label, n]) => (
            <div key={label} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5 }}>
              <div style={{ fontFamily: FONT, fontSize: 20, color: CREAM }}>{n}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 4, ...MONO, fontSize: 8, color: DIM }}><Ic size={10} strokeWidth={1.9} /> {label}</div>
            </div>
          ))}
        </div>
        {/* the artwork grid with the real sort tabs */}
        <div>
          <div style={{ display: "flex", gap: 16, marginBottom: 11 }}>
            {[["최신순", true], ["오래된순", false], ["연도순", false]].map(([s, on]) => (
              <span key={s as string} style={{ ...MONO, fontSize: 10, color: on ? GOLD : DIM }}>{s}</span>
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 8 }}>
            {gridImgs.map((src, i) => (
              <div key={i} style={{ ...ART, aspectRatio: "1 / 1", position: "relative", overflow: "hidden" }}>
                <img src={src} alt="" loading="eager" onError={(e) => { e.currentTarget.style.display = "none"; }} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }
  if (kind === "artist") {
    const maxc = ARTIST.dist[0][1];
    const dist = artistData ? artistData.musArr : ARTIST.dist.map(([name, count]) => ({ name, count, pct: Math.round((count / maxc) * 100) }));
    return (
      <div style={{ width: "100%", maxWidth: 780, display: "flex", flexDirection: "column", gap: 13 }}>
        {/* header — artist name + "N 점 소장" (works in collection), exactly like the real artist page */}
        <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
          <div style={{ fontFamily: FONT, fontSize: 27, color: CREAM }}>{ARTIST.name}</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 5 }}><span style={{ fontFamily: FONT, fontSize: 19, color: GOLD }}>{ARTIST.works}</span><span style={{ ...MONO, fontSize: 9, color: DIM }}>점 소장</span></div>
          <div style={{ ...MONO, fontSize: 9, color: DIM }}>· {ARTIST.meta}</div>
        </div>
        {/* biography (the Infinite Wiki / ArtistWikiPanel content) */}
        <div style={{ fontSize: 12.5, color: MUT, lineHeight: 1.6, maxWidth: 640 }}>{ARTIST.bio}</div>
        {/* 전 세계 분포 — the LIVE artist page's exact framework: a bordered card with the world map
            on top and a by-museum donut + legend below. */}
        <div>
          <div style={{ ...MONO, fontSize: 9.5, color: GOLD, marginBottom: 8 }}>전 세계 분포 · GLOBAL DISTRIBUTION</div>
          <div style={{ borderRadius: 10, overflow: "hidden", border: "1px solid rgba(212,165,71,0.18)", display: "flex", flexDirection: "column" }}>
            <div style={{ height: 124, width: "100%", overflow: "hidden" }}>
              {artistData ? (
                <Suspense fallback={<div style={{ height: 124, display: "flex", alignItems: "center", justifyContent: "center", color: DIM, fontSize: 11 }}>지도 불러오는 중…</div>}>
                  <ArtistDistributionMap artworks={artistData.artworks as never} isDark hideLegend mapHeight="124px" />
                </Suspense>
              ) : <div style={{ ...ART, height: 124, borderRadius: 0 }} />}
            </div>
            <div style={{ borderTop: "1px solid rgba(212,165,71,0.14)", background: "#0f0f0f", padding: "10px 14px" }}>
              <div style={{ ...MONO, fontSize: 9, color: DIM, marginBottom: 7 }}>미술관별 소장 분포 · BY MUSEUM</div>
              <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
                <Donut data={dist} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  {dist.slice(0, 5).map((d, i) => (
                    <div key={d.name} style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 5 }}>
                      <div style={{ width: 9, height: 9, borderRadius: 1, background: DONUT_COLORS[i % DONUT_COLORS.length], flexShrink: 0 }} />
                      <span style={{ flex: 1, minWidth: 0, fontSize: 11, color: CREAM, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.name}</span>
                      <span style={{ fontSize: 11, color: GOLD, fontWeight: 700, flexShrink: 0 }}>{d.pct}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
        {/* 전체 작품 — the all-works gallery */}
        <div>
          <div style={{ ...MONO, fontSize: 9.5, color: GOLD, marginBottom: 10 }}>전체 작품 · ALL WORKS {ARTIST.works}점</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(6,1fr)", gap: 7 }}>
            {ARTIST.imgs.map((src, i) => (
              <div key={i} style={{ ...ART, aspectRatio: "1 / 1", position: "relative", overflow: "hidden" }}>
                <img src={src} alt="" loading="eager" onError={(e) => { e.currentTarget.style.display = "none"; }} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }
  // search — natural-language AI search: show HOW to use it
  return (
    <div style={{ width: "100%", maxWidth: 640, display: "flex", flexDirection: "column", gap: 18 }}>
      {/* search bar with the real AI toggle (gold pill on the right, exactly as in the live search bar) */}
      <div style={{ ...CARD, display: "flex", alignItems: "center", gap: 12, padding: "14px 14px 14px 18px", border: "1.5px solid #B89438" }}>
        <SearchIcon size={18} color={DIM} strokeWidth={1.8} />
        <span style={{ flex: 1, fontFamily: FONT, fontSize: 16, color: DIM, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>“고요한 푸른 바다 풍경”…</span>
        <span style={{ display: "flex", alignItems: "center", gap: 4, fontFamily: "'Inter', Arial, sans-serif", fontSize: 11, fontWeight: 600, padding: "5px 12px", borderRadius: 50, background: "#c9a55a", color: "#111111", flexShrink: 0 }}><Sparkles size={12} strokeWidth={2.4} /> AI</span>
      </div>
      <div>
        <div style={{ ...MONO, fontSize: 10, color: GOLD, marginBottom: 11 }}>이렇게 물어보세요 · AI가 분위기로 찾아드려요</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 9 }}>
          {["고요한 푸른 바다 풍경", "강렬한 원색의 추상", "비 오는 도시의 밤", "황금빛 가을 들판", "사색에 잠긴 초상"].map((q) => (
            <span key={q} style={{ ...CARD, fontFamily: FONT, fontSize: 14, color: CREAM, padding: "9px 15px", borderRadius: 999, whiteSpace: "nowrap" }}>“{q}”</span>
          ))}
        </div>
      </div>
      <div style={{ fontSize: 12.5, color: DIM, lineHeight: 1.7 }}>작가·미술관·작품 키워드로도 찾고, 작가를 누르면 그 작가의 갤러리·분포로 이어집니다.</div>
    </div>
  );
}

/**
 * First-visit cinematic intro. Opens with a live ARMIN title + the real home
 * globe: ARMIN shatters into particles that fly to the museum positions and
 * SETTLE there as small persistent dots (the museums stay on the globe). Then it
 * CROSS-FADES through built design-mockups of each tab (community / ai / weekly /
 * search) — recognisable layouts with placeholder art, shown in the clear band
 * below the caption so the explanation never overlaps them. No router navigation,
 * no screenshots. The intro draws its OWN global navigator, highlights the current
 * tab, and lets the viewer click a tab to JUMP to its intro. Fades out to the live app.
 */
export default function CinematicIntro({ onDone, tourSteps }: { onDone: () => void; tourSteps: IntroStep[] }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const topScrimRef = useRef<HTMLDivElement>(null);
  const capRef = useRef<HTMLDivElement>(null);
  const mockRefs = useRef<(HTMLDivElement | null)[]>([]);
  const jumpRef = useRef<{ map: () => void; step: (i: number) => void } | null>(null);
  const [navIndex, setNavIndex] = useState(0); // active tab for the embedded real navigator
  const [navShown, setNavShown] = useState(false);
  const [likedImgs, setLikedImgs] = useState<string[]>([]); // the signed-in user's own liked artworks
  const [profile, setProfile] = useState<{ stats: Record<string, number>; playlists: { name: string; count: number }[] } | null>(null);
  const [artistData, setArtistData] = useState<{ artworks: { museumName: string }[]; musArr: { name: string; count: number; pct: number }[] } | null>(null);
  const skipRef = useRef(false);
  const finishedRef = useRef(false);
  const onDoneRef = useRef(onDone);
  const stepsRef = useRef(tourSteps);
  onDoneRef.current = onDone; stepsRef.current = tourSteps;

  // Fill the MyPage mock with the signed-in user's REAL liked artworks, playlists and counts.
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user || user.isAnonymous) return; // only the real signed-in user has likes/playlists
      const base = `users/${user.uid}`;
      const count = async (c: string) => { try { return (await getCountFromServer(collection(db, `${base}/${c}`))).data().count; } catch { return 0; } };
      try {
        const snap = await getDocs(query(collection(db, `${base}/liked_artworks`), limit(80)));
        // Sort by likedAt DESC so the grid matches what the user sees at the TOP of their MyPage
        // (the "Latest" order) — i.e. their most-recently-liked artworks, not an arbitrary first-N.
        const toMs = (v: any): number => v?.toMillis?.() ?? (typeof v?.seconds === "number" ? v.seconds * 1000 : (Number.isFinite(new Date(v).getTime()) ? new Date(v).getTime() : 0));
        const rows: { img: string; t: number }[] = [];
        snap.forEach((d) => { const x = d.data() as Record<string, any>; const img = (x.image || x.i || x.imageUrl) as string | undefined; if (img && String(img).startsWith("http")) rows.push({ img: String(img), t: toMs(x.likedAt) }); });
        rows.sort((a, b) => b.t - a.t);
        if (rows.length >= 3) setLikedImgs(rows.map((r) => r.img).slice(0, 12));
      } catch { /* keep fallback */ }
      try {
        const plSnap = await getDocs(query(collection(db, `${base}/playlists`), orderBy("createdAt", "desc"), limit(3)));
        const playlists = await Promise.all(plSnap.docs.map(async (d) => {
          const x = d.data() as Record<string, unknown>;
          return { name: String(x.name || x.title || "플레이리스트"), count: await count(`playlists/${d.id}/items`) };
        }));
        const [aw, ex, mu, ar, pl, cu] = await Promise.all([count("liked_artworks"), count("liked_exhibitions"), count("liked_museums"), count("liked_artists"), count("playlists"), count("saved_curations")]);
        setProfile({ stats: { 작품: aw, 전시: ex, 미술관: mu, 작가: ar, 플레이리스트: pl, 큐레이션: cu }, playlists });
      } catch { /* keep fallback */ }
    });
    return () => unsub();
  }, []);

  // Artist-page distribution data (public): build map artworks + a by-museum breakdown for the donut.
  useEffect(() => {
    fetch("/artists/monet.json").then((r) => r.json()).then((rows: { m?: string }[]) => {
      const artworks: { museumName: string }[] = [];
      const counts = new Map<string, number>();
      rows.forEach((w) => { const m = w.m; if (m) { artworks.push({ museumName: m }); counts.set(m, (counts.get(m) || 0) + 1); } });
      const total = artworks.length || 1;
      const musArr = Array.from(counts.entries()).map(([name, count]) => ({ name, count, pct: Math.round((count / total) * 100) })).sort((a, b) => b.count - a.count);
      if (artworks.length) setArtistData({ artworks, musArr });
    }).catch(() => { /* keep the static bars fallback */ });
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current, wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    (window as any).__arminHidePins = true;
    const TOUR = stepsRef.current;
    const TOTAL = 1 + TOUR.length;
    const MAP_STEP = { title: "지도 — 지구본 위의 미술관", body: "전 세계 미술관 260곳. 지구본의 점 하나를 누르면 그 미술관의 소장품이 열립니다." };

    let raf = 0, W = 0, H = 0, DPR = 1;
    let X: CanvasRenderingContext2D | null = null;
    let TXT: number[][] = [];
    let PIN: { x: number; y: number; n: number }[] = [];
    let P: { ox: number; oy: number; tx: number; ty: number; pin: number; delay: number; curve: number; cream: boolean }[] = [];
    let clock = performance.now(); // mutable so tab-clicks can rewind the timeline to a step

    const clusters: Record<string, { la: number; lo: number; n: number }> = {};
    (exhibitions as any[]).forEach((m) => {
      if (typeof m.latitude !== "number" || typeof m.longitude !== "number") return;
      const k = Math.round(m.latitude / 1.4) + "_" + Math.round(m.longitude / 1.4);
      if (!clusters[k]) clusters[k] = { la: m.latitude, lo: m.longitude, n: 0 };
      clusters[k].n++;
    });
    const CL = Object.keys(clusters).map((k) => clusters[k]);

    const isSmall = () => Math.min(window.innerWidth, window.innerHeight) < 620;
    function fit() {
      DPR = Math.min(window.devicePixelRatio || 1, 2);
      W = window.innerWidth; H = window.innerHeight;
      canvas!.width = W * DPR; canvas!.height = H * DPR;
      X = canvas!.getContext("2d");
      if (X) X.setTransform(DPR, 0, 0, DPR, 0, 0);
    }
    const R = () => Math.min(W, H) * 0.38;
    const proj = () => geoOrthographic().scale(R()).translate([W / 2, H / 2]).clipAngle(90).rotate([0, -20, 0]);
    function computePins() {
      PIN = [];
      const p = proj();
      CL.forEach((cl) => {
        if (geoDistance([cl.lo, cl.la], [0, 20]) > Math.PI / 2) return;
        const s = p([cl.lo, cl.la]); if (s) PIN.push({ x: s[0], y: s[1], n: cl.n });
      });
    }
    const wordScale = () => Math.min((W * 0.5) / 640, (H * 0.3) / 150, 1.05);
    function sampleWord() {
      const oc = document.createElement("canvas"), ww = 1000, hh = 320;
      oc.width = ww; oc.height = hh;
      const o = oc.getContext("2d"); if (!o) { TXT = []; return; }
      o.fillStyle = "#fff"; o.textAlign = "center"; o.textBaseline = "middle";
      try { (o as any).letterSpacing = "28px"; } catch { /* */ }
      o.font = "150px " + FONT;
      o.fillText("ARMIN", ww / 2, hh / 2);
      const d = o.getImageData(0, 0, ww, hh).data, pts: number[][] = [];
      for (let y = 0; y < hh; y += 3) for (let x = 0; x < ww; x += 3)
        if (d[(y * ww + x) * 4 + 3] > 120) pts.push([x - ww / 2 + (Math.random() - 0.5) * 2, y - hh / 2 + (Math.random() - 0.5) * 2]);
      TXT = pts;
    }
    function buildParticles() {
      computePins();
      const N = isSmall() ? 900 : 1700, sc = wordScale();
      P = [];
      for (let i = 0; i < N; i++) {
        const t = TXT.length ? TXT[i % TXT.length] : [0, 0];
        const pinIdx = PIN.length ? i % PIN.length : 0;
        const pin = PIN.length ? PIN[pinIdx] : { x: W / 2, y: H / 2, n: 1 };
        P.push({ ox: W / 2 + t[0] * sc, oy: H / 2 + t[1] * sc, tx: pin.x, ty: pin.y, pin: pinIdx, delay: Math.random() * 0.45, curve: (Math.random() - 0.5) * 90, cream: i % 5 === 0 });
      }
    }
    const ez = (p: number) => 1 - Math.pow(1 - p, 3);
    const ezIO = (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
    const cl01 = (v: number) => Math.max(0, Math.min(1, v));

    // ── timeline (ms) ──
    const T_TITLE = 300, T_RING = 2300;
    const T_REVEAL = 3000, D_REVEAL = 1500;
    const T_SHATTER = 4600, D_SCATTER = 3000;             // ARMIN bursts into particles → museum pins (done ~7600)
    const T_MAPCAP = 7700;                                 // caption appears once particles have settled into the REAL pins
    const T_TOUR = 12000, D_STEP = 5500, D_FADE = 1000;   // longer dwell: ~4s on the globe, then ~5.5s per tab
    const T_TOUR_END = T_TOUR + TOUR.length * D_STEP;
    const T_END = T_TOUR_END + 900;

    let curCap = "~";
    function setCap(id: string, stepNo: number, title: string, body: string) {
      if (id === curCap) return; curCap = id;
      if (capRef.current) capRef.current.innerHTML =
        '<div style="font-family:\'Space Mono\',monospace;font-size:11px;letter-spacing:.16em;color:#D4A547;margin-bottom:8px">STEP ' + stepNo + ' / ' + TOTAL + '</div>' +
        '<div style="font-family:' + FONT + ';font-size:clamp(22px,5vw,30px);color:#f4eeda;letter-spacing:.01em">' + title + '</div>' +
        '<div style="font-size:14px;color:#cbc3b0;margin-top:9px;max-width:520px;margin-left:auto;margin-right:auto;line-height:1.6">' + body + '</div>';
    }

    function finish() {
      if (finishedRef.current) return;
      finishedRef.current = true;
      (window as any).__arminHidePins = false;
      if (wrap) { wrap.style.transition = "opacity 0.6s ease"; wrap.style.opacity = "0"; }
      window.setTimeout(() => { cancelAnimationFrame(raf); onDoneRef.current(); }, 640);
    }

    // tab-click jumps: rewind the clock so `el` lands mid-step (image settled + caption up)
    const jumpStep = (i: number) => { skipRef.current = false; clock = performance.now() - (T_TOUR + i * D_STEP + D_STEP * 0.45); };
    const jumpMap = () => { skipRef.current = false; clock = performance.now() - (T_TOUR - 800); }; // globe settled, map caption up
    jumpRef.current = { map: jumpMap, step: jumpStep };
    // which nav tab is active for the current time (weekly lives under the AI tab)
    const activeNav = (e: number) => {
      if (e < T_TOUR) return 0;                 // 지도
      const si = Math.floor((e - T_TOUR) / D_STEP);
      if (si <= 0) return 1;                    // 커뮤니티
      if (si === 1 || si === 2) return 2;       // AI (ai + weekly)
      if (si === 3) return 3;                   // 마이 (profile)
      return 4;                                 // 검색
    };
    let curNav = -2, curNavShown = false;

    function frame(now: number) {
      if (!X) { raf = requestAnimationFrame(frame); return; }
      const el = skipRef.current ? 9e6 : now - clock;
      const cx = W / 2, cy = H / 2, r = R(), sc = wordScale();
      X.clearRect(0, 0, W, H);

      const reveal = cl01((el - T_REVEAL) / D_REVEAL);
      // dark backdrop: opaque for the title, transparent while the globe shows, opaque again
      // behind the tour captures (so 'contain' letterboxing reads as clean dark, never a crop)
      const tourDark = cl01((el - (T_TOUR - 600)) / 700);
      if (backdropRef.current) backdropRef.current.style.opacity = String(Math.max(1 - ez(reveal), tourDark));

      // ── opening canvas visuals on the live globe ──
      if (el < T_TOUR) {
        const load = cl01(el / T_RING);
        const ringFade = 1 - cl01((el - (T_REVEAL + 200)) / 600);
        if (ringFade > 0.02 && el < T_SHATTER) {
          X.save(); X.globalAlpha = ringFade;
          X.strokeStyle = "rgba(212,165,71,0.9)"; X.lineWidth = 1.6; X.lineCap = "round";
          X.beginPath(); X.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + load * Math.PI * 2); X.stroke();
          if (load < 1) { const a = -Math.PI / 2 + load * Math.PI * 2; X.fillStyle = "#f3eedf"; X.beginPath(); X.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 2.4, 0, 7); X.fill(); }
          X.restore();
        }
        // solid ARMIN that BURSTS into particles — it fades exactly as its pixels fly off (no swap, no held dots)
        const tIn = cl01((el - T_TITLE) / 700);
        const textFade = 1 - cl01((el - T_SHATTER) / 700);
        if (tIn * textFade > 0.01) {
          const push = 0.9 + ez(cl01((el - T_TITLE) / 2400)) * 0.1;
          X.save(); X.globalAlpha = tIn * textFade;
          X.translate(cx, cy); X.scale(push, push); X.translate(-cx, -cy);
          X.textAlign = "center"; X.textBaseline = "middle";
          try { (X as any).letterSpacing = (28 * sc) + "px"; } catch { /* */ }
          X.font = (150 * sc) + "px " + FONT; X.fillStyle = "rgba(243,238,223,0.97)";
          X.fillText("ARMIN", cx, cy);
          // catchphrase under the wordmark (from the original 시안) — fades out together as ARMIN shatters
          try { (X as any).letterSpacing = (3 * sc) + "px"; } catch { /* */ }
          X.font = (19 * sc) + "px " + FONT; X.fillStyle = "rgba(212,165,71,0.92)";
          X.fillText("전 세계 미술관의 소장품을, 하나의 지구본에서", cx, cy + 96 * sc);
          try { (X as any).letterSpacing = (2 * sc) + "px"; } catch { /* */ }
          X.font = (12 * sc) + "px 'Space Mono', monospace"; X.fillStyle = "rgba(203,195,176,0.55)";
          X.fillText("전 세계 미술관 260곳", cx, cy + 122 * sc); X.restore();
        }
        // particles peel off the exact letter pixels and fly to the museum positions
        if (el >= T_SHATTER) {
          const sp = cl01((el - T_SHATTER) / D_SCATTER);
          for (let i = 0; i < P.length; i++) {
            const p = P[i];
            const lp = cl01((sp - p.delay) / (1 - p.delay)), e = ezIO(lp);
            const mx = (p.ox + p.tx) / 2 + p.curve, my = (p.oy + p.ty) / 2 - Math.abs(p.curve) * 0.55, u = 1 - e;
            const x = u * u * p.ox + 2 * u * e * mx + e * e * p.tx, y = u * u * p.oy + 2 * u * e * my + e * e * p.ty;
            // in flight: full brightness. on arrival: SETTLE into a small, persistent dot — these dots
            // ARE the museums and must STAY on the globe (never vanish). Warm cream→gold while travelling.
            const settle = cl01((lp - 0.72) / 0.28);          // 0 = flying, 1 = landed & resting
            const alpha = 1 - 0.32 * settle;                   // dims slightly to a calm resting dot, never to 0
            const warm = p.cream ? 0 : cl01((lp - 0.25) / 0.6);
            const rr = Math.round(243 + (212 - 243) * warm), gg = Math.round(238 + (165 - 238) * warm), bb = Math.round(223 + (71 - 223) * warm);
            X.fillStyle = `rgba(${rr},${gg},${bb},${(p.cream ? 0.85 : 0.8) * alpha})`;
            X.beginPath(); X.arc(x, y, 1.2 - 0.1 * settle, 0, 7); X.fill();
          }
        }
      }

      // ── cross-fade the built tab mockups (no navigation, no screenshots) ──
      const endFade = cl01((el - (T_END - D_FADE)) / D_FADE); // everything fades out at the very end
      for (let i = 0; i < TOUR.length; i++) {
        const im = mockRefs.current[i]; if (!im) continue;
        const stepStart = T_TOUR + i * D_STEP;
        const fadeIn = el >= stepStart ? cl01((el - stepStart) / D_FADE) : 0;
        // CRITICAL: mockups are transparent (not opaque screenshots), so each MUST fade OUT as the
        // next begins — otherwise they pile up and overlap. Last step holds until the global endFade.
        const fadeOut = i === TOUR.length - 1 ? 0 : cl01((el - (stepStart + D_STEP - D_FADE)) / D_FADE);
        im.style.opacity = String(fadeIn * (1 - fadeOut) * (1 - endFade));
      }

      // ── top caption ──
      let capOp = 0;
      if (el >= T_MAPCAP && el < T_TOUR - 200) {
        capOp = cl01((el - T_MAPCAP) / 450) * (1 - cl01((el - (T_TOUR - 650)) / 450));
        setCap("map", 1, MAP_STEP.title, MAP_STEP.body);
      } else if (el >= T_TOUR && el < T_TOUR_END) {
        const si = Math.min(TOUR.length - 1, Math.floor((el - T_TOUR) / D_STEP));
        const lp = (el - T_TOUR - si * D_STEP) / D_STEP;
        capOp = cl01((lp - 0.26) / 0.12) * (1 - cl01((lp - 0.86) / 0.12)); // appear after the image settles
        setCap("t" + si, 2 + si, TOUR[si].title, TOUR[si].body);
      }
      if (capRef.current) capRef.current.style.opacity = String(capOp);
      if (topScrimRef.current) topScrimRef.current.style.opacity = String(cl01(capOp * 1.25));

      // ── embedded REAL global navigator: appears with the globe dwell, stays for the rest (the
      //    whole overlay fades out on finish, taking it with it). Active tab follows the step. ──
      const shouldShow = el >= T_MAPCAP - 400;
      if (shouldShow !== curNavShown) { curNavShown = shouldShow; setNavShown(shouldShow); }
      if (shouldShow) { const act = activeNav(el); if (act !== curNav) { curNav = act; setNavIndex(act); } }

      if (el >= T_END) { finish(); return; }
      raf = requestAnimationFrame(frame);
    }

    fit();
    // StrictMode/HMR re-runs this effect; without a guard the deferred boot fires for BOTH the
    // discarded and the live invocation → two rAF loops fight over the canvas. cancelled+bootTimer fix it.
    let cancelled = false, bootTimer = 0;
    const boot = () => { if (cancelled) return; sampleWord(); buildParticles(); raf = requestAnimationFrame(frame); };
    const fonts = (document as any).fonts;
    if (fonts && fonts.ready) fonts.ready.then(() => { if (!cancelled) bootTimer = window.setTimeout(boot, 50); }); else bootTimer = window.setTimeout(boot, 250);

    const onResize = () => { fit(); sampleWord(); buildParticles(); };
    window.addEventListener("resize", onResize);
    const safety = window.setTimeout(finish, T_END + 4000);

    return () => {
      cancelled = true;
      window.clearTimeout(bootTimer);
      cancelAnimationFrame(raf);
      window.clearTimeout(safety);
      window.removeEventListener("resize", onResize);
      (window as any).__arminHidePins = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Clicking a tab in the embedded navigator jumps the intro to that tab's step.
  const onNavChange = (index: number) => {
    if (index === 0) jumpRef.current?.map();
    else if (index === 1) jumpRef.current?.step(0);      // community
    else if (index === 2) jumpRef.current?.step(1);      // ai (weekly lives under it)
    else if (index === 3) jumpRef.current?.step(3);      // profile (마이)
    else if (index === 4) jumpRef.current?.step(4);      // search
  };
  return (
    <div ref={wrapRef} onClick={() => { skipRef.current = true; }}
      style={{ position: "fixed", inset: 0, zIndex: 260000, background: "transparent", cursor: "pointer" }} aria-label="ARMIN 인트로">
      <div ref={backdropRef} style={{ position: "absolute", inset: 0, background: "#050506", zIndex: 1 }} />
      <canvas ref={canvasRef} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", zIndex: 2, display: "block", pointerEvents: "none" }} />
      {/* built design-mockups of each tab (cross-faded). They sit in the CLEAR BAND below the caption
          and above the nav, so the explanation text never overlaps them — and they're responsive divs,
          so nothing is ever cropped on narrow screens. */}
      {tourSteps.map((s, i) => (
        <div key={s.kind} ref={(el) => { mockRefs.current[i] = el; }}
          style={{ position: "absolute", left: 0, right: 0, top: "27%", bottom: "13%", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "0 22px", overflow: "hidden", zIndex: 3 + i, opacity: 0, pointerEvents: "none" }}>
          <TabMock kind={s.kind} likedImgs={likedImgs} profile={profile} artistData={artistData} />
        </div>
      ))}
      <div ref={topScrimRef} style={{ position: "absolute", top: 0, left: 0, right: 0, height: "42%", opacity: 0, zIndex: 20, pointerEvents: "none", background: "linear-gradient(180deg, rgba(5,5,6,0.94) 0%, rgba(5,5,6,0.72) 38%, rgba(5,5,6,0) 100%)" }} />
      <div ref={capRef} style={{ position: "absolute", left: 0, right: 0, top: "5%", textAlign: "center", zIndex: 21, opacity: 0, padding: "0 22px", pointerEvents: "none" }} />
      {/* the REAL global navigator, rendered as-is so it's pixel-identical (font and all). The full-screen
          layer stays click-through (pointerEvents:none) so empty clicks still skip; the nav keeps its own
          fixed bottom-centre position and auto pointer-events. stopPropagation keeps a tab click from also
          skipping. onChange jumps the intro to the clicked tab's step. */}
      <div onClick={(e) => e.stopPropagation()} style={{ position: "absolute", inset: 0, zIndex: 30, pointerEvents: "none" }}>
        {navShown && <BottomPageNavigator activeIndex={navIndex} onChange={onNavChange} />}
      </div>
      <button onClick={(e) => { e.stopPropagation(); skipRef.current = true; }}
        style={{ position: "absolute", top: "max(16px,env(safe-area-inset-top,0px))", right: 18, zIndex: 22, background: "rgba(10,10,8,0.45)", border: "1px solid rgba(212,165,71,0.3)", color: "rgba(212,165,71,0.85)", fontFamily: "'Space Mono',monospace", fontSize: 11, letterSpacing: "0.1em", padding: "6px 14px", borderRadius: 999, cursor: "pointer", backdropFilter: "blur(8px)" }}>
        SKIP →
      </button>
    </div>
  );
}
