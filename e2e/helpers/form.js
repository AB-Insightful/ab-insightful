import { expect } from "vitest";

const SET_FIELD_TIMEOUT_MS = 20_000;

export async function setFieldValueByLabel(
  driver,
  tagName,
  label,
  value,
  { timeout = SET_FIELD_TIMEOUT_MS } = {},
) {
  await driver.wait(
    async () => {
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
      return changed === true;
    },
    timeout,
    `Timed out setting ${tagName}[label="${label}"]`,
  );
}

export async function clickButtonByText(driver, text, { exact = true } = {}) {
  const clicked = await driver.executeScript(
    `
      const [text, exact] = arguments;
      const normalize = (value) => (value || "").replace(/\\s+/g, " ").trim();
      const wanted = normalize(text);
      const buttons = [...document.querySelectorAll("s-button, button")];
      const button = buttons.find((el) => {
        const current = normalize(el.textContent);
        return exact ? current === wanted : current.includes(wanted);
      });
      if (!button) {
        return false;
      }

      // Use native click to preserve component handlers.
      button.click();
      return true;
    `,
    text,
    exact,
  );

  expect(clicked).toBe(true);
}

export async function getButtonDisabledByText(driver, text, { exact = true } = {}) {
  return driver.executeScript(
    `
      const [text, exact] = arguments;
      const normalize = (value) => (value || "").replace(/\\s+/g, " ").trim();
      const wanted = normalize(text);
      const buttons = [...document.querySelectorAll("s-button, button")];
      const button = buttons.find((el) => {
        const current = normalize(el.textContent);
        return exact ? current === wanted : current.includes(wanted);
      });
      if (!button) return null;
      return button.disabled || button.hasAttribute("disabled");
    `,
    text,
    exact,
  );
}

export async function getFieldValueByLabel(driver, tagName, label) {
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
