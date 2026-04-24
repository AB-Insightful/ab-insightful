import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { By } from "selenium-webdriver";
import { createDriver, quitDriver } from "../helpers/driver.js";
import { loginToShopifyAdmin, navigateToApp, navigateToAppRoute } from "../helpers/auth.js";
import { switchToAppIframe, waitForAppReady, waitForParentAppNav } from "../helpers/iframe.js";
import { getTextContent } from "../helpers/shadow.js";

describe("Smoke Test - App Loads in Shopify Admin", () => {
  let driver;

  beforeAll(async () => {
    driver = await createDriver();
    await loginToShopifyAdmin(driver);
    await navigateToApp(driver);
    await switchToAppIframe(driver);
    await waitForAppReady(driver);
  });

  afterAll(async () => {
    await quitDriver(driver);
  });

  it("should load the app dashboard inside the Shopify Admin iframe", async () => {
    const body = await driver.findElement(By.css("body"));
    const text = await getTextContent(driver, body);
    expect(text.length).toBeGreaterThan(0);
  });

  it("should display the app navigation", async () => {
    // Nav is rendered by App Bridge in the admin parent frame, not inside the app iframe.
    await waitForParentAppNav(driver);
  });

  it("should navigate to the Experiments page", async () => {
    // App Bridge nav links have zero size in the iframe — navigate via URL
    await navigateToAppRoute(driver, "/app/experiments");
    await switchToAppIframe(driver);
    await waitForAppReady(driver);

    const body = await driver.findElement(By.css("body"));
    const bodyText = await getTextContent(driver, body);
    expect(bodyText).toContain("Experiment");
  });

  it("should navigate to the Reports page", async () => {
    await navigateToAppRoute(driver, "/app/reports");
    await switchToAppIframe(driver);
    await waitForAppReady(driver);

    const body = await driver.findElement(By.css("body"));
    const bodyText = await getTextContent(driver, body);
    expect(bodyText).toContain("Report");
  });

  it("should navigate to the Settings page", async () => {
    await navigateToAppRoute(driver, "/app/settings");
    await switchToAppIframe(driver);
    await waitForAppReady(driver);

    const body = await driver.findElement(By.css("body"));
    const bodyText = await getTextContent(driver, body);
    expect(bodyText).toContain("Settings");
  });
});
