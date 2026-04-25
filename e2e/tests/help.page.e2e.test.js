import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { By } from "selenium-webdriver";
import { createDriver, quitDriver } from "../helpers/driver.js";
import { loginToShopifyAdmin, navigateToAppRoute } from "../helpers/auth.js";
import { switchToAppIframe, waitForAppReady } from "../helpers/iframe.js";
import { getTextContent, jsClick } from "../helpers/shadow.js";

describe("Help Page", () => {
  let driver;

  beforeAll(async () => {
    driver = await createDriver();
    await loginToShopifyAdmin(driver);
    await navigateToAppRoute(driver, "/app/help");
    await switchToAppIframe(driver);
    await waitForAppReady(driver);
  });

  afterAll(async () => {
    await quitDriver(driver);
  });

  //apply a filter via accessbilitityLabel
  async function applyFilter(accessibilityLabel) {
    const filterTrigger = await driver.findElement(By.css("s-button[commandFor='filterComponent']"));
    await jsClick(driver, filterTrigger);
    await driver.executeScript(
      `
      for (const btn of document.querySelectorAll("s-button[accessibilityLabel]")) {
        if (btn.getAttribute("accessibilityLabel") === arguments[0]) {
          btn.click();
          return;
        }
      }
      `,
      accessibilityLabel,
    );
  }

  //check if the page properly renders
  it("should load the Help page and display all article cards", async () => {
    const body = await driver.findElement(By.css("body"));
    const text = await getTextContent(driver, body);

    //should contain all this text
    expect(text).toContain("Getting Started");
    expect(text).toContain("Creating & Managing Experiments");
    expect(text).toContain("Understanding Your Results");
    expect(text).toContain("Viewing Reports");
  });

  //should defailt to the exact string: Showing 1-4 of 4 items
  it("should show correct pagination text on the default view", async () => {
    const body = await driver.findElement(By.css("body"));
    const text = await getTextContent(driver, body);
    expect(text).toContain("Showing 1-4 of 4 items");
  });

  //check that only the descriptions for pages marked statistics is shown
  it("should filter to only show the Statistics article when Statistics is selected", async () => {
    await applyFilter("Statistics");

    const body = await driver.findElement(By.css("body"));
    const text = await getTextContent(driver, body);

    expect(text).toContain("Explains key metrics"); //Understanding Your Results
    expect(text).not.toContain("setup steps to launch your first A/B test"); //Getting Started
    expect(text).not.toContain("sessions and conversions"); //Viewing Reports
  });

  //check the button links
  it("should have a View button linking to the correct route for each article", async () => {
    // Reset filter so all articles and their View buttons are visible
    await applyFilter("ShowAll");

    //page names
    const slugs = ["getting-started", "manage-experiments", "understanding-results", "viewing-reports"];

    for (const slug of slugs) {
        //check path
        const found = await driver.executeScript(
            `
            const expectedPath = "/app/help/" + arguments[0];
            for (const btn of document.querySelectorAll("s-button[href]")) {
                const href = (btn.getAttribute("href") || "");
                if (href.includes(expectedPath)) return true;
            }
            return false;
            `,
            slug,
        );
        expect(found, `Missing View button for: ${slug}`).toBe(true);
    }
  });
});