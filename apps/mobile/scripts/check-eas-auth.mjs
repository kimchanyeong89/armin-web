#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const args = new Set(process.argv.slice(2));
const allowMissing = args.has("--allow-missing");

function runWhoami() {
  return spawnSync("npx", ["--yes", "eas-cli", "whoami", "--non-interactive"], {
    stdio: "pipe",
    encoding: "utf8",
    env: process.env,
  });
}

const hasToken = typeof process.env.EXPO_TOKEN === "string" && process.env.EXPO_TOKEN.trim().length > 0;
const res = runWhoami();

if (res.status === 0) {
  const output = (res.stdout || "").trim();
  console.log(`eas auth check: ok (${output || "authenticated"}).`);
  process.exit(0);
}

console.error("eas auth check: not authenticated.");
if (hasToken) {
  console.error("- EXPO_TOKEN is set but authentication still failed. Check token validity/permissions.");
} else {
  console.error("- EXPO_TOKEN is not set.");
  console.error("- Run interactive login: npm run mobile:eas:login");
  console.error("- Or set token (CI/headless): export EXPO_TOKEN=<token>");
}

if ((res.stderr || "").trim()) {
  console.error("eas-cli output:");
  console.error(res.stderr.trim());
}

if (allowMissing) {
  console.warn("eas auth check: allow-missing enabled, continuing with warnings.");
  process.exit(0);
}

process.exit(1);
