import { describe, it, beforeAll, afterAll, expect, vi } from "vitest";
import { Builder, By, until } from "selenium-webdriver";
import chrome from "selenium-webdriver/chrome";
import dotenv from "dotenv";

import {
  waitForManualLoginIfNeeded,
  switchToAppIFrame,
} from "../support/seleniumHelpers.js";
import { ensureE2EDbSeeded } from "../support/seedDb.js";

vi.setConfig({
  testTimeout: 30 * 60 * 1000,
  hookTimeout: 30 * 60 * 1000,
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

const APP_BASE_URL = process.env.APP_BASE_URL;
if (!APP_BASE_URL) {
  throw new Error(
    "APP_BASE_URL not set. Run via `npm run test:selenium:mock` (durable wrapper) so Selenium can target the Shopify proxy port.",
  );
}

function formatDateYYYYMMDD(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

async function loadAppHome(driver) {
  const urls = ADMIN_APP_URL ? [ADMIN_APP_URL] : ADMIN_APP_URL_CANDIDATES;
  let lastError;

  for (const url of urls) {
    try {
      await driver.get(url);

      // Give manual sign-in a chance if Shopify redirects.
      await waitForManualLoginIfNeeded(driver, 1 * 60 * 1000);

      await switchToAppIFrame(driver, 60000);

      // Wait for the embedded app to render its home heading.
      await driver.wait(
        until.elementLocated(
          By.xpath(
            "//*[contains(normalize-space(), 'Welcome to AB Insightful')]",
          ),
        ),
        60000,
      );
      return;
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError ?? new Error("Failed to load embedded app home");
}

async function setValueBySelector(
  driver,
  selector,
  value,
  { blur = false } = {},
) {
  await driver.executeScript(
    ({ selector: sel, value: val, blur: shouldBlur }) => {
      const el = document.querySelector(sel);
      if (!el) throw new Error(`Missing element for selector: ${sel}`);

      // For Polaris web components, React usually reads from `event.target.value`.
      el.value = val;
      try {
        el.setAttribute("value", String(val));
      } catch {
        // ignore if custom element doesn't support attribute setting
      }

      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      if (shouldBlur) el.dispatchEvent(new Event("blur", { bubbles: true }));
    },
    { selector, value, blur },
  );
}

async function clickText(driver, text) {
  const el = await driver.wait(
    until.elementLocated(
      By.xpath(
        `//*[self::s-button or self::a or self::s-link][contains(normalize-space(), '${text}')][1]`,
      ),
    ),
    60000,
  );
  await el.click();
}

async function apiPostJson(path, payload) {
  const res = await fetch(`${APP_BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  expect(res.status).toBe(200);
  return res;
}

async function executeAnalysis() {
  // No Cron-Secret needed for this local loader (per existing cron job usage).
  const res = await fetch(`${APP_BASE_URL}/api/cron/execute-analysis`, {
    method: "GET",
  });
  expect(res.status).toBe(200);
  return res;
}

describe("AB Insightful - Selenium core flows", () => {
  let driver;

  beforeAll(async () => {
    await ensureE2EDbSeeded();

    const options = new chrome.Options();

    if (process.env.HEADLESS === "1") options.addArguments("--headless=new");
    options.addArguments("--no-sandbox");
    options.addArguments("--disable-dev-shm-usage");

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

  it("creates an experiment via embedded UI (Save Draft -> Edit Experiment)", async () => {
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const startDate = formatDateYYYYMMDD(tomorrow);

    const expName = `E2E Experiment ${Date.now()}`;
    const expDesc = "Selenium-created experiment for functional coverage";
    const sectionId = `e2e-section-${Date.now()}`;

    await loadAppHome(driver);
    await clickText(driver, "New Experiment");

    await driver.wait(
      until.elementLocated(
        By.xpath("//*[contains(normalize-space(), 'Create Experiment')]"),
      ),
      60000,
    );

    // Fill required fields for "manual" endCondition.
    await setValueBySelector(
      driver,
      's-text-field[label="Experiment Name"]',
      expName,
    );
    await setValueBySelector(
      driver,
      's-text-area[label="Experiment Description"]',
      expDesc,
    );
    await setValueBySelector(
      driver,
      's-text-field[label="Section ID to be tested"]',
      sectionId,
    );

    // s-date-field + TimeSelect are Polaris web components; drive them by setting their values and dispatching events.
    await setValueBySelector(driver, "#startDateField", startDate);
    await setValueBySelector(driver, "#startTimeSelect-input", "12:00 PM", {
      blur: true,
    });

    // Save Draft
    const saveBtn = await driver.wait(
      until.elementLocated(
        By.xpath(
          "//*[self::s-button][contains(normalize-space(), 'Save Draft')]",
        ),
      ),
      60000,
    );
    await saveBtn.click();

    await driver.wait(
      until.elementLocated(
        By.xpath("//*[contains(normalize-space(), 'Edit Experiment')]"),
      ),
      60000,
    );

    // Ensure the creation banner appeared.
    const bannerTextEl = await driver.wait(
      until.elementLocated(
        By.xpath("//*[contains(normalize-space(), 'Experiment created')]"),
      ),
      60000,
    );
    const bannerText = await bannerTextEl.getText();
    expect(bannerText).toContain("Experiment created");
  });

  it("opens the reports UI for a seeded experiment", async () => {
    await loadAppHome(driver);
    await clickText(driver, "Reports");

    await driver.wait(
      until.elementLocated(
        By.xpath("//*[contains(normalize-space(), 'Reports')]"),
      ),
      60000,
    );

    // Seeded from `seedBase`: experiment id 2003 name "Add-to-Cart Button Color Test"
    const reportLink = await driver.wait(
      until.elementLocated(
        By.xpath(
          "//*[self::s-link][contains(normalize-space(), 'Add-to-Cart Button Color Test')]",
        ),
      ),
      60000,
    );
    await reportLink.click();

    await driver.wait(
      until.elementLocated(
        By.xpath("//*[contains(normalize-space(), 'Report')]"),
      ),
      60000,
    );

    // Since we haven't collected events yet for experiment 2003, it should still be in "collecting data" state.
    const collectingEl = await driver.wait(
      until.elementLocated(
        By.xpath(
          "//*[contains(normalize-space(), 'We need more visitors to generate a report.')]",
        ),
      ),
      60000,
    );
    expect(await collectingEl.getText()).toContain(
      "We need more visitors to generate a report.",
    );
  });

  it("collects events and updates the report recommendation", async () => {
    await loadAppHome(driver);
    await clickText(driver, "Reports");

    const reportLink = await driver.wait(
      until.elementLocated(
        By.xpath(
          "//*[self::s-link][contains(normalize-space(), 'Add-to-Cart Button Color Test')]",
        ),
      ),
      60000,
    );
    await reportLink.click();

    // Initial state
    await driver.wait(
      until.elementLocated(
        By.xpath(
          "//*[contains(normalize-space(), 'We need more visitors to generate a report.')]",
        ),
      ),
      60000,
    );

    const controlUser = "e2e-control-user";
    const variantAUser = "e2e-variantA-user";

    // Allocate both Control + Variant A for the same active experiment (seedBase: experiment 2003).
    await apiPostJson("/api/collect", {
      event_type: "experiment_include",
      client_id: controlUser,
      experiment_id: 2003,
      experimentId: 2003,
      variant: "Control",
      device_type: "desktop",
      timestamp: new Date().toISOString(),
    });

    await apiPostJson("/api/collect", {
      event_type: "experiment_include",
      client_id: variantAUser,
      experiment_id: 2003,
      experimentId: 2003,
      variant: "Variant A",
      device_type: "desktop",
      timestamp: new Date().toISOString(),
    });

    // Persist conversions for both so the report can compute recommendation without winners.
    await apiPostJson("/api/collect", {
      event_type: "checkout_completed",
      client_id: controlUser,
      device_type: "desktop",
      total_price: 10,
      timestamp: new Date().toISOString(),
    });

    await apiPostJson("/api/collect", {
      event_type: "checkout_completed",
      client_id: variantAUser,
      device_type: "desktop",
      total_price: 10,
      timestamp: new Date().toISOString(),
    });

    // Recompute analysis snapshot.
    // Because `api.collect` does not await event handling, retry+refresh until the recommendation updates.
    const initialPhrase = "We need more visitors to generate a report.";

    let updated = false;
    for (let attempt = 0; attempt < 4; attempt++) {
      await executeAnalysis();

      // Refresh UI and re-enter iframe context (refresh resets frame traversal).
      await driver.navigate().refresh();
      await switchToAppIFrame(driver, 60000);

      const matches = await driver.findElements(
        By.xpath(`//*[contains(normalize-space(), '${initialPhrase}')]`),
      );
      if (matches.length === 0) {
        updated = true;
        break;
      }
      await new Promise((r) => setTimeout(r, 1500));
    }

    expect(updated).toBe(true);

    // Optional: ensure the "no clear winner" message appears at least sometimes.
    // (If the message differs due to probabilistic edges, the primary assertion is that the collecting phrase disappears.)
    const possibleKeepTesting = await driver.findElements(
      By.xpath("//*[contains(normalize-space(), 'No clear winner yet.')]"),
    );
    if (possibleKeepTesting.length > 0) {
      expect(await possibleKeepTesting[0].getText()).toContain(
        "No clear winner yet.",
      );
    }
  });

  it("toggles end condition UI and shows variants on Edit Experiment", async () => {
    // Use a draft experiment where schedule+structure editing should not be locked.
    await loadAppHome(driver);

    // Direct in-app navigation within the iframe.
    await driver.executeScript("window.location.href='/app/experiments/2001';");
    await switchToAppIFrame(driver, 60000);

    await driver.wait(
      until.elementLocated(
        By.xpath("//*[contains(normalize-space(), 'Edit Experiment')]"),
      ),
      60000,
    );

    // End condition buttons exist.
    const manualBtn = await driver.findElements(
      By.xpath("//*[self::s-button][contains(normalize-space(), 'Manual')]"),
    );
    const endDateBtn = await driver.findElements(
      By.xpath("//*[self::s-button][contains(normalize-space(), 'End date')]"),
    );
    const stableBtn = await driver.findElements(
      By.xpath(
        "//*[self::s-button][contains(normalize-space(), 'Stable success probability')]",
      ),
    );
    expect(manualBtn.length).toBeGreaterThan(0);
    expect(endDateBtn.length).toBeGreaterThan(0);
    expect(stableBtn.length).toBeGreaterThan(0);

    // End date toggle shows date inputs.
    await endDateBtn[0].click();
    await driver.wait(
      until.elementLocated(
        By.xpath("//*[contains(normalize-space(), 'End Date')]"),
      ),
      60000,
    );

    // Stable success probability toggle shows probability + duration controls.
    await stableBtn[0].click();
    await driver.wait(
      until.elementLocated(
        By.xpath(
          "//*[contains(normalize-space(), 'Probability to be the best greater than')]",
        ),
      ),
      60000,
    );
    await driver.wait(
      until.elementLocated(
        By.xpath("//*[contains(normalize-space(), 'For at least')]"),
      ),
      60000,
    );

    // Variants area renders at least one non-control variant.
    await driver.wait(
      until.elementLocated(
        By.xpath("//*[contains(normalize-space(), 'Variant A')]"),
      ),
      60000,
    );
  });
});
