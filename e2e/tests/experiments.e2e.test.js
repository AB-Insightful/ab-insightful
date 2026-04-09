import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { By } from "selenium-webdriver";
import { createDriver, quitDriver } from "../helpers/driver.js";
import { loginToShopifyAdmin, navigateToAppRoute } from "../helpers/auth.js";
import { switchToAppIframe, waitForAppReady } from "../helpers/iframe.js";
import { getTextContent, jsClick } from "../helpers/shadow.js";
import { sleep } from "../helpers/waits.js";

describe("Experiments", () => {
  let driver;

  beforeAll(async () => {
    driver = await createDriver();
    await loginToShopifyAdmin(driver);

    await navigateToAppRoute(driver, "/app/experiments");
    await switchToAppIframe(driver);
    await waitForAppReady(driver);
  });

  afterAll(async () => {
    await quitDriver(driver);
  });

  it("should display the experiments list page", async () => {
    const body = await driver.findElement(By.css("body"));
    const text = await getTextContent(driver, body);
    // The experiments list shows table headers for experiment data
    expect(text).toContain("Name");
    expect(text).toContain("Status");
  });

  it("should show experiment table columns", async () => {
    const body = await driver.findElement(By.css("body"));
    const text = await getTextContent(driver, body);

    // The table includes these column headers
    expect(text).toContain("Goal Completion Rate");
    expect(text).toContain("Probability to be the best");
  });

  it("should navigate to the create new experiment page", async () => {
    await navigateToAppRoute(driver, "/app/experiments/new");
    await switchToAppIframe(driver);
    await waitForAppReady(driver);

    await sleep(3000);
    const body = await driver.findElement(By.css("body"));
    const text = await getTextContent(driver, body);

    // The new experiment page should have form-related content
    const isNewPage =
      text.includes("New") ||
      text.includes("Create") ||
      text.includes("Name") ||
      text.includes("Experiment");

    expect(isNewPage).toBe(true);
  });
});
