import { describe, it, beforeAll, afterAll, expect, vi } from "vitest";
import { Builder, By } from "selenium-webdriver";
import chrome from "selenium-webdriver/chrome";
import dotenv from "dotenv";
import {
  waitForManualLoginIfNeeded,
  switchToAppIFrame,
} from "../support/seleniumHelpers.js";
import { ensureE2EDbSeeded } from "../support/seedDb.js";

vi.setConfig({
  testTimeout: 15 * 60 * 1000,
  hookTimeout: 15 * 60 * 1000,
});

dotenv.config();

const ADMIN_APP_URL = process.env.SHOPIFY_ADMIN_APP_URL;
const ADMIN_APP_URL_CANDIDATES = [
  // Most common mock-bridge admin URL patterns:
  "http://localhost:4173/admin/apps/ab-insightful?shop=test.myshopify.com",
  "http://localhost:4173/admin/apps/ab-insightful",
  "http://localhost:4173/apps/ab-insightful?shop=test.myshopify.com",
  "http://localhost:4173/apps/ab-insightful",
];

describe("AB Insightful - embedded home loads", () => {
  let driver;

  beforeAll(async () => {
    await ensureE2EDbSeeded();

    const options = new chrome.Options();

    // Keep headed so you can sign in
    // (If you set HEADLESS=1, manual login is painful)
    if (process.env.HEADLESS === "1") options.addArguments("--headless=new");

    options.addArguments("--no-sandbox");
    options.addArguments("--disable-dev-shm-usage");

    // Optional (highly recommended): keep session so you don’t sign in every time
    if (process.env.CHROME_USER_DATA_DIR) {
      options.addArguments(
        `--user-data-dir=${process.env.CHROME_USER_DATA_DIR}`,
      );
    }

    driver = await new Builder()
      .forBrowser("chrome")
      .setChromeOptions(options)
      .build();
  });

  afterAll(async () => {
    if (driver) await driver.quit();
  });

  it("waits for manual login (if needed), then loads the app home", async () => {
    const urls = ADMIN_APP_URL ? [ADMIN_APP_URL] : ADMIN_APP_URL_CANDIDATES;
    let lastError;

    for (const url of urls) {
      try {
        await driver.get(url);

        // ✅ Give yourself up to 10 minutes to complete login if you’re redirected
        await waitForManualLoginIfNeeded(driver, 1 * 60 * 1000);

        // Now wait for iframe + app ready marker
        await switchToAppIFrame(driver, 60000);

        const headingEl = await driver.wait(
          until.elementLocated(
            By.xpath(
              "//*[contains(normalize-space(), 'Welcome to AB Insightful')]",
            ),
          ),
          60000,
        );

        const headingText = await headingEl.getText();
        expect(headingText).toContain("Welcome to AB Insightful");
        return;
      } catch (err) {
        lastError = err;
      }
    }

    throw lastError ?? new Error("Failed to load embedded app home");
  });
});
