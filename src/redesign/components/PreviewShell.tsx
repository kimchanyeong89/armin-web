import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { buildPreviewPath, PREVIEW_CONCEPTS, PREVIEW_VIEWS } from "../model";
import type { PreviewConcept, PreviewView } from "../model";

const CONCEPT_LABELS: Record<PreviewConcept, string> = {
  hybrid: "Hybrid",
  dark: "Dark",
  light: "Light",
};

const VIEW_LABELS: Record<PreviewView, string> = {
  home: "Discover",
  search: "Search",
  ai: "AI curation",
  community: "Community",
  exhibitions: "Exhibitions",
  profile: "Collection",
  work: "Work",
  artist: "Artist",
  exhibition: "Exhibition",
};

type PreviewShellProps = {
  concept: PreviewConcept;
  view: PreviewView;
  id?: string;
  children: ReactNode;
};

export default function PreviewShell({ concept, view, id, children }: PreviewShellProps) {
  return (
    <div className={`rd rd--${concept}`} data-concept={concept} data-view={view}>
      <a className="rd-skip" href="#redesign-main">Skip to content</a>
      <header className="rd-header">
        <Link className="rd-wordmark" to="/redesign" aria-label="COLLY redesign concepts">
          COLLY
        </Link>
        <nav className="rd-concepts" aria-label="Design concepts">
          {PREVIEW_CONCEPTS.map((item) => (
            <Link
              key={item}
              to={buildPreviewPath(item, view, id)}
              aria-current={item === concept ? "page" : undefined}
            >
              {CONCEPT_LABELS[item]}
            </Link>
          ))}
        </nav>
        <a className="rd-current-link" href="/">Current COLLY</a>
      </header>
      <nav className="rd-views" aria-label="Preview pages">
        {PREVIEW_VIEWS.map((item) => (
          <Link
            key={item}
            to={buildPreviewPath(concept, item)}
            aria-current={item === view ? "page" : undefined}
          >
            {VIEW_LABELS[item]}
          </Link>
        ))}
      </nav>
      <main id="redesign-main" className="rd-main">
        {children}
      </main>
    </div>
  );
}
