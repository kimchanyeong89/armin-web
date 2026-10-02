// TasteMatchBar — how well an exhibition suits the signed-in user, drawn across the top
// edge of its poster: a dotted line, a gold bar growing out of it as far as the match goes,
// and the figure at the end. It is a few pixels tall over a faint shade, so the poster
// stays almost whole. The parent must be position: relative.
import { motion } from "framer-motion";

const GOLD = "#E9C277";

const S = {
  wrap: {
    position: "absolute", top: 0, left: 0, right: 0,
    display: "flex", alignItems: "center", gap: 6,
    padding: "8px 8px 14px",
    background: "linear-gradient(to bottom, rgba(0,0,0,0.42), rgba(0,0,0,0))",
    pointerEvents: "none",
  },
  track: {
    flex: 1, height: 2, position: "relative",
    // the dotted line the bar grows out of
    backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.62) 0.75px, transparent 1.1px)",
    backgroundSize: "4px 2px",
    backgroundRepeat: "repeat-x",
    backgroundPosition: "left center",
  },
  fill: {
    position: "absolute", left: 0, top: 0, bottom: 0,
    borderRadius: 2,
    background: `linear-gradient(90deg, rgba(212,165,71,0.5), ${GOLD})`,
    boxShadow: "0 0 6px rgba(233,194,119,0.45)",
  },
  head: {
    position: "absolute", right: -2.5, top: "50%", marginTop: -2.5,
    width: 5, height: 5, borderRadius: "50%",
    background: "#F6DCA4",
    boxShadow: "0 0 0 2px rgba(212,165,71,0.3)",
  },
  num: {
    fontFamily: "'Space Mono', monospace", fontSize: 10, fontWeight: 700, lineHeight: 1,
    letterSpacing: "0.02em", color: "#F0C878",
    textShadow: "0 1px 2px rgba(0,0,0,0.65)",
    flexShrink: 0,
  },
  unit: { fontSize: 7, marginLeft: 1, opacity: 0.8 },
} satisfies Record<string, React.CSSProperties>;

export function TasteMatchBar({ value, title }: { value: number; title?: string }) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div style={S.wrap} title={title} aria-label={`${title ? `${title} ` : ""}${pct}%`} role="img">
      <div style={S.track}>
        <motion.div
          style={S.fill}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.7, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
        >
          <i style={S.head} />
        </motion.div>
      </div>
      <span style={S.num}>
        {pct}
        <small style={S.unit}>%</small>
      </span>
    </div>
  );
}
