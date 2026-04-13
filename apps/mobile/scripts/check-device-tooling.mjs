#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

function run(command, args) {
  return spawnSync(command, args, {
    encoding: "utf8",
    stdio: "pipe",
    env: process.env,
  });
}

function printHeader(title) {
  console.log(`\n== ${title} ==`);
}

function safeText(value) {
  return String(value || "").trim();
}

function exists(filePath) {
  try {
    return fs.existsSync(filePath);
  } catch {
    return false;
  }
}

const fullXcodeDeveloperDir = "/Applications/Xcode.app/Contents/Developer";
const xcodeBuildAtApp = "/Applications/Xcode.app/Contents/Developer/usr/bin/xcodebuild";
const androidSdkRoot = path.join(process.env.HOME || "", "Library", "Android", "sdk");
const adbAtSdk = path.join(androidSdkRoot, "platform-tools", "adb");
const emulatorAtSdk = path.join(androidSdkRoot, "emulator", "emulator");

let iosReady = false;
let androidReady = false;

printHeader("iOS simulator prerequisites");

const xcodeSelect = run("xcode-select", ["-p"]);
if (xcodeSelect.status === 0) {
  console.log(`- active developer path: ${safeText(xcodeSelect.stdout)}`);
} else {
  console.log("- active developer path: unavailable");
}

const xcodeBuild = run("xcodebuild", ["-version"]);
if (xcodeBuild.status === 0) {
  console.log(`- xcodebuild: available (${safeText(xcodeBuild.stdout).split("\n")[0]})`);
} else {
  if (exists(xcodeBuildAtApp)) {
    const direct = run(xcodeBuildAtApp, ["-version"]);
    if (direct.status === 0) {
      console.log(`- xcodebuild: installed (${safeText(direct.stdout).split("\n")[0]})`);
      console.log("- note: active path points to CommandLineTools; switch to full Xcode to use simctl reliably");
    } else {
      console.log("- xcodebuild: installed but not runnable yet (open Xcode once and finish setup)");
    }
  } else {
    console.log("- xcodebuild: missing (install full Xcode from App Store)");
  }
}

const simctl = run("xcrun", ["simctl", "list", "devices", "available"]);
let simctlResolved = simctl;
if (simctl.status !== 0 && exists(fullXcodeDeveloperDir)) {
  simctlResolved = run("xcrun", ["simctl", "list", "devices", "available"]);
  simctlResolved = spawnSync("xcrun", ["simctl", "list", "devices", "available"], {
    encoding: "utf8",
    stdio: "pipe",
    env: { ...process.env, DEVELOPER_DIR: fullXcodeDeveloperDir },
  });
}
if (simctlResolved.status === 0) {
  const lines = safeText(simctlResolved.stdout).split("\n");
  const booted = lines.filter((line) => line.includes("(Booted)"));
  iosReady = true;
  console.log(`- simctl: available (${booted.length} booted simulator)`);
} else {
  console.log("- simctl: unavailable via current path");
  if (exists(fullXcodeDeveloperDir)) {
    console.log("- hint: run with DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer or switch xcode-select");
  }
}

printHeader("Android emulator prerequisites");

let adb = run("adb", ["devices"]);
let adbLabel = "adb";
if (adb.status !== 0 && exists(adbAtSdk)) {
  adb = run(adbAtSdk, ["devices"]);
  adbLabel = adbAtSdk;
}
if (adb.status === 0) {
  const rows = safeText(adb.stdout)
    .split("\n")
    .filter((line) => line && !line.startsWith("List of devices"));
  const online = rows.filter((line) => line.includes("\tdevice"));
  androidReady = true;
  console.log(`- adb: available via ${adbLabel} (${online.length} online device/emulator)`);
} else {
  console.log("- adb: missing (Android Studio SDK Platform-Tools 설치 필요)");
}

let emulator = run("emulator", ["-list-avds"]);
let emulatorLabel = "emulator";
if (emulator.status !== 0 && exists(emulatorAtSdk)) {
  emulator = run(emulatorAtSdk, ["-list-avds"]);
  emulatorLabel = emulatorAtSdk;
}
if (emulator.status === 0) {
  const avds = safeText(emulator.stdout)
    .split("\n")
    .filter(Boolean);
  console.log(`- emulator binary: available via ${emulatorLabel} (${avds.length} AVD found)`);
} else {
  console.log("- emulator binary: missing or PATH not configured");
}

printHeader("Recommended next commands");

if (!iosReady) {
  console.log("- Install Xcode from App Store");
  console.log("- sudo xcode-select --switch /Applications/Xcode.app/Contents/Developer");
  console.log("- xcodebuild -runFirstLaunch");
}

if (!androidReady) {
  console.log("- Install Android Studio and SDK Platform-Tools");
  console.log("- Add platform-tools and emulator to PATH");
  console.log("  export PATH=\"$HOME/Library/Android/sdk/platform-tools:$HOME/Library/Android/sdk/emulator:$PATH\"");
  console.log("- Start an AVD in Android Studio Device Manager");
}

console.log("- Then run: npm run mobile:eas:ios:run:latest");
console.log("- Then run: npm run mobile:eas:android:run:latest");

if (iosReady || androidReady) {
  console.log("\nDevice tooling check finished: at least one platform is ready.");
  process.exit(0);
}

console.log("\nDevice tooling check finished: no platform is fully ready yet.");
process.exit(1);