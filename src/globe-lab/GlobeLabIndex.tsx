import { Link } from "react-router-dom";
import {
  COLLY_GLOBE_VARIANTS,
  GLOBE_LAB_CANDIDATES,
  buildCollyGlobePath,
  buildGlobeLabPath,
} from "./model";

export function GlobeLabIndex() {
  return (
    <div className="globe-lab-index">
      <a className="globe-lab-skip" href="#globe-lab-studies">Skip to studies</a>
      <header className="globe-lab-index__header">
        <a className="globe-lab-wordmark" href="/" translate="no">COLLY</a>
        <span>Globe design laboratory</span>
        <a href="/" translate="no">Current COLLY</a>
      </header>
      <main id="globe-lab-studies">
        <section className="globe-lab-index__intro" aria-labelledby="globe-lab-title">
          <p>Five skills · one shared map</p>
          <h1 id="globe-lab-title">Five ways to see the same world.</h1>
          <p>
            Every study below uses COLLY&apos;s live exhibition data and the same interactive D3 globe.
            Only the visual language changes.
          </p>
        </section>
        <ol className="globe-lab-index__grid">
          {GLOBE_LAB_CANDIDATES.map((candidate) => (
            <li key={candidate.slug} className={`globe-lab-index__card--${candidate.slug}`}>
              <Link to={buildGlobeLabPath(candidate.slug)}>
                <span className="globe-lab-index__preview" aria-hidden="true"><i /></span>
                <small>{candidate.skill}</small>
                <strong>{candidate.name}</strong>
                <span>{candidate.summary}</span>
                <span className="globe-lab-index__open">Open study <span aria-hidden="true">↗</span></span>
              </Link>
              {candidate.slug === "colly-evolved" && (
                <nav className="globe-lab-index__colly-versions" aria-label="COLLY map versions">
                  {COLLY_GLOBE_VARIANTS.map((variant, index) => (
                    <Link
                      key={variant.slug}
                      to={buildCollyGlobePath(variant.slug)}
                      aria-label={variant.name}
                    >
                      {String(index + 1).padStart(2, "0")}
                    </Link>
                  ))}
                </nav>
              )}
            </li>
          ))}
        </ol>
      </main>
    </div>
  );
}
