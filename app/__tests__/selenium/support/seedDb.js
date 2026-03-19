import { execSync } from "node:child_process";

const GLOBAL_KEY = "__abInsightfulE2ESeeded";

export async function ensureE2EDbSeeded() {
  if (globalThis[GLOBAL_KEY]) return;

  // Reuse the project's canonical fixture seeding workflow.
  // This script runs Prisma migrations + seeds deterministic fixture data.
  execSync("node prisma/seed.js --environment=test", {
    stdio: "inherit",
    cwd: process.cwd(),
  });

  globalThis[GLOBAL_KEY] = true;
}

