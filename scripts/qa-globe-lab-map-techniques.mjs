import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { chromium } from "playwright";
import sharp from "sharp";

const baseUrl = process.env.GLOBE_LAB_BASE_URL ?? "http://127.0.0.1:4175";
const outputDir = process.env.GLOBE_LAB_QA_OUTPUT ?? "/tmp/globe-lab-map-techniques";
const studies = [
  { route: "/globe-lab/colly-evolved", technique: "atlas-index" },
  { route: "/globe-lab/colly-evolved/margin-ledger", technique: "margin-ledger" },
  { route: "/globe-lab/colly-evolved/radial-register", technique: "radial-register" },
  { route: "/globe-lab/colly-evolved/country-folio", technique: "country-folio" },
  { route: "/globe-lab/colly-evolved/coordinate-index", technique: "coordinate-index" },
  { route: "/globe-lab/colly-evolved/city-gazetteer", technique: "city-gazetteer" },
];
const viewports = [
  { name: "desktop", width: 1440, height: 1000 },
  { name: "mobile", width: 390, height: 844 },
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function normalizedPixels(buffer) {
  const { data } = await sharp(buffer)
    .resize(320, 220, { fit: "fill" })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return data;
}

function meanAbsoluteDifference(a, b) {
  let total = 0;
  for (let index = 0; index < a.length; index += 1) {
    total += Math.abs(a[index] - b[index]);
  }
  return total / a.length;
}

await fs.mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const results = [];
const desktopGrayscale = new Map();

try {
  for (const viewport of viewports) {
    const context = await browser.newContext({ viewport });
    for (const study of studies) {
      const page = await context.newPage();
      const pageErrors = [];
      page.on("pageerror", (error) => pageErrors.push(error.message));
      await page.goto(`${baseUrl}${study.route}`, { waitUntil: "networkidle", timeout: 30_000 });
      await page.locator("canvas.ig-globe-canvas").waitFor({ state: "visible" });
      await page.waitForTimeout(1_200);
      await page.addStyleTag({
        content: "*, *::before, *::after { animation: none !important; transition: none !important; }",
      });

      const state = await page.evaluate((expectedTechnique) => {
        const control = document.querySelector(".ig-region-pills");
        const map = document.querySelector(".globe-lab__map");
        const canvas = document.querySelector("canvas.ig-globe-canvas");
        const buttons = [...document.querySelectorAll(".ig-region-pills button")];
        const mapStyle = map ? getComputedStyle(map) : null;
        return {
          technique: control?.getAttribute("data-colly-map-technique"),
          expectedTechnique,
          scrollWidth: document.documentElement.scrollWidth,
          viewportWidth: window.innerWidth,
          buttonHeights: buttons.map((button) => button.getBoundingClientRect().height),
          mapFrame: mapStyle ? {
            borderTopWidth: mapStyle.borderTopWidth,
            borderRadius: mapStyle.borderRadius,
            boxShadow: mapStyle.boxShadow,
          } : null,
          canvas: canvas ? {
            width: canvas.getBoundingClientRect().width,
            height: canvas.getBoundingClientRect().height,
          } : null,
          variantCount: document.querySelectorAll(".colly-variant-switcher__link").length,
          oldFrameAttribute: Boolean(document.querySelector("[data-colly-frame], [data-colly-aperture]")),
        };
      }, study.technique);

      assert(state.technique === study.technique, `${study.technique}: wrong technique attribute`);
      assert(state.scrollWidth <= state.viewportWidth + 1, `${study.technique}: horizontal overflow`);
      assert(state.canvas && state.canvas.width > 250 && state.canvas.height > 250, `${study.technique}: canvas is too small`);
      assert(state.variantCount === 6, `${study.technique}: expected six study links`);
      assert(!state.oldFrameAttribute, `${study.technique}: old map frame attribute remains`);
      assert(state.mapFrame?.borderTopWidth === "0px", `${study.technique}: map border remains`);
      assert(state.mapFrame?.borderRadius === "0px", `${study.technique}: map radius remains`);
      assert(state.mapFrame?.boxShadow === "none", `${study.technique}: map shadow remains`);
      if (viewport.name === "mobile") {
        assert(state.buttonHeights.every((height) => height >= 43.5), `${study.technique}: touch target below 44px`);
      }

      const normalPath = path.join(outputDir, `${study.technique}-${viewport.name}.png`);
      await page.screenshot({ path: normalPath, fullPage: false });
      await page.addStyleTag({ content: "html { filter: grayscale(1) !important; }" });
      const grayscaleBuffer = await page.screenshot({ fullPage: false });
      await fs.writeFile(
        path.join(outputDir, `${study.technique}-${viewport.name}-grayscale.png`),
        grayscaleBuffer,
      );
      if (viewport.name === "desktop") desktopGrayscale.set(study.technique, grayscaleBuffer);

      const canvas = page.locator("canvas.ig-globe-canvas");
      const canvasBox = await canvas.boundingBox();
      assert(canvasBox, `${study.technique}: canvas has no bounding box`);
      const beforeDrag = await canvas.evaluate((element) => element.toDataURL());
      await page.mouse.move(canvasBox.x + canvasBox.width * 0.58, canvasBox.y + canvasBox.height * 0.55);
      await page.mouse.down();
      await page.mouse.move(canvasBox.x + canvasBox.width * 0.44, canvasBox.y + canvasBox.height * 0.48, { steps: 8 });
      await page.mouse.up();
      await page.waitForTimeout(350);
      const afterDrag = await canvas.evaluate((element) => element.toDataURL());
      assert(beforeDrag !== afterDrag, `${study.technique}: drag did not change canvas pixels`);

      const europe = page.locator('.ig-region-pills button[data-region-key="europe"]');
      await europe.click();
      await page.waitForFunction(() => (
        document.querySelector('.ig-region-pills button[data-region-key="europe"]')
          ?.getAttribute("aria-pressed") === "true"
      ));
      if (viewport.name === "desktop" && study.technique === "atlas-index") {
        await page.mouse.move(canvasBox.x + canvasBox.width * 0.62, canvasBox.y + canvasBox.height * 0.52);
        await page.mouse.wheel(0, -720);
        await page.waitForTimeout(500);
        await page.screenshot({
          path: path.join(outputDir, "atlas-index-desktop-country-zoom.png"),
          fullPage: false,
        });
      }
      assert(pageErrors.length === 0, `${study.technique}: ${pageErrors.join(" | ")}`);

      results.push({
        technique: study.technique,
        viewport: viewport.name,
        buttonMinHeight: Math.min(...state.buttonHeights),
        canvas: state.canvas,
        horizontalOverflow: state.scrollWidth - state.viewportWidth,
        screenshot: normalPath,
      });
      await page.close();
    }
    await context.close();
  }

  const grayscaleDifferences = [];
  for (let leftIndex = 0; leftIndex < studies.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < studies.length; rightIndex += 1) {
      const left = studies[leftIndex].technique;
      const right = studies[rightIndex].technique;
      const leftPixels = await normalizedPixels(desktopGrayscale.get(left));
      const rightPixels = await normalizedPixels(desktopGrayscale.get(right));
      const difference = meanAbsoluteDifference(leftPixels, rightPixels);
      grayscaleDifferences.push({ left, right, difference: Number(difference.toFixed(3)) });
      assert(difference > 0.18, `${left} and ${right}: grayscale structure is too similar`);
    }
  }

  console.log(JSON.stringify({ results, grayscaleDifferences }, null, 2));
} finally {
  await browser.close();
}
