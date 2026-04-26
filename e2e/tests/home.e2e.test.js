import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { By } from "selenium-webdriver";
import { createDriver, quitDriver } from "../helpers/driver.js";
import { loginToShopifyAdmin, navigateToApp, navigateToAppRoute } from "../helpers/auth.js";
import { switchToAppIframe, waitForAppReady } from "../helpers/iframe.js";
import { getTextContent } from "../helpers/shadow.js";

describe("Home Page", () => {
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

  async function openHomePage() {
    await navigateToAppRoute(driver, "/app");
    await switchToAppIframe(driver);
    await waitForAppReady(driver);
  }


  it("should load the home page with dashboard sections", async () => {
    // The page heading is an attribute on <s-page>, not in textContent — read it via JS
    const pageHeading = await driver.executeScript(
      `const p = document.querySelector("s-page"); return p ? (p.getAttribute("heading") || "") : "";`
    );
    expect(pageHeading).toContain("Welcome to AB Insightful");

    const body = await driver.findElement(By.css("body"));
    const text = await getTextContent(driver, body);
    expect(text).toContain("Latest Experiment Results");

    // "Experiment Details" is a heading attribute on <s-section>, not in textContent
    const detailsHeading = await driver.executeScript(
      `const s = document.querySelector("s-section[heading='Experiment Details']");
       return s ? (s.getAttribute("heading") || "") : "";`
    );
    expect(detailsHeading).toContain("Experiment Details");
  });

  it("should expose quick-action buttons for core routes", async () => {
    const hrefs = await driver.executeScript(`
      return Array.from(document.querySelectorAll("s-button[href]"))
        .map((button) => button.getAttribute("href") || "")
        .filter(Boolean);
    `);

    expect(hrefs.some((href) => href.includes("/app/experiments/new"))).toBe(true);
    expect(hrefs.some((href) => href.includes("/app/reports"))).toBe(true);
    expect(hrefs.some((href) => href.includes("/app/experiments"))).toBe(true);
  });

  it("should navigate to Create Experiment page", async () => {
    await navigateToAppRoute(driver, "/app/experiments/new");
    await switchToAppIframe(driver);
    await waitForAppReady(driver);

    const url = await driver.getCurrentUrl();
    expect(url).toContain("/app/experiments/new");
  });

  it("should navigate to Reports page", async () => {
    await navigateToAppRoute(driver, "/app/reports");
    await switchToAppIframe(driver);
    await waitForAppReady(driver);

    const url = await driver.getCurrentUrl();
    expect(url).toMatch(/\/app\/reports(\/?$|\?)/);
  });

  it("should navigate to Experiments page", async () => {
    await navigateToAppRoute(driver, "/app/experiments");
    await switchToAppIframe(driver);
    await waitForAppReady(driver);

    const url = await driver.getCurrentUrl();
    expect(url).toMatch(/\/app\/experiments(\/?$|\?|\/)/);
  });

  it("should render the latest results table headers", async () => {
    await openHomePage();
    const body = await driver.findElement(By.css("body"));
    const text = await getTextContent(driver, body);

    expect(text).toContain("Name");
    expect(text).toContain("Status");
    expect(text).toContain("Goal Completion Rate");
    expect(text).toContain("Improvement (%)");
    expect(text).toContain("Probability to be the best");
  });

  it("should include experiment details and a report link", async () => {
    await openHomePage();
    const body = await driver.findElement(By.css("body"));
    const text = await getTextContent(driver, body);

    expect(text).toContain("Goal:");

    const hasReportDetailsLink = await driver.executeScript(`
      return Array.from(document.querySelectorAll("s-button[href]"))
        .some((button) => {
          const href = button.getAttribute("href") || "";
          return href.includes("/app/reports/");
        });
    `);

    expect(hasReportDetailsLink).toBe(true);
  });

  it("should navigate to a specific report page", async () => {
    // Get the report link href from the home page to find a valid report ID
    await openHomePage();
    const reportHref = await driver.executeScript(`
      const btn = Array.from(document.querySelectorAll("s-button[href]"))
        .find((b) => (b.getAttribute("href") || "").includes("/app/reports/"));
      return btn ? btn.getAttribute("href") : null;
    `);
    expect(reportHref).not.toBeNull();

    await navigateToAppRoute(driver, reportHref);
    await switchToAppIframe(driver);
    await waitForAppReady(driver);

    const url = await driver.getCurrentUrl();
    expect(url).toContain("/app/reports/");
  });

  it("should navigate to Settings page", async () => {
    await navigateToAppRoute(driver, "/app/settings");
    await switchToAppIframe(driver);
    await waitForAppReady(driver);

    const url = await driver.getCurrentUrl();
    expect(url).toMatch(/\/app\/settings(\/?$|\?|\/)/);
  });

  // ---------------------------------------------------------------------------
  // Mandatory Setup Section
  // These tests are conditional — the Mandatory Setup section is only shown
  // when webPixelStatus or onSiteTracking are not yet enabled. Each test
  // returns early if the section is not visible on the current store.
  // ---------------------------------------------------------------------------

  describe("Mandatory Setup Section", () => {
    async function isMandatorySetupVisible() {
      return driver.executeScript(
        `return (document.body?.textContent || "").includes("Mandatory Setup");`
      );
    }

    it("should show the Mandatory Setup heading and description", async () => {
      await openHomePage();
      const visible = await isMandatorySetupVisible();
      if (!visible) return;

      const hasHeading = await driver.executeScript(`
        return Array.from(document.querySelectorAll("s-heading"))
          .some(h => h.textContent.includes("Mandatory Setup"));
      `);
      expect(hasHeading).toBe(true);

      const body = await driver.findElement(By.css("body"));
      const text = await getTextContent(driver, body);
      expect(text).toContain("Please complete the following steps to begin using AB Insightful");
    });

    it("should show Step 1 with the correct heading and tracking button state", async () => {
      await openHomePage();
      if (!(await isMandatorySetupVisible())) return;

      const hasStep1Heading = await driver.executeScript(`
        return Array.from(document.querySelectorAll("s-heading"))
          .some(h => h.textContent.includes("Step 1: Enable Tracking"));
      `);
      expect(hasStep1Heading).toBe(true);

      // Button must be either "Enable Tracking" (not yet done) or "Tracking Enabled" (done)
      const trackingBtnText = await driver.executeScript(`
        const btn = Array.from(document.querySelectorAll("s-button"))
          .find(b => b.textContent.includes("Tracking"));
        return btn ? btn.textContent.trim() : null;
      `);
      expect(trackingBtnText).not.toBeNull();
      expect(["Enable Tracking", "Tracking Enabled"]).toContain(trackingBtnText);
    });

    it("should show Step 1 status icon reflecting tracking state", async () => {
      await openHomePage();
      if (!(await isMandatorySetupVisible())) return;

      // The icon type is either 'circle' (not done) or 'check-circle-filled' (done)
      const iconType = await driver.executeScript(`
        const icons = Array.from(document.querySelectorAll("s-icon"));
        const icon = icons[0];
        return icon ? icon.getAttribute("type") : null;
      `);
      expect(["circle", "check-circle-filled"]).toContain(iconType);
    });

    it("should show Step 2 with the correct heading and both action buttons", async () => {
      await openHomePage();
      if (!(await isMandatorySetupVisible())) return;

      const hasStep2Heading = await driver.executeScript(`
        return Array.from(document.querySelectorAll("s-heading"))
          .some(h => h.textContent.includes("Step 2: Enable App Embed"));
      `);
      expect(hasStep2Heading).toBe(true);

      // "Open Theme Editor" is an s-button with an href (external deeplink)
      const hasThemeEditorBtn = await driver.executeScript(`
        return Array.from(document.querySelectorAll("s-button"))
          .some(b => b.textContent.includes("Open Theme Editor"));
      `);
      expect(hasThemeEditorBtn).toBe(true);

      // "Verify Installation" submits to the server action
      const hasVerifyBtn = await driver.executeScript(`
        return Array.from(document.querySelectorAll("s-button"))
          .some(b => b.textContent.includes("Verify Installation") || b.textContent.includes("Verifying"));
      `);
      expect(hasVerifyBtn).toBe(true);
    });

    it("should show feedback after clicking Verify Installation", async () => {
      await openHomePage();
      if (!(await isMandatorySetupVisible())) return;

      await driver.executeScript(`
        const btn = Array.from(document.querySelectorAll("s-button"))
          .find(b => b.textContent.includes("Verify Installation"));
        if (btn) btn.click();
      `);

      // Wait for the server action round-trip to complete
      await driver.sleep(6000);

      const body = await driver.findElement(By.css("body"));
      const text = await getTextContent(driver, body);

      // Three valid outcomes after the server action round-trip:
      // 1. Embed IS active, success text still visible before re-render hides section
      const successShown = text.includes("Verified! Embed is active.");
      // 2. Embed is NOT active → section stays, button returns to idle
      const verifyBtnIdle = await driver.executeScript(`
        return Array.from(document.querySelectorAll("s-button"))
          .some(b => b.textContent.includes("Verify Installation"));
      `);
      // 3. Embed IS active → onSiteTracking set to true server-side → page re-renders
      //    and showMandatorySetup becomes false, so the whole section disappears
      const sectionGone = !(await isMandatorySetupVisible());

      expect(successShown || verifyBtnIdle || sectionGone).toBe(true);
    });
  });
});