import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { By } from "selenium-webdriver";
import { createDriver, quitDriver } from "../helpers/driver.js";
import { loginToShopifyAdmin, navigateToAppRoute, navigateToStorefront } from "../helpers/auth.js";
import { switchToAppIframe, waitForAppReady } from "../helpers/iframe.js";
import { getTextContent } from "../helpers/shadow.js";
import {
  setFieldValueByLabel,
  getFieldValueByLabel,
  setFieldValueByLabelInVariant,
  clickButtonByText,
  clickButtonByTextBetter,
  waitForButtonAndClick,
} from "../helpers/form.js";

const SECTION_ID = "shopify-section-template--19917578567929__banner";
const FOOTER_ID ="shopify-section-sections--19917580665081__footer";
const VAR_A ="shopify-section-template--19917580402937__main";
const VAR_B ="shopify-section-sections--19917580665081__footer";

async function clickChoiceByVisibleText(driver, text) {
  const body = await driver.findElement(By.css("body"));

  await driver.wait(async () => {
    const bodyText = await getTextContent(driver, body);
    return bodyText.includes(text);
  }, 10_000);

  const clicked = await driver.executeScript(
    `
      const targetText = arguments[0];
      const normalize = (s) => (s || "").replace(/\\s+/g, " ").trim();

      const candidates = [
        ...document.querySelectorAll(
          "button, [role='button'], label, s-choice, s-radio, s-segmented-control, s-button"
        )
      ];

      for (const el of candidates) {
        const text = normalize(el.innerText || el.textContent);
        const label = normalize(el.getAttribute?.("label"));
        const value = normalize(el.getAttribute?.("value"));
        const aria = normalize(el.getAttribute?.("aria-label"));

        if ([text, label, value, aria].includes(targetText)) {
          el.click();
          return true;
        }
      }

      return false;
    `,
    text,
  );

  expect(clicked).toBe(true);
}

async function fillCreateExperimentForm(driver, expName, description, sectionId, traffic, startDate) {
  await setFieldValueByLabel(
    driver,
    "s-text-field",
    "Experiment Name",
    expName,
  );

  await setFieldValueByLabel(
    driver,
    "s-text-area",
    "Experiment Description",
    description,
  );

  await setFieldValueByLabel(
    driver,
    "s-text-field",
    "Section ID to be tested",
    sectionId,
  );

  await setFieldValueByLabel(
    driver,
    "s-number-field",
    "Traffic allocation for Variant A",
    traffic,
  );

  await setFieldValueByLabel(
    driver,
    "s-date-field",
    "Start Date",
    startDate, //2099-12-31
  );

}

async function fillCreateExperimentFormControl(driver, expName, description, sectionId, traffic, controlId, startDate) {
  await setFieldValueByLabel(
    driver,
    "s-text-field",
    "Experiment Name",
    expName,
  );

  await setFieldValueByLabel(
    driver,
    "s-text-area",
    "Experiment Description",
    description,
  );

  await setFieldValueByLabel(
    driver,
    "s-text-field",
    "Section ID to be tested",
    sectionId,
  );

  await setFieldValueByLabel(
    driver,
    "s-text-field",
    "Control Section ID",
    controlId,
  );

  await setFieldValueByLabel(
    driver,
    "s-number-field",
    "Traffic allocation for Variant A",
    traffic,
  );

  await setFieldValueByLabel(
    driver,
    "s-date-field",
    "Start Date",
    startDate, //2099-12-31
  );

}

async function fillCreateExperimentFormVariant(driver, expName, description, sectionIdA, trafficA, sectionIdB, trafficB, startDate) {
    await setFieldValueByLabel(
        driver,
        "s-text-field",
        "Experiment Name",
        expName,
    );

    await setFieldValueByLabel(
        driver,
        "s-text-area",
        "Experiment Description",
        description,
    );

    //how to uniquely identify better? 
    await setFieldValueByLabelInVariant(
        driver,
        "s-text-field",
        "Variant A",
        "Section ID to be tested",
        sectionIdA,
    );

    //how to uniquely identify better? 
    //this is for variant b
    await setFieldValueByLabelInVariant(
        driver,
        "s-text-field",
        "Variant B",
        "Section ID to be tested",
        sectionIdB,
    );

    await setFieldValueByLabel(
        driver,
        "s-number-field",
        "Traffic allocation for Variant B",
        trafficB,
    );

    await setFieldValueByLabel(
        driver,
        "s-number-field",
        "Traffic allocation for Variant A",
        trafficA,
    );


    await setFieldValueByLabel(
        driver,
        "s-date-field",
        "Start Date",
        startDate, //2099-12-31
    );


}

export async function waitForElementToBeHidden(driver, sectionId, { timeout = 15000, poll = 250 } = {}) {
  await driver.wait(
    async () => {
      const hidden = await driver.executeScript(
        `
        const id = arguments[0];

        const el =
          document.getElementById(id) ||
          document.querySelector('#' + CSS.escape(id)) ||
          document.querySelector('[id="' + id.replace(/"/g, '\\"') + '"]');

        if (!el) return true;

        const style = window.getComputedStyle(el);
        const rect = el.getBoundingClientRect();

        const visible =
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          style.opacity !== "0" &&
          rect.width > 0 &&
          rect.height > 0;

        return !visible;
        `,
        sectionId,
      );
      return hidden === true;
    },
    timeout,
    `Element "${sectionId}" did not become hidden within ${timeout}ms`,
    poll,
  );

  return await driver.executeScript(
    `
    const id = arguments[0];

    const el =
      document.getElementById(id) ||
      document.querySelector('#' + CSS.escape(id)) ||
      document.querySelector('[id="' + id.replace(/"/g, '\\"') + '"]');

    if (!el) return { present: false, visible: false };

    const style = window.getComputedStyle(el);
    const rect = el.getBoundingClientRect();

    const visible =
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      style.opacity !== "0" &&
      rect.width > 0 &&
      rect.height > 0;

    return { present: true, visible };
    `,
    sectionId,
  );
}

export async function waitForElementToBeHiddenAlt(driver, sectionId, { timeout = 15000, poll = 250 } = {}) {
    let res = true;
    await driver.executeScript(
        `
        const el = document.getElementById(arguments[0]);
        if (!el) return { present: false, visible: false };

        const style = window.getComputedStyle(el);
        const rect = el.getBoundingClientRect();

        const visible =
            style.display !== "none" &&
            style.visibility !== "hidden" &&
            style.opacity !== "0" &&
            rect.width > 0 &&
            rect.height > 0;

        return { present: true, visible };
        `,
        sectionId
    );

    await driver.executeScript(
        `
        const el = document.getElementById(arguments[0]);
        if (!el) return { present: false, visible: false };

        const style = window.getComputedStyle(el);
        const rect = el.getBoundingClientRect();

        const visible =
            style.display !== "none" &&
            style.visibility !== "hidden" &&
            style.opacity !== "0" &&
            rect.width > 0 &&
            rect.height > 0;

        return { present: true, visible };
        `,
    FOOTER_ID
    );

    return res;
}

export async function waitForElementToBeHiddenAlt2(driver, sectionId, { timeout = 15000, poll = 250 } = {}) {
    let res = false;
    await driver.executeScript(
        `
        const el = document.getElementById(arguments[0]);
        if (!el) return { present: false, visible: false };

        const style = window.getComputedStyle(el);
        const rect = el.getBoundingClientRect();

        const visible =
            style.display !== "none" &&
            style.visibility !== "hidden" &&
            style.opacity !== "0" &&
            rect.width > 0 &&
            rect.height > 0;

        return { present: true, visible };
        `,
        sectionId
    );

    await driver.executeScript(
        `
        const el = document.getElementById(arguments[0]);
        if (!el) return { present: false, visible: false };

        const style = window.getComputedStyle(el);
        const rect = el.getBoundingClientRect();

        const visible =
            style.display !== "none" &&
            style.visibility !== "hidden" &&
            style.opacity !== "0" &&
            rect.width > 0 &&
            rect.height > 0;

        return { present: true, visible };
        `,
        sectionId
    );

    return res;
}

async function isSectionVisibleOnStorefront(driver, sectionId) {
  return await driver.executeScript(
    `
      const id = arguments[0];
      const el =
        document.getElementById(id) ||
        document.querySelector('#' + CSS.escape(id)) ||
        document.querySelector('[id="' + id.replace(/"/g, '\\"') + '"]');

      if (!el) {
        return { present: false, visible: false };
      }

      const style = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();

      const visible =
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        style.opacity !== "0" &&
        rect.width > 0 &&
        rect.height > 0;

      return { present: true, visible };
    `,
    sectionId,
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


    it("creates a viewed-page experiment with Variant A traffic allocation set to 0%", async () => {
        await fillCreateExperimentForm(driver, "Exp test e2e control visible", "description", SECTION_ID, "0", "2099-12-31");

        await waitForButtonAndClick(driver, "Save Draft");
        //initiates experiment for further testing
        await waitForButtonAndClick(driver, "Start Experiment");
        await driver.switchTo().defaultContent();
        await driver.wait(async () => {
        const url = await driver.getCurrentUrl();
        return /\/app\/experiments\/\d+/.test(url);
        }, 30_000);

        await navigateToAppRoute(driver, "/app");
        await driver.sleep(5000);
        const storefrontUrl = `https://${process.env.SHOPIFY_TEST_STORE_URL}/collections/all`;
        await navigateToStorefront(driver, storefrontUrl);

        //waitForElementToBeHidden()
        const result = await waitForElementToBeHiddenAlt2(driver, SECTION_ID);
        expect(result).toBe(false);

    });

    it("Verifies 100% allocation displays selected element for testing on storefront", async () => {
        await fillCreateExperimentForm(driver, "Exp test e2e - variant visible", "description", FOOTER_ID, "100", "2099-12-31");

        await waitForButtonAndClick(driver, "Save Draft");
        //initiates experiment for further testing
        await waitForButtonAndClick(driver, "Start Experiment");
        await driver.switchTo().defaultContent();
        await driver.wait(async () => {
        const url = await driver.getCurrentUrl();
        return /\/app\/experiments\/\d+/.test(url);
        }, 30_000);

        const storefrontUrl100 = `https://${process.env.SHOPIFY_TEST_STORE_URL}/`;
        console.log("SHOPIFY_TEST_STOREFRONT_HOST:", storefrontUrl100);
        await navigateToAppRoute(driver, "/app");
        await driver.sleep(5000);
        await navigateToStorefront(driver, storefrontUrl100);

        let result = await driver.executeScript(
            `
            const el = document.getElementById(arguments[0]);
            if (!el) return { present: false, visible: false };

            const style = window.getComputedStyle(el);
            const rect = el.getBoundingClientRect();

            const visible =
                style.display !== "none" &&
                style.visibility !== "hidden" &&
                style.opacity !== "0" &&
                rect.width > 0 &&
                rect.height > 0;

            return { present: true, visible };
            `,
            FOOTER_ID
        );

        //for more robust check
        result = await waitForElementToBeHiddenAlt(driver, SECTION_ID);

        expect(result).toBe(true); //element should not be visible
        
    });

    it("Verifies allocation hides Specified Variant for N Variant", async () => {
        await waitForButtonAndClick(driver, "Add Another Variant");
        await fillCreateExperimentFormVariant(driver, "Exp test e2e 0 traffic N Var", "description", VAR_A, "100", VAR_B, "0", "2099-12-31");
        await waitForButtonAndClick(driver, "Save Draft");
        //initiates experiment for further testing
        await waitForButtonAndClick(driver, "Start Experiment");
        await driver.switchTo().defaultContent();
        await driver.wait(async () => {
        const url = await driver.getCurrentUrl();
        return /\/app\/experiments\/\d+/.test(url);
        }, 30_000);

        //adds delay to allow propogation of db change and other dependencies
        await navigateToAppRoute(driver, "/app");
        await driver.sleep(10000);
        const storefrontUrlNVar = `https://${process.env.SHOPIFY_TEST_STORE_URL}/products/the-collection-snowboard-liquid`;
        await navigateToStorefront(driver, storefrontUrlNVar);
        
        let result = await driver.executeScript(
            `
            const el = document.getElementById(arguments[0]);
            if (!el) return { present: false, visible: false };

            const style = window.getComputedStyle(el);
            const rect = el.getBoundingClientRect();

            const visible =
                style.display !== "none" &&
                style.visibility !== "hidden" &&
                style.opacity !== "0" &&
                rect.width > 0 &&
                rect.height > 0;

            return { present: true, visible };
            `,
            VAR_A
        );

        //for more robust test
        result = await waitForElementToBeHiddenAlt(driver, SECTION_ID);

        expect(result).toBe(true); //element should be visible

        let varBRes = await driver.executeScript(
            `
            const el = document.getElementById(arguments[0]);
            if (!el) return { present: false, visible: false };

            const style = window.getComputedStyle(el);
            const rect = el.getBoundingClientRect();

            const visible =
                style.display !== "none" &&
                style.visibility !== "hidden" &&
                style.opacity !== "0" &&
                rect.width > 0 &&
                rect.height > 0;

            return { present: true, visible };
            `,
            VAR_B
        );

        //for more robust testing
        varBRes = await waitForElementToBeHiddenAlt2(driver, SECTION_ID);

        expect(varBRes).toBe(false); //should be invisible
        
    }); 

    //footer should not be visible based off configuration. 
    it("control section id test", async () => {
    
        //clicks control checkbox
        await driver.executeScript(
            `
                const checkbox = [...document.querySelectorAll("s-checkbox")].find(
                (el) => el.getAttribute("label") === "Add a control section ID",
                );
                if (checkbox) checkbox.click();
            `,
        );

        const varId = "shopify-section-sections--19917580665081__footer";
        const controlId = "shopify-section-template--19917579976953__main"; 
        await fillCreateExperimentFormControl(driver, "Experiment test e2e control section id test", "description", varId, "0", controlId, "2099-12-31");

        await waitForButtonAndClick(driver, "Save Draft");
        //initiates experiment for further testing
        await waitForButtonAndClick(driver, "Start Experiment");
        await driver.switchTo().defaultContent();
        await driver.wait(async () => {
        const url = await driver.getCurrentUrl();
        return /\/app\/experiments\/\d+/.test(url);
        }, 30_000);
        
        //adds delay to allow propogation of db change and other dependencies
        await navigateToAppRoute(driver, "/app");
        await driver.sleep(5000);
        const storefrontUrl = `https://${process.env.SHOPIFY_TEST_STORE_URL}/pages/contact`;

        await navigateToStorefront(driver, storefrontUrl);

        let resultVar = await driver.executeScript(
            `
            const el = document.getElementById(arguments[0]);
            if (!el) return { present: false, visible: false };

            const style = window.getComputedStyle(el);
            const rect = el.getBoundingClientRect();

            const visible =
                style.display !== "none" &&
                style.visibility !== "hidden" &&
                style.opacity !== "0" &&
                rect.width > 0 &&
                rect.height > 0;

            return { present: true, visible };
            `,
            varId
        );

        resultVar= await waitForElementToBeHiddenAlt2(driver, SECTION_ID);
        expect(resultVar).toBe(false); //element should not be visible

        let resultControl = await driver.executeScript(
            `
            const el = document.getElementById(arguments[0]);
            if (!el) return { present: false, visible: false };

            const style = window.getComputedStyle(el);
            const rect = el.getBoundingClientRect();

            const visible =
                style.display !== "none" &&
                style.visibility !== "hidden" &&
                style.opacity !== "0" &&
                rect.width > 0 &&
                rect.height > 0;

            return { present: true, visible };
            `,
            controlId
        );

        resultControl = await waitForElementToBeHiddenAlt(driver, SECTION_ID);
        expect(resultControl).toBe(true); //element should be visible
    });

});