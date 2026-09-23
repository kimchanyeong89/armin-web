import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import * as d3 from "d3";
import * as globeVisuals from "../components/InteractiveGlobeMap/globeVisualPresets";
import {
  COLLY_GLOBE_VARIANT_PROFILES,
  resolveCollyGlobeVariantProfile,
  resolveCollyMuseumEmphasis,
} from "../components/InteractiveGlobeMap/collyGlobeVariants";
import {
  COLLY_MAP_TECHNIQUE_RENDERERS,
  drawTechniqueOverlay,
  drawTechniqueUnderlay,
  shouldDrawProductionPreviewMarkers,
  type CollyMapTechniqueRenderArgs,
} from "../components/InteractiveGlobeMap/collyMapTechniqueRenderer";
import * as collyTechniqueRenderer from "../components/InteractiveGlobeMap/collyMapTechniqueRenderer";
import { placeRadialRegisterLabels } from "../components/InteractiveGlobeMap/collyMapTechniqueData";
import { LanguageProvider } from "../contexts/LanguageContext";
import InteractiveGlobeMap from "../components/InteractiveGlobeMap/InteractiveGlobeMap";
import * as interactiveGlobeMapModule from "../components/InteractiveGlobeMap/InteractiveGlobeMap";
import {
  GLOBE_VISUAL_PRESETS,
  resolveGlobeRenderProfile,
  resolveGlobeScaleRatio,
  resolveGlobeVisualPalette,
} from "../components/InteractiveGlobeMap/globeVisualPresets";
import {
  drawGlobeCrosshair,
  resolveContinentLabelFontSize,
  resolveContinentLabelVisibility,
  resolveGlobeViewportDensity,
} from "../components/InteractiveGlobeMap/globeCanvasStyles";
import * as globeCanvasStyles from "../components/InteractiveGlobeMap/globeCanvasStyles";
import { GlobeLabIndex } from "../globe-lab/GlobeLabIndex";
import { GlobeLabPage } from "../globe-lab/GlobeLabPage";
import { exhibitions } from "../data/exhibitions";
import {
  COLLY_GLOBE_VARIANTS,
  GLOBE_LAB_CANDIDATES,
  buildCollyGlobePath,
  buildGlobeLabPath,
  getCollyGlobeVariant,
  getGlobeLabCandidate,
  isGlobeLabPath,
} from "../globe-lab/model";

describe("globe lab route contract", () => {
  it("defines the five approved design candidates in review order", () => {
    expect(GLOBE_LAB_CANDIDATES.map((candidate) => candidate.slug)).toEqual([
      "editorial-atlas",
      "signal-observatory",
      "nocturne",
      "colly-evolved",
      "accessible-atlas",
    ]);
  });

  it("matches only the isolated globe lab route", () => {
    expect(isGlobeLabPath("/globe-lab")).toBe(true);
    expect(isGlobeLabPath("/globe-lab/nocturne")).toBe(true);
    expect(isGlobeLabPath("/globe-laboratory")).toBe(false);
    expect(isGlobeLabPath("/interactive")).toBe(false);
  });

  it("builds candidate paths and rejects unknown slugs", () => {
    expect(buildGlobeLabPath("accessible-atlas")).toBe("/globe-lab/accessible-atlas");
    expect(getGlobeLabCandidate("nocturne")?.name).toBe("Nocturne");
    expect(getGlobeLabCandidate("unknown")).toBeNull();
  });

  it("defines the six approved Atlas Index family studies", () => {
    expect(COLLY_GLOBE_VARIANTS.map((variant) => variant.slug)).toEqual([
      "atlas-index",
      "margin-ledger",
      "radial-register",
      "country-folio",
      "coordinate-index",
      "city-gazetteer",
    ]);
    expect(buildCollyGlobePath()).toBe("/globe-lab/colly-evolved");
    expect(buildCollyGlobePath("radial-register")).toBe(
      "/globe-lab/colly-evolved/radial-register",
    );
    expect(getCollyGlobeVariant(undefined)?.slug).toBe("atlas-index");
    expect(getCollyGlobeVariant("floating-glass")?.slug).toBe("atlas-index");
    expect(getCollyGlobeVariant("city-gazetteer")?.name).toBe("City Gazetteer");
    expect(getCollyGlobeVariant("unknown")).toBeNull();
    expect(COLLY_GLOBE_VARIANTS.map((variant) => variant.name)).toEqual([
      "Atlas Index",
      "Margin Ledger",
      "Radial Register",
      "Country Folio",
      "Coordinate Index",
      "City Gazetteer",
    ]);
    expect(new Set(COLLY_GLOBE_VARIANTS.map((variant) => variant.skill))).toEqual(
      new Set(["design-taste-frontend"]),
    );
    expect(JSON.stringify(COLLY_GLOBE_VARIANTS)).not.toMatch(
      /Armin Refined|Cultural Routes|Relief Layers|Museum Territories/,
    );
  });
});

describe("globe lab render contract", () => {
  const render = (node: ReturnType<typeof createElement>) => renderToStaticMarkup(
    createElement(
      LanguageProvider,
      null,
      createElement(MemoryRouter, null, node),
    ),
  );

  it("renders a comparison index with links to all five candidates", () => {
    const html = render(createElement(GlobeLabIndex));

    for (const candidate of GLOBE_LAB_CANDIDATES) {
      expect(html).toContain(candidate.name);
      expect(html).toContain(`href="${buildGlobeLabPath(candidate.slug)}"`);
    }
    for (const variant of COLLY_GLOBE_VARIANTS) {
      expect(html).toContain(`href="${buildCollyGlobePath(variant.slug)}"`);
    }
    expect(html).toContain("Current COLLY");
  });

  it("renders every candidate in the shared interactive map", () => {
    for (const [index, candidate] of GLOBE_LAB_CANDIDATES.entries()) {
      const html = render(createElement(GlobeLabPage, { candidate }));

      expect(html).toContain(`data-globe-lab-skin="${candidate.slug}"`);
      expect(html).toContain('data-globe-lab-version="2"');
      expect(html).toContain('data-globe-map-version="3"');
      expect(html).toContain(`data-study-position="${index + 1}"`);
      if (candidate.slug === "colly-evolved") {
        expect(html).not.toContain(COLLY_GLOBE_VARIANTS[0].skill);
        expect(html).toMatch(/지도 읽기 방식|Map reading method/);
      } else {
        expect(html).toContain(candidate.skill);
      }
      expect(html).toContain('href="#globe-lab-map"');
      expect(html).toContain('id="globe-lab-map"');
      expect(html).toContain('data-shared-globe="interactive-d3"');
      expect(html).toContain('class="globe-lab__status"');
      expect(html).toContain(`${exhibitions.length}`);
      expect(html).not.toContain('class="ig-region-pills"');
      expect(html).not.toContain('data-continent-structure=');
      expect(html).toContain(`data-globe-visual-preset="${candidate.slug}"`);
      const renderProfile = resolveGlobeRenderProfile(
        candidate.slug === "colly-evolved" ? undefined : candidate.slug,
      );
      expect(html).toContain(`data-globe-render-style="${renderProfile.renderStyle}"`);
      expect(html).toContain(`data-globe-furniture="${renderProfile.furniture}"`);
      expect(html).toContain(`data-globe-atmosphere="${renderProfile.atmosphere}"`);
      expect(html).toContain(`data-globe-label-mode="${renderProfile.labelMode}"`);
      expect(html).toContain(`data-globe-preview-marker="${renderProfile.previewMarker}"`);
      expect(html).toContain('role="group"');
      expect(html).toContain('tabindex="0"');
      expect(html).toContain('aria-label="인터랙티브 미술관 지구본"');
      expect(html).toContain('aria-live="polite"');
      expect(html).not.toMatch(/[—–]/);
      expect(html).not.toContain("Study 0");
    }
  });

  it("connects each COLLY route to a real map technique and a six-item switcher", () => {
    const colly = getGlobeLabCandidate("colly-evolved");
    expect(colly).not.toBeNull();
    if (!colly) return;

    for (const variant of COLLY_GLOBE_VARIANTS) {
      const profile = resolveCollyGlobeVariantProfile(variant.slug);
      const html = render(createElement(GlobeLabPage, {
        candidate: colly,
        collyVariant: variant.slug,
      }));

      expect(html).toContain(`data-colly-globe-variant="${variant.slug}"`);
      expect(html).toContain(`data-colly-map-technique="${profile.technique}"`);
      expect(html).not.toContain('class="ig-region-pills"');
      expect(html).toContain(`href="${buildCollyGlobePath(variant.slug)}"`);
      expect(html).toContain(`aria-current="page"`);
      expect(html.match(/class="colly-variant-switcher__link/g)).toHaveLength(6);
    }

    const nonColly = render(createElement(GlobeLabPage, {
      candidate: GLOBE_LAB_CANDIDATES[0],
    }));
    expect(nonColly).not.toContain("data-colly-globe-variant");
    expect(nonColly).not.toContain("data-colly-map-technique");
  });

  it("keeps detail guidance in the same layout while letting it scroll with the modal", () => {
    const colly = getGlobeLabCandidate("colly-evolved");
    expect(colly).not.toBeNull();
    if (!colly) return;

    const html = render(createElement(GlobeLabPage, {
      candidate: colly,
      collyVariant: "radial-register",
    }));
    expect(html).not.toContain("design-taste-frontend");
    expect(html).not.toContain("Shared map engine");
    expect(html).not.toContain("공유 지도 엔진");
    expect(html).toMatch(/지도 읽기 방식|Map reading method/);
    expect(html).toMatch(/드래그하고 확대해 국가를 선택하세요|Drag, zoom, then select a country/);

    const pageSource = readFileSync(
      new URL("../globe-lab/GlobeLabPage.tsx", import.meta.url),
      "utf8",
    );
    const modalSource = readFileSync(
      new URL(
        "../components/InteractiveGlobeMap/InteractiveGlobeRealModal.tsx",
        import.meta.url,
      ),
      "utf8",
    );
    const labCss = readFileSync(
      new URL("../globe-lab/globe-lab-colly-variants.css", import.meta.url),
      "utf8",
    );
    expect(pageSource).toContain("detailIntroduction");
    expect(modalSource).toContain("data-globe-detail-modal");
    expect(modalSource).toContain("detailIntroduction");
    expect(modalSource).toContain(
      'className="globe-lab__statement globe-lab__detail-statement ig-atlas-detail-statement"',
    );
    expect(modalSource).toContain(
      "style={{ position: 'relative', height: '100%', overflowY: 'auto', overflowX: 'hidden' }}",
    );
    expect(modalSource.indexOf("globe-lab__detail-statement")).toBeGreaterThan(
      modalSource.indexOf("ref={scrollContainerRef}"),
    );
    expect(modalSource.indexOf("globe-lab__detail-statement")).toBeLessThan(
      modalSource.indexOf("{/* ── Hero ── */}"),
    );
    expect(modalSource).not.toContain("top: 'clamp(104px, 15vh, 156px)'");
    expect(labCss).toContain(":has([data-globe-detail-modal])");
  });

  it("keeps the COLLY statement inside the left rail before the map edge", () => {
    const css = readFileSync(
      new URL("../globe-lab/globe-lab-colly-variants.css", import.meta.url),
      "utf8",
    );

    expect(css).toContain(
      "width: min(26rem, calc(31vw - clamp(2.4rem, 4.5vw, 5rem) - 1.75rem));",
    );
  });

  it("replaces the COLLY statement with the city detail in the same left slot", () => {
    const mapSource = readFileSync(
      new URL(
        "../components/InteractiveGlobeMap/InteractiveGlobeMap.tsx",
        import.meta.url,
      ),
      "utf8",
    );
    const panelSource = readFileSync(
      new URL(
        "../components/InteractiveGlobeMap/VenuePanel.tsx",
        import.meta.url,
      ),
      "utf8",
    );
    const css = readFileSync(
      new URL("../globe-lab/globe-lab-colly-variants.css", import.meta.url),
      "utf8",
    );

    expect(mapSource).toContain(
      'data-city-detail-open={selectedCity ? "true" : undefined}',
    );
    expect(mapSource).toContain(
      'placement={usesProductionAtlasIndex',
    );
    expect(mapSource).toContain('? "atlas-statement-slot"');
    expect(panelSource).toContain('placement?: "default" | "statement-slot" | "atlas-statement-slot"');
    expect(panelSource).toContain('data-placement={usesProductionStatementSlot ? "atlas-statement-slot" : usesStatementSlot ? "statement-slot" : "default"}');
    expect(panelSource).toContain(
      "top: usesProductionStatementSlot ? '5.6rem' : 0",
    );
    expect(panelSource).toContain(
      "left: usesProductionStatementSlot\n            ? 'clamp(2.4rem, 4.5vw, 5rem)'",
    );
    expect(panelSource).toContain(
      "? 'min(26rem, calc(31vw - clamp(2.4rem, 4.5vw, 5rem) - 1.75rem))'",
    );
    expect(css).toContain(':has(.ig-container[data-city-detail-open="true"])');
    expect(css).toContain(
      '.ig-container[data-city-detail-open="true"] {\n  overflow: visible !important;',
    );
  });

  it("morphs the Atlas city detail into the statement slot and draws a complete key-color map frame", () => {
    const panelSource = readFileSync(
      new URL(
        "../components/InteractiveGlobeMap/VenuePanel.tsx",
        import.meta.url,
      ),
      "utf8",
    );
    const css = readFileSync(
      new URL(
        "../components/InteractiveGlobeMap/InteractiveGlobe.css",
        import.meta.url,
      ),
      "utf8",
    );

    expect(panelSource).toContain(
      'usesProductionStatementSlot ? "ig-venue-panel ig-venue-panel--atlas-swap"',
    );
    expect(panelSource).toContain(
      "bottom: usesProductionStatementSlot ? 'calc(5.8rem + 0.75rem)'",
    );
    expect(panelSource).toContain(
      "background: usesStatementSlot ? 'transparent'",
    );
    expect(css).not.toContain('[data-city-detail-open="true"] .ig-globe-container {\n    left: 0;');
    expect(css).toContain('.ig-venue-panel--atlas-swap');
    expect(css).toContain('.ig-globe-container::after');
    expect(css).toContain('border-image: linear-gradient(');
    expect(css).toContain('transform: scaleX(0.02);');
    expect(css).toContain('transform: scaleX(1);');
    expect(css).toContain('.ig-globe-canvas:focus-visible {\n    outline: 0;');
    expect(css).toContain(
      '[data-city-detail-open="true"] .ig-globe-container::after',
    );
  });

  it("reveals the Atlas minimap before a capped museum-row stagger", () => {
    const panelSource = readFileSync(
      new URL(
        "../components/InteractiveGlobeMap/VenuePanel.tsx",
        import.meta.url,
      ),
      "utf8",
    );
    const css = readFileSync(
      new URL(
        "../components/InteractiveGlobeMap/InteractiveGlobe.css",
        import.meta.url,
      ),
      "utf8",
    );

    expect(panelSource).toContain('className="ig-venue-panel__minimap-reveal"');
    expect(panelSource).toContain('className="ig-venue-panel__venue-row"');
    expect(panelSource).toContain("delay: prefersReducedMotion ? 0 : 0.18 + Math.min(idx, 8) * 0.032");
    expect(css).toContain(".ig-venue-panel--atlas-swap .ig-venue-panel__minimap-reveal");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
  });

  it("keeps continent movement on the globe instead of a duplicate top control", () => {
    const colly = getGlobeLabCandidate("colly-evolved");
    expect(colly).not.toBeNull();
    if (!colly) return;

    for (const variant of COLLY_GLOBE_VARIANTS) {
      const html = render(createElement(GlobeLabPage, {
        candidate: colly,
        collyVariant: variant.slug,
      }));

      expect(html).not.toContain('class="ig-region-pills"');
      expect(html).not.toContain('data-continent-structure=');
      expect(html).not.toContain('class="ig-continent-key');
    }
  });

  it("removes rejected variant palettes and map frame styling from COLLY CSS", () => {
    const source = readFileSync(
      new URL("../globe-lab/globe-lab-colly-variants.css", import.meta.url),
      "utf8",
    );

    expect(source).not.toMatch(/#58d1d3|#d6c49b|#c66a54|#e8895d|#afc0c8/i);
    expect(source).not.toMatch(/Soft Contour|Signal Cartography|Night Relief|Ink Atlas|Legible Boundaries/i);
    expect(source).not.toMatch(/clip-path|backdrop-filter/);
    expect(source).toContain('data-colly-map-technique="atlas-index"');
    expect(source).toContain('data-colly-map-technique="margin-ledger"');
    expect(source).toContain('data-colly-map-technique="radial-register"');
    expect(source).toContain('data-colly-map-technique="country-folio"');
    expect(source).toContain('data-colly-map-technique="coordinate-index"');
    expect(source).toContain('data-colly-map-technique="city-gazetteer"');
    expect(source).toMatch(/min-height:\s*44px/);
  });

  it("does not change the production globe keyboard contract", () => {
    const html = render(createElement(InteractiveGlobeMap, { exhibitions }));

    expect(html).not.toContain('role="group"');
    expect(html).not.toContain('aria-keyshortcuts=');
    expect(html).not.toContain('tabindex="0"');
    expect(html).not.toContain('data-region-key=');
    expect(html).not.toContain('data-globe-render-style=');
    expect(html).not.toContain('data-globe-label-mode=');
    expect(html).not.toContain('data-globe-preview-marker=');
    expect(html).not.toContain('data-colly-globe-variant=');
    expect(html).not.toContain('data-colly-map-technique=');
    expect(html).not.toContain('ig-region-pill__count');
  });

  it("does not render the removed continent control on the production map", () => {
    const html = render(createElement(InteractiveGlobeMap, { exhibitions }));

    expect(html).not.toContain('data-continent-control-style=');
    expect(html).not.toContain('class="ig-region-pills"');
    expect(html).not.toContain('class="ig-continent-key');
    expect(html).not.toContain('data-colly-globe-variant=');
  });

  it("passes the Atlas boundary style into the production globe", () => {
    const html = render(createElement(InteractiveGlobeMap as any, {
      exhibitions,
      countryBoundaryStyle: "atlas-index",
    }));

    expect(html).toContain('data-country-boundary-style="atlas-index"');
    expect(html).not.toContain('data-colly-globe-variant=');
  });

  it("applies the Atlas Index renderer to the production globe without lab furniture", () => {
    const html = render(createElement(InteractiveGlobeMap as any, {
      exhibitions,
      globeVisualPreset: "colly-evolved",
      collyVariant: "atlas-index",
      countryBoundaryStyle: "atlas-index",
    }));

    expect(html).toContain('data-globe-visual-preset="colly-evolved"');
    expect(html).toContain('data-colly-globe-variant="atlas-index"');
    expect(html).toContain('data-colly-map-technique="atlas-index"');
    expect(html).not.toContain('ig-container--colly-evolved');
    expect(html).not.toContain('colly-variant-switcher');
  });

  it("carries the Atlas Index statement, city panel slot, and modal introduction into production", () => {
    const introduction = {
      eyebrow: "Map reading method",
      headline: "Explore the map from its borders.",
      summary: "Zoom until each museum count settles above its country.",
      instruction: "Drag, zoom, then select a country",
    };
    const detailIntroduction = {
      eyebrow: "Collection detail",
      headline: "Move from place to collection.",
      summary: "Follow the selected museum through its works.",
      instruction: "Move down to open works.",
    };
    const html = render(createElement(InteractiveGlobeMap as any, {
      exhibitions,
      globeVisualPreset: "colly-evolved",
      collyVariant: "atlas-index",
      mapIntroduction: introduction,
      detailIntroduction,
    }));
    const mapSource = readFileSync(
      new URL("../components/InteractiveGlobeMap/InteractiveGlobeMap.tsx", import.meta.url),
      "utf8",
    );
    const panelSource = readFileSync(
      new URL("../components/InteractiveGlobeMap/VenuePanel.tsx", import.meta.url),
      "utf8",
    );
    const modalSource = readFileSync(
      new URL("../components/InteractiveGlobeMap/InteractiveGlobeRealModal.tsx", import.meta.url),
      "utf8",
    );
    const mapCss = readFileSync(
      new URL("../components/InteractiveGlobeMap/InteractiveGlobe.css", import.meta.url),
      "utf8",
    );

    expect(html).toContain('data-production-atlas-index="true"');
    expect(html).toContain('class="ig-atlas-statement"');
    expect(html).toContain("Explore the map from its borders.");
    expect(mapSource).toContain('mapIntroduction?: GlobeDetailIntroduction');
    expect(mapSource).toContain('"atlas-statement-slot"');
    expect(panelSource).toContain('"atlas-statement-slot"');
    expect(modalSource).toContain("ig-atlas-detail-statement");
    expect(modalSource).toContain("height: detailIntroduction ? '70vh' : '52vh'");
    expect(modalSource).toContain("minHeight: detailIntroduction ? '32rem' : '340px'");
    expect(modalSource).toContain('className="igrm-atlas-introduction-scrim"');
    expect(mapCss).toContain(
      '.ig-container[data-production-atlas-index="true"] .ig-globe-container',
    );
    expect(mapCss).toContain(".ig-atlas-statement");
    expect(mapCss).toContain(".ig-atlas-detail-statement");
  });

  it("enables the Atlas boundary style without a redundant top control", () => {
    const source = readFileSync(
      new URL("../pages/HomePage.tsx", import.meta.url),
      "utf8",
    );

    expect(source).not.toContain('continentControlStyle="margin-ledger"');
    expect(source).toContain('countryBoundaryStyle="atlas-index"');
    expect(source).toContain('globeVisualPreset="colly-evolved"');
    expect(source).toContain('collyVariant="atlas-index"');
    expect(source).toContain('mapIntroduction={{');
    expect(source).toContain('detailIntroduction={{');
    expect(source).toContain('경계에서 지도를 탐구하세요.');
    expect(source).toContain('장소에서 작품으로 들어갑니다.');
  });

  it("passes a mobile chrome tweak without enabling a globe lab variant", () => {
    const html = render(createElement(InteractiveGlobeMap as any, {
      exhibitions,
      mobileChromeTweak: "museum-ticket",
    }));

    expect(html).toContain('data-mobile-chrome-tweak="museum-ticket"');
    expect(html).not.toContain('data-colly-globe-variant=');
  });

  it("wires the mobile chrome query to both production chrome surfaces", () => {
    const appSource = readFileSync(new URL("../App.tsx", import.meta.url), "utf8");
    const homeSource = readFileSync(new URL("../pages/HomePage.tsx", import.meta.url), "utf8");

    expect(appSource).toContain("resolveMobileChromeTweak");
    expect(appSource).toContain("mobileChromeTweak={mobileChromeTweak}");
    expect(homeSource).toContain("resolveMobileChromeTweak");
    expect(homeSource).toContain("mobileChromeTweak={mobileChromeTweak}");
  });

  it("defines six mobile-only continent control structures", () => {
    const source = readFileSync(
      new URL("../components/InteractiveGlobeMap/InteractiveGlobe.css", import.meta.url),
      "utf8",
    );

    for (const tweak of [
      "museum-ticket",
      "editorial-accordion",
      "double-bezel",
      "adaptive-ledger",
      "accessible-tray",
      "colly-hybrid",
    ]) {
      expect(source).toContain(`data-mobile-chrome-tweak="${tweak}"`);
    }
    expect(source).toMatch(/@media\s*\(max-width:\s*720px\)/);
    expect(source).toContain("scroll-snap-type");
    expect(source).toContain("env(safe-area-inset-top");
    expect(source).toMatch(/min-height:\s*44px/);
    expect(source).toContain("@media (max-width: 1280px)");
    expect(source).toMatch(/flex:\s*1 0 6\.8rem/);
    expect(source).toContain("prefers-reduced-motion: reduce");
  });

  it("keeps global map navigation out of the drilled header", () => {
    const source = readFileSync(
      new URL("../components/InteractiveGlobeMap/InteractiveGlobeMap.tsx", import.meta.url),
      "utf8",
    );

    expect(source).not.toContain("Back to full map");
    expect(source).not.toContain("BACK TO MAP");
    expect(source).not.toContain("shouldShowMapResetControl");
    expect(source).not.toContain("resetMapView");
  });
});

describe("globe visual presets", () => {
  it("keeps front-facing museum countries eligible without projected markers", () => {
    const deriveCountryCandidates = (collyTechniqueRenderer as unknown as {
      deriveCountryCandidates?: (args: any) => Array<{ id: string }>;
    }).deriveCountryCandidates;

    expect(typeof deriveCountryCandidates).toBe("function");
    if (!deriveCountryCandidates) return;
    const square = (longitude: number, latitude: number) => ({
      type: "Feature",
      geometry: {
        type: "Polygon",
        coordinates: [[
          [longitude - 0.5, latitude - 0.5],
          [longitude - 0.5, latitude + 0.5],
          [longitude + 0.5, latitude + 0.5],
          [longitude + 0.5, latitude - 0.5],
          [longitude - 0.5, latitude - 0.5],
        ]],
      },
    });

    const candidates = deriveCountryCandidates({
      projection: ([longitude, latitude]: [number, number]) => [
        200 + longitude,
        160 - latitude,
      ],
      museums: [
        { id: "oslo", city: "Oslo", country: "Norway", coordinates: [10, 60], artworkCount: 3 },
        { id: "copenhagen", city: "Copenhagen", country: "Denmark", coordinates: [12, 56], artworkCount: 6 },
      ],
      projectedMuseums: [],
      countryFeatures: [
        { name: "Norway", feature: square(10, 60) },
        { name: "Denmark", feature: square(12, 56) },
      ],
      viewCenter: [11, 58],
      width: 400,
      height: 320,
    });

    expect(candidates.map((country) => country.id)).toEqual(["Norway", "Denmark"]);
  });

  it("keeps museum countries without 110m geometry in the shared candidate set", () => {
    const deriveCountryCandidates = (collyTechniqueRenderer as unknown as {
      deriveCountryCandidates?: (args: any) => Array<{
        id: string;
        anchorX: number;
        anchorY: number;
      }>;
    }).deriveCountryCandidates;

    expect(typeof deriveCountryCandidates).toBe("function");
    if (!deriveCountryCandidates) return;

    const projection = ([longitude, latitude]: [number, number]) => [
      200 + longitude,
      160 - latitude,
    ] as [number, number];
    const candidates = deriveCountryCandidates({
      projection,
      museums: [
        { id: "hong-kong", city: "Hong Kong", country: "Hong Kong", coordinates: [114.17, 22.32], artworkCount: 2 },
        { id: "singapore", city: "Singapore", country: "Singapore", coordinates: [103.82, 1.35], artworkCount: 2 },
      ],
      countryFeatures: [],
      viewCenter: [109, 12],
      width: 480,
      height: 320,
    });

    expect(candidates.map((country) => country.id)).toEqual(["Hong Kong", "Singapore"]);
    expect([candidates[0].anchorX, candidates[0].anchorY]).toEqual(
      projection([114.17, 22.32]),
    );
    expect([candidates[1].anchorX, candidates[1].anchorY]).toEqual(
      projection([103.82, 1.35]),
    );
  });

  it("anchors multipart Atlas countries to their primary landmass", () => {
    const deriveCountryCandidates = (collyTechniqueRenderer as unknown as {
      deriveCountryCandidates?: (args: any) => Array<{ id: string; anchorX: number; anchorY: number }>;
    }).deriveCountryCandidates;

    expect(typeof deriveCountryCandidates).toBe("function");
    if (!deriveCountryCandidates) return;
    const overseas = [[-54, 2], [-54, 6], [-50, 6], [-50, 2], [-54, 2]];
    const mainland = [[-5, 42], [-5, 51], [8, 51], [8, 42], [-5, 42]];
    const feature = {
      type: "Feature",
      geometry: {
        type: "MultiPolygon",
        coordinates: [[[...overseas]], [[...mainland]]],
      },
    };
    const projection = ([longitude, latitude]: [number, number]) => [
      300 + longitude * 4,
      300 - latitude * 4,
    ] as [number, number];

    const [candidate] = deriveCountryCandidates({
      projection,
      museums: [
        { id: "paris", city: "Paris", country: "France", coordinates: [2, 48], artworkCount: 40 },
      ],
      projectedMuseums: [],
      countryFeatures: [{ name: "France", feature }],
      viewCenter: [2, 46],
      width: 800,
      height: 600,
    });

    expect(candidate.id).toBe("France");
    expect([candidate.anchorX, candidate.anchorY]).toEqual(
      projection(d3.geoCentroid({ type: "Polygon", coordinates: [[...mainland]] }) as [number, number]),
    );
  });

  it("splits radial countries into visible map labels and hidden rim labels", () => {
    const deriveRadialCountryCandidates = (collyTechniqueRenderer as unknown as {
      deriveRadialCountryCandidates?: (args: any) => {
        visible: Array<{ id: string; anchorX: number; anchorY: number }>;
        hidden: Array<{ id: string; anchorX: number; anchorY: number }>;
      };
    }).deriveRadialCountryCandidates;

    expect(typeof deriveRadialCountryCandidates).toBe("function");
    if (!deriveRadialCountryCandidates) return;
    const square = (longitude: number, latitude: number) => ({
      type: "Feature",
      geometry: {
        type: "Polygon",
        coordinates: [[
          [longitude - 0.5, latitude - 0.5],
          [longitude - 0.5, latitude + 0.5],
          [longitude + 0.5, latitude + 0.5],
          [longitude + 0.5, latitude - 0.5],
          [longitude - 0.5, latitude - 0.5],
        ]],
      },
    });

    const result = deriveRadialCountryCandidates({
      projection: ([longitude, latitude]: [number, number]) => [
        400 + longitude,
        300 - latitude,
      ],
      museums: [
        { id: "paris", city: "Paris", country: "France", coordinates: [2, 48], artworkCount: 40 },
        { id: "auckland", city: "Auckland", country: "New Zealand", coordinates: [174, -37], artworkCount: 20 },
      ],
      countryFeatures: [
        { name: "France", feature: square(2, 48) },
        { name: "New Zealand", feature: square(174, -37) },
      ],
      viewCenter: [2, 48],
      width: 800,
      height: 600,
      center: [400, 300],
      radius: 220,
    });

    expect(result.visible.map((country) => country.id)).toEqual(["France"]);
    expect(result.hidden.map((country) => country.id)).toEqual(["New Zealand"]);
    expect(Math.hypot(
      result.visible[0].anchorX - 400,
      result.visible[0].anchorY - 300,
    )).toBeLessThan(220);
    expect(Math.hypot(
      result.hidden[0].anchorX - 400,
      result.hidden[0].anchorY - 300,
    )).toBeCloseTo(220, 5);
  });

  it("keeps every radial rim country by distributing colliding bearings", () => {
    const labels = placeRadialRegisterLabels(
      Array.from({ length: 5 }, (_, index) => ({
        id: `country-${index}`,
        label: `Country ${index}`,
        anchorX: 620,
        anchorY: 300,
        weight: 100 - index,
      })),
      {
        center: [400, 300],
        radius: 220,
        width: 800,
        height: 600,
        inset: 16,
        limit: 5,
        minAngularGap: 0.14,
      },
    );

    expect(labels).toHaveLength(5);
    expect(new Set(labels.map((label) => label.angle)).size).toBe(5);
  });

  it("provides production-safe underlay and overlay hooks for every technique", () => {
    expect(Object.keys(COLLY_MAP_TECHNIQUE_RENDERERS)).toEqual([
      "atlas-index",
      "margin-ledger",
      "radial-register",
      "country-folio",
      "coordinate-index",
      "city-gazetteer",
    ]);

    const calls: string[] = [];
    const ctx = {
      save: () => calls.push("save"),
      restore: () => calls.push("restore"),
    } as unknown as CanvasRenderingContext2D;
    const args = {
      ctx,
      path: () => undefined,
      projection: () => [0, 0] as [number, number],
      sphere: { type: "Sphere" },
      land: null,
      borders: null,
      countryFeatures: [],
      palette: resolveGlobeVisualPalette(undefined, "dark"),
      profile: resolveCollyGlobeVariantProfile("atlas-index"),
      museums: [],
      projectedMuseums: [],
      activeContinent: null,
      currentScale: 1,
      drilled: false,
      focusedMuseumId: null,
      reducedMotion: false,
      width: 800,
      height: 600,
      center: [400, 300],
      radius: 220,
      viewCenter: [0, 0],
    } satisfies CollyMapTechniqueRenderArgs;

    expect(drawTechniqueUnderlay(args)).toBe(true);
    expect(drawTechniqueOverlay(args)).toBe(true);
    expect(calls).toEqual(["save", "restore", "save", "restore"]);
  });

  it("draws Atlas Index borders as one readable round-capped pass", () => {
    const roundedBorders = {
      type: "MultiLineString",
      coordinates: [[[0, 0], [1, 0.5], [2, 0]]],
    };
    const pathCalls: any[] = [];
    let strokeCount = 0;
    let strokedLineCap: CanvasLineCap = "butt";
    let strokedLineJoin: CanvasLineJoin = "miter";
    let strokedLineWidth = 0;
    let strokedStyle = "";
    let activeLineCap: CanvasLineCap = "butt";
    let activeLineJoin: CanvasLineJoin = "miter";
    let activeLineWidth = 0;
    let activeStrokeStyle = "";
    const ctx = {
      save: () => undefined,
      restore: () => undefined,
      beginPath: () => undefined,
      stroke: () => {
        strokeCount += 1;
        strokedLineCap = activeLineCap;
        strokedLineJoin = activeLineJoin;
        strokedLineWidth = activeLineWidth;
        strokedStyle = activeStrokeStyle;
      },
      set lineCap(value: CanvasLineCap) { activeLineCap = value; },
      set lineJoin(value: CanvasLineJoin) { activeLineJoin = value; },
      set lineWidth(value: number) { activeLineWidth = value; },
      set strokeStyle(value: string) { activeStrokeStyle = value; },
    } as unknown as CanvasRenderingContext2D;
    const args = {
      ctx,
      path: (geometry: any) => { pathCalls.push(geometry); },
      projection: () => [0, 0] as [number, number],
      sphere: { type: "Sphere" },
      land: null,
      borders: roundedBorders,
      countryFeatures: [],
      palette: resolveGlobeVisualPalette(undefined, "dark"),
      profile: resolveCollyGlobeVariantProfile("atlas-index"),
      museums: [],
      projectedMuseums: [],
      activeContinent: null,
      currentScale: 1,
      drilled: false,
      focusedMuseumId: null,
      reducedMotion: false,
      width: 800,
      height: 600,
      center: [400, 300],
      radius: 220,
      viewCenter: [0, 0],
    } satisfies CollyMapTechniqueRenderArgs;

    expect(drawTechniqueOverlay(args)).toBe(true);
    expect(pathCalls).toEqual([roundedBorders]);
    expect(strokeCount).toBe(1);
    expect(strokedLineCap).toBe("round");
    expect(strokedLineJoin).toBe("round");
    expect(strokedLineWidth).toBeLessThanOrEqual(0.65);
    expect(Number(strokedStyle.match(/,([0-9.]+)\)$/)?.[1])).toBeGreaterThanOrEqual(0.16);
  });

  it("keeps Atlas Index boundary styling thin on compact and regular viewports", () => {
    const resolveStyle = (collyTechniqueRenderer as unknown as {
      resolveAtlasBoundaryStyle?: (width: number) => { alpha: number; width: number };
    }).resolveAtlasBoundaryStyle;

    expect(typeof resolveStyle).toBe("function");
    if (!resolveStyle) return;
    expect(resolveStyle(390)).toEqual({ alpha: 0.2, width: 0.62 });
    expect(resolveStyle(800)).toEqual({ alpha: 0.17, width: 0.55 });
  });

  it("reuses the Atlas boundary pass on the production globe", () => {
    const resolveStyle = (globeCanvasStyles as unknown as {
      resolveAtlasBoundaryStyle?: (width: number) => { alpha: number; width: number };
    }).resolveAtlasBoundaryStyle;
    const drawStyledBorders = (globeCanvasStyles as unknown as {
      drawStyledBorders?: (args: any) => void;
    }).drawStyledBorders;
    let strokeCount = 0;
    let activeWidth = 0;
    let activeStyle = "";
    let activeCap: CanvasLineCap = "butt";
    let activeJoin: CanvasLineJoin = "miter";
    const strokes: Array<{ width: number; style: string; cap: CanvasLineCap; join: CanvasLineJoin }> = [];
    const ctx = {
      save: () => undefined,
      restore: () => undefined,
      beginPath: () => undefined,
      setLineDash: () => undefined,
      stroke: () => {
        strokeCount += 1;
        strokes.push({ width: activeWidth, style: activeStyle, cap: activeCap, join: activeJoin });
      },
      set lineWidth(value: number) { activeWidth = value; },
      set strokeStyle(value: string) { activeStyle = value; },
      set lineCap(value: CanvasLineCap) { activeCap = value; },
      set lineJoin(value: CanvasLineJoin) { activeJoin = value; },
    } as unknown as CanvasRenderingContext2D;

    expect(typeof resolveStyle).toBe("function");
    expect(typeof drawStyledBorders).toBe("function");
    if (!resolveStyle || !drawStyledBorders) return;
    expect(resolveStyle(390)).toEqual({ alpha: 0.2, width: 0.62 });
    expect(resolveStyle(1200)).toEqual({ alpha: 0.17, width: 0.55 });
    drawStyledBorders({
      ctx,
      path: () => undefined,
      sphere: { type: "Sphere" },
      graticule: null,
      center: [400, 300],
      radius: 220,
      palette: resolveGlobeVisualPalette(undefined, "dark"),
      profile: resolveGlobeRenderProfile(undefined),
      drillOpacity: 0,
      density: "regular",
      geometry: { type: "MultiLineString", coordinates: [] },
      boundaryStyle: "atlas-index",
      viewportWidth: 1200,
    });

    expect(strokeCount).toBe(1);
    expect(strokes[0]).toMatchObject({ width: 0.55, cap: "round", join: "round" });
    expect(strokes[0].style).toMatch(/,0\.17\)$/);
  });

  it("places every visible Atlas count above a larger country label at deep zoom", () => {
    const fillTextCalls: Array<{
      text: string;
      x: number;
      y: number;
      textAlign: CanvasTextAlign;
      font: string;
    }> = [];
    let strokeCount = 0;
    let activeTextAlign: CanvasTextAlign = "start";
    let activeFont = "";
    const ctx = {
      save: () => undefined,
      restore: () => undefined,
      beginPath: () => undefined,
      moveTo: () => undefined,
      lineTo: () => undefined,
      arc: () => undefined,
      stroke: () => { strokeCount += 1; },
      fill: () => undefined,
      fillText: (text: string, x: number, y: number) => {
        fillTextCalls.push({ text, x, y, textAlign: activeTextAlign, font: activeFont });
      },
      set strokeStyle(_value: string) {},
      set fillStyle(_value: string) {},
      set lineWidth(_value: number) {},
      set lineCap(_value: CanvasLineCap) {},
      set lineJoin(_value: CanvasLineJoin) {},
      set textAlign(value: CanvasTextAlign) { activeTextAlign = value; },
      set textBaseline(_value: CanvasTextBaseline) {},
      set font(value: string) { activeFont = value; },
    } as unknown as CanvasRenderingContext2D;
    const square = (longitude: number, latitude: number) => ({
      type: "Feature",
      geometry: {
        type: "Polygon",
        coordinates: [[
          [longitude - 0.6, latitude - 0.6],
          [longitude - 0.6, latitude + 0.6],
          [longitude + 0.6, latitude + 0.6],
          [longitude + 0.6, latitude - 0.6],
          [longitude - 0.6, latitude - 0.6],
        ]],
      },
    });
    const museums = [
      ...Array.from({ length: 40 }, (_, index) => ({
        id: `france-${index}`,
        city: "Paris",
        country: "France",
        coordinates: [2, 48] as [number, number],
        artworkCount: 1,
      })),
      ...Array.from({ length: 3 }, (_, index) => ({
        id: `norway-${index}`,
        city: "Oslo",
        country: "Norway",
        coordinates: [10, 62] as [number, number],
        artworkCount: 1,
      })),
      ...Array.from({ length: 6 }, (_, index) => ({
        id: `denmark-${index}`,
        city: "Copenhagen",
        country: "Denmark",
        coordinates: [12, 56] as [number, number],
        artworkCount: 1,
      })),
    ];
    const projection = ([longitude, latitude]: [number, number]) => [
      240 + longitude * 5,
      440 - latitude * 5,
    ] as [number, number];
    const countryFeatures = [
      { name: "France", feature: square(2, 48) },
      { name: "Norway", feature: square(10, 62) },
      { name: "Denmark", feature: square(12, 56) },
    ];
    const args = {
      ctx,
      path: () => undefined,
      projection,
      sphere: { type: "Sphere" },
      land: null,
      borders: { type: "MultiLineString", coordinates: [] },
      countryFeatures,
      palette: resolveGlobeVisualPalette(undefined, "dark"),
      profile: resolveCollyGlobeVariantProfile("atlas-index"),
      museums,
      projectedMuseums: [],
      activeContinent: "Europe",
      currentScale: 2.25,
      drilled: false,
      focusedMuseumId: null,
      reducedMotion: false,
      width: 800,
      height: 600,
      center: [400, 300],
      radius: 220,
      viewCenter: [5, 55],
    } satisfies CollyMapTechniqueRenderArgs;

    expect(drawTechniqueOverlay(args)).toBe(true);
    expect(new Set(fillTextCalls.map((call) => call.text))).toEqual(new Set([
      "40", "FRANCE",
      "03", "NORWAY",
      "06", "DENMARK",
    ]));
    expect(fillTextCalls.every((call) => call.textAlign === "center")).toBe(true);
    expect(strokeCount).toBe(1);
    for (const country of countryFeatures) {
      const anchor = projection(d3.geoCentroid(country!.feature) as [number, number]);
      const nameCall = fillTextCalls.find((call) => call.text === country.name.toUpperCase());
      const count = country.name === "France" ? "40" : country.name === "Norway" ? "03" : "06";
      const countCall = fillTextCalls.find((call) => call.text === count);
      expect(nameCall).toBeTruthy();
      expect(countCall).toBeTruthy();
      expect(nameCall!.x).toBe(anchor[0]);
      expect(countCall!.x).toBe(anchor[0]);
      expect(countCall!.y).toBeLessThan(nameCall!.y);
      expect(nameCall!.font).toMatch(/\b9px\b/);
    }
  });

  it("keeps lower-ranked Atlas countries legible at the world zoom", () => {
    const labels: string[] = [];
    const ctx = {
      save: () => undefined,
      restore: () => undefined,
      beginPath: () => undefined,
      moveTo: () => undefined,
      lineTo: () => undefined,
      arc: () => undefined,
      stroke: () => undefined,
      fill: () => undefined,
      fillText: (text: string) => { labels.push(text); },
      set strokeStyle(_value: string) {},
      set fillStyle(_value: string) {},
      set lineWidth(_value: number) {},
      set lineCap(_value: CanvasLineCap) {},
      set lineJoin(_value: CanvasLineJoin) {},
      set textAlign(_value: CanvasTextAlign) {},
      set textBaseline(_value: CanvasTextBaseline) {},
      set font(_value: string) {},
    } as unknown as CanvasRenderingContext2D;
    const square = (longitude: number) => ({
      type: "Feature",
      geometry: {
        type: "Polygon",
        coordinates: [[
          [longitude - 0.2, -0.2],
          [longitude - 0.2, 0.2],
          [longitude + 0.2, 0.2],
          [longitude + 0.2, -0.2],
          [longitude - 0.2, -0.2],
        ]],
      },
    });
    const countries = Array.from({ length: 19 }, (_, index) => (
      index === 18 ? "Denmark" : `Country ${String(index).padStart(2, "0")}`
    ));
    const museums = countries.map((country, index) => ({
      id: `museum-${index}`,
      city: country,
      country,
      coordinates: [index - 9, 0] as [number, number],
      artworkCount: countries.length - index,
    }));
    const args = {
      ctx,
      path: () => undefined,
      projection: ([longitude]: [number, number]) => [400 + longitude * 12, 300] as [number, number],
      sphere: { type: "Sphere" },
      land: null,
      borders: null,
      countryFeatures: countries.map((name, index) => ({ name, feature: square(index - 9) })),
      palette: resolveGlobeVisualPalette(undefined, "dark"),
      profile: resolveCollyGlobeVariantProfile("atlas-index"),
      museums,
      projectedMuseums: [],
      activeContinent: null,
      currentScale: 1,
      drilled: false,
      focusedMuseumId: null,
      reducedMotion: false,
      width: 800,
      height: 600,
      center: [400, 300],
      radius: 220,
      viewCenter: [0, 0],
    } satisfies CollyMapTechniqueRenderArgs;

    expect(drawTechniqueOverlay(args)).toBe(true);
    expect(labels).toContain("DENMARK");
  });

  it("falls back to production preview markers when derived data is unavailable", () => {
    expect(shouldDrawProductionPreviewMarkers("atlas-index", {
      drilled: false,
      derivedDataAvailable: true,
    })).toBe(false);
    expect(shouldDrawProductionPreviewMarkers("country-folio", {
      drilled: false,
      derivedDataAvailable: true,
    })).toBe(false);
    expect(shouldDrawProductionPreviewMarkers("atlas-index", {
      drilled: true,
      derivedDataAvailable: true,
    })).toBe(true);
    expect(shouldDrawProductionPreviewMarkers("city-gazetteer", {
      drilled: false,
      derivedDataAvailable: false,
    })).toBe(true);
  });

  it("defines six Atlas-family map techniques without rejected surface contracts", () => {
    const profiles = Object.values(COLLY_GLOBE_VARIANT_PROFILES);

    expect(profiles.map((profile) => profile.technique)).toEqual([
      "atlas-index",
      "margin-ledger",
      "radial-register",
      "country-folio",
      "coordinate-index",
      "city-gazetteer",
    ]);
    expect(profiles.every((profile) => profile.scaleRatio === 0.38)).toBe(true);
    expect(profiles.every((profile) => (
      profile.offset[0] === 0 && profile.offset[1] === 0
    ))).toBe(true);
    expect(JSON.stringify(profiles)).not.toMatch(
      /palette|color|frame|clip|aperture|glow|atmosphere/i,
    );
  });

  it("implements six distinct Atlas renderers without the rejected vertical bars", () => {
    const source = readFileSync(
      new URL(
        "../components/InteractiveGlobeMap/collyMapTechniqueRenderer.ts",
        import.meta.url,
      ),
      "utf8",
    );

    expect(source).not.toMatch(/drawArminRefined|drawCulturalRoutes|drawReliefLayers|drawMuseumTerritories/);
    expect(source).not.toContain("barHeight");
    expect(source).toContain("placeAtlasLocalLabels");
    expect(source).toContain("placeMarginLedgerLabels");
    expect(source).toContain("placeRadialRegisterLabels");
    expect(source).toContain("aggregateMuseumsByCity");
    expect(new Set(Object.values(COLLY_MAP_TECHNIQUE_RENDERERS).map((renderer) => (
      renderer.drawOverlay
    )))).toHaveLength(6);
  });

  it("keeps all COLLY upgrades on the original production globe geometry", () => {
    const profiles = COLLY_GLOBE_VARIANTS.map((variant) => (
      resolveCollyGlobeVariantProfile(variant.slug)
    ));
    const production = resolveGlobeRenderProfile(undefined);

    expect(Object.keys(COLLY_GLOBE_VARIANT_PROFILES)).toEqual(
      COLLY_GLOBE_VARIANTS.map((variant) => variant.slug),
    );
    expect(new Set(profiles.map((profile) => profile.technique))).toHaveLength(6);
    expect(profiles.every((profile) => profile.scaleRatio === production.scaleRatio)).toBe(true);
    expect(profiles.every((profile) => (
      profile.offset[0] === production.offset[0]
      && profile.offset[1] === production.offset[1]
    ))).toBe(true);
  });

  it("resolves deterministic museum emphasis for COLLY data layers", () => {
    expect(resolveCollyMuseumEmphasis("atlas-index", 1200, true)).toMatchObject({
      level: "primary",
    });
    expect(resolveCollyMuseumEmphasis("radial-register", 0, false)).toMatchObject({
      level: "trace",
    });
    expect(resolveCollyMuseumEmphasis("city-gazetteer", 120, false)).toEqual(
      resolveCollyMuseumEmphasis("city-gazetteer", 120, false),
    );
  });

  it("assigns a distinct map render profile to every lab study", () => {
    const resolveProfile = (globeVisuals as unknown as {
      resolveGlobeRenderProfile?: (preset: (typeof GLOBE_LAB_CANDIDATES)[number]["slug"] | undefined) => {
        renderStyle: string;
        scaleRatio: number;
        offset: readonly [number, number];
        labelMode: string;
        previewMarker: string;
      };
    }).resolveGlobeRenderProfile;

    expect(typeof resolveProfile).toBe("function");
    if (!resolveProfile) return;

    const profiles = GLOBE_LAB_CANDIDATES.map((candidate) => resolveProfile(candidate.slug));

    expect(profiles.map((profile) => profile.renderStyle)).toEqual([
      "editorial-plate",
      "signal-radar",
      "nocturne-celestial",
      "colly-focus",
      "accessible-atlas",
    ]);
    expect(new Set(profiles.map((profile) => profile.renderStyle))).toHaveLength(5);
    expect(profiles.map((profile) => profile.scaleRatio)).toEqual([0.5, 0.4, 0.56, 0.44, 0.42]);
    expect(profiles.every((profile) => (
      profile.offset.length === 2
      && profile.offset.every((value) => Math.abs(value) <= 0.2)
    ))).toBe(true);
    expect(resolveProfile("accessible-atlas")).toMatchObject({
      labelMode: "accessible",
      previewMarker: "outlined",
    });
    expect(resolveProfile(undefined)).toEqual({
      renderStyle: "production",
      scaleRatio: 0.38,
      offset: [0, 0],
      labelMode: "production",
      previewMarker: "dot",
      furniture: "none",
      atmosphere: "flat",
    });
  });

  it("preserves production label geometry and reduces compact map density", () => {
    const production = resolveGlobeRenderProfile(undefined);
    const signal = resolveGlobeRenderProfile("signal-observatory");
    const accessible = resolveGlobeRenderProfile("accessible-atlas");

    expect(resolveGlobeViewportDensity(390)).toBe("compact");
    expect(resolveGlobeViewportDensity(901)).toBe("regular");
    expect(resolveContinentLabelFontSize(production, "Asia")).toBe(12);
    expect(resolveContinentLabelFontSize(production, "Europe")).toBe(10);
    expect(resolveContinentLabelVisibility(signal, 4, "compact")).toBe(false);
    expect(resolveContinentLabelVisibility(signal, 4, "regular")).toBe(true);
    expect(resolveContinentLabelVisibility(accessible, 4, "compact")).toBe(true);
  });

  it("keeps the production crosshair round-capped", () => {
    let activeLineCap = "butt";
    let strokedLineCap = "";
    const ctx = {
      save: () => undefined,
      restore: () => undefined,
      beginPath: () => undefined,
      moveTo: () => undefined,
      lineTo: () => undefined,
      stroke: () => { strokedLineCap = activeLineCap; },
      set strokeStyle(_value: string) {},
      set lineWidth(_value: number) {},
      set lineCap(value: CanvasLineCap) { activeLineCap = value; },
    } as unknown as CanvasRenderingContext2D;
    const profile = resolveGlobeRenderProfile(undefined);

    drawGlobeCrosshair({
      ctx,
      path: () => undefined,
      sphere: {},
      graticule: {},
      center: [100, 100],
      radius: 80,
      palette: resolveGlobeVisualPalette(undefined, "dark"),
      profile,
      drillOpacity: 0,
      density: "regular",
    });

    expect(strokedLineCap).toBe("round");
  });

  it("defines a complete canvas palette for every lab candidate", () => {
    expect(Object.keys(GLOBE_VISUAL_PRESETS)).toEqual(
      GLOBE_LAB_CANDIDATES.map((candidate) => candidate.slug),
    );

    for (const palette of Object.values(GLOBE_VISUAL_PRESETS)) {
      expect(palette.ocean).toBeTruthy();
      expect(palette.land).toBeTruthy();
      expect(palette.border).toBeTruthy();
      expect(palette.label).toBeTruthy();
      expect(palette.majorMarker).toBeTruthy();
      expect(palette.minorMarker).toBeTruthy();
      expect(palette.atmosphere).toBeTruthy();
    }
  });

  it("preserves the production palette when no lab preset is supplied", () => {
    expect(resolveGlobeVisualPalette(undefined, "dark")).toMatchObject({
      ocean: "rgba(255,255,255,0.012)",
      atmosphere: "rgba(255,255,255,0.08)",
      accent: "#D4A547",
    });
    expect(resolveGlobeVisualPalette(undefined, "light").accent).toBe("#8A6B1F");
  });

  it("scales lab globes up without changing the production globe", () => {
    expect(resolveGlobeScaleRatio("accessible-atlas")).toBe(0.42);
    expect(resolveGlobeScaleRatio(undefined)).toBe(0.38);
  });
});
