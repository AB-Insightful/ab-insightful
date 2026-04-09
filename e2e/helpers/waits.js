import { until, By } from "selenium-webdriver";

const DEFAULT_TIMEOUT = 15_000;

/**
 * Wait for an element matching the CSS selector to be present and visible.
 */
export async function waitForElement(driver, cssSelector, timeout = DEFAULT_TIMEOUT) {
  const locator = By.css(cssSelector);
  await driver.wait(until.elementLocated(locator), timeout);
  const el = await driver.findElement(locator);
  await driver.wait(until.elementIsVisible(el), timeout);
  return el;
}

/**
 * Wait until the page body contains the specified text.
 */
export async function waitForText(driver, text, timeout = DEFAULT_TIMEOUT) {
  await driver.wait(async () => {
    const body = await driver.findElement(By.css("body"));
    const content = await body.getText();
    return content.includes(text);
  }, timeout, `Timed out waiting for text: "${text}"`);
}

/**
 * Simple sleep — use sparingly, prefer explicit waits.
 */
export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
