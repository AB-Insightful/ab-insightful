import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { describe, it, expect, beforeEach, afterEach } from "vitest";

const ENV_PATH = path.resolve(process.cwd(), ".env");
const CONFIG_PATH = path.resolve(process.cwd(), "config/db.environment.config.json");

const TEST_ENV_CONTENT = `FOO=bar\nDATABASE_URL="file:./old.sqlite"\n`;

describe("switch-db script", () => {
  beforeEach(() => {
    // create fake .env
    fs.writeFileSync(ENV_PATH, TEST_ENV_CONTENT, "utf8");

    // create fake config
    fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
    fs.writeFileSync(
      CONFIG_PATH,
      JSON.stringify({
        dev: "file:./dev.sqlite",
        test: "file:./test.sqlite",
      }),
      "utf8"
    );
  });

  afterEach(() => {
    if (fs.existsSync(ENV_PATH)) fs.unlinkSync(ENV_PATH);
    if (fs.existsSync(CONFIG_PATH)) fs.unlinkSync(CONFIG_PATH);
  });

  it("updates DATABASE_URL to dev", () => {
    execSync(`node scripts/switch-db.js --environment=dev`);

    const env = fs.readFileSync(ENV_PATH, "utf8");

    expect(env).toContain(`DATABASE_URL="file:./dev.sqlite"`);
    expect(env).toContain(`FOO=bar`); // ensures we didn’t wipe file
  });

  it("updates DATABASE_URL to test", () => {
    execSync(`node scripts/switch-db.js --environment=test`);

    const env = fs.readFileSync(ENV_PATH, "utf8");

    expect(env).toContain(`DATABASE_URL="file:./test.sqlite"`);
  });
});