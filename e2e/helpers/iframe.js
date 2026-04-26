import { By } from "selenium-webdriver";
import { sleep } from "./waits.js";

function isExcludedIframeSource(src) {
  const value = String(src || "").toLowerCase();
  return (
    value.includes("analytics") ||
    value.includes("tracking") ||
    value.includes("recaptcha") ||
    value.includes("googletagmanager")
  );
}

/**
 * Switch the driver context into the embedded app iframe.
 *
 * Searches both regular DOM and shadow roots for the app iframe,
 * filtering out analytics/tracking iframes.
 */
export async function switchToAppIframe(driver, timeout = 30_000) {
  await driver.switchTo().defaultContent();

  await driver.wait(async () => {
    const iframes = await driver.findElements(By.css("iframe"));
    return iframes.length > 0;
  }, timeout, "No iframe elements found in Shopify Admin");

  const iframe = await driver.executeScript(`
    function collectFrames(root, out) {
      const localFrames = root.querySelectorAll("iframe");
      for (const frame of localFrames) out.push(frame);
      for (const el of root.querySelectorAll("*")) {
        if (el.shadowRoot) collectFrames(el.shadowRoot, out);
      }
    }

    function score(frame) {
      const src = (frame.getAttribute("src") || "").toLowerCase();
      const id = (frame.id || "").toLowerCase();
      const name = (frame.getAttribute("name") || "").toLowerCase();
      const title = (frame.getAttribute("title") || "").toLowerCase();
      const cls = (frame.className || "").toString().toLowerCase();
      const all = [src, id, name, title, cls].join(" ");
      const rect = frame.getBoundingClientRect();

      if (
        all.includes("analytics") ||
        all.includes("tracking") ||
        all.includes("recaptcha") ||
        all.includes("googletagmanager")
      ) {
        return -1;
      }

      let points = 0;
      if (src.includes("/apps/")) points += 100;
      if (all.includes("shopify")) points += 20;
      if (all.includes("app")) points += 10;
      if (rect.width > 200 && rect.height > 200) points += 10;
      if (rect.width > 0 && rect.height > 0) points += 5;
      return points;
    }

    const frames = [];
    collectFrames(document, frames);
    if (!frames.length) return null;

    let best = null;
    let bestScore = -1;
    for (const frame of frames) {
      const s = score(frame);
      if (s > bestScore) {
        bestScore = s;
        best = frame;
      }
    }
    return best;
  `);

  if (!iframe) {
    throw new Error("App iframe not found in Shopify Admin");
  }

  await driver.switchTo().frame(iframe);

  // Wait for body render with meaningful app text content.
  await driver.wait(
    async () => {
      try {
        const body = await driver.findElement(By.css("body"));
        const text = await body.getText();
        const src = await driver.executeScript(
          "return window.location.href || document.location.href || '';",
        );
        if (isExcludedIframeSource(src)) return false;
        return (text || "").replace(/\s+/g, " ").trim().length > 8;
      } catch {
        return false;
      }
    },
    timeout,
    "App content did not load inside iframe",
  );
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
  await driver.wait(
    async () => {
      try {
        const readySignals = await driver.findElements(
          By.css(
            "s-page, s-section, s-card, s-table, s-button, s-link[href], main, [data-testid]",
          ),
        );
        if (!readySignals.length) return false;

        const body = await driver.findElement(By.css("body"));
        const text = await body.getText();
        return (text || "").replace(/\s+/g, " ").trim().length > 12;
      } catch {
        return false;
      }
    },
    timeout,
    "App did not become ready inside iframe",
  );

  await sleep(250);
}
