import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { By } from "selenium-webdriver";
import { createDriver, quitDriver } from "../helpers/driver.js";
import { loginToShopifyAdmin, navigateToAppRoute } from "../helpers/auth.js";
import { switchToAppIframe, waitForAppReady } from "../helpers/iframe.js";
import { getTextContent } from "../helpers/shadow.js";
import { sleep } from "../helpers/waits.js";


describe("Edit Experiment Status Views", () => {
  let driver;

  beforeAll(async () => {
    driver = await createDriver();
    await loginToShopifyAdmin(driver);
  });

  afterAll(async () => {
    await quitDriver(driver);
  });

  async function openEditExperimentPage(id) {
    await navigateToAppRoute(driver, `/app/experiments/${id}`);
    await switchToAppIframe(driver);
    await waitForAppReady(driver);
    await sleep(1000);
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

  it("should render an active experiment with status controls", async () => {
    await openEditExperimentPage("9101");

    const text = await getBodyText();

    expect(text).toContain("DEMO - PDP Upsell Widget");
    expect(text).toContain("Status");
    expect(text).toContain("Active");
    expect(text).toContain("Change Status");
  });

  it("should render a paused experiment with status controls", async () => {
    await openEditExperimentPage("9104");

    const text = await getBodyText();

    expect(text).toContain("DEMO - Cart Drawer Layout");
    expect(text).toContain("Status");
    expect(text).toContain("Paused");
    expect(text).toContain("Change Status");
  });

  it("should render a completed experiment safely", async () => {
    await openEditExperimentPage("9105");

    const text = await getBodyText();

    expect(text).toContain("DEMO - Homepage Collection Tiles");
    expect(text).toContain("Status");
    expect(text).toContain("Completed");
  });

  it("should render an archived experiment safely", async () => {
    await openEditExperimentPage("9106");

    const text = await getBodyText();

    expect(text).toContain("DEMO - Announcement Bar Copy");
    expect(text).toContain("Status");
    expect(text).toContain("Archived");
  });

  it("should render another seeded draft experiment", async () => {
    await openEditExperimentPage("9108");

    const text = await getBodyText();

    expect(text).toContain("DEMO - Sticky ATC");
    expect(text).toContain("Status");
    expect(text).toContain("Draft");
    expect(text).toContain("Save Draft");
  });

  it("should show draft status actions when Change Status is opened", async () => {
    await openEditExperimentPage("9108");

    await clickButtonByTextIncludes("Change Status");
    await sleep(500);

    const text = await getBodyText();

    expect(text).toContain("Start");
    expect(text).toContain("Delete");
    });
});