import { useEffect, useMemo, useRef, useState } from "react";
import { geoEquirectangular, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import { ARTIST, DONUT_COLORS, MUSEUMS, SPREAD } from "./model";

/**
 * The live page's distribution, redrawn — and kept as one block. The map and
 * the share carousel are two readings of the same fact, so they sit together
 * and answer each other: what the map plots follows the slide, and hovering
 * either side lights the other.
 *
 *   slide 0  국가별 소장 분포   the map plots countries
 *   slide 1  미술관별 소장 분포  the map plots museums
 *   slide 2  보유 미술관        the map plots museums
 *
 * The donut follows the live geometry: filled wedges between an outer radius
 * of 44 and an inner of 26 on a 112 box, a 1.5px separator in the page
 * colour, and a grey remainder for whatever the named slices leave.
 *
 * Land comes from /atlas/countries-110m.json, the file the globe already
 * loads, so this adds no dependency.
 */
const CTY_TOTAL = SPREAD.reduce((s, r) => s + r.count, 0);
const MUS_TOTAL = MUSEUMS.reduce((s, r) => s + r.count, 0);
const MAX_CTY = Math.max(...SPREAD.map((r) => r.count));
const MAX_MUS = MUSEUMS[0]?.count ?? 1;
const W = 470;
const H = 166;

const SLIDES = [
  { ko: "국가별 소장 분포", en: "By Country" },
  { ko: "미술관별 소장 분포", en: "By Museum" },
  { ko: "보유 미술관", en: "Museums Holding" },
];

/** the live donut: filled wedges, a 1.5px separator, a grey remainder */
function Donut({ data, total, hover, setHover, onPick }: {
  data: { key: string; count: number }[]; total: number;
  hover: string | null; setHover: (v: string | null) => void; onPick: (k: string) => void;
}) {
  const cx = 56, cy = 56, outerR = 44, innerR = 26;
  const toXY = (deg: number, r: number) => ({
    x: cx + r * Math.sin((deg * Math.PI) / 180),
    y: cy - r * Math.cos((deg * Math.PI) / 180),
  });
  const arc = (a1: number, a2: number) => {
    const p1o = toXY(a1, outerR), p2o = toXY(a2, outerR);
    const p1i = toXY(a1, innerR), p2i = toXY(a2, innerR);
    const large = a2 - a1 > 180 ? 1 : 0;
    const f = (n: number) => n.toFixed(2);
    return `M${f(p1o.x)},${f(p1o.y)} A${outerR},${outerR} 0 ${large} 1 ${f(p2o.x)},${f(p2o.y)} `
      + `L${f(p2i.x)},${f(p2i.y)} A${innerR},${innerR} 0 ${large} 0 ${f(p1i.x)},${f(p1i.y)} Z`;
  };
  let cum = 0;
  const segs = data.slice(0, 8).map((d, i) => {
    const span = (d.count / total) * 360;
    const s = { key: d.key, a1: cum, a2: cum + span, color: DONUT_COLORS[i % DONUT_COLORS.length] };
    cum += span;
    return s;
  });
  return (
    <svg viewBox="0 0 112 112" className="ar-donut" role="img" aria-label="비율">
      {segs.map((s) => (
        <path key={s.key} d={arc(s.a1, s.a2)} className="ar-donut__seg" data-seg={s.key}
          style={{ fill: s.color, opacity: hover && hover !== s.key ? 0.28 : 1 }}
          onMouseEnter={() => setHover(s.key)} onMouseLeave={() => setHover(null)}
          onClick={() => onPick(s.key)} />
      ))}
      {360 - cum > 0.5 && <path d={arc(cum, 360)} className="ar-donut__rest" />}
      <text className="ar-donut__total" x={cx} y={cy + 5}>{total}</text>
    </svg>
  );
}

export default function Distribution({ ko }: { ko: boolean }) {
  const [land, setLand] = useState<any>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [pinned, setPinned] = useState<string | null>(null);
  const [slide, setSlide] = useState(0);
  const [dragX, setDragX] = useState<number | null>(null);
  /* The map zooms from its + and − only, so a crowded region can be read.
     It zoomed on the wheel too, and a page scrolled past it came to rest at
     8× over open sea — the map looked gone. A drag pans only once zoomed;
     at 1× a swipe over the map scrolls the page. Marks are drawn at 1/k so
     they keep their size as the land grows under them. */
  const [view, setView] = useState({ k: 1, x: 0, y: 0 });
  const panRef = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null);
  /* the land always fills the frame: drawn W·k wide, its left edge may sit
     from W − W·k to 0 — so back at 1× it is exactly where it began */
  const clampView = (v: { k: number; x: number; y: number }) => {
    const k = Math.min(8, Math.max(1, v.k));
    return { k, x: Math.min(0, Math.max(W - W * k, v.x)), y: Math.min(0, Math.max(H - H * k, v.y)) };
  };
  /* about the frame's centre */
  const zoomBy = (factor: number) =>
    setView((v) => {
      const k = Math.min(8, Math.max(1, v.k * factor));
      if (k === v.k) return v;
      const r = k / v.k;
      return clampView({ k, x: W / 2 - (W / 2 - v.x) * r, y: H / 2 - (H / 2 - v.y) * r });
    });

  useEffect(() => {
    let alive = true;
    fetch("/atlas/countries-110m.json")
      .then((r) => r.json())
      .then((t) => { if (alive) setLand(feature(t, t.objects.countries)); })
      .catch(() => { /* the marks still draw without land */ });
    return () => { alive = false; };
  }, []);
  /* a pick made on one slide means nothing on another */
  useEffect(() => { setPinned(null); setHover(null); }, [slide]);

  const projection = useMemo(
    () => geoEquirectangular().fitExtent([[2, 4], [W - 2, H - 4]], { type: "Sphere" } as any),
    [],
  );
  const pathOf = useMemo(() => geoPath(projection), [projection]);
  const pct = (n: number, total: number) => Math.round((n / total) * 100);
  const active = pinned || hover;
  const pick = (k: string) => setPinned((p) => (p === k ? null : k));

  /* what the map plots follows the slide: countries on 0, museums on 1 and 2 */
  const byCountry = slide === 0;
  const marks = byCountry
    ? SPREAD.map((r, i) => ({
        key: r.country, label: ko ? r.countryKo : r.country, count: r.count, at: r.at,
        named: !!r.badge, off: r.off, i, max: MAX_CTY, total: CTY_TOTAL,
      }))
    : MUSEUMS.map((m, i) => ({
        key: m.id, label: ko ? m.nameKo : m.name, count: m.count, at: m.at,
        named: i < 5, off: undefined as [number, number] | undefined, i, max: MAX_MUS, total: MUS_TOTAL,
      }));

  return (
    <div className="ar-dist">
      <div className="ar-world">
      <header className="ar-dist__cap">
        <span>{ko ? "전 세계 분포" : "Global Distribution"}</span>
        <i />
        <em>{ARTIST.museums} {ko ? "개 미술관" : "museums"}</em>
      </header>

      <div className="ar-mapwrap">
        <svg viewBox={`0 0 ${W} ${H}`} className="ar-map" role="img"
          aria-label={byCountry ? (ko ? "국가별 소장 위치" : "By country") : (ko ? "미술관별 소장 위치" : "By museum")}
          onPointerDown={(e) => {
            if (view.k === 1) return;
            (e.currentTarget as SVGSVGElement).setPointerCapture(e.pointerId);
            panRef.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y };
          }}
          onPointerMove={(e) => {
            const p = panRef.current;
            if (!p) return;
            const r = e.currentTarget.getBoundingClientRect();
            setView((v) => clampView({
              k: v.k,
              x: p.vx + ((e.clientX - p.x) / r.width) * W,
              y: p.vy + ((e.clientY - p.y) / r.height) * H,
            }));
          }}
          onPointerUp={() => { panRef.current = null; }}
          onPointerCancel={() => { panRef.current = null; }}
          style={{ cursor: view.k > 1 ? (panRef.current ? "grabbing" : "grab") : "default",
            touchAction: view.k > 1 ? "none" : "auto" }}
        >
          <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
            {land && (
              <g className="ar-map__land">
                {(land.features as any[]).map((f, i) => <path key={i} d={pathOf(f) || undefined} />)}
              </g>
            )}
            {marks.map((m) => {
              const xy = projection(m.at);
              if (!xy) return null;
              const on = active === m.key;
              const k = view.k;
              const r = (2.2 + (m.count / m.max) * (byCountry ? 5 : 6)) / k;
              const [dx0, dy0] = m.off || [0, 0];
              const dx = dx0 / k;
              const dy = dy0 / k;
              const lx = xy[0] + dx + (dx >= 0 ? r + 5 / k : -(r + 5 / k));
              const ly = xy[1] + dy;
              return (
                <g key={m.key} className={`ar-mark${on ? " is-on" : ""}`}
                  onMouseEnter={() => setHover(m.key)} onMouseLeave={() => setHover(null)}
                  onClick={() => pick(m.key)} role="button" tabIndex={0}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(m.key); } }}
                  aria-label={`${m.label} ${m.count}`}>
                  {m.off && <line x1={xy[0]} y1={xy[1]} x2={xy[0] + dx} y2={ly} strokeWidth={0.7 / k} />}
                  <circle className="ar-mark__hit" cx={xy[0]} cy={xy[1]} r={Math.max(r + 6 / k, 9 / k)} />
                  <circle className="ar-mark__halo" cx={xy[0]} cy={xy[1]} r={r + 4 / k} strokeWidth={1 / k} />
                  <circle className="ar-mark__dot" cx={xy[0]} cy={xy[1]} r={r}
                    style={{ fill: DONUT_COLORS[m.i % DONUT_COLORS.length] }} />
                  {(m.named || on || k > 2.2) && (
                    <text x={lx} y={ly + 3.6 / k} className="ar-mark__n"
                      style={{ textAnchor: dx < 0 ? "end" : "start", fontSize: 9.5 / k, strokeWidth: 2.6 / k }}>
                      {m.count}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        </svg>
        <div className="ar-zoom">
          <button type="button" onClick={() => zoomBy(1.5)} disabled={view.k >= 8}
            aria-label={ko ? "확대" : "Zoom in"}>+</button>
          <button type="button" onClick={() => zoomBy(1 / 1.5)} disabled={view.k <= 1}
            aria-label={ko ? "축소" : "Zoom out"}>−</button>
        </div>
      </div>
      </div>

      <div className="ar-share">
        <header className="ar-dist__cap">
          <span>{ko ? SLIDES[slide].ko : SLIDES[slide].en}</span>
          <i />
          <em>{byCountry ? CTY_TOTAL : MUS_TOTAL}</em>
        </header>
        <div className="ar-slides"
          onPointerDown={(e) => setDragX(e.clientX)}
          onPointerUp={(e) => {
            if (dragX === null) return;
            const d = e.clientX - dragX;
            setDragX(null);
            if (Math.abs(d) > 40) setSlide((s) => Math.min(2, Math.max(0, s + (d < 0 ? 1 : -1))));
          }}
          onPointerCancel={() => setDragX(null)}
        >
          <div className="ar-slides__strip" style={{ transform: `translateX(-${slide * 33.3333}%)` }}>
            <div className="ar-slide">
              <Donut data={SPREAD.map((r) => ({ key: r.country, count: r.count }))} total={CTY_TOTAL}
                hover={active} setHover={setHover} onPick={pick} />
              <ul className="ar-keys">
                {SPREAD.map((row, i) => (
                  <li key={row.country} data-row={row.country} className={active === row.country ? "is-on" : ""}
                    onMouseEnter={() => setHover(row.country)} onMouseLeave={() => setHover(null)}
                    onClick={() => pick(row.country)}>
                    <i style={{ background: DONUT_COLORS[i % DONUT_COLORS.length] }} />
                    <span>{ko ? row.countryKo : row.country}</span>
                    <u aria-hidden="true" />
                    <b>{pct(row.count, CTY_TOTAL)}%</b>
                  </li>
                ))}
              </ul>
            </div>

            <div className="ar-slide">
              <Donut data={MUSEUMS.map((m) => ({ key: m.id, count: m.count }))} total={MUS_TOTAL}
                hover={active} setHover={setHover} onPick={pick} />
              <ul className="ar-keys">
                {MUSEUMS.map((m, i) => (
                  <li key={m.id} data-row={m.id} className={active === m.id ? "is-on" : ""}
                    onMouseEnter={() => setHover(m.id)} onMouseLeave={() => setHover(null)}
                    onClick={() => pick(m.id)}>
                    <i style={{ background: DONUT_COLORS[i % DONUT_COLORS.length] }} />
                    <span>{ko ? m.nameKo : m.name}<em> · {ko ? m.countryKo : m.country}</em></span>
                    <u aria-hidden="true" />
                    <b>{pct(m.count, MUS_TOTAL)}%</b>
                  </li>
                ))}
              </ul>
            </div>

            <div className="ar-slide ar-slide--top">
              <div className="ar-tops">
                {MUSEUMS.map((m, i) => (
                  <div key={m.id} data-row={m.id} className={`ar-top${active === m.id ? " is-on" : ""}`}
                    onMouseEnter={() => setHover(m.id)} onMouseLeave={() => setHover(null)}
                    onClick={() => pick(m.id)}>
                    <div className="ar-top__row">
                      <span>{ko ? m.nameKo : m.name}<u> · {ko ? m.countryKo : m.country}</u></span>
                      <b>{m.count}</b>
                    </div>
                    <div className="ar-top__bar">
                      <i style={{ width: `${Math.round((m.count / MAX_MUS) * 100)}%`, background: DONUT_COLORS[i % DONUT_COLORS.length] }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="ar-dots">
            {[0, 1, 2].map((i) => (
              <button key={i} type="button" className={i === slide ? "is-on" : ""} onClick={() => setSlide(i)}
                aria-label={ko ? SLIDES[i].ko : SLIDES[i].en} aria-current={i === slide} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
