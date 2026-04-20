import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { By } from "selenium-webdriver";
import { createDriver, quitDriver } from "../helpers/driver.js";
import { loginToShopifyAdmin, navigateToAppRoute } from "../helpers/auth.js";
import { switchToAppIframe, switchToParent, waitForAppReady } from "../helpers/iframe.js";
import { getTextContent } from "../helpers/shadow.js";
import { sleep } from "../helpers/waits.js";
import {
  openAppHomeInIframe,
  dismissExperimentListTutorialIfPresent,
  clickNavigateToExperimentList,
  clickCreateExperimentFromListPage,
  clickFirstExperimentNameLink,
  openRowMenuForRowContaining,
  openRowMenuFirstDataRow,
  clickButtonWithExactLabel,
  selectFilterByOption,
  getDataRowTexts,
  getExperimentNameFromRowContaining,
  getPopoverMenuLabels,
  cancelInlineRename,
  waitForRowContaining,
} from "../helpers/experimentListPage.js";

/**
 * Flows from the experiments list (reached via the in-app "Experiments" control from home).
 *
 * Preconditions: see e2e/README.md (cookies, dev server, .env.e2e). Several tests need
 * existing experiments; one test needs a draft row to run the full status workflow.
 */
describe("Experiment list — UI flows", () => {
  let driver;

  beforeAll(async () => {
    driver = await createDriver();
    await loginToShopifyAdmin(driver);
    await openAppHomeInIframe(driver);
    await dismissExperimentListTutorialIfPresent(driver);
    await clickNavigateToExperimentList(driver);
    await dismissExperimentListTutorialIfPresent(driver);
  });

  afterAll(async () => {
    await quitDriver(driver);
  });

  async function returnToExperimentList() {
    await navigateToAppRoute(driver, "/app/experiments");
    await switchToParent(driver);
    await driver.wait(async () => {
      const url = await driver.getCurrentUrl();
      return url.includes("/app/experiments");
    }, 30_000);
    await switchToAppIframe(driver);
    await waitForAppReady(driver);
    await dismissExperimentListTutorialIfPresent(driver);
  }

  it("opens the app home, clicks Experiments, then Create Experiment, and reaches the create page", async () => {
    await returnToExperimentList();
    await clickCreateExperimentFromListPage(driver);
    await switchToParent(driver);
    const url = await driver.getCurrentUrl();
    expect(url).toContain("/apps/ab-insightful-1/app/experiments/new");
    await switchToAppIframe(driver);
    await waitForAppReady(driver);

    const body = await driver.findElement(By.css("body"));
    const text = await getTextContent(driver, body);
    expect(text).toContain("Experiment Name");
    expect(text).toContain("Save Draft");
  });

  it("from the list, clicking an experiment name opens that experiment’s report", async () => {
    await returnToExperimentList();
    const rows = await getDataRowTexts(driver);
    expect(rows.length).toBeGreaterThan(0);

    await clickFirstExperimentNameLink(driver);

    await switchToParent(driver);
    const url = await driver.getCurrentUrl();
    expect(url).toMatch(/\/reports\/\d+/);

    await switchToAppIframe(driver);
    await waitForAppReady(driver);
    const body = await driver.findElement(By.css("body"));
    const text = await getTextContent(driver, body);
    expect(text).toContain("Variant Success Rate");
    expect(text).toContain("Recommended course of action");
  });

  it("kebab menu → Rename opens inline rename (not navigation to a separate edit route)", async () => {
    await returnToExperimentList();
    const rows = await getDataRowTexts(driver);
    expect(rows.length).toBeGreaterThan(0);

    const popoverId = await openRowMenuFirstDataRow(driver);
    await clickButtonWithExactLabel(driver, "Rename", popoverId);

    const fields = await driver.findElements(By.css("s-text-field"));
    expect(fields.length).toBeGreaterThan(0);
    await switchToParent(driver);
    const url = await driver.getCurrentUrl();
    expect(url).toContain("/apps/ab-insightful-1/app/experiments");
    await switchToAppIframe(driver);
    await waitForAppReady(driver);

    await cancelInlineRename(driver);
    await sleep(500);
  });

  it("active experiment row menu offers Rename, Pause, and End (archive is only for completed in this app)", async () => {
    await returnToExperimentList();
    const rows = await getDataRowTexts(driver);
    const hasActive = rows.some((r) => /\bActive\b/.test(r));
    expect(hasActive).toBe(true);

    const popoverId = await openRowMenuForRowContaining(driver, "Active");
    const labels = await getPopoverMenuLabels(driver, popoverId);
    expect(labels).toContain("Rename");
    expect(labels).toContain("Pause");
    expect(labels).toContain("End");
    expect(labels).not.toContain("Archive");
    await sleep(300);
  });

  it("draft → Start becomes Active; Active → Pause becomes Paused; Paused → End becomes Completed; Completed → Archive becomes Archived", async () => {
    await returnToExperimentList();
    const rows = await getDataRowTexts(driver);
    const hasDraft = rows.some((r) => /\bDraft\b/.test(r));
    expect(hasDraft).toBe(true);

    const experimentName = await getExperimentNameFromRowContaining(driver, "Draft");
    expect(experimentName).toBeTruthy();

    let popoverId = await openRowMenuForRowContaining(driver, "Draft");
    await clickButtonWithExactLabel(driver, "Start", popoverId);
    await sleep(8000);
    await waitForRowContaining(driver, 90_000, experimentName, "Active");

    popoverId = await openRowMenuForRowContaining(driver, experimentName, "Active");
    await clickButtonWithExactLabel(driver, "Pause", popoverId);
    await sleep(8000);
    await waitForRowContaining(driver, 90_000, experimentName, "Paused");

    popoverId = await openRowMenuForRowContaining(driver, experimentName, "Paused");
    await clickButtonWithExactLabel(driver, "End", popoverId);
    await sleep(8000);
    await waitForRowContaining(driver, 90_000, experimentName, "Completed");

    popoverId = await openRowMenuForRowContaining(driver, experimentName, "Completed");
    await clickButtonWithExactLabel(driver, "Archive", popoverId);
    await sleep(8000);
    await waitForRowContaining(driver, 90_000, experimentName, "Archived");
  });

  it("Filter By shows only rows matching the selected status", async () => {
    await returnToExperimentList();
    const filters = ["All", "Draft", "Active", "Completed", "Paused", "Archived"];

    for (const label of filters) {
      await selectFilterByOption(driver, label);
      const visibleRows = await getDataRowTexts(driver);

      if (label === "All") {
        continue;
      }

      if (visibleRows.length === 0) {
        continue;
      }

      for (const row of visibleRows) {
        expect(row).toContain(label);
      }
    }
  });
});
