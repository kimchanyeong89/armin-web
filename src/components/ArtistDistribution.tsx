import { useEffect, useMemo, useRef, useState } from 'react';
import { geoEquirectangular, geoPath } from 'd3-geo';
import { feature } from 'topojson-client';
import { exhibitions } from '../data/exhibitions';
import { findMuseumForArtwork } from '../utils/museumUtils';
import { getMuseumDisplayName } from '../i18n/museumLocalization';
import { localizeCountryName } from '../i18n/geoLocalization';
import type { AppLanguage } from '../contexts/LanguageContext';

/**
 * The artist page's distribution, as the redesign draws it (/redesign/artist):
 * the map and the share carousel are two readings of one fact, so they sit
 * together and answer each other — what the map plots follows the slide, and
 * hovering either side lights the other.
 *
 *   slide 0  국가별 소장 분포   the map plots countries
 *   slide 1  미술관별 소장 분포  the map plots museums
 *   slide 2  인기 미술관        the map plots museums
 *
 * The wrapper steps aside (display: contents) so the map and the carousel
 * become the band's own right-hand cells: the map beside the name, the
 * carousel beside the Wikipedia text.
 *
 * Land comes from /atlas/countries-110m.json — the file the globe already
 * loads, so this adds no dependency.
 */

const DONUT_COLORS = ['#d4a547', '#f0c878', '#a07028', '#f5dca6', '#6b4514', '#e8b85f', '#fae8c4', '#3f2906'];
const W = 470;
const H = 166;

type Row = { key: string; label: string; sub?: string; count: number; at: [number, number] };

/** filled wedges between an outer radius of 44 and an inner of 26, a separator
    in the page colour, and a grey remainder for whatever the named slices leave */
function Donut({ data, total, hover, setHover, onPick }: {
  data: Row[]; total: number;
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
    const span = total > 0 ? (d.count / total) * 360 : 0;
    const seg = { key: d.key, a1: cum, a2: cum + span, color: DONUT_COLORS[i % DONUT_COLORS.length] };
    cum += span;
    return seg;
  });
  /* one slice filling the ring is degenerate as an arc — its ends coincide,
     so it draws nothing; two circles read the same */
  const isFullRing = segs.length === 1 && Math.abs(segs[0].a2 - segs[0].a1 - 360) < 0.01;
  return (
    <svg viewBox="0 0 112 112" className="ag-donut" role="img" aria-label={String(total)}>
      {isFullRing ? (
        <>
          <circle className="ag-donut__seg" cx={cx} cy={cy} r={outerR} style={{ fill: segs[0].color }} />
          <circle cx={cx} cy={cy} r={innerR} fill="#080808" />
        </>
      ) : (
        segs.map((s) => (
          <path
            key={s.key}
            d={arc(s.a1, s.a2)}
            className="ag-donut__seg"
            style={{ fill: s.color, opacity: hover && hover !== s.key ? 0.28 : 1 }}
            onMouseEnter={() => setHover(s.key)}
            onMouseLeave={() => setHover(null)}
            onClick={() => onPick(s.key)}
          />
        ))
      )}
      {!isFullRing && 360 - cum > 0.5 && <path d={arc(cum, 360)} className="ag-donut__rest" />}
      <text className="ag-donut__total" x={cx} y={cy + 5}>
        {total >= 10000 ? `${(total / 1000).toFixed(1)}k` : total}
      </text>
    </svg>
  );
}

export type ArtistPlace = { kind: 'country' | 'museum'; key: string; label: string };

/** where a work is held, by the same lookup the map plots it with */
export function artworkPlace(art: any): { museumId: string; country: string } | null {
  const museum = findMuseumForArtwork(art, exhibitions as any);
  if (!museum?.id) return null;
  return { museumId: museum.id, country: museum.country || '' };
}

export default function ArtistDistribution({ artworks, language, picked, onPick }: {
  artworks: Array<{ museumName?: string; exhibitionId?: string }>;
  language: AppLanguage;
  /** the country or museum the page is showing the works of */
  picked?: ArtistPlace | null;
  onPick?: (place: ArtistPlace | null) => void;
}) {
  const ko = language === 'ko';
  const [land, setLand] = useState<any>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [slide, setSlide] = useState(0);
  const [dragX, setDragX] = useState<number | null>(null);
  /* The map zooms from its + and − only, so a crowded region can be read; a
     drag pans once zoomed. Marks are drawn at 1/k so they keep their size as
     the land grows under them. */
  const [view, setView] = useState({ k: 1, x: 0, y: 0 });
  const panRef = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null);
  const clampView = (v: { k: number; x: number; y: number }) => {
    const k = Math.min(8, Math.max(1, v.k));
    return { k, x: Math.min(0, Math.max(W - W * k, v.x)), y: Math.min(0, Math.max(H - H * k, v.y)) };
  };
  const zoomBy = (factor: number) =>
    setView((v) => {
      const k = Math.min(8, Math.max(1, v.k * factor));
      if (k === v.k) return v;
      const r = k / v.k;
      return clampView({ k, x: W / 2 - (W / 2 - v.x) * r, y: H / 2 - (H / 2 - v.y) * r });
    });

  useEffect(() => {
    let alive = true;
    fetch('/atlas/countries-110m.json')
      .then((r) => r.json())
      .then((t) => { if (alive) setLand(feature(t, t.objects.countries)); })
      .catch(() => { /* the marks still draw without land */ });
    return () => { alive = false; };
  }, []);
  /* a pick made on one slide means nothing on another */
  const clearPick = onPick;
  useEffect(() => { clearPick?.(null); setHover(null); }, [slide, clearPick]);

  /* the works' houses, and the countries those houses stand in */
  const { museumRows, countryRows, musTotal, ctyTotal } = useMemo(() => {
    const byMuseum = new Map<string, Row & { country: string }>();
    for (const art of artworks) {
      const museum = findMuseumForArtwork(art as any, exhibitions as any);
      if (!museum?.latitude || !museum?.longitude) continue;
      const existing = byMuseum.get(museum.id);
      if (existing) {
        existing.count += 1;
        continue;
      }
      byMuseum.set(museum.id, {
        key: museum.id,
        label: getMuseumDisplayName(museum, language),
        sub: museum.country ? localizeCountryName(museum.country, language) : '',
        country: museum.country || '',
        count: 1,
        at: [museum.longitude, museum.latitude],
      });
    }
    const mus = Array.from(byMuseum.values()).sort((a, b) => b.count - a.count);

    const byCountry = new Map<string, { key: string; label: string; count: number; lng: number; lat: number }>();
    for (const row of mus) {
      if (!row.country) continue;
      const found = byCountry.get(row.country);
      if (found) {
        /* the country sits where its works are, weighted by how many */
        found.lng = (found.lng * found.count + row.at[0] * row.count) / (found.count + row.count);
        found.lat = (found.lat * found.count + row.at[1] * row.count) / (found.count + row.count);
        found.count += row.count;
      } else {
        byCountry.set(row.country, {
          key: row.country,
          label: localizeCountryName(row.country, language),
          count: row.count,
          lng: row.at[0],
          lat: row.at[1],
        });
      }
    }
    const cty: Row[] = Array.from(byCountry.values())
      .sort((a, b) => b.count - a.count)
      .map((c) => ({ key: c.key, label: c.label, count: c.count, at: [c.lng, c.lat] as [number, number] }));

    return {
      museumRows: mus as Row[],
      countryRows: cty,
      musTotal: mus.reduce((s, r) => s + r.count, 0),
      ctyTotal: cty.reduce((s, r) => s + r.count, 0),
    };
  }, [artworks, language]);

  const projection = useMemo(
    () => geoEquirectangular().fitExtent([[2, 4], [W - 2, H - 4]], { type: 'Sphere' } as any),
    [],
  );
  const pathOf = useMemo(() => geoPath(projection), [projection]);
  const pct = (n: number, total: number) => (total > 0 ? Math.round((n / total) * 100) : 0);
  const pinned = picked?.key ?? null;
  const active = pinned || hover;
  /* clicking a country or a museum shows that one's works below; clicking it
     again puts them all back */
  const pick = (row: Row, kind: ArtistPlace['kind']) =>
    onPick?.(pinned === row.key ? null : { kind, key: row.key, label: row.label });

  /* what the map plots follows the slide: countries on 0, museums on 1 and 2 */
  const byCountry = slide === 0;
  const plotted = byCountry ? (countryRows.length > 0 ? countryRows : museumRows) : museumRows;
  const plottedMax = Math.max(1, ...plotted.map((r) => r.count));
  const total = byCountry && countryRows.length > 0 ? ctyTotal : musTotal;
  const slideCap = [
    { ko: '국가별 소장 분포', en: 'By Country' },
    { ko: '미술관별 소장 분포', en: 'By Museum' },
    { ko: '인기 미술관', en: 'Top Museums' },
  ][slide];

  if (museumRows.length === 0) return null;

  return (
    <div className="ag-dist">
      <div className="ag-world">
        <header className="ag-cap">
          <span>{ko ? '전 세계 분포' : 'GLOBAL DISTRIBUTION'}</span>
          <i aria-hidden="true" />
          <em>{museumRows.length} {ko ? '개 미술관' : 'museums'}</em>
        </header>

        <div className="ag-mapwrap">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="ag-map"
            role="img"
            aria-label={byCountry ? (ko ? '국가별 소장 위치' : 'By country') : (ko ? '미술관별 소장 위치' : 'By museum')}
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
            style={{
              cursor: view.k > 1 ? (panRef.current ? 'grabbing' : 'grab') : 'default',
              touchAction: view.k > 1 ? 'none' : 'auto',
            }}
          >
            <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
              {land && (
                <g className="ag-map__land">
                  {(land.features as any[]).map((f, i) => <path key={i} d={pathOf(f) || undefined} />)}
                </g>
              )}
              {plotted.map((m, i) => {
                const xy = projection(m.at);
                if (!xy) return null;
                const on = active === m.key;
                const k = view.k;
                const r = (2.2 + (m.count / plottedMax) * (byCountry ? 5 : 6)) / k;
                const lx = xy[0] + r + 5 / k;
                const ly = xy[1];
                return (
                  <g
                    key={m.key}
                    className={`ag-mark${on ? ' is-on' : ''}`}
                    onMouseEnter={() => setHover(m.key)}
                    onMouseLeave={() => setHover(null)}
                    onClick={() => pick(m, byCountry ? 'country' : 'museum')}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(m, byCountry ? 'country' : 'museum'); } }}
                    aria-label={`${m.label} ${m.count}`}
                  >
                    <circle className="ag-mark__hit" cx={xy[0]} cy={xy[1]} r={Math.max(r + 6 / k, 9 / k)} />
                    <circle className="ag-mark__halo" cx={xy[0]} cy={xy[1]} r={r + 4 / k} strokeWidth={1 / k} />
                    <circle
                      className="ag-mark__dot"
                      cx={xy[0]}
                      cy={xy[1]}
                      r={r}
                      style={{ fill: DONUT_COLORS[i % DONUT_COLORS.length] }}
                    />
                    {(i < 5 || on || k > 2.2) && (
                      <text
                        x={lx}
                        y={ly + 3.6 / k}
                        className="ag-mark__n"
                        style={{ fontSize: 9.5 / k, strokeWidth: 2.6 / k }}
                      >
                        {m.count}
                      </text>
                    )}
                  </g>
                );
              })}
            </g>
          </svg>
          <div className="ag-zoom">
            <button type="button" onClick={() => zoomBy(1.5)} disabled={view.k >= 8} aria-label={ko ? '확대' : 'Zoom in'}>+</button>
            <button type="button" onClick={() => zoomBy(1 / 1.5)} disabled={view.k <= 1} aria-label={ko ? '축소' : 'Zoom out'}>−</button>
          </div>
        </div>
      </div>

      <div className="ag-share">
        <header className="ag-cap">
          <span>{ko ? slideCap.ko : slideCap.en}</span>
          <i aria-hidden="true" />
          <em>{total}</em>
        </header>
        <div
          className="ag-slides"
          onPointerDown={(e) => setDragX(e.clientX)}
          onPointerUp={(e) => {
            if (dragX === null) return;
            const d = e.clientX - dragX;
            setDragX(null);
            if (Math.abs(d) > 40) setSlide((s) => Math.min(2, Math.max(0, s + (d < 0 ? 1 : -1))));
          }}
          onPointerCancel={() => setDragX(null)}
        >
          <div className="ag-slides__strip" style={{ transform: `translateX(-${slide * 33.3333}%)` }}>
            <div className="ag-slide">
              <Donut
                data={countryRows.length > 0 ? countryRows : museumRows}
                total={countryRows.length > 0 ? ctyTotal : musTotal}
                hover={active}
                setHover={setHover}
                onPick={(k) => {
                  const rows = countryRows.length > 0 ? countryRows : museumRows;
                  const row = rows.find((r) => r.key === k);
                  if (row) pick(row, countryRows.length > 0 ? 'country' : 'museum');
                }}
              />
              <ul className="ag-keys">
                {(countryRows.length > 0 ? countryRows : museumRows).map((row, i) => (
                  <li
                    key={row.key}
                    className={active === row.key ? 'is-on' : ''}
                    onMouseEnter={() => setHover(row.key)}
                    onMouseLeave={() => setHover(null)}
                    onClick={() => pick(row, countryRows.length > 0 ? 'country' : 'museum')}
                  >
                    <i style={{ background: DONUT_COLORS[i % DONUT_COLORS.length] }} />
                    <span>{row.label}</span>
                    <u aria-hidden="true" />
                    <b>{pct(row.count, countryRows.length > 0 ? ctyTotal : musTotal)}%</b>
                  </li>
                ))}
              </ul>
            </div>

            <div className="ag-slide">
              <Donut
                data={museumRows}
                total={musTotal}
                hover={active}
                setHover={setHover}
                onPick={(k) => {
                  const row = museumRows.find((r) => r.key === k);
                  if (row) pick(row, 'museum');
                }}
              />
              <ul className="ag-keys">
                {museumRows.map((m, i) => (
                  <li
                    key={m.key}
                    className={active === m.key ? 'is-on' : ''}
                    onMouseEnter={() => setHover(m.key)}
                    onMouseLeave={() => setHover(null)}
                    onClick={() => pick(m, 'museum')}
                  >
                    <i style={{ background: DONUT_COLORS[i % DONUT_COLORS.length] }} />
                    <span>{m.label}{m.sub ? <em> · {m.sub}</em> : null}</span>
                    <u aria-hidden="true" />
                    <b>{pct(m.count, musTotal)}%</b>
                  </li>
                ))}
              </ul>
            </div>

            <div className="ag-slide ag-slide--top">
              <div className="ag-tops">
                {museumRows.slice(0, 24).map((m, i) => (
                  <div
                    key={m.key}
                    className={`ag-top${active === m.key ? ' is-on' : ''}`}
                    onMouseEnter={() => setHover(m.key)}
                    onMouseLeave={() => setHover(null)}
                    onClick={() => pick(m, 'museum')}
                  >
                    <div className="ag-top__row">
                      <span>{m.label}{m.sub ? <u> · {m.sub}</u> : null}</span>
                      <b>{m.count >= 1000 ? `${(m.count / 1000).toFixed(1)}k` : m.count}</b>
                    </div>
                    <div className="ag-top__bar">
                      <i style={{
                        width: `${Math.round((m.count / (museumRows[0]?.count || 1)) * 100)}%`,
                        background: DONUT_COLORS[i % DONUT_COLORS.length],
                      }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="ag-dots">
            {[0, 1, 2].map((i) => (
              <button
                key={i}
                type="button"
                className={i === slide ? 'is-on' : ''}
                onClick={() => setSlide(i)}
                aria-current={i === slide}
                aria-label={String(i + 1)}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
