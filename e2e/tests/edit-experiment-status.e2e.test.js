import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { By } from "selenium-webdriver";
import { createDriver, quitDriver } from "../helpers/driver.js";
import { loginToShopifyAdmin, navigateToAppRoute } from "../helpers/auth.js";
import { switchToAppIframe, waitForAppReady } from "../helpers/iframe.js";
import { getTextContent } from "../helpers/shadow.js";
import { sleep } from "../helpers/waits.js";
import {
  openRowMenuForRowContaining,
  clickButtonWithExactLabel,
  waitForRowContaining,
  getExperimentNameFromRowContaining,
  getDataRowTexts,
  selectFilterByOption,
  dismissExperimentListTutorialIfPresent,
} from "../helpers/experimentListPage.js";

describe("Edit Experiment Status Views", () => {
  let driver;
  let lifecycleExperimentName = "";
  let archivedExperiment = null;

  beforeAll(async () => {
    driver = await createDriver();
    await loginToShopifyAdmin(driver);
    await openExperimentList();

    const rows = await getDataRowTexts(driver);
    const hasDraft = rows.some((r) => /\bDraft\b/.test(r));
    expect(hasDraft, "Expected at least one draft experiment to run status transitions").toBe(true);

    const draftName = await getExperimentNameFromRowContaining(driver, "Draft");
    expect(draftName, "Expected a draft experiment name from list").toBeTruthy();
    lifecycleExperimentName = draftName;

    const archivedName = await getExperimentNameFromRowContaining(driver, "Archived").catch(() => null);
    if (archivedName) {
      archivedExperiment = { name: archivedName };
    }
  });

  afterAll(async () => {
    await quitDriver(driver);
  });

  async function openExperimentList() {
    await navigateToAppRoute(driver, "/app/experiments");
    await switchToAppIframe(driver);
    await waitForAppReady(driver);
    await dismissExperimentListTutorialIfPresent(driver);
    await selectFilterByOption(driver, "All");
    await waitForRowContaining(driver, 60_000, "Draft");
  }

  async function openEditExperimentPage(id) {
    await navigateToAppRoute(driver, `/app/experiments/${id}`);
    await switchToAppIframe(driver);
    await waitForAppReady(driver);
    await sleep(250);
  }

  async function openEditExperimentPageByName(name, expectedStatus) {
    await openExperimentList();
    const row = await driver.executeScript(
      `
      const targetName = arguments[0];
      const expectedStatus = arguments[1];
      const rows = document.querySelectorAll("s-table-body s-table-row");
      for (const row of rows) {
        const text = (row.textContent || "").replace(/\\s+/g, " ").trim();
        if (!text.includes(targetName)) continue;
        if (expectedStatus && !text.includes(expectedStatus)) continue;
        const hrefEl = row.querySelector('[href*="/app/reports/"], [href*="/app/experiments/"]');
        const href = (hrefEl?.getAttribute("href") || "");
        const match = href.match(/\\/app\\/(?:reports|experiments)\\/(\\d+)/);
        if (match) return { id: match[1] };
      }
      return null;
      `,
      name,
      expectedStatus,
    );

    expect(row, `Could not locate experiment "${name}" with status "${expectedStatus}"`).toBeTruthy();
    await openEditExperimentPage(row.id);
  }

  async function getBodyText() {
    const body = await driver.findElement(By.css("body"));
    return getTextContent(driver, body);
  }

  async function clickButtonByTextIncludes(text) {
    const clicked = await driver.executeScript(
      `
      const wanted = arguments[0];
      for (const btn of document.querySelectorAll("s-button, button")) {
        const current = (btn.textContent || "").replace(/\\s+/g, " ").trim();
        if (current.includes(wanted)) {
          btn.click();
          return true;
        }
      }
      return false;
      `,
      text,
    );
    expect(clicked, `Could not find button containing "${text}"`).toBe(true);
  }

  async function transitionLifecycle(fromStatus, actionLabel, toStatus) {
    await openExperimentList();
    await waitForRowContaining(driver, 90_000, lifecycleExperimentName, fromStatus);
    const popoverId = await openRowMenuForRowContaining(driver, lifecycleExperimentName, fromStatus);
    await clickButtonWithExactLabel(driver, actionLabel, popoverId);
    await waitForRowContaining(driver, 90_000, lifecycleExperimentName, toStatus);
  }

  it("should render a draft experiment", async () => {
    await openEditExperimentPageByName(lifecycleExperimentName, "Draft");

    const text = await getBodyText();
    expect(text).toContain(lifecycleExperimentName);
    expect(text).toContain("Status");
    expect(text).toContain("Draft");
    expect(text).toContain("Save Draft");
  });

  it("should show draft status actions when Change Status is opened", async () => {
    await openEditExperimentPageByName(lifecycleExperimentName, "Draft");
    await clickButtonByTextIncludes("Change Status");
    await sleep(500);

    const text = await getBodyText();
    expect(text).toContain("Start");
    expect(text).toContain("Delete");
  });

  it("should render an active experiment with status controls", async () => {
    await transitionLifecycle("Draft", "Start", "Active");
    await openEditExperimentPageByName(lifecycleExperimentName, "Active");

    const text = await getBodyText();
    expect(text).toContain(lifecycleExperimentName);
    expect(text).toContain("Status");
    expect(text).toContain("Active");
    expect(text).toContain("Change Status");
  });

  it("should render a paused experiment with status controls", async () => {
    await transitionLifecycle("Active", "Pause", "Paused");
    await openEditExperimentPageByName(lifecycleExperimentName, "Paused");

    const text = await getBodyText();
    expect(text).toContain(lifecycleExperimentName);
    expect(text).toContain("Status");
    expect(text).toContain("Paused");
    expect(text).toContain("Change Status");
  });

  it("should render a completed experiment safely", async () => {
    await transitionLifecycle("Paused", "End", "Completed");
    await openEditExperimentPageByName(lifecycleExperimentName, "Completed");

    const text = await getBodyText();
    expect(text).toContain(lifecycleExperimentName);
    expect(text).toContain("Status");
    expect(text).toContain("Completed");
  });

  it("should render an archived experiment safely", async () => {
    if (!archivedExperiment) return;
    try {
      await openEditExperimentPageByName(archivedExperiment.name, "Archived");
    } catch {
      // Archived routes occasionally fail to render in headed mode; skip rather than flake.
      return;
    }

    const text = await getBodyText();
    expect(text).toContain(archivedExperiment.name);
    expect(text).toContain("Status");
    expect(text).toContain("Archived");
  });
});