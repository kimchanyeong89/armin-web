import { motion } from "motion/react";
import type { Exhibition, ExhibitionItem } from "../../types/Exhibition";
import type { Theme } from "./types";
import { publicUrl } from "../../utils/publicUrl";

interface Props {
  exhibition: Exhibition;
  theme: Theme;
  onClose: () => void;
  onViewCollection: (exhibition: Exhibition, item?: ExhibitionItem) => void;
}

function formatDate(d?: string): string {
  if (!d) return '';
  if (d.toLowerCase().includes('permanent')) return 'Permanent';
  const match = d.match(/^(\d{4})/);
  return match ? match[1] : d;
}

export function GlobeExhibitionPanel({ exhibition, theme, onClose, onViewCollection }: Props) {
  const t = theme === "light";

  const bg = t ? "rgba(255, 255, 255, 0.65)" : "rgba(10, 10, 10, 0.65)";
  const border = t ? "rgba(0,0,0,0.08)" : "rgba(255,255,255,0.06)";
  const fg = t ? "#111" : "#f0f0f0";
  const fg60 = t ? "rgba(0,0,0,0.55)" : "rgba(255,255,255,0.50)";
  const fg30 = t ? "rgba(0,0,0,0.25)" : "rgba(255,255,255,0.20)";
  const fg15 = t ? "rgba(0,0,0,0.08)" : "rgba(255,255,255,0.06)";
  const lime = "#BFFF0A";

  // Representative image handling
  const rep = exhibition.representativeImage || "";
  const isUrl = /^https?:\/\//.test(rep);
  const isData = /^data:image\//.test(rep);
  const cleaned = rep.replace(/^\//, "");
  const isLocal = /^images\//.test(cleaned);
  const imgSrc = isData ? rep : (isUrl ? rep : (isLocal ? publicUrl(rep) : ""));

  // Exhibition lists
  const permanent = exhibition.permanentExhibitions || [];
  const temporary = exhibition.temporaryExhibitions || [];
  const past = exhibition.pastExhibitions || [];
  const totalCollections = permanent.length + temporary.length + past.length;

  // Description: first sentence
  const fullDesc = (exhibition.description || "").trim();
  const firstSentence = (() => {
    const match = fullDesc.match(/^[^.!?\n]+[.!?]?/);
    return match ? match[0] : fullDesc;
  })();

  const renderExhibitionItem = (item: ExhibitionItem, type: 'permanent' | 'current' | 'past') => {
    const period = type === 'permanent'
      ? 'Permanent'
      : `${formatDate(item.startDate)}${item.endDate ? ' – ' + formatDate(item.endDate) : ''}`;

    return (
      <button
        key={item.id}
        onClick={() => onViewCollection(exhibition, item)}
        style={{
          display: 'flex', alignItems: 'center', gap: '12px',
          padding: '12px 0', width: '100%',
          background: 'transparent', border: 'none', cursor: 'pointer',
          textAlign: 'left', color: fg, fontFamily: "'Space Grotesk', sans-serif",
          borderBottom: `1px solid ${fg15}`,
          transition: 'opacity 0.15s',
        }}
        onMouseEnter={e => e.currentTarget.style.opacity = '0.7'}
        onMouseLeave={e => e.currentTarget.style.opacity = '1'}
      >
        {/* Poster thumbnail */}
        {item.image ? (
          <div style={{
            width: 48, height: 60, flexShrink: 0,
            borderRadius: '3px', overflow: 'hidden',
            backgroundColor: t ? '#f5f5f5' : '#1a1a1a',
          }}>
            <img
              src={item.image}
              alt={item.name}
              loading="lazy"
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
              onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
          </div>
        ) : (
          <div style={{
            width: 48, height: 60, flexShrink: 0,
            borderRadius: '3px',
            backgroundColor: t ? '#f0f0f0' : '#1a1a1a',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <span style={{ fontSize: '8px', color: fg30, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {type === 'permanent' ? 'PERM' : type === 'current' ? 'CURR' : 'PAST'}
            </span>
          </div>
        )}

        {/* Info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: '13px', fontWeight: 500, lineHeight: 1.3,
            overflow: 'hidden', textOverflow: 'ellipsis',
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
          }}>
            {item.name}
          </div>
          <div style={{
            fontSize: '10px', color: fg60, marginTop: '4px',
            fontFamily: "'Space Mono', monospace", letterSpacing: '0.02em',
          }}>
            {period}
          </div>
        </div>

        {/* Arrow */}
        <span style={{ color: fg30, fontSize: '14px', flexShrink: 0 }}>&rsaquo;</span>
      </button>
    );
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96, y: "50%", x: "-50%" }}
      animate={{ opacity: 1, scale: 1, y: "-50%", x: "-50%" }}
      exit={{ opacity: 0, scale: 0.96, y: "-48%", x: "-50%" }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        width: '90vw',
        maxWidth: '420px',
        maxHeight: '80vh',
        zIndex: 50,
        backgroundColor: bg,
        backdropFilter: 'blur(30px) saturate(200%)',
        WebkitBackdropFilter: 'blur(30px) saturate(200%)',
        border: `1px solid ${border}`,
        borderRadius: '16px',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: t
          ? "0 24px 80px rgba(0,0,0,0.12)"
          : "0 24px 80px rgba(0,0,0,0.5)",
        color: fg,
        fontFamily: "'Space Grotesk', sans-serif",
        overflow: 'hidden',
      }}
    >
      {/* Close button */}
      <button
        onClick={onClose}
        style={{
          position: 'absolute', top: 14, right: 14, border: 'none',
          background: t ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.06)',
          color: fg60, cursor: 'pointer', padding: '6px',
          borderRadius: '8px', transition: 'all 0.15s', zIndex: 2,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
        onMouseEnter={e => { e.currentTarget.style.backgroundColor = t ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.12)'; e.currentTarget.style.color = fg; }}
        onMouseLeave={e => { e.currentTarget.style.backgroundColor = t ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = fg60; }}
        aria-label="Close"
      >
        <svg fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24" width={16} height={16}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      {/* Header: Image + Name */}
      <div style={{ flexShrink: 0 }}>
        {/* Representative Image */}
        {imgSrc && (
          <div style={{
            width: '100%', height: '160px',
            backgroundColor: t ? '#f5f5f5' : '#0a0a0a',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            overflow: 'hidden',
            borderBottom: `1px solid ${fg15}`,
          }}>
            <img
              src={imgSrc}
              alt={exhibition.name}
              loading="lazy"
              style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', display: 'block' }}
              referrerPolicy="no-referrer"
              onError={e => { (e.target as HTMLImageElement).parentElement!.style.display = 'none'; }}
            />
          </div>
        )}

        {/* Museum info */}
        <div style={{ padding: '20px 24px 16px' }}>
          <h2 style={{
            fontSize: '22px', fontWeight: 600, marginBottom: '4px',
            letterSpacing: '-0.02em', lineHeight: 1.2, paddingRight: '28px',
          }}>
            {exhibition.name}
          </h2>
          <div style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            marginTop: '8px',
          }}>
            <span style={{ fontSize: '12px', color: fg60 }}>{exhibition.location}</span>
            <span style={{ fontSize: '10px', color: fg15 }}>·</span>
            <span style={{
              fontSize: '10px', color: fg30,
              fontFamily: "'Space Mono', monospace",
            }}>
              {totalCollections} {totalCollections === 1 ? 'collection' : 'collections'}
            </span>
          </div>

          {firstSentence && (
            <p style={{
              fontSize: '13px', color: fg60, marginTop: '12px',
              lineHeight: 1.55, letterSpacing: '0.005em',
            }}>
              {firstSentence}
            </p>
          )}

          {/* View Collection CTA */}
          <button
            onClick={() => onViewCollection(exhibition)}
            style={{
              marginTop: '16px', width: '100%',
              padding: '10px 16px',
              backgroundColor: t ? '#111' : lime,
              color: t ? '#fff' : '#111',
              border: 'none', borderRadius: '8px',
              fontSize: '12px', fontWeight: 600,
              letterSpacing: '0.06em', textTransform: 'uppercase',
              cursor: 'pointer', transition: 'opacity 0.15s',
              fontFamily: "'Space Grotesk', sans-serif",
            }}
            onMouseEnter={e => e.currentTarget.style.opacity = '0.85'}
            onMouseLeave={e => e.currentTarget.style.opacity = '1'}
          >
            View Collection →
          </button>
        </div>
      </div>

      {/* Exhibition Lists */}
      <div style={{
        flex: 1, overflowY: 'auto', padding: '0 24px 20px',
        borderTop: `1px solid ${fg15}`,
      }}>
        {/* Permanent */}
        {permanent.length > 0 && (
          <div style={{ marginTop: '16px' }}>
            <div style={{
              fontSize: '9px', fontWeight: 600, color: fg30,
              letterSpacing: '0.15em', textTransform: 'uppercase',
              marginBottom: '4px', fontFamily: "'Space Mono', monospace",
            }}>
              Permanent
            </div>
            {permanent.map(item => renderExhibitionItem(item, 'permanent'))}
          </div>
        )}

        {/* Current / Temporary */}
        {temporary.length > 0 && (
          <div style={{ marginTop: '20px' }}>
            <div style={{
              fontSize: '9px', fontWeight: 600, color: fg30,
              letterSpacing: '0.15em', textTransform: 'uppercase',
              marginBottom: '4px', fontFamily: "'Space Mono', monospace",
            }}>
              Temporary
            </div>
            {temporary.map(item => renderExhibitionItem(item, 'current'))}
          </div>
        )}

        {/* Past */}
        {past.length > 0 && (
          <div style={{ marginTop: '20px' }}>
            <div style={{
              fontSize: '9px', fontWeight: 600, color: fg30,
              letterSpacing: '0.15em', textTransform: 'uppercase',
              marginBottom: '4px', fontFamily: "'Space Mono', monospace",
            }}>
              Past
            </div>
            {past.map(item => renderExhibitionItem(item, 'past'))}
          </div>
        )}

        {totalCollections === 0 && (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            height: '80px', color: fg30, fontSize: '12px',
          }}>
            No exhibition data available.
          </div>
        )}
      </div>
    </motion.div>
  );
}
