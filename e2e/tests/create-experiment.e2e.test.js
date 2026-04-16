import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { By } from "selenium-webdriver";
import { createDriver, quitDriver } from "../helpers/driver.js";
import { loginToShopifyAdmin, navigateToAppRoute } from "../helpers/auth.js";
import { switchToAppIframe, waitForAppReady } from "../helpers/iframe.js";
import { getTextContent } from "../helpers/shadow.js";

async function setFieldValueByLabel(driver, tagName, label, value) {
  const changed = await driver.executeScript(
    `
      const [tagName, label, value] = arguments;
      const target = [...document.querySelectorAll(tagName)].find(
        (el) => el.getAttribute("label") === label,
      );
      if (!target) return false;

      target.value = value;
      target.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
      target.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
      target.dispatchEvent(new Event("blur", { bubbles: true, composed: true }));
      return true;
    `,
    tagName,
    label,
    value,
  );

  expect(changed).toBe(true);
}

async function clickButtonByText(driver, text) {
  const clicked = await driver.executeScript(
    `
      const text = arguments[0];
      const button = [...document.querySelectorAll("s-button")].find(
        (el) => (el.textContent || "").trim() === text,
      );
      if (!button) return false;
      button.click();
      return true;
    `,
    text,
  );

  expect(clicked).toBe(true);
}

async function getButtonDisabledByText(driver, text) {
  return driver.executeScript(
    `
      const text = arguments[0];
      const button = [...document.querySelectorAll("s-button")].find(
        (el) => (el.textContent || "").trim() === text,
      );
      if (!button) return null;
      return button.disabled || button.hasAttribute("disabled");
    `,
    text,
  );
}

async function getFieldValueByLabel(driver, tagName, label) {
  return driver.executeScript(
    `
      const [tagName, label] = arguments;
      const target = [...document.querySelectorAll(tagName)].find(
        (el) => el.getAttribute("label") === label,
      );
      if (!target) return null;
      return target.value ?? "";
    `,
    tagName,
    label,
  );
}

describe("Create Experiment", () => {
  let driver;

  beforeAll(async () => {
    driver = await createDriver();
    await loginToShopifyAdmin(driver);
  });

  beforeEach(async () => {
    await navigateToAppRoute(driver, "/app/experiments/new");
    await switchToAppIframe(driver);
    await waitForAppReady(driver);
  });

  afterAll(async () => {
    await quitDriver(driver);
  });

  it("saves a valid draft experiment with manual end condition", async () => {
    await setFieldValueByLabel(
      driver,
      "s-text-field",
      "Experiment Name",
      "E2E Draft Test - Manual",
    );
    await setFieldValueByLabel(
      driver,
      "s-text-area",
      "Experiment Description",
      "Valid draft creation from selenium e2e test",
    );
    await setFieldValueByLabel(
      driver,
      "s-text-field",
      "Section ID to be tested",
      "shopify-section-sections--25210977943842__header",
    );
    await setFieldValueByLabel(
      driver,
      "s-date-field",
      "Start Date",
      "2099-12-31",
    );

    await clickButtonByText(driver, "Save Draft");

    await driver.switchTo().defaultContent();
    await driver.wait(async () => {
      const url = await driver.getCurrentUrl();
      return /\/app\/experiments\/\d+/.test(url);
    }, 30_000);
  });

  it("shows validation errors when required fields are missing", async () => {
    await clickButtonByText(driver, "Save Draft");

    const body = await driver.findElement(By.css("body"));
    await driver.wait(async () => {
      const text = await getTextContent(driver, body);
      return (
        text.includes("Name is required") &&
        text.includes("Description is required") &&
        text.includes("Start date is required") &&
        text.includes("Variant A Section ID is required")
      );
    }, 20_000);
  });

  it("validates stable success probability inputs and recovers with valid values", async () => {
    await setFieldValueByLabel(
      driver,
      "s-text-field",
      "Experiment Name",
      "E2E Stable Success Test",
    );
    await setFieldValueByLabel(
      driver,
      "s-text-area",
      "Experiment Description",
      "Stable success validation and recovery flow",
    );
    await setFieldValueByLabel(
      driver,
      "s-text-field",
      "Section ID to be tested",
      "shopify-section-sections--25210977943842__header",
    );
    await setFieldValueByLabel(
      driver,
      "s-date-field",
      "Start Date",
      "2099-12-31",
    );

    await clickButtonByText(driver, "Stable success probability");

    await setFieldValueByLabel(
      driver,
      "s-number-field",
      "Probability to be the best greater than",
      "40",
    );
    await setFieldValueByLabel(driver, "s-number-field", "For at least", "0");

    const body = await driver.findElement(By.css("body"));
    await driver.wait(async () => {
      const text = await getTextContent(driver, body);
      return (
        text.includes("Probability must be between 51-100") &&
        text.includes("Duration must be greater than 1")
      );
    }, 20_000);

    await setFieldValueByLabel(
      driver,
      "s-number-field",
      "Probability to be the best greater than",
      "60",
    );
    await setFieldValueByLabel(driver, "s-number-field", "For at least", "2");

    await clickButtonByText(driver, "Save Draft");

    await driver.switchTo().defaultContent();
    await driver.wait(async () => {
      const url = await driver.getCurrentUrl();
      return /\/app\/experiments\/\d+/.test(url);
    }, 30_000);
  });

  it("validates end date must be after start date and allows recovery", async () => {
    await setFieldValueByLabel(
      driver,
      "s-text-field",
      "Experiment Name",
      "E2E End Date Validation Test",
    );
    await setFieldValueByLabel(
      driver,
      "s-text-area",
      "Experiment Description",
      "End date validation and recovery flow",
    );
    await setFieldValueByLabel(
      driver,
      "s-text-field",
      "Section ID to be tested",
      "shopify-section-sections--25210977943842__header",
    );
    await setFieldValueByLabel(
      driver,
      "s-date-field",
      "Start Date",
      "2099-12-31",
    );

    await clickButtonByText(driver, "End date");
    await setFieldValueByLabel(driver, "s-date-field", "End Date", "2099-12-30");
    await clickButtonByText(driver, "Save Draft");

    const body = await driver.findElement(By.css("body"));
    await driver.wait(async () => {
      const text = await getTextContent(driver, body);
      return (
        text.includes("End date must be after the start date") ||
        text.includes("End must be after start date/time")
      );
    }, 20_000);

    await setFieldValueByLabel(driver, "s-date-field", "End Date", "2100-01-02");
    await clickButtonByText(driver, "Save Draft");

    await driver.switchTo().defaultContent();
    await driver.wait(async () => {
      const url = await driver.getCurrentUrl();
      return /\/app\/experiments\/\d+/.test(url);
    }, 30_000);
  });

  it("shows required validation when end condition is end date and end date is missing", async () => {
    await setFieldValueByLabel(
      driver,
      "s-text-field",
      "Experiment Name",
      "E2E End Date Required Test",
    );
    await setFieldValueByLabel(
      driver,
      "s-text-area",
      "Experiment Description",
      "End date required validation flow",
    );
    await setFieldValueByLabel(
      driver,
      "s-text-field",
      "Section ID to be tested",
      "shopify-section-sections--25210977943842__header",
    );
    await setFieldValueByLabel(
      driver,
      "s-date-field",
      "Start Date",
      "2099-12-31",
    );
    await clickButtonByText(driver, "End date");
    await clickButtonByText(driver, "Save Draft");

    const body = await driver.findElement(By.css("body"));
    await driver.wait(async () => {
      const text = await getTextContent(driver, body);
      return text.includes("End date is required");
    }, 20_000);
  });

  it("enforces max variant limit at four variants", async () => {
    await clickButtonByText(driver, "Add Another Variant");
    await clickButtonByText(driver, "Add Another Variant");
    await clickButtonByText(driver, "Add Another Variant");

    const body = await driver.findElement(By.css("body"));
    await driver.wait(async () => {
      const text = await getTextContent(driver, body);
      return text.includes("Variant D");
    }, 20_000);

    const addDisabled = await getButtonDisabledByText(driver, "Add Another Variant");
    expect(addDisabled).toBe(true);
  });

  it("shows required validation for Variant B section ID when second variant is added", async () => {
    await setFieldValueByLabel(
      driver,
      "s-text-field",
      "Experiment Name",
      "E2E Variant B Required Test",
    );
    await setFieldValueByLabel(
      driver,
      "s-text-area",
      "Experiment Description",
      "Variant B required field validation flow",
    );
    await setFieldValueByLabel(
      driver,
      "s-text-field",
      "Section ID to be tested",
      "shopify-section-sections--25210977943842__header",
    );
    await setFieldValueByLabel(
      driver,
      "s-date-field",
      "Start Date",
      "2099-12-31",
    );

    await clickButtonByText(driver, "Add Another Variant");
    await clickButtonByText(driver, "Save Draft");

    const body = await driver.findElement(By.css("body"));
    await driver.wait(async () => {
      const text = await getTextContent(driver, body);
      return text.includes("Variant B Section ID is required");
    }, 20_000);
  });

  it("validates custom max users and allows recovery with a valid value", async () => {
    await setFieldValueByLabel(
      driver,
      "s-text-field",
      "Experiment Name",
      "E2E Max Users Validation Test",
    );
    await setFieldValueByLabel(
      driver,
      "s-text-area",
      "Experiment Description",
      "Custom max users validation and recovery",
    );
    await setFieldValueByLabel(
      driver,
      "s-text-field",
      "Section ID to be tested",
      "shopify-section-sections--25210977943842__header",
    );
    await setFieldValueByLabel(
      driver,
      "s-date-field",
      "Start Date",
      "2099-12-31",
    );

    await driver.executeScript(
      `
        const checkbox = [...document.querySelectorAll("s-checkbox")].find(
          (el) => el.getAttribute("label") === "Use account default max users",
        );
        if (checkbox) checkbox.click();
      `,
    );

    await driver.wait(async () => {
      const value = await getFieldValueByLabel(driver, "s-number-field", "Max users");
      return value !== null;
    }, 10_000);

    await setFieldValueByLabel(driver, "s-number-field", "Max users", "0");
    await clickButtonByText(driver, "Save Draft");

    const body = await driver.findElement(By.css("body"));
    await driver.wait(async () => {
      const text = await getTextContent(driver, body);
      return text.includes("Must be at least 1");
    }, 20_000);

    await setFieldValueByLabel(driver, "s-number-field", "Max users", "1000");
    await clickButtonByText(driver, "Save Draft");
    await driver.switchTo().defaultContent();
    await driver.wait(async () => {
      const url = await driver.getCurrentUrl();
      return /\/app\/experiments\/\d+/.test(url);
    }, 30_000);
  });

  it("discards current input and returns the form to required-field state", async () => {
    await setFieldValueByLabel(
      driver,
      "s-text-field",
      "Experiment Name",
      "E2E Discard Reset Test",
    );
    await setFieldValueByLabel(
      driver,
      "s-text-area",
      "Experiment Description",
      "Verify discard returns form to default state",
    );
    await setFieldValueByLabel(
      driver,
      "s-text-field",
      "Section ID to be tested",
      "shopify-section-sections--25210977943842__header",
    );
    await setFieldValueByLabel(
      driver,
      "s-date-field",
      "Start Date",
      "2099-12-31",
    );

    await clickButtonByText(driver, "Discard");

    await clickButtonByText(driver, "Save Draft");

    const body = await driver.findElement(By.css("body"));
    await driver.wait(async () => {
      const text = await getTextContent(driver, body);
      return (
        text.includes("Name is required") &&
        text.includes("Description is required") &&
        text.includes("Start date is required")
      );
    }, 20_000);
  });

  it("shows validation when start date/time is in the past", async () => {
    await setFieldValueByLabel(
      driver,
      "s-text-field",
      "Experiment Name",
      "E2E Past Start Validation Test",
    );
    await setFieldValueByLabel(
      driver,
      "s-text-area",
      "Experiment Description",
      "Start date/time in past should be blocked",
    );
    await setFieldValueByLabel(
      driver,
      "s-text-field",
      "Section ID to be tested",
      "shopify-section-sections--25210977943842__header",
    );
    await setFieldValueByLabel(driver, "s-date-field", "Start Date", "2000-01-01");
    await clickButtonByText(driver, "Save Draft");

    const body = await driver.findElement(By.css("body"));
    await driver.wait(async () => {
      const text = await getTextContent(driver, body);
      return (
        text.includes("Start date/time must be in the future") ||
        text.includes("Start date cannot be in the past")
      );
    }, 20_000);
  });

  it("shows validation when end date is in the past", async () => {
    await setFieldValueByLabel(
      driver,
      "s-text-field",
      "Experiment Name",
      "E2E Past End Date Validation Test",
    );
    await setFieldValueByLabel(
      driver,
      "s-text-area",
      "Experiment Description",
      "End date in past should be blocked",
    );
    await setFieldValueByLabel(
      driver,
      "s-text-field",
      "Section ID to be tested",
      "shopify-section-sections--25210977943842__header",
    );
    await setFieldValueByLabel(driver, "s-date-field", "Start Date", "2099-12-31");
    await clickButtonByText(driver, "End date");
    await setFieldValueByLabel(driver, "s-date-field", "End Date", "2000-01-01");
    await clickButtonByText(driver, "Save Draft");

    const body = await driver.findElement(By.css("body"));
    await driver.wait(async () => {
      const text = await getTextContent(driver, body);
      return text.includes("End date cannot be in the past");
    }, 20_000);
  });

});
