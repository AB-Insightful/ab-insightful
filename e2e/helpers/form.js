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

//primarily utilized for create experiments section to identify similar looking information that lacks an id: 
//specifies a header variant to select the text field
export async function setFieldValueByLabelInVariant(driver, tagName, variantLabel, fieldLabel, value, { timeout = 10000 } = {},) {
  await driver.wait(
    async () => {
      const changed = await driver.executeScript(
        `
        const [tagName, variantLabel, fieldLabel, value] = arguments;

        const normalize = (s) => (s || "").replace(/\\s+/g, " ").trim().toLowerCase();
        const wantedVariant = normalize(variantLabel);
        const wantedField = normalize(fieldLabel);

        const headings = [...document.querySelectorAll("s-heading")];
        const heading = headings.find((el) => {
          return normalize(el.innerText || el.textContent) === wantedVariant;
        });

        if (!heading) return false;

        const container = heading.closest("s-stack");
        if (!container) return false;

        const target = [...container.querySelectorAll(tagName)].find((el) => {
          const label = normalize(el.getAttribute("label"));
          return label === wantedField;
        });

        if (!target) return false;

        target.value = value;
        target.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
        target.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
        target.dispatchEvent(new Event("blur", { bubbles: true, composed: true }));

        return true;
        `,
        tagName,
        variantLabel,
        fieldLabel,
        value,
      );

      return changed === true;
    },
    timeout,
    `Timed out setting ${tagName}[label="${fieldLabel}"] in ${variantLabel}`,
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

export async function clickButtonByTextBetter(driver, text, { exact = false } = {}) {
  const clicked = await driver.executeScript(
    `
      const [text, exact] = arguments;

      const normalize = (value) =>
        (value || "").replace(/\\s+/g, " ").trim().toLowerCase();

      const wanted = normalize(text);

      const buttons = [
        ...document.querySelectorAll("s-button, button, [role='button']")
      ];

      for (const el of buttons) {
        const candidates = [
          el.innerText,
          el.textContent,
          el.getAttribute("label"),
          el.getAttribute("aria-label"),
        ]
          .filter(Boolean)
          .map(normalize);

        const match = exact
          ? candidates.some((c) => c === wanted)
          : candidates.some((c) => c.includes(wanted));

        if (match) {
          el.click();
          return true;
        }
      }

      return false;
    `,
    text,
    exact,
  );

  if (!clicked) {
    console.log("Failed to find button with text:", text);
  }

  expect(clicked).toBe(true);
}

export async function waitForButtonAndClick(driver, text) {
  await driver.wait(async () => {
    return await driver.executeScript(
      `
        const normalize = (s) => (s || "").replace(/\\s+/g, " ").trim().toLowerCase();
        const wanted = normalize(arguments[0]);

        const buttons = [...document.querySelectorAll("s-button, button, [role='button']")];

        return buttons.some((el) => {
          const values = [
            el.innerText,
            el.textContent,
            el.getAttribute("label"),
            el.getAttribute("aria-label"),
          ].filter(Boolean).map(normalize);

          return values.some(v => v.includes(wanted));
        });
      `,
      text
    );
  }, 15_000); // wait up to 15s

  await clickButtonByText(driver, text);
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
