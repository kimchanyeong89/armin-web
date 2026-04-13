#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const REQUIRED_KEYS = [
  "EXPO_PUBLIC_FIREBASE_API_KEY",
  "EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN",
  "EXPO_PUBLIC_FIREBASE_PROJECT_ID",
  "EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET",
  "EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
  "EXPO_PUBLIC_FIREBASE_APP_ID",
];

const args = new Set(process.argv.slice(2));
const allowMissing = args.has("--allow-missing");
const cwd = process.cwd();
const envFilePath = path.join(cwd, ".env");

function parseDotEnv(input) {
  const out = {};
  const lines = input.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

const fromEnvFile = fs.existsSync(envFilePath)
  ? parseDotEnv(fs.readFileSync(envFilePath, "utf8"))
  : {};

const merged = {
  ...fromEnvFile,
  ...process.env,
};

const missing = REQUIRED_KEYS.filter((key) => {
  const value = merged[key];
  return typeof value !== "string" || value.trim().length === 0;
});

if (missing.length === 0) {
  console.log("mobile env check: all required EXPO_PUBLIC Firebase variables are present.");
  process.exit(0);
}

console.error("mobile env check: missing required variables:");
for (const key of missing) {
  console.error(`- ${key}`);
}

if (allowMissing) {
  console.warn("mobile env check: allow-missing enabled, continuing with warnings.");
  process.exit(0);
}

console.error("mobile env check failed. Add missing keys to apps/mobile/.env or EAS secrets.");
process.exit(1);
