import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve } from "path";
import { sleep } from "./waits.js";
import { By } from "selenium-webdriver";


const COOKIE_FILE = resolve(process.cwd(), ".e2e-cookies.json");

function getStoreConfig() {
  const storeUrl = process.env.SHOPIFY_TEST_STORE_URL;

  if (!storeUrl) {
    throw new Error(
      "Missing SHOPIFY_TEST_STORE_URL in .env.e2e file.",
    );
  }

  const cleanStore = storeUrl.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const storeName = cleanStore.replace(".myshopify.com", "");
  const appPath = process.env.SHOPIFY_TEST_APP_PATH || "apps/ab-insightful-1/app";

  return { storeUrl: cleanStore, storeName, appPath };
}

async function saveCookies(driver) {
  const cookies = await driver.manage().getCookies();
  writeFileSync(COOKIE_FILE, JSON.stringify(cookies, null, 2));
  console.log(`[e2e-auth] Saved ${cookies.length} cookies`);
}

async function loadCookies(driver) {
  if (!existsSync(COOKIE_FILE)) {
    return false;
  }

  try {
    const cookies = JSON.parse(readFileSync(COOKIE_FILE, "utf-8"));
    if (!cookies.length) return false;

    const byDomain = {};
    for (const cookie of cookies) {
      const domain = cookie.domain.replace(/^\./, "");
      if (!byDomain[domain]) byDomain[domain] = [];
      byDomain[domain].push(cookie);
    }

    for (const [domain, domainCookies] of Object.entries(byDomain)) {
      try {
        await driver.get(`https://${domain}`);
        await sleep(1000);
        for (const cookie of domainCookies) {
          try {
            const cleanCookie = {
              name: cookie.name,
              value: cookie.value,
              path: cookie.path || "/",
              domain: cookie.domain,
              secure: cookie.secure || false,
              httpOnly: cookie.httpOnly || false,
            };
            if (cookie.expiry) cleanCookie.expiry = cookie.expiry;
            await driver.manage().addCookie(cleanCookie);
          } catch {
            // Some cookies may fail (e.g., SameSite restrictions)
          }
        }
      } catch {
        // Domain may not be reachable
      }
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Log in to the Shopify Admin using cookie-based session reuse.
 *
 * Shopify's hCaptcha blocks all ChromeDriver-launched browsers, so
 * automated login is not possible. Instead:
 *
 *   1. First run: `npm run test:e2e:setup` opens a real Chrome.
 *      User logs in manually. Then `npm run test:e2e:headed` attaches
 *      Selenium and saves cookies.
 *   2. Subsequent runs: `npm run test:e2e` loads saved cookies headlessly.
 */
export async function loginToShopifyAdmin(driver) {
  const { storeName } = getStoreConfig();
  const adminUrl = `https://admin.shopify.com/store/${storeName}`;

  const hasCookies = await loadCookies(driver);

  if (hasCookies) {
    await driver.get(adminUrl);
    await sleep(5000);

    const url = await driver.getCurrentUrl();
    if (url.includes("admin.shopify.com") && !url.includes("accounts.shopify.com")) {
      console.log("[e2e-auth] Cookie login successful");
      return;
    }
    console.log("[e2e-auth] Saved cookies expired");
  }

  const isHeaded = process.env.HEADED === "true";

  if (!isHeaded) {
    throw new Error(
      "No valid session cookies. Set up a login session first:\n\n" +
        "  1. npm run test:e2e:setup   (opens Chrome — log in to Shopify)\n" +
        "  2. npm run test:e2e:headed  (saves cookies, runs tests)\n" +
        "  3. npm run test:e2e         (headless, reuses cookies)\n",
    );
  }

  // Headed mode: Selenium is attached to the user's running Chrome.
  const currentUrl = await driver.getCurrentUrl();

  if (currentUrl.includes("admin.shopify.com") && !currentUrl.includes("accounts.shopify.com")) {
    console.log("[e2e-auth] Already logged in, saving cookies");
    await saveCookies(driver);
    return;
  }

  console.log("[e2e-auth] Waiting for manual login in Chrome window...");

  await driver.wait(async () => {
    const url = await driver.getCurrentUrl();
    return url.includes("admin.shopify.com") && !url.includes("accounts.shopify.com");
  }, 180_000, "Login timed out. Please log in to Shopify in the Chrome window.");

  await sleep(3000);
  await saveCookies(driver);
}

/**
 * Navigate to the embedded app's home page within the Shopify Admin.
 */
export async function navigateToApp(driver) {
  const { storeName, appPath } = getStoreConfig();
  const appUrl = `https://admin.shopify.com/store/${storeName}/${appPath}`;

  await driver.get(appUrl);

  await driver.wait(async () => {
    const url = await driver.getCurrentUrl();
    return url.includes("/apps/");
  }, 30_000, "Timed out navigating to app");

  await sleep(5000);
}

/**
 * Navigate to a specific app route within the Shopify Admin.
 *
 * In embedded apps, nav links (s-link) are rendered by App Bridge in the
 * parent frame and have zero size in the iframe. We navigate by loading
 * the full admin URL, then the caller re-enters the iframe.
 *
 * @param {string} appRoute - e.g. "/app/experiments"
 */
export async function navigateToAppRoute(driver, appRoute) {
  const { storeName, appPath } = getStoreConfig();
  const routeSuffix = appRoute.replace(/^\/app\/?/, "");
  const fullPath = routeSuffix ? `${appPath}/${routeSuffix}` : appPath;
  const fullUrl = `https://admin.shopify.com/store/${storeName}/${fullPath}`;

  await driver.switchTo().defaultContent();
  await driver.get(fullUrl);

  await driver.wait(async () => {
    const url = await driver.getCurrentUrl();
    return url.includes("/apps/");
  }, 30_000, `Timed out navigating to ${appRoute}`);

  await sleep(5000);
}

export async function navigateToStorefront(driver, url, options = {}) {
  const {
    password = process.env.STOREFRONT_PASSWORD,
    waitTimeout = 20_000,
  } = options;

  if (!url) {
    throw new Error("navigateToStorefront requires a url");
  }

  const targetUrl = new URL(url);
  const targetOrigin = targetUrl.origin;
  const targetHost = targetUrl.host;

  await driver.switchTo().defaultContent();

  try {
    await driver.get(url);
  } catch (err) {
    console.log("driver.get error:", err.message);
  }

  await driver.wait(async () => {
    try {
      const currentUrl = await driver.getCurrentUrl();
      return currentUrl.includes(targetHost);
    } catch {
      return false;
    }
  }, waitTimeout);

  let currentUrl = await driver.getCurrentUrl();

  if (currentUrl.includes("/password")) {
    if (!password) {
      throw new Error("Missing STOREFRONT_PASSWORD in env");
    }

    const passwordSelectors = [
      'input[type="password"]',
      'input[name="password"]',
      'input[id*="password"]',
    ].join(", ");

    const submitSelectors = [
      'button[type="submit"]',
      'input[type="submit"]',
      'button[name="commit"]',
      'button',
    ].join(", ");

    const input = await driver.findElement(By.css(passwordSelectors));
    await input.clear();
    await input.sendKeys(password);

    const buttons = await driver.findElements(By.css(submitSelectors));
    let clicked = false;

    for (const button of buttons) {
      const text = ((await button.getText()) || "").trim().toLowerCase();
      const type = ((await button.getAttribute("type")) || "").toLowerCase();

      if (
        type === "submit" ||
        text.includes("enter") ||
        text.includes("submit") ||
        text.includes("view") ||
        text.includes("login")
      ) {
        await button.click();
        clicked = true;
        break;
      }
    }

    if (!clicked && buttons.length > 0) {
      await buttons[0].click();
    }

    await driver.wait(async () => {
      try {
        const nextUrl = await driver.getCurrentUrl();
        return nextUrl.includes(targetHost) && !nextUrl.includes("/password");
      } catch {
        return false;
      }
    }, waitTimeout);

    currentUrl = await driver.getCurrentUrl();
  }

  await driver.wait(async () => {
    try {
      const readyState = await driver.executeScript("return document.readyState");
      return readyState === "interactive" || readyState === "complete";
    } catch {
      return false;
    }
  }, waitTimeout);

  if (!currentUrl.includes(targetHost)) {
    throw new Error(`Did not navigate to expected storefront host. Current URL: ${currentUrl}`);
  }

  return currentUrl;
}
