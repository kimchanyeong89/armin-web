#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const args = new Set(process.argv.slice(2));
const allowMissing = args.has("--allow-missing");
const cwd = process.cwd();

const requiredFiles = [
  "eas.json",
  ".env.example",
  "store/metadata.template.json",
  "scripts/check-mobile-env.mjs",
];

const recommendedAssets = [
  "assets/icon.png",
  "assets/adaptive-icon.png",
  "assets/splash.png",
  "assets/favicon.png",
];

const missingRequired = requiredFiles.filter((rel) => !fs.existsSync(path.join(cwd, rel)));
const missingAssets = recommendedAssets.filter((rel) => !fs.existsSync(path.join(cwd, rel)));

if (missingRequired.length === 0) {
  console.log("release check: required files are present.");
} else {
  console.error("release check: missing required files:");
  for (const rel of missingRequired) console.error(`- ${rel}`);
}

if (missingAssets.length === 0) {
  console.log("release check: recommended store assets are present.");
} else {
  console.warn("release check: missing recommended store assets:");
  for (const rel of missingAssets) console.warn(`- ${rel}`);
}

if (missingRequired.length > 0) {
  if (allowMissing) {
    console.warn("release check: allow-missing enabled, continuing with warnings.");
    process.exit(0);
  }
  process.exit(1);
}

process.exit(0);
