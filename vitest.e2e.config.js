import { defineConfig } from "vitest/config";
import { readFileSync } from "fs";
import { resolve } from "path";

// Parse .env.e2e manually — Vite/Vitest only auto-loads .env and .env.[mode]
function loadEnvFile(filename) {
  const env = {};
  try {
    const content = readFileSync(resolve(process.cwd(), filename), "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIndex = trimmed.indexOf("=");
      if (eqIndex === -1) continue;
      const key = trimmed.slice(0, eqIndex).trim();
      let value = trimmed.slice(eqIndex + 1).trim();
      // Strip surrounding quotes
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      // Don't override existing env vars (e.g., HEADED=true from CLI)
      if (!(key in process.env)) {
        env[key] = value;
      } else {
        env[key] = process.env[key];
      }
    }
  } catch {
    // .env.e2e doesn't exist — credentials must come from shell env
  }
  return env;
}

export default defineConfig({
  test: {
    // Use node environment — Selenium manages its own browser
    environment: "node",
    // Load .env.e2e into process.env for test processes
    env: loadEnvFile(".env.e2e"),
    // E2E tests are slow: embedded Shopify app has multiple loading stages
    testTimeout: 120_000,
    hookTimeout: 200_000, // 3+ min: allows manual login on first run
    // Only pick up files in e2e/tests/
    include: ["e2e/tests/**/*.e2e.test.{js,jsx}"],
    exclude: ["node_modules", "dist"],
    // Run test files one at a time — each opens its own browser
    fileParallelism: false,
    pool: "forks",
    poolOptions: {
      forks: { singleFork: true },
    },
    // No coverage for E2E tests
    coverage: { enabled: false },
  },
});
