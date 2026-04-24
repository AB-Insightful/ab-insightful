import { By } from "selenium-webdriver";
import { sleep } from "./waits.js";

/**
 * Switch the driver context into the embedded app iframe.
 *
 * Searches both regular DOM and shadow roots for the app iframe,
 * filtering out analytics/tracking iframes.
 */
export async function switchToAppIframe(driver, timeout = 30_000) {
  await driver.switchTo().defaultContent();

  let iframe = null;

  await driver.wait(async () => {
    // Strategy 1: Regular CSS selectors
    try {
      const found = await driver.findElements(By.css("iframe"));
      for (const f of found) {
        const src = await f.getAttribute("src");
        if (src && !src.includes("analytics") && !src.includes("tracking") && !src.includes("recaptcha")) {
          iframe = f;
          return true;
        }
      }
    } catch { /* no regular iframes */ }

    // Strategy 2: Search shadow DOMs via JavaScript
    try {
      iframe = await driver.executeScript(`
        function findIframeInShadow(root) {
          const iframes = root.querySelectorAll('iframe');
          for (const iframe of iframes) {
            const src = iframe.getAttribute('src') || '';
            if (src && !src.includes('analytics') && !src.includes('tracking') && !src.includes('recaptcha')) {
              return iframe;
            }
          }
          for (const el of root.querySelectorAll('*')) {
            if (el.shadowRoot) {
              const found = findIframeInShadow(el.shadowRoot);
              if (found) return found;
            }
          }
          return null;
        }
        return findIframeInShadow(document);
      `);
      if (iframe) return true;
    } catch {
      // Shadow DOM search failed
    }

    return false;
  }, timeout, "App iframe not found in Shopify Admin");

  await driver.switchTo().frame(iframe);

  // Wait for the app's React content to render
  await driver.wait(async () => {
    try {
      const body = await driver.findElement(By.css("body"));
      const text = await body.getText();
      return text.length > 0;
    } catch {
      return false;
    }
  }, timeout, "App content did not load inside iframe");
}

/**
 * Switch back to the Shopify Admin parent frame.
 */
export async function switchToParent(driver) {
  await driver.switchTo().defaultContent();
}

/**
 * App Bridge renders primary app nav (s-link, etc.) in the admin shell, not inside the app iframe.
 * Walks shadow roots so links inside Polaris/admin UI are visible to the check.
 */
export async function waitForParentAppNav(driver, timeout = 30_000) {
  await driver.switchTo().defaultContent();
  await driver.wait(
    async () => {
      const count = await driver.executeScript(`
        function countNavInRoot(root) {
          let n = root.querySelectorAll("s-link").length;
          n += root.querySelectorAll('a[href*="/app"]').length;
          for (const el of root.querySelectorAll("*")) {
            if (el.shadowRoot) n += countNavInRoot(el.shadowRoot);
          }
          return n;
        }
        return countNavInRoot(document);
      `);
      return count > 0;
    },
    timeout,
    "App navigation not found in Shopify Admin parent frame",
  );
}

/**
 * Wait for the app inside the iframe to be fully interactive.
 */
export async function waitForAppReady(driver, timeout = 30_000) {
  await driver.wait(async () => {
    try {
      const elements = await driver.findElements(
        By.css("s-app-nav, s-link, s-page, [class*='Polaris'], nav, a, h1, h2"),
      );
      return elements.length > 0;
    } catch {
      return false;
    }
  }, timeout, "App did not become ready inside iframe");

  await sleep(2000);
}
