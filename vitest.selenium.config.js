import { defineConfig } from "vitest/config";

// Selenium/WebDriver tests run in Node (not jsdom).
export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["app/__tests__/selenium/**/*.test.js"],
    exclude: ["node_modules", "dist"],
    setupFiles: [],
    silent: true,
  },
});

