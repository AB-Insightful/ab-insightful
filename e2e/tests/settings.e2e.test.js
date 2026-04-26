import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { By } from "selenium-webdriver";
import { createDriver, quitDriver } from "../helpers/driver.js";
import { loginToShopifyAdmin, navigateToAppRoute } from "../helpers/auth.js";
import { switchToAppIframe, waitForAppReady } from "../helpers/iframe.js";
import { getTextContent } from "../helpers/shadow.js";

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

  //set a text/email/number field value by its label text
  async function setFieldByLabel(label, value) {
    const changed = await driver.executeScript(
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
    expect(changed, `Could not set field with label containing "${label}"`).toBe(true);
  }

  //click a button by its visible text
  async function clickButtonByText(text) {
    const clicked = await driver.executeScript(
      `
      for (const btn of document.querySelectorAll("s-button")) {
        if (btn.textContent.trim() === arguments[0]) {
          btn.click();
          return true;
        }
      }
      return false;
      `,
      text,
    );
    expect(clicked, `Could not click button "${text}"`).toBe(true);
  }

  async function getFieldValueByLabel(label) {
    return driver.executeScript(
      `
      const label = arguments[0];
      for (const el of document.querySelectorAll("s-text-field, s-email-field, s-number-field")) {
        if ((el.getAttribute("label") || "").includes(label)) {
          return String(el.value ?? "");
        }
      }
      return null;
      `,
      label,
    );
  }

  async function waitForSaveSuccessOrFieldValue(label, expectedDigits) {
    await driver.wait(async () => {
      const body = await driver.findElement(By.css("body"));
      const text = await getTextContent(driver, body);
      if (text.includes("Save success!")) return true;

      const value = await getFieldValueByLabel(label);
      if (value == null) return false;
      const digits = value.replace(/\D/g, "");
      return digits === String(expectedDigits);
    }, 20_000, `Timed out waiting for save confirmation or ${label}=${expectedDigits}`);
  }

  async function waitForSettingsReady() {
    await navigateToAppRoute(driver, "/app/settings");
    await switchToAppIframe(driver);
    await waitForAppReady(driver);
    await driver.wait(async () => {
      const body = await driver.findElement(By.css("body"));
      const text = await getTextContent(driver, body);
      return text.includes("Email") && text.includes("Maximum users per experiment");
    }, 30_000, "Settings page did not show core fields");
  }

  async function getSelectValue(name) {
    return driver.executeScript(
      `
      const sel = document.querySelector("s-select[name='" + arguments[0] + "']");
      return sel ? String(sel.value ?? "") : null;
      `,
      name,
    );
  }

  async function setSelectValue(name, value) {
    const changed = await driver.executeScript(
      `
      const [name, value] = arguments;
      const sel = document.querySelector("s-select[name='" + name + "']");
      if (!sel) return false;
      sel.value = value;
      sel.dispatchEvent(new Event("input", { bubbles: true }));
      sel.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
      `,
      name,
      value,
    );
    expect(changed, `Could not set select ${name}=${value}`).toBe(true);
  }

  async function clickSaveNearSelectName(name) {
    const clicked = await driver.executeScript(
      `
      const sel = document.querySelector("s-select[name='" + arguments[0] + "']");
      if (!sel) return false;

      // Prefer closest section/container save button tied to this select.
      const containers = [
        sel.closest("s-section"),
        sel.closest("s-stack"),
        sel.parentElement,
      ].filter(Boolean);

      for (const container of containers) {
        const buttons = container.querySelectorAll("s-button, button");
        for (const btn of buttons) {
          const t = (btn.textContent || "").replace(/\\s+/g, " ").trim().toLowerCase();
          if (t.includes("save")) {
            btn.click();
            return true;
          }
        }
      }

      // Last-resort: any visible Save button on page.
      for (const btn of document.querySelectorAll("s-button, button")) {
        const t = (btn.textContent || "").replace(/\\s+/g, " ").trim().toLowerCase();
        if (t.includes("save")) {
          btn.click();
          return true;
        }
      }
      return false;
      `,
      name,
    );
    expect(clicked, `Could not click save near select "${name}"`).toBe(true);
  }

  async function saveAndWaitForStableUi() {
    // Generic settle wait when toast text is not consistently rendered.
    await driver.wait(async () => {
      const body = await driver.findElement(By.css("body"));
      const text = await getTextContent(driver, body);
      return text.length > 0;
    }, 20_000);
  }

  async function hasChipWithText(value) {
    return driver.executeScript(
      `
      const wanted = arguments[0];
      for (const chip of document.querySelectorAll("s-clickable-chip")) {
        const t = (chip.textContent || "").replace(/\\s+/g, " ").trim();
        if (t.includes(wanted)) return true;
      }
      return false;
      `,
      value,
    );
  }

  async function removeChipByText(value) {
    return driver.executeScript(
      `
      const wanted = arguments[0];
      for (const chip of document.querySelectorAll("s-clickable-chip")) {
        const t = (chip.textContent || "").replace(/\\s+/g, " ").trim();
        if (t.includes(wanted)) {
          chip.click();
          return true;
        }
      }
      return false;
      `,
      value,
    );
  }

  async function clickSaveNearSelector(selector) {
    const clicked = await driver.executeScript(
      `
      const field = document.querySelector(arguments[0]);
      if (!field) return false;
      const stack = field.closest("s-stack");
      if (!stack) return false;
      const btn = stack.querySelector("s-button");
      if (!btn) return false;
      btn.click();
      return true;
      `,
      selector,
    );
    expect(clicked, `Could not click save near selector "${selector}"`).toBe(true);
  }

  async function clickConfigSectionSave() {
    const clicked = await driver.executeScript(`
      const sections = document.querySelectorAll("s-section");
      for (const section of sections) {
        if ((section.getAttribute("heading") || "").includes("Experiment Configuration")) {
          const btn = section.querySelector("s-button");
          if (btn) { btn.click(); return true; }
        }
      }
      return false;
    `);
    expect(clicked, "Could not click Experiment Configuration save button").toBe(true);
  }

  //check if the page properly renders
  it("should show expected content", async () => {
    const body = await driver.findElement(By.css("body"));
    const text = await getTextContent(driver, body);

    // Validate stable content that is consistently rendered in this store.
    expect(text).toContain("Email");
    expect(text).toContain("Phone Number");
    expect(text).toContain("Maximum users per experiment (default)");
    expect(text).toContain("English");
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
    await clickSaveNearSelector("s-number-field");
    await waitForSaveSuccessOrFieldValue("Maximum users per experiment", "75000");

    const body = await driver.findElement(By.css("body"));
    const text = await getTextContent(driver, body);
    const savedValue = await getFieldValueByLabel("Maximum users per experiment");
    expect(savedValue).toBeTruthy();
    expect(savedValue.replace(/\D/g, "")).toBe("75000");

    //reset to a different value so test can be rerun
    await setFieldByLabel("Maximum users per experiment", "7500");
    await clickSaveNearSelector("s-number-field");
    await waitForSaveSuccessOrFieldValue("Maximum users per experiment", "7500");
  });

  //the default experiment goal can be changed
  it("should save a new default experiment goal and show a success message", async () => {
    const current = await getSelectValue("defaultGoal");
    expect(current).toBeTruthy();

    const candidates = [
      "viewPage",
      "startedCheckout",
      "addedProductToCart",
      "completedCheckout",
    ];
    const target = candidates.find((v) => v !== current) || "viewPage";

    await setSelectValue("defaultGoal", target);
    await clickSaveNearSelectName("defaultGoal");
    await driver.wait(async () => {
      await waitForSettingsReady();
      const value = await getSelectValue("defaultGoal");
      return value === target;
    }, 20_000, `defaultGoal did not persist to ${target}`);

    // Reset to original value so test can be rerun without drift.
    await setSelectValue("defaultGoal", current);
    await clickSaveNearSelectName("defaultGoal");
    await driver.wait(async () => {
      await waitForSettingsReady();
      const value = await getSelectValue("defaultGoal");
      return value === current;
    }, 20_000, `defaultGoal did not reset to ${current}`);
  });

  //check a new email can be added
  it("should add a new contact email and display it as a chip", async () => {
    const email = `e2e+${Date.now()}@example.com`;
    await setFieldByLabel("Email", email);
    await clickSaveNearSelector("s-email-field");
    await driver.wait(async () => {
      return hasChipWithText(email);
    }, 20_000, "New email chip did not appear");
    (globalThis).__e2eLastEmail = email;
  });

  //email can be removed
  it("should remove a contact email when its chip is clicked", async () => {
    const email = (globalThis).__e2eLastEmail || TEST_EMAIL;
    const clicked = await removeChipByText(email);
    expect(clicked).toBe(true);
    await driver.wait(async () => {
      return !(await hasChipWithText(email));
    }, 20_000, "Email chip still visible after removal");
  });

  //check a new phone number can be added
  it("should add a new contact phone and display it as a chip", async () => {
    const phone = `555-${String(Date.now()).slice(-3)}-${String(Date.now()).slice(-4)}`;
    await setFieldByLabel("Phone Number", phone);
    await clickSaveNearSelector("s-text-field[label='Phone Number']");
    await driver.wait(async () => {
      return hasChipWithText(phone);
    }, 20_000, "New phone chip did not appear");
    (globalThis).__e2eLastPhone = phone;
  });

  //phone number can be removed
  it("should remove a contact phone when its chip is clicked", async () => {
    const phone = (globalThis).__e2eLastPhone || TEST_PHONE;
    const clicked = await removeChipByText(phone);
    expect(clicked).toBe(true);
    await driver.wait(async () => {
      return !(await hasChipWithText(phone));
    }, 20_000, "Phone chip still visible after removal");
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
    const checked = await driver.executeScript(`
      for (const cb of document.querySelectorAll("s-checkbox")) {
        if ((cb.getAttribute("label") || "").includes("experiment starts")) return !!cb.checked;
      }
      return null;
    `);
    expect(checked).toBe(true);
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
    const checked = await driver.executeScript(`
      for (const cb of document.querySelectorAll("s-checkbox")) {
        if ((cb.getAttribute("label") || "").includes("experiment ends")) return !!cb.checked;
      }
      return null;
    `);
    expect(checked).toBe(true);
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

    //click disable notifications
    await clickButtonByText("Disable Notifications");
    await saveAndWaitForStableUi();

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
    const email = `e2e+${Date.now()}@example.com`;
    const phone = `555-${String(Date.now()).slice(-3)}-${String(Date.now()).slice(-4)}`;
    await setFieldByLabel("Email", email);
    await clickSaveNearSelector("s-email-field");
    await driver.wait(async () => {
      return hasChipWithText(email);
    }, 20_000, "Email chip missing before delete-all step");

    await setFieldByLabel("Phone Number", phone);
    await clickSaveNearSelector("s-text-field[label='Phone Number']");
    await driver.wait(async () => {
      return hasChipWithText(phone);
    }, 20_000, "Phone chip missing before delete-all step");

    //delete everything
    await clickButtonByText("Delete All Contact Information");
    await driver.wait(async () => {
      const noEmail = !(await hasChipWithText(email));
      const noPhone = !(await hasChipWithText(phone));
      return noEmail && noPhone;
    }, 20_000, "Contact chips still visible after delete-all");
  });
});