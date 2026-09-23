import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { LanguageProvider } from "../contexts/LanguageContext";
import {
  filterCommunityPosts,
  normalizeCommunityCategory,
  normalizeCommunityHeaderType,
  SAMPLE_COMMUNITY_FEED_POSTS,
  sortCommunityPosts,
} from "../features/community/communityFeed";
import { COMMUNITY_STUDIES, buildCommunityStudyPath, getCommunityStudy } from "../redesign/community/model";
import CommunityStudiesApp from "../redesign/community/CommunityStudiesApp";

const feedModuleUrl = new URL("../features/community/communityFeed.ts", import.meta.url);

describe("community redesign shared feed contract", () => {
  it("keeps production and redesign feed knowledge in one feature module", () => {
    expect(existsSync(fileURLToPath(feedModuleUrl))).toBe(true);

    const source = readFileSync(feedModuleUrl, "utf8");
    expect(source).toContain("normalizeCommunityCategory");
    expect(source).toContain("normalizeCommunityHeaderType");
    expect(source).toContain("sortCommunityPosts");
    expect(source).toContain("SAMPLE_COMMUNITY_POSTS");
  });

  it("normalizes, filters, and sorts the production feed consistently", () => {
    expect(normalizeCommunityCategory("discussion")).toBe("토론");
    expect(normalizeCommunityHeaderType("artist")).toBe("artist");
    expect(sortCommunityPosts(SAMPLE_COMMUNITY_FEED_POSTS, "popular")[0]?.likes).toBe(22);
    expect(filterCommunityPosts(SAMPLE_COMMUNITY_FEED_POSTS, "질문", "all")).toHaveLength(1);
  });
});

describe("community redesign study routes", () => {
  it("defines six distinct, deep-linkable design studies", () => {
    expect(COMMUNITY_STUDIES).toHaveLength(6);
    expect(new Set(COMMUNITY_STUDIES.map((study) => study.slug)).size).toBe(6);
    expect(buildCommunityStudyPath("critics-index")).toBe("/redesign/community/critics-index");
    expect(getCommunityStudy("missing")?.slug).toBe("living-archive");
  });

  it("renders each study inside one functional community shell", () => {
    for (const study of COMMUNITY_STUDIES) {
      const html = renderToStaticMarkup(
        createElement(
          LanguageProvider,
          null,
          createElement(
            MemoryRouter,
            { initialEntries: [buildCommunityStudyPath(study.slug)] },
            createElement(
              Routes,
              null,
              createElement(Route, { path: "/redesign/community/:study", element: createElement(CommunityStudiesApp) }),
            ),
          ),
        ),
      );

      expect(html).toContain(`rc-page--${study.slug}`);
      expect(html).toContain(study.title.replace("'", "&#x27;"));
      expect(html).toContain("새 글 작성");
      expect(html).toContain("커뮤니티 필터");
      expect((html.match(/\/redesign\/community\//g) || []).length).toBe(6);
    }
  });
});
