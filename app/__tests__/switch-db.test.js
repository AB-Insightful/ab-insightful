import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { describe, it, expect, beforeEach, afterEach } from "vitest";

const ENV_PATH = path.resolve(process.cwd(), ".env");
const BACKUP_ENV_PATH = path.resolve(process.cwd(), ".env.backup.test");
const CONFIG_PATH = path.resolve(process.cwd(), "config/db.environment.config.json");

const TEST_ENV_CONTENT = `FOO=bar\nDATABASE_URL="file:./old.sqlite"\n`;

describe("switch-db script", () => {
  beforeEach(() => {
    // backup real .env if it exists
    if (fs.existsSync(ENV_PATH)) {
      fs.copyFileSync(ENV_PATH, BACKUP_ENV_PATH);
    }

    // create test .env
    fs.writeFileSync(ENV_PATH, TEST_ENV_CONTENT, "utf8");

    // create test config
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
    // restore original .env if it existed
    if (fs.existsSync(BACKUP_ENV_PATH)) {
      fs.copyFileSync(BACKUP_ENV_PATH, ENV_PATH);
      fs.unlinkSync(BACKUP_ENV_PATH);
    } else {
      // if no original, remove test file
      if (fs.existsSync(ENV_PATH)) fs.unlinkSync(ENV_PATH);
    }

    // cleanup config
    if (fs.existsSync(CONFIG_PATH)) fs.unlinkSync(CONFIG_PATH);
  });

  it("updates DATABASE_URL to dev", () => {
    execSync(`node scripts/switch-db.js --environment=dev`);

    const env = fs.readFileSync(ENV_PATH, "utf8");

    expect(env).toContain(`DATABASE_URL="file:./dev.sqlite"`);
    expect(env).toContain(`FOO=bar`);
  });

  it("updates DATABASE_URL to test", () => {
    execSync(`node scripts/switch-db.js --environment=test`);

    const env = fs.readFileSync(ENV_PATH, "utf8");

    expect(env).toContain(`DATABASE_URL="file:./test.sqlite"`);
  });
});