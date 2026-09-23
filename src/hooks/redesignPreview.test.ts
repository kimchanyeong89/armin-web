import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import {
  PREVIEW_CONCEPTS,
  PREVIEW_VIEWS,
  buildExhibitionModalPath,
  buildEvolvedPath,
  buildPreviewPath,
  isPreviewPath,
  parseEvolvedPath,
  parsePreviewPath,
} from "../redesign/model";
import {
  createPreviewData,
  getExhibitionModalWorks,
  getGlobeMuseums,
  selectPreviewArtist,
  selectPreviewArtwork,
  selectPreviewExhibition,
} from "../redesign/data";
import { SAMPLE_COMMUNITY_POSTS } from "../data/sampleCommunityPosts";
import { EvolvedExperience, PreviewExperience, PreviewIndex } from "../redesign/RedesignApp";

describe("redesign preview route contract", () => {
  it("defines three concepts and nine comparable views", () => {
    expect(PREVIEW_CONCEPTS).toEqual(["hybrid", "dark", "light"]);
    expect(PREVIEW_VIEWS).toEqual([
      "home",
      "search",
      "ai",
      "community",
      "exhibitions",
      "profile",
      "work",
      "artist",
      "exhibition",
    ]);
  });

  it("parses a concept, view, and decoded record id", () => {
    expect(parsePreviewPath("/redesign/dark/work/Anna%20Ancher")).toEqual({
      concept: "dark",
      view: "work",
      id: "Anna Ancher",
    });
  });

  it("does not throw on malformed encoded record ids", () => {
    expect(() => parseEvolvedPath("/redesign/evolved/work/%E0%A4%A")).not.toThrow();
    expect(parseEvolvedPath("/redesign/evolved/work/%E0%A4%A")).toEqual({
      panel: "work",
      id: "%E0%A4%A",
    });
  });

  it("rejects unknown concepts and views", () => {
    expect(parsePreviewPath("/redesign/neon/home")).toBeNull();
    expect(parsePreviewPath("/redesign/dark/settings")).toBeNull();
  });

  it("matches only the isolated preview route", () => {
    expect(isPreviewPath("/redesign")).toBe(true);
    expect(isPreviewPath("/redesign/light/search")).toBe(true);
    expect(isPreviewPath("/redesigner")).toBe(false);
    expect(isPreviewPath("/search")).toBe(false);
  });

  it("builds a path that preserves view and safely encodes ids", () => {
    expect(buildPreviewPath("hybrid", "artist", "Konrad Mägi")).toBe(
      "/redesign/hybrid/artist/Konrad%20M%C3%A4gi",
    );
    expect(buildPreviewPath("light", "home")).toBe("/redesign/light/home");
  });

  it("builds a deep-linkable exhibition modal path", () => {
    expect(buildExhibitionModalPath("dark", "exhibitions", "anna & light")).toBe(
      "/redesign/dark/exhibitions?exhibition=anna%20%26%20light",
    );
  });
});

describe("Evolved COLLY route contract", () => {
  it("keeps the five familiar panels and a work detail in one shell", () => {
    expect(parseEvolvedPath("/redesign/evolved/globe")).toEqual({ panel: "globe" });
    expect(parseEvolvedPath("/redesign/evolved/work/aa-1")).toEqual({ panel: "work", id: "aa-1" });
    expect(buildEvolvedPath("community")).toBe("/redesign/evolved/community");
    expect(buildEvolvedPath("work", "Anna Ancher")).toBe("/redesign/evolved/work/Anna%20Ancher");
  });
});

describe("redesign preview current-data adapter", () => {
  const data = createPreviewData();

  it("derives content from the existing project sources", () => {
    expect(data.museums.length).toBeGreaterThan(100);
    expect(data.exhibitions.length).toBeGreaterThan(20);
    expect(data.artworks.length).toBeGreaterThan(5);
    expect(data.artists.length).toBeGreaterThan(2);
    expect(data.posts.map((post) => post.id)).toEqual(
      SAMPLE_COMMUNITY_POSTS.map((post) => post.id),
    );
  });

  it("keeps usable images on display records", () => {
    expect(data.museums.slice(0, 12).every((museum) => museum.image.length > 0)).toBe(true);
    expect(data.exhibitions.slice(0, 12).every((exhibition) => exhibition.image.length > 0)).toBe(true);
    expect(data.artworks.every((artwork) => artwork.image.length > 0)).toBe(true);
  });

  it("groups existing artworks into artist records", () => {
    const anna = data.artists.find((artist) => artist.name === "Anna Ancher");
    expect(anna?.works.length).toBeGreaterThanOrEqual(5);
    expect(anna?.works.every((work) => work.artist === "Anna Ancher")).toBe(true);
  });

  it("uses deterministic defaults when a requested id is missing", () => {
    expect(selectPreviewArtwork(data, "missing")).toBe(data.featuredArtwork);
    expect(selectPreviewArtist(data, "missing")).toBe(data.featuredArtist);
    expect(selectPreviewExhibition(data, "missing")).toBe(data.featuredExhibition);
  });

  it("keeps all coordinate-ready museums available to the globe", () => {
    const globeMuseums = getGlobeMuseums(data);

    expect(globeMuseums.length).toBeGreaterThan(100);
    expect(globeMuseums.every((museum) => Number.isFinite(museum.latitude))).toBe(true);
    expect(globeMuseums.every((museum) => Number.isFinite(museum.longitude))).toBe(true);
    expect(globeMuseums.every((museum) => data.exhibitions.some((item) => item.museumId === museum.id))).toBe(true);
  });

  it("uses direct exhibition works before an explicitly labeled museum fallback", () => {
    const directExhibition = data.exhibitions.find((item) => item.artworks.length > 0);
    expect(directExhibition).toBeDefined();

    const direct = getExhibitionModalWorks(data, directExhibition?.id || "");
    expect(direct?.source).toBe("exhibition");
    expect(direct?.works).toEqual(directExhibition?.artworks);

    const unlinkedExhibition = data.exhibitions.find((item) => item.artworks.length === 0);
    expect(unlinkedExhibition).toBeDefined();

    const fallback = getExhibitionModalWorks(data, unlinkedExhibition?.id || "");
    expect(["museum", "empty"]).toContain(fallback?.source);
    expect(fallback?.works.every((work) => work.museumId === unlinkedExhibition?.museumId)).toBe(true);
  });

  it("normalizes long dash characters out of visible preview copy", () => {
    const visibleCopy = JSON.stringify({
      museums: data.museums,
      exhibitions: data.exhibitions,
      artworks: data.artworks,
      artists: data.artists.map((artist) => ({
        id: artist.id,
        name: artist.name,
        museumNames: artist.museumNames,
        yearRange: artist.yearRange,
      })),
      posts: data.posts,
    });
    expect(visibleCopy).not.toMatch(/[—–]/);
  });

  it("removes raw markdown emphasis from read-only descriptions", () => {
    expect(data.exhibitions.map((item) => item.description).join(" ")).not.toContain("**");
  });
});

describe("redesign preview render contract", () => {
  const renderPreview = (path: string) => renderToStaticMarkup(
    createElement(
      MemoryRouter,
      { initialEntries: [path] },
      createElement(PreviewExperience),
    ),
  );

  it("renders a comparison index for all three concepts", () => {
    const html = renderToStaticMarkup(
      createElement(MemoryRouter, null, createElement(PreviewIndex)),
    );

    expect(html).toContain("COLLY");
    expect(html).toContain("Hybrid editorial");
    expect(html).toContain("Dark gallery");
    expect(html).toContain("Light museum");
    expect(html).toContain("Evolved COLLY");
    expect(html).toContain('<a href="/">Current experience</a>');
  });

  it("renders all 27 concept and view combinations", () => {
    for (const concept of PREVIEW_CONCEPTS) {
      for (const view of PREVIEW_VIEWS) {
        const path = buildPreviewPath(concept, view);
        const html = renderPreview(path);

        expect(html).toContain(`data-concept="${concept}"`);
        expect(html).toContain(`data-view="${view}"`);
        expect(html).toContain("COLLY");
      }
    }
  });

  it("uses a document navigation when returning to the production app", () => {
    expect(renderPreview("/redesign/hybrid/home")).toContain(
      '<a class="rd-current-link" href="/">Current COLLY</a>',
    );
  });

  it("gives every view a distinct job and usable control", () => {
    const markers = {
      home: "Museums, mapped by what is on view.",
      search: "Search across the collection.",
      ai: "Choose what holds your attention.",
      community: "Notes from people who went.",
      exhibitions: "Open now and opening next.",
      profile: "Your collection, held in one place.",
    } as const;

    for (const concept of PREVIEW_CONCEPTS) {
      for (const [view, marker] of Object.entries(markers)) {
        expect(renderPreview(buildPreviewPath(concept, view as (typeof PREVIEW_VIEWS)[number]))).toContain(marker);
      }
    }

    expect(renderPreview("/redesign/hybrid/search")).toContain('type="search"');
    expect(renderPreview("/redesign/dark/ai")).toContain('aria-pressed="true"');
    expect(renderPreview("/redesign/light/community")).toContain("Community topics");
    expect(renderPreview("/redesign/hybrid/exhibitions")).toContain("Exhibition status");
  });

  it("renders the actual-data globe on every concept home", () => {
    for (const concept of PREVIEW_CONCEPTS) {
      const html = renderPreview(buildPreviewPath(concept, "home"));
      expect(html).toContain('aria-label="Interactive museum globe"');
      expect(html).toContain('name="globe-museum"');
      expect(html).toContain("museums plotted");
    }
  });

  it("renders an exhibition artwork dialog from its URL", () => {
    const data = createPreviewData();
    const exhibition = data.exhibitions.find((item) => item.artworks.length > 0);
    expect(exhibition).toBeDefined();

    const html = renderPreview(
      buildExhibitionModalPath("light", "exhibitions", exhibition?.id || ""),
    );

    expect(html).toContain('role="dialog"');
    expect(html).toContain(exhibition?.title);
    expect(html).toContain(exhibition?.artworks[0]?.title);
  });
});

describe("Evolved COLLY render contract", () => {
  const renderEvolved = (path: string) => renderToStaticMarkup(
    createElement(
      MemoryRouter,
      { initialEntries: [path] },
      createElement(EvolvedExperience),
    ),
  );

  it("preserves the current top bar and five-item bottom navigator", () => {
    for (const panel of ["globe", "community", "ai", "profile", "search"] as const) {
      const html = renderEvolved(buildEvolvedPath(panel));
      expect(html).toContain(`data-evolved-panel="${panel}"`);
      expect(html).toContain("COLLY");
      expect(html).toContain('aria-label="Evolved primary navigation"');
      expect(html).toContain(">Globe<");
      expect(html).toContain(">Community<");
      expect(html).toContain(">AI<");
      expect(html).toContain(">Profile<");
      expect(html).toContain(">Search<");
    }
  });

  it("gives each familiar panel a real-data purpose", () => {
    const globe = renderEvolved("/redesign/evolved/globe");
    const search = renderEvolved("/redesign/evolved/search");
    expect(globe).toContain("Interactive museum globe");
    expect(globe).toContain("<h1");
    expect(renderEvolved("/redesign/evolved/community")).toContain("Latest notes from the community");
    expect(renderEvolved("/redesign/evolved/ai")).toContain("Build your taste");
    expect(renderEvolved("/redesign/evolved/profile")).toContain("Your collection at a glance");
    expect(search).toContain('type="search"');
    expect(search).toContain("<h1");
    expect(renderEvolved("/redesign/evolved/work/aa-1")).toContain("Sunlight in the Blue Room");
  });

  it("announces dynamic state and preserves navigation context", () => {
    expect(renderEvolved("/redesign/evolved/ai")).toContain('aria-live="polite"');
    expect(renderEvolved("/redesign/evolved/community")).toMatch(
      /<time dateTime="\d{4}-\d{2}-\d{2}T/,
    );
    expect(renderEvolved("/redesign/evolved/work/aa-1")).not.toContain('aria-current="page"');
  });

  it("restores URL-backed filters and treats the exhibition modal as the full record", () => {
    const search = renderEvolved("/redesign/evolved/search?q=Anna&scope=exhibitions");
    const community = renderEvolved("/redesign/evolved/community?topic=%EB%89%B4%EC%8A%A4");
    const modal = renderEvolved("/redesign/evolved/globe?exhibition=dpg-anna-ancher");

    expect(search).toContain('value="Anna"');
    expect(search).toContain('aria-pressed="true" type="button">exhibitions</button>');
    expect(community).toContain('aria-pressed="true" type="button">뉴스</button>');
    expect(modal).toContain('role="dialog"');
    expect(modal).not.toContain("Open full exhibition record");
  });
});
