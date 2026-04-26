import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { By } from "selenium-webdriver";
import { createDriver, quitDriver } from "../helpers/driver.js";
import { loginToShopifyAdmin, navigateToAppRoute } from "../helpers/auth.js";
import { switchToAppIframe, waitForAppReady } from "../helpers/iframe.js";
import { getTextContent } from "../helpers/shadow.js";
import { sleep } from "../helpers/waits.js";

describe("Edit Experiment", () => {
  let driver;
  let testExperimentId;
  let testExperimentName;

  beforeAll(async () => {
    driver = await createDriver();
    await loginToShopifyAdmin(driver);
    const draft = await findDraftExperiment();
    testExperimentId = draft.id;
    testExperimentName = draft.name;
    await openEditExperimentPage();
  });

  afterAll(async () => {
    await quitDriver(driver);
  });

  async function openEditExperimentPage() {
    await navigateToAppRoute(driver, `/app/experiments/${testExperimentId}`);
    await switchToAppIframe(driver);
    await waitForAppReady(driver);
    await sleep(250);
  }

  async function findDraftExperiment() {
    await navigateToAppRoute(driver, "/app/experiments");
    await switchToAppIframe(driver);
    await waitForAppReady(driver);

    const result = await driver.executeScript(`
      const rows = document.querySelectorAll("s-table-body s-table-row");
      for (const row of rows) {
        const text = (row.textContent || "").replace(/\\s+/g, " ").trim();
        if (!/\\bDraft\\b/.test(text)) continue;
        const link = row.querySelector('s-link[href*="/app/reports/"]');
        const href = (link?.getAttribute("href") || "");
        const match = href.match(/\\/app\\/reports\\/(\\d+)/);
        const name = (link?.textContent || "").replace(/\\s+/g, " ").trim();
        if (match && name) {
          return { id: match[1], name };
        }
      }
      return null;
    `);

    expect(result, "Expected at least one draft experiment row on list page").toBeTruthy();
    return result;
  }

  async function getBodyText() {
    const body = await driver.findElement(By.css("body"));
    return getTextContent(driver, body);
  }

  async function setFieldByLabelIncludes(labelText, value) {
    const changed = await driver.executeScript(
      `
      const [labelText, value] = arguments;

      const fields = [
        ...document.querySelectorAll(
          "s-text-field, s-text-area, s-number-field, s-date-field, s-select"
        ),
      ];

      const field = fields.find((el) =>
        (el.getAttribute("label") || "").includes(labelText)
      );

      if (!field) return false;

      field.value = value;
      field.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
      field.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
      field.dispatchEvent(new Event("blur", { bubbles: true, composed: true }));
      field.dispatchEvent(new FocusEvent("focusout", { bubbles: true, composed: true }));

      return true;
      `,
      labelText,
      value,
    );

    expect(changed, `Could not find field with label including "${labelText}"`).toBe(true);
  }

  async function getFieldValueByLabelIncludes(labelText) {
    return driver.executeScript(
      `
      const labelText = arguments[0];

      const fields = [
        ...document.querySelectorAll(
          "s-text-field, s-text-area, s-number-field, s-date-field, s-select"
        ),
      ];

      const field = fields.find((el) =>
        (el.getAttribute("label") || "").includes(labelText)
      );

      return field ? field.value : null;
      `,
      labelText,
    );
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

  async function getButtonDisabledByTextIncludes(text) {
    return driver.executeScript(
      `
      const wanted = arguments[0];

      for (const btn of document.querySelectorAll("s-button, button")) {
        const current = (btn.textContent || "").replace(/\\s+/g, " ").trim();
        if (current.includes(wanted)) {
          return btn.disabled || btn.hasAttribute("disabled");
        }
      }

      return null;
      `,
      text,
    );
  }

  function futureDateString(daysFromNow = 7) {
    const date = new Date();
    date.setDate(date.getDate() + daysFromNow);

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
  }

  it("should load the edit experiment page for a draft experiment", async () => {
    const text = await getBodyText();

    expect(text).toContain(testExperimentName);
    expect(text).toContain("Experiment Name");
    expect(text).toContain("Experiment Description");
    expect(text).toContain("Experiment Goal");
    expect(text).toContain("Section ID to be tested");
    expect(text).toContain("Customer segment to test");
    expect(text).toContain("Status");
    expect(text).toContain("Draft");
    expect(text).toContain("Save Draft");
  });

    it("should show draft setup details", async () => {
        const text = await getBodyText();

        // Dynamically selected draft may or may not already have a section assigned.
        expect(text).toMatch(/Variant A:\s*(Section not selected|[^\n]+)/);
        expect(text).toContain("Active from");
        // Some drafts are open-ended ("until —"), others already have an end date.
        expect(text).toMatch(/until\s+(—|[A-Za-z]+\s+\d{1,2},\s+\d{4})/);

        const saveDisabled = await getButtonDisabledByTextIncludes("Save Draft");

        // The button can be enabled because missing fields do not count as client errors
        // until validation runs.
        expect(saveDisabled).toBe(false);
    });

    it("should allow editing draft fields in the UI", async () => {
        const editedName = `Selenium Edit - ${testExperimentName} ${Date.now()}`;
        const editedDescription = "Edited by Selenium for the edit experiment e2e test.";

        await setFieldByLabelIncludes("Experiment Name", editedName);
        await setFieldByLabelIncludes("Experiment Description", editedDescription);
        await setFieldByLabelIncludes("Section ID to be tested", "checkout-trust-badges-test");
        await setFieldByLabelIncludes("Customer segment to test", "mobileVisitors");

        await sleep(1000);

        const currentName = await getFieldValueByLabelIncludes("Experiment Name");
        const currentDescription = await getFieldValueByLabelIncludes("Experiment Description");
        const currentSectionId = await getFieldValueByLabelIncludes("Section ID to be tested");
        const currentSegment = await getFieldValueByLabelIncludes("Customer segment to test");

        expect(currentName).toBe(editedName);
        expect(currentDescription).toBe(editedDescription);
        expect(currentSectionId).toBe("checkout-trust-badges-test");
        expect(currentSegment).toBe("mobileVisitors");

        const text = await getBodyText();
        expect(text).toContain("Save Draft");
    });

    it("should show fallback preview text when the experiment name is cleared", async () => {
        await openEditExperimentPage();

        await setFieldByLabelIncludes("Experiment Name", "");
        await sleep(500);

        const text = await getBodyText();

        expect(text).toContain("no experiment name set");
    });

    it("should update the allocation summary when variant traffic changes", async () => {
        await openEditExperimentPage();

        await setFieldByLabelIncludes("Traffic allocation for Variant A", "75");
        await sleep(500);

        const text = await getBodyText();

        expect(text).toContain("75% Variant A");
        expect(text).toContain("25% Control");
    });
});
