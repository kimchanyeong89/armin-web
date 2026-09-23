import { BrowserRouter, Link, Navigate, Route, Routes, useParams } from "react-router-dom";
import { LanguageProvider } from "../contexts/LanguageContext";
import { GlobeLabIndex } from "./GlobeLabIndex";
import { GlobeLabPage } from "./GlobeLabPage";
import { getCollyGlobeVariant, getGlobeLabCandidate } from "./model";
import "./globe-lab.css";
import "./globe-lab-v2.css";
import "./globe-lab-colly-variants.css";

function CandidateRoute() {
  const { slug, variant } = useParams();
  const candidate = getGlobeLabCandidate(slug);
  const collyVariant = slug === "colly-evolved" ? getCollyGlobeVariant(variant) : null;

  if (!candidate || (variant && !collyVariant)) {
    return (
      <main className="globe-lab-not-found">
        <strong>Globe study not found.</strong>
        <Link to="/globe-lab">Back to all studies</Link>
      </main>
    );
  }

  return <GlobeLabPage candidate={candidate} collyVariant={collyVariant?.slug} />;
}

export default function GlobeLabApp() {
  return (
    <LanguageProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/globe-lab" element={<GlobeLabIndex />} />
          <Route path="/globe-lab/:slug" element={<CandidateRoute />} />
          <Route path="/globe-lab/:slug/:variant" element={<CandidateRoute />} />
          <Route path="*" element={<Navigate to="/globe-lab" replace />} />
        </Routes>
      </BrowserRouter>
    </LanguageProvider>
  );
}
