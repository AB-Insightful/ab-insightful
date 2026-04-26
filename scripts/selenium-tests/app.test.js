import { describe, it, beforeAll, afterAll, expect, vi } from "vitest";
import { Builder, By, until } from "selenium-webdriver";
import chrome from "selenium-webdriver/chrome";
import dotenv from "dotenv";

vi.setConfig({
  testTimeout: 15 * 60 * 1000,
  hookTimeout: 15 * 60 * 1000,
});

dotenv.config();

const ADMIN_APP_URL = process.env.SHOPIFY_ADMIN_APP_URL;

async function waitForManualLoginIfNeeded(driver, timeoutMs = 10 * 60 * 1000) {
  // Wait briefly for navigation/redirects to settle
  await driver.wait(async () => {
    const url = await driver.getCurrentUrl();
    return typeof url === "string" && url.length > 0;
  }, 30000);

  const startUrl = await driver.getCurrentUrl();
  const isLogin =
    startUrl.includes("accounts.shopify.com") ||
    startUrl.includes("/login") ||
    startUrl.includes("id.shopify.com");

  // If we’re not on login, don’t block
  if (!isLogin) return;

  // Otherwise, give time for manual login
  await driver.wait(async () => {
    const url = await driver.getCurrentUrl();
    return (
      !url.includes("accounts.shopify.com") &&
      !url.includes("id.shopify.com") &&
      !url.includes("/login")
    );
  }, timeoutMs);
}
async function switchToAppIFrame(driver, timeoutMs = 60000) {
  const iframe = await driver.wait(
    until.elementLocated(By.css("iframe#app-iframe, iframe[name='app-iframe']")),
    timeoutMs
  );
  await driver.wait(until.elementIsVisible(iframe), timeoutMs);
  await driver.switchTo().frame(iframe);

  await driver.wait(async () => {
    const rs = await driver.executeScript("return document.readyState");
    return rs === "complete" || rs === "interactive";
  }, timeoutMs);
}

describe("AB Insightful - embedded home loads", () => {
  let driver;

  beforeAll(async () => {
    const options = new chrome.Options();

    // Keep headed so you can sign in
    // (If you set HEADLESS=1, manual login is painful)
    if (process.env.HEADLESS === "1") options.addArguments("--headless=new");

    options.addArguments("--no-sandbox");
    options.addArguments("--disable-dev-shm-usage");

    // Optional (highly recommended): keep session so you don’t sign in every time
    if (process.env.CHROME_USER_DATA_DIR) {
      options.addArguments(`--user-data-dir=${process.env.CHROME_USER_DATA_DIR}`);
    }

    driver = await new Builder()
      .forBrowser("chrome")
      .setChromeOptions(options)
      .build();
  });

  afterAll(async () => {
    if (driver) await driver.quit();
  });

  it(
    "waits for manual login (if needed), then loads the app home",
    async () => {
      if (!ADMIN_APP_URL) throw new Error("Missing SHOPIFY_ADMIN_APP_URL in .env");

      await driver.get(ADMIN_APP_URL);

      // ✅ Give yourself up to 10 minutes to complete login if you’re redirected
      await waitForManualLoginIfNeeded(driver, 10 * 60 * 1000);

      // After login completes, Shopify may redirect; ensure we’re back at the app URL
      // (Not always necessary, but helps if you land on Admin home)
      const current = await driver.getCurrentUrl();
      if (!current.includes("/apps/")) {
        await driver.get(ADMIN_APP_URL);
      }

      // Now wait for iframe + app ready marker
      await switchToAppIFrame(driver, 60000);

      const headingEl = await driver.wait(
        until.elementLocated(
          By.xpath("//*[contains(normalize-space(), 'Welcome to AB Insightful')]")
        ),
        60000
      );

      const headingText = await headingEl.getText();
      expect(headingText).toContain("Welcome to AB Insightful");
    }
  );
});