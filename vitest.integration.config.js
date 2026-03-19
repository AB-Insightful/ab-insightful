import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: [
      "app/__tests__/integration/**/*.integration.test.js",
      "app/__tests__/integration/**/*.route.test.js",
    ],
    exclude: ["node_modules", "dist"],
    setupFiles: [],
    silent: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      reportsDirectory: "coverage/integration",
      all: false,
      include: [
        "app/services/experiment.server.js",
        "app/routes/api.collect.jsx",
        "app/services/cookie.server.js",
      ],
    },
  },
});
