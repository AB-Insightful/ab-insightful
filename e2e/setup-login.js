#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

function parseEnvFile(envPath) {
  if (!fs.existsSync(envPath)) return {};
  const content = fs.readFileSync(envPath, "utf8");
  const out = {};

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    out[key] = value;
  }

  return out;
}

function firstExisting(paths) {
  for (const candidate of paths) {
    if (candidate && fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function findChromePath() {
  if (process.env.CHROME_PATH && fs.existsSync(process.env.CHROME_PATH)) {
    return process.env.CHROME_PATH;
  }

  const platform = process.platform;

  if (platform === "win32") {
    return firstExisting([
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    ]);
  }

  if (platform === "darwin") {
    return firstExisting([
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    ]);
  }

  return firstExisting([
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ]);
}

function launchChrome(chromePath, adminUrl, profileDir) {
  const chromeArgs = [
    "--remote-debugging-port=9222",
    `--user-data-dir=${profileDir}`,
    "--no-first-run",
    "--no-default-browser-check",
    adminUrl,
  ];

  const child = spawn(chromePath, chromeArgs, {
    detached: true,
    stdio: "ignore",
  });

  child.unref();
}

function main() {
  const repoRoot = process.cwd();
  const envPath = path.join(repoRoot, ".env.e2e");
  const env = parseEnvFile(envPath);

  const storeUrl = (env.SHOPIFY_TEST_STORE_URL || "")
    .replace(/^https?:\/\//, "")
    .replace(/\/$/, "");

  if (!storeUrl) {
    console.error("Error: SHOPIFY_TEST_STORE_URL not found in .env.e2e");
    process.exit(1);
  }

  const storeName = storeUrl.replace(/\.myshopify\.com$/, "");
  const adminUrl = `https://admin.shopify.com/store/${storeName}`;
  const chromePath = findChromePath();

  if (!chromePath) {
    console.error("Error: Chrome not found. Set CHROME_PATH to your Chrome binary.");
    process.exit(1);
  }

  const profileDir = path.join(os.tmpdir(), "e2e-chrome-profile");
  fs.mkdirSync(profileDir, { recursive: true });

  console.log("");
  console.log("===== E2E Login Setup =====");
  console.log(`Using Chrome: ${chromePath}`);
  console.log("Opening with remote debugging on port 9222...");
  console.log("");
  console.log("Steps:");
  console.log("  1. Log in to Shopify in the browser window that opens");
  console.log(`  2. Navigate to: ${adminUrl}`);
  console.log("  3. Leave Chrome open");
  console.log("  4. In another terminal, run: npm run test:e2e:headed");
  console.log("");

  launchChrome(chromePath, adminUrl, profileDir);
}

main();
