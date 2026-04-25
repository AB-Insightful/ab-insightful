import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { By } from "selenium-webdriver";
import { createDriver, quitDriver } from "../helpers/driver.js";
import { loginToShopifyAdmin, navigateToAppRoute } from "../helpers/auth.js";
import { switchToAppIframe, waitForAppReady } from "../helpers/iframe.js";
import { getTextContent, jsClick } from "../helpers/shadow.js";
import { sleep } from "../helpers/waits.js";

//test email/phone
const TEST_EMAIL = "example@example.com";
const TEST_PHONE = "555-888-5555";

describe("Settings Page", () => {
  let driver;

  beforeAll(async () => {
    driver = await createDriver();
    await loginToShopifyAdmin(driver);
    await navigateToAppRoute(driver, "/app/settings");
    await switchToAppIframe(driver);
    await waitForAppReady(driver);
  });

  afterAll(async () => {
    await quitDriver(driver);
  });

  //navigate to settings and wait for it to be ready
  async function reloadSettings() {
    await navigateToAppRoute(driver, "/app/settings");
    await switchToAppIframe(driver);
    await waitForAppReady(driver);
  }

  //set a text/email/number field value by its label text
  async function setFieldByLabel(label, value) {
    await driver.executeScript(
      `
      const label = arguments[0];
      const value = arguments[1];
      for (const el of document.querySelectorAll("s-text-field, s-email-field, s-number-field")) {
        if ((el.getAttribute("label") || "").includes(label)) {
          el.value = value;
          el.dispatchEvent(new Event("input", { bubbles: true }));
          el.dispatchEvent(new Event("change", { bubbles: true }));
          return true;
        }
      }
      return false;
      `,
      label,
      value,
    );
  }

  //click a button by its visible text
  async function clickButtonByText(text) {
    await driver.executeScript(
      `
      for (const btn of document.querySelectorAll("s-button")) {
        if (btn.textContent.trim() === arguments[0]) {
          btn.click();
          return;
        }
      }
      `,
      text,
    );
  }

  //check if the page properly renders
  it("should show expected content", async () => {
    const body = await driver.findElement(By.css("body"));
    const text = await getTextContent(driver, body);

    //should contain all this text
    expect(text).toContain("Notification Settings");
    expect(text).toContain("Experiment Configuration");
    expect(text).toContain("Support & Documentation");
    expect(text).toContain("Language");
  });

  //support link navigates to help page
  it("should have a How To's and Support link pointing to /app/help", async () => {
    const found = await driver.executeScript(`
      for (const link of document.querySelectorAll("s-link[href]")) {
        if ((link.getAttribute("href") || "").includes("/app/help")) return true;
      }
      return false;
    `);
    expect(found).toBe(true);
  });

  //language selector contains english
  it("should show English as an available language option", async () => {
    const body = await driver.findElement(By.css("body"));
    const text = await getTextContent(driver, body);
    expect(text).toContain("English");
  });

  //max users can be updated
  it("should save a new max users value and show a success message", async () => {
    await setFieldByLabel("Maximum users per experiment", "75000");
    await sleep(300);

    //find correct save button
    await driver.executeScript(`
      const field = document.querySelector("s-number-field");
      if (field) {
        const stack = field.closest("s-stack");
        if (stack) {
          const btn = stack.querySelector("s-button");
          if (btn) { btn.click(); return; }
        }
      }
    `);
    await sleep(2000);

    const body = await driver.findElement(By.css("body"));
    const text = await getTextContent(driver, body);
    //check it contains save success
    expect(text).toContain("Save success!");

    //reset to a different value so test can be rerun
    await setFieldByLabel("Maximum users per experiment", "7500");
    await sleep(300);
    await driver.executeScript(`
      const field = document.querySelector("s-number-field");
      if (field) {
        const stack = field.closest("s-stack");
        if (stack) {
          const btn = stack.querySelector("s-button");
          if (btn) { btn.click(); return; }
        }
      }
    `);
    await sleep(2000);
  });

  //the default experiment goal can be changed
  it("should save a new default experiment goal and show a success message", async () => {
    await driver.executeScript(`
      const sel = document.querySelector("s-select[name='defaultGoal']");
      if (sel) {
        sel.value = "viewPage";
        sel.dispatchEvent(new Event("change", { bubbles: true }));
      }
    `);
    await sleep(300);

    //click save button inside experiment configuration
    await driver.executeScript(`
      const sections = document.querySelectorAll("s-section");
      for (const section of sections) {
        if ((section.getAttribute("heading") || "").includes("Experiment Configuration")) {
          const btn = section.querySelector("s-button");
          if (btn) { btn.click(); return; }
        }
      }
    `);
    await sleep(2000);

    const body = await driver.findElement(By.css("body"));
    const text = await getTextContent(driver, body);
    //check it contains save success
    expect(text).toContain("Save success!");

    //reset to a different value so test can be rerun
    await driver.executeScript(`
      const sel = document.querySelector("s-select[name='defaultGoal']");
      if (sel) {
        sel.value = "completedCheckout";
        sel.dispatchEvent(new Event("change", { bubbles: true }));
      }
    `);
    await sleep(300);
    await driver.executeScript(`
      const sections = document.querySelectorAll("s-section");
      for (const section of sections) {
        if ((section.getAttribute("heading") || "").includes("Experiment Configuration")) {
          const btn = section.querySelector("s-button");
          if (btn) { btn.click(); return; }
        }
      }
    `);
    await sleep(2000);
  });

  //check a new email can be added
  it("should add a new contact email and display it as a chip", async () => {
    await setFieldByLabel("Email", TEST_EMAIL);
    await sleep(300);

    //click the save button next to the email field
    await driver.executeScript(`
      const fields = document.querySelectorAll("s-email-field");
      for (const field of fields) {
        const stack = field.closest("s-stack");
        if (stack) {
          const btn = stack.querySelector("s-button");
          if (btn) { btn.click(); return; }
        }
      }
    `);
    await sleep(2000);

    const body = await driver.findElement(By.css("body"));
    const text = await getTextContent(driver, body);
    expect(text).toContain(TEST_EMAIL);
  });

  //email can be removed
  it("should remove a contact email when its chip is clicked", async () => {

    //click the delete button for the test email
    await driver.executeScript(
      `
      for (const chip of document.querySelectorAll("s-clickable-chip")) {
        if (chip.textContent.includes(arguments[0])) {
          chip.click();
          return;
        }
      }
      `,
      TEST_EMAIL,
    );
    await sleep(2000);

    const body = await driver.findElement(By.css("body"));
    const text = await getTextContent(driver, body);
    expect(text).not.toContain(TEST_EMAIL);
  });

  //check a new phone number can be added
  it("should add a new contact phone and display it as a chip", async () => {
    await setFieldByLabel("Phone Number", TEST_PHONE);
    await sleep(300);

    //click the save button next to the phone number field
    await driver.executeScript(`
      const fields = document.querySelectorAll("s-text-field[label='Phone Number']");
      for (const field of fields) {
        const stack = field.closest("s-stack");
        if (stack) {
          const btn = stack.querySelector("s-button");
          if (btn) { btn.click(); return; }
        }
      }
    `);
    await sleep(2000);

    const body = await driver.findElement(By.css("body"));
    const text = await getTextContent(driver, body);
    expect(text).toContain(TEST_PHONE);
  });

  //phone number can be removed
  it("should remove a contact phone when its chip is clicked", async () => {
    
    //click the delete button for the test phone number
    await driver.executeScript(`
      for (const chip of document.querySelectorAll("s-clickable-chip")) {
        if (chip.textContent.includes("888")) {
          chip.click();
          return;
        }
      }
    `);
    await sleep(2000);

    const body = await driver.findElement(By.css("body"));
    const text = await getTextContent(driver, body);
    expect(text).not.toContain("888");
  });

  //enable email notifications
  it("should toggle email notifications on and reflect the change", async () => {
    await driver.executeScript(`
      const sw = document.querySelector("s-switch#email-notif-toggle");
      if (sw) {
        sw.checked = !sw.checked;
        sw.dispatchEvent(new Event("change", { bubbles: true }));
      }
    `);
    await sleep(1500);

    //page still renders notification section
    const body = await driver.findElement(By.css("body"));
    const text = await getTextContent(driver, body);
    expect(text).toContain("Enable E-mail Notifications");
  });

  //enable SMS notifications
  it("should toggle SMS notifications on and reflect the change", async () => {
    await driver.executeScript(`
      const sw = document.querySelector("s-switch#SMS-notif-toggle");
      if (sw) {
        sw.checked = !sw.checked;
        sw.dispatchEvent(new Event("change", { bubbles: true }));
      }
    `);
    await sleep(1500);

    //page still renders notification section
    const body = await driver.findElement(By.css("body"));
    const text = await getTextContent(driver, body);
    expect(text).toContain("Enable SMS Notifications");
  });

  //notify when experiment starts
  it("should check 'Notify when an experiment starts' and show a success message", async () => {
    await driver.executeScript(`
      for (const cb of document.querySelectorAll("s-checkbox")) {
        if ((cb.getAttribute("label") || "").includes("experiment starts")) {
          cb.checked = true;
          cb.dispatchEvent(new Event("change", { bubbles: true }));
          return;
        }
      }
    `);
    await sleep(2000);

    //save success
    const body = await driver.findElement(By.css("body"));
    const text = await getTextContent(driver, body);
    expect(text).toContain("Save success!");
  });

  //notify when experiment ends
  it("should check 'Notify when an experiment ends' and show a success message", async () => {
    await driver.executeScript(`
      for (const cb of document.querySelectorAll("s-checkbox")) {
        if ((cb.getAttribute("label") || "").includes("experiment ends")) {
          cb.checked = true;
          cb.dispatchEvent(new Event("change", { bubbles: true }));
          return;
        }
      }
    `);
    await sleep(2000);

    //save success
    const body = await driver.findElement(By.css("body"));
    const text = await getTextContent(driver, body);
    expect(text).toContain("Save success!");
  });

  //dusable notifications
  it("should uncheck both notification checkboxes when Disable Notifications is clicked", async () => {
    //ensure both are selected
    await driver.executeScript(`
      for (const cb of document.querySelectorAll("s-checkbox")) {
        const label = cb.getAttribute("label") || "";
        if (label.includes("experiment starts") || label.includes("experiment ends")) {
          cb.checked = true;
          cb.dispatchEvent(new Event("change", { bubbles: true }));
        }
      }
    `);
    await sleep(500);

    //click disable notifications
    await clickButtonByText("Disable Notifications");
    await sleep(2000);

    //check start is unchecked
    const startChecked = await driver.executeScript(`
      for (const cb of document.querySelectorAll("s-checkbox")) {
        if ((cb.getAttribute("label") || "").includes("experiment starts")) return cb.checked;
      }
      return null;
    `);
    //check end is unchecked
    const endChecked = await driver.executeScript(`
      for (const cb of document.querySelectorAll("s-checkbox")) {
        if ((cb.getAttribute("label") || "").includes("experiment ends")) return cb.checked;
      }
      return null;
    `);

    expect(startChecked).toBe(false);
    expect(endChecked).toBe(false);
  });

  //delete all contact info
  it("should delete all contact info when the delete button is clicked", async () => {
    //add test email and phone
    await setFieldByLabel("Email", TEST_EMAIL);
    await sleep(200);
    await driver.executeScript(`
      for (const field of document.querySelectorAll("s-email-field")) {
        const stack = field.closest("s-stack");
        if (stack) { const btn = stack.querySelector("s-button"); if (btn) { btn.click(); return; } }
      }
    `);
    await sleep(1500);

    await setFieldByLabel("Phone Number", TEST_PHONE);
    await sleep(200);
    await driver.executeScript(`
      for (const field of document.querySelectorAll("s-text-field[label='Phone Number']")) {
        const stack = field.closest("s-stack");
        if (stack) { const btn = stack.querySelector("s-button"); if (btn) { btn.click(); return; } }
      }
    `);
    await sleep(1500);

    //delete everything
    await clickButtonByText("Delete All Contact Information");
    await sleep(2000);

    const body = await driver.findElement(By.css("body"));
    const text = await getTextContent(driver, body);
    expect(text).not.toContain(TEST_EMAIL);
    expect(text).not.toContain("5309");
  });
});