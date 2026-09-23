import { createElement } from "react";
import { existsSync, readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import BottomPageNavigator from "../components/BottomPageNavigator";
import { LanguageProvider } from "../contexts/LanguageContext";
import {
  MOBILE_CHROME_TWEAKS,
  MOBILE_CHROME_TWEAK_IDS,
  resolveMobileChromeTweak,
} from "../components/mobileChromeTweaks";

describe("mobile chrome tweaks", () => {
  it("keeps the approved six variations in a stable order", () => {
    expect(MOBILE_CHROME_TWEAK_IDS).toEqual([
      "museum-ticket",
      "editorial-accordion",
      "double-bezel",
      "adaptive-ledger",
      "accessible-tray",
      "colly-hybrid",
    ]);
  });

  it("resolves only supported tweak ids", () => {
    expect(resolveMobileChromeTweak("double-bezel")).toBe("double-bezel");
    expect(resolveMobileChromeTweak("unknown")).toBeUndefined();
    expect(resolveMobileChromeTweak(null)).toBeUndefined();
  });

  it("attributes every variation and exposes its preview URL", () => {
    expect(MOBILE_CHROME_TWEAKS).toHaveLength(6);
    expect(MOBILE_CHROME_TWEAKS.map((tweak) => tweak.name)).toEqual([
      "Index Rail",
      "Compass Dial",
      "Folded Ledger",
      "Museum Ribbon",
      "Coordinate Deck",
      "Command Strip",
    ]);
    for (const tweak of MOBILE_CHROME_TWEAKS) {
      expect(tweak.skill).toBeTruthy();
      expect(tweak.url).toBe(`/interactive?tweak=${tweak.id}`);
    }
  });

  it("uses the approved Double Bezel bottom navigator for every study", () => {
    for (const tweak of MOBILE_CHROME_TWEAKS) {
      const html = renderToStaticMarkup(createElement(
        MemoryRouter,
        null,
        createElement(
          LanguageProvider,
          null,
          createElement(BottomPageNavigator, {
            activeIndex: 0,
            onChange: () => undefined,
            mobileChromeTweak: tweak.id,
          }),
        ),
      ));
      expect(html).toContain('data-mobile-chrome-tweak="double-bezel"');
    }
  });

  it("defines the shared Liquid Glass contract and Double Bezel dock", () => {
    const source = readFileSync(
      new URL("../components/BottomPageNavigator.css", import.meta.url),
      "utf8",
    );
    const componentSource = readFileSync(
      new URL("../components/BottomPageNavigator.tsx", import.meta.url),
      "utf8",
    );

    expect(source).toContain(".bpn-mobile-shell");
    expect(source).toContain("backdrop-filter");
    expect(source).toContain("env(safe-area-inset-bottom");
    expect(source).toMatch(/min-height:\s*44px/);
    expect(source).toContain(":focus-visible");
    expect(source).toContain("prefers-reduced-transparency: reduce");
    expect(source).toContain("prefers-reduced-motion: reduce");
    expect(componentSource).toContain('data-mobile={isMobile ? "true" : "false"}');
    expect(componentSource).toContain('const bottomChromeTweak = "double-bezel";');
    expect(componentSource).toContain('className="bpn-pill-shell bpn-mobile-shell"');
    expect(componentSource).not.toContain('bpn-desktop-shell');
    expect(source).toContain('.bpn[data-mobile="true"][data-mobile-chrome-tweak="double-bezel"]');
    expect(source).toContain('.bpn[data-mobile="false"][data-mobile-chrome-tweak="double-bezel"]');
    expect(source).toContain(".bpn-pill-shell");
  });

  it("removes the redundant top continent control", () => {
    const componentSource = readFileSync(
      new URL("../components/InteractiveGlobeMap/InteractiveGlobeMap.tsx", import.meta.url),
      "utf8",
    );
    const controlUrl = new URL(
      "../components/InteractiveGlobeMap/ContinentControl.tsx",
      import.meta.url,
    );
    expect(componentSource).not.toContain("<ContinentControl");
    expect(componentSource).not.toContain('className="ig-region-pills"');
    expect(componentSource).not.toContain("cycleRegion");
    expect(existsSync(controlUrl)).toBe(false);
  });

  it("provides a visible switcher for the six query-driven studies", () => {
    const switcherUrl = new URL("../components/MobileChromeTweakSwitcher.tsx", import.meta.url);
    expect(existsSync(switcherUrl)).toBe(true);

    const source = existsSync(switcherUrl) ? readFileSync(switcherUrl, "utf8") : "";
    const appSource = readFileSync(new URL("../App.tsx", import.meta.url), "utf8");
    const switcherCss = readFileSync(new URL("../components/MobileChromeTweakSwitcher.css", import.meta.url), "utf8");

    expect(source).toContain("TWEAK");
    expect(source).toContain('aria-label="Previous tweak"');
    expect(source).toContain('aria-label="Next tweak"');
    expect(source).toContain("MOBILE_CHROME_TWEAKS.map");
    expect(source).toContain("new URLSearchParams(location.search)");
    expect(appSource).toContain("<MobileChromeTweakSwitcher");
    expect(switcherCss).toContain("--bpn-dock-clearance");
  });
});
